import { CONVENTION_PROPS, TIER_ORDER, TIER_TITLE, wrapped } from './card-parts'
import { shippedParts, unionParts, type Framework, type PartsOwner } from './frameworks'
import { DEFAULT_PLATFORM } from './platforms'

/**
 * The run-time card: the members a model may compose in a screen a host draws
 * at run time, each with what the model needs to write it lawfully without a
 * tool call.
 *
 * It is the system card's vocabulary section (`card.ts`) with the prop types
 * written out, because a model with no tool to look a prop up must know what
 * a prop takes: an enum's literals, whether it is text or a node, and the
 * signature of a callback it binds to an action. Everything a screen document
 * cannot use is left out: tokens, the red rules, the ladder beyond the rungs a
 * document declares, install facts, platforms and frameworks other than the
 * one drawing.
 *
 * It reads a vocabulary, not the registry: the registry is one, and the
 * run-time table (`screen-table.ts`) another, so `@polymorph/screen` renders
 * the card from the table a host installed. `packages/screen/src/card.test.ts`
 * holds the two renderings equal. The output contract that follows the card
 * in a model's prompt is the screen package's (`packages/screen/src/card.ts`).
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

/** What the card reads of a vocabulary: the registry and the run-time table both have it. */
export interface RuntimeCardVocabulary {
  readonly components: readonly RuntimeCardMember[]
  readonly exceptions: { readonly primitives: readonly RuntimeCardPrimitive[] }
  readonly icons: { readonly roles: readonly { readonly name: string }[] }
}

export interface RuntimeCardOptions {
  /** The web framework that draws the screen: a member's parts are the ones it carries. */
  readonly framework: Framework
  /** The members and exception primitives the host allows, by name. Every other is left out. */
  readonly members: ReadonlySet<string>
}

/** The ARIA hooks a member takes, written once as `aria` on a member that takes all four. */
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

/**
 * `name: type`, `*` marking a required one; the four ARIA hooks as `aria`
 * where all four are taken. A ref is left out, as a document cannot hold one.
 */
function propList(props: readonly CardProp[], roles: ReadonlySet<string>): string[] {
  const own = props.filter(
    (prop) =>
      !prop.name.includes('.') && !unionParts(prop.type).every((part) => REF_TYPE.test(part)),
  )
  const names = new Set(own.map((prop) => prop.name))
  const allAria = ARIA.every((name) => names.has(name))
  const written = own
    .filter((prop) => !(allAria && ARIA.includes(prop.name)))
    .map((prop) => `${prop.name}${prop.optional ? '' : '*'}: ${cardType(prop.type, roles)}`)
  return allAria ? [...written, 'aria'] : written
}

/** One member, then a line under it for each part the framework carries. */
function memberLines(
  member: RuntimeCardMember,
  framework: Framework,
  roles: ReadonlySet<string>,
): string[] {
  const segments = propList(member.props, roles)
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
    const props = propList(recorded.props, roles)
    lines.push(
      `  - **${member.name}.${part.name}**${props.length === 0 ? '' : ` · ${props.join(' · ')}`}`,
    )
  }
  return lines
}

/**
 * The card's members section, for the members a host allows: a legend, the
 * members tier by tier in the system card's reading order, the exception
 * primitives, and the icon roles when a member listed takes one.
 */
export function renderRuntimeCard(
  vocabulary: RuntimeCardVocabulary,
  options: RuntimeCardOptions,
): string {
  const { framework, members } = options
  const roles = new Set(vocabulary.icons.roles.map((role) => role.name))
  const listed = vocabulary.components.filter((member) => members.has(member.name))
  const out: string[] = [
    '## Members',
    '',
    ...wrapped(
      'One line per member: what it is for, then its props as `name: type`, `*` marking a ' +
        'required one, then its lawful variant × tone `cells`; a part (`Member.Part`) is a line ' +
        'under its member. `node` is an element, a text, or a list of them. A function type is ' +
        'a callback: bind it to an input of that type. `aria` is the four ARIA hooks ' +
        `(${ARIA.map((name) => `\`${name}\``).join(', ')}). A member takes no prop it does not list, ` +
        'and takes children only where it lists `children`.',
      96,
    ),
    '',
  ]

  const tiers = [...new Set([...TIER_ORDER, ...listed.map((member) => member.tier)])]
  for (const tier of tiers) {
    const inTier = listed.filter((member) => member.tier === tier)
    if (inTier.length === 0) continue
    out.push(`### ${TIER_TITLE[tier] ?? tier}`, '')
    for (const member of inTier) out.push(...memberLines(member, framework, roles))
    out.push('')
  }

  const primitives = vocabulary.exceptions.primitives.filter((primitive) =>
    members.has(primitive.name),
  )
  if (primitives.length > 0) {
    out.push('### Declared exceptions', '')
    for (const primitive of primitives) {
      const props = propList(primitive.props, roles)
      out.push(
        `- **${primitive.name}** (rung ${primitive.rung}) — ${primitive.purpose}` +
          props.map((prop) => ` · ${prop}`).join(''),
      )
    }
    out.push('')
  }

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
