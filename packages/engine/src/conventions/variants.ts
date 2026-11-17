/**
 * Variant typing. Two independent enums allow any variant with any tone, and a
 * design system almost never allows that.
 *
 * Button is the main example. `tone="neutral"` is lawful for `outline` and
 * `ghost` and excluded for the filled variants. The catalogue has no neutral
 * interactive fill, and a grey filled button competes with every surface role
 * it sits on (`design/components/button.md`). Encoding the grid as a union makes
 * an unlawful cell a **type error at the call site**, instead of a runtime
 * warning or an unintended rendered button.
 */

/**
 * The constraint on a grid: every value is a tone name.
 *
 * It is self-referential instead of `Record<string, string>`. An
 * `interface ButtonGrid { solid: 'accent' | 'danger' }` has no implicit index
 * signature and would not satisfy `Record<string, string>`, so the utility would
 * reject the interface style that components such as Button use.
 */
export type VariantGrid<Grid> = { [K in keyof Grid]: string }

/**
 * A lawful variant × tone grid.
 *
 * ```ts
 * type ButtonAppearance = LawfulVariants<{
 *   solid: 'accent' | 'danger'
 *   soft: 'accent' | 'danger'
 *   outline: 'neutral' | 'accent' | 'danger'
 *   ghost: 'neutral' | 'accent' | 'danger'
 * }>
 * ```
 *
 * Both keys stay optional so a component can default them, and the union still
 * rejects a mismatched pair: `{ variant: 'solid', tone: 'neutral' }` matches no
 * member, because the `solid` member does not accept that tone and the members
 * that do accept it do not accept that variant.
 */
export type LawfulVariants<Grid extends VariantGrid<Grid>> = {
  [V in keyof Grid]: { variant?: V; tone?: Grid[V] }
}[keyof Grid]

/** Every variant the grid names, for iteration in a states fixture. */
export type VariantOf<Grid extends VariantGrid<Grid>> = keyof Grid & string

/** Every tone the grid names anywhere. */
export type ToneOf<Grid extends VariantGrid<Grid>> = Grid[keyof Grid]

/**
 * The lawful cells as a flat list. A states fixture builds its variant × tone
 * entries from it, so the gallery shows exactly the cells that exist.
 */
export function lawfulCells<Grid extends VariantGrid<Grid>>(grid: {
  [V in keyof Grid]: readonly Grid[V][]
}): { variant: VariantOf<Grid>; tone: ToneOf<Grid> }[] {
  return Object.entries(grid).flatMap(([variant, tones]) =>
    (tones as readonly string[]).map((tone) => ({
      variant: variant as VariantOf<Grid>,
      tone: tone as ToneOf<Grid>,
    })),
  )
}
