# Tasks — Rust-retained mutation protocol

- [x] Add SDD proposal/design/spec/tasks.
- [x] Add Rust explicit node creation and batch mutation decoder.
- [x] Add FFI export `vexart_scene_apply_mutations`.
- [x] Add Bun FFI symbol and TS native scene mutation queue.
- [x] Route existing native scene operations through the batch queue when enabled.
- [x] Flush queued mutations before native layout/render graph consumers.
- [x] Add Rust and TS tests for mutation batching.
- [ ] Verify full retained scene render cutover in a future phase.
