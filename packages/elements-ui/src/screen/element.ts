import type { ScreenCheck } from '@polymorph/screen/check'
import type { JsonValue } from '@polymorph/screen'

import type { FaultDisplay } from './draw'
import type { Controller, ScreenState } from './drawing'

/**
 * `<poly-screen>`: a run-time screen as an element. It is written by hand, as
 * `poly-icon` is; it is not a member, has no Solid member behind it, and no
 * description generates it.
 *
 * It draws a `polymorph-screen/1` document from one of three places, the
 * first that holds one: its `spec` property (the document as an object), its
 * `text` property (a model's answer so far, read with `parsePartial`), or a
 * `<script type="application/json">` child, for a page a server renders.
 *
 * - **Attributes and properties.** `data` (property) is the host's data by
 *   input name. `streaming` (attribute and property) says more of the
 *   document is to come. `members` (attribute, a JSON array or names separated
 *   by spaces, and property) is the members the host allows. `faults`
 *   (attribute and property) is `hidden`, the default, or `inline`, which draws
 *   a fault in its node's place. A property set before the element is defined
 *   is read when it is.
 * - **Events.** `poly-action` when a member calls one of the document's
 *   callback inputs, with `detail` `{ name, args, values }`; a listener hands
 *   the member a promise with `event.waitUntil`. `poly-fault` when something
 *   cannot be drawn, with `detail` `{ path, message, component? }`. Both bubble
 *   and are composed.
 * - **Script.** `values` is each named control's current value. `check()`
 *   resolves to what `checkScreen` says of the document it draws.
 * - **Box.** It draws in the light DOM and, while it draws, carries the custom
 *   state `poly-host`, which the foundation's host rule gives `display:
 *   contents`: the screen lays out as content of the element's parent, as a
 *   member's element does, and a host sizes the screen by the element around
 *   it.
 * - **Code.** This module imports nothing at once. The renderer, the
 *   vocabulary table and `parsePartial` load the first time an element
 *   connects; the validator loads the first time `check()` is called.
 */

/** The tag. */
export const SCREEN_TAG = 'poly-screen'

const loadDrawing = () => import('./drawing')
const loadCheck = () => import('./check')

/** The properties a page may set before the element is defined. */
const PROPERTIES = ['spec', 'text', 'data', 'streaming', 'members', 'faults'] as const

/** `HTMLElement`, or a stand-in where there is no DOM, so the module loads in Node. */
const Base: typeof HTMLElement =
  typeof HTMLElement === 'undefined' ? (class {} as unknown as typeof HTMLElement) : HTMLElement

/** A boolean attribute: present, unless it says `false`. */
const present = (value: string | null): boolean => value !== null && value !== 'false'

/** The `members` attribute: a JSON array of names, or names separated by spaces. */
function membersOf(value: string | null): readonly string[] | undefined {
  if (value === null) return undefined
  const text = value.trim()
  if (!text.startsWith('[')) return text === '' ? [] : text.split(/\s+/)
  try {
    const parsed: unknown = JSON.parse(text)
    if (Array.isArray(parsed) && parsed.every((name) => typeof name === 'string')) return parsed
  } catch {
    // Reported below.
  }
  console.warn(
    `polymorph: poly-screen members=${JSON.stringify(value)} is neither a JSON array nor names; every member is allowed`,
  )
  return undefined
}

const displayOf = (value: unknown): FaultDisplay => (value === 'inline' ? 'inline' : 'hidden')

export class PolyScreen extends Base {
  static get observedAttributes(): string[] {
    return ['streaming', 'members', 'faults']
  }

  #spec: unknown = undefined
  #text: string | undefined = undefined
  #data: Readonly<Record<string, unknown>> | undefined = undefined
  #streaming = false
  #members: readonly string[] | undefined = undefined
  #faults: FaultDisplay = 'hidden'
  #controller: Controller | null = null
  #loading = false
  readonly #internals: ElementInternals | null = null

  constructor() {
    super()
    try {
      const internals = this.attachInternals()
      // Tried once here, so an engine that refuses the state fails here and not at each drawing.
      internals.states.add('poly-host')
      internals.states.delete('poly-host')
      this.#internals = internals
    } catch {
      // An engine without custom states draws the element as an inline box.
    }
    // A property a script set before the element was defined is set again through its accessor.
    for (const name of PROPERTIES) {
      if (!Object.prototype.hasOwnProperty.call(this, name)) continue
      const value = (this as unknown as Record<string, unknown>)[name]
      delete (this as unknown as Record<string, unknown>)[name]
      ;(this as unknown as Record<string, unknown>)[name] = value
    }
  }

  /** The document, as an object. */
  get spec(): unknown {
    return this.#spec
  }
  set spec(value: unknown) {
    this.#spec = value
    this.#sync()
  }

  /** A model's answer so far: prose, then a fenced `json` block, or the document alone. */
  get text(): string | undefined {
    return this.#text
  }
  set text(value: string | undefined) {
    this.#text = typeof value === 'string' ? value : undefined
    this.#sync()
  }

  /** The host's data, by input name. */
  get data(): Readonly<Record<string, unknown>> | undefined {
    return this.#data
  }
  set data(value: Readonly<Record<string, unknown>> | undefined) {
    this.#data = typeof value === 'object' && value !== null ? value : undefined
    this.#sync()
  }

  /** Whether more of the document is to come. */
  get streaming(): boolean {
    return this.#streaming
  }
  set streaming(value: boolean) {
    this.#streaming = value === true
    this.#sync()
  }

  /** The members the host allows, by name; every member the elements draw but the code hosts when absent. */
  get members(): readonly string[] | undefined {
    return this.#members
  }
  set members(value: readonly string[] | undefined) {
    this.#members = Array.isArray(value) ? [...(value as readonly string[])] : undefined
    this.#sync()
  }

  /** `hidden`: a node that cannot be drawn draws nothing. `inline`: its fault is drawn in its place. */
  get faults(): FaultDisplay {
    return this.#faults
  }
  set faults(value: FaultDisplay) {
    this.#faults = displayOf(value)
    this.#sync()
  }

  /** Each named control's current value, by its name. */
  get values(): Readonly<Record<string, JsonValue>> {
    return this.#controller?.values ?? {}
  }

  /** What `checkScreen` says of the document the element draws, with its members. */
  async check(): Promise<ScreenCheck> {
    const [{ checkScreen }, { sourceOf }] = await Promise.all([loadCheck(), loadDrawing()])
    const { document } = sourceOf(this, this.#state())
    return checkScreen(document, this.#members === undefined ? {} : { members: this.#members })
  }

  attributeChangedCallback(name: string, _old: string | null, value: string | null): void {
    if (name === 'streaming') this.#streaming = present(value)
    else if (name === 'members') this.#members = membersOf(value)
    else if (name === 'faults') this.#faults = displayOf(value)
    this.#sync()
  }

  connectedCallback(): void {
    if (this.#controller !== null || this.#loading) return
    this.#loading = true
    loadDrawing().then(
      ({ control }) => {
        this.#loading = false
        if (!this.isConnected || this.#controller !== null) return
        this.#controller = control(this, () => this.#state())
        this.#internals?.states.add('poly-host')
      },
      (error: unknown) => {
        this.#loading = false
        console.error('polymorph: the code that draws poly-screen did not load', error)
      },
    )
  }

  disconnectedCallback(): void {
    // A move within the document connects the element again in the same task.
    queueMicrotask(() => {
      if (this.isConnected || this.#controller === null) return
      this.#controller.dispose()
      this.#controller = null
      this.#internals?.states.delete('poly-host')
    })
  }

  #state(): ScreenState {
    return {
      spec: this.#spec,
      text: this.#text,
      data: this.#data,
      streaming: this.#streaming,
      members: this.#members,
      faults: this.#faults,
    }
  }

  #sync(): void {
    this.#controller?.sync()
  }
}

/** Defines `<poly-screen>`, once. Defining it again keeps the element that holds the tag. */
export function definePolyScreen(): typeof PolyScreen {
  const existing = customElements.get(SCREEN_TAG)
  if (existing !== undefined) return existing as unknown as typeof PolyScreen
  customElements.define(SCREEN_TAG, PolyScreen)
  return PolyScreen
}

declare global {
  interface HTMLElementTagNameMap {
    'poly-screen': PolyScreen
  }
}
