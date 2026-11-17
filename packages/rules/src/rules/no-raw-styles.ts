import type { Rule } from 'eslint'

import {
  nearestColor,
  nearestLength,
  spaceStep,
  type NearestAmount,
  type TokenValues,
} from '../stylelint/catalogue.js'
import { either, fit, MESSAGE_LIMIT, ZONE } from './advice'
import {
  angularElementName,
  angularMember,
  angularSelector,
  BINDING,
  boundEntries,
  componentStringOf,
  boundString,
  elementOfAttribute,
  isAngularFile,
  isAngularPart,
  isPlainAngularElement,
  removeAngularAttribute,
  reportedTemplate,
  startTagLoc,
  withAngularTemplate,
  writtenName,
  type AngularBoundAttribute,
  type AngularElement,
  type AngularExpression,
  type AngularNode,
  type AngularTextAttribute,
} from './angular'
import { removeAttribute, shadowedAt } from './fix'
import {
  elementName,
  hostedLibraries,
  insideBespoke,
  insideThirdParty,
  isPackageSpecifier,
  isSolidFile,
  ownPackage,
  THIRD_PARTY_ELEMENT,
  thirdPartyBoundaries,
  thirdPartySpan,
  type JsxAttribute,
  type JsxOpeningElement,
  type ThirdPartyBoundary,
} from './jsx'
import {
  badgeClass,
  BOX_MEMBERS,
  classDeclarations,
  cssProperty,
  ELEMENT_MEMBERS,
  INLINE_ADVICE,
  marginAdvice,
  namesButton,
  readLayout,
  unmappedAdvice,
  type Declaration,
} from './layout'
import {
  angularStyle,
  cssText,
  jsxStyle,
  svelteDirectiveStyle,
  svelteStyle,
  vueStyle,
  type LiftedStyle,
} from './lifted-style'
import { findRawColour, findRawValue, refusedColour } from './raw-values'
import {
  attributeText,
  bracedExpression,
  directiveText,
  elementOfTag,
  isPlainSvelteElement,
  removeSvelteAttribute,
  reportedMarkup,
  svelteElementName,
  svelteImports,
  withMarkup,
  type SvelteAttribute,
  type SvelteDirective,
  type SvelteLiteral,
  type SvelteNode,
  type SvelteShorthandAttribute,
  type SvelteStyleDirective,
} from './svelte'
import {
  boundName,
  importsOf,
  isPlainVueElement,
  removeVueAttribute,
  reported,
  reporterFor,
  vueElementName,
  withTemplate,
  type VueAttribute,
  type VueExpression,
  type VueLiteral,
} from './vue'

/**
 * Stage 1: application code cannot express a style.
 *
 * `style`/`css` props and a `className` are ways a screen re-makes a decision
 * that was already made. Raw colour and length literals are the other. All are
 * suspended inside a declared `<Bespoke>` zone (the exception ladder,
 * `docs/rules.md`), and nowhere else, except a `className` on a member, which
 * stays red inside a zone too.
 *
 * **A `<ThirdParty>` boundary** lifts a `style`, a class and a raw length on
 * what is not a member, when it hosts its library (`jsx.ts`). One that hosts
 * nothing is reported here, on its own tag, and what it holds is read as if it
 * were not there: it writes no `library` out, or it names what the file
 * imports no binding from. A boundary that lifted the bans by being written
 * would be a zone with a library's name on it, and the inventory would list a
 * library the file does not use.
 *
 * Inside a boundary that hosts, a part of a member (`<Table.Row>`,
 * `<Tabs.Content>`) is read as the member is: its `style` and its class are
 * removed. The boundary lifts them on what the library draws, and a part is
 * drawn by the vocabulary. A dotted name whose root is no member
 * (`<Leaflet.MapContainer>`) is the library's own. Outside a boundary a part
 * is read as it was: its class is left alone and its `style` is reported.
 *
 * A `style` the boundary lifts still writes no colour. A raw colour a pattern
 * names (`#hex`, `rgb()`) is reported wherever it is written, and each
 * declaration of the lifted `style` is read for any other (`refusedColour` in
 * `raw-values.ts`): a property that takes a colour takes a custom property
 * read, a keyword that names no colour, or a value computed where it is
 * written, such as one from `useThemeValues()`. The `style` is read through
 * casts, conditionals, spreads and CSS text with holes (`lifted-style.ts`),
 * and one whose property names are not written out (`style={styles}`) is
 * refused, because its colours cannot be read.
 *
 * **What it says.** Each report names its answer for what was written. A raw
 * colour names the nearest colour role by value, and a raw length the nearest
 * space step and the layout prop that carries it, when the config passes the
 * theme's `values` (`tokenValues` in `@polymorph/rules/stylelint/emitted`). A
 * `style` object is read declaration by declaration into the layout primitive
 * and props that replace it, and a `className` of utility classes the same way.
 *
 * **What it fixes.** A `className`, `style` or `css` on a vocabulary component
 * is removed. No member accepts them, because each destructures the props it
 * declares and drops the rest. The attribute already has no effect, so removing
 * it changes no pixel. The same prop on a plain element does have an effect, and
 * replacing it is a decision (a variant, a layout primitive, a zone), so it is
 * reported with the rewrite it reads as and left unchanged.
 *
 * **In a Vue template** the same rule reads `class` and `style`, static or
 * bound (`:class`, `:style`): on a member they are removed, because a Vue
 * member declares no `class` and inherits no attributes; a `class` on a plain
 * element and a `style` on anything else are reported with the same answers.
 * A raw colour or length in a bound expression or a static attribute is
 * reported as in TSX. A report on a `.vue` file writes its answer in template
 * syntax (`<Inline :gap="4">`).
 *
 * **In Svelte markup** it reads `class` and `style`, static, in braces or
 * shorthand (`{class}`), as the template's: a member's is removed, a `class`
 * on a plain element and a `style` on anything else are reported. A
 * `class:active` directive on a plain element and a `style:padding` directive
 * are reported too, and a raw value in a static attribute (`<Stack
 * gap="12px">`) as in TSX. Its answers are written as JSX writes them, which
 * is Svelte's syntax for a prop.
 *
 * **In Solid TSX** (`isSolidFile`) `class` and `classList` are class props,
 * read as `className` is. A React file's `class` is left as it was, so the
 * rule fails no React code it passed before. A `style` may be a string
 * (`style="padding: 12px"`), read declaration by declaration, in either.
 *
 * **In an Angular template** it reads `class` and `style` in each of Angular's
 * spellings: static, bound whole (`[class]`, `[style]`, `[attr.class]`,
 * `[ngClass]`, `[ngStyle]`) and one at a time (`[class.active]`,
 * `[style.padding.px]`). A static one on a member (`<pm-button>`) is removed,
 * because it is outside the member's contract and removal is its one lawful
 * answer: the host draws no box, and what it lands on there is not design. A
 * bound one on a member, or any on a part drawn as its own element
 * (`<tr pmTableRow>`), is reported and left, because it can still reach the
 * element. A class on a
 * plain element and a style on anything that is not a member are reported with
 * what they read as, and a raw value in a static attribute or a bound string as
 * in TSX. Its answers are written in template syntax (`<pm-inline [gap]="4">`).
 */

interface Options {
  /** Modules whose exports are governed components. */
  vocabularyModules?: string[]
  /** Props that express style directly. */
  styleProps?: string[]
  /**
   * The theme's values, so a raw colour or length is reported with the nearest
   * token. Without them the report names the token family instead of the step.
   */
  values?: TokenValues
}

/**
 * The vocabularies whose members a file names by an imported binding. An
 * Angular template names a member by its selector instead, so
 * `@polymorph/angular-ui` is not here.
 */
const DEFAULT_VOCABULARY = [
  '@polymorph/react-ui',
  '@polymorph/vue-ui',
  '@polymorph/svelte-ui',
  '@polymorph/solid-ui',
]
const DEFAULT_STYLE_PROPS = ['style', 'css']

/** The props that give an element classes: React's `className`, and Solid's `class` and `classList`. */
const CLASS_PROPS = new Set(['className', 'class', 'classList'])

interface AstNode {
  type: string
  [key: string]: unknown
}

/**
 * The member a type step belongs to. Text has two sizes; the larger steps are
 * headings, and the largest are an opener's title.
 */
export const TYPE_MEMBERS: Record<string, string> = {
  'text-xs': '`<Text size="sm">`',
  'text-sm': '`<Text size="sm">`',
  'text-md': '`<Text>`',
  'text-lg': '`<Heading level={3}>`',
  'text-xl': '`<Heading level={2}>`',
  'text-2xl': '`<PageHeader title="…">`',
  'text-3xl': '`<PageHeader title="…">`',
  'display-sm': '`<Hero title="…">`',
  'display-md': '`<Hero title="…">`',
  'display-lg': '`<Hero title="…">`',
}

/**
 * Text written with utility classes, as `Text` or `Heading`: `text-sm
 * text-gray-500` on a `<p>` is `<Text size="sm" tone="secondary">`. `null`
 * when the classes say nothing about type.
 */
function textMember(element: string, classes: string): string | null {
  const names = classes.split(/\s+/).map((name) => name.slice(name.lastIndexOf(':') + 1))
  const size = names.map((name) => /^text-(xs|sm|base|lg|[2-9]?xl)$/.exec(name)?.[1]).find(Boolean)
  const muted = names.some((name) =>
    /^text-((gray|slate|zinc|neutral|stone)-[4-6]00|muted|secondary)$/.test(name),
  )
  const heading = /^h[1-6]$/.test(element)
  if (size === undefined && !muted && !names.some((name) => /^font-/.test(name))) return null

  if (heading || (size !== undefined && /^([2-9]?xl|lg)$/.test(size))) {
    if (element === 'h1' || (size !== undefined && /^[2-9]xl$/.test(size))) {
      return '`<PageHeader title="…">`'
    }
    const level = element.startsWith('h')
      ? Math.min(4, Math.max(2, Number(element[1])))
      : size === 'lg'
        ? 3
        : 2
    return `\`<Heading level={${level}}>\``
  }
  const props = [
    ...(size === 'xs' || size === 'sm' ? [' size="sm"'] : []),
    ...(muted ? [' tone="secondary"'] : []),
  ]
  return `\`<Text${props.join('')}>\``
}

/**
 * The classes a text reading is about, at most four, as written: the type and
 * colour classes when there are any, so a long list is quoted by what was read.
 */
function typeClasses(classes: string): string {
  const all = classes.trim().split(/\s+/)
  const read = all.filter((written) =>
    /^(text|font|leading|tracking)-/.test(written.slice(written.lastIndexOf(':') + 1)),
  )
  return (read.length > 0 ? read : all).slice(0, 4).join(' ')
}

/**
 * The page's root elements. The theme styles them: the pairing's attributes on
 * `<html>` set the page's fonts and colours, so a class there re-makes that
 * decision for every screen.
 */
const ROOT_ELEMENTS = new Set(['html', 'body'])

/** The nearest token, named: `It is …`, `Nearest is … (12px)`, or both steps on a tie. */
function nearestCalled(near: NearestAmount): string {
  if (near.also) {
    return `It is between \`${near.name}\` (${near.value}) and \`${near.also.name}\` (${near.also.value})`
  }
  return near.exact ? `It is \`${near.name}\`` : `Nearest is \`${near.name}\` (${near.value})`
}

/** Who sets a size token: a control's `size` step, or the icon's. */
function sizeCarrier(name: string): string {
  const step = name.slice(name.lastIndexOf('-') + 1)
  return name.startsWith('--pm-icon-size-')
    ? `which \`<Icon size="${step}">\` draws`
    : `which a control's \`size="${step}"\` sets`
}

/** `` `display`, `gap` and `padding` ``, shortened past four. */
function carriedList(carried: readonly string[]): string {
  const named = carried.map((written) => `\`${written}\``)
  return named.length > 4
    ? `${named.slice(0, 3).join(', ')} and ${named.length - 3} more`
    : either(named, 'and')
}

/** The element's name as written, `motion.div` included. */
function sourceName(
  sourceCode: Rule.RuleContext['sourceCode'],
  opening: JsxOpeningElement,
): string {
  return sourceCode.getText(opening.name as unknown as Rule.Node)
}

/** A key in a style object or an attribute name, as the CSS property it sets. */
function propertyOf(node: Rule.Node): string | undefined {
  // `<pm-stack gap="12px">`, or `[gap]="'12px'"`, in an Angular template.
  const angular = angularBinding(node as unknown as AstNode)
  if (angular !== null) return cssProperty(angular.name)
  const parent = node.parent as unknown as AstNode | undefined
  if (parent?.type === 'Property' && parent['value'] === node) {
    const key = parent['key'] as { type: string; name?: string; value?: unknown }
    const name = key.type === 'Identifier' ? key.name : key.type === 'Literal' ? key.value : null
    return typeof name === 'string' ? cssProperty(name) : undefined
  }
  if (parent?.type === 'JSXAttribute') {
    const name = (parent['name'] as { name?: unknown }).name
    return typeof name === 'string' ? cssProperty(name) : undefined
  }
  if (parent?.type === 'VAttribute') {
    const name = boundName(parent as unknown as VueAttribute)
    return name === null ? undefined : cssProperty(name)
  }
  // `<Stack gap="12px">`, or `gap={'12px'}`, in Svelte markup.
  const attribute =
    parent?.type === 'SvelteMustacheTag' ? (parent['parent'] as AstNode | undefined) : parent
  if (attribute?.type === 'SvelteAttribute') {
    return cssProperty((attribute as unknown as SvelteAttribute).key.name)
  }
  return undefined
}

/**
 * The attribute or binding an Angular template's static attribute or bound
 * string is the value of, or `null` outside a template.
 */
function angularBinding(node: AstNode): AngularTextAttribute | AngularBoundAttribute | null {
  if (node.type === 'TextAttribute') return node as unknown as AngularTextAttribute
  if (node.type !== 'LiteralPrimitive') return null
  let ancestor = node['parent'] as AstNode | undefined
  while (ancestor !== undefined && ancestor !== null && ancestor.type !== 'BoundAttribute') {
    if (ancestor.type === 'Element' || ancestor.type === 'BoundEvent') return null
    ancestor = ancestor['parent'] as AstNode | undefined
  }
  return (ancestor as unknown as AngularBoundAttribute | undefined) ?? null
}

/** How an Angular attribute or binding styles its element, or `null` when it does not. */
interface AngularStyling {
  kind: 'class' | 'style'
  /** As written: `class`, `[class.active]`, `[ngStyle]`. */
  written: string
  /** Whether it is static, which a member strips. */
  bound: boolean
  /** Written whole (`class`, `[class]`, `style`, `[ngStyle]`) or one at a time (`[class.active]`). */
  whole: boolean
}

/** The class bindings that name the whole class list, and the style bindings that name the whole style. */
const ANGULAR_CLASS_INPUTS = new Set(['class', 'className', 'ngClass'])
const ANGULAR_STYLE_INPUTS = new Set(['style', 'ngStyle'])

function angularStyling(
  sourceCode: Rule.RuleContext['sourceCode'],
  node: AngularTextAttribute | AngularBoundAttribute,
): AngularStyling | null {
  const written = writtenName(sourceCode, node)
  if (node.type === 'TextAttribute') {
    if (node.name !== 'class' && node.name !== 'style') return null
    return { kind: node.name, written, bound: false, whole: true }
  }
  const type = node.__originalType
  if (type === BINDING.class) return { kind: 'class', written, bound: true, whole: false }
  if (type === BINDING.style) return { kind: 'style', written, bound: true, whole: false }
  if (type !== BINDING.property && type !== BINDING.attribute) return null
  if (ANGULAR_CLASS_INPUTS.has(node.name))
    return { kind: 'class', written, bound: true, whole: true }
  if (ANGULAR_STYLE_INPUTS.has(node.name))
    return { kind: 'style', written, bound: true, whole: true }
  return null
}

/** The classes an Angular class attribute or binding names, or `null` when they are computed. */
function angularClassText(node: AngularTextAttribute | AngularBoundAttribute): string | null {
  if (node.type === 'TextAttribute') return node.value
  if (node.__originalType === BINDING.class) return node.name
  const text = boundString(node)
  if (text !== null) return text
  const entries = boundEntries(node)
  return entries === null ? null : entries.map((entry) => entry.key).join(' ')
}

/** The declarations an Angular style attribute or binding writes, or `null` when they are computed. */
function angularStyleDeclarations(
  node: AngularTextAttribute | AngularBoundAttribute,
): Declaration[] | null {
  if (node.type === 'TextAttribute') return cssDeclarations(node.value)
  const withUnit = (key: string, value: string | number | null) => {
    const [name, unit] = key.split('.') as [string, string | undefined]
    const property = cssProperty(name)
    const written = value === null ? null : unit === undefined ? value : `${value}${unit}`
    return { property, value: written, written: name }
  }
  if (node.__originalType === BINDING.style) {
    const expression = (node.value as AngularExpression)['ast'] as AngularExpression | undefined
    const literal =
      expression?.type === 'LiteralPrimitive' &&
      (typeof expression['value'] === 'string' || typeof expression['value'] === 'number')
        ? (expression['value'] as string | number)
        : null
    return [withUnit(node.unit === null ? node.name : `${node.name}.${node.unit}`, literal)]
  }
  const text = boundString(node)
  if (text !== null) return cssDeclarations(text)
  return boundEntries(node)?.map((entry) => withUnit(entry.key, entry.value)) ?? null
}

/** A string written out: a string literal, or a template literal with no holes. */
function stringText(expression: AstNode | null | undefined): string | null {
  if (expression?.type === 'Literal' && typeof expression['value'] === 'string') {
    return expression['value']
  }
  if (
    expression?.type === 'TemplateLiteral' &&
    (expression['expressions'] as unknown[]).length === 0
  ) {
    const [quasi] = expression['quasis'] as { value: { cooked: string } }[]
    return quasi?.value.cooked ?? null
  }
  return null
}

/**
 * The declarations of a style written as CSS text: `padding: 12px; display:
 * flex`. A name may hold a digit or an underscore (`--c1-color`), and a `;`
 * inside parentheses or quotes ends no declaration.
 */
function cssDeclarations(text: string): Declaration[] {
  return cssText(text).declarations
}

/**
 * The literal declarations of a JSX `style`: a `style={{ … }}` object, or a
 * string (`style="padding: 12px"`, as Solid writes one). `null` when it is
 * neither.
 */
function styleDeclarations(attribute: Rule.Node): Declaration[] | null {
  const value = (attribute as unknown as AstNode)['value'] as AstNode | null
  const written = stringText(value)
  if (written !== null) return cssDeclarations(written)
  const expression =
    value?.type === 'JSXExpressionContainer' ? (value['expression'] as AstNode) : null
  const text = stringText(expression)
  return text !== null ? cssDeclarations(text) : objectDeclarations(expression)
}

/**
 * A Vue `style`: the declarations of a static `style="padding: 12px"`, or of the
 * object a `:style="{ padding: '12px' }"` binds.
 */
function vueStyleDeclarations(attribute: VueAttribute): Declaration[] | null {
  if (attribute.directive) {
    return objectDeclarations(
      ((attribute.value as VueExpression | null)?.expression ?? null) as AstNode | null,
    )
  }
  return cssDeclarations((attribute.value as VueLiteral | null)?.value ?? '')
}

/**
 * A Svelte `style`: the declarations of its static text, or of a string given
 * in braces. `null` when it is built from an expression.
 */
function svelteStyleDeclarations(attribute: SvelteNode): Declaration[] | null {
  const text = attributeText(attribute) ?? stringText(bracedExpression(attribute) as AstNode | null)
  return text === null ? null : cssDeclarations(text)
}

/** A `style:padding` directive, as the one declaration it is. */
function directiveDeclarations(directive: SvelteStyleDirective): Declaration[] {
  const property = (directive.key.name.name ?? '').toLowerCase()
  // `style:color` with no value reads the variable of that name.
  const value =
    directive.value.length === 0
      ? null
      : (attributeText(directive) ?? stringText(bracedExpression(directive) as AstNode | null))
  return [{ property, value, written: property }]
}

/** The literal declarations in an object expression, or `null` when it is not one. */
function objectDeclarations(object: AstNode | null): Declaration[] | null {
  if (object?.type !== 'ObjectExpression') return null

  const declarations: Declaration[] = []
  for (const property of object['properties'] as AstNode[]) {
    if (property.type !== 'Property' || property['computed']) continue
    const key = property['key'] as { type: string; name?: string; value?: unknown }
    const written = key.type === 'Identifier' ? key.name : key.value
    if (typeof written !== 'string') continue
    const value = property['value'] as { type: string; value?: unknown }
    const literal =
      value.type === 'Literal' &&
      (typeof value.value === 'string' || typeof value.value === 'number')
        ? value.value
        : null
    declarations.push({ property: cssProperty(written), value: literal, written })
  }
  return declarations
}

/**
 * A class prop's text, when it is written out: a string, or a template with no
 * holes. A `classList` object's classes are its keys: `{{ 'flex gap-2': on }}`
 * reads `flex gap-2`.
 */
function classText(attribute: Rule.Node, prop: string): string | null {
  const value = (attribute as unknown as AstNode)['value'] as AstNode | null
  const expression =
    value?.type === 'JSXExpressionContainer' ? (value['expression'] as AstNode) : null
  if (prop === 'classList') return classListText(expression)
  return stringText(value) ?? stringText(expression)
}

/** The classes a `classList` object names, or `null` when a key is computed. */
function classListText(object: AstNode | null): string | null {
  if (object?.type !== 'ObjectExpression') return null
  const names: string[] = []
  for (const property of object['properties'] as AstNode[]) {
    if (property.type !== 'Property' || property['computed']) return null
    const key = property['key'] as { type: string; name?: string; value?: unknown }
    const name = key.type === 'Identifier' ? key.name : key.value
    if (typeof name !== 'string') return null
    names.push(name)
  }
  return names.join(' ')
}

/** A Vue `class`'s text: the static value, or a bound string with no holes. */
function vueClassText(attribute: VueAttribute): string | null {
  if (!attribute.directive) return (attribute.value as VueLiteral | null)?.value ?? ''
  return stringText((attribute.value as VueExpression | null)?.expression as AstNode | null)
}

/** A Svelte `class`'s text: the static value, or a string given in braces. */
function svelteClassText(attribute: SvelteNode): string | null {
  return attributeText(attribute) ?? stringText(bracedExpression(attribute) as AstNode | null)
}

export const noRawStyles: Rule.RuleModule = {
  meta: {
    type: 'problem',
    fixable: 'code',
    docs: {
      description:
        'Application code composes the vocabulary and binds content; it does not express style.',
    },
    schema: [
      {
        type: 'object',
        properties: {
          vocabularyModules: { type: 'array', items: { type: 'string' } },
          styleProps: { type: 'array', items: { type: 'string' } },
          values: { type: 'object' },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      deadProp:
        'Unexpected `{{prop}}` on <{{component}}>. Members take no `{{prop}}`, so it does ' +
        'nothing, and the fix removes it.',
      memberProp:
        'Unexpected `{{prop}}` on <{{component}}>, a name the vocabulary governs. Members take ' +
        'no `{{prop}}`: use its own props, or a `<Bespoke reason="…">` zone.',
      // A zone never lifts a class prop on a member, so it is not offered.
      memberClass:
        'Unexpected `{{prop}}` on <{{component}}>, a name the vocabulary governs. Members take ' +
        'no `{{prop}}`: set the member\'s own `variant="…"`, `tone="…"` or `size="…"` (rung 1).',
      styleProp: 'Unexpected `{{prop}}` on <{{element}}>. {{advice}}',
      className: 'Unexpected `className` on <{{element}}>. {{advice}}',
      classAttribute: 'Unexpected `class` on <{{element}}>. {{advice}}',
      classList: 'Unexpected `classList` on <{{element}}>. {{advice}}',
      classDirective: 'Unexpected `{{directive}}` on <{{element}}>. {{advice}}',
      styleDirective: 'Unexpected `{{directive}}` on <{{element}}>. {{advice}}',
      rawColor: 'Unexpected colour `{{text}}`. {{advice}}',
      rawLength: 'Unexpected length `{{text}}`. {{advice}}',
      // The boundary found is written bare. The one to write is the span.
      unnamedBoundary:
        'Unexpected <{{element}}> with no `library` written out. It lifts nothing until it ' +
        'names the package it hosts: {{boundary}} (rung 4).',
      unhostedBoundary: 'Unexpected <{{element}} library="{{library}}">. {{advice}}',
      // What was written is in a span no answer has the shape of.
      unreadStyle:
        'Unexpected `{{prop}}` whose property names are not written out. Inside <{{boundary}}> ' +
        'a `style` is read for colour, so write it in place, as an object or as text (rung 4).',
    },
  },

  create(context) {
    const options = (context.options[0] ?? {}) as Options
    const vocabularyModules = options.vocabularyModules ?? DEFAULT_VOCABULARY
    const styleProps = new Set(options.styleProps ?? DEFAULT_STYLE_PROPS)
    const values = options.values
    const governedComponents = new Set<string>()
    // In a `.vue` file a report's answer is written in template syntax.
    const report = reporterFor(context, noRawStyles.meta?.messages)

    /** The names an import brings in from a vocabulary module. */
    function govern(
      source: string,
      specifiers: readonly { type: string; local: { name: string } }[],
    ) {
      if (
        !vocabularyModules.some((module) => source === module || source.startsWith(`${module}/`))
      ) {
        return
      }
      for (const specifier of specifiers) {
        if (specifier.type === 'ImportSpecifier' || specifier.type === 'ImportDefaultSpecifier') {
          governedComponents.add(specifier.local.name)
        }
      }
    }

    // Svelte markup may come before the script that imports its members.
    for (const declaration of svelteImports(context)) {
      govern(String(declaration.source.value), declaration.specifiers)
    }

    /**
     * Whether a string is a whole `style` written as text: `style="…"` in
     * Svelte or JSX, a string in braces, or a `style:` directive's value. The
     * style's report reads it declaration by declaration, so its raw values
     * are not reported again.
     */
    /**
     * Inside either rung-4 boundary, where a `style` or a class may be written
     * on what is not a member: a zone's one-off composition, and the element
     * that sizes another library's component.
     */
    const insideZone = (node: Rule.Node): boolean =>
      insideBespoke(context, node) || insideThirdParty(context, node)

    /** A file that hosts another library hands it the theme as data. */
    const hosts = hostedLibraries(context).length > 0

    /**
     * The member a dotted name is a part of (`Table` for `Table.Row`), when
     * the part is inside a boundary around another library's component, or
     * `null`. There a part keeps the ban a member has.
     */
    function hostedPartOf(written: string, node: Rule.Node): string | null {
      const dot = written.indexOf('.')
      if (dot === -1) return null
      const root = written.slice(0, dot)
      return governedComponents.has(root) && insideThirdParty(context, node) ? root : null
    }

    /** Where a boundary's own tag is: its start tag, or the tag in a component's template. */
    function boundaryLoc(boundary: ThirdPartyBoundary): NonNullable<Rule.Node['loc']> {
      const { node, property, range } = boundary
      if (node === null) {
        if (range === null) return (property as unknown as Rule.Node).loc as never
        return {
          start: context.sourceCode.getLocFromIndex(range[0]),
          end: context.sourceCode.getLocFromIndex(range[1]),
        }
      }
      if (node.type === 'Element') {
        return startTagLoc(context, node as unknown as AngularElement)
      }
      const tag = (node['openingElement'] ?? node['startTag'] ?? node) as unknown as Rule.Node
      return tag.loc as never
    }

    /**
     * Each `<ThirdParty>` that hosts nothing, reported on its own tag.
     *
     * An Angular component's boundary is read twice: by its template's pass,
     * and by the module, from the template's text. Only the module sees the
     * imports, so it reports the boundary whose package it imports no binding
     * from, on the tag in an inline template or on `templateUrl`. Every other
     * case is the template's to report: no name, a name that is no package,
     * and a package no boundary can host (`ownPackage`).
     */
    function reportBoundaries(): void {
      const element = isAngularFile(context)
        ? angularSelector(THIRD_PARTY_ELEMENT)
        : THIRD_PARTY_ELEMENT
      for (const boundary of thirdPartyBoundaries(context)) {
        if (boundary.hosts) continue
        const named = boundary.library !== null && isPackageSpecifier(boundary.library)
        const own = boundary.library !== null && named ? ownPackage(boundary.library) : null
        if (boundary.node === null && (!named || own !== null)) continue
        const loc = boundaryLoc(boundary)
        if (boundary.library === null) {
          report({
            loc,
            messageId: 'unnamedBoundary',
            data: { element, boundary: thirdPartySpan('…') },
          })
          continue
        }
        const why =
          own === 'polymorph'
            ? "That is polymorph's own package"
            : own === 'framework'
              ? "That is the framework's own runtime"
              : named
                ? 'This file imports no binding from it'
                : 'That names no package'
        const advice =
          `${why}, so it lifts nothing: name the package the hosted component is imported ` +
          'from (rung 4).'
        // Quoted bare, so it can close no code span, and cut so the report fits.
        const library = boundary.library.replace(/`/g, "'")
        const room = MESSAGE_LIMIT - 1 - `Unexpected <${element} library="">. ${advice}`.length
        report({
          loc,
          messageId: 'unhostedBoundary',
          data: {
            element,
            library: library.length > room ? `${library.slice(0, room - 1)}…` : library,
            advice,
          },
        })
      }
    }

    function wholeStyle(node: Rule.Node): boolean {
      // A string an Angular class or style binding is given is read whole by its report.
      const angular = angularBinding(node as unknown as AstNode)
      if (angular !== null) return angularStyling(context.sourceCode, angular) !== null
      let written = node as unknown as AstNode
      if (written.type === 'TemplateElement') {
        const template = written['parent'] as AstNode
        if ((template['expressions'] as unknown[]).length > 0) return false
        written = template
      }
      let parent = written['parent'] as AstNode | undefined
      if (parent?.type === 'JSXExpressionContainer' || parent?.type === 'SvelteMustacheTag') {
        parent = parent['parent'] as AstNode | undefined
      }
      if (parent?.type === 'SvelteStyleDirective') return true
      if (parent?.type === 'SvelteAttribute') {
        return styleProps.has((parent as unknown as SvelteAttribute).key.name)
      }
      if (parent?.type === 'JSXAttribute') {
        const name = (parent['name'] as { name?: unknown }).name
        return typeof name === 'string' && styleProps.has(name)
      }
      return false
    }

    /** A colour: the nearest role by value, or the role families. */
    function colourAdvice(head: string, text: string, property: string | undefined): string {
      const near = nearestColor(text, values?.color, property)
      if (hosts) {
        return fit(head, [
          near === null
            ? "A hosted library's colours are the theme's: read a role from `useThemeValues()`, " +
              'or write `var(--pm-…)` in a `style` (rung 4).'
            : `Its nearest role is \`${near.names[0]}\` (${near.value}): read that role from ` +
              `\`useThemeValues()\` for the library, or write \`var(${near.names[0]})\` in a \`style\`.`,
        ])
      }
      if (near === null) {
        return fit(head, [
          'Colours are role tokens (`--pm-text-*`, `--pm-bg-*`, `--pm-accent-*`): set a ' +
            `member's \`tone="…"\`, or read one inside a ${ZONE} zone.`,
        ])
      }
      const [first] = near.names
      const roles = either(near.names.map((name) => `\`${name}\``))
      return fit(head, [
        `Its nearest role is ${roles} (${near.value}): set a member's \`tone="…"\` to paint it, or ` +
          `read \`var(${first})\` inside \`<Bespoke>\`.`,
      ])
    }

    /** A length: the nearest step of the family its property draws from, and who carries it. */
    function lengthAdvice(head: string, text: string, property: string | undefined): string {
      const near = nearestLength(text, values, property)
      const called = near && nearestCalled(near)

      if (property !== undefined && /radius/.test(property)) {
        // Both steps on a tie, as the union the patch's type accepts.
        const steps = [near?.name, near?.also?.name]
          .flatMap((name) => (name ? [`'${name.replace('--pm-radius-', '')}'`] : []))
          .join(' | ')
        return fit(head, [
          steps
            ? `${called}: a member's radius is the theme's, and \`<Card patch={{ radius: ${steps} }}>\` re-assigns one (rung 3).`
            : `Radii are \`--pm-radius-*\` steps: a member's radius is the theme's, and \`<Card patch={{ radius }}>\` re-assigns one (rung 3).`,
        ])
      }
      if (property === 'font-size' || property === 'font') {
        const memberOf = (name: string) => {
          const step = /^--pm-(text|display)-([a-z0-9]+)-size$/.exec(name)
          return step ? TYPE_MEMBERS[`${step[1]}-${step[2]}`] : undefined
        }
        const members = [
          ...new Set(
            [near?.name, near?.also?.name].flatMap((name) => (name ? (memberOf(name) ?? []) : [])),
          ),
        ]
        return fit(head, [
          members.length > 0
            ? `${called}: write ${either(members)} (rung 1).`
            : 'Type sizes are `--pm-text-*-size` steps: `<Text size="sm">`, `<Text>` and ' +
              '`<Heading level={3}>` set them (rung 1).',
        ])
      }
      if (
        property !== undefined &&
        /^(border|outline)(-(top|right|bottom|left|width))?$/.test(property)
      ) {
        return fit(head, [
          "A border is a member's own: `<Card>` draws one and `<Separator>` divides (rung 1).",
        ])
      }
      if (property !== undefined && /shadow$/.test(property)) {
        return fit(head, [
          "A shadow is the theme's depth: `<Card>` is raised by it (rung 1), and one-off depth goes " +
            `in a ${ZONE} zone.`,
        ])
      }
      if (property !== undefined && /(width|height|size)$/.test(property)) {
        return fit(head, [
          near && !near.name.startsWith('--pm-space-')
            ? `${called}, ${sizeCarrier(near.name)} (rung 1).`
            : `No token is a fixed size: members size to their content, \`<Grid columns={…}>\` sets tracks, and a fixed size goes in \`<Bespoke>\`.`,
        ])
      }

      const step = near ? spaceStep(near.name) : null
      // A negative length overlaps its neighbours, and no layout prop takes one.
      if (near?.negative && step !== null) {
        return fit(head, [
          `It is space step ${step} negated, an overlap no layout prop makes: read ` +
            `\`${near.name}\` negated inside a ${ZONE} zone (rung 4).`,
        ])
      }
      const other = near?.also ? spaceStep(near.also.name) : null
      const steps =
        step === null ? ['…'] : other === null ? [String(step)] : [String(step), String(other)]
      const names = /^padding-(inline|left|right)/.test(property ?? '')
        ? ['px']
        : /^padding-(block|top|bottom)/.test(property ?? '')
          ? ['py']
          : property === 'padding'
            ? ['p']
            : /^(row-|column-)?gap$|^margin/.test(property ?? '')
              ? ['gap']
              : ['gap', 'p', 'px', 'py']
      // One prop is written once per step; four props at two steps each would
      // not fit, so they take the step the author picks.
      const props =
        names.length === 1
          ? steps.map((n) => `${names[0]}={${n}}`)
          : names.map((name) => `${name}={${steps.length === 1 ? steps[0] : '…'}}`)
      const where = /^margin/.test(property ?? '')
        ? "on the parent's `<Stack>` or `<Inline>`, since a margin is the parent's gap"
        : 'on `<Stack>`, `<Inline>` or `<Grid>`'
      const lead =
        step === null
          ? 'Space is a `--pm-space-*` step'
          : other !== null
            ? `Steps ${step} and ${other} (\`${near?.name}\`, \`${near?.also?.name}\`) are equally near`
            : near?.exact
              ? `It is space step ${step} (\`${near.name}\`)`
              : `The nearest space step is ${step} (\`${near?.name}\`, ${near?.value})`
      return fit(head, [`${lead}: write ${either(props.map((prop) => `\`${prop}\``))} ${where}.`])
    }

    function reportRawText(node: Rule.Node, text: string): void {
      let hit = findRawValue(text)
      if (!hit) return
      if (insideBespoke(context, node)) return
      if (insideThirdParty(context, node)) {
        // A boundary around another library's component sizes it, so a length
        // is lifted there, and so is a whole `style`. A colour is not, in a
        // `style` or anywhere else: the theme gives it as data.
        hit = hit.kind === 'colour' ? hit : findRawColour(text)
        if (!hit) return
      } else if (wholeStyle(node)) return
      const property = propertyOf(node)
      const messageId = hit.kind === 'colour' ? 'rawColor' : 'rawLength'
      const head = `Unexpected ${hit.kind === 'colour' ? 'colour' : 'length'} \`${hit.text}\`.`
      const advice =
        hit.kind === 'colour'
          ? colourAdvice(head, hit.text, property)
          : lengthAdvice(head, hit.text, property)
      report({ node, messageId, data: { text: hit.text, advice } })
    }

    /**
     * A `style` where a zone or a boundary lifts it. A zone lifts it whole. A
     * boundary around another library's component does not lift a colour, so
     * each declaration is read for a colour no pattern names, and a `style`
     * whose property names are not written out is refused, because its
     * colours cannot be read. A colour a pattern names is reported where its
     * string is, by `reportRawText`.
     */
    function reportLiftedStyle(node: Rule.Node, prop: string, style: LiftedStyle): void {
      if (insideBespoke(context, node)) return
      if (style.unread) {
        const boundary = isAngularFile(context)
          ? angularSelector(THIRD_PARTY_ELEMENT)
          : THIRD_PARTY_ELEMENT
        report({ node, messageId: 'unreadStyle', data: { prop, boundary } })
      }
      for (const { property, value } of style.declarations) {
        if (typeof value !== 'string' || findRawColour(value)) continue
        const refused = refusedColour(property, value)
        if (refused === null) continue
        const head = `Unexpected colour \`${refused}\`.`
        report({
          node,
          messageId: 'rawColor',
          data: { text: refused, advice: colourAdvice(head, refused, property) },
        })
      }
    }

    /** What replaces a `style` on a plain element, read from the object it was given. */
    function styleAdvice(head: string, declarations: Declaration[] | null): string {
      if (declarations === null || declarations.length === 0) {
        return fit(head, [
          `Compose ${BOX_MEMBERS} with their spacing props (rung 1), or declare a ${ZONE} zone.`,
        ])
      }
      const reading = readLayout(declarations, values)
      const margin = marginAdvice(reading)
      if (reading.replacement === null) {
        // A declaration that only means something next to others (`flexWrap`
        // alone) gives no specific answer, so the general one stands.
        const specific = [margin, unmappedAdvice(reading)].filter((sentence) => sentence !== '')
        return fit(
          head,
          specific.length > 0
            ? specific
            : [
                `Compose ${BOX_MEMBERS} with their spacing props (rung 1), or declare a ${ZONE} zone.`,
              ],
        )
      }
      return fit(head, [
        `${carriedList(reading.carried)} ${reading.carried.length > 1 ? 'are' : 'is'} ` +
          `${reading.replacement} (rung 1).`,
        unmappedAdvice(reading),
        margin,
      ])
    }

    /** What a `className` on a plain element reads as: its utility classes, or the element's role. */
    function classAdvice(head: string, element: string, classes: string | null): string {
      const zone = `One-off styling goes in a ${ZONE} zone.`
      if (ROOT_ELEMENTS.has(element)) {
        return fit(head, [
          "The theme styles the page's root: the pairing on <html> sets its fonts and colours, " +
            'and `<AppShell>` frames the app (rung 1), so the class can go.',
        ])
      }
      if (element === 'span') {
        const badge = classes === null ? null : badgeClass(classes)
        if (badge !== null) {
          return fit(head, [
            `\`${badge}\` reads as \`<Badge>\` (rung 1); its \`tone\` and \`variant\` set the colour.`,
          ])
        }
      }
      const role = Object.hasOwn(ELEMENT_MEMBERS, element) ? ELEMENT_MEMBERS[element] : undefined
      const fallback =
        element === 'span'
          ? [INLINE_ADVICE, zone]
          : role
            ? [`Compose ${role} instead (rung 1), or style it inside a ${ZONE} zone.`]
            : [`Compose ${BOX_MEMBERS} instead (rung 1), or style it inside a ${ZONE} zone.`]
      if (classes === null) return fit(head, fallback)

      if (namesButton(classes)) {
        return fit(head, [
          element === 'a'
            ? '`btn` reads as `<Link variant="button" href="…">` (rung 1).'
            : '`btn` reads as `<Button variant="solid" label="…">` (rung 1).',
        ])
      }

      const declarations = classDeclarations(classes)
      const reading = readLayout(declarations, values)
      // `Text` renders a `<p>`, which cannot replace a span inside a paragraph.
      const text = element === 'span' ? null : textMember(element, classes)
      if (reading.replacement === null && text !== null) {
        return fit(head, [`\`${typeClasses(classes)}\` reads as ${text} (rung 1).`])
      }
      if (reading.replacement === null) return fit(head, fallback)
      const read = declarations
        .map((declaration) => declaration.written)
        .filter((written) => reading.carried.includes(written))
        .slice(0, 4)
        .join(' ')
      return fit(head, [
        `\`${read}\` reads as ${reading.replacement} (rung 1).`,
        unmappedAdvice(reading),
        zone,
      ])
    }

    /**
     * `class` or `style` in a Vue template, static or bound. A member's is
     * removed. A `class` on a plain element is reported with what it reads
     * as, and one on anything else (a compound part such as `<Table.Row>`,
     * another library's component) is left alone, as `className` is in TSX. A
     * `style` on anything that is not a member is reported with what it reads
     * as, because it has an effect there. Inside a boundary around another
     * library's component a part is read as its member is (`hostedPartOf`).
     */
    function vueAttribute(attribute: VueAttribute): void {
      const name = boundName(attribute)
      if (name === null || (!styleProps.has(name) && name !== 'class')) return
      const element = attribute.parent.parent
      const imports = importsOf(context)
      const component = vueElementName(element, imports)

      if (
        governedComponents.has(component) ||
        hostedPartOf(component, reported(attribute)) !== null
      ) {
        if (name !== 'class' && insideBespoke(context, reported(attribute))) return
        report({
          node: reported(attribute),
          messageId: 'deadProp',
          data: { prop: name, component },
          fix: (fixer) => removeVueAttribute(context.sourceCode, fixer, attribute),
        })
        return
      }

      if (insideZone(reported(attribute))) {
        if (name !== 'class') {
          const written = context.sourceCode.getText(attribute.key as unknown as Rule.Node)
          reportLiftedStyle(reported(attribute), written, vueStyle(attribute))
        }
        return
      }
      if (name === 'class') {
        if (!isPlainVueElement(element, imports)) return
        const head = `Unexpected \`class\` on <${component}>.`
        report({
          node: reported(attribute),
          messageId: 'classAttribute',
          data: {
            element: component,
            advice: classAdvice(head, component, vueClassText(attribute)),
          },
        })
        return
      }
      // The element as written: `<el-button>`, `<my-widget>`, `<div>`.
      const written = element.rawName
      const head = `Unexpected \`${name}\` on <${written}>.`
      report({
        node: reported(attribute),
        messageId: 'styleProp',
        data: {
          prop: name,
          element: written,
          advice: styleAdvice(head, vueStyleDeclarations(attribute)),
        },
      })
    }

    /**
     * `class` or `style` in Svelte markup, static, in braces or shorthand. A
     * member's is removed, as it is in a Vue template. A `class` on a plain
     * element is reported with what it reads as, and one on anything else (a
     * compound part such as `<Tabs.Content>`, a custom element) is left alone.
     * A `style` on anything that is not a member is reported. Inside a
     * boundary around another library's component a part is read as its
     * member is (`hostedPartOf`).
     */
    function svelteAttribute(attribute: SvelteAttribute | SvelteShorthandAttribute): void {
      const name = attribute.key.name
      if (!styleProps.has(name) && name !== 'class') return
      const element = elementOfTag(attribute.parent)
      if (element === null) return
      const component = svelteElementName(element)
      const node = reportedMarkup(attribute)
      // The name the import brings in: the member's, or the member a part is of.
      const member =
        element.kind !== 'component'
          ? null
          : governedComponents.has(component)
            ? component
            : hostedPartOf(component, node)

      if (member !== null) {
        if (name !== 'class' && insideBespoke(context, node)) return
        // An `{#each}` or snippet parameter of the same name is whatever was
        // passed in, and its `class` may have an effect.
        if (shadowedAt(context.sourceCode, node, member)) {
          report({
            node,
            messageId: name === 'class' ? 'memberClass' : 'memberProp',
            data: { prop: name, component },
          })
          return
        }
        report({
          node,
          messageId: 'deadProp',
          data: { prop: name, component },
          fix: (fixer) => removeSvelteAttribute(context.sourceCode, fixer, attribute),
        })
        return
      }

      if (insideZone(node)) {
        if (name !== 'class') reportLiftedStyle(node, name, svelteStyle(attribute))
        return
      }
      if (name === 'class') {
        if (!isPlainSvelteElement(element)) return
        const head = `Unexpected \`class\` on <${component}>.`
        report({
          node,
          messageId: 'classAttribute',
          data: {
            element: component,
            advice: classAdvice(head, component, svelteClassText(attribute)),
          },
        })
        return
      }
      const head = `Unexpected \`${name}\` on <${component}>.`
      report({
        node,
        messageId: 'styleProp',
        data: {
          prop: name,
          element: component,
          advice: styleAdvice(head, svelteStyleDeclarations(attribute)),
        },
      })
    }

    const markup = {
      SvelteAttribute(node: SvelteAttribute) {
        svelteAttribute(node)
      },
      SvelteShorthandAttribute(node: SvelteShorthandAttribute) {
        svelteAttribute(node)
      },
      // `class:active={on}` on a plain element: a class, named by the directive.
      SvelteDirective(directive: SvelteDirective) {
        if (directive.kind !== 'Class') return
        const element = elementOfTag(directive.parent)
        if (element === null || !isPlainSvelteElement(element)) return
        const node = reportedMarkup(directive)
        if (insideZone(node)) return
        const written = directiveText(context.sourceCode, directive)
        const name = svelteElementName(element)
        const head = `Unexpected \`${written}\` on <${name}>.`
        report({
          node,
          messageId: 'classDirective',
          data: {
            directive: written,
            element: name,
            advice: classAdvice(head, name, directive.key.name.name ?? null),
          },
        })
      },
      // `style:padding="12px"`: one declaration, read as a `style` with it.
      SvelteStyleDirective(directive: SvelteStyleDirective) {
        const element = elementOfTag(directive.parent)
        if (element === null) return
        const node = reportedMarkup(directive)
        const written = directiveText(context.sourceCode, directive)
        if (insideZone(node)) {
          reportLiftedStyle(node, written, svelteDirectiveStyle(directive))
          return
        }
        const name = svelteElementName(element)
        const head = `Unexpected \`${written}\` on <${name}>.`
        report({
          node,
          messageId: 'styleDirective',
          data: {
            directive: written,
            element: name,
            advice: styleAdvice(head, directiveDeclarations(directive)),
          },
        })
      },
      // A raw value written as a static attribute: `<Stack gap="12px">`. A
      // `style` attribute and a `style:` directive are read whole above.
      SvelteLiteral(node: SvelteLiteral) {
        const parent = node.parent
        const whole =
          parent?.type === 'SvelteStyleDirective' ||
          (parent?.type === 'SvelteAttribute' &&
            styleProps.has((parent as SvelteAttribute).key.name))
        // The style's own report reads it, except inside a `<ThirdParty>`
        // boundary, which lifts that report and keeps a colour red.
        if (whole && !insideThirdParty(context, reportedMarkup(node))) return
        reportRawText(reportedMarkup(node), node.value)
      },
    }

    /**
     * `class` or `style` in an Angular template, in any of its spellings. A
     * static one on a member is removed, because the member strips it. A bound
     * one on a member, or any on a part drawn as its own element, is reported
     * and left. A class on a plain element is reported with what it reads as,
     * and one on another library's component is its own. A style on anything
     * that is not a member is reported with what it reads as.
     */
    function angularAttribute(attribute: AngularTextAttribute | AngularBoundAttribute): void {
      const styling = angularStyling(context.sourceCode, attribute)
      if (styling === null) return
      const element = elementOfAttribute(attribute)
      if (element === null) return
      const node = reportedTemplate(attribute)
      const name = angularElementName(element)
      const prop = styling.written

      if (angularMember(element) !== null || isAngularPart(element)) {
        if (styling.kind === 'style' && insideBespoke(context, node)) return
        if (angularMember(element) !== null && !styling.bound) {
          report({
            node,
            messageId: 'deadProp',
            data: { prop, component: name },
            fix: (fixer) =>
              removeAngularAttribute(context.sourceCode, fixer, attribute as AngularNode),
          })
          return
        }
        report({
          node,
          messageId: styling.kind === 'class' ? 'memberClass' : 'memberProp',
          data: { prop, component: name },
        })
        return
      }

      if (insideZone(node)) {
        if (styling.kind === 'style') reportLiftedStyle(node, prop, angularStyle(attribute))
        return
      }
      if (styling.kind === 'class') {
        if (!isPlainAngularElement(element)) return
        const head = `Unexpected \`${prop}\` on <${name}>.`
        const advice = classAdvice(head, name, angularClassText(attribute))
        report(
          prop === 'class'
            ? { node, messageId: 'classAttribute', data: { element: name, advice } }
            : {
                node,
                messageId: 'classDirective',
                data: { directive: prop, element: name, advice },
              },
        )
        return
      }
      const head = `Unexpected \`${prop}\` on <${name}>.`
      const advice = styleAdvice(head, angularStyleDeclarations(attribute))
      report(
        styling.whole
          ? { node, messageId: 'styleProp', data: { prop, element: name, advice } }
          : { node, messageId: 'styleDirective', data: { directive: prop, element: name, advice } },
      )
    }

    const angularTemplate = {
      TextAttribute(node: AngularTextAttribute) {
        if (angularStyling(context.sourceCode, node) !== null) {
          angularAttribute(node)
          // A `<pm-third-party>` boundary lifts the report above and keeps a colour red.
          if (!insideThirdParty(context, reportedTemplate(node))) return
        }
        // A raw value written as a static attribute: `<pm-stack gap="12px">`.
        reportRawText(reportedTemplate(node), node.value)
      },
      BoundAttribute(node: AngularBoundAttribute) {
        angularAttribute(node)
      },
      // A raw value in a bound string: `[gap]="'12px'"`. One a class or style
      // binding is given is read whole by its report.
      LiteralPrimitive(node: AngularNode & { value: unknown }) {
        if (typeof node.value === 'string') reportRawText(reportedTemplate(node), node.value)
      },
    }

    const template = {
      VAttribute(node: VueAttribute) {
        vueAttribute(node)
      },
      // A raw value written as a static attribute: `<Stack gap="12px">`. A
      // static `style` is read whole by the report above.
      VLiteral(node: VueLiteral) {
        const whole = node.parent && boundName(node.parent as unknown as VueAttribute) === 'style'
        // A `<ThirdParty>` boundary lifts the style's own report and keeps a colour red.
        if (whole && !insideThirdParty(context, reported(node))) return
        reportRawText(reported(node), node.value)
      },
      Literal(node: Rule.Node & { value: unknown }) {
        if (typeof node.value === 'string') reportRawText(node, node.value)
      },
      TemplateElement(node: Rule.Node & { value: { raw: string } }) {
        reportRawText(node, node.value.raw)
      },
    }

    const script: Rule.RuleListener = {
      'Program:exit'() {
        reportBoundaries()
      },

      ImportDeclaration(node) {
        govern(String(node.source.value), node.specifiers)
      },

      JSXAttribute(node: Rule.Node) {
        const attribute = node as unknown as JsxAttribute
        const name = attribute.name?.name
        if (typeof name !== 'string') return
        // `class` and `classList` are class props only where Solid reads them so.
        const classProp = name === 'className' || (CLASS_PROPS.has(name) && isSolidFile(context))
        if (!styleProps.has(name) && !classProp) return

        const opening = attribute.parent as JsxOpeningElement | undefined
        const component = opening ? elementName(opening) : null
        // The name the import brings in: the member's, or the member a part is
        // of (`Table` for `<Table.Row>`) inside a boundary around a library.
        const member =
          component !== null
            ? governedComponents.has(component)
              ? component
              : null
            : opening?.name.type === 'JSXMemberExpression'
              ? hostedPartOf(sourceName(context.sourceCode, opening), node)
              : null

        if (member !== null && opening) {
          const written = component ?? sourceName(context.sourceCode, opening)
          // A `style` on a member is lifted inside a zone like any style; a
          // class prop on a member stays red, because the member ignores it.
          if (!classProp && insideBespoke(context, node)) return
          // The member ignores the prop, so removing it is the whole fix,
          // provided the name refers to the member here. A parameter called
          // `Card` is whatever was passed in, and its `className` may have an
          // effect.
          if (shadowedAt(context.sourceCode, node, member)) {
            report({
              node,
              messageId: classProp ? 'memberClass' : 'memberProp',
              data: { prop: name, component: written },
            })
            return
          }
          report({
            node,
            messageId: 'deadProp',
            data: { prop: name, component: written },
            fix: (fixer) => removeAttribute(context.sourceCode, fixer, node),
          })
          return
        }

        if (insideZone(node)) {
          if (!classProp) {
            reportLiftedStyle(node, name, jsxStyle((node as unknown as AstNode)['value']))
          }
          return
        }

        if (classProp) {
          // Only on a plain element. A capitalised name is a component from
          // another library, whose props are its own business.
          if (component === null || !/^[a-z]/.test(component)) return
          const head = `Unexpected \`${name}\` on <${component}>.`
          report({
            node,
            messageId:
              name === 'className'
                ? 'className'
                : name === 'class'
                  ? 'classAttribute'
                  : 'classList',
            data: {
              element: component,
              advice: classAdvice(head, component, classText(node, name)),
            },
          })
          return
        }

        // A `style` has an effect on anything that is not a member: a plain
        // element, `motion.div`, another library's component.
        const element = opening ? sourceName(context.sourceCode, opening) : 'element'
        const head = `Unexpected \`${name}\` on <${element}>.`
        report({
          node,
          messageId: 'styleProp',
          data: { prop: name, element, advice: styleAdvice(head, styleDeclarations(node)) },
        })
      },

      // A component's template and styles are read by the template parser and
      // `no-app-css`.
      Literal(node) {
        if (typeof node.value !== 'string' || componentStringOf(node) !== null) return
        reportRawText(node, node.value)
      },

      TemplateElement(node) {
        if (componentStringOf(node) !== null) return
        reportRawText(node as unknown as Rule.Node, node.value.raw)
      },
    }

    return withAngularTemplate(
      context,
      withMarkup(context, withTemplate(context, script, template), markup),
      angularTemplate,
    )
  },
}
