# Native Kitty payload de-duplication capability delta

## Requirement: single digest per output attempt

The direct and SHM Kitty frame/layer paths MUST compute the existing payload
digest at most once per output attempt and MUST reuse that digest for both the
unchanged-payload decision and the post-write cache update. The digest MUST
include RGBA bytes and dimensions/position metadata (`width`, `height`, `col`,
`row`, and `z`). The FFI surface and payload semantics remain unchanged.

The digest is an internal, ephemeral cache key only. Its implementation MAY be
replaced after measurement (including with `DefaultHasher`) without preserving
digest values across processes or exposing a persisted/external hash contract.
The FFI surface and payload semantics MUST remain unchanged.

### Scenario: identical payload skips output

- **GIVEN** an image ID has a successfully committed payload digest and frame
  state
- **WHEN** the same RGBA bytes and metadata are presented again
- **THEN** direct and SHM paths MUST return success without encoding, creating
  SHM data, or writing another Kitty payload
- **AND** SHM transfer stats MUST report the actual input in `raw_bytes` and
  `0` in `payload_bytes`.

### Scenario: pixels or metadata change output

- **GIVEN** an image ID has a successfully committed payload digest
- **WHEN** RGBA bytes or any dimensions/position metadata changes
- **THEN** the payload MUST be emitted instead of skipped
- **AND** the new digest MUST replace the previous digest only after output
  succeeds.

## Requirement: failed output does not commit

If SHM preparation or stdout writing fails, the attempted digest MUST NOT be
stored as the last successful payload. A retry with the same payload MUST still
attempt output.

### Scenario: failed write remains retryable

- **GIVEN** a payload has not been successfully written
- **WHEN** the same payload is presented for retry
- **THEN** the deduplication cache MUST treat it as changed/uncommitted.

## Requirement: lifecycle clears deduplication state

Deleting a Kitty image MUST clear both its animation-frame state and payload
digest. A newly emitted payload for the reused image ID MUST not be skipped due
to stale state.

### Scenario: delete resets image state

- **GIVEN** an image ID has committed frame and digest state
- **WHEN** that image is deleted
- **THEN** frame and digest lookups MUST be empty for that image ID.

## Requirement: measured internal hash implementation

An ignored release microbenchmark MUST compare the current FNV digest against
`std::collections::hash_map::DefaultHasher` over deterministic UI-like and
varied RGBA buffers using `std::hint::black_box`. It MUST identify which
algorithm is production and MUST NOT add dependencies, change ABI, disable
full-frame output, or add a regional presentation path.
