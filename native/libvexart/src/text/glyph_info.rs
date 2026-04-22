// native/libvexart/src/text/glyph_info.rs
// GlyphMetrics struct and GlyphTable, with JSON metrics parsing.
// Per design §4.3, REQ-2B-202/204, task 4.2.

use std::collections::HashMap;

/// Per-glyph layout info extracted from the atlas metrics JSON.
#[derive(Debug, Clone)]
pub struct GlyphMetrics {
    /// Codepoint (Unicode scalar value).
    pub codepoint: u32,
    /// Top-left X of the glyph cell in the atlas texture (pixels).
    pub atlas_x: u32,
    /// Top-left Y of the glyph cell in the atlas texture (pixels).
    pub atlas_y: u32,
    /// Width of the glyph cell in the atlas (pixels).
    pub atlas_w: u32,
    /// Height of the glyph cell in the atlas (pixels).
    pub atlas_h: u32,
    /// Horizontal bearing (pixels): pen x offset to left edge of glyph bounds.
    pub x_offset: i32,
    /// Vertical bearing (pixels): pen y offset to top edge of glyph bounds.
    pub y_offset: i32,
    /// Horizontal advance (pixels): how far to advance pen after this glyph.
    pub x_advance: i32,
}

/// Lookup table: char → GlyphMetrics.
pub type GlyphTable = HashMap<char, GlyphMetrics>;

/// Parse the metrics JSON produced by `@vexart/internal-atlas-gen`.
///
/// Expected shape:
/// ```json
/// {
///   "fontName": "...",
///   "atlasWidth": 1024,
///   "atlasHeight": 1024,
///   "refSize": 48,
///   "cellWidth": 64,
///   "cellHeight": 64,
///   "glyphs": [
///     { "codepoint": 65, "char": "A", "atlasX": 0, "atlasY": 0,
///       "atlasW": 64, "atlasH": 64, "xOffset": 0, "yOffset": 0, "xAdvance": 29 },
///     ...
///   ]
/// }
/// ```
///
/// Returns `Err(String)` if JSON is malformed or missing required fields.
pub fn parse_metrics(json: &str) -> Result<GlyphTable, String> {
    let root: serde_json::Value =
        serde_json::from_str(json).map_err(|e| format!("metrics JSON parse error: {e}"))?;

    let glyphs = root
        .get("glyphs")
        .and_then(|v| v.as_array())
        .ok_or_else(|| "metrics JSON missing 'glyphs' array".to_string())?;

    if glyphs.is_empty() {
        return Err("metrics JSON 'glyphs' array is empty".to_string());
    }

    let mut table = GlyphTable::with_capacity(glyphs.len());

    for (idx, glyph) in glyphs.iter().enumerate() {
        let codepoint = glyph
            .get("codepoint")
            .and_then(|v| v.as_u64())
            .ok_or_else(|| format!("glyph[{idx}] missing 'codepoint'"))? as u32;

        let char_str = glyph
            .get("char")
            .and_then(|v| v.as_str())
            .ok_or_else(|| format!("glyph[{idx}] missing 'char'"))?;

        let ch = char_str
            .chars()
            .next()
            .ok_or_else(|| format!("glyph[{idx}] 'char' is empty"))?;

        let atlas_x = glyph
            .get("atlasX")
            .and_then(|v| v.as_u64())
            .ok_or_else(|| format!("glyph[{idx}] missing 'atlasX'"))? as u32;

        let atlas_y = glyph
            .get("atlasY")
            .and_then(|v| v.as_u64())
            .ok_or_else(|| format!("glyph[{idx}] missing 'atlasY'"))? as u32;

        let atlas_w = glyph
            .get("atlasW")
            .and_then(|v| v.as_u64())
            .ok_or_else(|| format!("glyph[{idx}] missing 'atlasW'"))? as u32;

        let atlas_h = glyph
            .get("atlasH")
            .and_then(|v| v.as_u64())
            .ok_or_else(|| format!("glyph[{idx}] missing 'atlasH'"))? as u32;

        let x_offset = glyph
            .get("xOffset")
            .and_then(|v| v.as_i64())
            .ok_or_else(|| format!("glyph[{idx}] missing 'xOffset'"))? as i32;

        let y_offset = glyph
            .get("yOffset")
            .and_then(|v| v.as_i64())
            .ok_or_else(|| format!("glyph[{idx}] missing 'yOffset'"))? as i32;

        let x_advance = glyph
            .get("xAdvance")
            .and_then(|v| v.as_i64())
            .ok_or_else(|| format!("glyph[{idx}] missing 'xAdvance'"))? as i32;

        table.insert(
            ch,
            GlyphMetrics {
                codepoint,
                atlas_x,
                atlas_y,
                atlas_w,
                atlas_h,
                x_offset,
                y_offset,
                x_advance,
            },
        );
    }

    Ok(table)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_metrics_json() -> &'static str {
        r#"{
          "fontName": "test_font",
          "atlasWidth": 1024,
          "atlasHeight": 1024,
          "refSize": 48,
          "cellWidth": 64,
          "cellHeight": 64,
          "glyphs": [
            {
              "codepoint": 65,
              "char": "A",
              "atlasX": 0,
              "atlasY": 0,
              "atlasW": 64,
              "atlasH": 64,
              "xOffset": 0,
              "yOffset": -44,
              "xAdvance": 29
            },
            {
              "codepoint": 66,
              "char": "B",
              "atlasX": 64,
              "atlasY": 0,
              "atlasW": 64,
              "atlasH": 64,
              "xOffset": 0,
              "yOffset": -44,
              "xAdvance": 27
            },
            {
              "codepoint": 32,
              "char": " ",
              "atlasX": 128,
              "atlasY": 0,
              "atlasW": 64,
              "atlasH": 64,
              "xOffset": 0,
              "yOffset": 0,
              "xAdvance": 14
            }
          ]
        }"#
    }

    #[test]
    fn test_parse_metrics_basic() {
        let table = parse_metrics(sample_metrics_json()).expect("parse should succeed");
        assert_eq!(table.len(), 3);
    }

    #[test]
    fn test_parse_metrics_glyph_a_lookup() {
        let table = parse_metrics(sample_metrics_json()).unwrap();
        let a = table.get(&'A').expect("'A' must be in table");
        assert_eq!(a.codepoint, 65);
        assert_eq!(a.atlas_x, 0);
        assert_eq!(a.atlas_y, 0);
        assert_eq!(a.atlas_w, 64);
        assert_eq!(a.atlas_h, 64);
        assert_eq!(a.x_advance, 29);
        assert_eq!(a.y_offset, -44);
    }

    #[test]
    fn test_parse_metrics_glyph_b_lookup() {
        let table = parse_metrics(sample_metrics_json()).unwrap();
        let b = table.get(&'B').expect("'B' must be in table");
        assert_eq!(b.atlas_x, 64);
        assert_eq!(b.x_advance, 27);
    }

    #[test]
    fn test_parse_metrics_space_lookup() {
        let table = parse_metrics(sample_metrics_json()).unwrap();
        let sp = table.get(&' ').expect("space must be in table");
        assert_eq!(sp.codepoint, 32);
        assert_eq!(sp.x_advance, 14);
    }

    #[test]
    fn test_parse_metrics_malformed_json() {
        let err = parse_metrics("{ not valid json }");
        assert!(err.is_err(), "malformed JSON must return Err");
    }

    #[test]
    fn test_parse_metrics_missing_glyphs_array() {
        let json = r#"{ "fontName": "test" }"#;
        let err = parse_metrics(json);
        assert!(err.is_err());
        assert!(err.unwrap_err().contains("'glyphs'"));
    }

    #[test]
    fn test_parse_metrics_empty_glyphs_array() {
        let json = r#"{ "glyphs": [] }"#;
        let err = parse_metrics(json);
        assert!(err.is_err());
        assert!(err.unwrap_err().contains("empty"));
    }

    #[test]
    fn test_parse_metrics_missing_codepoint() {
        let json = r#"{
          "glyphs": [
            { "char": "A", "atlasX": 0, "atlasY": 0, "atlasW": 64, "atlasH": 64,
              "xOffset": 0, "yOffset": 0, "xAdvance": 29 }
          ]
        }"#;
        let err = parse_metrics(json);
        assert!(err.is_err());
        assert!(err.unwrap_err().contains("codepoint"));
    }
}
