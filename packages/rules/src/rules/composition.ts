/**
 * What a screen composes, read the same way in every syntax the rules read:
 * TSX (React and Solid), a Vue template, Svelte markup and an Angular
 * template. The usage rules (`one-main-button`, `danger-last`,
 * `trailing-icon`) are about which members sit where: a Button among its
 * siblings, inside a Dialog or a Card, in one branch of a conditional or the
 * other. Each syntax writes those relations differently, so each is read into
 * one tree here, and the rules read the tree.
 *
 * The tree keeps what the code writes out and nothing it would have to guess.
 * Content a rule cannot see the shape of (a call such as `items.map(…)`, a
 * variable, a loop block, a template rendered elsewhere) is left out, so no
 * rule counts it. An element inside such content is read as a tree of its own,
 * so a Dialog written inside a loop is still read whole.
 *
 * A fragment and an array are read as the elements they hold, in place,
 * because that is where they render: `<Inline>{a}<>{b}{c}</></Inline>` is a
 * row of three. A plain `<template>` in Vue and `@defer` in Angular are read
 * the same way.
 */
import type { Rule } from 'eslint'

import type { Written } from '../usage'
import {
  angularElementName,
  angularMember,
  BINDING,
  boundString,
  isAngularTemplate,
  startTagLoc,
  type AngularBoundAttribute,
  type AngularElement,
  type AngularNode,
  type AngularSpan,
} from './angular'
import { BESPOKE_ELEMENT } from './jsx'
import { isSvelteFile, svelteElementName, type SvelteElement, type SvelteNode } from './svelte'
import {
  isVueBuiltIn,
  isVueFile,
  scriptImports,
  vueElementName,
  type VueAttribute,
  type VueDirectiveKey,
  type VueElement,
  type VueExpression,
  type VueIdentifier,
} from './vue'

/** Where a report points: a node, or an Angular element's start tag. */
export type Target = { node: Rule.Node } | { loc: NonNullable<Rule.Node['loc']> }

/** A prop of an element: what it writes, and how to rename it, where a fix can. */
export interface ComposedProp {
  value: Written
  /** Writes the prop under another name, keeping its value. */
  rename?: (fixer: Rule.RuleFixer, name: string) => Rule.Fix
}

export interface ComposedElement {
  type: 'element'
  /**
   * The element's name as the rules read a member: `Button`, `Dashboard.Panel`,
   * `div`. An Angular member is read from its selector, so `pm-dashboard-panel`
   * is `DashboardPanel`.
   */
  name: string
  at: Target
  prop(name: string): ComposedProp
  /** The content between its tags. */
  children: Composed[]
  /** The content each named slot or each prop that holds elements carries. */
  slots: ReadonlyMap<string, Composed[]>
}

/** A conditional: the content of each branch, of which one renders. */
export interface ComposedBranch {
  type: 'branch'
  /** The conditional itself, which tells two branches of one conditional from two conditionals. */
  id: object
  branches: Composed[][]
}

export type Composed = ComposedElement | ComposedBranch

const ABSENT: ComposedProp = { value: undefined }
const COMPUTED: ComposedProp = { value: null }

/* -------------------------------------------------------------------------- */
/* TSX                                                                        */
/* -------------------------------------------------------------------------- */

interface Node {
  type: string
  parent?: Node | null
  range?: [number, number]
  [key: string]: unknown
}

/** The nodes a value passes through on its way into JSX without changing what it is. */
const TS_WRAPPERS = new Set([
  'TSAsExpression',
  'TSSatisfiesExpression',
  'TSNonNullExpression',
  'TSTypeAssertion',
  'ParenthesizedExpression',
])

/** `Button`, `Dashboard.Panel`, or `null` for a namespaced name. */
function jsxName(name: Node): string | null {
  if (name.type === 'JSXIdentifier') return name['name'] as string
  if (name.type === 'JSXMemberExpression') {
    const object = jsxName(name['object'] as Node)
    const property = jsxName(name['property'] as Node)
    return object === null || property === null ? null : `${object}.${property}`
  }
  return null
}

/** A JSX attribute's value as written: its text, or `null` when it is computed. */
function jsxValue(value: Node | null): Written {
  if (value === null) return null
  let written = value
  if (written.type === 'JSXExpressionContainer') written = written['expression'] as Node
  while (TS_WRAPPERS.has(written.type)) written = written['expression'] as Node
  if (written.type === 'Literal') return typeof written['value'] === 'string' ? written['value'] : null
  if (written.type === 'TemplateLiteral' && (written['expressions'] as unknown[]).length === 0) {
    return (written['quasis'] as { value: { cooked: string } }[])[0]?.value.cooked ?? null
  }
  return null
}

/** The content a JSX expression renders, as far as the code writes it out. */
function jsxContent(node: Node | null | undefined): Composed[] {
  if (node === null || node === undefined) return []
  switch (node.type) {
    case 'JSXElement':
      return jsxElement(node)
    case 'JSXFragment':
      return (node['children'] as Node[]).flatMap(jsxContent)
    case 'JSXExpressionContainer':
      return jsxContent(node['expression'] as Node)
    case 'ConditionalExpression':
      return [
        {
          type: 'branch',
          id: node,
          branches: [jsxContent(node['consequent'] as Node), jsxContent(node['alternate'] as Node)],
        },
      ]
    case 'LogicalExpression':
      return jsxContent(node['right'] as Node)
    case 'ArrayExpression':
      return (node['elements'] as (Node | null)[]).flatMap(jsxContent)
    default:
      return TS_WRAPPERS.has(node.type) ? jsxContent(node['expression'] as Node) : []
  }
}

function jsxElement(node: Node): Composed[] {
  const opening = node['openingElement'] as Node
  const name = jsxName(opening['name'] as Node)
  const attributes = opening['attributes'] as Node[]
  const children = (node['children'] as Node[]).flatMap(jsxContent)
  if (name === null) return children
  const spread = attributes.some((attribute) => attribute.type === 'JSXSpreadAttribute')
  const slots = new Map<string, Composed[]>()
  for (const attribute of attributes) {
    if (attribute.type !== 'JSXAttribute') continue
    const value = attribute['value'] as Node | null
    if (value === null) continue
    const content =
      value.type === 'JSXExpressionContainer' ? jsxContent(value['expression'] as Node) : jsxContent(value)
    if (content.length > 0) slots.set(String((attribute['name'] as Node)['name']), content)
  }
  return [
    {
      type: 'element',
      name,
      at: { node: opening as unknown as Rule.Node },
      prop(prop) {
        const attribute = attributes.find(
          (candidate) =>
            candidate.type === 'JSXAttribute' && (candidate['name'] as Node)['name'] === prop,
        )
        if (attribute === undefined) return spread ? COMPUTED : ABSENT
        const key = attribute['name'] as Node
        return {
          value: jsxValue(attribute['value'] as Node | null),
          rename: (fixer, renamed) => fixer.replaceText(key as unknown as Rule.Node, renamed),
        }
      },
      children,
      slots,
    },
  ]
}

/**
 * Whether a JSX element or fragment is the top of what a tree reads: it is not
 * the content of another one, through nothing but the nodes `jsxContent`
 * reads through.
 */
function isJsxRoot(node: Node): boolean {
  let child = node
  let parent = node.parent ?? null
  while (parent !== null) {
    switch (parent.type) {
      case 'JSXElement':
      case 'JSXFragment':
      case 'JSXAttribute':
        return false
      case 'ConditionalExpression':
        if (parent['test'] === child) return true
        break
      case 'LogicalExpression':
        if (parent['left'] === child) return true
        break
      case 'JSXExpressionContainer':
      case 'ArrayExpression':
        break
      default:
        if (!TS_WRAPPERS.has(parent.type)) return true
    }
    child = parent
    parent = parent.parent ?? null
  }
  return true
}

function jsxTrees(context: Rule.RuleContext): Composed[] {
  const keys = context.sourceCode.visitorKeys
  const roots: Composed[] = []
  const pending: Node[] = [context.sourceCode.ast as unknown as Node]
  while (pending.length > 0) {
    const node = pending.pop() as Node
    if ((node.type === 'JSXElement' || node.type === 'JSXFragment') && isJsxRoot(node)) {
      roots.push(...jsxContent(node))
    }
    for (const key of keys[node.type] ?? []) {
      const value = node[key]
      for (const child of Array.isArray(value) ? value : [value]) {
        if (child && typeof (child as Node).type === 'string') pending.push(child as Node)
      }
    }
  }
  return roots
}

/* -------------------------------------------------------------------------- */
/* Vue                                                                        */
/* -------------------------------------------------------------------------- */

const camelised = (name: string): string =>
  name.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase())

/** A directive's name without its `v-`: `if`, `else-if`, `for`, `slot`, `bind`; `null` for a static attribute. */
function directiveOf(attribute: VueAttribute): string | null {
  return attribute.directive ? (attribute.key as VueDirectiveKey).name.name : null
}

const hasDirective = (element: VueElement, name: string): boolean =>
  element.startTag.attributes.some((attribute) => directiveOf(attribute) === name)

/** The slot a `<template #name>` or `<template v-slot:name>` fills, `default` when it names none. */
function vueSlot(element: VueElement): string | null {
  if (element.rawName !== 'template') return null
  const slot = element.startTag.attributes.find((attribute) => directiveOf(attribute) === 'slot')
  if (slot === undefined) return null
  const argument = (slot.key as VueDirectiveKey).argument
  return argument?.type === 'VIdentifier' ? argument.rawName : 'default'
}

/** A bound value written out as a string: `:variant="'solid'"`. */
function vueBound(attribute: VueAttribute): Written {
  const expression = (attribute.value as VueExpression | null)?.expression
  if (!expression) return null
  if (expression.type === 'Literal') {
    return typeof expression['value'] === 'string' ? (expression['value'] as string) : null
  }
  if (expression.type === 'TemplateLiteral' && (expression['expressions'] as unknown[]).length === 0) {
    return (expression['quasis'] as { value: { cooked: string } }[])[0]?.value.cooked ?? null
  }
  return null
}

function vueContent(children: VueElement['children'], imports: ReadonlySet<string>): Composed[] {
  const out: Composed[] = []
  let chain: { type: 'branch'; id: object; branches: Composed[][] } | null = null
  for (const child of children) {
    if (child.type !== 'VElement') {
      // Whitespace and comments sit between the branches of one chain.
      if (child.type === 'VText' && child.value.trim() === '') continue
      chain = null
      continue
    }
    if (hasDirective(child, 'for')) {
      chain = null
      continue
    }
    if (hasDirective(child, 'if')) {
      chain = { type: 'branch', id: child, branches: [vueNode(child, imports)] }
      out.push(chain)
      continue
    }
    const elseIf = hasDirective(child, 'else-if')
    if ((elseIf || hasDirective(child, 'else')) && chain !== null) {
      chain.branches.push(vueNode(child, imports))
      if (!elseIf) chain = null
      continue
    }
    chain = null
    out.push(...vueNode(child, imports))
  }
  return out
}

function vueNode(element: VueElement, imports: ReadonlySet<string>): Composed[] {
  if ((element.rawName === 'template' && vueSlot(element) === null) || isVueBuiltIn(element)) {
    return vueContent(element.children, imports)
  }
  const slots = new Map<string, Composed[]>()
  const rest: VueElement['children'] = []
  for (const child of element.children) {
    const slot = child.type === 'VElement' ? vueSlot(child) : null
    if (slot === null || slot === 'default') {
      if (slot === 'default') rest.push(...(child as VueElement).children)
      else rest.push(child)
      continue
    }
    slots.set(slot, [...(slots.get(slot) ?? []), ...vueContent((child as VueElement).children, imports)])
  }
  const attributes = element.startTag.attributes
  const spread = attributes.some(
    (attribute) => directiveOf(attribute) === 'bind' && (attribute.key as VueDirectiveKey).argument === null,
  )
  return [
    {
      type: 'element',
      name: vueElementName(element, imports),
      at: { node: element.startTag as unknown as Rule.Node },
      prop(prop) {
        for (const attribute of attributes) {
          const directive = directiveOf(attribute)
          if (directive === null) {
            const key = attribute.key as VueIdentifier
            if (camelised(key.rawName) !== prop) continue
            return {
              value: (attribute.value as { value?: string } | null)?.value ?? '',
              rename: (fixer, renamed) => fixer.replaceTextRange(key.range, renamed),
            }
          }
          const argument = (attribute.key as VueDirectiveKey).argument
          if (directive !== 'bind' || argument?.type !== 'VIdentifier') continue
          if (camelised(argument.rawName) !== prop) continue
          return {
            value: vueBound(attribute),
            rename: (fixer, renamed) => fixer.replaceTextRange(argument.range, renamed),
          }
        }
        return spread ? COMPUTED : ABSENT
      },
      children: vueContent(rest, imports),
      slots,
    },
  ]
}

function vueTrees(context: Rule.RuleContext): Composed[] {
  const ast = context.sourceCode.ast as unknown as { templateBody?: VueElement | null; body?: unknown[] }
  const template = ast.templateBody
  if (!template) return []
  return vueContent(template.children, scriptImports(ast))
}

/* -------------------------------------------------------------------------- */
/* Svelte                                                                     */
/* -------------------------------------------------------------------------- */

interface SvelteBlock extends SvelteNode {
  children: SvelteNode[]
  else?: (SvelteBlock & { elseif: boolean }) | null
  id?: { name?: string }
}

/** A Svelte attribute's value as written: its text, a string in braces, or `null`. */
function svelteValue(attribute: SvelteNode): Written {
  if (attribute.type !== 'SvelteAttribute') return null
  const parts = (attribute as unknown as { value: { type: string; value?: string; expression?: Node }[] })
    .value
  if (parts.every((part) => part.type === 'SvelteLiteral')) {
    return parts.map((part) => part.value ?? '').join('')
  }
  const [only] = parts
  if (parts.length === 1 && only?.type === 'SvelteMustacheTag') return jsxValue(only.expression ?? null)
  return null
}

/** The slot a child fills by its `slot="…"` attribute, written out. */
function svelteSlotAttribute(element: SvelteElement): string | null {
  const attribute = element.startTag.attributes.find(
    (candidate) =>
      candidate.type === 'SvelteAttribute' &&
      (candidate as unknown as { key: { name: string } }).key.name === 'slot',
  )
  const value = attribute === undefined ? null : svelteValue(attribute)
  return typeof value === 'string' && value !== '' ? value : null
}

function svelteContent(children: readonly SvelteNode[]): Composed[] {
  const out: Composed[] = []
  for (const child of children) {
    switch (child.type) {
      case 'SvelteElement':
        out.push(...svelteNode(child as SvelteElement))
        break
      case 'SvelteIfBlock': {
        const block = child as SvelteBlock
        const branches = [svelteContent(block.children)]
        // An `{:else if}` holds the next `{#if}` as its one child, which is read as a branch of its own.
        if (block.else) branches.push(svelteContent(block.else.children))
        out.push({ type: 'branch', id: child, branches })
        break
      }
      case 'SvelteKeyBlock':
        out.push(...svelteContent((child as SvelteBlock).children))
        break
      default:
        // `{#each}`, `{#await}`, a snippet rendered elsewhere, text and expressions.
        break
    }
  }
  return out
}

function svelteNode(element: SvelteElement): Composed[] {
  const slots = new Map<string, Composed[]>()
  const rest: SvelteNode[] = []
  for (const child of element.children) {
    if (child.type === 'SvelteSnippetBlock' && element.kind === 'component') {
      const name = (child as SvelteBlock).id?.name
      if (name !== undefined) {
        slots.set(name, [...(slots.get(name) ?? []), ...svelteContent((child as SvelteBlock).children)])
      }
      continue
    }
    const slot = child.type === 'SvelteElement' ? svelteSlotAttribute(child as SvelteElement) : null
    if (slot !== null && element.kind === 'component') {
      const held = child as SvelteElement
      const content =
        held.kind === 'special' ? svelteContent(held.children) : svelteNode(held)
      slots.set(slot, [...(slots.get(slot) ?? []), ...content])
      continue
    }
    rest.push(child)
  }
  const attributes = element.startTag.attributes
  const spread = attributes.some((attribute) => attribute.type === 'SvelteSpreadAttribute')
  return [
    {
      type: 'element',
      name: svelteElementName(element),
      at: { node: element.startTag as unknown as Rule.Node },
      prop(prop) {
        const attribute = attributes.find(
          (candidate) =>
            (candidate.type === 'SvelteAttribute' &&
              (candidate as unknown as { key: { name: string } }).key.name === prop) ||
            (candidate.type === 'SvelteShorthandAttribute' &&
              (candidate as unknown as { key: { name: string } }).key.name === prop),
        )
        if (attribute === undefined) return spread ? COMPUTED : ABSENT
        if (attribute.type === 'SvelteShorthandAttribute') return COMPUTED
        const key = (attribute as unknown as { key: SvelteNode }).key
        return {
          value: svelteValue(attribute),
          rename: (fixer, renamed) => fixer.replaceTextRange(key.range, renamed),
        }
      },
      children: svelteContent(rest),
      slots,
    },
  ]
}

function svelteTrees(context: Rule.RuleContext): Composed[] {
  const program = context.sourceCode.ast as unknown as { body: SvelteNode[] }
  return svelteContent(
    program.body.filter(
      (node) => node.type !== 'SvelteScriptElement' && node.type !== 'SvelteStyleElement',
    ),
  )
}

/* -------------------------------------------------------------------------- */
/* Angular                                                                    */
/* -------------------------------------------------------------------------- */

interface AngularBlock extends AngularNode {
  children: AngularNode[]
  branches?: AngularBlock[]
  groups?: AngularBlock[]
  cases?: AngularBlock[]
  templateAttrs?: { name: string }[]
}

/** The slot a child fills by its `slot="…"` attribute. */
function angularSlot(element: AngularElement): string | null {
  const slot = element.attributes.find((attribute) => attribute.name === 'slot')?.value
  return slot === undefined || slot === '' ? null : slot
}

function angularContent(nodes: readonly AngularNode[], context: Rule.RuleContext): Composed[] {
  const out: Composed[] = []
  for (const node of nodes) {
    const block = node as AngularBlock
    switch (node.type) {
      case 'Element':
        out.push(...angularNode(node as AngularElement, context))
        break
      case 'IfBlock':
        out.push({
          type: 'branch',
          id: node,
          branches: (block.branches ?? []).map((branch) => angularContent(branch.children, context)),
        })
        break
      case 'SwitchBlock':
        out.push({
          type: 'branch',
          id: node,
          branches: (block.groups ?? block.cases ?? []).map((group) =>
            angularContent(group.children, context),
          ),
        })
        break
      case 'DeferredBlock':
        out.push(...angularContent(block.children, context))
        break
      case 'Template':
        // `*ngIf` renders its content in place; `*ngFor` repeats it, and a bare
        // `<ng-template>` renders wherever it is referenced.
        if ((block.templateAttrs ?? []).some((attribute) => attribute.name === 'ngIf')) {
          out.push(...angularContent(block.children, context))
        }
        break
      default:
        break
    }
  }
  return out
}

/** A span's offsets in the template's text. */
const spanRange = (span: AngularSpan): [number, number] => [span.start.offset, span.end.offset]

function angularNode(element: AngularElement, context: Rule.RuleContext): Composed[] {
  const slots = new Map<string, Composed[]>()
  const rest: AngularNode[] = []
  for (const child of element.children) {
    const slot = child.type === 'Element' ? angularSlot(child as AngularElement) : null
    if (slot === null) {
      rest.push(child)
      continue
    }
    slots.set(slot, [...(slots.get(slot) ?? []), ...angularNode(child as AngularElement, context)])
  }
  return [
    {
      type: 'element',
      name: angularMember(element) ?? angularElementName(element),
      at: { loc: startTagLoc(context, element) },
      prop(prop) {
        const text = element.attributes.find((attribute) => attribute.name === prop)
        if (text !== undefined) {
          const key = (text as unknown as { keySpan?: AngularSpan }).keySpan
          return {
            value: text.value,
            ...(key === undefined
              ? {}
              : { rename: (fixer, renamed) => fixer.replaceTextRange(spanRange(key), renamed) }),
          }
        }
        const bound = element.inputs.find(
          (input: AngularBoundAttribute) =>
            input.name === prop && input.__originalType === BINDING.property,
        )
        if (bound === undefined) return ABSENT
        const key = (bound as unknown as { keySpan?: AngularSpan }).keySpan
        return {
          value: boundString(bound),
          ...(key === undefined
            ? {}
            : { rename: (fixer, renamed) => fixer.replaceTextRange(spanRange(key), renamed) }),
        }
      },
      children: angularContent(rest, context),
      slots,
    },
  ]
}

function angularTrees(context: Rule.RuleContext): Composed[] {
  const nodes = (context.sourceCode.ast as unknown as { templateNodes: AngularNode[] }).templateNodes
  return angularContent(nodes, context)
}

/* -------------------------------------------------------------------------- */
/* The file                                                                   */
/* -------------------------------------------------------------------------- */

/** One read per file, so the three rules share it. */
const trees = new WeakMap<object, Composed[]>()

/**
 * Every tree the file writes, in its syntax. A Vue file's script and a Svelte
 * file's script are TypeScript, which writes no markup the rules read here.
 */
export function composedTrees(context: Rule.RuleContext): Composed[] {
  const ast = context.sourceCode.ast as unknown as object
  const cached = trees.get(ast)
  if (cached !== undefined) return cached
  const read = isAngularTemplate(context)
    ? angularTrees(context)
    : isVueFile(context)
      ? vueTrees(context)
      : isSvelteFile(context)
        ? svelteTrees(context)
        : jsxTrees(context)
  trees.set(ast, read)
  return read
}

/** Whether an element is a `<Bespoke>` zone, in any syntax's reading of its name. */
export const isZone = (element: ComposedElement): boolean => element.name === BESPOKE_ELEMENT

/**
 * Every element of the trees, with the content it is in, outside `<Bespoke>`
 * zones. A zone declares a one-off composition, which the usage rules lift as
 * the vocabulary rules are lifted.
 */
export function eachElement(
  trees: readonly Composed[],
  visit: (element: ComposedElement) => void,
): void {
  const walk = (content: readonly Composed[]): void => {
    for (const item of content) {
      if (item.type === 'branch') {
        item.branches.forEach(walk)
        continue
      }
      if (isZone(item)) continue
      visit(item)
      walk(item.children)
      for (const slot of item.slots.values()) walk(slot)
    }
  }
  walk(trees)
}
