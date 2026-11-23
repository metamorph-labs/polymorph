import { isRichTextEmpty, richTextNodeText } from './text'
import { parseRichText } from './read'
import { positionOf, walkRichText } from './ranges'
import type {
  RichTextBlock,
  RichTextDocument,
  RichTextEntity,
  RichTextInline,
  RichTextText,
} from './types'

/**
 * What a reader member draws for a document, decided once for every
 * framework (`design/components/rich-text-content.md`).
 *
 * `richTextDrawing` reads a document and returns a tree of what to draw, in
 * reading order: which member draws each block, the emphasis around each run,
 * the highlights of the annotations nested as the editor nests them, which
 * fragment is each annotation's one tab stop, which links are one Link, which
 * headings and code runs the member draws itself, and, while the member maps a
 * reader's selection, where each drawn piece is in the document's plain text.
 * RichTextContent in every framework draws from this tree, so its decisions
 * are written once.
 *
 * It is what the members draw from. An application draws a document with
 * `RichTextContent`, not with this. It holds no DOM, so a server reads it.
 */

/** Where a drawn piece is in the document's plain text, as `RichTextRange` counts it. */
export interface RichTextPosition {
  start: number
  end: number
}

/** A drawn inline: what a paragraph's or a heading's content becomes. */
export type RichTextDrawnInline =
  /** Text, as it is. */
  | { kind: 'text'; text: string }
  /** Emphasis around its children: `strong` for bold, `em` for italic, `s` for strike. */
  | { kind: 'strong' | 'em' | 's'; children: RichTextDrawnInline[] }
  /**
   * A highlight: one fragment of the annotation `id`, around its children.
   * `stop` makes it the annotation's tab stop, a button named by its words.
   */
  | { kind: 'mark'; id: string; active: boolean; stop: boolean; children: RichTextDrawnInline[] }
  /** Inline code with no highlight in it: Code. */
  | { kind: 'code'; text: string }
  /** Inline code that holds a highlight: the member's own `code`, Code's class, around its children. */
  | { kind: 'ownCode'; children: RichTextDrawnInline[] }
  /** One Link for neighbouring runs with one target, `external` when the target has a scheme. */
  | { kind: 'link'; href: string; external: boolean; text: string }
  /** A hard break: `br`, carrying its position when the member maps selections. */
  | { kind: 'break'; at: RichTextPosition | null }
  /** An entity: the application's drawing when `app`, else the entity token. */
  | { kind: 'entity'; entity: RichTextEntity; app: boolean }
  /**
   * A stretch of the plain text, while the member maps selections: a `span`
   * carrying where its children are. An atom's drawing is not its text (an
   * entity, a node of a later version), so a selection that ends in it covers
   * it whole.
   */
  | { kind: 'piece'; at: RichTextPosition; atom: boolean; children: RichTextDrawnInline[] }

/** A drawn block. A heading with no text and a block of a later version with none draw nothing and are left out. */
export type RichTextDrawnBlock =
  /** Text at the member's size, holding its inlines. */
  | { kind: 'paragraph'; inlines: RichTextDrawnInline[] }
  /** Heading, at a page level, which takes its content as one string. */
  | { kind: 'heading'; level: 2 | 3 | 4; text: string }
  /**
   * A heading the member draws itself, as Heading's element and class at that
   * level, with its inlines one by one: one that holds a drawn annotation, and
   * every heading while the member maps selections.
   */
  | { kind: 'ownHeading'; level: 2 | 3 | 4; inlines: RichTextDrawnInline[] }
  /** `ul`, or `ol` when `ordered`, from `start` when it is not 1; each item its own blocks. */
  | { kind: 'list'; ordered: boolean; start: number | undefined; items: RichTextDrawnBlock[][] }
  /** `blockquote` of its blocks. */
  | { kind: 'quote'; blocks: RichTextDrawnBlock[] }
  /** CodeBlock, copyable when it holds text, named by its language. */
  | {
      kind: 'codeBlock'
      text: string
      language: string | undefined
      copyable: boolean
      at: RichTextPosition | null
    }
  /** A block of a later version: Text of the text found in it. */
  | { kind: 'later'; text: string; at: RichTextPosition | null }

export interface RichTextDrawingOptions {
  /** The page level the document's level 1 heading is drawn at. Each deeper level adds one, up to 4. Default 2. */
  headingLevel?: 2 | 3 | 4
  /** The annotations drawn. `undefined` draws every one. */
  annotations?: readonly string[]
  /** The drawn annotation that is active. */
  activeAnnotation?: string
  /** Highlights take a press: each annotation gets one tab stop. */
  pressable?: boolean
  /** The member maps a reader's selection: each drawn piece carries its position. */
  positions?: boolean
  /** Whether the application draws this entity itself; the token draws it otherwise. */
  appDraws?: (entity: RichTextEntity) => boolean
}

export interface RichTextDrawing {
  /** The document as the reader read it. */
  value: RichTextDocument
  /** No block has anything to read: the member draws nothing inside its root. */
  empty: boolean
  blocks: RichTextDrawnBlock[]
  /** The annotations that have a tab stop, in reading order. */
  stops: string[]
}

/** The attributes of an element that holds one stretch of the plain text (`piece`), for the selection mapping. */
export const RICH_TEXT_START = 'data-rich-text-start'
export const RICH_TEXT_END = 'data-rich-text-end'
export const RICH_TEXT_ATOM = 'data-rich-text-atom'
export const RICH_TEXT_CODE = 'data-rich-text-code'

/**
 * The attributes a positioned element carries: where it is, and whether its
 * drawing is an atom, or a code block whose code is its stored text. Nothing
 * for no position.
 */
export function richTextPositionAttrs(
  at: RichTextPosition | null | undefined,
  atom = false,
  code = false,
): Record<string, string | undefined> {
  if (at === null || at === undefined) return {}
  return {
    [RICH_TEXT_START]: String(at.start),
    [RICH_TEXT_END]: String(at.end),
    [RICH_TEXT_ATOM]: atom ? '' : undefined,
    [RICH_TEXT_CODE]: code ? '' : undefined,
  }
}

/* -------------------------------------------------------------------------- */
/* What a node is                                                             */
/* -------------------------------------------------------------------------- */

/** A target with a scheme (`https:`, `mailto:`, `tel:`) leaves the app. The reader passes no other kind. */
const ABSOLUTE = /^[a-z][a-z\d+.-]*:/i

/** The page level a document heading is drawn at: the document's level 1 at `top`, each deeper level one more, never past 4. */
function pageLevel(level: number, top: 2 | 3 | 4): 2 | 3 | 4 {
  const drawn = top + Math.max(0, Math.floor(level) - 1)
  return drawn >= 4 ? 4 : drawn === 3 ? 3 : 2
}

/** The target of a text run's link mark, or `undefined` for anything else. */
function linkOf(node: RichTextInline | undefined): string | undefined {
  if (node?.type !== 'text') return undefined
  for (const mark of node.marks ?? []) if (mark.type === 'link') return mark.href
  return undefined
}

const has = (node: RichTextText, type: string) =>
  (node.marks ?? []).some((mark) => mark.type === type)

/** The ids of the annotations a text or an entity carries. */
function annotationIds(node: RichTextInline | undefined): string[] {
  if (node?.type !== 'text' && node?.type !== 'entity') return []
  const ids: string[] = []
  for (const mark of node.marks ?? []) if (mark.type === 'annotation') ids.push(mark.id)
  return ids
}

const byKey = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

interface Stretch {
  from: number
  to: number
}

/**
 * The drawn annotations of a paragraph's inlines, innermost first, nested as
 * the editor nests them (`rich-text-editor/annotations.ts`). An annotation's
 * stretch is a run of consecutive texts and entities that carry it; an inline
 * that carries none (a hard break, a node of a later version) neither ends a
 * stretch nor belongs to one. Where annotations overlap, the innermost is the
 * one whose stretch starts last, then the one that ends first, then by id.
 *
 * The result reads the inlines at `indexes`, each annotation ordered by its
 * stretch at the first of them that carries it: one index for a text or an
 * entity, every run of a Link, which is drawn as one element.
 */
function nesting(
  content: readonly RichTextInline[],
  drawn: (id: string) => boolean,
): (indexes: readonly number[]) => string[] {
  const stretches = new Map<string, Stretch[]>()
  const open = new Map<string, Stretch>()
  content.forEach((node, index) => {
    if (node.type !== 'text' && node.type !== 'entity') return
    const ids = new Set(annotationIds(node))
    for (const id of open.keys()) if (!ids.has(id)) open.delete(id)
    for (const id of ids) {
      const stretch = open.get(id)
      if (stretch !== undefined) {
        stretch.to = index
        continue
      }
      const created = { from: index, to: index }
      open.set(id, created)
      stretches.set(id, [...(stretches.get(id) ?? []), created])
    }
  })
  return (indexes) => {
    const keys = new Map<string, Stretch>()
    for (const index of indexes) {
      for (const id of annotationIds(content[index])) {
        if (keys.has(id) || !drawn(id)) continue
        const stretch = stretches.get(id)?.find((run) => run.from <= index && index <= run.to)
        if (stretch !== undefined) keys.set(id, stretch)
      }
    }
    return [...keys.keys()].sort((a, b) => {
      const x = keys.get(a) as Stretch
      const y = keys.get(b) as Stretch
      return y.from - x.from || x.to - y.to || byKey(a, b)
    })
  }
}

/* -------------------------------------------------------------------------- */
/* Drawing                                                                    */
/* -------------------------------------------------------------------------- */

interface Context {
  headingLevel: 2 | 3 | 4
  drawn: (id: string) => boolean
  active: string | undefined
  pressable: boolean
  appDraws: (entity: RichTextEntity) => boolean
  /** The annotations whose tab stop is drawn, filled in reading order. */
  stops: Set<string>
  /** Where each node the walk counts is, while the member maps selections; null otherwise. */
  positions: Map<unknown, RichTextPosition> | null
}

/** A node's position, while the member maps selections. */
const at = (context: Context, node: unknown): RichTextPosition | null =>
  context.positions?.get(node) ?? null

/**
 * `content` inside a highlight per annotation in `ids`, the first innermost.
 * With a press, an annotation's tab stop is the first fragment where it is
 * innermost and that holds no control of its own (`canStop`): a fragment
 * where another annotation is innermost holds that one's stop, and a Link or
 * an entity the application draws is a control a stop may not hold.
 */
function annotate(
  content: RichTextDrawnInline,
  ids: readonly string[],
  context: Context,
  canStop: boolean,
): RichTextDrawnInline {
  let drawn = content
  ids.forEach((id, depth) => {
    const stop = context.pressable && canStop && depth === 0 && !context.stops.has(id)
    if (stop) context.stops.add(id)
    drawn = { kind: 'mark', id, active: id === context.active, stop, children: [drawn] }
  })
  return drawn
}

/** `content` inside the emphasis of `marks`, bold outermost. A mark of a later version draws nothing. */
function emphasised(
  content: RichTextDrawnInline,
  marks: (type: string) => boolean,
): RichTextDrawnInline {
  let drawn = content
  if (marks('strike')) drawn = { kind: 's', children: [drawn] }
  if (marks('italic')) drawn = { kind: 'em', children: [drawn] }
  if (marks('bold')) drawn = { kind: 'strong', children: [drawn] }
  return drawn
}

/** A positioned piece around `content`, while the member maps selections. */
const piece = (
  content: RichTextDrawnInline,
  position: RichTextPosition | null,
  atom: boolean,
): RichTextDrawnInline =>
  position === null ? content : { kind: 'piece', at: position, atom, children: [content] }

/**
 * One Link for neighbouring runs with the same target, so a link whose words
 * carry different marks is still one tab stop and one name. Link's children
 * are a string, so the marks every run shares are drawn around it and the
 * others, and `code`, are dropped. An annotation on any of its runs is drawn
 * around the whole Link, inside the shared emphasis.
 */
function drawLink(
  runs: readonly RichTextText[],
  href: string,
  ids: readonly string[],
  context: Context,
): RichTextDrawnInline {
  const link: RichTextDrawnInline = {
    kind: 'link',
    href,
    external: ABSOLUTE.test(href),
    text: runs.map((run) => run.text).join(''),
  }
  return emphasised(annotate(link, ids, context, false), (type) =>
    runs.every((run) => has(run, type)),
  )
}

/**
 * Inline code. Code takes a string, so a run that holds a drawn annotation is
 * the member's own `code` with the highlight inside it, as the editor draws it.
 */
function drawCode(text: string, ids: readonly string[], context: Context): RichTextDrawnInline {
  if (ids.length === 0) return { kind: 'code', text }
  // A stop is named by its words, so a fragment of white space is not one.
  return {
    kind: 'ownCode',
    children: [annotate({ kind: 'text', text }, ids, context, text.trim() !== '')],
  }
}

function drawEntity(
  node: RichTextEntity,
  ids: readonly string[],
  context: Context,
): RichTextDrawnInline {
  const app = context.appDraws(node)
  return annotate({ kind: 'entity', entity: node, app }, ids, context, !app)
}

/**
 * A paragraph's inlines, or a heading's. A heading holds text, entities,
 * inline code and the text of links, and no emphasis, so in a heading a link's
 * runs are drawn as their text and a hard break as a space.
 */
function drawInlines(
  nodes: readonly RichTextInline[],
  context: Context,
  heading: boolean,
): RichTextDrawnInline[] {
  const order = nesting(nodes, context.drawn)
  const drawn: RichTextDrawnInline[] = []
  let index = 0
  while (index < nodes.length) {
    const node = nodes[index] as RichTextInline
    const href = heading ? undefined : linkOf(node)
    if (href !== undefined) {
      const runs: RichTextText[] = []
      const indexes: number[] = []
      let end = index
      while (end < nodes.length && linkOf(nodes[end]) === href) {
        runs.push(nodes[end] as RichTextText)
        indexes.push(end)
        end += 1
      }
      const first = at(context, runs[0])
      const last = at(context, runs.at(-1))
      const span = first === null || last === null ? null : { start: first.start, end: last.end }
      drawn.push(piece(drawLink(runs, href, order(indexes), context), span, false))
      index = end
      continue
    }
    const position = at(context, node)
    switch (node.type) {
      case 'text': {
        const ids = order([index])
        // A stop is named by its words, so a fragment of white space is not one.
        const marked = has(node, 'code')
          ? drawCode(node.text, ids, context)
          : annotate({ kind: 'text', text: node.text }, ids, context, node.text.trim() !== '')
        const run = heading ? marked : emphasised(marked, (type) => has(node, type))
        drawn.push(piece(run, position, false))
        break
      }
      case 'break':
        // A break counts one line break, and a heading draws it as one space.
        drawn.push(
          heading
            ? piece({ kind: 'text', text: ' ' }, position, false)
            : { kind: 'break', at: position },
        )
        break
      case 'entity':
        drawn.push(piece(drawEntity(node, order([index]), context), position, true))
        break
      default:
        // An inline of a later version: the text found in it, in the line.
        drawn.push(piece({ kind: 'text', text: richTextNodeText(node) }, position, true))
    }
    index += 1
  }
  return drawn
}

/** A heading's content as one string, because Heading takes a string. */
function headingText(node: RichTextInline): string {
  switch (node.type) {
    case 'text':
      return node.text
    case 'break':
      return ' '
    case 'entity':
      return node.label
    default:
      return richTextNodeText(node)
  }
}

function drawHeading(
  block: Extract<RichTextBlock, { type: 'heading' }>,
  context: Context,
): RichTextDrawnBlock | null {
  const level = pageLevel(block.level, context.headingLevel)
  const text = block.content.map(headingText).join('')
  const annotated = block.content.some((node) =>
    annotationIds(node).some((id) => context.drawn(id)),
  )
  // A heading names the section under it, so one with no name is not drawn.
  if (context.positions === null && !annotated) {
    return text.trim() === '' ? null : { kind: 'heading', level, text }
  }
  // Its inlines are drawn even when it is not, because the stops are counted in reading order.
  const inlines = drawInlines(block.content, context, true)
  return text.trim() === '' ? null : { kind: 'ownHeading', level, inlines }
}

function drawBlocks(blocks: readonly RichTextBlock[], context: Context): RichTextDrawnBlock[] {
  const drawn: RichTextDrawnBlock[] = []
  for (const block of blocks) {
    const next = drawBlock(block, context)
    if (next !== null) drawn.push(next)
  }
  return drawn
}

function drawBlock(block: RichTextBlock, context: Context): RichTextDrawnBlock | null {
  switch (block.type) {
    case 'paragraph':
      return { kind: 'paragraph', inlines: drawInlines(block.content, context, false) }
    case 'heading':
      return drawHeading(block, context)
    case 'list':
      return {
        kind: 'list',
        ordered: block.ordered,
        start: block.ordered && block.start !== undefined ? block.start : undefined,
        items: block.items.map((item) => drawBlocks(item.content, context)),
      }
    case 'blockquote':
      return { kind: 'quote', blocks: drawBlocks(block.content, context) }
    case 'codeBlock':
      // A stored block is never partial, so it is copyable, unless it holds nothing to copy.
      return {
        kind: 'codeBlock',
        text: block.text,
        language: block.language,
        copyable: block.text !== '',
        at: at(context, block),
      }
    default: {
      // A block of a later version: a paragraph of the text found in it, and nothing for none.
      const text = richTextNodeText(block)
      return text === '' ? null : { kind: 'later', text, at: at(context, block) }
    }
  }
}

/** Where each node the model's walk counts is, in code points of the plain text (`ranges.ts`). */
function positionsOf(doc: RichTextDocument): Map<unknown, RichTextPosition> {
  const walked = walkRichText(doc)
  const positions = new Map<unknown, RichTextPosition>()
  for (const counted of walked.pieces) {
    positions.set(counted.node, {
      start: positionOf(walked.text, counted.from),
      end: positionOf(walked.text, counted.to),
    })
  }
  return positions
}

/** What a reader member draws for `doc`: any JSON, read through `parseRichText`. */
export function richTextDrawing(
  doc: unknown,
  options: RichTextDrawingOptions = {},
): RichTextDrawing {
  const value = parseRichText(doc).value
  const empty = isRichTextEmpty(value)
  const shown = options.annotations === undefined ? null : new Set(options.annotations)
  const context: Context = {
    headingLevel: options.headingLevel ?? 2,
    drawn: (id) => shown === null || shown.has(id),
    active: options.activeAnnotation,
    pressable: options.pressable === true,
    appDraws: options.appDraws ?? (() => false),
    stops: new Set(),
    positions: options.positions === true && !empty ? positionsOf(value) : null,
  }
  const blocks = empty ? [] : drawBlocks(value.blocks, context)
  return { value, empty, blocks, stops: [...context.stops] }
}
