// native/libvexart/src/font/msdf_atlas.rs
// Dynamic MSDF atlas — on-demand glyph generation with rect-packing.
//
// One atlas page is 1024×1024 RGBA8. Glyphs are generated at a fixed SDF
// size (e.g. 32×32 or 48×48 texels) and rect-packed into the page.
// When a page fills up, a new page is allocated.
//
// The shader reconstructs sharp edges at ANY display size via
// median3(RGB) + smoothstep + fwidth().

use std::collections::HashMap;
use std::sync::Arc;

use fdsm::bezier::scanline::FillRule;
use fdsm::correct_error::{correct_error_msdf, ErrorCorrectionConfig};
use fdsm::generate::generate_msdf;
use fdsm::render::correct_sign_msdf;
use fdsm::shape::{ColoredContour, Contour, Shape};
use fdsm_ttf_parser::load_shape_from_face;
use image::Rgb;
use ttf_parser::Face;

// ResolvedFace used only in tests via crate::font::system::FontSystem.

/// Size of each glyph cell in the MSDF atlas (texels).
/// 32×32 is a good balance: enough precision for clean edges at 72px+,
/// small enough to fit ~900 glyphs per 1024×1024 page.
const GLYPH_SIZE: u32 = 32;

/// Padding around each glyph cell (texels) to prevent bleed.
const GLYPH_PAD: u32 = 2;

/// Total cell size including padding.
const CELL_SIZE: u32 = GLYPH_SIZE + GLYPH_PAD * 2;

/// Atlas page dimension (texels). 1024×1024 × 4 bytes = 4MB per page.
const PAGE_SIZE: u32 = 1024;

/// Max columns per page row.
const COLS: u32 = PAGE_SIZE / CELL_SIZE;

/// Max rows per page.
const ROWS: u32 = PAGE_SIZE / CELL_SIZE;

/// Max glyphs per page.
const GLYPHS_PER_PAGE: u32 = COLS * ROWS;

/// SDF range in texels — how many texels represent the distance field extent.
/// Higher = more anti-aliasing range, but less sharp. 4.0 is standard.
const SDF_RANGE: f64 = 4.0;

/// Metrics for a single glyph in the atlas.
#[derive(Debug, Clone, Copy)]
pub struct MsdfGlyphEntry {
    /// Atlas page index.
    pub page: u32,
    /// Column in the page grid.
    pub col: u32,
    /// Row in the page grid.
    pub row: u32,
    /// Horizontal advance in font units.
    pub advance: f32,
    /// Horizontal bearing (offset from pen to glyph left edge) in font units.
    pub bearing_x: f32,
    /// Vertical bearing (offset from baseline to glyph top) in font units.
    pub bearing_y: f32,
    /// Glyph bounding box width in font units.
    pub bbox_w: f32,
    /// Glyph bounding box height in font units.
    pub bbox_h: f32,
}

impl MsdfGlyphEntry {
    /// UV top-left X in normalized atlas coordinates.
    pub fn uv_x(&self) -> f32 {
        (self.col * CELL_SIZE + GLYPH_PAD) as f32 / PAGE_SIZE as f32
    }

    /// UV top-left Y in normalized atlas coordinates.
    pub fn uv_y(&self) -> f32 {
        (self.row * CELL_SIZE + GLYPH_PAD) as f32 / PAGE_SIZE as f32
    }

    /// UV width in normalized atlas coordinates.
    pub fn uv_w(&self) -> f32 {
        GLYPH_SIZE as f32 / PAGE_SIZE as f32
    }

    /// UV height in normalized atlas coordinates.
    pub fn uv_h(&self) -> f32 {
        GLYPH_SIZE as f32 / PAGE_SIZE as f32
    }
}

/// One atlas page — 1024×1024 RGBA8 pixel data.
pub struct AtlasPage {
    /// Raw RGBA8 pixel data, PAGE_SIZE × PAGE_SIZE × 4 bytes.
    pub rgba: Vec<u8>,
    /// Number of glyphs placed so far.
    pub count: u32,
    /// Whether this page has been modified since last GPU upload.
    pub dirty: bool,
}

impl AtlasPage {
    fn new() -> Self {
        // Initialize with mid-gray (0.5 distance = boundary) in RGB, alpha=255.
        // This makes empty cells render as "no glyph" (SDF distance = 0 → edge).
        // Actually, initialize to 0 (outside shape) for clean compositing.
        let size = (PAGE_SIZE * PAGE_SIZE * 4) as usize;
        let mut rgba = vec![0u8; size];
        // Set alpha to 255 for all pixels (MSDF only uses RGB).
        for i in (3..size).step_by(4) {
            rgba[i] = 255;
        }
        Self {
            rgba,
            count: 0,
            dirty: true,
        }
    }

    fn is_full(&self) -> bool {
        self.count >= GLYPHS_PER_PAGE
    }

    /// Write an MSDF glyph image into the page at the given slot.
    fn write_glyph(&mut self, col: u32, row: u32, msdf: &image::RgbImage) {
        let base_x = col * CELL_SIZE + GLYPH_PAD;
        let base_y = row * CELL_SIZE + GLYPH_PAD;
        for py in 0..GLYPH_SIZE.min(msdf.height()) {
            for px in 0..GLYPH_SIZE.min(msdf.width()) {
                let pixel = msdf.get_pixel(px, py);
                let dx = base_x + px;
                let dy = base_y + py;
                let di = ((dy * PAGE_SIZE + dx) * 4) as usize;
                if di + 3 < self.rgba.len() {
                    self.rgba[di] = pixel[0];
                    self.rgba[di + 1] = pixel[1];
                    self.rgba[di + 2] = pixel[2];
                    self.rgba[di + 3] = 255;
                }
            }
        }
        self.dirty = true;
    }
}

/// Key for glyph cache: (font face data pointer hash, codepoint).
/// Using a u64 hash of the font data Arc pointer + codepoint ensures
/// we distinguish glyphs from different fonts.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
struct GlyphKey {
    /// Hash of the font face Arc pointer (cheap identity).
    font_hash: u64,
    /// Unicode codepoint.
    codepoint: u32,
}

/// Dynamic MSDF atlas manager.
/// Generates MSDF glyphs on-demand and packs them into atlas pages.
pub struct MsdfAtlasManager {
    /// Atlas pages (GPU textures uploaded incrementally).
    pub pages: Vec<AtlasPage>,
    /// Glyph lookup: (font_hash, codepoint) → MsdfGlyphEntry.
    glyphs: HashMap<GlyphKey, MsdfGlyphEntry>,
}

impl MsdfAtlasManager {
    pub fn new() -> Self {
        Self {
            pages: vec![AtlasPage::new()],
            glyphs: HashMap::new(),
        }
    }

    /// Get or generate the MSDF glyph entry for a codepoint.
    /// Returns None if the font doesn't have this glyph (no outline).
    pub fn get_or_generate(
        &mut self,
        face_data: &Arc<Vec<u8>>,
        face_index: u32,
        codepoint: char,
    ) -> Option<MsdfGlyphEntry> {
        let font_hash = Arc::as_ptr(face_data) as u64;
        let key = GlyphKey {
            font_hash,
            codepoint: codepoint as u32,
        };

        // Check cache first.
        if let Some(entry) = self.glyphs.get(&key) {
            return Some(*entry);
        }

        // Parse face and generate MSDF.
        let face = Face::parse(face_data, face_index).ok()?;
        let glyph_id = face.glyph_index(codepoint)?;

        // Get glyph metrics.
        let advance = face
            .glyph_hor_advance(glyph_id)
            .unwrap_or(0) as f32;
        let bbox = face.glyph_bounding_box(glyph_id);
        let (bearing_x, bearing_y, bbox_w, bbox_h) = if let Some(bb) = bbox {
            (
                bb.x_min as f32,
                bb.y_max as f32,
                (bb.x_max - bb.x_min) as f32,
                (bb.y_max - bb.y_min) as f32,
            )
        } else {
            (0.0, 0.0, 0.0, 0.0)
        };

        // Load glyph outline → fdsm shape.
        // Some glyphs (space, control chars) have no outlines — that's OK,
        // we still record metrics so advance/layout works correctly.
        let shape: Option<Shape<Contour>> = load_shape_from_face(&face, glyph_id);

        let has_contours = shape.as_ref().map_or(false, |s| {
            !s.contours.is_empty() && s.contours.iter().any(|c| !c.segments.is_empty())
        });

        // Allocate a slot in the current page.
        let page_idx = self.current_page_index();
        let page = &mut self.pages[page_idx];
        let slot = page.count;
        let col = slot % COLS;
        let row = slot / COLS;

        if has_contours {
            if let Some(shape) = shape {
                // Generate MSDF.
                let msdf_image = generate_msdf_for_glyph(shape, bbox_w, bbox_h, bearing_x, bearing_y);
                if let Some(img) = msdf_image {
                    page.write_glyph(col, row, &img);
                }
            }
        }
        // Even space/empty glyphs get a slot (renders transparent, but advance works).

        page.count += 1;

        let entry = MsdfGlyphEntry {
            page: page_idx as u32,
            col,
            row,
            advance,
            bearing_x,
            bearing_y,
            bbox_w,
            bbox_h,
        };

        self.glyphs.insert(key, entry);
        Some(entry)
    }

    /// Ensure there's a page with free slots, creating a new one if needed.
    fn current_page_index(&mut self) -> usize {
        let last = self.pages.len() - 1;
        if self.pages[last].is_full() {
            self.pages.push(AtlasPage::new());
            self.pages.len() - 1
        } else {
            last
        }
    }

    /// How many glyphs are cached.
    pub fn glyph_count(&self) -> usize {
        self.glyphs.len()
    }

    /// Page dimensions (always PAGE_SIZE).
    pub fn page_size(&self) -> u32 {
        PAGE_SIZE
    }

    /// Glyph cell size.
    pub fn glyph_cell_size(&self) -> u32 {
        GLYPH_SIZE
    }

    /// SDF range (needed by the shader for proper anti-aliasing).
    pub fn sdf_range(&self) -> f64 {
        SDF_RANGE
    }

    /// Look up a cached glyph without generating.
    pub fn lookup(
        &self,
        face_data: &Arc<Vec<u8>>,
        codepoint: char,
    ) -> Option<MsdfGlyphEntry> {
        let font_hash = Arc::as_ptr(face_data) as u64;
        let key = GlyphKey {
            font_hash,
            codepoint: codepoint as u32,
        };
        self.glyphs.get(&key).copied()
    }
}

/// Generate an MSDF image for a single glyph.
/// Returns a 32×32 RGB image, or None if generation fails.
fn generate_msdf_for_glyph(
    shape: Shape<Contour>,
    bbox_w: f32,
    bbox_h: f32,
    bearing_x: f32,
    bearing_y: f32,
) -> Option<image::RgbImage> {
    // Color the edges (required for multi-channel SDF).
    let colored = Shape::<ColoredContour>::edge_coloring_simple(shape, 3.0, 0);
    let prepared = colored.prepare();

    // Create the output image.
    let mut msdf = image::ImageBuffer::<Rgb<f32>, Vec<f32>>::new(GLYPH_SIZE, GLYPH_SIZE);

    // Compute the transform: map glyph bbox → GLYPH_SIZE×GLYPH_SIZE texels.
    // We need to transform the sampling coordinates so that when we sample
    // at pixel (px, py), we get the corresponding point in glyph space.
    //
    // The fdsm generate_msdf samples at (px + 0.5, py + 0.5) in pixel space.
    // We need to map that to glyph space where the outline lives.
    //
    // For the transform: we use a PreparedColoredShape which works in the
    // glyph's native coordinate space. We generate into a buffer where each
    // pixel maps to a region of glyph space.
    //
    // fdsm's generate_msdf calls sampler(point) where point is in pixel coords.
    // The shape's outline is in font unit coords (e.g. 0-1000 for a 1000 UPM font).
    // We need to scale the shape to fit in GLYPH_SIZE pixels.

    // Scale the outline to fit in the texel grid.
    // We add SDF_RANGE padding so the distance field extends beyond the glyph bounds.
    let pad = SDF_RANGE;
    let scale_x = if bbox_w > 0.0 {
        (GLYPH_SIZE as f64 - 2.0 * pad) / bbox_w as f64
    } else {
        1.0
    };
    let scale_y = if bbox_h > 0.0 {
        (GLYPH_SIZE as f64 - 2.0 * pad) / bbox_h as f64
    } else {
        1.0
    };
    let scale = scale_x.min(scale_y); // Uniform scale to preserve aspect ratio.

    // Translate: glyph origin (bearing_x, bearing_y) maps to padded top-left.
    let translate_x = pad - bearing_x as f64 * scale;
    let _translate_y = pad - (bearing_y as f64 - bbox_h as f64) as f64 * scale;
    // TTF has Y-up, but our atlas is Y-down. Flip Y.
    let translate_y_flipped = pad + bearing_y as f64 * scale;

    // Transform the shape's contours into pixel space.
    // Clone and apply affine transform (scale + translate + Y-flip).
    use fdsm::transform::Transform;
    use nalgebra::{Affine2, Matrix3};
    let mut transformed = colored.clone();
    let affine = Affine2::from_matrix_unchecked(Matrix3::new(
        scale,        0.0,    translate_x,
        0.0,          -scale, translate_y_flipped,
        0.0,          0.0,    1.0,
    ));
    transformed.transform(&affine);
    let prepared_transformed = transformed.prepare();

    // Generate MSDF.
    generate_msdf(&prepared_transformed, SDF_RANGE, &mut msdf);

    // Correct sign.
    correct_sign_msdf(&mut msdf, &prepared_transformed, FillRule::Nonzero);

    // Error correction (optional, improves quality at edges).
    correct_error_msdf(
        &mut msdf,
        &transformed,
        &prepared_transformed,
        SDF_RANGE,
        &ErrorCorrectionConfig::default(),
    );

    // Convert f32 RGB → u8 RGB.
    let mut result = image::RgbImage::new(GLYPH_SIZE, GLYPH_SIZE);
    for (x, y, pixel) in msdf.enumerate_pixels() {
        let r = (pixel[0].clamp(0.0, 1.0) * 255.0) as u8;
        let g = (pixel[1].clamp(0.0, 1.0) * 255.0) as u8;
        let b = (pixel[2].clamp(0.0, 1.0) * 255.0) as u8;
        result.put_pixel(x, y, Rgb([r, g, b]));
    }

    Some(result)
}

#[cfg(test)]
mod tests {
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
        assert!(entry.is_some(), "should generate MSDF for 'A' from system font");
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
        if resolved.is_none() { return; }
        let resolved = resolved.unwrap();

        let mut mgr = MsdfAtlasManager::new();
        let entry = mgr.get_or_generate(&resolved.data, resolved.face_index, ' ');
        assert!(entry.is_some(), "space should get a slot even without outlines");
        assert!(entry.unwrap().advance > 0.0);
    }
}
