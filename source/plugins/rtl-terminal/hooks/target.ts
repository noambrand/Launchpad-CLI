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

// Whether Claude Code draws links here as clickable spans (OSC 8). Where it
// can't, its Link element prints the URL after the text, which a laid-out row
// has no room for, so the plugin writes links out itself, as Claude Code's own
// markdown does there.
//
// Claude Code's check (2.1.296), for the terminals the plugin lays out in:
// FORCE_HYPERLINK decides when set; Windows Terminal and JetBrains' terminal
// have links; conhost and VS Code's terminal don't. Its `hyperlinks` setting
// isn't readable from a plugin. Unsure counts as no: a link written out stays
// readable, while a link drawn where there are none breaks the row.

export type LinkEnvironment = {
  forceHyperlink?: string
  wtSession?: string
  termProgram?: string
  terminalEmulator?: string
}

const LINKING_PROGRAMS = ['ghostty', 'Hyper', 'kitty', 'alacritty', 'iTerm.app', 'iTerm2', 'WarpTerminal']

/** Whether Claude Code shows clickable links in `environment`. */
export function hasHyperlinks(environment: LinkEnvironment): boolean {
  const force = environment.forceHyperlink
  if (force !== undefined && force !== '') return parseInt(force, 10) !== 0
  if (environment.wtSession !== undefined) return true
  if (environment.termProgram !== undefined && LINKING_PROGRAMS.includes(environment.termProgram)) return true
  return environment.terminalEmulator === 'JetBrains-JediTerm'
}
