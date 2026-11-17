import { chartSeriesCap, resolveChart, resolveColors, resolveGradients } from './color'
import { generateAllRamps, resolveMaterialSurface } from './color/resolve'
import { deriveFontStacks, deriveNonColorTokens } from './derive'
import type { EmitThemeOptions } from './emit'
import { composeTheme, type Palette, type System } from './systems'
import type { ResolvedTheme, Theme } from './theme'

/**
 * The single entry point: a validated theme in, a fully resolved token set out.
 * Colour (`./color`) and everything else (`./derive`) are derived independently
 * and combined here. The CSS emitter (`./emit`) accepts only the result.
 */
export function resolveTheme(theme: Theme): ResolvedTheme {
  // Generated once and shared by the three colour passes below. Each pass
  // still builds its own by default, so it can be called alone.
  const ramps = generateAllRamps(theme.seeds)
  const color = resolveColors(theme, ramps)
  // Charts are resolved after colours, like gradients: the wheel is
  // independent, but grid and axis are measured against the surfaces the
  // contrast law has settled. (The midpoint and the de-emphasis grey come from
  // the raw neutral ramp.)
  const chart = resolveChart(theme, color, ramps)
  return {
    name: theme.name,
    system: theme.system,
    palette: theme.palette,
    axes: theme.axes,
    seeds: theme.seeds,
    defaultMode: theme.defaultMode,
    kind: theme.kind,
    color,
    // After colours, because the first stop is a colour role the contrast law
    // may have adjusted.
    gradient: resolveGradients(theme, color, ramps),
    chart,
    // Measured from the resolved slots, so the audit and the sheet report the
    // same series cap.
    chartCap: chartSeriesCap(chart),
    // After colours too, because its base is a role the law may have adjusted.
    materialSurface: resolveMaterialSurface(color, theme.axes.depth),
    exceptions: theme.overrides?.exceptions ?? [],
    tokens: deriveNonColorTokens(
      theme.axes,
      theme.seeds.fonts.display.style ?? 'normal',
      theme.overrides ?? {},
    ),
    fonts: deriveFontStacks(theme.axes, theme.seeds),
  }
}

/**
 * The emit options for a pairing of a catalogue the caller holds: the same
 * system resolved with the palette's more-contrast partner, found by name in
 * `palettes`, or no options when the palette names no partner. A tool or app
 * that emits its own catalogue passes them to `emitThemeCSS`, as `admitTheme`
 * passes the partner it is given. Throws when `palettes` holds no palette of
 * the partner's name, because the block would then have no more-contrast
 * query and nothing would say so.
 */
export function moreContrastOf(
  system: System,
  palette: Palette,
  palettes: readonly Palette[],
): EmitThemeOptions {
  if (palette.moreContrast === undefined) return {}
  const partner = palettes.find((candidate) => candidate.name === palette.moreContrast)
  if (partner === undefined) {
    throw new Error(
      `moreContrastOf: ${palette.name} names the more-contrast palette ` +
        `"${palette.moreContrast}", and the catalogue holds no palette of that name`,
    )
  }
  return { moreContrast: resolveTheme(composeTheme(system, partner)) }
}
