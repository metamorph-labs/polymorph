import { BLOCK_TYPES, CHILD_KEYS, isJson, NODE_TYPES, own, typeOf, type Json } from './nodes'
import { emptyRichText, paragraphOfLines, readRichText } from './read'
import {
  RICH_TEXT_FORMAT,
  type RichTextBlock,
  type RichTextDocument,
  type RichTextEntity,
  type RichTextPlainTextOptions,
} from './types'

/**
 * The document as text: what a person reads, a one-line preview, the length a
 * field's limit counts, whether there is anything in it, and the entities it
 * mentions. And the reverse: a document from plain text.
 *
 * Each reads the normal form, so a document and its normal form give the same
 * answer (a document of a later format is read as far as this version can,
 * as `parseRichText` reads it), and each answers for a node this version does not know with the
 * readable text found in it (`richTextNodeText`). That rule is simple on
 * purpose, because every renderer draws an unknown node with it, the native
 * ones included:
 *
 *  1. A node of a known type gives its own text: a text node its text, an
 *     entity its label, a hard break a line break, a code block its text, and
 *     a paragraph, heading, list, list item or quote the text of what it holds.
 *  2. Any other node gives its `text` when that is a string, otherwise its
 *     `label` when that is a string, otherwise the text of the nodes in its
 *     `content`, `items` and `blocks` arrays, in that order. Among those, a
 *     node that is a known block or list item, or that holds one of those
 *     arrays, is a block: a block separator stands between it and its
 *     neighbours. The other nodes' texts are joined as they are, and a node
 *     with no text adds nothing.
 */

/**
 * How deep the walk reads a node it is handed, counted from that node. A
 * document in normal form is far shallower; the bound is for a node passed
 * straight from storage to `richTextNodeText`, which nothing has read yet.
 */
const NODE_TEXT_MAX_DEPTH = 128

interface Walk {
  separator: string
  markers: boolean
  depth: number
  ancestors: Set<object>
}

const walkOf = (options: RichTextPlainTextOptions = {}): Walk => ({
  separator: typeof options.blockSeparator === 'string' ? options.blockSeparator : '\n',
  markers: options.listMarkers === true,
  depth: 0,
  ancestors: new Set(),
})

/** Whether a node is a block in the rule's sense: a known block or list item, or a node that holds children. */
function isBlockLike(node: unknown): boolean {
  const type = typeOf(node)
  if (type === null) return false
  if (BLOCK_TYPES.has(type) || type === 'listItem') return true
  return CHILD_KEYS.some((key) => Array.isArray(own(node as Json, key)))
}

const isKnownBlock = (node: unknown): boolean => {
  const type = typeOf(node)
  return type !== null && (BLOCK_TYPES.has(type) || type === 'listItem')
}

function nodeText(node: unknown, walk: Walk): string {
  if (!isJson(node) || walk.depth >= NODE_TEXT_MAX_DEPTH || walk.ancestors.has(node)) return ''
  walk.depth += 1
  walk.ancestors.add(node)
  const type = typeOf(node)
  const text =
    type !== null && NODE_TYPES.has(type) ? knownText(node, type, walk) : foundText(node, walk)
  walk.ancestors.delete(node)
  walk.depth -= 1
  return text
}

const stringOr = (value: unknown): string => (typeof value === 'string' ? value : '')

const isWord = (value: unknown): value is string => typeof value === 'string' && value !== ''

function knownText(node: Json, type: string, walk: Walk): string {
  switch (type) {
    case 'text':
      return stringOr(own(node, 'text'))
    case 'entity':
      return stringOr(own(node, 'label'))
    case 'break':
      return '\n'
    case 'codeBlock':
      return stringOr(own(node, 'text'))
    case 'paragraph':
    case 'heading':
      return inlinesText(own(node, 'content'), walk)
    case 'list':
      return itemsText(node, walk)
    default:
      // A list item and a quote: their blocks.
      return blocksText(own(node, 'content'), walk)
  }
}

function foundText(node: Json, walk: Walk): string {
  const text = own(node, 'text')
  if (typeof text === 'string') return text
  const label = own(node, 'label')
  if (typeof label === 'string') return label
  let out = ''
  let previousBlock = false
  let first = true
  for (const key of CHILD_KEYS) {
    const children = own(node, key)
    if (!Array.isArray(children)) continue
    for (const child of children) {
      const piece = nodeText(child, walk)
      if (piece === '') continue
      const block = isBlockLike(child)
      if (!first && (block || previousBlock)) out += walk.separator
      out += piece
      previousBlock = block
      first = false
    }
  }
  return out
}

function inlinesText(content: unknown, walk: Walk): string {
  if (!Array.isArray(content)) return ''
  let out = ''
  for (const node of content) out += nodeText(node, walk)
  return out
}

/**
 * Blocks, separated. A known block with no text still stands for a line, as
 * an empty paragraph is drawn as one. A node of a type this version does not
 * know draws nothing when it has no text, so it adds nothing here either.
 */
function blocksText(blocks: unknown, walk: Walk): string {
  if (!Array.isArray(blocks)) return ''
  const pieces: string[] = []
  for (const block of blocks) {
    const piece = nodeText(block, walk)
    if (piece !== '' || isKnownBlock(block)) pieces.push(piece)
  }
  return pieces.join(walk.separator)
}

function itemsText(list: Json, walk: Walk): string {
  const items = own(list, 'items')
  if (!Array.isArray(items)) return ''
  const ordered = own(list, 'ordered') === true
  const start = own(list, 'start')
  const first = typeof start === 'number' && Number.isSafeInteger(start) ? start : 1
  return items
    .map((item, index) => {
      const marker = walk.markers ? (ordered ? `${first + index}. ` : '- ') : ''
      return marker + nodeText(item, walk)
    })
    .join(walk.separator)
}

/** The number of Unicode code points in a string: a surrogate pair is one, and a lone surrogate is one. */
export function codePoints(text: string): number {
  let count = text.length
  for (let index = 0; index < text.length - 1; index += 1) {
    const code = text.charCodeAt(index)
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = text.charCodeAt(index + 1)
      if (next >= 0xdc00 && next <= 0xdfff) {
        count -= 1
        index += 1
      }
    }
  }
  return count
}

/** The index in `text` after its first `count` code points. */
export function codePointEnd(text: string, count: number): number {
  let index = 0
  for (let seen = 0; seen < count && index < text.length; seen += 1) {
    const code = text.charCodeAt(index)
    const next = text.charCodeAt(index + 1)
    index += code >= 0xd800 && code <= 0xdbff && next >= 0xdc00 && next <= 0xdfff ? 2 : 1
  }
  return index
}

/* -------------------------------------------------------------------------- */
/* Projections                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * The readable text of any node, known or not: what a renderer draws for a
 * node of a type this version does not know (a paragraph of it for a block,
 * the text in the line for an inline), and nothing when it is empty. The rule
 * is in this file's header. Blocks found inside it are separated by
 * `blockSeparator`, a line break by default.
 */
export function richTextNodeText(node: unknown, options?: RichTextPlainTextOptions): string {
  return nodeText(node, walkOf(options))
}

/**
 * The text a person reads. Blocks are separated by `options.blockSeparator`
 * (a line break by default), a hard break is a line break, an entity is its
 * label, a code block is its text and a list item is its blocks. With
 * `options.listMarkers`, each list item starts with `- ` or its number and a
 * full stop, for a preview.
 */
export function richTextPlainText(doc: unknown, options?: RichTextPlainTextOptions): string {
  return blocksText(readRichText(doc).blocks, walkOf(options))
}

/**
 * One line for a preview: the plain text with every run of whitespace one
 * space, cut to `maxLength` code points with `…` as the last of them when it
 * is longer. A cut never splits a surrogate pair.
 */
export function richTextExcerpt(doc: unknown, maxLength: number): string {
  const limit = Math.floor(maxLength)
  if (!(limit > 0)) return ''
  const text = richTextPlainText(doc, { blockSeparator: ' ' }).replace(/\s+/g, ' ').trim()
  if (codePoints(text) <= limit) return text
  return `${text.slice(0, codePointEnd(text, limit - 1)).trimEnd()}…`
}

/**
 * The document's length as a field's limit counts it: the Unicode code points
 * of its text nodes, entity labels and code blocks, and of the readable text
 * of nodes this version does not know, plus one for each hard break. A block's
 * boundary counts nothing. Code points, not grapheme clusters or UTF-16 units,
 * because a server in any language counts code points the same way.
 */
export function richTextLength(doc: unknown): number {
  return codePoints(richTextPlainText(doc, { blockSeparator: '' }))
}

function collectEntities(node: unknown, found: RichTextEntity[], walk: Walk): void {
  if (!isJson(node) || walk.depth >= NODE_TEXT_MAX_DEPTH || walk.ancestors.has(node)) return
  const type = typeOf(node)
  if (type === 'entity') {
    const kind = own(node, 'kind')
    const id = own(node, 'id')
    const label = own(node, 'label')
    // The fields the reader requires of an entity, for one inside a node it kept as it was.
    if (isWord(kind) && isWord(id) && isWord(label)) found.push({ type: 'entity', kind, id, label })
    return
  }
  // A node whose text is its own `text` or `label` holds no other text, so it
  // holds no entity a reader sees.
  if (typeof own(node, 'text') === 'string' || typeof own(node, 'label') === 'string') return
  walk.depth += 1
  walk.ancestors.add(node)
  for (const key of CHILD_KEYS) {
    const children = own(node, key)
    if (Array.isArray(children)) for (const child of children) collectEntities(child, found, walk)
  }
  walk.ancestors.delete(node)
  walk.depth -= 1
}

function entitiesOf(blocks: readonly RichTextBlock[]): RichTextEntity[] {
  const found: RichTextEntity[] = []
  const walk = walkOf()
  for (const block of blocks) collectEntities(block, found, walk)
  return found
}

/** Every entity in the document, in the order a person reads them: the people to notify of a mention. */
export function richTextEntities(doc: unknown): RichTextEntity[] {
  return entitiesOf(readRichText(doc).blocks)
}

/**
 * Whether there is nothing in the document: no entity, and no text but
 * whitespace. An empty heading, list item, quote, code block or line break is
 * not content.
 */
export function isRichTextEmpty(doc: unknown): boolean {
  const { blocks } = readRichText(doc)
  if (entitiesOf(blocks).length > 0) return false
  return blocksText(blocks, walkOf({ blockSeparator: '' })).trim() === ''
}

const BLANK = /^[ \t]*$/

/**
 * A document of plain text, as a person typed it: a blank line separates two
 * paragraphs, and a single line break is a hard break. Blank lines at either
 * end are not paragraphs.
 */
export function richTextFromText(text: string): RichTextDocument {
  if (typeof text !== 'string') return emptyRichText()
  const blocks: RichTextBlock[] = []
  let lines: string[] = []
  for (const line of text.split(/\r\n?|\n/)) {
    if (BLANK.test(line)) {
      if (lines.length > 0) blocks.push(paragraphOfLines(lines))
      lines = []
    } else {
      lines.push(line)
    }
  }
  if (lines.length > 0) blocks.push(paragraphOfLines(lines))
  return { format: RICH_TEXT_FORMAT, blocks }
}
