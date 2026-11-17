import { describe, expect, it } from 'vitest'

import { cssVarName } from './css-vars'
import {
  DISPLAY_STEPS,
  DURATION_ROLES,
  EASING_ROLES,
  RADIUS_STEPS,
  SHADOW_STEPS,
  SPACE_STEPS,
  SPRING_ROLES,
  springSchema,
  TEXT_STEPS,
  typeStyleSchema,
} from './tokens'

describe('non-colour token shapes', () => {
  it('names eleven space steps, 0-10', () => {
    expect(SPACE_STEPS).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
  })

  it('names seven text steps and three display steps', () => {
    expect(TEXT_STEPS).toHaveLength(7)
    expect(TEXT_STEPS[0]).toBe('xs')
    expect(TEXT_STEPS.at(-1)).toBe('3xl')
    expect(DISPLAY_STEPS).toEqual(['sm', 'md', 'lg'])
  })

  it('keeps pill in the radius scale', () => {
    expect(RADIUS_STEPS).toContain('pill')
    expect(RADIUS_STEPS).toContain('none')
  })

  it('has three elevation levels: a control seat, a resting card, an overlay', () => {
    expect(SHADOW_STEPS).toEqual(['control', 'raised', 'overlay'])
  })

  it('pairs every duration class with an exit', () => {
    const enters = DURATION_ROLES.filter((r) => !r.endsWith('Exit'))
    for (const enter of enters) {
      expect(DURATION_ROLES).toContain(`${enter}Exit`)
    }
    expect(enters).toEqual(['control', 'surface', 'overlay'])
  })

  it('separates enter from exit easings', () => {
    expect(EASING_ROLES).toContain('enter')
    expect(EASING_ROLES).toContain('exit')
  })

  it('emits every token key as a lint-legal custom property', () => {
    const paths = [
      ...SPACE_STEPS.map((s) => `space.${s}`),
      ...TEXT_STEPS.map((s) => `text.${s}`),
      ...DISPLAY_STEPS.map((s) => `display.${s}`),
      ...RADIUS_STEPS.map((s) => `radius.${s}`),
      ...SHADOW_STEPS.map((s) => `shadow.${s}`),
      ...DURATION_ROLES.map((s) => `motion.duration.${s}`),
      ...EASING_ROLES.map((s) => `motion.easing.${s}`),
      ...SPRING_ROLES.map((s) => `motion.spring.${s}`),
      'hitTarget',
    ]
    for (const path of paths) {
      expect(cssVarName(path), path).toMatch(/^--pm-[a-z0-9-]+$/)
    }
    expect(new Set(paths.map(cssVarName)).size).toBe(paths.length)
  })
})

describe('token value schemas', () => {
  it('accepts a well-formed type style', () => {
    const parsed = typeStyleSchema.parse({
      size: '16px',
      lineHeight: 1.5,
      weight: 400,
      family: 'body',
      tracking: '0em',
    })
    expect(parsed.family).toBe('body')
  })

  it('rejects a line-height with units, because line-height must be unitless', () => {
    const result = typeStyleSchema.safeParse({
      size: '16px',
      lineHeight: '24px',
      weight: 400,
      family: 'body',
      tracking: '0em',
    })
    expect(result.success).toBe(false)
  })

  it('rejects a font family outside the three roles', () => {
    const result = typeStyleSchema.safeParse({
      size: '16px',
      lineHeight: 1.5,
      weight: 400,
      family: 'serif',
      tracking: '0em',
    })
    expect(result.success).toBe(false)
  })

  it('requires positive spring parameters', () => {
    expect(springSchema.safeParse({ stiffness: 300, damping: 30, mass: 1 }).success).toBe(true)
    expect(springSchema.safeParse({ stiffness: 0, damping: 30, mass: 1 }).success).toBe(false)
  })
})
