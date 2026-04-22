# native-kitty-encoding Specification

## Purpose

Base64 + zlib + Kitty escape-sequence assembly entirely in Rust within `libvexart`. Single FFI call: readback handle → encoded stdout bytes. Replaces the TypeScript encoding path in `packages/engine/src/output/kitty.ts`.

**PRD trace**: `docs/PRD.md §775-779` (Tier 1 Kitty encoding), `docs/PRD.md §12 DEC-010`.
**ARCHITECTURE trace**: `docs/ARCHITECTURE.md §4.1` (`kitty/` module), `§5.2.7` (output phase), `§12.5` (shader/build).

## Requirements

### REQ-2B-101: Single FFI emit call

The system SHALL expose `vexart_kitty_emit_frame(ctx, target_handle) -> i32`. This single call MUST perform: GPU readback → base64 encode → zlib compress → Kitty escape-sequence assembly → buffered stdout write. No intermediate data passes through JavaScript.

#### Scenario: Full-frame encode and emit

- GIVEN a valid target handle with painted content
- WHEN `vexart_kitty_emit_frame(ctx, target)` is called
- THEN the terminal receives a valid Kitty image command on stdout
- AND no data passes through `Buffer.toString('base64')` in JavaScript

#### Scenario: Encoding benchmark target

- GIVEN a 1920×1080 RGBA frame on a reference machine (M1+ or equivalent)
- WHEN the encoding path is benchmarked (readback through stdout write)
- THEN total time is <0.5ms per frame

### REQ-2B-102: Transport mode selection

`vexart_kitty_set_transport(ctx, mode)` SHALL accept `'direct' | 'file' | 'shm'`. Direct mode sends base64-chunked data inline. File mode writes to a temp file and sends metadata. SHM mode writes to shared memory and sends the name. Mode selection MUST be automatic by default based on terminal capability detection.

#### Scenario: Direct transport mode

- GIVEN direct mode is selected (default for terminals without SHM)
- WHEN a frame is emitted
- THEN the Kitty escape sequence contains base64-chunked pixel data in 4096-byte segments

#### Scenario: SHM transport mode

- GIVEN SHM mode is selected and the terminal supports it
- WHEN a frame is emitted
- THEN pixel data is written to shared memory
- AND the escape sequence contains only the SHM name and metadata

### REQ-2B-103: Compressed output

When the transport mode is `'direct'`, the encoder MUST apply zlib compression (`flate2`) to the RGBA pixel data before base64 encoding. The Kitty protocol `o=z` flag MUST be set in the escape sequence.

#### Scenario: Compressed frame is smaller

- GIVEN a 200×200 RGBA frame with typical UI content
- WHEN the encoder processes it in direct mode
- THEN the compressed+base64 output is smaller than raw base64
- AND the escape sequence includes `o=z`

### REQ-2B-104: Buffered stdout writer

The Rust encoder SHALL use a `std::io::BufWriter` over stdout. Writes MUST be flushed at the end of each complete Kitty image command (after the `\x1b\\` terminator). Partial writes MUST NOT be visible to the terminal.

#### Scenario: Atomic frame delivery

- GIVEN a frame is being encoded
- WHEN the encoder writes chunks to stdout
- THEN no partial image is visible to the terminal until the complete command is written
- AND the write is flushed after the `\x1b\\` terminator

### REQ-2B-105: Error handling for encoding failures

If stdout write fails (broken pipe, disk full for file transport), the FFI call MUST return `ERR_KITTY_TRANSPORT` (-7). The error message MUST be retrievable via `vexart_get_last_error`.

#### Scenario: Broken pipe on stdout

- GIVEN stdout has been closed (terminal disconnected)
- WHEN `vexart_kitty_emit_frame` attempts to write
- THEN the return code is `ERR_KITTY_TRANSPORT` (-7)
- AND `vexart_get_last_error` returns a descriptive message
