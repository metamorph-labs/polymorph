/**
 * The shapes the rules read in a Vue single-file component, and how a rule
 * reaches them.
 *
 * A `.vue` file is parsed by `vue-eslint-parser`: its `<script setup>` becomes
 * the ordinary program, so every import a rule reads is where it is in TSX, and
 * its `<template>` becomes a second tree the parser walks on request
 * (`defineTemplateBodyVisitor`). The template's nodes are declared structurally
 * here, as `jsx.ts` declares JSX's, because ESLint's types cover only ESTree.
 *
 * The rules never import the parser. They ask the parser services of the file
 * they are given, so a React-only consumer needs nothing Vue, and a rule run
 * over a `.vue` file by a config that set the parser reads its template.
 */
import type { Rule } from 'eslint'

import { vueTagName } from '../markup.js'
import { angularReporterFor, isAngularFile } from './angular'

export interface VueNode {
  type: string
  parent?: VueNode | null
  range: [number, number]
  loc: { start: { line: number; column: number }; end: { line: number; column: number } }
}

export interface VueIdentifier extends VueNode {
  type: 'VIdentifier'
  name: string
  rawName: string
}

export interface VueLiteral extends VueNode {
  type: 'VLiteral'
  value: string
}

export interface VueExpression extends VueNode {
  type: 'VExpressionContainer'
  expression: ({ type: string } & Record<string, unknown>) | null
}

export interface VueDirectiveKey extends VueNode {
  type: 'VDirectiveKey'
  name: VueIdentifier
  argument: VueExpression | VueIdentifier | null
}

/** A static attribute (`directive: false`) or a directive (`:x`, `@x`, `v-…`). */
export interface VueAttribute extends VueNode {
  type: 'VAttribute'
  directive: boolean
  key: VueIdentifier | VueDirectiveKey
  value: VueLiteral | VueExpression | null
  parent: VueStartTag
}

export interface VueStartTag extends VueNode {
  type: 'VStartTag'
  attributes: VueAttribute[]
  parent: VueElement
}

export interface VueText extends VueNode {
  type: 'VText'
  value: string
}

export interface VueElement extends VueNode {
  type: 'VElement'
  /** Lowercased for an HTML element: `<Button>` and `<button>` both read `button`. */
  name: string
  /** As written, which is what tells a member from a raw element. */
  rawName: string
  startTag: VueStartTag
  children: (VueElement | VueText | VueExpression)[]
}

type TemplateVisitor = Record<string, (node: never) => void>

interface VueServices {
  defineTemplateBodyVisitor?: (
    template: TemplateVisitor,
    script?: Rule.RuleListener,
    options?: { templateBodyTriggerSelector: 'Program' | 'Program:exit' },
  ) => Rule.RuleListener
  getDocumentFragment?: () => { children: (VueElement | VueText)[] } | null
}

function services(context: Rule.RuleContext): VueServices | undefined {
  return context.sourceCode.parserServices as VueServices | undefined
}

/** Whether the file is a single-file component the Vue parser read. */
export function isVueFile(context: Rule.RuleContext): boolean {
  return (
    context.filename.endsWith('.vue') &&
    typeof services(context)?.defineTemplateBodyVisitor === 'function'
  )
}

/**
 * The script visitor, extended with handlers for the template when the file is
 * a Vue component. By default the template is walked after the script, so a
 * rule has read every import before it meets an element. `before` walks it
 * first instead, for a rule that reports from `Program:exit` about the whole
 * file.
 */
export function withTemplate(
  context: Rule.RuleContext,
  script: Rule.RuleListener,
  template: TemplateVisitor,
  order: 'after' | 'before' = 'after',
): Rule.RuleListener {
  const define = services(context)?.defineTemplateBodyVisitor
  if (!isVueFile(context) || define === undefined) return script
  return define(
    template,
    script,
    order === 'before' ? { templateBodyTriggerSelector: 'Program' } : undefined,
  )
}

/** The file's top-level blocks: `<template>`, `<script>`, `<style>`. Empty outside Vue. */
export function topLevelBlocks(context: Rule.RuleContext): VueElement[] {
  if (!isVueFile(context)) return []
  const fragment = services(context)?.getDocumentFragment?.()
  return (fragment?.children ?? []).filter(
    (child): child is VueElement => child.type === 'VElement',
  )
}

const NO_IMPORTS: ReadonlySet<string> = new Set()

/** One set per file, so every element and every rule reuses the same read. */
const importsByProgram = new WeakMap<object, ReadonlySet<string>>()

/**
 * The names a file's script imports, which its template's tags resolve to.
 * `program` is the file's `Program`: `context.sourceCode.ast`.
 */
export function scriptImports(program: { body?: unknown[] }): ReadonlySet<string> {
  const cached = importsByProgram.get(program)
  if (cached !== undefined) return cached
  const names = new Set<string>()
  for (const statement of program.body ?? []) {
    const node = statement as { type: string; specifiers?: { local: { name: string } }[] }
    if (node.type !== 'ImportDeclaration') continue
    for (const specifier of node.specifiers ?? []) names.add(specifier.local.name)
  }
  importsByProgram.set(program, names)
  return names
}

/** The names the script of the file a rule is reading imports. */
export const importsOf = (context: Rule.RuleContext): ReadonlySet<string> =>
  isVueFile(context)
    ? scriptImports(context.sourceCode.ast as unknown as { body?: unknown[] })
    : NO_IMPORTS

/**
 * The name an element is resolved by, as Vue's compiler resolves it against a
 * `<script setup>`'s imports (`vueTagName`, which the inventory reads a tag
 * by too): `<data-table>` is `DataTable`, `<card>` is the `Card` the script
 * imports, and `<button>` is the HTML element.
 */
export function vueElementName(
  element: VueElement,
  imports: ReadonlySet<string> = NO_IMPORTS,
): string {
  return vueTagName(element.rawName, imports)
}

/**
 * An HTML element: lowercase, no hyphen, no dot, and not a tag the script's
 * imports resolve (`vueElementName`). Vue's built-ins (`<template>`,
 * `<slot>`, `<component>`, `<transition>`, …) are read separately by the rules
 * that care about them.
 */
export function isPlainVueElement(
  element: VueElement,
  imports: ReadonlySet<string> = NO_IMPORTS,
): boolean {
  return (
    /^[a-z][a-z0-9]*$/.test(element.rawName) && vueElementName(element, imports) === element.rawName
  )
}

const VUE_BUILT_INS = new Set([
  'template',
  'slot',
  'component',
  'transition',
  'transition-group',
  'keep-alive',
  'teleport',
  'suspense',
])

export const isVueBuiltIn = (element: VueElement): boolean =>
  VUE_BUILT_INS.has(element.rawName.toLowerCase())

/**
 * The attribute name an attribute sets: `class` for `class="…"` and for
 * `:class="…"` (`v-bind:class`), `null` for any other directive.
 */
export function boundName(attribute: VueAttribute): string | null {
  if (!attribute.directive) return (attribute.key as VueIdentifier).rawName
  const key = attribute.key as VueDirectiveKey
  if (key.name.name !== 'bind' || key.argument?.type !== 'VIdentifier') return null
  return key.argument.rawName
}

/** The event a `@click` / `v-on:click` listens to, as written, or `null`. */
export function listenedEvent(attribute: VueAttribute): string | null {
  if (!attribute.directive) return null
  const key = attribute.key as VueDirectiveKey
  if (key.name.name !== 'on' || key.argument?.type !== 'VIdentifier') return null
  return key.argument.rawName
}

/** The attribute that sets `name`, statically or bound, if the element has one. */
export function vueAttribute(element: VueElement, name: string): VueAttribute | undefined {
  return element.startTag.attributes.find((attribute) => boundName(attribute) === name)
}

/**
 * A static attribute's text, `null` for a bound one (its value is code), and
 * `undefined` when the element has neither.
 */
export function vueLiteral(element: VueElement, name: string): string | null | undefined {
  const attribute = vueAttribute(element, name)
  if (attribute === undefined) return undefined
  if (attribute.directive) return null
  return (attribute.value as VueLiteral | null)?.value ?? ''
}

/** The element a start tag opens. */
export const elementOf = (tag: VueStartTag): VueElement => tag.parent

/**
 * The text of an element's children as Vue renders it by default: runs of
 * whitespace condensed to one space, trimmed at the ends. `null` when a child
 * is anything but text.
 */
export function vueText(children: VueElement['children']): string | null {
  if (children.some((child) => child.type !== 'VText')) return null
  return children
    .map((child) => (child as VueText).value)
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
}

/** The children that are not whitespace-only text. */
export const meaningfulChildren = (children: VueElement['children']): VueElement['children'] =>
  children.filter((child) => !(child.type === 'VText' && child.value.trim() === ''))

/**
 * Removes an attribute and the whitespace before it, so the tag keeps one
 * space between what remains.
 */
export function removeVueAttribute(
  sourceCode: Rule.RuleContext['sourceCode'],
  fixer: Rule.RuleFixer,
  attribute: VueAttribute,
): Rule.Fix {
  const text = sourceCode.text
  let start = attribute.range[0]
  while (start > 0 && /\s/.test(text[start - 1] as string)) start -= 1
  return fixer.removeRange([start, attribute.range[1]])
}

/** `name={` in a code span: a JSX prop, which a template writes as `:name="…"` or `@event="…"`. */
const JSX_PROP = /(?<![\w.:@-])([A-Za-z][\w-]*)=\{/g

/**
 * A report's text in the syntax of a Vue template. Inside each code span, a
 * prop written as JSX (`gap={4}`, `patch={{ radius: 'md' }}`) becomes the
 * bound attribute (`:gap="4"`, `:patch="{ radius: 'md' }"`), and an event
 * prop (`onClick={save}`) the listener (`@click="save"`). Everything else is
 * the same in both: `<Text size="sm">`, `--pm-space-4`.
 */
export function templateSyntax(text: string): string {
  return text.replace(/`[^`]*`/g, (span) => {
    let written = ''
    let from = 0
    JSX_PROP.lastIndex = 0
    for (let match = JSX_PROP.exec(span); match !== null; match = JSX_PROP.exec(span)) {
      const open = match.index + match[0].length - 1
      let depth = 0
      let close = -1
      for (let at = open; at < span.length; at += 1) {
        if (span[at] === '{') depth += 1
        else if (span[at] === '}' && --depth === 0) {
          close = at
          break
        }
      }
      if (close === -1) break
      const name = match[1] as string
      const attribute = /^on[A-Z]/.test(name)
        ? `@${name.charAt(2).toLowerCase()}${name.slice(3)}`
        : `:${name}`
      const value = span.slice(open + 1, close).replace(/"/g, "'")
      written += `${span.slice(from, match.index)}${attribute}="${value}"`
      from = close + 1
      JSX_PROP.lastIndex = close + 1
    }
    return written + span.slice(from)
  })
}

/**
 * `context.report`, with every string in the report's `data` written in
 * template syntax when the file is a Vue component, so a report on a `.vue`
 * file names its answer as the template would write it. An Angular file's
 * answers are written in an Angular template's syntax (`angularReporterFor`).
 */
export function reporterFor(
  context: Rule.RuleContext,
  messages: Readonly<Record<string, string>> = {},
): (descriptor: Rule.ReportDescriptor) => void {
  if (isAngularFile(context)) return angularReporterFor(context, messages)
  if (!isVueFile(context)) return (descriptor) => context.report(descriptor)
  return (descriptor) => {
    const data = descriptor.data
    context.report(
      data === undefined
        ? descriptor
        : {
            ...descriptor,
            data: Object.fromEntries(
              Object.entries(data).map(([key, value]) => [
                key,
                typeof value === 'string' ? templateSyntax(value) : value,
              ]),
            ),
          },
    )
  }
}

/** A template node, typed for `context.report`, which reads only its location. */
export const reported = (node: VueNode): Rule.Node => node as unknown as Rule.Node
