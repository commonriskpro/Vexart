// native/libvexart/benches/bench_kitty_encoding.rs
// Benchmark: Kitty frame encoding (compress + base64 + escape assembly).
// Target: <0.5ms for a 1920×1080 RGBA frame per REQ-2B-101.
//
// Run with: cargo bench --bench bench_kitty_encoding

use std::time::{Duration, Instant};

use vexart::kitty::encoder::encode_frame_direct;

/// Number of iterations to average over.
const ITERATIONS: u32 = 20;

/// Target latency per frame in microseconds.
const TARGET_US: u128 = 500;

fn main() {
    // ── 1920×1080 RGBA frame ──────────────────────────────────────────────
    let width: u32 = 1920;
    let height: u32 = 1080;
    let pixel_count = (width * height * 4) as usize;

    // Fill with typical UI content: mostly one background color with some variation.
    let mut rgba = vec![0u8; pixel_count];
    for i in 0..width * height {
        let idx = i as usize * 4;
        // Simulate UI: dark background with occasional bright elements.
        rgba[idx] = (i % 31) as u8;          // R
        rgba[idx + 1] = (i % 17) as u8;      // G
        rgba[idx + 2] = 0x1e;                 // B (near-constant = good compression)
        rgba[idx + 3] = 0xff;                 // A
    }

    // Warm-up (not measured).
    let _ = encode_frame_direct(&rgba, width, height, 1);

    // Timed runs.
    let mut total = Duration::ZERO;
    for iter in 0..ITERATIONS {
        let start = Instant::now();
        let _out = encode_frame_direct(&rgba, width, height, iter + 2);
        total += start.elapsed();
    }

    let avg_us = total.as_micros() / ITERATIONS as u128;
    let avg_ms = total.as_millis() as f64 / ITERATIONS as f64;

    println!("bench_kitty_encoding — 1920×1080 RGBA");
    println!("  iterations : {ITERATIONS}");
    println!("  avg time   : {avg_us} µs  ({avg_ms:.3} ms)");
    println!("  target     : < {TARGET_US} µs  (0.5 ms)");

    if avg_us < TARGET_US {
        println!("  result     : PASS ✓  ({avg_us} µs < {TARGET_US} µs)");
    } else {
        println!("  result     : MISS ✗  ({avg_us} µs ≥ {TARGET_US} µs) — see design note");
        // Not a hard failure — benchmark informs, does not block CI.
        // The Kitty encoding path is still functionally correct.
    }

    // ── 200×200 RGBA frame (sanity / quick check) ─────────────────────────
    let w2: u32 = 200;
    let h2: u32 = 200;
    let small_rgba = vec![0x1eu8; (w2 * h2 * 4) as usize];
    let start = Instant::now();
    let _out2 = encode_frame_direct(&small_rgba, w2, h2, 100);
    let small_us = start.elapsed().as_micros();
    println!("\nbench_kitty_encoding — 200×200 RGBA");
    println!("  time       : {small_us} µs");
}
