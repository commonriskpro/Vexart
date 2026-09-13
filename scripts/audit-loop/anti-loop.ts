export type AntiLoopMonitor = {
  normalize: (raw: string) => string
  check: (rawCmd: string) => string | null
}

export const createAntiLoopMonitor = (): AntiLoopMonitor => {
  let lastNormalized = ""
  let consecutiveSame = 0
  let consecutiveBareStatus = 0
  const history: string[] = []

  const normalize = (raw: string) => {
    const match = raw.match(/(?:zsh|bash|sh)\s+-[a-zA-Z]*c\s+['"]([\s\S]*)['"]$/)
    return (match ? match[1] : raw).trim()
  }

  // Bare status/no-op checks that do not inspect specific files, run tests, or modify state
  const isBareStatus = (cmd: string) => {
    const n = normalize(cmd)
    return /^(git\s+(status|branch)(\s+(-s|--short))?|pwd|true|echo(\s+|$))$/i.test(n)
  }

  return {
    normalize,
    check: (rawCmd: string): string | null => {
      const norm = normalize(rawCmd)

      // 1. Identical consecutive command repetition (3 times in a row)
      if (norm === lastNormalized) {
        consecutiveSame += 1
        if (consecutiveSame >= 3) {
          return `circuit breaker: identical command repeated ${consecutiveSame} times: ${norm.slice(0, 100)}`
        }
      } else {
        consecutiveSame = 1
        lastNormalized = norm
      }

      // 2. Consecutive bare status / no-op checks without inspecting code or running tests (6 in a row)
      if (isBareStatus(rawCmd)) {
        consecutiveBareStatus += 1
        if (consecutiveBareStatus >= 6) {
          return `circuit breaker: consecutive bare status commands exceeded limit (${consecutiveBareStatus})`
        }
      } else {
        consecutiveBareStatus = 0
      }

      // 3. Oscillating / Periodic cycle loop detection
      history.push(norm)
      if (history.length > 20) history.shift()

      // Period 2: A, B, A, B, A, B (3 cycles = 6 commands)
      if (history.length >= 6) {
        const l6 = history.slice(-6)
        if (l6[0] === l6[2] && l6[2] === l6[4] && l6[1] === l6[3] && l6[3] === l6[5] && l6[0] !== l6[1]) {
          return `circuit breaker: alternating command loop detected ([${l6[0].slice(0, 50)}, ${l6[1].slice(0, 50)}])`
        }
      }

      // Period 3: A, B, C, A, B, C, A, B, C (3 cycles = 9 commands)
      if (history.length >= 9) {
        const l9 = history.slice(-9)
        if (l9[0] === l9[3] && l9[3] === l9[6] && l9[1] === l9[4] && l9[4] === l9[7] && l9[2] === l9[5] && l9[5] === l9[8] && (l9[0] !== l9[1] || l9[1] !== l9[2])) {
          return `circuit breaker: cyclic command loop detected (period 3)`
        }
      }

      return null
    }
  }
}

