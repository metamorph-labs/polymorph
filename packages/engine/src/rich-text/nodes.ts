import type { RichTextBlock, RichTextInline, RichTextMark } from './types'

/**
 * What this version knows about a node: the types it reads in each place, and
 * how it reads a field.
 *
 * A document is JSON from anywhere, so every reader treats a node as `unknown`
 * and narrows it here. A field is read only when the node holds it as its own
 * property: a value inherited from a prototype, which JSON cannot hold, is
 * never taken for part of the document.
 *
 * The guards are what a renderer and the editor ask of a node in a document
 * `normalizeRichText` returned, where a node of a known type has every field
 * its type names. A node they refuse is drawn as its readable text
 * (`richTextNodeText`), the same way in every renderer.
 */

export type Json = Record<string, unknown>

/** The block types this version reads among blocks. */
export const BLOCK_TYPES: ReadonlySet<string> = new Set([
  'paragraph',
  'heading',
  'list',
  'blockquote',
  'codeBlock',
])

/** The inline types this version reads in a paragraph's or a heading's content. */
export const INLINE_TYPES: ReadonlySet<string> = new Set(['text', 'break', 'entity'])

/** The mark types, in the order a text's marks are written. */
export const MARK_ORDER = ['link', 'bold', 'italic', 'strike', 'code'] as const

export const MARK_TYPES: ReadonlySet<string> = new Set(MARK_ORDER)

/** A node of one of these types in a place its kind cannot be is out of place, not unknown. */
export const NODE_TYPES: ReadonlySet<string> = new Set([
  ...BLOCK_TYPES,
  ...INLINE_TYPES,
  'listItem',
])

/** The arrays a node's readable text is found in, in the order they are read. */
export const CHILD_KEYS = ['content', 'items', 'blocks'] as const

export const isJson = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const hasOwn = Object.prototype.hasOwnProperty

/** The node's own field `key`, or `undefined` when it holds none. */
export function own(node: Json, key: string): unknown {
  return hasOwn.call(node, key) ? node[key] : undefined
}

/** The node's `type` when it is an object with a string type, otherwise `null`. */
export function typeOf(node: unknown): string | null {
  if (!isJson(node)) return null
  const type = own(node, 'type')
  return typeof type === 'string' ? type : null
}

/** Whether a node is a block of a type this version draws: a paragraph, a heading, a list, a quote or a code block. */
export function isRichTextBlockKnown(node: unknown): node is RichTextBlock {
  const type = typeOf(node)
  return type !== null && BLOCK_TYPES.has(type)
}

/** Whether a node is an inline of a type this version draws: a text, a hard break or an entity. */
export function isRichTextInlineKnown(node: unknown): node is RichTextInline {
  const type = typeOf(node)
  return type !== null && INLINE_TYPES.has(type)
}

/** Whether a mark is one this version draws. A mark it refuses draws nothing, and its text is drawn. */
export function isRichTextMarkKnown(mark: unknown): mark is RichTextMark {
  const type = typeOf(mark)
  return type !== null && MARK_TYPES.has(type)
}
