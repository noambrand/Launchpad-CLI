import { describe, expect, test } from 'claude-code/testing'

import { RLM } from '../hooks/bidi'
import { layoutPlainText, needsPreview, previewRows } from '../hooks/preview'

import { drawn } from './draw'

describe('needsPreview', () => {
  test('stays away from drafts the prompt box draws right', async () => {
    expect(needsPreview('fix the tests', 60)).toBe(false)
    expect(needsPreview('مرحبا كيفك', 60)).toBe(false)
  })

  test('shows for mixed words, brackets, several lines and wrapping', async () => {
    expect(needsPreview('بدي plugin جديد', 60)).toBe(true)
    expect(needsPreview('مرحبا (كيفك)', 60)).toBe(true)
    expect(needsPreview('سطر\nسطر', 60)).toBe(true)
    expect(needsPreview('كلام عربي طويل بيلف', 10)).toBe(true)
  })
})

describe('previewRows', () => {
  test('lays RTL rows out and leaves English ones alone', async () => {
    const rows = previewRows('بدي (تجربة)\nplain English', 40)
    expect(rows.map(r => [r.isRtl, r.isRtl ? drawn(r.spans) : r.spans.map(s => s.text).join('')])).toEqual([
      [true, '(ةبرجت) يدب'],
      [false, 'plain English'],
    ])
  })

  test('wraps to the width', async () => {
    expect(previewRows('كلمة كلمة كلمة كلمة', 10)).toHaveLength(2)
  })
})

describe('layoutPlainText', () => {
  test('wraps an RTL prompt by hand, each row opening with RLM', async () => {
    const rows = layoutPlainText('كلمة كلمة كلمة كلمة', 10).split('\n')
    expect(rows).toEqual([`${RLM}كلمة كلمة${RLM}`, `${RLM}كلمة كلمة${RLM}`])
  })

  test('turns brackets typed backwards before laying the line out', async () => {
    const rows = layoutPlainText('وليش )hello( (some bugs( ??', 80).split('\n')
    expect(rows.map(row => drawn([{ text: row }]))).toEqual(['?? (some bugs) (hello) شيلو'])
  })

  test('leaves a prompt with no RTL alone', async () => {
    expect(layoutPlainText('fix (the) tests', 10)).toBe('fix (the) tests')
  })
})
