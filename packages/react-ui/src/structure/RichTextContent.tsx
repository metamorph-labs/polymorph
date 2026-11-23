'use client'

import {
  agentPress,
  mapRichTextSelection,
  memberAttr,
  RICH_TEXT_STOP,
  type RichTextDocument,
  type RichTextDrawnBlock,
  type RichTextDrawnInline,
  type RichTextEntity,
  type RichTextRange,
  type RichTextRect,
  richTextAnnotations,
  richTextDrawing,
  richTextKeyedAnnotation,
  richTextPositionAttrs,
  richTextPressedAnnotation,
  richTextSelectionBox,
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
/* Drawing                                                                    */
/* -------------------------------------------------------------------------- */

/*
 * What each node is drawn as is decided by the engine (`richTextDrawing`,
 * `@polymorph/engine/rich-text`), which every framework's RichTextContent
 * draws from: the member for each block, the emphasis around each run, the
 * highlights nested as the editor nests them and each annotation's tab stop,
 * the Links, the headings and code runs the member draws itself, and the
 * positions in the plain text while the member maps selections. This file
 * draws that tree with React's members.
 */

interface RenderContext {
  size: RichTextContentSize
  onNavigate: ((href: string) => void) | undefined
  /** Highlights take a press. */
  pressable: boolean
  /** What the app's `entity` drew for each entity it draws, by the entity. */
  entities: ReadonlyMap<RichTextEntity, ReactNode>
}

function renderInlines(nodes: readonly RichTextDrawnInline[], context: RenderContext): ReactNode[] {
  return nodes.map((node, index) => <Fragment key={index}>{renderInline(node, context)}</Fragment>)
}

/** One child drawn, or several in order. */
function renderChildren(nodes: readonly RichTextDrawnInline[], context: RenderContext): ReactNode {
  return nodes.length === 1
    ? renderInline(nodes[0] as RichTextDrawnInline, context)
    : renderInlines(nodes, context)
}

function renderInline(node: RichTextDrawnInline, context: RenderContext): ReactNode {
  switch (node.kind) {
    case 'text':
      return node.text
    case 'strong':
      return <strong>{renderChildren(node.children, context)}</strong>
    case 'em':
      return <em>{renderChildren(node.children, context)}</em>
    case 's':
      return <s>{renderChildren(node.children, context)}</s>
    case 'mark':
      return (
        <mark
          className={
            context.pressable ? `${styles.annotation} ${styles.pressable}` : styles.annotation
          }
          data-annotation-id={node.id}
          data-active={node.active ? '' : undefined}
          role={node.stop ? 'button' : undefined}
          tabIndex={node.stop ? 0 : undefined}
          aria-current={node.stop && node.active ? 'true' : undefined}
        >
          {renderChildren(node.children, context)}
        </mark>
      )
    case 'code':
      return <Code>{node.text}</Code>
    case 'ownCode':
      // Code takes a string, so a run with a highlight is Code's element and class, drawn here.
      return <code className={styles.code}>{renderChildren(node.children, context)}</code>
    case 'link':
      return (
        <Link href={node.href} external={node.external} onNavigate={context.onNavigate}>
          {node.text}
        </Link>
      )
    case 'break':
      return <br {...richTextPositionAttrs(node.at, true)} />
    case 'entity':
      // The element and attributes the editor draws for an entity, so the one recipe class looks
      // the same in both, unless the app draws it.
      return node.app ? (
        context.entities.get(node.entity)
      ) : (
        <span
          className={styles.entity}
          data-entity-kind={node.entity.kind}
          data-entity-id={node.entity.id}
        >
          {node.entity.label}
        </span>
      )
    case 'piece':
      return (
        <span {...richTextPositionAttrs(node.at, node.atom)}>
          {renderChildren(node.children, context)}
        </span>
      )
  }
}

function renderBlocks(blocks: readonly RichTextDrawnBlock[], context: RenderContext): ReactNode[] {
  return blocks.map((block, index) => {
    switch (block.kind) {
      case 'paragraph':
        return (
          <Text key={index} size={context.size}>
            {renderInlines(block.inlines, context)}
          </Text>
        )
      case 'heading':
        return (
          <Heading key={index} level={block.level}>
            {block.text}
          </Heading>
        )
      case 'ownHeading': {
        // Heading's element, class and level, drawn here so a highlight and a position fit in it.
        const Element = block.level === 4 ? 'h4' : block.level === 3 ? 'h3' : 'h2'
        return (
          <Element key={index} className={styles.heading} data-level={block.level}>
            {renderInlines(block.inlines, context)}
          </Element>
        )
      }
      case 'list': {
        const ListElement = block.ordered ? 'ol' : 'ul'
        return (
          <ListElement key={index} className={styles.list} start={block.start}>
            {block.items.map((item, position) => (
              <li key={position} className={styles.item}>
                {renderBlocks(item, context)}
              </li>
            ))}
          </ListElement>
        )
      }
      case 'quote':
        return (
          <blockquote key={index} className={styles.quote}>
            {renderBlocks(block.blocks, context)}
          </blockquote>
        )
      case 'codeBlock': {
        // The language is the writer's word for what the scroll region holds, and CodeBlock keeps
        // its own name without one.
        const code = (
          <CodeBlock key={index} copyable={block.copyable} label={block.language}>
            {block.text}
          </CodeBlock>
        )
        return block.at === null ? (
          code
        ) : (
          <div key={index} {...richTextPositionAttrs(block.at, true, true)}>
            {code}
          </div>
        )
      }
      case 'later':
        // A block of a later version: a paragraph of the text found in it.
        return (
          <Text key={index} size={context.size}>
            {block.at === null ? (
              block.text
            ) : (
              <span {...richTextPositionAttrs(block.at, true)}>{block.text}</span>
            )}
          </Text>
        )
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
  const entities = new Map<RichTextEntity, ReactNode>()
  const drawing = richTextDrawing(props.value, {
    headingLevel: props.headingLevel,
    annotations: props.annotations,
    activeAnnotation: props.activeAnnotation,
    pressable,
    positions: mapped,
    appDraws: (entity) => {
      const drawn = props.entity?.(entity)
      if (drawn === undefined) return false
      entities.set(entity, drawn)
      return true
    },
  })
  const shown = props.annotations === undefined ? null : new Set(props.annotations)
  const context: RenderContext = {
    size: props.size ?? 'md',
    onNavigate: props.onNavigate,
    pressable,
    entities,
  }
  return {
    read: drawing.value,
    empty: drawing.empty,
    blocks: drawing.empty ? null : renderBlocks(drawing.blocks, context),
    stops: new Set(drawing.stops),
    drawn: (id: string) => shown === null || shown.has(id),
  }
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

/** A selection in the member's content, as the bar holds it. */
interface Mapped extends RichTextContentSelection {
  /** The range as a string, which tells one selection from another. */
  key: string
}

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
      const found = mapRichTextSelection(root, outside, latest.current.read)
      if (found !== null) heldRange.current = found.dom
      // A dismissal holds for one selection: once it collapses, the next one brings the bar back,
      // the same words included.
      else setDismissed(null)
      setSelected((state) => {
        if (found === null) return state.now === null ? state : { now: null, last: state.last }
        const same = state.now?.key === found.key && state.now.text === found.text
        const mapped = { range: found.range, text: found.text, key: found.key }
        return same ? state : { now: mapped, last: mapped }
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

  /** A press on a highlight: the innermost annotation under it (`richTextPressedAnnotation`). */
  function pressed(event: MouseEvent<HTMLDivElement>) {
    if (onAnnotationSelect === undefined) return
    const id = richTextPressedAnnotation(
      event.currentTarget,
      event.target,
      event.detail,
      barRef.current,
    )
    if (id !== null) onAnnotationSelect(id)
  }

  /** Enter on a highlight's tab stop acts as it is pressed, and Space as it is released, as a button's do. */
  function keyed(event: KeyboardEvent<HTMLDivElement>, phase: 'down' | 'up') {
    if (onAnnotationSelect === undefined) return
    const id = richTextKeyedAnnotation(event.nativeEvent, phase)
    if (id !== null) onAnnotationSelect(id)
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
            const stop = Array.from(rootRef.current?.querySelectorAll(RICH_TEXT_STOP) ?? []).find(
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
      if (!range.collapsed && root.contains(range.commonAncestorContainer)) {
        return richTextSelectionBox(range)
      }
    }
    const held = heldRange.current
    return held === null ? null : richTextSelectionBox(held)
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
