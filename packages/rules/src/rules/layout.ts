import { cssProperty, nearestLength, spaceStep, type TokenValues } from '../stylelint/catalogue.js'
import { either, ZONE } from './advice'

/**
 * Reads style declarations back into the members and props that replace them.
 *
 * Three reports use it: a `style` object on a plain element, a `className` of
 * utility classes, and a stylesheet an application imports. Each found a set
 * of declarations, and most of them are spacing and flow, which the layout
 * primitives already carry as typed props: `display: flex` is `<Inline>`,
 * `padding: 16px` is `p={5}`. Naming that rewrite is the report's answer.
 *
 * It names a rewrite and never applies one. `<div style={{ display: 'flex' }}>`
 * becomes `<Inline>`, but `Inline` also aligns, wraps and spaces its children
 * by default, so whether it is the same layout is the author's call.
 */

/** One declaration as the code wrote it. */
export interface Declaration {
  /** The CSS property, kebab-case. */
  property: string
  /** A literal value, or `null` when it is computed at runtime. */
  value: string | number | null
  /** How the code spelled it, for the report: `gap`, `paddingTop`, `p-4`. */
  written: string
}

export interface LayoutReading {
  /** The members and props that replace the declarations, as code spans. */
  replacement: string | null
  /** The declarations the replacement carries, as written. */
  carried: string[]
  /** A margin's space step, `…` when it is not one, or `null` with no margin. */
  margin: string | null
  /** Declarations no layout prop carries, as written. */
  unmapped: string[]
  /** What kind of decision the first unmapped declaration is. */
  unmappedKind: 'colour' | 'type' | 'motion' | 'other' | null
}

const ALIGN: Record<string, string> = {
  start: 'start',
  'flex-start': 'start',
  center: 'center',
  end: 'end',
  'flex-end': 'end',
  stretch: 'stretch',
}

const JUSTIFY: Record<string, string> = {
  start: 'start',
  'flex-start': 'start',
  center: 'center',
  end: 'end',
  'flex-end': 'end',
  'space-between': 'between',
}

/** The column counts `Grid` takes (`design/components/grid.md`). */
export const GRID_COLUMNS = [1, 2, 3, 4, 6, 12]

/** A surface: a bordered, filled or raised box, which is what `Card` is. */
const SURFACE = /^(border(-[a-z]+)*|box-shadow|background(-color)?|outline)$/

const COLOUR = /^(color|fill|stroke|accent-color|caret-color)$/
const TYPE = /^(font(-[a-z]+)?|line-height|letter-spacing|text-[a-z-]+|white-space)$/
const MOTION = /^(transition|animation)(-[a-z-]+)?$|^transform$/

/**
 * The space step a length is, as the number a layout prop takes, or `…`. A
 * negative length is no step: no layout prop takes one.
 */
export function stepOf(value: string | number | null, values: TokenValues | undefined): string {
  if (value === null) return '…'
  const near = nearestLength(value, values, 'padding')
  const step = near && near.exact && !near.negative ? spaceStep(near.name) : null
  return step === null ? '…' : String(step)
}

/** `0 12px` -> `['0', '12px']`, so a two-value padding becomes `py` and `px`. */
function parts(value: string | number | null): (string | number | null)[] {
  if (typeof value !== 'string') return [value]
  return value.trim().split(/\s+/)
}

export function readLayout(
  declarations: readonly Declaration[],
  values: TokenValues | undefined,
): LayoutReading {
  const props = new Map<string, string>()
  const carried: string[] = []
  const unmapped: string[] = []
  let unmappedKind: LayoutReading['unmappedKind'] = null
  let margin: string | null = null
  let flow: 'row' | 'column' | 'grid' | null = null
  let surface = false

  const carry = (declaration: Declaration, prop?: string, value?: string) => {
    carried.push(declaration.written)
    if (prop !== undefined && value !== undefined && !props.has(prop)) props.set(prop, value)
  }

  for (const declaration of declarations) {
    const { property, value } = declaration
    const text = typeof value === 'string' ? value.trim().toLowerCase() : value

    if (property === 'display' && (text === 'flex' || text === 'inline-flex')) {
      flow ??= 'row'
      carry(declaration)
    } else if (property === 'display' && (text === 'grid' || text === 'inline-grid')) {
      flow = 'grid'
      carry(declaration)
    } else if (property === 'flex-direction' && typeof text === 'string') {
      flow = text.startsWith('column') ? 'column' : 'row'
      carry(declaration)
    } else if (property === 'flex-wrap' && text === 'wrap') {
      carry(declaration, 'wrap', '')
    } else if (/^(row-|column-)?gap$/.test(property)) {
      carry(declaration, 'gap', `{${stepOf(value, values)}}`)
    } else if (property === 'padding') {
      const [first, second, ...more] = parts(value)
      if (second === undefined || more.length > 0) {
        carry(declaration, 'p', `{${more.length > 0 ? '…' : stepOf(first ?? null, values)}}`)
      } else {
        carry(declaration, 'py', `{${stepOf(first ?? null, values)}}`)
        props.set('px', `{${stepOf(second, values)}}`)
      }
    } else if (/^padding-(inline|left|right)/.test(property)) {
      carry(declaration, 'px', `{${stepOf(value, values)}}`)
    } else if (/^padding-(block|top|bottom)/.test(property)) {
      carry(declaration, 'py', `{${stepOf(value, values)}}`)
    } else if (property === 'align-items' && typeof text === 'string' && ALIGN[text]) {
      carry(declaration, 'align', `"${ALIGN[text]}"`)
    } else if (property === 'justify-content' && typeof text === 'string' && JUSTIFY[text]) {
      carry(declaration, 'justify', `"${JUSTIFY[text]}"`)
    } else if (property === 'grid-template-columns') {
      const count = typeof text === 'string' ? /^repeat\(\s*(\d+)\s*,/.exec(text)?.[1] : undefined
      flow = 'grid'
      carry(
        declaration,
        'columns',
        `{${count && GRID_COLUMNS.includes(Number(count)) ? count : '…'}}`,
      )
    } else if (/^margin/.test(property)) {
      margin = stepOf(parts(value)[0] ?? null, values)
      carried.push(declaration.written)
    } else if (SURFACE.test(property)) {
      surface = true
      carry(declaration)
    } else {
      unmapped.push(declaration.written)
      unmappedKind ??= COLOUR.test(property)
        ? 'colour'
        : TYPE.test(property)
          ? 'type'
          : MOTION.test(property)
            ? 'motion'
            : 'other'
    }
  }

  const member = flow === 'grid' ? 'Grid' : flow === 'row' ? 'Inline' : 'Stack'
  // `wrap` is Inline's, `columns` Grid's, and `align` and `justify` are not
  // Grid's: its tracks place the cells (`design/components/grid.md`).
  const own = (prop: string) =>
    (prop !== 'wrap' || member === 'Inline') &&
    (prop !== 'columns' || member === 'Grid') &&
    ((prop !== 'justify' && prop !== 'align') || member !== 'Grid')
  // A card's padding is the theme's inset, so the card carries it unasked.
  const kept = [...props].filter(
    ([prop]) => own(prop) && !(surface && ['p', 'px', 'py'].includes(prop)),
  )
  const attributes = kept.map(([prop, value]) => (value === '' ? ` ${prop}` : ` ${prop}=${value}`))
  const primitive =
    flow !== null || kept.length > 0 ? `\`<${member}${attributes.join('')}>\`` : null

  const replacement = surface
    ? primitive === null
      ? '`<Card>`'
      : `\`<Card>\` around ${primitive}`
    : primitive

  return { replacement, carried, margin, unmapped, unmappedKind }
}

/** A margin's answer, as one sentence, or `''` when the declarations set none. */
export function marginAdvice(reading: LayoutReading): string {
  return reading.margin === null
    ? ''
    : `A margin is the parent's spacing: \`<Stack gap={${reading.margin}}>\` around it.`
}

/** What the declarations a layout prop cannot carry belong to, as one sentence. */
export function unmappedAdvice(reading: LayoutReading): string {
  const [first, second, ...rest] = reading.unmapped.map((written) => `\`${written}\``)
  if (first === undefined) return ''
  const named =
    rest.length > 0
      ? `${first}, ${second} and more`
      : either([first, ...(second ? [second] : [])], 'and')
  switch (reading.unmappedKind) {
    case 'colour':
      return `${named}: a member's \`tone="…"\` or \`variant="…"\` sets colour (rung 1).`
    case 'type':
      return `${named}: \`<Text size="sm">\` or \`<Heading level={3}>\` sets type (rung 1).`
    case 'motion':
      return `${named}: motion is the member's own, so compose the member or use a ${ZONE} zone.`
    default:
      return `${named} has no member prop, so it belongs in a ${ZONE} zone (rung 4).`
  }
}

/* -------------------------------------------------------------------------- */
/* Utility classes                                                            */
/* -------------------------------------------------------------------------- */

/** One Tailwind spacing unit, in px: `p-4` is 16px. */
const UNIT_PX = 4

/** `4` -> 16, `0.5` -> 2, `px` -> 1, `[12px]` -> `12px`. */
function utilityLength(amount: string): string | number | null {
  if (amount === 'px') return 1
  const arbitrary = /^\[(.+)\]$/.exec(amount)
  if (arbitrary) return arbitrary[1] ?? null
  const units = Number(amount)
  return Number.isNaN(units) ? null : units * UNIT_PX
}

const SPACING_CLASS: [RegExp, string][] = [
  [/^gap(-[xy])?-(.+)$/, 'gap'],
  [/^p-(.+)$/, 'padding'],
  [/^px-(.+)$/, 'padding-inline'],
  [/^p[lr]-(.+)$/, 'padding-inline'],
  [/^py-(.+)$/, 'padding-block'],
  [/^p[tb]-(.+)$/, 'padding-block'],
  [/^-?m[xytrbl]?-(.+)$/, 'margin'],
]

/**
 * The declarations a list of utility classes stands for, as far as a class
 * name says: `flex gap-2 p-4` is a row, an 8px gap and 16px of padding. Names
 * that say nothing readable (`inbox-row`, a CSS module key) are left out, and
 * the report falls back to the element's role.
 */
export function classDeclarations(classes: string): Declaration[] {
  const found: Declaration[] = []
  for (const written of classes.split(/\s+/).filter(Boolean)) {
    // A variant prefix (`md:`, `hover:`) changes when, not what.
    const name = written.slice(written.lastIndexOf(':') + 1)
    const add = (property: string, value: string | number | null) =>
      found.push({ property, value, written })

    if (name === 'flex' || name === 'inline-flex') add('display', 'flex')
    else if (name === 'grid' || name === 'inline-grid') add('display', 'grid')
    else if (name === 'flex-col' || name === 'flex-column') add('flex-direction', 'column')
    else if (name === 'flex-row') add('flex-direction', 'row')
    else if (name === 'flex-wrap') add('flex-wrap', 'wrap')
    else if (/^grid-cols-\d+$/.test(name))
      add('grid-template-columns', `repeat(${name.slice(10)}, 1fr)`)
    else if (/^items-(start|center|end|stretch)$/.test(name)) add('align-items', name.slice(6))
    else if (/^justify-(start|center|end|between)$/.test(name)) {
      const value = name.slice(8)
      add('justify-content', value === 'between' ? 'space-between' : value)
    } else if (/^(border|rounded|shadow|card|panel|bg)(-|$)/.test(name)) add('border', null)
    else if (
      /^(text-(xs|sm|base|lg|[2-9]?xl|left|center|right|justify)|font-[a-z]+|leading-|tracking-)/.test(
        name,
      )
    )
      add('font-size', null)
    else if (/^text-[a-z]+(-\d+)?$/.test(name)) add('color', null)
    else {
      const spacing = SPACING_CLASS.find(([pattern]) => pattern.test(name))
      if (spacing) {
        const [pattern, property] = spacing
        const amount = pattern.exec(name)?.slice(1).filter(Boolean).pop() ?? ''
        add(property, utilityLength(amount))
      }
    }
  }
  return found
}

/** Whether the class list names a button style: `btn`, `btn-primary`, `button`. */
export function namesButton(classes: string): boolean {
  return classes.split(/\s+/).some((name) => /^(btn|button)(-|$)/.test(name))
}

/**
 * The class that names a badge style, or `null`: `badge`, `badge-success`,
 * `pill`, `chip`, `tag`.
 */
export function badgeClass(classes: string): string | null {
  return (
    classes
      .split(/\s+/)
      .find((name) => /^(badge|pill|chip|tag)(-|$)/.test(name.slice(name.lastIndexOf(':') + 1))) ??
    null
  )
}

/* -------------------------------------------------------------------------- */
/* Elements                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * The member a plain element's role maps to, when the element says. A styled
 * `<p>` is `Text`, a styled `<h2>` is `Heading`. A box (`div`, `section`) could
 * be any layout primitive or a card, so it gets the list. A `<span>` is not
 * here: `Text` renders a `<p>`, which cannot stand where a span does, so a
 * span gets `INLINE_ADVICE`.
 */
export const ELEMENT_MEMBERS: Record<string, string> = {
  p: '`<Text>`',
  h1: '`<PageHeader title="…">` or `<Hero title="…">`',
  h2: '`<Heading level={2}>`',
  h3: '`<Heading level={3}>`',
  h4: '`<Heading level={4}>`',
  h5: '`<Heading level={4}>`',
  h6: '`<Heading level={4}>`',
  a: '`<Link href="…">`',
  hr: '`<Separator>`',
  code: '`<Code>`',
  pre: '`<CodeBlock>`',
  kbd: '`<Kbd>`',
  table: '`<Table>`',
  ul: '`<Stack as="ul">`',
  ol: '`<Stack as="ol">`',
  label: '`<FormField label="…">`',
}

export const BOX_MEMBERS = '`<Stack>`, `<Inline>`, `<Grid>` or `<Card>`'

/**
 * What a styled `<span>` is: inline content of the paragraph around it, whose
 * size and tone the enclosing `Text` sets. `Text`'s spec gives inline emphasis
 * to its children (`<strong>`, `Code`).
 */
export const INLINE_ADVICE =
  'A <span> is inline content: the enclosing `<Text>` sets its size and tone, and emphasis is ' +
  '`<strong>` or `<Code>` inside it (rung 1).'

/** Converts a style object's key, as written, to its CSS property. */
export { cssProperty }
