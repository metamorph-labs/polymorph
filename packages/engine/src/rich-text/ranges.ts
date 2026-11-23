import { isJson, own, typeOf, type Json } from './nodes'
import { readRichText } from './read'
import { codePointEnd, codePoints, richTextNodeText } from './text'
import type { RichTextDocument, RichTextRange } from './types'

/**
 * Positions in a document (`RichTextRange`): the one walk that every range
 * function and the editor's selection count with.
 *
 * A position is a count of Unicode code points of the document's plain text
 * with nothing between blocks, `richTextPlainText(doc, { blockSeparator: '' })`,
 * which is the text `richTextLength` counts. The walk reads the normal form in
 * reading order and cuts that text into pieces:
 *
 *  - each inline of a paragraph or a heading: a text, a hard break, an entity
 *    or an inline this version does not know;
 *  - a code block, as one piece;
 *  - any other block this version does not know, as one piece.
 *
 * A piece's text is `unitText` of its node, which is what the plain text holds
 * for it, so the pieces joined are the plain text. Positions are counted on
 * the joined text, so a surrogate pair that two pieces split between them is
 * one code point, as `richTextLength` counts it. The editor counts the nodes it
 * holds with the same `unitText` and `codePoints`, so its selection and these
 * functions agree on every position.
 *
 * Paragraphs, headings, code blocks and blocks this version does not know are
 * lines. `richTextFindText` holds a match inside one line: with nothing
 * between blocks, the end of one paragraph and the start of the next would
 * otherwise read as one word.
 */

/**
 * The text a node counts in a range: what the plain text with nothing between
 * blocks holds for it. A text is its text, a hard break a line break, an entity
 * its label, a code block its text, and a node this version does not know the
 * readable text found in it.
 */
export function unitText(node: unknown): string {
  return richTextNodeText(node, { blockSeparator: '' })
}

/** One piece of the plain text, and the node it is the text of. */
export interface Piece {
  node: unknown
  /** Where its text starts in the joined text, in UTF-16 units. */
  from: number
  /** Where its text ends in the joined text, in UTF-16 units. */
  to: number
  /** The line it is in, counted from 0 in reading order. */
  line: number
  /** Whether an annotation can sit on it: a text or an entity in a line. */
  carrier: boolean
}

/**
 * The inlines a line is rewritten to, made from its pieces, or null to keep
 * the line as it is. `text` is the joined text up to the line's end.
 */
export type Rewrite = (pieces: readonly Piece[], text: string) => unknown[] | null

export interface Walked {
  /** The document's blocks, with each line `rewrite` returned new inlines for replaced. */
  blocks: unknown[]
  pieces: Piece[]
  /** The pieces' texts joined: the plain text with nothing between blocks. */
  text: string
}

interface Walk {
  text: string
  line: number
  pieces: Piece[]
  rewrite: Rewrite | null
}

function addPiece(walk: Walk, node: unknown, line: number, carrier: boolean): void {
  const from = walk.text.length
  walk.text += unitText(node)
  walk.pieces.push({ node, from, to: walk.text.length, line, carrier })
}

/** The array with each item mapped, or the same array when no item changed. */
function mapItems(items: readonly unknown[], map: (item: unknown) => unknown): unknown[] {
  let out: unknown[] | null = null
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index]
    const next = map(item)
    if (next !== item && out === null) out = items.slice(0, index)
    out?.push(next)
  }
  return out ?? (items as unknown[])
}

/** A node whose array `key` is walked as blocks, copied only when a block in it changed. */
function withBlocks(node: Json, key: string, walk: Walk): unknown {
  const blocks = own(node, key)
  if (!Array.isArray(blocks)) return node
  const next = mapItems(blocks, (block) => walkBlock(block, walk))
  return next === blocks ? node : { ...node, [key]: next }
}

function walkBlock(block: unknown, walk: Walk): unknown {
  const json = block as Json
  switch (typeOf(block)) {
    case 'paragraph':
    case 'heading': {
      const line = walk.line
      walk.line += 1
      const first = walk.pieces.length
      const content = own(json, 'content')
      if (Array.isArray(content)) {
        for (const node of content) {
          const type = typeOf(node)
          addPiece(walk, node, line, type === 'text' || type === 'entity')
        }
      }
      const next = walk.rewrite?.(walk.pieces.slice(first), walk.text) ?? null
      return next === null ? block : { ...json, content: next }
    }
    case 'list': {
      // The reader makes every node in `items` a list item.
      const items = own(json, 'items')
      if (!Array.isArray(items)) return block
      const next = mapItems(items, (item) =>
        isJson(item) ? withBlocks(item, 'content', walk) : item,
      )
      return next === items ? block : { ...json, items: next }
    }
    case 'blockquote':
      return withBlocks(json, 'content', walk)
    default: {
      // A code block, or a block the reader kept as it was. What is inside a
      // block it kept is not read, so it is one piece and no line is rewritten in it.
      const line = walk.line
      walk.line += 1
      addPiece(walk, block, line, false)
      return block
    }
  }
}

/**
 * Walks a document in normal form and cuts its plain text into pieces. With
 * `rewrite`, each line's inlines may be replaced; the result is not in normal
 * form until it is read again.
 */
export function walkRichText(doc: RichTextDocument, rewrite: Rewrite | null = null): Walked {
  const walk: Walk = { text: '', line: 0, pieces: [], rewrite }
  const blocks = mapItems(doc.blocks, (block) => walkBlock(block, walk))
  return { blocks, pieces: walk.pieces, text: walk.text }
}

/** The position of a UTF-16 index of the joined text: the code points before it. */
export function positionOf(text: string, index: number): number {
  return codePoints(text.slice(0, index))
}

const isHigh = (code: number): boolean => code >= 0xd800 && code <= 0xdbff
const isLow = (code: number): boolean => code >= 0xdc00 && code <= 0xdfff

/**
 * `positionOf` for many indexes of one text, counted in one pass: each call
 * takes an index no smaller than the one before and counts on from where that
 * one stopped. A function that lists ranges calls it in order, so a document
 * with many matches or many annotations costs its length once, not once per
 * range.
 */
export function positionCounter(text: string): (index: number) => number {
  // `at` never falls between the two halves of a surrogate pair.
  let at = 0
  let count = 0
  return (index) => {
    while (at < index && at < text.length) {
      const pair = isHigh(text.charCodeAt(at)) && isLow(text.charCodeAt(at + 1))
      // An index between the halves of a pair: the high half counts alone, as `codePoints` counts it.
      if (pair && index === at + 1) return count + 1
      at += pair ? 2 : 1
      count += 1
    }
    return count
  }
}

/**
 * A range as UTF-16 indexes into the joined text, clamped to it, or null when
 * it holds no code point. Indexes fall on code point boundaries, so a split at
 * one never divides a surrogate pair. A range whose end is before its start,
 * or whose ends are not numbers, holds nothing.
 */
export function unitsOf(range: unknown, text: string): { from: number; to: number } | null {
  if (!isJson(range)) return null
  const start = own(range, 'start')
  const end = own(range, 'end')
  if (typeof start !== 'number' || typeof end !== 'number') return null
  const first = Math.max(0, Math.floor(start))
  const last = Math.min(codePoints(text), Math.floor(end))
  if (!(first < last)) return null
  return { from: codePointEnd(text, first), to: codePointEnd(text, last) }
}

/**
 * The plain text a range holds, with nothing between blocks: the words a
 * comment quotes. An entity is its label. A range outside the document, or
 * one that holds nothing, gives the empty string.
 */
export function richTextRangeText(doc: unknown, range: RichTextRange): string {
  const { text } = walkRichText(readRichText(doc))
  const units = unitsOf(range, text)
  return units === null ? '' : text.slice(units.from, units.to)
}

/**
 * Every range where the document's plain text holds `text`, in reading order
 * and not overlapping: how an application anchors a comment by the words it
 * quotes. A match may cross marks, entities and hard breaks, and is held
 * inside one paragraph, heading or code block. An empty `text` matches nothing.
 */
export function richTextFindText(doc: unknown, text: string): RichTextRange[] {
  if (typeof text !== 'string' || text === '') return []
  const walked = walkRichText(readRichText(doc))
  const found: RichTextRange[] = []
  const { pieces } = walked
  // Matches are found in reading order, so their ends never go back.
  const position = positionCounter(walked.text)
  let index = 0
  while (index < pieces.length) {
    const first = pieces[index] as Piece
    let next = index + 1
    while (next < pieces.length && (pieces[next] as Piece).line === first.line) next += 1
    const from = first.from
    const line = walked.text.slice(from, (pieces[next - 1] as Piece).to)
    for (let at = line.indexOf(text); at >= 0; at = line.indexOf(text, at + text.length)) {
      const start = position(from + at)
      found.push({ start, end: position(from + at + text.length) })
    }
    index = next
  }
  return found
}
