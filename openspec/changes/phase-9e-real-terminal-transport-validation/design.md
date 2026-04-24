# Design: Phase 9e — Real Terminal Transport Validation

## Matrix fields

The validation report captures:

- environment: TERM, TERM_PROGRAM, Kitty/Ghostty/WezTerm/tmux/SSH variables
- terminal kind
- inferred/probed capabilities
- selected `transmissionMode`
- transport manager active/preferred mode
- native presentation enabled/fallback reason
- optional benchmark p95 values

## Execution modes

### Non-interactive/static mode

When stdin/stdout are not TTYs, the script uses static terminal inference. This keeps CI and API environments safe.

### Active probe mode

When running in a real TTY, the script calls `createTerminal()` with color querying disabled, performs the existing Kitty graphics and transport probes, initializes a render loop only long enough to record native presentation state, then restores the terminal.

### Benchmark mode

`--bench` runs `scripts/frame-breakdown.tsx` using the detected transport and embeds scenario p95 values in the matrix report.

## Commands

```bash
bun run validate:terminal-transport
bun run validate:terminal-transport:bench
```

The generated report is ignored:

```txt
scripts/terminal-transport-report.json
```
