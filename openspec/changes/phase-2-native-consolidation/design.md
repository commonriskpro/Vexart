# Design: Phase 2 Native Consolidation

## 1. Context and goals

Phase 2 collapses Vexart's runtime into **one** native artifact — `libvexart` (Rust cdylib) — by deleting Zig (`zig/`), Clay (`vendor/clay*`), the legacy CPU paint path (`paint-legacy/`), the Clay bridge (`loop/clay-layout.ts`), the gpu stub (`ffi/gpu-stub.ts`), the placeholder + halfblock backends, and by absorbing the existing `native/wgpu-canvas-bridge/` and `native/kitty-shm-helper/` crates into `native/libvexart/` (`docs/PRD.md §11 Phase 2`, `docs/PRD.md §12 DEC-004`, `docs/ARCHITECTURE.md §4`). Design decisions made now lock the TS↔Rust contract for every downstream phase: once the Clay and Zig surfaces are gone, the `vexart_*` shape cannot be renegotiated without a breaking FFI-version bump (`docs/API-POLICY.md §11`). Binding inputs: `proposal.md`, `specs/native-binary/spec.md` REQ-NB-001..011, `exploration.md` FFI inventory.

This design is deliberately **Phase-2-scoped**. The ARCHITECTURE §4.1 target tree includes `resource/`, `pipeline_cache.rs`, `text/atlas.rs`, `kitty/encoder.rs`, `kitty/writer.rs`, and `scheduler/` — these are **explicitly deferred to Phase 2b** per DEC-010 and DEC-011 and do NOT appear in the Phase 2 exit tree.

---

## 2. Cargo workspace layout

### 2.1 Root `Cargo.toml` (new file)

```toml
[workspace]
resolver = "2"
members = [
  "native/libvexart",
]
# Future Phase 2b / 3 members land here (e.g. native/internal-atlas-gen).
# No glob members — every crate added requires a PRD trace.

[workspace.package]
edition = "2021"
rust-version = "1.95.0"
license = "SEE LICENSE IN LICENSE.md"   # dual-license: see docs/PRD.md §10.1 / DEC-003
authors = ["Vexart Founder"]
repository = "https://github.com/vexart/vexart"
publish = false                          # crates.io publishing is out of scope for v0.9

[workspace.lints.rust]
unsafe_op_in_unsafe_fn = "deny"          # forces explicit unsafe blocks in unsafe fns — FFI safety

# NOTE: [profile.*] sections MUST live in the root workspace Cargo.toml.
# Cargo ignores `[profile.*]` blocks defined in workspace-member manifests
# (warning: "profiles for the non root package will be ignored"). See §2.3
# below for the required root profile definitions — they are normative even
# though §2.2 originally documented them under the member crate.

[profile.release]
lto = "fat"         # single-binary; LTO is cheap on one crate and gives the most savings
codegen-units = 1   # deterministic builds + best LTO; ~5% extra compile time is acceptable
panic = "abort"     # panics in FFI are caught via catch_unwind; unwinding past FFI is UB anyway
opt-level = 3
strip = "symbols"   # ship-size only; debug symbols stripped for dist builds

[profile.dev]
opt-level = 1       # wgpu debug builds at opt-level 0 are painfully slow
```

Rationale: `resolver = "2"` is required for edition 2021 feature resolution with `wgpu 29`'s feature-gated back-ends. `publish = false` guards against accidental `cargo publish`. `unsafe_op_in_unsafe_fn = "deny"` is a cheap safety net for the FFI boundary (`docs/ARCHITECTURE.md §4.2`). Profiles are defined at the workspace root per Cargo's profile-resolution rules — earlier drafts of this design placed them in §2.2 under the member crate, which is ineffective.

### 2.2 `native/libvexart/Cargo.toml`

```toml
[package]
name = "libvexart"
version = "0.1.0"
edition.workspace = true
rust-version.workspace = true
license.workspace = true
authors.workspace = true
publish.workspace = true

[lib]
name = "vexart"                 # produces libvexart.{dylib,so,dll}
crate-type = ["cdylib", "rlib"] # cdylib for FFI; rlib so Rust integration tests can link

[dependencies]
taffy  = "0.10.1"   # layout engine — direct Clay replacement (DEC-004)
wgpu   = "29.0.1"   # GPU rendering — upgrade from bridge's pinned 26
pollster = "0.4"    # minimal sync executor to block on wgpu async — kept from old bridge
bytemuck = { version = "1.25", features = ["derive"] } # Pod/Zeroable for instance buffers
nix    = { version = "0.29", default-features = false, features = ["mman", "fs"] } # POSIX SHM only

# Reserved for Phase 2b — NOT added in Phase 2 Cargo.toml (REQ-NB-009 allows deferral):
# base64 = "0.22.1"   # Kitty protocol encoding — Phase 2b Tier 1 / DEC-010
# flate2 = "1.1.9"    # zlib deflate for Kitty o=z — Phase 2b Tier 1 / DEC-010
# fdsm   = "0.8.0"    # MSDF atlas generator — Phase 2b / DEC-008

[dev-dependencies]
# Integration-test helpers land here when tests/ is populated.

# NOTE: [profile.*] blocks were previously documented here but Cargo ignores
# them when declared in a workspace member. They are normatively defined in
# the ROOT Cargo.toml per §2.1 — see the profile block there for the actual
# values. This member manifest MUST NOT declare `[profile.*]` sections.
```

**Rationale for decisions**:

- `crate-type = ["cdylib", "rlib"]` — `rlib` is included so Rust-side `tests/integration/*.rs` can link against the crate using normal cargo test infrastructure. `cdylib` alone would force either duplicate source or a separate test harness. Cost: one extra build artifact per build. Acceptable.
- `panic = "abort"` — unwinding across the C FFI boundary is UB in Rust. `catch_unwind` converts panics to error codes BEFORE the panic reaches the boundary, and `abort` is the safe fallback if that conversion itself panics. This matches REQ-NB-003.
- `lto = "fat"` over `"thin"` — single-crate cdylib; "fat" LTO is effectively free here.

---

## 3. `rust-toolchain.toml` (new file)

```toml
[toolchain]
channel = "1.95.0"
components = ["rustfmt", "clippy", "rust-src"]
targets = ["aarch64-apple-darwin"]
profile = "minimal"
```

**Target decision — RESOLVED (2026-04-17, founder)**: Phase 2 installs **only the host target** (`aarch64-apple-darwin`). REQ-NB-008's target list is interpreted as declared cross-compile coverage, NOT dev-local installation mandate. Rustup will download other-target std libraries lazily when cross-compile is first requested (Phase 4/5 when CI lands). Rationale: solo dev with no CI today, avoiding ~200MB of pre-downloaded std libraries that will not be used until CI setup. Spec archive note will clarify "CI-enforced; dev-local may be host-only during v0.9 development".

**Committed file (host-only, Phase 2 pragmatic)**:

```toml
[toolchain]
channel = "1.95.0"
components = ["rustfmt", "clippy", "rust-src"]
targets = ["aarch64-apple-darwin"]
profile = "minimal"
```

Future CI phase (Phase 4/5) will expand `targets` to include `x86_64-apple-darwin`, `x86_64-unknown-linux-gnu`, `aarch64-unknown-linux-gnu`. One-line change, reversible, cheap.

---

## 4. `native/libvexart/` module tree (Phase 2 exit)

```
native/libvexart/
├── Cargo.toml
├── src/
│   ├── lib.rs                     ← all vexart_* #[no_mangle] exports; catch_unwind
│   │                                wrappers; module-level re-exports
│   ├── types.rs                   ← shared #[repr(C)] types: Color, Rect, TransformMatrix,
│   │                                FrameStats, NodeHandle (u64)
│   ├── layout/
│   │   ├── mod.rs                 ← LayoutContext, Taffy tree owner
│   │   ├── tree.rs                ← commands → Taffy node conversion
│   │   └── writeback.rs           ← Taffy computed layout → caller buffer
│   ├── paint/
│   │   ├── mod.rs                 ← PaintContext, dispatch entry
│   │   ├── context.rs             ← wgpu Instance/Adapter/Device/Queue owner
│   │   ├── instances.rs           ← #[repr(C)] instance structs for each pipeline
│   │   ├── pipelines/
│   │   │   ├── mod.rs
│   │   │   ├── rect.rs            ← sdf_rect.wgsl
│   │   │   ├── rect_corners.rs    ← per-corner radius
│   │   │   ├── circle.rs
│   │   │   ├── line.rs
│   │   │   ├── bezier.rs
│   │   │   ├── polygon.rs
│   │   │   ├── gradient_linear.rs ← 2-stop + multi-stop
│   │   │   ├── gradient_radial.rs ← 2-stop + multi-stop
│   │   │   ├── gradient_conic.rs
│   │   │   ├── gradient_stroke.rs
│   │   │   ├── image.rs           ← render_image + render_images_layer
│   │   │   ├── image_transform.rs ← render_transformed_images_layer
│   │   │   ├── glow.rs            ← halo / outer glow
│   │   │   ├── shadow.rs          ← drop shadow + inset shadow
│   │   │   ├── blur.rs            ← backdrop blur source
│   │   │   ├── filter.rs          ← brightness/contrast/saturate/grayscale/invert/sepia/hue
│   │   │   └── blend.rs           ← 16 CSS blend modes
│   │   └── shaders/               ← .wgsl files embedded via include_str!
│   ├── composite/
│   │   ├── mod.rs                 ← composite_merge entry
│   │   ├── target.rs              ← offscreen target lifecycle
│   │   └── readback.rs            ← GPU→CPU buffer transfer
│   ├── kitty/
│   │   ├── mod.rs                 ← re-exports shm
│   │   └── shm.rs                 ← POSIX SHM transport via nix (REAL impl, not stub)
│   ├── text/
│   │   └── mod.rs                 ← single file: load_atlas / dispatch / measure no-op stubs
│   │                                + AtomicBool first-call warning (DEC-011)
│   ├── ffi/
│   │   ├── mod.rs
│   │   ├── buffer.rs              ← packed ArrayBuffer decoder (mirrors TS encoder)
│   │   ├── error.rs               ← thread_local! LAST_ERROR + vexart_get_last_error_*
│   │   └── panic.rs               ← catch_unwind! macro
│   └── (no build.rs)              ← shaders via include_str!; no codegen needed Phase 2
└── tests/
    └── integration/
        └── roundtrip.rs           ← end-to-end FFI roundtrip with mock context
```

**ARCHITECTURE §4.1 files INTENTIONALLY DEFERRED to Phase 2b** (flagged per config.yaml rules.design):

| Deferred path | Reason | PRD trace |
|---|---|---|
| `paint/pipeline_cache.rs` | WGPU `PipelineCache` persisted — Tier 1 | DEC-010 Phase 2b Tier 1 |
| `paint/culling.rs` | Viewport culling — Tier 2 | DEC-010 Phase 3 Tier 2 |
| `resource/*` (whole module) | `ResourceManager` unified budget | DEC-010 Phase 2b Tier 1 |
| `text/atlas.rs` + `text/render.rs` | MSDF real implementation | DEC-008 / DEC-011 Phase 2b |
| `text/glyph_info.rs` | Glyph metrics + kerning | DEC-008 Phase 2b |
| `kitty/encoder.rs` + `kitty/writer.rs` + `kitty/transport.rs` | Base64 + deflate + escape assembly | DEC-010 Phase 2b Tier 1 (REQ-NB-007) |
| `scheduler/*` | Internal task coordination | DEC-010 Phase 2b+ |
| `composite/damage.rs` | Damage rect algebra — can live in TS loop for Phase 2 | Phase 3 loop decomposition |
| `build.rs` | No codegen needed; shaders via `include_str!` | N/A |

**Deviation from ARCHITECTURE §4.1**: `text/` is **one file** in Phase 2 (not three). This is a simplification of the target layout scoped to the DEC-011 no-op behavior; Phase 2b will split `text/` into `mod.rs + atlas.rs + glyph_info.rs + render.rs` as ARCHITECTURE specifies. No deviation from the FFI contract — the three `vexart_text_*` exports still exist as spec'd by REQ-NB-005.

---

## 5. Full FFI export inventory for Phase 2

All exports are `#[no_mangle] pub extern "C" fn`, wrap body in `catch_unwind`, return `i32` (0 = OK, negative = error per §7), and obey `vexart_<module>_<action>` naming (REQ-NB-003).

### 5.1 Version & lifecycle

| Export | Signature | Params | Purpose |
|---|---|---:|---|
| `vexart_version` | `() -> u32` | 0 | Returns `EXPECTED_BRIDGE_VERSION` = `0x00020000` (Phase 2.0). TS checks on mount. |
| `vexart_context_create` | `(opts_ptr: *const u8, opts_len: u32, out_ctx: *mut u64) -> i32` | 3 | Allocates PaintContext + LayoutContext; returns opaque handle in `out_ctx`. |
| `vexart_context_destroy` | `(ctx: u64) -> i32` | 1 | Drops all GPU resources + Taffy tree. |
| `vexart_context_resize` | `(ctx: u64, width: u32, height: u32) -> i32` | 3 | Resize surface + invalidate size-dependent resources. |

### 5.2 Layout

| Export | Signature | Params | Purpose |
|---|---|---:|---|
| `vexart_layout_compute` | `(ctx: u64, cmds_ptr: *const u8, cmds_len: u32, out_ptr: *mut u8, out_cap: u32, out_used: *mut u32) -> i32` | 6 | Build Taffy tree from flat command buffer, compute layout, write PositionedCommand[] to caller buffer. |
| `vexart_layout_measure` | `(ctx: u64, text_ptr: *const u8, text_len: u32, font_id: u32, font_size: f32, out_w: *mut f32, out_h: *mut f32) -> i32` | 7 | Phase 2: writes `0.0`, `0.0` (DEC-011). |
| `vexart_layout_writeback` | `(ctx: u64, writeback_ptr: *const u8, writeback_len: u32) -> i32` | 3 | Back-channel for node handle updates (e.g. scroll offsets). |

### 5.3 Paint (packed buffer — see §8)

| Export | Signature | Params | Purpose |
|---|---|---:|---|
| `vexart_paint_dispatch` | `(ctx: u64, target: u64, graph_ptr: *const u8, graph_len: u32, stats_out: *mut FrameStats) -> i32` | 5 | Execute paint graph; graph buffer contains all per-primitive instance data. |
| `vexart_paint_upload_image` | `(ctx: u64, image_ptr: *const u8, image_len: u32, width: u32, height: u32, format: u32, out_image: *mut u64) -> i32` | 7 | RGBA/BGRA → GPU texture, returns handle. |
| `vexart_paint_remove_image` | `(ctx: u64, image: u64) -> i32` | 2 | Free GPU texture. |

### 5.4 Composite

| Export | Signature | Params | Purpose |
|---|---|---:|---|
| `vexart_composite_merge` | `(ctx: u64, composite_ptr: *const u8, composite_len: u32, out_target: *mut u64, stats_out: *mut FrameStats) -> i32` | 5 | Z-order layer merge to final target; composite_ptr is packed buffer. |
| `vexart_composite_readback_rgba` | `(ctx: u64, target: u64, dst: *mut u8, dst_cap: u32, stats_out: *mut FrameStats) -> i32` | 5 | Blocking GPU→CPU readback of full target. |
| `vexart_composite_readback_region_rgba` | `(ctx: u64, target: u64, rect_ptr: *const u8, dst: *mut u8, dst_cap: u32, stats_out: *mut FrameStats) -> i32` | 6 | Region readback; rect_ptr = 4×u32 (x,y,w,h). |

### 5.5 Text (stubs — DEC-011 / REQ-NB-005)

| Export | Signature | Params | Purpose |
|---|---|---:|---|
| `vexart_text_load_atlas` | `(ctx: u64, atlas_ptr: *const u8, atlas_len: u32, font_id: u32) -> i32` | 4 | Success no-op. |
| `vexart_text_dispatch` | `(ctx: u64, glyphs_ptr: *const u8, glyphs_len: u32, stats_out: *mut FrameStats) -> i32` | 4 | Success no-op. First call emits stderr warning via `AtomicBool::compare_exchange`. |
| `vexart_text_measure` | `(ctx: u64, text_ptr: *const u8, text_len: u32, font_id: u32, font_size: f32, out_w: *mut f32, out_h: *mut f32) -> i32` | 7 | Writes `*out_w = 0.0; *out_h = 0.0`; returns OK. |

### 5.6 Kitty SHM transport (REAL impl — REQ-NB-006)

| Export | Signature | Params | Purpose |
|---|---|---:|---|
| `vexart_kitty_shm_prepare` | `(name_ptr: *const u8, name_len: u32, data_ptr: *const u8, data_len: u32, mode: u32, out_handle: *mut u64) -> i32` | 6 | `shm_open` + `ftruncate` + `mmap` + `memcpy` + `munmap`; returns opaque handle (u64 packing fd + maybe unlink flag). |
| `vexart_kitty_shm_release` | `(handle: u64, unlink_flag: u32) -> i32` | 2 | `close(fd)`; if `unlink_flag != 0` also `shm_unlink(name)`. |

### 5.7 Error retrieval (REQ-NB-003)

| Export | Signature | Params | Purpose |
|---|---|---:|---|
| `vexart_get_last_error_length` | `() -> u32` | 0 | Byte length of current thread's last error string (0 if none). |
| `vexart_copy_last_error` | `(dst: *mut u8, cap: u32) -> u32` | 2 | Copies up to `cap` bytes, returns bytes actually copied. |

**Total Phase 2 exports**: 20 (1 version + 3 context + 3 layout + 3 paint + 3 composite + 3 text stubs + 2 kitty_shm + 2 error retrieval).

All obey ≤8 params (max seen: 7 on `vexart_paint_upload_image` and `vexart_layout_measure`). Additional per-primitive data (rect instances, gradient stops, transforms) is packed into the `graph_ptr`/`composite_ptr` buffers — see §8.

---

## 6. Error-retrieval scheme

**Choice: single shared `vexart_get_last_error_*` via `thread_local!` storage** (not per-module getters). REQ-NB-003 requires shared; REQ-NB-006 permits either — design commits to shared for uniformity.

```rust
// native/libvexart/src/ffi/error.rs
use std::cell::RefCell;

thread_local! {
    static LAST_ERROR: RefCell<Option<Vec<u8>>> = const { RefCell::new(None) };
}

pub fn set_last_error(msg: impl AsRef<str>) {
    LAST_ERROR.with(|slot| {
        *slot.borrow_mut() = Some(msg.as_ref().as_bytes().to_vec());
    });
}

pub fn clear_last_error() {
    LAST_ERROR.with(|slot| *slot.borrow_mut() = None);
}

#[no_mangle]
pub extern "C" fn vexart_get_last_error_length() -> u32 {
    LAST_ERROR.with(|slot| {
        slot.borrow().as_ref().map(|v| v.len() as u32).unwrap_or(0)
    })
}

#[no_mangle]
pub extern "C" fn vexart_copy_last_error(dst: *mut u8, cap: u32) -> u32 {
    if dst.is_null() || cap == 0 { return 0; }
    LAST_ERROR.with(|slot| {
        let Some(err) = slot.borrow().as_ref() else { return 0 };
        let n = err.len().min(cap as usize);
        // SAFETY: caller guarantees dst is valid for cap bytes.
        unsafe { std::ptr::copy_nonoverlapping(err.as_ptr(), dst, n); }
        n as u32
    })
}
```

**Rationale**: single thread_local avoids module-ownership bikeshedding; TS side is trivial; matches ARCHITECTURE §4.2 example. Bun is single-threaded so thread-local == process-wide in practice; this design still correctly serializes per-thread error state if Phase 2b introduces worker threads. **Cost**: one heap allocation per error (accepted — errors are off-happy-path). **Non-goal**: error chaining / structured errors → deferred to Phase 3+.

---

## 7. Panic safety pattern

Every FFI export MUST wrap its body using the shared macro:

```rust
// native/libvexart/src/ffi/panic.rs
use std::panic::{catch_unwind, AssertUnwindSafe};

pub const OK:                     i32 = 0;
pub const ERR_PANIC:              i32 = -1;
pub const ERR_INVALID_HANDLE:     i32 = -2;
pub const ERR_OUT_OF_BUDGET:      i32 = -3; // reserved — unused in Phase 2
pub const ERR_GPU_DEVICE_LOST:    i32 = -4;
pub const ERR_LAYOUT_FAILED:      i32 = -5;
pub const ERR_SHADER_COMPILE:     i32 = -6;
pub const ERR_KITTY_TRANSPORT:    i32 = -7;
pub const ERR_INVALID_FONT:       i32 = -8; // reserved — unused in Phase 2 (stubs)
pub const ERR_INVALID_ARG:        i32 = -9; // null pointer, out-of-range index, etc.

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
```

**Usage on every export**:

```rust
#[no_mangle]
pub extern "C" fn vexart_paint_dispatch(
    ctx: u64, target: u64, graph_ptr: *const u8, graph_len: u32, stats_out: *mut FrameStats,
) -> i32 {
    ffi_guard!({
        // … real work …
        OK
    })
}
```

Error codes in table match ARCHITECTURE §10.3 with the addition of `-9 ERR_INVALID_ARG` (needed for null-pointer / cap=0 / handle==0 validation). `-3 ERR_OUT_OF_BUDGET` and `-6 ERR_SHADER_COMPILE` are reserved numeric slots: Phase 2 code does not emit them (no ResourceManager, PipelineCache with cold shaders — shader compile happens at startup and a failure would be a hard crash, not a recoverable error).

---

## 8. Packed ArrayBuffer pattern

Exports with >8 logical fields (paint dispatch, composite merge, per-primitive instance data) use a **caller-owned packed ArrayBuffer** reused frame-to-frame. Zero allocations on the hot path.

### 8.1 Graph buffer header (first 16 bytes of every paint/composite call)

| Offset | Size | Field | Notes |
|---:|---:|---|---|
| 0 | u32 | `magic` | `0x56584152` (`"VXAR"`) — cheap corruption check |
| 4 | u32 | `version` | `0x00020000` — matches `vexart_version()` |
| 8 | u32 | `cmd_count` | Number of commands that follow |
| 12 | u32 | `payload_bytes` | Total bytes of payload after header |

### 8.2 Per-command prefix

| Offset | Size | Field |
|---:|---:|---|
| 0 | u16 | `cmd_kind` (enum: 0=Rect, 1=RectCorners, 2=Circle, 3=Line, 4=Bezier, 5=Polygon, 6=GradientLinear, 7=GradientRadial, 8=GradientConic, 9=Image, 10=Glow, 11=Shadow, 12=BlurSource, 13=Filter, 14=Blend, 15=LayerBegin, 16=LayerEnd) |
| 2 | u16 | `flags` (bit 0 = has transform, bit 1 = has scissor, bit 2 = layer override) |
| 4 | u32 | `payload_bytes` — body length following this 8-byte prefix |

### 8.3 Example: Rect command body

| Offset | Size | Field |
|---:|---:|---|
| 0 | f32×4 | `rect` (x, y, w, h) |
| 16 | f32×4 | `corner_radii` (tl, tr, br, bl) — 0 when uniform |
| 32 | u32 | `color` (RGBA8888) |
| 36 | u32 | `border_color` |
| 40 | f32 | `border_width` |
| 44 | u32 | `scissor_id` (0 = none) |

### 8.4 TS ↔ Rust parity

```ts
// packages/engine/src/ffi/buffer.ts
const GRAPH_BUFFER_BYTES = 64 * 1024; // 64KB — fits showcase frame comfortably; grown on demand
export const graphBuffer = new ArrayBuffer(GRAPH_BUFFER_BYTES);
export const graphView = new DataView(graphBuffer);
export const GRAPH_MAGIC = 0x56584152;
export const GRAPH_VERSION = 0x00020000;
export function writeHeader(cmdCount: number, payloadBytes: number) {
  graphView.setUint32(0,  GRAPH_MAGIC,   true);
  graphView.setUint32(4,  GRAPH_VERSION, true);
  graphView.setUint32(8,  cmdCount,      true);
  graphView.setUint32(12, payloadBytes,  true);
}
```

```rust
// native/libvexart/src/ffi/buffer.rs
pub const GRAPH_MAGIC:   u32 = 0x56584152;
pub const GRAPH_VERSION: u32 = 0x00020000;

#[repr(C)]
pub struct GraphHeader {
    pub magic:         u32,
    pub version:       u32,
    pub cmd_count:     u32,
    pub payload_bytes: u32,
}

pub fn parse_header(bytes: &[u8]) -> Result<GraphHeader, &'static str> {
    if bytes.len() < 16 { return Err("graph buffer too small"); }
    let magic = u32::from_le_bytes(bytes[0..4].try_into().unwrap());
    if magic != GRAPH_MAGIC { return Err("graph magic mismatch"); }
    let version = u32::from_le_bytes(bytes[4..8].try_into().unwrap());
    if version != GRAPH_VERSION { return Err("graph version mismatch"); }
    Ok(GraphHeader {
        magic, version,
        cmd_count:     u32::from_le_bytes(bytes[8..12].try_into().unwrap()),
        payload_bytes: u32::from_le_bytes(bytes[12..16].try_into().unwrap()),
    })
}
```

Both sides use **little-endian** explicitly (all Phase 2 target platforms are LE). **Zero allocations on hot path**: `graphBuffer` is created once at mount, reused every frame; Rust parses in place with `try_into`/`from_le_bytes` — no `Vec`.

---

## 9. Crate pin rationales

| Crate | Version | Features | License | Rationale | Supply-chain risk |
|---|---|---|---|---|---|
| `taffy` | `0.10.1` | default (`std`, `flexbox`, `grid`) | MIT | Latest stable at pin time (crates.io `updated_at` 2026-04-14). Direct Clay replacement per DEC-004. Supports `compute_layout_with_measure` (needed for text measure callback even in Phase 2 — stub returns 0,0). Flexbox + percent + gap + min/max sizing all present. | Popular (maintained by `DioxusLabs`), >1M downloads, pure Rust, no native deps. Low. |
| `wgpu` | `29.0.1` | default (`wgsl`, `metal`, `vulkan`, `gles`) | Apache-2.0 OR MIT | Latest stable (crates.io 2026-03-26). Upgrade from bridge's `26`; API reshaped (PipelineCache, new shader features). `default-features = true` because Metal + Vulkan + GLES back-ends are all required across macOS/Linux targets. | First-party `gfx-rs` crate, powers Firefox, extensively audited. Low. |
| `pollster` | `0.4` | default | Apache-2.0 OR MIT | Minimal sync executor to block on `wgpu` futures inside FFI calls (FFI is synchronous per ARCHITECTURE §9.1). Already used by the old bridge; kept for continuity. | 60 LOC crate, no transitive deps. Negligible. |
| `bytemuck` | `1.25` | `derive` | Apache-2.0 OR MIT OR Zlib | `#[derive(Pod, Zeroable)]` for instance buffers uploaded to WGPU. Already used by the old bridge. | De-facto standard in Rust GPU ecosystem (`wgpu` ecosystem). Low. |
| `nix` | `0.29` | `mman`, `fs` only (`default-features = false`) | MIT | Typed POSIX bindings scoped to `native/libvexart/src/kitty/shm.rs` for `shm_open`/`ftruncate`/`mmap`/`munmap`/`msync`/`shm_unlink`. Alternative: raw `unsafe { libc::shm_open(…) }` blocks — rejected for larger unsafe surface. Scope isolated to ~80 LOC. | Widely used (`>300M downloads`), maintained by `nix-rust` org. Feature-gated to only mman + fs — keeps compile units small. Low. |

**Deferred to Phase 2b (NOT added to Phase 2 Cargo.toml per REQ-NB-009)**:

| Crate | Version | When added | Rationale |
|---|---|---|---|
| `base64` | `0.22.1` | Phase 2b Tier 1 | Kitty encoding native port (DEC-010). Not consumed in Phase 2. |
| `flate2` | `1.1.9` | Phase 2b Tier 1 | Kitty o=z zlib compression (DEC-010). Not consumed in Phase 2. |
| `fdsm` | `0.8.0` | Phase 2b | MSDF atlas (DEC-008 / DEC-011). Not consumed in Phase 2 stubs. |

---

## 10. Clay → Taffy semantic migration map

**Highest-risk area.** Phase 2 visual parity on non-text regions depends on these mappings being correct.

| Clay concept | Taffy equivalent | Semantic difference | Impact on TGEProps | Risk |
|---|---|---|---|---|
| `width: "grow"` / `height: "grow"` | `size.width = Dimension::Auto` + `flex_grow = 1.0` | Taffy uses explicit flex_grow factor; Clay implies `grow → flex:1`. | No user-visible change; internal translation in `layout/tree.rs`. | Low |
| `width: "fit"` / `height: "fit"` | `size.width = Dimension::Auto` + no `flex_grow` | Identical behavior. | No change. | Low |
| `width: 200` (fixed) | `size.width = Dimension::Length(200.0)` | Identical. | No change. | Low |
| `width: "100%"` / `"50%"` | `size.width = Dimension::Percent(1.0)` / `Percent(0.5)` | **Potential drift**: Clay percent = parent content-box; Taffy percent = containing block (same thing for flex children in flexbox). Equivalent for Vexart's layout model. | No change. | **Medium — verify on showcase** |
| `alignX: "space-between"` | `justify_content = JustifyContent::SpaceBetween` | Clay needed our custom fork patch; Taffy has it natively. **This is a WIN** — eliminates the Clay fork. | No change. | Low |
| `alignY: "space-between"` (row flex) | `align_content = AlignContent::SpaceBetween` | Taffy native. | No change. | Low |
| `alignX: "center"` | `justify_content = JustifyContent::Center` | Identical. | No change. | Low |
| `alignY: "center"` | `align_items = AlignItems::Center` | Identical. | No change. | Low |
| `padding: {x,y,l,r,t,b}` | `padding = Rect<LengthPercentage>{...}` | Identical semantics. | No change. | Low |
| `gap: n` | `gap = Size<LengthPercentage>{width: n, height: n}` | Taffy has **separate row/column gap**; Clay has one `gap`. Design picks `gap → both axes equal` for parity. | No change. | Low |
| `borderWidth` affecting layout | Taffy `border = Rect<LengthPercentage>` | Both reserve border space in layout box. | No change. | Low |
| `minWidth` / `maxWidth` | `min_size.width` / `max_size.width` | Identical. | No change. | Low |
| `flexGrow: n` | `flex_grow = n as f32` | Identical. | No change. | Low |
| `flexShrink: n` | `flex_shrink = n as f32` | Identical. | No change. | Low |
| `direction: "row" \| "column"` | `flex_direction = FlexDirection::Row \| Column` | Identical; Vexart default `"column"` = `Column`. | No change. | Low |
| Clay text measure callback (`measureText(id, config) -> (w,h)`) | `taffy.compute_layout_with_measure(known_size, available_space, node_context) -> Size<f32>` | **Different callback signature**. In Phase 2, text measure callback always returns `(0, 0)` per DEC-011 — this is fine for stubbing but means text nodes contribute zero to sibling sizing. **Verify**: text-adjacent layouts may collapse visibly. | Text nodes occupy zero layout space in Phase 2 (expected per DEC-011); non-text regions must not depend on text size to anchor. | **Medium — DEC-011 visual expectation** |
| Clay ID (stable hash from `"name"` + parent) | Taffy `NodeId` (u64 opaque) | Taffy NodeIds are assigned by Taffy internally per-frame unless we explicitly reuse. Layer assignment needs stable IDs. | Phase 2 keeps Vexart's existing stable-ID hashing at the TS reconciler level (node.ts already hashes). We map Vexart stable IDs → Taffy NodeIds via a HashMap kept across frames in `layout/tree.rs`. | **Medium** |
| Clay layout cache (per-frame recompute) | Taffy has internal cache; `taffy.mark_dirty(node)` | Taffy caches layout per node; must explicitly mark dirty on style change. | `vexart_layout_compute` sees a full flat command buffer each frame — safest approach is to `taffy.set_style(node, new_style)` which auto-dirties. Performance-neutral for Phase 2 (optimize in Phase 3). | Low |
| Clay `scroll={x, y}` viewport clipping | Taffy has no built-in scissor; Vexart already owns scissor in paint layer | No change: paint side handles scissor. Taffy just reports full layout bounds. | No change. | Low |
| Clay `floating` (attach to parent/root with offset) | Taffy has `Position::Absolute` + `inset` | Clay's 9-point attach grid doesn't exist in Taffy — we keep the attach math in TS (`reconciler/props.ts` already normalizes), then feed Taffy `Position::Absolute` with computed `inset.top/left`. | No change at user level; internal translation in `walk-tree.ts`. | Medium |
| Clay `direction: "row-reverse"` etc. | `FlexDirection::RowReverse` / `ColumnReverse` | Identical. | No change. | Low |
| Clay `borderBetweenChildren` | **Not native in Taffy** — implemented manually | Taffy has no "border between children" concept. Vexart's current implementation inserts synthetic sibling nodes in walk-tree; preserve that approach. | No change at user level. | Medium |

**Visual parity risks flagged for §15 showcase verification**: percent sizing in nested flex, gap axis, floating offsets, borderBetweenChildren, space-between in both axes. All tested implicitly by showcase.

---

## 11. TS consumer migration

**Pre-deletion grep gate** — every file below must pass its grep check before the task marking its deletion can be `[x]`'d:

| File | Action | Grep gate | New behavior / target |
|---|---|---|---|
| `packages/engine/src/loop/index.ts` | MODIFY | n/a | Replace `clay.*` calls with `vexart_context_*` + `vexart_layout_*` via new `engine/src/ffi/*.ts`. |
| `packages/engine/src/loop/loop.ts` | MODIFY | n/a | Same — rewire paint/composite/output dispatches to `vexart_paint_*`, `vexart_composite_*`. |
| `packages/engine/src/loop/clay-layout.ts` | **DELETE** | `rg "clay-layout" packages/` must show 0 non-self hits | Replaced by Taffy path inside `libvexart`; no TS bridge needed. |
| `packages/engine/src/loop/scroll.ts` | MODIFY | `rg "import.*clay" packages/engine/src/loop/scroll.ts` must return 0 after edit | Consume Taffy output shape; scissor logic unchanged. |
| `packages/engine/src/reconciler/node.ts` | MODIFY | n/a | Keep stable ID hashing; emit commands in new flat buffer shape (§8). |
| `packages/engine/src/reconciler/node.test.ts` | MODIFY | n/a | Migrate any Clay output assertion to Taffy output shape. |
| `packages/engine/src/ffi/clay.ts` | **DELETE** | `rg "from.*['\"].*/ffi/clay['\"]" packages/` must return 0 | Clay FFI gone. |
| `packages/engine/src/ffi/gpu-stub.ts` | **DELETE** (REQ-NB-002) | `rg "gpu-stub" packages/` must return 0 | Redundant after libvexart consolidation. |
| `packages/engine/src/ffi/node.ts` | MODIFY | n/a | Convert to `vexart_*` shape. |
| `packages/engine/src/ffi/index.ts` | MODIFY | n/a | Re-export new `vexart_*` bindings. |
| `packages/engine/src/ffi/canvas.ts` | MODIFY | n/a | Rewire from `tge_wgpu_canvas_*` calls to `vexart_paint_*` + `vexart_composite_*`. |
| `packages/engine/src/ffi/pixel-buffer.ts` | MODIFY or DELETE | Check if Clay-specific (inspect in tasks) | Likely DELETE: was Zig/Clay intermediate. |
| `packages/engine/src/ffi/renderer-backend.ts` | MODIFY | n/a | Single native backend (no more TS-side GPU/CPU switch). |
| `packages/engine/src/ffi/render-graph.ts` | MODIFY or DELETE | Inspect | If it was the Clay↔paint bridge → DELETE; if it's the new graph builder → KEEP + adapt to §8 format. |
| `packages/engine/src/ffi/layout-writeback.ts` | MODIFY | n/a | Rewire to `vexart_layout_writeback`. |
| `packages/engine/src/ffi/composite.ts` | MODIFY | n/a | Rewire to `vexart_composite_merge`. |
| `packages/engine/src/ffi/buffer.ts` | MODIFY | n/a | Add graph buffer header + GRAPH_MAGIC/GRAPH_VERSION constants per §8. |
| `packages/engine/src/ffi/ffi.ts` | MODIFY | n/a | bun:ffi loader — load `libvexart.dylib` from `native/${platform}/libvexart.{dylib,so}`. |
| `packages/engine/src/paint-legacy/` (whole dir) | **DELETE** | `rg "paint-legacy" packages/` must return 0 | REQ-NB-002. |
| `packages/engine/src/output/kitty.ts` | **UNCHANGED** (REQ-NB-007) | n/a | Base64 + deflateSync stays in TS. |
| `packages/engine/src/output/kitty-shm-native.ts` | MODIFY | n/a | Rewire bun:ffi loader from `libkitty-shm-helper` → `libvexart`'s `vexart_kitty_shm_*` exports. Signature-compatible. |
| `packages/engine/src/output/kitty-stub.ts` | INSPECT | If it's a Kitty transport stub for unsupported platforms → KEEP; if legacy placeholder → DELETE | Case-by-case in tasks. |
| `packages/engine/src/output/transport-manager.ts` | MODIFY | n/a | Remove placeholder/halfblock branches (DEC-005 / REQ-NB-002). |
| `packages/engine/src/output/layer-composer.ts` | MODIFY | n/a | Remove CPU/GPU switch; single native path. |
| `packages/engine/src/public.ts` | MODIFY | n/a | Remove any re-exports of deleted modules; keep public surface stable (no API breaks for user code — Phase 4 locks API). |
| **No such file** `output/placeholder.ts` or `output/halfblock.ts` | — | `rg "halfblock\|placeholder" packages/engine/src/output/` must return 0 | Already absent; if present in a future audit → DELETE. |
| `native/wgpu-canvas-bridge/` | **DELETE whole crate** | `rg "wgpu-canvas-bridge" packages/ native/libvexart/ Cargo.toml` must return 0 | Absorbed into libvexart. |
| `native/kitty-shm-helper/` | **DELETE whole crate** | `rg "kitty-shm-helper" packages/ native/libvexart/ Cargo.toml` must return 0 | Ported to `libvexart/src/kitty/shm.rs`. |
| `zig/` (whole dir) | **DELETE** (REQ-NB-002) | `rg "@tge/pixel\|tge_[a-z]" packages/ native/libvexart/` must return 0 | REQ-NB-002 / DEC-004. |
| `vendor/clay/`, `vendor/clay*` | **DELETE** (REQ-NB-002) | `rg "clay.h\|vendor/clay" packages/ native/libvexart/` must return 0 | REQ-NB-002 / DEC-004. |

**Grep verification commands (to run before every deletion task is marked done)**:

```bash
# After deleting zig/
rg '@tge/pixel|tge_[a-z_]+' packages/ native/libvexart/ --type ts --type rust
# After deleting vendor/clay*
rg 'clay\.h|vendor/clay|clay_[a-z_]+' packages/ native/libvexart/ --type ts --type rust
# After deleting paint-legacy/
rg 'paint-legacy|@vexart/pixel' packages/ --type ts
# After deleting gpu-stub.ts
rg 'gpu-stub' packages/ --type ts
# After deleting clay-layout.ts
rg 'clay-layout' packages/ --type ts
# After deleting placeholder + halfblock (if present)
rg 'placeholder-backend|halfblock' packages/ --type ts
```

Each grep MUST return zero hits. REQ-NB-011 compliance depends on it.

---

## 12. Atomic commit strategy for FFI contract

**Problem**: TS and Rust live in the same repo but are compiled separately. A commit that renames a Rust export without updating the TS consumer produces a load-time `SymbolNotFound`; a commit that updates TS without Rust produces a typecheck green / runtime red. SDD apply MUST prevent this.

**Rules**:

1. **One FFI signature = one commit**. Every `vexart_*` export change touches exactly these files in a single commit:
   - `native/libvexart/src/lib.rs` (export definition)
   - `native/libvexart/src/{module}/*.rs` (implementation)
   - `packages/engine/src/ffi/functions.ts` (TS signature)
   - At least one consumer file in `packages/engine/src/loop/` or `output/` (wire-up)
   - Any affected test file
2. **Version handshake**. `vexart_version()` returns the constant `EXPECTED_BRIDGE_VERSION = 0x00020000` (Phase 2.0 = major 2, minor 0). TS mount path checks:
   ```ts
   const expected = 0x00020000;
   const actual = vexart_version();
   if (actual !== expected) {
     throw new VexartNativeError(-1, `bridge version mismatch: expected ${expected.toString(16)}, got ${actual.toString(16)}`);
   }
   ```
   Bumped to `0x00020001` when Phase 2b adds a non-breaking export; bumped to `0x00030000` on breaking change (Phase 3+).
3. **Build order**. Root scripts enforce Rust-first ordering:
   ```json
   "scripts": {
     "native:build":    "cargo build --release --locked",
     "typecheck":       "tsc --noEmit",
     "check":           "bun run native:build && bun run typecheck && bun test"
   }
   ```
   CI runs `bun run check` as a single command — Rust must compile before TS typecheck sees the new `.dylib`.
4. **Conventional commits** (per `openspec/config.yaml` rules.apply):
   ```
   feat(ffi): add vexart_paint_dispatch + wire TS loop paint phase
   refactor(ffi): rename vexart_paint_upload_image signature to add format param
   chore(native): delete zig/ — superseded by libvexart paint module
   ```

---

## 13. Test strategy for Phase 2

Phase 2 is NOT the golden image phase (Phase 4). Tests here protect the FFI contract and legacy deletion.

### 13.1 Rust unit tests (new, inside `native/libvexart/src/**/tests` via `#[cfg(test)]`)

| Module | Covered behavior |
|---|---|
| `ffi::buffer` | `parse_header` rejects bad magic / version / short buffers. |
| `ffi::error` | `set_last_error` / `vexart_get_last_error_length` / `vexart_copy_last_error` roundtrip (ASCII + UTF-8 + empty + oversized). |
| `ffi::panic` | `ffi_guard!` catches `panic!("x")`, returns `ERR_PANIC`, sets last_error with message. |
| `layout::tree` | Taffy tree build from a 3-node command buffer produces expected positions (compare against Taffy reference). |
| `layout::writeback` | Layout output writes N×PositionedCommand to buffer; respects `out_cap`. |
| `paint::instances` | `#[derive(Pod, Zeroable)]` round-trips through `bytemuck::cast_slice`. |
| `kitty::shm` | `shm_open`+`mmap`+`shm_unlink` roundtrip on tmp name; mismatched size returns ERR_KITTY_TRANSPORT. |
| `text` stubs | `dispatch` returns OK; measure writes 0.0, 0.0; first call emits stderr, second is silent (capture stderr in test). |

### 13.2 Rust integration test (`tests/integration/roundtrip.rs`)

End-to-end: create context → compute a trivial layout → paint a single rect → composite → readback pixels → assert center pixel color. **Gated behind `#[cfg(feature = "gpu-tests")]`** per founder resolution of §16 Q4. Default `cargo test` runs unit tests only (no GPU required). Integration test is run manually on dev Mac with `cargo test --features gpu-tests`. No SwiftShader dependency; CI (Phase 4/5) will run unit + TS smoke, visual parity goes via Phase 4 golden images.

### 13.3 TS unit tests

| File | Test |
|---|---|
| `packages/engine/src/ffi/buffer.test.ts` | Pack/unpack symmetry: encode N rect commands, decode via a mock Rust-shape reader, assert round-trip. |
| `packages/engine/src/ffi/bridge.test.ts` (new) | FFI loader smoke: `vexart_version()` returns `0x00020000`; mismatched version throws. |
| Existing tests in `engine/src/loop/*.test.ts`, `reconciler/*.test.ts` | Migrate: any test referencing `clay.*` is either REWRITE (to new FFI) or DELETE (if it tested Clay internals). |

### 13.4 Smoke tests (manual, tracked in tasks.md exit gate)

- `bun --conditions=browser run examples/hello.tsx` starts + renders a single box, no crash.
- `bun --conditions=browser run examples/showcase.tsx` starts, cycles tabs, no crash; text regions blank per DEC-011.

### 13.5 DEC-011 behavior test

`packages/engine/src/output/text-warning.test.ts` (new): mount engine, render a `<text>` element twice (two frames), capture stderr, assert exactly one line matches `/\[vexart\].*Phase 2.*DEC-011/`.

### 13.6 Expected existing test casualties

| Test file | Expected outcome | Resolution |
|---|---|---|
| `packages/engine/src/reconciler/node.test.ts` (Clay refs) | FAIL on Clay-shape assertions | REWRITE to assert against new flat command buffer shape. |
| `packages/engine/src/ffi/buffer.test.ts` | May FAIL if it tested old `tge_wgpu_canvas_*` shape | REWRITE for new GRAPH header + per-cmd prefix. |
| `packages/engine/src/ffi/composite.test.ts` | Likely FAIL | REWRITE for `vexart_composite_merge` packed-buffer input. |
| Any test touching `paint-legacy/**` | FAIL (module deleted) | DELETE — paint-legacy is gone per REQ-NB-002. |
| Any test touching placeholder/halfblock backends | FAIL if present | DELETE — backends gone per DEC-005 / REQ-NB-002. |
| Tests importing `@tge/pixel` or `clay.*` | FAIL | DELETE (tested deleted code) or REWRITE (same intent, new FFI). |

Specific list lives in tasks.md once we `rg` through the test suite.

---

## 14. Rollback plan (concrete)

**Before apply starts (first task)**:

```bash
git tag -a pre-phase-2 -m "Phase 2 baseline — pre-consolidation"
git push origin pre-phase-2   # optional; repo is closed-source, local tag is sufficient
```

**Safe slices** (independently revertable with normal `git revert <sha>`):
1. Scaffold `native/libvexart/` crate with stub exports (no deletion yet).
2. Wire TS `ffi/bridge.ts` loader to `libvexart` (old bridges still loaded side-by-side briefly — temporary).
3. Port WGPU pipelines into `libvexart/src/paint/`.
4. Integrate Taffy in `libvexart/src/layout/`.
5. Port kitty-shm-helper → `libvexart/src/kitty/shm.rs`.
6. Switch TS consumers to `vexart_*` calls (still coexisting with Clay path behind a feature flag — *internal flag only, not a public toggle; removed at end of Phase 2*).

**Point of no return** (single task labeled **irreversible** in tasks.md):
7. Delete `zig/`, `vendor/clay*`, `native/wgpu-canvas-bridge/`, `native/kitty-shm-helper/`, `packages/engine/src/paint-legacy/`, `packages/engine/src/loop/clay-layout.ts`, `packages/engine/src/ffi/gpu-stub.ts`, `packages/engine/src/ffi/clay.ts`, placeholder + halfblock outputs.

**Rollback after point of no return**:
```bash
git reset --hard pre-phase-2
git clean -fd
```
Re-apply in smaller slices after spec/design/tasks update to reflect discovered failure mode.

---

## 15. Expected showcase visual diff (DEC-011 scope)

`examples/showcase.tsx` has 7 tabs (per AGENTS.md). Per-region expectation table:

| Region | Kind | Expected status | Risk notes |
|---|---|---|---|
| Tab header bar | text + box | **BLANK_TEXT** (labels) + box shapes match | Box positions must match Clay baseline. |
| Primitives tab — rects / rounded / per-corner | box shapes | **OK** | Taffy layout + Zig→Rust SDF ports; primary visual parity check. |
| Primitives tab — labels | text | **BLANK_TEXT** | Expected. |
| Effects tab — drop shadow (single + multi) | shadows | **POTENTIAL_DRIFT** | Blur radius algorithm port: Zig 3-pass box ≈ Gaussian → new Rust shader. Verify. |
| Effects tab — outer glow | halo | **POTENTIAL_DRIFT** | Zig `tge_halo` plateau+falloff → new shader. Verify. |
| Effects tab — gradients (linear, radial, multi-stop, conic) | paint | **POTENTIAL_DRIFT** | Color-space interpolation: Zig did sRGB linear blend. Port MUST match. |
| Effects tab — backdrop blur + filters | backdrop | **POTENTIAL_DRIFT** | Filter chain ordering; Zig did brightness→contrast→saturate. Match exactly. |
| Interactive tab — buttons, switches, sliders | box + text | **OK boxes, BLANK_TEXT labels** | Hit-testing unchanged. |
| Scroll tab — virtualized list | scroll scissor + rects | **OK** | Scissor clipping in paint pipeline. |
| Any tab with `<text>` label | text | **BLANK_TEXT** | Expected per DEC-011. |

**Regions flagged POTENTIAL_DRIFT = highest scrutiny in verify phase.** Design recommends a hand diff of these regions at Phase 2 exit, not just showcase-starts-without-crash.

---

## 16. Open design questions — all RESOLVED (2026-04-17, founder)

1. ~~**`rust-toolchain.toml` target list — strict vs. lazy**.~~ **RESOLVED: host-only (`aarch64-apple-darwin`)**. Pragmatic interpretation — avoids ~200MB of pre-downloaded std libraries that won't be used until CI setup (Phase 4/5). Spec target list is declared cross-compile coverage, not dev-local installation mandate. Expanded in future CI phase with a one-line change. See §3.

2. ~~**`packages/engine/src/ffi/pixel-buffer.ts` — keep or delete?**~~ **RESOLVED: DELETE**. Founder-confirmed: this file belongs to the legacy pixelbuffer model; current paint path uses `pixelraw`. File added to REQ-NB-002 deletion inventory at tasks phase. Any callers (if any) are deleted-code callers and go with their importers.

3. ~~**`packages/engine/src/ffi/render-graph.ts` — modify or delete?**~~ **RESOLVED: MODIFY (keep, adapt)**. Inspection shows `render-graph.ts` (556 LOC) exports the render-op schema contract consumed by `loop/loop.ts`, `ffi/gpu-renderer-backend.ts`, `ffi/renderer-backend.ts`, `ffi/index.ts`. The types (`ShadowDef`, `EffectConfig`, `BackdropFilterParams`, `RenderGraphFrame`, `RectangleRenderOp`, `TextRenderOp`, `ImageRenderOp`, `EffectRenderOp`, `BorderRenderOp`, `BACKDROP_FILTER_KIND`) are the reconciler↔paint-backend contract and survive Phase 2. Action: remove `import … from "./clay"` (clay types vanish with Clay), keep every exported type, adapt serialization into the §8 packed-graph-buffer format consumed by `vexart_paint_dispatch`.

4. ~~**Software-fallback GPU for Rust integration test (§13.2)**.~~ **RESOLVED: feature flag `#[cfg(feature = "gpu-tests")]`**. Integration tests that require real WGPU run via `cargo test --features gpu-tests` on dev machines only. Default `cargo test` runs logic-only unit tests. CI (when it lands in Phase 4/5) runs unit tests + TS smoke; visual parity is enforced via golden images in Phase 4, not via unit GPU tests. No SwiftShader dependency.

5. **No proposal/spec contradictions found.** All master-doc citations check out; all REQ-NB-001..011 are addressable with the design above.

**Design is closed. No remaining blockers for tasks phase.**

---

**End of design.**
