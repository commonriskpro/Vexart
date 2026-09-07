# Readback-copy Specification

## Purpose

Reduce the intermediate CPU allocation/copy in the existing full-frame GPU
readback path without changing pixels, presentation behavior, or the native
FFI contract. The optimization is limited to the native readback seam and must
retain a packed-row fallback when WGPU's row pitch contains padding.

## Requirements

### Requirement: Full-frame readback preserves exact RGBA output

The full-frame readback path SHALL return the same packed RGBA bytes for both
row-aligned and padded WGPU row pitches. The existing `readback_full` contract
and FFI behavior SHALL remain unchanged.

#### Scenario: Aligned rows

- **GIVEN** a GPU texture whose width × 4 is a multiple of 256
- **WHEN** a full readback is performed
- **THEN** the packed output contains exactly width × height × 4 bytes
- **AND** every byte matches the texture contents

#### Scenario: Padded rows

- **GIVEN** a GPU texture whose width × 4 is not a multiple of 256
- **WHEN** a full readback is performed
- **THEN** row padding is removed from the output
- **AND** every byte matches the aligned-row reference output

### Requirement: Readback mapping is released on every callback outcome

Any internal mapped-readback callback SHALL release its WGPU mapping before
returning, including when the callback reports an error or unwinds. A later
readback of the same buffer SHALL remain valid after either outcome.

#### Scenario: Callback returns an error

- **GIVEN** a mapped full-frame readback callback returns an error result
- **WHEN** a second readback is performed on the same GPU buffer
- **THEN** the second readback succeeds
- **AND** its bytes remain exact

#### Scenario: Callback unwinds

- **GIVEN** a mapped full-frame readback callback panics
- **WHEN** the panic is caught and a second readback is performed
- **THEN** the second readback succeeds because the mapping was released

### Requirement: Allocation reduction remains bounded and full-frame only

The native transport MAY consume contiguous mapped rows directly while the
mapping is live. For padded rows it SHALL use an exact packed fallback. The
change SHALL NOT add asynchronous presentation, regional output, renderer or
shader behavior, dependencies, or FFI/ABI/public contract changes.

#### Scenario: Contiguous transport input

- **GIVEN** a full-frame target with an aligned row pitch
- **WHEN** native transport consumes the readback
- **THEN** it can process the mapped bytes without an intermediate full-frame
  CPU copy
- **AND** digest, encoding, write, retry, and metadata behavior is unchanged

#### Scenario: Padded transport input

- **GIVEN** a full-frame target with padded rows
- **WHEN** native transport consumes the readback
- **THEN** it receives an exact packed RGBA buffer
- **AND** output behavior is identical to the existing full-frame path
