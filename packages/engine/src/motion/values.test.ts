import { describe, expect, it } from 'vitest'

import {
  dampingRatio,
  isBindingName,
  MOTION_VALUES,
  PATTERN_KINDS,
  PATTERN_NAMES,
  REDUCED_MOTION_PROJECTION,
  type PatternName,
} from './values'

/**
 * Checks the registry's data against the spec it mirrors. If a pattern is added
 * to the spec but not to the engine, or a projection is missing, these tests
 * fail before any component silently stops animating.
 */

describe('patterns', () => {
  it('covers every pattern the spec defines, plus press-feedback', () => {
    const inJson = Object.keys(MOTION_VALUES.patterns)
    // `press-feedback` is pure CSS (motion.md, press feedback) so it has no
    // `patterns` entry, but it is still a pattern a spec may bind.
    expect([...PATTERN_NAMES].sort()).toEqual([...inJson, 'press-feedback'].sort())
  })

  it('classifies every pattern by what it may animate', () => {
    expect(Object.keys(PATTERN_KINDS).sort()).toEqual([...PATTERN_NAMES].sort())
    expect(PATTERN_KINDS.collapse).toBe('container')
    expect(PATTERN_KINDS.shimmer).toBe('ambient')
    expect(PATTERN_KINDS.fade).toBe('interactive')
  })

  it('gives every pattern a reduced-motion projection', () => {
    for (const pattern of PATTERN_NAMES) {
      expect(REDUCED_MOTION_PROJECTION[pattern], pattern).toBeDefined()
    }
  })

  it('keeps the projection map consistent with the spec prose it is copied from', () => {
    // motion.json's `reducedMotion` field is prose ("off (static glyph)"), so
    // the machine map is copied from motion.md's projection table. To keep them
    // in sync, every projection must match the first word of the prose.
    const prose: Record<string, string> = {}
    for (const [name, pattern] of Object.entries(MOTION_VALUES.patterns)) {
      prose[name] = (pattern as { reducedMotion: string }).reducedMotion
    }

    const expected: Record<string, string> = {
      fade: 'self',
      'scale-fade': 'fade',
      'slide-fade': 'fade',
      'spring-pop': 'fade',
      collapse: 'instant',
      shimmer: 'off',
      spin: 'off',
      sheet: 'fade',
    }

    for (const [name, first] of Object.entries(expected)) {
      expect(prose[name]?.startsWith(first), `${name}: "${prose[name]}"`).toBe(true)
    }
    // `self` in the prose is `fade` in the map, because fade projects to itself.
    expect(REDUCED_MOTION_PROJECTION.fade).toBe('fade')
  })

  it('projects every non-fade interactive pattern down to fade', () => {
    for (const pattern of PATTERN_NAMES) {
      if (PATTERN_KINDS[pattern] !== 'interactive') continue
      const projection = REDUCED_MOTION_PROJECTION[pattern] as string
      expect(['fade', 'off'], pattern).toContain(projection)
    }
  })
})

describe('temperaments', () => {
  it('names all four with distinct duration scales', () => {
    const scales = Object.values(MOTION_VALUES.temperaments).map((t) => t.durationScale)
    expect(scales).toHaveLength(4)
    // Distinct scales let the engine recover the temperament from the emitted
    // duration token, without a fifth token for the name.
    expect(new Set(scales).size).toBe(4)
  })

  it('zeroes both scales at none and disables ambient', () => {
    const none = MOTION_VALUES.temperaments.none
    expect(none.durationScale).toBe(0)
    expect(none.distanceScale).toBe(0)
    expect(none.pressScale).toBe(1)
    expect(none.ambient).toBe(false)
  })

  it('orders both scales monotonically', () => {
    const order = ['none', 'subtle', 'standard', 'expressive'] as const
    for (let i = 1; i < order.length; i += 1) {
      const previous = MOTION_VALUES.temperaments[order[i - 1] ?? 'none']
      const current = MOTION_VALUES.temperaments[order[i] ?? 'none']
      expect(current.durationScale, order[i]).toBeGreaterThan(previous.durationScale)
      expect(current.distanceScale, order[i]).toBeGreaterThan(previous.distanceScale)
    }
  })

  it('tightens press scale as temperament grows', () => {
    const { none, subtle, standard, expressive } = MOTION_VALUES.temperaments
    expect(none.pressScale).toBe(1)
    expect(subtle.pressScale).toBeGreaterThan(standard.pressScale)
    expect(standard.pressScale).toBeGreaterThan(expressive.pressScale)
  })
})

describe('springs', () => {
  it('matches the damping ratios the springs are designed around', () => {
    const target = { subtle: 1.0, standard: 0.85, expressive: 0.7 }
    for (const [temperament, expected] of Object.entries(target)) {
      const set = MOTION_VALUES.springs[temperament as keyof typeof MOTION_VALUES.springs]
      for (const [role, spring] of Object.entries(set)) {
        expect(dampingRatio(spring), `${temperament}/${role} ζ`).toBeCloseTo(expected, 1)
      }
    }
  })

  it('keeps every spring damped enough not to oscillate, even at expressive', () => {
    for (const set of Object.values(MOTION_VALUES.springs)) {
      for (const [role, spring] of Object.entries(set)) {
        expect(dampingRatio(spring), role).toBeGreaterThan(0.6)
      }
    }
  })

  it('carries standard values at none, which the engine then never uses', () => {
    expect(MOTION_VALUES.springs.none).toEqual(MOTION_VALUES.springs.standard)
  })
})

describe('durations', () => {
  it('orders the size classes, because a bigger surface takes longer to follow', () => {
    const { control, surface, overlay } = MOTION_VALUES.durationsMs
    expect(control).toBeLessThan(surface)
    expect(surface).toBeLessThan(overlay)
  })

  it('keeps every class inside the perceptual range the spec sets', () => {
    expect(MOTION_VALUES.durationsMs.control).toBeGreaterThanOrEqual(100)
    expect(MOTION_VALUES.durationsMs.control).toBeLessThanOrEqual(150)
    expect(MOTION_VALUES.durationsMs.overlay).toBeLessThanOrEqual(300)
  })

  it('makes exits quicker than enters, because the user has already decided', () => {
    expect(MOTION_VALUES.exitRatio).toBeLessThan(1)
    expect(MOTION_VALUES.exitRatio).toBe(0.65)
  })
})

describe('bindings', () => {
  it('names only known patterns', () => {
    for (const [name, binding] of Object.entries(MOTION_VALUES.bindings)) {
      const pattern = (binding as { pattern?: string }).pattern
      if (pattern === undefined) continue
      expect(PATTERN_NAMES, `${name} -> ${pattern}`).toContain(pattern as PatternName)
    }
  })

  it('narrows unknown binding names', () => {
    expect(isBindingName('dialog.panel')).toBe(true)
    expect(isBindingName('dialog.nope')).toBe(false)
  })

  it('covers every component in the proving set that the member specs bind', () => {
    // motion.md's consolidated component bindings. A component without its
    // binding would have to define its own motion.
    for (const binding of [
      'dialog.scrim',
      'dialog.panel',
      'select.content',
      'tooltip.bubble',
      'toast.enter',
      'toast.exit',
      'checkbox.indicator',
      'switch.thumb',
      'button.press',
      'button.spinner',
      'skeleton.sheen',
      'appshell.sidebar',
    ]) {
      expect(isBindingName(binding), binding).toBe(true)
    }
  })

  it('covers the members whose bindings need engine support of their own', () => {
    // motion.md's no-binding-without-support law, checked from the other side.
    // These four have bindings only because the engine supports them.
    for (const binding of [
      'accordion.content',
      'drawer.panel',
      'alert.dismiss',
      'stepper.indicator',
    ]) {
      expect(isBindingName(binding), binding).toBe(true)
    }
  })

  it('puts select.content in the surface class, per the duration ladder', () => {
    // A dropdown is a transient anchored surface, not a modal. 260ms after a
    // click feels like lag.
    expect((MOTION_VALUES.bindings['select.content'] as { class: string }).class).toBe('surface')
    expect((MOTION_VALUES.bindings['dialog.panel'] as { class: string }).class).toBe('overlay')
  })
})
