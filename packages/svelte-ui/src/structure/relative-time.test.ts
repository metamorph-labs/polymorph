import { describe, expect, it } from 'vitest'

import { render } from '../mount'
import RelativeTime from './RelativeTime.svelte'

/**
 * RelativeTime's words in the Svelte shell. The phrase is the engine's
 * `relativeTimePhrase`, tested beside it; this holds the member's part of it:
 * `mode="both"` joins the moment and the distance with the host's
 * `messages.both`, as the React member does, so a locale orders and
 * punctuates them.
 */

describe('RelativeTime', () => {
  it('joins both with the host’s words, so a locale orders and punctuates them', async () => {
    const messages = { both: (moment: string, distance: string) => `${distance} · ${moment}` }
    const { host } = await render(RelativeTime, {
      value: '2026-08-04',
      locale: 'en-US',
      mode: 'both',
      messages,
    })
    expect(host.querySelector('time')?.textContent).toMatch(/^\S.* · Aug 4, 2026$/)
  })
})
