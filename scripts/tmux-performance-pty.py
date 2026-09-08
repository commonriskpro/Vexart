#!/usr/bin/env python3
"""Measure native Kitty SHM presentation through a plain or tmux PTY.

The child fixture owns the render loop and emits phase markers.  This process
is a synthetic terminal: it answers Kitty/size/color probes, reads only SHM
names announced by the child, and unlinks each one immediately after a full
read.  It never uses a user tmux server or a physical terminal.
"""

import argparse
import base64
import ctypes
import errno
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
import zlib


COLS = 240
ROWS = 60
CELL_WIDTH = 8
CELL_HEIGHT = 18
PIXEL_WIDTH = 1920
PIXEL_HEIGHT = 1080
POST_EXIT_SECONDS = 1.0
TOTAL_SECONDS = 180.0

APC_START = b"\x1b_G"
OSC_START = b"\x1b]777;vexart-perf;"
ST = b"\x1b\\"
BEL = b"\x07"
TMUX_DCS_START = b"\x1bPtmux;"
ESC_ESC = b"\x1b\x1b"

# These are the names currently emitted by the two native SHM routes and by
# the startup probes.  Never open or unlink a name outside this run-owned
# namespace.
SHM_NAME = re.compile(
    rb"^/(?:"
    rb"vexart-kitty(?:-r)?-[0-9]+-[0-9]+|"
    rb"vx-[0-9a-f]+-[0-9a-f]+|"
    rb"tge-(?:probe|gfx|patch)-[0-9]+-[0-9]+|"
    rb"vex-[a-z0-9]+(?:-[a-z0-9]+){3}"
    rb")$"
)
PHASE_NAME = re.compile(r"^[A-Za-z0-9_.-]+$")


def write_json(path: pathlib.Path, value: object) -> None:
    path.write_text(json.dumps(value, indent=2, sort_keys=True) + "\n")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", required=True, help="new artifact directory")
    parser.add_argument("--route", choices=("plain", "tmux"), required=True)
    parser.add_argument("--frames", type=int, default=60)
    parser.add_argument("--warmup", type=int, default=5)
    parser.add_argument("--interval", type=float, default=16.667, help="fixture frame interval in milliseconds")
    args = parser.parse_args()
    if args.frames <= 0 or args.warmup < 0 or args.interval <= 0:
        parser.error("--frames and --interval must be positive; --warmup must be non-negative")
    out = pathlib.Path(args.out).expanduser().resolve()
    if out.exists():
        parser.error(f"--out must name a new directory: {out}")
    out.mkdir(parents=True)
    args.out = out
    return args


def child_environment(route: str) -> dict[str, str]:
    env = dict(os.environ)
    env.pop("TMUX", None)
    env.pop("TMUX_PANE", None)
    env.update({
        "TERM": "xterm-256color",
        "TERM_PROGRAM": "kitty",
        "KITTY_WINDOW_ID": "998877",
        "COLORTERM": "truecolor",
        "VEXART_NATIVE_PRESENTATION": "1",
        "VEXART_NATIVE_LAYER_REGISTRY": "1",
        "VEXART_GPU_FORCE_LAYER_STRATEGY": "final-frame",
        "VEXART_KITTY_SHM_COMPRESSION": "0",
    })
    # A measurement child must not inherit stale diagnostics or a transport
    # override from the invoking shell.  The production environment itself is
    # untouched.
    for key in list(env):
        if key.startswith("VEXART_DEBUG_") or key.startswith("VEXART_LOG_"):
            env.pop(key, None)
    env.pop("VEXART_FORCE_TRANSMISSION_MODE", None)
    if route == "tmux":
        # tmux supplies screen-* TERM and TMUX/TMUX_PANE to the pane process.
        env["TERM"] = "xterm-256color"
    return env


class WireDecoder:
    """Incrementally decode direct APC/OSC and tmux passthrough DCS."""

    def __init__(self, on_apc, on_marker, on_queries):
        self.buffer = b""
        self.on_apc = on_apc
        self.on_marker = on_marker
        self.on_queries = on_queries

    @staticmethod
    def _next(data: bytes, start: int = 0):
        choices = []
        for token, kind in ((TMUX_DCS_START, "dcs"), (APC_START, "apc"), (OSC_START, "osc")):
            position = data.find(token, start)
            if position >= 0:
                choices.append((position, kind, token))
        return min(choices, default=None, key=lambda item: item[0])

    def _inner(self, data: bytes) -> None:
        self.on_queries(data)
        cursor = 0
        while True:
            found = self._next(data, cursor)
            if found is None:
                return
            position, kind, token = found
            cursor = position
            if kind == "dcs":
                # A nested DCS is not expected inside a tmux passthrough
                # payload; leave it to the outer stream if encountered.
                cursor += len(token)
                continue
            if kind == "apc":
                end = data.find(ST, position + len(token))
                if end < 0:
                    return
                self.on_apc(data[position + len(token):end])
                cursor = end + len(ST)
                continue
            end_bel = data.find(BEL, position + len(token))
            end_st = data.find(ST, position + len(token))
            ends = [end for end in (end_bel, end_st) if end >= 0]
            if not ends:
                return
            end = min(ends)
            self.on_marker(data[position + len(token):end])
            cursor = end + (len(BEL) if end == end_bel else len(ST))

    def feed(self, chunk: bytes) -> None:
        self.buffer += chunk
        self.on_queries(chunk)
        cursor = 0
        while True:
            found = self._next(self.buffer, cursor)
            if found is None:
                keep = max(len(APC_START), len(OSC_START), len(TMUX_DCS_START)) - 1
                self.buffer = self.buffer[-keep:]
                return
            position, kind, token = found
            if kind == "dcs":
                index = position + len(token)
                inner = bytearray()
                while index < len(self.buffer):
                    if self.buffer.startswith(ESC_ESC, index):
                        inner.append(0x1B)
                        index += len(ESC_ESC)
                    elif self.buffer.startswith(ST, index):
                        break
                    else:
                        inner.append(self.buffer[index])
                        index += 1
                if index >= len(self.buffer):
                    # Keep the complete wrapper for the next PTY read.
                    self.buffer = self.buffer[position:]
                    return
                self._inner(bytes(inner))
                self.buffer = self.buffer[index + len(ST):]
                cursor = 0
                continue
            if kind == "apc":
                end = self.buffer.find(ST, position + len(token))
                if end < 0:
                    self.buffer = self.buffer[position:]
                    return
                self.on_apc(self.buffer[position + len(token):end])
                self.buffer = self.buffer[end + len(ST):]
                cursor = 0
                continue
            end_bel = self.buffer.find(BEL, position + len(token))
            end_st = self.buffer.find(ST, position + len(token))
            ends = [end for end in (end_bel, end_st) if end >= 0]
            if not ends:
                self.buffer = self.buffer[position:]
                return
            end = min(ends)
            self.on_marker(self.buffer[position + len(token):end])
            self.buffer = self.buffer[end + (len(BEL) if end == end_bel else len(ST)):]
            cursor = 0


class Receiver:
    def __init__(self, out: pathlib.Path, route: str, master: int):
        self.out = out
        self.route = route
        self.master = master
        self.libc = ctypes.CDLL(None, use_errno=True)
        self.libc.shm_open.argtypes = [ctypes.c_char_p, ctypes.c_int, ctypes.c_uint]
        self.libc.shm_open.restype = ctypes.c_int
        self.libc.shm_unlink.argtypes = [ctypes.c_char_p]
        self.libc.shm_unlink.restype = ctypes.c_int
        self.run_started = time.perf_counter()
        self.names: set[str] = set()
        self.name_sources: dict[str, set[str]] = {}
        self.packet_count = 0
        self.outer_bytes = 0
        self.upload_count = 0
        self.shm_data_bytes = 0
        self.rgba_bytes = 0
        self.queries: list[dict[str, object]] = []
        self.uploads: list[dict[str, object]] = []
        self.phases: list[dict[str, object]] = []
        self.phase: dict[str, object] | None = None
        self.last_upload_packet: tuple[int, str] | None = None
        self.last_delete_packet: tuple[int, str] | None = None
        self.transport_actions: set[str] = set()
        self.last_frame: dict[str, object] | None = None

    def remember_name(self, name: bytes, source: str) -> str:
        if not SHM_NAME.fullmatch(name) or len(name) > 31:
            raise RuntimeError(f"unexpected or unsafe SHM name: {name!r}")
        decoded = name.decode("ascii")
        self.names.add(decoded)
        self.name_sources.setdefault(decoded, set()).add(source)
        return decoded

    def _read_shm(self, name: bytes, meta: dict[str, str], source: str, probe: bool = False):
        decoded = self.remember_name(name, source)
        fd = self.libc.shm_open(name, os.O_RDONLY, 0)
        if fd < 0:
            raise OSError(ctypes.get_errno(), f"SHM open {decoded}")
        consume_start = time.perf_counter()
        try:
            info = os.fstat(fd)
            mode = stat.S_IMODE(info.st_mode)
            allowed_modes = (0o600, 0o666) if probe else (0o600,)
            if mode not in allowed_modes:
                expected = "600 or 666 for a probe" if probe else "600"
                raise RuntimeError(f"SHM object {decoded} has mode {mode:o}, expected {expected}")
            size = int(info.st_size)
            if size <= 0:
                raise RuntimeError(f"SHM object {decoded} is empty")
            with mmap.mmap(fd, size, access=mmap.ACCESS_READ) as mapped:
                stored = mapped[:]
            if self.libc.shm_unlink(name) != 0:
                error = ctypes.get_errno()
                if error != errno.ENOENT:
                    raise OSError(error, f"SHM unlink {decoded}")
            compression = meta.get("o") == "z"
            try:
                rgba = zlib.decompress(stored) if compression else stored
            except zlib.error as error:
                raise RuntimeError(f"zlib decode failed for {decoded}: {error}") from error
            if meta.get("s") and meta.get("v"):
                width = int(meta["s"])
                height = int(meta["v"])
                expected = width * height * 4
                # POSIX SHM objects are page-sized.  Raw RGBA uploads can
                # therefore have zero padding after the advertised payload;
                # compressed uploads must be decoded in full.
                if not compression and len(rgba) >= expected:
                    rgba = rgba[:expected]
                if width <= 0 or height <= 0 or len(rgba) != expected:
                    raise RuntimeError(
                        f"SHM RGBA size mismatch for {decoded}: got {len(rgba)}, expected {expected}"
                    )
            return stored, rgba, (time.perf_counter() - consume_start) * 1000.0, compression
        finally:
            os.close(fd)

    def _respond(self, image_id: str, status: str) -> None:
        os.write(self.master, f"\x1b_Gi={image_id};{status}\x1b\\".encode("ascii"))

    def queries_from(self, data: bytes) -> None:
        if b"\x1b[16t" in data:
            os.write(self.master, f"\x1b[6;{CELL_HEIGHT};{CELL_WIDTH}t".encode("ascii"))
        if b"\x1b[14t" in data:
            os.write(self.master, f"\x1b[4;{PIXEL_HEIGHT};{PIXEL_WIDTH}t".encode("ascii"))
        if b"\x1b]11;?" in data:
            os.write(self.master, b"\x1b]11;rgb:0000/0000/0000\x07")
        if b"\x1b]10;?" in data:
            os.write(self.master, b"\x1b]10;rgb:ffff/ffff/ffff\x07")

    @staticmethod
    def parse_apc(body: bytes) -> tuple[dict[str, str], bytes]:
        if b";" in body:
            header, payload = body.split(b";", 1)
        else:
            header, payload = body, b""
        try:
            text = header.decode("ascii")
        except UnicodeDecodeError as error:
            raise RuntimeError(f"non-ASCII Kitty APC header: {body!r}") from error
        meta: dict[str, str] = {}
        for field in text.split(","):
            if "=" in field:
                key, value = field.split("=", 1)
                meta[key] = value
        return meta, payload

    def marker(self, raw: bytes) -> None:
        try:
            event = json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as error:
            raise RuntimeError(f"invalid vexart-perf marker: {raw!r}") from error
        if not isinstance(event, dict) or event.get("event") not in ("start", "end"):
            raise RuntimeError(f"invalid vexart-perf marker event: {event!r}")
        name = event.get("phase")
        if not isinstance(name, str) or not PHASE_NAME.fullmatch(name):
            raise RuntimeError(f"invalid vexart-perf phase name: {name!r}")
        if event["event"] == "start":
            if self.phase is not None:
                raise RuntimeError(f"phase {self.phase['phase']} did not end before {name} started")
            self.phase = {
                "phase": name,
                "started_ms": (time.perf_counter() - self.run_started) * 1000.0,
                "outer_start": self.outer_bytes,
                "upload_start": self.upload_count,
                "shm_start": self.shm_data_bytes,
                "rgba_start": self.rgba_bytes,
                "uploads": [],
                # A phase can intentionally produce no upload (for example,
                # an idle interval after warmup).  Preserve the most recent
                # complete frame while making its source explicit.
                "final_rgba": dict(self.last_frame) if self.last_frame is not None else None,
            }
            return
        if self.phase is None or self.phase["phase"] != name:
            raise RuntimeError(f"phase {name} ended without a matching start")
        current = self.phase
        ended_ms = (time.perf_counter() - self.run_started) * 1000.0
        final_rgba = current.pop("final_rgba")
        final_frame = None
        if isinstance(final_rgba, dict):
            data = final_rgba["rgba"]
            final_frame = {
                "image_id": final_rgba["image_id"],
                "action": final_rgba["action"],
                "width": final_rgba["width"],
                "height": final_rgba["height"],
                "x": final_rgba["x"],
                "y": final_rgba["y"],
                "full_surface": final_rgba["width"] == PIXEL_WIDTH and final_rgba["height"] == PIXEL_HEIGHT,
                "provenance": final_rgba["provenance"],
                "sha256": hashlib.sha256(data).hexdigest(),
            }
        uploads = current["uploads"]
        result = {
            "phase": name,
            "started_ms": round(float(current["started_ms"]), 3),
            "ended_ms": round(ended_ms, 3),
            "outer_bytes": self.outer_bytes - int(current["outer_start"]),
            "outer_bytes_approximate": True,
            "outer_bytes_note": "Phase byte ranges are bounded by PTY reads; run total is exact.",
            "shm_data_bytes": self.shm_data_bytes - int(current["shm_start"]),
            "rgba_bytes": self.rgba_bytes - int(current["rgba_start"]),
            "uploads": uploads,
            "upload_count": len(uploads),
            "final_frame": final_frame,
        }
        self.phases.append(result)
        (self.out / f"{name}.ack").write_text("1\n")
        self.phase = None

    def apc(self, body: bytes) -> None:
        self.packet_count += 1
        meta, payload = self.parse_apc(body)
        action = meta.get("a")
        if action == "q":
            image_id = meta.get("i", "?")
            transport = meta.get("t", "")
            query: dict[str, object] = {"image_id": image_id, "transport": transport}
            if transport == "s":
                try:
                    name = base64.b64decode(payload, validate=True)
                    stored, rgba, consume_ms, compression = self._read_shm(name, meta, "probe", probe=True)
                    query.update({"status": "OK", "stored_bytes": len(stored), "rgba_bytes": len(rgba), "compressed": compression})
                    self._respond(image_id, "OK")
                except Exception as error:
                    query.update({"status": "ERROR", "error": str(error)})
                    self._respond(image_id, "EIO:synthetic probe failure")
                    self.queries.append(query)
                    raise
            elif transport == "d":
                query["status"] = "OK"
                self._respond(image_id, "OK")
            elif transport == "t":
                # File transport is deliberately rejected so plain probing
                # proves SHM selection rather than silently using a file.
                query["status"] = "ENOENT:synthetic file transport disabled"
                self._respond(image_id, "ENOENT:synthetic file transport disabled")
            else:
                query["status"] = "ENOENT:synthetic transport unsupported"
                self._respond(image_id, "ENOENT:synthetic transport unsupported")
            self.queries.append(query)
            return
        if action in ("t", "f", "T"):
            if meta.get("t") != "s":
                raise RuntimeError(f"SHM upload missing t=s: {meta}")
            try:
                name = base64.b64decode(payload, validate=True)
            except Exception as error:
                raise RuntimeError(f"invalid SHM name payload: {error}") from error
            started = time.perf_counter()
            stored, rgba, consume_ms, compression = self._read_shm(name, meta, "frame")
            receive_ms = (time.perf_counter() - started) * 1000.0
            width = int(meta.get("s", "0"))
            height = int(meta.get("v", "0"))
            x = int(meta["x"]) if "x" in meta else None
            y = int(meta["y"]) if "y" in meta else None
            record = {
                "index": self.upload_count,
                "image_id": meta.get("i"),
                "action": action,
                "width": width,
                "height": height,
                "x": x,
                "y": y,
                "full_surface": width == PIXEL_WIDTH and height == PIXEL_HEIGHT,
                "shm_data_bytes": len(stored),
                "rgba_bytes": len(rgba),
                "compressed": compression,
                "receive_ms": round(receive_ms, 3),
                "consume_ms": round(consume_ms, 3),
            }
            self.upload_count += 1
            self.shm_data_bytes += len(stored)
            self.rgba_bytes += len(rgba)
            self.transport_actions.add(action)
            self.uploads.append(record)
            self.last_upload_packet = (self.packet_count - 1, meta.get("i", ""))
            if self.phase is not None:
                self.phase["uploads"].append(record)
                self.phase["final_rgba"] = {
                    "rgba": rgba,
                    "image_id": meta.get("i"),
                    "action": action,
                    "width": width,
                    "height": height,
                    "x": x,
                    "y": y,
                    "provenance": "phase",
                }
            self.last_frame = {
                "rgba": rgba,
                "image_id": meta.get("i"),
                "action": action,
                "width": width,
                "height": height,
                "x": x,
                "y": y,
                "provenance": "phase" if self.phase is not None else "warmup",
            }
            return
        if action == "d":
            if meta.get("d") not in ("i", "I"):
                raise RuntimeError(f"unexpected Kitty delete action: {meta}")
            self.last_delete_packet = (self.packet_count - 1, meta.get("i", ""))
            return
        if action in ("a", "p"):
            return
        if action is None:
            return
        # Continuation commands and ordinary Kitty control actions carry no
        # SHM object. They are retained in packet_count but not measurements.

    def final_upload_seen(self) -> bool:
        return self.last_upload_packet is not None

    def verify_no_leaks(self) -> list[str]:
        leaks: list[str] = []
        for decoded in sorted(self.names):
            name = decoded.encode("ascii")
            fd = self.libc.shm_open(name, os.O_RDONLY, 0)
            if fd >= 0:
                os.close(fd)
                leaks.append(decoded)
                continue
            if ctypes.get_errno() != errno.ENOENT:
                leaks.append(f"{decoded}: errno={ctypes.get_errno()}")
        return leaks

    def unlink_owned(self) -> None:
        for decoded in self.names:
            name = decoded.encode("ascii")
            if SHM_NAME.fullmatch(name):
                self.libc.shm_unlink(name)


def sample_process(pid: int | None) -> dict[str, object] | None:
    if not pid:
        return None
    try:
        result = subprocess.run(
            ["ps", "-o", "pid=,rss=,%cpu=", "-p", str(pid)],
            capture_output=True,
            text=True,
            timeout=1,
            check=False,
        )
        line = result.stdout.strip()
        if not line:
            return None
        fields = line.split()
        return {"pid": int(fields[0]), "rss_kb": int(fields[1]), "cpu_percent": float(fields[2])}
    except (OSError, ValueError, IndexError, subprocess.TimeoutExpired):
        return None


def main() -> int:
    args = parse_args()
    out: pathlib.Path = args.out
    repo = pathlib.Path(__file__).resolve().parents[1]
    fixture = repo / "scripts" / "tmux-performance-fixture.tsx"
    socket = out / "tmux.sock"
    env = child_environment(args.route)
    env_facts = {
        key: env.get(key)
        for key in (
            "TERM", "TERM_PROGRAM", "COLORTERM", "KITTY_WINDOW_ID",
            "VEXART_NATIVE_PRESENTATION", "VEXART_NATIVE_LAYER_REGISTRY",
            "VEXART_GPU_FORCE_LAYER_STRATEGY", "VEXART_KITTY_SHM_COMPRESSION",
            "VEXART_FORCE_TRANSMISSION_MODE",
        )
    }
    command_args = [
        "bun", "--conditions=browser", str(fixture),
        f"--out={out}", f"--route={args.route}",
        f"--frames={args.frames}", f"--warmup={args.warmup}", f"--interval={args.interval}",
    ]
    gate = out / "start"
    exit_file = out / "exit"
    shell_command = shlex.join(command_args)
    shell = f"while [ ! -e {shlex.quote(str(gate))} ]; do sleep .01; done; {shell_command} 2>{shlex.quote(str(out / 'stderr'))}; rc=$?; printf '%s\\n' \"$rc\" > {shlex.quote(str(exit_file))}; exit \"$rc\""
    metadata = {
        "version": 1,
        "route": args.route,
        "surface": {"cols": COLS, "rows": ROWS, "pixel_width": PIXEL_WIDTH, "pixel_height": PIXEL_HEIGHT, "cell_width": CELL_WIDTH, "cell_height": CELL_HEIGHT},
        "frames": args.frames,
        "warmup": args.warmup,
        "interval_ms": args.interval,
        "fixture": str(fixture),
        "command": command_args,
        "env": env_facts,
        "socket": str(socket),
    }
    write_json(out / "metadata.json", metadata)

    master = slave = None
    tmux_process = None
    child_pid = None
    tmux_session = "vexart-perf"
    receiver = None
    decoder = None
    process_samples: dict[str, object] = {}
    start_time = time.perf_counter()
    failure: str | None = None
    try:
        master, slave = pty.openpty()
        termios.tcsetattr(slave, termios.TCSANOW, termios.tcgetattr(slave))
        import fcntl
        fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack("HHHH", ROWS, COLS, PIXEL_WIDTH, PIXEL_HEIGHT))
        tty_attrs = termios.tcgetattr(slave)
        tty_attrs[3] &= ~(termios.ECHO | termios.ICANON)
        termios.tcsetattr(slave, termios.TCSANOW, tty_attrs)

        def tm(*tmux_args: str) -> str:
            result = subprocess.run(
                ["tmux", "-S", str(socket), "-f", "/dev/null", *tmux_args],
                env=env, capture_output=True, text=True, check=True, timeout=5,
            )
            return result.stdout.strip()

        if args.route == "tmux":
            pane = tm("new-session", "-d", "-s", tmux_session, "-P", "-F", "#{pane_id}", "/bin/sh", "-c", shell)
            tm("set-window-option", "-t", tmux_session, "window-size", "latest")
            tm("set-option", "-g", "allow-passthrough", "all")
            tm("set-option", "-g", "status", "off")
            tm("set-option", "-g", "default-shell", "/bin/sh")
            tm("set-option", "-g", "terminal-features", ",*:RGB")
            tmux_process = subprocess.Popen(
                ["tmux", "-S", str(socket), "-f", "/dev/null", "attach-session", "-t", tmux_session],
                env=env, stdin=slave, stdout=slave, stderr=slave,
            )
            child_pid = tmux_process.pid
            client_deadline = time.monotonic() + 5
            while time.monotonic() < client_deadline:
                clients = tm("list-clients", "-F", "#{client_name}").splitlines()
                client_cells = tm("list-clients", "-F", "#{client_cell_width}x#{client_cell_height}").splitlines()
                window_cells = tm("display-message", "-p", "#{window_cell_width}x#{window_cell_height}").splitlines()
                allow = tm("show-options", "-g", "-v", "allow-passthrough")
                features = tm("show-options", "-g", "-v", "terminal-features")
                if len(clients) == 1 and client_cells == [f"{CELL_WIDTH}x{CELL_HEIGHT}"] and window_cells == [f"{CELL_WIDTH}x{CELL_HEIGHT}"] and allow == "all" and "RGB" in features:
                    metadata["tmux"] = {"clients": clients, "client_cells": client_cells, "window_cells": window_cells, "allow_passthrough": allow, "terminal_features": features, "pane": pane}
                    break
                time.sleep(.01)
            else:
                raise RuntimeError("private tmux startup guards failed")
        else:
            tmux_process = subprocess.Popen(
                ["/bin/sh", "-c", shell], env=env, stdin=slave, stdout=slave, stderr=slave,
            )
            child_pid = tmux_process.pid
        os.close(slave)
        slave = None
        write_json(out / "metadata.json", metadata)
        receiver = Receiver(out, args.route, master)
        decoder = WireDecoder(receiver.apc, receiver.marker, receiver.queries_from)
        process_samples["start"] = {"receiver": sample_process(os.getpid()), "child": sample_process(child_pid)}
        gate.touch()

        post_exit_deadline: float | None = None
        deadline = time.monotonic() + TOTAL_SECONDS
        while time.monotonic() < deadline:
            if select.select([master], [], [], .02)[0]:
                try:
                    chunk = os.read(master, 256 * 1024)
                except OSError as error:
                    if error.errno == errno.EIO:
                        chunk = b""
                    else:
                        raise
                if chunk:
                    receiver.outer_bytes += len(chunk)
                    decoder.feed(chunk)
            if exit_file.exists():
                if post_exit_deadline is None:
                    post_exit_deadline = time.monotonic() + POST_EXIT_SECONDS
                fixture_file = out / "fixture.json"
                if fixture_file.exists() and receiver.final_upload_seen():
                    break
                if time.monotonic() >= post_exit_deadline:
                    raise RuntimeError(
                        "fixture exit marker observed before final receiver state "
                        f"(fixture={fixture_file.exists()}, upload={receiver.final_upload_seen()}, "
                        f"packets={receiver.packet_count})"
                    )
        else:
            raise RuntimeError(f"performance fixture timed out after {TOTAL_SECONDS:.0f}s")

        process_samples["end"] = {"receiver": sample_process(os.getpid()), "child": sample_process(child_pid)}
        if not (out / "fixture.json").exists():
            raise RuntimeError("fixture.json was not written")
        try:
            fixture_result = json.loads((out / "fixture.json").read_text())
        except json.JSONDecodeError as error:
            raise RuntimeError(f"invalid fixture.json: {error}") from error
        exit_code = int(exit_file.read_text().strip())
        if exit_code != 0:
            raise RuntimeError(f"performance fixture exited with {exit_code}: {fixture_result}")
        if not receiver.phases:
            raise RuntimeError("fixture produced no complete performance phases")
        leaks = receiver.verify_no_leaks()
        if leaks:
            raise RuntimeError(f"owned SHM objects remained after fixture exit: {leaks}")
        result = {
            "status": "PASS",
            "route": args.route,
            "surface": metadata["surface"],
            "fixture": fixture_result,
            "exit_code": exit_code,
            "outer_bytes": receiver.outer_bytes,
            "shm_data_bytes": receiver.shm_data_bytes,
            "rgba_bytes": receiver.rgba_bytes,
            "upload_count": receiver.upload_count,
            "transport_actions": sorted(receiver.transport_actions),
            "queries": receiver.queries,
            "phases": receiver.phases,
            "shm_names": sorted(receiver.names),
            "shm_sources": [
                {"name": name, "sources": sorted(receiver.name_sources[name])}
                for name in sorted(receiver.names)
            ],
            "shm_cleanup": {"status": "verified-no-leaks", "owned_count": len(receiver.names)},
            "process_samples": process_samples,
            "note": "Synthetic PTY receiver; no physical terminal, Kitty app, screenshots, or user tmux server.",
        }
        write_json(out / "receiver.json", result)
        return 0
    except BaseException as error:
        failure = str(error)
        if receiver is not None:
            process_samples["end"] = {"receiver": sample_process(os.getpid()), "child": sample_process(child_pid)}
            leaks = receiver.verify_no_leaks()
        else:
            leaks = []
        write_json(out / "receiver.json", {
            "status": "FAIL",
            "route": args.route,
            "error": failure,
            "outer_bytes": receiver.outer_bytes if receiver else 0,
            "upload_count": receiver.upload_count if receiver else 0,
            "queries": receiver.queries if receiver else [],
            "phases": receiver.phases if receiver else [],
            "shm_names": sorted(receiver.names) if receiver else [],
            "shm_cleanup": {"status": "leaks-before-cleanup" if leaks else "no-leaks-before-cleanup", "leaks": leaks},
            "process_samples": process_samples,
        })
        return 1
    finally:
        if receiver is not None:
            receiver.unlink_owned()
        if tmux_process is not None:
            try:
                if tmux_process.poll() is None:
                    tmux_process.terminate()
                tmux_process.wait(timeout=3)
            except (OSError, subprocess.TimeoutExpired):
                try:
                    tmux_process.kill()
                    tmux_process.wait(timeout=3)
                except (OSError, subprocess.TimeoutExpired):
                    pass
        if args.route == "tmux":
            subprocess.run(["tmux", "-S", str(socket), "-f", "/dev/null", "kill-server"], env=env, capture_output=True)
        if master is not None:
            os.close(master)
        if slave is not None:
            os.close(slave)


if __name__ == "__main__":
    raise SystemExit(main())
