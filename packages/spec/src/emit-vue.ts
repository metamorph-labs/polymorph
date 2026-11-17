import { FRAMEWORK_VOCABULARY, vueBinding, type VueBinding } from '@polymorph/registry/frameworks'
import type {
  ExceptionPrimitive,
  Registry,
  RegistryComponent,
  RegistryProp,
} from '@polymorph/registry'

import {
  isBinding,
  isElement,
  isObjectValue,
  type ScreenSpec,
  type SpecElement,
  type SpecValue,
} from './schema'

/**
 * Spec to a Vue single-file component.
 *
 * The same screen the React emitter writes, in Vue's terms: a presentational
 * component whose `<script setup lang="ts">` declares the inputs with
 * `defineProps` and whose template composes `@polymorph/vue-ui` members. It
 * holds no state and computes nothing, for the same reason the TSX does not:
 * the spec has no expression language.
 *
 * **Every prop is read through the fixed mapping** (`vueBinding` in
 * `@polymorph/registry/frameworks`, `docs/frameworks.md`), with the type the
 * registry prints for it. A value bound to `onFoo` is the listener `@foo`. A
 * value for a node-typed prop is written into the slot of that name, and
 * `children` into the default slot. Anything else is a prop: static when it is
 * text an attribute can hold verbatim, bound (`:foo`) otherwise. A binding
 * reads the input from `props`, which is what `defineProps` returns, and every
 * input is a prop, callbacks included. A parent passes a callback input either
 * way, as `:onStart` or as `@start`.
 *
 * **An element inside a value** (a structured prop such as `emptyState`, or a
 * list of data) cannot be a slot, because it is not drawn where it is written.
 * It is written as a render call, `h(Button, { … })`, which Vue renders as a
 * node wherever the member draws it.
 *
 * **Text is written as text.** A string goes between tags as written only when
 * Vue reads it back unchanged: no tag or interpolation characters, no entity,
 * no whitespace Vue would condense. Anything else is a string literal in an
 * interpolation, with every character a template or an attribute reads
 * specially escaped, so no text closes the expression it sits in. A run of
 * text and bindings is written on one line with nothing between, because Vue
 * condenses a line break inside text to a space, where React drops it.
 *
 * The caller formats the result with Prettier's Vue parser.
 */

/** The module every emitted Vue screen imports its members from. */
export const VUE_IMPORT_SOURCE = FRAMEWORK_VOCABULARY.vue

/** The React vocabulary, whose type names the Vue vocabulary exports under the same names. */
const REACT_IMPORT_SOURCE = FRAMEWORK_VOCABULARY.react

/**
 * Thrown when the Vue, the Svelte or the Angular emitter is called without the
 * registry it reads prop types from.
 */
export class MissingRegistryError extends Error {
  constructor(readonly framework: 'vue' | 'svelte' | 'angular' = 'vue') {
    super(
      framework === 'vue'
        ? 'The Vue emitter reads each prop’s type from the registry to tell a prop from an event ' +
            'or a slot — pass `registry` with `framework: "vue"`.'
        : framework === 'svelte'
          ? 'The Svelte emitter reads each prop’s type from the registry to tell a prop from a ' +
            'snippet — pass `registry` with `framework: "svelte"`.'
          : 'The Angular emitter reads each prop’s type from the registry to tell an input from ' +
            'an output or a slot — pass `registry` with `framework: "angular"`.',
    )
    this.name = 'MissingRegistryError'
  }
}

interface Walk {
  /** The members the template and the render calls name, by owner. */
  used: Set<string>
  /** Whether a render call was written, so `h` is imported. */
  rendersNodes: boolean
  /** Whether any binding reads `props`. */
  readsProps: boolean
  types: (component: string) => Map<string, RegistryProp> | null
}

/** The SFC, unformatted. `header` is the doc comment the React emitter writes. */
export function vueScreen(spec: ScreenSpec, registry: Registry, header: string): string {
  const walk: Walk = {
    used: new Set(),
    rendersNodes: false,
    readsProps: false,
    types: propTypes(registry),
  }
  const template = elementTag(spec.root, walk, 1)

  const script = [
    '<script setup lang="ts">',
    header,
    ...imports(spec, walk),
    '',
    propsInterface(spec),
    '',
    walk.readsProps
      ? `const props = defineProps<${spec.name}Props>()`
      : `defineProps<${spec.name}Props>()`,
    '</script>',
  ]

  return [...script, '', '<template>', template, '</template>', ''].join('\n')
}

/* -------------------------------------------------------------------------- */
/* The script                                                                 */
/* -------------------------------------------------------------------------- */

/** As the React emitter writes them, from `@polymorph/vue-ui`, and `h` from Vue when needed. */
function imports(spec: ScreenSpec, walk: Walk): string[] {
  // A type the React vocabulary exports is a type the Vue vocabulary exports.
  const declared = new Map<string, Set<string>>()
  for (const [module, names] of Object.entries(spec.types ?? {})) {
    const target = module === REACT_IMPORT_SOURCE ? VUE_IMPORT_SOURCE : module
    declared.set(target, new Set([...(declared.get(target) ?? []), ...names]))
  }
  const inline = [...(declared.get(VUE_IMPORT_SOURCE) ?? [])]
    .filter((name) => !walk.used.has(name))
    .sort()
  const members = [...[...walk.used].sort(), ...inline.map((name) => `type ${name}`)]

  return [
    ...(walk.rendersNodes ? ["import { h } from 'vue'"] : []),
    `import { ${members.join(', ')} } from '${VUE_IMPORT_SOURCE}'`,
    ...[...declared]
      .filter(([module]) => module !== VUE_IMPORT_SOURCE)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([module, names]) => `import type { ${[...names].sort().join(', ')} } from '${module}'`),
  ]
}

function propsInterface(spec: ScreenSpec): string {
  if (spec.inputs.length === 0) return `export interface ${spec.name}Props {}`
  const fields = spec.inputs.flatMap((input) => [
    ...(input.doc === undefined ? [] : [`  /** ${inComment(input.doc)} */`]),
    `  ${input.name}: ${input.type}`,
  ])
  return [`export interface ${spec.name}Props {`, ...fields, '}'].join('\n')
}

/** Prose made safe inside a block comment, as the React emitter makes it. */
const inComment = (text: string) => text.replace(/\*\//g, '*\\/')

/* -------------------------------------------------------------------------- */
/* What a prop is                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Prop name -> its record, for a member, a compound part or a ladder primitive.
 * A part's records are the ones the registry lists under the part (`parts`),
 * named as the part declares them (`onClick` for `Table.Row`), so its reading
 * is the part's own: an `onFoo` prop is an event. The Angular emitter reads a
 * callback's parameters from the record's type.
 */
export function propTypes(
  registry: Registry,
): (component: string) => Map<string, RegistryProp> | null {
  const components = new Map<string, RegistryComponent | ExceptionPrimitive>([
    ...registry.components.map((component) => [component.name, component] as const),
    ...registry.exceptions.primitives.map((primitive) => [primitive.name, primitive] as const),
  ])
  return (name) => {
    const [owner = name, part] = name.split('.')
    const entry = components.get(owner)
    if (entry === undefined) return null
    if (part === undefined) {
      return new Map(
        entry.props.filter((prop) => !prop.name.includes('.')).map((prop) => [prop.name, prop]),
      )
    }
    const parts = 'parts' in entry ? entry.parts : []
    const found = parts.find((candidate) => candidate.name === part)
    return found === undefined ? null : new Map(found.props.map((prop) => [prop.name, prop]))
  }
}

/** The prop's reading in Vue, or the one its name implies when the registry has no record. */
function bindingOf(walk: Walk, component: string, name: string): VueBinding {
  const prop = walk.types(component)?.get(name)
  if (prop !== undefined) return vueBinding(prop)
  return vueBinding({ name, type: 'unknown' })
}

/**
 * How each prop of each member reads, by the fixed mapping: the reading the
 * Svelte emitter shares with this one. A compound part is named as written
 * (`SettingsRow.Group`).
 */
export function bindingReader(registry: Registry): (component: string, name: string) => VueBinding {
  const types = propTypes(registry)
  return (component, name) => {
    const prop = types(component)?.get(name)
    return vueBinding(prop ?? { name, type: 'unknown' })
  }
}

/* -------------------------------------------------------------------------- */
/* The template                                                               */
/* -------------------------------------------------------------------------- */

const pad = (depth: number) => '  '.repeat(depth)

/** The declared exception, as a comment before the deviation. */
function exceptionComment(node: SpecElement): string | null {
  if (node.exception === undefined) return null
  const text = `Rung ${node.exception.rung}, declared: ${node.exception.because}`
  // A comment ends at `-->` (or `--!>`). A backslash breaks the sequence; the
  // comment then reads `--\>`.
  return `<!-- ${text.replace(/--(!?)>/g, '--$1\\>')} -->`
}

/**
 * What goes between an element's tags. A `block` is elements, one to a line at
 * `depth`. An `inline` run is text, interpolations and elements on one line,
 * written flush against the tags around it, because Vue keeps the whitespace
 * beside text that React drops.
 */
interface Body {
  text: string
  inline: boolean
}

/** One element in the template, with its slots and its children. */
function elementTag(node: SpecElement, walk: Walk, depth: number): string {
  walk.used.add(node.component.split('.')[0] ?? node.component)

  const attributes: string[] = []
  const slots: string[] = []
  let defaultSlot: Body | null = null
  for (const [name, value] of Object.entries(node.props ?? {})) {
    const binding = bindingOf(walk, node.component, name)
    if (binding.kind === 'event') {
      attributes.push(`@${binding.name}="${expression(value, walk)}"`)
    } else if (binding.kind === 'slot' && binding.name === 'default') {
      defaultSlot = slotBody(value, walk, depth + 1)
    } else if (binding.kind === 'slot') {
      if (value === null || typeof value === 'boolean') continue // React draws nothing.
      if (isObjectValue(value)) attributes.push(`:${name}="${expression(value, walk)}"`)
      else slots.push(namedSlot(binding.name, null, slotBody(value, walk, depth + 2), depth + 1))
    } else if (binding.kind === 'scoped-slot' && isBinding(value)) {
      // A render prop handed in as an input: the slot calls it with its props.
      const call = `${expression(value, walk)}(slot)`
      const body = { text: `${pad(depth + 2)}<component :is="${call}" />`, inline: false }
      slots.push(namedSlot(binding.name, 'slot', body, depth + 1))
    } else if (binding.kind === 'scoped-slot') {
      slots.push(namedSlot(binding.name, null, slotBody(value, walk, depth + 2), depth + 1))
    } else {
      attributes.push(attribute(name, value, walk))
    }
  }

  const children = node.children ?? []
  if (children.length > 0) defaultSlot = drawn(children, walk, depth + 1)
  if (defaultSlot?.text === '') defaultSlot = null

  const open =
    attributes.length === 0 ? `<${node.component}` : `<${node.component} ${attributes.join(' ')}`
  const close = `</${node.component}>`
  const comment = exceptionComment(node)
  const head = comment === null ? [] : [`${pad(depth)}${comment}`]

  if (slots.length === 0 && defaultSlot === null) {
    return [...head, `${pad(depth)}${open} />`].join('\n')
  }
  if (slots.length === 0 && defaultSlot?.inline) {
    return [...head, `${pad(depth)}${open}>${defaultSlot.text}${close}`].join('\n')
  }
  // Named slots, one to a line, then the default slot's content. An inline run
  // follows the last slot directly, so no line break becomes a space.
  const inner = slots.join('\n')
  const rest =
    defaultSlot === null
      ? `${inner}\n${pad(depth)}${close}`
      : defaultSlot.inline
        ? `${inner}${defaultSlot.text}${close}`
        : `${[inner, defaultSlot.text].filter((part) => part !== '').join('\n')}\n${pad(depth)}${close}`
  return [...head, `${pad(depth)}${open}>\n${rest}`].join('\n')
}

function namedSlot(name: string, scope: string | null, body: Body, depth: number): string {
  const directive = scope === null ? `#${name}` : `#${name}="${scope}"`
  if (body.inline) return `${pad(depth)}<template ${directive}>${body.text}</template>`
  return [`${pad(depth)}<template ${directive}>`, body.text, `${pad(depth)}</template>`].join('\n')
}

/** A prop's value written into a slot: the same as children. */
function slotBody(value: SpecValue, walk: Walk, depth: number): Body {
  return drawn(Array.isArray(value) ? value : [value], walk, depth)
}

/**
 * Children, in the default slot or a named one. Elements alone go one to a
 * line, and Vue drops the line breaks between them as React does. Children
 * that hold any text, number or binding are an inline run.
 */
function drawn(items: SpecValue[], walk: Walk, depth: number): Body {
  const flat = (items.flat(Infinity as 1) as SpecValue[]).filter(
    (item) => item !== null && typeof item !== 'boolean',
  )
  if (flat.every((item) => isElement(item))) {
    const text = flat.map((item) => elementTag(item as SpecElement, walk, depth)).join('\n')
    return { text, inline: false }
  }

  let afterText = false
  const parts = flat.map((item) => {
    if (typeof item === 'string') {
      // A string after a string is its own node in React; here it is an
      // interpolation, which never merges with the text before it.
      const literal = isLiteralText(item) && !afterText
      afterText = literal
      return literal ? item : `{{ ${jsString(item)} }}`
    }
    afterText = false
    if (isElement(item)) return elementTag(item, walk, 0).replace(/\n\s*/g, '')
    if (isBinding(item)) return `{{ ${binding(item.$, walk)} }}`
    return `{{ ${JSON.stringify(item)} }}`
  })
  return { text: parts.join(''), inline: true }
}

/**
 * Whether text can be written between tags unchanged: words separated by single
 * spaces, with nothing a template reads as a tag, an interpolation or an entity.
 */
function isLiteralText(text: string): boolean {
  return /^[^\s<>{}&]+( [^\s<>{}&]+)*$/.test(text)
}

/** `title="Inbox"`, `:columns="4"`, `:value="props.query"`. */
function attribute(name: string, value: SpecValue, walk: Walk): string {
  if (typeof value === 'string' && /^[^"&<>\r\n]*$/.test(value)) return `${name}="${value}"`
  return `:${name}="${expression(value, walk)}"`
}

/** `props.summary.open.label`: an input, read from what `defineProps` returns. */
function binding(path: string, walk: Walk): string {
  walk.readsProps = true
  return `props.${path}`
}

/* -------------------------------------------------------------------------- */
/* Values, as the expressions a template attribute holds                      */
/* -------------------------------------------------------------------------- */

/**
 * A value as an expression inside a double-quoted attribute or an
 * interpolation. Strings are single-quoted, so no `"` appears; elements become
 * render calls.
 */
function expression(value: SpecValue, walk: Walk): string {
  if (Array.isArray(value)) return `[${value.map((item) => expression(item, walk)).join(', ')}]`
  if (isElement(value)) return renderCall(value, walk)
  if (isBinding(value)) return binding(value.$, walk)
  if (isObjectValue(value)) {
    const fields = Object.entries(value.$object).map(
      ([key, item]) => `${quoteKey(key)}: ${expression(item, walk)}`,
    )
    return fields.length === 0 ? '{}' : `{ ${fields.join(', ')} }`
  }
  if (typeof value === 'string') return jsString(value)
  return JSON.stringify(value)
}

/**
 * An element where a value goes: `h(Member, props, slots)`. Props keep their
 * React names here, because a render call's listener for `click` is `onClick`.
 * Slots are functions, as a render call takes them.
 */
function renderCall(node: SpecElement, walk: Walk): string {
  walk.rendersNodes = true
  walk.used.add(node.component.split('.')[0] ?? node.component)

  const props: string[] = []
  const slots: string[] = []
  for (const [name, value] of Object.entries(node.props ?? {})) {
    const binding = bindingOf(walk, node.component, name)
    const drawnHere = binding.kind === 'slot' || binding.kind === 'scoped-slot'
    if (drawnHere && !isObjectValue(value) && !isBinding(value) && value !== null) {
      if (typeof value === 'boolean') continue
      slots.push(`${quoteKey(binding.name)}: () => ${nodes(value, walk)}`)
    } else if (drawnHere && isBinding(value) && binding.kind === 'slot') {
      slots.push(`${quoteKey(binding.name)}: () => ${nodes(value, walk)}`)
    } else if (drawnHere && isBinding(value)) {
      // A render prop handed in as an input: the scoped slot calls it with its props.
      slots.push(`${quoteKey(binding.name)}: (slot) => ${expression(value, walk)}(slot)`)
    } else {
      props.push(`${quoteKey(name)}: ${expression(value, walk)}`)
    }
  }
  if ((node.children ?? []).length > 0) {
    slots.unshift(`default: () => ${nodes(node.children ?? [], walk)}`)
  }

  const args = [
    node.component,
    props.length === 0 ? (slots.length === 0 ? null : 'null') : `{ ${props.join(', ')} }`,
    slots.length === 0 ? null : `{ ${slots.join(', ')} }`,
  ].filter((arg): arg is string => arg !== null)
  // The call sits in a double-quoted attribute, which decodes entities before
  // the expression is read, so `&` and `"` are written as entities.
  const because = inAttribute(inComment(node.exception?.because ?? ''))
  const comment =
    node.exception === undefined ? '' : `/* Rung ${node.exception.rung}, declared: ${because} */ `
  return `${comment}h(${args.join(', ')})`
}

/** Text for a double-quoted attribute: `&` and `"` as the entities the attribute decodes. */
const inAttribute = (text: string) => text.replace(/&/g, '&amp;').replace(/"/g, '&quot;')

/** Slot content in a render call: a list of nodes and text. */
function nodes(value: SpecValue | SpecValue[], walk: Walk): string {
  const items = (Array.isArray(value) ? value : [value]).flat(Infinity as 1) as SpecValue[]
  const drawnItems = items.filter((item) => item !== null && typeof item !== 'boolean')
  return `[${drawnItems.map((item) => expression(item, walk)).join(', ')}]`
}

/**
 * A single-quoted string literal that holds no character a template or an
 * attribute reads specially: quotes, `&`, `<`, `>`, braces and line breaks are
 * escapes, so the literal says exactly what the author typed wherever it sits.
 */
export function jsString(text: string): string {
  const escaped = text
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
    .replace(/["&<>{}]/g, (char) => `\\x${char.charCodeAt(0).toString(16)}`)
  return `'${escaped}'`
}

const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/

/** As the React emitter quotes an object key: `__proto__` computed, anything else by need. */
function quoteKey(key: string): string {
  if (key === '__proto__') return `[${jsString(key)}]`
  return IDENTIFIER.test(key) ? key : jsString(key)
}
