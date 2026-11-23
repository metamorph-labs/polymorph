import { PolymorphEvent } from '@polymorph/elements'
import { parsePartial } from '@polymorph/screen/partial'
import type { ScreenAction, ScreenFault } from '@polymorph/screen/walk'

import { draw, type Drawing, type FaultDisplay } from './draw'
import { ACTION_EVENT, FAULT_EVENT } from './events'

/**
 * What `<poly-screen>` loads the first time one connects, or a script asks
 * it for its document: the renderer, `parsePartial`, and the code that ties a
 * `<poly-screen>` to a drawing. It holds no validator and no card.
 */

export { draw, parsePartial }

/** What a `<poly-screen>` holds, as its attributes and properties set it. */
export interface ScreenState {
  /** The document, set as an object. */
  spec: unknown
  /** A model's text so far, read with `parsePartial`. */
  text: string | undefined
  data: Readonly<Record<string, unknown>> | undefined
  streaming: boolean
  members: readonly string[] | undefined
  faults: FaultDisplay
}

/** The document a `<poly-screen>` draws, as far as it has arrived. */
export interface ScreenSource {
  document: unknown
  open: string | null
  /** The path of the innermost value the text ends inside, or `null`. */
  cut: string | null
  /** Whether more of it is to come: the text the model is still writing, or the `streaming` the page set. */
  streaming: boolean
  /** Why the text or the script stops being a document, or `null`. */
  fault: string | null
}

/** The `<script type="application/json">` a server-rendered page writes the document in. */
const scriptOf = (host: Element): HTMLScriptElement | null =>
  host.querySelector(':scope > script[type="application/json"]')

/**
 * The document a `<poly-screen>` draws: its `spec` property, else its `text`
 * property read as a model's answer so far, else the JSON in its script child.
 */
export function sourceOf(host: Element, state: ScreenState): ScreenSource {
  if (state.spec !== undefined) {
    return {
      document: state.spec,
      open: null,
      cut: null,
      streaming: state.streaming,
      fault: null,
    }
  }
  if (state.text !== undefined) {
    const read = parsePartial(state.text)
    return {
      document: read.document,
      open: read.open,
      cut: read.cut,
      streaming: state.streaming || !read.complete,
      fault:
        read.error === null
          ? null
          : `the text stops being a document at ${read.error.at}: ${read.error.message}`,
    }
  }
  const script = scriptOf(host)
  if (script === null) {
    return { document: undefined, open: null, cut: null, streaming: state.streaming, fault: null }
  }
  try {
    return {
      document: JSON.parse(script.text) as unknown,
      open: null,
      cut: null,
      streaming: state.streaming,
      fault: null,
    }
  } catch (error) {
    return {
      document: undefined,
      open: null,
      cut: null,
      streaming: state.streaming,
      fault: `the document script holds no JSON: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}

/** A drawing tied to a `<poly-screen>`. */
export interface Controller {
  readonly values: Drawing['values']
  /** Reads the element's state again and draws what changed. */
  sync(): void
  dispose(): void
}

/**
 * Draws a `<poly-screen>`'s document into it and keeps the drawing in step
 * with the element: `read` returns what its attributes and properties hold
 * now, and `sync` is called after each change. A change to the script child
 * the page makes is followed by the controller itself. Each action and each
 * fault is dispatched on the element as a `PolymorphEvent`, which bubbles and
 * is composed; an action's listener can hand the member a promise with
 * `event.waitUntil`.
 */
export function control(host: HTMLElement, read: () => ScreenState): Controller {
  const onAction = (action: ScreenAction): unknown =>
    new PolymorphEvent(ACTION_EVENT, { detail: action, bubbles: true, composed: true }).dispatchOn(
      host,
    )
  const onFault = (fault: ScreenFault): void => {
    new PolymorphEvent(FAULT_EVENT, { detail: fault, bubbles: true, composed: true }).dispatchOn(
      host,
    )
  }

  let state = read()
  let source = sourceOf(host, state)
  let told: string | null = null
  const tell = (fault: string | null) => {
    if (fault !== null && fault !== told) onFault({ path: '$', message: fault })
    told = fault
  }

  const open = (): Drawing =>
    draw(host, {
      document: source.document,
      open: source.open,
      cut: source.cut,
      streaming: source.streaming,
      faults: state.faults,
      onAction,
      onFault,
      ...(state.data === undefined ? {} : { data: state.data }),
      ...(state.members === undefined ? {} : { members: state.members }),
    })

  let drawing = open()
  tell(source.fault)

  // The script child, and the text inside it, which a page or a swap may change.
  let script = scriptOf(host)
  const text = new MutationObserver(() => sync())
  const watch = () => {
    text.disconnect()
    if (script !== null)
      text.observe(script, { childList: true, characterData: true, subtree: true })
  }
  watch()
  const children = new MutationObserver(() => {
    const next = scriptOf(host)
    if (next === script) return
    script = next
    watch()
    sync()
  })
  children.observe(host, { childList: true })

  const sync = (): void => {
    const next = read()
    const members = next.members
    const changedMembers =
      members !== state.members &&
      (members === undefined ||
        state.members === undefined ||
        members.length !== state.members.length ||
        members.some((name, at) => name !== state.members?.[at]))
    state = next
    source = sourceOf(host, state)
    if (changedMembers) {
      // The members a host allows decide what the walk draws from the start, so the drawing starts again.
      drawing.dispose()
      drawing = open()
    } else {
      drawing.update({
        document: source.document,
        open: source.open,
        cut: source.cut,
        streaming: source.streaming,
        data: state.data ?? {},
        faults: state.faults,
      })
    }
    tell(source.fault)
  }

  return {
    get values() {
      return drawing.values
    },
    sync,
    dispose() {
      text.disconnect()
      children.disconnect()
      drawing.dispose()
    },
  }
}
