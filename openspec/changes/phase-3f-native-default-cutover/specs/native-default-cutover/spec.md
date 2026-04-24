# Spec: Native Default Cutover

## ADDED Requirements

### Requirement: Native retained path MUST be default only after gates pass

The runtime MUST NOT flip to native retained default until visual parity, interaction parity, API stability, and performance gates pass.

#### Scenario: User starts app after cutover

- **Given** no emergency fallback env var is set
- **When** a Vexart app mounts
- **Then** the native retained path MUST be used by default
- **And** debug stats MUST report native retained mode

#### Scenario: Emergency fallback is enabled

- **Given** the documented fallback env var disables native retained mode
- **When** a Vexart app mounts during the compatibility window
- **Then** the runtime MUST use the old compatibility path
- **And** debug stats MUST report the fallback reason
