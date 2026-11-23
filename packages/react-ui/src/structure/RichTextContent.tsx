'use client'

import {
  agentPress,
  isRichTextEmpty,
  memberAttr,
  parseRichText,
  type RichTextBlock,
  type RichTextDocument,
  type RichTextEntity,
  type RichTextInline,
  type RichTextRange,
  type RichTextRect,
  type RichTextText,
  richTextAnnotations,
  richTextNodeText,
  richTextRangeText,
  serializeRichText,
  useAgentMember,
} from '@polymorph/react'
import {
  Fragment,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from 'react'

import { Link } from '../controls/Link'
import { SelectionBar, useToolbarKeys } from '../controls/selection-bar'
import { Code } from './Code'
import { CodeBlock } from './CodeBlock'
import { Heading, type HeadingLevel } from './Heading'
import { Text } from './Text'
import styles from '@polymorph/recipes/structure/rich-text-content.module.css'

/**
 * A stored rich-text document drawn through the vocabulary (`design/components/rich-text-content.md`).
 *
 * A comment, an issue's description or a note is stored as the document model's
 * JSON (`@polymorph/engine/rich-text`), and this member shows it with the same
 * members as the rest of the screen: a heading is `Heading`, a paragraph
 * `Text`, a code block `CodeBlock`, inline code `Code` and a link `Link`, under
 * the same theme, with no second stylesheet. The model's reader decides what a
 * document holds. This file decides which member draws each node.
 *
 * It is not Markdown, which parses a source string that may still be
 * arriving. A document is data a person wrote and an app stored, and it is
 * never partial. It is not RichTextInput either: it loads no editor.
 *
 * The reader accepts any JSON, so a document written by a later version still
 * reads: a node of a type this version does not know is drawn as the text found
 * in it, and a link whose target is not safe has lost its mark and draws as its
 * text.
 *
 * Annotations are drawn as `mark` elements, nested as the editor nests them.
 * Two props make the member take a reader's acts: `onAnnotationSelect` (a press
 * on a highlight) and `selectionActions` (a bar of the application's controls
 * at the reader's selection). Without either, the member is drawn by a
 * function with no hook, so a document is drawn with no listener and no effect.
 * With either, the same drawing is wrapped by a component that holds the
 * selection, the bar and the agent handle; a change from one to the other
 * mounts the member again.
 *
 * The directive is there because the member hands `onNavigate` to each Link,
 * and a server component cannot pass a function to a client component, and
 * because the reading component holds state.
 */

export type RichTextContentSize = 'sm' | 'md'

/** The reader's selection, as the application's selection controls read it. */
export interface RichTextContentSelection {
  /** The selection in the document's plain text (`RichTextRange`), which `annotateRichText` takes. */
  range: RichTextRange
  /** The selected text, an entity as its label (`richTextRangeText`). */
  text: string
}

/** The selection bar's words, in the app's language. A key left out keeps its English default. */
export interface RichTextContentMessages {
  /** The selection bar's name. Default: `Selection`. */
  selectionBar?: string
  /** Said once, when the selection bar first appears. */
  selectionBarReady?: string
}

export interface RichTextContentProps {
  /** The stored document. Any JSON is read as far as it can be; what is not a document draws nothing. */
  value: RichTextDocument
  /** The body text step (Text's `sm` or `md`), which does not change the heading scale. */
  size?: RichTextContentSize
  /**
   * The page level the document's level 1 heading is drawn at. Each deeper
   * level adds one, up to 4. Default 2, one level under the page's title.
   */
  headingLevel?: HeadingLevel
  /**
   * The app's rendering of an entity: a Link to the person's page, a HoverCard
   * with their card. `undefined` draws the entity token, so an app can draw one
   * kind itself and leave the others as tokens.
   */
  entity?: (entity: RichTextEntity) => ReactNode
  /** The app's router, handed to every Link the document draws (`link.md`). */
  onNavigate?: (href: string) => void
  /** The annotations drawn. Default: every one the document holds. */
  annotations?: string[]
  /** The drawn annotation that is active, such as the thread the app shows. */
  activeAnnotation?: string
  /** A press on a drawn annotation. Without it the highlights take no press and no focus. */
  onAnnotationSelect?: (id: string) => void
  /** The app's controls for the reader's selected text, in a bar at the selection. */
  selectionActions?: (selection: RichTextContentSelection) => ReactNode
  /** The selection bar's words, in the app's language. */
  messages?: RichTextContentMessages
}

const DEFAULT_MESSAGES = {
  selectionBar: 'Selection',
  selectionBarReady: 'Controls for the selection are available: Alt+F10',
} satisfies Required<RichTextContentMessages>

/* -------------------------------------------------------------------------- */
/* Positions in the plain text                                                */
/* -------------------------------------------------------------------------- */

/**
 * The text a node counts in a range, as the model counts it: the readable text
 * with nothing between blocks (`unitText` in the model's `ranges.ts`).
 */
const UNITS = { blockSeparator: '' }

const isHigh = (code: number) => code >= 0xd800 && code <= 0xdbff
const isLow = (code: number) => code >= 0xdc00 && code <= 0xdfff

/** The Unicode code points in a string: a surrogate pair is one, a lone surrogate is one. */
function codePoints(text: string): number {
  let count = text.length
  for (let index = 0; index < text.length - 1; index += 1) {
    if (isHigh(text.charCodeAt(index)) && isLow(text.charCodeAt(index + 1))) {
      count -= 1
      index += 1
    }
  }
  return count
}

/**
 * Where the drawing is in the document's plain text. The member draws the
 * document in the order the model's walk reads it (`walkRichText`: each inline
 * of a paragraph or a heading, a code block whole, a block of a later version
 * whole) and counts each piece's `unitText` as it goes, so the positions it
 * writes are the model's.
 */
interface Offsets {
  /** The code points counted so far. */
  at: number
  /** Whether the text so far ends in a high surrogate, which a low one at the start of the next piece pairs with. */
  high: boolean
}

interface At {
  start: number
  end: number
}

/** Counts one piece, the plain text of `node`, and returns where it is. */
function advance(offsets: Offsets | null, node: unknown): At | null {
  if (offsets === null) return null
  const text = richTextNodeText(node, UNITS)
  const start = offsets.at
  if (text === '') return { start, end: start }
  let count = codePoints(text)
  // The model counts on the joined text, where a pair split between two pieces is one code point.
  if (offsets.high && isLow(text.charCodeAt(0))) count -= 1
  offsets.at += count
  offsets.high = isHigh(text.charCodeAt(text.length - 1))
  return { start, end: offsets.at }
}

const START = 'data-rich-text-start'
const END = 'data-rich-text-end'
const ATOM = 'data-rich-text-atom'
const CODE = 'data-rich-text-code'
const REGION = `[${START}]`

/**
 * The attributes of an element that holds one stretch of the plain text. A
 * stretch whose drawn text is not its plain text (an entity, a hard break, a
 * node of a later version) is an atom: a selection that ends in it covers it
 * whole. A code block is an atom whose code, CodeBlock's `pre > code`, is its
 * stored text, so a selection that ends in the code ends where it does, and
 * one that ends in the block's own control covers the block.
 */
function region(at: At | null, atom: boolean, code = false): Record<string, string | undefined> {
  if (at === null) return {}
  return {
    [START]: String(at.start),
    [END]: String(at.end),
    [ATOM]: atom ? '' : undefined,
    [CODE]: code ? '' : undefined,
  }
}

/** A drawn piece, inside the element that says where it is while the member maps selections. */
function piece(content: ReactNode, at: At | null, atom: boolean): ReactNode {
  return at === null ? content : <span {...region(at, atom)}>{content}</span>
}

/* -------------------------------------------------------------------------- */
/* Drawing                                                                    */
/* -------------------------------------------------------------------------- */

interface Marking {
  /** Whether the annotation `id` is drawn. */
  drawn: (id: string) => boolean
  active: string | undefined
  /** Highlights take a press, and each annotation has one tab stop. */
  pressable: boolean
  /** The annotations whose tab stop is drawn, filled in reading order. */
  stops: Set<string>
}

interface RenderContext {
  size: RichTextContentSize
  headingLevel: HeadingLevel
  entity: ((entity: RichTextEntity) => ReactNode) | undefined
  onNavigate: ((href: string) => void) | undefined
  marking: Marking
  /** Counting positions, while the member maps the reader's selection; null otherwise. */
  offsets: Offsets | null
}

/** A target with a scheme (`https:`, `mailto:`, `tel:`) leaves the app. The reader passes no other kind. */
const ABSOLUTE = /^[a-z][a-z\d+.-]*:/i

/**
 * The page level a document heading is drawn at: the document's level 1 at
 * `top`, each deeper level one more, never past 4. The editor draws the same
 * levels, so a document reads the same while it is written and after.
 */
function pageLevel(level: number, top: HeadingLevel): HeadingLevel {
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

/**
 * `content` inside a `mark` per annotation in `ids`, the first innermost. With
 * `onAnnotationSelect`, an annotation's tab stop is the first fragment where it
 * is innermost and that holds no control of its own (`canStop`): a press there
 * is the annotation's, as a press anywhere on it is. A fragment where another
 * annotation is innermost holds that one's stop, and a Link or an entity the
 * app draws is a control a stop may not hold.
 */
function annotate(
  content: ReactNode,
  ids: readonly string[],
  context: RenderContext,
  canStop: boolean,
): ReactNode {
  const { active, pressable, stops } = context.marking
  let drawn = content
  ids.forEach((id, depth) => {
    const stop = pressable && canStop && depth === 0 && !stops.has(id)
    if (stop) stops.add(id)
    const current = id === active
    drawn = (
      <mark
        className={pressable ? `${styles.annotation} ${styles.pressable}` : styles.annotation}
        data-annotation-id={id}
        data-active={current ? '' : undefined}
        role={stop ? 'button' : undefined}
        tabIndex={stop ? 0 : undefined}
        aria-current={stop && current ? 'true' : undefined}
      >
        {drawn}
      </mark>
    )
  })
  return drawn
}

/**
 * Draws `content` inside the emphasis elements of `marks`, bold outermost. A
 * mark of a type this version does not know draws nothing.
 */
function emphasised(content: ReactNode, marks: (type: string) => boolean): ReactNode {
  let drawn = content
  if (marks('strike')) drawn = <s>{drawn}</s>
  if (marks('italic')) drawn = <em>{drawn}</em>
  if (marks('bold')) drawn = <strong>{drawn}</strong>
  return drawn
}

/**
 * One Link for neighbouring runs with the same target, so a link whose words
 * carry different marks is still one tab stop and one name. Link's children
 * are a string, so the marks every run shares are drawn around it and the
 * others, and `code`, are dropped, as Markdown drops emphasis in a label. An
 * annotation on any of its runs is drawn around the whole Link, inside the
 * shared emphasis, for the same reason.
 */
function drawLink(
  runs: readonly RichTextText[],
  href: string,
  ids: readonly string[],
  context: RenderContext,
): ReactNode {
  const link = (
    <Link href={href} external={ABSOLUTE.test(href)} onNavigate={context.onNavigate}>
      {runs.map((run) => run.text).join('')}
    </Link>
  )
  return emphasised(annotate(link, ids, context, false), (type) =>
    runs.every((run) => has(run, type)),
  )
}

/**
 * Inline code. Code takes a string, so a run that holds a drawn annotation is
 * drawn as the same `code` element with a class that composes Code's, and the
 * highlight inside it, as the editor draws it: the wash is on the words inside
 * the chip.
 */
function drawCode(text: string, ids: readonly string[], context: RenderContext): ReactNode {
  if (ids.length === 0) return <Code>{text}</Code>
  // A stop is named by its words, so a fragment of white space is not one.
  return <code className={styles.code}>{annotate(text, ids, context, text.trim() !== '')}</code>
}

function drawEntity(
  node: RichTextEntity,
  ids: readonly string[],
  context: RenderContext,
): ReactNode {
  const drawn = context.entity?.(node)
  if (drawn !== undefined) return annotate(drawn, ids, context, false)
  // The element and attributes the editor draws for an entity, so the one
  // recipe class looks the same in both.
  const token = (
    <span className={styles.entity} data-entity-kind={node.kind} data-entity-id={node.id}>
      {node.label}
    </span>
  )
  return annotate(token, ids, context, true)
}

/**
 * A paragraph's inlines, or a heading's. A heading holds text, entities,
 * inline code and the text of links, and no emphasis, so in a heading a link's
 * runs are drawn as their text and a hard break as a space, as Heading draws
 * them.
 */
function renderInlines(
  nodes: readonly RichTextInline[],
  context: RenderContext,
  within: 'paragraph' | 'heading' = 'paragraph',
): ReactNode[] {
  const heading = within === 'heading'
  const order = nesting(nodes, context.marking.drawn)
  const drawn: ReactNode[] = []
  let index = 0
  while (index < nodes.length) {
    const node = nodes[index] as RichTextInline
    const href = heading ? undefined : linkOf(node)
    if (href !== undefined) {
      const runs: RichTextText[] = []
      const indexes: number[] = []
      const ats: At[] = []
      let end = index
      while (end < nodes.length && linkOf(nodes[end]) === href) {
        runs.push(nodes[end] as RichTextText)
        indexes.push(end)
        const at = advance(context.offsets, nodes[end])
        if (at !== null) ats.push(at)
        end += 1
      }
      const first = ats[0]
      const last = ats.at(-1)
      const span =
        first === undefined || last === undefined ? null : { start: first.start, end: last.end }
      const link = drawLink(runs, href, order(indexes), context)
      drawn.push(<Fragment key={index}>{piece(link, span, false)}</Fragment>)
      index = end
      continue
    }
    const at = advance(context.offsets, node)
    switch (node.type) {
      case 'text': {
        const ids = order([index])
        // A stop is named by its words, so a fragment of white space is not one.
        const marked = has(node, 'code')
          ? drawCode(node.text, ids, context)
          : annotate(node.text, ids, context, node.text.trim() !== '')
        const run = heading ? marked : emphasised(marked, (type) => has(node, type))
        drawn.push(<Fragment key={index}>{piece(run, at, false)}</Fragment>)
        break
      }
      case 'break':
        // A break counts one line break, and a heading draws it as one space.
        drawn.push(
          heading ? (
            <Fragment key={index}>{piece(' ', at, false)}</Fragment>
          ) : (
            <br key={index} {...region(at, true)} />
          ),
        )
        break
      case 'entity':
        drawn.push(
          <Fragment key={index}>
            {piece(drawEntity(node, order([index]), context), at, true)}
          </Fragment>,
        )
        break
      default:
        // An inline of a later version: the text found in it, in the line.
        drawn.push(<Fragment key={index}>{piece(richTextNodeText(node), at, true)}</Fragment>)
    }
    index += 1
  }
  return drawn
}

/**
 * A heading's content as one string, because Heading takes a string: an
 * entity reads as its label, a break as a space, and a link and inline code as
 * their text.
 */
function headingPiece(node: RichTextInline): string {
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

/**
 * A heading. A plain document's heading is Heading, which takes a string, so
 * its words are drawn without their marks. A heading that holds a drawn
 * annotation, or any heading while the member maps selections, is drawn by
 * the member as the same `h2`–`h4`, with a class that composes Heading's and
 * the level Heading writes, so it looks the same, and its inlines are drawn
 * one by one: a highlight, a tab stop and a selection's position then work in
 * a heading as in a paragraph.
 */
function drawHeading(
  block: Extract<RichTextBlock, { type: 'heading' }>,
  key: number,
  context: RenderContext,
): ReactNode {
  const level = pageLevel(block.level, context.headingLevel)
  const text = block.content.map(headingPiece).join('')
  const annotated = block.content.some((node) =>
    annotationIds(node).some((id) => context.marking.drawn(id)),
  )
  if (context.offsets === null && !annotated) {
    // A heading names the section under it, so one with no name is not drawn.
    return text.trim() === '' ? null : (
      <Heading key={key} level={level}>
        {text}
      </Heading>
    )
  }
  // Drawn even when it is not shown, because the walk counts every heading's text.
  const inlines = renderInlines(block.content, context, 'heading')
  if (text.trim() === '') return null
  const Element = level === 4 ? 'h4' : level === 3 ? 'h3' : 'h2'
  return (
    <Element key={key} className={styles.heading} data-level={level}>
      {inlines}
    </Element>
  )
}

function renderBlocks(blocks: readonly RichTextBlock[], context: RenderContext): ReactNode[] {
  return blocks.map((block, index) => {
    switch (block.type) {
      case 'paragraph':
        return (
          <Text key={index} size={context.size}>
            {renderInlines(block.content, context)}
          </Text>
        )
      case 'heading':
        return drawHeading(block, index, context)
      case 'list': {
        const ListElement = block.ordered ? 'ol' : 'ul'
        return (
          <ListElement
            key={index}
            className={styles.list}
            start={block.ordered && block.start !== undefined ? block.start : undefined}
          >
            {block.items.map((item, position) => (
              <li key={position} className={styles.item}>
                {renderBlocks(item.content, context)}
              </li>
            ))}
          </ListElement>
        )
      }
      case 'blockquote':
        return (
          <blockquote key={index} className={styles.quote}>
            {renderBlocks(block.content, context)}
          </blockquote>
        )
      case 'codeBlock': {
        const at = advance(context.offsets, block)
        // A stored block is never partial, so it is copyable, unless it holds
        // nothing to copy. The language is the writer's word for what the
        // scroll region holds, and CodeBlock keeps its own name without one.
        const code = (
          <CodeBlock key={index} copyable={block.text !== ''} label={block.language}>
            {block.text}
          </CodeBlock>
        )
        return at === null ? (
          code
        ) : (
          <div key={index} {...region(at, true, true)}>
            {code}
          </div>
        )
      }
      default: {
        // A block of a later version: a paragraph of the text found in it.
        const at = advance(context.offsets, block)
        const text = richTextNodeText(block)
        return text === '' ? null : (
          <Text key={index} size={context.size}>
            {piece(text, at, true)}
          </Text>
        )
      }
    }
  })
}

interface Drawing {
  read: RichTextDocument
  empty: boolean
  blocks: ReactNode[] | null
  /** The annotations that have a tab stop. */
  stops: ReadonlySet<string>
  drawn: (id: string) => boolean
}

function drawDocument(props: RichTextContentProps, pressable: boolean, mapped: boolean): Drawing {
  const read = parseRichText(props.value).value
  const empty = isRichTextEmpty(read)
  const shown = props.annotations === undefined ? null : new Set(props.annotations)
  const drawn = (id: string) => shown === null || shown.has(id)
  const stops = new Set<string>()
  const context: RenderContext = {
    size: props.size ?? 'md',
    headingLevel: props.headingLevel ?? 2,
    entity: props.entity,
    onNavigate: props.onNavigate,
    marking: { drawn, active: props.activeAnnotation, pressable, stops },
    offsets: mapped ? { at: 0, high: false } : null,
  }
  return { read, empty, blocks: empty ? null : renderBlocks(read.blocks, context), stops, drawn }
}

export function RichTextContent(props: RichTextContentProps) {
  if (props.onAnnotationSelect !== undefined || props.selectionActions !== undefined) {
    return <ReadingRichTextContent {...props} />
  }
  const { size = 'md' } = props
  const { empty, blocks } = drawDocument(props, false, false)
  return (
    <div
      className={styles.root}
      data-size={size}
      data-empty={empty ? '' : undefined}
      {...memberAttr('RichTextContent')}
    >
      {blocks}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Mapping the reader's selection                                             */
/* -------------------------------------------------------------------------- */

type Side = 'start' | 'end'

interface Mapped extends RichTextContentSelection {
  /** The range as a string, which tells one selection from another. */
  key: string
}

const numberAt = (element: Element, name: string) => Number(element.getAttribute(name))

/** The text from the start of `element` to a point inside it. */
function textBefore(element: Element, node: Node, offset: number): string {
  const range = element.ownerDocument.createRange()
  range.setStart(element, 0)
  range.setEnd(node, offset)
  return range.toString()
}

/** The text from a point inside `element` to its end. */
function textAfter(element: Element, node: Node, offset: number): string {
  const range = element.ownerDocument.createRange()
  range.setStart(node, offset)
  range.setEnd(element, element.childNodes.length)
  return range.toString()
}

/** A collapsed range at a point, to compare other points with. */
function pointRange(node: Node, offset: number): Range {
  const range = (node.ownerDocument ?? (node as Document)).createRange()
  range.setStart(node, offset)
  return range
}

/**
 * A position for a point between the drawn pieces (in a list item, between
 * blocks, in a paragraph between its runs): the start of the next piece for a
 * selection's start, and the end of the one before for its end. The two are
 * the same position unless the point is beside text the member does not draw
 * (a heading of white space).
 */
function between(root: HTMLElement, node: Node, offset: number, side: Side): number {
  const point = pointRange(node, offset)
  const regions = Array.from(root.querySelectorAll(REGION))
  if (side === 'start') {
    const next = regions.find((element) => point.comparePoint(element, 0) >= 0)
    if (next !== undefined) return numberAt(next, START)
    const last = regions.at(-1)
    return last === undefined ? 0 : numberAt(last, END)
  }
  const previous = regions.findLast(
    (element) => point.comparePoint(element, element.childNodes.length) <= 0,
  )
  if (previous !== undefined) return numberAt(previous, END)
  const first = regions[0]
  return first === undefined ? 0 : numberAt(first, START)
}

/** The position of a point inside the member's content. */
function positionOf(root: HTMLElement, node: Node, offset: number, side: Side): number {
  const from = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement
  const found = from?.closest(REGION)
  if (found === null || found === undefined || !root.contains(found)) {
    return between(root, node, offset, side)
  }
  const start = numberAt(found, START)
  const end = numberAt(found, END)
  const code = found.hasAttribute(CODE) ? found.querySelector('pre code') : null
  if (code !== null && code.contains(node)) {
    return Math.min(end, start + codePoints(textBefore(code, node, offset)))
  }
  const before = textBefore(found, node, offset)
  if (found.hasAttribute(ATOM)) {
    // A point at the very start or end of an atom is beside it; anywhere else covers it whole.
    if (before === '') return start
    if (textAfter(found, node, offset) === '') return end
    return side === 'start' ? start : end
  }
  return Math.min(end, start + codePoints(before))
}

/**
 * The position of a selection's end. A selection's end after the content (in
 * the selection bar, in the status region or after the member) counts as the
 * content's end when only white space lies between them, as a triple press on
 * the last paragraph selects up to the next block. Any other point outside the
 * content makes the selection not the member's. A start outside the member is
 * refused before anything is counted, so a member is not slowed by a
 * selection elsewhere on the page.
 */
function boundary(
  root: HTMLElement,
  outside: (node: Node) => Element | null,
  node: Node,
  offset: number,
  side: Side,
): number | null {
  if (root.contains(node)) {
    const part = outside(node)
    if (part === null) return positionOf(root, node, offset, side)
    if (side === 'start' || textBefore(part, node, offset).trim() !== '') return null
    return between(root, part, 0, 'end')
  }
  if (side === 'start') return null
  const after = root.childNodes.length
  if (pointRange(root, after).comparePoint(node, offset) <= 0) return null
  const range = root.ownerDocument.createRange()
  range.setStart(root, after)
  range.setEnd(node, offset)
  return range.toString().trim() === '' ? between(root, root, after, 'end') : null
}

/** The reader's selection in the member's content, in the document's plain text, or null. */
function mapSelection(
  root: HTMLElement,
  outside: (node: Node) => Element | null,
  doc: RichTextDocument,
): { mapped: Mapped; range: Range } | null {
  const selection = root.ownerDocument.getSelection()
  if (selection === null || selection.rangeCount === 0 || selection.isCollapsed) return null
  const range = selection.getRangeAt(0)
  const start = boundary(root, outside, range.startContainer, range.startOffset, 'start')
  if (start === null) return null
  const end = boundary(root, outside, range.endContainer, range.endOffset, 'end')
  if (end === null || end <= start) return null
  const mapped = { start, end }
  return {
    mapped: { range: mapped, text: richTextRangeText(doc, mapped), key: `${start}:${end}` },
    range: range.cloneRange(),
  }
}

/** The box around the selected text on screen, the union of its lines, as the editor measures its own. */
function boxOf(range: Range): RichTextRect | null {
  const owner = range.startContainer.ownerDocument
  if (owner === null) return null
  const box = { top: Infinity, bottom: -Infinity, left: Infinity, right: -Infinity }
  const root = range.commonAncestorContainer
  const texts: Text[] = []
  if (root.nodeType === Node.TEXT_NODE) {
    texts.push(root as Text)
  } else {
    const walker = owner.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
      if (range.intersectsNode(node)) texts.push(node as Text)
    }
  }
  const part = owner.createRange()
  for (const text of texts) {
    part.setStart(text, text === range.startContainer ? range.startOffset : 0)
    part.setEnd(text, text === range.endContainer ? range.endOffset : text.length)
    for (const rect of Array.from(part.getClientRects())) {
      if (rect.width === 0) continue
      box.top = Math.min(box.top, rect.top)
      box.bottom = Math.max(box.bottom, rect.bottom)
      box.left = Math.min(box.left, rect.left)
      box.right = Math.max(box.right, rect.right)
    }
  }
  if (box.top === Infinity) {
    const rect = range.getBoundingClientRect()
    return { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right }
  }
  return box
}

/** What takes a press of its own inside a highlight: a Link, or a control the app's entity drew. */
const CONTROLS =
  'a[href], button, input, select, textarea, summary, [tabindex], [role="button"], [role="link"]'

/** A highlight's tab stop. */
const STOP = 'mark[data-annotation-id][tabindex]'

/* -------------------------------------------------------------------------- */
/* The member that takes a reader's acts                                      */
/* -------------------------------------------------------------------------- */

interface Selected {
  /** The selection now, or null while there is none in the content. */
  now: Mapped | null
  /** The last selection there was, which the bar keeps while focus is in it and while it leaves. */
  last: Mapped | null
}

const NOTHING: Selected = { now: null, last: null }

function ReadingRichTextContent(props: RichTextContentProps) {
  const { size = 'md', activeAnnotation, onAnnotationSelect, selectionActions, messages } = props
  const say = { ...DEFAULT_MESSAGES, ...definedOf(messages) }
  const pressable = onAnnotationSelect !== undefined
  const { read, empty, blocks, stops, drawn } = drawDocument(
    props,
    pressable,
    selectionActions !== undefined,
  )
  const offering = selectionActions !== undefined && !empty

  const rootRef = useRef<HTMLDivElement>(null)
  const barRef = useRef<HTMLDivElement>(null)
  const statusRef = useRef<HTMLDivElement>(null)

  /* The reader's selection ------------------------------------------------- */

  const [selected, setSelected] = useState<Selected>(NOTHING)
  /** The DOM range of the last selection, which places the bar while the selection is held. */
  const heldRange = useRef<Range | null>(null)
  const [selecting, setSelecting] = useState(false)
  const [dismissed, setDismissed] = useState<string | null>(null)
  const [barFocus, setBarFocus] = useState(false)
  /** Where focus was before it entered the bar, where it goes back to when the bar leaves. */
  const cameFrom = useRef<HTMLElement | null>(null)

  // A changed document holds other words at the selection's positions, so the selection and the
  // bar end with it; the effect below collapses the selection on the page.
  const docKey = offering ? serializeRichText(read) : ''
  const [seenDoc, setSeenDoc] = useState(docKey)
  if (seenDoc !== docKey) {
    setSeenDoc(docKey)
    setSelected(NOTHING)
  }

  const shown = selected.now ?? (barFocus ? selected.last : null)
  const barOpen = offering && shown !== null && !selecting && dismissed !== shown.key

  /* The announcement -------------------------------------------------------- */

  const [said, setSaid] = useState({ text: '', at: 0 })
  const [barHeard, setBarHeard] = useState(false)
  if (barOpen && !barHeard) {
    setBarHeard(true)
    setSaid((last) => ({ text: say.selectionBarReady, at: last.at + 1 }))
  }

  /* The bar's keys ----------------------------------------------------------- */

  /** Puts the held selection back on the page when it was lost. */
  function restoreSelection() {
    const range = heldRange.current
    const selection = rootRef.current?.ownerDocument.getSelection()
    if (range === null || selection === null || selection === undefined || !selection.isCollapsed)
      return
    selection.removeAllRanges()
    selection.addRange(range)
  }
  /** Whether the selection goes back on the page once focus has left the bar. */
  const restoring = useRef(false)

  /**
   * Escape in the bar: the bar leaves for this selection, and the selection is
   * put back if it was lost. Some engines drop a selection while a control has
   * focus, so it is put back again once focus has left the bar.
   */
  function leaveBar() {
    if (shown !== null) setDismissed(shown.key)
    restoring.current = true
    restoreSelection()
  }
  const barKeys = useToolbarKeys(barRef, leaveBar)

  /* Listening ---------------------------------------------------------------- */

  const latest = useRef({
    read,
    shownKey: null as string | null,
    enter: barKeys.enter,
    giveFocusBack: () => {},
  })
  useLayoutEffect(() => {
    latest.current = { read, shownKey: shown?.key ?? null, enter: barKeys.enter, giveFocusBack }
  })

  // The selection, mapped to the document's plain text as it changes.
  useEffect(() => {
    const root = rootRef.current
    const owner = root?.ownerDocument
    if (!offering || root === null || owner === undefined) return
    /** The part of the member a point is in that is not its content: the bar, or the status region. */
    const outside = (node: Node) =>
      [barRef.current, statusRef.current].find((part) => part?.contains(node) === true) ?? null
    const update = () => {
      const found = mapSelection(root, outside, latest.current.read)
      if (found !== null) heldRange.current = found.range
      // A dismissal holds for one selection: once it collapses, the next one brings the bar back,
      // the same words included.
      else setDismissed(null)
      setSelected((state) => {
        if (found === null) return state.now === null ? state : { now: null, last: state.last }
        const same = state.now?.key === found.mapped.key && state.now.text === found.mapped.text
        return same ? state : { now: found.mapped, last: found.mapped }
      })
    }
    owner.addEventListener('selectionchange', update)
    return () => owner.removeEventListener('selectionchange', update)
  }, [offering])

  // A pointer selection shows the bar when the press ends, not while it is dragged.
  useEffect(() => {
    const view = rootRef.current?.ownerDocument.defaultView
    if (!selecting || view === null || view === undefined) return
    const release = () => setSelecting(false)
    view.addEventListener('pointerup', release, true)
    view.addEventListener('pointercancel', release, true)
    return () => {
      view.removeEventListener('pointerup', release, true)
      view.removeEventListener('pointercancel', release, true)
    }
  }, [selecting])

  // While the bar is drawn, Escape on the page hides it for this selection and Alt+F10 moves
  // focus into it. Both are heard on the window, before a dialog's layer hears Escape, and only
  // while focus is in the member or on no element, where the key is the reader's.
  useEffect(() => {
    const root = rootRef.current
    const view = root?.ownerDocument.defaultView
    if (!barOpen || root === null || view === null || view === undefined) return
    const keys = (event: globalThis.KeyboardEvent) => {
      const target = event.target
      if (event.isComposing || !(target instanceof view.Node)) return
      if (barRef.current?.contains(target) === true) return
      const owner = root.ownerDocument
      if (target !== owner.body && target !== owner.documentElement && !root.contains(target)) {
        return
      }
      if (event.key === 'Escape') {
        event.preventDefault()
        const key = latest.current.shownKey
        if (key !== null) setDismissed(key)
      } else if (event.key === 'F10' && event.altKey) {
        event.preventDefault()
        latest.current.enter()
      }
    }
    view.addEventListener('keydown', keys, true)
    return () => view.removeEventListener('keydown', keys, true)
  }, [barOpen])

  // The document changed under a selection: the selection collapses, so the page shows none of
  // the words the old positions named.
  const appliedDoc = useRef(docKey)
  useLayoutEffect(() => {
    if (appliedDoc.current === docKey) return
    appliedDoc.current = docKey
    heldRange.current = null
    const root = rootRef.current
    const selection = root?.ownerDocument.getSelection()
    if (root === null || selection === null || selection === undefined) return
    if (selection.rangeCount === 0 || selection.isCollapsed) return
    const range = selection.getRangeAt(0)
    if (root.contains(range.startContainer) || root.contains(range.endContainer)) {
      selection.collapseToEnd()
    }
  }, [docKey])

  /**
   * The bar leaves with focus in it (Escape, or the app changed the document
   * from one of its controls): focus goes back where it was before it entered
   * the bar, or to no element.
   */
  function giveFocusBack() {
    const bar = barRef.current
    const to = cameFrom.current
    cameFrom.current = null
    const active = bar?.ownerDocument.activeElement
    if (to !== null && to.isConnected && bar?.contains(to) !== true) {
      to.focus({ preventScroll: true })
    } else if (active instanceof HTMLElement && bar?.contains(active) === true) {
      active.blur()
    }
    if (restoring.current) restoreSelection()
    restoring.current = false
  }

  // Where the browser leaves focus on the leaving bar, the member moves it here.
  useLayoutEffect(() => {
    const bar = barRef.current
    const active = bar?.ownerDocument.activeElement
    if (barOpen || bar === null || active === null || active === undefined) return
    if (bar.contains(active)) latest.current.giveFocusBack()
  }, [barOpen])

  /* Annotations ------------------------------------------------------------- */

  /** A press on a highlight: the innermost annotation under it. */
  function pressed(event: MouseEvent<HTMLDivElement>) {
    if (onAnnotationSelect === undefined) return
    const target = event.target instanceof Element ? event.target : null
    const mark = target?.closest('[data-annotation-id]')
    const root = event.currentTarget
    if (mark === null || mark === undefined || !root.contains(mark)) return
    if (barRef.current?.contains(mark) === true) return
    // A Link, or a control the app's entity drew, takes its own press.
    const control = target?.closest(CONTROLS)
    if (control !== null && control !== undefined && control !== mark && mark.contains(control)) {
      return
    }
    // A press that ends a selection drag selects text, and opens nothing.
    if (event.detail > 0 && root.ownerDocument.getSelection()?.isCollapsed === false) return
    const id = mark.getAttribute('data-annotation-id')
    if (id !== null) onAnnotationSelect(id)
  }

  /** Enter on a highlight's tab stop acts as it is pressed, and Space as it is released, as a button's do. */
  function keyed(event: KeyboardEvent<HTMLDivElement>, phase: 'down' | 'up') {
    if (onAnnotationSelect === undefined || event.nativeEvent.isComposing) return
    const target = event.target
    if (!(target instanceof Element) || !target.matches(STOP)) return
    const id = target.getAttribute('data-annotation-id')
    if (id === null) return
    if (event.key === 'Enter' && phase === 'down') {
      event.preventDefault()
      if (!event.repeat) onAnnotationSelect(id)
    } else if (event.key === ' ') {
      event.preventDefault()
      if (phase === 'up') onAnnotationSelect(id)
    }
  }

  /* The agent ---------------------------------------------------------------- */

  // An agent reads the highlights and opens one as a person's press does: on its tab stop, so an
  // annotation a person cannot press (one only under a link, or one inside another everywhere it
  // is) is listed, and refused.
  useAgentMember(
    {
      member: 'RichTextContent',
      element: () => rootRef.current,
      state: () => {
        const listed = richTextAnnotations(read).filter((annotation) => drawn(annotation.id))
        return {
          annotations: listed.map((annotation) => ({
            id: annotation.id,
            label: annotation.text,
            ...(stops.has(annotation.id) ? {} : { disabled: true }),
          })),
          active: listed.some((annotation) => annotation.id === activeAnnotation)
            ? (activeAnnotation ?? null)
            : null,
        }
      },
      actions: {
        select: {
          argument: 'id',
          run: (id) => {
            const stop = Array.from(rootRef.current?.querySelectorAll(STOP) ?? []).find(
              (element) => element.getAttribute('data-annotation-id') === id,
            )
            if (stop === undefined) throw new Error('That annotation has no highlight to press.')
            agentPress(stop)
          },
        },
      },
    },
    { unless: onAnnotationSelect === undefined },
  )

  /* Drawing ------------------------------------------------------------------ */

  const measure = (): RichTextRect | null => {
    const root = rootRef.current
    const selection = root?.ownerDocument.getSelection()
    if (
      root !== null &&
      selection !== null &&
      selection !== undefined &&
      selection.rangeCount > 0
    ) {
      const range = selection.getRangeAt(0)
      if (!range.collapsed && root.contains(range.commonAncestorContainer)) return boxOf(range)
    }
    const held = heldRange.current
    return held === null ? null : boxOf(held)
  }

  const content = selected.now ?? selected.last

  return (
    <div
      ref={rootRef}
      className={styles.root}
      data-size={size}
      data-empty={empty ? '' : undefined}
      {...memberAttr('RichTextContent')}
      onClick={pressable ? pressed : undefined}
      onKeyDown={pressable ? (event) => keyed(event, 'down') : undefined}
      onKeyUp={pressable ? (event) => keyed(event, 'up') : undefined}
      onPointerDown={
        offering
          ? (event: PointerEvent<HTMLDivElement>) => {
              if (
                !(event.target instanceof Node) ||
                barRef.current?.contains(event.target) !== true
              )
                setSelecting(true)
            }
          : undefined
      }
    >
      {blocks}
      {offering ? (
        <SelectionBar
          open={barOpen}
          measure={measure}
          label={say.selectionBar}
          barRef={barRef}
          keys={barKeys}
          onFocusChange={(inside) => {
            setBarFocus(inside)
            // A leaving bar is inert, and a browser that moves focus off it does so here.
            if (!inside && barRef.current?.inert === true) giveFocusBack()
          }}
        >
          <div
            className={styles.actions}
            onFocus={(event: FocusEvent<HTMLDivElement>) => {
              const from = event.relatedTarget
              if (from instanceof HTMLElement && barRef.current?.contains(from) === true) return
              cameFrom.current = from instanceof HTMLElement ? from : null
            }}
          >
            {content === null
              ? null
              : selectionActions?.({ range: content.range, text: content.text })}
          </div>
        </SelectionBar>
      ) : null}
      {offering ? (
        <div ref={statusRef} role="status" aria-live="polite" className={styles.status}>
          {said.text === '' ? null : <span key={said.at}>{said.text}</span>}
        </div>
      ) : null}
    </div>
  )
}

/** The app's words, a key it left out or set to `undefined` keeping its default. */
function definedOf(messages: RichTextContentMessages | undefined): RichTextContentMessages {
  if (messages === undefined) return {}
  return Object.fromEntries(Object.entries(messages).filter(([, text]) => text !== undefined))
}
