import { flushSync } from 'svelte'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { installTestTheme } from '@polymorph/engine/testing'

import { render } from '../mount'
import { live } from '../testing/live.svelte'
import PresenceHarness from '../testing/PresenceHarness.svelte'

/**
 * The Svelte foundation's presence (`@polymorph/svelte/motion`) acts on a
 * change of the value `open` returns, as Vue's `watch` does. Its pre-effect
 * runs again whenever anything `open` reads changes, so an update that leaves
 * the value as it was must neither restart an entrance nor an exit: Select's
 * open-time highlight re-runs the sheet's presences before the panel's
 * entrance has started.
 */

beforeAll(installTestTheme)

const running = (element: Element | null) =>
  element === null
    ? []
    : element.getAnimations().filter((animation) => animation.playState === 'running')

describe('usePresence', () => {
  it('neither restarts an entrance nor an exit when open() reads a change but returns the same value', async () => {
    const held = live({ open: false, noise: 0 })
    const { host } = await render(PresenceHarness, held)
    const panel = () => host.querySelector('div')

    held.open = true
    await vi.waitFor(() => expect(running(panel())).not.toHaveLength(0))
    const entrance = running(panel())
    held.noise += 1
    flushSync()
    await new Promise((settle) => setTimeout(settle, 16))
    expect(entrance.map((animation) => animation.playState)).not.toContain('idle')
    await Promise.all(entrance.map((animation) => animation.finished))

    held.open = false
    await vi.waitFor(() => expect(running(panel())).not.toHaveLength(0))
    const exit = running(panel())
    held.noise += 1
    flushSync()
    await new Promise((settle) => setTimeout(settle, 16))
    expect(exit.map((animation) => animation.playState)).not.toContain('idle')
    await vi.waitFor(() => expect(panel()).toBeNull())
  })
})
