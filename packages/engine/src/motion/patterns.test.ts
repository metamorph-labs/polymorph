import { DATA_ATTRS, MOTION_TEMPERAMENTS, type MotionTemperament } from '@polymorph/theme'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'

import { installTestTheme } from '../testing'
import { readMotionEnvironment, type MotionEnvironment } from './environment'
import {
  patternKind,
  projectedOrigin,
  resolveBinding,
  transformOriginFor,
  type ResolveOptions,
} from './patterns'
import { MOTION_VALUES, PATTERN_KINDS, type BindingName } from './values'

/**
 * Tests the registry's derivations and the two laws that can be checked here.
 * The interruption laws need a real animation and are in `@polymorph/react`'s
 * `presence.test.tsx`.
 */

beforeAll(installTestTheme)

afterEach(() => {
  document.documentElement.removeAttribute(DATA_ATTRS.motion)
  document.body.replaceChildren()
})

function envAt(temperament: MotionTemperament): MotionEnvironment {
  document.documentElement.setAttribute(DATA_ATTRS.motion, temperament)
  return readMotionEnvironment()
}

const ALL_BINDINGS = Object.keys(MOTION_VALUES.bindings) as BindingName[]

describe('every binding resolves', () => {
  it('leaves no binding in the spec without engine support', () => {
    const env = envAt('standard')
    for (const binding of ALL_BINDINGS) {
      const resolved = resolveBinding(binding, env)
      expect(resolved.kind, binding).toBeDefined()
      expect(resolved.binding).toBe(binding)
    }
  })

  it('sorts them into the six shapes the spec uses', () => {
    const env = envAt('standard')
    const kinds = new Map<string, string[]>()
    for (const binding of ALL_BINDINGS) {
      const { kind } = resolveBinding(binding, env)
      kinds.set(kind, [...(kinds.get(kind) ?? []), binding])
    }
    expect([...kinds.keys()].sort()).toEqual([
      'ambient',
      'collapse',
      'presence',
      'press',
      'spring',
      'transition',
    ])
  })
})

describe('law 2 — only transform and opacity on interactive transitions', () => {
  it('holds for every interactive binding, at every temperament', () => {
    for (const temperament of MOTION_TEMPERAMENTS) {
      const env = envAt(temperament)
      for (const binding of ALL_BINDINGS) {
        const resolved = resolveBinding(binding, env)
        if (resolved.kind !== 'presence') continue
        expect(patternKind(resolved.effective), resolved.effective).toBe('interactive')
        for (const property of resolved.properties) {
          expect(['opacity', 'transform'], `${binding} @ ${temperament}`).toContain(property)
        }
        // The keyframes may only contain those channels.
        for (const frame of [resolved.initial, resolved.animate, resolved.exit]) {
          for (const channel of Object.keys(frame)) {
            expect(['opacity', 'scale', 'x', 'y'], `${binding}.${channel}`).toContain(channel)
          }
        }
      }
    }
  })

  it('confines size animation to the one container pattern', () => {
    const sizeAnimating = Object.entries(PATTERN_KINDS)
      .filter(([, kind]) => kind === 'container')
      .map(([pattern]) => pattern)
    expect(sizeAnimating).toEqual(['collapse'])
  })
})

describe('temperament scaling', () => {
  it('recovers the temperament from the emitted duration alone', () => {
    for (const temperament of MOTION_TEMPERAMENTS) {
      expect(envAt(temperament).temperament, temperament).toBe(temperament)
    }
  })

  it('moves scale-fade depth toward 1 at calmer temperaments', () => {
    const depth = (temperament: MotionTemperament) => {
      const resolved = resolveBinding('dialog.panel', envAt(temperament))
      if (resolved.kind !== 'presence') throw new Error('expected presence')
      return 1 - (resolved.initial.scale ?? 1)
    }
    expect(depth('none')).toBe(0)
    expect(depth('subtle')).toBeLessThan(depth('standard'))
    expect(depth('standard')).toBeLessThan(depth('expressive'))
  })

  it('scales slide travel the same way', () => {
    const travel = (temperament: MotionTemperament) => {
      const resolved = resolveBinding('toast.enter', envAt(temperament))
      if (resolved.kind !== 'presence') throw new Error('expected presence')
      // A slide's travel is a distance in pixels. `sheet` is the only pattern
      // whose travel is a proportion, which is why the channel type also accepts
      // strings. This asserts that a slide never needs a proportion.
      const y = resolved.initial.y ?? 0
      expect(typeof y, `${temperament} slid by a proportion`).toBe('number')
      return Number(y)
    }
    expect(travel('none')).toBe(0)
    expect(travel('subtle')).toBeLessThan(travel('standard'))
    expect(travel('standard')).toBeLessThan(travel('expressive'))
    // lg = 16px at standard.
    expect(travel('standard')).toBe(MOTION_VALUES.distancesPx.lg)
  })

  it('bypasses the engine at none, with zero duration and no spring', () => {
    const env = envAt('none')
    for (const binding of ALL_BINDINGS) {
      const resolved = resolveBinding(binding, env)
      if (resolved.kind === 'presence') {
        expect(resolved.enterTransition, binding).toEqual({ duration: 0 })
        expect(resolved.exitTransition, binding).toEqual({ duration: 0 })
      }
      if (resolved.kind === 'spring') expect(resolved.transition, binding).toEqual({ duration: 0 })
      if (resolved.kind === 'transition') expect(resolved.durationMs, binding).toBe(0)
      if (resolved.kind === 'ambient') expect(resolved.periodMs, binding).toBe(0)
      if (resolved.kind === 'press') expect(resolved.scale, binding).toBe(1)
      if (resolved.kind === 'collapse') expect(resolved.sizeDurationMs, binding).toBe(0)
    }
  })

  it('derives every exit from its enter at the 0.65 ratio', () => {
    const env = envAt('standard')
    const resolved = resolveBinding('dialog.panel', env)
    if (resolved.kind !== 'presence') throw new Error('expected presence')
    const enter = resolved.enterTransition.duration ?? 0
    const exit = resolved.exitTransition.duration ?? 0
    expect(exit / enter).toBeCloseTo(MOTION_VALUES.exitRatio, 1)
  })

  it('gives an overlay longer than a control', () => {
    const env = envAt('standard')
    const overlay = resolveBinding('dialog.panel', env)
    const control = resolveBinding('tooltip.bubble', env)
    if (overlay.kind !== 'presence' || control.kind !== 'presence') throw new Error('presence')
    expect(overlay.enterTransition.duration).toBeGreaterThan(control.enterTransition.duration ?? 0)
  })
})

describe('spring-pop', () => {
  it('uses a spring for scale and an easing for opacity', () => {
    const resolved = resolveBinding('checkbox.indicator', envAt('standard'))
    if (resolved.kind !== 'presence') throw new Error('expected presence')
    expect(resolved.enterTransition.scale?.type).toBe('spring')
    expect(resolved.enterTransition.opacity?.duration).toBeGreaterThan(0)
    expect(resolved.initial.scale).toBe(0.5)
  })

  it('exits with a plain fade instead of reversing the pop', () => {
    const resolved = resolveBinding('checkbox.indicator', envAt('standard'))
    if (resolved.kind !== 'presence') throw new Error('expected presence')
    expect(resolved.exit).toEqual({ opacity: 0 })
    expect(resolved.exitTransition.type).toBeUndefined()
  })
})

describe('reduced motion', () => {
  // The environment reads the media query, which a test cannot set. Resolution
  // is pure, so the projection is checked with a synthetic environment instead.
  function reduced(temperament: MotionTemperament): MotionEnvironment {
    return { ...envAt(temperament), reducedMotion: true }
  }

  it('projects transform patterns down to opacity, at every temperament', () => {
    for (const temperament of ['subtle', 'standard', 'expressive'] as const) {
      const env = reduced(temperament)
      for (const binding of ['dialog.panel', 'toast.enter', 'checkbox.indicator'] as const) {
        const resolved = resolveBinding(binding, env)
        if (resolved.kind !== 'presence') throw new Error('expected presence')
        expect(resolved.effective, `${binding} @ ${temperament}`).toBe('fade')
        expect(resolved.projected).toBe(true)
        expect(resolved.properties).toEqual(['opacity'])
        expect(resolved.initial).toEqual({ opacity: 0 })
      }
    }
  })

  it('keeps the duration, because an opacity change is vestibular-safe', () => {
    const resolved = resolveBinding('dialog.panel', reduced('standard'))
    if (resolved.kind !== 'presence') throw new Error('expected presence')
    expect(resolved.enterTransition.duration).toBeGreaterThan(0)
  })

  it('leaves fade alone, since it is already the projection target', () => {
    const resolved = resolveBinding('dialog.scrim', reduced('standard'))
    if (resolved.kind !== 'presence') throw new Error('expected presence')
    expect(resolved.effective).toBe('fade')
    expect(resolved.projected).toBe(false)
  })

  it('turns off ambient loops and the press transform', () => {
    const env = reduced('expressive')
    const sheen = resolveBinding('skeleton.sheen', env)
    const press = resolveBinding('button.press', env)
    expect(sheen.kind === 'ambient' && sheen.periodMs).toBe(0)
    expect(press.kind === 'press' && press.scale).toBe(1)
  })

  it('makes collapse instant but still fades its content', () => {
    const resolved = resolveBinding('appshell.sidebar', reduced('standard'))
    if (resolved.kind !== 'collapse') throw new Error('expected collapse')
    expect(resolved.sizeDurationMs).toBe(0)
    expect(resolved.contentFadeMs).toBeGreaterThan(0)
  })
})

describe('sheet, the only pattern whose travel is the panel size', () => {
  function sheet(env: MotionEnvironment, options: ResolveOptions = {}) {
    const resolved = resolveBinding('drawer.panel', env, options)
    if (resolved.kind !== 'presence') throw new Error('expected presence')
    return resolved
  }

  it('slides the panel in from its own edge, at opacity 1 throughout', () => {
    const resolved = sheet(envAt('standard'), { sheetSide: 'end' })
    expect(resolved.initial).toEqual({ x: '100%' })
    expect(resolved.animate).toEqual({ x: 0, y: 0 })
    // A sheet slides in and does not fade, so opacity is not a channel here.
    expect(resolved.properties).toEqual(['transform'])
  })

  it('travels on the block axis for a bottom sheet', () => {
    expect(sheet(envAt('standard'), { sheetSide: 'bottom' }).initial).toEqual({ y: '100%' })
  })

  it('reads the pinned edge logically, so RTL mirrors the travel direction', () => {
    const ltr = envAt('standard')
    const rtl: MotionEnvironment = { ...ltr, direction: 'rtl' }
    expect(sheet(ltr, { sheetSide: 'end' }).initial.x).toBe('100%')
    expect(sheet(rtl, { sheetSide: 'end' }).initial.x).toBe('-100%')
    expect(sheet(ltr, { sheetSide: 'start' }).initial.x).toBe('-100%')
    expect(sheet(rtl, { sheetSide: 'start' }).initial.x).toBe('100%')
  })

  it('is not scaled by temperament', () => {
    // The spec's rule: 100% is the fully off-screen position, so no travel
    // scaling applies. Every other moving pattern scales with temperament.
    for (const temperament of ['subtle', 'standard', 'expressive'] as const) {
      expect(sheet(envAt(temperament), { sheetSide: 'end' }).initial.x, temperament).toBe('100%')
    }
  })

  it('exits along the path it entered', () => {
    const resolved = sheet(envAt('standard'), { sheetSide: 'end' })
    expect(resolved.exit).toEqual(resolved.initial)
  })

  it('has no offset at none, so it does not flash off canvas for a frame', () => {
    expect(sheet(envAt('none'), { sheetSide: 'end' }).initial).toEqual({})
  })

  it('projects to a fade in place under reduced motion', () => {
    // The projection table's rule. The projection adds a channel because,
    // without the transform, the panel needs opacity to enter at all.
    const resolved = sheet({ ...envAt('standard'), reducedMotion: true }, { sheetSide: 'end' })
    expect(resolved.effective).toBe('fade')
    expect(resolved.projected).toBe(true)
    expect(resolved.initial).toEqual({ opacity: 0 })
    expect(resolved.properties).toEqual(['opacity'])
    expect(resolved.enterTransition.duration).toBeGreaterThan(0)
  })

  it('uses the overlay class, like the dialog it is a variant of', () => {
    const env = envAt('standard')
    expect(sheet(env).enterTransition.duration).toBe(env.durations.overlay / 1000)
    expect(sheet(env).exitTransition.duration).toBe(env.durations.overlayExit / 1000)
  })
})

describe('collapse', () => {
  it('uses the exit duration and curve when unmounting a toast', () => {
    const env = envAt('standard')
    const resolved = resolveBinding('toast.exit', env)
    if (resolved.kind !== 'collapse') throw new Error('expected collapse')
    expect(resolved.mode).toBe('exit')
    expect(resolved.sizeDurationMs).toBe(env.durations.surfaceExit)
    expect(resolved.sizeEasing).toEqual(MOTION_VALUES.easings.exit)
    // On exit the content fades first and is gone before the space closes.
    expect(resolved.contentFadeLeads).toBe(true)
  })

  it('uses the standard curve on a persistent region, along its own axis', () => {
    const env = envAt('standard')
    const resolved = resolveBinding('appshell.sidebar', env)
    if (resolved.kind !== 'collapse') throw new Error('expected collapse')
    expect(resolved.mode).toBe('persistent')
    expect(resolved.axis).toBe('inline')
    expect(resolved.sizeDurationMs).toBe(env.durations.surface)
    expect(resolved.sizeEasing).toEqual(MOTION_VALUES.easings.standard)
    expect(resolved.contentFadeLeads).toBe(false)
  })

  it('splits the content fade at half the size duration', () => {
    const resolved = resolveBinding('appshell.sidebar', envAt('standard'))
    if (resolved.kind !== 'collapse') throw new Error('expected collapse')
    expect(resolved.contentFadeMs).toBeCloseTo(resolved.sizeDurationMs * 0.5, 5)
  })
})

describe('transformOriginFor', () => {
  it('grows an anchored surface from the edge facing its trigger', () => {
    expect(transformOriginFor('bottom', 'center')).toBe('center top')
    expect(transformOriginFor('top', 'center')).toBe('center bottom')
    expect(transformOriginFor('right', 'center')).toBe('left center')
    expect(transformOriginFor('left', 'center')).toBe('right center')
  })

  it('sets the cross axis from align', () => {
    expect(transformOriginFor('bottom', 'start')).toBe('left top')
    expect(transformOriginFor('bottom', 'end')).toBe('right top')
    expect(transformOriginFor('right', 'start')).toBe('left top')
    expect(transformOriginFor('right', 'end')).toBe('left bottom')
  })

  it('falls back to centre with nothing to anchor to', () => {
    expect(transformOriginFor()).toBe('center')
    expect(transformOriginFor('bottom')).toBe('center top')
  })

  it('is applied only where the binding asks for it', () => {
    const env = envAt('standard')
    const anchored = resolveBinding('tooltip.bubble', env, { side: 'top', align: 'center' })
    const plain = resolveBinding('dialog.scrim', env)
    expect(anchored.kind === 'presence' && anchored.transformOrigin).toBe('center bottom')
    expect(plain.kind === 'presence' && plain.transformOrigin).toBeUndefined()
  })
})

describe('projectedOrigin', () => {
  function box(left: number, top: number, width: number, height: number): Element {
    const element = document.createElement('div')
    element.getBoundingClientRect = () =>
      ({ left, top, width, height, right: left + width, bottom: top + height }) as DOMRect
    return element
  }

  it('projects the trigger centre into the panel box', () => {
    // Trigger centre at (150, 120); panel starts at (100, 100).
    expect(projectedOrigin(box(100, 100, 100, 40), box(100, 100, 400, 300))).toBe('50px 20px')
  })

  it('clamps a trigger outside the panel to the panel edge', () => {
    // A dialog opened from a button in the corner must not appear to expand from
    // outside itself.
    expect(projectedOrigin(box(0, 0, 10, 10), box(100, 100, 200, 200))).toBe('0px 0px')
    expect(projectedOrigin(box(900, 900, 10, 10), box(100, 100, 200, 200))).toBe('200px 200px')
  })

  it('falls back to centre with no trigger or an unlaid-out panel', () => {
    expect(projectedOrigin(null, box(0, 0, 100, 100))).toBe('center')
    expect(projectedOrigin(box(0, 0, 10, 10), box(0, 0, 0, 0))).toBe('center')
  })
})

describe('a declared exit', () => {
  it('lets a chip enter with a pop and exit with a plain fade', () => {
    const resolved = resolveBinding('taginput.chip', envAt('standard'))
    if (resolved.kind !== 'presence') throw new Error('expected presence')

    // The enter keeps its scale.
    expect(resolved.initial.scale).toBeLessThan(1)
    // The exit drops it, because the row closing the gap behind the chip
    // completes the motion.
    expect(resolved.exit).toEqual({ opacity: 0 })
    expect(resolved.properties.sort()).toEqual(['opacity', 'transform'])
  })

  it('changes only the keyframe, so the exit is still 0.65x the enter', () => {
    const resolved = resolveBinding('fileupload.row', envAt('standard'))
    if (resolved.kind !== 'presence') throw new Error('expected presence')
    expect(resolved.initial.y).toBeLessThan(0) // arrives from the zone above
    expect(resolved.exit).toEqual({ opacity: 0 })
    expect(resolved.exitTransition.duration).toBeCloseTo(
      (resolved.enterTransition.duration ?? 0) * MOTION_VALUES.exitRatio,
      2,
    )
  })

  it('still projects, so under reduced motion enter and exit use only opacity', () => {
    const env = { ...envAt('standard'), reducedMotion: true }
    for (const binding of ['taginput.chip', 'fileupload.row'] as const) {
      const resolved = resolveBinding(binding, env)
      if (resolved.kind !== 'presence') throw new Error('expected presence')
      expect(resolved.effective, binding).toBe('fade')
      expect(resolved.properties, binding).toEqual(['opacity'])
      expect(resolved.initial, binding).toEqual({ opacity: 0 })
      expect(resolved.exit, binding).toEqual({ opacity: 0 })
    }
  })

  it('refuses an override that would add a choreography instead of removing one', () => {
    // The law allows only `fade` as an exit. A registry entry naming
    // `slide-fade` would be two bindings under one name.
    const entry = MOTION_VALUES.bindings['taginput.chip'] as { exit?: string }
    const declared = entry.exit
    entry.exit = 'slide-fade'
    expect(() => resolveBinding('taginput.chip', envAt('standard'))).toThrow(/only be "fade"/)
    entry.exit = declared
  })
})
