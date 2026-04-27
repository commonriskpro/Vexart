// native/libvexart/src/font/layout.rs
// Greedy line-breaking text layout for the MSDF pipeline.
//
// Inspired by Pretext's line-breaking algorithm and CSS `white-space: normal`
// + `overflow-wrap: break-word` behavior. Operates on font-unit advances
// from ttf-parser, scaled to pixel space.
//
// Design: simple, correct, fast. No allocations in the hot path beyond
// the output Vec<LayoutLine>.

use std::sync::Arc;
use ttf_parser::Face;

/// A single laid-out line of text.
#[derive(Debug, Clone)]
pub struct LayoutLine {
    /// Characters in this line (owned slice of the input text).
    pub text: String,
    /// Width of this line in pixels.
    pub width: f32,
}

/// Result of laying out text into lines.
#[derive(Debug, Clone)]
pub struct TextLayout {
    pub lines: Vec<LayoutLine>,
    /// Total height in pixels (lines.len() * line_height).
    pub height: f32,
}

/// Lay out text with greedy word-wrapping.
///
/// Algorithm (matches CSS `white-space: normal` + `overflow-wrap: break-word`):
/// 1. Split on hard breaks (`\n`)
/// 2. For each paragraph, split into words on whitespace
/// 3. Greedily fit words onto lines within `max_width`
/// 4. If a single word is wider than `max_width`, break at character boundaries
///
/// `face_data` + `face_index`: the font to measure advances from.
/// `font_size`: target size in pixels.
/// `line_height`: vertical advance per line in pixels.
/// `max_width`: maximum line width in pixels (0 or infinity = no wrap).
pub fn layout_text(
    text: &str,
    face_data: &Arc<Vec<u8>>,
    face_index: u32,
    font_size: f32,
    line_height: f32,
    max_width: f32,
) -> TextLayout {
    let face = match Face::parse(face_data, face_index) {
        Ok(f) => f,
        Err(_) => {
            // Can't parse font — return single line with approximate width.
            return TextLayout {
                lines: vec![LayoutLine { text: text.to_string(), width: text.len() as f32 * font_size * 0.5 }],
                height: line_height,
            };
        }
    };

    let units_per_em = face.units_per_em() as f32;
    let scale = font_size / units_per_em;
    let no_wrap = max_width <= 0.0 || max_width.is_infinite();

    let mut lines: Vec<LayoutLine> = Vec::new();

    // Split on hard breaks first.
    for paragraph in text.split('\n') {
        if no_wrap {
            // No wrapping — emit the whole paragraph as one line.
            let width = measure_str(&face, paragraph, scale);
            lines.push(LayoutLine {
                text: paragraph.to_string(),
                width,
            });
            continue;
        }

        // Greedy word-wrap within this paragraph.
        layout_paragraph(&face, paragraph, scale, max_width, font_size, &mut lines);
    }

    // Ensure at least one line (empty text → one empty line).
    if lines.is_empty() {
        lines.push(LayoutLine {
            text: String::new(),
            width: 0.0,
        });
    }

    let height = lines.len() as f32 * line_height;
    TextLayout { lines, height }
}

/// Greedy word-wrap a single paragraph (no hard breaks).
fn layout_paragraph(
    face: &Face<'_>,
    paragraph: &str,
    scale: f32,
    max_width: f32,
    font_size: f32,
    lines: &mut Vec<LayoutLine>,
) {
    let words: Vec<&str> = paragraph.split_whitespace().collect();

    if words.is_empty() {
        // Empty paragraph → empty line.
        lines.push(LayoutLine {
            text: String::new(),
            width: 0.0,
        });
        return;
    }

    let space_advance = measure_char(face, ' ', scale);
    let mut current_text = String::new();
    let mut current_width: f32 = 0.0;

    for word in words {
        let word_width = measure_str(face, word, scale);

        if current_text.is_empty() {
            // First word on line.
            if word_width > max_width {
                // Word itself is wider than max_width → break at character boundaries.
                char_break_word(face, word, scale, max_width, font_size, lines);
                // After char-breaking, the last partial line becomes current.
                if let Some(last) = lines.last() {
                    current_text = last.text.clone();
                    current_width = last.width;
                    lines.pop();
                }
            } else {
                current_text.push_str(word);
                current_width = word_width;
            }
            continue;
        }

        let proposed = current_width + space_advance + word_width;
        if proposed <= max_width {
            // Fits on current line.
            current_text.push(' ');
            current_text.push_str(word);
            current_width = proposed;
        } else {
            // Doesn't fit → break line, start new one.
            lines.push(LayoutLine {
                text: std::mem::take(&mut current_text),
                width: current_width,
            });

            if word_width > max_width {
                char_break_word(face, word, scale, max_width, font_size, lines);
                if let Some(last) = lines.last() {
                    current_text = last.text.clone();
                    current_width = last.width;
                    lines.pop();
                }
            } else {
                current_text.push_str(word);
                current_width = word_width;
            }
        }
    }

    // Flush remaining text.
    if !current_text.is_empty() {
        lines.push(LayoutLine {
            text: current_text,
            width: current_width,
        });
    }
}

/// Break a word at character boundaries when it's wider than max_width.
/// (CSS overflow-wrap: break-word behavior)
fn char_break_word(
    face: &Face<'_>,
    word: &str,
    scale: f32,
    max_width: f32,
    _font_size: f32,
    lines: &mut Vec<LayoutLine>,
) {
    let mut current_text = String::new();
    let mut current_width: f32 = 0.0;

    for ch in word.chars() {
        let ch_width = measure_char(face, ch, scale);

        if current_width > 0.0 && current_width + ch_width > max_width {
            // Break before this character.
            lines.push(LayoutLine {
                text: std::mem::take(&mut current_text),
                width: current_width,
            });
            current_width = 0.0;
        }

        current_text.push(ch);
        current_width += ch_width;
    }

    // Flush remaining.
    if !current_text.is_empty() {
        lines.push(LayoutLine {
            text: current_text,
            width: current_width,
        });
    }
}

/// Measure the advance width of a single character.
fn measure_char(face: &Face<'_>, ch: char, scale: f32) -> f32 {
    if let Some(glyph_id) = face.glyph_index(ch) {
        if let Some(advance) = face.glyph_hor_advance(glyph_id) {
            return advance as f32 * scale;
        }
    }
    // Fallback: approximate as 0.5em.
    scale * face.units_per_em() as f32 * 0.5
}

/// Measure the advance width of a string.
fn measure_str(face: &Face<'_>, text: &str, scale: f32) -> f32 {
    text.chars().map(|ch| measure_char(face, ch, scale)).sum()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::font::system::FontSystem;

    fn get_test_font() -> Option<(Arc<Vec<u8>>, u32)> {
        let mut sys = FontSystem::new();
        let resolved = sys.query_face(&["sans-serif"], 400, false)?;
        Some((resolved.data, resolved.face_index))
    }

    #[test]
    fn test_layout_single_line_no_wrap() {
        let (data, idx) = match get_test_font() { Some(f) => f, None => return };
        let layout = layout_text("Hello world", &data, idx, 14.0, 17.0, 0.0);
        assert_eq!(layout.lines.len(), 1);
        assert_eq!(layout.lines[0].text, "Hello world");
        assert!(layout.lines[0].width > 0.0);
    }

    #[test]
    fn test_layout_hard_break() {
        let (data, idx) = match get_test_font() { Some(f) => f, None => return };
        let layout = layout_text("Hello\nworld", &data, idx, 14.0, 17.0, 0.0);
        assert_eq!(layout.lines.len(), 2);
        assert_eq!(layout.lines[0].text, "Hello");
        assert_eq!(layout.lines[1].text, "world");
        assert!((layout.height - 34.0).abs() < 0.01);
    }

    #[test]
    fn test_layout_word_wrap() {
        let (data, idx) = match get_test_font() { Some(f) => f, None => return };
        // Use a very small max_width to force wrapping.
        let layout = layout_text("Hello beautiful world", &data, idx, 14.0, 17.0, 60.0);
        // With a 60px width and 14px font, "Hello beautiful" likely won't fit.
        assert!(layout.lines.len() >= 2, "should wrap into multiple lines, got {}", layout.lines.len());
        // Each line should be within max_width.
        for line in &layout.lines {
            assert!(
                line.width <= 60.0 + 1.0, // small tolerance for rounding
                "line '{}' width {} exceeds max_width 60",
                line.text, line.width
            );
        }
    }

    #[test]
    fn test_layout_overflow_wrap() {
        let (data, idx) = match get_test_font() { Some(f) => f, None => return };
        // Long word with very narrow container → must break mid-word.
        let layout = layout_text("Superlongword", &data, idx, 14.0, 17.0, 40.0);
        assert!(layout.lines.len() >= 2, "should char-break a long word, got {}", layout.lines.len());
    }

    #[test]
    fn test_layout_empty_text() {
        let (data, idx) = match get_test_font() { Some(f) => f, None => return };
        let layout = layout_text("", &data, idx, 14.0, 17.0, 200.0);
        assert_eq!(layout.lines.len(), 1);
        assert!(layout.lines[0].text.is_empty());
    }

    #[test]
    fn test_layout_multiple_hard_breaks() {
        let (data, idx) = match get_test_font() { Some(f) => f, None => return };
        let layout = layout_text("a\n\nb\n", &data, idx, 14.0, 17.0, 200.0);
        // "a", "", "b", ""
        assert_eq!(layout.lines.len(), 4);
        assert_eq!(layout.lines[0].text, "a");
        assert!(layout.lines[1].text.is_empty());
        assert_eq!(layout.lines[2].text, "b");
        assert!(layout.lines[3].text.is_empty());
    }
}
