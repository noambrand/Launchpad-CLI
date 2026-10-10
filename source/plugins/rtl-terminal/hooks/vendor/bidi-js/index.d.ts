// Types for the bidi-js 1.0.3 source in this folder (unmodified, MIT, see
// LICENSE.txt), for the functions this plugin and its tests use.

export type EmbeddingLevels = {
  levels: Uint8Array
  paragraphs: { start: number; end: number; level: number }[]
}

export function getEmbeddingLevels(text: string, explicitDirection?: 'ltr' | 'rtl'): EmbeddingLevels

export function getReorderSegments(
  text: string,
  embeddingLevels: EmbeddingLevels,
  start?: number,
  end?: number,
): [number, number][]

/** Takes the levels themselves, unlike getReorderSegments. */
export function getMirroredCharactersMap(
  text: string,
  levels: Uint8Array,
  start?: number,
  end?: number,
): Map<number, string>
