// native/libvexart/src/font/system.rs
// System font discovery — browser-like CSS font family resolution.
//
// Uses fontdb to scan system fonts and resolve family queries to actual
// TTF/OTF face data. Supports fallback chains: if a codepoint is not in
// the primary font, we walk system fonts to find one that has it.

use fontdb::{Database, Family, Query, Style, Weight, ID as FaceId};
use std::collections::HashMap;
use std::sync::Arc;
use ttf_parser::Face;

// Keep the fallback list small and predictable. These are common family names,
// and each candidate is checked against the loaded database before use.
const SANS_SERIF_FALLBACKS: &[&str] = &["Arial", "DejaVu Sans", "Liberation Sans", "Noto Sans"];
const SERIF_FALLBACKS: &[&str] = &[
    "Times New Roman",
    "DejaVu Serif",
    "Liberation Serif",
    "Noto Serif",
];
const MONOSPACE_FALLBACKS: &[&str] = &[
    "Courier New",
    "DejaVu Sans Mono",
    "Liberation Mono",
    "Noto Sans Mono",
];

/// A resolved font face with its raw data kept alive.
pub struct ResolvedFace {
    /// fontdb face ID for lookups.
    pub face_id: FaceId,
    /// Raw font bytes (Arc so we can cheaply clone for ttf-parser).
    pub data: Arc<Vec<u8>>,
    /// Face index within the font collection.
    pub face_index: u32,
    /// Family name for debugging.
    pub family: String,
}

impl ResolvedFace {
    /// Parse a ttf-parser Face from the stored data.
    /// Returns None if parsing fails (shouldn't happen for a valid fontdb entry).
    pub fn parse(&self) -> Option<Face<'_>> {
        Face::parse(&self.data, self.face_index).ok()
    }
}

/// Central font system — owns fontdb, resolves queries, provides glyph fallback.
pub struct FontSystem {
    db: Database,
    /// Cache: fontdb FaceId → loaded font data (so we don't re-read from disk).
    face_cache: HashMap<FaceId, Arc<Vec<u8>>>,
}

impl FontSystem {
    /// Create a new FontSystem and scan system fonts.
    /// This is the equivalent of a browser scanning installed fonts at startup.
    pub fn new() -> Self {
        let mut db = Database::new();
        db.load_system_fonts();
        repair_generic_families(&mut db);
        Self {
            db,
            face_cache: HashMap::new(),
        }
    }

    /// How many font faces are available on this system.
    pub fn face_count(&self) -> usize {
        self.db.len()
    }

    /// Query for a font face by CSS-like family + weight + style.
    /// Returns a ResolvedFace that can be used to extract glyph outlines.
    ///
    /// `families` is a prioritized list, like CSS font-family:
    ///   &["JetBrains Mono", "monospace"]
    ///   &["SF Pro", "sans-serif"]
    pub fn query_face(
        &mut self,
        families: &[&str],
        weight: u16,
        italic: bool,
    ) -> Option<ResolvedFace> {
        let fontdb_families: Vec<Family<'_>> = families
            .iter()
            .map(|f| match f.to_lowercase().as_str() {
                "serif" => Family::Serif,
                "sans-serif" => Family::SansSerif,
                "monospace" => Family::Monospace,
                "cursive" => Family::Cursive,
                "fantasy" => Family::Fantasy,
                _ => Family::Name(f),
            })
            .collect();

        let query = Query {
            families: &fontdb_families,
            weight: Weight(weight),
            stretch: fontdb::Stretch::Normal,
            style: if italic { Style::Italic } else { Style::Normal },
        };

        let face_id = self.db.query(&query)?;
        self.load_face(face_id)
    }

    /// Find a font on the system that contains the given codepoint.
    /// This is the fallback path — when the primary font doesn't have a glyph.
    pub fn find_face_for_codepoint(
        &mut self,
        codepoint: char,
        weight: u16,
        italic: bool,
    ) -> Option<ResolvedFace> {
        // Collect candidate face IDs first to avoid borrow conflict
        // (faces() borrows &self, load_face() borrows &mut self).
        let candidates: Vec<FaceId> = self
            .db
            .faces()
            .filter(|fi| {
                let w_diff = (fi.weight.0 as i32 - weight as i32).unsigned_abs();
                if w_diff > 200 {
                    return false;
                }
                if italic && fi.style != Style::Italic {
                    return false;
                }
                true
            })
            .map(|fi| fi.id)
            .collect();

        for face_id in candidates {
            if let Some(resolved) = self.load_face(face_id) {
                if let Some(face) = resolved.parse() {
                    if face.glyph_index(codepoint).is_some() {
                        return Some(resolved);
                    }
                }
            }
        }
        None
    }

    /// Load font face data from fontdb, caching for reuse.
    fn load_face(&mut self, face_id: FaceId) -> Option<ResolvedFace> {
        let face_info = self.db.face(face_id)?;
        let family = face_info
            .families
            .first()
            .map(|(name, _)| name.clone())
            .unwrap_or_default();
        let face_index = face_info.index;

        // Check cache first.
        if let Some(data) = self.face_cache.get(&face_id) {
            return Some(ResolvedFace {
                face_id,
                data: Arc::clone(data),
                face_index,
                family,
            });
        }

        // Load from fontdb (may memory-map the file).
        let data = self
            .db
            .with_face_data(face_id, |bytes, _index| Arc::new(bytes.to_vec()))?;

        self.face_cache.insert(face_id, Arc::clone(&data));

        Some(ResolvedFace {
            face_id,
            data,
            face_index,
            family,
        })
    }
}

fn query_family(db: &Database, family: Family<'_>) -> bool {
    let families = [family];
    db.query(&Query {
        families: &families,
        weight: Weight(400),
        stretch: fontdb::Stretch::Normal,
        style: Style::Normal,
    })
    .is_some()
}

fn first_installed_family(db: &Database, candidates: &[&str]) -> Option<String> {
    candidates
        .iter()
        .copied()
        .find(|family| query_family(db, Family::Name(family)))
        .map(str::to_owned)
}

fn repair_generic_families(db: &mut Database) {
    if !query_family(db, Family::SansSerif) {
        if let Some(family) = first_installed_family(db, SANS_SERIF_FALLBACKS) {
            db.set_sans_serif_family(family);
        }
    }
    if !query_family(db, Family::Serif) {
        if let Some(family) = first_installed_family(db, SERIF_FALLBACKS) {
            db.set_serif_family(family);
        }
    }
    if !query_family(db, Family::Monospace) {
        if let Some(family) = first_installed_family(db, MONOSPACE_FALLBACKS) {
            db.set_monospace_family(family);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_font_system_discovers_system_fonts() {
        let system = FontSystem::new();
        // Every modern OS has at least a few fonts installed.
        assert!(
            system.face_count() > 0,
            "FontSystem should find system fonts (found 0)"
        );
    }

    #[test]
    fn test_query_sans_serif_returns_face() {
        let mut system = FontSystem::new();
        let face = system.query_face(&["sans-serif"], 400, false);
        assert!(
            face.is_some(),
            "sans-serif query should match a system font"
        );
        let face = face.unwrap();
        assert!(
            !face.family.is_empty(),
            "resolved face should have a family name"
        );
    }

    #[test]
    fn test_query_monospace_returns_face() {
        let mut system = FontSystem::new();
        let face = system.query_face(&["monospace"], 400, false);
        assert!(face.is_some(), "monospace query should match a system font");
    }

    #[test]
    fn test_resolved_face_can_parse() {
        let mut system = FontSystem::new();
        let face = system.query_face(&["sans-serif"], 400, false).unwrap();
        let parsed = face.parse();
        assert!(
            parsed.is_some(),
            "resolved face data should parse as a valid TTF"
        );
    }

    #[test]
    fn test_parsed_face_has_basic_ascii() {
        let mut system = FontSystem::new();
        let resolved = system.query_face(&["sans-serif"], 400, false).unwrap();
        let face = resolved.parse().unwrap();
        // Every real font must have 'A'
        assert!(
            face.glyph_index('A').is_some(),
            "sans-serif font must contain glyph for 'A'"
        );
    }

    #[test]
    fn test_fallback_finds_codepoint() {
        let mut system = FontSystem::new();
        // 'A' should be in virtually every font.
        let face = system.find_face_for_codepoint('A', 400, false);
        assert!(face.is_some(), "fallback should find a font with 'A'");
    }

    #[test]
    fn test_missing_generic_mapping_uses_installed_fallback() {
        let mut system = FontSystem::new();
        system
            .db
            .set_sans_serif_family("__vexart_missing_sans_serif__");

        repair_generic_families(&mut system.db);

        let mapped = system.db.family_name(&Family::SansSerif).to_string();
        assert_ne!(mapped, "__vexart_missing_sans_serif__");
        let face = system.query_face(&["sans-serif"], 400, false);
        assert!(face.is_some(), "missing generic mapping should be repaired");
        assert_eq!(face.unwrap().family, mapped);
    }

    #[test]
    fn test_existing_generic_mapping_is_preserved() {
        let mut system = FontSystem::new();
        let configured = system
            .db
            .faces()
            .find_map(|face| face.families.first().map(|(family, _)| family.clone()))
            .expect("system font database should contain a family");
        system.db.set_sans_serif_family(configured.clone());

        repair_generic_families(&mut system.db);

        assert_eq!(system.db.family_name(&Family::SansSerif), configured);
        assert!(
            system.query_face(&["sans-serif"], 400, false).is_some(),
            "configured generic family should remain queryable"
        );
    }
}
