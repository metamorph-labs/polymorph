import {
  BINDING,
  boundExpression,
  type AngularBoundAttribute,
  type AngularExpression,
  type AngularTextAttribute,
} from './angular'
import { cssProperty, type Declaration } from './layout'
import {
  bracedExpression,
  type SvelteAttribute,
  type SvelteLiteral,
  type SvelteNode,
  type SvelteShorthandAttribute,
  type SvelteStyleDirective,
} from './svelte'
import type { VueAttribute, VueExpression, VueLiteral } from './vue'

/**
 * What a `style` writes, read so that a `<ThirdParty>` boundary can lift it
 * and still refuse a colour (`no-raw-styles`).
 *
 * The reader goes through every form whose property names are written out: a
 * type assertion (`as`, `satisfies`, `<T>`, `!`) and parentheses, each end of
 * a conditional, the right of `&&` and both sides of `||` and `??`, an object
 * spread into the object, an array of styles (Vue's `:style="[…]"`), an
 * object under a selector (`css={{ '&:hover': { … } }}`), and CSS text with a
 * hole for each value computed inside it (`` `height: ${h}px` ``,
 * `style="height: {h}px"`). A hole is read as `0`, so the words beside it are
 * still read.
 *
 * A `style` whose property names cannot be known is `unread`: one given as a
 * variable, a call or a member, a spread of anything but an object written
 * out, a computed key that is not a string written out, and CSS text with a
 * hole where a name or a whole declaration is. The boundary keeps a colour
 * red, and it can do that only in a `style` whose names are written out.
 *
 * A value given through a variable (`style={{ height }}`) has its name written
 * out, so it is read as no value: the colour it holds is not checked.
 */
export interface LiftedStyle {
  /** Each declaration once for each string its value can be. */
  declarations: Declaration[]
  /** Whether a property's name is not written out. */
  unread: boolean
}

/** Stands for a value computed inside CSS text until the text is split. */
const HOLE = '\u0000'

const EMPTY: LiftedStyle = { declarations: [], unread: false }
const UNREAD: LiftedStyle = { declarations: [], unread: true }

function merge(readings: readonly LiftedStyle[]): LiftedStyle {
  return {
    declarations: readings.flatMap((reading) => reading.declarations),
    unread: readings.some((reading) => reading.unread),
  }
}

/**
 * CSS text split into declarations at each `;`, and at each `{` and `}` so
 * that a rule nested in a `css` template is read too. A separator inside
 * parentheses or quotes (`url(data:…;base64,…)`) splits nothing.
 */
function cssSegments(text: string): string[] {
  const segments: string[] = []
  let depth = 0
  let quote: string | null = null
  let start = 0
  for (let at = 0; at < text.length; at++) {
    const char = text[at]
    if (quote !== null) {
      if (char === '\\') at++
      else if (char === quote) quote = null
    } else if (char === '"' || char === "'") quote = char
    else if (char === '(') depth++
    else if (char === ')') depth = Math.max(0, depth - 1)
    else if (depth === 0 && (char === ';' || char === '{' || char === '}')) {
      segments.push(text.slice(start, at))
      start = at + 1
    }
  }
  segments.push(text.slice(start))
  return segments
}

/**
 * The declarations of CSS text, with each `HOLE` read as `0`. A segment that
 * is not a declaration is dropped, as CSS drops it, unless a hole is in it:
 * then a name or whole declarations are computed, and the text is unread.
 */
export function cssText(text: string): LiftedStyle {
  const declarations: Declaration[] = []
  let unread = false
  for (const segment of cssSegments(text)) {
    const match = /^\s*(--[^\s:]*|-?[a-z_][\w-]*)\s*:([^]*)$/i.exec(segment)
    if (match === null || (match[1] as string).includes(HOLE)) {
      if (segment.includes(HOLE)) unread = true
      continue
    }
    const property = (match[1] as string).toLowerCase()
    const value = (match[2] as string).replaceAll(HOLE, '0').trim()
    if (value !== '') declarations.push({ property, value, written: property })
  }
  return { declarations, unread }
}

/** A script node, as the parsers give it. */
interface AstNode {
  type: string
  [key: string]: unknown
}

const ASSERTION =
  /^(TSAsExpression|TSSatisfiesExpression|TSTypeAssertion|TSNonNullExpression|ParenthesizedExpression)$/

/** An expression with the type assertions and parentheses around it taken off. */
function bare(expression: unknown): AstNode | null {
  let node = (expression ?? null) as AstNode | null
  while (node !== null && ASSERTION.test(node.type)) node = node['expression'] as AstNode
  return node
}

/**
 * The text an expression writes, with a `HOLE` for each value computed inside
 * it: a string, a template literal, a `css` tagged template, or a `+` of
 * them. `null` when it writes no text.
 */
function scriptText(expression: AstNode | null): string | null {
  if (expression === null) return null
  if (expression.type === 'Literal') {
    return typeof expression['value'] === 'string' ? expression['value'] : null
  }
  if (expression.type === 'TemplateLiteral') {
    const quasis = expression['quasis'] as { value: { cooked: string | null; raw: string } }[]
    return quasis.map((quasi) => quasi.value.cooked ?? quasi.value.raw).join(HOLE)
  }
  if (expression.type === 'TaggedTemplateExpression') {
    const tag = expression['tag'] as AstNode
    return tag.type === 'Identifier' && tag['name'] === 'css'
      ? scriptText(expression['quasi'] as AstNode)
      : null
  }
  if (expression.type === 'BinaryExpression' && expression['operator'] === '+') {
    const left = scriptText(bare(expression['left']))
    const right = scriptText(bare(expression['right']))
    return left === null && right === null ? null : `${left ?? HOLE}${right ?? HOLE}`
  }
  return null
}

/** The ends a conditional or a logical expression can take: the right of `&&` and both of the rest. */
function scriptEnds(expression: AstNode): AstNode[] | null {
  if (expression.type === 'ConditionalExpression') {
    return [expression['consequent'] as AstNode, expression['alternate'] as AstNode]
  }
  if (expression.type === 'LogicalExpression') {
    const right = expression['right'] as AstNode
    return expression['operator'] === '&&' ? [right] : [expression['left'] as AstNode, right]
  }
  return null
}

/** Whether an expression gives no style: `null`, `undefined`, a boolean or a number. */
function scriptNothing(expression: AstNode): boolean {
  if (expression.type === 'Identifier') return expression['name'] === 'undefined'
  return expression.type === 'Literal' && typeof expression['value'] !== 'string'
}

/** The name an object's property is written with, or `null` when it is computed. */
function keyName(property: AstNode): string | null {
  const key = property['key'] as AstNode
  if (!property['computed']) {
    if (key.type === 'Identifier') return key['name'] as string
    return key.type === 'Literal' ? String(key['value']) : null
  }
  const written = bare(key)
  if (written?.type === 'Literal' && typeof written['value'] !== 'object') {
    return String(written['value'])
  }
  if (written?.type === 'TemplateLiteral' && (written['expressions'] as unknown[]).length === 0) {
    return scriptText(written)
  }
  return null
}

/** One property's value: each string it can be, or the style an object under a selector writes. */
function scriptValue(name: string, expression: unknown): LiftedStyle {
  const node = bare(expression)
  if (node === null) return EMPTY
  if (node.type === 'ObjectExpression') return scriptObject(node)
  const ends = scriptEnds(node)
  if (ends !== null) return merge(ends.map((end) => scriptValue(name, end)))
  const text = scriptText(node)
  if (text === null) return EMPTY
  const property = cssProperty(name)
  return {
    declarations: [{ property, value: text.replaceAll(HOLE, '0'), written: name }],
    unread: false,
  }
}

/** What an object spread into a style adds: an object written out, at each end it can take. */
function scriptSpread(expression: unknown): LiftedStyle {
  const node = bare(expression)
  if (node === null || scriptNothing(node)) return EMPTY
  if (node.type === 'ObjectExpression') return scriptObject(node)
  const ends = scriptEnds(node)
  return ends === null ? UNREAD : merge(ends.map(scriptSpread))
}

function scriptObject(object: AstNode): LiftedStyle {
  const readings: LiftedStyle[] = []
  for (const property of object['properties'] as AstNode[]) {
    if (property.type === 'SpreadElement') {
      readings.push(scriptSpread(property['argument']))
      continue
    }
    const name = property.type === 'Property' ? keyName(property) : null
    if (name === null) readings.push(UNREAD)
    // A getter's or a method's value is computed, as a variable's is.
    else if (property['kind'] === 'init' && property['method'] !== true) {
      readings.push(scriptValue(name, property['value']))
    }
  }
  return merge(readings)
}

/** A `style` given as a script expression: in TSX braces, a Vue binding or Svelte braces. */
export function scriptStyle(expression: unknown): LiftedStyle {
  const node = bare(expression)
  if (node === null || node.type === 'JSXEmptyExpression' || scriptNothing(node)) return EMPTY
  if (node.type === 'ObjectExpression') return scriptObject(node)
  if (node.type === 'ArrayExpression') {
    return merge(
      (node['elements'] as (AstNode | null)[]).map((element) =>
        element?.type === 'SpreadElement' ? scriptStyle(element['argument']) : scriptStyle(element),
      ),
    )
  }
  const ends = scriptEnds(node)
  if (ends !== null) return merge(ends.map(scriptStyle))
  const text = scriptText(node)
  return text === null ? UNREAD : cssText(text)
}

/** A JSX `style` or `css`: a string, or an expression in braces. */
export function jsxStyle(value: unknown): LiftedStyle {
  const node = (value ?? null) as AstNode | null
  if (node === null) return EMPTY
  return scriptStyle(node.type === 'JSXExpressionContainer' ? node['expression'] : node)
}

/** A Vue `style`: static text, or a bound object, array or string. */
export function vueStyle(attribute: VueAttribute): LiftedStyle {
  if (!attribute.directive) return cssText((attribute.value as VueLiteral | null)?.value ?? '')
  return scriptStyle((attribute.value as VueExpression | null)?.expression ?? null)
}

/** The text of a Svelte attribute's or directive's parts, with a `HOLE` for each `{…}`. */
function svelteText(parts: readonly SvelteNode[]): string {
  return parts
    .map((part) => (part.type === 'SvelteLiteral' ? (part as SvelteLiteral).value : HOLE))
    .join('')
}

/** A Svelte `style`: text with `{…}` in it, an expression in braces, or the shorthand `{style}`. */
export function svelteStyle(attribute: SvelteAttribute | SvelteShorthandAttribute): LiftedStyle {
  if (attribute.type === 'SvelteShorthandAttribute') return UNREAD
  const braced = bracedExpression(attribute)
  return braced !== null ? scriptStyle(braced) : cssText(svelteText(attribute.value))
}

/** A `style:color` directive. One with no value reads the variable of its name. */
export function svelteDirectiveStyle(directive: SvelteStyleDirective): LiftedStyle {
  const property = (directive.key.name.name ?? '').toLowerCase()
  if (directive.value.length === 0) return EMPTY
  const braced = bracedExpression(directive)
  if (braced !== null) return scriptValue(property, braced)
  const value = svelteText(directive.value).replaceAll(HOLE, '0')
  return { declarations: [{ property, value, written: property }], unread: false }
}

/** An Angular expression with its source wrapper, parentheses and `!` taken off. */
function angularBare(expression: unknown): AngularExpression | null {
  let node = (expression ?? null) as AngularExpression | null
  while (node !== null) {
    if (node.type === 'ASTWithSource') node = node['ast'] as AngularExpression
    else if (node.type === 'ParenthesizedExpression' || node.type === 'NonNullAssert') {
      node = node['expression'] as AngularExpression
    } else break
  }
  return node
}

/** The text an Angular expression writes, with a `HOLE` for each value computed inside it. */
function angularText(expression: AngularExpression | null): string | null {
  if (expression === null) return null
  if (expression.type === 'LiteralPrimitive') {
    return typeof expression['value'] === 'string' ? expression['value'] : null
  }
  // `style="height: {{h}}px"`, and a template literal.
  if (expression.type === 'Interpolation') return (expression['strings'] as string[]).join(HOLE)
  if (expression.type === 'TemplateLiteral') {
    return (expression['elements'] as { text: string }[]).map((element) => element.text).join(HOLE)
  }
  if (expression.type === 'Binary' && expression['operation'] === '+') {
    const left = angularText(angularBare(expression['left']))
    const right = angularText(angularBare(expression['right']))
    return left === null && right === null ? null : `${left ?? HOLE}${right ?? HOLE}`
  }
  return null
}

function angularEnds(expression: AngularExpression): AngularExpression[] | null {
  if (expression.type === 'Conditional') {
    return [expression['trueExp'] as AngularExpression, expression['falseExp'] as AngularExpression]
  }
  if (expression.type === 'Binary' && /^(\|\||&&|\?\?)$/.test(String(expression['operation']))) {
    const right = expression['right'] as AngularExpression
    return expression['operation'] === '&&'
      ? [right]
      : [expression['left'] as AngularExpression, right]
  }
  return null
}

function angularValue(name: string, expression: unknown): LiftedStyle {
  const node = angularBare(expression)
  if (node === null) return EMPTY
  const ends = angularEnds(node)
  if (ends !== null) return merge(ends.map((end) => angularValue(name, end)))
  const text = angularText(node)
  if (text === null) return EMPTY
  const property = cssProperty(name)
  return {
    declarations: [{ property, value: text.replaceAll(HOLE, '0'), written: name }],
    unread: false,
  }
}

/** An object literal's entries. A key's unit (`'width.px'`) is not the property's. */
function angularMap(map: AngularExpression): LiftedStyle {
  const keys = map['keys'] as { kind?: string; key?: unknown }[]
  const values = map['values'] as AngularExpression[]
  return merge(
    keys.map((entry, at) => {
      if (entry.kind === 'spread') {
        const spread = angularBare(values[at])
        if (spread === null) return EMPTY
        if (spread.type === 'LiteralMap') return angularMap(spread)
        return spread.type === 'LiteralPrimitive' && typeof spread['value'] !== 'string'
          ? EMPTY
          : UNREAD
      }
      if (typeof entry.key !== 'string') return UNREAD
      const [name = ''] = entry.key.split('.')
      return angularValue(name, values[at])
    }),
  )
}

function angularStyleExpression(expression: unknown): LiftedStyle {
  const node = angularBare(expression)
  if (node === null) return EMPTY
  if (node.type === 'LiteralPrimitive' && typeof node['value'] !== 'string') return EMPTY
  if (node.type === 'LiteralMap') return angularMap(node)
  if (node.type === 'LiteralArray') {
    return merge((node['expressions'] as AngularExpression[]).map(angularStyleExpression))
  }
  const ends = angularEnds(node)
  if (ends !== null) return merge(ends.map(angularStyleExpression))
  const text = angularText(node)
  return text === null ? UNREAD : cssText(text)
}

/**
 * An Angular style attribute or binding: `style="…"` with or without
 * `{{…}}`, `[style]`, `[attr.style]` and `[ngStyle]`, and `[style.color]`,
 * whose name is always written out.
 */
export function angularStyle(node: AngularTextAttribute | AngularBoundAttribute): LiftedStyle {
  if (node.type === 'TextAttribute') return cssText(node.value)
  if (node.__originalType === BINDING.style) return angularValue(node.name, boundExpression(node))
  return angularStyleExpression(boundExpression(node))
}
