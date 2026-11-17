import { getByRole } from '@testing-library/dom'
import { userEvent } from 'vitest/browser'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { h } from 'vue'

import { dialogFitLaw } from '@polymorph/conformance/dialog-fit'
import { TAB_PASSES_BUTTONS } from '@polymorph/conformance/engines'
import { installTestTheme } from '@polymorph/engine/testing'

import { mount } from '../mount'
import Button from '../controls/Button.vue'
import Dialog from './Dialog.vue'
import { states } from './dialog.states'

/**
 * Dialog's focus trap in the Vue shell (`design/components/dialog.md`). Zag's
 * modal dialog hides the page behind the panel with `aria-hidden` while the
 * page still holds focusable controls; the trap is what makes that safe, and
 * the axe law's `aria-hidden-focus` exception (`src/laws.test.ts`) rests on
 * this test. The contract grammar has no statement for a trap
 * (`docs/conformance.md`), so it is tested here, as the React shell's
 * `dialog.test.tsx` tests it.
 */

beforeAll(installTestTheme)

const OPEN = 'open md — the panel itself, at the size it defaults to'

const panel = () => document.querySelector<HTMLElement>('[data-member="dialog"]')

describe('Dialog traps the tab loop inside the open panel', () => {
  it.skipIf(TAB_PASSES_BUTTONS)(
    'keeps focus in the panel however many times Tab is pressed, both ways',
    async () => {
      const entry = states.entries.find((candidate) => candidate.name === OPEN)
      expect(entry, OPEN).toBeDefined()
      // A control outside the dialog, before it, where an escaped Tab would land.
      await mount(() => h(Button, { label: 'Outside' }))
      await mount(() => entry?.render() ?? null)
      await vi.waitFor(() => expect(panel()?.contains(document.activeElement)).toBe(true))

      for (let step = 0; step < 6; step += 1) {
        await userEvent.keyboard('{Tab}')
        expect(panel()?.contains(document.activeElement), 'focus escaped the panel').toBe(true)
      }
      for (let step = 0; step < 6; step += 1) {
        await userEvent.keyboard('{Shift>}{Tab}{/Shift}')
        expect(panel()?.contains(document.activeElement), 'focus escaped the panel').toBe(true)
      }
    },
  )
})

/**
 * How the panel fits a window shorter than its content, at phone and desktop
 * width, in both presentations, as `@polymorph/conformance/dialog-fit` states
 * it for every web shell.
 */
dialogFitLaw({
  shell: 'Vue',
  async mount({ title, description, size, presentation, paragraphs, footer }) {
    await mount(() =>
      h(
        Dialog,
        {
          defaultOpen: true,
          title,
          ...(description === undefined ? {} : { description }),
          size,
          presentation,
        },
        {
          default: () => paragraphs.map((text) => h('p', text)),
          ...(footer === undefined ? {} : { footer: () => h(Button, { label: footer }) }),
        },
      ),
    )
  },
})

describe('Dialog returns focus to the control that opened it', () => {
  it('focuses the trigger the caller slots once Escape closes the panel', async () => {
    const entry = states.entries.find((candidate) => candidate.name === 'plain')
    expect(entry, 'plain').toBeDefined()
    await mount(() => entry?.render() ?? null)
    const trigger = getByRole(document.body, 'button', { name: 'Open' })
    // A press with no focus on the trigger first. WebKit leaves a pressed button unfocused,
    // so the machine's own return, to where focus was, would put it nowhere there.
    await userEvent.click(trigger)
    await vi.waitFor(() => expect(panel()?.contains(document.activeElement)).toBe(true))
    await userEvent.keyboard('{Escape}')
    await vi.waitFor(() => expect(panel()).toBeNull())
    await vi.waitFor(() => expect(document.activeElement).toBe(trigger))
  })
})
