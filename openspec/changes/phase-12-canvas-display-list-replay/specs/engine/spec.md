# Delta Spec: Canvas Display-List Replay

## ADDED Requirements

### Requirement: Engine MUST render canvas display lists

The engine MUST render `<canvas>` nodes with `onDraw` display-list commands without failing the frame.

#### Scenario: Canvas op produces image handle

- **Given** a canvas node with display-list commands
- **When** the render backend processes the canvas render op
- **Then** it MUST resolve the canvas to a renderable image handle
- **And** it MUST batch the canvas like an image quad

#### Scenario: Canvas output is cached

- **Given** the same canvas display-list hash and dimensions are rendered repeatedly
- **When** the backend resolves the canvas sprite again
- **Then** it SHOULD reuse the existing native image handle

#### Scenario: Display-list command subset renders

- **Given** display-list commands for rect, circle, line, bezier, polygon, text, glow, image, linearGradient, radialGradient, starfield, and nebula
- **When** replay runs
- **Then** replay MUST handle the command without throwing
- **And** unsupported/malformed commands MUST be skipped safely instead of crashing the frame

#### Scenario: Canvas render failure is safe

- **Given** a canvas display-list cannot be resolved
- **When** the backend processes the frame
- **Then** the failure MUST not leave terminal state dirty
- **And** tests SHOULD expose the failure before examples use the feature
