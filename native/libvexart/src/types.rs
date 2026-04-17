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
