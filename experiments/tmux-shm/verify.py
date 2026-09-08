#!/usr/bin/env python3
"""Verify real tmux + POSIX SHM transport with a headless test receiver.

No Ghostty/Kitty renderer runs here. ACK latency includes this Python receiver;
this is byte-integrity/transport evidence, never displayed FPS or GPU latency.
Only the temporary tmux socket, test SHM names and test processes are touched.
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
from pathlib import Path
import pty
import re
import select
import shlex
import shutil
import stat
import struct
import subprocess
import tempfile
import termios
import time
import tty
import zlib

ESC = b'\x1b'
APC = ESC + b'_G'
ST = ESC + b'\\'
ROOT = Path(__file__).resolve().parents[2]
LIBC = ctypes.CDLL(None, use_errno=True)
LIBC.shm_open.argtypes = [ctypes.c_char_p, ctypes.c_int, ctypes.c_uint]
LIBC.shm_open.restype = ctypes.c_int
LIBC.shm_unlink.argtypes = [ctypes.c_char_p]
LIBC.shm_unlink.restype = ctypes.c_int


def fields(header):
    return dict(part.split('=', 1) for part in header.decode('ascii').split(',') if '=' in part)


def shm_open(name):
    assert re.fullmatch(r'/vx-[A-Za-z0-9-]{1,26}', name), f'Unexpected test SHM name: {name}'
    return LIBC.shm_open(name.encode(), os.O_RDONLY, 0)


def read_shm(name, expected):
    fd = shm_open(name)
    if fd < 0:
        raise OSError(ctypes.get_errno(), f'shm_open failed: {name}')
    try:
        info = os.fstat(fd)
        assert stat.S_IMODE(info.st_mode) == 0o600, 'SHM permissions must be 0600'
        assert info.st_size >= expected, 'SHM allocation shorter than RGBA'
        with mmap.mmap(fd, info.st_size, access=mmap.ACCESS_READ) as mapped:
            return mapped[:expected]
    finally:
        os.close(fd)


def run(args):
    bun, tmux = shutil.which('bun'), shutil.which('tmux')
    assert bun and tmux, 'bun and tmux must be installed'
    with tempfile.TemporaryDirectory(prefix='vx-shm-', dir='/tmp') as directory:
        path = Path(directory)
        socket, gate, result, status = (path / name for name in ('socket', 'gate', 'result.json', 'exit'))
        env = dict(os.environ, TERM='xterm-256color')
        env.pop('TMUX', None)
        env.pop('TMUX_PANE', None)

        def command(*parts, check=True):
            return subprocess.run([tmux, '-S', str(socket), '-f', '/dev/null', *parts],
                                  env=env, cwd=ROOT, capture_output=True, text=True,
                                  timeout=5, check=check)

        # The probe already runs BOTH transports; no synthetic mode flags.
        probe = shlex.join([bun, str(ROOT / 'experiments/tmux-shm/probe.ts'), '--live',
                            '--width', str(args.width), '--height', str(args.height),
                            '--frames', str(args.frames), '--timeout', '1000', '--out', str(result)])
        shell = (f'while [ ! -e {shlex.quote(str(gate))} ]; do sleep 0.01; done; '
                 f'{probe}; rc=$?; printf "%s" "$rc" > {shlex.quote(str(status))}; sleep 2')
        master = slave = client = None
        names, owned, deletes = set(), set(), set()
        images = {'d': [], 's': []}
        query = None
        pending = None
        buffer, outside = bytearray(), bytearray()
        pty_bytes = apc_bytes = packets = 0
        completed = False
        try:
            # Create a waiting pane first, so the server does not exit empty.
            command('new-session', '-d', '-s', 'probe', '-x', '80', '-y', '24', '/bin/sh', '-c', shell)
            command('set-option', '-g', 'allow-passthrough', 'on')
            command('set-option', '-g', 'terminal-features', ',*:RGB')
            command('set-option', '-g', 'status', 'off')
            master, slave = pty.openpty()
            tty.setraw(slave)
            fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack('HHHH', 24, 80, 640, 384))
            client = subprocess.Popen([tmux, '-S', str(socket), 'attach-session', '-t', 'probe'],
                                      env=env, cwd=ROOT, stdin=slave, stdout=slave, stderr=slave)
            os.close(slave)
            slave = None
            time.sleep(0.1)  # Attach startup is outside all reported timings.
            gate.touch()

            def ack(meta, message='OK'):
                header = f"i={meta['i']}"
                if 'p' in meta:
                    header += f",p={meta['p']}"
                data = (f'\x1b_G{header};{message}\x1b\\').encode()
                if args.fragment_acks:
                    # Force a split inside both the header and the ST terminator.
                    for piece in (data[:5], data[5:-1], data[-1:]):
                        os.write(master, piece)
                        time.sleep(0.002)
                else:
                    os.write(master, data)

            def consume(meta, payload):
                medium = meta.get('t', 'd')
                assert meta.get('f') == '32', 'Expected RGBA32'
                expected = int(meta['s']) * int(meta['v']) * 4
                assert 0 < expected <= 64_000_000
                if medium == 's':
                    name = base64.b64decode(payload, validate=True).decode('ascii')
                    names.add(name)
                    if args.reject_shm:
                        ack(meta, 'ENOTSUP:test-receiver')
                        return None
                    if args.timeout_shm:
                        return None  # Probe must timeout and release this object.
                    rgba = read_shm(name, expected)
                    # Leave unlink to the producer; checking its cleanup is stronger
                    # than masking a leak by unconditionally unlinking in the receiver.
                else:
                    assert medium == 'd'
                    rgba = base64.b64decode(payload, validate=True)
                    if meta.get('o') == 'z':
                        rgba = zlib.decompress(rgba)
                assert len(rgba) == expected, 'Decoded length differs from RGBA dimensions'
                digest = hashlib.sha256(rgba).hexdigest()
                ack(meta)
                return digest

            deadline = time.monotonic() + 45
            while time.monotonic() < deadline:
                readable, _, _ = select.select([master], [], [], 0.02)
                if readable:
                    try:
                        chunk = os.read(master, 65536)
                    except OSError as error:
                        if error.errno != errno.EIO:
                            raise
                        chunk = b''
                    if chunk:
                        pty_bytes += len(chunk)
                        buffer.extend(chunk)
                while True:
                    start = buffer.find(APC)
                    if start < 0:
                        if len(buffer) > 3:
                            outside.extend(buffer[:-3])
                            del buffer[:-3]
                        break
                    outside.extend(buffer[:start])
                    del buffer[:start]
                    end = buffer.find(ST, len(APC))
                    if end < 0:
                        break
                    body = bytes(buffer[len(APC):end])
                    apc_bytes += end + len(ST)
                    packets += 1
                    del buffer[:end + len(ST)]
                    header, payload = body.split(b';', 1)
                    meta = fields(header)
                    action = meta.get('a')
                    if action == 'q':
                        query = consume(meta, payload)
                    elif action == 'd':
                        assert meta.get('d') == 'I' and int(meta['i']) in owned, 'Foreign image delete'
                        deletes.add(int(meta['i']))
                    else:
                        if action == 'T':
                            assert pending is None, 'New upload before prior m=0'
                            assert meta.get('U') == '1' and meta.get('p') == '1'
                            owned.add(int(meta['i']))
                            pending = [meta, bytearray()]
                        else:
                            assert pending is not None and 'm' in meta, 'Unexpected continuation'
                        pending[1].extend(payload)
                        if meta.get('m') != '1':
                            initial, encoded = pending
                            digest = consume(initial, encoded)
                            images[initial.get('t', 'd')].append(digest)
                            pending = None
                if status.exists():
                    # Producer has flushed all cleanup writes before writing its
                    # exit marker. Drain another poll before final validation.
                    if completed:
                        break
                    completed = True
                if client.poll() is not None and not completed:
                    raise AssertionError(f'tmux client exited before probe completed: {bytes(outside + buffer)[-1500:]!r}')
            assert completed, 'Probe did not finish within 45 seconds'
            outside.extend(buffer)
            assert pending is None
            assert b'\x1bPtmux;' not in outside, 'tmux did not consume passthrough wrappers'
            code = int(status.read_text())
            report = json.loads(result.read_text())
            rejected = args.reject_shm or args.timeout_shm
            assert code == (2 if rejected else 0), f'Unexpected probe exit {code}'
            assert len(images['d']) == args.frames
            assert report['modes']['direct']['framesAcked'] == args.frames
            if rejected:
                assert query is None and not images['s'] and not report['query']['accepted']
                expected = 'timeout' if args.timeout_shm else 'error'
                assert report['query']['outcome'] == expected
            else:
                assert query is not None and report['query']['accepted']
                assert len(images['s']) == args.frames and images['d'] == images['s'], 'Pixel digests differ'
                assert query == images['s'][0], 'SHM query pixel digest differs from frame zero'
                assert len(set(images['d'])) == args.frames, 'Dataset did not change per frame'
                assert report['modes']['shm']['framesAcked'] == args.frames
            for mode in ('direct',) if rejected else ('direct', 'shm'):
                data = report['modes'][mode]
                assert data['grid']['drawn'] and data['grid']['bytes'] > 0
                image = data['imageId']
                rgb = f'{(image >> 16) & 255};{(image >> 8) & 255};{image & 255}'
                controls = f'\x1b7\x1b[?7l\x1b[38;2;{rgb}m'
                controls += ''.join(f'\x1b[{row + 1};1H' for row in range(4))
                controls += '\x1b[39m\x1b[?7h\x1b8'
                # 32 cells, each with the placeholder and three explicit marks.
                once = len(controls.encode()) + 32 * len('\U0010eeee\u0305\u0305\u081b'.encode())
                assert data['totals']['gridBytes'] == once, 'Grid was not emitted exactly once'
            assert deletes == owned, 'Missing cleanup for uploaded image IDs'
            leaks = []
            for name in names:
                fd = shm_open(name)
                if fd >= 0:
                    os.close(fd)
                    leaks.append(name)
                else:
                    assert ctypes.get_errno() == errno.ENOENT, 'Unexpected SHM lookup error'
            assert not leaks, f'Producer leaked SHM objects: {leaks}'
            return {
                'ok': True, 'receiver': 'headless Python (NOT Ghostty/Kitty rendering)',
                'tmux': subprocess.check_output([tmux, '-V'], text=True).strip(),
                'fragmentedAcks': args.fragment_acks, 'expectedRejection': rejected,
                'validatedFramesPerMode': {key: len(value) for key, value in images.items()},
                'identicalPixelDigests': not rejected and images['d'] == images['s'],
                'producerShmCleanupVerified': len(names), 'ownedImagesDeleted': len(deletes),
                'observedTmuxPtyBytes': pty_bytes, 'observedApcBytes': apc_bytes,
                'observedPackets': packets, 'emitter': report,
            }
        finally:
            if client is not None and client.poll() is None:
                client.terminate()
                try:
                    client.wait(timeout=2)
                except subprocess.TimeoutExpired:
                    client.kill()
                    client.wait()
            for descriptor in (master, slave):
                if descriptor is not None:
                    os.close(descriptor)
            command('kill-server', check=False)
            # On an unsuccessful run, reclaim only names emitted by this probe.
            for name in names:
                if re.fullmatch(r'/vx-[A-Za-z0-9-]{1,26}', name):
                    LIBC.shm_unlink(name.encode())


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--width', type=int, default=320)
    parser.add_argument('--height', type=int, default=200)
    parser.add_argument('--frames', type=int, default=20)
    parser.add_argument('--fragment-acks', action='store_true')
    errors = parser.add_mutually_exclusive_group()
    errors.add_argument('--reject-shm', action='store_true')
    errors.add_argument('--timeout-shm', action='store_true')
    args = parser.parse_args()
    assert 0 < args.width <= 4096 and 0 < args.height <= 4096
    assert args.width * args.height <= 16_000_000 and 0 < args.frames <= 120
    print(json.dumps(run(args), indent=2))


if __name__ == '__main__':
    main()
