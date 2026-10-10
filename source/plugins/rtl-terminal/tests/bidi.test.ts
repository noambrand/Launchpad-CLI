import { describe, expect, test } from 'claude-code/testing'

import { LRM, RLM, asEmoji, firstStrong, fixTypedBrackets, widthOf } from '../hooks/bidi'

describe('firstStrong', () => {
  test('knows the letters of every RTL script', async () => {
    expect(firstStrong('مرحبا')).toBe('R')
    expect(firstStrong('שלום')).toBe('R')
    expect(firstStrong('سلام دنیا')).toBe('R')
    expect(firstStrong('یہ ایک')).toBe('R')
    expect(firstStrong('ܫܠܡܐ')).toBe('R')
    expect(firstStrong('ދިވެހި')).toBe('R')
    expect(firstStrong('ߒߞߏ')).toBe('R')
    expect(firstStrong('𞤀𞤣𞤤𞤢𞤥')).toBe('R')
  })

  test('skips digits, punctuation and marks', async () => {
    expect(firstStrong('26 - (Google')).toBe('L')
    expect(firstStrong('١٢ ،؟ عربي')).toBe('R')
    expect(firstStrong(`${RLM}Google`)).toBe('R')
    expect(firstStrong('123 ...')).toBe(null)
  })
})

describe('widthOf', () => {
  test('counts marks and direction marks as nothing', async () => {
    expect(widthOf('شغّل')).toBe(3)
    expect(widthOf(`${RLM}ab${LRM}`)).toBe(2)
  })

  test('counts wide characters twice', async () => {
    expect(widthOf('日本')).toBe(4)
  })
})

describe('fixTypedBrackets', () => {
  const fixed = (text: string) => {
    const chars = Array.from(text)
    fixTypedBrackets(chars, chars.map(() => true))
    return chars.join('')
  }

  test('turns brackets typed backwards the way their place says', async () => {
    expect(fixed(')hello( ]this text[ و (عادي)')).toBe(
      '(hello) [this text] و (عادي)',
    )
    expect(fixed('(some bugs( موجودة')).toBe(
      '(some bugs) موجودة',
    )
    expect(fixed(')x) و (y(.')).toBe('(x) و (y).')
  })

  test('leaves brackets whose place says nothing alone', async () => {
    expect(fixed('1) نص 2) نص')).toBe('1) نص 2) نص')
    expect(fixed(':) و (: و a(b')).toBe(':) و (: و a(b')
  })

  test('leaves what may not change alone', async () => {
    const chars = Array.from(')x(')
    fixTypedBrackets(chars, [false, true, false])
    expect(chars.join('')).toBe(')x(')
  })
})

describe('asEmoji', () => {
  test('gives text-style pictographs the emoji selector, once', async () => {
    expect(asEmoji('و\u2764 \u26A0 \u2705 \u2764\uFE0F \u2122')).toBe(
      'و\u2764\uFE0F \u26A0\uFE0F \u2705 \u2764\uFE0F \u2122',
    )
  })
})
