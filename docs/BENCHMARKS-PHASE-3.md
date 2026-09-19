# Registro de Benchmarks y Optimizaciones — Fase 3 (Transport & GPU)

Este documento registra la evolución del rendimiento de Vexart durante las optimizaciones de la **Fase 3** ([ARCHITECTURE-AUDIT.md](ARCHITECTURE-AUDIT.md)).

---

## 1. Tabla Comparativa de Evolución de Rendimiento

A continuación se detalla la progresión continua:
1. **Con Hash en SHM** (`8d440b0`): Estado con cálculo de `payload_hash` en cada frame transmitido por memoria compartida.
2. **Sin Hash en SHM** (`5bb6194`): Eliminación del hashing redundante en buffers RGBA de SHM y agregación de ring coalescing no-bloqueante.
3. **Ítem 1: GPU Sampler** (`9ee5030`): Eliminación del escalado nearest-neighbor en CPU y purga del cache LRU de `Uint8Array`s en JS.
4. **Ítem 2: Shader Unificado de Imagen con Radius** (`HEAD`): Eliminación de la cascada de 3 copias y targets offscreen por imagen redondeada, unificando UV transform + object-fit + corner-radius en un solo draw pass.

### A. Engine Benchmark (`bun run benchmark`)

| Escenario | Métrica | 1. Con Hash (`8d440b0`) | 2. Sin Hash (`5bb6194`) | 3. GPU Sampler (`9ee5030`) | 4. Shader Radius (`HEAD`) | Delta Total (vs Con Hash) |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: |
| **Hover Storm** | P95 Latency | 7.08 ms | 4.83 ms | 2.35 ms | **4.04 ms** | 🟢 **-42.9%** |
| | Avg Latency | 3.07 ms | 2.42 ms | 1.74 ms | **2.07 ms** | 🟢 **-32.6%** |
| **Virtual Scroll** | P95 Latency | 7.01 ms | 9.18 ms | 6.44 ms | **6.39 ms** | 🟢 **-8.8%** |
| | Avg Latency | 4.01 ms | 4.73 ms | 3.95 ms | **3.89 ms** | 🟢 **-3.0%** |
| **60FPS Animation** | P95 Latency | 2.01 ms | 1.52 ms | 1.30 ms | **1.21 ms** | 🟢 **-39.8%** |
| | Avg Latency | 0.93 ms | 0.89 ms | 0.84 ms | **0.80 ms** | 🟢 **-14.0%** |
| **Typing / INP** | P95 Latency | 0.69 ms | 0.63 ms | 0.54 ms | **0.59 ms** | 🟢 **-14.5%** |
| | Avg Latency | 0.31 ms | 0.31 ms | 0.29 ms | **0.29 ms** | 🟢 **-6.5%** |
| **Idle Efficiency** | P95 Latency | 2.59 ms | 2.43 ms | 2.22 ms | **2.55 ms** | 🟢 **-1.5%** |
| | Avg Latency | 1.96 ms | 2.04 ms | 1.63 ms | **1.73 ms** | 🟢 **-11.7%** |

---

### B. Frame Breakdown (`bun run bench:frame-breakdown --frames=30 --warmup=2`)

| Escenario | Métrica | 1. Con Hash (`8d440b0`) | 2. Sin Hash (`5bb6194`) | 3. GPU Sampler (`9ee5030`) | 4. Shader Radius (`HEAD`) | Delta Total (vs Con Hash) |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: |
| **dashboard-1080p** | Total P95 | 3.73 ms | 2.40 ms | 2.14 ms | **1.94 ms** | 🟢 **-48.0%** |
| | Total P50 | 1.63 ms | 1.52 ms | 1.51 ms | **1.35 ms** | 🟢 **-17.2%** |
| | Paint P95 | 3.32 ms | 2.24 ms | 1.99 ms | **1.60 ms** | 🟢 **-51.8%** |
| **scroll-heavy** | Total P95 | 2.06 ms | 0.99 ms | 0.89 ms | **0.84 ms** | 🟢 **-59.2%** |
| | Paint P95 | 1.63 ms | 0.81 ms | 0.78 ms | **0.65 ms** | 🟢 **-60.1%** |
| **dirty-region** | Total P95 | 0.57 ms | 0.38 ms | 0.29 ms | **0.34 ms** | 🟢 **-40.4%** |
| | Paint P95 | 0.37 ms | 0.28 ms | 0.25 ms | **0.27 ms** | 🟢 **-27.0%** |
| **hover-transition** | Total P95 | 0.74 ms | 0.60 ms | 0.54 ms | **0.52 ms** | 🟢 **-29.7%** |
| | Paint P95 | 0.66 ms | 0.52 ms | 0.46 ms | **0.47 ms** | 🟢 **-28.8%** |
| **compositor-only** | Total P95 | 0.18 ms | 0.12 ms | 0.10 ms | **0.12 ms** | 🟢 **-33.3%** |
| **dashboard-800x600** | Total P95 | 1.42 ms | 1.49 ms | 1.40 ms | **1.57 ms** | 🟡 +10.5% |

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

### 3. Ítem 2: Shader Unificado para Imágenes con CornerRadius
- **Commit**: *(en progreso)* `perf(engine): unify image transform and corner-radius shader pass`
- **Qué se hizo**:
  - Se agregó soporte de SDF `corner_mask` en `image_transform.wgsl` aprovechando el campo padding `_pad2` en el struct ABI de 48 bytes `BridgeImageTransformInstance` (renombrado a `radius`).
  - Se conectó `packImageTransformInstance` y el backend en TypeScript para rutear imágenes con `cornerRadius` directamente a través de `transformedImageGroups` sin crear targets offscreen temporales.
  - Se eliminó el patrón de 3 etapas (`target_create` → render → copy → destroy → mask → copy → destroy) para imágenes con bordes redondeados.
- **Impacto principal**:
  - **dashboard-1080p**: Rompió la barrera de los 2.0ms (P95 cayó a **1.94 ms**, Paint P95 a **1.60 ms**).
  - **scroll-heavy**: Paint P95 cayó a **0.65 ms** (más de 60% de reducción vs con hash).
  - **60FPS Sustained Animation**: P95 cayó a **1.21 ms** (Avg **0.80 ms**).

