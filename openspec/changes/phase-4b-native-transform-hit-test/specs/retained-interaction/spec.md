# retained-interaction Delta Spec

## ADDED Requirements

### Requirement: Native interaction dispatch SHALL support transformed hit-testing

When native event dispatch is enabled, transformed nodes MUST be hit-tested in Rust without falling back to the TypeScript compatibility loop.

#### Scenario: Hover enters a translated node at its visual position

- **GIVEN** a node has a translated transform and an `onMouseOver` handler
- **WHEN** the pointer moves over the transformed visual bounds
- **THEN** the native interaction frame emits a mouse-over record for that node

#### Scenario: Hover ignores the original pre-transform bounds

- **GIVEN** a node has a translated transform
- **WHEN** the pointer is only inside the original layout bounds and outside transformed visual bounds
- **THEN** the native interaction frame does not emit hover for that node

### Requirement: Native transformed hit-testing SHALL preserve existing interaction semantics

Transform-aware hit-testing MUST preserve pointer capture, pointer passthrough, scroll container culling, min hit-area expansion, and press bubbling behavior.

#### Scenario: Press bubbles from a transformed child

- **GIVEN** a transformed child has `onPress` and an ancestor is focusable
- **WHEN** the pointer press/release occurs inside the transformed visual bounds
- **THEN** native records include press candidates for the child and relevant ancestor
