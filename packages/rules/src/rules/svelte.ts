/**
 * The shapes the rules read in a Svelte component, and how a rule reaches
 * them.
 *
 * A `.svelte` file is parsed by `svelte-eslint-parser`. Its markup is part of
 * the program ESLint walks: the program's body holds each `<script>`, whose
 * `body` is the script's statements, the `<style>` block and the markup's
 * elements. An import is therefore visited where it is in TSX, and a rule reads
 * the markup by adding visitors for the Svelte node types (`withMarkup`). The
 * nodes are declared structurally here, as `jsx.ts` and `vue.ts` declare
 * theirs, because ESLint's types cover only ESTree.
 *
 * The rules never import the parser. A rule run over a `.svelte` file by a
 * config that set the parser reads its markup, and a React-only consumer needs
 * nothing Svelte.
 */
import type { Rule } from 'eslint'

export interface SvelteNode {
  type: string
  parent?: SvelteNode | null
  range: [number, number]
  loc: { start: { line: number; column: number }; end: { line: number; column: number } }
}

/** An ESTree node inside markup: an expression in braces. */
export interface SvelteExpression {
  type: string
  [key: string]: unknown
}

/** An element's or an attribute's name: `div`, `class`, `svelte:window`. */
export interface SvelteName extends SvelteNode {
  type: 'SvelteName'
  name: string
}

/** The static text of an attribute, or one run of it beside an expression. */
export interface SvelteLiteral extends SvelteNode {
  type: 'SvelteLiteral'
  value: string
}

/** `{…}`: an expression in markup, in an attribute or among an element's children. */
export interface SvelteMustacheTag extends SvelteNode {
  type: 'SvelteMustacheTag'
  expression: SvelteExpression
}

/** `name="…"`, `name={…}`, or a bare `name` (`boolean`). */
export interface SvelteAttribute extends SvelteNode {
  type: 'SvelteAttribute'
  key: SvelteName
  boolean: boolean
  value: (SvelteLiteral | SvelteMustacheTag)[]
  parent: SvelteStartTag
}

/** `{class}`: an attribute named by the variable that holds its value. */
export interface SvelteShorthandAttribute extends SvelteNode {
  type: 'SvelteShorthandAttribute'
  key: { type: 'Identifier'; name: string }
  parent: SvelteStartTag
}

/** The part of a directive after its colon: `click` in `on:click|once`, with `once` a modifier. */
export interface SvelteDirectiveKey extends SvelteNode {
  type: 'SvelteDirectiveKey'
  name: { type: string; name?: string }
  modifiers: string[]
}

/**
 * A directive: `on:click`, `class:active`, `transition:fade`, `in:fly`,
 * `out:fade`, `animate:flip`, `use:action`, `bind:value`. A transition says
 * which way it runs: both for `transition:`, `intro` for `in:`, `outro` for
 * `out:`.
 */
export interface SvelteDirective extends SvelteNode {
  type: 'SvelteDirective'
  kind: 'Action' | 'Animation' | 'Binding' | 'Class' | 'EventHandler' | 'Let' | 'Ref' | 'Transition'
  key: SvelteDirectiveKey
  intro?: boolean
  outro?: boolean
  parent: SvelteStartTag
}

/** `style:padding="12px"`: one declaration, as a directive. */
export interface SvelteStyleDirective extends SvelteNode {
  type: 'SvelteStyleDirective'
  key: SvelteDirectiveKey
  value: (SvelteLiteral | SvelteMustacheTag)[]
  parent: SvelteStartTag
}

export interface SvelteStartTag extends SvelteNode {
  type: 'SvelteStartTag'
  /** Attributes, directives, spreads (`{...rest}`) and attachments, in the order written. */
  attributes: SvelteNode[]
  parent: SvelteNode
}

export interface SvelteText extends SvelteNode {
  type: 'SvelteText'
  value: string
}

/**
 * An element in markup. `kind` is `html` for an HTML, SVG or MathML element
 * and for a custom element (`<my-widget>`), `component` for a capitalised or
 * dotted tag (`<Button>`, `<Tabs.Content>`), and `special` for Svelte's own
 * (`<svelte:window>`). Svelte decides this from the tag alone, so a lowercase
 * tag is never a component.
 */
export interface SvelteElement extends SvelteNode {
  type: 'SvelteElement'
  kind: 'html' | 'component' | 'special'
  name: SvelteNode & { name?: string }
  startTag: SvelteStartTag
  children: SvelteNode[]
}

/** The component's `<style>` block. */
export interface SvelteStyleElement extends SvelteNode {
  type: 'SvelteStyleElement'
  startTag: SvelteStartTag
  children: SvelteText[]
}

/** An import in one of the file's scripts. */
export interface SvelteImport {
  type: 'ImportDeclaration'
  source: { value: unknown }
  specifiers: { type: string; local: { name: string } }[]
}

interface SvelteServices {
  isSvelte?: boolean
}

/** Whether the file is a component the Svelte parser read. */
export function isSvelteFile(context: Rule.RuleContext): boolean {
  return (
    context.filename.endsWith('.svelte') &&
    (context.sourceCode.parserServices as SvelteServices | undefined)?.isSvelte === true
  )
}

type MarkupVisitor = Record<string, (node: never) => void>

/**
 * The script visitor, extended with handlers for the markup's node types when
 * the file is a Svelte component. The markup is walked in the order it is
 * written, among the scripts, so a rule that needs the imports before it meets
 * an element reads them with `svelteImports`. A handler for a node type both
 * visitors name runs the script's first.
 */
export function withMarkup(
  context: Rule.RuleContext,
  script: Rule.RuleListener,
  markup: MarkupVisitor,
): Rule.RuleListener {
  if (!isSvelteFile(context)) return script
  const merged: Record<string, (node: never) => void> = {
    ...(script as Record<string, (node: never) => void>),
  }
  for (const [type, handler] of Object.entries(markup)) {
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

/** One list per file, so every element and every rule reuses the same read. */
const importsByProgram = new WeakMap<object, readonly SvelteImport[]>()

/**
 * The import declarations of every `<script>` in the file: the instance
 * script and a `<script module>`. Markup may come before a script, so a rule
 * that needs to know what a tag refers to reads this before it meets one.
 */
export function svelteImports(context: Rule.RuleContext): readonly SvelteImport[] {
  if (!isSvelteFile(context)) return []
  const program = context.sourceCode.ast as unknown as { body: SvelteNode[] }
  const cached = importsByProgram.get(program)
  if (cached !== undefined) return cached
  const found = program.body
    .filter((node) => node.type === 'SvelteScriptElement')
    .flatMap((script) => (script as unknown as { body: SvelteImport[] }).body)
    .filter((statement) => statement.type === 'ImportDeclaration')
  importsByProgram.set(program, found)
  return found
}

/** A component's name is an identifier or a dotted path of them. */
function nameOf(node: {
  type: string
  name?: string
  object?: unknown
  property?: unknown
}): string {
  if (node.type === 'SvelteMemberExpressionName') {
    return `${nameOf(node.object as typeof node)}.${nameOf(node.property as typeof node)}`
  }
  return node.name ?? ''
}

/** The element's name as written: `div`, `Button`, `Tabs.Content`, `svelte:window`. */
export const svelteElementName = (element: SvelteElement): string => nameOf(element.name)

/**
 * An HTML element: `html` and no hyphen. A custom element (`<my-widget>`)
 * is another library's component.
 */
export const isPlainSvelteElement = (element: SvelteElement): boolean =>
  element.kind === 'html' && !svelteElementName(element).includes('-')

/** The element a start tag opens, or `null` for a `<script>` or `<style>` tag. */
export function elementOfTag(tag: SvelteStartTag): SvelteElement | null {
  return tag.parent.type === 'SvelteElement' ? (tag.parent as SvelteElement) : null
}

/**
 * The attribute name an attribute sets: `class` for `class="…"`,
 * `class={…}` and `{class}`. `null` for a directive, a spread or an
 * attachment.
 */
export function svelteAttributeName(attribute: SvelteNode): string | null {
  if (attribute.type === 'SvelteAttribute') return (attribute as SvelteAttribute).key.name
  if (attribute.type === 'SvelteShorthandAttribute') {
    return (attribute as SvelteShorthandAttribute).key.name
  }
  return null
}

/** The attribute that sets `name`, statically or from an expression, if the element has one. */
export function svelteAttribute(
  element: SvelteElement,
  name: string,
): SvelteAttribute | SvelteShorthandAttribute | undefined {
  return element.startTag.attributes.find(
    (attribute) => svelteAttributeName(attribute) === name,
  ) as SvelteAttribute | SvelteShorthandAttribute | undefined
}

/**
 * An attribute's or a `style:` directive's text when every part of it is
 * static (`''` for a bare `disabled`), and `null` when a part is an expression
 * (`title="a {b}"`, `{title}`).
 */
export function attributeText(attribute: SvelteNode): string | null {
  if (attribute.type !== 'SvelteAttribute' && attribute.type !== 'SvelteStyleDirective') {
    return null
  }
  const parts = (attribute as SvelteAttribute | SvelteStyleDirective).value
  if (parts.some((part) => part.type !== 'SvelteLiteral')) return null
  return parts.map((part) => (part as SvelteLiteral).value).join('')
}

/**
 * A static attribute's text, `null` when it holds an expression, and
 * `undefined` when the element has no such attribute.
 */
export function svelteLiteral(element: SvelteElement, name: string): string | null | undefined {
  const attribute = svelteAttribute(element, name)
  return attribute === undefined ? undefined : attributeText(attribute)
}

/** The expression an attribute or directive is given whole in braces (`class={…}`), or `null`. */
export function bracedExpression(attribute: SvelteNode): SvelteExpression | null {
  const parts = (attribute as { value?: unknown }).value
  if (!Array.isArray(parts) || parts.length !== 1) return null
  const [only] = parts as SvelteNode[]
  return only?.type === 'SvelteMustacheTag' ? (only as SvelteMustacheTag).expression : null
}

/**
 * A directive as written, without its modifiers: `on:click`, `class:active`,
 * `style:padding`, `transition:fade`, `in:fly`, `animate:flip`.
 */
export function directiveText(
  sourceCode: Rule.RuleContext['sourceCode'],
  directive: SvelteDirective | SvelteStyleDirective,
): string {
  const key = sourceCode.getText(directive.key as unknown as Rule.Node)
  return key.split('|')[0] as string
}

/**
 * The handler an element has, as written: an event attribute (`onclick`, as
 * Svelte 5 writes one) or an `on:` directive (`on:click`, as Svelte 4 does),
 * for one of `events`, which are lowercase DOM event names. `undefined` when
 * it has none.
 */
export function svelteHandler(
  element: SvelteElement,
  events: ReadonlySet<string>,
): string | undefined {
  for (const attribute of element.startTag.attributes) {
    const name = svelteAttributeName(attribute)
    if (name !== null && /^on/i.test(name) && events.has(name.slice(2).toLowerCase())) return name
    if (attribute.type !== 'SvelteDirective') continue
    const directive = attribute as SvelteDirective
    const event = directive.key.name.name
    if (
      directive.kind === 'EventHandler' &&
      event !== undefined &&
      events.has(event.toLowerCase())
    ) {
      return `on:${event}`
    }
  }
  return undefined
}

/** The children that are not whitespace-only text or a comment. */
export const meaningfulSvelteChildren = (children: readonly SvelteNode[]): SvelteNode[] =>
  children.filter(
    (child) =>
      child.type !== 'SvelteHTMLComment' &&
      !(child.type === 'SvelteText' && (child as SvelteText).value.trim() === ''),
  )

/**
 * The text of an element's children as Svelte renders it: runs of whitespace
 * condensed to one space, trimmed at the ends, comments dropped. `null` when a
 * child is anything but text.
 */
export function svelteText(children: readonly SvelteNode[]): string | null {
  const kept = children.filter((child) => child.type !== 'SvelteHTMLComment')
  if (kept.some((child) => child.type !== 'SvelteText')) return null
  return kept
    .map((child) => (child as SvelteText).value)
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Removes an attribute and the whitespace before it, so the tag keeps one
 * space between what remains.
 */
export function removeSvelteAttribute(
  sourceCode: Rule.RuleContext['sourceCode'],
  fixer: Rule.RuleFixer,
  attribute: SvelteNode,
): Rule.Fix {
  const text = sourceCode.text
  let start = attribute.range[0]
  while (start > 0 && /\s/.test(text[start - 1] as string)) start -= 1
  return fixer.removeRange([start, attribute.range[1]])
}

/** A markup node, typed for `context.report`, which reads only its location. */
export const reportedMarkup = (node: SvelteNode): Rule.Node => node as unknown as Rule.Node
