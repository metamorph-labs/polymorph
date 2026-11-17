import { DATA_ATTRS } from '@polymorph/react'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'

import { installTestTheme } from '@polymorph/engine/testing'
import styles from '@polymorph/recipes/conventions/motion.module.css'

/**
 * Tests the CSS part of the motion system: state feedback, press feedback and
 * the ambient loops. All of it uses transitions and animations, because CSS
 * transitions are interruptible. That suits constant, always-on motion and
 * leaves the engine for what CSS cannot do.
 *
 * The `:active` rule is checked by reading the shipped stylesheet rather than by
 * synthesising a press. A test cannot reliably hold a pointer-down long enough
 * to sample, and the rule's content is what the test asserts.
 */

let theme: ReturnType<typeof installTestTheme>

beforeAll(() => {
  theme = installTestTheme()
})

afterEach(() => {
  document.documentElement.removeAttribute(DATA_ATTRS.motion)
  document.body.replaceChildren()
})

function mount(className: string): HTMLElement {
  const element = document.createElement('div')
  element.className = className
  document.body.append(element)
  return element
}

/** Every rule in the shipped sheets whose selector mentions `fragment`. */
function rulesMatching(fragment: string): CSSStyleRule[] {
  const found: CSSStyleRule[] = []
  for (const sheet of document.styleSheets) {
    let rules: CSSRuleList
    try {
      rules = sheet.cssRules
    } catch {
      continue // cross-origin sheet; not ours
    }
    collect(rules, fragment, found)
  }
  return found
}

function collect(rules: CSSRuleList, fragment: string, found: CSSStyleRule[]): void {
  for (const rule of rules) {
    if (rule instanceof CSSStyleRule && rule.selectorText.includes(fragment)) found.push(rule)
    if (rule instanceof CSSMediaRule) collect(rule.cssRules, fragment, found)
  }
}

describe('state feedback', () => {
  it('transitions colour, border and shadow, and nothing that reflows', () => {
    const computed = getComputedStyle(mount(styles.stateFeedback as string))
    const properties = computed.transitionProperty.split(', ')
    expect(properties.sort()).toEqual(
      ['background-color', 'border-color', 'box-shadow', 'color'].sort(),
    )
  })

  it('takes its duration and curve from tokens', () => {
    const computed = getComputedStyle(mount(styles.stateFeedback as string))
    const expected = theme.tokens.motion[theme.axes.motionTemperament].duration.control
    for (const duration of computed.transitionDuration.split(', ')) {
      expect(msOf(duration)).toBe(msOf(expected))
    }
    expect(computed.transitionTimingFunction).toContain('cubic-bezier')
  })

  it('rescales with the temperament, exactly as the engine does', () => {
    const element = mount(styles.stateFeedback as string)
    document.documentElement.setAttribute(DATA_ATTRS.motion, 'expressive')
    const loud = msOf(getComputedStyle(element).transitionDuration.split(', ')[0] ?? '0s')
    document.documentElement.setAttribute(DATA_ATTRS.motion, 'subtle')
    const quiet = msOf(getComputedStyle(element).transitionDuration.split(', ')[0] ?? '0s')
    expect(loud).toBeGreaterThan(quiet)
  })

  it('stops at none, with no rule special-casing it', () => {
    const element = mount(styles.stateFeedback as string)
    document.documentElement.setAttribute(DATA_ATTRS.motion, 'none')
    for (const duration of getComputedStyle(element).transitionDuration.split(', ')) {
      expect(msOf(duration)).toBe(0)
    }
  })
})

describe('press feedback', () => {
  it('releases on the control duration and the enter curve, keeping the colour list', () => {
    // The pressable shorthand repeats the colour list. Every part that uses
    // `pressable` also uses `stateFeedback`, and a shorthand that names only
    // `transform` would discard the colour feedback on the members pressed
    // most often.
    const computed = getComputedStyle(mount(styles.pressable as string))
    expect(computed.transitionProperty).toBe(
      'background-color, border-color, color, box-shadow, transform',
    )
    const expected = theme.tokens.motion[theme.axes.motionTemperament].duration.control
    for (const duration of computed.transitionDuration.split(', ')) {
      expect(msOf(duration)).toBe(msOf(expected))
    }
  })

  it('presses down over half that duration, on the standard curve', () => {
    const [rule] = rulesMatching(`.${styles.pressable}:active`)
    expect(rule, 'no :active rule in the shipped sheet').toBeDefined()
    const declaration = rule?.style.getPropertyValue('transition') ?? ''
    expect(declaration).toContain('calc(var(--pm-motion-duration-control) * 0.5)')
    expect(declaration).toContain('var(--pm-motion-easing-standard)')
  })

  it('scales by the token, so `none` is a no-op transform rather than a special case', () => {
    const [rule] = rulesMatching(`.${styles.pressable}:active`)
    expect(rule?.style.getPropertyValue('transform')).toBe('scale(var(--pm-motion-press-scale))')

    const probe = mount('')
    probe.style.setProperty('transform', 'scale(var(--pm-motion-press-scale))')
    document.documentElement.setAttribute(DATA_ATTRS.motion, 'none')
    // `scale(1)` is the identity matrix, so nothing changes visually. The token
    // does the work; no rule mentions `none`.
    expect(getComputedStyle(probe).transform).toBe('matrix(1, 0, 0, 1, 0, 0)')
  })

  it('drops the transform entirely under reduced motion', () => {
    const reduced = rulesMatching(`.${styles.pressable}`).filter(
      (rule) => rule.parentRule instanceof CSSMediaRule,
    )
    expect(reduced.length, 'no reduced-motion override for press').toBeGreaterThan(0)
    expect(reduced.some((rule) => rule.style.transform === 'none')).toBe(true)
  })
})

describe('ambient loops', () => {
  it('spins on the token period, forever, linearly', () => {
    const computed = getComputedStyle(mount(styles.spin as string))
    const expected = theme.tokens.motion[theme.axes.motionTemperament].ambient.spin
    expect(msOf(computed.animationDuration)).toBe(msOf(expected))
    expect(computed.animationIterationCount).toBe('infinite')
    expect(computed.animationTimingFunction).toBe('linear')
    expect(computed.animationName).not.toBe('none')
  })

  it('slows down as the temperament calms, because periods scale inversely', () => {
    const element = mount(styles.spin as string)
    document.documentElement.setAttribute(DATA_ATTRS.motion, 'subtle')
    const calm = msOf(getComputedStyle(element).animationDuration)
    document.documentElement.setAttribute(DATA_ATTRS.motion, 'expressive')
    const lively = msOf(getComputedStyle(element).animationDuration)
    expect(calm, 'a calmer theme should shimmer slower, not faster').toBeGreaterThan(lively)
  })

  it('is killed at none by the attribute rule, not by each component', () => {
    const element = mount(styles.spin as string)
    document.documentElement.setAttribute(DATA_ATTRS.motion, 'none')
    expect(getComputedStyle(element).animationName).toBe('none')
  })

  it('clips its sheen so a shimmer cannot escape its host', () => {
    const computed = getComputedStyle(mount(styles.shimmer as string))
    expect(computed.overflow).toBe('hidden')
    expect(computed.position).toBe('relative')
  })

  it('is killed globally under reduced motion, in one place', () => {
    // The motion spec's reduced-motion projection stops ambient loops in one
    // place: the spin and the sheen, inside one media query. No component
    // special-cases it.
    const killed = rulesMatching(styles.spin as string).filter(
      (rule) => rule.parentRule instanceof CSSMediaRule,
    )
    expect(killed.length).toBeGreaterThan(0)
    // The `animation` shorthand serialises to longhands, so the name is the
    // reliable read.
    expect(
      killed.some((rule) => rule.style.animationName === 'none'),
      'reduced motion must stop the loop',
    ).toBe(true)
  })
})

/** `140ms` / `0.14s` -> 140. */
function msOf(value: string): number {
  const first = value.split(',')[0]?.trim() ?? '0'
  const number = Number.parseFloat(first)
  if (Number.isNaN(number)) return 0
  return first.endsWith('ms') ? number : number * 1000
}
