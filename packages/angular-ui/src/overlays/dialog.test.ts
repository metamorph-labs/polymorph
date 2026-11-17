import { Component, signal } from '@angular/core'
import { userEvent } from 'vitest/browser'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { dialogFitLaw, type DialogFitLawMount } from '@polymorph/conformance/dialog-fit'
import { TAB_PASSES_BUTTONS } from '@polymorph/conformance/engines'
import { PARTS } from '@polymorph/conformance'
import { installTestTheme } from '@polymorph/engine/testing'

import { mount, mountComponent } from '../mount'
import { Button } from '../controls/Button'
import { states as buttons } from '../controls/button.states'
import { Dialog } from './Dialog'
import { states } from './dialog.states'

/**
 * Dialog's focus trap in the Angular shell (`design/components/dialog.md`).
 * Zag's modal dialog hides the page behind the panel with `aria-hidden` while
 * the page still holds focusable controls; the trap is what makes that safe,
 * and the axe law's `aria-hidden-focus` exception (`src/laws.test.ts`) rests on
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
      // A control outside the dialog, before it, where an escaped Tab would land.
      await mount(buttons, buttons.entries[0]?.name as string)
      await mount(states, OPEN)
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

  it('opens from the trigger the caller slots, and returns focus to it on Escape', async () => {
    const { host } = await mount(states, 'plain')
    const trigger = host.querySelector<HTMLButtonElement>('button') as HTMLButtonElement
    await userEvent.click(trigger)
    await vi.waitFor(() => expect(panel()?.contains(document.activeElement)).toBe(true))
    await userEvent.keyboard('{Escape}')
    await vi.waitFor(() => expect(panel()).toBeNull())
    await vi.waitFor(() => expect(document.activeElement).toBe(trigger))
  })
})

describe("Dialog's primary is the footer's last Button", () => {
  /**
   * An Angular Button is a `<button>` inside its `pm-button` host, where every
   * `<button>` is a last child. The conformance locator for `primary`
   * (`@polymorph/conformance`'s `parts.ts`) reads the host's place in the
   * footer, so it finds the footer's last Button and no other, and
   * `focus on-open primary` cannot hold on another footer Button.
   */
  it('is the one Button the conformance locator finds', async () => {
    const { host } = await mount(states, 'with a footer — one primary action, rightmost')
    await userEvent.click(host.querySelector<HTMLButtonElement>('button') as HTMLButtonElement)
    await vi.waitFor(() => expect(panel()).not.toBeNull())
    const found = [...document.querySelectorAll<HTMLElement>(PARTS.Dialog?.primary ?? '')]
    expect(found.map((button) => button.textContent?.trim())).toEqual(['Discard'])
  })
})

/** The application around the dialog: it draws the one the law describes, once the law sets it. */
@Component({
  selector: 'test-fit-dialog',
  imports: [Button, Dialog],
  template: `@if (law(); as law) {
    @if (law.footer !== undefined) {
      <pm-dialog
        [defaultOpen]="true"
        [title]="law.title"
        [description]="law.description"
        [size]="law.size"
        [presentation]="law.presentation"
      >
        @for (text of law.paragraphs; track $index) {
          <p>{{ text }}</p>
        }
        <ng-container ngProjectAs="[slot=footer]"><pm-button [label]="law.footer" /></ng-container>
      </pm-dialog>
    } @else {
      <pm-dialog
        [defaultOpen]="true"
        [title]="law.title"
        [description]="law.description"
        [size]="law.size"
        [presentation]="law.presentation"
      >
        @for (text of law.paragraphs; track $index) {
          <p>{{ text }}</p>
        }
      </pm-dialog>
    }
  }`,
})
class Fitted {
  readonly law = signal<DialogFitLawMount | undefined>(undefined)
}

/**
 * How the panel fits a window shorter than its content, at phone and desktop
 * width, in both presentations, as `@polymorph/conformance/dialog-fit` states
 * it for every web shell.
 */
dialogFitLaw({
  shell: 'Angular',
  async mount(options) {
    const { ref } = await mountComponent(Fitted)
    ;(ref.instance as Fitted).law.set(options)
  },
})
