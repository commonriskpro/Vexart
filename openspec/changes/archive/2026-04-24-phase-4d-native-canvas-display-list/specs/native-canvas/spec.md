# native-canvas Delta Spec

## ADDED Requirements

### Requirement: Canvas drawing SHALL be representable as a deterministic display list

The supported Vexart canvas command subset MUST serialize deterministically so identical canvas content produces identical display-list bytes and hash.

#### Scenario: Same commands produce same display-list hash

- **GIVEN** two canvas draws issue the same supported commands in the same order
- **WHEN** the display list is serialized
- **THEN** the resulting hash is identical

### Requirement: Native canvas display lists SHALL be referenced by handle

Canvas render graph ops in the native path MUST reference a native display-list handle when one is available.

#### Scenario: Dirty canvas uploads a new display list

- **GIVEN** a canvas node's draw output changes
- **WHEN** the frame is prepared
- **THEN** the TypeScript bridge uploads the new display list and updates the native handle/version

### Requirement: JS callback fallback SHALL remain during migration

If native display-list support is disabled or unavailable, canvas rendering MUST continue through the existing `onDraw` callback path.

#### Scenario: Native display-list disabled

- **GIVEN** native display-list support is disabled
- **WHEN** a canvas node renders
- **THEN** `onDraw` remains available and current canvas tests continue to pass
