import { tick } from 'svelte'
import { userEvent } from 'vitest/browser'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { installTestTheme } from '@polymorph/engine/testing'

import { render } from '../mount'
import AuthPageHarness from '../testing/AuthPageHarness.svelte'
import { live } from '../testing/live.svelte'

/**
 * The page-transition convention through AuthPage, which renders its column in
 * the foundation's `PageTransition` (`design/conventions/page-transitions.md`),
 * in the Svelte shell as the React convention's test holds it: a new key
 * replays the arrival on the same element, so a field keeps its draft and its
 * focus; a pending page holds still and keeps the ribbon up; a departure fades
 * the page until the browser shows it again.
 */

beforeAll(installTestTheme)

const frame = () => document.querySelector<HTMLElement>('[data-page-transition]')!
const ribbon = () => document.querySelector<HTMLElement>('[data-page-progress]')

/**
 * The AuthPage inside `PageTransitions` (`testing/AuthPageHarness.svelte`), following
 * `held.transitionKey` and `held.pending`.
 */
function page(held: { transitionKey: string; pending: boolean }) {
  return render(AuthPageHarness, held)
}

describe('AuthPage — the page-transition convention', () => {
  it('replays the arrival on a new key without replacing the focused field', async () => {
    const held = live({ transitionKey: 'first', pending: false })
    await page(held)
    const field = document.querySelector('input') as HTMLInputElement
    await userEvent.type(field, 'kept')
    expect(frame().dataset['pageTransition']).toBe('a')
    expect(frame().dataset['pageTransitionState']).toBe('entered')

    held.transitionKey = 'second'
    await tick()
    expect(frame().dataset['pageTransition']).toBe('b')
    expect(document.querySelector('input')).toBe(field)
    expect(field.value).toBe('kept')
    expect(document.activeElement).toBe(field)
  })

  it('holds a pending page still, with the ribbon up until it settles', async () => {
    const held = live({ transitionKey: 'accounts', pending: true })
    await page(held)
    expect(frame().dataset['pageTransitionState']).toBe('pending')
    expect(getComputedStyle(frame()).animationName).toBe('none')
    await vi.waitFor(() => expect(ribbon()?.dataset['pageProgress']).toBe('visible'))
    expect(ribbon()?.getAttribute('aria-hidden')).toBe('true')

    held.pending = false
    await vi.waitFor(() => expect(frame().dataset['pageTransitionState']).toBe('entered'))
    await vi.waitFor(() => expect(ribbon()?.dataset['pageProgress']).toBe('hidden'), {
      timeout: 2000,
    })
  })

  it('fades the page while the browser leaves, and restores it when the page is shown', async () => {
    await page(live({ transitionKey: 'account', pending: false }))
    window.dispatchEvent(new Event('beforeunload'))
    await vi.waitFor(() => expect(frame().dataset['pageTransitionState']).toBe('exiting'))
    window.dispatchEvent(new Event('pageshow'))
    await vi.waitFor(() => expect(frame().dataset['pageTransitionState']).toBe('entered'))
  })
})
