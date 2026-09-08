# tmux SHM + Unicode-placeholder transport probe

This is a standalone, opt-in transport experiment. It does **not** change the
Vexart renderer or production transport selection. The default invocation and
`--help` print usage only; `--live` is required before anything is written to a
terminal.

## What it measures

For one deterministic RGBA dataset per frame (the same dataset is sent through
both routes), the probe compares:

- direct Kitty `a=T,t=d,U=1` with zlib level 6 and base64 payloads;
- Kitty shared-memory `a=T,t=s,U=1`, prepared by the existing native SHM helper;
- a separate real SHM query (`a=q,t=s`) before the comparison;
- preparation time, outbound bytes written to the PTY, and complete Kitty ACK
  round-trip time.

Each route uses one high, process-owned image ID for all of its frames. The
first successful placement is followed by one raw `U+10EEEE` 8×4 placeholder
grid using Kitty's official row/column combining-mark table. Later frames reuse
that image ID and do not redraw the grid. At teardown, only those generated
image IDs receive `a=d,d=I`; SHM handles are released after their ACK (or on an
error/timeout).

> **A transport ACK is not a displayed frame.** `OK` means that the receiver
> accepted/processed the command. It does not prove that a real terminal drew
> visible pixels. This probe does not measure FPS, GPU readback, animation, or
> end-to-end presentation latency.

The direct preparation time uses Bun's zlib implementation at level 6. It is a
byte-flow comparison, not a benchmark of Rust's WGPU/native encoder or the
production render loop.

## Run safely

Run this from a free shell pane, not from an interactive Vexart renderer:

```sh
bun experiments/tmux-shm/probe.ts --live --frames 20 --width 320 --height 200 --out /tmp/vexart-tmux-shm.json
```

The command refuses non-TTY stdin/stdout, requires the current process to be
inside tmux, and read-only checks the effective pane value of
`allow-passthrough`. It never starts a tmux server, changes an option, or
changes a session. If `--out` names an existing file, the command fails rather
than overwriting it. Use `--out -` to print JSON after terminal cleanup.

Options:

```text
--live             required to run; without it the probe has no effects
--width N          RGBA width, 1–4096 (default 320)
--height N         RGBA height, 1–4096 (default 200)
--frames N         frames per route, 1–120 (default 20)
--timeout N        complete ACK timeout in ms, 1–60000 (default 2000)
--out PATH         exclusive-create JSON output; - means stdout
--help             print usage
```

Do not use `--live` in a Vexart interactive pane. For repeatable headless
verification, let a test harness own a fresh PTY/tmux server and provide a
receiver that recognizes the wrapped APCs and reads the local POSIX SHM name.
That harness can verify bytes and ACK behavior without claiming that Ghostty or
Kitty actually rendered the image.

## Headless verification (2026-09-07)

The repository harness uses a fresh tmux/PTY and a Python headless receiver:

```sh
python3 experiments/tmux-shm/verify.py --frames 20
python3 experiments/tmux-shm/verify.py --width 1280 --height 720 --frames 20
python3 experiments/tmux-shm/verify.py --frames 3 --fragment-acks
python3 experiments/tmux-shm/verify.py --frames 3 --reject-shm
python3 experiments/tmux-shm/verify.py --frames 3 --timeout-shm
```

The 320×200 and 1280×720 runs produced identical per-frame pixel digests for
both modes; all 21 producer SHM objects were released and both process-owned
image IDs were deleted. Direct APC bytes were 4,743,996 (320×200) and
17,754,396 (1280×720); SHM APC bytes were 2,040 and 2,060 respectively, plus
411/413 bytes for each raw placeholder grid. SHM data itself moves outside the
PTY byte count and is not eliminated by this comparison. The fragment,
rejection, and timeout cases also completed with the expected outcomes.

These results exercise a synthetic image and a Python headless receiver only;
they do not prove Ghostty/Kitty visual output or FPS. Preparation timings use
Bun's runtime zlib and the native SHM helper, not the Rust WGPU encoder or
production render loop.

## Protocol details

Every Kitty APC is individually wrapped with tmux DCS passthrough and all
embedded `ESC` bytes are doubled. The placeholder grid remains ordinary raw
UTF-8/ANSI text in the pane stream. The probe waits for a complete
`ESC_Gi=<id>;<status>ESC\\` response, retaining fragments across PTY reads, and
reports the query result separately from each `a=T` virtual-placement result.

The SHM segment is created with mode `0600`, has a short unique macOS-friendly
name, and stays alive until the corresponding ACK. Frames are serialized: no
SHM handle is reused while a command is in flight. TTY raw mode and temporary
signal handlers are restored in `finally` blocks even after timeout or abort.

References:

- [Kitty graphics protocol](https://sw.kovidgoyal.net/kitty/graphics-protocol/)
- [tmux passthrough FAQ](https://github.com/tmux/tmux/wiki/FAQ)
