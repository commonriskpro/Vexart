// native/libvexart/src/ffi/panic.rs
// Error code constants and ffi_guard! macro for panic safety at FFI boundary.
// See design §7 and REQ-NB-003.

pub const OK: i32 = 0;
pub const ERR_PANIC: i32 = -1;
pub const ERR_INVALID_HANDLE: i32 = -2;
pub const ERR_OUT_OF_BUDGET: i32 = -3; // reserved — unused in Phase 2
pub const ERR_GPU_DEVICE_LOST: i32 = -4;
pub const ERR_LAYOUT_FAILED: i32 = -5;
pub const ERR_SHADER_COMPILE: i32 = -6;
pub const ERR_KITTY_TRANSPORT: i32 = -7;
pub const ERR_INVALID_FONT: i32 = -8; // reserved — unused in Phase 2 (stubs)
pub const ERR_INVALID_ARG: i32 = -9; // null pointer, out-of-range index, etc.

/// Wraps an FFI export body in `catch_unwind` to prevent panics from crossing the C boundary.
/// On panic, stores the panic message in `LAST_ERROR` and returns `ERR_PANIC`.
#[macro_export]
macro_rules! ffi_guard {
    ($body:block) => {{
        match std::panic::catch_unwind(std::panic::AssertUnwindSafe(move || $body)) {
            Ok(code) => code,
            Err(payload) => {
                let msg = if let Some(s) = payload.downcast_ref::<&'static str>() {
                    (*s).to_string()
                } else if let Some(s) = payload.downcast_ref::<String>() {
                    s.clone()
                } else {
                    "unknown panic payload".to_string()
                };
                $crate::ffi::error::set_last_error(format!("panic: {msg}"));
                $crate::ffi::panic::ERR_PANIC
            }
        }
    }};
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ffi::error::{
        clear_last_error, vexart_copy_last_error, vexart_get_last_error_length,
    };

    #[test]
    fn test_ffi_guard_success() {
        let code: i32 = ffi_guard!({ OK });
        assert_eq!(code, OK);
    }

    #[test]
    fn test_ffi_guard_catches_panic() {
        clear_last_error();
        let code: i32 = ffi_guard!({
            panic!("test panic message");
        });
        assert_eq!(code, ERR_PANIC);
        let len = vexart_get_last_error_length();
        assert!(len > 0, "expected non-empty last_error after panic");
        let mut buf = vec![0u8; len as usize];
        let n = vexart_copy_last_error(buf.as_mut_ptr(), len);
        assert_eq!(n, len);
        let msg = std::str::from_utf8(&buf[..n as usize]).unwrap();
        assert!(
            msg.contains("test panic message"),
            "expected panic message in error: {msg}"
        );
        clear_last_error();
    }

    #[test]
    fn test_ffi_guard_returns_custom_code() {
        let code: i32 = ffi_guard!({ ERR_INVALID_ARG });
        assert_eq!(code, ERR_INVALID_ARG);
    }
}
