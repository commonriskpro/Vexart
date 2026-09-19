use super::*;

#[test]
fn test_atlas_page_dimensions() {
    assert_eq!(PAGE_SIZE, 1024);
    assert!(COLS > 0);
    assert!(ROWS > 0);
    assert!(GLYPHS_PER_PAGE > 100, "should fit many glyphs per page");
}

#[test]
fn test_atlas_page_new() {
    let page = AtlasPage::new();
    assert_eq!(page.count, 0);
    assert!(!page.is_full());
    assert!(page.dirty);
    assert_eq!(page.rgba.len(), (PAGE_SIZE * PAGE_SIZE * 4) as usize);
}

#[test]
fn test_msdf_atlas_manager_new() {
    let mgr = MsdfAtlasManager::new();
    assert_eq!(mgr.glyph_count(), 0);
    assert_eq!(mgr.pages.len(), 1);
    assert_eq!(mgr.page_size(), 1024);
}

#[test]
fn test_glyph_entry_uv_coords() {
    let entry = MsdfGlyphEntry {
        page: 0,
        col: 0,
        row: 0,
        advance: 600.0,
        bearing_x: 50.0,
        bearing_y: 700.0,
        bbox_w: 500.0,
        bbox_h: 700.0,
        texel_w: 25.1,
        texel_h: 32.0,
    };
    // UV should be within [0, 1].
    assert!(entry.uv_x() >= 0.0 && entry.uv_x() < 1.0);
    assert!(entry.uv_y() >= 0.0 && entry.uv_y() < 1.0);
    assert!(entry.uv_w() > 0.0 && entry.uv_w() <= 1.0);
    assert!(entry.uv_h() > 0.0 && entry.uv_h() <= 1.0);
}

#[test]
fn test_generate_msdf_with_system_font() {
    // Integration test: load a real system font and generate MSDF for 'A'.
    let mut system = crate::font::system::FontSystem::new();
    let resolved = system.query_face(&["sans-serif"], 400, false);
    if resolved.is_none() {
        // CI without fonts — skip gracefully.
        return;
    }
    let resolved = resolved.unwrap();

    let mut mgr = MsdfAtlasManager::new();
    let entry = mgr.get_or_generate(&resolved.data, resolved.face_index, 'A');
    assert!(
        entry.is_some(),
        "should generate MSDF for 'A' from system font"
    );
    let entry = entry.unwrap();
    assert!(entry.advance > 0.0, "glyph advance should be positive");
    assert_eq!(entry.page, 0);
    assert_eq!(entry.col, 0);
    assert_eq!(entry.row, 0);

    // Generate another glyph — should go to next slot.
    let entry_b = mgr.get_or_generate(&resolved.data, resolved.face_index, 'B');
    assert!(entry_b.is_some());
    let entry_b = entry_b.unwrap();
    assert_eq!(entry_b.col, 1); // Second slot.

    // Re-request 'A' — should return cached.
    let entry_a2 = mgr.get_or_generate(&resolved.data, resolved.face_index, 'A');
    assert!(entry_a2.is_some());
    assert_eq!(entry_a2.unwrap().col, 0); // Same slot as before.

    assert_eq!(mgr.glyph_count(), 2);
}

#[test]
fn test_generate_space_glyph() {
    // Space character typically has no outlines but should still get a slot.
    let mut system = crate::font::system::FontSystem::new();
    let resolved = system.query_face(&["sans-serif"], 400, false);
    if resolved.is_none() {
        return;
    }
    let resolved = resolved.unwrap();

    let mut mgr = MsdfAtlasManager::new();
    let entry = mgr.get_or_generate(&resolved.data, resolved.face_index, ' ');
    assert!(
        entry.is_some(),
        "space should get a slot even without outlines"
    );
    let e = entry.unwrap();
    assert!(e.advance > 0.0);
}

#[test]
fn test_glyph_quad_sizing() {
    // With bearing-based quad sizing, the quad at display font_size should be
    // proportional to the glyph bbox, NOT the full atlas cell.
    let mut system = crate::font::system::FontSystem::new();
    let resolved = system.query_face(&["sans-serif"], 400, false);
    if resolved.is_none() {
        return;
    }
    let resolved = resolved.unwrap();

    let face = ttf_parser::Face::parse(&resolved.data, resolved.face_index).unwrap();
    let units_per_em = face.units_per_em();

    let mut mgr = MsdfAtlasManager::new();

    for ch in ['A', 'i', 'W', 'g', 'j'] {
        let entry = mgr.get_or_generate(&resolved.data, resolved.face_index, ch);
        let entry = match entry {
            Some(e) => e,
            None => continue,
        };

        if entry.bbox_w > 0.0 && entry.bbox_h > 0.0 {
            let display_scale = 20.0 / units_per_em as f32;
            let quad_w = entry.quad_w(display_scale);
            let quad_h = entry.quad_h(display_scale);
            let advance_px = entry.advance * display_scale;

            eprintln!(
                "glyph '{}': quad={:.1}x{:.1} advance={:.1}",
                ch, quad_w, quad_h, advance_px
            );

            // Quad width should be reasonable relative to advance.
            // For most glyphs, bbox_w ≤ advance (sidebearings).
            // For wide glyphs like 'W', bbox_w may slightly exceed advance.
            assert!(
                quad_w < advance_px * 2.5,
                "glyph '{}': quad_w ({:.1}) should not be much larger than advance ({:.1})",
                ch,
                quad_w,
                advance_px
            );
            // Quad height should be roughly font_size (not 2x or 3x).
            // With SDF padding it can be ~20-30% larger than bbox.
            assert!(
                quad_h < 20.0 * 1.5,
                "glyph '{}': quad_h ({:.1}) should not exceed ~1.5x font_size",
                ch,
                quad_h
            );
        }
    }
}

#[test]
fn test_atlas_page_write_glyph_records_dirty_subregion() {
    let mut page = AtlasPage::new();
    assert!(page.dirty_subregions.is_empty());

    let img = image::RgbImage::new(32, 32);
    page.write_glyph(0, 0, &img);

    assert_eq!(page.dirty_subregions.len(), 1);
    let sub = page.dirty_subregions[0];
    assert_eq!(
        sub,
        GlyphSubregion {
            x: GLYPH_PAD,
            y: GLYPH_PAD,
            width: 32,
            height: 32,
        }
    );
    assert!(page.dirty);

    // Second glyph at col=1, row=0
    page.write_glyph(1, 0, &img);
    assert_eq!(page.dirty_subregions.len(), 2);
    assert_eq!(
        page.dirty_subregions[1],
        GlyphSubregion {
            x: CELL_SIZE + GLYPH_PAD,
            y: GLYPH_PAD,
            width: 32,
            height: 32,
        }
    );
}
