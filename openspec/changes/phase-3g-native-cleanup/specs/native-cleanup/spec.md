# Spec: Native Cleanup

## ADDED Requirements

### Requirement: Normal rendering MUST have one implementation owner

After cleanup, Rust MUST be the only implementation owner for normal rendering behavior on the retained path.

#### Scenario: Normal presentation renders a frame

- **Given** native retained mode is default
- **When** a normal terminal frame is rendered
- **Then** TypeScript MUST NOT generate ordinary render graph commands
- **And** TypeScript MUST NOT own layer target lifetime or terminal image IDs
- **And** TypeScript MUST NOT receive raw RGBA buffers for normal presentation

### Requirement: Explicit readback APIs MUST remain intentional

Screenshot, debug, test, and offscreen APIs MAY return raw pixels to JavaScript, but they MUST be clearly separated from normal terminal presentation.
