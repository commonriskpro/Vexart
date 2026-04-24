# native-resources Spec

## Requirements

### Requirement: Native image assets SHALL be identified by stable handles

Decoded image data registered with Rust MUST return a stable non-zero handle that render graph image ops can reference across frames.

#### Scenario: Reusing the same source returns the existing handle

- **GIVEN** an image source has already been decoded and registered
- **WHEN** another `<img>` uses the same stable source key
- **THEN** the TypeScript bridge reuses the existing native handle instead of registering duplicate pixel data

### Requirement: Image assets SHALL be tracked by native resource accounting

Native image assets MUST contribute to resource stats and eviction accounting as image resources.

#### Scenario: Resource stats include registered image bytes

- **GIVEN** an image asset is registered with width, height, and RGBA bytes
- **WHEN** resource stats are requested
- **THEN** the stats include an image resource entry with the expected byte count

### Requirement: JS image buffer fallback SHALL remain available during migration

If native image assets are unavailable or disabled, image rendering MUST continue to use the existing JS-owned image buffer path.

#### Scenario: Native asset registration disabled

- **GIVEN** native image asset registration is disabled
- **WHEN** an image is decoded
- **THEN** `_imageBuffer` remains populated and rendering continues through the fallback path
