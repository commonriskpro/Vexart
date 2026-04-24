# Design: Phase 3g — Native Cleanup And Simplification

## Technical Approach

Remove code only after default cutover is proven. Cleanup must reduce maintenance surface without breaking explicit debug/test/offscreen APIs.

## Keep

- Public API wrappers.
- Callback registry.
- FFI bindings.
- Screenshot/offscreen/debug readback APIs.
- Emergency fallback only if founder extends the compatibility window.

## Delete Or Isolate

- TS render graph hot path.
- TS layer target cache and terminal image ownership.
- Normal-mode raw RGBA result variants.
- Stale tests asserting hybrid internals.

## Verification

- Typecheck and test suite pass.
- Search confirms normal presentation has no raw RGBA payload path.
- Docs refer to Rust-retained ownership consistently.
