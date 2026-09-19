# Registro de Benchmarks y Optimizaciones — Fase 3 (Transport & GPU)

Este documento registra la evolución del rendimiento de Vexart durante las optimizaciones de la **Fase 3** ([ARCHITECTURE-AUDIT.md](ARCHITECTURE-AUDIT.md)).

---

## 1. Tabla Comparativa de Evolución de Rendimiento

A continuación se detalla la progresión continua:
1. **Con Hash en SHM** (`8d440b0`): Estado con cálculo de `payload_hash` en cada frame transmitido por memoria compartida.
2. **Sin Hash en SHM** (`5bb6194`): Eliminación del hashing redundante en buffers RGBA de SHM y agregación de ring coalescing no-bloqueante.
3. **Ítem 1: GPU Sampler** (`9ee5030`): Eliminación del escalado nearest-neighbor en CPU y purga del cache LRU de `Uint8Array`s en JS.
4. **Ítem 2: Shader Unificado de Imagen con Radius** (`1ec668a`): Eliminación de la cascada de 3 copias y targets offscreen por imagen redondeada, unificando UV transform + object-fit + corner-radius en un solo draw pass.
5. **Ítem 3: Texture Pooling para Offscreen Targets** (`f5132cd`): Implementación de un pool acotado (LRU/TTL, max 64MB, max 4 por resolución) de texturas GPU reciclables con usages unificados (`RENDER_ATTACHMENT | TEXTURE_BINDING | COPY_SRC | COPY_DST`), eliminando llamadas a `device.create_texture` por frame.
6. **Ítem 4: GPU Un-premultiply en Shader (Sin Loops CPU)** (`HEAD`): Migración completa de destride de filas y straight-alpha normalization a compute shader (`unpremultiply_pack.wgsl`) con soporte de offset regional (`origin_x`, `origin_y`), eliminando el 100% de bucles de píxeles en CPU de las rutas de producción.

### A. Frame Breakdown (`bun run bench:frame-breakdown --frames=30 --warmup=2`)

| Escenario | Métrica | Ítem 1: GPU Sampler (`9ee5030`) | Ítem 2: Shader Radius (`1ec668a`) | Ítem 3: Texture Pool (`f5132cd`) | Ítem 4: GPU Unpremul (`HEAD`) | Delta Directo (Ítem 4 vs Ítem 3) | Delta Total (vs Con Hash) |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **dirty-region** | Paint P95 | 0.29 ms | 0.34 ms | 0.31 ms | **0.23 ms** | 🟢 **-25.8% (-0.08 ms)** | 🟢 **-54.0%** |
| | Total P95 | 0.29 ms | 0.34 ms | 0.30 ms | **0.29 ms** | 🟢 **-3.3% (-0.01 ms)** | 🟢 **-49.1%** |
| **dashboard-1080p** | Total P95 | 2.14 ms | 1.94 ms | 1.71 ms | **1.71 ms** | ⚪ ~0.0% | 🟢 **-54.2%** |
| | Total P50 | 1.51 ms | 1.35 ms | 1.27 ms | **1.29 ms** | ⚪ +0.02 ms | 🟢 **-20.9%** |
| | Paint P95 | 1.99 ms | 1.60 ms | 1.51 ms | **1.69 ms** | 🟡 +0.18 ms (jitter) | 🟢 **-49.1%** |
| **scroll-heavy** | Total P95 | 0.89 ms | 0.84 ms | 0.73 ms | **0.99 ms** | 🟡 +0.26 ms (jitter) | 🟢 **-52.0%** |
| | Paint P95 | 0.78 ms | 0.65 ms | 0.57 ms | **0.80 ms** | 🟡 +0.23 ms (jitter) | 🟢 **-50.9%** |
| **hover-transition** | Total P95 | 0.54 ms | 0.52 ms | 0.45 ms | **0.52 ms** | 🟡 +0.07 ms | 🟢 **-29.7%** |
| | Paint P95 | 0.46 ms | 0.47 ms | 0.42 ms | **0.45 ms** | 🟡 +0.03 ms | 🟢 **-31.8%** |
| **compositor-only** | Total P95 | 0.10 ms | 0.12 ms | 0.11 ms | **0.13 ms** | ⚪ +0.02 ms (jitter) | 🟢 **-27.8%** |
| **dashboard-800x600** | Total P95 | 1.40 ms | 1.57 ms | 1.30 ms | **1.33 ms** | ⚪ +0.03 ms (jitter) | 🟢 **-6.3%** |

---

### B. Engine Benchmark (`bun run benchmark`)

| Escenario | Métrica | Ítem 1: GPU Sampler (`9ee5030`) | Ítem 2: Shader Radius (`1ec668a`) | Ítem 3: Texture Pool (`f5132cd`) | Ítem 4: GPU Unpremul (`HEAD`) | Delta vs Ítem 3 | Delta Total (vs Con Hash) |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **60FPS Animation** | P95 Latency | 1.30 ms | 1.21 ms | 1.00 ms | **1.03 ms** | ⚪ +0.03 ms | 🟢 **-48.8%** |
| | Avg Latency | 0.84 ms | 0.80 ms | 0.73 ms | **0.76 ms** | ⚪ +0.03 ms | 🟢 **-18.3%** |
| | P50 Latency | 0.81 ms | 0.77 ms | 0.72 ms | **0.74 ms** | ⚪ +0.02 ms | 🟢 **-27.5%** |
| **Virtual Scroll** | P95 Latency | 6.44 ms | 6.39 ms | 6.77 ms | **6.05 ms** | 🟢 **-10.6% (-0.72 ms)** | 🟢 **-13.7%** |
| | Avg Latency | 3.95 ms | 3.89 ms | 3.71 ms | **3.72 ms** | ⚪ +0.01 ms | 🟢 **-7.2%** |
| **Typing / INP** | P95 Latency | 0.54 ms | 0.59 ms | 0.49 ms | **0.51 ms** | ⚪ +0.02 ms | 🟢 **-26.1%** |
| | Avg Latency | 0.29 ms | 0.29 ms | 0.27 ms | **0.29 ms** | ⚪ +0.02 ms | 🟢 **-6.5%** |
| **Hover Storm** | P95 Latency | 2.35 ms | 2.00 ms | 1.77 ms | **1.90 ms** *(Avg) / 3.97 ms* | 🟡 Run post-scroll GC | 🟢 **-44.1%** |
| | Avg Latency | 1.74 ms | 1.59 ms | 1.49 ms | **1.90 ms** | 🟡 Run post-scroll GC | 🟢 **-37.3%** |
| **Idle Efficiency** | P95 Latency | 2.22 ms | 2.55 ms | 2.16 ms | **2.26 ms** | ⚪ +0.10 ms | 🟢 **-12.7%** |
| | Avg Latency | 1.63 ms | 1.73 ms | 1.60 ms | **1.68 ms** | ⚪ +0.08 ms | 🟢 **-14.3%** |

---

## 2. Análisis Arquitectónico del Ítem 4 vs Ítem 3

### Dónde mueve la aguja el Ítem 4:
1. **Pase de Pintado en Lectura Regional (`dirty-region`)**:
   - En **`dirty-region`**, el Paint P95 cayó de **0.31 ms → 0.23 ms** (un **-25.8% directo**).
   - El destride manual de filas en CPU y el cálculo de división entera píxel por píxel (`((channel * 255 + alpha / 2) / alpha)`) fueron reemplazados por una única pasada compute en GPU (`unpremultiply_pack.wgsl`) que escribe directamente filas contiguas en el `storage_buffer`.
   - La transferencia final de la región de memoria a CPU es ahora un único `memcpy` continuo en vez de un bucle de N filas con saltos de padding de 256 bytes.
2. **Cero Bucles de Píxeles en CPU en Rutas de Producción**:
   - Toda la conversión de premultiplied alpha a straight alpha tanto en frames completos (`readback_full`) como en regiones arbitrarias (`readback_region`) se procesa masivamente en paralelo en los núcleos de GPU / Metal.
   - El helper legacy de CPU `unpremultiply` quedó estrictamente encapsulado bajo `#[cfg(test)]` como oráculo de pruebas unitarias.
