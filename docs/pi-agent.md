# Pi with Vexart

A native Vexart frontend for the **Pi 0.85.1 JSON-lines RPC protocol**.
Pi remains responsible for model access, tools, sessions and agent execution;
Vexart owns the presentation and input. This is not a replacement agent loop.

## Development

Prerequisites: Bun, the Vexart native library, and `pi` on `PATH`.
Use a terminal supported by Vexart's Kitty graphics transport, such as Ghostty.

```sh
bun run pi --cwd /absolute/path/to/project
```

Optional flags: `--pi /absolute/path/to/pi`, `--agent-dir /absolute/path`,
and `--session-dir /absolute/path`. An isolated agent directory does not copy
credentials from your normal agent directory; environment variables are still
inherited by Pi.

The app uses the installed Pi executable, not the research checkout under
`/tmp`. It inherits Pi's normal environment and credentials; it does not copy
keys into Vexart. Sending a prompt can invoke the configured model and allow
Pi's enabled tools to operate in the selected project, just as in Pi itself.
Use a disposable project for initial testing.

## Integration boundary

- Commands and responses are correlated by RPC request IDs.
- Conversation content and tool outcomes come from Pi, not demo fixtures.
- Session discovery reads session metadata; switching is performed by Pi.
- Model choices come from `get_available_models`, not a hardcoded catalogue.
- The work disclosure hides intermediate activity, not the final response.
- A failed operation is an error, not a successful optimistic update.

### Deliberate limits of this phase

This implementation is not yet full Pi TUI parity or a pixel-identical copy of
every approved mock. Image attachments/rendering, Pi's external editor and its
complete configurable keybinding set are not implemented. Unsupported controls
are not shown as working buttons.

Paragraphs use the native text flow to preserve wrapping and readable content;
inline Markdown emphasis/code-span styling is reduced. Fenced code blocks are
retained. The public Textarea currently couples its focused border and caret
color, so the focused composer retains an inner border rather than hiding the
caret. These are visible limitations, not successful fidelity checks.

Pi's RPC does not provide arbitrary `pi-tui` components, custom editors,
header/footer factories or raw terminal-input extension hooks. Those need a
separate compatibility design and are not claimed to work here.

Pi 0.85.1 also initializes extensions before its RPC stdin reader. An extension
that waits for a dialog during `session_start` can therefore block the RPC
handshake itself. Mounting the frontend earlier does not fix that upstream
ordering. Such startup dialogs need the original Pi TUI or an extension that
defers the dialog until the RPC connection is ready.

RPC exposes a session tree and **fork**, but not the TUI's general
`navigateTree` operation. A fork creates a separate session: it must be named
explicitly in the interface, never presented as ordinary tree navigation.

Presentation preferences belong to this frontend. They must not be described
as changes to Pi's saved TUI configuration. Only settings with a corresponding
RPC command are sent to Pi.

## Verification levels

Type checking and unit tests do not establish a working terminal integration.
RPC integration tests should use an isolated agent directory and project, and
exercise the installed Pi process. Offscreen GPU captures establish native
rendering and dispatched UI interaction, but not physical-terminal transport.
An actual provider response is a separate check from a local RPC/tool test.

Focused checks:

```sh
bun run typecheck
bun run test examples/pi-agent
bun --conditions=browser run scripts/pi-agent-visual.tsx /absolute/path/to/captures
```

The visual harness starts the real Pi executable in a disposable project,
runs harmless shell commands, captures native GPU frames and dispatches
composer, settings, Stop and Escape interactions back through RPC. It does not
call a model provider. Optional trailing width/height arguments capture smaller
viewports, for example `780 870`.

### Explicit provider check

This separate command **uses the configured Pi provider and may consume paid
usage**. It is not included in the automated test suite:

```sh
bun --conditions=browser run scripts/pi-agent-live.tsx /absolute/path/to/captures
```

It types a request through the actual native composer, asks Pi to read and fix
a small disposable TypeScript project, verifies its test independently, and
captures the resulting conversation and panels. It uses Pi's normal
authentication without reading or copying credentials. It does not change the
selected provider/model or the user's project. Only the generated example
source is supplied to the model. Captures include the recorded session from
that synthetic project for repeatable visual checking.

To capture that recorded conversation again **without another provider call**:

```sh
bun --conditions=browser run scripts/pi-agent-replay.tsx /absolute/path/to/provider-session.jsonl /absolute/path/to/captures 780 870
```

Replay opens a disposable copy through real Pi RPC; it does not inject fake
frontend state. The copy's working-directory metadata is relocated for session
discovery. Original messages and the source recording are preserved.
