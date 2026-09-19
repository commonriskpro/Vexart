// native/libvexart/src/font/layout.rs
// Unified text layout, intrinsic measurement, and line-breaking for Vexart.
//
// Inspired by Pretext's line-breaking algorithm and CSS `white-space: normal`
// + `overflow-wrap: break-word` behavior. Operates on font-unit advances
// from ttf-parser, scaled to pixel space, with font fallback support.
//
// Design: simple, correct, fast. No allocations in the hot path beyond
// the output Vec<LineRecord>.

use std::collections::HashMap;
use std::sync::Arc;
use ttf_parser::Face;

/// A single laid-out line of text.
#[derive(Debug, Clone, PartialEq)]
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

/// Line record for C-ABI export.
#[repr(C)]
#[derive(Debug, Clone, Copy, Default, PartialEq)]
pub struct LineRecord {
    pub start_byte: u32,
    pub end_byte: u32,
    pub width: f32,
    pub glyph_count: u32,
}

/// Layout metrics for C-ABI export.
#[repr(C)]
#[derive(Debug, Clone, Copy, Default, PartialEq)]
pub struct LayoutMetrics {
    pub total_width: f32,
    pub total_height: f32,
    pub max_content_width: f32,
    pub min_content_width: f32,
    pub line_count: u32,
    pub glyph_count: u32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum WhiteSpaceMode {
    Normal,
    PreWrap,
    NoWrap,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum WordBreakMode {
    Normal,
    KeepAll,
}

pub(crate) struct Measurer<'a, 'b> {
    face: &'a Face<'b>,
    scale: f32,
    font_size: f32,
    weight: u16,
    italic: bool,
    fallback_cache: HashMap<char, f32>,
}

impl<'a, 'b> Measurer<'a, 'b> {
    pub(crate) fn new(face: &'a Face<'b>, font_size: f32, weight: u16, italic: bool) -> Self {
        let units_per_em = face.units_per_em() as f32;
        let scale = if units_per_em > 0.0 {
            font_size / units_per_em
        } else {
            1.0
        };
        Self {
            face,
            scale,
            font_size,
            weight,
            italic,
            fallback_cache: HashMap::new(),
        }
    }

    pub(crate) fn measure_char(&mut self, ch: char) -> f32 {
        if let Some(gid) = self.face.glyph_index(ch) {
            if let Some(adv) = self.face.glyph_hor_advance(gid) {
                return adv as f32 * self.scale;
            }
        }
        if let Some(&adv) = self.fallback_cache.get(&ch) {
            return adv;
        }

        let mut font_system = crate::lock_or_recover(&crate::SHARED_FONT_SYSTEM);
        let adv = if let Some(resolved) = font_system.find_face_for_codepoint(ch, self.weight, self.italic) {
            if let Some(face) = resolved.parse() {
                if let Some(gid) = face.glyph_index(ch) {
                    if let Some(hor_adv) = face.glyph_hor_advance(gid) {
                        let scale = self.font_size / face.units_per_em().max(1) as f32;
                        hor_adv as f32 * scale
                    } else {
                        self.font_size * 0.5
                    }
                } else {
                    self.font_size * 0.5
                }
            } else {
                self.font_size * 0.5
            }
        } else {
            self.font_size * 0.5
        };
        self.fallback_cache.insert(ch, adv);
        adv
    }

    pub(crate) fn measure_str(&mut self, s: &str) -> f32 {
        s.chars().map(|c| self.measure_char(c)).sum()
    }
}

fn make_line_record(full_text: &str, line_slice: &str, width: f32) -> LineRecord {
    let start_byte = (line_slice.as_ptr() as usize - full_text.as_ptr() as usize) as u32;
    let end_byte = start_byte + line_slice.len() as u32;
    let glyph_count = line_slice.chars().count() as u32;
    LineRecord {
        start_byte,
        end_byte,
        width,
        glyph_count,
    }
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
                lines: vec![LayoutLine {
                    text: text.to_string(),
                    width: text.len() as f32 * font_size * 0.5,
                }],
                height: line_height,
            };
        }
    };

    let units_per_em = face.units_per_em() as f32;
    let _ = units_per_em;

    let (metrics, line_records) = layout_lines(
        text,
        &face,
        font_size,
        line_height,
        max_width,
        400,
        false,
        WhiteSpaceMode::Normal,
        WordBreakMode::Normal,
    );

    let lines = line_records
        .into_iter()
        .map(|lr| LayoutLine {
            text: text[lr.start_byte as usize..lr.end_byte as usize].to_string(),
            width: lr.width,
        })
        .collect();

    TextLayout {
        lines,
        height: metrics.total_height,
    }
}

/// Compute layout lines and metrics for text.
#[allow(clippy::too_many_arguments)]
pub fn layout_lines(
    text: &str,
    face: &Face<'_>,
    font_size: f32,
    line_height: f32,
    max_width: f32,
    weight: u16,
    italic: bool,
    white_space: WhiteSpaceMode,
    word_break: WordBreakMode,
) -> (LayoutMetrics, Vec<LineRecord>) {
    let eff_line_height = if line_height > 0.0 { line_height } else { font_size * 1.2 };

    if text.is_empty() {
        let metrics = LayoutMetrics {
            total_width: 0.0,
            total_height: eff_line_height,
            max_content_width: 0.0,
            min_content_width: 0.0,
            line_count: 1,
            glyph_count: 0,
        };
        let lines = vec![LineRecord {
            start_byte: 0,
            end_byte: 0,
            width: 0.0,
            glyph_count: 0,
        }];
        return (metrics, lines);
    }

    let mut measurer = Measurer::new(face, font_size, weight, italic);

    // Intrinsic metrics
    let mut max_content_width = 0.0f32;
    for p in text.split('\n') {
        let w = measurer.measure_str(p);
        if w > max_content_width {
            max_content_width = w;
        }
    }

    let min_content_width = match white_space {
        WhiteSpaceMode::NoWrap => max_content_width,
        _ => match word_break {
            WordBreakMode::KeepAll => {
                let mut max_word_w = 0.0f32;
                for w in text.split_whitespace() {
                    let w_w = measurer.measure_str(w);
                    if w_w > max_word_w {
                        max_word_w = w_w;
                    }
                }
                max_word_w
            }
            WordBreakMode::Normal => {
                let mut max_ch_w = 0.0f32;
                for ch in text.chars() {
                    if !ch.is_whitespace() {
                        let c_w = measurer.measure_char(ch);
                        if c_w > max_ch_w {
                            max_ch_w = c_w;
                        }
                    }
                }
                max_ch_w
            }
        },
    };

    let mut lines: Vec<LineRecord> = Vec::new();
    let no_wrap = max_width <= 0.0 || max_width.is_infinite() || white_space == WhiteSpaceMode::NoWrap;

    if no_wrap {
        for paragraph in text.split('\n') {
            let width = measurer.measure_str(paragraph);
            lines.push(make_line_record(text, paragraph, width));
        }
    } else if white_space == WhiteSpaceMode::PreWrap {
        for paragraph in text.split('\n') {
            if paragraph.is_empty() {
                lines.push(make_line_record(text, paragraph, 0.0));
                continue;
            }
            layout_prewrap_paragraph(
                &mut measurer,
                text,
                paragraph,
                max_width,
                word_break,
                &mut lines,
            );
        }
    } else {
        // WhiteSpaceMode::Normal
        for paragraph in text.split('\n') {
            if paragraph.split_whitespace().next().is_none() {
                lines.push(make_line_record(text, &paragraph[0..0], 0.0));
                continue;
            }
            layout_normal_paragraph(
                &mut measurer,
                text,
                paragraph,
                max_width,
                word_break,
                &mut lines,
            );
        }
    }

    if lines.is_empty() {
        lines.push(LineRecord {
            start_byte: 0,
            end_byte: 0,
            width: 0.0,
            glyph_count: 0,
        });
    }

    let line_count = lines.len() as u32;
    let glyph_count = lines.iter().map(|l| l.glyph_count).sum();
    let total_width = lines.iter().map(|l| l.width).fold(0.0f32, f32::max);
    let total_height = line_count as f32 * eff_line_height;

    let metrics = LayoutMetrics {
        total_width,
        total_height,
        max_content_width,
        min_content_width,
        line_count,
        glyph_count,
    };

    (metrics, lines)
}

/// Compute layout metrics and optionally write line records to a buffer.
#[allow(clippy::too_many_arguments)]
pub fn layout_measure(
    text: &str,
    face: &Face<'_>,
    font_size: f32,
    line_height: f32,
    max_width: f32,
    weight: u16,
    italic: bool,
    white_space: WhiteSpaceMode,
    word_break: WordBreakMode,
    mut lines_out: Option<&mut [LineRecord]>,
) -> (LayoutMetrics, usize) {
    let (metrics, lines) = layout_lines(
        text,
        face,
        font_size,
        line_height,
        max_width,
        weight,
        italic,
        white_space,
        word_break,
    );

    let mut written = 0;
    if let Some(ref mut out) = lines_out {
        let to_write = out.len().min(lines.len());
        out[..to_write].copy_from_slice(&lines[..to_write]);
        written = to_write;
    }

    (metrics, written)
}

fn layout_normal_paragraph(
    measurer: &mut Measurer<'_, '_>,
    full_text: &str,
    paragraph: &str,
    max_width: f32,
    word_break: WordBreakMode,
    lines: &mut Vec<LineRecord>,
) {
    let words: Vec<(&str, usize, usize)> = paragraph
        .split_whitespace()
        .map(|w| {
            let offset = w.as_ptr() as usize - paragraph.as_ptr() as usize;
            (w, offset, offset + w.len())
        })
        .collect();

    if words.is_empty() {
        lines.push(make_line_record(full_text, &paragraph[0..0], 0.0));
        return;
    }

    let space_w = measurer.measure_char(' ');
    let mut cur_start = 0;
    let mut cur_end = 0;
    let mut cur_w = 0.0f32;
    let mut has_cur = false;

    for (word, w_start, w_end) in words {
        let word_w = measurer.measure_str(word);

        if !has_cur {
            if word_w > max_width {
                match word_break {
                    WordBreakMode::KeepAll => {
                        let slice = &paragraph[w_start..w_end];
                        lines.push(make_line_record(full_text, slice, word_w));
                    }
                    WordBreakMode::Normal => {
                        char_break_word(
                            measurer,
                            full_text,
                            paragraph,
                            w_start,
                            word,
                            max_width,
                            lines,
                            &mut cur_start,
                            &mut cur_end,
                            &mut cur_w,
                            &mut has_cur,
                        );
                    }
                }
            } else {
                cur_start = w_start;
                cur_end = w_end;
                cur_w = word_w;
                has_cur = true;
            }
            continue;
        }

        let proposed = cur_w + space_w + word_w;
        if proposed <= max_width {
            cur_end = w_end;
            cur_w = proposed;
        } else {
            let slice = &paragraph[cur_start..cur_end];
            let w = measurer.measure_str(slice);
            lines.push(make_line_record(full_text, slice, w));
            has_cur = false;

            if word_w > max_width {
                match word_break {
                    WordBreakMode::KeepAll => {
                        let slice = &paragraph[w_start..w_end];
                        lines.push(make_line_record(full_text, slice, word_w));
                    }
                    WordBreakMode::Normal => {
                        char_break_word(
                            measurer,
                            full_text,
                            paragraph,
                            w_start,
                            word,
                            max_width,
                            lines,
                            &mut cur_start,
                            &mut cur_end,
                            &mut cur_w,
                            &mut has_cur,
                        );
                    }
                }
            } else {
                cur_start = w_start;
                cur_end = w_end;
                cur_w = word_w;
                has_cur = true;
            }
        }
    }

    if has_cur {
        let slice = &paragraph[cur_start..cur_end];
        let w = measurer.measure_str(slice);
        lines.push(make_line_record(full_text, slice, w));
    }
}

#[allow(clippy::too_many_arguments)]
fn char_break_word(
    measurer: &mut Measurer<'_, '_>,
    full_text: &str,
    paragraph: &str,
    word_start_in_para: usize,
    word: &str,
    max_width: f32,
    lines: &mut Vec<LineRecord>,
    cur_start: &mut usize,
    cur_end: &mut usize,
    cur_w: &mut f32,
    has_cur: &mut bool,
) {
    let mut chunk_start = 0;
    let mut chunk_w = 0.0f32;

    for (idx, ch) in word.char_indices() {
        let ch_w = measurer.measure_char(ch);
        if chunk_w > 0.0 && chunk_w + ch_w > max_width {
            let slice = &paragraph[(word_start_in_para + chunk_start)..(word_start_in_para + idx)];
            lines.push(make_line_record(full_text, slice, chunk_w));
            chunk_start = idx;
            chunk_w = 0.0;
        }
        chunk_w += ch_w;
    }

    if chunk_start < word.len() {
        *cur_start = word_start_in_para + chunk_start;
        *cur_end = word_start_in_para + word.len();
        *cur_w = chunk_w;
        *has_cur = true;
    } else {
        *has_cur = false;
    }
}

fn layout_prewrap_paragraph(
    measurer: &mut Measurer<'_, '_>,
    full_text: &str,
    paragraph: &str,
    max_width: f32,
    word_break: WordBreakMode,
    lines: &mut Vec<LineRecord>,
) {
    let mut tokens: Vec<(&str, usize, usize, bool)> = Vec::new();
    let mut token_start = 0;
    let mut in_ws = None;

    for (idx, ch) in paragraph.char_indices() {
        let is_ws = ch.is_whitespace();
        if let Some(ws) = in_ws {
            if ws != is_ws {
                tokens.push((&paragraph[token_start..idx], token_start, idx, ws));
                token_start = idx;
                in_ws = Some(is_ws);
            }
        } else {
            in_ws = Some(is_ws);
        }
    }
    if token_start < paragraph.len() {
        tokens.push((
            &paragraph[token_start..],
            token_start,
            paragraph.len(),
            in_ws.unwrap_or(false),
        ));
    }

    let mut cur_start = 0;
    let mut cur_end = 0;
    let mut cur_w = 0.0f32;
    let mut has_cur = false;

    for (token, t_start, t_end, is_ws) in tokens {
        let token_w = measurer.measure_str(token);

        if is_ws {
            if !has_cur {
                cur_start = t_start;
                cur_end = t_end;
                cur_w = token_w;
                has_cur = true;
            } else {
                let proposed = cur_w + token_w;
                if proposed <= max_width {
                    cur_end = t_end;
                    cur_w = proposed;
                } else {
                    let slice = &paragraph[cur_start..cur_end];
                    lines.push(make_line_record(full_text, slice, cur_w));
                    cur_start = t_start;
                    cur_end = t_end;
                    cur_w = token_w;
                    has_cur = true;
                }
            }
            continue;
        }

        if !has_cur {
            if token_w > max_width {
                match word_break {
                    WordBreakMode::KeepAll => {
                        let slice = &paragraph[t_start..t_end];
                        lines.push(make_line_record(full_text, slice, token_w));
                    }
                    WordBreakMode::Normal => {
                        char_break_word(
                            measurer,
                            full_text,
                            paragraph,
                            t_start,
                            token,
                            max_width,
                            lines,
                            &mut cur_start,
                            &mut cur_end,
                            &mut cur_w,
                            &mut has_cur,
                        );
                    }
                }
            } else {
                cur_start = t_start;
                cur_end = t_end;
                cur_w = token_w;
                has_cur = true;
            }
        } else {
            let proposed = cur_w + token_w;
            if proposed <= max_width {
                cur_end = t_end;
                cur_w = proposed;
            } else {
                let slice = &paragraph[cur_start..cur_end];
                lines.push(make_line_record(full_text, slice, cur_w));
                has_cur = false;

                if token_w > max_width {
                    match word_break {
                        WordBreakMode::KeepAll => {
                            let slice = &paragraph[t_start..t_end];
                            lines.push(make_line_record(full_text, slice, token_w));
                        }
                        WordBreakMode::Normal => {
                            char_break_word(
                                measurer,
                                full_text,
                                paragraph,
                                t_start,
                                token,
                                max_width,
                                lines,
                                &mut cur_start,
                                &mut cur_end,
                                &mut cur_w,
                                &mut has_cur,
                            );
                        }
                    }
                } else {
                    cur_start = t_start;
                    cur_end = t_end;
                    cur_w = token_w;
                    has_cur = true;
                }
            }
        }
    }

    if has_cur {
        let slice = &paragraph[cur_start..cur_end];
        lines.push(make_line_record(full_text, slice, cur_w));
    }
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
        let (data, idx) = match get_test_font() {
            Some(f) => f,
            None => return,
        };
        let layout = layout_text("Hello world", &data, idx, 14.0, 17.0, 0.0);
        assert_eq!(layout.lines.len(), 1);
        assert_eq!(layout.lines[0].text, "Hello world");
        assert!(layout.lines[0].width > 0.0);
    }

    #[test]
    fn test_layout_hard_break() {
        let (data, idx) = match get_test_font() {
            Some(f) => f,
            None => return,
        };
        let layout = layout_text("Hello\nworld", &data, idx, 14.0, 17.0, 0.0);
        assert_eq!(layout.lines.len(), 2);
        assert_eq!(layout.lines[0].text, "Hello");
        assert_eq!(layout.lines[1].text, "world");
        assert!((layout.height - 34.0).abs() < 0.01);
    }

    #[test]
    fn test_layout_word_wrap() {
        let (data, idx) = match get_test_font() {
            Some(f) => f,
            None => return,
        };
        // Use a very small max_width to force wrapping.
        let layout = layout_text("Hello beautiful world", &data, idx, 14.0, 17.0, 60.0);
        // With a 60px width and 14px font, "Hello beautiful" likely won't fit.
        assert!(
            layout.lines.len() >= 2,
            "should wrap into multiple lines, got {}",
            layout.lines.len()
        );
        // Each line should be within max_width.
        for line in &layout.lines {
            assert!(
                line.width <= 60.0 + 1.0, // small tolerance for rounding
                "line '{}' width {} exceeds max_width 60",
                line.text,
                line.width
            );
        }
    }

    #[test]
    fn test_layout_overflow_wrap() {
        let (data, idx) = match get_test_font() {
            Some(f) => f,
            None => return,
        };
        // Long word with very narrow container → must break mid-word.
        let layout = layout_text("Superlongword", &data, idx, 14.0, 17.0, 40.0);
        assert!(
            layout.lines.len() >= 2,
            "should char-break a long word, got {}",
            layout.lines.len()
        );
    }

    #[test]
    fn test_layout_empty_text() {
        let (data, idx) = match get_test_font() {
            Some(f) => f,
            None => return,
        };
        let layout = layout_text("", &data, idx, 14.0, 17.0, 200.0);
        assert_eq!(layout.lines.len(), 1);
        assert!(layout.lines[0].text.is_empty());
    }

    #[test]
    fn test_layout_multiple_hard_breaks() {
        let (data, idx) = match get_test_font() {
            Some(f) => f,
            None => return,
        };
        let layout = layout_text("a\n\nb\n", &data, idx, 14.0, 17.0, 200.0);
        // "a", "", "b", ""
        assert_eq!(layout.lines.len(), 4);
        assert_eq!(layout.lines[0].text, "a");
        assert!(layout.lines[1].text.is_empty());
        assert_eq!(layout.lines[2].text, "b");
        assert!(layout.lines[3].text.is_empty());
    }

    #[test]
    fn test_layout_measure_intrinsics_and_records() {
        let (data, idx) = match get_test_font() {
            Some(f) => f,
            None => return,
        };
        let face = Face::parse(&data, idx).expect("parse face");
        let mut lines_buf = [LineRecord::default(); 16];

        let text = "Hello beautiful world";
        let (metrics, written) = layout_measure(
            text,
            &face,
            14.0,
            17.0,
            60.0,
            400,
            false,
            WhiteSpaceMode::Normal,
            WordBreakMode::Normal,
            Some(&mut lines_buf),
        );

        assert!(metrics.line_count >= 2);
        assert_eq!(written, metrics.line_count as usize);
        assert!(metrics.max_content_width > 60.0);
        assert!(metrics.min_content_width > 0.0 && metrics.min_content_width < 60.0);
        assert_eq!(metrics.glyph_count, text.chars().filter(|c| !c.is_whitespace()).count() as u32);

        for i in 0..written {
            let lr = lines_buf[i];
            let slice = &text[lr.start_byte as usize..lr.end_byte as usize];
            assert!(!slice.is_empty());
            assert!(lr.width <= 60.0 + 1.0);
        }
    }

    #[test]
    fn test_layout_measure_prewrap_and_keep_all() {
        let (data, idx) = match get_test_font() {
            Some(f) => f,
            None => return,
        };
        let face = Face::parse(&data, idx).expect("parse face");

        let (metrics_keep_all, _) = layout_measure(
            "supercalifragilisticexpialidocious",
            &face,
            14.0,
            17.0,
            50.0,
            400,
            false,
            WhiteSpaceMode::Normal,
            WordBreakMode::KeepAll,
            None,
        );
        assert_eq!(metrics_keep_all.line_count, 1);
        assert!(metrics_keep_all.total_width > 50.0);

        let (metrics_normal, _) = layout_measure(
            "supercalifragilisticexpialidocious",
            &face,
            14.0,
            17.0,
            50.0,
            400,
            false,
            WhiteSpaceMode::Normal,
            WordBreakMode::Normal,
            None,
        );
        assert!(metrics_normal.line_count > 1);
        assert!(metrics_normal.total_width <= 50.0 + 1.0);
    }
}
