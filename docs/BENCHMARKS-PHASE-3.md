# Registro de Benchmarks y Optimizaciones — Fase 3 (Transport & GPU)

Este documento registra la evolución del rendimiento de Vexart durante las optimizaciones de la **Fase 3** ([ARCHITECTURE-AUDIT.md](ARCHITECTURE-AUDIT.md)).

---

## 1. Tabla Comparativa de Evolución de Rendimiento

A continuación se detalla la progresión continua:
1. **Con Hash en SHM** (`8d440b0`): Estado con cálculo de `payload_hash` en cada frame transmitido por memoria compartida.
2. **Sin Hash en SHM** (`5bb6194`): Eliminación del hashing redundante en buffers RGBA de SHM y agregación de ring coalescing no-bloqueante.
3. **Ítem 1: GPU Sampler** (`9ee5030`): Eliminación del escalado nearest-neighbor en CPU y purga del cache LRU de `Uint8Array`s en JS.

### A. Engine Benchmark (`bun run benchmark`)

| Escenario | Métrica | Con Hash (`8d440b0`) | Sin Hash (`5bb6194`) | Ítem 1: GPU Sampler (`9ee5030`) | Delta vs Con Hash | Delta vs Sin Hash |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: |
| **Hover Storm** | P95 Latency | 7.08 ms | 4.83 ms | **2.35 ms** | 🟢 **-66.8%** | 🟢 **-51.3%** |
| | Avg Latency | 3.07 ms | 2.42 ms | **1.74 ms** | 🟢 **-43.3%** | 🟢 **-28.1%** |
| **Virtual Scroll** | P95 Latency | 7.01 ms | 9.18 ms | **6.44 ms** | 🟢 **-8.1%** | 🟢 **-29.8%** |
| | Avg Latency | 4.01 ms | 4.73 ms | **3.95 ms** | 🟢 **-1.5%** | 🟢 **-16.5%** |
| **60FPS Animation** | P95 Latency | 2.01 ms | 1.52 ms | **1.30 ms** | 🟢 **-35.3%** | 🟢 **-14.5%** |
| | Avg Latency | 0.93 ms | 0.89 ms | **0.84 ms** | 🟢 **-9.7%** | 🟢 **-5.6%** |
| **Typing / INP** | P95 Latency | 0.69 ms | 0.63 ms | **0.54 ms** | 🟢 **-21.7%** | 🟢 **-14.3%** |
| | Avg Latency | 0.31 ms | 0.31 ms | **0.29 ms** | 🟢 **-6.5%** | 🟢 **-6.5%** |
| **Idle Efficiency** | P95 Latency | 2.59 ms | 2.43 ms | **2.22 ms** | 🟢 **-14.3%** | 🟢 **-8.6%** |
| | Avg Latency | 1.96 ms | 2.04 ms | **1.63 ms** | 🟢 **-16.8%** | 🟢 **-20.1%** |

---

### B. Frame Breakdown (`bun run bench:frame-breakdown --frames=30 --warmup=2`)

| Escenario | Métrica | Con Hash (`8d440b0`) | Sin Hash (`5bb6194`) | Ítem 1: GPU Sampler (`9ee5030`) | Delta Total (vs Con Hash) |
| :--- | :--- | :---: | :---: | :---: | :---: |
| **dashboard-1080p** | Total P95 | 3.73 ms | 2.40 ms | **2.14 ms** | 🟢 **-42.6%** |
| | Paint P95 | 3.32 ms | 2.24 ms | **1.99 ms** | 🟢 **-40.1%** |
| **scroll-heavy** | Total P95 | 2.06 ms | 0.99 ms | **0.89 ms** | 🟢 **-56.8%** |
| | Paint P95 | 1.63 ms | 0.81 ms | **0.78 ms** | 🟢 **-52.1%** |
| **dirty-region** | Total P95 | 0.57 ms | 0.38 ms | **0.29 ms** | 🟢 **-49.1%** |
| | Paint P95 | 0.37 ms | 0.28 ms | **0.25 ms** | 🟢 **-32.4%** |
| **hover-transition** | Total P95 | 0.74 ms | 0.60 ms | **0.54 ms** | 🟢 **-27.0%** |
| | Paint P95 | 0.66 ms | 0.52 ms | **0.46 ms** | 🟢 **-30.3%** |
| **compositor-only** | Total P95 | 0.18 ms | 0.12 ms | **0.10 ms** | 🟢 **-44.4%** |
| **dashboard-800x600** | Total P95 | 1.42 ms | 1.49 ms | **1.40 ms** | 🟢 **-1.4%** |

---

## 2. Detalle de Commits y Cambios por Fase

### 1. Eliminación de Payload Hashing en SHM
- **Commit**: `5bb6194 perf(engine): eliminate shm payload hashing and add non-blocking ring coalescing`
- **Qué se hizo**:
  - Se eliminó el loop de `payload_hash` (Fnva1a / SipHash) sobre cada frame RGBA de hasta 8MB transmitido por SHM.
  - Se implementó coalescing no bloqueante en el ring buffer cuando la terminal aún no consumió el slot previo.
- **Impacto principal**: Caída masiva en `scroll-heavy` (2.06ms → 0.99ms) y `dashboard-1080p` (3.73ms → 2.40ms).

### 2. Ítem 1: Delegar Image Scaling a GPU Sampler
- **Commit**: `9ee5030 perf(engine): delegate image scaling to gpu samplers and remove cpu lru cache`
- **Qué se hizo**:
  - Se eliminó la interpolación de pixels nearest-neighbor en CPU en JavaScript (`nearestNeighborScale`) y el cache LRU global de 256 entradas de buffers `Uint8Array` (`scaledImageCaches`).
  - Se delegó el escalado directamente a los samplers de hardware en el pipeline WGPU (`image_transform.wgsl` / `s_source` / `image_sampler`).
- **Impacto principal**: Caída de latencia P95 en `Hover Storm` (4.83ms → 2.35ms) y `Virtual Scroll` (9.18ms → 6.44ms), y reducción adicional en `dashboard-1080p` (2.40ms → 2.14ms).

