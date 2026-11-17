import { getByRole } from '@testing-library/dom'
import { userEvent } from 'vitest/browser'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { installTestTheme } from '@polymorph/engine/testing'

import { render } from '../mount'
import AvatarButtonTriggerHarness from '../testing/AvatarButtonTriggerHarness.svelte'

/**
 * AvatarButton as an overlay's trigger in the Svelte shell
 * (`design/components/avatar-button.md`), as the React member's test holds it:
 * a Menu and a Popover treat it as they treat a Button. The ARIA the overlay
 * aims at its trigger lands on the AvatarButton, never on the anchor around
 * it, a press opens the overlay, and focus returns to it when the overlay
 * closes. The contract grammar states a member's own behaviour, so what two
 * members do together is tested here.
 */

beforeAll(installTestTheme)

/** Opens from `trigger`, checks the overlay's ARIA on it against `plain`, and closes with Escape. */
async function holds(trigger: HTMLElement, plain: HTMLElement, popup: string): Promise<void> {
  await vi.waitFor(() => expect(trigger.getAttribute('aria-haspopup')).toBe(popup))
  for (const attribute of ['aria-haspopup', 'aria-expanded']) {
    expect(trigger.getAttribute(attribute), attribute).toBe(plain.getAttribute(attribute))
  }
  expect(trigger.parentElement?.hasAttribute('aria-haspopup')).toBe(false)
  expect(trigger.parentElement?.hasAttribute('aria-expanded')).toBe(false)

  await userEvent.click(trigger)
  await vi.waitFor(() => expect(trigger.getAttribute('aria-expanded')).toBe('true'))
  const panel = document.getElementById(trigger.getAttribute('aria-controls') ?? '')
  expect(panel?.getAttribute('role')).toBe(popup)
  // The overlay takes focus a frame after it opens, and listens for Escape from then. A
  // reader presses the key after that.
  await vi.waitFor(() => expect(panel?.contains(document.activeElement)).toBe(true))

  await userEvent.keyboard('{Escape}')
  await vi.waitFor(() => expect(trigger.getAttribute('aria-expanded')).not.toBe('true'))
  await vi.waitFor(() => expect(document.activeElement).toBe(trigger))
}

describe('AvatarButton as an overlay’s trigger', () => {
  it('carries a Menu’s ARIA, as a Button does, and takes focus back when it closes', async () => {
    const { host } = await render(AvatarButtonTriggerHarness, {})
    await holds(
      getByRole(host, 'button', { name: 'Account menu' }),
      getByRole(host, 'button', { name: 'Actions' }),
      'menu',
    )
  })

  it('carries a Popover’s ARIA, as a Button does, and takes focus back when it closes', async () => {
    const { host } = await render(AvatarButtonTriggerHarness, {})
    await holds(
      getByRole(host, 'button', { name: 'Account panel' }),
      getByRole(host, 'button', { name: 'Filters' }),
      'dialog',
    )
  })
})
