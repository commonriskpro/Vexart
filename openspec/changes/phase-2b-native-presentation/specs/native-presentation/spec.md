# Spec: Native Presentation

## ADDED Requirements

### Requirement: Normal presentation MUST avoid Rust-to-JS RGBA payloads

When native presentation is enabled and supported, normal terminal presentation MUST NOT return full-frame or layer RGBA buffers to JavaScript.

#### Scenario: Final-frame presentation uses native output

- **Given** native presentation is enabled
- **And** the backend chooses a final-frame strategy
- **When** a frame is presented
- **Then** Rust MUST read back, encode, and emit the Kitty output natively
- **And** JavaScript MUST receive status/stats only
- **And** JavaScript MUST NOT receive a frame-sized RGBA `Uint8Array`

#### Scenario: Dirty-layer presentation uses native output

- **Given** native presentation is enabled
- **And** a dirty layer is repainted
- **When** the layer is presented
- **Then** Rust MUST emit the layer update natively over SHM
- **And** JavaScript MUST NOT receive a layer-sized RGBA `Uint8Array`

### Requirement: Fallback MUST preserve existing behavior

The existing TypeScript raw presentation path MUST remain available during the compatibility window.

#### Scenario: Native presentation disabled

- **Given** `VEXART_NATIVE_PRESENTATION=0`
- **When** the renderer presents a frame
- **Then** the existing TS readback/presentation path MUST be used
- **And** rendering behavior MUST remain compatible with the current runtime

#### Scenario: Offscreen rendering requests raw pixels

- **Given** a test or screenshot API explicitly requests raw pixels
- **When** native presentation is enabled
- **Then** the API MAY return RGBA to JavaScript intentionally
- **And** this MUST NOT count as normal terminal presentation

### Requirement: Native presentation MUST expose stats

Native presentation MUST expose structured stats through FFI.

#### Scenario: Debug overlay reads native stats

- **Given** native presentation is enabled
- **When** a frame or layer is presented
- **Then** Rust MUST expose bytes emitted, bytes read back, readback time, encode time, write time, total time, and transport mode
- **And** JavaScript debug tooling MUST be able to display those stats without owning pixel data

### Requirement: Native presentation scope MUST use SHM transport

This change MUST support SHM transport and MAY defer direct/file transport.

#### Scenario: Unsupported transport requested

- **Given** native presentation is enabled
- **And** a non-SHM transport path is requested for this change scope
- **When** presentation starts
- **Then** the runtime MUST either fall back to the existing TS path or report a clear unsupported-mode reason
