import ts from 'typescript'

import { gallerySlug } from '@polymorph/engine'
import type { Registry } from '@polymorph/registry'
import { unionParts, vueBinding } from '@polymorph/registry/frameworks'

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
import { FIXTURE_VALUES } from './dsl'
import {
  branded,
  camel,
  capital,
  checkHolding,
  checkSlots,
  childLists,
  classReference,
  composed,
  descriptionPath,
  EVENT_TYPES,
  fixtureName,
  foundationTypeExports,
  gridEntries,
  handlerExpressions,
  holds,
  isFactory,
  isFunctionType,
  isIdentifier,
  isPrimitive,
  jsString,
  key,
  locations,
  partShell,
  presenceEntries,
  presenceExpressions,
  registryMember,
  relativeFile,
  renderedChildren,
  RENDERS_KEYS,
  type FixtureRenders,
  statement,
  staticString,
  templateClassNames,
  templateExpressions,
  typeOwners,
  typeParameters,
  pressStatements,
  selectStatements,
  TYPING_FRAMES,
  usesNode,
  walk,
  withAgent,
  wrapDoc,
  type Location,
  type RegistryMemberLike,
} from './common'
import { freeNames } from './expr'
import { ENGINE_HELPERS, FOUNDATION_TYPES, renderParameter, rewriteType } from './types'

/**
 * The Solid renderer: a member's description, written as a Solid component
 * (`.tsx`), its states fixture and the vocabulary's index.
 *
 * A Solid member takes the React member's props by their React names, because
 * a Solid component's props are an object as React's are: `aria-label` is
 * `aria-label`, an `onFoo` prop is a callback prop of the same name called
 * with the React callback's arguments, `children` and every node prop are
 * `JSX.Element` props, and a render prop is a function prop that returns one.
 * Which prop is which comes from the registry through `vueBinding`
 * (`@polymorph/registry/frameworks`), the reading the Vue shell and the screen
 * emitter use, so every shell agrees about a prop.
 *
 * A Solid component runs once. Every value the description derives is a memo,
 * every value it holds is a signal behind a `.value` cell (so a description's
 * assignment `copied = true` is written as it is), every element it names is a
 * signal set by its `ref`, and the props are read through `props.<name>` and
 * never destructured. The anatomy becomes JSX, its conditions conditional
 * expressions (`{a ? <A /> : null}`), its loops the foundation's keyed
 * `<Each>`, its portals Solid's `<Portal>`.
 *
 * Output is deterministic: the same description and registry give the same
 * bytes, which the freshness law (`shells.test.ts`) relies on.
 */

/** Where the Solid vocabulary's generated files go. */
export const SOLID_VOCABULARY_SRC = 'packages/solid-ui/src'
/** Where the Solid foundation's generated files go. */
export const SOLID_FOUNDATION_SRC = 'packages/solid/src'

/** Where every described member's file is, for imports between them. */
export interface SolidContext {
  locations: ReadonlyMap<string, Location>
  /** The component that declares each shared type, by the type's name. */
  owners: ReadonlyMap<string, string>
  /** The description's file, for the generated header. */
  source: string
  /** Another described member's registry entry, for what a fixture must pass it. */
  lookup?: (name: string) => RegistryMemberLike | undefined
  /** Every type the descriptions declare (`types`), by name, for what a prop's type holds. */
  types?: ReadonlyMap<string, string>
}

/** A member's component file. */
export function solidComponentPath(shell: MemberShell): string {
  const root =
    (shell.home ?? 'vocabulary') === 'foundation' ? SOLID_FOUNDATION_SRC : SOLID_VOCABULARY_SRC
  return `${root}/${shell.dir}/${shell.member}.tsx`
}

/** A compound part's component file. */
export function solidPartPath(shell: MemberShell, part: string): string {
  return `${SOLID_VOCABULARY_SRC}/${shell.dir}/${shell.member}${part}.tsx`
}

/** A member's states fixture. */
export function solidStatesPath(shell: MemberShell): string {
  return `${SOLID_VOCABULARY_SRC}/${shell.fixtureDir ?? shell.dir}/${fixtureName(shell)}.states.tsx`
}

/** A prop read: `props.label`, `props['aria-label']`. */
const access = (target: string, name: string) =>
  isIdentifier(name) ? `${target}.${name}` : `${target}['${name}']`

/**
 * The foundation's helpers an expression may call, imported from
 * `@polymorph/solid`: the engine's framework-free conventions, which it
 * re-exports and the React and Vue members import too, and its own.
 */
const FOUNDATION_HELPERS = new Set([
  ...ENGINE_HELPERS,
  'Glyph',
  'BrandMark',
  'PageTransition',
  // A function run once the pending changes are in the document.
  'afterRender',
  // The toast store's, which Toast's viewport and FormField's notice read and write.
  'toast',
  'getToasts',
  'subscribeToasts',
  'removeToast',
])

/**
 * The JavaScript built-ins a description calls with a value (`String(entry)`).
 * Each reads the value and keeps nothing, so a loop's item reaches it as the
 * row reads it.
 */
const BUILT_INS = new Set(['Array', 'Boolean', 'JSON', 'Math', 'Number', 'Object', 'String'])

/**
 * The foundation's module each convention a member inside the foundation
 * (`Icon`) reads comes from: it cannot import the foundation's index, which
 * imports it back.
 */
const FOUNDATION_MODULES: Readonly<Record<string, string>> = {
  claimSlot: 'slotted',
  scope: 'slotted',
  createCell: 'cells',
  createDerived: 'cells',
  createKept: 'cells',
  afresh: 'hydration',
  elementRef: 'cells',
  classes: 'merge',
  mergeParts: 'merge',
  Defaults: 'cells',
}

/** Whether static text can be written as JSX text as it is. */
const plainText = (value: string) => value !== '' && !/[{}<>&"'\n\r\t]|^\s|\s$/.test(value)

/** A static attribute: `name="value"` where JSX reads it unchanged, else a string expression. */
const staticAttribute = (name: string, value: string) =>
  plainText(value) || (value !== '' && !/["{}\\\n]/.test(value) && !/^\s|\s$/.test(value))
    ? `${name}="${value}"`
    : `${name}={${jsString(value)}}`

/** Static text as JSX writes it. */
const staticText = (value: string) => (plainText(value) ? value : `{${jsString(value)}}`)

/**
 * Attributes the React and Vue members write that Solid's element types do not
 * list: SVG's `focusable`, which keeps an inline SVG out of an old browser's
 * tab order.
 */
const UNLISTED_ATTRIBUTES = new Set(['focusable'])

/**
 * An element's handler key: `onkeydown`, and `oncapture:contextmenu` for Vue's
 * `contextmenu.capture`, the key Solid listens to in the capture phase. Solid's
 * element types list no `oncapture:` key, so the renderer writes one in a
 * spread. Any other modifier is refused.
 */
function handlerKey(event: string): { name: string; key: string; capture: boolean } {
  const [name = event, ...modifiers] = event.split('.')
  for (const modifier of modifiers) {
    if (modifier !== 'capture')
      throw new Error(`shells: the event modifier "${modifier}" has no Solid spelling`)
  }
  const capture = modifiers.includes('capture')
  return { name, key: capture ? `oncapture:${name}` : `on${name}`, capture }
}

/* -------------------------------------------------------------------------- */
/* The member's interface: props, callbacks and node props from the registry   */
/* -------------------------------------------------------------------------- */

interface SolidProp {
  /** The registry's name, which is the Solid prop's name. */
  name: string
  type: string
  optional: boolean
  doc?: string
  kind: 'prop' | 'event' | 'slot' | 'scoped-slot'
  /** For an event or a slot, the name the description uses for it (`checkedChange`, `default`). */
  binding: string
  /** An event whose type is a union of function types (single or multiple). */
  union: boolean
}

interface SolidInterface {
  props: SolidProp[]
  /** Type names the interface references. */
  names: Set<string>
}

/**
 * A React prop's type for a Solid member: the shared rewrite (`types.ts`),
 * with a React ref as the function a Solid caller passes (`controlRef`), and
 * a description's `VNode` as Solid's `JSX.Element`.
 */
const solidType = (text: string) =>
  text
    .replace(/\bRef<([^<>]+?) \| null>/g, '(element: $1 | null) => void')
    .replace(/\bVNode\b/g, 'JSX.Element')

const NODE_TYPES = new Set(['VNode', 'ReactNode', 'ReactElement', 'JSX.Element'])

/**
 * Whether a value of this type may hold a node the caller creates: the type
 * names a node, in itself or through a type a description declares or another
 * member's props (ListPage's `emptyState` is EmptyState's props, whose action
 * is a node). A function's type is not read, because a function a caller
 * passes creates its nodes when the member calls it, and not when the prop is
 * read.
 */
function holdsNode(
  type: string,
  declared: (name: string) => string | undefined,
  lookup: SolidContext['lookup'],
  seen = new Set<string>(),
): boolean {
  const source = ts.createSourceFile('type.ts', `type T = ${type}`, ts.ScriptTarget.Latest, true)
  let found = false
  const visit = (node: ts.Node): void => {
    if (found) return
    if (ts.isFunctionTypeNode(node) || ts.isConstructorTypeNode(node) || ts.isMethodSignature(node))
      return
    if (ts.isTypeReferenceNode(node)) {
      const name = node.typeName.getText(source)
      if (NODE_TYPES.has(name)) {
        found = true
        return
      }
      if (!seen.has(name)) {
        seen.add(name)
        const definition = declared(name)
        if (definition !== undefined && holdsNode(definition, declared, lookup, seen)) {
          found = true
          return
        }
        const member = /^(\w+)Props$/.exec(name)?.[1]
        const entry = member === undefined ? undefined : lookup?.(member)
        const holds = (entry?.props ?? []).some((prop) => {
          if (prop.name.includes('.')) return false
          const kind = vueBinding(prop).kind
          return (
            kind === 'slot' ||
            (kind === 'prop' && holdsNode(rewriteType(prop.type).text, declared, lookup, seen))
          )
        })
        if (holds) {
          found = true
          return
        }
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return found
}

/** A member's props, by the registry; a prop listed under a part's name (`Group.title`) is the part's. */
export function solidInterface(component: RegistryMemberLike): SolidInterface {
  const result: SolidInterface = { props: [], names: new Set() }
  for (const prop of component.props) {
    if (prop.name.includes('.')) continue
    const binding = vueBinding(prop)
    const base = {
      name: prop.name,
      optional: prop.optional,
      ...(prop.doc ? { doc: prop.doc } : {}),
      binding: binding.name,
      union: false,
    }
    if (binding.kind === 'prop' || binding.kind === 'event') {
      const printed = rewriteType(prop.type)
      printed.names.forEach((name) => result.names.add(name))
      result.props.push({
        ...base,
        kind: binding.kind,
        type: solidType(printed.text),
        union: binding.kind === 'event' && unionParts(prop.type).length > 1,
      })
    } else if (binding.kind === 'slot') {
      result.props.push({ ...base, kind: 'slot', type: 'JSX.Element' })
    } else {
      const parameter = renderParameter(prop.type)
      parameter?.names.forEach((name) => result.names.add(name))
      result.props.push({
        ...base,
        kind: 'scoped-slot',
        type: `(${parameter === null ? '' : `arg: ${solidType(parameter.text)}`}) => JSX.Element`,
      })
    }
  }
  result.names.delete('Ref')
  return result
}

/* -------------------------------------------------------------------------- */
/* Imports between members                                                    */
/* -------------------------------------------------------------------------- */

/** The imports a file needs for the members it composes: relative modules, and foundation names. */
function memberImports(
  names: Iterable<string>,
  fromDir: string,
  fromHome: 'vocabulary' | 'foundation',
  context: SolidContext,
): { lines: string[]; foundation: string[] } {
  const lines: string[] = []
  const foundation: string[] = []
  for (const name of [...names].sort()) {
    const location = context.locations.get(name)
    if (location === undefined)
      throw new Error(`shells: ${name} is composed but has no description`)
    if (location.home === 'foundation' && fromHome === 'vocabulary') foundation.push(name)
    else lines.push(`import ${name} from '${relativeFile(fromDir, location.dir, name)}'`)
  }
  return { lines, foundation }
}

/* -------------------------------------------------------------------------- */
/* Expressions                                                                */
/* -------------------------------------------------------------------------- */

/**
 * What a loop's name is where an expression reads it: a row's item, which
 * the foundation's `Each` hands as a view of the latest item of its key; a
 * value read as it is (the item and index a key function is called with); or
 * a row's index, an accessor.
 */
type Loop = 'item' | 'value' | 'index'

/** How the scope's names read in the component. */
interface Spelling {
  /** A free name's spelling, or `null` to leave it. */
  name(name: string): string | null
  /** `emit('x', …)` and `invoke('x', …)`: the callback's read, by the description's event name. */
  callback(event: string): string
  /** `slots.x`: whether the caller filled it. */
  filled(slot: string): string
  /** `slotted(slots.x)`, `slotText(slots.x)` and `slotNode(slots.x)`. */
  slot(slot: string, read: 'slotted' | 'text' | 'node'): string
  /**
   * `slotNode(slots.x, arg)` and `slotDraws(slots.x, arg)` for a render prop: the
   * call's head, up to its argument (`drawSlot(props.x, `).
   */
  scoped(slot: string, call: 'node' | 'draws'): string
  /** `listening.x`: whether the caller handles the event. */
  listening(event: string): string
  /**
   * A loop's item handed to a call: `itemOf(row)` where the row reads the item
   * through the foundation's view, so the callee gets the caller's own object;
   * `null` for any other name.
   */
  item(name: string): string | null
  /**
   * Whether a call through a free name may hand its arguments on: `false` for a
   * JavaScript built-in or a foundation helper (`String(entry)`), which reads
   * a value and keeps nothing.
   */
  hands(name: string): boolean
}

/**
 * A description's expression, written for Solid. It parses the expression with
 * TypeScript, as `expr.ts` does, so a property name, an object key and a name
 * an arrow function binds are left alone, and rewrites the scope: each free
 * name by `spelling.name`, `emit` and `invoke` as calls of the callback prop,
 * the slot and listening reads, and a loop's item passed bare to a call by
 * `spelling.item`.
 */
function solidExpr(expr: Expr, spelling: Spelling): string {
  const text = `(${expr})`
  const source = ts.createSourceFile('expr.ts', text, ts.ScriptTarget.ESNext, true)
  const statement = source.statements[0]
  if (
    statement === undefined ||
    !ts.isExpressionStatement(statement) ||
    source.statements.length !== 1
  ) {
    throw new Error(`shells: "${expr}" is not one expression`)
  }
  const edits: { start: number; end: number; text: string }[] = []

  const bindingNames = (name: ts.BindingName, into: Set<string>) => {
    if (ts.isIdentifier(name)) into.add(name.text)
    else
      for (const element of name.elements)
        if (!ts.isOmittedExpression(element)) bindingNames(element.name, into)
  }

  const slotOf = (node: ts.Node | undefined, bound: ReadonlySet<string>): string | null =>
    node !== undefined &&
    ts.isPropertyAccessExpression(node) &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === 'slots' &&
    !bound.has('slots')
      ? node.name.text
      : null

  /** Whether a call hands its arguments on: through a name it binds, or as `spelling.hands` says. */
  const hands = (callee: ts.Expression, bound: ReadonlySet<string>): boolean => {
    let root: ts.Expression = callee
    while (
      ts.isPropertyAccessExpression(root) ||
      ts.isElementAccessExpression(root) ||
      ts.isCallExpression(root) ||
      ts.isNonNullExpression(root) ||
      ts.isParenthesizedExpression(root)
    ) {
      root = root.expression
    }
    return !ts.isIdentifier(root) || bound.has(root.text) || spelling.hands(root.text)
  }

  /** A call's argument: a bare loop item, handed on, as `spelling.item` writes it; else visited. */
  const visitArgument = (
    argument: ts.Expression,
    bound: ReadonlySet<string>,
    handed: boolean,
  ): void => {
    const item =
      handed && ts.isIdentifier(argument) && !bound.has(argument.text)
        ? spelling.item(argument.text)
        : null
    if (item === null) visit(argument, bound)
    else edits.push({ start: argument.getStart(source), end: argument.getEnd(), text: item })
  }

  const visit = (node: ts.Node, bound: ReadonlySet<string>): void => {
    if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
      const inner = new Set(bound)
      for (const parameter of node.parameters) bindingNames(parameter.name, inner)
      for (const parameter of node.parameters) {
        if (parameter.initializer) visit(parameter.initializer, bound)
        if (parameter.type) visit(parameter.type, inner)
      }
      if (node.type) visit(node.type, inner)
      visit(node.body, inner)
      return
    }
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      const callee = node.expression.text
      const [first, second] = node.arguments
      if (
        (callee === 'emit' || callee === 'invoke') &&
        !bound.has(callee) &&
        first !== undefined &&
        ts.isStringLiteral(first)
      ) {
        const replaced = `${spelling.callback(first.text)}(`
        if (second === undefined) {
          edits.push({ start: node.getStart(source), end: first.getEnd(), text: replaced })
          // The trailing comma, if any, goes with the arguments it separated.
        } else {
          edits.push({ start: node.getStart(source), end: second.getStart(source), text: replaced })
        }
        for (const argument of node.arguments.slice(1)) visitArgument(argument, bound, true)
        return
      }
      if (
        (callee === 'slotNode' || callee === 'slotDraws') &&
        !bound.has(callee) &&
        second !== undefined
      ) {
        // A render prop drawn with its argument, or whether it draws anything for it.
        const slot = slotOf(first, bound)
        if (slot === null) throw new Error(`shells: ${callee}() reads "${expr}", not a slot`)
        edits.push({
          start: node.getStart(source),
          end: second.getStart(source),
          text: spelling.scoped(slot, callee === 'slotNode' ? 'node' : 'draws'),
        })
        for (const argument of node.arguments.slice(1)) visitArgument(argument, bound, true)
        return
      }
      if (
        (callee === 'slotted' || callee === 'slotText' || callee === 'slotNode') &&
        !bound.has(callee)
      ) {
        const slot = slotOf(first, bound)
        if (slot === null) throw new Error(`shells: ${callee}() reads "${expr}", not a slot`)
        edits.push({
          start: node.getStart(source),
          end: node.getEnd(),
          text: spelling.slot(
            slot,
            callee === 'slotted' ? 'slotted' : callee === 'slotText' ? 'text' : 'node',
          ),
        })
        return
      }
    }
    if (ts.isCallExpression(node)) {
      visit(node.expression, bound)
      for (const type of node.typeArguments ?? []) visit(type, bound)
      const handed = hands(node.expression, bound)
      for (const argument of node.arguments) visitArgument(argument, bound, handed)
      return
    }
    if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression)) {
      const slot = slotOf(node, bound)
      if (slot !== null) {
        edits.push({
          start: node.getStart(source),
          end: node.getEnd(),
          text: spelling.filled(slot),
        })
        return
      }
      if (node.expression.text === 'listening' && !bound.has('listening')) {
        edits.push({
          start: node.getStart(source),
          end: node.getEnd(),
          text: spelling.listening(node.name.text),
        })
        return
      }
    }
    if (ts.isShorthandPropertyAssignment(node)) {
      const name = node.name.text
      const mapped = bound.has(name) ? null : spelling.name(name)
      if (mapped !== null && mapped !== name) {
        edits.push({
          start: node.name.getStart(source),
          end: node.name.getEnd(),
          text: `${name}: ${mapped}`,
        })
      }
      return
    }
    if (ts.isIdentifier(node)) {
      const parent = node.parent
      if (ts.isPropertyAccessExpression(parent) && parent.name === node) return
      if (ts.isPropertyAssignment(parent) && parent.name === node) return
      if (ts.isParameter(parent) && parent.name === node) return
      if ((ts.isPropertySignature(parent) || ts.isMethodSignature(parent)) && parent.name === node)
        return
      if (ts.isQualifiedName(parent) && parent.right === node) return
      if (bound.has(node.text)) return
      const mapped = spelling.name(node.text)
      if (mapped !== null && mapped !== node.text) {
        edits.push({ start: node.getStart(source), end: node.getEnd(), text: mapped })
      }
      return
    }
    ts.forEachChild(node, (child) => visit(child, bound))
  }
  visit(statement.expression, new Set())

  let out = text
  for (const edit of edits.sort((a, b) => b.start - a.start)) {
    out = out.slice(0, edit.start) + edit.text + out.slice(edit.end)
  }
  return out.slice(1, -1)
}

/* -------------------------------------------------------------------------- */
/* The component                                                              */
/* -------------------------------------------------------------------------- */

/** The variable a slot is read into: `childrenSlot`, `footerSlot`. */
const slotVariable = (prop: string) => `${camel(prop)}Slot`

/** A node's own expressions, without its children's. */
const ownExpressions = (node: Node): Expr[] => {
  switch (node.kind) {
    case 'element':
    case 'portal':
      return templateExpressions([{ ...node, children: [] }])
    case 'member':
      return templateExpressions([{ ...node, slots: {} }])
    case 'slot':
      return templateExpressions([{ ...node, fallback: [] }])
    case 'if':
      return node.branches.map((branch) => branch.when)
    case 'each':
      return [node.of, node.key]
    default:
      return templateExpressions([node])
  }
}

/**
 * The branch each of `names` is resolved in: the innermost condition's branch
 * or loop row that holds every read of the slot and every place it renders.
 * A slot whose reads are not all inside one branch is absent, and the member's
 * body resolves it. A slot resolved in its branch is created when the branch
 * opens and disposed when it closes (Dialog's footer, inside its open panel),
 * as Vue, Svelte and React mount it again.
 */
function slotHomes(
  template: readonly Node[],
  names: ReadonlySet<string>,
): Map<readonly Node[], string[]> {
  const paths = new Map<string, (readonly Node[])[]>()
  const meet = (name: string, path: readonly (readonly Node[])[]) => {
    const held = paths.get(name)
    if (held === undefined) return paths.set(name, [...path])
    let at = 0
    while (at < held.length && at < path.length && held[at] === path[at]) at += 1
    return paths.set(name, held.slice(0, at))
  }
  const read = (exprs: readonly Expr[], path: readonly (readonly Node[])[]) => {
    for (const name of names) {
      if (exprs.some((expr) => new RegExp(`\\bslots\\.${name}\\b`).test(expr))) meet(name, path)
    }
  }
  const visit = (nodes: readonly Node[], path: readonly (readonly Node[])[]) => {
    for (const node of nodes) {
      read(ownExpressions(node), path)
      if (node.kind === 'slot' && names.has(node.name)) meet(node.name, path)
      const frame = node.kind === 'if' || node.kind === 'each'
      for (const list of childLists(node)) visit(list, frame ? [...path, list] : path)
    }
  }
  visit(template, [])
  const homes = new Map<readonly Node[], string[]>()
  for (const [name, path] of [...paths].sort(([a], [b]) => a.localeCompare(b))) {
    const home = path.at(-1)
    if (home !== undefined) homes.set(home, [...(homes.get(home) ?? []), name])
  }
  return homes
}

interface Render {
  /** The spelling at this point of the anatomy. */
  expr(expr: Expr): string
  /** Loop variables in reach, by name: an item a row reads through a view, a plain value, or an index. */
  loops: ReadonlyMap<string, Loop>
}

/** The Solid component for one member, before formatting. */
export function renderSolidMember(
  described: MemberShell,
  component: RegistryMemberLike,
  context: SolidContext,
  /** For a compound part: the member it belongs to, whose `provide` it reads as `owner`. */
  owner?: string,
): string {
  // The agent block is one more effect, which registers the instance with the agent registry.
  const shell = withAgent(described)
  const face = solidInterface(component)
  const home = shell.home ?? 'vocabulary'
  const template = Array.isArray(shell.template)
    ? (shell.template as readonly Node[])
    : [shell.template as Node]

  const propsByCamel = new Map(face.props.map((prop) => [camel(prop.name), prop]))
  const valueProps = new Set(
    face.props.filter((prop) => prop.kind === 'prop').map((prop) => camel(prop.name)),
  )
  const events = new Map(
    face.props.filter((prop) => prop.kind === 'event').map((prop) => [prop.binding, prop]),
  )
  // A prop whose value may hold a node is read once, and every place reads that value
  // (the foundation's `createKept`).
  const declaredType = (name: string) => shell.types?.[name] ?? context.types?.get(name)
  const keptProps = new Map(
    face.props
      .filter((prop) => prop.kind === 'prop' && holdsNode(prop.type, declaredType, context.lookup))
      .map((prop) => [camel(prop.name), prop]),
  )
  const keptVariable = (name: string) => `${name}Kept`
  const slotProps = new Map(
    face.props
      .filter((prop) => prop.kind === 'slot' || prop.kind === 'scoped-slot')
      .map((prop) => [prop.binding, prop]),
  )

  const derived = new Set(Object.keys(shell.derived ?? {}))
  const state = new Set(Object.keys(shell.state ?? {}))
  /** Read as accessors: booleans and lists no expression narrows. */
  const accessors = new Set([
    ...Object.keys(shell.presence ?? {}),
    ...Object.keys(shell.listPresence ?? {}),
    ...Object.keys(shell.media ?? {}),
    ...(shell.mode === undefined ? [] : [shell.mode]),
  ])
  for (const name of [...derived, ...state, ...accessors]) {
    if (valueProps.has(name)) {
      throw new Error(
        `shells: ${shell.member} names a derived or state value "${name}" after a prop`,
      )
    }
  }
  for (const name of keptProps.keys()) {
    const variable = keptVariable(name)
    if (valueProps.has(variable) || derived.has(variable) || state.has(variable)) {
      throw new Error(`shells: ${shell.member} names a value "${variable}" after a kept prop`)
    }
  }
  for (const name of Object.keys(shell.recipes ?? {})) {
    if (name === 'styles' || valueProps.has(name) || derived.has(name) || state.has(name)) {
      throw new Error(`shells: ${shell.member} names a recipe "${name}" after another value`)
    }
  }
  for (const event of Object.values(shell.machine?.events ?? {})) {
    if ('emit' in event && !events.has(event.emit)) {
      throw new Error(`shells: ${shell.member} emits "${event.emit}", which no on-prop declares`)
    }
  }

  // Element refs: one element, or (inside a loop) every element the loop renders.
  const templateRefs = new Set<string>()
  const listRefs = new Set<string>()
  walk(template, (node, inLoop) => {
    if (node.kind !== 'element' || node.ref === undefined) return
    if (Object.hasOwn(shell.controlRefs ?? {}, node.ref)) return
    templateRefs.add(node.ref)
    if (inLoop) listRefs.add(node.ref)
  })

  /* the slots the member reads ---------------------------------------------- */
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
    ...Object.values(shell.defaults ?? {}),
  ]
  const allSources = [...scriptSources, ...templateExpressions(template)]
  const readSlots = new Set<string>()
  for (const source of allSources) {
    for (const match of source.matchAll(/\bslots\.(\w+)/g)) readSlots.add(match[1] as string)
  }
  // A slot read by an expression, or handed props, or with a fallback, is read once.
  walk(template, (node) => {
    if (node.kind !== 'slot') return
    const entry = slotProps.get(node.name)
    if (entry === undefined) {
      throw new Error(`shells: ${shell.member} renders a slot "${node.name}" it has no prop for`)
    }
    if (entry.kind === 'scoped-slot') return
    if (node.pass !== undefined || node.take !== undefined || (node.fallback?.length ?? 0) > 0)
      readSlots.add(node.name)
  })
  const passes = new Map<string, SlotNode>()
  walk(template, (node) => {
    if (node.kind === 'slot' && node.pass !== undefined) {
      if (passes.has(node.name)) {
        throw new Error(`shells: ${shell.member} hands the slot "${node.name}" props twice`)
      }
      passes.set(node.name, node)
    }
  })
  const resolved = new Map<string, string>()
  for (const name of [...readSlots].sort()) {
    const entry = slotProps.get(name)
    if (entry === undefined) {
      throw new Error(`shells: ${shell.member} reads the slot "${name}", which it has no prop for`)
    }
    if (entry.kind === 'slot') resolved.set(name, slotVariable(entry.name))
  }
  // A slot the anatomy alone reads, and only to ask whether it is filled, is resolved in the
  // branch that holds its reads and its renders, when one does (`slotHomes`).
  const homes = slotHomes(
    template,
    new Set(
      [...resolved.keys()].filter((name) => {
        const reads = new RegExp(`\\bslots\\.${name}\\b`)
        const content = new RegExp(`\\bslot(?:ted|Text|Node)\\(\\s*slots\\.${name}\\b`)
        return (
          !scriptSources.some((expr) => reads.test(expr)) &&
          !templateExpressions(template).some((expr) => content.test(expr)) &&
          !usesNode(
            template,
            (node) =>
              node.kind === 'slot' &&
              node.name === name &&
              (node.pass !== undefined ||
                node.take !== undefined ||
                (node.fallback?.length ?? 0) > 0),
          )
        )
      }),
    ),
  )
  const homed = new Set([...homes.values()].flat())

  /* the spelling ------------------------------------------------------------ */
  const callbackOf = (event: string): string => {
    const prop = events.get(event)
    if (prop === undefined) throw new Error(`shells: ${shell.member} emits "${event}", no on-prop`)
    const read = access('props', prop.name)
    return prop.union
      ? `(${read} as unknown as ((...args: unknown[]) => unknown) | undefined)?.`
      : `${read}?.`
  }
  const baseName = (name: string): string | null => {
    const prop = propsByCamel.get(name)
    if (prop !== undefined && prop.kind === 'prop') {
      return keptProps.has(name) ? `${keptVariable(name)}.value` : access('props', prop.name)
    }
    if (derived.has(name) || state.has(name) || templateRefs.has(name)) return `${name}.value`
    if (Object.hasOwn(shell.controlRefs ?? {}, name)) return `${name}.value`
    if (accessors.has(name)) return `${name}()`
    if (name === 'api' && shell.machine !== undefined) return 'api.value'
    // A type an expression names: the description's node is Solid's element.
    if (name === 'VNode') return 'JSX.Element'
    return null
  }
  /**
   * In a loop, the item is a value (the foundation's `Each` hands a view that
   * follows the latest item of its key) and the index an accessor. An item
   * handed to a call is the item itself (`itemOf`), so a callback or a function
   * prop gets the object the caller put in the list, as in Vue and React.
   */
  const spellingFor = (loops: ReadonlyMap<string, Loop>): Spelling => ({
    name: (name) => {
      const loop = loops.get(name)
      if (loop === 'item' || loop === 'value') return null
      if (loop === 'index') return `${name}()`
      return baseName(name)
    },
    item: (name) => {
      if (loops.get(name) !== 'item') return null
      foundationValues.add('itemOf')
      return `itemOf(${name})`
    },
    hands: (name) =>
      loops.has(name) ||
      baseName(name) !== null ||
      !(BUILT_INS.has(name) || FOUNDATION_HELPERS.has(name)),
    callback: callbackOf,
    filled: (slot) => {
      const entry = slotProps.get(slot)
      if (entry === undefined) throw new Error(`shells: ${shell.member} reads slots.${slot}`)
      if (entry.kind === 'scoped-slot') return `(${access('props', entry.name)} !== undefined)`
      return `${resolved.get(slot)}.filled()`
    },
    slot: (slot, read) => {
      const variable = resolved.get(slot)
      if (variable === undefined) throw new Error(`shells: ${shell.member} reads slots.${slot}`)
      // A slot as a node: the content the slot read, which another component draws.
      if (read === 'node') return `(${variable}.filled() ? ${variable}() : undefined)`
      return `${variable}.${read === 'slotted' ? 'slotted' : 'text'}()`
    },
    scoped: (slot, call) => {
      const entry = slotProps.get(slot)
      if (entry?.kind !== 'scoped-slot')
        throw new Error(`shells: ${shell.member} reads slots.${slot}`)
      const helper = call === 'node' ? 'drawSlot' : 'slotDraws'
      foundationValues.add(helper)
      return `${helper}(${access('props', entry.name)}, `
    },
    listening: (event) => {
      const prop = events.get(event)
      if (prop === undefined)
        throw new Error(`shells: ${shell.member} listens for "${event}", no on-prop`)
      return `(${access('props', prop.name)} !== undefined)`
    },
  })
  const scriptExpr = (expr: Expr) => solidExpr(expr, spellingFor(new Map()))

  /* what the code reads ----------------------------------------------------- */
  const names = new Set(allSources.flatMap((expr) => [...freeNames(expr)]))
  const readsProps =
    [...names].some((name) => propsByCamel.has(name)) ||
    allSources.some((source) => /\b(emit|invoke)\(|\blistening\./.test(source)) ||
    resolved.size > 0 ||
    usesNode(template, (node) => node.kind === 'slot') ||
    Object.keys(shell.controlRefs ?? {}).length > 0
  const usesUid = names.has('uid') || shell.machine !== undefined
  const readsOwner = owner !== undefined && names.has('owner')
  const readsLent = names.has('lent')
  const readsLender = names.has('lender')
  const handsBack = shell.lends === true && names.has('borrowed')
  const needsScope =
    usesNode(
      template,
      (node) => node.kind === 'member' || node.kind === 'slot' || node.kind === 'render',
    ) ||
    shell.provide !== undefined ||
    shell.lends === true ||
    readsLender

  const solid = new Set<string>()
  const solidTypes = new Set<string>(['JSX'])
  const web = new Set<string>()
  const foundationValues = new Set<string>()
  const foundationTypes = new Set<string>()
  const motion = new Set<string>()

  /* the anatomy, as JSX ----------------------------------------------------- */
  /** Nodes as JSX children, each element with its part's name in a comment before it. */
  const renderNodes = (nodes: readonly Node[], at: Render): string[] =>
    nodes.map((node) => {
      const rendered = renderNode(node, at)
      return node.kind === 'element' && node.part !== undefined
        ? `{/* ${node.part} */}\n${rendered}`
        : rendered
    })

  /**
   * Several nodes as one JSX expression: the node, or a fragment. Inside JSX's
   * braces (a condition's branch, a prop's value) a node that renders as an
   * expression (a condition, a slot, interpolated text) is written bare, and
   * Solid reads it again. A component's body and a loop's row run once, so
   * there (`returned`) it is kept in a fragment, which Solid's compiler turns
   * into a memo.
   */
  const fragment = (nodes: readonly Node[], at: Render, returned = false): string => {
    // A branch that resolves a slot renders inside the foundation's `ResolvedSlot`.
    const home = homes.get(nodes)
    if (home !== undefined) {
      foundationValues.add('ResolvedSlot')
      return home.reduceRight(
        (inner, name) => {
          const read = access('props', (slotProps.get(name) as SolidProp).name)
          return `<ResolvedSlot of={() => ${read}}>\n{(${resolved.get(name)}) => ${inner}}\n</ResolvedSlot>`
        },
        plainFragment(nodes, at, true),
      )
    }
    return plainFragment(nodes, at, returned)
  }
  const plainFragment = (nodes: readonly Node[], at: Render, returned: boolean): string => {
    if (nodes.length !== 1) return `<>\n${renderNodes(nodes, at).join('\n')}\n</>`
    const only = nodes[0] as Node
    if (only.kind === 'text' && only.expr === undefined) return jsString(only.value ?? '')
    const rendered = renderNode(only, at)
    if (!(rendered.startsWith('{') && rendered.endsWith('}'))) return rendered
    return returned ? `<>\n${rendered}\n</>` : `(${rendered.slice(1, -1)})`
  }

  const attributeValue = (name: string, expr: Expr, at: Render): string => {
    // An attribute Solid's element types do not list is spread, which they do not check.
    if (UNLISTED_ATTRIBUTES.has(name)) return `{...{ ${key(name)}: ${at.expr(expr)} }}`
    const value = staticString(expr)
    return value !== null ? staticAttribute(name, value) : `${name}={${at.expr(expr)}}`
  }

  const classValue = (names: readonly ClassName[], at: Render): string => {
    const parts = names.map((name) =>
      typeof name === 'string'
        ? classReference(name)
        : `${at.expr(name.when)} ? ${classReference(name.name)} : undefined`,
    )
    if (parts.length === 1 && typeof names[0] === 'string') return parts[0] as string
    foundationValues.add('classes')
    return `classes(${parts.join(', ')})`
  }

  const handlerCode = (event: string, handler: Handler, at: Render, typed: boolean): string => {
    // A handler written as a function is the handler, as Vue reads `@change="(next) => …"`.
    if ('run' in handler && handler.when === undefined && isFunction(handler.run))
      return at.expr(handler.run)
    const action =
      'emit' in handler
        ? `emit(${[`'${handler.emit}'`, ...(handler.args ?? [])].join(', ')})`
        : handler.run
    const body = at.expr(handler.when === undefined ? action : `(${handler.when}) && ${action}`)
    const reads = handlerExpressions(handler).some((expr) => freeNames(expr).has('$event'))
    if (!reads) return `() => ${body}`
    const type = typed ? `: ${EVENT_TYPES[event] ?? 'Event'}` : ''
    return `($event${type}) => ${body}`
  }

  /** A named element's ref: the function that sets its signal, or that adds it to its list. */
  const refAttribute = (ref: string): string => `ref={${ref}.attach}`

  const renderElement = (node: ElementNode, at: Render): string => {
    // Vue's `key` replaces the element when it changes, as the foundation's `Keyed` does.
    if (node.attrs !== undefined && Object.hasOwn(node.attrs, 'key')) {
      const { key: by, ...attrs } = node.attrs
      foundationValues.add('Keyed')
      return `<Keyed by={${at.expr(by as Expr)}}>\n{() => ${renderElement({ ...node, attrs }, at)}}\n</Keyed>`
    }
    const dynamic = typeof node.tag !== 'string'
    const tag = dynamic ? 'Dynamic' : (node.tag as string)
    if (dynamic) web.add('Dynamic')
    if (typeof node.tag === 'string' && /^[A-Z]/.test(node.tag)) {
      if (!FOUNDATION_HELPERS.has(node.tag)) {
        throw new Error(
          `shells: ${shell.member} renders <${node.tag}>, which is not the foundation's`,
        )
      }
      foundationValues.add(node.tag)
    }
    const parts: string[] = []
    if (dynamic) parts.push(`component={${at.expr((node.tag as { expr: Expr }).expr)}}`)
    const spread = node.spread ?? []
    const style =
      node.geometry && Object.keys(node.geometry).length > 0
        ? `{ ${Object.entries(node.geometry)
            .map(([property, expr]) => `${key(property)}: ${at.expr(expr)}`)
            .join(', ')} }`
        : null
    if (spread.length > 0) {
      // The description's own attributes win over the getters', even an `undefined` one.
      foundationValues.add('mergeParts')
      const own: string[] = []
      if (node.class && node.class.length > 0) own.push(`class: ${classValue(node.class, at)}`)
      if (style !== null) own.push(`style: ${style}`)
      for (const [name, expr] of Object.entries(node.attrs ?? {}))
        own.push(`${key(name)}: ${at.expr(expr)}`)
      for (const [event, handler] of Object.entries(node.on ?? {})) {
        const listens = handlerKey(event)
        own.push(`${key(listens.key)}: ${handlerCode(listens.name, handler, at, true)}`)
      }
      const sources = [
        ...spread.map((expr) => at.expr(expr)),
        ...(own.length > 0 ? [`{ ${own.join(', ')} }`] : []),
      ]
      parts.push(`{...mergeParts(${sources.join(', ')})}`)
    } else {
      if (node.class && node.class.length > 0) parts.push(`class={${classValue(node.class, at)}}`)
      if (style !== null) parts.push(`style={${style}}`)
      for (const [name, expr] of Object.entries(node.attrs ?? {}))
        parts.push(attributeValue(name, expr, at))
      for (const [event, handler] of Object.entries(node.on ?? {})) {
        const listens = handlerKey(event)
        const code = handlerCode(listens.name, handler, at, true)
        parts.push(
          listens.capture ? `{...{ ${key(listens.key)}: ${code} }}` : `${listens.key}={${code}}`,
        )
      }
    }
    if (node.ref !== undefined) parts.push(refAttribute(node.ref))
    const children = node.children ?? []
    const open = parts.length === 0 ? tag : `${tag} ${parts.join(' ')}`
    // In markup a textarea's value is its content. A server render writes `value` as an
    // attribute, which a browser does not read, and a hydration sets no property. So a server
    // writes the value as the content too, and the hydrated field holds it. A browser writes
    // nothing there.
    const value = node.attrs?.['value']
    if (tag === 'textarea' && typeof value === 'string' && children.length === 0) {
      web.add('isServer')
      return `<${open}>{isServer ? ${at.expr(value)} : undefined}</${tag}>`
    }
    if (children.length === 0) return `<${open} />`
    return `<${open}>\n${renderNodes(children, at).join('\n')}\n</${tag}>`
  }

  const memberPropName = (name: string) =>
    /^(aria|data)[A-Z]/.test(name) ? name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`) : name

  const renderMember = (node: MemberNode, at: Render): string => {
    const parts: string[] = []
    for (const [name, expr] of Object.entries(node.props ?? {}))
      parts.push(attributeValue(memberPropName(name), expr, at))
    for (const [event, handler] of Object.entries(node.on ?? {})) {
      // A member's callback has no phase.
      if (event.includes('.'))
        throw new Error(`shells: ${node.name}'s "${event}" is a callback, which takes no modifier`)
      parts.push(`on${capital(event)}={${handlerCode(event, handler, at, false)}}`)
    }
    for (const name of Object.keys(node.slotWhen ?? {})) {
      if (!Object.hasOwn(node.slots ?? {}, name)) {
        throw new Error(`shells: ${node.name}'s slot "${name}" has a condition and no content`)
      }
    }
    let children: string | null = null
    for (const [name, content] of Object.entries(node.slots ?? {})) {
      const condition = node.slotWhen?.[name]
      const value = fragment(content, at)
      const passed =
        condition === undefined ? value : `${at.expr(condition)} ? ${value} : undefined`
      if (name === 'default') {
        children = condition === undefined ? renderNodes(content, at).join('\n') : `{${passed}}`
      } else parts.push(`${name === 'default' ? 'children' : name}={${passed}}`)
    }
    const open = parts.length === 0 ? node.name : `${node.name} ${parts.join(' ')}`
    if (children === null) return `<${open} />`
    return `<${open}>\n${children}\n</${node.name}>`
  }

  const renderSlot = (node: SlotNode, at: Render): string => {
    const entry = slotProps.get(node.name) as SolidProp
    const read = access('props', entry.name)
    if (entry.kind === 'scoped-slot') {
      // A loop's item given as a slot prop is handed on as a call's argument is (`itemOf`),
      // so the caller's function gets the object it put in the list.
      const handed = (expr: Expr): string =>
        (/^[A-Za-z_$][\w$]*$/.test(expr) ? spellingFor(at.loops).item(expr) : null) ?? at.expr(expr)
      const args =
        node.props === undefined
          ? ''
          : `{ ${Object.entries(node.props)
              .map(([name, expr]) => `${key(name)}: ${handed(expr)}`)
              .join(', ')} }`
      const call = `${read}?.(${args})`
      if ((node.fallback?.length ?? 0) === 0) return `{${call}}`
      return `{${read} !== undefined ? ${call} : ${fragment(node.fallback ?? [], at)}}`
    }
    const variable = resolved.get(node.name)
    if (variable === undefined) return `{${read}}`
    const content =
      node.take === undefined ? `${variable}()` : `${variable}.take(${at.expr(node.take)})`
    if ((node.fallback?.length ?? 0) === 0) return `{${content}}`
    return `{${variable}.filled() ? ${content} : ${fragment(node.fallback ?? [], at)}}`
  }

  const renderNode = (node: Node, at: Render): string => {
    switch (node.kind) {
      case 'element':
        return renderElement(node, at)
      case 'member':
        return renderMember(node, at)
      case 'slot':
        return renderSlot(node, at)
      case 'text':
        return node.expr !== undefined ? `{${at.expr(node.expr)}}` : staticText(node.value ?? '')
      case 'if': {
        // A conditional expression, which Solid's compiler memoizes on the condition as
        // `<Show>` does, and in which TypeScript narrows what the condition checked.
        const otherwise = node.otherwise === undefined ? 'null' : fragment(node.otherwise, at)
        // A description draws a value that is text or a node through two branches
        // (`typeof detail === 'string'`), because Vue and Svelte write them apart. Solid inserts
        // both the same way, so the value is read once: the test would read it again, and a
        // value a function returns (DataTable's `cell`) would be created for each read.
        const [only] = node.branches
        if (
          node.branches.length === 1 &&
          only !== undefined &&
          /^typeof .+ === 'string'$/.test(only.when.trim()) &&
          fragment(only.then, at) === otherwise
        ) {
          return `{${otherwise}}`
        }
        return `{${node.branches
          .map((branch) => `(${at.expr(branch.when)}) ? ${fragment(branch.then, at)} : `)
          .join('')}${otherwise}}`
      }
      case 'each': {
        foundationValues.add('Each')
        const keyNames = freeNames(node.key)
        const keyParameters = [
          node.as,
          ...(node.index !== undefined && keyNames.has(node.index) ? [node.index] : []),
        ]
        // The key function is called with the item and the index themselves.
        const keyLoops = new Map(at.loops)
        for (const name of keyParameters) keyLoops.set(name, 'value')
        const keyExpr = solidExpr(node.key, spellingFor(keyLoops))
        const inner = new Map(at.loops)
        inner.set(node.as, 'item')
        if (node.index !== undefined) inner.set(node.index, 'index')
        const body: Render = {
          loops: inner,
          expr: (expr) => solidExpr(expr, spellingFor(inner)),
        }
        const bodyNames = new Set(
          templateExpressions(node.children).flatMap((expr) => [...freeNames(expr)]),
        )
        const parameters =
          node.index !== undefined && bodyNames.has(node.index)
            ? [bodyNames.has(node.as) ? node.as : `_${node.as}`, node.index]
            : bodyNames.has(node.as)
              ? [node.as]
              : []
        // An unused parameter before a used one is named for TypeScript's unused-parameter rule.
        const by =
          keyParameters.length > 1
            ? [keyNames.has(node.as) ? node.as : `_${node.as}`, ...keyParameters.slice(1)]
            : keyNames.has(node.as)
              ? keyParameters
              : []
        // A row whose primitive item changes is made again only when its content reads the item.
        const renew = bodyNames.has(node.as) ? ' renew' : ''
        return `<Each of={${at.expr(node.of)}} by={(${by.join(', ')}) => ${keyExpr}}${renew}>\n{(${parameters.join(', ')}) => ${fragment(node.children, body, true)}}\n</Each>`
      }
      case 'portal':
        // No server renders a portal, so its content is created outside a hydration (`afresh`).
        web.add('Portal')
        foundationValues.add('afresh')
        return `<Portal>\n{afresh(() => ${fragment(node.children, at, true)})}\n</Portal>`
      case 'render':
        return `{${at.expr(node.value)}}`
    }
  }

  const top: Render = { loops: new Map(), expr: scriptExpr }
  const jsx = fragment(template, top, true)

  /* imports ---------------------------------------------------------------- */
  if (Object.values(shell.defaults ?? {}).some((expr) => expr.trim() !== 'undefined')) {
    solid.add('mergeProps')
    foundationTypes.add('Defaults')
  }
  if (usesUid) solid.add('createUniqueId')
  if (readsOwner || readsLent || readsLender) solid.add('useContext')
  checkSlots(shell.member, template)
  for (const effect of shell.effects ?? []) {
    checkHolding(shell.member, effect)
    if (effect.watch === undefined) solid.add('onMount')
    else {
      solid.add('createMemo')
      foundationValues.add('watchEffect')
    }
    if (holds(effect)) solid.add('onCleanup')
  }
  if (shell.listPresence && Object.keys(shell.listPresence).length > 0) {
    solid.add('createSignal')
    solid.add('createMemo')
    solid.add('createComputed')
    solid.add('on')
  }
  foundationValues.add('claimSlot')
  if (needsScope) foundationValues.add('scope')
  if (shell.provide || shell.lends || readsLender) foundationValues.add('provide')
  if (readsLender || handsBack) foundationValues.add('BORROWED')
  if (handsBack) foundationTypes.add('BorrowedHolder')
  if (shell.provide || readsOwner) foundationValues.add('ownerContext')
  if (shell.lends || readsLent) foundationValues.add('IDENTITY')
  if ([...resolved.keys()].some((name) => !homed.has(name))) foundationValues.add('resolveSlot')
  if (shell.controlRefs) foundationValues.add('useControlRef')
  if (shell.departures) foundationValues.add('useDeparture')
  if (shell.media) foundationValues.add('useMediaQuery')
  if (shell.mode) foundationValues.add('useMode')
  if (shell.machine) foundationValues.add('useDirection')
  if (templateRefs.size > listRefs.size) foundationValues.add('elementRef')
  if (listRefs.size > 0) foundationValues.add('elementList')
  if (shell.state) foundationValues.add('createCell')
  if (shell.derived || shell.machine) foundationValues.add('createDerived')
  if (keptProps.size > 0) foundationValues.add('createKept')
  // The foundation's `useMachine` applies an event when it is sent, as Vue's adapter does.
  if (shell.machine) foundationValues.add('useMachine')
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
  for (const name of names) {
    if (FOUNDATION_HELPERS.has(name)) foundationValues.add(name)
    // A type an expression names (`null as RichTextEditorState | null`) is the foundation's too.
    if (FOUNDATION_TYPES.has(name)) foundationTypes.add(name)
  }

  const parameters = typeParameters(shell.generic)
  const declared = new Set([...Object.keys(shell.types ?? {}), ...parameters])
  const uses = new Set(shell.uses ?? [])
  const undeclared = [...face.names].filter(
    (name) => !FOUNDATION_TYPES.has(name) && !declared.has(name) && !uses.has(name),
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
    )
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

  const composedImports = memberImports(
    [...composed(template)].filter((name) => name !== shell.member),
    shell.dir,
    home,
    context,
  )
  composedImports.foundation.forEach((name) => foundationValues.add(name))

  /* the body ---------------------------------------------------------------- */
  const body: string[] = []
  const own = parameters.length === 0 ? '' : `<${parameters.join(', ')}>`

  for (const [name, prop] of keptProps) {
    body.push(`const ${keptVariable(name)} = createKept(() => ${access('props', prop.name)})`)
  }
  if (shell.provide) {
    const getters = Object.entries(shell.provide).map(
      ([name, expr]) => `get ${name}() { return ${scriptExpr(expr)} }`,
    )
    body.push(
      `provide(ownerContext<${shell.member}Owner>('${shell.member}'), { ${getters.join(', ')} })`,
    )
  }
  if (shell.lends) body.push(`provide(IDENTITY, '${gallerySlug(shell.member)}')`)
  // The holder of the member that lends this one its identity, kept from the members this one
  // renders; and the holder this one gives the member it lends its identity to.
  if (readsLender) body.push('provide(BORROWED, undefined)')
  if (handsBack) body.push('const borrowed: BorrowedHolder = {}', 'provide(BORROWED, borrowed)')
  if (usesUid) body.push('const uid = createUniqueId()')
  for (const name of [...templateRefs].sort()) {
    body.push(
      listRefs.has(name)
        ? `const ${name} = elementList<HTMLElement>()`
        : `const ${name} = elementRef<HTMLElement>()`,
    )
  }
  for (const [name, query] of Object.entries(shell.media ?? {})) {
    body.push(`const ${name} = useMediaQuery('${query}')`)
  }
  if (shell.mode) body.push(`const ${shell.mode} = useMode()`)
  for (const [name, prop] of Object.entries(shell.controlRefs ?? {})) {
    body.push(
      `const ${name} = useControlRef(() => ${access('props', propsByCamel.get(camel(prop))?.name ?? prop)})`,
    )
  }
  for (const [name, variable] of resolved) {
    if (homed.has(name)) continue
    const entry = slotProps.get(name) as SolidProp
    const pass = passes.get(name)
    const readsChild = Object.values(pass?.pass ?? {}).some((expr) => freeNames(expr).has('child'))
    const passCode =
      pass === undefined
        ? ''
        : `, (${readsChild ? 'child' : ''}) => ({ ${Object.entries(pass.pass ?? {})
            .map(([prop, expr]) => `${key(prop)}: ${scriptExpr(expr)}`)
            .join(', ')} })`
    body.push(`const ${variable} = resolveSlot(() => ${access('props', entry.name)}${passCode})`)
  }
  // After the slots, because a state's first value may read one (MasterDetailPage starts
  // `selected` from whether a detail is given).
  for (const [name, expr] of Object.entries(shell.state ?? {})) {
    body.push(`const ${name} = createCell(${scriptExpr(expr)})`)
  }

  // A derived value the machine reads is declared before it; one that reads the machine, after.
  const late = new Set<string>()
  for (const [name, expr] of Object.entries(shell.derived ?? {})) {
    const reads = freeNames(expr)
    if (reads.has('api') || reads.has('service') || [...reads].some((other) => late.has(other)))
      late.add(name)
  }
  const derivedLine = (name: string, expr: Expr) =>
    `const ${name} = createDerived(() => (${scriptExpr(expr)}))`
  for (const [name, expr] of Object.entries(shell.derived ?? {})) {
    if (!late.has(name)) body.push(derivedLine(name, expr))
  }
  if (shell.machine) {
    const machineContext = [
      'id: uid',
      // The document's direction: a machine given none writes `dir="ltr"` on the member's root.
      'dir: documentDirection()',
      ...Object.entries(shell.machine.context).map(
        ([name, expr]) => `${key(name)}: ${scriptExpr(expr)}`,
      ),
      ...Object.entries(shell.machine.events ?? {}).map(([name, event]) => {
        const code = statement(
          'emit' in event
            ? scriptExpr(`emit('${event.emit}', ${event.payload})`)
            : scriptExpr(event.run),
        )
        const reads = freeNames('emit' in event ? event.payload : event.run).has('details')
        return `${name}: (${reads ? 'details' : ''}) => { ${code} }`
      }),
    ]
    // The assertion gives the literals their machine's types (`placement: 'bottom-end'`), and
    // the callbacks their details.
    body.push('const documentDirection = useDirection()')
    body.push(
      `const service = useMachine(zag.machine, () => ({ ${machineContext.join(', ')} }) as Partial<zag.Props>)`,
    )
    body.push('const api = createDerived(() => zag.connect(service, normalizeProps))')
  }
  for (const [name, expr] of Object.entries(shell.derived ?? {})) {
    if (late.has(name)) body.push(derivedLine(name, expr))
  }
  for (const [name, list] of Object.entries(shell.listPresence ?? {})) {
    body.push(...listPresenceLines(name, scriptExpr(list.of), scriptExpr(list.key)))
  }
  for (const [name, departure] of Object.entries(shell.departures ?? {})) {
    body.push(`const ${name} = useDeparture(() => ${departure.ref}.value, '${departure.binding}')`)
  }
  for (const [name, presence] of Object.entries(shell.presence ?? {})) {
    if (presence.key !== undefined) {
      if (presence.binding !== undefined || !listRefs.has(presence.ref)) {
        throw new Error(
          `shells: ${shell.member}'s keyed presence "${name}" needs a ref inside a loop and no binding`,
        )
      }
      motion.add('useKeyedPresence')
      body.push(
        `const ${name} = useKeyedPresence(() => ${scriptExpr(presence.open)}, () => ${presence.ref}.value, (element) => ${scriptExpr(presence.key)})`,
      )
      continue
    }
    motion.add('usePresence')
    const binding =
      presence.binding === undefined
        ? 'undefined'
        : typeof presence.binding === 'string'
          ? `'${presence.binding}'`
          : `() => ${scriptExpr(presence.binding.expr)}`
    const entries = presenceEntries(presence, scriptExpr, true)
    const options = entries.length === 0 ? '' : `, { ${entries.join(', ')} }`
    const rest = presence.binding === undefined && options === '' ? '' : `, ${binding}${options}`
    body.push(
      `const ${name} = usePresence(() => ${scriptExpr(presence.open)}, () => ${presence.ref}.value${rest})`,
    )
  }
  for (const [at, effect] of (shell.effects ?? []).entries()) {
    const index = at + 1
    body.push(...effectLines(effect, index, scriptExpr))
    if (effect.watch === undefined) body.push(`onMount(effect${index})`)
    else {
      body.push(
        `watchEffect(createMemo(() => ${scriptExpr(effect.watch)}), effect${index}, ${effect.mount !== false})`,
      )
    }
    if (holds(effect)) body.push(`onCleanup(() => release${index}?.())`)
  }
  body.push(`return (\n${jsx}\n)`)

  /* the file ---------------------------------------------------------------- */
  const lines: string[] = []
  lines.push('/**')
  lines.push(` * ${component.purpose}${component.spec ? ` (\`${component.spec}\`)` : ''}.`)
  lines.push(' *')
  lines.push(` * Generated by \`pnpm shells\` from \`${context.source}\`, the member's`)
  lines.push(' * framework-neutral description. Never edit it by hand: change the description and')
  lines.push(' * run `pnpm shells`.')
  lines.push(' */')
  const solidNames = [...[...solid].sort(), ...[...solidTypes].sort().map((name) => `type ${name}`)]
  lines.push(`import { ${solidNames.join(', ')} } from 'solid-js'`)
  if (web.size > 0) lines.push(`import { ${[...web].sort().join(', ')} } from 'solid-js/web'`)
  if (shell.machine) {
    lines.push('')
    lines.push(`import * as zag from '@zag-js/${shell.machine.of}'`)
    lines.push(`import { normalizeProps } from '@zag-js/solid'`)
  }
  lines.push('')
  if (home === 'foundation') {
    // Inside the foundation, its own index would import this file back: the
    // gateway and the slot conventions are sibling modules, and the types are the engine's.
    if (foundationValues.has('Glyph')) lines.push(`import { Glyph } from './Glyph'`)
    const modules = new Map<string, string[]>()
    for (const name of [...foundationValues].filter((value) => value !== 'Glyph').sort()) {
      const module = FOUNDATION_MODULES[name]
      if (module === undefined) {
        throw new Error(`shells: ${shell.member} is in the foundation and reads ${name}`)
      }
      modules.set(module, [...(modules.get(module) ?? []), name])
    }
    for (const name of [...foundationTypes].sort()) {
      const module = FOUNDATION_MODULES[name]
      if (module !== undefined)
        modules.set(module, [...(modules.get(module) ?? []), `type ${name}`])
    }
    for (const [module, imported] of [...modules].sort(([a], [b]) => a.localeCompare(b)))
      lines.push(`import { ${imported.join(', ')} } from '../conventions/${module}'`)
    const engineTypes = [...foundationTypes].filter(
      (name) => FOUNDATION_MODULES[name] === undefined,
    )
    if (engineTypes.length > 0) {
      lines.push(`import type { ${engineTypes.sort().join(', ')} } from '@polymorph/engine'`)
    }
  } else if (foundationValues.size > 0 || foundationTypes.size > 0) {
    const imported = [
      ...[...foundationValues].sort(),
      ...[...foundationTypes].sort().map((name) => `type ${name}`),
    ]
    lines.push(`import { ${imported.join(', ')} } from '@polymorph/solid'`)
  }
  if (motion.size > 0) {
    lines.push(`import { ${[...motion].sort().join(', ')} } from '@polymorph/solid/motion'`)
  }
  const classNames = templateClassNames(template)
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
    // A part shares its member's recipes and imports the ones its classes use.
    if (![...classNames].some((name) => name.startsWith(`${binding}.`))) continue
    lines.push(`import ${binding} from '@polymorph/recipes/${recipe}.module.css'`)
  }
  const componentLines = [...composedImports.lines]
  for (const [from, typeNames] of sharedTypes) {
    const location = context.locations.get(from)
    if (location === undefined) throw new Error(`shells: ${from} declares types and has no file`)
    const module = relativeFile(shell.dir, location.dir, from)
    const index = componentLines.indexOf(`import ${from} from '${module}'`)
    if (index === -1)
      componentLines.push(`import type { ${typeNames.join(', ')} } from '${module}'`)
    else
      componentLines[index] =
        `import ${from}, { ${typeNames.map((name) => `type ${name}`).join(', ')} } from '${module}'`
  }
  if (readsOwner) {
    // The type of what the member hands its parts, from the member's module, at no run-time cost.
    componentLines.push(`import type { ${owner}Owner } from './${owner}'`)
  }
  lines.push(...componentLines)

  for (const [name, definition] of Object.entries(shell.types ?? {})) {
    const [, typed = '', rest = definition] = /^\s*(<[^>]*>)?\s*([\s\S]*)$/.exec(definition) ?? []
    const text = solidType(rest.trim())
    lines.push('')
    lines.push(
      text.startsWith('{')
        ? `export interface ${name}${typed} ${text}`
        : `export type ${name}${typed} = ${text}`,
    )
  }
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

  if (shell.provide) {
    // What the member hands its compound parts: its machine, its service, or one of its props.
    lines.push('')
    lines.push(`/** What ${shell.member} hands its compound parts. */`)
    lines.push(`export interface ${shell.member}Owner {`)
    for (const [name, expr] of Object.entries(shell.provide)) {
      const read = expr.trim()
      const prop = propsByCamel.get(read)
      const type =
        read === 'api' && shell.machine
          ? 'zag.Api'
          : read === 'service' && shell.machine
            ? 'zag.Service'
            : prop !== undefined && prop.kind === 'prop'
              ? Object.hasOwn(shell.defaults ?? {}, read)
                ? `Exclude<${shell.member}Props['${prop.name}'], undefined>`
                : `${shell.member}Props['${prop.name}']`
              : // A value the member derives or holds has no type outside it; a part narrows it
                // where it reads it (AppShell's rail collapse, `owner.collapsed === true`).
                Object.hasOwn(shell.derived ?? {}, read) || Object.hasOwn(shell.state ?? {}, read)
                ? 'unknown'
                : null
      if (type === null) {
        throw new Error(
          `shells: ${shell.member} provides "${name}: ${expr}"; the Solid renderer types a provided value when it is the machine, its service or a prop`,
        )
      }
      lines.push(`  readonly ${key(name)}: ${type}`)
    }
    lines.push('}')
  }

  for (const name of Object.keys(shell.defaults ?? {})) {
    if (!propsByCamel.has(name) && !face.props.some((prop) => prop.name === name)) {
      throw new Error(`shells: ${shell.member} sets a default for "${name}", which is not a prop`)
    }
  }
  const kind = shell.statics?.controlKind
  const claim = `claimSlot(given${kind === undefined ? '' : `, ${scriptExpr(kind)}`})`
  // Vue's and React's object and array defaults are factories, called once per instance.
  // A default of `undefined` is the absence of one.
  const given = Object.entries(shell.defaults ?? {}).filter(
    ([, expr]) => expr.trim() !== 'undefined',
  )
  const defaults = given.map(([name, expr]) => {
    const prop = propsByCamel.get(name) ?? face.props.find((candidate) => candidate.name === name)
    const value = scriptExpr(expr)
    const factory = isFactory(expr) && prop !== undefined && !isFunctionType(prop.type)
    return `${key(prop?.name ?? name)}: ${factory ? `(${value})()` : value}`
  })
  // The defaulted props are never `undefined`, as a React default parameter makes them.
  const defaulted = given.map(([name]) => `'${propsByCamel.get(name)?.name ?? name}'`).join(' | ')
  const propsLine =
    defaults.length > 0
      ? `mergeProps({ ${defaults.join(', ')} } as Defaults<${shell.member}Props${own}, ${defaulted}>, ${claim})`
      : claim

  lines.push('')
  lines.push(`/** ${component.purpose}. */`)
  lines.push(
    `export default function ${shell.member}${own}(given: ${shell.member}Props${own}): JSX.Element {`,
  )
  lines.push(readsProps ? `const props = ${propsLine}` : propsLine)
  if (readsLent) lines.push('const lent = useContext(IDENTITY)')
  if (readsLender) lines.push('const lender = useContext(BORROWED)')
  if (readsOwner) {
    // What the member provides. A part outside its member reads an empty owner, whose values are
    // `undefined`; a description reads them with `?.` where a public part may stand alone.
    lines.push(
      `const owner = useContext(ownerContext<${owner}Owner>('${owner}')) ?? ({} as ${owner}Owner)`,
    )
  }
  if (needsScope) {
    lines.push('return scope(() => {')
    lines.push(...body)
    lines.push('})')
  } else lines.push(...body)
  lines.push('}')
  for (const [name, expr] of Object.entries(shell.statics ?? {})) {
    lines.push('')
    lines.push(`${shell.member}.${name} = ${scriptExpr(expr)}`)
  }
  lines.push('')
  return lines.join('\n')
}

/** Whether an expression is an arrow function or a function expression. */
function isFunction(expr: Expr): boolean {
  const source = ts.createSourceFile('handler.ts', `(${expr})`, ts.ScriptTarget.ESNext, true)
  const statement = source.statements[0]
  if (statement === undefined || !ts.isExpressionStatement(statement)) return false
  let node: ts.Expression = statement.expression
  while (ts.isParenthesizedExpression(node)) node = node.expression
  return ts.isArrowFunction(node) || ts.isFunctionExpression(node)
}

/**
 * One effect, as a function the member calls on mount and on a watched change.
 * An effect that observes makes its observers, runs, and keeps a release that
 * disconnects them; one that waits sets a timer and keeps a release that
 * clears it. Each release runs before the effect runs again.
 */
function effectLines(effect: Effect, at: number, scriptExpr: (expr: Expr) => string): string[] {
  const run = statement(scriptExpr(effect.run))
  if (!holds(effect)) return [`const effect${at} = () => {`, `  ${run}`, '}']
  const lines = [`let release${at}: (() => void) | undefined`, `const effect${at} = () => {`]
  lines.push(`  release${at}?.()`)
  if (effect.listen !== undefined) {
    // A listener on the document, which runs the statements with the event as `$event`.
    const type = EVENT_TYPES[effect.listen] ?? 'Event'
    lines.push(`  const listener = ($event: ${type}) => { ${run} }`)
    lines.push(`  document.addEventListener('${effect.listen}', listener)`)
    lines.push(`  release${at} = () => document.removeEventListener('${effect.listen}', listener)`)
    lines.push('}')
    return lines
  }
  if (effect.release !== undefined) {
    // What `run` returned, which the release reads as `ran`.
    lines.push(
      freeNames(effect.release).has('ran') ? `  const ran = ${scriptExpr(effect.run)}` : `  ${run}`,
    )
    lines.push(`  release${at} = () => { ${statement(scriptExpr(effect.release))} }`)
    lines.push('}')
    return lines
  }
  if (effect.delay !== undefined) {
    lines.push(`  const timer = setTimeout(() => { ${run} }, ${scriptExpr(effect.delay)})`)
    lines.push(`  release${at} = () => clearTimeout(timer)`)
    lines.push('}')
    return lines
  }
  lines.push(`  const run = () => { ${run} }`)
  const releases: string[] = []
  if (effect.resize !== undefined) {
    lines.push(
      "  const resize = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(run)",
    )
    lines.push(
      `  for (const element of [${effect.resize.map(scriptExpr).join(', ')}]) if (element) resize?.observe(element)`,
    )
    releases.push('resize?.disconnect()')
  }
  if (effect.mutation !== undefined) {
    lines.push(
      "  const mutation = typeof MutationObserver === 'undefined' ? undefined : new MutationObserver(run)",
    )
    lines.push(
      `  for (const element of [${effect.mutation.map(scriptExpr).join(', ')}]) if (element) mutation?.observe(element, { childList: true, characterData: true, subtree: true${effect.attributes === undefined ? '' : `, attributeFilter: [${effect.attributes.map((name) => `'${name}'`).join(', ')}]`} })`,
    )
    releases.push('mutation?.disconnect()')
  }
  lines.push(`  release${at} = () => { ${releases.join('; ')} }`)
  lines.push('  run()')
  lines.push('}')
  return lines
}

/**
 * A list presence: the items of `of`, and each item removed from it, kept at
 * the position it held until its `done` runs. A removal is read in the
 * computation that sees the new list, before the list renders, so the leaving
 * item's element is never disposed and created again.
 */
function listPresenceLines(name: string, of: string, keyOf: string): string[] {
  return [
    `const ${name}Of = createMemo(() => ${of})`,
    `const ${name}Key = ${keyOf}`,
    `const [${name}Leaving, set${capital(name)}Leaving] = createSignal<{ key: string; item: ReturnType<typeof ${name}Of>[number]; at: number }[]>([])`,
    `createComputed(on(${name}Of, (now, before) => { if (before === undefined) return; const kept = new Set(now.map(${name}Key)); const leaving = ${name}Leaving().filter((entry) => !kept.has(entry.key)); before.forEach((item, at) => { const key = ${name}Key(item); if (!kept.has(key) && !leaving.some((entry) => entry.key === key)) leaving.push({ key, item, at }) }); set${capital(name)}Leaving(leaving) }))`,
    `const ${name} = createMemo(() => { const entries = ${name}Of().map((item) => ({ item, key: ${name}Key(item), open: true, done: () => {} })); for (const entry of [...${name}Leaving()].sort((a, b) => a.at - b.at)) entries.splice(Math.min(entry.at, entries.length), 0, { item: entry.item, key: entry.key, open: false, done: () => set${capital(name)}Leaving((list) => list.filter((other) => other.key !== entry.key)) }); return entries })`,
  ]
}

/* -------------------------------------------------------------------------- */
/* The states fixture                                                         */
/* -------------------------------------------------------------------------- */

interface FixtureNeeds {
  members: Set<string>
  recipes: Set<string>
  zag: boolean
  /** The foundation's values a fixture's JavaScript names (`FIXTURE_VALUES`: `toast`, `Time`). */
  values: Set<string>
  /** A composed member's registry entry, for the callbacks its props require. */
  lookup: (name: string) => RegistryMemberLike | undefined
}

/** A fixture value as JavaScript. */
function literal(value: FixtureValue, needs: FixtureNeeds): string {
  if (branded(value, 'js')) {
    const source = (value as { js: string }).js
    if (/(^|[^.\w$])zag\./.test(source)) needs.zag = true
    for (const name of FIXTURE_VALUES) {
      if (new RegExp(`(^|[^.\\w$])${name}\\b`).test(source)) needs.values.add(name)
    }
    return source
  }
  if (branded(value, 'node')) return childCode((value as { node: FixtureChild }).node, needs)
  if (branded(value, 'renders', RENDERS_KEYS)) {
    const { params, renders, when } = value as FixtureRenders
    const children = renderedChildren(renders).map((child) => childCode(child, needs))
    const drawn = children.length === 1 ? children[0] : `[${children.join(', ')}]`
    return `(${params.join(', ')}) => ${when === undefined ? drawn : `(${when}) ? ${drawn} : undefined`}`
  }
  if (branded(value, 'held')) return `held.${(value as { held: string }).held}`
  if (branded(value, 'hold', ['to'])) {
    const { hold, to } = value as { hold: string; to?: FixtureValue }
    return 'to' in value
      ? `() => { held.${hold} = ${literal(to, needs)} }`
      : `(value: typeof held.${hold}) => { held.${hold} = value }`
  }
  if (Array.isArray(value)) return `[${value.map((entry) => literal(entry, needs)).join(', ')}]`
  if (value !== null && typeof value === 'object') {
    return `{ ${Object.entries(value as Record<string, FixtureValue>)
      .map(([name, entry]) => `${key(name)}: ${literal(entry, needs)}`)
      .join(', ')} }`
  }
  return typeof value === 'string' ? jsString(value) : JSON.stringify(value)
}

/** A fixture prop as a JSX attribute. */
function propAttribute(name: string, value: FixtureValue, needs: FixtureNeeds): string {
  if (typeof value === 'string') return staticAttribute(name, value)
  return `${name}={${literal(value, needs)}}`
}

function propsAttributes(
  props: Readonly<Record<string, FixtureValue>> | undefined,
  needs: FixtureNeeds,
): string[] {
  return Object.entries(props ?? {}).map(([name, value]) => propAttribute(name, value, needs))
}

/** Slot content as JSX children: text, an expression's text, a member or an element. */
function childJsx(child: FixtureChild, needs: FixtureNeeds): string {
  if (typeof child === 'string') return staticText(child)
  if ('js' in child) return `{${literal(child, needs)}}`
  return childCode(child, needs)
}

/** A fixture child as a JSX expression. */
function childCode(child: FixtureChild, needs: FixtureNeeds): string {
  if (typeof child === 'string') return jsString(child)
  if ('js' in child) return literal(child, needs)
  if ('member' in child) {
    needs.members.add(child.member)
    return memberJsx(child.member, child.props, child.slots, false, needs)
  }
  return elementJsx(
    child,
    (child.children ?? []).map((entry) => childJsx(entry, needs)),
    needs,
  )
}

function elementJsx(
  element: { element: string; attrs?: Readonly<Record<string, string>>; class?: readonly string[] },
  children: readonly string[],
  needs: FixtureNeeds,
): string {
  const parts: string[] = []
  if (element.class !== undefined && element.class.length > 0) {
    const references = element.class.map((name) => {
      needs.recipes.add(name.includes('.') ? (name.split('.')[0] as string) : 'styles')
      return classReference(name)
    })
    parts.push(
      `class={${references.length === 1 ? references[0] : `[${references.join(', ')}].join(' ')`}}`,
    )
  }
  for (const [name, value] of Object.entries(element.attrs ?? {}))
    parts.push(staticAttribute(name, value))
  const open = parts.length === 0 ? element.element : `${element.element} ${parts.join(' ')}`
  if (children.length === 0) return `<${open} />`
  return `<${open}>\n${children.join('\n')}\n</${element.element}>`
}

function slotAttributes(
  slots: Readonly<Record<string, readonly FixtureChild[]>> | undefined,
  needs: FixtureNeeds,
): { attributes: string[]; children: string[] | null } {
  const attributes: string[] = []
  let children: string[] | null = null
  for (const [name, content] of Object.entries(slots ?? {})) {
    if (name === 'default') children = content.map((child) => childJsx(child, needs))
    else {
      const rendered = content.map((child) => childJsx(child, needs))
      const value =
        content.length === 1 && typeof content[0] !== 'string'
          ? childCode(content[0] as FixtureChild, needs)
          : `<>\n${rendered.join('\n')}\n</>`
      attributes.push(`${name}={${value}}`)
    }
  }
  return { attributes, children }
}

function memberJsx(
  name: string,
  props: Readonly<Record<string, FixtureValue>> | undefined,
  slots: Readonly<Record<string, readonly FixtureChild[]>> | undefined,
  overrides: boolean,
  needs: FixtureNeeds,
): string {
  const { attributes, children } = slotAttributes(slots, needs)
  const parts = [...propsAttributes(props, needs), ...attributes]
  // A callback the member requires and the entry does not handle does nothing, as a React
  // fixture's `() => {}`; the runner's spy, among the overrides, replaces it.
  for (const prop of needs.lookup(name)?.props ?? []) {
    if (prop.optional || prop.name in (props ?? {}) || !/^on[A-Z]/.test(prop.name)) continue
    parts.push(`${prop.name}={() => {}}`)
  }
  if (overrides) parts.push('{...overrides}')
  const open = parts.length === 0 ? name : `${name} ${parts.join(' ')}`
  if (children === null || children.length === 0) return `<${open} />`
  return `<${open}>\n${children.join('\n')}\n</${name}>`
}

function entryCode(shell: MemberShell, entry: StateEntry, needs: FixtureNeeds): string {
  // A part on its own (`AppShell.NavItem`) renders in place of the member, as React's fixture does.
  const component = entry.part === undefined ? shell.member : `${shell.member}${entry.part}`
  if (entry.part !== undefined && !(shell.parts ?? []).some((part) => part.name === entry.part)) {
    throw new Error(
      `shells: ${shell.member}'s "${entry.name}" renders a part it has not: ${entry.part}`,
    )
  }
  needs.members.add(component)
  const stateful =
    entry.holds !== undefined ||
    entry.before !== undefined ||
    entry.types !== undefined ||
    entry.presses !== undefined ||
    entry.selects !== undefined
  const before = (entry.before ?? []).map((child) => childCode(child, needs))
  let rendered: string
  if (entry.many !== undefined) {
    const instances = entry.many.each.map((instance: FixtureInstance, at) =>
      memberJsx(component, instance.props, instance.slots, at === 0, needs),
    )
    const also = (entry.many.also ?? []).map((child) => childJsx(child, needs))
    const content = [...before, ...instances, ...also]
    const within = entry.many.within
    if ('element' in within) {
      rendered = elementJsx(within, content, needs)
    } else {
      needs.members.add(within.member)
      const parts = propsAttributes(within.props, needs)
      const open = parts.length === 0 ? within.member : `${within.member} ${parts.join(' ')}`
      rendered = `<${open}>\n${content.join('\n')}\n</${within.member}>`
    }
  } else {
    const member = memberJsx(component, entry.props, entry.slots, true, needs)
    rendered = before.length === 0 ? member : `<>\n${[...before, member].join('\n')}\n</>`
  }
  if (!stateful && rendered.includes('held.')) {
    throw new Error(`shells: ${shell.member}'s "${entry.name}" reads a held value it does not hold`)
  }
  const parameter = rendered.includes('{...overrides}') ? '(overrides = {})' : '()'
  let render: string
  if (stateful) {
    const setup: string[] = []
    if (entry.holds !== undefined)
      setup.push(`const held = createMutable(${literal(entry.holds, needs)})`)
    if (entry.types !== undefined) {
      const into = literal(entry.types.into, needs)
      const typed = literal(entry.types.text, needs)
      setup.push(
        `let frame = 0; let frames = 0; const type = () => { const field = document.querySelector<HTMLInputElement>(${into}); if (field === null) { if (++frames < ${TYPING_FRAMES}) frame = requestAnimationFrame(type); return } field.value = ${typed}; field.dispatchEvent(new Event('input', { bubbles: true })) }; onMount(() => { frame = requestAnimationFrame(type) }); onCleanup(() => cancelAnimationFrame(frame))`,
      )
    }
    if (entry.presses !== undefined) {
      setup.push(pressStatements(literal(entry.presses, needs), 'onMount', 'onCleanup'))
    }
    if (entry.selects !== undefined) {
      setup.push(
        selectStatements(
          literal(entry.selects.in, needs),
          literal(entry.selects.text, needs),
          'onMount',
          'onCleanup',
        ),
      )
    }
    render = `${parameter} => { ${setup.join('; ')}${setup.length > 0 ? '; ' : ''}return (\n${rendered}\n) }`
  } else {
    render = `${parameter} => (\n${rendered}\n)`
  }
  const fields = [`name: ${jsString(entry.name)}`, `render: ${render}`]
  if (entry.expect) {
    fields.push(
      `expect: { ${Object.entries(entry.expect)
        .map(([name, value]) => `${key(name)}: ${value === null ? 'null' : jsString(value)}`)
        .join(', ')} }`,
    )
  }
  if (entry.rendersNothing) fields.push('rendersNothing: true')
  return `{ ${fields.join(', ')} }`
}

export function renderSolidStates(
  shell: MemberShell,
  component: RegistryMemberLike,
  context: SolidContext,
): string {
  const needs: FixtureNeeds = {
    members: new Set([shell.member]),
    recipes: new Set(),
    zag: false,
    values: new Set(),
    lookup: (name) => (name === shell.member ? component : context.lookup?.(name)),
  }
  const entries = [...gridEntries(shell, component), ...shell.states].map((entry) =>
    entryCode(shell, entry, needs),
  )
  const typing = shell.states.some(
    (entry) =>
      entry.types !== undefined || entry.presses !== undefined || entry.selects !== undefined,
  )
  const holding = shell.states.some((entry) => entry.holds !== undefined)
  const lines = [
    '/**',
    ` * ${shell.member}'s states fixture, with the React fixture's entry names, so a`,
    " * contract's `when <state>` names the same entry in every shell.",
    ' *',
    ` * Generated by \`pnpm shells\` from \`${context.source}\`. Never edit it by hand.`,
    ' */',
  ]
  if (typing) lines.push(`import { onCleanup, onMount } from 'solid-js'`)
  if (holding) lines.push(`import { createMutable } from 'solid-js/store'`)
  if (typing || holding) lines.push('')
  if (needs.zag) {
    if (shell.machine === undefined) {
      throw new Error(`shells: ${shell.member}'s fixture reads \`zag\`, and it binds no machine`)
    }
    lines.push(`import * as zag from '@zag-js/${shell.machine.of}'`, '')
  }
  const imports = memberImports(needs.members, shell.fixtureDir ?? shell.dir, 'vocabulary', context)
  // The foundation's members a fixture renders, and the values its JavaScript names.
  const fromFoundation = [...new Set([...imports.foundation, ...needs.values])].sort()
  lines.push(
    fromFoundation.length > 0
      ? `import { ${fromFoundation.join(', ')}, type ComponentStates } from '@polymorph/solid'`
      : "import type { ComponentStates } from '@polymorph/solid'",
  )
  lines.push('')
  lines.push(...imports.lines)
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
  lines.push(`  entries: [${entries.join(', ')}],`)
  lines.push('}')
  lines.push('')
  return lines.join('\n')
}

/* -------------------------------------------------------------------------- */
/* The index and the galleries                                                */
/* -------------------------------------------------------------------------- */

export function renderSolidIndex(shells: readonly MemberShell[]): string {
  const lines = [
    '/**',
    ' * `@polymorph/solid-ui`, the closed vocabulary for Solid.',
    ' *',
    ' * Every member is a component generated by `pnpm shells` from its',
    ' * framework-neutral description (`packages/shells/src/members/`), and takes the',
    " * React member's props by the mapping in `docs/frameworks.md`. The base layer",
    ' * is imported for its side effect, as the React vocabulary does.',
    ' *',
    ' * Generated by `pnpm shells`. Never edit it by hand.',
    ' */',
    '',
    "import '@polymorph/recipes/base.css'",
    '',
    "export { gallerySlug, lawfulCells } from '@polymorph/solid'",
    `export type { ${['ComponentStates', 'StateEntry', ...foundationTypeExports('solid')].join(', ')} } from '@polymorph/solid'`,
    '',
  ]
  for (const shell of [...shells].sort((a, b) => a.member.localeCompare(b.member))) {
    const types = [`${shell.member}Props`, ...Object.keys(shell.types ?? {})].sort()
    if ((shell.home ?? 'vocabulary') === 'foundation') {
      lines.push(`export { ${shell.member} } from '@polymorph/solid'`)
      lines.push(`export type { ${types.join(', ')} } from '@polymorph/solid'`)
      continue
    }
    const module = `./${shell.dir}/${shell.member}`
    const parts = (shell.parts ?? []).filter((part) => part.public)
    if (parts.length === 0) {
      lines.push(`export { default as ${shell.member} } from '${module}'`)
    } else {
      // A compound part is a property of its member: `<Tabs.Content>`.
      lines.push(`import ${shell.member}Root from '${module}'`)
      for (const part of parts) {
        lines.push(
          `import ${shell.member}${part.name} from './${shell.dir}/${shell.member}${part.name}'`,
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
          `export type { ${shell.member}${part.name}Props } from './${shell.dir}/${shell.member}${part.name}'`,
        )
      }
    }
    lines.push(`export type { ${types.join(', ')} } from '${module}'`)
  }
  lines.push('')
  return lines.join('\n')
}

/** The galleries: every described member's states fixture, in the order of the descriptions. */
export function renderSolidGalleries(shells: readonly MemberShell[]): string {
  const lines = [
    '/**',
    ' * Every states fixture in the Solid vocabulary, for the laws. A separate module',
    ' * from the index, so an application never bundles the fixtures.',
    ' *',
    ' * Generated by `pnpm shells`. Never edit it by hand.',
    ' */',
    "import type { ComponentStates } from '@polymorph/solid'",
    '',
  ]
  const names = shells.map((shell) => ({
    shell,
    binding: `${shell.member.charAt(0).toLowerCase()}${shell.member.slice(1)}States`,
  }))
  for (const { shell, binding } of names) {
    lines.push(
      `import { states as ${binding} } from './${shell.fixtureDir ?? shell.dir}/${fixtureName(shell)}.states'`,
    )
  }
  lines.push('')
  lines.push(
    `export const GALLERIES: readonly ComponentStates[] = [${names.map(({ binding }) => binding).join(', ')}]`,
  )
  lines.push('')
  return lines.join('\n')
}

/**
 * Every Solid file the descriptions generate, by repository path, before
 * formatting: each member's component and states fixture, each compound
 * part's component, the vocabulary's index and galleries. The foundation's
 * glyph data and Icon stylesheet are the Vue foundation's, written beside the
 * Solid `Icon` by the caller.
 */
export function renderSolidFiles(
  registry: Registry,
  shells: readonly MemberShell[],
): Map<string, string> {
  const where = locations(shells)
  const owners = typeOwners(shells)
  const types = new Map(shells.flatMap((shell) => Object.entries(shell.types ?? {})))
  const files = new Map<string, string>()
  for (const shell of shells) {
    const component = registryMember(registry, shell.member)
    const context: SolidContext = {
      locations: where,
      owners,
      types,
      source: descriptionPath(shell),
      lookup: (name) => {
        try {
          return registryMember(registry, name)
        } catch {
          // A compound part (`TabsContent`) has no registry entry of its own.
          return undefined
        }
      },
    }
    files.set(solidComponentPath(shell), renderSolidMember(shell, component, context))
    for (const part of shell.parts ?? []) {
      const rendered = partShell(shell, part, component)
      files.set(
        solidPartPath(shell, part.name),
        renderSolidMember(rendered.shell, rendered.component, context, shell.member),
      )
    }
    if (!isPrimitive(registry, shell.member)) {
      files.set(solidStatesPath(shell), renderSolidStates(shell, component, context))
    }
  }
  files.set(`${SOLID_VOCABULARY_SRC}/index.ts`, renderSolidIndex(shells))
  files.set(
    `${SOLID_VOCABULARY_SRC}/galleries.ts`,
    renderSolidGalleries(shells.filter((shell) => !isPrimitive(registry, shell.member))),
  )
  return files
}
