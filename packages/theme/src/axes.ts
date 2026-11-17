import { z } from 'zod'

/**
 * The design axes: the parameter space of the system (`docs/theming.md`).
 *
 * A theme assigns all eight. Every visible value derives from the axes plus the
 * seeds, and only the axes decide what kind of system a theme is.
 */

export const GEOMETRIES = ['sharp', 'crisp', 'soft', 'round'] as const
export type Geometry = (typeof GEOMETRIES)[number]

/**
 * How surfaces separate. `glass` separates by material (translucency and
 * backdrop blur), with shadow secondary. It is a depth value, not a ninth axis,
 * like texture: the set is fixed at eight, and choosing material means not
 * separating with borders or shadow alone.
 *
 * Ordered by strength: nothing, a line, a cast shadow, a pane of material.
 */
export const DEPTHS = ['flat', 'borders', 'elevated', 'glass'] as const
export type Depth = (typeof DEPTHS)[number]

export const DENSITIES = ['compact', 'standard', 'comfortable'] as const
export type Density = (typeof DENSITIES)[number]

export const CONTRAST_TEMPERAMENTS = ['soft', 'standard', 'stark'] as const
export type ContrastTemperament = (typeof CONTRAST_TEMPERAMENTS)[number]

export const TYPE_PERSONALITIES = ['grotesque', 'humanist', 'mono', 'editorial'] as const
export type TypePersonality = (typeof TYPE_PERSONALITIES)[number]

export const COLOR_STRATEGIES = ['quiet', 'tinted'] as const
export type ColorStrategy = (typeof COLOR_STRATEGIES)[number]

export const MOTION_TEMPERAMENTS = ['none', 'subtle', 'standard', 'expressive'] as const
export type MotionTemperament = (typeof MOTION_TEMPERAMENTS)[number]

/**
 * Ornament, including page texture.
 *
 * Texture is part of ornament (how much decoration a system permits), not a
 * ninth axis. `none` permits no decoration, `minimal` permits ornament without
 * texture, and `grain` / `grid` add the named texture.
 *
 * The values are ordered by amount, which is why this is one axis and not a
 * flag plus an enum.
 */
export const ORNAMENTS = ['none', 'minimal', 'grain', 'grid'] as const
export type Ornament = (typeof ORNAMENTS)[number]

/** The ornament levels that put a texture on the page. `none`/`minimal` do not. */
export const TEXTURED_ORNAMENTS = ['grain', 'grid'] as const satisfies readonly Ornament[]
export type TexturedOrnament = (typeof TEXTURED_ORNAMENTS)[number]

export function hasTexture(ornament: Ornament): ornament is TexturedOrnament {
  return ornament === 'grain' || ornament === 'grid'
}

export const geometrySchema = z.enum(GEOMETRIES)
export const depthSchema = z.enum(DEPTHS)
export const densitySchema = z.enum(DENSITIES)
export const contrastTemperamentSchema = z.enum(CONTRAST_TEMPERAMENTS)
export const typePersonalitySchema = z.enum(TYPE_PERSONALITIES)
export const colorStrategySchema = z.enum(COLOR_STRATEGIES)
export const motionTemperamentSchema = z.enum(MOTION_TEMPERAMENTS)
export const ornamentSchema = z.enum(ORNAMENTS)

export const axesSchema = z.strictObject({
  geometry: geometrySchema,
  depth: depthSchema,
  density: densitySchema,
  contrastTemperament: contrastTemperamentSchema,
  typePersonality: typePersonalitySchema,
  colorStrategy: colorStrategySchema,
  motionTemperament: motionTemperamentSchema,
  ornament: ornamentSchema,
})

export type Axes = z.infer<typeof axesSchema>

/**
 * Axis names in the order coherence checks, the divergence law and the
 * `/tokens` gallery iterate.
 */
export const AXIS_NAMES = [
  'geometry',
  'depth',
  'density',
  'contrastTemperament',
  'typePersonality',
  'colorStrategy',
  'motionTemperament',
  'ornament',
] as const satisfies readonly (keyof Axes)[]

export type AxisName = (typeof AXIS_NAMES)[number]

/** Every legal value per axis, for enumeration and gallery controls. */
export const AXIS_VALUES = {
  geometry: GEOMETRIES,
  depth: DEPTHS,
  density: DENSITIES,
  contrastTemperament: CONTRAST_TEMPERAMENTS,
  typePersonality: TYPE_PERSONALITIES,
  colorStrategy: COLOR_STRATEGIES,
  motionTemperament: MOTION_TEMPERAMENTS,
  ornament: ORNAMENTS,
} as const satisfies { [K in AxisName]: readonly Axes[K][] }

/** How many axes two themes differ on, the divergence law's measure. */
export function axisDivergence(a: Axes, b: Axes): number {
  return AXIS_NAMES.filter((axis) => a[axis] !== b[axis]).length
}
