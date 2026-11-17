import { cdp } from 'vitest/browser'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  composeTheme,
  DATA_ATTRS,
  emitThemeCSS,
  emitThemesCSS,
  installThemeCSS,
  MORE_CONTRAST_QUERY,
  parsePalette,
  parseSystem,
  resolveTheme,
} from '@polymorph/theme'

import amethyst from '../../../../design/palettes/amethyst.json' with { type: 'json' }
import petrol from '../../../../design/palettes/petrol.json' with { type: 'json' }
import pastel from '../../../../design/systems/pastel.json' with { type: 'json' }
import { installTestTheme } from '../testing'
import { formatColor, parseColor, readThemeValues, themeVersion, watchTheme } from './theme-values'

/**
 * The theme as data: what another library's component is given when it takes
 * its colours and sizes through a JavaScript API and not through CSS.
 */

const root = document.documentElement
const mounted: Element[] = []

/** Long enough for a mutation observer to have delivered what it saw. */
const settled = () => new Promise((resolve) => setTimeout(resolve, 20))

/**
 * The DevTools session, typed by the one method these tests call. Its real
 * type comes with the provider's Node types, which this package does not load.
 */
const devtools = () =>
  cdp() as unknown as { send(method: string, params: Record<string, unknown>): Promise<unknown> }

/*
 * Playwright opens a DevTools session only in Chromium, so the test that turns
 * on a contrast preference through one skips on the other engines. The limit
 * is named for the vocabulary packages in `packages/conformance/src/engines.ts`,
 * which this package cannot import.
 */
declare const __PM_ENGINE__: string
const NO_MEDIA_EMULATION = __PM_ENGINE__ !== 'chromium'

function mount(html: string): HTMLElement {
  const host = document.createElement('div')
  host.innerHTML = html
  document.body.append(host)
  mounted.push(host)
  return host
}

/** A token as the browser paints it, the value a reading must agree with. */
function painted(name: string, within: Element = document.body): string {
  const probe = document.createElement('span')
  probe.style.color = `var(${name})`
  within.append(probe)
  const color = getComputedStyle(probe).color
  probe.remove()
  return color
}

beforeEach(() => {
  installTestTheme()
})

afterEach(() => {
  for (const element of mounted.splice(0)) element.remove()
  for (const attribute of Object.values(DATA_ATTRS)) root.removeAttribute(attribute)
  root.removeAttribute('dir')
})

describe('parseColor reads every form a token or a computed colour takes', () => {
  it.each([
    ['#4087de', [64, 135, 222, 1]],
    ['#FFF', [255, 255, 255, 1]],
    ['#00000080', [0, 0, 0, 128 / 255]],
    ['rgb(9 10 12 / 0.4)', [9, 10, 12, 0.4]],
    ['rgb(9, 10, 12)', [9, 10, 12, 1]],
    ['rgba(64, 135, 222, 0.16)', [64, 135, 222, 0.16]],
    ['rgb(100% 0% 50% / 50%)', [255, 0, 128, 0.5]],
    ['color(srgb 1 0.5 0 / 0.25)', [255, 128, 0, 0.25]],
  ])('%s', (text, channels) => {
    expect(parseColor(text)).toEqual(channels)
  })

  it('gives null for what is not an sRGB colour', () => {
    expect(parseColor('linear-gradient(red, blue)')).toBeNull()
    expect(parseColor('oklch(0.6 0.2 250)')).toBeNull()
    expect(parseColor('')).toBeNull()
  })

  it('writes an opaque colour as hex and a translucent one as rgba', () => {
    expect(formatColor([64, 135, 222, 1])).toBe('#4087de')
    expect(formatColor([9, 10, 12, 0.4])).toBe('rgba(9, 10, 12, 0.4)')
  })
})

describe('readThemeValues gives the values the cascade resolved', () => {
  it('reads a colour role as the colour the browser paints', () => {
    const theme = readThemeValues()
    expect(theme.themed).toBe(true)
    expect(theme.color('accent.bg')).toMatch(/^#[0-9a-f]{6}$/)
    expect(parseColor(theme.color('accent.bg'))).toEqual(parseColor(painted('--pm-accent-bg')))
    expect(theme.channels('text.primary')).toEqual(parseColor(painted('--pm-text-primary')))
    expect(theme.color('chart.1')).toMatch(/^#[0-9a-f]{6}$/)
  })

  it('writes a translucent role with its alpha', () => {
    const theme = readThemeValues()
    const [, , , alpha] = theme.channels('bg.scrim')
    expect(alpha).toBeGreaterThan(0)
    expect(alpha).toBeLessThan(1)
    expect(theme.color('bg.scrim')).toMatch(/^rgba\(\d+, \d+, \d+, 0\.\d+\)$/)
  })

  it('reads lengths as pixels, a rem token by the root font size', () => {
    const theme = readThemeValues()
    const length = (name: string) => {
      const probe = document.createElement('div')
      probe.style.width = `var(${name})`
      document.body.append(probe)
      const width = Number.parseFloat(getComputedStyle(probe).width)
      probe.remove()
      return width
    }
    expect(theme.space(4)).toBe(length('--pm-space-4'))
    expect(theme.radius('md')).toBe(length('--pm-radius-md'))
    expect(theme.radius('control')).toBe(length('--pm-radius-control'))
    expect(theme.controlHeight('md')).toBe(length('--pm-control-height-md'))
    expect(theme.text('md').size).toBeCloseTo(length('--pm-text-md-size'), 3)
  })

  it('reads a type step, a font slot and a duration', () => {
    const theme = readThemeValues()
    const text = theme.text('sm')
    expect(text.family).toBe(theme.font('body'))
    expect(text.family).not.toBe('')
    expect(text.lineHeight).toBeGreaterThan(1)
    expect(text.weight).toBeGreaterThanOrEqual(100)
    expect(theme.duration('control')).toBeGreaterThan(0)
    expect(theme.value('--pm-shadow-raised')).not.toBe('')
  })

  it('reads the mode an element is drawn in, and the opposite inside an inverse tone', () => {
    const host = mount(`<div ${DATA_ATTRS.tone}="inverse"><span></span></div>`)
    const inner = host.querySelector('span') as Element
    expect(readThemeValues().mode).toBe('light')
    const inverse = readThemeValues(inner)
    expect(inverse.mode).toBe('dark')
    expect(inverse.color('bg.surface')).not.toBe(readThemeValues().color('bg.surface'))
    expect(parseColor(inverse.color('bg.surface'))).toEqual(
      parseColor(painted('--pm-bg-surface', inner)),
    )
  })

  it('reads a density scope from inside it', () => {
    const host = mount(`<div ${DATA_ATTRS.density}="compact"><span></span></div>`)
    const compact = readThemeValues(host.querySelector('span'))
    mount(`<div ${DATA_ATTRS.density}="comfortable"><span id="roomy"></span></div>`)
    const comfortable = readThemeValues(document.querySelector('#roomy'))
    expect(compact.controlHeight('md')).toBeLessThan(comfortable.controlHeight('md'))
  })

  it('takes its element from a function when a value is read', () => {
    let element: Element | null = null
    const theme = readThemeValues(() => element)
    const outside = theme.color('bg.surface')
    const host = mount(`<div ${DATA_ATTRS.tone}="inverse"><span></span></div>`)
    element = host.querySelector('span')
    expect(theme.color('bg.surface')).not.toBe(outside)
  })

  it('reads the document root’s values for an element that is not in the document', () => {
    const host = mount(`<div ${DATA_ATTRS.tone}="inverse"><span></span></div>`)
    const inner = host.querySelector('span') as Element
    const atRoot = readThemeValues()
    const kept = readThemeValues(inner)
    expect(kept.mode).toBe('dark')
    expect(kept.color('bg.surface')).not.toBe(atRoot.color('bg.surface'))

    host.remove()
    // The browser resolves no token for an element outside the document.
    expect(getComputedStyle(inner).getPropertyValue('--pm-space-4')).toBe('')
    const detached = readThemeValues(inner)
    expect(detached.themed).toBe(true)
    expect(detached.mode).toBe('light')
    expect(detached.color('bg.surface')).toBe(atRoot.color('bg.surface'))
    expect(detached.space(4)).toBe(atRoot.space(4))
    // A reading taken while the element was in the document follows it out.
    expect(kept.mode).toBe('light')
    expect(kept.color('bg.surface')).toBe(atRoot.color('bg.surface'))

    const never = readThemeValues(document.createElement('div'))
    expect(never.themed).toBe(true)
    expect(never.color('accent.bg')).toBe(atRoot.color('accent.bg'))
  })

  it('reads the document direction', () => {
    expect(readThemeValues().direction).toBe('ltr')
    root.setAttribute('dir', 'rtl')
    expect(readThemeValues().direction).toBe('rtl')
  })

  it('keeps the mode and the direction it read, as it keeps a token', () => {
    const theme = readThemeValues()
    const light = theme.color('bg.app')
    expect(theme.mode).toBe('light')
    expect(theme.direction).toBe('ltr')
    root.setAttribute(DATA_ATTRS.mode, 'dark')
    root.setAttribute('dir', 'rtl')
    // One reading is one moment: its mode is the mode its colours were read in.
    expect(theme.color('bg.app')).toBe(light)
    expect(theme.mode).toBe('light')
    expect(theme.direction).toBe('ltr')
    const next = readThemeValues()
    expect(next.mode).toBe('dark')
    expect(next.direction).toBe('rtl')
    expect(next.color('bg.app')).not.toBe(light)
  })

  it('is unthemed, with empty values, in a document no pairing reaches', () => {
    root.removeAttribute(DATA_ATTRS.system)
    const theme = readThemeValues()
    expect(theme.themed).toBe(false)
    expect(theme.color('accent.bg')).toBe('')
    expect(theme.space(4)).toBe(0)
    expect(theme.text('md').size).toBe(0)
  })
})

describe('watchTheme says when to read again', () => {
  it('calls its listener when the mode changes, and the new reading differs', async () => {
    const before = readThemeValues().color('bg.app')
    const listener = vi.fn()
    const release = watchTheme(listener)
    const version = themeVersion()
    try {
      root.setAttribute(DATA_ATTRS.mode, 'dark')
      await vi.waitFor(() => expect(listener).toHaveBeenCalled())
      expect(themeVersion()).toBeGreaterThan(version)
      expect(readThemeValues().mode).toBe('dark')
      expect(readThemeValues().color('bg.app')).not.toBe(before)
    } finally {
      release()
    }
  })

  it('calls its listener for a scope set on any element, and for the direction', async () => {
    const host = mount('<div></div>')
    const listener = vi.fn()
    const release = watchTheme(listener)
    try {
      host.setAttribute(DATA_ATTRS.density, 'compact')
      await vi.waitFor(() => expect(listener).toHaveBeenCalledTimes(1))
      root.setAttribute('dir', 'rtl')
      await vi.waitFor(() => expect(listener).toHaveBeenCalledTimes(2))
    } finally {
      release()
    }
  })

  it('calls its listener when a pairing sheet arrives', async () => {
    const listener = vi.fn()
    const release = watchTheme(listener)
    const sheet = document.createElement('style')
    sheet.setAttribute('data-pm-pairing', 'test/extra')
    try {
      document.head.append(sheet)
      await vi.waitFor(() => expect(listener).toHaveBeenCalledTimes(1))
      // A stylesheet that is not the theme's says nothing about it.
      const other = document.createElement('style')
      document.head.append(other)
      other.textContent = 'html { color: inherit }'
      other.remove()
      await settled()
      expect(listener).toHaveBeenCalledTimes(1)
    } finally {
      sheet.remove()
      release()
    }
  })

  it('stops calling a released listener', async () => {
    const listener = vi.fn()
    const kept = vi.fn()
    const release = watchTheme(listener)
    const releaseKept = watchTheme(kept)
    release()
    try {
      root.setAttribute(DATA_ATTRS.mode, 'dark')
      await vi.waitFor(() => expect(kept).toHaveBeenCalled())
      expect(listener).not.toHaveBeenCalled()
    } finally {
      releaseKept()
    }
  })

  it('does not call its listener when a member changes a tone or a mode of its own', async () => {
    // A Text writes its tone and a BarChart its drawing mode in the attributes a scope uses.
    const host = mount(
      `<p ${DATA_ATTRS.tone}="secondary"></p><svg ${DATA_ATTRS.mode}="grouped"></svg><i></i>`,
    )
    const [text, chart, plain] = [...host.children] as [Element, Element, Element]
    const listener = vi.fn()
    const release = watchTheme(listener)
    const version = themeVersion()
    try {
      text.setAttribute(DATA_ATTRS.tone, 'danger')
      chart.setAttribute(DATA_ATTRS.mode, 'stacked')
      plain.setAttribute(DATA_ATTRS.tone, 'success')
      plain.removeAttribute(DATA_ATTRS.tone)
      await settled()
      expect(listener).not.toHaveBeenCalled()
      expect(themeVersion()).toBe(version)
      // The same observer is still listening: a scope's attribute reaches it.
      plain.setAttribute(DATA_ATTRS.density, 'compact')
      await vi.waitFor(() => expect(listener).toHaveBeenCalledTimes(1))
    } finally {
      release()
    }
  })

  it('calls its listener when an element enters or leaves an inverse tone', async () => {
    const host = mount(`<div><p ${DATA_ATTRS.tone}="secondary"></p></div>`)
    const scope = host.firstElementChild as Element
    const text = scope.firstElementChild as Element
    const listener = vi.fn()
    const release = watchTheme(listener)
    try {
      scope.setAttribute(DATA_ATTRS.tone, 'inverse')
      await vi.waitFor(() => expect(listener).toHaveBeenCalledTimes(1))
      scope.removeAttribute(DATA_ATTRS.tone)
      await vi.waitFor(() => expect(listener).toHaveBeenCalledTimes(2))
      text.setAttribute(DATA_ATTRS.tone, 'inverse')
      await vi.waitFor(() => expect(listener).toHaveBeenCalledTimes(3))
      text.setAttribute(DATA_ATTRS.tone, 'danger')
      await vi.waitFor(() => expect(listener).toHaveBeenCalledTimes(4))
    } finally {
      release()
    }
  })

  it('calls its listener for a mode scope on any element, set, changed or removed', async () => {
    const host = mount('<div></div>')
    const scope = host.firstElementChild as Element
    const listener = vi.fn()
    const release = watchTheme(listener)
    try {
      scope.setAttribute(DATA_ATTRS.mode, 'dark')
      await vi.waitFor(() => expect(listener).toHaveBeenCalledTimes(1))
      scope.setAttribute(DATA_ATTRS.mode, 'light')
      await vi.waitFor(() => expect(listener).toHaveBeenCalledTimes(2))
      scope.removeAttribute(DATA_ATTRS.mode)
      await vi.waitFor(() => expect(listener).toHaveBeenCalledTimes(3))
    } finally {
      release()
    }
  })

  it('does not call its listener when an attribute is written with the value it has', async () => {
    const listener = vi.fn()
    const release = watchTheme(listener)
    try {
      root.setAttribute(DATA_ATTRS.mode, 'light')
      await settled()
      expect(listener).not.toHaveBeenCalled()
    } finally {
      release()
    }
  })

  it('calls its listener when the eager sheet is installed again under the same names', async () => {
    const before = readThemeValues().color('accent.bg')
    const listener = vi.fn()
    const release = watchTheme(listener)
    try {
      // The same pairing by name, derived from another palette's seeds.
      const again = resolveTheme(
        composeTheme(parseSystem(pastel), parsePalette({ ...petrol, name: amethyst.name })),
      )
      installThemeCSS(emitThemesCSS([again]))
      await vi.waitFor(() => expect(listener).toHaveBeenCalledTimes(1))
      expect(readThemeValues().color('accent.bg')).not.toBe(before)
    } finally {
      release()
    }
  })

  it('grows its version when it takes its first listener, because nothing watched before it', async () => {
    const release = watchTheme(() => {})
    const held = themeVersion()
    const cached = readThemeValues().color('bg.app')
    release()
    // No listener is held, so no observer sees this change.
    root.setAttribute(DATA_ATTRS.mode, 'dark')
    await settled()
    const releaseAgain = watchTheme(() => {})
    try {
      expect(themeVersion()).toBeGreaterThan(held)
      expect(readThemeValues().color('bg.app')).not.toBe(cached)
      // A second listener joins an observer that has missed nothing.
      const joined = themeVersion()
      watchTheme(() => {})()
      expect(themeVersion()).toBe(joined)
    } finally {
      releaseAgain()
    }
  })

  it('holds no observer once its last listener is released', async () => {
    const listener = vi.fn()
    const release = watchTheme(listener)
    release()
    // A second call releases nothing more.
    release()
    const version = themeVersion()
    root.setAttribute(DATA_ATTRS.mode, 'dark')
    await settled()
    expect(listener).not.toHaveBeenCalled()
    // The version grows on a change only while an observer runs.
    expect(themeVersion()).toBe(version)
  })

  // The provider can take longer than the default timeout to open the DevTools
  // session at the start of a full run, so the test carries the setup hooks' budget.
  it.skipIf(NO_MEDIA_EMULATION)(
    'calls its listener when the reader asks for more contrast, and the reading is the partner’s',
    async () => {
      const theme = resolveTheme(composeTheme(parseSystem(pastel), parsePalette(amethyst)))
      const partner = resolveTheme(composeTheme(parseSystem(pastel), parsePalette(petrol)))
      installThemeCSS(emitThemeCSS(theme, { moreContrast: partner }))
      expect(matchMedia(MORE_CONTRAST_QUERY).matches).toBe(false)
      const before = readThemeValues().color('accent.bg')
      const listener = vi.fn()
      const release = watchTheme(listener)
      try {
        await devtools().send('Emulation.setEmulatedMedia', {
          features: [{ name: 'prefers-contrast', value: 'more' }],
        })
        await vi.waitFor(() => expect(listener).toHaveBeenCalledTimes(1))
        expect(matchMedia(MORE_CONTRAST_QUERY).matches).toBe(true)
        expect(readThemeValues().color('accent.bg')).not.toBe(before)
        await devtools().send('Emulation.setEmulatedMedia', { features: [] })
        await vi.waitFor(() => expect(listener).toHaveBeenCalledTimes(2))
        expect(readThemeValues().color('accent.bg')).toBe(before)
      } finally {
        await devtools().send('Emulation.setEmulatedMedia', { features: [] })
        release()
      }
    },
    120_000,
  )
})
