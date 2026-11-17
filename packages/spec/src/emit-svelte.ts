import { FRAMEWORK_VOCABULARY, type VueBinding } from '@polymorph/registry/frameworks'
import type { Registry } from '@polymorph/registry'
import { format, type Options } from 'prettier'

import { bindingReader, jsString } from './emit-vue'
import {
  isBinding,
  isElement,
  isObjectValue,
  type ScreenSpec,
  type SpecElement,
  type SpecValue,
} from './schema'

/**
 * Spec to a Svelte 5 component.
 *
 * The same screen the React emitter writes, in Svelte's terms: a presentational
 * component whose `<script module>` holds the header, the imports and the
 * props interface, whose `<script>` reads the inputs with `$props()`, and whose
 * markup composes `@polymorph/svelte-ui` members. It holds no state and
 * computes nothing, for the same reason the TSX does not: the spec has no
 * expression language.
 *
 * **Every prop keeps its React name** (`docs/frameworks.md`), read with the type
 * the registry prints for it (`vueBinding`). A callback is a prop (`onClick`),
 * as a Svelte member takes it. A node-typed prop is a snippet: its value is
 * written as `{#snippet foo()}…{/snippet}` inside the member's tags, a string
 * included, and `children` is the content between them. A structured value is
 * an expression, and an element inside one (`emptyState.secondaryAction`) is
 * a snippet declared at the top of the markup and named where the value holds
 * it. An input is read by its name, because `$props()` is destructured. A
 * snippet declared inside a member's tags is in scope for everything else
 * there, so one whose name is an input's (ListPage's `summary` beside the
 * input `summary`) is declared at the top under another name and passed as an
 * attribute instead.
 *
 * **No whitespace stands between two nodes.** Svelte keeps one space for any
 * whitespace between sibling nodes, where React drops it. So a line break is
 * written inside a tag: before the `>` or `/>` that ends it, or inside the
 * braces of a block tag (`{/snippet\n}`), where Svelte reads no text. Text and
 * the expressions beside it are written on one line.
 *
 * **Text is written as text** only when Svelte reads it back unchanged: no tag,
 * expression or entity character and no whitespace it would collapse. Anything
 * else is a string literal in braces, with every character the markup reads
 * specially escaped (`jsString`).
 *
 * Prettier formats the two scripts with the target's config. It has no Svelte
 * parser here, so the markup is laid out by this file, to the config's
 * `printWidth`.
 */

/** The module every emitted Svelte screen imports its members and their types from. */
export const SVELTE_IMPORT_SOURCE = FRAMEWORK_VOCABULARY.svelte

/** The React vocabulary, whose type names the Svelte vocabulary exports under the same names. */
const REACT_IMPORT_SOURCE = FRAMEWORK_VOCABULARY.react

/**
 * A piece of markup, laid out. The first line is written where the markup
 * starts, and every other line carries its own indent. `tail` is what ends it
 * (`/>`, `>`, `}`), held back so the parent can put a line break before it,
 * inside the tag. `flat` is the whole piece on one line, tail included.
 */
interface Markup {
  lines: string[]
  tail: string
  flat: string
}

interface Walk {
  /** The members the markup names, by owner. */
  used: Set<string>
  read: (component: string, name: string) => VueBinding
  /** The snippets declared at the top of the markup, in order. */
  hoisted: Markup[]
  /**
   * The name of each snippet declared at the top, by what it holds: an element
   * a value holds, or a member's node prop, keyed by `<prop>` under the member.
   * The same value always names the same snippet.
   */
  names: Map<SpecElement, Map<string, string>>
  /** The inputs, which a snippet declared inside a member's tags would hide. */
  inputs: Set<string>
  /** Names in the markup's scope: the inputs and the hoisted snippets. */
  taken: Set<string>
  width: number
}

/** The component, formatted. `header` is the doc comment the React emitter writes. */
export async function svelteScreen(
  spec: ScreenSpec,
  registry: Registry,
  header: string,
  local: Options | null,
): Promise<string> {
  const inputs = new Set(spec.inputs.map((input) => input.name))
  const walk: Walk = {
    used: new Set(),
    read: bindingReader(registry),
    hoisted: [],
    names: new Map(),
    inputs,
    taken: new Set(inputs),
    width: local?.printWidth ?? 80,
  }
  const root = elementMarkup(spec.root, walk, 0)
  const markup = topLevel([...walk.hoisted, root], walk)

  const typescript = { ...local, parser: 'typescript' }
  const module = await format(
    [header, ...imports(spec, walk), '', propsInterface(spec), ''].join('\n'),
    typescript,
  )
  const instance =
    spec.inputs.length === 0
      ? null
      : await format(
          `let { ${spec.inputs.map((input) => input.name).join(', ')} }: ${spec.name}Props = $props()\n`,
          typescript,
        )

  return [
    '<script module lang="ts">',
    module.trimEnd(),
    '</script>',
    '',
    ...(instance === null ? [] : ['<script lang="ts">', instance.trimEnd(), '</script>', '']),
    markup,
    '',
  ].join('\n')
}

/* -------------------------------------------------------------------------- */
/* The scripts                                                                */
/* -------------------------------------------------------------------------- */

/** As the React emitter writes them, from `@polymorph/svelte-ui`. */
function imports(spec: ScreenSpec, walk: Walk): string[] {
  // A type the React vocabulary exports is a type the Svelte vocabulary exports.
  const declared = new Map<string, Set<string>>()
  for (const [module, names] of Object.entries(spec.types ?? {})) {
    const target = module === REACT_IMPORT_SOURCE ? SVELTE_IMPORT_SOURCE : module
    declared.set(target, new Set([...(declared.get(target) ?? []), ...names]))
  }
  const inline = [...(declared.get(SVELTE_IMPORT_SOURCE) ?? [])]
    .filter((name) => !walk.used.has(name))
    .sort()
  const members = [...[...walk.used].sort(), ...inline.map((name) => `type ${name}`)]

  return [
    `import { ${members.join(', ')} } from '${SVELTE_IMPORT_SOURCE}'`,
    ...[...declared]
      .filter(([module]) => module !== SVELTE_IMPORT_SOURCE)
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
/* The markup                                                                 */
/* -------------------------------------------------------------------------- */

const pad = (depth: number) => ' '.repeat(depth)

/** The declared exception, as a comment written against the element it explains. */
function exceptionComment(node: SpecElement): string {
  if (node.exception === undefined) return ''
  const text = `Rung ${node.exception.rung}, declared: ${node.exception.because}`
  // A comment ends at `-->` (or `--!>`). A backslash breaks the sequence; the
  // comment then reads `--\>`.
  return `<!-- ${text.replace(/--(!?)>/g, '--$1\\>')} -->`
}

/** What React draws nothing for. */
const drawsNothing = (value: SpecValue): boolean => value === null || typeof value === 'boolean'

/** A value as the nodes it holds, a list flattened. */
const nodesOf = (value: SpecValue): SpecValue[] =>
  ((Array.isArray(value) ? value : [value]).flat(Infinity as 1) as SpecValue[]).filter(
    (item) => !drawsNothing(item),
  )

/**
 * One element: its attributes, the snippets its node props are written as,
 * then its content. It is written on one line when that fits; otherwise its
 * attributes go one to a line when they do not fit beside its name, and each
 * snippet and child starts a line of its own, after the tail of the one before.
 */
function elementMarkup(node: SpecElement, walk: Walk, indent: number): Markup {
  walk.used.add(node.component.split('.')[0] ?? node.component)

  const attributes: { name: string; value: SpecValue }[] = []
  const snippets: { name: string; params: string; nodes: SpecValue[] }[] = []
  let content: SpecValue[] = []
  for (const [name, value] of Object.entries(node.props ?? {})) {
    const reading = walk.read(node.component, name)
    if (reading.kind === 'slot' && reading.name === 'default') {
      content = nodesOf(value)
    } else if (reading.kind === 'slot' || reading.kind === 'scoped-slot') {
      if (drawsNothing(value)) continue
      // A structured value is an expression; a render function handed in as an
      // input is the snippet itself.
      if (isObjectValue(value) || (reading.kind === 'scoped-slot' && isBinding(value))) {
        attributes.push({ name, value })
      } else if (walk.inputs.has(name)) {
        attributes.push({ name, value: { $: hoist(node, name, nodesOf(value), walk) } })
      } else {
        snippets.push({ name, params: '', nodes: nodesOf(value) })
      }
    } else {
      attributes.push({ name, value })
    }
  }
  if ((node.children ?? []).length > 0) content = nodesOf(node.children ?? [])

  const comment = exceptionComment(node)
  const name = node.component
  const items = (depth: number): Markup[] => [
    ...snippets.map((snippet) =>
      block(
        `{#snippet ${snippet.name}(${snippet.params})`,
        '}',
        '{/snippet',
        '}',
        children(snippet.nodes, walk, depth + 2),
        depth,
        walk,
      ),
    ),
    ...children(content, walk, depth),
  ]

  const flatAttributes = attributes.map(({ name, value }) => attribute(name, value, walk, 0, true))
  const flatOpen = `${comment}<${name}${flatAttributes.map((written) => ` ${written}`).join('')}`
  const inner = items(indent + 2)
  if (inner.length === 0) {
    const fits = indent + flatOpen.length + 3 <= walk.width
    if (fits) return { lines: [flatOpen], tail: '/>', flat: `${flatOpen} />` }
    return {
      lines: openLines(comment, name, attributes, walk, indent),
      tail: '/>',
      flat: `${flatOpen} />`,
    }
  }

  const flat = `${flatOpen}>${inner.map((item) => item.flat).join('')}</${name}>`
  if (indent + flat.length <= walk.width) {
    return { lines: [flat.slice(0, -1)], tail: '>', flat }
  }
  const open =
    indent + flatOpen.length + 1 <= walk.width
      ? [flatOpen]
      : openLines(comment, name, attributes, walk, indent)
  return { ...joined(open, '>', `</${name}`, inner, indent + 2), tail: '>', flat }
}

/** `<Name` with each attribute on a line of its own, laid out at its depth. */
function openLines(
  comment: string,
  name: string,
  attributes: { name: string; value: SpecValue }[],
  walk: Walk,
  indent: number,
): string[] {
  return [
    `${comment}<${name}`,
    ...attributes.flatMap(({ name: prop, value }) => {
      const [first = '', ...rest] = attribute(prop, value, walk, indent + 2, false).split('\n')
      return [`${pad(indent + 2)}${first}`, ...rest]
    }),
  ]
}

/**
 * A block tag (`{#snippet foo()}…{/snippet}`) or anything shaped like one:
 * an opening, the character that ends it, the items inside, a closing and its
 * tail. One line when it fits.
 */
function block(
  open: string,
  openEnd: string,
  close: string,
  tail: string,
  inner: Markup[],
  indent: number,
  walk: Walk,
): Markup {
  const flat = `${open}${openEnd}${inner.map((item) => item.flat).join('')}${close}${tail}`
  if (indent + flat.length <= walk.width) {
    return { lines: [flat.slice(0, -tail.length)], tail, flat }
  }
  return { ...joined([open], openEnd, close, inner, indent + 2), tail, flat }
}

/**
 * An opening's lines, then each item on a line of its own at `depth`, each
 * line starting with the tail of what came before it, then the closing: so
 * every line break falls inside a tag. An item that is text is followed on its
 * own line, because a break after text would be read as a space.
 */
function joined(
  open: string[],
  openEnd: string,
  close: string,
  inner: Markup[],
  depth: number,
): { lines: string[] } {
  const lines = [...open]
  let pending = openEnd
  let afterText = false
  for (const item of inner) {
    const [first = '', ...rest] = item.lines
    if (afterText) lines[lines.length - 1] += `${pending}${first}`
    else lines.push(`${pad(depth)}${pending}${first}`)
    lines.push(...rest)
    pending = item.tail
    afterText = item.tail === ''
  }
  if (afterText) lines[lines.length - 1] += `${pending}${close}`
  else lines.push(`${pad(depth)}${pending}${close}`)
  return { lines }
}

/**
 * Content: elements one to a line, or, when any of it is text, a number or a
 * binding, one run on a single line with nothing between its parts.
 */
function children(nodes: SpecValue[], walk: Walk, depth: number): Markup[] {
  if (nodes.every((item) => isElement(item))) {
    return nodes.map((item) => elementMarkup(item as SpecElement, walk, depth))
  }
  let afterText = false
  const text = nodes
    .map((item) => {
      if (typeof item === 'string') {
        // A string after a string is its own node in React; here it is an
        // expression, which never merges with the text before it.
        const literal = isLiteralText(item) && !afterText
        afterText = literal
        return literal ? item : `{${jsString(item)}}`
      }
      afterText = false
      if (isElement(item)) return elementMarkup(item, walk, 0).flat
      if (isBinding(item)) return `{${item.$}}`
      return `{${JSON.stringify(item)}}`
    })
    .join('')
  return [{ lines: [text], tail: '', flat: text }]
}

/**
 * The markup's top level: the snippets hoisted for elements inside values,
 * then the screen's root element, each joined to the tail of the one before.
 */
function topLevel(items: Markup[], walk: Walk): string {
  const [only] = items
  if (items.length === 1 && only !== undefined && only.flat.length <= walk.width) return only.flat
  const lines: string[] = []
  let pending = ''
  for (const item of items) {
    const [first = '', ...rest] = item.lines
    lines.push(`${pending}${first}`, ...rest)
    pending = item.tail
  }
  lines.push(pending)
  return lines.join('\n')
}

/**
 * Whether text can be written between tags unchanged: words separated by single
 * spaces, with nothing Svelte reads as a tag, an expression or an entity.
 */
function isLiteralText(text: string): boolean {
  return /^[^\s<>{}&]+( [^\s<>{}&]+)*$/.test(text)
}

/* -------------------------------------------------------------------------- */
/* Attributes and the expressions they hold                                   */
/* -------------------------------------------------------------------------- */

/**
 * `title="Inbox"`, `columns={4}`, `stickyHeader`, `onClick={onNewTicket}`. A
 * string is a static attribute only when Svelte reads it unchanged: a quoted
 * value still opens an expression at `{` and decodes an entity at `&`.
 */
function attribute(name: string, value: SpecValue, walk: Walk, indent: number, flat: boolean) {
  if (value === true) return name
  if (typeof value === 'string' && /^[^"&{}<>\r\n]*$/.test(value)) return `${name}="${value}"`
  return `${name}={${expression(value, walk, indent, flat, name)}}`
}

/**
 * A value as an expression. Strings are single-quoted with every character the
 * markup reads specially escaped. An element is the snippet hoisted for it,
 * named by where it sits. A structure goes on one line when it fits, and one
 * field or item to a line when it does not.
 */
function expression(
  value: SpecValue,
  walk: Walk,
  indent: number,
  flat: boolean,
  key: string,
): string {
  if (Array.isArray(value)) {
    const items = value.map((item) => expression(item, walk, indent + 2, flat, key))
    return structure('[', items, ']', indent, flat, walk)
  }
  if (isElement(value)) return hoist(value, key, [value], walk)
  if (isBinding(value)) return value.$
  if (isObjectValue(value)) {
    const fields = Object.entries(value.$object).map(
      ([field, item]) => `${quoteKey(field)}: ${expression(item, walk, indent + 2, flat, field)}`,
    )
    return structure('{', fields, '}', indent, flat, walk)
  }
  if (typeof value === 'string') return jsString(value)
  return JSON.stringify(value)
}

function structure(
  open: string,
  items: string[],
  close: string,
  indent: number,
  flat: boolean,
  walk: Walk,
): string {
  if (items.length === 0) return `${open}${close}`
  const spaced = open === '{' ? ' ' : ''
  const line = `${open}${spaced}${items.join(', ')}${spaced}${close}`
  if (flat || (!line.includes('\n') && indent + line.length + 16 <= walk.width)) return line
  return [
    open,
    ...items.map((item) => `${pad(indent + 2)}${item},`),
    `${pad(indent)}${close}`,
  ].join('\n')
}

/**
 * A snippet declared at the top of the markup, and its name: for an element a
 * value holds (`secondaryActionSnippet` for the `secondaryAction` of an
 * `emptyState`), or for a member's node prop whose name is an input's
 * (`summarySnippet`). `holder` and `key` say where it is used, so the same
 * place always names the same snippet.
 */
function hoist(holder: SpecElement, key: string, nodes: SpecValue[], walk: Walk): string {
  const byKey = walk.names.get(holder) ?? new Map<string, string>()
  walk.names.set(holder, byKey)
  const known = byKey.get(key)
  if (known !== undefined) return known
  const base = `${key.replace(/[^A-Za-z0-9_$]/g, '')}Snippet`
  let name = base
  for (let count = 2; walk.taken.has(name); count += 1) name = `${base}${count}`
  walk.taken.add(name)
  byKey.set(key, name)
  // Its place is claimed before its content is laid out, so a snippet the
  // content declares comes after it.
  const at = walk.hoisted.length
  walk.hoisted.push({ lines: [], tail: '', flat: '' })
  walk.hoisted[at] = block(
    `{#snippet ${name}()`,
    '}',
    '{/snippet',
    '}',
    children(nodes, walk, 2),
    0,
    walk,
  )
  return name
}

const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/

/** As the React emitter quotes an object key: `__proto__` computed, anything else by need. */
function quoteKey(key: string): string {
  if (key === '__proto__') return `[${jsString(key)}]`
  return IDENTIFIER.test(key) ? key : jsString(key)
}
