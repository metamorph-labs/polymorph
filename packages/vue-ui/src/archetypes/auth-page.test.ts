import { userEvent } from 'vitest/browser'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { h, nextTick, ref } from 'vue'

import { installTestTheme } from '@polymorph/engine/testing'
import { PageTransitions } from '@polymorph/vue'

import { mount } from '../mount'
import AuthPage from './AuthPage.vue'

/**
 * The page-transition convention through AuthPage, which renders its column in
 * the foundation's `PageTransition` (`design/conventions/page-transitions.md`),
 * as the React convention's test holds it: a new key replays the arrival on
 * the same element, so a field keeps its draft and its focus; a pending page
 * holds still and keeps the ribbon up; a departure fades the page until the
 * browser shows it again.
 */

beforeAll(installTestTheme)

const frame = () => document.querySelector<HTMLElement>('[data-page-transition]')!
const ribbon = () => document.querySelector<HTMLElement>('[data-page-progress]')

function page(key: { value: string }, pending: { value: boolean }) {
  return mount(() =>
    h(PageTransitions, null, {
      default: () => [
        h(
          AuthPage,
          { title: 'Account', transitionKey: key.value, pending: pending.value },
          { default: () => [h('input', { 'aria-label': 'Draft' })] },
        ),
      ],
    }),
  )
}

describe('AuthPage — the page-transition convention', () => {
  it('replays the arrival on a new key without replacing the focused field', async () => {
    const key = ref('first')
    await page(key, ref(false))
    const field = document.querySelector('input') as HTMLInputElement
    await userEvent.type(field, 'kept')
    expect(frame().dataset['pageTransition']).toBe('a')
    expect(frame().dataset['pageTransitionState']).toBe('entered')

    key.value = 'second'
    await nextTick()
    expect(frame().dataset['pageTransition']).toBe('b')
    expect(document.querySelector('input')).toBe(field)
    expect(field.value).toBe('kept')
    expect(document.activeElement).toBe(field)
  })

  it('holds a pending page still, with the ribbon up until it settles', async () => {
    const pending = ref(true)
    await page(ref('accounts'), pending)
    expect(frame().dataset['pageTransitionState']).toBe('pending')
    expect(getComputedStyle(frame()).animationName).toBe('none')
    await vi.waitFor(() => expect(ribbon()?.dataset['pageProgress']).toBe('visible'))
    expect(ribbon()?.getAttribute('aria-hidden')).toBe('true')

    pending.value = false
    await vi.waitFor(() => expect(frame().dataset['pageTransitionState']).toBe('entered'))
    await vi.waitFor(() => expect(ribbon()?.dataset['pageProgress']).toBe('hidden'), {
      timeout: 2000,
    })
  })

  it('fades the page while the browser leaves, and restores it when the page is shown', async () => {
    await page(ref('account'), ref(false))
    window.dispatchEvent(new Event('beforeunload'))
    await vi.waitFor(() => expect(frame().dataset['pageTransitionState']).toBe('exiting'))
    window.dispatchEvent(new Event('pageshow'))
    await vi.waitFor(() => expect(frame().dataset['pageTransitionState']).toBe('entered'))
  })
})
