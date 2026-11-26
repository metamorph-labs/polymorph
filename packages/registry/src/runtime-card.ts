import { CONVENTION_PROPS, TIER_ORDER, TIER_TITLE, wrapped } from './card-parts'
import {
  DEFAULT_FRAMEWORK,
  shippedParts,
  unionParts,
  type Framework,
  type PartsOwner,
} from './frameworks'
import { DEFAULT_PLATFORM } from './platforms'
import {
  ADDRESS_KEYS,
  ADDRESS_SCHEMES,
  allowedMembers,
  type AddressPolicy,
  type MemberOptions,
} from './runtime-members'
import type { ScreenTable } from './screen-table'

/**
 * The run-time card: what a host puts in a model's system prompt so the model
 * writes a screen the host can draw, in one call, with no tool. It has three
 * parts: an opening that says what the model is doing, the members section,
 * and the output contract.
 *
 * The members section lists the members a model may compose, each with what
 * the model needs to write it lawfully without a tool call. It is the system
 * card's vocabulary section (`card.ts`) with the prop types written out,
 * because a model with no tool to look a prop up must know what a prop takes:
 * an enum's literals, whether it is text or a node, and the signature of a
 * callback it binds to an action. Everything a screen document cannot use is
 * left out: tokens, the red rules, the ladder beyond the rungs a document
 * declares, install facts, platforms and frameworks other than the one
 * drawing, and, for a host that refuses addresses, every prop and field that
 * takes one.
 *
 * It reads a vocabulary, not the registry: the registry is one, and the
 * run-time table (`screen-table.ts`) another. `@polymorph/screen` composes
 * the card from the table a host installed (`runtimeCard`), and the MCP tool
 * `get_system_card` from the table it builds from the registry, so the two
 * print one text. `packages/screen/src/parity.test.ts` holds the members
 * section rendered from both equal, and `packages/mcp/src/verbs.test.ts` the
 * tool's card to `runtimeCard`'s.
 *
 * This module reads no file, so the browser can import it
 * (`@polymorph/registry/runtime-card`).
 */

interface CardProp {
  readonly name: string
  readonly type: string
  readonly optional: boolean
}

/** What the card reads of a member. */
export interface RuntimeCardMember extends PartsOwner<{
  readonly name: string
  readonly props: readonly CardProp[]
}> {
  readonly name: string
  readonly tier: string
  readonly purpose: string
  readonly props: readonly CardProp[]
  readonly grid: Readonly<Record<string, readonly string[]>> | null
}

/** What the card reads of an exception primitive. */
export interface RuntimeCardPrimitive {
  readonly name: string
  readonly rung: number
  readonly purpose: string
  readonly props: readonly CardProp[]
}

/** What the card reads of a named data type a prop takes: its fields, or the types it is a union of. */
export interface RuntimeCardDataType {
  readonly name: string
  readonly params: readonly string[]
  readonly union?: readonly string[]
  readonly fields: readonly CardProp[]
}

/** What the card reads of a vocabulary: the registry and the run-time table both have it. */
export interface RuntimeCardVocabulary {
  readonly components: readonly RuntimeCardMember[]
  readonly exceptions: { readonly primitives: readonly RuntimeCardPrimitive[] }
  readonly icons: { readonly roles: readonly { readonly name: string }[] }
  /** The named data types the props take. A vocabulary without them gets a card without them. */
  readonly dataTypes?: readonly RuntimeCardDataType[]
}

export interface RuntimeCardOptions {
  /** The web framework that draws the screen: a member's parts are the ones it carries. */
  readonly framework: Framework
  /** The members and exception primitives the host allows, by name. Every other is left out. */
  readonly members: ReadonlySet<string>
  /**
   * `refused` leaves out every prop, part's prop and data type field that takes
   * an address (`ADDRESS_KEYS`). `allowed` when absent.
   */
  readonly addresses?: AddressPolicy
}

/**
 * The ARIA hooks a member takes, written once as `aria-*` on a member that takes all four.
 * The mark is not a word a document could hold as a key: a model that read `aria` in a
 * member's line wrote a prop of that name, holding an object.
 */
const ARIA = [...CONVENTION_PROPS].filter((name) => name.startsWith('aria-'))

/** A type the vocabulary draws as a node: an element, a text, or a list of them. */
const NODE_TYPE = /^(?:React\.)?(?:ReactNode|ReactElement|ReactPortal)\b|^JSX\.Element\b/

/** A React handler alias (`ReactEventHandler<T>`): a function of one DOM event, which an action does not receive. */
const EVENT_HANDLER_ALIAS = /^(?:React\.)?[A-Z]\w*EventHandler(?:<.*>)?$/s

/** A ref, which an element holds in code and a document cannot write. */
const REF_TYPE = /^(?:React\.)?(?:Ref|RefObject|MutableRefObject|RefCallback)</

/** A parameter a callback receives that a document's action cannot use: a DOM event or element. */
const DOM_PARAMETER = /(?:^|[^\w])(?:\w*Event|HTML\w*Element|Element)(?:<|$)/

/** The text without the parentheses around all of it. */
function unwrap(text: string): string {
  let inner = text.trim()
  while (inner.startsWith('(') && closing(inner, 0) === inner.length - 1) {
    inner = inner.slice(1, -1).trim()
  }
  return inner
}

/** The index of the bracket that closes the one at `open`, or -1. */
function closing(text: string, open: number): number {
  let depth = 0
  for (let at = open; at < text.length; at += 1) {
    const char = text[at] as string
    if ('(<{['.includes(char)) depth += 1
    else if (')}]'.includes(char) || (char === '>' && text[at - 1] !== '=')) {
      depth -= 1
      if (depth === 0) return at
    }
  }
  return -1
}

/** The text split at each top-level comma. */
function commaParts(text: string): string[] {
  const parts: string[] = []
  let depth = 0
  let start = 0
  for (let at = 0; at < text.length; at += 1) {
    const char = text[at] as string
    if ('(<{['.includes(char)) depth += 1
    else if (')}]'.includes(char) || (char === '>' && text[at - 1] !== '=')) depth -= 1
    else if (char === ',' && depth === 0) {
      parts.push(text.slice(start, at).trim())
      start = at + 1
    }
  }
  const last = text.slice(start).trim()
  if (last !== '') parts.push(last)
  return parts
}

/** A function type as the card writes it, or `null` when the text is not one. */
function functionType(part: string, roles: ReadonlySet<string>): string | null {
  const text = unwrap(part)
  if (!text.startsWith('(')) return null
  const end = closing(text, 0)
  if (end === -1) return null
  const rest = text.slice(end + 1).trim()
  if (!rest.startsWith('=>')) return null
  const parameters = commaParts(text.slice(1, end)).filter((parameter) => {
    const colon = parameter.indexOf(':')
    return colon === -1 || !DOM_PARAMETER.test(parameter.slice(colon + 1).trim())
  })
  return `(${parameters.join(', ')}) => ${cardType(rest.slice(2), roles)}`
}

/**
 * A printed prop type as the card writes it: `undefined` left out, because
 * `*` marks a required prop and `?` an optional field; an icon role union as
 * `IconRole`, which the card lists once; `false | true` as `boolean`; a React
 * node type as `node`; a callback without the DOM event it is handed, which
 * an action does not receive; and the parts of a union joined by `|`, a
 * function among them in parentheses.
 */
export function cardType(printed: string, roles: ReadonlySet<string>): string {
  // An optional field of an object type says `?` already: `skipToContent?: string`.
  const flat = printed
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\?: ([^;{}]+?) \| undefined;/g, '?: $1;')
  // A function's result runs to the end of the text: `() => void | Promise<void>` is one
  // function, as the validator reads it (`isActionType`), not a union with a promise.
  const whole = functionType(flat, roles)
  if (whole !== null) return whole
  const parts = unionParts(flat)
  if (parts.length === 0) return 'undefined'
  const literals = parts.filter((part) => /^"[^"]*"$/.test(part)).map((part) => part.slice(1, -1))
  if (
    roles.size > 0 &&
    literals.length === parts.length &&
    literals.length === roles.size &&
    literals.every((literal) => roles.has(literal))
  ) {
    return 'IconRole'
  }
  const written = parts.map((part) => {
    const bare = unwrap(part)
    if (NODE_TYPE.test(bare)) return 'node'
    if (EVENT_HANDLER_ALIAS.test(bare)) return '() => void'
    return functionType(bare, roles) ?? bare.replace(/^readonly /, '')
  })
  const boolean = written.includes('false') && written.includes('true')
  const node = written.includes('node')
  const kept = written.filter(
    (part) =>
      !(boolean && (part === 'false' || part === 'true')) &&
      // A node is already a text or a number.
      !(node && (part === 'string' || part === 'number')),
  )
  if (boolean) kept.unshift('boolean')
  const distinct = [...new Set(kept)]
  // A function in a union is parenthesised, so its result does not read as part of the union.
  return distinct
    .map((part) => (distinct.length > 1 && part.includes('=>') ? `(${part})` : part))
    .join('|')
}

/** A function's printed result that is nothing: what an action returns. */
const NOTHING =
  /=> (?:void|undefined|Promise<(?:void|undefined)>)(?:\|(?:void|undefined|Promise<(?:void|undefined)>))*\)?$/

/**
 * `name: type`, `*` marking a required one; the four ARIA hooks as `aria-*`
 * where all four are taken. A ref is left out, as a document cannot hold one,
 * and so is a prop named in `omitted`. With `questions`, a function that
 * returns a value is written `fn`: a data type's field of that kind cannot be
 * given by a document at all, so its signature says nothing a document can
 * use.
 */
function propList(
  props: readonly CardProp[],
  roles: ReadonlySet<string>,
  omitted: ReadonlySet<string>,
  questions = false,
): string[] {
  const own = props.filter(
    (prop) =>
      !prop.name.includes('.') &&
      !omitted.has(prop.name) &&
      !unionParts(prop.type).every((part) => REF_TYPE.test(part)),
  )
  const names = new Set(own.map((prop) => prop.name))
  const allAria = ARIA.every((name) => names.has(name))
  const written = own
    .filter((prop) => !(allAria && ARIA.includes(prop.name)))
    .map((prop) => {
      const type = cardType(prop.type, roles)
      const question = questions && isFunctionPrint(prop.type) && !NOTHING.test(type)
      return `${prop.name}${prop.optional ? '' : '*'}: ${question ? 'fn' : type}`
    })
  return allAria ? [...written, 'aria-*'] : written
}

/** One member, then a line under it for each part the framework carries. */
function memberLines(
  member: RuntimeCardMember,
  framework: Framework,
  roles: ReadonlySet<string>,
  omitted: ReadonlySet<string>,
): string[] {
  const segments = propList(member.props, roles, omitted)
  if (member.grid !== null) {
    segments.push(
      `cells: ${Object.entries(member.grid)
        .map(([variant, tones]) => `${variant}(${tones.join('|')})`)
        .join(' ')}`,
    )
  }
  const purpose = member.purpose === '' ? '' : ` — ${member.purpose}`
  const lines = [`- **${member.name}**${purpose}${segments.map((s) => ` · ${s}`).join('')}`]
  for (const part of shippedParts(member, DEFAULT_PLATFORM, framework)) {
    // A part whose props the registry does not record cannot be checked, so a document cannot compose it.
    const recorded = member.parts.find((candidate) => candidate.name === part.name)
    if (recorded === undefined) continue
    const props = propList(recorded.props, roles, omitted)
    lines.push(
      `  - **${member.name}.${part.name}**${props.length === 0 ? '' : ` · ${props.join(' · ')}`}`,
    )
  }
  return lines
}

/** Whether a printed type is a function, alone or in a union with `undefined`: a callback, not data. */
function isFunctionPrint(printed: string): boolean {
  const flat = printed.replace(/\s+/g, ' ').trim()
  if (functionType(flat, new Set()) !== null) return true
  const parts = unionParts(flat)
  return (
    parts.length > 0 &&
    parts.every(
      (part) => functionType(part, new Set()) !== null || EVENT_HANDLER_ALIAS.test(unwrap(part)),
    )
  )
}

/**
 * The data types section: each named data type the listed members' props
 * take, the types those types' fields take, and so on, each printed once,
 * sorted by name. A callback's parameters are not data a document writes,
 * so a type only a callback names is left out. A type that is the props of
 * a listed member (`StatProps`) points at the member's line.
 */
function dataTypeLines(
  vocabulary: RuntimeCardVocabulary,
  listed: readonly RuntimeCardMember[],
  primitives: readonly RuntimeCardPrimitive[],
  framework: Framework,
  roles: ReadonlySet<string>,
  omitted: ReadonlySet<string>,
): string[] {
  const catalogue = new Map((vocabulary.dataTypes ?? []).map((type) => [type.name, type]))
  if (catalogue.size === 0) return []
  const reached = new Set<string>()
  const queue: string[] = []
  const read = (printed: string) => {
    if (isFunctionPrint(printed)) return
    for (const name of printed.match(/\b[A-Z][A-Za-z0-9]*\b/g) ?? []) {
      if (catalogue.has(name) && !reached.has(name)) {
        reached.add(name)
        queue.push(name)
      }
    }
  }
  for (const member of listed) {
    for (const prop of member.props) {
      if (!prop.name.includes('.') && !omitted.has(prop.name)) read(prop.type)
    }
    for (const part of shippedParts(member, DEFAULT_PLATFORM, framework)) {
      const recorded = member.parts.find((candidate) => candidate.name === part.name)
      for (const prop of recorded?.props ?? []) if (!omitted.has(prop.name)) read(prop.type)
    }
  }
  for (const primitive of primitives) {
    for (const prop of primitive.props) if (!omitted.has(prop.name)) read(prop.type)
  }
  for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
    const type = catalogue.get(next)
    for (const member of type?.union ?? []) read(member)
    for (const field of type?.fields ?? []) if (!omitted.has(field.name)) read(field.type)
  }
  if (reached.size === 0) return []

  const members = new Set(listed.map((member) => member.name))
  const lines = [...catalogue.values()]
    .filter((type) => reached.has(type.name))
    .map((type) => {
      const name = `**${type.name}${type.params.length === 0 ? '' : `<${type.params.join(', ')}>`}**`
      if (type.union !== undefined) return `- ${name} = ${type.union.join(' | ')}`
      const owner = type.name.endsWith('Props') ? type.name.slice(0, -'Props'.length) : ''
      if (members.has(owner)) return `- ${name} · the props of \`${owner}\``
      return `- ${name}${propList(type.fields, roles, omitted, true)
        .map((field) => ` · ${field}`)
        .join('')}`
    })
  return [
    '### Data types',
    '',
    ...wrapped(
      'A prop typed with one of these takes an object: write it as `{ "$object": { … } }` with ' +
        'the fields listed, `*` marking a required one, or bind the prop to an input that holds ' +
        'it. A `node` field takes an element. A function field cannot be written as a value: one ' +
        'shown by its signature returns nothing and takes a binding to an action input of that ' +
        'type; one shown as `fn` returns a value, and a document cannot give it.',
      96,
    ),
    '',
    ...lines,
    '',
  ]
}

/**
 * The card's members section, for the members a host allows: a legend, the
 * members tier by tier in the system card's reading order, the exception
 * primitives, the data types their props take, and the icon roles when a
 * member listed takes one.
 */
export function renderRuntimeCard(
  vocabulary: RuntimeCardVocabulary,
  options: RuntimeCardOptions,
): string {
  const { framework, members } = options
  const omitted: ReadonlySet<string> = options.addresses === 'refused' ? ADDRESS_KEYS : new Set()
  const roles = new Set(vocabulary.icons.roles.map((role) => role.name))
  const listed = vocabulary.components.filter((member) => members.has(member.name))
  const out: string[] = [
    '## Members',
    '',
    ...wrapped(
      'One line per member: what it is for, then its props as `name: type`, `*` marking a ' +
        'required one, then its lawful variant × tone `cells`; a part (`Member.Part`) is a line ' +
        'under its member. `node` is an element, a text, or a list of them. A function type is ' +
        'a callback: bind it to an input of that type. `aria-*` stands for four props, each ' +
        `written under its own name (${ARIA.map((name) => `\`${name}\``).join(', ')}); no member ` +
        'has a prop named `aria`. A member takes no prop it does not list, and takes children ' +
        'only where it lists `children`.',
      96,
    ),
    '',
  ]

  const tiers = [...new Set([...TIER_ORDER, ...listed.map((member) => member.tier)])]
  for (const tier of tiers) {
    const inTier = listed.filter((member) => member.tier === tier)
    if (inTier.length === 0) continue
    out.push(`### ${TIER_TITLE[tier] ?? tier}`, '')
    for (const member of inTier) out.push(...memberLines(member, framework, roles, omitted))
    out.push('')
  }

  const primitives = vocabulary.exceptions.primitives.filter((primitive) =>
    members.has(primitive.name),
  )
  if (primitives.length > 0) {
    out.push('### Declared exceptions', '')
    for (const primitive of primitives) {
      const props = propList(primitive.props, roles, omitted)
      out.push(
        `- **${primitive.name}** (rung ${primitive.rung}) — ${primitive.purpose}` +
          props.map((prop) => ` · ${prop}`).join(''),
      )
    }
    out.push('')
  }

  out.push(...dataTypeLines(vocabulary, listed, primitives, framework, roles, omitted))

  if (out.some((line) => line.includes('IconRole'))) {
    out.push(
      '### Icon roles',
      '',
      ...wrapped(
        'An `IconRole` is a meaning, never a glyph name, and one of: ' +
          `${vocabulary.icons.roles.map((role) => role.name).join(', ')}.`,
        96,
      ),
      '',
    )
  }
  return out.join('\n')
}

/* -------------------------------------------------------------------------- */
/* The whole card                                                             */
/* -------------------------------------------------------------------------- */

/** What the whole card is composed for: the members a host allows, its address policy, and the format. */
export interface ComposedCardOptions extends MemberOptions {
  /**
   * The screen format's id, `SPEC_ID` from `@polymorph/spec/schema`. The spec
   * package depends on the registry, so the registry cannot import it, and
   * every caller hands it in.
   */
  readonly spec: string
}

/** `a`, `a and b`, `a, b and c`, or with `or`. */
const listedText = (items: readonly string[], last = 'and'): string =>
  items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} ${last} ${items.at(-1)}`

const code = (text: string) => `\`${text}\``

/** The opening: what the model is asked to do, and what it cannot do. */
const OPENING = [
  '# Writing a screen',
  '',
  'You write one screen as a document that names members of a closed vocabulary, their props and',
  'what they hold. The host draws it at once, in its own theme: every colour, space, size and motion',
  'is the theme’s, so a document has no field for a style, a class or an expression. Choose members',
  'and variants; bind content to the inputs the host hands the screen.',
  '',
].join('\n')

/**
 * The output contract, for the members a host allows: what the answer is, and
 * what the host does with each part of it at run time.
 */
export function composeOutputContract(
  vocabulary: ScreenTable,
  options: ComposedCardOptions,
): string {
  const allowed = allowedMembers(vocabulary, options)
  const scopes = vocabulary.exceptions.primitives.filter((primitive) => allowed.has(primitive.name))
  const patched = vocabulary.components
    .filter((member) => allowed.has(member.name))
    .filter((member) => member.props.some((prop) => prop.name === 'patch'))
    .map((member) => code(member.name))
  const rungs = [
    ...scopes.map((primitive) => `${code(primitive.name)} is rung ${primitive.rung}`),
    ...(patched.length === 0
      ? []
      : [`a ${code('patch')} prop (on ${listedText(patched)}) is rung 3`]),
  ]
  const addresses = listedText([...ADDRESS_KEYS].map(code))
  const schemes = ADDRESS_SCHEMES.map(code)

  const lines = [
    '## What you write',
    '',
    `Answer with one document in the ${code(options.spec)} format, as JSON in one fenced \`json\``,
    'block. The host draws it while it arrives, so write its keys in this order: `spec`, `name`,',
    '`purpose`, `inputs`, and `root` last.',
    '',
    `- ${code('spec')} is ${code(JSON.stringify(options.spec))}. ${code('name')} is a PascalCase name for the screen that no member has.`,
    `  ${code('purpose')} is one sentence.`,
    '- `inputs` lists what the host hands the screen, each `{ "name": …, "type": … }`. A data input is',
    '  named for a key of the host’s data, and its `type` is a TypeScript type (`string`, `Order[]`);',
    '  an input the host has no value for is empty. An input whose type is a function that returns',
    '  nothing (`(id: string) => void`) is an action: when a member calls it, the host is told its',
    '  name, its arguments and the value of every named control. Bind each callback prop the person',
    '  acts through to an action input of the callback’s type. A function that returns a value',
    '  (`(row: Row) => string`) is answered with an empty answer and the host is never told.',
    '- `root` is an element: `{ "component": …, "props": { … }, "children": [ … ] }`, `props` and',
    '  `children` left out when empty. `component` is a member or a part (`Member.Part`) listed',
    '  above. Every prop goes inside `props`, and a member takes no prop and no child it does not list.',
    '  Write an element’s plain props before its props that hold elements, and `props` before',
    '  `children`: the screen is drawn as it is written, and an element is drawn once its plain',
    '  props are whole.',
    '- A value is a string, a number, a boolean, `null`, an element, a list of values, a binding',
    '  `{ "$": "input" }` or `{ "$": "input.field" }`, or a structured object `{ "$object": { … } }`',
    '  (an option, a column). A binding names a declared input and is never an expression.',
    '- There is no condition and no loop: every element is drawn whenever the screen is. Content that',
    '  is sometimes absent is a prop bound to an input that is empty while there is nothing to show.',
    '- A control with a `name` reports its current value under that name with every action, so name',
    '  each field a person fills in. A name is used once in a screen: two forms on one screen name',
    '  their fields apart (`signInEmail`, `signUpEmail`), because one name holds one value.',
    options.addresses === 'refused'
      ? `- This host shows no link and loads nothing from an address: write no ${listedText([...ADDRESS_KEYS].map(code), 'or')}, in a prop or a field.`
      : `- An address (${addresses}) is relative, a fragment, or ${schemes.slice(0, -1).join(', ')} or ${schemes.at(-1) ?? ''}.`,
  ]
  if (rungs.length > 0) {
    lines.push(
      `- A declared exception: ${listedText(rungs)}. An element that is one carries`,
      '  `"exception": { "rung": …, "because": "…" }`, the reason in four words or more; no other',
      '  element has `exception`.',
    )
  }
  return `${lines.join('\n')}\n`
}

/**
 * The whole run-time card for the members a host allows: the opening, the
 * members section and the output contract. Its default is every member the
 * framework draws but those that host another library's code.
 */
export function composeRuntimeCard(vocabulary: ScreenTable, options: ComposedCardOptions): string {
  const members = renderRuntimeCard(vocabulary, {
    framework: options.framework ?? DEFAULT_FRAMEWORK,
    members: allowedMembers(vocabulary, options),
    ...(options.addresses === undefined ? {} : { addresses: options.addresses }),
  })
  return `${OPENING}\n${members}\n${composeOutputContract(vocabulary, options)}`
}
