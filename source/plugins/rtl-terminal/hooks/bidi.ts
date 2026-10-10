// Character facts the layout needs: bidi strength, display width, and the
// levels the Unicode Bidirectional Algorithm gives a right-to-left paragraph.

import { getEmbeddingLevels, getMirroredCharactersMap } from './vendor/bidi-js/index.js'
import { WIDE_RANGES } from './wide'

export const RLM = '\u200F'
export const LRM = '\u200E'

// Strong right-to-left characters (bidi classes R and AL) of every RTL
// script: Hebrew, Arabic (Persian, Urdu, Pashto, Kurdish, Sindhi, Uyghur...),
// Syriac, Thaana, NKo, Samaritan, Mandaic, Adlam, Hanifi Rohingya, Yezidi,
// Mende Kikakui and the old scripts of 10800-10FFF, their presentation forms,
// and RLM. Digits and combining marks are left out: they are not strong.
const RTL_LETTER =
  /[\u05BE\u05C0\u05C3\u05C6\u05D0-\u05F4\u0608\u060B\u060D\u061B-\u064A\u066D-\u066F\u0671-\u06D5\u06E5\u06E6\u06EE\u06EF\u06FA-\u070D\u0710-\u074A\u074D-\u07A5\u07B1\u07C0-\u07EA\u07F4\u07F5\u07FA-\u0815\u081A\u0824\u0828\u0830-\u0858\u085E-\u088E\u08A0-\u08C9\u200F\uFB1D\uFB1F-\uFB28\uFB2A-\uFD3D\uFD50-\uFDFC\uFE70-\uFEFC\u{10800}-\u{10FFF}\u{1E800}-\u{1EFFF}]/u
const LETTER = /[\p{L}\u200E]/u

export type Strong = 'R' | 'L' | null

export function strongOf(ch: string): Strong {
  if (RTL_LETTER.test(ch)) return 'R'
  if (LETTER.test(ch)) return 'L'
  return null
}

export function hasRtl(text: string): boolean {
  return RTL_LETTER.test(text)
}

export function firstStrong(text: string): Strong {
  for (const ch of text) {
    const dir = strongOf(ch)
    if (dir) return dir
  }
  return null
}

export function lastStrong(text: string): Strong {
  const chars = Array.from(text)
  for (let i = chars.length - 1; i >= 0; i--) {
    const dir = strongOf(chars[i] ?? '')
    if (dir) return dir
  }
  return null
}

// Characters that join the cluster before them: marks, joiners, variation
// selectors, skin tones, tag characters and the keycap.
const EXTENDS =
  /[\p{M}\u200C\u200D\uFE00-\uFE0F\u{1F3FB}-\u{1F3FF}\u{E0020}-\u{E007F}\u20E3]/u
const REGIONAL = /[\u{1F1E6}-\u{1F1FF}]/u
const NOTHING_DRAWN = /^[\p{M}\p{Cf}\p{Cc}\u2060-\u206F\uFE00-\uFE0F\uFEFF]+$/u
// What makes a cluster an emoji the terminal draws two wide whatever its base:
// the emoji selector, a skin tone, a joined sequence, tags or a keycap.
const EMOJI_MARKS = /[\uFE0F\u200D\u20E3\u{1F3FB}-\u{1F3FF}\u{E0020}-\u{E007F}]/u
const EMOJI_BASE = /[\p{Extended_Pictographic}#*0-9]/u
// Drawn as emoji by default; covers emoji newer than the width table.
const EMOJI_PRESENTATION = /\p{Emoji_Presentation}/u

const segmenter =
  typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function'
    ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
    : null

/** The grapheme clusters of `text`: what a terminal draws as one glyph. */
export function clusters(text: string): string[] {
  if (segmenter) return Array.from(segmenter.segment(text), part => part.segment)

  const out: string[] = []
  let joinNext = false
  for (const ch of text) {
    const last = out.length - 1
    const prev = out[last]
    const pairsFlag =
      prev !== undefined && REGIONAL.test(ch) && /^[\u{1F1E6}-\u{1F1FF}]$/u.test(prev)
    if (prev !== undefined && (joinNext || EXTENDS.test(ch) || pairsFlag)) {
      out[last] = prev + ch
    } else {
      out.push(ch)
    }
    joinNext = ch === '\u200D'
  }
  return out
}

function isWide(cp: number): boolean {
  let lo = 0
  let hi = WIDE_RANGES.length / 2 - 1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    const start = WIDE_RANGES[mid * 2] ?? 0
    const end = WIDE_RANGES[mid * 2 + 1] ?? 0
    if (cp < start) hi = mid - 1
    else if (cp > end) lo = mid + 1
    else return true
  }
  return false
}

/** Terminal cells one grapheme cluster takes. */
export function clusterWidth(cluster: string): number {
  const cp = cluster.codePointAt(0) ?? 0
  if (cp < 0x20 || (cp >= 0x7f && cp < 0xa0) || NOTHING_DRAWN.test(cluster)) return 0
  const base = String.fromCodePoint(cp)
  if (REGIONAL.test(base)) return 2
  if (EMOJI_BASE.test(base) && EMOJI_MARKS.test(cluster.slice(base.length))) return 2
  return isWide(cp) || EMOJI_PRESENTATION.test(base) ? 2 : 1
}

/**
 * Terminal cells `text` takes, as Claude Code measures it: marks and format
 * characters none; East Asian wide and fullwidth characters, emoji drawn as
 * emoji (by default or by the emoji selector), skin-toned and joined
 * sequences, flags and keycaps two; the rest one.
 */
export function widthOf(text: string): number {
  let width = 0
  for (const cluster of clusters(text)) width += clusterWidth(cluster)
  return width
}

// Pictographs a terminal draws from a color emoji font two cells wide even
// when Unicode says they are one: Miscellaneous Symbols, Dingbats, arrows and
// stars of 2B00, and the emoji planes. Given the emoji selector, they are laid
// out two wide too, and stop overlapping what follows.
const PICTOGRAPH_BLOCKS = /[\u2600-\u27BF\u2B00-\u2BFF\u{1F000}-\u{1FAFF}]/u
const PICTOGRAPH = /\p{Extended_Pictographic}/u

/** `text` with every lone text-style pictograph given the emoji selector. */
export function asEmoji(text: string): string {
  if (!PICTOGRAPH_BLOCKS.test(text)) return text
  return clusters(text)
    .map(cluster => {
      const base = String.fromCodePoint(cluster.codePointAt(0) ?? 0)
      const isTextStyle =
        cluster === base &&
        PICTOGRAPH_BLOCKS.test(base) &&
        PICTOGRAPH.test(base) &&
        !EMOJI_PRESENTATION.test(base)
      return isTextStyle ? `${base}\uFE0F` : cluster
    })
    .join('')
}

const OPENERS: Record<string, string> = { '(': ')', '[': ']', '{': '}' }
const CLOSERS: Record<string, string> = { ')': '(', ']': '[', '}': '{' }

// Where a word begins or ends: a space, an end of the text, or (after a
// closing bracket) punctuation.
const BREAK = /\s/
const AFTER_CLOSE = /[\s.,:;!?\u060C\u061B\u061F]/

/**
 * Turns each bracket that pairs with nothing the way its place says, as RTL
 * keyboard layouts often type them backwards (`)x(`, `(x(`, `)x)`): one
 * between a break and a word opens, one between a word and a break closes;
 * one with a word or a break on both sides stays as it is (`1)`, `:)`).
 * `editable` marks the characters that may change (code and links are left as
 * written); `chars` is changed in place.
 */
export function fixTypedBrackets(chars: string[], editable: boolean[]): void {
  const matched = new Set<number>()
  const stack: { at: number; close: string }[] = []
  chars.forEach((ch, i) => {
    if (!editable[i]) return
    const close = OPENERS[ch]
    if (close) {
      stack.push({ at: i, close })
      return
    }
    for (let s = stack.length - 1; s >= 0; s--) {
      const open = stack[s]
      if (open?.close === ch) {
        matched.add(open.at)
        matched.add(i)
        stack.length = s
        break
      }
    }
  })

  chars.forEach((ch, i) => {
    if (!editable[i] || matched.has(i)) return
    const before = chars[i - 1]
    const after = chars[i + 1]
    const opensWord = (before === undefined || BREAK.test(before)) && after !== undefined && !BREAK.test(after)
    const closesWord =
      before !== undefined && !BREAK.test(before) && (after === undefined || AFTER_CLOSE.test(after))
    const opener = CLOSERS[ch]
    const closer = OPENERS[ch]
    if (opener && opensWord && !closesWord) chars[i] = opener
    else if (closer && closesWord && !opensWord) chars[i] = closer
  })
}

/**
 * The levels the full Unicode Bidirectional Algorithm gives each UTF-16 unit
 * of a paragraph of base direction RTL (odd right-to-left, even
 * left-to-right), and the characters those levels draw mirrored.
 */
export function resolveRtl(text: string): { levels: Uint8Array; mirrors: Map<number, string> } {
  const embedding = getEmbeddingLevels(text, 'rtl')
  return { levels: embedding.levels, mirrors: getMirroredCharactersMap(text, embedding.levels) }
}
