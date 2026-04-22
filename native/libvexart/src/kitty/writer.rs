// native/libvexart/src/kitty/writer.rs
// Buffered stdout writer for Kitty escape-sequence output.
// Phase 2b Slice 3, task 3.1. Per REQ-2B-104.
//
// Uses BufWriter<Stdout> with a 64KB buffer. Flushed after each complete
// Kitty image command to ensure atomic frame delivery (no partial images).

use std::io::{BufWriter, Write};

/// Size of the BufWriter buffer in bytes (64 KB).
const WRITE_BUFFER_SIZE: usize = 64 * 1024;

/// Write `data` to stdout using a 64KB BufWriter, then flush.
///
/// The flush is performed after writing all bytes so that the complete Kitty
/// image command is delivered atomically — no partial frames are visible to
/// the terminal. Per REQ-2B-104.
///
/// Returns `Ok(())` on success, or an `io::Error` on write/flush failure.
pub fn write_to_stdout(data: &[u8]) -> std::io::Result<()> {
    let stdout = std::io::stdout();
    let mut writer = BufWriter::with_capacity(WRITE_BUFFER_SIZE, stdout.lock());
    writer.write_all(data)?;
    writer.flush()?;
    Ok(())
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
}
