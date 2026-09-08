// native/libvexart/src/kitty/mod.rs
// Kitty graphics protocol — POSIX SHM + direct + file transport.
// Phase 2b Slice 3: encoder, writer, transport modules added.

mod diacritics;
pub mod encoder;
pub mod placeholder;
pub mod shm;
pub mod transport;
pub mod writer;
