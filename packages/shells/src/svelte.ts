import { resolve } from 'node:path'

import prettier from 'prettier'
import ts from 'typescript'

import { gallerySlug } from '@polymorph/engine'
import type { Registry } from '@polymorph/registry'
import { vueBinding } from '@polymorph/registry/frameworks'

import type {
  ClassName,
  Effect,
  ElementNode,
  Expr,
  FixtureChild,
  FixtureInstance,
  FixtureValue,
  Handler,
  MemberNode,
  MemberShell,
  Node,
  SlotNode,
  StateEntry,
} from './dsl'
import { freeNames, rewrite } from './expr'
import {
  ENGINE_HELPERS,
  FOUNDATION_TYPES as SHARED_FOUNDATION_TYPES,
  renderParameter,
  rewriteType,
} from './types'
import {
  allNodes,
  branded,
  camel,
  capital,
  checkHolding,
  checkSlots,
  classReference,
  composed,
  descriptionPath,
  entrySubject,
  fixtureName,
  fixtureValues,
  foundationTypeExports,
  gridEntries,
  handlerExpressions,
  holds,
  BORROWED_KEY,
  BORROWED_TYPE,
  IDENTITY_KEY,
  isIdentifier,
  isPrimitive,
  key,
  jsString,
  locations,
  partShell,
  presenceEntries,
  presenceExpressions,
  registryMember,
  relativeFile,
  renderedChildren,
  RENDERS_KEYS,
  type FixtureRenders,
  staticString,
  templateClassNames,
  templateExpressions,
  typeOwners,
  typeParameters,
  SELECT_DELAY_MS,
  TYPING_FRAMES,
  withAgent,
  wrapDoc,
  type Location,
  type RegistryMemberLike,
} from './common'

/**
 * The Svelte renderer: a member's description, written as a Svelte 5
 * component (runes and snippets), its states fixture and the vocabulary's
 * index.
 *
 * The props come from the registry's props table, as they do for Vue, read
 * through `vueBinding` (`@polymorph/registry/frameworks`), and every one of
 * them is a Svelte prop of the React name: an `onFoo` prop is a callback prop
 * `onFoo` with the web's payload, `children` and every node prop are snippets
 * (`Snippet`), and a render prop is a snippet with its argument
 * (`Snippet<[Arg]>`). A member takes no `class` or `style`: a prop it does
 * not declare is ignored.
 *
 * The markup is written without whitespace between sibling nodes. Svelte
 * keeps one space for whitespace between two nodes, which React and Vue drop,
 * so a line break between siblings is put inside a tag (`</span\n  ><b>`) or
 * a block tag (`{/if\n  }`), where it is not text.
 *
 * Output is deterministic: the same description and registry give the same
 * bytes, which the freshness law (`shells.test.ts`) relies on.
 */

/* -------------------------------------------------------------------------- */
/* Where the files go                                                         */
/* -------------------------------------------------------------------------- */

export const SVELTE_VOCABULARY_SRC = 'packages/svelte-ui/src'
export const SVELTE_FOUNDATION_SRC = 'packages/svelte/src'

/** Where a member's component file goes. */
export function svelteComponentPath(shell: MemberShell): string {
  const root =
    (shell.home ?? 'vocabulary') === 'foundation' ? SVELTE_FOUNDATION_SRC : SVELTE_VOCABULARY_SRC
  return `${root}/${shell.dir}/${shell.member}.svelte`
}

/** Where a member's compound part's component file goes. */
export function sveltePartPath(shell: MemberShell, part: string): string {
  return `${SVELTE_VOCABULARY_SRC}/${shell.dir}/${shell.member}${part}.svelte`
}

/** Where a member's states fixture goes: a component whose module exports the entries. */
export function svelteStatesPath(shell: MemberShell): string {
  return `${SVELTE_VOCABULARY_SRC}/${shell.fixtureDir ?? shell.dir}/${fixtureName(shell)}.states.svelte`
}

/* -------------------------------------------------------------------------- */
/* Small helpers                                                              */
/* -------------------------------------------------------------------------- */

/**
 * A string Svelte reads back unchanged as an attribute value in double quotes:
 * no quote, no brace (the start of an expression), no `&` (Svelte decodes a
 * character reference in a static value: `R&amp;D` reads `R&D`) and no line
 * break.
 */
const plainAttribute = (value: string) => !/["{}&\n\r]/.test(value)

/** Text Svelte reads back unchanged as markup: no brace, tag or entity, no edge whitespace. */
const plainText = (value: string) =>
  value !== '' && !/[{}<>&\n\r\t]/.test(value) && !/^\s|\s$/.test(value)

/** Elements HTML closes itself, written `<input />`. */
const VOID_ELEMENTS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'source',
  'track',
  'wbr',
])

/**
 * The foundation's helpers an expression may call, imported from
 * `@polymorph/svelte`: the engine's framework-free conventions, which it
 * re-exports and the React members import too, and its own.
 */
const FOUNDATION_HELPERS = new Set([
  ...ENGINE_HELPERS,
  // A function run once the pending changes are in the document.
  'afterRender',
  // Whether a scoped slot draws anything for its argument.
  'slotDraws',
  // The toast store's, which Toast's viewport and FormField's notice read and write.
  'toast',
  'getToasts',
  'subscribeToasts',
  'removeToast',
])

/** The foundation's components a description names as an element's tag. */
const FOUNDATION_COMPONENTS = new Set(['Glyph', 'BrandMark', 'PageTransition'])

/**
 * The foundation's types, which a member imports instead of declaring: the
 * engine's every foundation re-exports (`types.ts`), and the Svelte
 * foundation's own.
 */
const FOUNDATION_TYPES = new Set([...SHARED_FOUNDATION_TYPES, 'ControlRef', 'RenderNode'])

/* -------------------------------------------------------------------------- */
/* The member's interface: every prop, by the registry                        */
/* -------------------------------------------------------------------------- */

/** One prop of a Svelte member: a value, a callback, or a snippet. */
export interface SvelteProp {
  /** The registry's name, which the component declares. */
  name: string
  /** The description's name for it: camelCase, `children` for the default slot. */
  local: string
  kind: 'prop' | 'event' | 'slot'
  /** For an event: the description's event name (`checkedChange` for `onCheckedChange`). */
  event?: string
  /** For a slot: the description's slot name (`default` for `children`). */
  slot?: string
  type: string
  optional: boolean
  doc?: string
  /** Whether the type is a function, whose default is the function itself. */
  callable: boolean
  /**
   * For a callback: whether its type is a union of signatures (Accordion's
   * `onValueChange`, single or multiple), which the member calls with either.
   */
  overloaded?: boolean
}

export interface SvelteInterface {
  props: SvelteProp[]
  /** Type names the interface references. */
  names: Set<string>
}

/** A type the registry prints, rewritten for Svelte: React's `Ref` is the foundation's `ControlRef`. */
function printed(type: string): { text: string; names: string[] } {
  const rewritten = rewriteType(type)
  let text = rewritten.text.replace(/\bRef</g, 'ControlRef<')
  // The parentheses a union wraps a function type in, once the union is gone.
  while (text.startsWith('(') && closingParenthesis(text) === text.length - 1)
    text = text.slice(1, -1)
  return {
    text,
    names: rewritten.names.map((name) => (name === 'Ref' ? 'ControlRef' : name)),
  }
}

/** The index of the parenthesis that closes the one a text starts with, or -1. */
function closingParenthesis(text: string): number {
  let depth = 0
  for (let at = 0; at < text.length; at += 1) {
    if (text[at] === '(') depth += 1
    else if (text[at] === ')') {
      depth -= 1
      if (depth === 0) return at
    }
  }
  return -1
}

/**
 * Whether a TypeScript type is a function type, or a union of them. A name
 * `resolve` knows (a type the description declares) is read as its definition.
 */
function isFunctionType(
  text: string,
  resolve: (name: string) => string | undefined = () => undefined,
): boolean {
  const source = ts.createSourceFile('t.ts', `type T = ${text}`, ts.ScriptTarget.ESNext, true)
  const alias = source.statements[0]
  if (alias === undefined || !ts.isTypeAliasDeclaration(alias)) return false
  const visit = (node: ts.TypeNode): boolean => {
    if (ts.isFunctionTypeNode(node)) return true
    if (ts.isParenthesizedTypeNode(node)) return visit(node.type)
    if (ts.isUnionTypeNode(node))
      return node.types.every(
        (member) => member.kind === ts.SyntaxKind.UndefinedKeyword || visit(member),
      )
    if (ts.isTypeReferenceNode(node)) {
      const definition = resolve(node.typeName.getText(source))
      return definition !== undefined && isFunctionType(definition, resolve)
    }
    return false
  }
  return visit(alias.type)
}

/** How many function types a type's top-level union holds. */
function functionAlternatives(text: string): number {
  const source = ts.createSourceFile('t.ts', `type T = ${text}`, ts.ScriptTarget.ESNext, true)
  const alias = source.statements[0]
  if (alias === undefined || !ts.isTypeAliasDeclaration(alias)) return 0
  const count = (node: ts.TypeNode): number =>
    ts.isFunctionTypeNode(node)
      ? 1
      : ts.isParenthesizedTypeNode(node)
        ? count(node.type)
        : ts.isUnionTypeNode(node)
          ? node.types.reduce((total, member) => total + count(member), 0)
          : 0
  return count(alias.type)
}

/**
 * A member's props by the registry. A prop the registry lists under a part's
 * name (`Group.title`) is the part's, not the member's.
 */
export function svelteInterface(component: RegistryMemberLike): SvelteInterface {
  const result: SvelteInterface = { props: [], names: new Set() }
  for (const prop of component.props) {
    if (prop.name.includes('.')) continue
    const binding = vueBinding(prop)
    const doc = prop.doc ? { doc: prop.doc } : {}
    if (binding.kind === 'prop') {
      const type = printed(prop.type)
      type.names.forEach((name) => result.names.add(name))
      result.props.push({
        name: prop.name,
        local: camel(prop.name),
        kind: 'prop',
        type: type.text,
        optional: prop.optional,
        callable: isFunctionType(type.text),
        ...doc,
      })
    } else if (binding.kind === 'event') {
      const type = printed(prop.type)
      type.names.forEach((name) => result.names.add(name))
      // A callback is optional, as an event listener is: a caller that does not
      // handle the event passes nothing.
      result.props.push({
        name: prop.name,
        local: prop.name,
        kind: 'event',
        event: binding.name,
        type: type.text,
        optional: true,
        callable: true,
        overloaded: functionAlternatives(type.text) > 1,
        ...doc,
      })
    } else {
      result.names.add('Snippet')
      let type = 'Snippet'
      if (binding.kind === 'scoped-slot') {
        const parameter = renderParameter(prop.type)
        if (parameter !== null) {
          parameter.names.forEach((name) => result.names.add(name))
          type = `Snippet<[${parameter.text}]>`
        }
      }
      result.props.push({
        name: prop.name,
        local: camel(prop.name),
        kind: 'slot',
        slot: binding.name,
        type,
        optional: prop.optional,
        callable: false,
        ...doc,
      })
    }
  }
  return result
}

/* -------------------------------------------------------------------------- */
/* Types a description writes, read for Svelte                                */
/* -------------------------------------------------------------------------- */

/**
 * A description's type, for Svelte. A node is a snippet: `VNode` is
 * `Snippet`, and a function that returns a node (`(row: Row) => VNode |
 * string`, a DataTable column's `cell`) is a snippet with those parameters
 * (`Snippet<[Row]>`), which a caller writes with `{#snippet cell(row)}`.
 */
export function svelteType(text: string): string {
  const source = ts.createSourceFile('t.ts', `type T = ${text}`, ts.ScriptTarget.ESNext, true)
  const offset = 'type T = '.length
  const edits: { start: number; end: number; text: string }[] = []
  const returnsNode = (node: ts.TypeNode): boolean => /\bVNode\b/.test(node.getText(source))
  const visit = (node: ts.Node): void => {
    if (ts.isFunctionTypeNode(node) && returnsNode(node.type)) {
      const parameters = node.parameters.map((parameter) =>
        parameter.type ? svelteType(parameter.type.getText(source)) : 'unknown',
      )
      edits.push({
        start: node.getStart(source),
        end: node.getEnd(),
        text: `Snippet<[${parameters.join(', ')}]>`,
      })
      return
    }
    if (ts.isTypeReferenceNode(node) && node.typeName.getText(source) === 'VNode') {
      edits.push({ start: node.getStart(source), end: node.getEnd(), text: 'Snippet' })
      return
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  let out = source.text
  for (const edit of edits.sort((a, b) => b.start - a.start)) {
    out = out.slice(0, edit.start) + edit.text + out.slice(edit.end)
  }
  return out.slice(offset)
}

/**
 * The properties of a description's types that hold a function returning a
 * node (`cell`): a call of one in an expression binds the snippet to its
 * arguments instead (`bindSnippet(column.cell, row)`), which `Render` draws.
 */
function nodeFunctions(shells: readonly MemberShell[]): Set<string> {
  const found = new Set<string>()
  for (const shell of shells) {
    for (const definition of Object.values(shell.types ?? {})) {
      const body = definition.replace(/^\s*<[^>]*>/, '')
      const source = ts.createSourceFile('t.ts', `type T = ${body}`, ts.ScriptTarget.ESNext, true)
      const visit = (node: ts.Node): void => {
        if (
          ts.isPropertySignature(node) &&
          node.type !== undefined &&
          ts.isFunctionTypeNode(node.type) &&
          /\bVNode\b/.test(node.type.type.getText(source))
        ) {
          found.add(node.name.getText(source))
        }
        ts.forEachChild(node, visit)
      }
      visit(source)
    }
  }
  return found
}

/* -------------------------------------------------------------------------- */
/* Expressions                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Rewrites the calls an expression makes that are spelled differently in
 * Svelte: `emit('foo', …)` and `invoke('foo', …)` call the callback prop
 * `onFoo` (`emit` drops what it returns), and a call of a function that
 * returns a node binds the snippet to its arguments.
 */
function rewriteCalls(
  expr: Expr,
  events: ReadonlyMap<string, { prop: string; overloaded: boolean }>,
  nodeCalls: ReadonlySet<string>,
): string {
  const text = `(${expr})`
  const source = ts.createSourceFile('expr.ts', text, ts.ScriptTarget.ESNext, true)
  const edits: { start: number; end: number; text: string }[] = []
  const argsText = (node: ts.CallExpression, from: number) =>
    node.arguments
      .slice(from)
      .map((argument) => argument.getText(source))
      .join(', ')
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const callee = node.expression
      if (
        ts.isIdentifier(callee) &&
        (callee.text === 'emit' || callee.text === 'invoke') &&
        node.arguments[0] !== undefined &&
        ts.isStringLiteral(node.arguments[0])
      ) {
        const event = node.arguments[0].text
        const callback = events.get(event)
        if (callback === undefined)
          throw new Error(`shells: no on-prop declares the event "${event}"`)
        // The arguments may hold calls of their own.
        const inner = node.arguments
          .slice(1)
          .map((argument) => rewriteCalls(argument.getText(source), events, nodeCalls))
          .join(', ')
        // A union of signatures is called with the arguments of either.
        const callee = callback.overloaded
          ? `(${callback.prop} as ((...args: any[]) => unknown) | undefined)`
          : callback.prop
        edits.push({
          start: node.getStart(source),
          end: node.getEnd(),
          text: `${callee}?.(${inner})`,
        })
        return
      }
      if (
        ts.isPropertyAccessExpression(callee) &&
        nodeCalls.has(callee.name.text) &&
        node.arguments.length > 0
      ) {
        edits.push({
          start: node.getStart(source),
          end: node.getEnd(),
          text: `bindSnippet(${callee.getText(source)}, ${argsText(node, 0)})`,
        })
        return
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  let out = text
  for (const edit of edits.sort((a, b) => b.start - a.start)) {
    out = out.slice(0, edit.start) + edit.text + out.slice(edit.end)
  }
  return out.slice(1, -1)
}

/* -------------------------------------------------------------------------- */
/* Markup layout                                                              */
/* -------------------------------------------------------------------------- */

/** One unit of markup at a depth: a tag, a block tag, an expression, or a whole short element. */
interface Token {
  text: string
  depth: number
}

/** The characters a token ends with, which move to the start of the next line. */
function tail(text: string): string {
  if (text.endsWith('/>')) return '/>'
  if (text.endsWith('>') || text.endsWith('}')) return text.slice(-1)
  throw new Error(`shells: a markup token must end a tag or a block: ${text}`)
}

/**
 * Lays tokens out one per line. The characters that end each token start the
 * next line, so every line break sits inside a tag or a block tag and Svelte
 * reads no whitespace between two nodes.
 */
function layout(tokens: readonly Token[]): string {
  const lines: string[] = []
  let carry = ''
  for (const token of tokens) {
    const end = tail(token.text)
    const body = token.text.slice(0, token.text.length - end.length).trimEnd()
    const pad = '  '.repeat(token.depth)
    const own = `${carry}${body}`.split('\n')
    lines.push(`${pad}${own[0]}`, ...own.slice(1).map((line) => `${pad}${line}`))
    carry = end
  }
  if (lines.length > 0) lines[lines.length - 1] += carry
  return lines.join('\n')
}

/** An opening tag: on one line when it fits, else one attribute per line. */
function openTag(name: string, attributes: readonly string[], depth: number, end: string): string {
  const inline =
    attributes.length === 0 ? `<${name}${end}` : `<${name} ${attributes.join(' ')}${end}`
  if (inline.length + depth * 2 <= 100 && !inline.includes('\n')) return inline
  return `<${name}\n${attributes.map((attribute) => `  ${attribute}`).join('\n')}${end === ' />' ? '\n/>' : `\n${end}`}`
}

/* -------------------------------------------------------------------------- */
/* Rendering a member                                                         */
/* -------------------------------------------------------------------------- */

/** What the renderer reads beyond one description: every member's place, props and types. */
export interface SvelteContext {
  locations: ReadonlyMap<string, Location>
  /** The component that declares each shared type, by the type's name. */
  owners: ReadonlyMap<string, string>
  /** Every described member's and part's props, by component name. */
  props: ReadonlyMap<string, readonly SvelteProp[]>
  /** The registry names a slot's `pass` sets, across every description. */
  passed: ReadonlySet<string>
  /** The props a parent reads from a slotted member (`child.label`, `slotted(…).props.size`). */
  readFromChild: ReadonlySet<string>
  /** Type properties that hold a function returning a node (`cell`). */
  nodeCalls: ReadonlySet<string>
  /** The description's file, for the generated header. */
  source: string
}

/** The slot names an expression reads with `slotted(slots.<name>)` and `slotText(slots.<name>)`. */
function slotReads(exprs: readonly Expr[], helper: 'slotted' | 'slotText'): Set<string> {
  const names = new Set<string>()
  const pattern = new RegExp(`\\b${helper}\\(\\s*slots\\.(\\w+)\\s*\\)`, 'g')
  for (const expr of exprs)
    for (const match of expr.matchAll(pattern)) names.add(match[1] as string)
  return names
}

/**
 * A member, or a compound part, as a Svelte component, before its script is
 * formatted.
 */
export function renderSvelteMember(
  described: MemberShell,
  component: RegistryMemberLike,
  context: SvelteContext,
  /** For a compound part: the member it belongs to, whose `provide` it reads as `owner`. */
  owner?: string,
): string {
  // The agent block is one more effect, which registers the instance with the agent registry.
  const shell = withAgent(described)
  const face = svelteInterface(component)
  const home = shell.home ?? 'vocabulary'
  const template = Array.isArray(shell.template)
    ? (shell.template as readonly Node[])
    : [shell.template as Node]

  const props = new Map(face.props.map((prop) => [prop.local, prop]))
  const values = face.props.filter((prop) => prop.kind === 'prop')
  const events = new Map(
    face.props
      .filter((prop) => prop.kind === 'event')
      .map((prop) => [
        prop.event as string,
        { prop: prop.name, overloaded: prop.overloaded === true },
      ]),
  )
  const snippets = new Map(
    face.props.filter((prop) => prop.kind === 'slot').map((prop) => [prop.slot as string, prop]),
  )

  const derivedNames = new Set(Object.keys(shell.derived ?? {}))
  const stateNames = new Set(Object.keys(shell.state ?? {}))
  const presences = new Set(Object.keys(shell.presence ?? {}))
  const lists = new Set(Object.keys(shell.listPresence ?? {}))
  const medias = new Set(Object.keys(shell.media ?? {}))
  const departures = new Set(Object.keys(shell.departures ?? {}))

  // Every name the script declares, which a value cannot share.
  const taken = new Map<string, string>()
  const claim = (name: string, what: string) => {
    const held = taken.get(name)
    if (held !== undefined) {
      throw new Error(`shells: ${shell.member} names ${what} "${name}" after ${held}`)
    }
    taken.set(name, what)
  }
  for (const prop of face.props) claim(prop.local, `the prop ${prop.name}`)
  for (const name of derivedNames) claim(name, 'a derived value')
  for (const name of stateNames) claim(name, 'a state value')
  for (const name of presences) claim(name, 'a presence')
  for (const name of lists) claim(name, 'a list presence')
  for (const name of medias) claim(name, 'a media query')
  if (shell.mode !== undefined) claim(shell.mode, 'the colour mode')
  for (const name of departures) claim(name, 'a departure')
  for (const name of Object.keys(shell.recipes ?? {})) claim(name, 'a recipe')

  /* what the template and the script read --------------------------------- */
  const templateSources = templateExpressions(template)
  const scriptSources: Expr[] = [
    ...Object.values(shell.derived ?? {}),
    ...Object.values(shell.state ?? {}),
    ...Object.values(shell.machine?.context ?? {}),
    ...Object.values(shell.machine?.events ?? {}).map((event) =>
      'emit' in event ? `emit('${event.emit}', ${event.payload})` : event.run,
    ),
    ...Object.values(shell.presence ?? {}).flatMap(presenceExpressions),
    ...Object.values(shell.listPresence ?? {}).flatMap((list) => [list.of, list.key]),
    ...Object.values(shell.statics ?? {}),
    ...(shell.effects ?? []).flatMap((effect) => [
      effect.run,
      ...(effect.watch === undefined ? [] : [effect.watch]),
      ...(effect.resize ?? []),
      ...(effect.mutation ?? []),
      ...(effect.delay === undefined ? [] : [effect.delay]),
      ...(effect.release === undefined ? [] : [effect.release]),
    ]),
    ...Object.values(shell.provide ?? {}),
  ]
  const allSources = [...scriptSources, ...templateSources]
  // `slotted(slots.x)` and `slotText(slots.x)` read a scope, not the `slots` object.
  const withoutSlotReads = (expr: Expr) =>
    expr.replace(/\bslot(?:ted|Text|Node)\(\s*slots\.\w+\s*\)/g, '(0)')
  const names = new Set(allSources.flatMap((expr) => [...freeNames(withoutSlotReads(expr))]))
  const defaultNames = Object.values(shell.defaults ?? {}).flatMap((expr) => [...freeNames(expr)])

  // Element refs: one element, or every element a loop renders.
  const refs = new Set<string>()
  const listRefs = new Set<string>()
  const collectRefs = (nodes: readonly Node[], inLoop: boolean) => {
    for (const node of nodes) {
      if (node.kind === 'element' && node.ref !== undefined) {
        refs.add(node.ref)
        if (inLoop) listRefs.add(node.ref)
      }
      if (node.kind === 'element') collectRefs(node.children ?? [], inLoop)
      else if (node.kind === 'member')
        Object.values(node.slots ?? {}).forEach((content) => collectRefs(content, inLoop))
      else if (node.kind === 'slot') collectRefs(node.fallback ?? [], inLoop)
      else if (node.kind === 'if') {
        node.branches.forEach((branch) => collectRefs(branch.then, inLoop))
        collectRefs(node.otherwise ?? [], inLoop)
      } else if (node.kind === 'each') collectRefs(node.children, true)
      else if (node.kind === 'portal') collectRefs(node.children, inLoop)
    }
  }
  collectRefs(template, false)
  // A ref nothing reads is not bound: an element the member never reaches needs no name.
  const readRefs = new Set<string>([
    ...Object.values(shell.presence ?? {}).map((presence) => presence.ref),
    ...Object.values(shell.departures ?? {}).map((departure) => departure.ref),
    ...Object.keys(shell.controlRefs ?? {}),
  ])
  for (const name of [...refs]) {
    if (!readRefs.has(name) && !names.has(name)) {
      refs.delete(name)
      listRefs.delete(name)
    }
  }
  for (const name of refs) {
    if (!taken.has(name)) claim(name, 'an element ref')
    else if (taken.get(name) !== 'an element ref') {
      throw new Error(
        `shells: ${shell.member} names an element ref "${name}" after ${taken.get(name)}`,
      )
    }
  }

  // The slots a parent reads (`slotted`), reads as text (`slotText`), or hands props to (`pass`, `take`).
  const slottedSlots = slotReads(allSources, 'slotted')
  const textSlots = slotReads(allSources, 'slotText')
  const slotNodes = allNodes(template).filter((node): node is SlotNode => node.kind === 'slot')
  const scopedSlots = new Set<string>(slottedSlots)
  for (const node of slotNodes) {
    if (node.pass !== undefined || node.take !== undefined) scopedSlots.add(node.name)
  }
  const scopeName = (slot: string) => `${slot === 'default' ? 'children' : camel(slot)}Scope`
  const textName = (slot: string) => `${slot === 'default' ? 'children' : camel(slot)}Text`
  for (const slot of scopedSlots) claim(scopeName(slot), 'a slot scope')
  for (const slot of textSlots) claim(textName(slot), 'a slot text')

  /** The local name of a slot's snippet prop. */
  const snippetOf = (slot: string): string => {
    const prop = snippets.get(slot)
    if (prop === undefined)
      throw new Error(
        `shells: ${shell.member} renders the slot "${slot}", which no node prop declares`,
      )
    return prop.local
  }

  /**
   * An expression over the description's scope, in Svelte: props, state and
   * derived values by their names, presences and media queries by their
   * `current`, the callback props for `emit` and `invoke`.
   */
  const sx = (expr: Expr): string => {
    const read = expr
      // A scoped slot drawn with its argument is its snippet bound to it, which `Render` draws,
      // and whether it draws anything is read from a drawing of it (the foundation's `slotDraws`).
      .replace(
        /\bslotNode\(\s*slots\.(\w+)\s*,/g,
        (_, slot: string) => `bindSnippet(${snippetOf(slot)},`,
      )
      .replace(
        /\bslotDraws\(\s*slots\.(\w+)\s*,/g,
        (_, slot: string) => `slotDraws(${snippetOf(slot)},`,
      )
      // A slot as a node is its snippet, which a component draws through `Render`.
      .replace(/\bslotNode\(\s*slots\.(\w+)\s*\)/g, (_, slot: string) => snippetOf(slot))
      .replace(/\bslotted\(\s*slots\.(\w+)\s*\)/g, (_, slot: string) => `${scopeName(slot)}.read()`)
      .replace(
        /\bslotText\(\s*slots\.(\w+)\s*\)/g,
        (_, slot: string) => `${textName(slot)}.current`,
      )
    const mapped = rewrite(read, (name) => {
      if (
        presences.has(name) ||
        lists.has(name) ||
        medias.has(name) ||
        listRefs.has(name) ||
        name === shell.mode
      )
        return `${name}.current`
      if (name === '$event') return 'event'
      return null
    })
    return rewriteCalls(mapped, events, context.nodeCalls).replace(/\bVNode\b/g, 'RenderNode')
  }

  /* imports ---------------------------------------------------------------- */
  const svelteValues = new Set<string>()
  const svelteTypes = new Set<string>()
  const foundationValues = new Set<string>()
  const motionValues = new Set<string>()
  const foundationTypes = new Set<string>()

  const readsOwner = owner !== undefined && names.has('owner')
  const readsLent = names.has('lent')
  const readsLender = names.has('lender')
  const handsBack = shell.lends === true && names.has('borrowed')
  if (readsOwner || readsLent || readsLender) svelteValues.add('getContext')
  if (shell.provide || shell.lends || readsLender) svelteValues.add('setContext')
  if (face.names.has('Snippet') || snippets.size > 0) svelteTypes.add('Snippet')
  if (Object.values(shell.types ?? {}).some((definition) => /\bVNode\b/.test(definition))) {
    svelteTypes.add('Snippet')
  }
  checkSlots(shell.member, template)
  for (const effect of shell.effects ?? []) {
    checkHolding(shell.member, effect)
    if (holds(effect)) svelteValues.add('onDestroy')
  }
  if ((shell.effects ?? []).length > 0) foundationValues.add('watchEffect')
  foundationValues.add('joinSlot')
  if (scopedSlots.size > 0) {
    foundationValues.add('SlotScope')
    foundationValues.add('SlotOutlet')
  }
  if (textSlots.size > 0) foundationValues.add('SlotText')
  if (shell.controlRefs) foundationValues.add('useControlRef')
  if (shell.departures) foundationValues.add('useDeparture')
  if (shell.media) foundationValues.add('useMediaQuery')
  if (shell.mode) foundationValues.add('useMode')
  if (shell.machine) foundationValues.add('useDirection')
  if (listRefs.size > 0) foundationValues.add('refList')
  for (const name of [...names, ...defaultNames]) {
    if (FOUNDATION_HELPERS.has(name)) foundationValues.add(name)
    // A type an expression names (`null as RichTextEditorState | null`) is the foundation's too.
    if (FOUNDATION_TYPES.has(name)) foundationTypes.add(name)
  }
  const allTemplateNodes = allNodes(template)
  if (allTemplateNodes.some((node) => node.kind === 'portal')) foundationValues.add('Portal')
  if (allTemplateNodes.some((node) => node.kind === 'render')) foundationValues.add('Render')
  for (const node of allTemplateNodes) {
    if (node.kind !== 'element') continue
    if ((node.spread ?? []).length > 0) foundationValues.add('attributes')
    if (
      (node.spread ?? []).length > 1 ||
      ((node.spread ?? []).length > 0 && Object.keys(node.on ?? {}).length > 0)
    )
      foundationValues.add('mergeParts')
    const tag = typeof node.tag === 'string' ? node.tag : node.tag.expr
    if (FOUNDATION_COMPONENTS.has(tag)) foundationValues.add(tag)
  }
  if (
    allSources.some(
      (expr) =>
        context.nodeCalls.size > 0 &&
        [...context.nodeCalls].some((name) => new RegExp(`\\.${name}\\(`).test(expr)),
    )
  )
    foundationValues.add('bindSnippet')
  if (allSources.some((expr) => /\bslotNode\(\s*slots\.\w+\s*,/.test(expr)))
    foundationValues.add('bindSnippet')
  if (allSources.some((expr) => /\bVNode\b/.test(expr))) foundationTypes.add('RenderNode')
  if (shell.machine) foundationValues.add('normalizeProps')
  if (shell.presence) {
    const kinds = Object.values(shell.presence)
    if (kinds.some((presence) => presence.key !== undefined)) motionValues.add('useKeyedPresence')
    if (kinds.some((presence) => presence.key === undefined)) motionValues.add('usePresence')
  }
  if (lists.size > 0) motionValues.add('useListPresence')
  const passing = face.props.filter((prop) => context.passed.has(prop.name))
  if (passing.some((prop) => prop.kind === 'event')) foundationValues.add('chainHandlers')
  for (const name of face.names) if (FOUNDATION_TYPES.has(name)) foundationTypes.add(name)
  for (const name of FOUNDATION_TYPES) {
    if (
      Object.values(shell.types ?? {}).some((definition) =>
        new RegExp(`\\b${name}\\b`).test(definition),
      )
    ) {
      foundationTypes.add(name)
    }
  }

  // The member's type parameters (`generic: 'Row'`) are declared by the script tag.
  const parameters = typeParameters(shell.generic)
  const declared = new Set([...Object.keys(shell.types ?? {}), ...parameters])
  const uses = new Set(shell.uses ?? [])
  const undeclared = [...face.names].filter(
    (name) =>
      name !== 'Snippet' && !FOUNDATION_TYPES.has(name) && !declared.has(name) && !uses.has(name),
  )
  if (undeclared.length > 0) {
    throw new Error(
      `shells: ${shell.member}'s props name ${undeclared.join(', ')}, which its description neither declares (\`types\`) nor uses (\`uses\`)`,
    )
  }
  const named = (name: string) =>
    face.names.has(name) ||
    Object.values(shell.types ?? {}).some((definition) =>
      new RegExp(`\\b${name}\\b`).test(definition),
    ) ||
    allSources.some((expr) => new RegExp(`\\b${name}\\b`).test(expr))
  const sharedTypes = new Map<string, string[]>()
  for (const name of [...uses].sort()) {
    const from = context.owners.get(name)
    if (from === undefined || declared.has(name)) {
      throw new Error(
        `shells: ${shell.member} uses ${name}, which ${from === undefined ? 'no description declares' : 'it declares itself'}`,
      )
    }
    if (!named(name)) {
      if (owner !== undefined) continue
      throw new Error(
        `shells: ${shell.member} uses ${name}, which neither its props nor its types name`,
      )
    }
    const location = context.locations.get(from)
    if (location?.home === 'foundation' && home === 'vocabulary') foundationTypes.add(name)
    else sharedTypes.set(from, [...(sharedTypes.get(from) ?? []), name])
  }

  // A member that renders itself (a JSON tree's entry) imports its own file.
  const composedNames = [...composed(template)].sort()
  const memberLines: string[] = []
  for (const name of composedNames) {
    if (name === shell.member) {
      memberLines.push(`import ${name} from './${name}.svelte'`)
      continue
    }
    const location = context.locations.get(name)
    if (location === undefined)
      throw new Error(`shells: ${name} is composed but has no description`)
    if (location.home === 'foundation' && home === 'vocabulary') foundationValues.add(name)
    else
      memberLines.push(
        `import ${name} from '${relativeFile(shell.dir, location.dir, `${name}.svelte`)}'`,
      )
  }
  for (const [from, types] of sharedTypes) {
    const location = context.locations.get(from)
    if (location === undefined) throw new Error(`shells: ${from} declares types and has no file`)
    memberLines.push(
      `import type { ${types.join(', ')} } from '${relativeFile(shell.dir, location.dir, `${from}.svelte`)}'`,
    )
  }

  const lines: string[] = []
  lines.push('/**')
  lines.push(` * ${component.purpose}${component.spec ? ` (\`${component.spec}\`)` : ''}.`)
  lines.push(' *')
  lines.push(` * Generated by \`pnpm shells\` from \`${context.source}\`, the member's`)
  lines.push(' * framework-neutral description. Never edit it by hand: change the description and')
  lines.push(' * run `pnpm shells`.')
  lines.push(' */')
  if (svelteValues.size > 0 || svelteTypes.size > 0) {
    const imported = [
      ...[...svelteValues].sort(),
      ...[...svelteTypes].sort().map((name) => `type ${name}`),
    ]
    lines.push(`import { ${imported.join(', ')} } from 'svelte'`)
  }
  if (shell.machine) {
    lines.push('')
    lines.push(`import * as zag from '@zag-js/${shell.machine.of}'`)
    lines.push(`import { useMachine } from '@zag-js/svelte'`)
  }
  lines.push('')
  if (home === 'foundation') {
    // Inside the foundation, its own index would import this file back: the
    // gateway and the conventions are sibling modules, and the types are the engine's.
    for (const name of [...foundationValues].sort()) {
      if (name === 'Glyph') lines.push(`import Glyph from './Glyph.svelte'`)
      else if (name === 'joinSlot')
        lines.push(`import { joinSlot } from '../conventions/slotted.svelte'`)
      else throw new Error(`shells: the foundation's ${shell.member} cannot import ${name}`)
    }
    if (foundationTypes.size > 0) {
      lines.push(
        `import type { ${[...foundationTypes].sort().join(', ')} } from '@polymorph/engine'`,
      )
    }
  } else if (foundationValues.size > 0 || foundationTypes.size > 0) {
    const imported = [
      ...[...foundationValues].sort(),
      ...[...foundationTypes].sort().map((name) => `type ${name}`),
    ]
    lines.push(`import { ${imported.join(', ')} } from '@polymorph/svelte'`)
  }
  if (motionValues.size > 0) {
    lines.push(`import { ${[...motionValues].sort().join(', ')} } from '@polymorph/svelte/motion'`)
  }
  const classNames = templateClassNames(template)
  // A part shares its member's recipe and imports it only when it draws with it.
  const drawsWithRecipe = [...classNames].some((name) => !name.includes('.')) || names.has('styles')
  if (shell.recipe !== null && drawsWithRecipe) {
    const specifier = /^[@.]/.test(shell.recipe)
      ? shell.recipe
      : `@polymorph/recipes/${shell.recipe}.module.css`
    lines.push(`import styles from '${specifier}'`)
  }
  for (const [binding, recipe] of Object.entries(shell.recipes ?? {}).sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    if (![...classNames].some((name) => name.startsWith(`${binding}.`))) continue
    lines.push(`import ${binding} from '@polymorph/recipes/${recipe}.module.css'`)
  }
  lines.push(...memberLines)

  /* types ------------------------------------------------------------------ */
  for (const [name, definition] of Object.entries(shell.types ?? {})) {
    const [, typed = '', body = definition] = /^\s*(<[^>]*>)?\s*([\s\S]*)$/.exec(definition) ?? []
    const written = svelteType(body.trim())
    lines.push('')
    lines.push(
      written.startsWith('{')
        ? `export interface ${name}${typed} ${written}`
        : `export type ${name}${typed} = ${written}`,
    )
  }
  const own = parameters.length === 0 ? '' : `<${parameters.join(', ')}>`
  lines.push('')
  lines.push(`export interface ${shell.member}Props${own} {`)
  for (const prop of face.props) {
    if (prop.doc) {
      lines.push('  /**')
      for (const line of wrapDoc(prop.doc, 92)) lines.push(`   * ${line}`.trimEnd())
      lines.push('   */')
    }
    lines.push(`  ${key(prop.name)}${prop.optional ? '?' : ''}: ${prop.type}`)
  }
  lines.push('}')
  for (const [name, expr] of Object.entries(shell.statics ?? {})) {
    lines.push('')
    lines.push(`export const ${name} = ${sx(expr)}`)
  }
  const moduleScript = lines.join('\n')

  /* the instance ----------------------------------------------------------- */
  const body: string[] = []
  for (const name of Object.keys(shell.defaults ?? {})) {
    if (!values.some((prop) => prop.local === name || prop.name === name)) {
      throw new Error(`shells: ${shell.member} sets a default for "${name}", which is not a prop`)
    }
  }
  const passedProps = new Set(passing.map((prop) => prop.local))
  const ownName = (prop: SvelteProp) =>
    passedProps.has(prop.local) ? `${prop.local}Own` : prop.local
  const destructured = face.props.map((prop) => {
    const given = shell.defaults?.[prop.local] ?? shell.defaults?.[prop.name]
    const local = ownName(prop)
    const binding = prop.name === local ? local : `${key(prop.name)}: ${local}`
    if (given === undefined) return binding
    // A function default for a prop that is not a function makes the value, as Vue's defaults do.
    const callable =
      prop.callable ||
      isFunctionType(prop.type, (name) => shell.types?.[name]?.replace(/^\s*<[^>]*>/, ''))
    const value = !callable && /^\s*\(.*=>/.test(given) ? `(${given})()` : given
    return `${binding} = ${value}`
  })
  body.push(`let { ${destructured.join(', ')} }: ${shell.member}Props${own} = $props()`)
  const usesUid = names.has('uid') || shell.machine !== undefined
  if (usesUid) body.push('const uid = $props.id()')

  // Joining the slot the member is rendered in: a parent reads it (`slotted`),
  // hands it props (`pass`) or takes the first of its members (`take`).
  const kindExpr = shell.statics?.controlKind === undefined ? 'undefined' : 'controlKind'
  const childReads = values.filter((prop) => context.readFromChild.has(prop.local))
  body.push(
    `const joined = joinSlot(${kindExpr}, () => ({ ${childReads.map((prop) => `${prop.local}: ${ownName(prop)}`).join(', ')} }))`,
  )
  for (const prop of passing) {
    const at = `joined.passed[${jsString(prop.name)}]`
    if (prop.kind === 'event') {
      body.push(`const ${prop.local} = $derived(chainHandlers(${prop.local}Own, ${at}))`)
    } else {
      body.push(
        `const ${prop.local} = $derived(${at} === undefined ? ${prop.local}Own : (${at} as typeof ${prop.local}Own))`,
      )
    }
  }

  if (readsOwner) {
    // What the member provides; a part outside its member reads nothing.
    body.push(`const owner: Record<string, any> = getContext('polymorph:${owner}') ?? {}`)
  }
  if (readsLent) {
    // The identity a composing member lends; none outside one.
    body.push(`const lent = getContext<string | undefined>('${IDENTITY_KEY}')`)
  }
  if (shell.lends) body.push(`setContext('${IDENTITY_KEY}', '${gallerySlug(shell.member)}')`)
  if (readsLender) {
    // The holder of the member that lends this one its identity, kept from the members this one
    // renders; none outside one.
    body.push(`const lender = getContext<${BORROWED_TYPE} | undefined>('${BORROWED_KEY}')`)
    body.push(`setContext('${BORROWED_KEY}', undefined)`)
  }
  if (handsBack) {
    // The holder the member this one lends its identity to writes its element into.
    body.push(`const borrowed: ${BORROWED_TYPE} = {}`)
    body.push(`setContext('${BORROWED_KEY}', borrowed)`)
  }
  if (names.has('listening')) {
    const getters = [...events].map(
      ([event, callback]) => `get ${key(event)}() { return ${callback.prop} !== undefined }`,
    )
    body.push(`const listening = { ${getters.join(', ')} }`)
  }
  if (names.has('slots')) {
    const getters = [...snippets].map(
      ([slot, prop]) => `get ${key(slot)}() { return ${prop.local} }`,
    )
    body.push(`const slots = { ${getters.join(', ')} }`)
  }
  for (const [name, expr] of Object.entries(shell.state ?? {})) {
    // A value nothing reads is not declared (the chart frame's shared state, in a chart that
    // has no legend to hide a series from).
    if (!names.has(name)) continue
    // A state value starts from a prop on purpose: an uncontrolled draft takes its default once.
    if ([...freeNames(expr)].some((free) => props.has(free)))
      body.push('// svelte-ignore state_referenced_locally')
    body.push(`let ${name} = $state(${sx(expr)})`)
  }
  for (const name of [...refs].sort()) {
    if (listRefs.has(name)) {
      body.push(`const ${name} = refList()`)
      continue
    }
    // An element handed to the caller's ref has the type that ref holds (`HTMLInputElement`).
    const handed = shell.controlRefs?.[name]
    const prop = handed === undefined ? undefined : props.get(camel(handed))
    const element =
      /ControlRef<\s*([\w.]+)\s*\|\s*null\s*>/.exec(prop?.type ?? '')?.[1] ?? 'HTMLElement'
    body.push(`let ${name} = $state<${element} | null>(null)`)
  }
  for (const [name, query] of Object.entries(shell.media ?? {})) {
    body.push(`const ${name} = useMediaQuery('${query}')`)
  }
  if (shell.mode) body.push(`const ${shell.mode} = useMode()`)

  // A derived value the machine reads is declared before it; one that reads the
  // machine, after: the machine reads its props when it is made.
  const late = new Set<string>()
  for (const [name, expr] of Object.entries(shell.derived ?? {})) {
    const free = freeNames(expr)
    if (free.has('api') || free.has('service') || [...free].some((other) => late.has(other)))
      late.add(name)
  }
  const derivedLine = (name: string, expr: Expr) => `const ${name} = $derived(${sx(expr)})`
  for (const [name, expr] of Object.entries(shell.derived ?? {})) {
    if (!late.has(name)) body.push(derivedLine(name, expr))
  }
  if (shell.machine) {
    for (const event of Object.values(shell.machine.events ?? {})) {
      if ('emit' in event && !events.has(event.emit)) {
        throw new Error(`shells: ${shell.member} emits "${event.emit}", which no on-prop declares`)
      }
    }
    const machineContext = [
      'id: uid',
      // The document's direction: a machine given none writes `dir="ltr"` on the member's root.
      'dir: documentDirection.current',
      ...Object.entries(shell.machine.context).map(([name, expr]) => `${key(name)}: ${sx(expr)}`),
      ...Object.entries(shell.machine.events ?? {}).map(([name, event]) => {
        const statement =
          'emit' in event ? sx(`emit('${event.emit}', ${event.payload})`) : sx(event.run)
        return `${name}: (details) => { ${statement} }`
      }),
    ]
    // Read as the machine's props, so a literal (`placement`) takes the machine's type and a
    // callback's details are typed; a prop the machine does not take is passed and ignored.
    body.push('const documentDirection = useDirection()')
    body.push(
      `const service = useMachine(zag.machine, () => ({ ${machineContext.join(', ')} }) as Partial<zag.Props>)`,
    )
    body.push('const api = $derived(zag.connect(service, normalizeProps))')
  }
  for (const [name, expr] of Object.entries(shell.derived ?? {})) {
    if (late.has(name)) body.push(derivedLine(name, expr))
  }
  for (const [name, list] of Object.entries(shell.listPresence ?? {})) {
    body.push(`const ${name} = useListPresence(() => ${sx(list.of)}, ${sx(list.key)})`)
  }
  for (const [name, departure] of Object.entries(shell.departures ?? {})) {
    body.push(`const ${name} = useDeparture(() => ${departure.ref}, '${departure.binding}')`)
  }
  for (const [name, presence] of Object.entries(shell.presence ?? {})) {
    if (presence.key !== undefined) {
      if (presence.binding !== undefined || !listRefs.has(presence.ref)) {
        throw new Error(
          `shells: ${shell.member}'s keyed presence "${name}" needs a ref inside a loop and no binding`,
        )
      }
      body.push(
        `const ${name} = useKeyedPresence(() => ${sx(presence.open)}, () => ${presence.ref}.current, (element) => ${sx(presence.key)})`,
      )
      continue
    }
    const binding =
      presence.binding === undefined
        ? 'undefined'
        : typeof presence.binding === 'string'
          ? `'${presence.binding}'`
          : `() => ${sx(presence.binding.expr)}`
    const entries = presenceEntries(presence, sx, true)
    const options = entries.length === 0 ? '' : `, { ${entries.join(', ')} }`
    const rest = presence.binding === undefined && options === '' ? '' : `, ${binding}${options}`
    body.push(
      `const ${name} = usePresence(() => ${sx(presence.open)}, () => ${presence.ref}${rest})`,
    )
  }
  if (shell.provide) {
    const getters = Object.entries(shell.provide).map(
      ([name, expr]) => `get ${name}() { return ${sx(expr)} }`,
    )
    body.push(`setContext('polymorph:${shell.member}', { ${getters.join(', ')} })`)
  }
  for (const [name, prop] of Object.entries(shell.controlRefs ?? {})) {
    body.push(`useControlRef(() => ${camel(prop)}, () => ${name})`)
  }
  for (const slot of [...scopedSlots].sort()) {
    const node = slotNodes.find((candidate) => candidate.name === slot)
    const options: string[] = []
    if (node?.pass !== undefined) {
      const entries = Object.entries(node.pass).map(([name, expr]) => `${key(name)}: ${sx(expr)}`)
      const child = Object.values(node.pass).some((expr) => freeNames(expr).has('child'))
      options.push(
        `pass: (${child ? 'child' : ''}): Record<string, unknown> => ({ ${entries.join(', ')} })`,
      )
    }
    if (node?.take !== undefined) options.push(`take: () => ${sx(node.take)}`)
    // Typed, because what the scope passes may read what the scope holds.
    body.push(`const ${scopeName(slot)}: SlotScope = new SlotScope({ ${options.join(', ')} })`)
  }
  for (const slot of [...textSlots].sort()) {
    body.push(`const ${textName(slot)} = new SlotText(() => ${snippetOf(slot)})`)
  }
  for (const [at, effect] of (shell.effects ?? []).entries()) {
    body.push(...effectLines(effect, at + 1, sx))
  }
  // A slot the member reads is probed last, once everything its members read through `pass` is
  // declared: the probe mounts them as the member is made.
  for (const slot of [...scopedSlots].sort()) {
    if (slottedSlots.has(slot)) body.push(`${scopeName(slot)}.probe(() => ${snippetOf(slot)})`)
  }
  const instanceScript = body.join('\n')

  /* the markup ------------------------------------------------------------- */
  const renderer = new MarkupWriter({
    member: shell.member,
    sx,
    snippetOf,
    scoped: (slot) => (scopedSlots.has(slot) ? scopeName(slot) : null),
    context,
    listRefs,
  })
  // The text nodes a member in a slot renders around its output, so the slot's scope reads it in
  // document order; past the scope's `take` it renders nothing between them.
  const tokens = [
    { text: '{@render joined.start?.()}', depth: 0 },
    { text: '{#if joined.shown}', depth: 0 },
    ...renderer.nodes(template, 1),
    { text: '{/if}', depth: 0 },
    { text: '{@render joined.end?.()}', depth: 0 },
  ]

  // Svelte reads `$state` as a store of a binding named `state`, so a value cannot be named after
  // a rune the component writes (a derived `state` beside an element ref held in `$state`).
  for (const rune of ['state', 'derived', 'effect', 'props', 'bindable']) {
    if (taken.has(rune) && new RegExp(`\\$${rune}\\b`).test(instanceScript)) {
      throw new Error(
        `shells: ${shell.member} names ${taken.get(rune)} "${rune}", which Svelte reads as a store of the $${rune} rune the component writes`,
      )
    }
  }

  const open =
    shell.generic === undefined
      ? '<script lang="ts">'
      : `<script lang="ts" generics="${shell.generic.replace(/"/g, '&quot;')}">`
  return [
    '<script module lang="ts">',
    moduleScript,
    '</script>',
    '',
    open,
    instanceScript,
    '</script>',
    '',
    layout(tokens),
    '',
  ].join('\n')
}

/**
 * One effect: a function that runs after the document updates, on mount
 * unless `mount` is false and whenever its `watch` changes. One that observes
 * or waits keeps a release, run before it runs again and when the member is
 * destroyed.
 */
function effectLines(effect: Effect, at: number, sx: (expr: Expr) => string): string[] {
  const run = sx(effect.run)
  const options = [
    ...(effect.watch === undefined ? [] : [`watch: () => ${sx(effect.watch)}`]),
    ...(effect.mount === false ? ['mount: false'] : []),
  ]
  const watched = `watchEffect(effect${at}${options.length === 0 ? '' : `, { ${options.join(', ')} }`})`
  if (!holds(effect)) return [`const effect${at} = () => { ${run} }`, watched]
  const lines = [`let release${at}: (() => void) | undefined`, `const effect${at} = () => {`]
  lines.push(`  release${at}?.()`)
  if (effect.listen !== undefined) {
    // The listener runs the effect with the event, which a description names `$event`.
    const event = `'${effect.listen}'`
    lines.push(`  const listener = (event: DocumentEventMap[${event}]) => { ${run} }`)
    lines.push(`  document.addEventListener(${event}, listener)`)
    lines.push(`  release${at} = () => document.removeEventListener(${event}, listener)`)
  } else if (effect.release !== undefined) {
    // What `run` returned, which the release reads as `ran`.
    lines.push(freeNames(effect.release).has('ran') ? `  const ran = ${run}` : `  ${run}`)
    lines.push(`  release${at} = () => { ${sx(effect.release)} }`)
  } else if (effect.delay !== undefined) {
    lines.push(`  const timer = setTimeout(() => { ${run} }, ${sx(effect.delay)})`)
    lines.push(`  release${at} = () => clearTimeout(timer)`)
  } else {
    lines.push(`  const run = () => { ${run} }`)
    const releases: string[] = []
    if (effect.resize !== undefined) {
      lines.push(
        "  const resize = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(run)",
      )
      lines.push(
        `  for (const element of [${effect.resize.map(sx).join(', ')}]) if (element) resize?.observe(element)`,
      )
      releases.push('resize?.disconnect()')
    }
    if (effect.mutation !== undefined) {
      lines.push(
        "  const mutation = typeof MutationObserver === 'undefined' ? undefined : new MutationObserver(run)",
      )
      lines.push(
        `  for (const element of [${effect.mutation.map(sx).join(', ')}]) if (element) mutation?.observe(element, { childList: true, characterData: true, subtree: true${effect.attributes === undefined ? '' : `, attributeFilter: [${effect.attributes.map((name) => `'${name}'`).join(', ')}]`} })`,
      )
      releases.push('mutation?.disconnect()')
    }
    lines.push(`  release${at} = () => { ${releases.join('; ')} }`)
    lines.push('  run()')
  }
  lines.push('}')
  lines.push(watched)
  lines.push(`onDestroy(() => release${at}?.())`)
  return lines
}

/* -------------------------------------------------------------------------- */
/* The markup                                                                 */
/* -------------------------------------------------------------------------- */

interface WriterOptions {
  member: string
  sx: (expr: Expr) => string
  snippetOf: (slot: string) => string
  /** The scope a slot's outlet renders in, or `null` for a plain outlet. */
  scoped: (slot: string) => string | null
  context: SvelteContext
  listRefs: ReadonlySet<string>
}

/** The DOM event each event name dispatches, for a handler that no attribute types. */
const EVENT_TYPES: Readonly<Record<string, string>> = {
  click: 'MouseEvent',
  dblclick: 'MouseEvent',
  mousedown: 'MouseEvent',
  mouseup: 'MouseEvent',
  contextmenu: 'MouseEvent',
  pointerdown: 'PointerEvent',
  pointerup: 'PointerEvent',
  pointermove: 'PointerEvent',
  keydown: 'KeyboardEvent',
  keyup: 'KeyboardEvent',
  focus: 'FocusEvent',
  blur: 'FocusEvent',
  focusin: 'FocusEvent',
  focusout: 'FocusEvent',
  dragover: 'DragEvent',
  dragleave: 'DragEvent',
  drop: 'DragEvent',
  animationend: 'AnimationEvent',
  submit: 'SubmitEvent',
}

/**
 * Attributes Svelte types more narrowly than the DOM does: a description
 * writes `tabindex` as the attribute's text (`'0'`), and `autocomplete` as any
 * token string, and the element reads both as text.
 */
const NARROWLY_TYPED = new Set(['tabindex', 'autocomplete'])

/** An event name and its modifier: Vue's `contextmenu.capture` listens in the capture phase. */
function eventName(event: string): { name: string; capture: boolean } {
  const [name = event, ...modifiers] = event.split('.')
  for (const modifier of modifiers) {
    if (modifier !== 'capture')
      throw new Error(`shells: the event modifier "${modifier}" has no Svelte spelling`)
  }
  return { name, capture: modifiers.includes('capture') }
}

/** Whether an expression is a function itself (`(next, event) => …`), which is the handler. */
function isFunctionExpression(expr: Expr): boolean {
  const source = ts.createSourceFile('expr.ts', `(${expr})`, ts.ScriptTarget.ESNext, true)
  const statement = source.statements[0]
  if (statement === undefined || !ts.isExpressionStatement(statement)) return false
  let node: ts.Expression = statement.expression
  while (ts.isParenthesizedExpression(node)) node = node.expression
  return ts.isArrowFunction(node) || ts.isFunctionExpression(node)
}

/** The statement a handler runs, as a callback's body. */
function handlerBody(handler: Handler, sx: (expr: Expr) => string): string {
  const action =
    'emit' in handler
      ? `emit(${[`'${handler.emit}'`, ...(handler.args ?? [])].join(', ')})`
      : handler.run
  const statement = sx(action)
  const safe = statement.trimStart().startsWith('{') ? `(${statement})` : statement
  return handler.when === undefined ? safe : `if (${sx(handler.when)}) ${safe}`
}

/**
 * A handler as a callback: `(event) => { … }`, with `event` only when it reads
 * `$event`, typed as `type` where nothing else types it. A handler that is a
 * function itself (`run('(next, event) => …')`) is the callback, as Vue reads
 * one.
 */
function handlerCallback(handler: Handler, sx: (expr: Expr) => string, type?: string): string {
  if ('run' in handler && isFunctionExpression(handler.run)) {
    const callback = sx(handler.run)
    return handler.when === undefined
      ? callback
      : `(...args: any[]) => { if (${sx(handler.when)}) (${callback})(...args) }`
  }
  const reads = handlerExpressions(handler).some((expr) => freeNames(expr).has('$event'))
  const parameter = reads ? (type === undefined ? 'event' : `event: ${type}`) : ''
  return `(${parameter}) => { ${handlerBody(handler, sx)} }`
}

class MarkupWriter {
  private snippetCount = 0

  constructor(private readonly options: WriterOptions) {}

  private get sx() {
    return this.options.sx
  }

  /**
   * An attribute: a static string in quotes, anything else in braces. On an
   * element, an attribute Svelte types more narrowly than the DOM takes the
   * description's value as it is (`NARROWLY_TYPED`).
   */
  private attribute(name: string, expr: Expr, element = false): string {
    const value = staticString(expr)
    if (value !== null && plainAttribute(value)) return `${name}="${value}"`
    const written = this.sx(expr)
    if (element && NARROWLY_TYPED.has(name)) return `${name}={(${written}) as never}`
    if (isIdentifier(name) && written === name) return `{${name}}`
    return `${name}={${written}}`
  }

  private classAttribute(names: readonly ClassName[]): string {
    const parts = names.map((name) =>
      typeof name === 'string'
        ? classReference(name)
        : `${this.sx(name.when)} ? ${classReference(name.name)} : undefined`,
    )
    return parts.length === 1 && typeof names[0] === 'string'
      ? `class={${parts[0]}}`
      : `class={[${parts.join(', ')}]}`
  }

  /** Tokens as one, when together they fit on one line. */
  private fold(tokens: Token[], depth: number): Token[] {
    const whole = tokens.map((token) => token.text).join('')
    if (!whole.includes('\n') && whole.length + depth * 2 <= 100) return [{ text: whole, depth }]
    return tokens
  }

  nodes(nodes: readonly Node[], depth: number): Token[] {
    return nodes.flatMap((node) => this.node(node, depth))
  }

  node(node: Node, depth: number): Token[] {
    switch (node.kind) {
      case 'element':
        return this.element(node, depth)
      case 'member':
        return this.member(node, depth)
      case 'slot':
        return this.slot(node, depth)
      case 'text': {
        if (node.expr !== undefined) return [{ text: `{${this.sx(node.expr)}}`, depth }]
        return [{ text: `{${jsString(node.value ?? '')}}`, depth }]
      }
      case 'if':
        return this.branches(node, depth)
      case 'each': {
        const index = node.index === undefined ? '' : `, ${node.index}`
        const open = `{#each ${this.sx(node.of)} as ${node.as}${index} (${this.sx(node.key)})}`
        return this.fold(
          [
            { text: open, depth },
            ...this.nodes(node.children, depth + 1),
            { text: '{/each}', depth },
          ],
          depth,
        )
      }
      case 'portal':
        return this.fold(
          [
            { text: '<Portal>', depth },
            ...this.nodes(node.children, depth + 1),
            { text: '</Portal>', depth },
          ],
          depth,
        )
      case 'render':
        return [{ text: `<Render node={${this.sx(node.value)}} />`, depth }]
    }
  }

  private branches(node: Extract<Node, { kind: 'if' }>, depth: number): Token[] {
    const tokens: Token[] = []
    node.branches.forEach((branch, at) => {
      tokens.push({ text: `{${at === 0 ? '#if' : ':else if'} ${this.sx(branch.when)}}`, depth })
      tokens.push(...this.nodes(branch.then, depth + 1))
    })
    if (node.otherwise !== undefined) {
      tokens.push({ text: '{:else}', depth })
      tokens.push(...this.nodes(node.otherwise, depth + 1))
    }
    tokens.push({ text: '{/if}', depth })
    return this.fold(tokens, depth)
  }

  private element(node: ElementNode, depth: number): Token[] {
    const sx = this.sx
    const attributes: string[] = []
    let name: string
    if (typeof node.tag === 'string') name = node.tag
    else if (FOUNDATION_COMPONENTS.has(node.tag.expr.trim())) name = node.tag.expr.trim()
    else {
      name = 'svelte:element'
      attributes.push(`this={${sx(node.tag.expr)}}`)
    }
    const isComponent = FOUNDATION_COMPONENTS.has(name)
    if (node.ref !== undefined) {
      if (this.options.listRefs.has(node.ref)) attributes.push(`{@attach ${node.ref}.attach}`)
      else attributes.push(`bind:this={${node.ref}}`)
    }
    const spread = node.spread ?? []
    const handlers = Object.entries(node.on ?? {})
    if (spread.length > 0) {
      // The machine's props and the member's own handlers on one element: merged
      // as Vue merges them, so both run, then written as Svelte's attributes.
      const parts = spread.map(sx)
      if (handlers.length > 0) {
        const entries = handlers.map(([event, handler]) => {
          const { name: dom, capture } = eventName(event)
          const type = EVENT_TYPES[dom] ?? 'Event'
          return `on${capital(dom)}${capture ? 'Capture' : ''}: ${handlerCallback(handler, sx, type)}`
        })
        parts.push(`{ ${entries.join(', ')} }`)
      }
      attributes.push(
        `{...attributes(${parts.length === 1 ? parts[0] : `mergeParts(${parts.join(', ')})`})}`,
      )
    }
    if (node.class && node.class.length > 0) attributes.push(this.classAttribute(node.class))
    for (const [property, expr] of Object.entries(node.geometry ?? {})) {
      attributes.push(`style:${property}={${sx(expr)}}`)
    }
    // Vue's `key` replaces the element when it changes, as `{#key}` does.
    let keyed: string | undefined
    for (const [attribute, expr] of Object.entries(node.attrs ?? {})) {
      if (attribute === 'key') keyed = sx(expr)
      else attributes.push(this.attribute(attribute, expr, !isComponent))
    }
    if (spread.length === 0) {
      for (const [event, handler] of handlers) {
        const { name: dom, capture } = eventName(event)
        const attribute = isComponent ? `on${capital(dom)}` : `on${dom}${capture ? 'capture' : ''}`
        attributes.push(`${attribute}={${handlerCallback(handler, sx)}}`)
      }
    }
    if (keyed !== undefined) {
      return this.fold(
        [
          { text: `{#key ${keyed}}`, depth },
          ...this.element(
            {
              ...node,
              attrs: Object.fromEntries(
                Object.entries(node.attrs ?? {}).filter(([name]) => name !== 'key'),
              ),
            },
            depth + 1,
          ),
          { text: '{/key}', depth },
        ],
        depth,
      )
    }
    const children = node.children ?? []
    if (children.length === 0) {
      if (isComponent || VOID_ELEMENTS.has(name))
        return [{ text: openTag(name, attributes, depth, ' />'), depth }]
      return [{ text: `${openTag(name, attributes, depth, '>')}</${name}>`, depth }]
    }
    // An element whose one child is plain text keeps it as markup.
    const only = children.length === 1 ? children[0] : undefined
    if (only?.kind === 'text' && only.value !== undefined && plainText(only.value)) {
      return [{ text: `${openTag(name, attributes, depth, '>')}${only.value}</${name}>`, depth }]
    }
    return this.fold(
      [
        { text: openTag(name, attributes, depth, '>'), depth },
        ...this.nodes(children, depth + 1),
        { text: `</${name}>`, depth },
      ],
      depth,
    )
  }

  private member(node: MemberNode, depth: number): Token[] {
    const sx = this.sx
    const props = this.options.context.props.get(node.name)
    if (props === undefined)
      throw new Error(`shells: ${node.name} is composed but has no description`)
    for (const name of Object.keys(node.slotWhen ?? {})) {
      if (!(name in (node.slots ?? {}))) {
        throw new Error(`shells: ${node.name}'s slot "${name}" has a condition and no content`)
      }
    }
    const propName = (name: string): string => {
      const found =
        props.find((prop) => prop.name === name) ?? props.find((prop) => prop.local === name)
      if (found === undefined) throw new Error(`shells: ${node.name} has no prop "${name}"`)
      return found.name
    }
    const attributes: string[] = []
    for (const [name, expr] of Object.entries(node.props ?? {})) {
      attributes.push(this.attribute(propName(name), expr))
    }
    for (const [event, handler] of Object.entries(node.on ?? {})) {
      const prop = props.find(
        (candidate) => candidate.kind === 'event' && candidate.event === event,
      )
      if (prop === undefined) throw new Error(`shells: ${node.name} has no event "${event}"`)
      attributes.push(`${prop.name}={${handlerCallback(handler, sx)}}`)
    }
    // A named slot is a snippet declared before the member and passed by name, so
    // its name never shadows one of this member's own; a slot passed only while a
    // condition holds is passed as `undefined` otherwise.
    const before: Token[] = []
    let children: readonly Node[] = []
    for (const [slot, content] of Object.entries(node.slots ?? {})) {
      const condition = node.slotWhen?.[slot]
      if (slot === 'default' && condition === undefined) {
        children = content
        continue
      }
      const prop = props.find((candidate) => candidate.kind === 'slot' && candidate.slot === slot)
      if (prop === undefined) throw new Error(`shells: ${node.name} has no slot "${slot}"`)
      this.snippetCount += 1
      const snippet = `${prop.local}Of${node.name}${this.snippetCount}`
      before.push(
        ...this.fold(
          [
            { text: `{#snippet ${snippet}()}`, depth },
            ...this.nodes(content, depth + 1),
            { text: '{/snippet}', depth },
          ],
          depth,
        ),
      )
      attributes.push(
        condition === undefined
          ? `${prop.name}={${snippet}}`
          : `${prop.name}={${sx(condition)} ? ${snippet} : undefined}`,
      )
    }
    if (children.length === 0) {
      return [...before, { text: openTag(node.name, attributes, depth, ' />'), depth }]
    }
    // A member whose one child is plain text keeps it as markup.
    const only = children.length === 1 ? children[0] : undefined
    if (only?.kind === 'text' && only.value !== undefined && plainText(only.value)) {
      const open = openTag(node.name, attributes, depth, '>')
      return [...before, { text: `${open}${only.value}</${node.name}>`, depth }]
    }
    return [
      ...before,
      ...this.fold(
        [
          { text: openTag(node.name, attributes, depth, '>'), depth },
          ...this.nodes(children, depth + 1),
          { text: `</${node.name}>`, depth },
        ],
        depth,
      ),
    ]
  }

  private slot(node: SlotNode, depth: number): Token[] {
    const sx = this.sx
    const snippet = this.options.snippetOf(node.name)
    const args =
      node.props === undefined
        ? ''
        : `{ ${Object.entries(node.props)
            .map(([name, expr]) => `${key(name)}: ${sx(expr)}`)
            .join(', ')} }`
    const scope = this.options.scoped(node.name)
    const fallback = node.fallback ?? []
    if (scope !== null) {
      // The outlet renders the caller's snippet itself, so it can move a probe's output of the
      // same snippet into place; a slot it renders takes no arguments and has no fallback.
      if (args !== '' || fallback.length > 0) {
        throw new Error(
          `shells: ${this.options.member} reads or passes to its slot "${node.name}", which takes arguments or a fallback`,
        )
      }
      return [{ text: `<SlotOutlet scope={${scope}} snippet={${snippet}} />`, depth }]
    }
    if (fallback.length === 0) return [{ text: `{@render ${snippet}?.(${args})}`, depth }]
    return this.fold(
      [
        { text: `{#if ${snippet}}`, depth },
        { text: `{@render ${snippet}(${args})}`, depth: depth + 1 },
        { text: '{:else}', depth },
        ...this.nodes(fallback, depth + 1),
        { text: '{/if}', depth },
      ],
      depth,
    )
  }
}

/* -------------------------------------------------------------------------- */
/* The states fixture                                                         */
/* -------------------------------------------------------------------------- */

/** What a fixture's code reads, collected as it is written, for its imports and its snippets. */
interface FixtureNeeds {
  members: Set<string>
  recipes: Set<string>
  zag: boolean
  /** The foundation's values a value names (`FIXTURE_VALUES`), which the fixture imports. */
  foundation: Set<string>
  /** Snippets a value holds (`{ node }`, `{ renders }`), declared once at the top level. */
  snippets: string[]
  held: boolean
}

class FixtureWriter {
  private count = 0

  constructor(
    private readonly shell: MemberShell,
    private readonly context: SvelteContext,
    readonly needs: FixtureNeeds,
  ) {}

  /** A fixture value as a JavaScript expression. */
  literal(value: FixtureValue): string {
    if (branded(value, 'js')) {
      const source = (value as { js: string }).js
      if (/(^|[^.\w$])zag\./.test(source)) this.needs.zag = true
      for (const name of fixtureValues(source)) this.needs.foundation.add(name)
      return source
    }
    if (branded(value, 'node')) return this.snippet([], [(value as { node: FixtureChild }).node])
    if (branded(value, 'renders', RENDERS_KEYS)) {
      const { params, renders, when } = value as FixtureRenders
      return this.snippet(params, renderedChildren(renders), when)
    }
    if (branded(value, 'held')) return `held.${(value as { held: string }).held}`
    if (branded(value, 'hold', ['to'])) {
      const { hold, to } = value as { hold: string; to?: FixtureValue }
      return 'to' in value
        ? `() => { held.${hold} = ${this.literal(to)} }`
        : `(value: typeof held.${hold}) => { held.${hold} = value }`
    }
    if (Array.isArray(value)) return `[${value.map((entry) => this.literal(entry)).join(', ')}]`
    if (value !== null && typeof value === 'object') {
      return `{ ${Object.entries(value as Record<string, FixtureValue>)
        .map(([name, entry]) => `${key(name)}: ${this.literal(entry)}`)
        .join(', ')} }`
    }
    return typeof value === 'string' ? jsString(value) : JSON.stringify(value)
  }

  /** A snippet at the top level for a node a value holds, by its name. */
  private snippet(
    params: readonly string[],
    children: readonly FixtureChild[],
    when?: string,
  ): string {
    this.count += 1
    const name = `node${this.count}`
    const drawn = children.map((child) => this.child(child)).join('')
    const content = when === undefined ? drawn : `{#if ${when}}${drawn}{/if}`
    this.needs.snippets.push(`{#snippet ${name}(${params.join(', ')})}${content}{/snippet}`)
    return name
  }

  /** An attribute of a fixture's member or element. */
  private attribute(name: string, value: FixtureValue): string {
    if (typeof value === 'string' && plainAttribute(value)) return `${name}="${value}"`
    return `${name}={${this.literal(value)}}`
  }

  /** Slot content as markup. */
  child(child: FixtureChild): string {
    if (typeof child === 'string') return plainText(child) ? child : `{${jsString(child)}}`
    if ('js' in child) return `{${this.literal(child)}}`
    if ('member' in child) return this.member(child.member, child.props, child.slots, false)
    return this.element(
      child,
      (child.children ?? []).map((entry) => this.child(entry)),
    )
  }

  element(
    element: {
      element: string
      attrs?: Readonly<Record<string, string>>
      class?: readonly string[]
    },
    children: readonly string[],
  ): string {
    const attributes = Object.entries(element.attrs ?? {}).map(([name, value]) =>
      this.attribute(name, value),
    )
    if (element.class !== undefined && element.class.length > 0) {
      const references = element.class.map((name) => {
        this.needs.recipes.add(name.includes('.') ? (name.split('.')[0] as string) : 'styles')
        return classReference(name)
      })
      attributes.unshift(
        `class={${references.length === 1 ? references[0] : `[${references.join(', ')}]`}}`,
      )
    }
    const open =
      attributes.length === 0
        ? `<${element.element}>`
        : `<${element.element} ${attributes.join(' ')}>`
    if (children.length === 0 && VOID_ELEMENTS.has(element.element))
      return open.replace(/>$/, ' />')
    return `${open}${children.join('')}</${element.element}>`
  }

  /** A member with its props, its slots, and the runner's overrides when it takes them. */
  member(
    name: string,
    props: Readonly<Record<string, FixtureValue>> | undefined,
    slots: Readonly<Record<string, readonly FixtureChild[]>> | undefined,
    overrides: boolean,
    /** Markup after the member's own default slot content: a layout member's instances. */
    inner = '',
  ): string {
    this.needs.members.add(name)
    const declared = this.context.props.get(name)
    if (declared === undefined)
      throw new Error(`shells: a fixture renders ${name}, which has no description`)
    const attributes = Object.entries(props ?? {}).map(([prop, value]) => {
      if (!declared.some((candidate) => candidate.name === prop)) {
        throw new Error(
          `shells: ${this.shell.member}'s fixture gives ${name} "${prop}", which is not its prop`,
        )
      }
      return this.attribute(prop, value)
    })
    if (overrides) attributes.push('{...overrides}')
    let children = ''
    const named: string[] = []
    for (const [slot, content] of Object.entries(slots ?? {})) {
      const markup = content.map((entry) => this.child(entry)).join('')
      if (slot === 'default') {
        children = markup
        continue
      }
      const prop = declared.find(
        (candidate) => candidate.kind === 'slot' && candidate.slot === slot,
      )
      if (prop === undefined) throw new Error(`shells: ${name} has no slot "${slot}"`)
      named.push(`{#snippet ${prop.name}()}${markup}{/snippet}`)
    }
    children += inner
    const open = attributes.length === 0 ? `<${name}` : `<${name} ${attributes.join(' ')}`
    if (children === '' && named.length === 0) return `${open} />`
    return `${open}>${named.join('')}${children}</${name}>`
  }
}

/**
 * One entry's snippet: the member with the runner's overrides spread over the
 * fixture's own props, after the content the entry puts before it, inside its
 * layout member when it renders several, and inside a `Held` when it holds
 * values, types into a field, presses a control or selects words.
 */
function entryMarkup(shell: MemberShell, entry: StateEntry, writer: FixtureWriter): string {
  // Content before the member needs no holder; held values, typing, pressing and selecting do.
  const stateful =
    entry.holds !== undefined ||
    entry.types !== undefined ||
    entry.presses !== undefined ||
    entry.selects !== undefined
  const before = (entry.before ?? []).map((child) => writer.child(child)).join('')
  const subject = entrySubject(shell, entry)
  let body: string
  if (entry.many !== undefined) {
    const instances = entry.many.each
      .map((instance: FixtureInstance, at) =>
        writer.member(subject, instance.props, instance.slots, at === 0),
      )
      .join('')
    const also = (entry.many.also ?? []).map((child) => writer.child(child)).join('')
    const content = `${before}${instances}${also}`
    const within = entry.many.within
    body =
      'element' in within
        ? writer.element(within, [content])
        : writer.member(within.member, within.props, undefined, false, content)
  } else {
    body = `${before}${writer.member(subject, entry.props, entry.slots, true)}`
  }
  if (!stateful && body.includes('held.')) {
    throw new Error(`shells: ${shell.member}'s "${entry.name}" reads a held value it does not hold`)
  }
  if (!stateful) return body
  writer.needs.held = true
  const props = [`initial={${writer.literal(entry.holds ?? {})}}`]
  if (entry.types !== undefined) {
    props.push(
      `types={{ into: ${jsString(entry.types.into)}, text: ${jsString(entry.types.text)}, frames: ${TYPING_FRAMES} }}`,
    )
  }
  if (entry.presses !== undefined) {
    props.push(`presses={{ at: ${jsString(entry.presses)}, frames: ${TYPING_FRAMES} }}`)
  }
  if (entry.selects !== undefined) {
    props.push(
      `selects={{ in: ${jsString(entry.selects.in)}, text: ${jsString(entry.selects.text)}, frames: ${TYPING_FRAMES}, delay: ${SELECT_DELAY_MS} }}`,
    )
  }
  // An entry that only presses, types or selects holds no value, and an unread parameter fails
  // the check.
  const reads = body.includes('held.') ? 'held' : ''
  return `<Held ${props.join(' ')}>{#snippet children(${reads})}${body}{/snippet}</Held>`
}

export function renderSvelteStates(
  shell: MemberShell,
  component: RegistryMemberLike,
  context: SvelteContext,
): string {
  const needs: FixtureNeeds = {
    members: new Set([shell.member]),
    recipes: new Set(),
    zag: false,
    foundation: new Set(),
    snippets: [],
    held: false,
  }
  const writer = new FixtureWriter(shell, context, needs)
  const entries = [...gridEntries(shell, component), ...shell.states]
  const snippets: string[] = []
  const fields: string[] = []
  let overriding = false
  entries.forEach((entry, at) => {
    const name = `entry${at + 1}`
    const markup = entryMarkup(shell, entry, writer)
    const takesOverrides = markup.includes('{...overrides}')
    overriding ||= takesOverrides
    snippets.push(
      `{#snippet ${name}(${takesOverrides ? 'overrides: Overrides' : ''})}${markup}{/snippet}`,
    )
    const entryFields = [`name: ${jsString(entry.name)}`, `render: ${name}`]
    if (entry.expect) {
      entryFields.push(
        `expect: { ${Object.entries(entry.expect)
          .map(
            ([attribute, value]) =>
              `${key(attribute)}: ${value === null ? 'null' : jsString(value)}`,
          )
          .join(', ')} }`,
      )
    }
    if (entry.rendersNothing) entryFields.push('rendersNothing: true')
    fields.push(`{ ${entryFields.join(', ')} }`)
  })

  const lines = [
    '/**',
    ` * ${shell.member}'s states fixture, with the React fixture's entry names, so a`,
    " * contract's `when <state>` names the same entry in every shell. Each entry is a",
    ' * snippet that takes the props the conformance runner sets on the member.',
    ' *',
    ` * Generated by \`pnpm shells\` from \`${context.source}\`. Never edit it by hand.`,
    ' */',
  ]
  if (needs.zag) {
    if (shell.machine === undefined) {
      throw new Error(`shells: ${shell.member}'s fixture reads \`zag\`, and it binds no machine`)
    }
    lines.push(`import * as zag from '@zag-js/${shell.machine.of}'`, '')
  }
  const foundation: string[] = []
  const memberLines: string[] = []
  for (const name of [...needs.members].sort()) {
    const location = context.locations.get(name)
    if (location === undefined)
      throw new Error(`shells: ${name} is composed but has no description`)
    if (location.home === 'foundation') foundation.push(name)
    else
      memberLines.push(
        `import ${name} from '${relativeFile(shell.fixtureDir ?? shell.dir, location.dir, `${name}.svelte`)}'`,
      )
  }
  if (needs.held) foundation.push('Held')
  // The values a fixture's JavaScript names (`toast`, `Time`).
  foundation.push(...needs.foundation)
  const types = ['type ComponentStates', ...(overriding ? ['type Overrides'] : [])]
  lines.push(`import { ${[...foundation.sort(), ...types].join(', ')} } from '@polymorph/svelte'`)
  lines.push(...memberLines)
  for (const binding of [...needs.recipes].sort()) {
    const recipe = binding === 'styles' ? shell.recipe : shell.recipes?.[binding]
    if (recipe === undefined || recipe === null) {
      throw new Error(
        `shells: ${shell.member}'s fixture names the recipe "${binding}", which it has not`,
      )
    }
    lines.push(`import ${binding} from '@polymorph/recipes/${recipe}.module.css'`)
  }
  lines.push('')
  // The types the fixture's values name (DataTable's rows), declared once for every entry.
  for (const [name, type] of Object.entries(shell.fixtureTypes ?? {})) {
    lines.push(`type ${name} = ${type}`, '')
  }
  lines.push('export const states: ComponentStates = {')
  lines.push(`  component: '${shell.member}',`)
  lines.push(`  entries: [${fields.join(', ')}],`)
  lines.push('}')

  const markup = [...needs.snippets, ...snippets]
  return [
    '<script module lang="ts">',
    lines.join('\n'),
    '</script>',
    '',
    markup.join('\n'),
    '',
  ].join('\n')
}

/* -------------------------------------------------------------------------- */
/* The index and the galleries                                                */
/* -------------------------------------------------------------------------- */

export function renderSvelteIndex(shells: readonly MemberShell[]): string {
  const lines = [
    '/**',
    ' * `@polymorph/svelte-ui`, the closed vocabulary for Svelte.',
    ' *',
    ' * Every member is a Svelte 5 component generated by `pnpm shells` from its',
    ' * framework-neutral description (`packages/shells/src/members/`), and takes the',
    " * React member's props by the mapping in `docs/frameworks.md`. The base layer is",
    ' * imported for its side effect, as the React vocabulary does.',
    ' *',
    ' * Generated by `pnpm shells`. Never edit it by hand.',
    ' */',
    '',
    "import '@polymorph/recipes/base.css'",
    '',
    "export { gallerySlug, lawfulCells } from '@polymorph/svelte'",
    `export type { ${['ComponentStates', 'StateEntry', ...foundationTypeExports('svelte')].join(', ')} } from '@polymorph/svelte'`,
    '',
  ]
  for (const shell of [...shells].sort((a, b) => a.member.localeCompare(b.member))) {
    const types = [`${shell.member}Props`, ...Object.keys(shell.types ?? {})].sort()
    if ((shell.home ?? 'vocabulary') === 'foundation') {
      lines.push(`export { ${shell.member} } from '@polymorph/svelte'`)
      lines.push(`export type { ${types.join(', ')} } from '@polymorph/svelte'`)
      continue
    }
    const file = `./${shell.dir}/${shell.member}.svelte`
    const parts = (shell.parts ?? []).filter((part) => part.public)
    if (parts.length === 0) {
      lines.push(`export { default as ${shell.member} } from '${file}'`)
    } else {
      // A compound part is a property of its member: `<Tabs.Content>`.
      lines.push(`import ${shell.member}Root from '${file}'`)
      for (const part of parts) {
        lines.push(
          `import ${shell.member}${part.name} from './${shell.dir}/${shell.member}${part.name}.svelte'`,
        )
      }
      // Pure, so an application that never uses the member drops it and its parts.
      lines.push(
        `export const ${shell.member} = /* @__PURE__ */ Object.assign(${shell.member}Root, { ${parts
          .map((part) => `${part.name}: ${shell.member}${part.name}`)
          .join(', ')} })`,
      )
      for (const part of parts) {
        lines.push(
          `export type { ${shell.member}${part.name}Props } from './${shell.dir}/${shell.member}${part.name}.svelte'`,
        )
      }
    }
    lines.push(`export type { ${types.join(', ')} } from '${file}'`)
  }
  lines.push('')
  return lines.join('\n')
}

export function renderSvelteGalleries(shells: readonly MemberShell[]): string {
  const lines = [
    '/**',
    ' * Every states fixture in the Svelte vocabulary, for the laws. A separate module',
    ' * from the index, so an application never bundles the fixtures.',
    ' *',
    ' * Generated by `pnpm shells`. Never edit it by hand.',
    ' */',
    "import type { ComponentStates } from '@polymorph/svelte'",
    '',
  ]
  const bindings = shells.map((shell) => ({
    shell,
    binding: `${shell.member.charAt(0).toLowerCase()}${shell.member.slice(1)}States`,
  }))
  for (const { shell, binding } of bindings) {
    lines.push(
      `import { states as ${binding} } from './${shell.fixtureDir ?? shell.dir}/${fixtureName(shell)}.states.svelte'`,
    )
  }
  lines.push('')
  lines.push(
    `export const GALLERIES: readonly ComponentStates[] = [${bindings.map(({ binding }) => binding).join(', ')}]`,
  )
  lines.push('')
  return lines.join('\n')
}

/* -------------------------------------------------------------------------- */
/* The target                                                                 */
/* -------------------------------------------------------------------------- */

/** What every member's rendering reads from the whole set of descriptions. */
export function svelteContext(
  registry: Registry,
  shells: readonly MemberShell[],
): Omit<SvelteContext, 'source'> {
  const props = new Map<string, readonly SvelteProp[]>()
  const passed = new Set<string>()
  const readFromChild = new Set<string>()
  for (const shell of shells) {
    const component = registryMember(registry, shell.member)
    props.set(shell.member, svelteInterface(component).props)
    for (const part of shell.parts ?? []) {
      const rendered = partShell(shell, part, component)
      props.set(`${shell.member}${part.name}`, svelteInterface(rendered.component).props)
    }
    const templates = [shell.template, ...(shell.parts ?? []).map((part) => part.template)].flatMap(
      (template) => (Array.isArray(template) ? (template as Node[]) : [template as Node]),
    )
    for (const node of allNodes(templates)) {
      if (node.kind !== 'slot' || node.pass === undefined) continue
      for (const [name, expr] of Object.entries(node.pass)) {
        passed.add(name)
        for (const match of expr.matchAll(/\bchild\.(\w+)/g)) readFromChild.add(match[1] as string)
      }
    }
    const sources = [
      ...templateExpressions(templates),
      ...Object.values(shell.derived ?? {}),
      ...(shell.parts ?? []).flatMap((part) => Object.values(part.derived ?? {})),
    ]
    for (const expr of sources) {
      for (const match of expr.matchAll(/\bslotted\(\s*slots\.\w+\s*\)\.props\.(\w+)/g))
        readFromChild.add(match[1] as string)
    }
  }
  return {
    locations: locations(shells),
    owners: typeOwners(shells),
    props,
    passed,
    readFromChild,
    nodeCalls: nodeFunctions(shells),
  }
}

/**
 * Every file the Svelte renderer writes, before formatting: each member's
 * component and states fixture, the vocabulary's index and galleries, and the
 * foundation's glyph data and Icon stylesheet, which are the Vue foundation's.
 */
export function renderSvelteFiles(
  registry: Registry,
  shells: readonly MemberShell[],
  icon: { glyphs: string; stylesheet: string },
): Map<string, string> {
  const shared = svelteContext(registry, shells)
  const files = new Map<string, string>()
  for (const shell of shells) {
    const component = registryMember(registry, shell.member)
    const context: SvelteContext = { ...shared, source: descriptionPath(shell) }
    files.set(svelteComponentPath(shell), renderSvelteMember(shell, component, context))
    for (const part of shell.parts ?? []) {
      const rendered = partShell(shell, part, component)
      files.set(
        sveltePartPath(shell, part.name),
        renderSvelteMember(rendered.shell, rendered.component, context, shell.member),
      )
    }
    if (!isPrimitive(registry, shell.member)) {
      files.set(svelteStatesPath(shell), renderSvelteStates(shell, component, context))
    }
  }
  files.set(`${SVELTE_VOCABULARY_SRC}/index.ts`, renderSvelteIndex(shells))
  files.set(
    `${SVELTE_VOCABULARY_SRC}/galleries.ts`,
    renderSvelteGalleries(shells.filter((shell) => !isPrimitive(registry, shell.member))),
  )
  files.set(`${SVELTE_FOUNDATION_SRC}/icon/glyphs.ts`, icon.glyphs)
  files.set(`${SVELTE_FOUNDATION_SRC}/icon/icon.module.css`, icon.stylesheet)
  return files
}

/**
 * A Svelte component's scripts formatted by Prettier as TypeScript, and its
 * markup as the renderer laid it out: Prettier has no parser for Svelte here,
 * and the markup's layout is part of what it means (no whitespace between
 * nodes). Every other file is formatted by Prettier by its path.
 */
export async function formatSvelteFile(root: string, path: string, text: string): Promise<string> {
  const file = resolve(root, path)
  const config = (await prettier.resolveConfig(file.replace(/\.svelte$/, '.ts'))) ?? {}
  if (!path.endsWith('.svelte')) return prettier.format(text, { ...config, filepath: file })
  const scripts = /<script\b[^>]*>\n([\s\S]*?)\n<\/script>/g
  let out = ''
  let at = 0
  for (const match of text.matchAll(scripts)) {
    const start = match.index ?? 0
    out += text.slice(at, start)
    const open = match[0].slice(0, match[0].indexOf('>') + 1)
    const formatted = await prettier.format(match[1] as string, { ...config, parser: 'typescript' })
    out += `${open}\n${formatted}</script>`
    at = start + match[0].length
  }
  return out + text.slice(at)
}
