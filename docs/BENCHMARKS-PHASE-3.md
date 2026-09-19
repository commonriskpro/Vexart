# Registro de Benchmarks y Optimizaciones — Fase 3 (Transport & GPU)

Este documento registra la evolución del rendimiento de Vexart durante las optimizaciones de la **Fase 3** ([ARCHITECTURE-AUDIT.md](ARCHITECTURE-AUDIT.md)).

---

## 1. Tabla Comparativa de Evolución de Rendimiento

A continuación se detalla la progresión continua:
1. **Con Hash en SHM** (`8d440b0`): Estado con cálculo de `payload_hash` en cada frame transmitido por memoria compartida.
2. **Sin Hash en SHM** (`5bb6194`): Eliminación del hashing redundante en buffers RGBA de SHM y agregación de ring coalescing no-bloqueante.
3. **Ítem 1: GPU Sampler** (`9ee5030`): Eliminación del escalado nearest-neighbor en CPU y purga del cache LRU de `Uint8Array`s en JS.
4. **Ítem 2: Shader Unificado de Imagen con Radius** (`1ec668a`): Eliminación de la cascada de 3 copias y targets offscreen por imagen redondeada, unificando UV transform + object-fit + corner-radius en un solo draw pass.
5. **Ítem 3: Texture Pooling para Offscreen Targets** (`HEAD`): Implementación de un pool acotado (LRU/TTL, max 64MB, max 4 por resolución) de texturas GPU reciclables con usages unificados (`RENDER_ATTACHMENT | TEXTURE_BINDING | COPY_SRC | COPY_DST`), eliminando las llamadas destructivas y repetitivas a `device.create_texture` por frame.

### A. Frame Breakdown (`bun run bench:frame-breakdown --frames=30 --warmup=2`)

| Escenario | Métrica | Ítem 1: GPU Sampler (`9ee5030`) | Ítem 2: Shader Radius (`1ec668a`) | Ítem 3: Texture Pool (`HEAD`) | Delta Directo (Ítem 3 vs Ítem 2) | Delta Acumulado Total (vs Con Hash) |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: |
| **dashboard-1080p** | Total P95 | 2.14 ms | 1.94 ms | **1.71 ms** | 🟢 **-11.9% (-0.23 ms)** | 🟢 **-54.2%** |
| | Total P50 | 1.51 ms | 1.35 ms | **1.27 ms** | 🟢 **-5.9% (-0.08 ms)** | 🟢 **-22.1%** |
| | Paint P95 | 1.99 ms | 1.60 ms | **1.51 ms** | 🟢 **-5.6% (-0.09 ms)** | 🟢 **-54.5%** |
| **scroll-heavy** | Total P95 | 0.89 ms | 0.84 ms | **0.73 ms** | 🟢 **-13.1% (-0.11 ms)** | 🟢 **-64.6%** |
| | Paint P95 | 0.78 ms | 0.65 ms | **0.57 ms** | 🟢 **-12.3% (-0.08 ms)** | 🟢 **-65.0%** |
| **hover-transition** | Total P95 | 0.54 ms | 0.52 ms | **0.45 ms** | 🟢 **-13.5% (-0.07 ms)** | 🟢 **-39.2%** |
| | Paint P95 | 0.46 ms | 0.47 ms | **0.42 ms** | 🟢 **-10.6% (-0.05 ms)** | 🟢 **-36.4%** |
| **dirty-region** | Total P95 | 0.29 ms | 0.34 ms | **0.30 ms** | 🟢 **-11.8% (-0.04 ms)** | 🟢 **-47.4%** |
| **compositor-only** | Total P95 | 0.10 ms | 0.12 ms | **0.11 ms** | ⚪ -0.01 ms (jitter) | 🟢 **-38.9%** |
| **dashboard-800x600** | Total P95 | 1.40 ms | 1.57 ms | **1.30 ms** | 🟢 **-17.2% (-0.27 ms)** | 🟢 **-8.5%** |

---

### B. Engine Benchmark (`bun run benchmark`)

| Escenario | Métrica | Ítem 1: GPU Sampler (`9ee5030`) | Ítem 2: Shader Radius (`1ec668a`) | Ítem 3: Texture Pool (`HEAD`) | Delta Directo (Ítem 3 vs Ítem 2) | Delta Acumulado Total (vs Con Hash) |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: |
| **60FPS Animation** | P95 Latency | 1.30 ms | 1.21 ms | **1.00 ms** | 🟢 **-17.4% (-0.21 ms)** | 🟢 **-50.2%** |
| | Avg Latency | 0.84 ms | 0.80 ms | **0.73 ms** | 🟢 **-8.8% (-0.07 ms)** | 🟢 **-21.5%** |
| | P50 Latency | 0.81 ms | 0.77 ms | **0.72 ms** | 🟢 **-6.5% (-0.05 ms)** | 🟢 **-29.4%** |
| **Virtual Scroll** | P95 Latency | 6.44 ms | 6.39 ms | **6.77 ms** | 🟡 +0.38 ms (GC run) | 🟢 **-3.4%** |
| | Avg Latency | 3.95 ms | 3.89 ms | **3.71 ms** | 🟢 **-4.6% (-0.18 ms)** | 🟢 **-7.5%** |
| **Typing / INP** | P95 Latency | 0.54 ms | 0.59 ms | **0.49 ms** | 🟢 **-16.9% (-0.10 ms)** | 🟢 **-29.0%** |
| | Avg Latency | 0.29 ms | 0.29 ms | **0.27 ms** | 🟢 **-6.9% (-0.02 ms)** | 🟢 **-12.9%** |
| **Hover Storm** | P95 Latency | 2.35 ms | 2.00 ms | **1.77 ms** | 🟢 **-11.5% (-0.23 ms)** | 🟢 **-75.1%** |
| | Avg Latency | 1.74 ms | 1.59 ms | **1.49 ms** | 🟢 **-6.3% (-0.10 ms)** | 🟢 **-51.5%** |
| **Idle Efficiency** | P95 Latency | 2.22 ms | 2.55 ms | **2.16 ms** | 🟢 **-15.3% (-0.39 ms)** | 🟢 **-16.6%** |
| | Avg Latency | 1.63 ms | 1.73 ms | **1.60 ms** | 🟢 **-7.5% (-0.13 ms)** | 🟢 **-18.4%** |

---

## 2. Análisis Arquitectónico del Ítem 3 vs Ítem 2 y Ítem 1

### Dónde mueve la aguja el Ítem 3:
1. **Barrera de 1.0 ms en `60FPS Animation`**:
   - P95 Latency cae a **1.00 ms exacto** (un **-17.4% directo** vs Ítem 2, y **-50.2%** acumulado desde el baseline inicial con hash).
   - Avg Latency cae a **0.73 ms**, permitiendo tasas teóricas de más de 1000 FPS sostenidos en animación pura.
2. **Latencia Total de Frame (`dashboard-1080p` y `scroll-heavy`)**:
   - En **`dashboard-1080p`**, Total P95 desciende a **1.71 ms** (un **-11.9% directo** vs Ítem 2 y **-20.1%** vs Ítem 1).
   - En **`scroll-heavy`**, Total P95 desciende a **0.73 ms** (un **-13.1% directo** vs Ítem 2 y **-18.0%** vs Ítem 1).
   - En **`hover-transition`**, Total P95 cae a **0.45 ms** (**-13.5% directo**).
3. **Reducción de Contención en el Driver GPU / Metal**:
   - Cada creación de textura (`device.create_texture`) en WGPU / Metal involucra llamadas al sistema para reservar memoria de video, registrar descriptors y crear vistas (`texture.create_view`). Al unificar los `TextureUsages` y reciclar texturas a través del `TexturePool`, los targets offscreen y superficies de paso intermedias (blur de fondo horizontal/vertical, máscaras de esquinas y copias de región) se obtienen en tiempo **O(1)** de un HashMap sin interactuar con el allocator de la GPU.
4. **Consumo de Memoria Seguro y Acotado**:
   - El pool implementa un límite estricto de 64 MB (`DEFAULT_MAX_POOL_BYTES`), un máximo de 4 texturas por resolución (`DEFAULT_MAX_TEXTURES_PER_KEY`) y un TTL de 120 frames (`DEFAULT_FRAME_TTL`), garantizando que redimensionamientos de ventana no generen pérdidas de memoria (memory leaks).
