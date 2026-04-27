// native/libvexart/src/font/cache.rs
// Disk cache for generated MSDF atlas pages.
//
// Cache location: ~/.cache/vexart/msdf/
// File format: {font_hash}_{page_idx}.bin — raw RGBA8 pixel data (4MB per page).
// Metadata: {font_hash}_{page_idx}.meta — JSON with glyph entries.
//
// On startup, if a cache file exists for the requested font+glyphs, we load
// it instead of regenerating MSDF. On new glyphs, we append to the atlas
// and overwrite the cache file.

use std::collections::HashMap;
use std::fs;
use std::io::{Read, Write};
use std::path::PathBuf;

/// Get the cache directory path, creating it if needed.
pub fn cache_dir() -> Option<PathBuf> {
    let home = dirs_fallback()?;
    let dir = home.join(".cache").join("vexart").join("msdf");
    fs::create_dir_all(&dir).ok()?;
    Some(dir)
}

/// Platform-aware home directory fallback (no external deps).
fn dirs_fallback() -> Option<PathBuf> {
    // Try $HOME first (works on macOS, Linux, most shells).
    if let Ok(home) = std::env::var("HOME") {
        return Some(PathBuf::from(home));
    }
    // Windows fallback.
    if let Ok(profile) = std::env::var("USERPROFILE") {
        return Some(PathBuf::from(profile));
    }
    None
}

/// Key for a cached atlas page.
#[derive(Debug, Clone)]
pub struct CacheKey {
    /// Hash identifying the font (derived from font file path or family name).
    pub font_hash: u64,
    /// Atlas page index.
    pub page_idx: u32,
}

impl CacheKey {
    fn file_stem(&self) -> String {
        format!("{:016x}_{}", self.font_hash, self.page_idx)
    }

    fn rgba_path(&self, dir: &PathBuf) -> PathBuf {
        dir.join(format!("{}.bin", self.file_stem()))
    }

    fn meta_path(&self, dir: &PathBuf) -> PathBuf {
        dir.join(format!("{}.meta", self.file_stem()))
    }
}

/// Metadata for cached glyph entries.
#[derive(Debug, Clone)]
pub struct CachedGlyphMeta {
    pub codepoint: u32,
    pub col: u32,
    pub row: u32,
    pub advance: f32,
    pub bearing_x: f32,
    pub bearing_y: f32,
    pub bbox_w: f32,
    pub bbox_h: f32,
}

/// Metadata for a cached atlas page.
#[derive(Debug, Clone)]
pub struct CachedPageMeta {
    pub glyph_count: u32,
    pub page_size: u32,
    pub glyphs: Vec<CachedGlyphMeta>,
}

/// Save an atlas page's RGBA data and glyph metadata to disk cache.
pub fn save_page(key: &CacheKey, rgba: &[u8], meta: &CachedPageMeta) -> bool {
    let dir = match cache_dir() {
        Some(d) => d,
        None => return false,
    };

    // Write RGBA data.
    let rgba_path = key.rgba_path(&dir);
    if let Ok(mut f) = fs::File::create(&rgba_path) {
        if f.write_all(rgba).is_err() {
            let _ = fs::remove_file(&rgba_path);
            return false;
        }
    } else {
        return false;
    }

    // Write metadata as simple binary format:
    // u32 glyph_count, u32 page_size, then per-glyph: u32 cp, u32 col, u32 row, f32×5
    let meta_path = key.meta_path(&dir);
    let mut buf = Vec::with_capacity(8 + meta.glyphs.len() * 32);
    buf.extend_from_slice(&meta.glyph_count.to_le_bytes());
    buf.extend_from_slice(&meta.page_size.to_le_bytes());
    for g in &meta.glyphs {
        buf.extend_from_slice(&g.codepoint.to_le_bytes());
        buf.extend_from_slice(&g.col.to_le_bytes());
        buf.extend_from_slice(&g.row.to_le_bytes());
        buf.extend_from_slice(&g.advance.to_le_bytes());
        buf.extend_from_slice(&g.bearing_x.to_le_bytes());
        buf.extend_from_slice(&g.bearing_y.to_le_bytes());
        buf.extend_from_slice(&g.bbox_w.to_le_bytes());
        buf.extend_from_slice(&g.bbox_h.to_le_bytes());
    }
    if let Ok(mut f) = fs::File::create(&meta_path) {
        if f.write_all(&buf).is_err() {
            let _ = fs::remove_file(&meta_path);
            return false;
        }
    } else {
        return false;
    }

    true
}

/// Load a cached atlas page's RGBA data and glyph metadata from disk.
/// Returns None if cache miss or corrupted.
pub fn load_page(key: &CacheKey) -> Option<(Vec<u8>, CachedPageMeta)> {
    let dir = cache_dir()?;
    let rgba_path = key.rgba_path(&dir);
    let meta_path = key.meta_path(&dir);

    // Read RGBA.
    let mut rgba = Vec::new();
    fs::File::open(&rgba_path).ok()?.read_to_end(&mut rgba).ok()?;

    // Read metadata.
    let mut meta_buf = Vec::new();
    fs::File::open(&meta_path).ok()?.read_to_end(&mut meta_buf).ok()?;

    if meta_buf.len() < 8 {
        return None;
    }

    let glyph_count = u32::from_le_bytes([meta_buf[0], meta_buf[1], meta_buf[2], meta_buf[3]]);
    let page_size = u32::from_le_bytes([meta_buf[4], meta_buf[5], meta_buf[6], meta_buf[7]]);

    let expected_meta_size = 8 + glyph_count as usize * 32;
    if meta_buf.len() < expected_meta_size {
        return None;
    }

    let expected_rgba_size = (page_size * page_size * 4) as usize;
    if rgba.len() != expected_rgba_size {
        return None;
    }

    let mut glyphs = Vec::with_capacity(glyph_count as usize);
    for i in 0..glyph_count as usize {
        let off = 8 + i * 32;
        let b = &meta_buf[off..off + 32];
        glyphs.push(CachedGlyphMeta {
            codepoint: u32::from_le_bytes([b[0], b[1], b[2], b[3]]),
            col: u32::from_le_bytes([b[4], b[5], b[6], b[7]]),
            row: u32::from_le_bytes([b[8], b[9], b[10], b[11]]),
            advance: f32::from_le_bytes([b[12], b[13], b[14], b[15]]),
            bearing_x: f32::from_le_bytes([b[16], b[17], b[18], b[19]]),
            bearing_y: f32::from_le_bytes([b[20], b[21], b[22], b[23]]),
            bbox_w: f32::from_le_bytes([b[24], b[25], b[26], b[27]]),
            bbox_h: f32::from_le_bytes([b[28], b[29], b[30], b[31]]),
        });
    }

    Some((
        rgba,
        CachedPageMeta {
            glyph_count,
            page_size,
            glyphs,
        },
    ))
}

/// Clear all cached atlas files.
pub fn clear_cache() -> bool {
    let dir = match cache_dir() {
        Some(d) => d,
        None => return false,
    };
    if let Ok(entries) = fs::read_dir(&dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().map_or(false, |e| e == "bin" || e == "meta") {
                let _ = fs::remove_file(&path);
            }
        }
    }
    true
}

/// Compute a stable hash for a font face (based on family name + weight + style).
/// This is NOT cryptographic — just a stable cache key.
pub fn font_cache_hash(family: &str, weight: u16, italic: bool) -> u64 {
    let mut hash: u64 = 0xcbf29ce484222325; // FNV-1a offset basis
    for byte in family.bytes() {
        hash ^= byte as u64;
        hash = hash.wrapping_mul(0x100000001b3); // FNV-1a prime
    }
    hash ^= weight as u64;
    hash = hash.wrapping_mul(0x100000001b3);
    if italic { hash ^= 1; }
    hash
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cache_dir_exists() {
        let dir = cache_dir();
        assert!(dir.is_some(), "should be able to create cache dir");
        assert!(dir.unwrap().exists());
    }

    #[test]
    fn test_font_cache_hash_deterministic() {
        let h1 = font_cache_hash("SF Pro", 400, false);
        let h2 = font_cache_hash("SF Pro", 400, false);
        assert_eq!(h1, h2);
    }

    #[test]
    fn test_font_cache_hash_different_for_different_fonts() {
        let h1 = font_cache_hash("SF Pro", 400, false);
        let h2 = font_cache_hash("SF Mono", 400, false);
        assert_ne!(h1, h2);
    }

    #[test]
    fn test_save_and_load_page() {
        let key = CacheKey { font_hash: 0xDEADBEEF, page_idx: 99 };

        // Create minimal test data (4×4 page = 64 bytes RGBA).
        let rgba = vec![128u8; 4 * 4 * 4]; // 4×4 RGBA
        let meta = CachedPageMeta {
            glyph_count: 1,
            page_size: 4,
            glyphs: vec![CachedGlyphMeta {
                codepoint: 65,
                col: 0,
                row: 0,
                advance: 600.0,
                bearing_x: 50.0,
                bearing_y: 700.0,
                bbox_w: 500.0,
                bbox_h: 700.0,
            }],
        };

        assert!(save_page(&key, &rgba, &meta));

        let loaded = load_page(&key);
        assert!(loaded.is_some());
        let (loaded_rgba, loaded_meta) = loaded.unwrap();
        assert_eq!(loaded_rgba.len(), rgba.len());
        assert_eq!(loaded_meta.glyph_count, 1);
        assert_eq!(loaded_meta.page_size, 4);
        assert_eq!(loaded_meta.glyphs[0].codepoint, 65);
        assert!((loaded_meta.glyphs[0].advance - 600.0).abs() < 0.01);

        // Clean up test file.
        let dir = cache_dir().unwrap();
        let _ = fs::remove_file(key.rgba_path(&dir));
        let _ = fs::remove_file(key.meta_path(&dir));
    }

    #[test]
    fn test_load_nonexistent_returns_none() {
        let key = CacheKey { font_hash: 0xFFFFFFFF_FFFFFFFF, page_idx: 999 };
        assert!(load_page(&key).is_none());
    }
}
