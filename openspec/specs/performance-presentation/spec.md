# Spec: Performance Presentation

## Requirements

### Requirement: Benchmark transport modes

The frame breakdown benchmark SHALL support explicit Kitty transport selection for `direct`, `file`, and `shm`.

The frame breakdown benchmark SHALL default to `shm` when no transport is specified.

The transport manager SHALL prefer `shm` as its default policy, fallback to `file` when SHM is unavailable, and use `direct` only when neither local transport is available.

#### Scenario: Run file transport benchmark

- **WHEN** the benchmark is run with `--transport=file`
- **THEN** the mock terminal capabilities use file transport
- **AND** the Kitty transport manager is configured to keep file transport active.

#### Scenario: Run default transport benchmark

- **WHEN** the benchmark is run without `--transport`
- **THEN** the mock terminal capabilities use SHM transport
- **AND** the Kitty transport manager is configured with SHM as preferred transport.

### Requirement: No implicit final-frame forcing

The frame breakdown benchmark SHALL NOT force `final-frame-raw` unless the caller explicitly sets `TGE_GPU_FORCE_LAYER_STRATEGY`.

#### Scenario: Default benchmark strategy

- **WHEN** the benchmark is run without `TGE_GPU_FORCE_LAYER_STRATEGY`
- **THEN** the renderer backend strategy chooser selects the frame strategy.

### Requirement: Regional retained presentation

When a retained layer has a small regional repaint and its terminal image already exists, the TS fallback presentation path SHALL patch only the changed region.

#### Scenario: Existing layer regional repaint

- **GIVEN** a layer image has already been transmitted
- **AND** the next frame has a regional repaint for that layer
- **WHEN** the backend returns a regional payload
- **THEN** the GPU frame composer patches the existing layer instead of retransmitting the full layer.

### Requirement: Static upper-layer visual damage does not dirty lower layers

An upper retained layer that changes visual state without moving or resizing SHALL NOT mark lower layers dirty.

#### Scenario: Hover style changes

- **GIVEN** an upper retained layer changes hover visual style
- **AND** its bounds do not change
- **WHEN** damage is propagated
- **THEN** lower layers are not marked damaged for that visual-only change.
