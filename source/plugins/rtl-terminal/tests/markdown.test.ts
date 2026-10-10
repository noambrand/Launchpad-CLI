import { describe, expect, test } from 'claude-code/testing'

import { RLM, widthOf } from '../hooks/bidi'
import { itemMarker, layoutRtl, parseInline, prepareSpans, splitBlocks, wrapSpans, writeOutLinks } from '../hooks/markdown'

import { drawn } from './draw'

describe('splitBlocks', () => {
  test('leaves a reply with no RTL text to the engine', async () => {
    expect(splitBlocks('Hello **world**\n\n- one\n- two')).toBe(null)
  })

  test('takes RTL prose and leaves code, tables and English to the engine', async () => {
    const blocks = splitBlocks(
      [
        'مرحبا بالعالم',
        '',
        '- AdMob بيعرض إعلانه',
        '  - نقطة متداخلة',
        '1. أول خطوة',
        '',
        '```',
        'echo مرحبا',
        '```',
        '',
        '| الاسم | القيمة |',
        '|---|---|',
        '',
        'An English paragraph that stays as it is.',
      ].join('\n'),
    )
    expect(blocks?.map(b => (b.kind === 'rtl' ? `${b.role}:${b.depth}:${b.marker}` : 'markdown'))).toEqual([
      'paragraph:0:',
      'item:0:-',
      'item:1:-',
      'item:0:1.',
      'markdown',
    ])
    const last = blocks?.[4]
    expect(last?.kind === 'markdown' ? last.source : '').toBe(
      '```\necho مرحبا\n```\n\n| الاسم | القيمة |\n|---|---|\n\nAn English paragraph that stays as it is.',
    )
  })

  test('keeps the blank lines between blocks as gaps', async () => {
    const blocks = splitBlocks('سطر أول\n\nسطر تاني\nسطر تالت')
    expect(blocks?.map(b => b.gapBefore)).toEqual([false, true])
    expect(blocks?.[1]?.kind === 'rtl' ? blocks[1].lines : []).toEqual(['سطر تاني', 'سطر تالت'])
  })
})

describe('parseInline', () => {
  test('reads code, emphasis, strikes and links', async () => {
    expect(parseInline('نص **عريض** و *مائل* و `code` و ~~لا~~ و [رابط](https://x.com)')).toEqual([
      { text: 'نص ' },
      { text: 'عريض', bold: true },
      { text: ' و ' },
      { text: 'مائل', italic: true },
      { text: ' و ' },
      { text: 'code', code: true },
      { text: ' و ' },
      { text: 'لا', strike: true },
      { text: ' و ' },
      { text: 'رابط', href: 'https://x.com' },
    ])
  })

  test('links a bare URL and leaves its trailing period out', async () => {
    expect(parseInline('شوف https://x.com/a.')).toEqual([
      { text: 'شوف ' },
      { text: 'https://x.com/a', href: 'https://x.com/a' },
      { text: '.' },
    ])
  })
})

describe('wrapSpans', () => {
  test('never makes a row wider than asked', async () => {
    const spans = parseInline('هاد سطر طويل كتير وفيه Google Mobile Ads و **كلام عريض** لازم ينقسم على كذا سطر')
    for (const width of [10, 17, 25, 40]) {
      for (const row of wrapSpans(spans, width)) {
        expect(widthOf(row.map(s => s.text).join(''))).toBeLessThanOrEqual(width)
      }
    }
  })

  test('cuts a word wider than the row', async () => {
    const rows = wrapSpans([{ text: 'abcdefghij' }], 4)
    expect(rows.map(r => r.map(s => s.text).join(''))).toEqual(['abcd', 'efgh', 'ij'])
  })
})

describe('layoutRtl', () => {
  // Each case is what Claude Code drew for the line, read off its screen.
  const cases: [string, string][] = [
    ['اسمها (plugin) هون', 'نوه (plugin) اهمسا'],
    [
      'اسمها (plugin) والـ repo (عام) و Google (Ads) و (1) والإصدار 2.1.294 جاهز.',
      '.زهاج 2.1.294 رادصإلاو (1) و Google (Ads) و (ماع) repo ـلاو (plugin) اهمسا',
    ],
    [
      'وليش )hello( ]this text is so messey[ ??',
      '?? [this text is so messey] (hello) شيلو',
    ],
    [
      'قال «مرحبا [كتير]» و f(x) و `g(y)` و `/rtl` و `claude-` هون.',
      '.نوه claude- و /rtl و g(y) و f(x) و «[ريتك] ابحرم» لاق',
    ],
    ['هل يمكنك explain that?', '?explain that كنكمي له'],
  ]

  test('draws each line as the Unicode Bidirectional Algorithm lays it out', async () => {
    for (const [line, expected] of cases) {
      const rows = layoutRtl(parseInline(line), 200)
      expect(rows.map(drawn)).toEqual([expected])
    }
  })

  test('wraps to the width, every row opening with RLM', async () => {
    const rows = layoutRtl(parseInline('كلمة Google Mobile Ads كلمة كلمة'), 12)
    for (const row of rows) {
      expect(row[0]?.text.startsWith(RLM)).toBe(true)
      expect(widthOf(row.map(s => s.text).join(''))).toBeLessThanOrEqual(12)
    }
    expect(rows.map(drawn)).toEqual(['Google ةملك', 'Mobile Ads', 'ةملك ةملك'])
  })
})

describe('prepareSpans', () => {
  test('turns backwards pairs around and adds the emoji selector, outside code', async () => {
    const spans = prepareSpans(parseInline('شوف )hello( و `)x(` و \u2764'))
    expect(spans.map(s => s.text)).toEqual(['شوف (hello) و ', ')x(', ' و \u2764\uFE0F'])
  })
})

describe('itemMarker', () => {
  test('draws numbers as an RTL reader meets them, bullets by depth', async () => {
    expect(itemMarker('12.', 0)).toBe('.12')
    expect(itemMarker('-', 0)).toBe('•')
    expect(itemMarker('*', 1)).toBe('◦')
  })
})

describe('writeOutLinks', () => {
  test("puts a link's URL after its text, and a bare URL once", async () => {
    const spans = writeOutLinks(parseInline('اقرأ [**دليل** التثبيت](https://x.dev/a) أو https://x.dev/b و <https://x.dev/c>'))
    expect(spans.map(s => s.text).join('')).toBe(
      'اقرأ دليل التثبيت (https://x.dev/a) أو https://x.dev/b و https://x.dev/c',
    )
  })

  // conhost: the URL Claude Code added after each link overflowed the row.
  test('rows with links written out keep to the width', async () => {
    const line =
      'هذا رابط المشروع https://github.com/MohammedSaud404/rtl-terminal وفيه كل التفاصيل / واقرأ ' +
      '[دليل التثبيت](https://github.com/MohammedSaud404/rtl-terminal#install) قبل البدء'
    const rows = layoutRtl(writeOutLinks(parseInline(line)), 60)
    for (const row of rows) {
      expect(widthOf(row.map(s => s.text).join(''))).toBeLessThanOrEqual(60)
    }
    const text = rows.map(drawn).join(' | ')
    expect(text.split('https://github.com/MohammedSaud404/rtl-terminal').length).toBe(3)
    expect(text).toContain(' | (https://github.com/MohammedSaud404/rtl-terminal#install) | ')
  })
})
