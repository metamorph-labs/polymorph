import { userEvent } from 'vitest/browser'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { h } from 'vue'

import { installTestTheme } from '@polymorph/engine/testing'

import { mount } from '../mount'
import Accordion from './Accordion.vue'

/**
 * Accordion's region plays its close keyframes before it is hidden
 * (`design/components/accordion.md`, Motion), as the React member's does: the
 * machine would hide it the moment it closes, so the member holds it until
 * the recipe's animation ends.
 */

beforeAll(installTestTheme)

const ITEMS = [
  { value: 'delivery', label: 'When will my order arrive?', content: 'Two to four working days.' },
  { value: 'returns', label: 'How do returns work?', content: 'Thirty days, no reason needed.' },
]

const region = (value: string) =>
  [...document.querySelectorAll<HTMLElement>('[data-accordion-part="region"]')].find((element) =>
    element.textContent?.includes(value),
  )

describe('Accordion closes with its motion', () => {
  it('keeps a closing region in view while its close animation runs, then hides it', async () => {
    await mount(() => h(Accordion, { items: ITEMS, defaultValue: 'delivery' }))
    const open = region('Two to four') as HTMLElement
    expect(open.hidden).toBe(false)
    const trigger = document.querySelector<HTMLElement>('[data-accordion-part="trigger"]')
    // The region is read when it closes, in the same task. A read after the click returns can
    // come after the animation has ended when the whole suite runs.
    const closing = new Promise<{ hidden: boolean; animating: boolean }>((done) => {
      const observer = new MutationObserver(() => {
        if (open.getAttribute('data-state') !== 'closed') return
        observer.disconnect()
        done({
          hidden: open.hidden,
          animating: open.getAnimations().some((animation) => animation.playState === 'running'),
        })
      })
      observer.observe(open, { attributes: true, attributeFilter: ['data-state'] })
    })
    await userEvent.click(trigger as HTMLElement)
    // Closed, and still in view: the recipe's keyframes are running on it.
    expect(await closing).toEqual({ hidden: false, animating: true })
    await vi.waitFor(() => expect(open.hidden).toBe(true), { timeout: 3_000 })
  })

  it('shows a region that opens at once', async () => {
    await mount(() => h(Accordion, { items: ITEMS, defaultValue: 'delivery' }))
    const closed = region('Thirty days') as HTMLElement
    expect(closed.hidden).toBe(true)
    const triggers = document.querySelectorAll<HTMLElement>('[data-accordion-part="trigger"]')
    await userEvent.click(triggers[1] as HTMLElement)
    await vi.waitFor(() => expect(closed.hidden).toBe(false))
  })
})
