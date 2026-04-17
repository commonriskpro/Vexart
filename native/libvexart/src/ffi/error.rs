// native/libvexart/src/ffi/error.rs
// Thread-local last-error storage for the vexart FFI error-retrieval scheme.
// See design §6 and REQ-NB-003.

use std::cell::RefCell;

thread_local! {
    static LAST_ERROR: RefCell<Option<Vec<u8>>> = const { RefCell::new(None) };
}

/// Set the last error message for this thread.
pub fn set_last_error(msg: impl AsRef<str>) {
    LAST_ERROR.with(|slot| {
        *slot.borrow_mut() = Some(msg.as_ref().as_bytes().to_vec());
    });
}

/// Clear the last error for this thread.
pub fn clear_last_error() {
    LAST_ERROR.with(|slot| *slot.borrow_mut() = None);
}

/// Returns the byte length of the current thread's last error string (0 if none).
#[no_mangle]
pub extern "C" fn vexart_get_last_error_length() -> u32 {
    LAST_ERROR.with(|slot| slot.borrow().as_ref().map(|v| v.len() as u32).unwrap_or(0))
}

/// Copies up to `cap` bytes of the last error string into `dst`.
/// Returns the number of bytes actually copied. 0 if dst is null, cap is 0, or no error.
#[no_mangle]
pub extern "C" fn vexart_copy_last_error(dst: *mut u8, cap: u32) -> u32 {
    if dst.is_null() || cap == 0 {
        return 0;
    }
    LAST_ERROR.with(|slot| {
        let binding = slot.borrow();
        let Some(err) = binding.as_ref() else {
            return 0;
        };
        let n = err.len().min(cap as usize);
        // SAFETY: caller guarantees dst is valid for cap bytes.
        unsafe {
            std::ptr::copy_nonoverlapping(err.as_ptr(), dst, n);
        }
        n as u32
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_set_and_get_error_length() {
        clear_last_error();
        assert_eq!(vexart_get_last_error_length(), 0);
        set_last_error("hello");
        assert_eq!(vexart_get_last_error_length(), 5);
    }

    #[test]
    fn test_copy_error_ascii() {
        set_last_error("test error");
        let mut buf = vec![0u8; 64];
        let n = vexart_copy_last_error(buf.as_mut_ptr(), buf.len() as u32);
        assert_eq!(n, 10);
        assert_eq!(&buf[..10], b"test error");
        clear_last_error();
    }

    #[test]
    fn test_copy_error_utf8() {
        set_last_error("error: ñoño");
        let expected = "error: ñoño".as_bytes();
        let mut buf = vec![0u8; 64];
        let n = vexart_copy_last_error(buf.as_mut_ptr(), buf.len() as u32);
        assert_eq!(n as usize, expected.len());
        assert_eq!(&buf[..n as usize], expected);
        clear_last_error();
    }

    #[test]
    fn test_copy_error_empty() {
        clear_last_error();
        let mut buf = vec![0u8; 64];
        let n = vexart_copy_last_error(buf.as_mut_ptr(), buf.len() as u32);
        assert_eq!(n, 0);
    }

    #[test]
    fn test_copy_error_oversized_cap() {
        set_last_error("hi");
        let mut buf = vec![0u8; 64];
        let n = vexart_copy_last_error(buf.as_mut_ptr(), 64);
        assert_eq!(n, 2);
        assert_eq!(&buf[..2], b"hi");
        clear_last_error();
    }

    #[test]
    fn test_copy_error_small_cap() {
        set_last_error("hello world");
        let mut buf = vec![0u8; 5];
        let n = vexart_copy_last_error(buf.as_mut_ptr(), 5);
        assert_eq!(n, 5);
        assert_eq!(&buf[..5], b"hello");
        clear_last_error();
    }

    #[test]
    fn test_null_dst_returns_zero() {
        set_last_error("some error");
        let n = vexart_copy_last_error(std::ptr::null_mut(), 64);
        assert_eq!(n, 0);
        clear_last_error();
    }
}
