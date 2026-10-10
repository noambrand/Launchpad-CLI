import { describe, expect, test } from 'claude-code/testing'

import { clusters, widthOf } from '../hooks/bidi'

// Widths Claude Code 2.1.294 gave each sample when laying it out, measured
// by right-aligning it in a box and reading where the terminal drew it.
const MEASURED: [string, number][] = [
  ['✅', 2],
  ['❌', 2],
  ['⚠', 1],
  ['⚠\u{FE0F}', 2],
  ['❤', 1],
  ['❤\u{FE0F}', 2],
  ['✔', 1],
  ['✔\u{FE0F}', 2],
  ['★', 1],
  ['☀', 1],
  ['☀\u{FE0F}', 2],
  ['⭐', 2],
  ['🔥', 2],
  ['👍', 2],
  ['👍\u{1F3FD}', 2],
  ['👨\u{200D}👩\u{200D}👧', 2],
  ['🏳\u{FE0F}\u{200D}🌈', 2],
  ['🇸🇦', 2],
  ['1\u{FE0F}\u{20E3}', 2],
  ['#\u{FE0F}\u{20E3}', 2],
  ['™', 1],
  ['©', 1],
  ['ℹ\u{FE0F}', 2],
  ['↔\u{FE0F}', 2],
  ['▶\u{FE0F}', 2],
  ['⏱\u{FE0F}', 2],
  ['🧠', 2],
  ['🫠', 2],
  ['🪄', 2],
  ['🟢', 2],
  ['⬆\u{FE0F}', 2],
  ['➡\u{FE0F}', 2],
  ['✨', 2],
  ['⚡', 2],
  ['⏳', 2],
  ['✍\u{FE0F}', 2],
  ['☑\u{FE0F}', 2],
  ['🔴', 2],
  ['📝', 2],
  ['中', 2],
  ['한', 2],
  ['ｱ', 1],
  ['Ａ', 2],
  ['—', 1],
  ['☺', 1],
  ['☺\u{FE0F}', 2],
  ['♥', 1],
  ['♥\u{FE0F}', 2],
  ['⌚', 2],
  ['⌨\u{FE0F}', 2],
  ['🅰', 1],
  ['🅰\u{FE0F}', 2],
  ['🈚', 2],
  ['〰\u{FE0F}', 2],
  ['🕵\u{FE0F}\u{200D}♂\u{FE0F}', 2],
  ['🧑\u{1F3FB}\u{200D}💻', 2],
  ['👩\u{200D}❤\u{FE0F}\u{200D}👨', 2],
  ['🏴\u{E0067}\u{E0062}\u{E0073}\u{E0063}\u{E0074}\u{E007F}', 2],
  ['✌', 1],
  ['✌\u{FE0F}', 2],
  ['☝\u{1F3FC}', 2],
  ['⛔', 2],
  ['⛳', 2],
  ['⚽', 2],
  ['🀄', 2],
  ['🃏', 2],
  ['🆗', 2],
  ['🔟', 2],
  ['☎', 1],
  ['☎\u{FE0F}', 2],
  ['✈\u{FE0F}', 2],
  ['✏', 1],
  ['✓', 1],
  ['✗', 1],
  ['•', 1],
  ['…', 1],
  ['→', 1],
  ['⇒', 1],
  ['✦', 1],
  ['❯', 1],
  ['●', 1],
  ['◉', 1],
  ['⏵', 1],
  ['│', 1],
]

describe('widthOf', () => {
  test('matches what Claude Code measures for emoji and symbols', async () => {
    const wrong = MEASURED.filter(([text, width]) => widthOf(text) !== width).map(
      ([text, width]) => `${text} ${widthOf(text)} != ${width}`,
    )
    expect(wrong).toEqual([])
  })

  test('counts a whole line of mixed text', async () => {
    expect(widthOf('تم ✅ done \u{1F44D}\u{1F3FD} 中文')).toBe(18)
    expect(widthOf('شغّل \u{1F468}\u{200D}\u{1F469}\u{200D}\u{1F467}')).toBe(6)
  })
})

describe('clusters', () => {
  test('keeps joined emoji, flags, keycaps and marked letters whole', async () => {
    expect(clusters('\u{1F468}\u{200D}\u{1F469}a\u{1F1F8}\u{1F1E6}1\u{FE0F}\u{20E3}شّ')).toEqual([
      '\u{1F468}\u{200D}\u{1F469}',
      'a',
      '\u{1F1F8}\u{1F1E6}',
      '1\u{FE0F}\u{20E3}',
      'شّ',
    ])
  })
})
