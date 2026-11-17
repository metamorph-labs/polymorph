import { describe, expect, it } from 'vitest'

import { mount } from '../mount'
import RelativeTime from './RelativeTime'

/**
 * RelativeTime's words in the Solid shell. The phrase is the engine's
 * `relativeTimePhrase`, tested beside it; this holds the member's part of it:
 * `mode="both"` joins the moment and the distance with the host's
 * `messages.both`, as the React member does, so a locale orders and
 * punctuates them.
 */

describe('RelativeTime', () => {
  it('joins both with the host’s words, so a locale orders and punctuates them', async () => {
    const messages = { both: (moment: string, distance: string) => `${distance} · ${moment}` }
    const { host } = await mount(() => (
      <RelativeTime value="2026-08-04" locale="en-US" mode="both" messages={messages} />
    ))
    expect(host.querySelector('time')?.textContent).toMatch(/^\S.* · Aug 4, 2026$/)
  })
})
