# TGE WGPU Canvas Bridge ABI v1

## Goal

Definir el contrato estable entre Bun/FFI y el bridge nativo `wgpu-native` para el backend de canvas GPU.

Este documento existe para evitar improvisación cuando el bridge empiece a renderizar de verdad.

---

## Design rules

1. **Bun/FFI-friendly first**
   - Evitar callbacks complejos en la primera versión.
   - Preferir handles opacos (`u64`) y buffers caller-owned.

2. **Offscreen first**
   - No surfaces de ventana en v1.
   - Solo render target offscreen + readback RGBA.

3. **Canvas-first**
   - El bridge nace para `CanvasPainterBackend`.
   - No intenta reemplazar todo el renderer en v1.

4. **Explicit stats**
   - GPU draw, readback y total deben salir medidos.

5. **Safe failure path**
   - Si el bridge no está listo o falla, TGE vuelve a CPU.

---

## Handle model

- `contextHandle: u64`
  - representa instance/adapter/device/queue del bridge.

- `targetHandle: u64`
  - representa un render target offscreen reutilizable.

Valor `0` siempre significa handle inválido / error.

---

## Error model

Todas las funciones que pueden fallar retornan `u32` status code.

### Status codes

- `0` = success
- `1` = unavailable
- `2` = invalid argument
- `3` = invalid handle
- `4` = unsupported
- `5` = internal error

El bridge guarda además un último error textual global para debugging.

### Error retrieval

- `tge_wgpu_canvas_bridge_get_last_error_length() -> u32`
- `tge_wgpu_canvas_bridge_copy_last_error(dst_ptr, dst_len) -> u32`

---

## C ABI structs

```c
typedef struct {
  uint32_t abi_version;
  uint32_t bridge_version;
  uint32_t available;
  uint32_t reserved;
} TgeWgpuBridgeInfo;

typedef struct {
  uint32_t power_preference;
  uint32_t backend_preference;
  uint32_t enable_validation;
  uint32_t reserved;
} TgeWgpuCanvasInitOptions;

typedef struct {
  uint32_t width;
  uint32_t height;
  uint32_t format;
  uint32_t reserved;
} TgeWgpuCanvasTargetDescriptor;

typedef struct {
  double gpu_ms;
  double readback_ms;
  double total_ms;
} TgeWgpuCanvasFrameStats;
```

---

## Exported functions

### Bridge introspection

- `tge_wgpu_canvas_bridge_version() -> u32`
- `tge_wgpu_canvas_bridge_available() -> u32`
- `tge_wgpu_canvas_bridge_fill_info(info_ptr) -> u32`

### Error retrieval

- `tge_wgpu_canvas_bridge_get_last_error_length() -> u32`
- `tge_wgpu_canvas_bridge_copy_last_error(dst_ptr, dst_len) -> u32`

### Context lifecycle

- `tge_wgpu_canvas_context_create(opts_ptr) -> u64`
- `tge_wgpu_canvas_context_destroy(context_handle) -> void`

### Target lifecycle

- `tge_wgpu_canvas_target_create(context_handle, desc_ptr) -> u64`
- `tge_wgpu_canvas_target_destroy(context_handle, target_handle) -> void`

### Minimal render / readback

- `tge_wgpu_canvas_target_render_clear(context_handle, target_handle, rgba_u32, stats_ptr) -> u32`
- `tge_wgpu_canvas_target_readback_rgba(context_handle, target_handle, dst_ptr, dst_len, stats_ptr) -> u32`

---

## v1 implementation scope

The first working bridge implementation only needs to support:

1. create context
2. create target
3. clear render target to one color
4. read back full RGBA image
5. report timings

If this works and beats CPU for controlled workloads, then we add real canvas primitives.

---

## TypeScript wrapper responsibilities

The TS side should:

- probe library existence
- load the ABI safely
- create/destroy context lazily
- create/destroy targets by size
- allocate the destination RGBA buffer
- pull last-error strings when status != success
- fall back to CPU painter on any failure

---

## Why this ABI first

Because this is the minimum contract that lets us answer the only question that matters now:

> Can `wgpu-native` reduce paint enough to justify the added bridge + readback cost?
