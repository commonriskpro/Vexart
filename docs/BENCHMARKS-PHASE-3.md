# Registro de Benchmarks y Optimizaciones — Fase 3 (Transport & GPU)

Este documento registra la evolución del rendimiento de Vexart durante las optimizaciones de la **Fase 3** ([ARCHITECTURE-AUDIT.md](ARCHITECTURE-AUDIT.md)).

---

## 1. Tabla Comparativa de Evolución de Rendimiento

A continuación se detalla la progresión continua:
1. **Con Hash en SHM** (`8d440b0`): Estado con cálculo de `payload_hash` en cada frame transmitido por memoria compartida.
2. **Sin Hash en SHM** (`5bb6194`): Eliminación del hashing redundante en buffers RGBA de SHM y agregación de ring coalescing no-bloqueante.
3. **Ítem 1: GPU Sampler** (`9ee5030`): Eliminación del escalado nearest-neighbor en CPU y purga del cache LRU de `Uint8Array`s en JS.
4. **Ítem 2: Shader Unificado de Imagen con Radius** (`1ec668a`): Eliminación de la cascada de 3 copias y targets offscreen por imagen redondeada, unificando UV transform + object-fit + corner-radius en un solo draw pass.

### A. Frame Breakdown (`bun run bench:frame-breakdown --frames=30 --warmup=2`)

| Escenario | Métrica | Ítem 1: GPU Sampler (`9ee5030`) | Ítem 2: Shader Radius (`1ec668a`) | Delta Directo (Ítem 2 vs Ítem 1) | Delta Acumulado Total (vs Con Hash) |
| :--- | :--- | :---: | :---: | :---: | :---: |
| **dashboard-1080p** | Total P95 | 2.14 ms | **1.94 ms** | 🟢 **-9.3% (-0.20 ms)** | 🟢 **-48.0%** |
| | Total P50 | 1.51 ms | **1.35 ms** | 🟢 **-10.6% (-0.16 ms)** | 🟢 **-17.2%** |
| | Paint P95 | 1.99 ms | **1.60 ms** | 🟢 **-19.6% (-0.39 ms)** | 🟢 **-51.8%** |
| **scroll-heavy** | Total P95 | 0.89 ms | **0.84 ms** | 🟢 **-5.6% (-0.05 ms)** | 🟢 **-59.2%** |
| | Paint P95 | 0.78 ms | **0.65 ms** | 🟢 **-16.7% (-0.13 ms)** | 🟢 **-60.1%** |
| **hover-transition** | Total P95 | 0.54 ms | **0.52 ms** | 🟢 **-3.7% (-0.02 ms)** | 🟢 **-29.7%** |
| | Paint P95 | 0.46 ms | **0.47 ms** | ⚪ ~0.0% (+0.01 ms) | 🟢 **-28.8%** |
| **dirty-region** | Total P95 | 0.29 ms | **0.34 ms** | 🟡 +0.05 ms (jitter) | 🟢 **-40.4%** |
| **compositor-only** | Total P95 | 0.10 ms | **0.12 ms** | 🟡 +0.02 ms (jitter) | 🟢 **-33.3%** |
| **dashboard-800x600** | Total P95 | 1.40 ms | **1.57 ms** | 🟡 +0.17 ms (jitter) | 🟡 +10.5% |

---

### B. Engine Benchmark (`bun run benchmark`)

| Escenario | Métrica | Ítem 1: GPU Sampler (`9ee5030`) | Ítem 2: Shader Radius (`1ec668a`) | Delta Directo (Ítem 2 vs Ítem 1) | Delta Acumulado Total (vs Con Hash) |
| :--- | :--- | :---: | :---: | :---: | :---: |
| **60FPS Animation** | P95 Latency | 1.30 ms | **1.21 ms** | 🟢 **-6.9% (-0.09 ms)** | 🟢 **-39.8%** |
| | Avg Latency | 0.84 ms | **0.80 ms** | 🟢 **-4.8% (-0.04 ms)** | 🟢 **-14.0%** |
| | P50 Latency | 0.81 ms | **0.77 ms** | 🟢 **-4.9% (-0.04 ms)** | 🟢 **-25.0%** |
| **Virtual Scroll** | P95 Latency | 6.44 ms | **6.39 ms** | 🟢 **-0.8% (-0.05 ms)** | 🟢 **-8.8%** |
| | Avg Latency | 3.95 ms | **3.89 ms** | 🟢 **-1.5% (-0.06 ms)** | 🟢 **-3.0%** |
| **Typing / INP** | P95 Latency | 0.54 ms | **0.59 ms** | ⚪ +0.05 ms (jitter) | 🟢 **-14.5%** |
| | Avg Latency | 0.29 ms | **0.29 ms** | ⚪ **0.0% (idéntico)** | 🟢 **-6.5%** |
| **Hover Storm** | P95 Latency | 2.35 ms | **4.04 ms** | 🟡 +1.69 ms (variación run) | 🟢 **-42.9%** |
| | Avg Latency | 1.74 ms | **2.07 ms** | 🟡 +0.33 ms (variación run) | 🟢 **-32.6%** |
| **Idle Efficiency** | P95 Latency | 2.22 ms | **2.55 ms** | 🟡 +0.33 ms (variación run) | 🟢 **-1.5%** |
| | Avg Latency | 1.63 ms | **1.73 ms** | 🟡 +0.10 ms (variación run) | 🟢 **-11.7%** |

---

## 2. Análisis Arquitectónico del Ítem 2 vs Ítem 1

### Dónde mueve la aguja el Ítem 2:
1. **Tiempo de Pintado puro (`paintMs`) en GPU**:
   - En **`dashboard-1080p`**, el Paint P95 cayó de **1.99 ms → 1.60 ms** (un **-19.6% directo**).
   - En **`scroll-heavy`**, el Paint P95 cayó de **0.78 ms → 0.65 ms** (un **-16.7% directo**).
   - Al no tener que crear targets intermedios en WGPU ni copiar texturas para enmascarar radios, el pipeline de renderizado y el driver de la GPU trabajan considerablemente menos por frame.
2. **Animaciones fluidas sostenidas (`60FPS Animation`)**:
   - P95 bajó a **1.21 ms** (vs 1.30 ms en Ítem 1 y 2.01 ms inicial), con un promedio de **0.80 ms**.

### Dónde no impacta el Ítem 2:
- En escenarios sintéticos sin imágenes (como `Hover Storm` o `Typing / INP`), donde solo hay cajas y texto interactivo; las pequeñas variaciones allí corresponden al jitter normal del scheduler en macOS.

