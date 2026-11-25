import { DENSITIES, MOTION_TEMPERAMENTS, type Density, type MotionTemperament } from './axes'
import { cssVarName, DATA_ATTRS, EXPOSED_AXES, MEMBER_ATTR, MORE_CONTRAST_QUERY } from './css-vars'
import { CHART_ROLES, COLOR_ROLES, GRADIENT_ROLES, type ChartRole, type ColorRole } from './roles'
import { FONT_ROLES } from './seeds'
// Type-only, because `systems` imports this file's neighbours as values and a
// value import back would create a runtime cycle.
import type { ComponentException } from './systems'
import { MODES, type Mode, type ResolvedTheme } from './theme'
import {
  AMBIENT_ROLES,
  DISPLAY_STEPS,
  GLOW_STEPS,
  ICON_SIZES,
  INSET_ASSIGNMENT_CLASSES,
  RADIUS_ASSIGNMENT_CLASSES,
  RADIUS_STEPS,
  SHADOW_ASSIGNMENT_CLASSES,
  SHADOW_STEPS,
  SPACE_STEPS,
  SPRING_ROLES,
  TEXT_STEPS,
  Z_STEPS,
  type DisplayStep,
  type DisplayStyle,
  type TextStep,
  type TypeStyle,
} from './tokens'

/**
 * The resolved theme as CSS custom properties: the whole interface between the
 * engine and everything that renders. Components read `var(--pm-*)` and know
 * nothing of axes, ramps or modes.
 *
 * Output is deterministic, so it can be snapshot-tested and diffed in review.
 */

const INDENT = '  '

/**
 * The pairing's selector: both names together. A document with only one
 * matches no block, because half a pairing is not a theme.
 */
function pairSelector(theme: ResolvedTheme): string {
  return `[${DATA_ATTRS.system}="${theme.system}"][${DATA_ATTRS.palette}="${theme.palette}"]`
}

/**
 * Every scope is emitted twice: for the element with the pairing and the inner
 * attribute (usually `<html data-system data-palette data-mode>`), and for a
 * descendant with only the inner attribute, so a nested scope (a compact
 * table, an inverted panel) works with one attribute.
 *
 * The descendant form's pair prefix is in `:where()`, so a nested element with
 * its own pairing matches its own selector at three attributes of specificity
 * and the ancestor's at one. Its own scope wins. Otherwise they would tie and
 * source order (alphabetical) would pick the pairing for a nested specimen.
 */
function scoped(theme: ResolvedTheme, attr: string, value: string): string[] {
  const outer = pairSelector(theme)
  return [`${outer}[${attr}="${value}"]`, `:where(${outer}) [${attr}="${value}"]`]
}

function block(selectors: readonly string[], declarations: readonly string[]): string {
  if (declarations.length === 0) return ''
  return `${selectors.join(',\n')} {\n${declarations.map((d) => INDENT + d).join('\n')}\n}\n`
}

/** The class token an exception redirects, and the step it points to. */
function exceptionDeclaration(exception: ComponentException): string {
  const step =
    exception.family === 'inset'
      ? cssVarName(`space.${exception.step}`)
      : cssVarName(`${exception.family}.${exception.step}`)
  return declare(`${exception.family}.${exception.class}`, `var(${step})`)
}

/**
 * Component exceptions declared in a system file (`docs/rules.md`), emitted as
 * a **donut scope** per pairing.
 *
 * `@scope (pair) to ([data-system][data-palette])` means: inside this pairing,
 * but not inside a nested one. The inner rule sets the class token on the
 * member's own element, which beats the inherited base value. Without the
 * lower boundary, a page-pairing exception would also change members in the
 * studio's preview (a nested pairing), and the preview would show the draft
 * wrongly. A plain descendant selector has exactly that problem.
 *
 * The declaration references a step token, like the shell tokens, so the
 * member still follows density, mode and scale overrides. An exception only
 * chooses among steps the axes derived lawfully, so coherence needs no new
 * audit.
 *
 * **A scoping root that matches the `to()` limit excludes itself.** An element
 * that both scopes a pairing and has `data-member` is outside its own donut,
 * and the exception would skip it (confirmed by experiment). This cannot happen
 * while no member sets `data-system`/`data-palette` on itself, but the first
 * that does (a themed embed, a preview pane that is also a member) will hit it.
 *
 * Systems with no exceptions emit nothing, so their sheet is unchanged byte for
 * byte. Each exception costs about one line, counted by the size budget law.
 * Portaled surfaces render outside nested pairings, so their members resolve
 * against the page pairing; the docs' fixture-isolation iframes exist for the
 * same reason. This limitation is accepted.
 */
function exceptionBlocks(theme: ResolvedTheme): string {
  if (theme.exceptions.length === 0) return ''

  const byMember = new Map<string, string[]>()
  for (const exception of theme.exceptions) {
    const declarations = byMember.get(exception.component) ?? []
    declarations.push(exceptionDeclaration(exception))
    byMember.set(exception.component, declarations)
  }

  const rules = [...byMember.entries()].map(
    ([member, declarations]) =>
      `${INDENT}[${MEMBER_ATTR}="${member}"] {\n` +
      `${declarations.map((declaration) => INDENT + INDENT + declaration).join('\n')}\n` +
      `${INDENT}}`,
  )

  const boundary = `[${DATA_ATTRS.system}][${DATA_ATTRS.palette}]`
  return `@scope (${pairSelector(theme)}) to (${boundary}) {\n${rules.join('\n')}\n}\n`
}

function declare(tokenPath: string, value: string | number): string {
  return `${cssVarName(tokenPath)}: ${value};`
}

function typeDeclarations(prefix: string, step: string, style: TypeStyle): string[] {
  return [
    declare(`${prefix}.${step}.size`, style.size),
    declare(`${prefix}.${step}.lineHeight`, style.lineHeight),
    declare(`${prefix}.${step}.weight`, style.weight),
    // References the font role, so changing a family is one edit.
    declare(`${prefix}.${step}.family`, `var(${cssVarName(`font.${style.family}`)})`),
    declare(`${prefix}.${step}.tracking`, style.tracking),
  ]
}

/** The type quartet plus the treatments only display type gets. */
function displayDeclarations(step: string, style: DisplayStyle): string[] {
  return [
    ...typeDeclarations('display', step, style),
    declare(`display.${step}.opsz`, style.opsz),
    declare(`display.${step}.style`, style.style),
  ]
}

/**
 * Gradient roles. Each property holds a `linear-gradient(...)` or a plain
 * colour, so `background: var(--pm-accent-gradient)` works either way.
 *
 * The stops are emitted too, for borders or shadows in the same colours,
 * instead of parsing our own gradient string.
 */
function gradientDeclarations(theme: ResolvedTheme, mode: Mode): string[] {
  return GRADIENT_ROLES.flatMap((role) => {
    const value = theme.gradient[mode][role]
    return [
      declare(role, value.css),
      declare(`${role}.from`, value.from),
      declare(`${role}.to`, value.to),
    ]
  })
}

function densityDeclarations(theme: ResolvedTheme, density: Density): string[] {
  const tokens = theme.tokens.density[density]
  return [
    ...SPACE_STEPS.map((step) => declare(`space.${step}`, tokens.space[step])),
    ...(['sm', 'md', 'lg'] as const).map((size) =>
      declare(`controlHeight.${size}`, tokens.controlHeight[size]),
    ),
  ]
}

/**
 * The tokens that are references to what a density or a mode sets: the inset
 * classes (space steps), the halos and the shell's region surfaces (colour
 * roles). A custom property's `var()` is resolved where the property is
 * declared, so a reference declared only on the pairing would keep the
 * pairing's spacing inside a `DensityScope` and its mode's colours inside a
 * nested `[data-mode]`. One block declares them on the pairing and again on
 * every density and mode scope inside it, where each resolves against that
 * scope's values; the values are the same text at every density and in every
 * mode, so one block serves them all. The inverse tone is not among those
 * scopes: it borrows the colour and chart roles alone (`inverseDeclarations`).
 */
function referenceBlock(theme: ResolvedTheme): string {
  const selector = pairSelector(theme)
  return block(
    [selector, `:where(${selector}) :is([${DATA_ATTRS.density}], [${DATA_ATTRS.mode}])`],
    [
      ...INSET_ASSIGNMENT_CLASSES.map((cls) =>
        declare(`inset.${cls}`, theme.tokens.insetAssign[cls]),
      ),
      ...GLOW_STEPS.map((step) => declare(`glow.${step}`, theme.tokens.glow[step])),
      declare('shell.topbar.bg', theme.tokens.shell.topbarBg),
      declare('shell.rail.bg', theme.tokens.shell.railBg),
      declare('shell.topbar.border', theme.tokens.shell.topbarBorder),
      declare('shell.rail.border', theme.tokens.shell.railBorder),
    ],
  )
}

function motionDeclarations(theme: ResolvedTheme, temperament: MotionTemperament): string[] {
  const motion = theme.tokens.motion[temperament]
  return [
    ...Object.entries(motion.duration).map(([role, value]) =>
      declare(`motion.duration.${role}`, value),
    ),
    ...Object.entries(motion.easing).map(([role, value]) =>
      declare(`motion.easing.${role}`, value),
    ),
    // The motion engine (`@polymorph/engine/motion`) reads springs, not CSS, but
    // emitting them here keeps one source of truth per temperament.
    ...SPRING_ROLES.flatMap((role) => [
      declare(`motion.spring.${role}.stiffness`, motion.spring[role].stiffness),
      declare(`motion.spring.${role}.damping`, motion.spring[role].damping),
      declare(`motion.spring.${role}.mass`, motion.spring[role].mass),
    ]),
    // CSS-consumed motion values beyond durations: press feedback scale and
    // ambient loop periods.
    declare('motion.pressScale', motion.pressScale),
    ...AMBIENT_ROLES.map((role) => declare(`motion.ambient.${role}`, motion.ambient[role])),
    // The bounded stagger primitive: the per-item delay and its maximum.
    declare('motion.stagger.step', motion.stagger.step),
    declare('motion.stagger.max', motion.stagger.max),
  ]
}

function colorDeclarations(theme: ResolvedTheme, mode: Mode): string[] {
  return COLOR_ROLES.map((role) => declare(role, theme.color[mode][role]))
}

/**
 * The chart palette, emitted next to the colour roles because it is not built
 * from them: twenty-five values per mode from the wheel and the neutral ramp,
 * so a palette change recolours the charts.
 *
 * `--pm-chart-cap` is in the same block but is not a role. It is the
 * pairing's any-neighbour series cap, so a scatter or radar chart reads its
 * limit from the palette. It is the minimum across modes, so it is the same in
 * every block and never borrowed.
 */
function chartDeclarations(theme: ResolvedTheme, mode: Mode): string[] {
  return [
    ...CHART_ROLES.map((role) => declare(role, theme.chart[mode][role])),
    declare('chart.cap', theme.chartCap),
  ]
}

/**
 * `[data-tone="inverse"]` borrows the opposite mode's value for every role that
 * differs between modes, not a second palette. Mode-invariant roles (the solid
 * brand fills) drop out automatically.
 *
 * Charts borrow too, because an inverted panel has the other mode's surface.
 */
function inverseDeclarations(
  theme: ResolvedTheme,
  mode: Mode,
  alongside?: ResolvedTheme,
): string[] {
  const opposite: Mode = mode === 'light' ? 'dark' : 'light'
  // `alongside` is the block this one overrides. A role that block borrows must
  // be borrowed here too, or its value would show through in an inverse region.
  const differs = (role: ColorRole) =>
    [theme, alongside].some(
      (t) => t !== undefined && t.color[mode][role] !== t.color[opposite][role],
    )
  const chartDiffers = (role: ChartRole) =>
    [theme, alongside].some(
      (t) => t !== undefined && t.chart[mode][role] !== t.chart[opposite][role],
    )
  return [
    ...COLOR_ROLES.filter(differs).map((role) => declare(role, theme.color[opposite][role])),
    ...CHART_ROLES.filter(chartDiffers).map((role) => declare(role, theme.chart[opposite][role])),
  ]
}

export { MORE_CONTRAST_QUERY }

/**
 * The partner palette's colours under this pairing's selectors, inside the
 * more-contrast media query (`Palette.moreContrast`).
 *
 * Only colour changes between a palette and its partner on one system: every
 * other token comes from the system. So the block re-declares what a mode
 * declares (colour, gradient and chart roles, the glass surface) for the
 * fallback mode, each mode and each inverse region, with the same selectors as
 * the blocks above it. Equal specificity and a later position let it win while
 * the query matches. The references (glows, shell surfaces) resolve against
 * the roles it declares, so they follow without being restated.
 */
function moreContrastBlock(theme: ResolvedTheme, partner: ResolvedTheme): string {
  const fallbackMode: Mode = theme.defaultMode === 'dark' ? 'dark' : 'light'
  const colours = (mode: Mode) => [
    ...colorDeclarations(partner, mode),
    ...gradientDeclarations(partner, mode),
    ...chartDeclarations(partner, mode),
    declare('material.surface', partner.materialSurface[mode]),
  ]
  const blocks = [
    block([pairSelector(theme)], colours(fallbackMode)),
    ...MODES.map((mode) => block(scoped(theme, DATA_ATTRS.mode, mode), colours(mode))),
    ...MODES.map((mode) =>
      block(
        scoped(theme, DATA_ATTRS.mode, mode).map(
          (base) => `${base} [${DATA_ATTRS.tone}="inverse"]`,
        ),
        inverseDeclarations(partner, mode, theme),
      ),
    ),
  ].filter(Boolean)
  const body = blocks
    .join('\n')
    .split('\n')
    .map((line) => (line === '' ? line : INDENT + line))
    .join('\n')
  return `@media ${MORE_CONTRAST_QUERY} {\n${body}}\n`
}

export interface EmitThemeOptions {
  /**
   * The same system resolved with the palette's `moreContrast` partner. Its
   * colours are written into this pairing's block under the more-contrast
   * media query. Absent, the block has no such query.
   */
  moreContrast?: ResolvedTheme
}

export function emitThemeCSS(theme: ResolvedTheme, options: EmitThemeOptions = {}): string {
  const partner = options.moreContrast
  if (partner !== undefined && partner.system !== theme.system) {
    throw new Error(
      `emitThemeCSS: the more-contrast partner of ${theme.name} is ${partner.name}, on another ` +
        'system. A partner changes the palette only.',
    )
  }
  const selector = pairSelector(theme)

  // What the pairing attributes alone provide: the mode-independent scale plus
  // the theme's default density, temperament and mode, so a page without
  // `data-mode` still renders correctly.
  const fallbackMode: Mode = theme.defaultMode === 'dark' ? 'dark' : 'light'
  const texturePerMode = theme.tokens.texture.page.light !== theme.tokens.texture.page.dark

  const base = [
    // Axis flags first, because recipes' style queries read them.
    ...EXPOSED_AXES.map((axis) => declare(`axis.${axis}`, theme.axes[axis])),
    ...FONT_ROLES.map((role) => declare(`font.${role}`, theme.fonts[role])),
    ...TEXT_STEPS.flatMap((step: TextStep) =>
      typeDeclarations('text', step, theme.tokens.text[step]),
    ),
    // The text-entry floor, CSS-only: the focus zoom is a browser behaviour.
    declare('text.entry.size', theme.tokens.textEntry.size),
    declare('text.entry.lineHeight', theme.tokens.textEntry.lineHeight),
    ...DISPLAY_STEPS.flatMap((step: DisplayStep) =>
      displayDeclarations(step, theme.tokens.display[step]),
    ),
    declare('font.numeric', theme.tokens.numeric),
    // A system choice that is a value: a numeric column's `text-align`.
    declare('numeric.align', theme.tokens.numericAlign),
    ...RADIUS_STEPS.map((step) => declare(`radius.${step}`, theme.tokens.radius[step])),
    // The assignment classes, as references after the steps they point to.
    ...RADIUS_ASSIGNMENT_CLASSES.map((cls) =>
      declare(`radius.${cls}`, theme.tokens.radiusAssign[cls]),
    ),
    ...SHADOW_ASSIGNMENT_CLASSES.map((cls) =>
      declare(`shadow.${cls}`, theme.tokens.shadowAssign[cls]),
    ),
    ...SHADOW_STEPS.map((step) => declare(`shadow.${step}`, theme.tokens.shadow[step])),
    declare('shadow.insetTop', theme.tokens.insetTop),
    // Blur and saturate are in every pairing, so the property set stays
    // identical, though only glass uses them. The pane's fill varies by mode,
    // so it is emitted with the colours below; this is the fallback.
    declare('material.blur', theme.tokens.material.blur),
    declare('material.saturate', theme.tokens.material.saturate),
    declare('material.surface', theme.materialSurface[fallbackMode]),
    // A texture that varies by mode is declared again with each mode's colours;
    // this is the fallback, and the only declaration of one that does not.
    declare('texture.page', theme.tokens.texture.page[fallbackMode]),
    declare('focus.width', theme.tokens.focus.width),
    declare('focus.offset', theme.tokens.focus.offset),
    // Flags a recipe branches on with a style query: where the focus mark
    // sits, read from the offset, and two system choices. A value cannot carry
    // them: each switches which role a rule reads, and a reference token would
    // not follow `[data-tone="inverse"]`.
    declare('focus.place', theme.tokens.focus.place),
    declare('focus.field', theme.tokens.focus.field),
    declare('hover.unfilled', theme.tokens.hover.unfilled),
    // The same at every density, so the base block is its only declaration.
    declare('hitTarget', theme.tokens.hitTarget),
    ...ICON_SIZES.map((size) => declare(`icon.size.${size}`, theme.tokens.icon.size[size])),
    ...ICON_SIZES.map((size) => declare(`icon.stroke.${size}`, theme.tokens.icon.stroke[size])),
    // The unsuffixed name is the md anchor, for component CSS that expects one
    // stroke value (vendored copies can lag behind the emitter).
    declare('icon.stroke', theme.tokens.icon.stroke.md),
    // The stacking ladder is fixed, so it is in the base block.
    ...Z_STEPS.map((step) => declare(`z.${step}`, theme.tokens.z[step])),
    ...densityDeclarations(theme, theme.axes.density),
    ...motionDeclarations(theme, theme.axes.motionTemperament),
    ...colorDeclarations(theme, fallbackMode),
    ...gradientDeclarations(theme, fallbackMode),
    ...chartDeclarations(theme, fallbackMode),
  ]

  return [
    block([selector], base),
    referenceBlock(theme),
    ...DENSITIES.map((density) =>
      block(scoped(theme, DATA_ATTRS.density, density), densityDeclarations(theme, density)),
    ),
    ...MOTION_TEMPERAMENTS.map((temperament) =>
      block(scoped(theme, DATA_ATTRS.motion, temperament), motionDeclarations(theme, temperament)),
    ),
    ...MODES.map((mode) =>
      block(scoped(theme, DATA_ATTRS.mode, mode), [
        ...colorDeclarations(theme, mode),
        ...gradientDeclarations(theme, mode),
        ...chartDeclarations(theme, mode),
        // A texture the same in both modes (grain) is inherited from the base
        // block. It is the longest value in the sheet, a data URI.
        ...(texturePerMode ? [declare('texture.page', theme.tokens.texture.page[mode])] : []),
        declare('material.surface', theme.materialSurface[mode]),
      ]),
    ),
    ...MODES.map((mode) =>
      block(
        scoped(theme, DATA_ATTRS.mode, mode).map(
          (base) => `${base} [${DATA_ATTRS.tone}="inverse"]`,
        ),
        inverseDeclarations(theme, mode),
      ),
    ),
    partner === undefined ? '' : moreContrastBlock(theme, partner),
    exceptionBlocks(theme),
  ]
    .filter(Boolean)
    .join('\n')
}

/** One stylesheet for every registered theme, in the order given. */
export function emitThemesCSS(themes: readonly ResolvedTheme[]): string {
  return themes.map((theme) => emitThemeCSS(theme)).join('\n')
}
