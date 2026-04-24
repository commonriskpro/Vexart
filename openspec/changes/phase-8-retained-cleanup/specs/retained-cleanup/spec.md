# retained-cleanup Delta Spec

## ADDED Requirements

### Requirement: TypeScript retained runtime code SHALL be binding-shell or explicit fallback only

After native retained ownership is complete, TypeScript retained runtime modules MUST either translate/bind to native APIs, dispatch JS callbacks, support explicit compatibility fallback, or support test/offscreen readback.

#### Scenario: Stale TS implementation path is found

- **GIVEN** a TypeScript module still implements retained rendering behavior on the native path
- **WHEN** Phase 8 inventory classifies ownership
- **THEN** the path is either deleted, moved behind explicit fallback, or renamed as a binding shell with tests

### Requirement: Cleanup SHALL preserve intentional fallback and readback APIs

Cleanup MUST NOT remove native-disabled fallback, screenshot/offscreen rendering, or explicit readback APIs unless a separate public API decision removes them.

#### Scenario: Offscreen render test runs without native presentation

- **GIVEN** native presentation is unavailable
- **WHEN** an offscreen/test render helper is used
- **THEN** it continues to render through an intentional fallback path

### Requirement: Documentation SHALL describe current ownership accurately

Docs and tests MUST not describe stale hybrid ownership once Phase 8 cleanup is complete.

#### Scenario: Grep gate checks stale ownership phrases

- **GIVEN** cleanup is complete
- **WHEN** grep gates scan non-archived docs and source comments
- **THEN** stale hybrid ownership language appears only in archived historical documents or explicit rollback notes
