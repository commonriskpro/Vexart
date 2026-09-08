// native/libvexart/src/kitty/writer.rs
// Buffered stdout writer for Kitty escape-sequence output.
// Phase 2b Slice 3, task 3.1. Per REQ-2B-104.
//
// Uses BufWriter<Stdout> with a 64KB buffer. Flushed after each assembled
// frame; Kitty's final m=0 chunk is the protocol boundary for image display.

use std::io::{BufWriter, Write};

/// Size of the BufWriter buffer in bytes (64 KB).
const WRITE_BUFFER_SIZE: usize = 64 * 1024;

/// Wrap one Kitty APC in tmux's passthrough DCS.
///
/// tmux consumes the outer `DCS tmux;` sequence and forwards the inner APC to
/// the parent terminal. Every ESC in the APC must be doubled, while ordinary
/// bytes (including UTF-8 payload bytes) pass through unchanged. Callers must
/// pass one complete APC at a time; chunking multiple APCs into one wrapper
/// lets tmux treat the later chunks as text instead of graphics commands.
pub fn wrap_tmux_apc(apc: &[u8]) -> Vec<u8> {
    let mut wrapped =
        Vec::with_capacity(apc.len() + 8 + apc.iter().filter(|&&byte| byte == 0x1b).count());
    wrapped.extend_from_slice(b"\x1bPtmux;");
    apc.iter().for_each(|&byte| {
        if byte == 0x1b {
            wrapped.push(0x1b);
        }
        wrapped.push(byte);
    });
    wrapped.extend_from_slice(b"\x1b\\");
    wrapped
}

fn write_buffered<W: Write>(sink: W, data: &[u8]) -> std::io::Result<()> {
    let mut writer = BufWriter::with_capacity(WRITE_BUFFER_SIZE, sink);
    writer.write_all(data)?;
    writer.flush()
}

/// Write `data` to stdout using a 64KB BufWriter, then flush.
///
/// The flush is performed after writing all bytes. Kitty only completes a
/// chunked image at its final `m=0` command, so a frame is not intentionally
/// displayed before its payload is complete. Per REQ-2B-104.
///
/// Returns `Ok(())` on success, or an `io::Error` on write/flush failure.
pub fn write_to_stdout(data: &[u8]) -> std::io::Result<()> {
    let stdout = std::io::stdout();
    write_buffered(stdout.lock(), data)
}

// ─── Unit tests ────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_write_empty_bytes_does_not_panic() {
        // Writing zero bytes must succeed without panicking.
        // Cannot capture stdout in tests easily, but we verify no panic/error.
        // write_to_stdout(&[]) is safe — BufWriter handles empty write.
        let result = write_to_stdout(b"");
        assert!(result.is_ok(), "empty write must not fail");
    }

    #[test]
    fn test_buffer_capacity_constant() {
        // Verify the 64KB constant is correct.
        assert_eq!(WRITE_BUFFER_SIZE, 65536);
    }

    #[test]
    fn tmux_wrapper_doubles_only_escape_bytes() {
        let wrapped = wrap_tmux_apc(b"\x1b_Ga=T;abc\x1b\\");
        assert_eq!(wrapped, b"\x1bPtmux;\x1b\x1b_Ga=T;abc\x1b\x1b\\\x1b\\");
    }

    #[test]
    fn buffered_writer_reports_sink_failure() {
        struct Failing;
        impl Write for Failing {
            fn write(&mut self, _data: &[u8]) -> std::io::Result<usize> {
                Err(std::io::Error::other("test sink failure"))
            }

            fn flush(&mut self) -> std::io::Result<()> {
                Ok(())
            }
        }

        let result = write_buffered(Failing, b"frame");
        assert!(result.is_err());
    }
}
