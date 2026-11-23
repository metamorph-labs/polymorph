import { DEFAULT_FRAMEWORK, unionParts, type Framework } from '@polymorph/registry/frameworks'
import type { TableProp } from '@polymorph/registry/screen-table'
import {
  isBinding,
  isElement,
  isObjectValue,
  type SpecElement,
  type SpecValue,
} from '@polymorph/spec/schema'

import {
  answerFor,
  callbackFill,
  isCallback,
  isThenable,
  MAX_TYPE_LENGTH,
  returnTypeOf,
  sampleOf,
  shown,
  stubFor,
  typeTooLong,
  valueAt,
  type Fill,
} from './actions'
import { MAX_DEPTH, TOO_DEEP } from './depth'
import { MAX_JSON_VALUES, reduceArguments, reduceToJson, type JsonValue } from './json'
import {
  allowedMembers,
  formPropOf,
  INHERITED_NAMES,
  inheritedNameFault,
  keyTooLong,
  MAX_KEY_LENGTH,
  memberFault,
  sharedNameFault,
  surfaceOf,
  type ChildrenKind,
  type ScreenSurface,
  type ScreenVocabulary,
} from './members'
import {
  callbackOf,
  dataField,
  elementIn,
  fieldOf,
  functionInData,
  holdsData,
  itemOf,
  notOneElement,
  objectName,
  takesElement,
  takesNode,
  undeclaredField,
  unreceivedCallback,
  withoutElements,
  type Receiver,
} from './receivers'
import { addressFaults, ADDRESS_KEYS } from './urls'

/**
 * The run-time walk: a screen document, the host's data and a vocabulary,
 * resolved into what a renderer draws, with everything every renderer shares
 * done once, here.
 *
 * A renderer is thin over it. It subscribes to the screen, reads `root`, and
 * draws each node by its `component` with its `props` and `children`. Every
 * decision about what a document may do at run time is made here:
 *
 *  - **Data inputs** are filled from `data` by name. An input with no value is
 *    absent; a picture of the screen asks for a sample instead (`fill`). An
 *    input whose type is longer than `MAX_TYPE_LENGTH` is a fault, and is
 *    data with no value. What an input's type says is read once for each
 *    type, not on each drawing.
 *  - **A callback input is handed by its receiver** (`receivers.ts`). Bound
 *    to a prop or a field whose type is a callback that returns nothing, it is
 *    an action: a member that calls it tells the host `{ name, args, values,
 *    changed }` (`onAction`), and a promise the host's handler returns is what
 *    the member waits on. Bound to a callback that returns a value, it is a
 *    question the member asks while it draws (a row's key), which no document
 *    can answer: nothing is passed where the receiver may be left out, so the
 *    member answers by default, and a stub answers by the receiver's return
 *    type where it is required. The host is never told (`actions.ts`).
 *    Bound anywhere else (a text, a node, data, a field the vocabulary does
 *    not know), it is a fault and nothing is passed, as a renderer may call a
 *    function it is handed as text. A function in the host's data is never
 *    handed to a member as itself: a binding whose value is one is a fault.
 *    Functions inside an object or a list the host's data holds are the
 *    host's, passed as it gave them.
 *  - **Controls follow the reader.** A controlled prop (`value` with
 *    `onChange`) keeps what the reader last chose until the document or the
 *    host gives it another value, or the control's component or name changes.
 *    One the document gives no value stays the member's own, and what the
 *    reader chose is passed back as its default (`defaultValue`), so a member
 *    drawn again starts from it.
 *  - **`values`** holds each named control's value as JSON: what the reader
 *    chose, else the value the document or the host gives, else its default,
 *    else the empty value its type has (`emptyOf`). `changed` names the
 *    controls whose value is what the reader chose. A name two controls share
 *    is a fault, and `values` holds the last of them in document order: an
 *    element before what its props hold, what its props hold in the order the
 *    props are written, then its children. A name an object inherits
 *    (`__proto__`) is a fault, and is left out.
 *  - **An element in a structured object** is drawn only where the field's
 *    data type takes a node. A field the type does not declare, or declares as
 *    text, numbers or booleans, loses every element below it at any depth
 *    with one fault and keeps its data, so no control the person never sees
 *    holds a value. In an object whose type the vocabulary does not name, an
 *    element is drawn as before (`receivers.ts`). A key longer than
 *    `MAX_KEY_LENGTH` is a fault at its parent, and is not read.
 *  - **A required callback** the document does not bind is stubbed by its
 *    return type.
 *  - **Nothing the document says runs.** A component is drawn only if the
 *    vocabulary has it and the host allows it, a prop is passed only if the
 *    member has it, a callback only if it is a function, and an address only
 *    if it is one a screen may hold (`urls.ts`). An object is passed only as
 *    the format writes one (`$object`), and a document nested deeper than
 *    `MAX_DEPTH` (`depth.ts`) is drawn only down to it.
 *  - **An element is drawn once every data prop it requires has a value.**
 *    One whose required data prop was never written, or was refused, carries
 *    a fault that names the prop and is drawn as nothing. A required callback
 *    is stubbed, `children` are no prop here, an address refused or data the
 *    host has not given leaves the element drawn without it, and a required
 *    slot (a prop that takes any node) whose element is a fault or missing
 *    leaves it drawn with the slot empty, so a fault never removes the page
 *    around it. A member that reads one element it requires, as its child
 *    (FormField) or in a prop that takes exactly one element (SettingsRow's
 *    `control`), is drawn once that element is; while the document streams it
 *    waits for it. An optional prop that takes one element is handed a drawn
 *    element or nothing.
 *  - **A fault never blanks the screen.** A node that cannot be drawn carries
 *    its fault and is drawn as nothing, or as the fault where the host asks;
 *    every fault reaches the host with its path (`onFault`), once in each
 *    drawing. A drawing begins when the screen is made, when a stream begins,
 *    and when the host gives a whole document that differs from the one drawn.
 *    A renderer reports a member that throws with `fail`.
 *  - **Streaming.** While `streaming`, an element is drawn once every prop it
 *    requires is written and the text (`cut`, from `parsePartial`) ends
 *    outside it, in its `children`, or in an element one of its props holds;
 *    until then it is left out of its parent, or of `root`. Once drawn it
 *    stays drawn, and a prop written after that arrives when it is whole, as
 *    an update. So a member is never drawn without a prop it requires nor with
 *    a half-written value, and a page is drawn while the elements in its
 *    props and its children are still being written. A prop or a callback
 *    that has not arrived is no fault, and the string still being written
 *    (`open`) is drawn only as a child or as a prop that takes free text. A
 *    node whose content did not change keeps its object, so a renderer
 *    redraws only what did.
 *
 * Paths are the validator's: `$.root`, `$.root.children[0]`,
 * `$.root.props.emptyState.secondaryAction`.
 */

export interface ScreenFault {
  path: string
  message: string
  /** The component written at the path, where there is one. */
  component?: string
}

/**
 * What a member's call of an action tells the host. The document chose the
 * action's name, and wrote what `values` holds until the person changes it, so
 * a host confirms a consequential action outside the screen.
 */
export interface ScreenAction {
  /** The callback input the member called. */
  name: string
  /** The call's arguments as JSON (`json.ts`). */
  args: JsonValue[]
  /** Each named control's current value, by its name: what the controls hold, not the person's word. */
  values: Record<string, JsonValue>
  /** The names in `values` whose value the person chose, in document order. Every other value is the document's or the host's. */
  changed: string[]
}

/**
 * Where a drawn value comes from: the document, the host's data (passed as
 * the host gave it, never copied), or the screen (an action, a stub, a
 * control's handler or the value the reader chose).
 */
export type DrawnFrom = 'document' | 'data' | 'screen'

/**
 * A resolved value, as a renderer draws it.
 *
 *  - `value`: data. A renderer passes it as it is.
 *  - `node`: an element to draw.
 *  - `list`, `record`: a list or a structured object of the document that
 *    holds a node (or, in a list, a binding or a fault) somewhere inside;
 *    one that holds none is a `value`.
 *  - `binding`: a binding where something is drawn (a child), with the value
 *    it is bound to. A renderer draws the value; the composer draws the
 *    binding's name.
 *  - `fault`: a structured object where something is drawn, which is no node.
 */
export type Drawn =
  | { readonly kind: 'value'; readonly value: unknown; readonly from: DrawnFrom }
  | { readonly kind: 'node'; readonly node: ScreenNode }
  | { readonly kind: 'list'; readonly items: readonly Drawn[] }
  | { readonly kind: 'record'; readonly fields: Readonly<Record<string, Drawn>> }
  | { readonly kind: 'binding'; readonly path: string; readonly value: unknown }
  | { readonly kind: 'fault'; readonly fault: ScreenFault }

export interface ScreenNode {
  /** Where the element is in the document; a renderer keys the node by it. */
  readonly path: string
  /**
   * What a renderer keys the node by, so a control drawn under another name
   * is a new control: the path, and a named control's name after a `#`
   * (`$.root.children[0]#email`). Absent on a node made elsewhere, which a
   * renderer keys by its path.
   */
  readonly key?: string
  /** The component as the document names it: `Button`, `Table.Row`. */
  readonly component: string
  /**
   * The document's element. A node that did not change keeps its object from
   * an earlier drawing, and with it that drawing's element, which says the same.
   */
  readonly element: SpecElement
  /** The member it belongs to (`Table` for `Table.Row`), or `null` for a name the vocabulary does not have. */
  readonly member: string | null
  /** The part's name in its member (`Row`), or `null`. */
  readonly part: string | null
  /** Each prop to pass, by name: what the document gives, with the screen's handlers and stubs. */
  readonly props: Readonly<Record<string, Drawn>>
  /** What is drawn inside it, in order. Empty for a member that takes no children. */
  readonly children: readonly Drawn[]
  /** Why the node cannot be drawn (an unknown or disallowed component), or `null`. A renderer draws nothing for it, or the fault. */
  readonly fault: ScreenFault | null
  /**
   * How the member takes its children (`ChildrenKind`): a list of nodes, or
   * one element or one text it reads, passed as itself. `null` when it takes
   * none, or the node cannot be drawn.
   */
  readonly childrenKind?: ChildrenKind | null
}

export interface ScreenOptions {
  /** The document, whole or as far as it has arrived (`parsePartial`). */
  document: unknown
  /** The vocabulary to draw with: `VOCABULARY` from `@polymorph/screen/vocabulary`, or another of its shape. */
  vocabulary: ScreenVocabulary
  /** The web framework that draws the screen; it decides the default members. `react` when absent. */
  framework?: Framework
  /** The members the host allows (`MemberOptions` in `members.ts`). The framework's default when absent. */
  members?: readonly string[]
  /** The host's data, by input name. */
  data?: Readonly<Record<string, unknown>>
  /** What fills a data input the host gave no value for: nothing (`absent`), or a sample of its type (`sample`). */
  fill?: 'absent' | 'sample'
  /** Whether more of the document is still to come. */
  streaming?: boolean
  /** The path of the string still being written (`parsePartial`'s `open`). */
  open?: string | null
  /**
   * Where the text ends while it streams (`parsePartial`'s `cut`). An element
   * is drawn once every prop it requires is written and the cut is outside it,
   * in its `children`, or in an element one of its props holds; a prop written
   * after that arrives when it is whole. Absent or `null`, every element that
   * has arrived is drawn.
   */
  cut?: string | null
  /**
   * Told each action: each call a member makes of a callback input bound where
   * a callback that returns nothing receives it. A promise it returns is what
   * the member waits on. A question, a callback whose receiver returns a value,
   * is never told.
   */
  onAction?: (action: ScreenAction) => unknown
  /**
   * Told each fault once in a drawing, by its path and message, when it first
   * appears. A drawing begins when the screen is made, when a stream begins,
   * and when the host gives a whole document (not streaming) that differs
   * from the one drawn. A fault that goes and comes back within one drawing,
   * across a stream's chunks or the host's data, is not told again.
   */
  onFault?: (fault: ScreenFault) => void
}

/** What a host changes on a screen that is drawn. Each field replaces the one it names. */
export type ScreenUpdate = Partial<
  Pick<ScreenOptions, 'document' | 'data' | 'streaming' | 'open' | 'cut' | 'onAction' | 'onFault'>
>

export interface Screen {
  /**
   * What to draw: the root element's node, or `null` before the document has a
   * root, and while the root is still being written (`cut`).
   */
  readonly root: ScreenNode | null
  /** Every fault the drawing has now: the walk's, then those renderers reported. */
  readonly faults: readonly ScreenFault[]
  /**
   * Each named control's value, by its name: what the reader chose, else the
   * value the document or the host gives, else its default, else the empty
   * value its type has.
   */
  readonly values: Readonly<Record<string, JsonValue>>
  /** The names in `values` whose value the person chose, in document order (`ScreenAction.changed`). */
  readonly changed: readonly string[]
  /** How each declared input was filled. */
  readonly fills: readonly Fill[]
  readonly streaming: boolean
  /** Changes what the screen draws, and tells subscribers. */
  update(change: ScreenUpdate): void
  /** Calls `listener` after every change to `root`, `values` or `faults`. Returns the unsubscribe. */
  subscribe(listener: () => void): () => void
  /** A renderer reports a node it could not draw: a member that threw, a component it does not have. */
  fail(fault: ScreenFault): void
}

/** The validator's words for a structured object where something is drawn. */
const OBJECT_AS_CHILD =
  'a structured object is data, and this is a place where things are drawn — a child, or a ' +
  'list that holds an element. Pass it to the prop that takes it'

/**
 * The validator's words for an object that is no element, binding or structured object. The walk
 * passes none, as a renderer would hand it to a member unread.
 */
const PLAIN_OBJECT =
  'a binding is `{ "$": "anInput" }`, an element is `{ "component": … }`, and a plain object, ' +
  'such as a column or an option, is written `{ "$object": { … } }`'

/** The words for a value JSON cannot say, which only a document built in code holds. */
const NOT_JSON = 'a screen document holds only what JSON says, and this is no JSON value'

/**
 * What a named control holds when nothing gives it a value, read from its form prop's type: `null`
 * where the type admits it (a Select's empty choice), an empty list for a list, `false` where it
 * admits a boolean, and empty text where it admits text. `undefined` for any other type, which
 * leaves the control out of `values`.
 */
function emptyOf(type: string): JsonValue | undefined {
  const parts = unionParts(type)
  if (parts.includes('null')) return null
  if (
    parts.length > 0 &&
    parts.every((part) => /\[\]$|^(?:readonly |Readonly)?Array</.test(part))
  ) {
    return []
  }
  // The checker prints `boolean` as `false | true`.
  if (parts.includes('boolean') || parts.includes('false')) return false
  if (parts.includes('string')) return ''
  return undefined
}

/** A type a member draws as a node, beside text. */
const NODE_TYPE = /^(?:React\.)?(?:ReactNode|ReactElement)\b|^JSX\.Element\b/

/** Whether a prop takes free text, where a half-written string reads as what it will say. */
const takesText = (prop: TableProp): boolean =>
  !ADDRESS_KEYS.has(prop.name) &&
  unionParts(prop.type).some((part) => part === 'string' || NODE_TYPE.test(part))

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** Sets a key as the object's own, `__proto__` included. */
function own(target: Record<string, unknown>, key: string, value: unknown): void {
  Object.defineProperty(target, key, {
    value,
    enumerable: true,
    writable: true,
    configurable: true,
  })
}

/** An input as the document declares it, read from a document that may not be lawful or whole. */
interface Input {
  name: string
  type: string
  /** Its place among the document's inputs, for a fault's path. */
  at: number
}

function inputsOf(document: unknown): Input[] {
  const inputs = isRecord(document) ? document['inputs'] : undefined
  if (!Array.isArray(inputs)) return []
  return inputs.flatMap((input, at): Input[] =>
    isRecord(input) && typeof input['name'] === 'string' && typeof input['type'] === 'string'
      ? [{ name: input['name'], type: input['type'], at }]
      : [],
  )
}

/** What a declared type says, read once for each type a screen meets. */
interface TypeReading {
  /** Whether it is a callback. */
  callback: boolean
  /** A callback's `Fill` words. */
  words: string
  /** Whether a callback is declared to return a promise. */
  promise: boolean
}

function readType(type: string): TypeReading {
  const callback = isCallback(type)
  return {
    callback,
    words: callback ? callbackFill(type) : '',
    promise: callback && /^Promise</.test(returnTypeOf(type)),
  }
}

/**
 * The value of a `Drawn`, with each node drawn by `materials.node`: what a
 * renderer passes as a prop or a child. A binding is its value unless
 * `materials.binding` draws it, and a fault is `null` unless `materials.fault`
 * does.
 */
export interface Materials<Node> {
  node: (node: ScreenNode) => Node
  binding?: (path: string, value: unknown) => unknown
  fault?: (fault: ScreenFault) => unknown
}

export function materialize<Node>(drawn: Drawn, materials: Materials<Node>): unknown {
  switch (drawn.kind) {
    case 'value':
      return drawn.value
    case 'node':
      return materials.node(drawn.node)
    case 'list':
      return drawn.items.map((item) => materialize(item, materials))
    case 'record': {
      const out: Record<string, unknown> = {}
      for (const [key, field] of Object.entries(drawn.fields)) {
        own(out, key, materialize(field, materials))
      }
      return out
    }
    case 'binding':
      return materials.binding === undefined
        ? drawn.value
        : materials.binding(drawn.path, drawn.value)
    case 'fault':
      return materials.fault === undefined ? null : materials.fault(drawn.fault)
  }
}

/* -------------------------------------------------------------------------- */
/* Equality, so a node that did not change keeps its object                   */
/* -------------------------------------------------------------------------- */

/** Containers the walk built from the document, compared by content; anything else is compared by identity. */
const BUILT = new WeakSet<object>()

function sameContent(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false
  if (!BUILT.has(a) || !BUILT.has(b)) return false
  if (Array.isArray(a)) {
    return (
      Array.isArray(b) && a.length === b.length && a.every((item, at) => sameContent(item, b[at]))
    )
  }
  const keys = Object.keys(a)
  return (
    !Array.isArray(b) &&
    keys.length === Object.keys(b).length &&
    keys.every(
      (key) =>
        Object.prototype.hasOwnProperty.call(b, key) &&
        sameContent((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]),
    )
  )
}

/** Whether two elements declare the same exception: its rung and its reason, the two fields it has. */
function sameException(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true
  if (!isRecord(a) || !isRecord(b)) return false
  return Object.is(a['rung'], b['rung']) && Object.is(a['because'], b['because'])
}

function sameDrawn(a: Drawn | undefined, b: Drawn | undefined): boolean {
  if (a === undefined || b === undefined) return a === b
  if (a.kind !== b.kind) return false
  switch (a.kind) {
    case 'value': {
      const other = b as typeof a
      return a.from === other.from && sameContent(a.value, other.value)
    }
    case 'node':
      return a.node === (b as typeof a).node
    case 'list': {
      const other = b as typeof a
      return (
        a.items.length === other.items.length &&
        a.items.every((item, at) => sameDrawn(item, other.items[at]))
      )
    }
    case 'record':
      return sameFields(a.fields, (b as typeof a).fields)
    case 'binding': {
      const other = b as typeof a
      return a.path === other.path && Object.is(a.value, other.value)
    }
    case 'fault': {
      const other = b as typeof a
      return a.fault.path === other.fault.path && a.fault.message === other.fault.message
    }
  }
}

function sameFields(a: Readonly<Record<string, Drawn>>, b: Readonly<Record<string, Drawn>>) {
  const keys = Object.keys(a)
  return (
    keys.length === Object.keys(b).length &&
    keys.every((key) => Object.prototype.hasOwnProperty.call(b, key) && sameDrawn(a[key], b[key]))
  )
}

function sameNode(a: ScreenNode, b: ScreenNode): boolean {
  return (
    a.component === b.component &&
    a.key === b.key &&
    a.fault?.message === b.fault?.message &&
    sameException(a.element.exception, b.element.exception) &&
    sameFields(a.props, b.props) &&
    a.children.length === b.children.length &&
    a.children.every((child, at) => sameDrawn(child, b.children[at]))
  )
}

/* -------------------------------------------------------------------------- */
/* The screen                                                                 */
/* -------------------------------------------------------------------------- */

type Handler = (...args: unknown[]) => unknown

/**
 * What a reader chose for a controlled prop, with the value the document or the host held, the
 * component and the control's name when they did. A change to any of the three lets it go.
 */
interface Choice {
  value: unknown
  basis: Drawn | undefined
  component: string
  name: string | null
}

const faultKey = (fault: ScreenFault) => `${fault.path}\u0000${fault.message}`

/**
 * Whether a value is an element, or a list or a structured object with an element in it, down to
 * `MAX_DEPTH` levels below it.
 */
function holdsElement(value: unknown, depth = 0): boolean {
  if (depth > MAX_DEPTH) return false
  if (Array.isArray(value)) return value.some((item) => holdsElement(item, depth + 1))
  if (!isRecord(value)) return false
  if (typeof value['component'] === 'string') return true
  const fields = value['$object']
  return isRecord(fields) && Object.values(fields).some((item) => holdsElement(item, depth + 2))
}

/** A named control the walk reached: where, in what order, its name and value, and whether the reader chose it. */
interface Named {
  order: number
  path: string
  component: string
  name: string
  value: JsonValue | undefined
  chosen: boolean
}

/** The fault's words for an action's arguments that hold more values than one reduction writes. */
const argumentsCut = (name: string): string =>
  `the arguments \`${name}\` was called with hold more than ${MAX_JSON_VALUES} values; the host ` +
  'is told the first of them'

/** The fault's words for a control's value that holds more values than one reduction writes. */
const VALUE_CUT = `the value holds more than ${MAX_JSON_VALUES} values; \`values\` holds the first of them`

/**
 * Whether two documents say the same: the same object, or the same JSON. A
 * document is at most `MAX_DEPTH` deep, so its JSON is cheap; one that cannot
 * be written as JSON differs.
 */
function sameDocument(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true
  try {
    return JSON.stringify(a) === JSON.stringify(b)
  } catch {
    return false
  }
}

/** The prop that holds a control's default: `defaultValue` for `value`. */
const defaultProp = (prop: string) => `default${prop.charAt(0).toUpperCase()}${prop.slice(1)}`

/** Whether a path is the other or inside it: `$.root.children[1].props` is within `$.root.children[1]`. */
const within = (path: string, outer: string): boolean =>
  path === outer || path.startsWith(`${outer}.`) || path.startsWith(`${outer}[`)

export function createScreen(options: ScreenOptions): Screen {
  const vocabulary = options.vocabulary
  const framework = options.framework ?? DEFAULT_FRAMEWORK
  const allowed = allowedMembers(vocabulary, {
    framework,
    ...(options.members === undefined ? {} : { members: options.members }),
  })
  const fillMode = options.fill ?? 'absent'
  const state = {
    document: options.document,
    data: options.data ?? {},
    streaming: options.streaming ?? false,
    open: options.open ?? null,
    cut: options.cut ?? null,
    onAction: options.onAction,
    onFault: options.onFault,
  }

  let inputs = new Map<string, Input>()
  let inputValues = new Map<string, unknown>()
  /** The callback inputs, by name, with what their types say. */
  let callbacks = new Map<string, TypeReading>()
  let fills: Fill[] = []
  /** Each sample, by input and type, so a sampled list is the same list in every drawing. */
  const samples = new Map<string, unknown>()
  /** What each declared type says, by its text: a type is read once, not on each drawing. */
  const readings = new Map<string, TypeReading>()
  /**
   * Each callback input's action, by its name and the type of the callback that receives it: one
   * function for the screen's life.
   */
  const actions = new Map<string, Handler>()
  /** Each question's stub, by the type of the callback that receives it. */
  const questions = new Map<string, Handler>()
  /**
   * Each control's handler and each stub, by `path#component#prop`: one function while a node of
   * that component is there.
   */
  const handlers = new Map<string, Handler>()
  const chosen = new Map<string, Choice>()
  let bases = new Map<string, Drawn | undefined>()
  let bound = new Map<string, unknown>()
  let previous = new Map<string, ScreenNode>()
  let root: ScreenNode | null = null
  let walked: ScreenFault[] = []
  let reported: { fault: ScreenFault; node: ScreenNode | undefined }[] = []
  let values: Record<string, JsonValue> = {}
  let changed: string[] = []
  /** The faults told in this drawing, by path and message. */
  let told = new Set<string>()
  /** The elements drawn while the document streams, by `path#component`: each stays drawn. */
  let drawnBefore = new Set<string>()
  const listeners = new Set<() => void>()

  /**
   * The action a callback receiver that returns nothing is handed for a callback input: it tells
   * the host, and hands the member the host's promise. Without one, it answers a promise of
   * nothing where the receiver or the input returns a promise, and nothing otherwise.
   */
  const action = (name: string, receiver: string): Handler => {
    const key = `${name}\u0000${receiver}`
    let made = actions.get(key)
    if (made === undefined) {
      const promised = /^Promise</.test(returnTypeOf(receiver))
      made = (...args: unknown[]) => {
        const reduced = reduceArguments(args)
        if (reduced.cut) tellOnce({ path: '$', message: argumentsCut(name) })
        const answer = state.onAction?.({
          name,
          args: reduced.json,
          values: { ...values },
          changed: [...changed],
        })
        if (isThenable(answer)) return answer
        return promised || callbacks.get(name)?.promise === true
          ? Promise.resolve(undefined)
          : undefined
      }
      actions.set(key, made)
    }
    return made
  }

  /** The stub a callback receiver that returns a value is handed: it answers by the receiver's type. */
  const question = (receiver: string): Handler => {
    let made = questions.get(receiver)
    if (made === undefined) {
      made = stubFor(receiver).stub
      questions.set(receiver, made)
    }
    return made
  }

  const fill = (found: ScreenFault[]) => {
    const declared = inputsOf(state.document)
    inputs = new Map(declared.map((input) => [input.name, input]))
    inputValues = new Map()
    callbacks = new Map()
    fills = []
    for (const { name, type, at } of declared) {
      // A type longer than any screen needs is not read: the input is data with no value.
      if (type.length > MAX_TYPE_LENGTH) {
        found.push({ path: `$.inputs[${at}].type`, message: typeTooLong(name, type.length) })
        fills.push({ name, type, from: 'absent' })
        continue
      }
      let reading = readings.get(type)
      if (reading === undefined) {
        reading = readType(type)
        readings.set(type, reading)
      }
      if (reading.callback) {
        callbacks.set(name, reading)
        fills.push({ name, type, from: 'stub', value: reading.words })
      } else if (Object.prototype.hasOwnProperty.call(state.data, name)) {
        inputValues.set(name, state.data[name])
        fills.push({ name, type, from: 'data' })
      } else if (fillMode === 'sample') {
        const key = `${name}\u0000${type}`
        if (!samples.has(key)) samples.set(key, sampleOf(name, type))
        const sample = samples.get(key)
        inputValues.set(name, sample)
        fills.push({ name, type, from: 'sample', value: shown(sample) })
      } else {
        fills.push({ name, type, from: 'absent' })
      }
    }
  }

  /** A handler made once for its key while its node is there, which reads the screen as it is when called. */
  const handler = (key: string, make: () => Handler, live: Set<string>): Handler => {
    live.add(key)
    let made = handlers.get(key)
    if (made === undefined) {
      made = make()
      handlers.set(key, made)
    }
    return made
  }

  const notify = () => {
    for (const listener of [...listeners]) listener()
  }

  /** Resolves the document as it is now. */
  const resolve = () => {
    const found: ScreenFault[] = []
    fill(found)
    const nodes = new Map<string, ScreenNode>()
    const nextBases = new Map<string, Drawn | undefined>()
    const nextBound = new Map<string, unknown>()
    const live = new Set<string>()
    /** Each named control the walk reaches, with its place in document order (`order`). */
    const named: Named[] = []
    /** The next node's place in document order: an element before what its props and children hold. */
    let order = 0
    const { streaming, open } = state
    const cut = streaming ? state.cut : null

    const drawnNow = new Set<string>()

    /**
     * Where the text ends in a value written at `at`: in a place that holds an
     * element (an element, or a list or a structured object with an element
     * among its items or fields, at any depth), where it is an element being
     * written (`element`); in data (`data`); or not inside the value (`null`).
     */
    const cutIn = (value: unknown, at: string): 'element' | 'data' | null => {
      if (cut === null || !within(cut, at)) return null
      let current = value
      let rest = cut.slice(at.length)
      for (;;) {
        if (holdsElement(current)) return 'element'
        if (rest === '') return 'data'
        const step = /^\.([^.[]+)|^\[(\d+)\]/.exec(rest)
        if (step === null) return 'data'
        rest = rest.slice(step[0].length)
        if (step[2] !== undefined) {
          current = Array.isArray(current) ? current[Number(step[2])] : undefined
        } else {
          // A structured object's fields sit at its own path, as the validator writes them.
          const fields =
            isRecord(current) && isRecord(current['$object']) ? current['$object'] : current
          current = isRecord(fields) ? fields[step[1] as string] : undefined
        }
      }
    }

    /**
     * Whether an element is drawn while the document streams. An element drawn
     * before stays drawn. Otherwise it is drawn once every prop it requires is
     * written (a callback the walk stubs aside): whole, or, for a prop that is
     * an element, far enough for that element to be drawn. And the text must
     * end outside it, in its `children`, or in an element one of its props
     * holds: not in a prop's data, and not between its own fields or its props.
     * `depth` is the element's own (`depth.ts`); one deeper than any screen is
     * not drawn.
     */
    const drawable = (element: SpecElement, path: string, depth: number): boolean => {
      if (depth > MAX_DEPTH) return false
      if (cut === null) return true
      const key = `${path}#${element.component}`
      if (drawnBefore.has(key)) return true
      const written = isRecord(element.props) ? element.props : {}
      const required = surfaceOf(vocabulary, element.component)?.props ?? []
      for (const prop of required) {
        if (prop.optional || prop.name === 'children' || isCallback(prop.type)) continue
        if (!Object.prototype.hasOwnProperty.call(written, prop.name)) return false
        const value = written[prop.name]
        const at = `${path}.props.${prop.name}`
        const where = cutIn(value, at)
        if (where === 'data') return false
        // A prop that is an element being written is there once that element is drawn.
        if (
          where === 'element' &&
          isElement(value as SpecValue) &&
          !drawable(value as SpecElement, at, depth + 2)
        ) {
          return false
        }
      }
      if (!within(cut, path) || within(cut, `${path}.children`)) return true
      for (const [name, value] of Object.entries(written)) {
        const where = cutIn(value, `${path}.props.${name}`)
        if (where !== null) return where === 'element'
      }
      return false
    }

    /** Records a fault, and gives what stands for it: the fault where something is drawn, else nothing. */
    const faulted = (fault: ScreenFault, drawn: boolean): Drawn | undefined => {
      found.push(fault)
      return drawn ? { kind: 'fault', fault } : undefined
    }

    /**
     * A value of the document, resolved. `drawn` says it is where things are
     * drawn (a child, or a list that holds an element), `text` that a string
     * still being written reads there as what it will say, `depth` is how many
     * objects and lists hold the value (`depth.ts`), and `receiver` is the type
     * of the prop, item or field that receives it (`receivers.ts`), which
     * `optional` says may be left out.
     */
    const resolveValue = (
      written: unknown,
      path: string,
      drawn: boolean,
      text: boolean,
      depth: number,
      receiver: Receiver,
      optional = false,
    ): Drawn | undefined => {
      const value = written as SpecValue
      if (typeof value === 'object' && value !== null && depth > MAX_DEPTH) {
        return faulted({ path, message: TOO_DEEP }, drawn)
      }
      // Data still being written arrives when it is whole. Where things are drawn, text arrives as
      // it is written.
      if (!drawn && cutIn(value, path) === 'data') return undefined
      if (Array.isArray(value)) {
        const holds = drawn || value.some((item) => !Array.isArray(item) && isElement(item))
        const item = itemOf(vocabulary, receiver)
        const items: Drawn[] = []
        value.forEach((written, at) => {
          const resolved = resolveValue(written, `${path}[${at}]`, holds, holds, depth + 1, item)
          if (resolved !== undefined) items.push(resolved)
        })
        if (holds || items.some((item) => item.kind !== 'value')) return { kind: 'list', items }
        const plain = items.map((item) => (item as { value: unknown }).value)
        BUILT.add(plain)
        return { kind: 'value', value: plain, from: 'document' }
      }
      if (isBinding(value)) return bindingAt(value.$, path, drawn, receiver, optional)
      if (isObjectValue(value)) {
        if (drawn) return faulted({ path, message: OBJECT_AS_CHILD }, true)
        if (!isRecord(value.$object)) return faulted({ path, message: PLAIN_OBJECT }, false)
        const fields: Record<string, Drawn> = {}
        for (const [key, item] of Object.entries(value.$object)) {
          // A key longer than any a member reads is not read: every path below it would carry it.
          if (key.length > MAX_KEY_LENGTH) {
            found.push({ path, message: keyTooLong(key.length) })
            continue
          }
          // A structured object's fields sit at its own path, as the validator writes them.
          const at = `${path}.${key}`
          const field = fieldOf(vocabulary, receiver, key)
          // An element is drawn only in a field that takes a node: one the type declares as data,
          // or does not declare, no member draws, and a control there would hold a value unseen. A
          // field that takes data only loses every element below it, at any depth, and keeps its
          // data; one of a named object type is read field by field below.
          let held: unknown = item
          if (field !== null && !takesNode(vocabulary, field?.type ?? 'never')) {
            const type = objectName(vocabulary, receiver)
            const message = field === undefined ? undeclaredField(key, type) : dataField(key, type)
            if (holdsData(vocabulary, field)) {
              const kept = withoutElements(item)
              if (kept.removed) found.push({ path: at, message })
              if (kept.value === undefined) continue
              held = kept.value
            } else if (elementIn(item)) {
              found.push({ path: at, message })
              continue
            }
          }
          let resolved = resolveValue(
            held,
            at,
            false,
            false,
            depth + 2,
            field?.type ?? null,
            field?.optional ?? false,
          )
          if (resolved !== undefined && ADDRESS_KEYS.has(key)) {
            resolved = address(resolved, held, at, key)
          }
          if (resolved === undefined) continue
          own(fields, key, resolved)
        }
        const entries = Object.entries(fields)
        if (entries.some(([, field]) => field.kind !== 'value')) return { kind: 'record', fields }
        const plain: Record<string, unknown> = {}
        for (const [key, field] of entries) {
          const fieldValue = (field as { value: unknown }).value
          if (fieldValue !== undefined) own(plain, key, fieldValue)
        }
        BUILT.add(plain)
        return { kind: 'value', value: plain, from: 'document' }
      }
      if (isElement(value)) {
        const made = drawable(value, path, depth) ? node(value, path, depth) : null
        return made === null ? undefined : { kind: 'node', node: made }
      }
      // An object of no form the format has is passed nowhere: a member would read it unchecked.
      if (isRecord(value)) return faulted({ path, message: PLAIN_OBJECT }, drawn)
      if (value !== null && !['string', 'number', 'boolean'].includes(typeof value)) {
        return value === undefined ? undefined : faulted({ path, message: NOT_JSON }, drawn)
      }
      // A string still being written is drawn only where it reads as what it will say.
      if (typeof value === 'string' && path === open && !text) return undefined
      return { kind: 'value', value, from: 'document' }
    }

    /**
     * A binding's value, by what receives it. A callback input is the screen's
     * own function: the action where a callback that returns nothing receives
     * it, and a fault anywhere a callback does not. A callback that returns a
     * value is a question no document can answer at run time: where it may be
     * left out, nothing is passed and the member answers it as it does by
     * default; where it is required, a stub answers by its return type. The
     * host is told of neither. A function the host's data holds is never handed
     * on as itself. Anything else is the host's data, or, where things are
     * drawn, the binding with its value.
     */
    const bindingAt = (
      binding: string,
      path: string,
      drawn: boolean,
      receiver: Receiver,
      optional: boolean,
    ): Drawn | undefined => {
      const head = binding.split('.')[0] ?? binding
      if (binding === head && callbacks.has(head)) {
        const kind = callbackOf(vocabulary, receiver)
        if (kind === null || receiver === null) {
          return faulted({ path, message: unreceivedCallback(head) }, drawn)
        }
        if (kind === 'question' && optional) return undefined
        const handed = kind === 'action' ? action(head, receiver) : question(receiver)
        return { kind: 'value', value: handed, from: 'screen' }
      }
      const target = valueAt(binding, inputValues)
      if (typeof target === 'function') {
        return faulted({ path, message: functionInData(binding) }, drawn)
      }
      if (drawn) return { kind: 'binding', path: binding, value: target }
      return { kind: 'value', value: target, from: 'data' }
    }

    /**
     * What is passed at a key that takes an address (`ADDRESS_KEYS`), from the
     * document or the host's data: text that is an address a screen may hold,
     * or a flat list of such text. Anything else is a fault, and nothing is
     * passed (`urls.ts`). No value (`undefined`, or `null` in the host's data)
     * is passed as no value.
     */
    const address = (
      resolved: Drawn,
      written: unknown,
      path: string,
      key: string,
    ): Drawn | undefined => {
      if (resolved.kind === 'value') {
        if (resolved.value === undefined) return resolved
        if (resolved.value === null && resolved.from === 'data') {
          return { kind: 'value', value: undefined, from: 'data' }
        }
      }
      const faults = addressFaults(key, resolved.kind === 'value' ? resolved.value : written, path)
      if (faults.length === 0) return resolved
      found.push(...faults)
      return undefined
    }

    const node = (element: SpecElement, path: string, depth: number): ScreenNode | null => {
      const { component } = element
      // Its place in document order, before anything its props and children hold.
      const place = order
      order += 1
      // The named controls registered from here on are those its props and children hold.
      const mark = named.length
      const surface = surfaceOf(vocabulary, component)
      // An element's props, children and exception sit one level below it.
      const holdsDeeper =
        depth + 1 > MAX_DEPTH &&
        (isRecord(element.props) || Array.isArray(element.children) || isRecord(element.exception))
      const why = nodeFault(surface, component) ?? (holdsDeeper ? TOO_DEEP : null)
      if (why !== null) {
        const fault: ScreenFault = { path, message: why, component }
        found.push(fault)
        return kept({
          path,
          key: path,
          component,
          element,
          member: surface?.member ?? null,
          part: surface?.part ?? null,
          props: {},
          children: [],
          fault,
          childrenKind: null,
        })
      }
      const known = surface as ScreenSurface
      const types = new Map(known.props.map((prop) => [prop.name, prop]))
      const written = isRecord(element.props) ? element.props : {}
      const props: Record<string, Drawn> = {}
      // The prop a named control's value is in: `value`, or a checkbox's `checked`.
      const formProp = formPropOf(known)

      /** The props whose address was refused, and whose binding the host's data leaves empty. */
      const refused = new Set<string>()
      const empty = new Set<string>()
      for (const [name, value] of Object.entries(written)) {
        if (name.length > MAX_KEY_LENGTH) {
          found.push({ path, component, message: keyTooLong(name.length) })
          continue
        }
        const at = `${path}.props.${name}`
        const prop = types.get(name)
        if (prop === undefined) {
          found.push({ path: at, component, message: `\`${component}\` has no prop \`${name}\`` })
          continue
        }
        if (name === 'children') continue
        // A control's name still being written is another name, so it arrives whole.
        const text = takesText(prop) && !(name === 'name' && formProp !== null)
        let resolved = resolveValue(value, at, false, text, depth + 2, prop.type, prop.optional)
        if (resolved !== undefined && ADDRESS_KEYS.has(name)) {
          resolved = address(resolved, value, at, name)
          if (resolved === undefined) refused.add(name)
        }
        if (resolved === undefined) continue
        // A callback is a function the screen makes, or nothing: a member calls what it is given.
        if (
          isCallback(prop.type) &&
          !(
            resolved.kind === 'value' &&
            (resolved.value === undefined ||
              resolved.value === null ||
              typeof resolved.value === 'function')
          )
        ) {
          found.push({
            path: at,
            component,
            message: `\`${name}\` takes a function: bind it to an input whose type is one`,
          })
          continue
        }
        if (resolved.kind === 'value' && resolved.value === undefined) {
          // A required prop bound to a declared data input the host gave no value for. A binding to
          // an input the document does not declare is the validator's fault, and a sample is what
          // a picture asked for.
          const binding = isBinding(value) ? value.$ : ''
          const head = binding.split('.')[0] ?? ''
          // A data input, read from what `fill` read of the inputs: a callback is the screen's.
          const data = inputs.has(head) && !callbacks.has(head)
          if (data) empty.add(name)
          if (!prop.optional && !streaming && fillMode === 'absent' && data) {
            found.push({
              path: at,
              component,
              message: `\`${component}\` requires \`${name}\`, and the host's data holds nothing at \`${binding}\``,
            })
          }
          continue
        }
        // A prop that takes one element, which its member reads (a trigger it clones), is handed
        // a drawn element or nothing: a fault or a value in its place would be read as one.
        if (
          takesElement(vocabulary, prop.type) &&
          !(resolved.kind === 'node' && resolved.node.fault === null)
        ) {
          if (resolved.kind !== 'node') {
            found.push({ path: at, component, message: notOneElement(name) })
          }
          continue
        }
        own(props, name, resolved)
      }

      // An element is drawn once every prop it requires has a value, as it is drawn while it
      // streams once every prop it requires is written: a member drawn without one is drawn empty
      // or unnamed. A callback is stubbed below, and `children` are no prop here. Two are drawn
      // without the value. An address refused: the element's words are still read, and it is
      // inert. A binding the host's data leaves empty: data arrives after a screen is first drawn,
      // and a screen that keeps its shape while it fills surprises a host less than one whose
      // parts appear, or whose whole page waits on one field (a fault says what is empty).
      const lacking = known.props.find((prop) => {
        if (prop.optional || prop.name === 'children' || isCallback(prop.type)) return false
        // A slot (a prop that takes any node) is no prop a reader needs to use the element: an
        // empty one leaves the element drawn, as a page is drawn around a slot whose member is a
        // fault. A prop that takes one element is read by its member, which cannot be drawn
        // without it, as FormField cannot without its child.
        const one = takesElement(vocabulary, prop.type)
        if (takesNode(vocabulary, prop.type) && !one) return false
        if (refused.has(prop.name) || (empty.has(prop.name) && !one)) return false
        const given = props[prop.name]
        return given === undefined || (given.kind === 'node' && given.node.fault !== null)
      })
      if (lacking !== undefined) {
        // What its props hold is not drawn either, so holds no value.
        named.length = mark
        // While it streams, it is left out until the value arrives; once whole, it is a fault.
        if (streaming) return null
        const fault: ScreenFault = {
          path,
          component,
          message: Object.prototype.hasOwnProperty.call(written, lacking.name)
            ? `\`${component}\` is not drawn, as its required prop \`${lacking.name}\` has no value`
            : `\`${component}\` is missing its required prop \`${lacking.name}\``,
        }
        found.push(fault)
        return kept({
          path,
          key: path,
          component,
          element,
          member: known.member,
          part: known.part,
          props: {},
          children: [],
          fault,
          childrenKind: null,
        })
      }

      // A control follows the reader: the value the reader chose stands until the document or the
      // host gives the prop another, or the control is another component or has another name.
      const name = props['name']
      const formName =
        formProp !== null &&
        name?.kind === 'value' &&
        typeof name.value === 'string' &&
        name.value !== ''
          ? name.value
          : null
      for (const [prop, event] of Object.entries(known.controlled)) {
        const key = `${path}#${prop}`
        const basis = props[prop]
        nextBases.set(key, basis)
        const choice = chosen.get(key)
        if (
          choice !== undefined &&
          (choice.component !== component ||
            choice.name !== formName ||
            !sameDrawn(choice.basis, basis))
        ) {
          chosen.delete(key)
        }
        const current = chosen.get(key)
        if (current !== undefined && basis !== undefined) {
          own(props, prop, { kind: 'value', value: current.value, from: 'screen' })
        }
        // A named control the document gives no value keeps the reader's choice as its default, so
        // a member drawn again (a dialog's field, opened again) starts from what `values` holds.
        const fallback = defaultProp(prop)
        if (
          current !== undefined &&
          basis === undefined &&
          prop === formProp &&
          formName !== null &&
          types.has(fallback)
        ) {
          own(props, fallback, { kind: 'value', value: current.value, from: 'screen' })
        }
        const given = props[event]
        nextBound.set(`${path}#${event}`, given?.kind === 'value' ? given.value : undefined)
        // The handler is passed where something needs it: a binding the document wrote, a value to
        // follow, a named control's value to track, or a member that requires the event.
        const needed =
          given !== undefined ||
          basis !== undefined ||
          (prop === formProp && formName !== null) ||
          types.get(event)?.optional === false
        if (!needed) continue
        const eventType = types.get(event)?.type ?? '(value: unknown) => void'
        own(props, event, {
          kind: 'value',
          from: 'screen',
          value: handler(
            `${path}#${component}#${event}`,
            () => change(path, prop, event, eventType),
            live,
          ),
        })
      }
      // What the reader sees in a named control: their choice, else the value the document or the
      // host gives, else the default, else the empty value of the prop's type.
      if (formProp !== null && formName !== null) {
        const choice = chosen.get(`${path}#${formProp}`)
        const read = (prop: string) => {
          const drawn = props[prop]
          return drawn?.kind === 'value' ? drawn.value : undefined
        }
        const given = read(formProp)
        const initial = read(defaultProp(formProp))
        const value =
          choice !== undefined
            ? choice.value
            : given !== undefined
              ? given
              : initial !== undefined
                ? initial
                : emptyOf(types.get(formProp)?.type ?? '')
        let json: JsonValue | undefined
        if (value !== undefined) {
          const reduced = reduceToJson(value)
          json = reduced.json ?? null
          if (reduced.cut) {
            found.push({ path: `${path}.props.${formProp}`, component, message: VALUE_CUT })
          }
        }
        named.push({
          order: place,
          path,
          component,
          name: formName,
          value: json,
          chosen: choice !== undefined,
        })
      }

      // A required callback with nothing to call is stubbed by its return type, and a required
      // callback or slot the document does not give is a fault once the document is whole.
      for (const prop of known.props) {
        if (prop.optional || prop.name === 'children') continue
        const callback = isCallback(prop.type)
        if (!callback && !takesNode(vocabulary, prop.type)) continue
        if (callback && props[prop.name] === undefined) {
          own(props, prop.name, {
            kind: 'value',
            from: 'screen',
            value: handler(
              `${path}#${component}#${prop.name}`,
              () => stubFor(prop.type).stub,
              live,
            ),
          })
        }
        if (!streaming && !Object.prototype.hasOwnProperty.call(written, prop.name)) {
          found.push({
            path,
            component,
            message: `\`${component}\` is missing its required prop \`${prop.name}\``,
          })
        }
      }

      // The children: the element's, or a `children` prop where it has none.
      const childValues: unknown =
        element.children !== undefined
          ? element.children
          : Object.prototype.hasOwnProperty.call(written, 'children') && types.has('children')
            ? [written['children']]
            : undefined
      const children: Drawn[] = []
      if (Array.isArray(childValues)) {
        if (!types.has('children')) {
          found.push({ path, component, message: `\`${component}\` takes no children` })
        } else {
          const base =
            element.children !== undefined ? `${path}.children` : `${path}.props.children`
          const childType = types.get('children')?.type ?? null
          childValues.forEach((child, at) => {
            const where = element.children !== undefined ? `${base}[${at}]` : base
            const resolved = resolveValue(child, where, true, true, depth + 2, childType)
            if (resolved === undefined) return
            // A list inside the children is drawn in its place.
            if (resolved.kind === 'list') children.push(...resolved.items)
            else children.push(resolved)
          })
        }
      }

      // A member that takes one element as its child, and requires it, reads that element (FormField
      // gives its control an id), so it is not drawn without it. While the document streams it
      // waits for the child to be drawn; once whole, a child that is missing, refused or not one
      // element is a fault, and the member is drawn as nothing.
      if (known.childrenKind === 'element' && types.get('children')?.optional === false) {
        const [only, ...more] = children
        if (only?.kind !== 'node' || only.node.fault !== null || more.length > 0) {
          named.length = mark
          if (streaming) return null
          const fault: ScreenFault = {
            path,
            component,
            message:
              children.length === 0 && !Array.isArray(childValues)
                ? `\`${component}\` is missing its required child, one element`
                : `\`${component}\` is not drawn, as it takes one element as its child, and has none it can draw`,
          }
          found.push(fault)
          return kept({
            path,
            key: path,
            component,
            element,
            member: known.member,
            part: known.part,
            props: {},
            children: [],
            fault,
            childrenKind: null,
          })
        }
      }

      return kept({
        path,
        key: formName === null ? path : `${path}#${formName}`,
        component,
        element,
        member: known.member,
        part: known.part,
        props,
        children,
        fault: null,
        childrenKind: known.childrenKind,
      })
    }

    /** Why a component cannot be drawn here, or `null`. */
    const nodeFault = (surface: ScreenSurface | null, component: string): string | null => {
      if (surface === null) return `no component called \`${component}\``
      const disallowed = memberFault(vocabulary, component, allowed)
      if (disallowed !== null) return disallowed
      const entry = surface.entry.frameworks[framework]
      if (entry.status === 'absent') {
        return `\`${surface.member}\` is absent in ${framework}${entry.reason === undefined ? '' : ` — ${entry.reason}`}`
      }
      return null
    }

    /** The node, or the one drawn before at its path when it says the same. */
    const kept = (next: ScreenNode): ScreenNode => {
      const before = previous.get(next.path)
      const node = before !== undefined && sameNode(before, next) ? before : next
      nodes.set(node.path, node)
      drawnNow.add(`${node.path}#${node.component}`)
      return node
    }

    const document = state.document
    const rootElement = isRecord(document) ? document['root'] : undefined
    // The document's own object is the first level, and its root the second.
    root =
      isElement(rootElement as SpecValue) && drawable(rootElement as SpecElement, '$.root', 2)
        ? node(rootElement as SpecElement, '$.root', 2)
        : null
    if (root === null && !streaming) {
      found.push({ path: '$.root', message: 'the document has no root element' })
    }

    // What belonged to nodes that are gone, or that hold another component now, is let go.
    for (const key of [...chosen.keys()]) {
      if (!nextBases.has(key)) chosen.delete(key)
    }
    for (const key of [...handlers.keys()]) if (!live.has(key)) handlers.delete(key)
    reported = reported.filter(
      ({ fault, node: at }) => at === undefined || nodes.get(fault.path) === at,
    )
    // `values` in document order: a name two controls share holds the last of them.
    const held = new Map<string, Named>()
    for (const control of named.sort((a, b) => a.order - b.order)) {
      const at = `${control.path}.props.name`
      if (INHERITED_NAMES.has(control.name)) {
        found.push({
          path: at,
          component: control.component,
          message: inheritedNameFault(control.name),
        })
        continue
      }
      const before = held.get(control.name)
      if (before !== undefined) {
        found.push({
          path: at,
          component: control.component,
          message: sharedNameFault(control.name, before.path),
        })
        held.delete(control.name)
      }
      held.set(control.name, control)
    }
    const nextValues: Record<string, JsonValue> = {}
    const nextChanged: string[] = []
    for (const control of held.values()) {
      if (control.value === undefined) continue
      nextValues[control.name] = control.value
      if (control.chosen) nextChanged.push(control.name)
    }

    previous = nodes
    drawnBefore = streaming ? drawnNow : new Set()
    bases = nextBases
    bound = nextBound
    walked = found
    values = nextValues
    changed = nextChanged
    tell()
  }

  /** The handler a control's change event calls: it records the reader's choice, then calls what the document bound. */
  const change = (path: string, prop: string, event: string, eventType: string): Handler => {
    return (...args: unknown[]) => {
      const key = `${path}#${prop}`
      const node = previous.get(path)
      if (node !== undefined) {
        // A named control's key is its path and its name (`ScreenNode.key`).
        const name =
          node.key !== undefined && node.key !== path ? node.key.slice(path.length + 1) : null
        chosen.set(key, { value: args[0], basis: bases.get(key), component: node.component, name })
        resolve()
      }
      const target = bound.get(`${path}#${event}`)
      const result =
        typeof target === 'function'
          ? (target as Handler)(...args)
          : answerFor(eventType, undefined, args)
      notify()
      return result
    }
  }

  /**
   * Tells the host each fault not yet told in this drawing. A renderer reports a member that
   * throws again for each new node object it draws, and a fault can go and come back while a
   * document streams, so what was told is remembered by path and message until the next drawing.
   */
  const tell = () => {
    for (const fault of [...walked, ...reported.map(({ fault }) => fault)]) tellOnce(fault)
  }

  /** Tells the host a fault, unless it was told in this drawing. */
  const tellOnce = (fault: ScreenFault) => {
    const key = faultKey(fault)
    if (told.has(key)) return
    told.add(key)
    state.onFault?.(fault)
  }

  resolve()

  return {
    get root() {
      return root
    },
    get faults() {
      return [...walked, ...reported.map(({ fault }) => fault)]
    },
    get values() {
      return values
    },
    get changed() {
      return changed
    },
    get fills() {
      return fills
    },
    get streaming() {
      return state.streaming
    },
    update(next) {
      if ('onAction' in next) state.onAction = next.onAction
      if ('onFault' in next) state.onFault = next.onFault
      let dirty = false
      // A whole document that differs from the one drawn is a new drawing, whose faults are told
      // again. One that ends a stream, or that a renderer gives again unchanged, is not.
      const streams = 'streaming' in next ? next.streaming === true : state.streaming
      if (
        'document' in next &&
        !state.streaming &&
        !streams &&
        !sameDocument(state.document, next.document)
      ) {
        told = new Set()
      }
      if ('document' in next) {
        state.document = next.document
        dirty = true
      }
      if ('data' in next) {
        state.data = next.data ?? {}
        dirty = true
      }
      if ('streaming' in next) {
        // A stream that begins is a new drawing: its elements are drawn as they are written again,
        // and its faults are told again.
        if (next.streaming === true && !state.streaming) {
          drawnBefore = new Set()
          told = new Set()
        }
        state.streaming = next.streaming ?? false
        dirty = true
      }
      if ('open' in next) {
        state.open = next.open ?? null
        dirty = true
      }
      if ('cut' in next) {
        state.cut = next.cut ?? null
        dirty = true
      }
      if (!dirty) return
      resolve()
      notify()
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    fail(fault) {
      const key = faultKey(fault)
      if (reported.some(({ fault: known }) => faultKey(known) === key)) return
      reported.push({ fault, node: previous.get(fault.path) })
      tell()
    },
  }
}
