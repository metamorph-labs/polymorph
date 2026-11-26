import { z } from 'zod'

import { axesSchema } from './axes'
import {
  CONTROL_HEIGHT_PX,
  DENSITY_MULTIPLIER,
  deriveHeadingSteps,
  focusPx,
  GEOMETRY_RADII,
  HEADING_WEIGHT_RANGE,
  LINE_HEIGHTS,
  roundEven,
  SPACE_LADDER_PX,
  TYPE_BASE_PX,
  TYPE_RATIO,
  typeSizePx,
} from './derive'
import { LC_FLOORS, minSizeForWeight } from './pairings'
import {
  chromaBudgetSchema,
  fontFamiliesSchema,
  gradientPinFault,
  hueSchema,
  neutralTintSchema,
  pinsSchema,
  type Seeds,
} from './seeds'
import { modePreferenceSchema, THEME_KINDS, type Theme } from './theme'
import {
  FIELD_FOCUS_STYLES,
  INSET_ASSIGNMENT_CLASSES,
  NUMERIC_ALIGNS,
  RADIUS_ASSIGNMENT_CLASSES,
  RADIUS_STEPS,
  SHADOW_ASSIGNMENT_CLASSES,
  SHADOW_STEPS,
  UNFILLED_HOVERS,
} from './tokens'

/**
 * The two files a pairing is made of (`docs/theming.md`).
 *
 * `resolveTheme` takes axes and seeds as independent inputs, and the files keep
 * them separate:
 *
 * - A **system** holds the structure: the eight axes, the font slots and
 *   the presentation defaults. Of colour, it sets only a `defaultPalette`.
 * - A **palette** holds the colour and belongs to no system. Every palette is
 *   lawful on every system, so any cross-pairing is safe.
 *
 * `chromaBudget` is palette, because only colour derivation reads it. A system
 * that depends on a budget sets it through its default palette. Fonts are
 * system, because a serif display is structure, not colour.
 */

/**
 * Both names appear in attribute selectors (`[data-system='…']`) and in
 * localStorage, so both are slugs. There are two exports for one rule so that
 * code validating a palette does not use a name with "system" in it.
 */
const slugSchema = z.string().regex(/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/, 'name must be kebab-case')

export const systemNameSchema = slugSchema
export const paletteNameSchema = slugSchema

/**
 * Value-only overrides to the derived scale.
 *
 * The axes still decide what kind of system this is. An override changes what
 * one step of one scale resolves to. Two constraints keep it lawful:
 *
 * - **Values only, never names.** An override changes `--pm-radius-md`'s value,
 *   never whether it exists, so every pairing emits the same property set
 *   (`token-references.test.ts`).
 * - **The scale's laws still apply.** Radius stays monotone over the merged
 *   result (the `superRefine` below), so `sm` cannot exceed `lg` and break
 *   recipes that assume the order.
 *
 * Keyed by scale (radius, space, control heights, …), so adding a scale needs
 * no migration.
 */
const radiusPxSchema = z.number().int().min(0).max(64)

export const radiusOverrideSchema = z.strictObject({
  sm: radiusPxSchema.optional(),
  md: radiusPxSchema.optional(),
  lg: radiusPxSchema.optional(),
})

/**
 * Space overrides change the base (standard-density) ladder. The multipliers
 * still derive compact and comfortable from it, so contextual density changes
 * only space. Step 0 is a meaning, not a size, so it cannot be overridden.
 */
const spacePxSchema = z.number().int().min(2).max(128)

export const spaceOverrideSchema = z.strictObject({
  1: spacePxSchema.optional(),
  2: spacePxSchema.optional(),
  3: spacePxSchema.optional(),
  4: spacePxSchema.optional(),
  5: spacePxSchema.optional(),
  6: spacePxSchema.optional(),
  7: spacePxSchema.optional(),
  8: spacePxSchema.optional(),
  9: spacePxSchema.optional(),
  10: spacePxSchema.optional(),
})

/** Control heights, also base values before density. The WCAG floor is checked below. */
const controlPxSchema = z.number().int().min(24).max(64)

export const controlHeightOverrideSchema = z.strictObject({
  sm: controlPxSchema.optional(),
  md: controlPxSchema.optional(),
  lg: controlPxSchema.optional(),
})

/**
 * Assignment overrides point a class at a different step, unlike the scale
 * overrides above, which change what a step resolves to. Any step is lawful,
 * `pill` and `none` included, because capsule controls and square surfaces are
 * taste, decided in the system file. Always-pill elements (Switch track,
 * Skeleton circle) are not here: a capsule is a meaning and cannot be
 * reassigned.
 */
export const radiusAssignmentSchema = z.strictObject({
  control: z.enum(RADIUS_STEPS).optional(),
  detail: z.enum(RADIUS_STEPS).optional(),
  surface: z.enum(RADIUS_STEPS).optional(),
})

/** Maps shadow classes to shadow steps. See `SHADOW_ASSIGNMENT_CLASSES`. */
export const shadowAssignmentSchema = z.strictObject({
  seat: z.enum(SHADOW_STEPS).optional(),
  resting: z.enum(SHADOW_STEPS).optional(),
  transient: z.enum(SHADOW_STEPS).optional(),
})

/**
 * Maps container classes to space steps (0–10), never px. Assignments name
 * steps; the scale override above sets the values. The two stay separate.
 */
const spaceStepSchema = z
  .number()
  .int()
  .min(0, 'padding names a rung of the spacing ladder — the ladder starts at step 0')
  .max(10, 'padding names a rung of the spacing ladder — the ladder ends at step 10')

export const insetAssignmentSchema = z.strictObject({
  surface: spaceStepSchema.optional(),
  pane: spaceStepSchema.optional(),
  list: spaceStepSchema.optional(),
})

export const assignOverrideSchema = z.strictObject({
  radius: radiusAssignmentSchema.optional(),
  shadow: shadowAssignmentSchema.optional(),
  inset: insetAssignmentSchema.optional(),
})

/**
 * More overrides, each one narrow setting:
 *
 * - **`shadow.throw`** scales the distances of every axis-derived layer (y,
 *   blur, spread), never the darkness. `none` has no layers, so flat stays
 *   shadowless under any throw.
 * - **`focus`** overrides the mark's width from temperament and its offset.
 *   The 2px floor is the softest shipped temperament's width; a thinner mark
 *   stops showing focus clearly. The derived offset is minus the width, the
 *   mark inside the edge. A system may state that or move the mark outside at
 *   0 to 4px, and nothing between: further in, the mark floats inside the
 *   control with a gap, and across the edge it covers the border a state draws
 *   (`systemSchema` holds the offset to the merged width). `field` chooses
 *   where a focused field draws it, at the same width either way.
 * - **`type.ratio`** overrides the density axis's modular ratio. The md anchor
 *   stays, because a ratio spreads the ladder, not the page. The display floor
 *   still applies. Per-step sizes are not allowed: they would be the
 *   hand-written token sheet the axes replace.
 * - **`type.titleWeight`** and **`type.displayWeight`** replace the type
 *   personality's two heading weights, on the steps each already governs:
 *   `text.2xl` and `text.3xl`, and the display steps. Body and the working
 *   sizes keep theirs, and a title weight under 500 lightens `xl` as far as
 *   its size reads (`xlWeight`). Each is a hundred from 300 to 700
 *   (`HEADING_WEIGHT_RANGE`), and `systemSchema` holds each step's weight to
 *   the size it needs at the body-text contrast floor.
 * - **`hover.unfilled`** chooses whether an outline or ghost Button washes
 *   under the pointer. The press and an on toggle keep their wash either way,
 *   because a control must answer the click and an on toggle must look on.
 * - **`numeric.align`** chooses which side of its column a numeric column's
 *   figures sit on, the end or the start. Tabular figures stay either way,
 *   because the choice is where the column's figures sit, not how they are
 *   drawn.
 */
export const shadowOverrideSchema = z.strictObject({
  throw: z
    .number()
    .min(0.5, 'shadow throw stays within 0.5–1.75 — below that the layers stop reading as light')
    .max(1.75, 'shadow throw stays within 0.5–1.75 — beyond that the layers stop being one light')
    .optional(),
})

/** The widths a system file may give the focus mark, in px. */
const FOCUS_WIDTH_RANGE_PX = { min: 2, max: 6 } as const

/** The furthest outside the control a system file may move the focus mark, in px. */
const FOCUS_OFFSET_OUTSIDE_PX = 4

export const focusOverrideSchema = z.strictObject({
  /** How a focused field shows focus. See `FIELD_FOCUS_STYLES`. */
  field: z.enum(FIELD_FOCUS_STYLES).optional(),
  width: z
    .number()
    .int()
    .min(
      FOCUS_WIDTH_RANGE_PX.min,
      'the focus mark keeps its 2px floor — the softest shipped temperament’s own width',
    )
    .max(
      FOCUS_WIDTH_RANGE_PX.max,
      'the focus mark stops at 6px — past that the mark outweighs the control it marks',
    )
    .optional(),
  /**
   * Minus the width puts the mark inside the edge, the derived default; 0 to
   * 4px puts it outside. The range here is the widest the width allows, and
   * `systemSchema` holds the offset to the merged width.
   */
  offset: z
    .number()
    .int()
    .min(
      -FOCUS_WIDTH_RANGE_PX.max,
      'the focus mark goes no further inside than its own width — 6px at the widest',
    )
    .max(
      FOCUS_OFFSET_OUTSIDE_PX,
      'the focus mark stays within 4px outside the control — further out it stops reading as this control’s',
    )
    .optional(),
})

/**
 * The base is the md step, the paragraph size: 16px unless set, and settable
 * between 12 and 20px. A base under 16px is lawful because the text-entry
 * floor is a token of its own. iOS Safari zooms the viewport when a focused
 * field's font-size is under 16px, so below the phone line every text-entry
 * recipe reads `--pm-text-entry-size`, which the engine derives as the md
 * step or 16px, whichever is larger (`design/components/README.md`, the
 * focus-zoom floor). No application needs a viewport `maximum-scale` or a
 * CSS `zoom` to keep a small field from zooming, and neither is lawful here.
 * The range keeps a paragraph readable at the small end and the ladder on
 * the page at the large end.
 *
 * The two steps under the base, `sm` and `xs`, may be set in px too. They are
 * the working sizes: controls, table cells, menus and labels read `sm`, and
 * captions and badges read `xs`. A product's working sizes are often not one
 * ratio apart from its paragraph size (13 and 12 under 16, say), and a ratio
 * cannot place both. The steps above the base still derive from the ratio,
 * so headings keep one rhythm. Setting every step would be the hand-written
 * token sheet the axes replace; two values under the base are a scale
 * amendment like `radius.sm`. The floor is 10px, under the 10.5px the
 * steepest ratio derives for `xs` at the default base; `systemSchema` below
 * holds the merged ladder in order.
 */
export const TYPE_STEP_FLOOR_PX = 10
export const TYPE_BASE_RANGE_PX = { min: 12, max: 20 } as const

const typeStepPxSchema = z
  .number()
  .multipleOf(0.5, 'a type step sits on the half-pixel grid the scale rounds to')
  .min(
    TYPE_STEP_FLOOR_PX,
    `a type step stays at or above ${TYPE_STEP_FLOOR_PX}px — under that a step stops being legible`,
  )
  .max(
    TYPE_BASE_RANGE_PX.max,
    `a type step stays at or under ${TYPE_BASE_RANGE_PX.max}px — the base’s own ceiling`,
  )

const typeBasePxSchema = z
  .number()
  .multipleOf(0.5, 'the base sits on the half-pixel grid the scale rounds to')
  .min(
    TYPE_BASE_RANGE_PX.min,
    `the base type size stays within ${TYPE_BASE_RANGE_PX.min}–${TYPE_BASE_RANGE_PX.max}px — under that a paragraph stops being readable`,
  )
  .max(
    TYPE_BASE_RANGE_PX.max,
    `the base type size stays within ${TYPE_BASE_RANGE_PX.min}–${TYPE_BASE_RANGE_PX.max}px — over that the ladder outgrows the page`,
  )

/**
 * A heading weight: a hundred, because a static family ships one file per
 * hundred and the font check (`packages/registry/src/fonts-gen.ts`) looks for
 * that file.
 */
const headingWeightSchema = z
  .number()
  .int()
  .multipleOf(100, 'a heading weight is a hundred — a static family ships one file per hundred')
  .min(
    HEADING_WEIGHT_RANGE.min,
    `a heading weight stays at or above ${HEADING_WEIGHT_RANGE.min} — lighter, the smallest title step stops reading at the body-text contrast floor`,
  )
  .max(
    HEADING_WEIGHT_RANGE.max,
    `a heading weight stays at or under ${HEADING_WEIGHT_RANGE.max} — the heaviest weight a type personality sets`,
  )

export const typeOverrideSchema = z.strictObject({
  ratio: z
    .number()
    .min(1.125, 'the modular ratio stays within 1.125–1.4 — flatter stops separating the steps')
    .max(1.4, 'the modular ratio stays within 1.125–1.4 — steeper breaks the ladder’s rhythm')
    .optional(),
  base: typeBasePxSchema.optional(),
  sm: typeStepPxSchema.optional(),
  xs: typeStepPxSchema.optional(),
  /** `text.2xl` and `text.3xl`, in place of the personality's title weight. */
  titleWeight: headingWeightSchema.optional(),
  /** The display steps, in place of the personality's display weight. */
  displayWeight: headingWeightSchema.optional(),
})

/** See `UNFILLED_HOVERS`. */
export const hoverOverrideSchema = z.strictObject({
  unfilled: z.enum(UNFILLED_HOVERS).optional(),
})

/** See `NUMERIC_ALIGNS`. */
export const numericOverrideSchema = z.strictObject({
  align: z.enum(NUMERIC_ALIGNS).optional(),
})

/**
 * Component exceptions: a rung of the exception ladder (`docs/rules.md`), as
 * data in the system file. One named member points one class token at one
 * lawful step, **with a `because`**. Exceptions are allowed; undeclared ones
 * are not. This is not per-component tokens: no new property names, no raw
 * values, and only the steps the assignment layer allows for the class.
 *
 * `component` is the member's slug (gallery spelling, kebab-case), written
 * unchanged into `[data-member="…"]`. The registry checks, in its test suite
 * and the studio's save step, that the slug is a real member that reads the
 * class token. This schema checks shape and step legality.
 */
const memberSlugSchema = z
  .string()
  .regex(/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/, 'a member is named by its slug — kebab-case')

const becauseSchema = z
  .string()
  .trim()
  .min(1, 'an exception carries its because — an undeclared deviation is drift')

const radiusExceptionSchema = z.strictObject({
  component: memberSlugSchema,
  family: z.literal('radius'),
  class: z.enum(RADIUS_ASSIGNMENT_CLASSES),
  step: z.enum(RADIUS_STEPS),
  because: becauseSchema,
})

const shadowExceptionSchema = z.strictObject({
  component: memberSlugSchema,
  family: z.literal('shadow'),
  class: z.enum(SHADOW_ASSIGNMENT_CLASSES),
  step: z.enum(SHADOW_STEPS),
  because: becauseSchema,
})

const insetExceptionSchema = z.strictObject({
  component: memberSlugSchema,
  family: z.literal('inset'),
  class: z.enum(INSET_ASSIGNMENT_CLASSES),
  step: spaceStepSchema,
  because: becauseSchema,
})

/**
 * Discriminated on `family`, because `surface` is a class in two families and
 * the family decides which steps are allowed.
 */
export const componentExceptionSchema = z.discriminatedUnion('family', [
  radiusExceptionSchema,
  shadowExceptionSchema,
  insetExceptionSchema,
])

export type ComponentException = z.infer<typeof componentExceptionSchema>

export const systemOverridesSchema = z.strictObject({
  radius: radiusOverrideSchema.optional(),
  space: spaceOverrideSchema.optional(),
  controlHeight: controlHeightOverrideSchema.optional(),
  shadow: shadowOverrideSchema.optional(),
  focus: focusOverrideSchema.optional(),
  type: typeOverrideSchema.optional(),
  hover: hoverOverrideSchema.optional(),
  numeric: numericOverrideSchema.optional(),
  assign: assignOverrideSchema.optional(),
  exceptions: z.array(componentExceptionSchema).optional(),
})

export type SystemOverrides = z.infer<typeof systemOverridesSchema>

/**
 * The system document's object shape alone, so the JSON Schema for a guest
 * author's editor (`admit.ts`) can be generated without refinements.
 * `systemSchema` below adds the cross-field laws; `parseSystem` runs both.
 *
 * `$schema` is accepted and ignored on both documents, so an editor can name
 * its schema. The strictness is for catching typos, not blocking tooling.
 */
export const systemDocumentSchema = z.strictObject({
  $schema: z.string().optional(),
  name: systemNameSchema,
  axes: axesSchema,
  fonts: fontFamiliesSchema,
  /**
   * The palette used unless another is selected. A default, not a constraint:
   * the law suite resolves the whole cross product.
   */
  defaultPalette: paletteNameSchema,
  defaultMode: modePreferenceSchema,
  /**
   * Defaults to the stricter value, so a system that omits it is held to the
   * divergence law. A tenant must declare itself.
   */
  kind: z.enum(THEME_KINDS).default('designed'),
  /**
   * The register: one paragraph, in the docs' style, describing the system.
   * It is a design decision like the axes, so it lives here. A hand-kept
   * `Record<name, blurb>` in the docs app would go stale silently. Describe
   * this system (geometry, depth, rhythm, type, colour), never what it
   * resembles. The name and the register are both part of the design.
   *
   * Optional because a guest system admitted through `./admit` needs no docs.
   * The catalogue law in `laws.test.ts` requires it of every committed
   * designed system.
   */
  register: z.string().min(1).optional(),
  /** See `systemOverridesSchema`: value-only overrides to the derived scale. */
  overrides: systemOverridesSchema.optional(),
})

export const systemSchema = systemDocumentSchema.superRefine((system, ctx) => {
  // Each scale's law is checked on the merged ladder, the one that ships.
  const issue = (path: string[], message: string) =>
    ctx.addIssue({ code: z.ZodIssueCode.custom, path, message })

  const base = GEOMETRY_RADII[system.axes.geometry]
  const radius = system.overrides?.radius
  const [sm, md, lg] = [radius?.sm ?? base[0], radius?.md ?? base[1], radius?.lg ?? base[2]]
  if (sm > md || md > lg) {
    issue(
      ['overrides', 'radius'],
      `radius must stay monotone: merged ladder is sm ${sm} / md ${md} / lg ${lg} ` +
        `over geometry '${system.axes.geometry}' (${base.join('/')})`,
    )
  }

  const space = system.overrides?.space
  if (space !== undefined) {
    const merged = SPACE_LADDER_PX.map((value, step) => space[step as keyof typeof space] ?? value)
    const broken = merged.findIndex((value, step) => step > 0 && value < (merged[step - 1] ?? 0))
    if (broken > 0) {
      issue(
        ['overrides', 'space'],
        `space must stay non-decreasing: merged ladder puts step ${broken} (${merged[broken]}px) ` +
          `under step ${broken - 1} (${merged[broken - 1]}px)`,
      )
    }
  }

  const control = system.overrides?.controlHeight
  if (control !== undefined) {
    const heights = {
      sm: control.sm ?? CONTROL_HEIGHT_PX.sm,
      md: control.md ?? CONTROL_HEIGHT_PX.md,
      lg: control.lg ?? CONTROL_HEIGHT_PX.lg,
    }
    if (heights.sm > heights.md || heights.md > heights.lg) {
      issue(
        ['overrides', 'controlHeight'],
        `control heights must stay monotone: merged ladder is sm ${heights.sm} / ` +
          `md ${heights.md} / lg ${heights.lg}`,
      )
    }
    // The 24px WCAG 2.5.8 floor applies to the derived value, so it is checked
    // after the compact multiplier and 2px rounding. The base bound alone would
    // accept a height that fails at compact density.
    const compactSm = roundEven(heights.sm * DENSITY_MULTIPLIER.compact)
    if (compactSm < 24) {
      issue(
        ['overrides', 'controlHeight'],
        `controlHeight.sm of ${heights.sm}px derives to ${compactSm}px at compact density, ` +
          'under the WCAG 2.5.8 24px target floor',
      )
    }
  }

  // The type ladder's law on the merged values: non-decreasing under the
  // base, as the space ladder is, so controls and paragraphs may share a
  // size, and never under the 10px floor. An unset step is judged at the size
  // the ratio derives for it from the base, so `sm: 11` with the standard
  // ratio (xs 12.5) is refused, and a 12px base at the standard ratio (xs
  // 9.5) asks for `type.xs`.
  const type = system.overrides?.type
  if (type !== undefined && (type.base ?? type.sm ?? type.xs) !== undefined) {
    const base = type.base ?? TYPE_BASE_PX
    const ratio = type.ratio ?? TYPE_RATIO[system.axes.density]
    const sm = type.sm ?? typeSizePx(-1, ratio, base)
    const xs = type.xs ?? typeSizePx(-2, ratio, base)
    if (!(xs <= sm && sm <= base)) {
      issue(
        ['overrides', 'type'],
        `type steps must stay monotone under the base: merged ladder is xs ${xs} / sm ${sm} / md ${base}`,
      )
    } else if (xs < TYPE_STEP_FLOOR_PX) {
      issue(
        ['overrides', 'type'],
        `the merged ladder puts xs at ${xs}px, under the ${TYPE_STEP_FLOOR_PX}px floor — set type.xs`,
      )
    }
  }

  // A step's line box fits the control that draws it at compact density, the
  // recipes' size map read backwards: xs in the sm control, sm in the md
  // control and the base in the lg control. Judged on the merged ladders, so a
  // larger step asks for a taller control in the same file.
  {
    const base = type?.base ?? TYPE_BASE_PX
    const ratio = type?.ratio ?? TYPE_RATIO[system.axes.density]
    const steps = {
      xs: type?.xs ?? typeSizePx(-2, ratio, base),
      sm: type?.sm ?? typeSizePx(-1, ratio, base),
      md: base,
    }
    const heights = {
      sm: control?.sm ?? CONTROL_HEIGHT_PX.sm,
      md: control?.md ?? CONTROL_HEIGHT_PX.md,
      lg: control?.lg ?? CONTROL_HEIGHT_PX.lg,
    }
    for (const [step, size] of [
      ['xs', 'sm'],
      ['sm', 'md'],
      ['md', 'lg'],
    ] as const) {
      const line = steps[step] * LINE_HEIGHTS[step]
      const height = roundEven(heights[size] * DENSITY_MULTIPLIER.compact)
      if (line > height) {
        issue(
          ['overrides', 'type'],
          `the ${step} step's line box (${line}px) does not fit the ${size} control at compact ` +
            `density (${height}px) — lower type.${step} or raise controlHeight.${size}`,
        )
      }
    }
  }

  // A heading step's weight reads at the body-text floor at the size the step
  // derives (`minSizeForWeight`). Measured on the derivation itself, so the
  // weight judged is the file's where it sets one, and the size is the merged
  // ladder's. A personality's own weights pass at every lawful base and ratio
  // (500 needs 16px, and the smallest `text.2xl` the schema allows is 17px),
  // so only a file's lighter weight is ever refused.
  for (const heading of deriveHeadingSteps(system.axes, type)) {
    const needs = minSizeForWeight(heading.weight)
    if (needs === undefined || heading.px < needs) {
      const set = type?.[heading.key] !== undefined
      const reads = needs === undefined ? 'at no heading size' : `from ${needs}px`
      issue(
        set ? ['overrides', 'type', heading.key] : ['overrides', 'type'],
        `${heading.step} is ${heading.px}px at weight ${heading.weight}, and at Lc ` +
          `${LC_FLOORS.bodyText}, the floor text.primary is held to, weight ${heading.weight} ` +
          `reads ${reads} — set a heavier ${heading.key}, or raise type.base or type.ratio`,
      )
    }
  }

  // The focus mark is inside the edge or outside it, never between. The offset
  // is judged against the merged width, the override or the temperament's.
  // Further in than minus the width, the mark floats inside the control with
  // a gap. Between that and 0 it crosses the edge, so it covers the border an
  // invalid or selected part draws, and the convention cannot move it clear
  // of that border without moving it wholly inside or outside.
  const focus = system.overrides?.focus
  if (focus?.offset !== undefined) {
    const { width, offset } = focusPx(system.axes.contrastTemperament, focus)
    if (offset < 0 && offset !== -width) {
      issue(
        ['overrides', 'focus', 'offset'],
        `focus offset ${offset}px ${
          offset < -width
            ? `floats the ${width}px mark inside the control, with a gap to its edge`
            : `lays the ${width}px mark across the control’s edge`
        } — the mark sits inside the edge at ${-width}px, minus its width, or outside it at ` +
          `0–${FOCUS_OFFSET_OUTSIDE_PX}px`,
      )
    }
  }

  // One step per decision: a second exception for the same member, family and
  // class is a contradiction. Reported once per decision, because three copies
  // are still one contradiction.
  const seen = new Set<string>()
  const duplicated = new Set<string>()
  for (const exception of system.overrides?.exceptions ?? []) {
    const key = `${exception.component}/${exception.family}/${exception.class}`
    if (seen.has(key)) duplicated.add(key)
    seen.add(key)
  }
  for (const key of duplicated) {
    issue(
      ['overrides', 'exceptions'],
      `one step per decision: ${key} is declared more than once — a member wears one step per class`,
    )
  }
})

export type System = z.infer<typeof systemSchema>

/**
 * The colour half of `Seeds`. `systems.test.ts` compares it with
 * `seedsSchema` field by field, so neither can gain a seed the other lacks.
 */
export const paletteSchema = z
  .strictObject({
    /** Accepted and ignored. See `systemDocumentSchema`. */
    $schema: z.string().optional(),
    name: paletteNameSchema,
    accentHue: hueSchema,
    gradientHue: hueSchema.optional(),
    neutralHue: hueSchema.optional(),
    neutralTint: neutralTintSchema,
    chromaBudget: chromaBudgetSchema,
    /**
     * Exact colours for the accent fills, their label, the focus pair
     * (`PIN_ROLES`) and the colour the accent gradient runs to
     * (`GRADIENT_PINS`), per mode. Each replaces its derived value, and the
     * contrast law holds it to the derived value's floor.
     */
    pins: pinsSchema.optional(),
    /**
     * The palette a reader who asks for more contrast gets instead of this one
     * (`prefers-contrast: more`, or forced colours). The emitter writes that
     * palette's colours into this pairing's own block under the media query, so
     * the switch needs no script. Not a seed: no derivation of this palette
     * reads it.
     */
    moreContrast: paletteNameSchema.optional(),
    /**
     * The palette's recorded any-neighbour caps, kept with the palette they
     * belong to. The values are measured, not chosen: `chart-laws.test.ts`
     * measures every palette and fails with the measured value if a declaration
     * disagrees. Declaring them makes a change visible in review, such as a
     * retune raising a palette to four or a new seed falling below the canonical
     * three. `published` is the sheet's `--pm-chart-cap`, the minimum of the two
     * modes.
     *
     * Optional because a guest palette admitted through `./admit` needs no
     * record. The catalogue law requires it of every committed palette.
     */
    chartCaps: z
      .strictObject({
        light: z.number().int().min(0),
        dark: z.number().int().min(0),
        published: z.number().int().min(0),
      })
      .optional(),
  })
  .refine((palette) => palette.moreContrast !== palette.name, {
    path: ['moreContrast'],
    message: 'moreContrast names another palette — a palette cannot be its own partner',
  })
  // A gradient has one shape in both modes, so a palette with no partner hue
  // pins its gradient stop in both modes or in neither (`gradientPinFault`).
  .superRefine((palette, ctx) => {
    const fault = gradientPinFault(palette)
    if (fault !== undefined) ctx.addIssue({ code: 'custom', path: ['pins'], message: fault })
  })

export type Palette = z.infer<typeof paletteSchema>

/** Throws a `ZodError` naming the offending path. Used by system loading. */
export function parseSystem(input: unknown): System {
  return systemSchema.parse(input)
}

/** Throws a `ZodError` naming the offending path. Used by palette loading. */
export function parsePalette(input: unknown): Palette {
  return paletteSchema.parse(input)
}

/**
 * The pair id, for example `pastel/amethyst`: `Theme.name`, ledger keys,
 * failure messages, and the cache key an app's `ensurePairing` passes to
 * `appendThemeCSS`. Never a DOM attribute; the document carries `data-system`
 * and `data-palette` separately.
 *
 * Unrelated to `pairingId` in `pairings.ts`, which names a *contrast* pairing
 * (a foreground on a background).
 */
export function pairId(system: string, palette: string): string {
  return `${system}/${palette}`
}

/**
 * Joins the two halves into the pairing the engine resolves. The seeds are the
 * palette without its name, plus the system's fonts. This is the one place
 * that defines the split.
 */
export function composeTheme(system: System, palette: Palette): Theme {
  // `$schema` (editor tooling), `chartCaps` (measured record) and `moreContrast`
  // (another palette's name) are not seeds, so they are removed with the name.
  // The drift law checks the parity.
  const {
    name: _palette,
    $schema: _schema,
    chartCaps: _caps,
    moreContrast: _partner,
    ...color
  } = palette
  const seeds: Seeds = { ...color, fonts: system.fonts }

  return {
    name: pairId(system.name, palette.name),
    system: system.name,
    palette: palette.name,
    axes: system.axes,
    seeds,
    defaultMode: system.defaultMode,
    kind: system.kind,
    overrides: system.overrides,
  }
}
