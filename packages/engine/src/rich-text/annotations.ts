import { ANNOTATION, own, typeOf, type Json } from './nodes'
import { normalizeRichText } from './read'
import { positionOf, unitsOf, walkRichText } from './ranges'
import type { RichTextAnnotation, RichTextDocument, RichTextRange } from './types'

/**
 * Annotations: anchors an application keeps for stretches of a document (a
 * comment thread, a review note), as `annotation` marks on the texts and
 * entities they cover (`RichTextAnnotationMark`).
 *
 * Each function reads the normal form and positions with the walk in
 * `ranges.ts`, so a range an application found with `richTextFindText`, or
 * read from the editor's selection, names the same words here. Only a text and
 * an entity carry an annotation. A hard break, a code block's text and a node
 * this version does not know carry none, so a range over only those anchors
 * nothing.
 */

const byKey = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

function marksOf(node: unknown): unknown[] {
  const marks = own(node as Json, 'marks')
  return Array.isArray(marks) ? marks : []
}

/** The node with `mark` added to its marks. The reader orders them and drops a repeated id. */
const withMark = (node: Json, mark: Json): Json => ({ ...node, marks: [...marksOf(node), mark] })

const isAnnotation = (mark: unknown, id: string): boolean =>
  typeOf(mark) === ANNOTATION && own(mark as Json, 'id') === id

/**
 * The document with the annotation `id` on every text and entity in `range`,
 * in normal form. A text is split at the range's ends, which fall between
 * code points. A range that ends inside an entity covers the whole entity; a
 * node this version does not know cannot carry the mark and is left as it is.
 * When the range holds nothing, lies outside the document or covers nothing
 * that can carry the mark, or `id` is not a non-empty string, the result is
 * the document's normal form unchanged. The input is not changed.
 */
export function annotateRichText(doc: unknown, range: RichTextRange, id: string): RichTextDocument {
  const read = normalizeRichText(doc)
  if (typeof id !== 'string' || id === '') return read
  const units = unitsOf(range, walkRichText(read).text)
  if (units === null) return read
  const mark: Json = { type: ANNOTATION, id }
  let carried = false
  const walked = walkRichText(read, (pieces, text) => {
    let changed = false
    const content: unknown[] = []
    for (const piece of pieces) {
      const node = piece.node as Json
      if (!piece.carrier || piece.to <= units.from || piece.from >= units.to) {
        content.push(node)
        continue
      }
      changed = true
      if (typeOf(node) === 'entity') {
        content.push(withMark(node, mark))
        continue
      }
      const words = text.slice(piece.from, piece.to)
      const start = Math.max(units.from, piece.from) - piece.from
      const end = Math.min(units.to, piece.to) - piece.from
      if (start > 0) content.push({ ...node, text: words.slice(0, start) })
      content.push(withMark({ ...node, text: words.slice(start, end) }, mark))
      if (end < words.length) content.push({ ...node, text: words.slice(end) })
    }
    if (!changed) return null
    carried = true
    return content
  })
  return carried ? normalizeRichText({ ...read, blocks: walked.blocks }) : read
}

/** The document with every mark of the annotation `id` removed, in normal form. The input is not changed. */
export function removeRichTextAnnotation(doc: unknown, id: string): RichTextDocument {
  const read = normalizeRichText(doc)
  if (typeof id !== 'string') return read
  let removed = false
  const walked = walkRichText(read, (pieces) => {
    let changed = false
    const content = pieces.map((piece) => {
      const marks = marksOf(piece.node)
      if (!piece.carrier || !marks.some((mark) => isAnnotation(mark, id))) return piece.node
      changed = true
      return { ...(piece.node as Json), marks: marks.filter((mark) => !isAnnotation(mark, id)) }
    })
    if (!changed) return null
    removed = true
    return content
  })
  return removed ? normalizeRichText({ ...read, blocks: walked.blocks }) : read
}

/**
 * Every annotation the document holds, one entry per id, ordered by where each
 * starts and then by id. `range` runs from its first character to its last,
 * across any text between its pieces; `text` is the text of what carries it,
 * the pieces joined with nothing between them and an entity as its label. An
 * annotation whose last character was deleted is no longer listed.
 */
export function richTextAnnotations(doc: unknown): RichTextAnnotation[] {
  const walked = walkRichText(normalizeRichText(doc))
  const found = new Map<string, { from: number; to: number; text: string }>()
  for (const piece of walked.pieces) {
    if (!piece.carrier) continue
    const words = walked.text.slice(piece.from, piece.to)
    for (const mark of marksOf(piece.node)) {
      if (typeOf(mark) !== ANNOTATION) continue
      // The reader keeps an annotation only with a non-empty string id.
      const id = own(mark as Json, 'id') as string
      const entry = found.get(id)
      if (entry) {
        entry.to = piece.to
        entry.text += words
      } else {
        found.set(id, { from: piece.from, to: piece.to, text: words })
      }
    }
  }
  return [...found]
    .map(([id, entry]) => ({
      id,
      text: entry.text,
      range: { start: positionOf(walked.text, entry.from), end: positionOf(walked.text, entry.to) },
    }))
    .sort((a, b) => a.range.start - b.range.start || byKey(a.id, b.id))
}
