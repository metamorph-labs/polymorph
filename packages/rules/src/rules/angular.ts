/**
 * The shapes the rules read in an Angular template, and how a rule reaches
 * them.
 *
 * An Angular component is a TypeScript module whose `@Component` decorator
 * holds its template, inline (`template: \`…\``) or in a file of its own
 * (`templateUrl`). The TypeScript is parsed as any `.ts` file is, so every
 * import a rule reads is where it is in TSX. The template is parsed by
 * `@angular-eslint/template-parser`: an external template as the `.html` file
 * it is, and an inline one as the virtual `.html` file that the processor of
 * `@angular-eslint/eslint-plugin-template` extracts from the module and whose
 * reports it maps back. Either way a rule meets a template as a program of its
 * own, whose nodes are Angular's compiler's: `Element`, its `TextAttribute`s
 * (`label="Save"`), `BoundAttribute`s (`[gap]="4"`, `[class.active]`,
 * `[style.padding.px]`, `[@fade]`) and `BoundEvent`s (`(click)`), and the
 * control flow blocks around them. They are declared structurally here, as
 * `jsx.ts`, `vue.ts` and `svelte.ts` declare theirs.
 *
 * A template never sees the module's imports, so a tag is read as Angular's
 * compiler matches it: by the vocabulary's selectors. `<pm-button>` is the
 * member `Button`, `<pm-tabs-content>` the part `Tabs.Content`, and an element
 * with a `pm…` attribute (`<tr pmTableRow>`) is a part drawn as that element.
 *
 * The rules never import the parser or the processor. A rule run over a
 * template by a config that set the parser reads it, and a React-only consumer
 * needs nothing Angular.
 */
import type { Rule } from 'eslint'

import { MESSAGE_LIMIT } from './advice'

/** A position in a template: a node's start or end. */
interface AngularLocation {
  offset: number
}

/** The part of the template a node covers: `sourceSpan`, `keySpan`, `valueSpan`. */
export interface AngularSpan {
  start: AngularLocation
  end: AngularLocation
}

export interface AngularNode {
  type: string
  parent?: AngularNode | null
  loc: { start: { line: number; column: number }; end: { line: number; column: number } }
  sourceSpan: AngularSpan
}

/** An expression in a binding or an interpolation: Angular's expression AST. */
export interface AngularExpression {
  type: string
  [key: string]: unknown
}

/** `name="text"`, or a bare `name`, whose value is `''`. */
export interface AngularTextAttribute extends AngularNode {
  type: 'TextAttribute'
  name: string
  value: string
}

/**
 * The kinds of binding Angular's compiler reads from an attribute's name
 * (`BindingType`): `[x]`, `[attr.x]`, `[class.x]`, `[style.x]`, `[@x]` or
 * `@x`, `[(x)]`, and `[animate.enter]`.
 */
export const BINDING = {
  property: 0,
  attribute: 1,
  class: 2,
  style: 3,
  legacyAnimation: 4,
  twoWay: 5,
  animation: 6,
} as const

/** The kinds of listener (`ParsedEventType`): `(x)`, `(@x.done)`, `[(x)]`'s half, `(animate.leave)`. */
export const EVENT = { regular: 0, legacyAnimation: 1, twoWay: 2, animation: 3 } as const

/**
 * A binding: `[gap]="4"`, `[class.active]="on"` (`name` is `active`),
 * `[style.padding.px]="12"` (`name` is `padding`, `unit` is `px`). The parser
 * keeps the binding's kind in `__originalType`, because it writes the node's
 * name over `type`.
 */
export interface AngularBoundAttribute extends AngularNode {
  type: 'BoundAttribute'
  name: string
  unit: string | null
  __originalType: number
  value: AngularExpression
}

/** A listener: `(click)="save()"` (`name` is `click`), `(keydown.enter)`, `(window:resize)` (`target` is `window`). */
export interface AngularBoundEvent extends AngularNode {
  type: 'BoundEvent'
  name: string
  target: string | null
  __originalType: number
}

/** An element: `name` is its tag, with `:svg:` before an SVG element's (`:svg:path`). */
export interface AngularElement extends AngularNode {
  type: 'Element'
  name: string
  attributes: AngularTextAttribute[]
  inputs: AngularBoundAttribute[]
  outputs: AngularBoundEvent[]
  children: AngularNode[]
  startSourceSpan: AngularSpan
}

/** Static text among an element's children. */
export interface AngularText extends AngularNode {
  type: 'Text'
  value: string
}

/** Whether the file is a template the Angular template parser read. */
export function isAngularTemplate(context: Rule.RuleContext): boolean {
  return Array.isArray(
    (context.sourceCode.ast as unknown as { templateNodes?: unknown }).templateNodes,
  )
}

/**
 * The modules whose import makes a TypeScript file an Angular one: any package
 * of the `@angular` scope, and polymorph's Angular foundation and vocabulary.
 */
export const ANGULAR_MODULES = ['@angular', '@polymorph/angular', '@polymorph/angular-ui']

/** One answer per file, so every rule that asks reuses the same read. */
const angularByProgram = new WeakMap<object, boolean>()

/**
 * Whether a file is Angular: a template the Angular parser read, a file the
 * config's settings say is (`settings: { polymorph: { framework: 'angular' }
 * }`, which an Angular app's config sets), or a module that imports from
 * `ANGULAR_MODULES`. A report on an Angular file writes its answer in template
 * syntax (`angularSyntax`).
 */
export function isAngularFile(context: Rule.RuleContext): boolean {
  if (isAngularTemplate(context)) return true
  const settings = (context.settings as { polymorph?: { framework?: unknown } } | undefined)
    ?.polymorph
  if (settings?.framework === 'angular') return true
  const program = context.sourceCode.ast as unknown as { body?: unknown[] }
  const cached = angularByProgram.get(program)
  if (cached !== undefined) return cached
  const angular = (program.body ?? []).some((statement) => {
    const node = statement as { type: string; source?: { value?: unknown } }
    if (node.type !== 'ImportDeclaration') return false
    const source = String(node.source?.value)
    return ANGULAR_MODULES.some((module) => source === module || source.startsWith(`${module}/`))
  })
  angularByProgram.set(program, angular)
  return angular
}

type TemplateVisitor = Record<string, (node: never) => void>

/**
 * The script visitor, extended with handlers for a template's node types when
 * the file is an Angular template. A handler for a node type both name runs
 * the script's first; only `Program` and `Program:exit` are shared.
 */
export function withAngularTemplate(
  context: Rule.RuleContext,
  script: Rule.RuleListener,
  template: TemplateVisitor,
): Rule.RuleListener {
  if (!isAngularTemplate(context)) return script
  const merged: Record<string, (node: never) => void> = {
    ...(script as Record<string, (node: never) => void>),
  }
  for (const [type, handler] of Object.entries(template)) {
    const before = merged[type]
    merged[type] =
      before === undefined
        ? handler
        : (node: never) => {
            before(node)
            handler(node)
          }
  }
  return merged as Rule.RuleListener
}

/** The selector prefix of every member and part: `pm-button`, `pm-tabs-content`. */
export const SELECTOR_PREFIX = 'pm-'

/** A member's selector: `Button` is `pm-button`, `Tabs.Content` is `pm-tabs-content`. */
export function angularSelector(member: string): string {
  return (
    SELECTOR_PREFIX +
    member
      .replace(/\./g, '')
      .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
      .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
      .toLowerCase()
  )
}

/** An element's tag without its namespace: `:svg:path` is `path`. */
export function angularElementName(element: AngularElement): string {
  return element.name.replace(/^:[a-z]+:/, '')
}

/**
 * The member an element's tag names, in PascalCase (`pm-data-table` is
 * `DataTable`, `pm-tabs-content` is `TabsContent`), or `null` for any other
 * element.
 */
export function angularMember(element: AngularElement): string | null {
  const name = angularElementName(element)
  if (!name.startsWith(SELECTOR_PREFIX)) return null
  return name
    .slice(SELECTOR_PREFIX.length)
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('')
}

/**
 * The elements the vocabulary draws a part on, because each must be a direct
 * child of its parent's element: a list's item, a table's section, row and
 * cell, a description list's term and detail. No control is among them, so
 * `<button pmX>` is a raw button.
 */
const PART_TAGS = new Set(['li', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'dt', 'dd'])

/**
 * A part drawn as its own element: `<tr pmTableRow>`, one of the elements a
 * part is drawn on, with its `pm…` attribute.
 */
export const isAngularPart = (element: AngularElement): boolean =>
  PART_TAGS.has(angularElementName(element)) &&
  element.attributes.some((attribute) => /^pm[A-Z]/.test(attribute.name))

/**
 * An HTML, SVG or MathML element: no hyphen in its tag, and no member's part
 * drawn on it. A tag with a hyphen is a member or another library's component.
 */
export const isPlainAngularElement = (element: AngularElement): boolean =>
  !angularElementName(element).includes('-') && !isAngularPart(element)

/** The static attribute `name`, if the element has one. */
export const angularAttribute = (
  element: AngularElement,
  name: string,
): AngularTextAttribute | undefined =>
  element.attributes.find((attribute) => attribute.name === name)

/** The binding of `name` of the given kinds, if the element has one: `[href]`, `[attr.href]`. */
export const angularInput = (
  element: AngularElement,
  name: string,
  kinds: readonly number[] = [BINDING.property, BINDING.attribute],
): AngularBoundAttribute | undefined =>
  element.inputs.find((input) => input.name === name && kinds.includes(input.__originalType))

/**
 * A static attribute's text, `null` when the element binds it instead
 * (`[type]="kind"`), and `undefined` when the element has neither.
 */
export function angularLiteral(element: AngularElement, name: string): string | null | undefined {
  const attribute = angularAttribute(element, name)
  if (attribute !== undefined) return attribute.value
  return angularInput(element, name) === undefined ? undefined : null
}

/** The element an attribute, a binding or a listener is written on. */
export const elementOfAttribute = (node: AngularNode): AngularElement | null =>
  node.parent?.type === 'Element' ? (node.parent as AngularElement) : null

/** The source a node covers, as written. */
export const writtenText = (
  sourceCode: Rule.RuleContext['sourceCode'],
  node: AngularNode,
): string => sourceCode.text.slice(node.sourceSpan.start.offset, node.sourceSpan.end.offset)

/** A binding's or listener's name as written, without its value: `[class.active]`, `(click)`, `@fade`. */
export function writtenName(
  sourceCode: Rule.RuleContext['sourceCode'],
  node: AngularBoundAttribute | AngularBoundEvent | AngularTextAttribute,
): string {
  const text = writtenText(sourceCode, node)
  const equals = text.indexOf('=')
  return (equals === -1 ? text : text.slice(0, equals)).trim()
}

/**
 * The expression a binding's value is, unwrapped from the parser's
 * `ASTWithSource` and any parentheses.
 */
export function boundExpression(binding: AngularBoundAttribute): AngularExpression | null {
  let expression = binding.value as AngularExpression | null
  while (expression?.type === 'ASTWithSource' || expression?.type === 'ParenthesizedExpression') {
    expression = (expression['ast'] ?? expression['expression']) as AngularExpression | null
  }
  return expression
}

/** A binding's value when it is a string written out (`[class]="'flex gap-2'"`), or `null`. */
export function boundString(binding: AngularBoundAttribute): string | null {
  const expression = boundExpression(binding)
  return expression?.type === 'LiteralPrimitive' && typeof expression['value'] === 'string'
    ? expression['value']
    : null
}

/**
 * The entries of an object literal a binding is given (`[ngStyle]="{ padding:
 * '12px' }"`), as key and literal value (`null` for a value computed), or
 * `null` when the value is not an object literal.
 */
export function boundEntries(
  binding: AngularBoundAttribute,
): { key: string; value: string | number | null }[] | null {
  const expression = boundExpression(binding)
  if (expression?.type !== 'LiteralMap') return null
  const keys = expression['keys'] as { key?: unknown }[]
  const values = expression['values'] as AngularExpression[]
  return keys.flatMap((entry, at) => {
    if (typeof entry.key !== 'string') return []
    const value = values[at]
    const literal =
      value?.type === 'LiteralPrimitive' &&
      (typeof value['value'] === 'string' || typeof value['value'] === 'number')
        ? (value['value'] as string | number)
        : null
    return [{ key: entry.key, value: literal }]
  })
}

/**
 * The listener an element has for one of `events` (lowercase DOM event names),
 * as written: `(click)`, `(keydown.enter)`. A listener on `window`, `document`
 * or `body` is not the element's, and an animation callback is not an event.
 */
export function angularHandler(
  sourceCode: Rule.RuleContext['sourceCode'],
  element: AngularElement,
  events: ReadonlySet<string>,
): string | undefined {
  const output = element.outputs.find(
    (candidate) =>
      candidate.target === null &&
      candidate.__originalType === EVENT.regular &&
      events.has((candidate.name.split('.')[0] as string).toLowerCase()),
  )
  return output === undefined ? undefined : writtenName(sourceCode, output)
}

/** The children that are not whitespace-only text or a comment. */
export const meaningfulAngularChildren = (children: readonly AngularNode[]): AngularNode[] =>
  children.filter(
    (child) =>
      child.type !== 'Comment' &&
      !(child.type === 'Text' && (child as AngularText).value.trim() === ''),
  )

/**
 * The text of an element's children as Angular renders it: runs of whitespace
 * condensed to one space, trimmed at the ends. `null` when a child is anything
 * but static text.
 */
export function angularText(children: readonly AngularNode[]): string | null {
  const kept = children.filter((child) => child.type !== 'Comment')
  if (kept.some((child) => child.type !== 'Text')) return null
  return kept
    .map((child) => (child as AngularText).value)
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Removes an attribute, a binding or a listener and the whitespace before it,
 * so the tag keeps one space between what remains.
 */
export function removeAngularAttribute(
  sourceCode: Rule.RuleContext['sourceCode'],
  fixer: Rule.RuleFixer,
  attribute: AngularNode,
): Rule.Fix {
  const text = sourceCode.text
  let start = attribute.sourceSpan.start.offset
  while (start > 0 && /\s/.test(text[start - 1] as string)) start -= 1
  return fixer.removeRange([start, attribute.sourceSpan.end.offset])
}

interface AngularServices {
  convertNodeSourceSpanToLoc?: (span: AngularSpan) => Rule.Node['loc']
}

/**
 * Where an element's start tag is, which a report on the element points at:
 * `<button type="button" (click)="save()">`, not its content.
 */
export function startTagLoc(
  context: Rule.RuleContext,
  element: AngularElement,
): NonNullable<Rule.Node['loc']> {
  const convert = (context.sourceCode.parserServices as AngularServices | undefined)
    ?.convertNodeSourceSpanToLoc
  return (convert?.(element.startSourceSpan) ?? element.loc) as NonNullable<Rule.Node['loc']>
}

/** A template node, typed for `context.report`, which reads only its location. */
export const reportedTemplate = (node: AngularNode): Rule.Node => node as unknown as Rule.Node

/** A property of a component's metadata: `template`, `styles`, `imports`, `animations`. */
export type MetadataProperty = Rule.Node & { value: { type: string; [key: string]: unknown } }

/** The `@Component({ … })` metadata a call is, by property name, or `null` for any other call. */
export function componentMetadata(call: {
  type: string
  callee?: { type: string; name?: string }
  arguments?: { type: string }[]
  parent?: { type: string } | null
}): Map<string, MetadataProperty> | null {
  if (call.type !== 'CallExpression' || call.parent?.type !== 'Decorator') return null
  if (call.callee?.type !== 'Identifier' || call.callee.name !== 'Component') return null
  const [metadata] = call.arguments ?? []
  if (metadata?.type !== 'ObjectExpression') return null
  const properties = new Map<string, MetadataProperty>()
  for (const property of (metadata as unknown as { properties: Rule.Node[] }).properties) {
    if (property.type !== 'Property') continue
    const key = property.key as { type: string; name?: string; value?: unknown }
    const name = key.type === 'Identifier' ? key.name : key.value
    if (typeof name === 'string') {
      properties.set(name, property as unknown as MetadataProperty)
    }
  }
  return properties
}

/* -------------------------------------------------------------------------- */
/* Answers in template syntax                                                 */
/* -------------------------------------------------------------------------- */

/** One attribute of a member as an answer writes it in JSX: `gap={4}`, `label="…"`, `iconOnly`. */
interface WrittenAttribute {
  name: string
  /** `{…}`'s inside, the quoted text, or `null` for a bare attribute. */
  value: string | null
  braced: boolean
}

/** The attribute in a template's syntax: `[gap]="4"`, `label="…"`, `(click)="save()"`, `[iconOnly]="true"`. */
function templateAttribute({ name, value, braced }: WrittenAttribute): string {
  if (value === null) return `[${name}]="true"`
  if (!braced) return `${name}="${value}"`
  const inner = value.replace(/"/g, "'")
  if (/^on[A-Z]/.test(name)) {
    const event = `${name.charAt(2).toLowerCase()}${name.slice(3)}`
    // A handler is a statement Angular runs: a function named alone is called.
    const handler = /^[A-Za-z_$][\w$]*$/.test(inner) ? `${inner}()` : inner
    return `(${event})="${handler}"`
  }
  return `[${name}]="${inner}"`
}

/** The end of a braced value that opens at `open`, or `-1`. */
function closingBrace(text: string, open: number): number {
  let depth = 0
  for (let at = open; at < text.length; at += 1) {
    if (text[at] === '{') depth += 1
    else if (text[at] === '}' && --depth === 0) return at
  }
  return -1
}

/**
 * The attributes of a member written as JSX, from the start of its first one,
 * and where they end, or `null` when they are not attributes alone.
 */
function readAttributes(text: string): { attributes: WrittenAttribute[]; rest: string } | null {
  const attributes: WrittenAttribute[] = []
  let at = 0
  for (;;) {
    const space = /^\s*/.exec(text.slice(at))?.[0].length ?? 0
    at += space
    const name = /^[A-Za-z][\w-]*/.exec(text.slice(at))?.[0]
    if (name === undefined) return { attributes, rest: text.slice(at - space) }
    at += name.length
    if (text[at] === '=' && text[at + 1] === '"') {
      const close = text.indexOf('"', at + 2)
      if (close === -1) return null
      attributes.push({ name, value: text.slice(at + 2, close), braced: false })
      at = close + 1
    } else if (text[at] === '=' && text[at + 1] === '{') {
      const close = closingBrace(text, at + 1)
      if (close === -1) return null
      attributes.push({ name, value: text.slice(at + 2, close), braced: true })
      at = close + 1
    } else {
      attributes.push({ name, value: null, braced: false })
    }
  }
}

/** One code span in a template's syntax. */
function spanSyntax(span: string): string {
  const member = /^<([A-Z][\w.]*)/.exec(span)
  if (member !== null) {
    const name = member[1] as string
    const read = readAttributes(span.slice(member[0].length))
    if (read === null) return span
    const written = read.attributes.map((attribute) => ` ${templateAttribute(attribute)}`)
    return `<${angularSelector(name)}${written.join('')}${read.rest}`
  }
  // A prop alone: `gap={4}`, `onClick={save}`.
  const prop = /^([A-Za-z][\w-]*)=\{/.exec(span)
  if (prop !== null) {
    const close = closingBrace(span, prop[0].length - 1)
    if (close === -1) return span
    return (
      templateAttribute({
        name: prop[1] as string,
        value: span.slice(prop[0].length, close),
        braced: true,
      }) + span.slice(close + 1)
    )
  }
  return span
}

/**
 * A report's text in the syntax of an Angular template. Inside each code
 * span, a member written as JSX becomes the element its selector names
 * (`<Inline gap={4}>` is `<pm-inline [gap]="4">`), a prop written in braces
 * the binding (`[gap]="4"`), an event prop the listener (`onClick={save}` is
 * `(click)="save()"`), and a bare boolean prop a binding to `true`, because a
 * bare attribute passes Angular's empty string. Text is the same in both:
 * `label="…"`, `--pm-space-4`, `className`.
 */
export function angularSyntax(text: string): string {
  return text.replace(/`([^`]*)`/g, (_, span: string) => `\`${spanSyntax(span)}\``)
}

/**
 * `context.report`, with every string in the report's `data` written in
 * template syntax when the file is Angular, so a report on an Angular
 * component or template names its answer as the template would write it.
 * `messages` are the rule's, which keep a translated report under the limit.
 */
export function angularReporterFor(
  context: Rule.RuleContext,
  messages: Readonly<Record<string, string>> = {},
): (descriptor: Rule.ReportDescriptor) => void {
  if (!isAngularFile(context)) return (descriptor) => context.report(descriptor)
  return (descriptor) => context.report(inAngularSyntax(descriptor, messages))
}

/** A message with its `{{placeholders}}` filled, as ESLint fills them. */
const filled = (message: string, data: Readonly<Record<string, unknown>>): string =>
  message.replace(/\{\{\s*(\w+)\s*\}\}/g, (whole, name: string) =>
    Object.hasOwn(data, name) ? String(data[name]) : whole,
  )

/**
 * A report descriptor whose `data` strings are written in template syntax.
 * A binding is longer than the prop it writes (`[gap]="4"` for `gap={4}`), so
 * an `advice` that fitted the limit in JSX may not: its last sentences are
 * dropped until the message fits again, as `fit` drops them, and its first is
 * always kept.
 */
export function inAngularSyntax(
  descriptor: Rule.ReportDescriptor,
  messages: Readonly<Record<string, string>> = {},
): Rule.ReportDescriptor {
  const data = descriptor.data
  if (data === undefined) return descriptor
  const translated: Record<string, unknown> = Object.fromEntries(
    Object.entries(data).map(([key, value]) => [
      key,
      typeof value === 'string' ? angularSyntax(value) : value,
    ]),
  )
  const id = 'messageId' in descriptor ? descriptor.messageId : undefined
  const message = id === undefined ? undefined : messages[id]
  if (message !== undefined && typeof translated['advice'] === 'string') {
    const sentences = translated['advice'].split(/(?<=\.) (?=[A-Z`<])/)
    while (
      sentences.length > 1 &&
      filled(message, { ...translated, advice: sentences.join(' ') }).length >= MESSAGE_LIMIT
    ) {
      sentences.pop()
    }
    translated['advice'] = sentences.join(' ')
  }
  return { ...descriptor, data: translated as Record<string, string> }
}

/**
 * The `@Component` metadata property a string is the value of, `template` or
 * `styles` (a string or an array of them), or `null` for any other string. A
 * component's template is read by the template parser and its styles by
 * `no-app-css`, so a rule that reads strings leaves them to those.
 */
export function componentStringOf(node: {
  type: string
  parent?: unknown
}): 'template' | 'styles' | null {
  let value = node as { type: string; parent?: unknown }
  if (value.type === 'TemplateElement') value = value.parent as typeof value
  let parent = value.parent as { type: string; parent?: unknown; key?: unknown } | undefined
  if (parent?.type === 'ArrayExpression') parent = parent.parent as typeof parent
  if (parent?.type !== 'Property') return null
  const key = parent.key as { type: string; name?: string; value?: unknown }
  const name = key.type === 'Identifier' ? key.name : key.value
  if (name !== 'template' && name !== 'styles') return null
  const call = (parent.parent as { parent?: unknown } | undefined)?.parent
  return call !== undefined && componentMetadata(call as Parameters<typeof componentMetadata>[0])
    ? name
    : null
}
