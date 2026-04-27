// native/libvexart/src/font/mod.rs
// Font system — system font discovery, MSDF atlas generation, glyph fallback,
// text layout (line wrapping), and disk cache.
// Per PRD Phase 2b / DEC-008: browser-like font resolution from system fonts.

pub mod cache;
pub mod layout;
pub mod msdf_atlas;
pub mod system;
