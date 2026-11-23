import { DEFAULT_FRAMEWORK, unionParts, type Framework } from '@polymorph/registry/frameworks'
import type { TableProp } from '@polymorph/registry/screen-table'
import {
  isBinding,
  isElement,
  isObjectValue,
  type SpecElement,
  type SpecValue,
} from '@polymorph/spec/schema'

import { answerFor, isCallback, sampleOf, shown, stubFor, valueAt, type Fill } from './actions'
import { argumentsToJson, toJson, type JsonValue } from './json'
import {
  allowedMembers,
  memberFault,
  surfaceOf,
  type ScreenSurface,
  type ScreenVocabulary,
} from './members'
import { addressFault, addressMessage, ADDRESS_KEYS } from './urls'

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
 *    absent; a picture of the screen asks for a sample instead (`fill`).
 *  - **Callback inputs are actions.** A member that calls one tells the host
 *    `{ name, args, values }` (`onAction`): the input's name, the call's
 *    arguments as JSON, and the values of the named controls. The callback
 *    answers what the host's handler returns where its type allows, and
 *    otherwise by its declared return type.
 *  - **Controls follow the reader.** A controlled prop (`value` with
 *    `onChange`) keeps what the reader last chose until the document or the
 *    host gives it another value. One the document gives no value stays the
 *    member's own, and the screen still knows what the reader chose.
 *  - **`values`** holds each named control's current value as JSON.
 *  - **A required callback** the document does not bind is stubbed by its
 *    return type.
 *  - **Nothing the document says runs.** A component is drawn only if the
 *    vocabulary has it and the host allows it, a prop is passed only if the
 *    member has it, and an address is passed only if it is one a screen may
 *    hold (`urls.ts`).
 *  - **A fault never blanks the screen.** A node that cannot be drawn carries
 *    its fault and is drawn as nothing, or as the fault where the host asks;
 *    every fault reaches the host with its path (`onFault`). A renderer
 *    reports a member that throws with `fail`.
 *  - **Streaming.** While `streaming`, a prop or a callback that has not
 *    arrived is no fault, and the string still being written (`open`, from
 *    `parsePartial`) is drawn only as a child or as a prop that takes free
 *    text. A node whose content did not change keeps its object, so a
 *    renderer redraws only what did.
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

/** What a member's callback tells the host. */
export interface ScreenAction {
  /** The callback input the member called. */
  name: string
  /** The call's arguments as JSON (`json.ts`). */
  args: JsonValue[]
  /** Each named control's current value, by its name. */
  values: Record<string, JsonValue>
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
  /** Told each action. What it returns answers the member, where the callback's type allows (`answerFor`). */
  onAction?: (action: ScreenAction) => unknown
  /** Told each fault once, when it first appears. */
  onFault?: (fault: ScreenFault) => void
}

/** What a host changes on a screen that is drawn. Each field replaces the one it names. */
export type ScreenUpdate = Partial<
  Pick<ScreenOptions, 'document' | 'data' | 'streaming' | 'open' | 'onAction' | 'onFault'>
>

export interface Screen {
  /** What to draw: the root element's node, or `null` before the document has a root. */
  readonly root: ScreenNode | null
  /** Every fault the drawing has now: the walk's, then those renderers reported. */
  readonly faults: readonly ScreenFault[]
  /** Each named control's current value, by its name. */
  readonly values: Readonly<Record<string, JsonValue>>
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
}

function inputsOf(document: unknown): Input[] {
  const inputs = isRecord(document) ? document['inputs'] : undefined
  if (!Array.isArray(inputs)) return []
  return inputs.flatMap((input): Input[] =>
    isRecord(input) && typeof input['name'] === 'string' && typeof input['type'] === 'string'
      ? [{ name: input['name'], type: input['type'] }]
      : [],
  )
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

/** Whether a document's literal is the same JSON in both. */
function sameJson(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false
  return JSON.stringify(a) === JSON.stringify(b)
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
    a.fault?.message === b.fault?.message &&
    sameJson(a.element.exception, b.element.exception) &&
    sameFields(a.props, b.props) &&
    a.children.length === b.children.length &&
    a.children.every((child, at) => sameDrawn(child, b.children[at]))
  )
}

/* -------------------------------------------------------------------------- */
/* The screen                                                                 */
/* -------------------------------------------------------------------------- */

type Handler = (...args: unknown[]) => unknown

/** What a reader chose for a controlled prop, and the value the document or the host held when they did. */
interface Choice {
  value: unknown
  basis: Drawn | undefined
  component: string
}

const faultKey = (fault: ScreenFault) => `${fault.path}\u0000${fault.message}`

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
    onAction: options.onAction,
    onFault: options.onFault,
  }

  let inputs = new Map<string, Input>()
  let inputValues = new Map<string, unknown>()
  let fills: Fill[] = []
  /** Each sample, by input and type, so a sampled list is the same list in every drawing. */
  const samples = new Map<string, unknown>()
  /** Each callback input's action, by name: one function for the screen's life. */
  const actions = new Map<string, Handler>()
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
  let told = new Set<string>()
  const listeners = new Set<() => void>()

  const action = (name: string): Handler => {
    let made = actions.get(name)
    if (made === undefined) {
      made = (...args: unknown[]) => {
        const type = inputs.get(name)?.type ?? '() => void'
        const answer = state.onAction?.({
          name,
          args: argumentsToJson(args),
          values: { ...values },
        })
        return answerFor(type, answer, args)
      }
      actions.set(name, made)
    }
    return made
  }

  const fill = () => {
    const declared = inputsOf(state.document)
    inputs = new Map(declared.map((input) => [input.name, input]))
    inputValues = new Map()
    fills = []
    for (const { name, type } of declared) {
      if (isCallback(type)) {
        inputValues.set(name, action(name))
        fills.push({ name, type, from: 'stub', value: `answers ${stubFor(type).answers}` })
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
    fill()
    const found: ScreenFault[] = []
    const nodes = new Map<string, ScreenNode>()
    const nextBases = new Map<string, Drawn | undefined>()
    const nextBound = new Map<string, unknown>()
    const live = new Set<string>()
    const named: [string, JsonValue][] = []
    const { streaming, open } = state

    const resolveValue = (
      written: unknown,
      path: string,
      drawn: boolean,
      text: boolean,
    ): Drawn | undefined => {
      const value = written as SpecValue
      if (Array.isArray(value)) {
        const holds = drawn || value.some((item) => !Array.isArray(item) && isElement(item))
        const items: Drawn[] = []
        value.forEach((item, at) => {
          const resolved = resolveValue(item, `${path}[${at}]`, holds, holds)
          if (resolved !== undefined) items.push(resolved)
        })
        if (holds || items.some((item) => item.kind !== 'value')) return { kind: 'list', items }
        const plain = items.map((item) => (item as { value: unknown }).value)
        BUILT.add(plain)
        return { kind: 'value', value: plain, from: 'document' }
      }
      if (isBinding(value)) {
        const target = valueAt(value.$, inputValues)
        if (drawn) return { kind: 'binding', path: value.$, value: target }
        const head = value.$.split('.')[0] ?? value.$
        const callback = value.$ === head && actions.get(head) === target && target !== undefined
        return { kind: 'value', value: target, from: callback ? 'screen' : 'data' }
      }
      if (isObjectValue(value)) {
        if (drawn) {
          const fault = { path, message: OBJECT_AS_CHILD }
          found.push(fault)
          return { kind: 'fault', fault }
        }
        const fields: Record<string, Drawn> = {}
        for (const [key, item] of Object.entries(isRecord(value.$object) ? value.$object : {})) {
          const at = `${path}.${key}`
          const resolved = resolveValue(item, at, false, false)
          if (resolved === undefined) continue
          if (ADDRESS_KEYS.has(key) && refused(resolved, at)) continue
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
      if (isElement(value)) return { kind: 'node', node: node(value, path) }
      // A string still being written is drawn only where it reads as what it will say.
      if (typeof value === 'string' && path === open && !text) return undefined
      return { kind: 'value', value, from: 'document' }
    }

    /** Whether an address is refused: a string, or a list of strings, any one of which is not one a screen may hold. */
    const refused = (drawn: Drawn, path: string): boolean => {
      if (drawn.kind !== 'value') return false
      const texts = Array.isArray(drawn.value) ? drawn.value : [drawn.value]
      for (const text of texts) {
        if (typeof text !== 'string') continue
        const why = addressFault(text)
        if (why === null) continue
        found.push({ path, message: addressMessage(text, why) })
        return true
      }
      return false
    }

    const node = (element: SpecElement, path: string): ScreenNode => {
      const { component } = element
      const surface = surfaceOf(vocabulary, component)
      const fault = nodeFault(surface, component)
      if (fault !== null) {
        const faulted: ScreenFault = { path, message: fault, component }
        found.push(faulted)
        return kept({
          path,
          component,
          element,
          member: surface?.member ?? null,
          part: surface?.part ?? null,
          props: {},
          children: [],
          fault: faulted,
        })
      }
      const known = surface as ScreenSurface
      const types = new Map(known.props.map((prop) => [prop.name, prop]))
      const written = isRecord(element.props) ? element.props : {}
      const props: Record<string, Drawn> = {}

      for (const [name, value] of Object.entries(written)) {
        const at = `${path}.props.${name}`
        const prop = types.get(name)
        if (prop === undefined) {
          found.push({ path: at, component, message: `\`${component}\` has no prop \`${name}\`` })
          continue
        }
        if (name === 'children') continue
        const resolved = resolveValue(value, at, false, takesText(prop))
        if (resolved === undefined) continue
        if (ADDRESS_KEYS.has(name) && refused(resolved, at)) continue
        if (resolved.kind === 'value' && resolved.value === undefined) {
          // A required prop bound to a declared data input the host gave no value for. A binding to
          // an input the document does not declare is the validator's fault, and a sample is what
          // a picture asked for.
          const binding = isBinding(value) ? value.$ : ''
          const input = inputs.get(binding.split('.')[0] ?? '')
          if (
            !prop.optional &&
            !streaming &&
            fillMode === 'absent' &&
            input !== undefined &&
            !isCallback(input.type)
          ) {
            found.push({
              path: at,
              component,
              message: `\`${component}\` requires \`${name}\`, and the host's data holds nothing at \`${binding}\``,
            })
          }
          continue
        }
        own(props, name, resolved)
      }

      // A control follows the reader: the value the reader chose stands until the document or the
      // host gives the prop another.
      const formProp =
        'value' in known.controlled ? 'value' : 'checked' in known.controlled ? 'checked' : null
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
          (choice.component !== component || !sameDrawn(choice.basis, basis))
        ) {
          chosen.delete(key)
        }
        const current = chosen.get(key)
        if (current !== undefined && basis !== undefined) {
          own(props, prop, { kind: 'value', value: current.value, from: 'screen' })
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
      if (formProp !== null && formName !== null) {
        const choice = chosen.get(`${path}#${formProp}`)
        const current =
          choice !== undefined
            ? choice.value
            : (props[formProp] as { value?: unknown } | undefined)?.value
        if (current !== undefined) named.push([formName, toJson(current) ?? null])
      }

      // A required callback with nothing to call is stubbed by its return type, and a required prop
      // the document does not give is a fault once the document is whole.
      for (const prop of known.props) {
        if (prop.optional || prop.name === 'children') continue
        if (props[prop.name] === undefined && isCallback(prop.type)) {
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
          childValues.forEach((child, at) => {
            const where = element.children !== undefined ? `${base}[${at}]` : base
            const resolved = resolveValue(child, where, true, true)
            if (resolved === undefined) return
            // A list inside the children is drawn in its place.
            if (resolved.kind === 'list') children.push(...resolved.items)
            else children.push(resolved)
          })
        }
      }

      return kept({
        path,
        component,
        element,
        member: known.member,
        part: known.part,
        props,
        children,
        fault: null,
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
      return node
    }

    const document = state.document
    const rootElement = isRecord(document) ? document['root'] : undefined
    root = isElement(rootElement as SpecValue) ? node(rootElement as SpecElement, '$.root') : null
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
    previous = nodes
    bases = nextBases
    bound = nextBound
    walked = found
    values = Object.fromEntries(named)
    tell()
  }

  /** The handler a control's change event calls: it records the reader's choice, then calls what the document bound. */
  const change = (path: string, prop: string, event: string, eventType: string): Handler => {
    return (...args: unknown[]) => {
      const key = `${path}#${prop}`
      const component = previous.get(path)?.component
      if (component !== undefined) {
        chosen.set(key, { value: args[0], basis: bases.get(key), component })
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

  /** Tells the host each fault that has appeared since it was last told. */
  const tell = () => {
    const now = new Set<string>()
    for (const fault of [...walked, ...reported.map(({ fault }) => fault)]) {
      const key = faultKey(fault)
      now.add(key)
      if (!told.has(key)) state.onFault?.(fault)
    }
    told = now
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
    get fills() {
      return fills
    },
    get streaming() {
      return state.streaming
    },
    update(next) {
      if ('onAction' in next) state.onAction = next.onAction
      if ('onFault' in next) state.onFault = next.onFault
      let changed = false
      if ('document' in next) {
        state.document = next.document
        changed = true
      }
      if ('data' in next) {
        state.data = next.data ?? {}
        changed = true
      }
      if ('streaming' in next) {
        state.streaming = next.streaming ?? false
        changed = true
      }
      if ('open' in next) {
        state.open = next.open ?? null
        changed = true
      }
      if (!changed) return
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
