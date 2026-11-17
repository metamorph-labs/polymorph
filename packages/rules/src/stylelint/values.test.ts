import { describe, expect, it } from 'vitest'

import { findRawValues, isGovernedProperty } from './values.js'

const raw = (value: string, property = 'color') =>
  findRawValues(value, property).map((hit) => hit.text)

describe('isGovernedProperty', () => {
  it('governs the properties that carry design decisions', () => {
    for (const property of [
      'color',
      'background',
      'background-color',
      'border-top-color',
      'box-shadow',
      'padding',
      'padding-inline-start',
      'gap',
      'margin-block',
      'inset',
      'width',
      'max-height',
      'border-radius',
      'border-end-end-radius',
      'font-size',
      'font-family',
      'line-height',
      'letter-spacing',
      'transition',
      'animation-duration',
      'border',
      'outline',
      // A stacking level is a product-level layer, not layout mechanics.
      'z-index',
    ]) {
      expect(isGovernedProperty(property), property).toBe(true)
    }
  })

  it('ignores layout mechanics, which are not design decisions', () => {
    for (const property of [
      'display',
      'position',
      'flex',
      'flex-direction',
      'align-items',
      'overflow',
      'grid-template-columns',
      'opacity',
      'cursor',
      'text-transform',
      'mix-blend-mode',
    ]) {
      expect(isGovernedProperty(property), property).toBe(false)
    }
  })
})

describe('findRawValues', () => {
  it('accepts a token', () => {
    expect(raw('var(--pm-accent-bg)')).toEqual([])
    expect(raw('var(--pm-space-3, var(--pm-space-2))', 'padding')).toEqual([])
  })

  it('rejects a custom property outside the namespace', () => {
    expect(raw('var(--brand-accent)')).toEqual(['var(--brand-accent)'])
  })

  it('allows the positioning engine’s measured properties, which nobody writes', () => {
    expect(raw('var(--radix-select-trigger-width)', 'min-width')).toEqual([])
    expect(raw('var(--radix-select-content-available-height)', 'max-height')).toEqual([])
  })

  it('still rejects a raw fallback behind a measured property', () => {
    expect(raw('var(--radix-select-trigger-width, 240px)', 'min-width')).toEqual(['240px'])
  })

  it('rejects a raw fallback inside a token reference', () => {
    expect(raw('var(--pm-space-3, 10px)', 'padding')).toEqual(['10px'])
  })

  it('rejects colours in every notation', () => {
    expect(raw('#fff')).toEqual(['#fff'])
    expect(raw('#4087DE')).toEqual(['#4087DE'])
    expect(raw('rgb(64 135 222)')).toEqual(['rgb(64 135 222)'])
    expect(raw('oklch(0.62 0.15 255)')).toEqual(['oklch(0.62 0.15 255)'])
    expect(raw('darkgray')).toEqual(['darkgray'])
    expect(raw('rebeccapurple')).toEqual(['rebeccapurple'])
  })

  it('rejects lengths and durations', () => {
    expect(raw('12px', 'padding')).toEqual(['12px'])
    expect(raw('1.5rem', 'font-size')).toEqual(['1.5rem'])
    expect(raw('120ms', 'transition-duration')).toEqual(['120ms'])
  })

  it('allows the structural literals', () => {
    for (const [value, property] of [
      ['0', 'padding'],
      ['1px', 'border-width'],
      ['2px', 'border-width'],
      ['100%', 'width'],
      ['auto', 'height'],
      ['9999px', 'border-radius'],
      ['none', 'box-shadow'],
      ['transparent', 'background'],
      ['currentcolor', 'fill'],
      ['100vh', 'height'],
      ['100dvh', 'height'],
      ['inherit', 'color'],
    ] as const) {
      expect(raw(value, property), value).toEqual([])
    }
  })

  it('allows a unitless line-height but not a bare font-weight', () => {
    expect(raw('1.5', 'line-height')).toEqual([])
    expect(raw('600', 'font-weight')).toEqual(['600'])
    expect(raw('var(--pm-text-md-weight)', 'font-weight')).toEqual([])
  })

  it('accepts only z tokens for z-index', () => {
    // Raw numbers are how two members end up disagreeing about which layer is on top.
    expect(raw('1', 'z-index')).toEqual(['1'])
    expect(raw('10', 'z-index')).toEqual(['10'])
    expect(raw('-1', 'z-index')).toEqual(['-1'])
    expect(raw('var(--pm-z-raise)', 'z-index')).toEqual([])
    expect(raw('var(--pm-z-toast)', 'z-index')).toEqual([])
    // The only property that may not use another family's token. A space step
    // on `z-index` is a category error, not a reference.
    expect(raw('var(--pm-space-3)', 'z-index')).toEqual(['var(--pm-space-3)'])
    // `auto` stays structural, because it means no level rather than a level.
    expect(raw('auto', 'z-index')).toEqual([])
    const [hit] = findRawValues('3', 'z-index')
    expect(hit?.reason).toBe('a stacking level must come from a z token')
  })

  it('sees the colours inside a gradient', () => {
    expect(raw('linear-gradient(90deg, #fff 0%, #000 100%)', 'background')).toEqual([
      '#fff',
      '#000',
    ])
    expect(raw('radial-gradient(red, blue)', 'background')).toEqual(['red', 'blue'])
    expect(raw('repeating-linear-gradient(90deg, tomato, wheat)', 'background')).toEqual([
      'tomato',
      'wheat',
    ])
  })

  it('ignores gradient stop positions, which are not spacing decisions', () => {
    expect(
      raw(
        'linear-gradient(90deg, var(--pm-bg-subtle) 0%, var(--pm-bg-raised) 50%, var(--pm-bg-subtle) 100%)',
        'background',
      ),
    ).toEqual([])
    expect(
      raw('linear-gradient(to right, var(--pm-accent-bg) 33.3%, transparent)', 'background'),
    ).toEqual([])
  })

  it('allows 200% for a sweeping overlay, alongside 100%', () => {
    // An overlay that sweeps must be wider than its host. The animation sets the
    // width, not a design choice (motion.json's 200%-wide sheen).
    expect(raw('200%', 'width')).toEqual([])
    expect(raw('150%', 'width')).toEqual(['150%'])
  })

  it('sees through calc() but not through url() or cubic-bezier()', () => {
    expect(raw('calc(var(--pm-space-4) * 2)', 'padding')).toEqual([])
    expect(raw('calc(var(--pm-space-4) + 3px)', 'padding')).toEqual(['3px'])
    expect(raw('cubic-bezier(0.4, 0, 0.2, 1)', 'transition-timing-function')).toEqual([])
  })

  it('names every offender in a shorthand, not just the first', () => {
    expect(raw('0 2px 8px rgb(0 0 0 / 0.1)', 'box-shadow')).toEqual(['8px', 'rgb(0 0 0 / 0.1)'])
    expect(raw('1px solid #ccc', 'border')).toEqual(['#ccc'])
  })

  it('points at where the offender starts, so the underline lands on it', () => {
    const [hit] = findRawValues('1px solid #ccc', 'border')
    expect(hit?.index).toBe('1px solid '.length)
  })

  it('is not confused by !important, which comes after the value', () => {
    expect(raw('12px', 'padding')).toEqual(['12px'])
    const [hit] = findRawValues('12px', 'padding')
    expect(hit?.index).toBe(0)
  })
})
