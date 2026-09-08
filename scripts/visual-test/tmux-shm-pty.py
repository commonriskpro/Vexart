#!/usr/bin/env python3
"""Reproduce native Kitty SHM presentation through a tmux 3.6a PTY.

The receiver is deliberately synthetic: it consumes SHM objects, verifies the
bytes, and optionally rejects or withholds consumption. No physical terminal
or user tmux server is touched; this script owns a private tmux socket.
"""

import argparse
import base64
import ctypes
import errno
import fcntl
import hashlib
import json
import mmap
import os
import pathlib
import pty
import re
import select
import shlex
import stat
import struct
import subprocess
import termios
import time
import tty


# The native frame path uses `/vx-<pidhex>-<counterhex>`; createTerminal's
# startup probe uses the older `/vex-<base36>-<base36>-<base36>-<base36>` form.
# Both are process-owned names and are bounded by Kitty's 31-byte limit.
SHM_NAME = re.compile(rb"^/(?:vx-[0-9a-f]+-[0-9a-f]+|vex-[a-z0-9]+(?:-[a-z0-9]+){3})$")
APC_START = b"\x1b_G"
ST = b"\x1b\\"
TMUX_DCS_START = b"\x1bPtmux;"
ESC_ESC = b"\x1b\x1b"


def write_json(path: pathlib.Path, value: object) -> None:
    path.write_text(json.dumps(value, indent=2, sort_keys=True) + "\n")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--mode", choices=("normal", "reject", "timeout", "lifecycle"), required=True)
    parser.add_argument("--out", required=True, help="new directory for reproducible artifacts")
    args = parser.parse_args()
    out = pathlib.Path(args.out).expanduser().resolve()
    if out.exists():
        parser.error(f"--out must name a new directory: {out}")
    out.mkdir(parents=True)
    args.out = out
    return args


def main() -> int:
    args = parse_args()
    mode = args.mode
    out: pathlib.Path = args.out
    repo = pathlib.Path(__file__).resolve().parents[2]
    socket = out / "tmux.sock"
    fixture = repo / "scripts/visual-test/tmux-shm-runtime-fixture.ts"
    env = dict(os.environ, TERM="xterm-256color", TERM_PROGRAM="kitty",
               KITTY_WINDOW_ID="998877", COLORTERM="truecolor")
    env.pop("TMUX", None)
    env.pop("TMUX_PANE", None)

    libc = ctypes.CDLL(None, use_errno=True)
    libc.shm_open.argtypes = [ctypes.c_char_p, ctypes.c_int, ctypes.c_uint]
    libc.shm_open.restype = ctypes.c_int
    libc.shm_unlink.argtypes = [ctypes.c_char_p]
    libc.shm_unlink.restype = ctypes.c_int

    packets: list[dict[str, str]] = []
    names: list[str] = []
    name_sources: dict[str, set[str]] = {}
    deleted: list[str] = []
    frames: list[dict[str, object]] = []
    last_upload_packet: tuple[int, str] | None = None
    last_delete_packet: tuple[int, str] | None = None
    output = b""
    outside = bytearray()
    hidden = False
    visible = False
    lifecycle_phase = "startup"
    lifecycle_hidden = False
    lifecycle_visible = False
    lifecycle_pane = None
    lifecycle_window = None
    lifecycle_temp_window = None
    lifecycle_client_before_detach = None
    lifecycle_outer_pty = None
    master = slave = client = None
    client_processes: list[subprocess.Popen[bytes]] = []
    client_name = None
    p0 = p1 = None
    guards: dict[str, object] = {}
    metadata: dict[str, object] = {
        "mode": mode,
        "out": str(out),
        "repo": str(repo),
        "fixture": str(fixture),
        "socket": str(socket),
        "pty_size": {"cols": 80, "rows": 24, "pixel_width": 640, "pixel_height": 384},
    }
    write_json(out / "metadata.json", metadata)

    def tm(*args: str) -> str:
        result = subprocess.run(
            ["tmux", "-S", str(socket), "-f", "/dev/null", *args],
            env=env,
            capture_output=True,
            text=True,
            check=True,
            timeout=5,
        )
        return result.stdout.strip()

    def write_name_metadata() -> None:
        write_json(out / "shm-names.json", names)
        write_json(out / "shm-sources.json", [
            {"name": name, "sources": sorted(name_sources[name])}
            for name in names
        ])

    def remember_name(name: bytes, source: str = "outer.bin") -> str:
        if not SHM_NAME.fullmatch(name) or len(name) > 31:
            raise AssertionError(f"unexpected or unsafe SHM name: {name!r}")
        decoded = name.decode("ascii")
        if decoded not in names:
            names.append(decoded)
        name_sources.setdefault(decoded, set()).add(source)
        write_name_metadata()
        return decoded

    def iter_capture_streams(data: bytes):
        """Yield direct bytes and tmux-DCS-unwrapped bytes separately.

        tmux doubles ESC bytes inside its ``ESC Ptmux; ... ESC \\`` wrapper.
        Keeping direct and unwrapped streams separate avoids treating a
        wrapper's escaped APC terminator as the end of a direct APC.
        """
        cursor = 0
        while cursor < len(data):
            start = data.find(TMUX_DCS_START, cursor)
            if start < 0:
                if cursor < len(data):
                    yield "producer.bin:direct", data[cursor:]
                return
            if start > cursor:
                yield "producer.bin:direct", data[cursor:start]
            index = start + len(TMUX_DCS_START)
            decoded = bytearray()
            while index < len(data):
                if data.startswith(ESC_ESC, index):
                    decoded.append(0x1b)
                    index += len(ESC_ESC)
                elif data.startswith(ST, index):
                    break
                else:
                    decoded.append(data[index])
                    index += 1
            if index >= len(data):
                raise AssertionError("unterminated tmux DCS in producer capture")
            yield "producer.bin:dcs", bytes(decoded)
            cursor = index + len(ST)

    def extract_producer_names() -> None:
        capture = out / "producer.bin"
        if not capture.exists():
            raise AssertionError("producer capture is missing")
        for source, stream in iter_capture_streams(capture.read_bytes()):
            cursor = 0
            while True:
                start = stream.find(APC_START, cursor)
                if start < 0:
                    break
                end = stream.find(ST, start + len(APC_START))
                if end < 0:
                    raise AssertionError(f"unterminated Kitty APC in {source}")
                body = stream[start + len(APC_START):end]
                cursor = end + len(ST)
                try:
                    header, payload = body.split(b";", 1)
                    meta = dict(field.split(b"=", 1) for field in header.split(b","))
                    action = meta.get(b"a")
                except (ValueError, UnicodeError) as error:
                    raise AssertionError(f"invalid Kitty APC in {source}: {body!r}") from error
                if action not in (b"q", b"T"):
                    continue
                if meta.get(b"t") != b"s":
                    continue
                if action == b"T" and not (meta.get(b"U") == b"1" and meta.get(b"q") == b"1"):
                    continue
                try:
                    name = base64.b64decode(payload, validate=True)
                except Exception as error:
                    raise AssertionError(f"invalid SHM name payload in {source}") from error
                remember_name(name, source)

    def consume(meta: dict[str, str], payload: bytes) -> bytes:
        try:
            name = base64.b64decode(payload, validate=True)
        except Exception as error:
            raise AssertionError(f"invalid base64 SHM name: {error}") from error
        decoded = remember_name(name)
        fd = libc.shm_open(name, os.O_RDONLY, 0)
        if fd < 0:
            raise OSError(ctypes.get_errno(), f"SHM open {decoded}")
        try:
            info = os.fstat(fd)
            if stat.S_IMODE(info.st_mode) != 0o600:
                raise AssertionError(f"SHM object is not mode 0600: {decoded}")
            width = int(meta["s"])
            height = int(meta["v"])
            length = width * height * 4
            if width <= 0 or height <= 0 or info.st_size < length:
                raise AssertionError(f"SHM size mismatch for {decoded}: {info.st_size} < {length}")
            with mmap.mmap(fd, length, access=mmap.ACCESS_READ) as mapped:
                rgba = mapped[:]
            if libc.shm_unlink(name) != 0:
                raise OSError(ctypes.get_errno(), f"SHM unlink {decoded}")
            return rgba
        finally:
            os.close(fd)

    def remember_packets() -> None:
        write_json(out / "packets.json", packets)

    def verify_no_leaks() -> None:
        leaks: list[str] = []
        for name in names:
            raw = name.encode("ascii")
            fd = libc.shm_open(raw, os.O_RDONLY, 0)
            if fd >= 0:
                os.close(fd)
                leaks.append(name)
                continue
            if ctypes.get_errno() != errno.ENOENT:
                leaks.append(f"{name}: errno={ctypes.get_errno()}")
        if leaks:
            raise AssertionError(f"SHM names remained before final cleanup: {leaks}")

    def write_manifest(status: str) -> None:
        write_json(out / "artifacts.json", {
            "status": status,
            "files": sorted(path.name for path in out.iterdir() if path.is_file()),
            "shm_names": names,
            "shm_sources": [
                {"name": name, "sources": sorted(name_sources[name])}
                for name in names
            ],
        })

    try:
        command = shlex.join(["bun", "--conditions=browser", str(fixture), str(out), mode])
        gate = shlex.quote(str(out / "start"))
        stderr = shlex.quote(str(out / "stderr"))
        exit_file = shlex.quote(str(out / "exit"))
        shell = (
            f"while [ ! -e {gate} ]; do sleep .01; done; {command} 2>{stderr}; "
            f"echo $? >{exit_file}; sleep 2"
        )
        p0 = tm("new-session", "-d", "-s", "vexart-shm", "-x", "80", "-y", "24",
                "-P", "-F", "#{pane_id}", "/bin/sh", "-c", shell)
        pipe_target = shlex.quote(str(out / "producer.bin"))
        tm("pipe-pane", "-t", p0, "-O", f"cat > {pipe_target}")
        tm("set-option", "-g", "allow-passthrough", "all")
        tm("set-option", "-g", "status", "off")
        tm("set-option", "-g", "default-shell", "/bin/sh")
        tm("set-option", "-g", "terminal-features", ",*:RGB")

        master, slave = pty.openpty()
        tty.setraw(slave)
        fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack("HHHH", 24, 80, 640, 384))
        client = subprocess.Popen(
            ["tmux", "-S", str(socket), "-f", "/dev/null", "attach-session", "-t", "vexart-shm"],
            env=env,
            stdin=slave,
            stdout=slave,
            stderr=slave,
        )
        client_processes.append(client)
        if mode == "lifecycle":
            lifecycle_outer_pty = os.ttyname(slave)
        if mode != "lifecycle":
            os.close(slave)
            slave = None

        deadline = time.monotonic() + 3
        while time.monotonic() < deadline:
            client_names = tm("list-clients", "-F", "#{client_name}").splitlines()
            allow = tm("show-options", "-g", "-v", "allow-passthrough")
            features = tm("show-options", "-g", "-v", "terminal-features")
            default_shell = tm("show-options", "-g", "-v", "default-shell")
            if len(client_names) == 1 and allow == "all" and "RGB" in features and default_shell == "/bin/sh":
                guards = {"clients": client_names, "allow_passthrough": allow,
                          "terminal_features": features, "default_shell": default_shell}
                client_name = client_names[0]
                break
            time.sleep(.01)
        else:
            raise AssertionError(f"tmux startup guards failed: {guards}")
        metadata["guards"] = guards
        write_json(out / "metadata.json", metadata)
        (out / "start").touch()

        deadline = time.monotonic() + 35
        post_exit_deadline = None
        while time.monotonic() < deadline:
            if select.select([master], [], [], .01)[0]:
                try:
                    chunk = os.read(master, 65536)
                except OSError as error:
                    if error.errno != errno.EIO:
                        raise
                    chunk = b""
                output += chunk
                with (out / "outer.bin").open("ab") as wire:
                    wire.write(chunk)

            while True:
                position = output.find(APC_START)
                if position < 0:
                    if len(output) > 3:
                        outside.extend(output[:-3])
                        output = output[-3:]
                    break
                end = output.find(ST, position + len(APC_START))
                if end < 0:
                    break
                outside.extend(output[:position])
                body = output[position + len(APC_START):end]
                output = output[end + len(ST):]
                try:
                    header, payload = body.split(b";", 1)
                    meta = dict(field.split("=", 1) for field in header.decode("ascii").split(","))
                except Exception as error:
                    raise AssertionError(f"invalid Kitty APC: {body!r}") from error
                packets.append(meta)
                remember_packets()
                action = meta.get("a")
                if action == "q":
                    if meta.get("t") != "s":
                        raise AssertionError(f"unexpected Kitty query transport: {meta}")
                    consume(meta, payload)
                    os.write(master, ("\x1b_Gi=" + meta["i"] + ";OK\x1b\\").encode())
                elif action == "T":
                    if not (meta.get("t") == "s" and meta.get("U") == "1" and
                            meta.get("q") == "1" and "o" not in meta and "m" not in meta):
                        raise AssertionError(f"unexpected SHM upload metadata: {meta}")
                    try:
                        pixel_width = int(meta["s"])
                        pixel_height = int(meta["v"])
                        cell_cols = int(meta["c"])
                        cell_rows = int(meta["r"])
                        payload_size = int(meta["S"])
                    except (KeyError, ValueError) as error:
                        raise AssertionError(f"incomplete SHM upload metadata: {meta}") from error
                    if min(pixel_width, pixel_height, cell_cols, cell_rows, payload_size) <= 0:
                        raise AssertionError(f"SHM upload metadata must be positive: {meta}")
                    if meta.get("f") != "32" or payload_size != pixel_width * pixel_height * 4:
                        raise AssertionError(f"SHM upload metadata does not describe packed RGBA: {meta}")
                    last_upload_packet = (len(packets) - 1, meta["i"])
                    if mode in ("reject", "timeout"):
                        decoded = base64.b64decode(payload, validate=True).decode("ascii")
                        remember_name(decoded.encode("ascii"))
                        frames.append({"i": meta["i"], "p": meta["p"], "rejected_or_unconsumed": True})
                        if mode == "reject":
                            response = f"\x1b_Gi={meta['i']},p={meta['p']};EIO:synthetic rejection\x1b\\"
                            os.write(master, response.encode())
                        continue
                    rgba = consume(meta, payload)
                    frames.append({
                        "i": meta["i"], "p": meta["p"], "width": int(meta["s"]),
                        "height": int(meta["v"]), "bytes": len(rgba),
                        "sha256": hashlib.sha256(rgba).hexdigest(),
                        "origin_hidden": (hidden and not visible) if mode == "normal" else (lifecycle_hidden and not lifecycle_visible),
                    })
                    write_json(out / "frames.json", frames)
                    # Deliberately do not send an ACK for a frame. Unlinking
                    # the SHM name is the completion signal under tmux.
                elif action == "d":
                    if meta.get("d") != "I":
                        raise AssertionError(f"unexpected delete action: {meta}")
                    deleted.append(meta["i"])
                    last_delete_packet = (len(packets) - 1, meta["i"])
                elif action is not None:
                    raise AssertionError(f"unexpected Kitty action: {meta}")

            if mode == "lifecycle":
                if lifecycle_phase == "startup" and (out / "ready").exists():
                    lifecycle_window = tm("display-message", "-p", "-t", p0, "#{window_id}")
                    initial = tm("display-message", "-p", "-t", p0,
                                 "#{window_id}:#{pane_id}:#{window_width}x#{window_height}:#{pane_width}x#{pane_height}")
                    tm("resize-window", "-t", p0, "-x", "100", "-y", "30")
                    resized = tm("display-message", "-p", "-t", p0,
                                 "#{window_id}:#{pane_id}:#{window_width}x#{window_height}:#{pane_width}x#{pane_height}")
                    lifecycle_pane = tm("split-window", "-h", "-t", p0, "-P", "-F", "#{pane_id}",
                                        "/bin/sh", "-c", "sleep 30")
                    split = tm("display-message", "-p", "-t", lifecycle_pane,
                               "#{window_id}:#{pane_id}:#{window_width}x#{window_height}:#{pane_width}x#{pane_height}")
                    tm("join-pane", "-s", lifecycle_pane, "-t", p0, "-v")
                    joined = tm("display-message", "-p", "-t", lifecycle_pane,
                                "#{window_id}:#{pane_id}:#{window_width}x#{window_height}:#{pane_width}x#{pane_height}")
                    lifecycle_temp_window = tm("new-window", "-d", "-P", "-F", "#{window_id}",
                                                "-n", "lifecycle-temp", "/bin/sh", "-c", "sleep 30")
                    tm("select-window", "-t", lifecycle_temp_window)
                    switched = tm("display-message", "-p", "-t", lifecycle_temp_window,
                                  "#{window_id}:#{window_name}:#{window_width}x#{window_height}")
                    tm("select-window", "-t", lifecycle_window)
                    returned = tm("display-message", "-p", "-t", p0,
                                  "#{window_id}:#{pane_id}:#{window_width}x#{window_height}:#{pane_width}x#{pane_height}")
                    try:
                        tm("kill-window", "-t", lifecycle_temp_window)
                    except subprocess.CalledProcessError:
                        pass
                    topology = {
                        "operations": [
                            "resize-window",
                            "split-window",
                            "join-pane",
                            "switch-window",
                            "return-window",
                        ],
                        "frame_label": "after-topology",
                        "initial": initial,
                        "resized": resized,
                        "split": split,
                        "joined": joined,
                        "switched_window": switched,
                        "returned_window": returned,
                    }
                    write_json(out / "lifecycle-topology.json", topology)
                    lifecycle_phase = "topology"
                    (out / "topology-ready").touch()

                if lifecycle_phase == "topology" and (out / "hidden-request").exists():
                    if lifecycle_pane is None:
                        raise AssertionError("lifecycle split pane was not created")
                    tm("select-pane", "-t", lifecycle_pane)
                    tm("resize-pane", "-Z", "-t", lifecycle_pane)
                    lifecycle_hidden = True
                    lifecycle_phase = "hidden"
                    (out / "hidden").touch()

                if lifecycle_phase == "hidden" and (out / "hidden-done").exists():
                    if lifecycle_pane is None:
                        raise AssertionError("lifecycle split pane disappeared before unzoom")
                    tm("resize-pane", "-Z", "-t", lifecycle_pane)
                    tm("select-pane", "-t", p0)
                    lifecycle_visible = True
                    lifecycle_phase = "visible"
                    (out / "visible").touch()

                if lifecycle_phase == "visible" and (out / "detach-request").exists():
                    if client_name is None or slave is None:
                        raise AssertionError("lifecycle client PTY is unavailable for detach/reattach")
                    lifecycle_client_before_detach = client_name
                    tm("detach-client", "-t", client_name)
                    deadline = time.monotonic() + 3
                    while time.monotonic() < deadline:
                        if not tm("list-clients", "-F", "#{client_name}"):
                            break
                        time.sleep(.01)
                    else:
                        raise AssertionError("synthetic tmux client did not detach")
                    # Detach is complete once tmux reports no clients. Stop
                    # only this harness-owned attach process so reattach can
                    # use the same PTY without two clients racing on it.
                    if client.poll() is None:
                        client.terminate()
                        try:
                            client.wait(timeout=1)
                        except subprocess.TimeoutExpired:
                            client.kill()
                            client.wait(timeout=1)
                    client = None
                    lifecycle_phase = "detached"
                    (out / "detached").touch()

                if lifecycle_phase == "detached" and (out / "reattach-request").exists():
                    client = subprocess.Popen(
                        ["tmux", "-S", str(socket), "-f", "/dev/null", "attach-session", "-t", "vexart-shm"],
                        env=env,
                        stdin=slave,
                        stdout=slave,
                        stderr=slave,
                    )
                    client_processes.append(client)
                    deadline = time.monotonic() + 3
                    while time.monotonic() < deadline:
                        client_names = tm("list-clients", "-F", "#{client_name}").splitlines()
                        if len(client_names) == 1:
                            client_name = client_names[0]
                            break
                        time.sleep(.01)
                    else:
                        raise AssertionError("synthetic tmux client did not reattach")
                    write_json(out / "lifecycle-reattach.json", {
                        "client_before_detach": lifecycle_client_before_detach,
                        "client_after_reattach": client_name,
                        "outer_pty_before": lifecycle_outer_pty,
                        "outer_pty_after": os.ttyname(slave),
                        "same_outer_pty": lifecycle_outer_pty == os.ttyname(slave),
                    })
                    lifecycle_phase = "reattached"
                    (out / "reattached").touch()
            elif (out / "ready").exists() and not hidden:
                p1 = tm("split-window", "-h", "-t", p0, "-P", "-F", "#{pane_id}",
                        "/bin/sh", "-c", "sleep 30")
                tm("select-pane", "-t", p1)
                tm("resize-pane", "-Z", "-t", p1)
                hidden = True
                (out / "hidden-option.txt").write_text(tm("show-options", "-p", "-A", "-v", "-t", p0, "allow-passthrough"))
                (out / "hidden").touch()
            if mode != "lifecycle" and (out / "hidden-done").exists() and not visible:
                tm("resize-pane", "-Z", "-t", p1)
                tm("select-pane", "-t", p0)
                visible = True
                (out / "visible").touch()
            if (out / "exit").exists():
                if post_exit_deadline is None:
                    # The fixture writes this marker after its own cleanup,
                    # but tmux may still have the final Kitty delete queued on
                    # the PTY. Keep consuming the owned transport until that
                    # event arrives instead of treating the marker as proof
                    # that the receiver observed cleanup.
                    post_exit_deadline = time.monotonic() + 1
                final_cleanup_seen = (
                    last_upload_packet is not None
                    and last_delete_packet is not None
                    and last_delete_packet[0] > last_upload_packet[0]
                    and last_delete_packet[1] == last_upload_packet[1]
                )
                if final_cleanup_seen:
                    break
                if time.monotonic() >= post_exit_deadline:
                    raise AssertionError(
                        "fixture exit marker observed but no owned Kitty delete after the final "
                        f"upload reached the receiver within 1s (frames={frames}, packets={len(packets)}, "
                        f"last_upload={last_upload_packet}, last_delete={last_delete_packet})"
                    )
        else:
            raise AssertionError("fixture timeout")

        # A detached frame is still written by the producer, but its Kitty
        # APC never reaches the outer PTY receiver. Include those run-owned
        # SHM names in leak checks without counting them as consumed uploads.
        extract_producer_names()
        report = json.loads((out / "result.json").read_text())
        exit_code = int((out / "exit").read_text().strip())
        if mode == "normal":
            assert report["status"] == "PASS", report
            assert exit_code == 0
            assert len(frames) >= 4, frames
            assert any(frame.get("origin_hidden") for frame in frames), frames
            assert frames[-1]["sha256"] == frames[-2]["sha256"], frames
            if len(frames) > 2:
                assert any(frame["sha256"] != frames[-1]["sha256"] for frame in frames[:-2]), frames
            labels = {item.get("label") for item in report.get("reports", [])}
            assert {"burst-latest", "resumed"} <= labels, labels
            for event in report.get("reports", []):
                stats = event.get("stats")
                assert isinstance(stats, dict), event
                assert stats.get("transport") == 2, stats
                assert stats.get("flags") == 5, stats
                assert stats.get("rgbaBytesRead") == 0, stats
                assert stats.get("compressUs") == 0, stats
        elif mode == "lifecycle":
            assert report["status"] == "PASS" and exit_code == 0, report
            assert report.get("lifecycle", {}).get("detachedStatus") == "presented", report
            assert report.get("lifecycle", {}).get("reattachedStatus") == "presented", report
            assert set(report.get("lifecycle", {}).get("labels", [])) >= {
                "after-topology", "hidden", "reattached",
            }, report
            assert len(frames) >= 4, frames
            assert any(frame.get("origin_hidden") for frame in frames), frames
            assert len({frame["sha256"] for frame in frames}) >= 3, frames
            for event in report.get("reports", []):
                stats = event.get("stats")
                assert isinstance(stats, dict), event
                assert stats.get("transport") == 2, stats
                assert stats.get("flags") == 5, stats
                assert stats.get("rgbaBytesRead") == 0, stats
                assert stats.get("compressUs") == 0, stats
        else:
            assert report["status"] == "FAIL" and exit_code == 1, report
            expected = "rejected" if mode == "reject" else "timed out"
            assert expected in report["error"], report
            assert len(frames) == 1, frames
        assert frames and len({frame["i"] for frame in frames}) == 1, frames
        assert deleted and all(image_id == frames[0]["i"] for image_id in deleted)
        verify_no_leaks()
        result = {
            "status": "PASS", "mode": mode, "tmux": subprocess.check_output(["tmux", "-V"], text=True).strip(),
            "artifacts": str(out), "frames": frames, "upload_count": len(frames),
            "shm_objects": len(names), "shm_sources": [
                {"name": name, "sources": sorted(name_sources[name])}
                for name in names
            ], "owned_deletes": deleted,
            "queries": [packet for packet in packets if packet.get("a") == "q"],
            "fixture": report,
            "note": "Real createTerminal/render loop/native SHM/tmux PTY with synthetic receiver; no physical display/FPS.",
        }
        write_json(out / "pty-result.json", result)
        write_manifest("PASS")
        metadata.update({"packets": packets, "frames": frames, "owned_deletes": deleted})
        write_json(out / "metadata.json", metadata)
        print(json.dumps(result, indent=2, sort_keys=True))
        return 0
    except BaseException as error:
        leak_error = None
        try:
            verify_no_leaks()
        except BaseException as check_error:
            leak_error = str(check_error)
        failure = {"status": "FAIL", "mode": mode, "artifacts": str(out), "error": str(error)}
        if leak_error:
            failure["pre_cleanup_leak_check"] = leak_error
        write_json(out / "pty-result.json", failure)
        write_manifest("FAIL")
        print(json.dumps(failure, indent=2, sort_keys=True))
        return 1
    finally:
        # Cleanup is intentionally limited to this script's client/server and
        # names observed from this run. Artifacts remain for diagnosis.
        for process in client_processes:
            try:
                if process.poll() is None:
                    process.terminate()
                process.wait(timeout=3)
            except (OSError, subprocess.TimeoutExpired):
                try:
                    process.kill()
                    process.wait(timeout=3)
                except (OSError, subprocess.TimeoutExpired):
                    pass
        subprocess.run(["tmux", "-S", str(socket), "-f", "/dev/null", "kill-server"],
                       env=env, capture_output=True)
        for name in names:
            raw = name.encode("ascii")
            if SHM_NAME.fullmatch(raw):
                libc.shm_unlink(raw)
        if master is not None:
            os.close(master)
        if slave is not None:
            os.close(slave)


if __name__ == "__main__":
    raise SystemExit(main())
