import { flushSync } from 'svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { installTestTheme } from '@polymorph/engine/testing'
import {
  DATA_ATTRS,
  parseColor,
  readThemeValues,
  themeVersion,
  type ThemeValues,
} from '@polymorph/svelte'

import { render } from '../mount'
import { live } from '../testing/live.svelte'
import ThemeValuesHarness from '../testing/ThemeValuesHarness.svelte'
import ThemeValuesReadsHarness from '../testing/ThemeValuesReadsHarness.svelte'

/**
 * `useThemeValues`: the engine's reading of the theme, kept current for a
 * Svelte component that hands it to another library.
 */

const root = document.documentElement

/** Long enough for a mutation observer to have delivered what it saw. */
const settled = () => new Promise((resolve) => setTimeout(resolve, 30))

/** Whether the engine holds a listener: its version grows on a change only while it does. */
async function engineFollows(): Promise<boolean> {
  const version = themeVersion()
  const next = root.getAttribute(DATA_ATTRS.density) === 'compact' ? 'comfortable' : 'compact'
  root.setAttribute(DATA_ATTRS.density, next)
  await settled()
  return themeVersion() !== version
}

beforeEach(() => {
  installTestTheme()
})

afterEach(() => {
  for (const attribute of Object.values(DATA_ATTRS)) root.removeAttribute(attribute)
})

describe('useThemeValues', () => {
  it('gives the document’s values, and a new reading when the mode changes', async () => {
    const readings: string[] = []
    const seen = (theme: ThemeValues) => readings.push(`${theme.mode} ${theme.color('bg.app')}`)
    await render(ThemeValuesHarness, { seen })
    expect(readings.at(-1)).toMatch(/^light #[0-9a-f]{6}$/)
    const before = readings.length

    root.setAttribute(DATA_ATTRS.mode, 'dark')
    await vi.waitFor(() => expect(readings.length).toBeGreaterThan(before))
    expect(readings.at(-1)).toMatch(/^dark #[0-9a-f]{6}$/)
  })

  it('reads from the element it is given, so a scope around it is seen', async () => {
    const modes: string[] = []
    await render(ThemeValuesHarness, {
      scoped: true,
      seen: (theme: ThemeValues) => modes.push(theme.mode),
    })
    await vi.waitFor(() => expect(modes.at(-1)).toBe('dark'))
  })

  it('keeps one reading while nothing changes, and through a member’s own tone', async () => {
    const seen = vi.fn()
    const { host } = await render(ThemeValuesHarness, { seen })
    const taken = seen.mock.calls.length
    const text = document.createElement('p')
    text.setAttribute(DATA_ATTRS.tone, 'secondary')
    host.append(text)
    text.setAttribute(DATA_ATTRS.tone, 'danger')
    await settled()
    expect(seen).toHaveBeenCalledTimes(taken)
  })

  it('is current when its reader is drawn again after a change made with no reader', async () => {
    const held = live({ open: true })
    const { host } = await render(ThemeValuesReadsHarness, held)
    const drawn = () => host.querySelector<HTMLElement>('[data-drawn]')
    const light = parseColor(drawn()?.style.borderColor ?? '')
    expect(light).toEqual(parseColor(readThemeValues().color('border.subtle')))

    held.open = false
    flushSync()
    expect(drawn()).toBeNull()
    // The hook's listener leaves with the last effect that read it.
    expect(await engineFollows()).toBe(false)
    root.setAttribute(DATA_ATTRS.mode, 'dark')
    await settled()

    held.open = true
    flushSync()
    const dark = parseColor(drawn()?.style.borderColor ?? '')
    expect(dark).toEqual(parseColor(readThemeValues().color('border.subtle')))
    expect(dark).not.toEqual(light)
  })

  it('takes a new reading for a handler, which nothing follows the theme for', async () => {
    const colours: string[] = []
    const { host } = await render(
      ThemeValuesReadsHarness,
      live({ read: (theme: ThemeValues) => colours.push(theme.color('bg.app')) }),
    )
    const button = host.querySelector('button') as HTMLButtonElement
    button.click()
    expect(colours).toEqual([readThemeValues().color('bg.app')])
    // No effect reads the hook, so it holds no listener.
    expect(await engineFollows()).toBe(false)

    root.setAttribute(DATA_ATTRS.mode, 'dark')
    await settled()
    button.click()
    expect(colours[1]).toBe(readThemeValues().color('bg.app'))
    expect(colours[1]).not.toBe(colours[0])
  })

  it('releases the engine’s listener when its component unmounts', async () => {
    const { unmount } = await render(ThemeValuesHarness, { seen: () => {} })
    expect(await engineFollows()).toBe(true)
    unmount()
    // Svelte stops a subscriber a microtask after the last effect that read it is destroyed.
    await settled()
    expect(await engineFollows()).toBe(false)
  })
})
