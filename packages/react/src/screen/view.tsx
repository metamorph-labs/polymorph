'use client'

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'

import { parsePartial } from '@polymorph/screen/partial'
import { VOCABULARY } from '@polymorph/screen/vocabulary'
import {
  createScreen,
  type Screen,
  type ScreenAction,
  type ScreenFault,
  type ScreenUpdate,
} from '@polymorph/screen/walk'

import { ScreenDrawing, type DrawOptions } from './draw'

/**
 * A screen kept for a component's life, and `ScreenView`, which draws one.
 *
 * The screen is made once, from the first render's props, with no handler: a
 * render runs nothing a host sees, so a render React discards, a second one
 * in strict mode or one on a server tells the host nothing. After each
 * commit the screen is brought to the props: the host's handlers, then the
 * document, the data, whether more is to come and where the text ends. A change the screen draws
 * notifies the drawing, which redraws the nodes it reached before the browser
 * paints.
 */

/** What a screen is drawn from. Each field may change between renders. */
export interface ScreenSource {
  /**
   * The document, whole or as far as it has arrived: a `polymorph-screen/1`
   * screen spec. Give `document` or `text`.
   */
  document?: unknown
  /**
   * A model's answer so far, as text. The document is read from it
   * (`parsePartial`), and the screen draws what has arrived: an element once
   * every prop it requires is written and the text has moved past its own
   * fields, never with part of them.
   */
  text?: string
  /** The host's data, by input name. A new object with the same values redraws nothing. */
  data?: Readonly<Record<string, unknown>>
  /**
   * Whether more of the document is still to come: no fault is reported for
   * what has not arrived yet. With `text`, it is whether the text's document
   * has not yet closed, unless given.
   */
  streaming?: boolean
  /**
   * Where the text ends, beside a `document` a host read with `parsePartial`
   * itself: its `cut`. While `streaming`, an element the cut is still inside
   * waits until its props are written, as it does with `text`. A streaming
   * `document` with no `cut` draws every element that has arrived, with the
   * props it has so far; a member that throws for one that has not arrived
   * draws nothing until the document is whole. Read from the text with `text`.
   */
  cut?: string | null
  /**
   * The path of the string still being written, beside a `document` a host
   * read with `parsePartial` itself: its `open`. That string is drawn only
   * where it reads as what it will say. Read from the text with `text`.
   */
  open?: string | null
  /**
   * The members and exception primitives the screen may draw, by name; a part
   * comes with its member. Every member React draws when absent, except one
   * that hosts another library's code (`ThirdParty`). The same list builds the
   * card the model writes from (`runtimeCard({ members })`) and checks its
   * answer (`checkScreen(document, { members })`). Read when the screen is
   * made: a different list makes a new screen.
   */
  allow?: readonly string[]
  /**
   * What fills a data input the host gave no value for: nothing (`absent`, the
   * default), or a sample of its type (`sample`), which a picture of the screen
   * asks for. Read when the screen is made.
   */
  fill?: 'absent' | 'sample'
  /**
   * Told each action: a member called a callback input that returns nothing.
   * A promise it returns is what the member waits on (a ConfirmDialog stays
   * pending while the host saves).
   */
  onAction?: (action: ScreenAction) => unknown
  /**
   * Told each fault once, when it first appears: a prop the member does not
   * take, a component the screen may not draw, an address it may not hold, a
   * member that threw, and text that stops being JSON.
   */
  onFault?: (fault: ScreenFault) => void
}

/** Whether two data records hold the same values under the same names. */
function sameData(
  a: Readonly<Record<string, unknown>> | undefined,
  b: Readonly<Record<string, unknown>> | undefined,
): boolean {
  if (a === b) return true
  if (a === undefined || b === undefined) return false
  const keys = Object.keys(a)
  return (
    keys.length === Object.keys(b).length &&
    keys.every((key) => Object.prototype.hasOwnProperty.call(b, key) && Object.is(a[key], b[key]))
  )
}

/** The fields of a screen a host can change after it is made. */
type Given = Required<Pick<ScreenUpdate, 'document' | 'data' | 'streaming' | 'open' | 'cut'>>

/**
 * A screen for the component's life, kept up to date with `source`: what
 * `ScreenView` draws. Use it to draw the screen with `ScreenDrawing`
 * elsewhere, or to read what the screen knows (`values`, `fills`, `faults`).
 */
export function useScreen(source: ScreenSource): Screen {
  const read = useMemo(
    () => (source.text === undefined ? null : parsePartial(source.text)),
    [source.text],
  )
  const given: Given = {
    document: read === null ? source.document : read.document,
    data: source.data ?? {},
    streaming: source.streaming ?? (read !== null && !read.complete),
    open: read === null ? (source.open ?? null) : read.open,
    cut: read === null ? (source.cut ?? null) : read.cut,
  }

  // A screen depends on the members it may draw and on how it fills an input, so a change to
  // either makes a new one. The key is the two as text.
  const key = JSON.stringify([source.fill ?? 'absent', source.allow ?? null])
  const make = () => ({
    key,
    given,
    screen: createScreen({
      ...given,
      vocabulary: VOCABULARY,
      framework: 'react',
      fill: source.fill ?? 'absent',
      ...(source.allow === undefined ? {} : { members: source.allow }),
    }),
  })
  const [made, setMade] = useState(make)
  let current = made
  if (made.key !== key) {
    current = make()
    setMade(current)
  }
  const { screen } = current

  // The host's handlers, as they are at the last commit. The screen calls them through these.
  const handlers = useRef({ onAction: source.onAction, onFault: source.onFault })
  useLayoutEffect(() => {
    handlers.current = { onAction: source.onAction, onFault: source.onFault }
  })

  // What the screen was last given, so a render that changes nothing changes nothing.
  const last = useRef<{ screen: Screen; given: Given }>({ screen, given: current.given })
  const told = useRef<Screen | null>(null)

  useLayoutEffect(() => {
    screen.update({
      onAction: (action) => handlers.current.onAction?.(action),
      onFault: (fault) => handlers.current.onFault?.(fault),
    })
    // The faults found before the host listened: the first drawing's, and those its nodes
    // reported. Told once for each screen, though strict mode runs this twice.
    if (told.current !== screen) {
      told.current = screen
      for (const fault of screen.faults) handlers.current.onFault?.(fault)
    }
    return () => screen.update({ onAction: undefined, onFault: undefined })
  }, [screen])

  useLayoutEffect(() => {
    // A screen made in this render was made with what this render gives it.
    const before = last.current.screen === screen ? last.current.given : current.given
    const change: ScreenUpdate = {}
    if (!Object.is(before.document, given.document)) change.document = given.document
    if (!sameData(before.data, given.data)) change.data = given.data
    if (before.streaming !== given.streaming) change.streaming = given.streaming
    if (before.open !== given.open) change.open = given.open
    if (before.cut !== given.cut) change.cut = given.cut
    last.current = { screen, given }
    if (Object.keys(change).length > 0) screen.update(change)
  })

  // Text that stops being JSON before it ends is a fault of the answer, not of a node. It is told
  // once, though strict mode runs this twice.
  const error = read?.error ?? null
  const fault =
    error === null ? null : `the answer stops being JSON at character ${error.at}: ${error.message}`
  const toldError = useRef<string | null>(null)
  useEffect(() => {
    if (fault === null || toldError.current === fault) return
    toldError.current = fault
    handlers.current.onFault?.({ path: '$', message: fault })
  }, [fault])

  return screen
}

export interface ScreenViewProps extends ScreenSource, DrawOptions {}

/**
 * A screen a model wrote, drawn with the host's members in the host's theme.
 *
 * ```tsx
 * import * as members from '@polymorph/react-ui'
 * import { ScreenView } from '@polymorph/react/screen'
 *
 * <ScreenView
 *   text={answer}
 *   streaming={!done}
 *   members={members}
 *   data={{ tickets }}
 *   onAction={({ name, args, values }) => agent.send({ name, args, values })}
 * />
 * ```
 */
export function ScreenView(props: ScreenViewProps): ReactNode {
  const screen = useScreen(props)
  return (
    <ScreenDrawing
      screen={screen}
      members={props.members}
      faults={props.faults}
      renderFault={props.renderFault}
      renderBinding={props.renderBinding}
      decorate={props.decorate}
      fallback={props.fallback}
    />
  )
}
