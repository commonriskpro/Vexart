# Registro de Benchmarks y Optimizaciones — Fase 3 (Transport & GPU)

Este documento registra la evolución del rendimiento de Vexart durante la implementación de las optimizaciones de la **Fase 3** ([ARCHITECTURE-AUDIT.md](ARCHITECTURE-AUDIT.md)).

---

## 1. Línea de Base (Baseline Inicial)

**Fecha**: 2026-09-18  
**Entorno**: darwin arm64 (Apple Silicon)  
**Versión**: v0.11.0-beta.9  
**Hardware**: macOS arm64  

### Engine Benchmark (`bun run benchmark`)

| Escenario | Frames | Avg (ms) | P50 (ms) | P95 (ms) | P99 (ms) | Jank % | Status |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Idle Efficiency** (Resting UI) | 3/120 | 2.04 | 2.25 | 2.43 | 2.43 | 0.0% | PASS |
| **Typing / Input Latency** (INP) | 87 | 0.31 | 0.27 | 0.63 | 0.73 | 0.0% | PASS |
| **Virtual Scroll & Culling** | 120 | 4.73 | 3.67 | 9.18 | 11.36 | 0.0% | PASS |
| **Hover Storm** (Interaction & Layers) | 120 | 2.42 | 1.96 | 4.83 | 6.54 | 0.0% | PASS |
| **60FPS Sustained Animation** | 300 | 0.89 | 0.82 | 1.52 | 1.98 | 0.0% | PASS |

### Frame Breakdown (`bun run bench:frame-breakdown --frames=30 --warmup=2`)

| Escenario | Dimensiones | Total P50 (ms) | Total P95 (ms) | Paint P95 (ms) | Layout P95 (ms) |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **dashboard-800x600** | 800×600 | 0.89 | 1.49 | 1.33 | 0.24 |
| **dashboard-1080p** | 1920×1080 | 1.52 | 2.40 | 2.24 | 0.26 |
| **noop-retained** | 1920×1080 | 0.00 | 0.01 | 0.00 | 0.00 |
| **dirty-region** | 1920×1080 | 0.17 | 0.38 | 0.28 | 0.05 |
| **compositor-only** | 1920×1080 | 0.07 | 0.12 | 0.07 | 0.00 |
| **hover-transition** | 1920×1080 | 0.39 | 0.60 | 0.52 | 0.01 |
| **scroll-heavy** | 1920×1080 | 0.67 | 0.99 | 0.81 | 0.16 |

---

## 2. Registro de Modificaciones y Resultados por Ítem

### Ítem 1: Delegar Image Scaling a GPU Sampler y eliminar LRU Cache en CPU

- **Commit**: `perf(engine): delegate image scaling to gpu samplers and remove cpu lru cache`
- **Archivos modificados**: `packages/engine/src/loop/image.ts`
- **Qué se hizo**:
  - Se eliminó el loop redundante de nearest-neighbor en CPU (`nearestNeighborScale`) y el LRU cache de 256 entradas de buffers `Uint8Array` (`scaledImageCaches`, `MAX_SCALED_CACHE_ENTRIES`).
  - Se delegó el escalado directamente a los samplers de hardware en el pipeline WGPU (`image_transform.wgsl` / `s_source` / `image_sampler`).
  - Se mantuvieron `scaleImage` y `createScaledImageCache` como stubs livianos sin overhead de copia para preservar compatibilidad de tipos en la API interna.
- **Resultado del Benchmark**:
  - **Virtual Scroll & Culling**: P95 bajó de **9.18 ms → 6.44 ms** (-29.8%).
  - **Hover Storm**: P95 bajó de **4.83 ms → 2.35 ms** (-51.3%).
  - **dashboard-1080p**: Total P95 bajó de **2.40 ms → 2.14 ms** (-10.8%); Paint P95 bajó de **2.24 ms → 1.99 ms** (-11.2%).
  - **dirty-region**: Total P95 bajó de **0.38 ms → 0.29 ms** (-23.7%).
- **Estado**: ✅ **COMPLETO Y FUNCIONAL**. Reducción medible de memoria y de latencia P95.

