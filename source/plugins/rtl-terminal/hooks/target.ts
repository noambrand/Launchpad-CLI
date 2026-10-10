// Who reorders RTL rows once drawn, and so whether this plugin lays them out.
//
// Claude Code reorders RTL rows itself, by the bidi rules from strong
// characters (RLM and LRM included), in the terminals with no bidi of their
// own: Windows Terminal and conhost (its changelog, 2.1.74) and VS Code's
// terminal on every system (seen in CI). There the plugin lays rows out.
//
// Elsewhere (Linux and macOS terminals) Claude Code writes rows in logical
// order and the terminal's own engine reorders them; Claude Code drops RLM and
// LRM on the way and turns isolates into U+FFFD (seen in CI), so no standard
// direction control reaches that engine, and the plugin leaves rows to it.

export type Mode = 'auto' | 'claude' | 'terminal'

export type Environment = { os?: string; termProgram?: string }

export function asMode(value: unknown): Mode {
  return value === 'claude' || value === 'terminal' ? value : 'auto'
}

/** Who reorders rows in `environment` under `mode`. */
export function reorderedBy(mode: Mode, environment: Environment): 'claude' | 'terminal' {
  if (mode !== 'auto') return mode
  const isWindows = environment.os === 'Windows_NT'
  const isVsCode = environment.termProgram === 'vscode'
  return isWindows || isVsCode ? 'claude' : 'terminal'
}
