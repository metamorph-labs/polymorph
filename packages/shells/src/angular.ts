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
  classReference,
  descriptionPath,
  directionPlace,
  entrySubject,
  EVENT_TYPES as SHARED_EVENT_TYPES,
  fixtureName,
  foundationTypeExports,
  gridEntries,
  handlerExpressions,
  holds,
  hostElement,
  isFactory,
  isFunctionType,
  isIdentifier,
  isPrimitive,
  jsString,
  key,
  locations as whereEach,
  partShell,
  presenceEntries,
  presenceExpressions,
  presenceReads,
  registryMember,
  relativeFile,
  composed,
  renderedChildren,
  RENDERS_KEYS,
  type FixtureRenders,
  statement,
  staticString,
  STRUCTURAL_TAGS,
  templateClassNames,
  templateExpressions,
  typeOwners,
  typeParameters,
  walk,
  withAgent,
  wrapDoc,
  type Location,
  type RegistryMemberLike,
} from './common'
import { freeNames } from './expr'
import {
  ENGINE_HELPERS,
  eventParameters,
  FOUNDATION_TYPES,
  renderParameter,
  rewriteType,
} from './types'

/**
 * The Angular renderer: a member's description, written as a standalone
 * Angular component with an inline template, its states fixture and the
 * vocabulary's index.
 *
 * An Angular member takes the React member's value props as signal inputs of
 * their React names (`aria-label` is the input `aria-label`), each `onFoo`
 * prop as the output `foo`, `children` and every node prop as content
 * projection (the default slot, and `<ng-content select="[slot=footer]">` for
 * a named one), and a render prop as an input that takes an `ng-template`,
 * rendered with its argument as the template's `$implicit`. Which prop is
 * which comes from the registry through `vueBinding`
 * (`@polymorph/registry/frameworks`), the reading every other shell uses.
 *
 * The anatomy becomes the template. Angular's template language has no
 * arrow functions, assignments or spreads, so the template holds no
 * description expression: each one is a method of the class (`e1(tab)`), its
 * loop variables its parameters, and a handler is a method too (`h1($event)`).
 * A method repeats the conditions of the branches around it as early returns,
 * so TypeScript narrows its values as it would in the template. The scope is
 * spelled as the class reads it: a prop is `this.$p.label` (the member's props
 * as its caller and its slot set them), a held, derived or element value a
 * cell's `.value`, the machine's API `this.api.value`.
 *
 * Output is deterministic: the same description and registry give the same
 * bytes, which the freshness law (`shells.test.ts`) relies on.
 */

/** Where the Angular vocabulary's generated files go. */
export const ANGULAR_VOCABULARY_SRC = 'packages/angular-ui/src'
/** Where the Angular foundation's generated files go. */
export const ANGULAR_FOUNDATION_SRC = 'packages/angular/src'

/** Where every described member's file is, for imports between them. */
export interface AngularContext {
  locations: ReadonlyMap<string, Location>
  /** The component that declares each shared type, by the type's name. */
  owners: ReadonlyMap<string, string>
  /** The description's file, for the generated header. */
  source: string
  /** Another described member's or part's registry entry, for the props it takes. */
  lookup: (name: string) => RegistryMemberLike | undefined
  /** Whether a described member or part is generic over a type (`DataTable`). */
  generic: (name: string) => boolean
  /** The tag of an internal part whose element is its host (`li` for `TagInputChip`). */
  hostTag: (name: string) => string | undefined
  /** The members and parts a described member's or part's template composes, by its component's name. */
  composes?: (name: string) => ReadonlySet<string>
}

/** A member's component file. */
export function angularComponentPath(shell: MemberShell): string {
  const root =
    (shell.home ?? 'vocabulary') === 'foundation' ? ANGULAR_FOUNDATION_SRC : ANGULAR_VOCABULARY_SRC
  return `${root}/${shell.dir}/${shell.member}.ts`
}

/** A compound part's component file. */
export function angularPartPath(shell: MemberShell, part: string): string {
  return `${ANGULAR_VOCABULARY_SRC}/${shell.dir}/${shell.member}${part}.ts`
}

/** A member's states fixture. */
export function angularStatesPath(shell: MemberShell): string {
  return `${ANGULAR_VOCABULARY_SRC}/${shell.fixtureDir ?? shell.dir}/${fixtureName(shell)}.states.ts`
}

/** A member's element name: `pm-` and its name in kebab case (`pm-tabs-content`). */
export function angularSelector(name: string): string {
  return `pm-${name
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
    .toLowerCase()}`
}

/** A property read: `this.$p.label`, `this.$p['aria-label']`. */
const access = (target: string, name: string) =>
  isIdentifier(name) ? `${target}.${name}` : `${target}['${name}']`

/** Whether a string can be an attribute's value or a template's text as it is. */
const plain = (value: string) => value !== '' && !/[{}<>&"@`$\\\n\r\t]|^\s|\s$|\s\s/.test(value)

/**
 * A static attribute (`label="Ticket's"`) as a bound string literal
 * (`[label]="'Ticket\\'s'"`), its backslashes and quotes escaped, for a part
 * whose element is its host: a static attribute would set the part's input and
 * also stay on the element, which keeps every attribute but the selector. Any
 * other binding is returned as it is.
 */
const boundLiteral = (part: string): string => {
  const match = /^([\w-]+)="(.*)"$/s.exec(part)
  if (match === null) return part
  const [, name = '', text = ''] = match
  return `[${name}]="'${text.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'"`
}

/**
 * The foundation's helpers an expression may call, imported from
 * `@polymorph/angular`: its own, and the engine's framework-free conventions,
 * which it re-exports and the React and Vue members import too.
 */
const FOUNDATION_HELPERS = new Set([
  ...ENGINE_HELPERS,
  'mergeParts',
  // The toast store's, which Toast's viewport and FormField's notice read and write.
  'toast',
  'getToasts',
  'subscribeToasts',
  'removeToast',
])

/**
 * The foundation's components a description names as an element: each is an
 * Angular component or directive on a real element, so no element of
 * Angular's own sits in the member's DOM. `Glyph` and `BrandMark` draw on the
 * `<svg>` itself; `PageTransition` is a directive on the element its `as`
 * names.
 */
const FOUNDATION_ELEMENTS: Readonly<
  Record<
    string,
    { tag: string | null; directive: string; primary: string; inputs: readonly string[] }
  >
> = {
  Glyph: { tag: 'svg', directive: 'pmGlyph', primary: 'glyph', inputs: [] },
  BrandMark: { tag: 'svg', directive: 'pmBrandMark', primary: 'name', inputs: ['size', 'label'] },
  PageTransition: {
    tag: null,
    directive: 'pmPageTransition',
    primary: '',
    inputs: ['transitionKey', 'pending', 'ribbon'],
  },
}

/**
 * The foundation's module each convention a member inside the foundation
 * (`Icon`) reads comes from: it cannot import the foundation's index, which
 * imports it back.
 */
const FOUNDATION_MODULES: Readonly<Record<string, string>> = {
  MEMBER_PROVIDERS: '../conventions/member',
  useMember: '../conventions/member',
  derived: '../conventions/cells',
  classes: '../conventions/classes',
  Glyph: './Glyph',
  Spread: '../zag/spread',
}

/** The DOM event type a handler for an event receives: Angular types an `(input)` listener's as `Event`. */
const EVENT_TYPES: Readonly<Record<string, string>> = { ...SHARED_EVENT_TYPES, input: 'Event' }

/**
 * Attributes the DOM reads by their presence: written when the value is
 * truthy (or `''`), and removed otherwise, as React and Vue write them, never
 * as `disabled="false"`.
 */
const PRESENCE_ATTRIBUTES = new Set([
  'disabled',
  'hidden',
  'required',
  'multiple',
  'open',
  'inert',
  'autofocus',
  'readonly',
  'novalidate',
  'formnovalidate',
  'nomodule',
  'ismap',
  'itemscope',
  'allowfullscreen',
  'async',
  'defer',
  'controls',
  'loop',
  'muted',
  'playsinline',
  'reversed',
  'default',
])

/** Elements that have no end tag, which Angular's template refuses one for. */
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

/** Attributes a form control holds as its state: written as the element's DOM property. */
const PROPERTY_ATTRIBUTES: Readonly<Record<string, readonly string[]>> = {
  value: ['input', 'textarea', 'select'],
  checked: ['input'],
  indeterminate: ['input'],
  selected: ['option'],
}

/* -------------------------------------------------------------------------- */
/* The member's interface: inputs, outputs and slots from the registry         */
/* -------------------------------------------------------------------------- */

export interface AngularProp {
  /** The registry's name, which is the input's public name (`aria-label`). */
  name: string
  /** The class field: `ariaLabel` for an input, `onClick` for an output. */
  field: string
  kind: 'input' | 'output' | 'slot' | 'template'
  /** For an output, its public name (`click`); for a slot, its name (`default`, `footer`). */
  binding: string
  /** An input's type, an output's payload, a template input's `NodeTemplate`. */
  type: string
  optional: boolean
  doc?: string
}

export interface AngularInterface {
  props: AngularProp[]
  /** Type names the interface references. */
  names: Set<string>
}

/**
 * A type a description or the registry writes, for an Angular member: a node
 * is a `NodeTemplate`, a function that returns a node (a DataTable column's
 * `cell`) is a `NodeTemplate` of its parameters (`NodeTemplate<[Row]>`), and a
 * React ref is a `ControlRef`.
 */
export function angularType(text: string): string {
  const replaced = text.replace(/\bRef<([^<>]+?) \| null>/g, 'ControlRef<$1>')
  const source = ts.createSourceFile('t.ts', `type T = ${replaced}`, ts.ScriptTarget.ESNext, true)
  const offset = 'type T = '.length
  const edits: { start: number; end: number; text: string }[] = []
  const returnsNode = (node: ts.TypeNode): boolean => /\bVNode\b/.test(node.getText(source))
  const visit = (node: ts.Node): void => {
    if (ts.isFunctionTypeNode(node) && returnsNode(node.type)) {
      const parameters = node.parameters.map((parameter) =>
        parameter.type ? angularType(parameter.type.getText(source)) : 'unknown',
      )
      edits.push({
        start: node.getStart(source),
        end: node.getEnd(),
        text: `NodeTemplate<[${parameters.join(', ')}]>`,
      })
      return
    }
    if (ts.isTypeReferenceNode(node) && node.typeName.getText(source) === 'VNode') {
      edits.push({ start: node.getStart(source), end: node.getEnd(), text: 'NodeTemplate' })
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
 * Members whose React props are a union of variants that differ in the type of
 * their value: DatePicker takes and emits a `CalendarDate` at a day's
 * granularity and a `CalendarDateTime` at a time's. React picks the variant
 * from the value a caller passes. An Angular component has one signature, so
 * the member is generic over its value, and a template infers the parameter
 * from what it binds to `[value]`, which is how the React caller's variant is
 * chosen. The parameter defaults to the union, so a member bound to no value
 * takes and emits either.
 */
export const VALUE_PARAMETERS: Readonly<
  Record<string, { parameter: string; types: readonly string[]; props: readonly string[] }>
> = {
  DatePicker: {
    parameter: 'Value',
    types: ['CalendarDate', 'CalendarDateTime'],
    props: ['value', 'defaultValue', 'onChange'],
  },
}

/** A prop's type with a value parameter's types read as the parameter: `Value | null`. */
export function valueParameterType(
  type: string,
  values: (typeof VALUE_PARAMETERS)[string],
): string {
  const parts = unionParts(type).map((part) => part.trim())
  if (!values.types.every((value) => parts.includes(value))) return type
  const rest = [...new Set(parts.filter((part) => !values.types.includes(part)))]
  return [values.parameter, ...rest].join(' | ')
}

/** A member's inputs, outputs and slots, by the registry; a prop listed under a part's name is the part's. */
export function angularInterface(component: RegistryMemberLike): AngularInterface {
  const result: AngularInterface = { props: [], names: new Set() }
  for (const prop of component.props) {
    if (prop.name.includes('.')) continue
    const binding = vueBinding(prop)
    const base = {
      name: prop.name,
      optional: prop.optional,
      ...(prop.doc ? { doc: prop.doc } : {}),
    }
    if (binding.kind === 'prop') {
      const printed = rewriteType(prop.type)
      printed.names.forEach((name) => result.names.add(name))
      result.props.push({
        ...base,
        field: camel(prop.name),
        kind: 'input',
        binding: camel(prop.name),
        type: angularType(printed.text),
      })
    } else if (binding.kind === 'event') {
      const { parameters, names } = eventParameters(prop.type)
      names.forEach((name) => result.names.add(name))
      const first = parameters[0]
      result.props.push({
        ...base,
        field: prop.name,
        kind: 'output',
        binding: binding.name,
        type: first === undefined ? 'void' : angularType(first.type),
        optional: true,
      })
    } else if (binding.kind === 'slot') {
      result.props.push({
        ...base,
        field: camel(prop.name),
        kind: 'slot',
        binding: binding.name,
        type: 'NodeTemplate',
      })
    } else {
      const parameter = renderParameter(prop.type)
      parameter?.names.forEach((name) => result.names.add(name))
      result.props.push({
        ...base,
        field: camel(prop.name),
        kind: 'template',
        binding: binding.name,
        type: `NodeTemplate<[${parameter === null ? '' : angularType(parameter.text)}]>`,
      })
    }
  }
  result.names.delete('Ref')
  if ([...result.props].some((prop) => /\bControlRef\b/.test(prop.type)))
    result.names.add('ControlRef')
  return result
}

/* -------------------------------------------------------------------------- */
/* Walking the anatomy                                                        */
/* -------------------------------------------------------------------------- */

/** The import path from one member's directory to another's module. */
const relativeModule = (fromDir: string, toDir: string, module: string): string =>
  relativeFile(fromDir, toDir, module)

/** Whether an expression is an arrow function or a function expression. */
function functionNode(expr: Expr): ts.ArrowFunction | ts.FunctionExpression | null {
  const source = ts.createSourceFile('handler.ts', `(${expr})`, ts.ScriptTarget.ESNext, true)
  const parsed = source.statements[0]
  if (parsed === undefined || !ts.isExpressionStatement(parsed)) return null
  let node: ts.Expression = parsed.expression
  while (ts.isParenthesizedExpression(node)) node = node.expression
  return ts.isArrowFunction(node) || ts.isFunctionExpression(node) ? node : null
}

/** An expression's negation: its operand when it is a negation itself, else `!(…)`. */
function negation(code: string): string {
  const source = ts.createSourceFile('not.ts', `(${code})`, ts.ScriptTarget.ESNext, true)
  const parsed = source.statements[0]
  if (parsed !== undefined && ts.isExpressionStatement(parsed)) {
    let node: ts.Expression = parsed.expression
    while (ts.isParenthesizedExpression(node)) node = node.expression
    if (ts.isPrefixUnaryExpression(node) && node.operator === ts.SyntaxKind.ExclamationToken)
      return node.operand.getText(source)
  }
  return `!(${code})`
}

/**
 * The string literals an expression can evaluate to, a dynamic tag's
 * candidates: the literal itself, either branch of a conditional, and the
 * right side of `??` and `||`, never a literal it compares against.
 */
function stringLiterals(expr: Expr): string[] {
  const out: string[] = []
  const source = ts.createSourceFile('tag.ts', `(${expr})`, ts.ScriptTarget.ESNext, true)
  const visit = (node: ts.Node): void => {
    if (ts.isParenthesizedExpression(node)) visit(node.expression)
    else if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      if (!out.includes(node.text)) out.push(node.text)
    } else if (ts.isConditionalExpression(node)) {
      visit(node.whenTrue)
      visit(node.whenFalse)
    } else if (
      ts.isBinaryExpression(node) &&
      (node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken ||
        node.operatorToken.kind === ts.SyntaxKind.BarBarToken)
    ) {
      visit(node.left)
      visit(node.right)
    }
  }
  const statementNode = source.statements[0]
  if (statementNode !== undefined && ts.isExpressionStatement(statementNode))
    visit(statementNode.expression)
  return out
}

/** The string literals of a union type the registry prints (`"div" | "section"`). */
function literalUnion(type: string): string[] {
  return unionParts(type)
    .map((part) => /^\s*["']([^"']+)["']\s*$/.exec(part)?.[1])
    .filter((value): value is string => value !== undefined)
}

/**
 * The properties of a description's types that hold a function returning a
 * node (`cell`): a call of one in an expression binds the template to its
 * arguments instead (`bindTemplate(column.cell, row)`), which `Render` draws.
 */
export function nodeFunctions(shells: readonly MemberShell[]): Set<string> {
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

export { hostElement }

/** The attribute that selects a part whose element is its host: `pmTagInputChip`. */
export const hostAttribute = (name: string) => `pm${name}`

/* -------------------------------------------------------------------------- */
/* Expressions                                                                */
/* -------------------------------------------------------------------------- */

/** How the scope's names read in the class. */
interface Spelling {
  /** A free name's spelling, or `null` to leave it. */
  name(name: string): string | null
  /** `emit('x', …)` and `invoke('x', …)`: the head of the call, up to its arguments. */
  event(event: string, kind: 'emit' | 'invoke'): string
  /** `slots.x`: whether the caller filled it. */
  filled(slot: string): string
  /** `slotted(slots.x)`, `slotText(slots.x)` and `slotNode(slots.x)`. */
  slot(slot: string, read: 'slotted' | 'text' | 'node'): string
  /**
   * `slotNode(slots.x, arg)` and `slotDraws(slots.x, arg)` for a render prop: the
   * call's head, up to its argument (`bindSlot(this.$p.x, `).
   */
  scoped(slot: string, call: 'node' | 'draws'): string
  /** `listening.x`: whether anyone handles the event. */
  listening(event: string): string
  /** Properties holding a function that returns a node, whose calls bind a template. */
  nodeCalls: ReadonlySet<string>
}

/**
 * A description's expression, written for the class. It parses the expression
 * with TypeScript, as `expr.ts` does, so a property name, an object key and a
 * name an arrow function binds are left alone, and rewrites the scope: each
 * free name by `spelling.name`, `emit` and `invoke` as the member context's,
 * the slot and listening reads, a call of a node function as a bound
 * template, and the type `VNode` as `Content`.
 */
function classExpr(expr: Expr, spelling: Spelling): string {
  const text = `(${expr})`
  const source = ts.createSourceFile('expr.ts', text, ts.ScriptTarget.ESNext, true)
  const statementNode = source.statements[0]
  if (
    statementNode === undefined ||
    !ts.isExpressionStatement(statementNode) ||
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
        const head = spelling.event(first.text, callee)
        if (second === undefined) {
          edits.push({ start: node.getStart(source), end: first.getEnd(), text: head })
        } else {
          edits.push({
            start: node.getStart(source),
            end: second.getStart(source),
            text: `${head}, `,
          })
        }
        for (const argument of node.arguments.slice(1)) visit(argument, bound)
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
        for (const argument of node.arguments.slice(1)) visit(argument, bound)
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
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      spelling.nodeCalls.has(node.expression.name.text) &&
      node.arguments.length > 0
    ) {
      // `column.cell(row)`: the template bound to its arguments.
      edits.push({
        start: node.getStart(source),
        end: node.expression.getStart(source),
        text: 'bindTemplate(',
      })
      edits.push({
        start: node.expression.getEnd(),
        end: node.arguments[0]?.getStart(source) ?? node.getEnd(),
        text: ', ',
      })
      visit(node.expression, bound)
      for (const argument of node.arguments) visit(argument, bound)
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
    if (
      ts.isTypeReferenceNode(node) &&
      ts.isIdentifier(node.typeName) &&
      node.typeName.text === 'VNode'
    ) {
      edits.push({ start: node.getStart(source), end: node.getEnd(), text: 'Content' })
      return
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
  visit(statementNode.expression, new Set())

  let out = text
  for (const edit of edits.sort((a, b) => b.start - a.start || b.end - a.end)) {
    out = out.slice(0, edit.start) + edit.text + out.slice(edit.end)
  }
  return out.slice(1, -1)
}

/* -------------------------------------------------------------------------- */
/* The component                                                              */
/* -------------------------------------------------------------------------- */

/** A loop variable in reach: an item, typed by its loop's list method, or an index. */
interface Loop {
  name: string
  kind: 'item' | 'index'
  /** The method that returns the loop's list. */
  of: string
}

/** A branch's condition, and whether it holds there (an earlier branch's does not). */
interface Guard {
  when: Expr
  holds: boolean
  /** The loop variables in reach where the condition is written, which it reads by their names. */
  loops: readonly Loop[]
}

/** Where in the anatomy a node is. */
interface At {
  loops: readonly Loop[]
  /** The conditions of the branches around the node: each holds, or does not, where it renders. */
  guards: readonly Guard[]
  /** Inside another member's slot content: that slot's name, which an outlet forwards into. */
  into?: string
}

/** The template's text, with whether it is text (which no whitespace may touch). */
interface Markup {
  text: string
  inline: boolean
}

/** The Angular component for one member, before formatting. */
export function renderAngularMember(
  described: MemberShell,
  component: RegistryMemberLike,
  context: AngularContext,
  nodeCalls: ReadonlySet<string>,
  /** For a compound part: the member it belongs to, whose `provide` it reads as `owner`. */
  owner?: string,
  /** For an internal part that draws one element: that element's tag, which is its host. */
  hostTag?: string,
): string {
  // The agent block is one more effect, which registers the instance with the agent registry.
  const shell = withAgent(described)
  const face = angularInterface(component)
  const values = VALUE_PARAMETERS[shell.member]
  if (values !== undefined) {
    for (const prop of face.props) {
      if (values.props.includes(prop.name)) prop.type = valueParameterType(prop.type, values)
    }
  }
  const home = shell.home ?? 'vocabulary'
  const template = Array.isArray(shell.template)
    ? (shell.template as readonly Node[])
    : [shell.template as Node]
  checkSlots(shell.member, template)
  const parameters = values === undefined ? typeParameters(shell.generic) : [values.parameter]
  const own = parameters.length === 0 ? '' : `<${parameters.join(', ')}>`
  // A value parameter is declared with its bound and its default, the union of the value types.
  const declaredParameters =
    values === undefined
      ? own
      : `<${values.parameter} extends ${values.types.join(' | ')} = ${values.types.join(' | ')}>`

  const inputs = face.props.filter((prop) => prop.kind === 'input' || prop.kind === 'template')
  const valueByCamel = new Map(inputs.map((prop) => [camel(prop.name), prop]))
  const events = new Map(
    face.props.filter((prop) => prop.kind === 'output').map((prop) => [prop.binding, prop]),
  )
  const slotProps = new Map(
    face.props
      .filter((prop) => prop.kind === 'slot' || prop.kind === 'template')
      .map((prop) => [prop.binding, prop]),
  )

  const derivedNames = new Set(Object.keys(shell.derived ?? {}))
  const stateNames = new Set(Object.keys(shell.state ?? {}))
  const presenceNames = new Set([
    ...Object.keys(shell.presence ?? {}),
    ...Object.keys(shell.listPresence ?? {}),
  ])
  // A media query and the colour mode are both signals the foundation gives, read by calling them.
  const mediaNames = new Set([
    ...Object.keys(shell.media ?? {}),
    ...(shell.mode === undefined ? [] : [shell.mode]),
  ])
  const departureNames = new Set(Object.keys(shell.departures ?? {}))
  for (const name of [...derivedNames, ...stateNames, ...presenceNames, ...mediaNames]) {
    if (valueByCamel.has(name)) {
      throw new Error(
        `shells: ${shell.member} names a derived or state value "${name}" after a prop`,
      )
    }
  }
  for (const name of Object.keys(shell.recipes ?? {})) {
    if (
      name === 'styles' ||
      valueByCamel.has(name) ||
      derivedNames.has(name) ||
      stateNames.has(name)
    ) {
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
  const controlRefNames = new Set(Object.keys(shell.controlRefs ?? {}))

  /* the slots ----------------------------------------------------------------- */
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
  /** Slots whose content the member renders or reads, each an `ng-template` of its projection. */
  const projected = new Set<string>()
  for (const source of allSources) {
    for (const match of source.matchAll(/\bslots\.(\w+)/g)) {
      const entry = slotProps.get(match[1] as string)
      if (entry === undefined) {
        throw new Error(
          `shells: ${shell.member} reads the slot "${match[1]}", which it has no prop for`,
        )
      }
      if (entry.kind === 'slot') projected.add(entry.binding)
    }
  }
  const passes = new Map<string, SlotNode>()
  walk(template, (node) => {
    if (node.kind !== 'slot') return
    const entry = slotProps.get(node.name)
    if (entry === undefined) {
      throw new Error(`shells: ${shell.member} renders a slot "${node.name}" it has no prop for`)
    }
    if (entry.kind === 'slot') projected.add(entry.binding)
    if (node.pass !== undefined) {
      if (passes.has(node.name)) {
        throw new Error(`shells: ${shell.member} hands the slot "${node.name}" props twice`)
      }
      passes.set(node.name, node)
    }
  })

  /* the spelling ------------------------------------------------------------ */
  const outputOf = (event: string): AngularProp => {
    const prop = events.get(event)
    if (prop === undefined) throw new Error(`shells: ${shell.member} emits "${event}", no on-prop`)
    return prop
  }
  const baseName = (name: string): string | null => {
    const prop = valueByCamel.get(name)
    if (prop !== undefined) return access('this.$p', prop.name)
    if (derivedNames.has(name) || stateNames.has(name) || templateRefs.has(name))
      return `this.${name}.value`
    if (controlRefNames.has(name)) return `this.${name}.value`
    if (presenceNames.has(name)) return `this.${name}.value()`
    if (mediaNames.has(name)) return `this.${name}()`
    if (departureNames.has(name)) return `this.${name}`
    if (name === 'api' && shell.machine !== undefined) return 'this.api.value'
    if (name === 'service' && shell.machine !== undefined) return 'this.service.value'
    if (name === 'uid') return 'this.uid'
    if (name === 'lent') return 'this.lent'
    if (name === 'lender') return 'this.lender'
    if (name === 'borrowed') return 'this.borrowed'
    // A function run after the next render, which needs the member's injector.
    if (name === 'afterRender') return 'this.$.afterRender'
    if (name === 'owner' && owner !== undefined) return 'this.owner'
    if (name === 'VNode') return 'Content'
    return null
  }
  const spellingFor = (
    loops: readonly Loop[],
    extra: ReadonlySet<string> = new Set(),
  ): Spelling => ({
    name: (name) => {
      if (extra.has(name) || loops.some((loop) => loop.name === name)) return null
      return baseName(name)
    },
    event: (event, kind) => {
      const prop = outputOf(event)
      return `this.$.${kind}(this.${prop.field}, '${prop.name}'`
    },
    filled: (slot) => {
      const entry = slotProps.get(slot)
      if (entry === undefined) throw new Error(`shells: ${shell.member} reads slots.${slot}`)
      if (entry.kind === 'template') return `(${access('this.$p', entry.name)} !== undefined)`
      return `this.$.filled('${entry.binding}')`
    },
    slot: (slot, read) => {
      const entry = slotProps.get(slot)
      if (entry === undefined || entry.kind !== 'slot')
        throw new Error(`shells: ${shell.member} reads slots.${slot}`)
      // A slot's content as a node another component draws is the template it is projected into.
      if (read === 'node') return `this.$.template('${entry.binding}')`
      return `this.$.${read === 'slotted' ? 'slotted' : 'text'}('${entry.binding}')`
    },
    scoped: (slot, call) => {
      const entry = slotProps.get(slot)
      if (entry?.kind !== 'template') throw new Error(`shells: ${shell.member} reads slots.${slot}`)
      const helper = call === 'node' ? 'bindSlot' : 'slotDraws'
      foundationValues.add(helper)
      return `${helper}(${access('this.$p', entry.name)}, `
    },
    listening: (event) => {
      const prop = outputOf(event)
      return `this.$.listening(this.${prop.field}, '${prop.name}')`
    },
    nodeCalls,
  })
  const scriptExpr = (expr: Expr, extra: ReadonlySet<string> = new Set()) =>
    classExpr(expr, spellingFor([], extra))

  /** Whether an expression reads a slot's content, which no signal follows. */
  const readsSlots = (expr: Expr) => /\b(slotted|slotText|slotNode)\(|\bslots\.\w+/.test(expr)

  /* what the code uses ------------------------------------------------------ */
  const core = new Set<string>(['Component', 'ViewEncapsulation'])
  const foundationValues = new Set<string>(['MEMBER_PROVIDERS', 'useMember'])
  const foundationTypes = new Set<string>()
  const motion = new Set<string>()
  const directives = new Set<string>()
  const composedMembers = new Set<string>()
  /** Composed members whose props type a binding's method returns. */
  const propTypes = new Set<string>()

  /* hoisted methods --------------------------------------------------------- */
  const methods: string[] = []
  const memo = new Map<string, string>()
  let valueCount = 0
  let handlerCount = 0

  /** The loop variables an expression's code and its guards read, as parameters. */
  const loopParameters = (reads: ReadonlySet<string>, at: At): Loop[] => {
    const fromGuards = guardLoops(at)
    return at.loops.filter((loop) => reads.has(loop.name) || fromGuards.includes(loop))
  }

  // The class by name, not `this`: TypeScript narrows a value of a concrete type, never one that
  // depends on the polymorphic `this`.
  const parameterDeclaration = (loop: Loop) =>
    loop.kind === 'index'
      ? `${loop.name}: number`
      : `${loop.name}: Each<ReturnType<${shell.member}${own}['${loop.of}']>>`

  const guardLines = (at: At, returned: string) =>
    at.guards.map((guard) => {
      const code = classExpr(guard.when, spellingFor(guard.loops))
      return guard.holds
        ? `if (${negation(code)}) return${returned}`
        : `if (${code}) return${returned}`
    })
  /** The loop variables the guards read, each by the loop in reach where the guard is written. */
  const guardLoops = (at: At): Loop[] => {
    const out: Loop[] = []
    for (const guard of at.guards) {
      const reads = freeNames(guard.when)
      for (const loop of guard.loops)
        if (reads.has(loop.name) && !out.includes(loop)) out.push(loop)
    }
    return out
  }
  const guardId = (at: At) =>
    at.guards.map((guard) => `${guard.holds ? '' : '!'}(${guard.when})`).join('&&')

  const readsOf = (exprs: readonly Expr[]) => {
    const names = new Set<string>()
    for (const expr of exprs) for (const name of freeNames(expr)) names.add(name)
    return names
  }

  /**
   * A value method: the expression's code, after the guards of the branches
   * around it, returned. Its parameters are the loop variables it reads.
   */
  const value = (
    expr: Expr,
    at: At,
    wrap: (code: string) => string = (code) => code,
    visible = false,
    returns?: string,
  ): string => {
    const reads = readsOf([expr])
    const loops = loopParameters(reads, at)
    const code = wrap(classExpr(expr, spellingFor(at.loops)))
    const id = `v|${code}|${guardId(at)}|${loops.map((loop) => `${loop.name}:${loop.of}`).join(',')}|${returns ?? ''}`
    const call = (name: string) => `${name}(${loops.map((loop) => loop.name).join(', ')})`
    const known = memo.get(id)
    if (known !== undefined) return call(known)
    valueCount += 1
    const name = `e${valueCount}`
    memo.set(id, name)
    // A loop's list is read by the types of its rows' methods (`this['e3']`), so it is public.
    const lines = [
      `${visible ? '' : 'protected '}${name}(${loops.map(parameterDeclaration).join(', ')})${returns === undefined ? '' : `: ${returns}`} {`,
      ...guardLines(at, ' undefined as never'),
      `return ${code}`,
      '}',
    ]
    methods.push(lines.join('\n'))
    foundationTypes.add('Each')
    return call(name)
  }

  /** A value method from code already in the class's spelling (an attribute bag, a bound template). */
  const valueCode = (code: string, reads: ReadonlySet<string>, at: At): string => {
    const loops = loopParameters(reads, at)
    const id = `c|${code}|${guardId(at)}|${loops.map((loop) => `${loop.name}:${loop.of}`).join(',')}`
    const call = (name: string) => `${name}(${loops.map((loop) => loop.name).join(', ')})`
    const known = memo.get(id)
    if (known !== undefined) return call(known)
    valueCount += 1
    const name = `e${valueCount}`
    memo.set(id, name)
    methods.push(
      [
        `protected ${name}(${loops.map(parameterDeclaration).join(', ')}) {`,
        ...guardLines(at, ' undefined as never'),
        `return ${code}`,
        '}',
      ].join('\n'),
    )
    return call(name)
  }

  /** The statement a handler runs, in the class's spelling, with `$event` as its event. */
  const handlerStatement = (handler: Handler, at: At, eventType: string): string => {
    const spelling = spellingFor(at.loops, new Set(['$event']))
    if ('run' in handler && handler.when === undefined) {
      const fn = functionNode(handler.run)
      if (fn !== null) {
        // A handler written as a function is the handler: it is called with the event, and a
        // parameter it does not annotate takes the event's type, or `unknown` after the first.
        const annotated = typedParameters(handler.run, eventType)
        return `void (${classExpr(annotated, spelling)})($event)`
      }
    }
    const action =
      'emit' in handler
        ? `emit(${[`'${handler.emit}'`, ...(handler.args ?? [])].join(', ')})`
        : handler.run
    const code = statement(classExpr(action, spelling))
    if (handler.when === undefined) return code
    return `if (${classExpr(handler.when, spelling)}) ${code.startsWith('void (') ? code : `{ ${code} }`}`
  }

  /** A handler method: `h1($event, tab)`, called from an event binding. */
  const handlerMethod = (handler: Handler, at: At, eventType: string): string => {
    const reads = readsOf(handlerExpressions(handler))
    const loops = loopParameters(reads, at)
    const usesEvent =
      reads.has('$event') || ('run' in handler && functionNode(handler.run) !== null)
    handlerCount += 1
    const name = `h${handlerCount}`
    const params = [
      ...(usesEvent ? [`$event: ${eventType}`] : []),
      ...loops.map(parameterDeclaration),
    ]
    methods.push(
      [
        `protected ${name}(${params.join(', ')}): void {`,
        ...guardLines(at, ''),
        handlerStatement(handler, at, eventType),
        '}',
      ].join('\n'),
    )
    if (loops.length > 0) foundationTypes.add('Each')
    return `${name}(${[...(usesEvent ? ['$event'] : []), ...loops.map((loop) => loop.name)].join(', ')})`
  }

  /* the anatomy, as a template ---------------------------------------------- */
  const join = (parts: readonly Markup[]): string =>
    parts
      .map((part, at) => {
        const before = parts[at - 1]
        return before !== undefined && !before.inline && !part.inline ? `\n${part.text}` : part.text
      })
      .join('')

  const renderNodes = (nodes: readonly Node[], at: At): string =>
    join(nodes.map((node) => renderNode(node, at)))

  /** An attribute an element takes, as Angular binds it, by React's and Vue's rules for the name. */
  const attributeBinding = (tag: string, name: string, expr: Expr, at: At): string => {
    const literal = staticString(expr)
    const property = PROPERTY_ATTRIBUTES[name]?.includes(tag) === true
    if (literal !== null && plain(literal) && !property && !PRESENCE_ATTRIBUTES.has(name)) {
      return `${name}="${literal}"`
    }
    if (property) {
      if (name === 'value') foundationValues.add('fieldValue')
      return name === 'value'
        ? `[value]="${value(expr, at, (code) => `fieldValue(${code})`)}"`
        : `[${name}]="${value(expr, at, (code) => `Boolean(${code})`)}"`
    }
    if (PRESENCE_ATTRIBUTES.has(name)) {
      foundationValues.add('presence')
      return `[attr.${name}]="${value(expr, at, (code) => `presence(${code})`)}"`
    }
    return `[attr.${name}]="${value(expr, at)}"`
  }

  /** A class list's code: one recipe class, or the foundation's `classes` over several. */
  const classCode = (names: readonly ClassName[], at: At): string => {
    const parts = names.map((name) =>
      typeof name === 'string'
        ? classReference(name)
        : `(${classExpr(name.when, spellingFor(at.loops))}) ? ${classReference(name.name)} : undefined`,
    )
    if (parts.length === 1 && typeof names[0] === 'string') return parts[0] as string
    foundationValues.add('classes')
    return `classes(${parts.join(', ')})`
  }

  /** A handler's key in an attribute bag: `onKeydown`, and `onContextmenuCapture` for a capture. */
  const handlerKey = (event: string) => {
    const [name, modifier] = event.split('.') as [string, string | undefined]
    if (modifier !== undefined && modifier !== 'capture') {
      throw new Error(
        `shells: ${shell.member} listens for "${event}"; the only modifier is capture`,
      )
    }
    return `on${capital(name)}${modifier === undefined ? '' : 'Capture'}`
  }

  const eventType = (event: string) => EVENT_TYPES[event.split('.')[0] as string] ?? 'Event'

  /** An element's bindings, as the template writes them on it. */
  const elementParts = (
    tag: string,
    node: ElementNode,
    at: At,
    extra: readonly string[],
  ): string[] => {
    const parts: string[] = [...extra]
    const on = Object.entries(node.on ?? {})
    const bagged = (node.spread?.length ?? 0) > 0 || on.some(([event]) => event.includes('.'))
    if (bagged) {
      // The machine's prop getters and the description's own attributes, as one object the
      // `Spread` directive writes: the description's win over the getters', even `undefined`.
      directives.add('Spread')
      foundationValues.add('mergeParts')
      const own: string[] = []
      const exprs: Expr[] = [...(node.spread ?? []), ...Object.values(node.attrs ?? {})]
      if (node.class && node.class.length > 0) {
        own.push(`class: ${classCode(node.class, at)}`)
        for (const name of node.class) if (typeof name !== 'string') exprs.push(name.when)
      }
      if (node.geometry && Object.keys(node.geometry).length > 0) {
        own.push(
          `style: { ${Object.entries(node.geometry)
            .map(
              ([property, expr]) => `${key(property)}: ${classExpr(expr, spellingFor(at.loops))}`,
            )
            .join(', ')} }`,
        )
        exprs.push(...Object.values(node.geometry))
      }
      for (const [name, expr] of Object.entries(node.attrs ?? {}))
        own.push(`${key(name)}: ${classExpr(expr, spellingFor(at.loops))}`)
      for (const [event, handler] of on) {
        const call = handlerMethod(handler, at, eventType(event))
        const usesEvent = call.includes('$event')
        own.push(
          `${key(handlerKey(event))}: (${usesEvent ? `$event: ${eventType(event)}` : ''}) => this.${call}`,
        )
        exprs.push(...handlerExpressions(handler))
      }
      const sources = [
        ...(node.spread ?? []).map((expr) => classExpr(expr, spellingFor(at.loops))),
        ...(own.length > 0 ? [`{ ${own.join(', ')} }`] : []),
      ]
      parts.push(
        `[pmSpread]="${valueCode(`mergeParts(${sources.join(', ')})`, readsOf(exprs), at)}"`,
      )
    } else {
      if (node.class && node.class.length > 0) {
        const whens = node.class.flatMap((name) => (typeof name === 'string' ? [] : [name.when]))
        parts.push(`[attr.class]="${valueCode(classCode(node.class, at), readsOf(whens), at)}"`)
      }
      for (const [property, expr] of Object.entries(node.geometry ?? {}))
        parts.push(`[style.${property}]="${value(expr, at)}"`)
      for (const [name, expr] of Object.entries(node.attrs ?? {}))
        parts.push(attributeBinding(tag, name, expr, at))
      for (const [event, handler] of on)
        parts.push(`(${event})="${handlerMethod(handler, at, eventType(event))}"`)
    }
    if (node.ref !== undefined) {
      directives.add('Ref')
      parts.push(`[pmRef]="${node.ref}"`)
    }
    return parts
  }

  const renderPlain = (
    tag: string,
    node: ElementNode,
    at: At,
    extra: readonly string[],
  ): Markup => {
    const parts = elementParts(tag, node, at, extra)
    const children = renderNodes(node.children ?? [], at)
    const open = parts.length === 0 ? `<${tag}` : `<${tag}\n${parts.join('\n')}\n`
    const comment = node.part === undefined ? '' : `<!-- ${node.part} -->\n`
    if (VOID_ELEMENTS.has(tag)) {
      if (children !== '') throw new Error(`shells: ${shell.member} puts content in a <${tag}>`)
      return { text: `${comment}${open}/>`, inline: false }
    }
    return { text: `${comment}${open}>${children}</${tag}>`, inline: false }
  }

  const renderForeignElement = (name: string, node: ElementNode, at: At): Markup => {
    const spec = FOUNDATION_ELEMENTS[name]
    if (spec === undefined) {
      throw new Error(`shells: ${shell.member} renders <${name}>, which is not the foundation's`)
    }
    directives.add(name)
    const attrs = { ...(node.attrs ?? {}) }
    const tag = spec.tag ?? staticString(attrs['as'] ?? `'div'`)
    if (tag === null)
      throw new Error(`shells: ${shell.member}'s ${name} takes \`as\` as a literal tag`)
    delete attrs['as']
    const extra: string[] = []
    if (spec.primary === '') extra.push(spec.directive)
    else {
      const primary = attrs[spec.primary]
      if (primary === undefined)
        throw new Error(`shells: ${shell.member}'s ${name} has no ${spec.primary}`)
      extra.push(`[${spec.directive}]="${value(primary, at)}"`)
      delete attrs[spec.primary]
    }
    for (const input of spec.inputs) {
      const expr = attrs[input]
      if (expr === undefined) continue
      extra.push(`[${input}]="${value(expr, at)}"`)
      delete attrs[input]
    }
    return renderPlain(tag, { ...node, attrs }, at, extra)
  }

  const renderElement = (node: ElementNode, at: At): Markup => {
    if (typeof node.tag === 'string') {
      if (/^[A-Z]/.test(node.tag)) return renderForeignElement(node.tag, node, at)
      return renderPlain(node.tag, node, at, [])
    }
    const expr = node.tag.expr.trim()
    if (Object.hasOwn(FOUNDATION_ELEMENTS, expr)) return renderForeignElement(expr, node, at)
    // A tag a prop chooses: one branch per tag it can be, as Angular names every element.
    const tags = stringLiterals(expr)
    const prop = valueByCamel.get(expr)
    const fallback = prop === undefined ? tags.at(-1) : staticString(shell.defaults?.[expr] ?? '')
    if (prop !== undefined) {
      const registered = component.props.find((candidate) => candidate.name === prop.name)
      for (const tag of literalUnion(registered?.type ?? ''))
        if (!tags.includes(tag)) tags.push(tag)
    }
    if (tags.length === 0 || fallback === undefined || fallback === null) {
      throw new Error(`shells: ${shell.member}'s tag "${expr}" names no tags it can be`)
    }
    const cases = tags
      .filter((tag) => tag !== fallback)
      .map((tag) => `@case ('${tag}') {${renderPlain(tag, node, at, []).text}}`)
    const otherwise = `@default {${renderPlain(fallback, node, at, []).text}}`
    return {
      text: `@switch (${value(expr, at)}) {\n${[...cases, otherwise].join('\n')}\n}`,
      inline: false,
    }
  }

  const renderMember = (node: MemberNode, at: At): Markup => {
    const target = context.lookup(node.name)
    if (target === undefined)
      throw new Error(`shells: ${shell.member} composes ${node.name}, which has no entry`)
    composedMembers.add(node.name)
    const targetFace = angularInterface(target)
    const selector = angularSelector(node.name)
    const typeName = context.generic(node.name) ? `${node.name}<unknown>` : node.name
    const parts: string[] = []
    for (const [name, expr] of Object.entries(node.props ?? {})) {
      const prop = targetFace.props.find(
        (candidate) =>
          (candidate.kind === 'input' || candidate.kind === 'template') &&
          (candidate.name === name || camel(candidate.name) === name),
      )
      if (prop === undefined)
        throw new Error(`shells: ${shell.member} sets ${node.name}'s "${name}", not an input`)
      const literal = staticString(expr)
      const propsType = `${node.name}Props${context.generic(node.name) ? '<unknown>' : ''}`
      if (!(literal !== null && plain(literal) && prop.kind === 'input')) propTypes.add(node.name)
      parts.push(
        literal !== null && plain(literal) && prop.kind === 'input'
          ? `${prop.name}="${literal}"`
          : `[${prop.name}]="${value(expr, at, undefined, false, `${propsType}['${prop.name}']`)}"`,
      )
    }
    for (const [event, handler] of Object.entries(node.on ?? {})) {
      const output = targetFace.props.find(
        (candidate) => candidate.kind === 'output' && candidate.binding === event,
      )
      if (output === undefined)
        throw new Error(
          `shells: ${shell.member} listens to ${node.name}'s "${event}", not an output`,
        )
      foundationTypes.add('Emitted')
      parts.push(
        `(${event})="${handlerMethod(handler, at, `Emitted<${typeName}['${output.field}']>`)}"`,
      )
    }
    for (const name of Object.keys(node.slotWhen ?? {})) {
      if (!Object.hasOwn(node.slots ?? {}, name)) {
        throw new Error(`shells: ${node.name}'s slot "${name}" has a condition and no content`)
      }
    }
    const content: Markup[] = []
    for (const [name, nodes] of Object.entries(node.slots ?? {})) {
      const slot = targetFace.props.find(
        (candidate) => candidate.kind === 'slot' && candidate.binding === name,
      )
      if (slot === undefined)
        throw new Error(
          `shells: ${shell.member} fills ${node.name}'s slot "${name}", which it has not`,
        )
      const inner = renderNodes(nodes, { ...at, into: name })
      const body =
        name === 'default'
          ? inner
          : `<ng-container ngProjectAs="[slot=${name}]">${inner}</ng-container>`
      const condition = node.slotWhen?.[name]
      content.push({
        text: condition === undefined ? body : `@if (${value(condition, at)}) {${body}}`,
        inline:
          name === 'default' &&
          condition === undefined &&
          nodes.every((child) => child.kind === 'text'),
      })
    }
    const hostTag = context.hostTag(node.name)
    if (hostTag !== undefined) {
      // A part whose element is its host: the element it draws, marked with its selector.
      const bound = parts.map(boundLiteral)
      const open = `<${hostTag}\n${[hostAttribute(node.name), ...bound].join('\n')}\n`
      return { text: `${open}>${join(content)}</${hostTag}>`, inline: false }
    }
    const open = parts.length === 0 ? `<${selector}` : `<${selector}\n${parts.join('\n')}\n`
    return { text: `${open}>${join(content)}</${selector}>`, inline: false }
  }

  const renderSlot = (node: SlotNode, at: At): Markup => {
    const entry = slotProps.get(node.name) as AngularProp
    const read = access('this.$p', entry.name)
    const fallback = node.fallback ?? []
    if (entry.kind === 'template') {
      directives.add('Render')
      const props = Object.entries(node.props ?? {})
      // Slot props are the template's variables by name (`let-row="row"`), which `bindSlot`
      // gives it. A slot without props is a template with no argument.
      const bind = node.props === undefined ? 'bindTemplate' : 'bindSlot'
      foundationValues.add(bind)
      const args =
        node.props === undefined
          ? ''
          : `, { ${props.map(([name, expr]) => `${key(name)}: ${classExpr(expr, spellingFor(at.loops))}`).join(', ')} }`
      const outlet = `<ng-container [pmRender]="${valueCode(`${bind}(${read}${args})`, readsOf(props.map(([, expr]) => expr)), at)}" />`
      if (fallback.length === 0) return { text: outlet, inline: false }
      const filled = valueCode(`${read} !== undefined`, new Set(), at)
      return {
        text: `@if (${filled}) {${outlet}} @else {${renderNodes(fallback, at)}}`,
        inline: false,
      }
    }
    directives.add('SlotOutlet')
    const parts = [`[pmSlotOutlet]="'${entry.binding}'"`, '[pmSlotOf]="$"']
    if (node.take !== undefined) parts.push(`[pmSlotTake]="${value(node.take, at)}"`)
    if (at.into !== undefined) parts.push(`pmSlotInto="${at.into}"`)
    const outlet = `<ng-container ${parts.join(' ')} />`
    if (fallback.length === 0) return { text: outlet, inline: false }
    const filled = valueCode(`this.$.filled('${entry.binding}')`, new Set(), at)
    return {
      text: `@if (${filled}) {${outlet}} @else {${renderNodes(fallback, at)}}`,
      inline: false,
    }
  }

  let readsTemplates = false

  const renderNode = (node: Node, at: At): Markup => {
    switch (node.kind) {
      case 'element':
        return renderElement(node, at)
      case 'member':
        return renderMember(node, at)
      case 'slot':
        return renderSlot(node, at)
      case 'text': {
        if (node.expr === undefined) {
          const literal = node.value ?? ''
          if (plain(literal)) return { text: literal, inline: true }
          return { text: `{{ ${valueCode(jsString(literal), new Set(), at)} }}`, inline: true }
        }
        return { text: `{{ ${value(node.expr, at)} }}`, inline: true }
      }
      case 'if': {
        const out: string[] = []
        const before: Guard[] = []
        for (const branch of node.branches) {
          const guards = [...at.guards, ...before]
          const condition = value(branch.when, { ...at, guards })
          out.push(
            `${out.length === 0 ? '@if' : ' @else if'} (${condition}) {${renderNodes(branch.then, { ...at, guards: [...guards, { when: branch.when, holds: true, loops: at.loops }] })}}`,
          )
          before.push({ when: branch.when, holds: false, loops: at.loops })
        }
        if (node.otherwise !== undefined && node.otherwise.length > 0) {
          out.push(
            ` @else {${renderNodes(node.otherwise, { ...at, guards: [...at.guards, ...before] })}}`,
          )
        }
        return { text: out.join(''), inline: false }
      }
      case 'each': {
        const ofCall = value(node.of, at, undefined, true)
        const ofMethod = ofCall.slice(0, ofCall.indexOf('('))
        const loops: Loop[] = [...at.loops, { name: node.as, kind: 'item', of: ofMethod }]
        if (node.index !== undefined) loops.push({ name: node.index, kind: 'index', of: ofMethod })
        const inner: At = { ...at, loops }
        // A track expression reads only the row's item and its index: no guards, no outer loop.
        const own = loops.slice(at.loops.length)
        const keyReads = freeNames(node.key)
        const outer = at.loops.some((loop) => keyReads.has(loop.name))
        const trackCall = outer
          ? '$index'
          : value(node.key, { loops: own, guards: [] }).replace(
              node.index === undefined ? /$^/ : new RegExp(`([(,] ?)${node.index}(?=[,)])`, 'g'),
              '$1$index',
            )
        const index = node.index === undefined ? '' : `; let ${node.index} = $index`
        return {
          text: `@for (${node.as} of ${ofCall}; track ${trackCall}${index}) {${renderNodes(node.children, inner)}}`,
          inline: false,
        }
      }
      case 'portal':
        directives.add('Portal')
        return {
          text: `<ng-template pmPortal>${renderNodes(node.children, at)}</ng-template>`,
          inline: false,
        }
      case 'render': {
        directives.add('Render')
        readsTemplates = true
        const call = value(node.value, at)
        return {
          text: `@if (template(${call})) {<ng-container [pmRender]="${call}" />} @else {{{ ${call} }}}`,
          inline: false,
        }
      }
    }
  }

  const top: At = { loops: [], guards: [] }
  /** For a part whose element is its host: the element's bindings, as the component's `host`. */
  const hostBindings: string[] = []
  /**
   * For such a part: each listener for a DOM event an output is named for
   * (`click` on `Table.Row`). `useMember` keeps the host from hearing that
   * event, and Angular attaches a `host` listener after it does, so the member
   * adds the listener itself, through its context.
   */
  const hostListeners: string[] = []
  let hostRef: string | undefined
  let anatomy: string
  if (hostTag !== undefined) {
    const root = hostElement(template)
    if (root === null)
      throw new Error(`shells: ${shell.member} has no one element to draw on its host`)
    for (const part of elementParts(hostTag, root.element, top, [])) {
      const ref = /^\[pmRef\]="(.*)"$/.exec(part)
      const listener = /^\(([\w-]+)\)="(.*)"$/s.exec(part)
      if (part.startsWith('[pmSpread]=')) {
        throw new Error(
          `shells: ${shell.member} draws its host with a machine's props or a listener with a modifier, which a host binding cannot write`,
        )
      } else if (ref !== null) hostRef = ref[1]
      else if (listener !== null && events.has(listener[1] as string)) {
        const [, event = '', call = ''] = listener
        hostListeners.push(
          `this.$.listen('${event}', (${call.includes('$event') ? '$event' : ''}) => this.${call})`,
        )
      } else {
        const [, name = '', bound = ''] = /^([^=]+)="(.*)"$/s.exec(part) ?? []
        hostBindings.push(`${key(name)}: ${jsString(bound)}`)
      }
    }
    // The host's own bindings need no directive: the element's directives are the children's.
    directives.clear()
    anatomy = renderNodes(root.children, top)
  } else anatomy = renderNodes(template, top)
  if (projected.size > 0) directives.add('SlotTemplate')
  const slotTemplates = [...projected]
    .sort((a, b) => (a === 'default' ? 1 : b === 'default' ? -1 : a.localeCompare(b)))
    .map((name) =>
      name === 'default'
        ? '<ng-template pmSlot="default" [pmSlotOf]="$"><ng-content /></ng-template>'
        : `<ng-template pmSlot="${name}" [pmSlotOf]="$"><ng-content select="[slot=${name}]" /></ng-template>`,
    )
  const templateText = join([
    ...slotTemplates.map((text) => ({ text, inline: false })),
    { text: anatomy, inline: false },
  ])

  /* the class --------------------------------------------------------------- */
  const names = readsOf(allSources)
  const usesUid = names.has('uid') || shell.machine !== undefined
  const readsOwner = owner !== undefined && names.has('owner')
  const readsLent = names.has('lent')
  const readsLender = names.has('lender')
  const handsBack = shell.lends === true && names.has('borrowed')
  const props = `${shell.member}Props${own}`
  const fields: string[] = []
  const constructor: string[] = []

  for (const [name, expr] of Object.entries(shell.statics ?? {})) {
    fields.push(`static readonly ${name} = ${scriptExpr(expr)}`)
  }

  for (const name of Object.keys(shell.defaults ?? {})) {
    if (!valueByCamel.has(name) && !inputs.some((prop) => prop.name === name)) {
      throw new Error(`shells: ${shell.member} sets a default for "${name}", which is not an input`)
    }
  }
  const docLines = (doc: string | undefined) =>
    doc === undefined
      ? []
      : ['/**', ...wrapDoc(doc, 92).map((line) => ` * ${line}`.trimEnd()), ' */']
  for (const prop of inputs) {
    const alias = prop.field === prop.name ? '' : `alias: '${prop.name}'`
    const type = `${props}['${prop.name}']`
    const given = shell.defaults?.[prop.field] ?? shell.defaults?.[prop.name]
    const fallback = given === undefined || given.trim() === 'undefined' ? undefined : given
    fields.push(...docLines(prop.doc))
    if (!prop.optional && fallback === undefined) {
      fields.push(
        `readonly ${prop.field} = input.required<${type}>(${alias === '' ? '' : `{ ${alias} }`})`,
      )
    } else if (fallback !== undefined) {
      const made = scriptExpr(fallback)
      const initial = isFactory(fallback) && !isFunctionType(prop.type) ? `(${made})()` : made
      const options = [
        ...(alias === '' ? [] : [alias]),
        `transform: (value: ${type}) => (value === undefined ? ${initial} : value)`,
      ]
      fields.push(
        `readonly ${prop.field} = input<Exclude<${type}, undefined>, ${type}>(${initial}, { ${options.join(', ')} })`,
      )
    } else {
      fields.push(
        `readonly ${prop.field} = input<${type}>(undefined${alias === '' ? '' : `, { ${alias} }`})`,
      )
    }
  }
  const outputs = face.props.filter((prop) => prop.kind === 'output')
  for (const prop of outputs) {
    fields.push(...docLines(prop.doc))
    fields.push(`readonly ${prop.field} = output<${prop.type}>({ alias: '${prop.binding}' })`)
  }

  const kind = shell.statics?.controlKind === undefined ? '' : `kind: ${shell.member}.controlKind, `
  const hosted = hostTag === undefined ? '' : `element: '${hostAttribute(shell.member)}', `
  const eventNames = outputs.map((prop) => `'${prop.binding}'`)
  fields.push(
    `protected readonly $ = useMember({ ${kind}${hosted}events: [${eventNames.join(', ')}], props: { ${inputs
      .map((prop) => `${key(prop.name)}: () => this.${prop.field}()`)
      .join(', ')} } })`,
  )
  fields.push('protected readonly $p = this.$.props')
  if (readsLent) {
    foundationValues.add('lentIdentity')
    fields.push('protected readonly lent = lentIdentity()')
  }
  if (readsLender) {
    // The holder of the member that lends this one its identity; none outside one.
    foundationValues.add('lenderHolder')
    fields.push('protected readonly lender = lenderHolder()')
  }
  if (handsBack) {
    // The holder the member this one lends its identity to writes its element into.
    foundationValues.add('borrowedHolder')
    fields.push('protected readonly borrowed = borrowedHolder()')
  }
  if (readsOwner) {
    foundationValues.add('ownerOf')
    fields.push(`protected readonly owner = ownerOf<${owner}Owner>('${owner}')`)
  }
  if (usesUid) {
    foundationValues.add('uniqueId')
    fields.push('protected readonly uid = uniqueId()')
  }
  for (const [name, expr] of Object.entries(shell.state ?? {})) {
    foundationValues.add('cell')
    fields.push(`protected readonly ${name} = cell(() => (${scriptExpr(expr)}))`)
  }
  for (const name of [...templateRefs].sort()) {
    const list = listRefs.has(name)
    foundationValues.add(list ? 'elementList' : 'elementRef')
    fields.push(
      `protected readonly ${name} = ${list ? 'elementList' : 'elementRef'}<HTMLElement>()`,
    )
  }
  for (const [name, query] of Object.entries(shell.media ?? {})) {
    foundationValues.add('useMediaQuery')
    fields.push(`protected readonly ${name} = useMediaQuery('${query}')`)
  }
  if (shell.mode) {
    foundationValues.add('useMode')
    fields.push(`protected readonly ${shell.mode} = useMode()`)
  }
  for (const [name, prop] of Object.entries(shell.controlRefs ?? {})) {
    foundationValues.add('useControlRef')
    const entry = valueByCamel.get(camel(prop))
    if (entry === undefined)
      throw new Error(`shells: ${shell.member} hands ${name} to "${prop}", not an input`)
    fields.push(
      `protected readonly ${name} = useControlRef(() => ${access('this.$p', entry.name)})`,
    )
  }

  // A derived value the machine reads is declared before it; one that reads the machine, after.
  const late = new Set<string>()
  for (const [name, expr] of Object.entries(shell.derived ?? {})) {
    const reads = freeNames(expr)
    if (reads.has('api') || reads.has('service') || [...reads].some((other) => late.has(other)))
      late.add(name)
  }
  const derivedLine = (name: string, expr: Expr) => {
    const maker = readsSlots(expr) ? 'measured' : 'derived'
    foundationValues.add(maker)
    return `protected readonly ${name} = ${maker}(() => (${scriptExpr(expr)}))`
  }
  for (const [name, expr] of Object.entries(shell.derived ?? {})) {
    if (!late.has(name)) fields.push(derivedLine(name, expr))
  }
  if (shell.machine) {
    foundationValues.add('setup')
    foundationValues.add('useMachine')
    foundationValues.add('useDirection')
    foundationValues.add('normalizeProps')
    foundationValues.add('derived')
    const machineContext = [
      'id: this.uid',
      // The document's direction: a machine given none writes `dir="ltr"` on the member's root.
      'dir: this.documentDirection()',
      ...Object.entries(shell.machine.context).map(
        ([name, expr]) => `${key(name)}: ${scriptExpr(expr)}`,
      ),
      ...Object.entries(shell.machine.events ?? {}).map(([name, event]) => {
        const reads = freeNames('emit' in event ? event.payload : event.run).has('details')
        const extra = new Set(['details'])
        const code = statement(
          'emit' in event
            ? scriptExpr(`emit('${event.emit}', ${event.payload})`, extra)
            : scriptExpr(event.run, extra),
        )
        return `${name}: (${reads ? 'details' : ''}) => { ${code} }`
      }),
    ]
    // The assertion gives the literals their machine's types (`placement: 'bottom-end'`), and
    // the callbacks their details.
    const place = directionPlace(template)
    fields.push(
      `protected readonly documentDirection = useDirection(${place === undefined ? '' : `() => ${scriptExpr(place)}`})`,
    )
    fields.push(
      `protected readonly service: { readonly value: zag.Service } = setup(() => useMachine(zag.machine, () => ({ ${machineContext.join(', ')} }) as Partial<zag.Props>))`,
    )
    fields.push(
      'protected readonly api: { readonly value: ReturnType<typeof zag.connect> } = derived(() => zag.connect(this.service.value, normalizeProps))',
    )
  }
  for (const [name, expr] of Object.entries(shell.derived ?? {})) {
    if (late.has(name)) fields.push(derivedLine(name, expr))
  }
  for (const [name, list] of Object.entries(shell.listPresence ?? {})) {
    foundationValues.add('setup')
    motion.add('useListPresence')
    fields.push(
      `protected readonly ${name} = setup(() => useListPresence(() => ${scriptExpr(list.of)}, ${scriptExpr(list.key)}))`,
    )
  }
  for (const [name, departure] of Object.entries(shell.departures ?? {})) {
    foundationValues.add('useDeparture')
    fields.push(
      `protected readonly ${name} = useDeparture(() => this.${departure.ref}.value, '${departure.binding}')`,
    )
  }
  for (const [name, presence] of Object.entries(shell.presence ?? {})) {
    foundationValues.add('setup')
    if (presence.key !== undefined) {
      if (presence.binding !== undefined || !listRefs.has(presence.ref)) {
        throw new Error(
          `shells: ${shell.member}'s keyed presence "${name}" needs a ref inside a loop and no binding`,
        )
      }
      motion.add('useKeyedPresence')
      fields.push(
        `protected readonly ${name} = setup(() => useKeyedPresence(() => ${scriptExpr(presence.open)}, () => this.${presence.ref}.value, (element) => ${scriptExpr(presence.key, new Set(['element']))}))`,
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
    // Options that read the member's inputs are a function, which the presence calls each time
    // it reads them: a side or an edge each time the panel plays, `appear` once, when it is made.
    const entries = presenceEntries(presence, (source) => scriptExpr(source), false)
    const reads = presenceReads(presence)
    const options =
      entries.length === 0
        ? ''
        : reads
          ? `, () => ({ ${entries.join(', ')} })`
          : `, { ${entries.join(', ')} }`
    const rest = presence.binding === undefined && options === '' ? '' : `, ${binding}${options}`
    fields.push(
      `protected readonly ${name} = setup(() => usePresence(() => ${scriptExpr(presence.open)}, () => this.${presence.ref}.value${rest}))`,
    )
  }
  if (readsTemplates) {
    foundationValues.add('isTemplate')
    fields.push('protected readonly template = isTemplate')
  }
  if (hostRef !== undefined) {
    foundationValues.add('hostRef')
    constructor.push(`hostRef(this.${hostRef})`)
  }
  constructor.push(...hostListeners)

  if (shell.provide) {
    foundationValues.add('getters')
    constructor.push(
      `this.$.owner = getters<${shell.member}Owner>({ ${Object.entries(shell.provide)
        .map(([name, expr]) => `${key(name)}: () => ${scriptExpr(expr)}`)
        .join(', ')} })`,
    )
  }
  for (const [name, node] of passes) {
    const entry = slotProps.get(name) as AngularProp
    const readsChild = Object.values(node.pass ?? {}).some((expr) => freeNames(expr).has('child'))
    constructor.push(
      `this.$.pass('${entry.binding}', (${readsChild ? 'child' : ''}) => ({ ${Object.entries(
        node.pass ?? {},
      )
        .map(([prop, expr]) => `${key(prop)}: ${scriptExpr(expr, new Set(['child']))}`)
        .join(', ')} }))`,
    )
  }
  const effectMethods: string[] = []
  for (const [at, effect] of (shell.effects ?? []).entries()) {
    const index = at + 1
    if (effect.mount === false && effect.watch === undefined) {
      throw new Error(`shells: ${shell.member} has an effect that neither mounts nor watches`)
    }
    if (effect.delay !== undefined && (effect.resize ?? effect.mutation) !== undefined) {
      throw new Error(`shells: ${shell.member} has an effect that both waits and observes`)
    }
    if (effect.attributes !== undefined && effect.mutation === undefined) {
      throw new Error(`shells: ${shell.member} observes attributes without a mutation subtree`)
    }
    checkHolding(shell.member, effect)
    if (holds(effect)) {
      fields.push(`private release${index}: (() => void) | undefined`)
      core.add('inject')
      core.add('DestroyRef')
      constructor.push(`inject(DestroyRef).onDestroy(() => this.release${index}?.())`)
    }
    effectMethods.push(effectMethod(effect, index, scriptExpr))
    if (effect.watch === undefined) {
      foundationValues.add('mountEffect')
      constructor.push(`mountEffect(() => this.effect${index}())`)
    } else {
      const maker = readsSlots(effect.watch) ? 'watchMeasured' : 'watchEffect'
      foundationValues.add(maker)
      constructor.push(
        `${maker}(() => ${scriptExpr(effect.watch)}, () => this.effect${index}(), ${effect.mount !== false})`,
      )
    }
  }

  /* imports ----------------------------------------------------------------- */
  if (inputs.length > 0) core.add('input')
  if (outputs.length > 0) core.add('output')
  for (const name of names) {
    if (FOUNDATION_HELPERS.has(name)) foundationValues.add(name)
    // A type an expression names (`null as RichTextEditorState | null`) is the foundation's too.
    if (FOUNDATION_TYPES.has(name)) foundationTypes.add(name)
  }
  if (/\bbindTemplate\(/.test([...fields, ...methods, ...constructor].join('\n')))
    foundationValues.add('bindTemplate')
  const code = [...fields, ...methods].filter((line) => !/^\s*(\/\*\*|\*)/.test(line)).join('\n')
  if (/\bContent\b/.test(code)) foundationTypes.add('Content')

  const declared = new Set([...Object.keys(shell.types ?? {}), ...parameters])
  const uses = new Set(shell.uses ?? [])
  const undeclared = [...face.names].filter(
    (name) =>
      !FOUNDATION_TYPES.has(name) &&
      !declared.has(name) &&
      !uses.has(name) &&
      name !== 'ControlRef',
  )
  if (undeclared.length > 0) {
    throw new Error(
      `shells: ${shell.member}'s props name ${undeclared.join(', ')}, which its description neither declares (\`types\`) nor uses (\`uses\`)`,
    )
  }
  for (const name of face.names) if (FOUNDATION_TYPES.has(name)) foundationTypes.add(name)
  for (const name of FOUNDATION_TYPES) {
    if (
      Object.values(shell.types ?? {}).some((definition) =>
        new RegExp(`\\b${name}\\b`).test(definition),
      )
    )
      foundationTypes.add(name)
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

  const componentImports: string[] = []
  const importedMembers: string[] = []
  for (const name of [...composedMembers].sort()) {
    if (name === shell.member) continue
    const location = context.locations.get(name)
    if (location === undefined)
      throw new Error(`shells: ${name} is composed but has no description`)
    // Two parts that draw each other (a list's item holds a quote, which holds a list) are
    // declared before each other only through `forwardRef`.
    if (context.composes?.(name).has(shell.member) === true) {
      core.add('forwardRef')
      importedMembers.push(`forwardRef(() => ${name})`)
    } else importedMembers.push(name)
    const typed = propTypes.has(name) ? [`type ${name}Props`] : []
    if (location.home === 'foundation' && home === 'vocabulary') {
      foundationValues.add(name)
      if (typed.length > 0) foundationTypes.add(`${name}Props`)
    } else
      componentImports.push(
        `import { ${[name, ...typed].join(', ')} } from '${relativeModule(shell.dir, location.dir, name)}'`,
      )
  }
  for (const [from, typeNames] of sharedTypes) {
    const location = context.locations.get(from)
    if (location === undefined) throw new Error(`shells: ${from} declares types and has no file`)
    const module = relativeModule(shell.dir, location.dir, from)
    const at = componentImports.findIndex(
      (line) => line.startsWith(`import { ${from}`) && line.endsWith(`'${module}'`),
    )
    if (at === -1) componentImports.push(`import type { ${typeNames.join(', ')} } from '${module}'`)
    else {
      const held = /^import \{ (.*) \} from/.exec(componentImports[at] as string)?.[1] ?? from
      const extra = typeNames.map((name) => `type ${name}`).filter((name) => !held.includes(name))
      componentImports[at] = `import { ${[held, ...extra].join(', ')} } from '${module}'`
    }
  }
  if (readsOwner) componentImports.push(`import type { ${owner}Owner } from './${owner}'`)

  for (const name of directives) foundationValues.add(name)
  if (shell.provide) foundationValues.add('provideOwner')
  if (shell.lends) foundationValues.add('lend')
  if (readsLent) foundationValues.add('KEEPS_IDENTITY')
  if (handsBack) foundationValues.add('handBack')
  if (readsLender) foundationValues.add('KEEPS_HOLDER')

  const typeText = [...fields, ...methods, ...effectMethods].join('\n')
  if (
    /\bNodeTemplate\b/.test(typeText) ||
    inputs.some((prop) => /\bNodeTemplate\b/.test(prop.type))
  )
    foundationTypes.add('NodeTemplate')
  if (inputs.some((prop) => /\bControlRef\b/.test(prop.type))) foundationTypes.add('ControlRef')
  for (const definition of Object.values(shell.types ?? {})) {
    const text = angularType(definition)
    if (/\bNodeTemplate\b/.test(text)) foundationTypes.add('NodeTemplate')
  }
  if (!/\bEach</.test(typeText)) foundationTypes.delete('Each')
  if (!/\bEmitted</.test(typeText)) foundationTypes.delete('Emitted')

  if ((shell.carries ?? []).length > 0) foundationTypes.add('NodeTemplate')

  /* the file ---------------------------------------------------------------- */
  const lines: string[] = []
  lines.push('/**')
  lines.push(` * ${component.purpose}${component.spec ? ` (\`${component.spec}\`)` : ''}.`)
  lines.push(' *')
  lines.push(` * Generated by \`pnpm shells\` from \`${context.source}\`, the member's`)
  lines.push(' * framework-neutral description. Never edit it by hand: change the description and')
  lines.push(' * run `pnpm shells`.')
  lines.push(' */')
  lines.push(`import { ${[...core].sort().join(', ')} } from '@angular/core'`)
  if (shell.machine) {
    lines.push('')
    lines.push(`import * as zag from '@zag-js/${shell.machine.of}'`)
  }
  lines.push('')
  if (home === 'foundation') {
    // Inside the foundation, its own index would import this file back.
    const modules = new Map<string, string[]>()
    const add = (name: string, module: string | undefined) => {
      if (module === undefined)
        throw new Error(`shells: ${shell.member} is in the foundation and reads ${name}`)
      modules.set(module, [...(modules.get(module) ?? []), name])
    }
    for (const name of [...foundationValues].sort()) add(name, FOUNDATION_MODULES[name])
    for (const name of [...foundationTypes].sort()) {
      if (FOUNDATION_TYPES.has(name)) continue
      add(`type ${name}`, FOUNDATION_MODULES[name] ?? '../conventions/types')
    }
    for (const [module, imported] of [...modules].sort(([a], [b]) => a.localeCompare(b)))
      lines.push(`import { ${imported.join(', ')} } from '${module}'`)
    const engineTypes = [...foundationTypes].filter((name) => FOUNDATION_TYPES.has(name))
    if (engineTypes.length > 0)
      lines.push(`import type { ${engineTypes.sort().join(', ')} } from '@polymorph/engine'`)
  } else if (foundationValues.size > 0 || foundationTypes.size > 0) {
    const imported = [
      ...[...foundationValues].sort(),
      ...[...foundationTypes].sort().map((name) => `type ${name}`),
    ]
    lines.push(`import { ${imported.join(', ')} } from '@polymorph/angular'`)
  }
  if (motion.size > 0)
    lines.push(`import { ${[...motion].sort().join(', ')} } from '@polymorph/angular/motion'`)
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
  lines.push(...componentImports)

  for (const [name, definition] of Object.entries(shell.types ?? {})) {
    const [, typed = '', rest = definition] = /^\s*(<[^>]*>)?\s*([\s\S]*)$/.exec(definition) ?? []
    const text = angularType(rest.trim())
    lines.push('')
    lines.push(
      text.startsWith('{')
        ? `export interface ${name}${typed} ${text}`
        : `export type ${name}${typed} = ${text}`,
    )
  }
  lines.push('')
  lines.push(`/** ${component.purpose}: the inputs it takes, by the React member's prop names. */`)
  const carried = shell.carries ?? []
  if (inputs.length === 0 && carried.length === 0) {
    // Everything it takes is content: no input.
    lines.push(`export type ${shell.member}Props${declaredParameters} = Record<string, never>`)
  } else lines.push(`export interface ${shell.member}Props${declaredParameters} {`)
  for (const prop of inputs) {
    if (prop.doc) {
      lines.push('  /**')
      for (const line of wrapDoc(prop.doc, 92)) lines.push(`   * ${line}`.trimEnd())
      lines.push('   */')
    }
    lines.push(`  ${key(prop.name)}${prop.optional ? '?' : ''}: ${prop.type}`)
  }
  for (const name of shell.carries ?? []) {
    const prop = face.props.find(
      (candidate) => candidate.name === name && candidate.kind === 'slot',
    )
    if (prop === undefined)
      throw new Error(`shells: ${shell.member} carries "${name}", which is not a node prop`)
    lines.push(
      `  /** The \`${prop.binding}\` slot's content, for a value of this type another member renders. */`,
    )
    lines.push(`  ${key(prop.name)}?: NodeTemplate`)
  }
  if (inputs.length > 0 || carried.length > 0) lines.push('}')

  if (shell.provide) {
    lines.push('')
    lines.push(`/** What ${shell.member} hands its compound parts. */`)
    lines.push(`export interface ${shell.member}Owner {`)
    for (const [name, expr] of Object.entries(shell.provide)) {
      const read = expr.trim()
      const prop = valueByCamel.get(read)
      const type =
        read === 'api' && shell.machine
          ? 'zag.Api'
          : read === 'service' && shell.machine
            ? 'zag.Service'
            : prop !== undefined
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
          `shells: ${shell.member} provides "${name}: ${expr}"; the Angular renderer types a provided value when it is the machine, its service or a prop`,
        )
      }
      lines.push(`  readonly ${key(name)}: ${type}`)
    }
    lines.push('}')
  }

  const providers = [
    '...MEMBER_PROVIDERS',
    ...(shell.provide ? [`provideOwner('${shell.member}')`] : []),
  ]
  const viewProviders = [
    ...(shell.lends ? [`...lend('${gallerySlug(shell.member)}')`] : []),
    ...(readsLent ? ['...KEEPS_IDENTITY'] : []),
    ...(handsBack ? ['...handBack()'] : []),
    ...(readsLender ? ['...KEEPS_HOLDER'] : []),
  ]
  const imports = [...[...directives].sort(), ...importedMembers]
  lines.push('')
  lines.push(`/** ${component.purpose}. */`)
  lines.push('@Component({')
  lines.push(
    `  selector: '${hostTag === undefined ? angularSelector(shell.member) : `${hostTag}[${hostAttribute(shell.member)}]`}',`,
  )
  lines.push('  encapsulation: ViewEncapsulation.None,')
  if (hostTag === undefined) lines.push("  host: { style: 'display: contents' },")
  else if (hostBindings.length > 0) lines.push(`  host: { ${hostBindings.join(', ')} },`)
  lines.push(`  providers: [${providers.join(', ')}],`)
  if (viewProviders.length > 0) lines.push(`  viewProviders: [${viewProviders.join(', ')}],`)
  if (imports.length > 0) lines.push(`  imports: [${imports.join(', ')}],`)
  lines.push('  // prettier-ignore')
  lines.push(
    `  template: \`${templateText.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${')}\`,`,
  )
  lines.push('})')
  lines.push(`export class ${shell.member}${declaredParameters} {`)
  lines.push(...fields)
  if (constructor.length > 0) {
    lines.push('')
    lines.push('constructor() {')
    lines.push(...constructor)
    lines.push('}')
  }
  for (const method of [...methods, ...effectMethods]) {
    lines.push('')
    lines.push(method)
  }
  lines.push('}')
  lines.push('')
  return lines.join('\n')
}

/**
 * An expression that is a function written with its parameters typed: a
 * parameter without a type takes `first` when it is the first, and is
 * optional and `unknown` after it, because an Angular event carries one value.
 */
function typedParameters(expr: Expr, first: string): Expr {
  const fn = functionNode(expr)
  if (fn === null) return expr
  const source = fn.getSourceFile()
  const edits: { at: number; text: string }[] = []
  fn.parameters.forEach((parameter, at) => {
    if (parameter.type !== undefined) return
    edits.push({ at: parameter.name.getEnd(), text: at === 0 ? `: ${first}` : '?: unknown' })
  })
  let out = source.text
  for (const edit of edits.sort((a, b) => b.at - a.at))
    out = out.slice(0, edit.at) + edit.text + out.slice(edit.at)
  return out.slice(1, -1)
}

/**
 * One effect, as a method the member calls after it renders and when what it
 * watches changes. An effect that observes makes its observers, runs, and
 * keeps a release that disconnects them; one that waits sets a timer and keeps
 * a release that clears it; one that listens adds a document listener; one
 * that releases keeps its `release`. Each release runs before the effect runs
 * again, and when the member is destroyed.
 */
function effectMethod(
  effect: Effect,
  at: number,
  scriptExpr: (expr: Expr, extra?: ReadonlySet<string>) => string,
): string {
  const run = statement(scriptExpr(effect.run, new Set(['$event'])))
  if (!holds(effect)) return [`private effect${at}(): void {`, run, '}'].join('\n')
  const lines = [`private effect${at}(): void {`, `this.release${at}?.()`]
  if (effect.listen !== undefined) {
    const type = EVENT_TYPES[effect.listen] ?? 'Event'
    lines.push(`const listener = ($event: ${type}) => { ${run} }`)
    lines.push(`document.addEventListener('${effect.listen}', listener)`)
    lines.push(
      `this.release${at} = () => document.removeEventListener('${effect.listen}', listener)`,
    )
    lines.push('}')
    return lines.join('\n')
  }
  if (effect.release !== undefined) {
    // What `run` returned, which the release reads as `ran`.
    const readsRan = freeNames(effect.release).has('ran')
    lines.push(readsRan ? `const ran = ${scriptExpr(effect.run, new Set(['$event']))}` : run)
    lines.push(
      `this.release${at} = () => { ${statement(scriptExpr(effect.release, new Set(['ran'])))} }`,
    )
    lines.push('}')
    return lines.join('\n')
  }
  if (effect.delay !== undefined) {
    lines.push(`const timer = setTimeout(() => { ${run} }, ${scriptExpr(effect.delay)})`)
    lines.push(`this.release${at} = () => clearTimeout(timer)`)
    lines.push('}')
    return lines.join('\n')
  }
  lines.push(`const run = () => { ${run} }`)
  const releases: string[] = []
  if (effect.resize !== undefined) {
    lines.push(
      "const resize = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(run)",
    )
    lines.push(
      `for (const element of [${effect.resize.map((expr) => scriptExpr(expr)).join(', ')}]) if (element) resize?.observe(element)`,
    )
    releases.push('resize?.disconnect()')
  }
  if (effect.mutation !== undefined) {
    lines.push(
      "const mutation = typeof MutationObserver === 'undefined' ? undefined : new MutationObserver(run)",
    )
    lines.push(
      `for (const element of [${effect.mutation.map((expr) => scriptExpr(expr)).join(', ')}]) if (element) mutation?.observe(element, { childList: true, characterData: true, subtree: true${effect.attributes === undefined ? '' : `, attributeFilter: [${effect.attributes.map((name) => `'${name}'`).join(', ')}]`} })`,
    )
    releases.push('mutation?.disconnect()')
  }
  lines.push(`this.release${at} = () => { ${releases.join('; ')} }`)
  lines.push('run()')
  lines.push('}')
  return lines.join('\n')
}

/* -------------------------------------------------------------------------- */
/* The states fixture                                                         */
/* -------------------------------------------------------------------------- */

/** A variable a fixture's template declares for a render function's parameter. */
interface TemplateVariable {
  name: string
  type: string
  /** Read from the context by its own name (`let-row="row"`), not as the template's argument. */
  named: boolean
}

/**
 * A parameter of a fixture's render function, as the variables its template
 * declares. `row: { status: string }` is the template's argument (`let-row`).
 * `{ row }: { row: Ticket }` reads a scoped slot's props, each by its name
 * (`let-row="row"`), with the type the object gives that name.
 */
function parameterParts(parameter: string): TemplateVariable[] {
  const text = parameter.trim()
  if (text.startsWith('{')) {
    const end = text.indexOf('}')
    const colon = text.indexOf(':', end)
    const type = colon === -1 ? undefined : text.slice(colon + 1).trim()
    return text
      .slice(1, end)
      .split(',')
      .map((name) => name.trim())
      .filter((name) => name !== '')
      .map((name) => ({
        name,
        type: type === undefined ? 'unknown' : `(${type})['${name}']`,
        named: true,
      }))
  }
  const at = text.indexOf(':')
  return at === -1
    ? [{ name: text, type: 'unknown', named: false }]
    : [{ name: text.slice(0, at).trim(), type: text.slice(at + 1).trim(), named: false }]
}

/**
 * One member's states fixture as an Angular component: every entry in one
 * template, chosen by the `entry` input, and the runner's `overrides` handed to
 * the member each entry renders first.
 */
export function renderAngularStates(
  shell: MemberShell,
  component: RegistryMemberLike,
  context: AngularContext,
): string {
  const members = new Set<string>([shell.member])
  const recipes = new Set<string>()
  const values = new Set<string>()
  const directives = new Set<string>()
  const core = new Set<string>(['Component', 'input', 'ViewEncapsulation'])
  let readsZag = false
  const methods: string[] = []
  const fields: string[] = []
  const constructor: string[] = []
  let count = 0
  let templates = 0

  /** A method that returns code, with the template variables and render parameters it reads as parameters. */
  const method = (
    code: string,
    scope: readonly { name: string; type: string }[],
    returns?: string,
  ): string => {
    count += 1
    const reads = freeNames(code)
    const params = scope.filter((entry) => reads.has(entry.name))
    methods.push(
      `protected e${count}(${params.map((entry) => `${entry.name}: ${entry.type}`).join(', ')})${returns === undefined ? '' : `: ${returns}`} {\nreturn ${code}\n}`,
    )
    return `e${count}(${params.map((entry) => entry.name).join(', ')})`
  }
  /** The members whose props type a fixture's value methods return. */
  const propTypes = new Set<string>()

  interface Place {
    /** The entry's position, for its held values. */
    entry: number
    /** Template variables and render parameters in reach. */
    scope: { name: string; type: string }[]
    /** `ng-template`s declared for nodes inside values, written before the entry's markup. */
    declared: string[]
  }

  const heldName = (place: Place, name: string) => `held${place.entry}_${name}`

  /** A fixture value as code, declaring a template for each node it holds. */
  const literal = (value: FixtureValue, place: Place): string => {
    if (branded(value, 'js')) {
      const source = (value as { js: string }).js
      if (/(^|[^.\w$])zag\./.test(source)) readsZag = true
      for (const name of FIXTURE_VALUES)
        if (new RegExp(`(^|[^.\\w$])${name}\\b`).test(source)) values.add(name)
      return `(${source})`
    }
    // A template of `never` context fits any template a member takes: the fixture's takes anything.
    if (branded(value, 'node'))
      return `(${declare((value as { node: FixtureChild }).node, [], place)} as TemplateRef<never>)`
    if (branded(value, 'renders', RENDERS_KEYS)) {
      const { params, renders, when } = value as FixtureRenders
      if (params.length > 1)
        throw new Error(`shells: ${shell.member}'s fixture renders with more than one parameter`)
      return `(${declare(renders, params.flatMap(parameterParts), place, when)} as TemplateRef<never>)`
    }
    if (branded(value, 'held')) return `this.${heldName(place, (value as { held: string }).held)}()`
    if (branded(value, 'hold', ['to'])) {
      throw new Error(`shells: ${shell.member}'s fixture holds a value outside a handler`)
    }
    if (Array.isArray(value)) return `[${value.map((entry) => literal(entry, place)).join(', ')}]`
    if (value !== null && typeof value === 'object') {
      return `{ ${Object.entries(value as Record<string, FixtureValue>)
        .map(([name, entry]) => `${key(name)}: ${literal(entry, place)}`)
        .join(', ')} }`
    }
    return typeof value === 'string' ? jsString(value) : JSON.stringify(value)
  }

  /** Declares a template for a node inside a value, and returns the variable that names it. */
  const declare = (
    child: FixtureChild | readonly FixtureChild[],
    variables: readonly TemplateVariable[],
    place: Place,
    when?: string,
  ): string => {
    templates += 1
    const name = `t${templates}`
    const inner: Place = { ...place, scope: [...place.scope, ...variables] }
    const drawn = renderedChildren(child)
      .map((entry) => childMarkup(entry, inner).text)
      .join('')
    // A function that returns its nodes only while `when` holds: the template draws them under it.
    const markup = {
      text:
        when === undefined
          ? drawn
          : `@if (${method(`(${when})`, inner.scope, 'boolean')}) {${drawn}}`,
    }
    const bound = variables
      .map((variable) =>
        variable.named ? ` let-${variable.name}="${variable.name}"` : ` let-${variable.name}`,
      )
      .join('')
    place.declared.push(`<ng-template #${name}${bound}>${markup.text}</ng-template>`)
    place.scope.push({ name, type: 'TemplateRef<unknown>' })
    core.add('type TemplateRef')
    return name
  }

  /** A value bound to an input: a plain string as an attribute, anything else through a method. */
  const binding = (
    name: string,
    value: FixtureValue,
    place: Place,
    typed?: { member: string; returns: string },
  ): string => {
    if (typeof value === 'string' && plain(value)) return `${name}="${value}"`
    const code = literal(value, place)
    const template = /^\((t\d+) as TemplateRef<never>\)$/.exec(code)
    if (template !== null) return `[${name}]="${template[1]}"`
    if (typed !== undefined) propTypes.add(typed.member)
    return `[${name}]="${method(code, place.scope, typed?.returns)}"`
  }

  /** A handler bound to an output: a held value's setter, or JavaScript the fixture writes. */
  const handler = (event: string, value: FixtureValue, place: Place): string => {
    if (branded(value, 'hold', ['to'])) {
      const { hold, to } = value as { hold: string; to?: FixtureValue }
      const setter =
        'to' in value
          ? `(_?: unknown) => this.${heldName(place, hold)}.set(${literal(to, place)})`
          : `($event: unknown) => this.${heldName(place, hold)}.set($event as never)`
      return `(${event})="${method(setter, place.scope)}($event)"`
    }
    // A handler takes the output's one value, which a function of no parameters ignores.
    const code = `(${literal(value, place)}) as (...args: unknown[]) => unknown`
    return `(${event})="${method(code, place.scope)}($event)"`
  }

  interface Markup {
    text: string
    inline: boolean
  }

  const join = (parts: readonly Markup[]): string =>
    parts
      .map((part, at) => {
        const before = parts[at - 1]
        return before !== undefined && !before.inline && !part.inline ? `\n${part.text}` : part.text
      })
      .join('')

  const textMarkup = (value: string, place: Place): Markup =>
    plain(value)
      ? { text: value, inline: true }
      : { text: `{{ ${method(jsString(value), place.scope)} }}`, inline: true }

  const childMarkup = (child: FixtureChild, place: Place): Markup => {
    if (typeof child === 'string') return textMarkup(child, place)
    if ('js' in child)
      return { text: `{{ ${method(literal(child, place), place.scope)} }}`, inline: true }
    if ('member' in child) return memberMarkup(child.member, child.props, child.slots, false, place)
    return elementMarkup(
      child,
      (child.children ?? []).map((entry) => childMarkup(entry, place)),
      place,
    )
  }

  const elementMarkup = (
    element: {
      element: string
      attrs?: Readonly<Record<string, string>>
      class?: readonly string[]
    },
    children: readonly Markup[],
    place: Place,
  ): Markup => {
    const parts: string[] = []
    if (element.class !== undefined && element.class.length > 0) {
      const references = element.class.map((name) => {
        recipes.add(name.includes('.') ? (name.split('.')[0] as string) : 'styles')
        return classReference(name)
      })
      parts.push(
        `[attr.class]="${method(references.length === 1 ? (references[0] as string) : `[${references.join(', ')}].join(' ')`, place.scope)}"`,
      )
    }
    for (const [name, value] of Object.entries(element.attrs ?? {}))
      parts.push(binding(`attr.${name}`, value, place).replace(/^attr\.([^=]+)="/, '$1="'))
    const open =
      parts.length === 0 ? `<${element.element}` : `<${element.element}\n${parts.join('\n')}\n`
    return { text: `${open}>${join(children)}</${element.element}>`, inline: false }
  }

  const memberMarkup = (
    name: string,
    props: Readonly<Record<string, FixtureValue>> | undefined,
    slots: Readonly<Record<string, readonly FixtureChild[]>> | undefined,
    overrides: boolean,
    place: Place,
    inside: readonly Markup[] = [],
  ): Markup => {
    members.add(name)
    const target = context.lookup(name)
    if (target === undefined)
      throw new Error(`shells: ${shell.member}'s fixture renders ${name}, which has no entry`)
    const face = angularInterface(target)
    const parts: string[] = []
    const content = new Map<string, Markup[]>()
    for (const [prop, value] of Object.entries(props ?? {})) {
      const entry = face.props.find(
        (candidate) => candidate.name === prop || camel(candidate.name) === prop,
      )
      if (entry === undefined)
        throw new Error(
          `shells: ${shell.member}'s fixture sets ${name}'s "${prop}", which it has not`,
        )
      if (entry.kind === 'output') parts.push(handler(entry.binding, value, place))
      else if (entry.kind === 'slot') {
        const child: FixtureChild = branded(value, 'node')
          ? (value as { node: FixtureChild }).node
          : typeof value === 'string'
            ? value
            : { js: literal(value, place) }
        content.set(entry.binding, [
          ...(content.get(entry.binding) ?? []),
          childMarkup(child, place),
        ])
      } else {
        // A value's type is read from the props of the member the fixture gives its rows' type.
        const argument =
          name === shell.member && shell.fixtureGeneric !== undefined
            ? shell.fixtureGeneric
            : 'unknown'
        const props = `${name}Props${context.generic(name) ? `<${argument}>` : ''}`
        parts.push(
          binding(entry.name, value, place, { member: name, returns: `${props}['${entry.name}']` }),
        )
      }
    }
    for (const [slot, children] of Object.entries(slots ?? {})) {
      const entry = face.props.find(
        (candidate) => candidate.kind === 'slot' && candidate.binding === slot,
      )
      if (entry === undefined)
        throw new Error(
          `shells: ${shell.member}'s fixture fills ${name}'s slot "${slot}", which it has not`,
        )
      content.set(slot, [
        ...(content.get(slot) ?? []),
        ...children.map((child) => childMarkup(child, place)),
      ])
    }
    if (overrides) {
      directives.add('Overrides')
      parts.push('[pmOverrides]="overrides()"')
    }
    const body: Markup[] = [...inside]
    for (const [slot, markup] of content) {
      if (slot === 'default') body.push(...markup)
      else
        body.push({
          text: `<ng-container ngProjectAs="[slot=${slot}]">${join(markup)}</ng-container>`,
          inline: false,
        })
    }
    const hostTag = context.hostTag(name)
    if (hostTag !== undefined) {
      // A part whose element is its host: the element, marked with its selector, every value bound.
      const bound = parts.map(boundLiteral)
      const open = `<${hostTag}\n${[hostAttribute(name), ...bound].join('\n')}\n`
      return { text: `${open}>${join(body)}</${hostTag}>`, inline: false }
    }
    const selector = angularSelector(name)
    const open = parts.length === 0 ? `<${selector}` : `<${selector}\n${parts.join('\n')}\n`
    return { text: `${open}>${join(body)}</${selector}>`, inline: false }
  }

  const entries = [...gridEntries(shell, component), ...shell.states]
  const cases: string[] = []
  const entryLines: string[] = []
  entries.forEach((entry: StateEntry, at) => {
    const subject = entrySubject(shell, entry)
    const place: Place = { entry: at, scope: [], declared: [] }
    for (const [name, initial] of Object.entries(entry.holds ?? {})) {
      core.add('signal')
      fields.push(
        `protected readonly ${heldName(place, name)} = signal(${literal(initial, place)})`,
      )
    }
    const before = (entry.before ?? []).map((child) => childMarkup(child, place))
    let rendered: Markup[]
    if (entry.many !== undefined) {
      const instances = entry.many.each.map((instance: FixtureInstance, index) =>
        memberMarkup(subject, instance.props, instance.slots, index === 0, place),
      )
      const also = (entry.many.also ?? []).map((child) => childMarkup(child, place))
      const inside = [...before, ...instances, ...also]
      const within = entry.many.within
      rendered = [
        'element' in within
          ? elementMarkup(within, inside, place)
          : memberMarkup(within.member, within.props, undefined, false, place, inside),
      ]
    } else {
      rendered = [...before, memberMarkup(subject, entry.props, entry.slots, true, place)]
    }
    if (entry.types !== undefined) {
      values.add('typeInto')
      constructor.push(
        `typeInto(() => (this.entry() === ${at} ? { into: ${jsString(entry.types.into)}, text: ${jsString(entry.types.text)} } : undefined))`,
      )
    }
    if (entry.presses !== undefined) {
      values.add('pressOnce')
      constructor.push(
        `pressOnce(() => (this.entry() === ${at} ? ${jsString(entry.presses)} : undefined))`,
      )
    }
    if (entry.selects !== undefined) {
      values.add('selectOnce')
      constructor.push(
        `selectOnce(() => (this.entry() === ${at} ? { in: ${jsString(entry.selects.in)}, text: ${jsString(entry.selects.text)} } : undefined))`,
      )
    }
    cases.push(
      `@case (${at}) {${join([...place.declared.map((text) => ({ text, inline: false })), ...rendered])}}`,
    )
    const fieldsOf = [`name: ${jsString(entry.name)}`]
    if (entry.expect) {
      fieldsOf.push(
        `expect: { ${Object.entries(entry.expect)
          .map(([name, value]) => `${key(name)}: ${value === null ? 'null' : jsString(value)}`)
          .join(', ')} }`,
      )
    }
    if (entry.rendersNothing) fieldsOf.push('rendersNothing: true')
    entryLines.push(`{ ${fieldsOf.join(', ')} }`)
  })

  // A template bound to an input directly needs no type; only a cast or a parameter names it.
  if (![...methods, ...fields].some((line) => line.includes('TemplateRef'))) {
    core.delete('type TemplateRef')
  }
  const fixtureClass = `${shell.member}States`
  const lines = [
    '/**',
    ` * ${shell.member}'s states fixture, with the React fixture's entry names, so a`,
    " * contract's `when <state>` names the same entry in every shell.",
    ' *',
    ` * Generated by \`pnpm shells\` from \`${context.source}\`. Never edit it by hand.`,
    ' */',
    `import { ${[...core].sort((a, b) => a.replace('type ', '').localeCompare(b.replace('type ', ''))).join(', ')} } from '@angular/core'`,
    '',
  ]
  if (readsZag) {
    if (shell.machine === undefined)
      throw new Error(`shells: ${shell.member}'s fixture reads \`zag\`, and it binds no machine`)
    lines.push(`import * as zag from '@zag-js/${shell.machine.of}'`, '')
  }
  const memberImports: string[] = []
  const foundation = new Set<string>([...directives, ...values])
  const fromDir = shell.fixtureDir ?? shell.dir
  for (const name of [...members].sort()) {
    const location = context.locations.get(name)
    if (location === undefined)
      throw new Error(`shells: ${name} is in a fixture but has no description`)
    const typed = propTypes.has(name) ? [`type ${name}Props`] : []
    if (location.home === 'foundation') {
      foundation.add(name)
      typed.forEach((entry) => foundation.add(entry))
    } else
      memberImports.push(
        `import { ${[name, ...typed].join(', ')} } from '${relativeModule(fromDir, location.dir, name)}'`,
      )
  }
  lines.push(
    `import { ${[...[...foundation].sort(), 'type ComponentStates'].join(', ')} } from '@polymorph/angular'`,
  )
  lines.push('')
  lines.push(...memberImports)
  for (const binding of [...recipes].sort()) {
    const recipe = binding === 'styles' ? shell.recipe : shell.recipes?.[binding]
    if (recipe === undefined || recipe === null) {
      throw new Error(
        `shells: ${shell.member}'s fixture names the recipe "${binding}", which it has not`,
      )
    }
    const specifier = /^[@.]/.test(recipe) ? recipe : `@polymorph/recipes/${recipe}.module.css`
    lines.push(`import ${binding} from '${specifier}'`)
  }
  const imports = [...[...members].sort(), ...[...directives].sort()]
  lines.push('')
  // The types the fixture's values name (DataTable's rows), declared once for every entry. A
  // template infers a generic member's parameters from its inputs, so `fixtureGeneric` is not
  // written.
  for (const [name, type] of Object.entries(shell.fixtureTypes ?? {})) {
    lines.push(`type ${name} = ${type}`, '')
  }
  lines.push(`/** ${shell.member}'s entries, the one \`entry\` names. */`)
  lines.push('@Component({')
  lines.push(`  selector: '${angularSelector(shell.member)}-states',`)
  lines.push('  encapsulation: ViewEncapsulation.None,')
  lines.push(`  imports: [${imports.join(', ')}],`)
  lines.push('  // prettier-ignore')
  const text = `@switch (entry()) {\n${cases.join('\n')}\n}`
  lines.push(
    `  template: \`${text.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${')}\`,`,
  )
  lines.push('})')
  lines.push(`export class ${fixtureClass} {`)
  lines.push('readonly entry = input.required<number>()')
  lines.push('readonly overrides = input<Readonly<Record<string, unknown>>>({})')
  lines.push(...fields)
  if (constructor.length > 0) lines.push('', 'constructor() {', ...constructor, '}')
  for (const text of methods) lines.push('', text)
  lines.push('}')
  lines.push('')
  lines.push('export const states: ComponentStates = {')
  lines.push(`  component: '${shell.member}',`)
  lines.push(`  fixture: ${fixtureClass},`)
  lines.push(`  entries: [${entryLines.join(', ')}],`)
  lines.push('}')
  lines.push('')
  return lines.join('\n')
}

/* -------------------------------------------------------------------------- */
/* The index and the galleries                                                */
/* -------------------------------------------------------------------------- */

export function renderAngularIndex(shells: readonly MemberShell[]): string {
  const lines = [
    '/**',
    ' * `@polymorph/angular-ui`, the closed vocabulary for Angular.',
    ' *',
    ' * Every member is a standalone component generated by `pnpm shells` from its',
    ' * framework-neutral description (`packages/shells/src/members/`), and takes the',
    " * React member's props by the mapping in `docs/frameworks.md`. A compound part",
    ' * is a component of its own (`TabsContent`, `<pm-tabs-content>`). The base',
    ' * layer is imported for its side effect, as the React vocabulary does; the',
    ' * published build ships it as `base.css`, which an application lists among',
    ' * its global styles, because the Angular CLI compiles no stylesheet a module',
    ' * imports.',
    ' *',
    ' * Generated by `pnpm shells`. Never edit it by hand.',
    ' */',
    '',
    "import '@polymorph/recipes/base.css'",
    '',
    "export { gallerySlug, lawfulCells } from '@polymorph/angular'",
    `export type { ${['ComponentStates', 'NodeTemplate', 'StateEntry', ...foundationTypeExports('angular')].join(', ')} } from '@polymorph/angular'`,
    '',
  ]
  for (const shell of [...shells].sort((a, b) => a.member.localeCompare(b.member))) {
    const types = [`${shell.member}Props`, ...Object.keys(shell.types ?? {})].sort()
    if ((shell.home ?? 'vocabulary') === 'foundation') {
      lines.push(`export { ${shell.member} } from '@polymorph/angular'`)
      lines.push(`export type { ${types.join(', ')} } from '@polymorph/angular'`)
      continue
    }
    const module = `./${shell.dir}/${shell.member}`
    lines.push(`export { ${shell.member} } from '${module}'`)
    lines.push(`export type { ${types.join(', ')} } from '${module}'`)
    for (const part of (shell.parts ?? []).filter((candidate) => candidate.public)) {
      const partModule = `./${shell.dir}/${shell.member}${part.name}`
      lines.push(`export { ${shell.member}${part.name} } from '${partModule}'`)
      lines.push(`export type { ${shell.member}${part.name}Props } from '${partModule}'`)
    }
  }
  lines.push('')
  return lines.join('\n')
}

/** The galleries: every described member's states fixture, in the order of the descriptions. */
export function renderAngularGalleries(shells: readonly MemberShell[]): string {
  const lines = [
    '/**',
    ' * Every states fixture in the Angular vocabulary, for the laws. A separate module',
    ' * from the index, so an application never bundles the fixtures.',
    ' *',
    ' * Generated by `pnpm shells`. Never edit it by hand.',
    ' */',
    "import type { ComponentStates } from '@polymorph/angular'",
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
 * Every Angular file the descriptions generate, by repository path, before
 * formatting: each member's component and states fixture, each compound
 * part's component, the vocabulary's index and galleries. The foundation's
 * glyph data and Icon stylesheet are the Vue foundation's, written beside the
 * Angular `Icon` by the caller.
 */
export function renderAngularFiles(
  registry: Registry,
  shells: readonly MemberShell[],
): Map<string, string> {
  const member = (name: string) => registryMember(registry, name)
  const locations = whereEach(shells)
  const owners = typeOwners(shells)
  const source = descriptionPath
  const files = new Map<string, string>()
  const nodeCalls = nodeFunctions(shells)
  const parts = new Map<string, RegistryMemberLike>()
  const generics = new Set<string>()
  const hostTags = new Map<string, string>()
  const composing = new Map<string, ReadonlySet<string>>()
  for (const shell of shells) {
    if (shell.generic !== undefined) generics.add(shell.member)
    composing.set(
      shell.member,
      composed(Array.isArray(shell.template) ? shell.template : [shell.template]),
    )
    for (const part of shell.parts ?? []) {
      composing.set(
        `${shell.member}${part.name}`,
        composed(Array.isArray(part.template) ? part.template : [part.template]),
      )
      parts.set(
        `${shell.member}${part.name}`,
        partShell(shell, part, member(shell.member)).component,
      )
      // A part whose element must be a direct child of its parent's (a list's item, a table's
      // section, row or cell) is that element, so the list or the table holds it directly
      // (`<ul>` > `<li pmTagInputChip>`, `<tr pmTableRow>` > `<td pmTableCell>`).
      const root = hostElement(part.template)
      const tag = root?.element.tag as string | undefined
      if (tag !== undefined && STRUCTURAL_TAGS.has(tag))
        hostTags.set(`${shell.member}${part.name}`, tag)
    }
  }
  const lookup = (name: string): RegistryMemberLike | undefined => {
    const part = parts.get(name)
    if (part !== undefined) return part
    try {
      return member(name)
    } catch {
      return undefined
    }
  }
  for (const shell of shells) {
    const component = member(shell.member)
    const context: AngularContext = {
      locations,
      owners,
      source: source(shell),
      lookup,
      generic: (name) => generics.has(name),
      hostTag: (name) => hostTags.get(name),
      composes: (name) => composing.get(name) ?? new Set(),
    }
    files.set(
      angularComponentPath(shell),
      renderAngularMember(shell, component, context, nodeCalls),
    )
    for (const part of shell.parts ?? []) {
      const rendered = partShell(shell, part, component)
      files.set(
        angularPartPath(shell, part.name),
        renderAngularMember(
          rendered.shell,
          rendered.component,
          context,
          nodeCalls,
          shell.member,
          hostTags.get(`${shell.member}${part.name}`),
        ),
      )
    }
    if (!isPrimitive(registry, shell.member)) {
      files.set(angularStatesPath(shell), renderAngularStates(shell, component, context))
    }
  }
  files.set(`${ANGULAR_VOCABULARY_SRC}/index.ts`, renderAngularIndex(shells))
  files.set(
    `${ANGULAR_VOCABULARY_SRC}/galleries.ts`,
    renderAngularGalleries(shells.filter((shell) => !isPrimitive(registry, shell.member))),
  )
  return files
}
