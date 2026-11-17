import { z } from 'zod'

import type { Axes } from './axes'
import type { ChartRoleValues, ColorRoleValues, GradientRoleValues } from './roles'
import type { FontRole, Seeds } from './seeds'
// Type-only, so the `systems -> theme` value import forms no runtime cycle (as
// with `tokens -> theme`).
import type { ComponentException, SystemOverrides } from './systems'
import type { NonColorTokens } from './tokens'

export const MODES = ['light', 'dark'] as const
export type Mode = (typeof MODES)[number]
export const modeSchema = z.enum(MODES)

export const MODE_PREFERENCES = ['light', 'dark', 'system'] as const
export type ModePreference = (typeof MODE_PREFERENCES)[number]
export const modePreferenceSchema = z.enum(MODE_PREFERENCES)

export const THEME_KINDS = ['designed', 'tenant'] as const
export type ThemeKind = (typeof THEME_KINDS)[number]

/**
 * A **pairing**: one system × one palette, resolved as one theme.
 *
 * Composed by `composeTheme`, never parsed, because the halves are what is on
 * disk and what a schema validates. The rest of the engine (`resolveTheme`,
 * the contrast law, the gradient catalogue, the emitter) only sees a `Theme`.
 */
export interface Theme {
  /**
   * The pair id, `<system>/<palette>`, for ledger keys, failure messages and
   * test names. Never a DOM attribute; the document has the names separately.
   */
  name: string
  system: string
  palette: string
  axes: Axes
  seeds: Seeds
  defaultMode: ModePreference
  /**
   * A **designed** system is its own design and is held to the divergence law.
   * A **tenant** is a designed system's axes with other brand seeds, so it must
   * not diverge. The system declares it; the palette has no say.
   */
  kind: ThemeKind
  /**
   * The system document's value-only overrides, passed to the derivation.
   */
  overrides?: SystemOverrides
}

/**
 * A theme with every value computed: colours per mode, non-colour tokens for
 * all three densities, and font stacks. The only input the emitter accepts.
 */
export interface ResolvedTheme {
  /** The pair id. The emitted selector is scoped on `system` and `palette`. */
  name: string
  system: string
  palette: string
  axes: Axes
  seeds: Seeds
  defaultMode: ModePreference
  kind: ThemeKind
  /** Dark is derived separately, never inverted from light. */
  color: Record<Mode, ColorRoleValues>
  /** Two-stop roles, or their solid no-op form when no partner hue is seeded. */
  gradient: Record<Mode, GradientRoleValues>
  /**
   * The chart palette, derived per pairing and mode like every colour, so a
   * palette change recolours charts with no app edits (`docs/charts.md`).
   */
  chart: Record<Mode, ChartRoleValues>
  /**
   * The any-neighbour series cap, emitted as `--pm-chart-cap`: an integer the
   * palette laws measure, not a role. Charts where any two marks can be
   * adjacent (scatter, small multiples, radar) read it from the palette. The
   * minimum across modes, one number per pairing.
   */
  chartCap: number
  /**
   * The glass pane's fill, `--pm-material-surface`: `bg.surface` at the mode's
   * `GLASS_SURFACE_MIX` under `depth: glass`, else `bg.surface` unchanged. A
   * finished colour, because the value law forbids `color-mix` in recipes and
   * the audit needs one string to measure.
   */
  materialSurface: Record<Mode, string>
  /**
   * The declared exceptions, always an array so the emitter only counts them.
   * Empty when none are declared, and then the emitter writes nothing.
   */
  exceptions: readonly ComponentException[]
  tokens: NonColorTokens
  /** Family name plus its system fallback stack, ready to emit. */
  fonts: Record<FontRole, string>
}
