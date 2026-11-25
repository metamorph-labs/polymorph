import { describe, expect, it } from 'vitest'

import {
  DENSITIES,
  GEOMETRIES,
  MOTION_TEMPERAMENTS,
  TYPE_PERSONALITIES,
  type Axes,
  type Density,
} from './axes'
import {
  DENSITY_MULTIPLIER,
  deriveFontStacks,
  deriveNonColorTokens,
  EXIT_RATIO,
  focusPx,
  GEOMETRY_RADII,
  MOTION_SCALE,
  SPACE_LADDER_PX,
  TYPE_BASE_PX,
  TYPE_RATIO,
  typeSizePx,
} from './derive'
import { exampleQuietTheme } from './examples'
import { resolveTheme } from './resolve-theme'
import { DISPLAY_STEPS, SPACE_STEPS, TEXT_STEPS } from './tokens'

const base = exampleQuietTheme.axes

function axesWith(overrides: Partial<Axes>): Axes {
  return { ...base, ...overrides }
}

const px = (value: string) => parseFloat(value)
const remPx = (value: string) => parseFloat(value) * TYPE_BASE_PX

describe('type scale', () => {
  it('anchors md at the 16px base', () => {
    for (const density of DENSITIES) {
      const tokens = deriveNonColorTokens(axesWith({ density }))
      expect(remPx(tokens.text.md.size), density).toBe(TYPE_BASE_PX)
    }
  })

  it('rises monotonically through text and on into display', () => {
    const { text, display } = deriveNonColorTokens(base)
    const sizes = [
      ...TEXT_STEPS.map((s) => remPx(text[s].size)),
      ...DISPLAY_STEPS.map((s) => remPx(display[s].size)),
    ]
    for (let i = 1; i < sizes.length; i += 1) {
      expect(sizes[i], `step ${i}`).toBeGreaterThan(sizes[i - 1] ?? 0)
    }
  })

  it('keeps the smallest step legible at every density', () => {
    for (const density of DENSITIES) {
      const tokens = deriveNonColorTokens(axesWith({ density }))
      // A pure modular ratio would drop `xs` under 10px at comfortable density.
      expect(remPx(tokens.text.xs.size), density).toBeGreaterThanOrEqual(11)
    }
  })

  it('uses a tighter ratio at compact density and a looser one at comfortable', () => {
    expect(TYPE_RATIO.compact).toBeLessThan(TYPE_RATIO.standard)
    expect(TYPE_RATIO.standard).toBeLessThan(TYPE_RATIO.comfortable)
    const compact = remPx(deriveNonColorTokens(axesWith({ density: 'compact' })).text['3xl'].size)
    const roomy = remPx(deriveNonColorTokens(axesWith({ density: 'comfortable' })).text['3xl'].size)
    expect(roomy).toBeGreaterThan(compact)
  })

  it('steps up by the ratio and down by a damped one', () => {
    const ratio = TYPE_RATIO.standard
    expect(typeSizePx(1, ratio)).toBeCloseTo(TYPE_BASE_PX * ratio, 0)
    // Damped: a step down is a smaller relative move than a step up.
    const upDelta = typeSizePx(1, ratio) - TYPE_BASE_PX
    const downDelta = TYPE_BASE_PX - typeSizePx(-1, ratio)
    expect(downDelta).toBeLessThan(upDelta)
  })

  it('emits sizes in rem and line-heights unitless', () => {
    const { text } = deriveNonColorTokens(base)
    for (const step of TEXT_STEPS) {
      expect(text[step].size, step).toMatch(/rem$/)
      expect(typeof text[step].lineHeight).toBe('number')
    }
  })

  it('loosens tracking on small text and tightens it on large', () => {
    const { text, display } = deriveNonColorTokens(axesWith({ typePersonality: 'grotesque' }))
    expect(text.xs.tracking).toBe('0.01em')
    expect(text.md.tracking).toBe('0em')
    // Display tracking tightens per step beyond the personality's `tight`:
    // sm keeps -0.02em, md removes 0.005em more, and lg another 0.005em.
    expect(display.sm.tracking).toBe('-0.02em')
    expect(display.lg.tracking).toBe('-0.03em')
  })

  it('gives every personality a distinct display weight or tracking', () => {
    const seen = new Set(
      TYPE_PERSONALITIES.map((typePersonality) => {
        const { display } = deriveNonColorTokens(axesWith({ typePersonality }))
        return `${display.md.weight}/${display.md.tracking}`
      }),
    )
    expect(seen.size).toBe(TYPE_PERSONALITIES.length)
  })

  it('routes text at the body family and display at the display family', () => {
    const { text, display } = deriveNonColorTokens(base)
    expect(text.md.family).toBe('body')
    expect(display.md.family).toBe('display')
  })
})

describe('space scale', () => {
  it('always emits all three density variants, because the axis only selects a default', () => {
    const tokens = deriveNonColorTokens(axesWith({ density: 'compact' }))
    expect(Object.keys(tokens.density).sort()).toEqual([...DENSITIES].sort())
  })

  it('scales the ladder by the density multiplier and keeps zero at zero', () => {
    for (const density of DENSITIES) {
      const { space } = deriveNonColorTokens(base).density[density]
      expect(space[0]).toBe('0px')
      for (const step of SPACE_STEPS) {
        const raw = (SPACE_LADDER_PX[step] ?? 0) * DENSITY_MULTIPLIER[density]
        if (raw === 0) continue
        // Within one grid unit of the ideal, and always on the grid.
        expect(Math.abs(px(space[step]) - raw), `${density} space.${step}`).toBeLessThanOrEqual(1)
      }
    }
  })

  it('keeps every dimension on the 2px grid', () => {
    for (const density of DENSITIES) {
      const { space, controlHeight } = deriveNonColorTokens(base).density[density]
      for (const step of SPACE_STEPS) {
        expect(px(space[step]) % 2, `${density} space.${step}`).toBe(0)
      }
      for (const size of ['sm', 'md', 'lg'] as const) {
        expect(px(controlHeight[size]) % 2, `${density} control ${size}`).toBe(0)
      }
    }
  })

  it('keeps the ladder monotonic at every density', () => {
    for (const density of DENSITIES) {
      const { space } = deriveNonColorTokens(base).density[density]
      for (let i = 1; i < SPACE_STEPS.length; i += 1) {
        const previous = px(space[SPACE_STEPS[i - 1] ?? 0])
        expect(px(space[SPACE_STEPS[i] ?? 0]), `space.${i}`).toBeGreaterThanOrEqual(previous)
      }
      // The ladder must still span its full range instead of collapsing into equal values.
      expect(px(space[10])).toBeGreaterThan(px(space[5]) * 3)
    }
  })

  it('never drops a control below the 24px minimum target size', () => {
    // WCAG 2.2 AA 2.5.8, the accessibility floor polymorph guarantees.
    for (const density of DENSITIES) {
      const { controlHeight } = deriveNonColorTokens(base).density[density]
      expect(px(controlHeight.sm), density).toBeGreaterThanOrEqual(24)
    }
  })

  it('shrinks and grows control heights with density, on even pixels', () => {
    const heights = (density: Density) =>
      px(deriveNonColorTokens(base).density[density].controlHeight.md)
    expect(heights('compact')).toBeLessThan(heights('standard'))
    expect(heights('standard')).toBeLessThan(heights('comfortable'))
    for (const density of DENSITIES) {
      expect(heights(density) % 2, density).toBe(0)
    }
  })

  it('holds the minimum pressable size at the web floor, outside the density scopes', () => {
    // WCAG 2.5.8's 24px. Density changes how large a control looks, never the
    // smallest target a pointer must hit, so the value is one, not one per density.
    expect(deriveNonColorTokens(base).hitTarget).toBe('24px')
    for (const density of DENSITIES) {
      expect(deriveNonColorTokens(axesWith({ density })).hitTarget, density).toBe('24px')
    }
  })

  it('never lets contextual density touch the type ratio', () => {
    // The type scale depends on the theme's density. The per-density token
    // blocks contain no type tokens.
    const tokens = deriveNonColorTokens(base)
    for (const density of DENSITIES) {
      expect(Object.keys(tokens.density[density]).sort()).toEqual(['controlHeight', 'space'])
    }
  })
})

describe('radius', () => {
  it('follows the geometry axis, with pill and none fixed', () => {
    for (const geometry of GEOMETRIES) {
      const { radius } = deriveNonColorTokens(axesWith({ geometry }))
      const [sm, md, lg] = GEOMETRY_RADII[geometry]
      expect(radius.sm).toBe(`${sm}px`)
      expect(radius.md).toBe(`${md}px`)
      expect(radius.lg).toBe(`${lg}px`)
      expect(radius.none).toBe('0')
      expect(radius.pill).toBe('9999px')
    }
  })

  it('makes sharp geometry actually sharp', () => {
    const { radius } = deriveNonColorTokens(axesWith({ geometry: 'sharp' }))
    expect([radius.sm, radius.md, radius.lg]).toEqual(['0px', '0px', '0px'])
  })

  it('increases radius monotonically within each geometry', () => {
    for (const geometry of GEOMETRIES) {
      const [sm, md, lg] = GEOMETRY_RADII[geometry]
      expect(md).toBeGreaterThanOrEqual(sm)
      expect(lg).toBeGreaterThanOrEqual(md)
    }
  })

  // An override changes only the step it names. `none` and `pill` are
  // meanings, not sizes, and cannot be overridden.
  it('applies a radius override over the axis ladder, step for step', () => {
    const { radius } = deriveNonColorTokens(axesWith({ geometry: 'round' }), 'normal', {
      radius: { md: 10 },
    })
    expect([radius.sm, radius.md, radius.lg]).toEqual(['6px', '10px', '24px'])
    expect(radius.none).toBe('0')
    expect(radius.pill).toBe('9999px')
  })

  // The radius assignment map is derived: references by default, changed by an
  // assignment override, never a raw value.
  it('assigns radius classes per the assignment map and changes them on override', () => {
    const { radiusAssign } = deriveNonColorTokens(axesWith({}))
    expect(radiusAssign).toEqual({
      control: 'var(--pm-radius-md)',
      detail: 'var(--pm-radius-sm)',
      surface: 'var(--pm-radius-lg)',
    })

    const amended = deriveNonColorTokens(axesWith({}), 'normal', {
      assign: { radius: { control: 'pill', surface: 'md' } },
    })
    expect(amended.radiusAssign.control).toBe('var(--pm-radius-pill)')
    expect(amended.radiusAssign.detail).toBe('var(--pm-radius-sm)')
    expect(amended.radiusAssign.surface).toBe('var(--pm-radius-md)')
  })

  // Shadow and inset work the same way: classes as references, defaults taken
  // from the recipes, changed on override.
  it('assigns shadow and inset classes per their maps and changes them on override', () => {
    const tokens = deriveNonColorTokens(axesWith({}))
    expect(tokens.shadowAssign).toEqual({
      seat: 'var(--pm-shadow-control)',
      resting: 'var(--pm-shadow-raised)',
      transient: 'var(--pm-shadow-overlay)',
    })
    expect(tokens.insetAssign).toEqual({
      surface: 'var(--pm-space-6)',
      pane: 'var(--pm-space-5)',
      list: 'var(--pm-space-2)',
    })

    const amended = deriveNonColorTokens(axesWith({}), 'normal', {
      assign: { shadow: { resting: 'overlay' }, inset: { surface: 4, list: 3 } },
    })
    expect(amended.shadowAssign.resting).toBe('var(--pm-shadow-overlay)')
    expect(amended.shadowAssign.seat).toBe('var(--pm-shadow-control)')
    expect(amended.insetAssign.surface).toBe('var(--pm-space-4)')
    expect(amended.insetAssign.pane).toBe('var(--pm-space-5)')
    expect(amended.insetAssign.list).toBe('var(--pm-space-3)')
  })

  // Space and control-height overrides change the base. Every density is still
  // derived from the changed base through its own multiplier.
  it('applies space and control-height overrides before the density multiplier', () => {
    const { density } = deriveNonColorTokens(axesWith({}), 'normal', {
      space: { 4: 14 },
      controlHeight: { md: 40 },
    })
    expect(density.standard.space[4]).toBe('14px')
    expect(density.compact.space[4]).toBe('12px') // roundEven(14 * 0.85)
    expect(density.comfortable.space[4]).toBe('16px') // roundEven(14 * 1.15)
    expect(density.standard.space[3]).toBe('8px') // neighbours untouched
    expect(density.standard.controlHeight.md).toBe('40px')
    expect(density.compact.controlHeight.md).toBe('34px')
    expect(density.standard.controlHeight.sm).toBe('32px')
  })
})

describe('elevation and focus', () => {
  it('gives a flat theme no resting shadow, because borders provide separation', () => {
    const { shadow } = deriveNonColorTokens(axesWith({ depth: 'flat' }))
    expect(shadow.control).toBe('none')
    expect(shadow.raised).toBe('none')
  })

  it('still gives a flat theme’s transient surfaces a shadow', () => {
    // Flat forbids resting elevation. It does not cover a surface that is in
    // front of the page instead of on it. A menu with no shadow, no scrim and
    // one step of surface difference blends into the page.
    const { shadow } = deriveNonColorTokens(axesWith({ depth: 'flat' }))
    expect(shadow.overlay).not.toBe('none')
  })

  it('gives an elevated theme layered shadows', () => {
    const { shadow } = deriveNonColorTokens(axesWith({ depth: 'elevated' }))
    // raised is three layers (contact + mid + ambient).
    expect(shadow.raised.split(',').length).toBe(3)
    expect(shadow.overlay.split(',').length).toBe(2)
  })

  it('draws the focus mark 2px wide at the standard temperament, 3px at stark, 2px at soft', () => {
    const width = (contrastTemperament: Axes['contrastTemperament']) =>
      deriveNonColorTokens(axesWith({ contrastTemperament })).focus.width
    expect(width('soft')).toBe('2px')
    expect(width('standard')).toBe('2px')
    expect(width('stark')).toBe('3px')
  })

  it('moves the focus mark inside the edge by its own width at every geometry', () => {
    // Nothing is drawn outside the control, so a container that clips never cuts the mark.
    // The offset is no longer a function of geometry: round corners keep the mark inside too.
    for (const geometry of ['sharp', 'crisp', 'soft', 'round'] as const) {
      for (const contrastTemperament of ['soft', 'standard', 'stark'] as const) {
        const { focus } = deriveNonColorTokens(axesWith({ geometry, contrastTemperament }))
        expect(px(focus.offset), `${geometry} × ${contrastTemperament}`).toBe(-px(focus.width))
      }
    }
  })
})

describe('icons', () => {
  it('sizes icons to the text steps they sit beside', () => {
    const tokens = deriveNonColorTokens(base)
    expect(px(tokens.icon.size.md)).toBe(TYPE_BASE_PX)
    expect(px(tokens.icon.size.sm)).toBeLessThan(px(tokens.icon.size.md))
    expect(px(tokens.icon.size.lg)).toBeGreaterThan(px(tokens.icon.size.md))
  })

  it('derives stroke from personality and temperament, clamped to 1–2.5', () => {
    const strokes = TYPE_PERSONALITIES.flatMap((typePersonality) =>
      Object.values(deriveNonColorTokens(axesWith({ typePersonality })).icon.stroke).map(
        parseFloat,
      ),
    )
    expect(new Set(strokes).size).toBeGreaterThan(1)
    for (const stroke of strokes) {
      expect(stroke).toBeGreaterThanOrEqual(1)
      expect(stroke).toBeLessThanOrEqual(2.5)
    }
    const soft = parseFloat(
      deriveNonColorTokens(axesWith({ contrastTemperament: 'soft' })).icon.stroke.md,
    )
    const stark = parseFloat(
      deriveNonColorTokens(axesWith({ contrastTemperament: 'stark' })).icon.stroke.md,
    )
    expect(stark).toBeGreaterThan(soft)
  })

  it('compensates stroke per size so every size draws the md weight', () => {
    const { icon } = deriveNonColorTokens(base)
    const px = (value: string) => parseFloat(value)
    // Drawn weight = SVG-unit stroke × rendered box / the 24 grid. The anchor
    // is md. sm and lg have compensated values so the product stays the same.
    const drawn = (size: 'sm' | 'md' | 'lg') =>
      (parseFloat(icon.stroke[size]) * px(icon.size[size])) / 24
    expect(drawn('sm')).toBeCloseTo(drawn('md'), 1)
    expect(drawn('lg')).toBeCloseTo(drawn('md'), 1)
    // So the SVG-unit numbers decrease as the box grows.
    expect(parseFloat(icon.stroke.sm)).toBeGreaterThan(parseFloat(icon.stroke.md))
    expect(parseFloat(icon.stroke.lg)).toBeLessThan(parseFloat(icon.stroke.md))
  })
})

describe('motion', () => {
  const motion = deriveNonColorTokens(base).motion

  it('derives all four temperaments regardless of the theme axis', () => {
    expect(Object.keys(motion).sort()).toEqual([...MOTION_TEMPERAMENTS].sort())
    // Switching temperament is an attribute swap, never a re-resolve.
    expect(deriveNonColorTokens(axesWith({ motionTemperament: 'none' })).motion).toEqual(motion)
  })

  it('makes every duration zero at temperament none', () => {
    for (const value of Object.values(motion.none.duration)) {
      expect(value).toBe('0ms')
    }
    expect(MOTION_SCALE.none).toBe(0)
  })

  it('scales durations monotonically across temperaments', () => {
    const overlay = MOTION_TEMPERAMENTS.map((t) => px(motion[t].duration.overlay))
    for (let i = 1; i < overlay.length; i += 1) {
      expect(overlay[i], MOTION_TEMPERAMENTS[i]).toBeGreaterThan(overlay[i - 1] ?? -1)
    }
  })

  it('makes exits quicker than entrances', () => {
    const { duration } = motion.standard
    expect(px(duration.controlExit)).toBeLessThan(px(duration.control))
    expect(px(duration.overlayExit)).toBeLessThan(px(duration.overlay))
    expect(px(duration.overlayExit) / px(duration.overlay)).toBeCloseTo(EXIT_RATIO, 1)
  })

  it('scales duration with element size class', () => {
    const { duration } = motion.standard
    expect(px(duration.control)).toBeLessThan(px(duration.surface))
    expect(px(duration.surface)).toBeLessThan(px(duration.overlay))
  })

  it('gives distinct enter and exit easings', () => {
    expect(motion.standard.easing.enter).not.toBe(motion.standard.easing.exit)
    expect(motion.standard.easing.enter).toMatch(/^cubic-bezier\(/)
  })

  it('damps springs per temperament: subtle never overshoots, expressive does', () => {
    // ζ = damping / 2√(stiffness·mass) (`design/motion/motion.md`, springs).
    const zeta = ({ stiffness, damping, mass }: (typeof motion.standard.spring)['default']) =>
      damping / (2 * Math.sqrt(stiffness * mass))
    for (const role of ['default', 'snappy', 'gentle'] as const) {
      expect(zeta(motion.subtle.spring[role]), `subtle ${role}`).toBeGreaterThanOrEqual(0.95)
      expect(zeta(motion.expressive.spring[role]), `expressive ${role}`).toBeLessThanOrEqual(0.75)
      expect(zeta(motion.standard.spring[role]), `standard ${role}`).toBeGreaterThan(0.75)
      expect(zeta(motion.standard.spring[role]), `standard ${role}`).toBeLessThan(0.95)
    }
  })

  it('deepens press scale with temperament and disables it at none', () => {
    expect(motion.none.pressScale).toBe('1')
    const scales = (['subtle', 'standard', 'expressive'] as const).map((t) =>
      parseFloat(motion[t].pressScale),
    )
    for (let i = 1; i < scales.length; i += 1) {
      expect(scales[i]).toBeLessThan(scales[i - 1] ?? 2)
    }
  })

  it('slows ambient loops for calmer temperaments and stops them at none', () => {
    expect(motion.none.ambient.shimmer).toBe('0s')
    expect(motion.none.ambient.spin).toBe('0s')
    expect(px(motion.subtle.ambient.shimmer)).toBeGreaterThan(px(motion.standard.ambient.shimmer))
    expect(px(motion.expressive.ambient.spin)).toBeLessThan(px(motion.standard.ambient.spin))
  })
})

describe('font stacks', () => {
  it('appends a system fallback matched to the personality', () => {
    const sans = deriveFontStacks(
      axesWith({ typePersonality: 'grotesque' }),
      exampleQuietTheme.seeds,
    )
    expect(sans.body).toContain('system-ui')
    const serif = deriveFontStacks(
      axesWith({ typePersonality: 'editorial' }),
      exampleQuietTheme.seeds,
    )
    expect(serif.body).toContain('ui-serif')
    expect(sans.mono).toContain('ui-monospace')
  })

  it('quotes multi-word family names', () => {
    const stacks = deriveFontStacks(base, {
      ...exampleQuietTheme.seeds,
      fonts: {
        body: { family: 'IBM Plex Sans' },
        display: { family: 'Inter' },
        mono: { family: 'IBM Plex Mono' },
      },
    })
    expect(stacks.body.startsWith('"IBM Plex Sans",')).toBe(true)
    expect(stacks.display.startsWith('Inter,')).toBe(true)
  })
})

describe('resolveTheme', () => {
  it('joins colour and non-colour into one resolved theme', () => {
    const resolved = resolveTheme(exampleQuietTheme)
    expect(resolved.name).toBe(exampleQuietTheme.name)
    expect(resolved.color.light['bg.app']).toMatch(/^#/)
    expect(resolved.color.dark['bg.app']).toMatch(/^#/)
    expect(resolved.tokens.text.md.size).toBe('1rem')
    expect(resolved.fonts.body).toContain('Inter')
    expect(resolved.axes).toEqual(exampleQuietTheme.axes)
  })

  it('is deterministic', () => {
    expect(resolveTheme(exampleQuietTheme)).toEqual(resolveTheme(exampleQuietTheme))
  })
})

describe('system-file overrides: shadow throw, focus ring, type ratio', () => {
  it('a throw of 1 is byte-identical to the axis', () => {
    const plain = deriveNonColorTokens(base)
    const unity = deriveNonColorTokens(base, 'normal', { shadow: { throw: 1 } })
    expect(unity.shadow).toEqual(plain.shadow)
  })

  it('the throw scales distance and blur, never darkness', () => {
    const plain = deriveNonColorTokens(axesWith({ depth: 'elevated' }))
    const far = deriveNonColorTokens(axesWith({ depth: 'elevated' }), 'normal', {
      shadow: { throw: 1.5 },
    })
    // The overlay's first layer: 0 6px 16px → 0 9px 24px, alpha untouched.
    expect(plain.shadow.overlay).toContain('0 6px 16px rgb(0 0 0 / 0.1)')
    expect(far.shadow.overlay).toContain('0 9px 24px rgb(0 0 0 / 0.1)')
  })

  it('a throw cannot add a shadow that flat removes, because none has no layers to scale', () => {
    const far = deriveNonColorTokens(axesWith({ depth: 'flat' }), 'normal', {
      shadow: { throw: 1.75 },
    })
    expect(far.shadow.control).toBe('none')
    expect(far.shadow.raised).toBe('none')
    // Flat's overlay shadow is real, so it scales with the throw.
    expect(far.shadow.overlay).not.toBe('none')
  })

  it('the focus overrides land in the assembled mark', () => {
    const tokens = deriveNonColorTokens(base, 'normal', { focus: { width: 5, offset: 1 } })
    expect(tokens.focus.width).toBe('5px')
    expect(tokens.focus.offset).toBe('1px')
    // An offset alone keeps the temperament's width.
    const outside = deriveNonColorTokens(base, 'normal', { focus: { offset: 0 } })
    expect(outside.focus.width).toBe(deriveNonColorTokens(base).focus.width)
    expect(outside.focus.offset).toBe('0px')
  })

  it('a width alone moves the derived mark inside the edge by the new width', () => {
    // The default offset follows the width the system sets, not the temperament's, so a wider
    // mark still covers the border and draws nothing outside the control.
    const wide = deriveNonColorTokens(base, 'normal', { focus: { width: 5 } })
    expect(wide.focus.width).toBe('5px')
    expect(wide.focus.offset).toBe('-5px')
    expect(focusPx('standard', { width: 5 })).toEqual({ width: 5, offset: -5 })
    expect(focusPx('stark')).toEqual({ width: 3, offset: -3 })
  })

  it('the two steps under the base take their set sizes and the rest still derive', () => {
    const set = deriveNonColorTokens(base, 'normal', { type: { sm: 13, xs: 12 } })
    const plain = deriveNonColorTokens(base)
    expect(remPx(set.text.sm.size)).toBe(13)
    expect(remPx(set.text.xs.size)).toBe(12)
    expect(set.text.md.size).toBe('1rem')
    expect(set.text.lg).toEqual(plain.text.lg)
    expect(set.text['3xl']).toEqual(plain.text['3xl'])
    // Tracking follows the size that ships: 13px is under the 14px line where
    // the loose tracking starts, so sm now tracks like xs.
    expect(set.text.sm.tracking).toBe(set.text.xs.tracking)
    expect(set.text.sm.tracking).not.toBe(plain.text.sm.tracking)
    // One step alone leaves the other deriving from the ratio.
    const one = deriveNonColorTokens(base, 'normal', { type: { sm: 13 } })
    expect(one.text.xs).toEqual(plain.text.xs)
  })

  it('the base moves md and the ladder with it, and the text-entry floor holds at 16px', () => {
    const plain = deriveNonColorTokens(base)
    const small = deriveNonColorTokens(base, 'normal', { type: { base: 13 } })
    expect(remPx(small.text.md.size)).toBe(13)
    expect(remPx(small.text.sm.size)).toBeLessThan(13)
    expect(remPx(small.text.lg.size)).toBeGreaterThan(13)
    expect(remPx(small.display.sm.size)).toBeLessThan(remPx(plain.display.sm.size))
    // The floor: the md step or 16px, whichever is larger.
    expect(plain.textEntry.size).toBe('1rem')
    expect(small.textEntry.size).toBe('1rem')
    expect(small.textEntry.lineHeight).toBe(small.text.md.lineHeight)
    const large = deriveNonColorTokens(base, 'normal', { type: { base: 18 } })
    expect(remPx(large.textEntry.size)).toBe(18)
  })

  it('the type ratio changes both scales and the display floor still applies', () => {
    const steep = deriveNonColorTokens(base, 'normal', { type: { ratio: 1.4 } })
    const plain = deriveNonColorTokens(base)
    expect(remPx(steep.text['3xl'].size)).toBeGreaterThan(remPx(plain.text['3xl'].size))
    expect(remPx(steep.display.lg.size)).toBeGreaterThan(remPx(plain.display.lg.size))
    // The md anchor never moves. A ratio spreads the ladder and does not resize the page.
    expect(steep.text.md.size).toBe('1rem')
    // A flat ratio cannot push display below its floor.
    const flat = deriveNonColorTokens(base, 'normal', { type: { ratio: 1.125 } })
    expect(remPx(flat.display.sm.size)).toBeGreaterThanOrEqual(remPx(flat.text['3xl'].size))
  })
})
