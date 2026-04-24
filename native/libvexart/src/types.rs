/// Shared #[repr(C)] types used across the vexart FFI boundary.

/// RGBA color (8 bits per channel, packed as u32 big-endian RGBA8888).
#[repr(C)]
#[derive(Clone, Copy, Debug, Default)]
pub struct Color {
    pub r: u8,
    pub g: u8,
    pub b: u8,
    pub a: u8,
}

/// Axis-aligned rectangle.
#[repr(C)]
#[derive(Clone, Copy, Debug, Default)]
pub struct Rect {
    pub x: f32,
    pub y: f32,
    pub w: f32,
    pub h: f32,
}

/// 3×3 transform matrix in row-major layout.
#[repr(C)]
#[derive(Clone, Copy, Debug)]
pub struct TransformMatrix {
    pub m: [f32; 9],
}

impl Default for TransformMatrix {
    fn default() -> Self {
        // Identity matrix
        Self {
            m: [1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0],
        }
    }
}

/// Per-frame GPU statistics returned by paint and composite calls.
#[repr(C)]
#[derive(Clone, Copy, Debug, Default)]
pub struct FrameStats {
    /// Number of draw calls issued this frame.
    pub draw_calls: u32,
    /// Number of primitives (instances) submitted.
    pub primitives: u32,
    /// GPU time in microseconds (0 if not measured).
    pub gpu_time_us: u64,
    /// CPU time in microseconds for the dispatch call.
    pub cpu_time_us: u64,
}

/// Opaque handle to a context or GPU resource (u64 wraps a raw pointer or index).
#[repr(transparent)]
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub struct NodeHandle(pub u64);

impl NodeHandle {
    pub const NULL: Self = Self(0);

    pub fn is_null(self) -> bool {
        self.0 == 0
    }
}

/// Native presentation statistics — filled by `vexart_kitty_emit_frame_with_stats`
/// and related native presentation exports.
///
/// Versioned struct for FFI stability. Total size: 64 bytes.
/// Phase 2b: version=1, mode/transport are u32 enum values.
///
/// mode values: 0=unknown, 1=final-frame, 2=layer, 3=region, 4=delete
/// transport values: 0=direct, 1=file, 2=shm
/// flags: bit 0 = native path used, bit 1 = fallback activated, bit 2 = stats valid
#[repr(C)]
#[derive(Clone, Copy, Debug, Default)]
pub struct NativePresentationStats {
    /// Struct version — always 1 for Phase 2b.
    pub version: u32,
    /// Presentation mode enum (see above).
    pub mode: u32,
    /// Raw RGBA bytes read back from GPU (0 = none transferred to JS).
    pub rgba_bytes_read: u64,
    /// Kitty escape bytes emitted to stdout.
    pub kitty_bytes_emitted: u64,
    /// GPU readback time in microseconds.
    pub readback_us: u64,
    /// Kitty encoding time in microseconds.
    pub encode_us: u64,
    /// stdout write time in microseconds.
    pub write_us: u64,
    /// Total end-to-end time in microseconds.
    pub total_us: u64,
    /// Transport mode used (0=direct, 1=file, 2=shm).
    pub transport: u32,
    /// Flags bitfield.
    pub flags: u32,
}

impl NativePresentationStats {
    pub const VERSION: u32 = 1;
    pub const MODE_UNKNOWN: u32 = 0;
    pub const MODE_FINAL_FRAME: u32 = 1;
    pub const MODE_LAYER: u32 = 2;
    pub const MODE_REGION: u32 = 3;
    pub const MODE_DELETE: u32 = 4;
    pub const TRANSPORT_DIRECT: u32 = 0;
    pub const TRANSPORT_FILE: u32 = 1;
    pub const TRANSPORT_SHM: u32 = 2;
    pub const FLAG_NATIVE_USED: u32 = 1;
    pub const FLAG_FALLBACK: u32 = 2;
    pub const FLAG_VALID: u32 = 4;
}
