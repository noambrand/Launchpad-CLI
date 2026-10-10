import { describe, expect, test } from 'claude-code/testing'

import { asMode, reorderedBy } from '../hooks/target'

describe('reorderedBy', () => {
  test('Claude Code reorders on Windows and in VS Code, the terminal elsewhere', async () => {
    expect(reorderedBy('auto', { os: 'Windows_NT' })).toBe('claude')
    expect(reorderedBy('auto', { termProgram: 'vscode' })).toBe('claude')
    expect(reorderedBy('auto', { termProgram: 'Apple_Terminal' })).toBe('terminal')
    expect(reorderedBy('auto', {})).toBe('terminal')
  })

  test('a chosen mode wins over the environment', async () => {
    expect(reorderedBy('terminal', { os: 'Windows_NT' })).toBe('terminal')
    expect(reorderedBy('claude', {})).toBe('claude')
  })
})

describe('asMode', () => {
  test('reads a stored mode, auto for anything else', async () => {
    expect(asMode('claude')).toBe('claude')
    expect(asMode('terminal')).toBe('terminal')
    expect(asMode(undefined)).toBe('auto')
    expect(asMode('rtl')).toBe('auto')
  })
})
