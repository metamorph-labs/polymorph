import { userEvent } from 'vitest/browser'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { TAB_PASSES_BUTTONS } from '@polymorph/conformance/engines'
import { installTestTheme } from '@polymorph/engine/testing'

import '../controls/Button'
import '../overlays/Dialog'
import { mount } from '../mount'

/**
 * A Dialog written in markup, opened and closed three times. Its body and its
 * footer render only inside the open panel, so each time it opens the panel
 * takes the same content again: the body's paragraph and one footer Button,
 * never two, and never left behind in the closed page. Focus moves into the
 * panel, and Escape closes the panel and returns focus to the trigger the page
 * wrote. Tab keeps focus in the open panel: the axe law's `aria-hidden-focus`
 * exception rests on this trap (`src/laws.test.ts`). The trap is pressed with
 * Tab onto buttons, which WebKit's Tab passes over (`TAB_PASSES_BUTTONS`).
 */

const DIALOG = {
  name: 'three times',
  html: '<poly-dialog title="New ticket"><poly-button slot="trigger" label="Open"></poly-button><p id="body-text">Body text</p><poly-button slot="footer" label="Create"></poly-button></poly-dialog>',
}

beforeAll(installTestTheme)

describe('a Dialog the page wrote, opened three times', () => {
  /** Opens the panel from the trigger, and waits for focus to move into it. */
  async function open(trigger: HTMLButtonElement, time: number): Promise<Element> {
    await userEvent.click(trigger)
    const panel = await vi.waitFor(() => {
      const found = document.querySelector('[role="dialog"]')
      if (found === null) throw new Error(`the panel did not open (${time})`)
      return found
    })
    await vi.waitFor(() => expect(panel.contains(document.activeElement)).toBe(true))
    return panel
  }

  async function close(trigger: HTMLButtonElement): Promise<void> {
    await userEvent.keyboard('{Escape}')
    await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).toBeNull())
    await vi.waitFor(() => expect(document.activeElement).toBe(trigger))
  }

  it('shows its body and footer once each time, and returns focus to the trigger', async () => {
    const { host } = await mount(DIALOG)
    const trigger = host.querySelector('button') as HTMLButtonElement
    expect(trigger.textContent).toContain('Open')
    for (let time = 1; time <= 3; time++) {
      const panel = await open(trigger, time)
      expect(document.querySelectorAll('#body-text')).toHaveLength(1)
      expect(panel.querySelector('#body-text')?.textContent).toBe('Body text')
      const footer = panel.querySelector('[data-dialog-part="footer"]')
      expect(footer?.querySelectorAll('poly-button')).toHaveLength(1)
      expect(footer?.querySelectorAll('button')).toHaveLength(1)
      await close(trigger)
      // A closed overlay's content is not in the document.
      expect(document.getElementById('body-text')).toBeNull()
    }
  })

  it.skipIf(TAB_PASSES_BUTTONS)(
    'keeps focus in the open panel as Tab moves it, each time',
    async () => {
      const { host } = await mount(DIALOG)
      const trigger = host.querySelector('button') as HTMLButtonElement
      for (let time = 1; time <= 3; time++) {
        const panel = await open(trigger, time)
        for (let press = 0; press < 4; press++) {
          await userEvent.keyboard('{Tab}')
          expect(panel.contains(document.activeElement), `Tab ${press + 1}`).toBe(true)
        }
        await close(trigger)
      }
    },
  )
})
