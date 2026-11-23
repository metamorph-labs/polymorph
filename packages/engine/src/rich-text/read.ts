import { richTextHref } from './href'
import { migrateRichText, RICH_TEXT_VERSION, richTextFormatVersion } from './migrate'
import {
  BLOCK_TYPES,
  isJson,
  MARK_ORDER,
  MARK_TYPES,
  NODE_TYPES,
  own,
  typeOf,
  type Json,
} from './nodes'
import {
  RICH_TEXT_FORMAT,
  RICH_TEXT_MAX_DEPTH,
  type RichTextBlock,
  type RichTextDocument,
  type RichTextFault,
  type RichTextFaultCode,
  type RichTextInline,
  type RichTextParagraph,
  type RichTextParseResult,
} from './types'

/**
 * The tolerant reader (`parseRichText`, `normalizeRichText`,
 * `serializeRichText`). It takes any JSON and gives the document in normal
 * form, with a fault for each thing it repaired, removed or did not know.
 *
 * One walk makes the normal form and finds the faults, so a fault's path is
 * the place the walk was at. The walk never throws: a value it cannot read is
 * a fault, and the result is always a document a renderer can draw. Making a
 * valid document normal (joining runs, ordering marks, leaving out a default)
 * is not a fault.
 *
 * Normal form is what makes two equal documents equal JSON:
 *
 *  - Adjacent text nodes with equal marks are one node, and an empty text node
 *    is no node.
 *  - Marks are written `link, bold, italic, strike, code`, each once, and then
 *    any mark this version does not know. `marks` is omitted when there are
 *    none.
 *  - `start` is omitted when it is 1 or the list is bulleted, and `language`
 *    when it is empty.
 *  - Every node in a list's `items` is a list item, and a list item's first
 *    block is a paragraph: an empty one is added when it is not. A list with
 *    no items and a quote with no blocks are no block.
 *  - A link whose target `richTextHref` refuses loses its mark, and its text is
 *    kept. The target kept is the cleaned one.
 *  - A quote or a list inside `RICH_TEXT_MAX_DEPTH` quotes and lists is
 *    flattened to paragraphs of its text, so no renderer recurses deeper.
 *  - Keys are written in one order: a known node's in the order `types.ts`
 *    declares them, and then any field it does not know, by name; an object it
 *    does not know with `type` first and the rest by name.
 *
 * What it does not know, it keeps. A node or a mark of an unknown type, a node
 * of a known type in a place its kind cannot be (a text among blocks), and a
 * field a known node does not have are kept as the same JSON value, at the
 * same place. The node or mark is a fault. The field is not, because a later
 * version may add an optional field without changing the format. A node in a
 * list's `items` that is not a list item is the one exception to "the same
 * place": it is kept as the content of a list item, so a renderer can trust
 * that every item is one.
 */

type Path = readonly (string | number)[]

type Entries = readonly (readonly [string, unknown])[]

const NONE: Entries = []

/**
 * How deep the reader copies a value it does not know, counted from the node
 * that holds it as the first level. A node a later version writes is not
 * expected to nest that deep, and a hostile one cannot then exhaust the stack
 * of anything that walks the copy.
 */
export const OPAQUE_MAX_DEPTH = 64

/** Each known node's fields, in the order they are written. Anything else is kept after them. */
const DOCUMENT_KEYS: ReadonlySet<string> = new Set(['format', 'blocks'])
const PARAGRAPH_KEYS: ReadonlySet<string> = new Set(['type', 'content'])
const HEADING_KEYS: ReadonlySet<string> = new Set(['type', 'level', 'content'])
const LIST_KEYS: ReadonlySet<string> = new Set(['type', 'ordered', 'start', 'items'])
const ITEM_KEYS: ReadonlySet<string> = new Set(['type', 'content'])
const QUOTE_KEYS: ReadonlySet<string> = new Set(['type', 'content'])
const CODE_KEYS: ReadonlySet<string> = new Set(['type', 'language', 'text'])
const TEXT_KEYS: ReadonlySet<string> = new Set(['type', 'text', 'marks'])
const BREAK_KEYS: ReadonlySet<string> = new Set(['type'])
const ENTITY_KEYS: ReadonlySet<string> = new Set(['type', 'kind', 'id', 'label'])
const LINK_KEYS: ReadonlySet<string> = new Set(['type', 'href'])
const MARK_KEYS: ReadonlySet<string> = new Set(['type'])

/* -------------------------------------------------------------------------- */
/* Faults                                                                      */
/* -------------------------------------------------------------------------- */

function fault(
  faults: RichTextFault[],
  code: RichTextFaultCode,
  path: Path,
  message: string,
): void {
  faults.push({ code, path: [...path], message })
}

/** A value named in a message, cut so a hostile value cannot make the message long. */
function named(value: string): string {
  return JSON.stringify(value.length > 40 ? `${value.slice(0, 40)}…` : value)
}

function described(value: unknown): string {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'a list'
  if (typeof value === 'object') return 'an object with no string type'
  return `a ${typeof value}`
}

/* -------------------------------------------------------------------------- */
/* What this version does not know                                             */
/* -------------------------------------------------------------------------- */

const OMIT = Symbol('omit')

interface CopyState {
  /** A value deeper than `OPAQUE_MAX_DEPTH` was left out. */
  cut: boolean
  /** A value that holds itself was left out. JSON cannot, so only a value passed in memory can. */
  cycle: boolean
  ancestors: Set<object>
}

const copyState = (): CopyState => ({ cut: false, cycle: false, ancestors: new Set() })

/** An object's own keys in the order the reader writes them: `type` first, then by name. */
function orderedKeys(value: object): string[] {
  return Object.keys(value).sort((a, b) =>
    a === b ? 0 : a === 'type' ? -1 : b === 'type' ? 1 : a < b ? -1 : 1,
  )
}

/**
 * Sets an own property. `__proto__` is the one key an assignment would not
 * set as data: it would change the object's prototype. JSON can hold the key,
 * so the reader keeps it as data, as `JSON.parse` does.
 */
function put(target: Json, key: string, value: unknown): void {
  if (key === '__proto__') {
    Object.defineProperty(target, key, {
      value,
      enumerable: true,
      writable: true,
      configurable: true,
    })
  } else {
    target[key] = value
  }
}

function assign<T extends object>(target: T, entries: Entries): T {
  for (const [key, value] of entries) put(target as Json, key, value)
  return target
}

/**
 * A copy of a value the reader does not know, as the JSON it would serialize
 * to: what JSON cannot hold (a function, `undefined`, a cycle) is left out as
 * `JSON.stringify` leaves it out, and keys are written in the reader's order.
 */
function copyJson(value: unknown, depth: number, state: CopyState): unknown {
  switch (typeof value) {
    case 'string':
    case 'boolean':
      return value
    case 'number':
      return Number.isFinite(value) ? value : null
    case 'object':
      break
    default:
      return OMIT
  }
  if (value === null) return null
  if (depth > OPAQUE_MAX_DEPTH) {
    state.cut = true
    return OMIT
  }
  if (state.ancestors.has(value)) {
    state.cycle = true
    return OMIT
  }
  state.ancestors.add(value)
  let copy: unknown
  if (Array.isArray(value)) {
    const items: unknown[] = []
    for (let index = 0; index < value.length; index += 1) {
      const item = copyJson(value[index], depth + 1, state)
      items.push(item === OMIT ? null : item)
    }
    copy = items
  } else {
    const object: Json = {}
    for (const key of orderedKeys(value)) {
      const item = copyJson((value as Json)[key], depth + 1, state)
      if (item !== OMIT) put(object, key, item)
    }
    copy = object
  }
  state.ancestors.delete(value)
  return copy
}

function copyFaults(state: CopyState, path: Path, faults: RichTextFault[]): void {
  if (state.cut) {
    fault(
      faults,
      'too-deep',
      path,
      `A value nested more than ${OPAQUE_MAX_DEPTH} deep inside it is left out.`,
    )
  }
  if (state.cycle) {
    fault(
      faults,
      'malformed',
      path,
      'It holds itself, which JSON cannot. The reference is left out.',
    )
  }
}

/** The fields a known node does not have, copied, in the order they are written. */
function readExtras(
  node: Json,
  known: ReadonlySet<string>,
  path: Path,
  faults: RichTextFault[],
): Entries {
  let keys: string[] | null = null
  for (const key of Object.keys(node)) if (!known.has(key)) (keys ??= []).push(key)
  if (keys === null) return NONE
  const state = copyState()
  state.ancestors.add(node)
  const entries: [string, unknown][] = []
  for (const key of keys.sort()) {
    const value = copyJson(node[key], 2, state)
    if (value !== OMIT) entries.push([key, value])
  }
  copyFaults(state, path, faults)
  return entries
}

type Place = 'block' | 'inline' | 'mark'

const PLACE_WORDS: Record<Place, string> = {
  block: 'among blocks',
  inline: 'in a line of text',
  mark: 'among marks',
}

/**
 * A node or mark kept as it is: of a type this version does not know, or of a
 * known type in a place its kind cannot be.
 */
function keep(
  node: Json,
  type: string,
  path: Path,
  faults: RichTextFault[],
  place: Place,
): unknown {
  if (NODE_TYPES.has(type) || MARK_TYPES.has(type)) {
    const drawn =
      place === 'mark' ? 'It is kept and draws nothing.' : 'It is kept and drawn as its text.'
    fault(
      faults,
      'malformed',
      path,
      `A ${named(type)} cannot stand ${PLACE_WORDS[place]}. ${drawn}`,
    )
  } else if (place === 'mark') {
    fault(
      faults,
      'unknown-mark',
      path,
      `A mark of type ${named(type)} is not one this version knows. It is kept and draws nothing.`,
    )
  } else {
    fault(
      faults,
      'unknown-node',
      path,
      `A node of type ${named(type)} is not one this version knows. It is kept and drawn as its text.`,
    )
  }
  const state = copyState()
  const copy = copyJson(node, 1, state)
  copyFaults(state, path, faults)
  return copy
}

/* -------------------------------------------------------------------------- */
/* Inlines and marks                                                           */
/* -------------------------------------------------------------------------- */

function readMarks(value: unknown, path: Path, faults: RichTextFault[]): unknown[] {
  if (value === undefined) return []
  if (!Array.isArray(value)) {
    fault(
      faults,
      'malformed',
      path,
      "A text's marks are not a list. The text is kept without them.",
    )
    return []
  }
  const known = new Map<string, Json>()
  const others: { key: string; mark: unknown }[] = []
  const seen = new Set<string>()
  for (let index = 0; index < value.length; index += 1) {
    const mark: unknown = value[index]
    const at = [...path, index]
    const type = typeOf(mark)
    if (type === null) {
      fault(faults, 'malformed', at, `A mark is ${described(mark)}. It is left out.`)
      continue
    }
    const json = mark as Json
    if (type === 'link') {
      const href = own(json, 'href')
      if (typeof href !== 'string') {
        fault(
          faults,
          'malformed',
          at,
          'A link has no target. The link is removed and its text kept.',
        )
        continue
      }
      const safe = richTextHref(href)
      if (safe === null) {
        fault(
          faults,
          'unsafe-link',
          at,
          `A link to ${named(href)} may not be followed. The link is removed and its text kept.`,
        )
        continue
      }
      const first = known.get('link')
      if (first !== undefined) {
        if (first.href !== safe) {
          fault(faults, 'malformed', at, 'A text has a second link. The first is kept.')
        }
        continue
      }
      known.set('link', assign({ type, href: safe }, readExtras(json, LINK_KEYS, at, faults)))
      continue
    }
    if (MARK_TYPES.has(type)) {
      if (!known.has(type))
        known.set(type, assign({ type }, readExtras(json, MARK_KEYS, at, faults)))
      continue
    }
    const copy = keep(json, type, at, faults, 'mark')
    const key = JSON.stringify(copy)
    if (seen.has(key)) continue
    seen.add(key)
    others.push({ key, mark: copy })
  }
  const marks: unknown[] = []
  for (const type of MARK_ORDER) {
    const mark = known.get(type)
    if (mark !== undefined) marks.push(mark)
  }
  others.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
  for (const { mark } of others) marks.push(mark)
  return marks
}

const isWord = (value: unknown): value is string => typeof value === 'string' && value !== ''

/**
 * A line of inlines. Text nodes that follow each other with the same marks
 * and fields are merged, which is also what joins two runs once an empty one
 * between them, or a mark that differed, is gone.
 */
function readInlines(
  nodes: readonly unknown[],
  path: Path,
  faults: RichTextFault[],
): RichTextInline[] {
  const out: unknown[] = []
  let last: { text: string } | null = null
  let lastKey = ''

  const pushText = (text: string, marks: unknown[], extras: Entries) => {
    if (text === '') return
    const key = marks.length === 0 && extras.length === 0 ? '' : JSON.stringify([marks, extras])
    if (last !== null && key === lastKey) {
      last.text += text
      return
    }
    const node: Json & { text: string } = { type: 'text', text }
    if (marks.length > 0) node.marks = marks
    out.push(assign(node, extras))
    last = node
    lastKey = key
  }

  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index]
    const at = [...path, index]
    const type = typeOf(node)
    if (type === null) {
      fault(faults, 'malformed', at, `A node is ${described(node)}. It is left out.`)
      continue
    }
    const json = node as Json
    if (type === 'text') {
      const text = own(json, 'text')
      if (typeof text !== 'string') {
        fault(faults, 'malformed', at, 'A text node has no text. It is left out.')
        continue
      }
      pushText(
        text,
        readMarks(own(json, 'marks'), [...at, 'marks'], faults),
        readExtras(json, TEXT_KEYS, at, faults),
      )
      continue
    }
    if (type === 'entity') {
      const kind = own(json, 'kind')
      const id = own(json, 'id')
      const label = own(json, 'label')
      if (isWord(kind) && isWord(id) && isWord(label)) {
        out.push(assign({ type, kind, id, label }, readExtras(json, ENTITY_KEYS, at, faults)))
        last = null
      } else if (isWord(label)) {
        fault(faults, 'malformed', at, 'An entity has no kind or no id. Its label is kept as text.')
        pushText(label, [], NONE)
      } else {
        fault(faults, 'malformed', at, 'An entity has no label. It is left out.')
      }
      continue
    }
    if (type === 'break') out.push(assign({ type }, readExtras(json, BREAK_KEYS, at, faults)))
    else out.push(keep(json, type, at, faults, 'inline'))
    last = null
  }
  return out as RichTextInline[]
}

function readContent(node: Json, path: Path, faults: RichTextFault[]): RichTextInline[] {
  const content = own(node, 'content')
  if (Array.isArray(content)) return readInlines(content, [...path, 'content'], faults)
  fault(
    faults,
    'malformed',
    [...path, 'content'],
    'A line of text has no content list. It is kept empty.',
  )
  return []
}

/* -------------------------------------------------------------------------- */
/* Blocks                                                                      */
/* -------------------------------------------------------------------------- */

/** A paragraph of lines, each after the first on a hard break: a code block's text, or plain text. */
export function paragraphOfLines(lines: readonly string[]): RichTextParagraph {
  const content: RichTextInline[] = []
  lines.forEach((line, index) => {
    if (index > 0) content.push({ type: 'break' })
    if (line !== '') content.push({ type: 'text', text: line })
  })
  return { type: 'paragraph', content }
}

/** A code block's text split into its lines. */
export const linesOf = (text: string): string[] => text.split(/\r\n?|\n/)

const emptyParagraph = (): RichTextParagraph => ({ type: 'paragraph', content: [] })

/**
 * The blocks of a quote or list that sits too deep, as paragraphs.
 *
 * The walk keeps its own stack, so a document nested thousands deep is read
 * without recursion. Each paragraph and heading becomes a paragraph of its
 * inlines, each code block a paragraph of its lines, and a node this version
 * does not know is kept as it is. A fault inside names the flattened block's
 * path, so a hostile document's faults do not grow with its depth.
 */
function flatten(container: Json, path: Path, faults: RichTextFault[], out: unknown[]): void {
  const ancestors = new Set<object>()
  const stack: { node: unknown; leave: boolean }[] = [{ node: container, leave: false }]
  while (stack.length > 0) {
    const { node, leave } = stack.pop() as { node: unknown; leave: boolean }
    if (leave) {
      ancestors.delete(node as object)
      continue
    }
    const type = typeOf(node)
    if (type === null) continue
    const json = node as Json
    if (type === 'list' || type === 'blockquote' || type === 'listItem') {
      if (ancestors.has(json)) continue
      ancestors.add(json)
      stack.push({ node: json, leave: true })
      const children = own(json, type === 'list' ? 'items' : 'content')
      if (Array.isArray(children)) {
        for (let index = children.length - 1; index >= 0; index -= 1) {
          stack.push({ node: children[index], leave: false })
        }
      }
    } else if (type === 'paragraph' || type === 'heading') {
      const content = own(json, 'content')
      out.push({
        type: 'paragraph',
        content: Array.isArray(content) ? readInlines(content, path, faults) : [],
      })
    } else if (type === 'codeBlock') {
      const text = own(json, 'text')
      out.push(paragraphOfLines(linesOf(typeof text === 'string' ? text : '')))
    } else {
      out.push(keep(json, type, path, faults, 'block'))
    }
  }
}

function readBlock(
  node: unknown,
  depth: number,
  path: Path,
  faults: RichTextFault[],
  out: unknown[],
): void {
  const type = typeOf(node)
  if (type === null) {
    fault(faults, 'malformed', path, `A block is ${described(node)}. It is left out.`)
    return
  }
  const json = node as Json
  switch (type) {
    case 'paragraph':
      out.push(
        assign(
          { type, content: readContent(json, path, faults) },
          readExtras(json, PARAGRAPH_KEYS, path, faults),
        ),
      )
      return
    case 'heading': {
      const level = own(json, 'level')
      const content = readContent(json, path, faults)
      const extras = readExtras(json, HEADING_KEYS, path, faults)
      if (level === 1 || level === 2 || level === 3) {
        out.push(assign({ type, level, content }, extras))
      } else if (Number.isSafeInteger(level) && (level as number) > 3) {
        fault(
          faults,
          'malformed',
          [...path, 'level'],
          `A heading of level ${String(level)} is kept at level 3, the deepest.`,
        )
        out.push(assign({ type, level: 3, content }, extras))
      } else {
        fault(
          faults,
          'malformed',
          [...path, 'level'],
          'A heading has no level from 1 to 3. It is kept as a paragraph.',
        )
        out.push(assign({ type: 'paragraph', content }, extras))
      }
      return
    }
    case 'codeBlock': {
      const language = own(json, 'language')
      const text = own(json, 'text')
      if (language !== undefined && typeof language !== 'string') {
        fault(
          faults,
          'malformed',
          [...path, 'language'],
          "A code block's language is not text. It is left out.",
        )
      }
      if (typeof text !== 'string') {
        fault(faults, 'malformed', [...path, 'text'], 'A code block has no text. It is kept empty.')
      }
      const block: Json = { type }
      if (typeof language === 'string' && language !== '') block.language = language
      block.text = typeof text === 'string' ? text : ''
      out.push(assign(block, readExtras(json, CODE_KEYS, path, faults)))
      return
    }
    case 'list': {
      if (depth >= RICH_TEXT_MAX_DEPTH) {
        tooDeep(json, path, faults, out)
        return
      }
      const ordered = own(json, 'ordered')
      if (typeof ordered !== 'boolean') {
        fault(
          faults,
          'malformed',
          [...path, 'ordered'],
          'A list does not say whether it is numbered. It is kept as a bulleted list.',
        )
      }
      const numbered = ordered === true
      const start = own(json, 'start')
      let first: number | undefined
      if (numbered && start !== undefined) {
        if (Number.isSafeInteger(start) && (start as number) >= 0) {
          if (start !== 1) first = start as number
        } else {
          fault(
            faults,
            'malformed',
            [...path, 'start'],
            "A numbered list's first number is not a whole number from 0. The list starts at 1.",
          )
        }
      }
      const items = own(json, 'items')
      if (!Array.isArray(items)) {
        fault(faults, 'malformed', [...path, 'items'], 'A list has no items list. It is left out.')
        return
      }
      const read = readItems(items, depth + 1, [...path, 'items'], faults)
      if (read.length === 0) return
      const block: Json = { type, ordered: numbered }
      if (first !== undefined) block.start = first
      block.items = read
      out.push(assign(block, readExtras(json, LIST_KEYS, path, faults)))
      return
    }
    case 'blockquote': {
      if (depth >= RICH_TEXT_MAX_DEPTH) {
        tooDeep(json, path, faults, out)
        return
      }
      const content = own(json, 'content')
      if (!Array.isArray(content)) {
        fault(
          faults,
          'malformed',
          [...path, 'content'],
          'A quote has no blocks list. It is left out.',
        )
        return
      }
      const blocks = readBlocks(content, depth + 1, [...path, 'content'], faults)
      if (blocks.length === 0) return
      out.push(assign({ type, content: blocks }, readExtras(json, QUOTE_KEYS, path, faults)))
      return
    }
    default:
      out.push(keep(json, type, path, faults, 'block'))
  }
}

function tooDeep(container: Json, path: Path, faults: RichTextFault[], out: unknown[]): void {
  fault(
    faults,
    'too-deep',
    path,
    `Blocks nested more than ${RICH_TEXT_MAX_DEPTH} deep are flattened to paragraphs of their text.`,
  )
  flatten(container, path, faults, out)
}

/** `depth` is the number of quotes and lists around the blocks. */
function readBlocks(
  nodes: readonly unknown[],
  depth: number,
  path: Path,
  faults: RichTextFault[],
): RichTextBlock[] {
  const out: unknown[] = []
  for (let index = 0; index < nodes.length; index += 1) {
    readBlock(nodes[index], depth, [...path, index], faults, out)
  }
  return out as RichTextBlock[]
}

function readItems(
  nodes: readonly unknown[],
  depth: number,
  path: Path,
  faults: RichTextFault[],
): Json[] {
  const out: Json[] = []
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index]
    const at = [...path, index]
    const type = typeOf(node)
    if (type === null) {
      fault(faults, 'malformed', at, `A list item is ${described(node)}. It is left out.`)
      continue
    }
    const json = node as Json
    let content: unknown[]
    let extras = NONE
    if (type === 'listItem') {
      const blocks = own(json, 'content')
      if (Array.isArray(blocks)) {
        content = readBlocks(blocks, depth, [...at, 'content'], faults)
      } else {
        fault(
          faults,
          'malformed',
          [...at, 'content'],
          'A list item has no blocks list. It is kept empty.',
        )
        content = []
      }
      extras = readExtras(json, ITEM_KEYS, at, faults)
    } else {
      if (BLOCK_TYPES.has(type)) {
        fault(
          faults,
          'malformed',
          at,
          `A ${named(type)} stands among a list's items. It is kept as an item's content.`,
        )
      }
      content = []
      readBlock(json, depth, at, faults, content)
    }
    if (typeOf(content[0]) !== 'paragraph') content.unshift(emptyParagraph())
    out.push(assign({ type: 'listItem', content }, extras))
  }
  return out
}

/* -------------------------------------------------------------------------- */
/* The document                                                                */
/* -------------------------------------------------------------------------- */

/** The document with no blocks: what the reader returns for anything that is not a document. */
export function emptyRichText(): RichTextDocument {
  return { format: RICH_TEXT_FORMAT, blocks: [] }
}

function readDocument(input: unknown, faults: RichTextFault[]): RichTextDocument {
  let value = input
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value) as unknown
    } catch {
      fault(faults, 'not-a-document', [], 'The input is text that is not JSON.')
      return emptyRichText()
    }
  }
  if (!isJson(value)) {
    fault(faults, 'not-a-document', [], `The input is ${described(value)}, not a document.`)
    return emptyRichText()
  }
  const format = own(value, 'format')
  const version = richTextFormatVersion(format)
  if (version === null) {
    fault(
      faults,
      'not-a-document',
      ['format'],
      typeof format === 'string'
        ? `The format ${named(format)} is not a rich-text format.`
        : 'The input has no format.',
    )
    return emptyRichText()
  }
  if (version > RICH_TEXT_VERSION) {
    fault(
      faults,
      'newer-format',
      ['format'],
      `The format ${named(format as string)} is later than this version's ${RICH_TEXT_FORMAT}. It is read as far as this version can, and written as ${RICH_TEXT_FORMAT}.`,
    )
  } else {
    value = migrateRichText(value)
    if (!isJson(value) || richTextFormatVersion(own(value, 'format')) !== RICH_TEXT_VERSION) {
      fault(
        faults,
        'not-a-document',
        ['format'],
        `The format ${named(format as string)} is one this version cannot upgrade.`,
      )
      return emptyRichText()
    }
  }
  const blocks = own(value, 'blocks')
  if (!Array.isArray(blocks)) {
    fault(faults, 'not-a-document', ['blocks'], 'The input has no blocks list.')
    return emptyRichText()
  }
  const document: RichTextDocument = {
    format: RICH_TEXT_FORMAT,
    blocks: readBlocks(blocks, 0, ['blocks'], faults),
  }
  return assign(document, readExtras(value, DOCUMENT_KEYS, [], faults))
}

/**
 * Reads any JSON, or a JSON string, as a document: migrated to this version's
 * format, in normal form, with what the reader repaired, removed or did not
 * know. It never throws. A document this version wrote has no faults.
 */
export function parseRichText(input: unknown): RichTextParseResult {
  const faults: RichTextFault[] = []
  try {
    return { document: readDocument(input, faults), faults }
  } catch {
    // A value passed in memory can throw from a getter or a proxy. JSON cannot.
    return {
      document: emptyRichText(),
      faults: [
        {
          code: 'not-a-document',
          path: [],
          message: 'The input could not be read: reading it threw.',
        },
      ],
    }
  }
}

/** The document in normal form: what `parseRichText` returns, without the faults. */
export function normalizeRichText(input: unknown): RichTextDocument {
  return parseRichText(input).document
}

/**
 * The document as the string an application stores: the normal form's JSON,
 * whose keys the reader writes in one order, so equal documents give equal
 * strings. `parseRichText` reads it back.
 */
export function serializeRichText(input: unknown): string {
  return JSON.stringify(normalizeRichText(input))
}

/** Whether two documents are the same document: equal normal forms. */
export function richTextEquals(a: unknown, b: unknown): boolean {
  return serializeRichText(a) === serializeRichText(b)
}
