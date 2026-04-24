# Spec: Native Layer Registry

## ADDED Requirements

### Requirement: Native layer registry MUST own presentation layer resources

When `nativeLayerRegistry` is enabled, Rust MUST own GPU layer targets, terminal image IDs, layer dirty state, and lifecycle for normal terminal presentation.

#### Scenario: Layer is created or reused natively

- **Given** a TypeScript layer descriptor with a stable key
- **When** the native path presents the layer
- **Then** Rust MUST create or reuse the corresponding layer record
- **And** TypeScript MUST NOT allocate or persist the terminal image ID for that layer

#### Scenario: Removed layer deletes native terminal image

- **Given** a layer is removed from the layer plan
- **When** the native registry processes the removal
- **Then** Rust MUST delete the terminal image associated with that layer
- **And** Rust MUST release or mark reusable the layer target according to resource policy

### Requirement: Layer resources MUST participate in ResourceManager accounting

Layer targets and terminal image resources MUST report memory usage and eviction stats through renderer resource stats.

#### Scenario: Budget pressure occurs

- **Given** total GPU usage exceeds the configured budget
- **When** the native registry performs eviction
- **Then** cold or recent non-visible layer resources MAY be evicted
- **And** visible layer resources MUST NOT be evicted during the current frame
