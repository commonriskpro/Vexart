// native/libvexart/src/paint/pipeline_cache.rs
// PipelineCacheManager: load/save WGPU pipeline cache to ~/.cache/vexart/pipeline.{platform}-{version}.bin
// Per design §6 (Step 6.1), REQ-2B-601/602/603/604.
//
// Strategy:
//   - Use wgpu::PipelineCache (available in wgpu 29).
//   - On Metal/non-Vulkan backends, get_data() may return None — we handle that gracefully.
//   - Cache file name encodes platform + version for automatic invalidation (REQ-2B-602).
//   - Corrupted cache (wrong magic/size) is detected, deleted, and restarted (REQ-2B-604).
//   - If cache dir is not writable, fall back to in-memory only (REQ-2B-603).

// TODO: Add SHA-256/Blake3 hash verification to the pipeline cache header
// to prevent loading corrupted or tampered cache files.

use std::path::PathBuf;

/// Magic bytes at the start of every vexart pipeline cache file.
/// "VXPC" in ASCII — Vexart Pipeline Cache.
const CACHE_MAGIC: [u8; 4] = *b"VXPC";

/// Current cache file format version. Bump when the on-disk layout changes.
const CACHE_FORMAT_VERSION: u16 = 1;

/// The platform identifier embedded in the cache file name.
fn platform_tag() -> &'static str {
    if cfg!(target_os = "macos") {
        if cfg!(target_arch = "aarch64") {
            "aarch64-darwin"
        } else {
            "x86_64-darwin"
        }
    } else if cfg!(target_os = "linux") {
        if cfg!(target_arch = "aarch64") {
            "aarch64-linux"
        } else {
            "x86_64-linux"
        }
    } else {
        "unknown"
    }
}

/// The Vexart version string embedded in the cache file name.
/// Derived from Cargo.toml package version at compile time.
fn version_tag() -> &'static str {
    env!("CARGO_PKG_VERSION")
}

/// Returns the expected path for the pipeline cache file.
/// Format: `~/.cache/vexart/pipeline.{platform}-{version}.bin`
fn cache_path() -> Option<PathBuf> {
    let home = std::env::var("HOME").ok()?;
    let mut p = PathBuf::from(home);
    p.push(".cache");
    p.push("vexart");
    p.push(format!("pipeline.{}-{}.bin", platform_tag(), version_tag()));
    Some(p)
}

/// Manages the on-disk pipeline cache blob for fast startup.
///
/// On construction, attempts to load cached data from disk.
/// After pipeline compilation, call `save(cache)` to persist.
pub struct PipelineCacheManager {
    /// Pre-loaded raw bytes from disk, or None if no valid cache was found.
    cached_data: Option<Vec<u8>>,
    /// Path to the cache file (if it could be resolved).
    path: Option<PathBuf>,
}

impl PipelineCacheManager {
    /// Create a manager, attempting to load existing cache data from disk.
    ///
    /// - If no cache file exists, `cached_data` is `None` (cold start).
    /// - If cache file is corrupted, it is deleted and `cached_data` is `None` (REQ-2B-604).
    /// - If the cache dir is missing, it will be created on the first `save()` call.
    pub fn new() -> Self {
        let path = cache_path();
        let cached_data = path.as_ref().and_then(|p| Self::load_from_disk(p));
        Self { cached_data, path }
    }

    /// Returns the pre-loaded cache bytes if available, suitable for passing to
    /// `PipelineCacheDescriptor::data`.
    pub fn data(&self) -> Option<&[u8]> {
        self.cached_data.as_deref()
    }

    /// Save pipeline cache data to disk.
    ///
    /// Writes atomically (temp file → rename). If the directory does not exist,
    /// attempts to create it. Falls back silently if any I/O error occurs.
    pub fn save(&self, data: &[u8]) {
        let path = match &self.path {
            Some(p) => p,
            None => return, // no path resolved — skip
        };

        // Ensure the directory exists (REQ-2B-603).
        if let Some(parent) = path.parent() {
            if !parent.exists() {
                if let Err(e) = std::fs::create_dir_all(parent) {
                    eprintln!(
                        "vexart: pipeline cache: failed to create dir {}: {e}",
                        parent.display()
                    );
                    return;
                }
            }
        }

        // Build the file payload: magic + format_version + payload_len + data
        let mut payload = Vec::with_capacity(4 + 2 + 4 + data.len());
        payload.extend_from_slice(&CACHE_MAGIC);
        payload.extend_from_slice(&CACHE_FORMAT_VERSION.to_le_bytes());
        payload.extend_from_slice(&(data.len() as u32).to_le_bytes());
        payload.extend_from_slice(data);

        // Atomic write: write to temp file then rename.
        let tmp_path = path.with_extension("tmp");
        if let Err(e) = std::fs::write(&tmp_path, &payload) {
            eprintln!(
                "vexart: pipeline cache: failed to write temp file {}: {e}",
                tmp_path.display()
            );
            return;
        }
        if let Err(e) = std::fs::rename(&tmp_path, path) {
            eprintln!("vexart: pipeline cache: failed to rename temp file: {e}");
            // Clean up the stray temp file.
            let _ = std::fs::remove_file(&tmp_path);
        }
    }

    /// Load and validate cache data from disk.
    ///
    /// Returns `Some(data)` on success, `None` on any error (including corruption).
    /// Corrupted files are deleted (REQ-2B-604).
    fn load_from_disk(path: &PathBuf) -> Option<Vec<u8>> {
        if !path.exists() {
            return None;
        }

        let bytes = match std::fs::read(path) {
            Ok(b) => b,
            Err(e) => {
                eprintln!(
                    "vexart: pipeline cache: failed to read {}: {e}",
                    path.display()
                );
                return None;
            }
        };

        // Validate header: magic (4) + format_version (2) + payload_len (4) = 10 bytes minimum.
        if bytes.len() < 10 {
            eprintln!("vexart: pipeline cache: truncated file — deleting");
            let _ = std::fs::remove_file(path);
            return None;
        }

        // Check magic.
        if bytes[0..4] != CACHE_MAGIC {
            eprintln!("vexart: pipeline cache: invalid magic — deleting corrupted cache");
            let _ = std::fs::remove_file(path);
            return None;
        }

        // Check format version (we only load if it matches our current format).
        let fmt_ver = u16::from_le_bytes([bytes[4], bytes[5]]);
        if fmt_ver != CACHE_FORMAT_VERSION {
            eprintln!(
                "vexart: pipeline cache: format version mismatch ({fmt_ver} != {CACHE_FORMAT_VERSION}) — deleting"
            );
            let _ = std::fs::remove_file(path);
            return None;
        }

        // Extract payload length.
        let payload_len = u32::from_le_bytes([bytes[6], bytes[7], bytes[8], bytes[9]]) as usize;
        let expected_total = 10 + payload_len;
        if bytes.len() < expected_total {
            eprintln!("vexart: pipeline cache: size mismatch — deleting corrupted cache");
            let _ = std::fs::remove_file(path);
            return None;
        }

        Some(bytes[10..10 + payload_len].to_vec())
    }
}

impl Default for PipelineCacheManager {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    /// Helper: create a temp dir path for cache testing.
    /// Uses a thread-local counter to give each test a unique sub-directory.
    fn tmp_cache_path(test_id: &str) -> PathBuf {
        let mut p = std::env::temp_dir();
        p.push(format!(
            "vexart_cache_test_{}_{}",
            std::process::id(),
            test_id
        ));
        p.push("pipeline.test-0.0.0.bin");
        p
    }

    /// Build a valid cache file payload for the given data bytes.
    fn build_payload(data: &[u8]) -> Vec<u8> {
        let mut payload = Vec::with_capacity(10 + data.len());
        payload.extend_from_slice(&CACHE_MAGIC);
        payload.extend_from_slice(&CACHE_FORMAT_VERSION.to_le_bytes());
        payload.extend_from_slice(&(data.len() as u32).to_le_bytes());
        payload.extend_from_slice(data);
        payload
    }

    #[test]
    fn test_load_missing_file_returns_none() {
        let path = tmp_cache_path("missing");
        // Ensure it doesn't exist.
        let _ = fs::remove_file(&path);
        let result = PipelineCacheManager::load_from_disk(&path);
        assert!(result.is_none(), "missing file should return None");
    }

    #[test]
    fn test_save_and_load_roundtrip() {
        let path = tmp_cache_path("roundtrip");
        // Ensure parent dir exists.
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).unwrap();
        }

        let data = b"fake_wgpu_pipeline_blob_data_12345";

        // Write the payload manually using the same format as save().
        let payload = build_payload(data);
        fs::write(&path, &payload).unwrap();

        // Load and verify.
        let loaded = PipelineCacheManager::load_from_disk(&path);
        assert!(loaded.is_some(), "valid cache file should load");
        assert_eq!(loaded.unwrap(), data, "loaded data must match written data");

        // Cleanup.
        let _ = fs::remove_file(&path);
        if let Some(parent) = path.parent() {
            let _ = fs::remove_dir(parent);
        }
    }

    #[test]
    fn test_corrupted_cache_is_deleted() {
        let path = tmp_cache_path("corrupted");
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).unwrap();
        }

        // Write garbage (invalid magic).
        fs::write(&path, b"\x00\x01\x02\x03garbage").unwrap();
        assert!(path.exists(), "corrupted file should exist before load");

        let result = PipelineCacheManager::load_from_disk(&path);
        assert!(result.is_none(), "corrupted file should return None");
        assert!(
            !path.exists(),
            "corrupted file should be deleted after load"
        );

        // Cleanup.
        if let Some(parent) = path.parent() {
            let _ = fs::remove_dir(parent);
        }
    }

    #[test]
    fn test_truncated_cache_is_deleted() {
        let path = tmp_cache_path("truncated");
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).unwrap();
        }

        // Write only the magic bytes — missing format_version and payload_len.
        fs::write(&path, &CACHE_MAGIC).unwrap();

        let result = PipelineCacheManager::load_from_disk(&path);
        assert!(result.is_none(), "truncated file should return None");
        assert!(!path.exists(), "truncated file should be deleted");

        // Cleanup.
        if let Some(parent) = path.parent() {
            let _ = fs::remove_dir(parent);
        }
    }

    #[test]
    fn test_manager_new_no_crash_when_missing() {
        // Just confirm construction doesn't panic when no cache file exists.
        // We can't control the real cache path easily, but we verify the API works.
        let mgr = PipelineCacheManager::new();
        // data() returns None or Some — both are valid.
        let _ = mgr.data();
    }

    #[test]
    fn test_cache_path_contains_version() {
        let path = cache_path();
        assert!(path.is_some(), "cache_path() should resolve");
        let path_str = path.unwrap().to_string_lossy().to_string();
        assert!(
            path_str.contains(version_tag()),
            "cache path should contain version: {path_str}"
        );
    }

    #[test]
    fn test_cache_path_contains_platform() {
        let path = cache_path();
        let path_str = path.unwrap().to_string_lossy().to_string();
        assert!(
            path_str.contains(platform_tag()),
            "cache path should contain platform: {path_str}"
        );
    }
}
