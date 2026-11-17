import { getByRole } from '@testing-library/dom'
import { userEvent } from 'vitest/browser'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { h } from 'vue'

import { installTestTheme } from '@polymorph/engine/testing'

import { mount } from '../mount'
import Menu from '../overlays/Menu.vue'
import Popover from '../overlays/Popover.vue'
import AvatarButton from './AvatarButton.vue'
import Button from './Button.vue'

/**
 * AvatarButton as an overlay's trigger in the Vue shell
 * (`design/components/avatar-button.md`), as the React member's test holds it:
 * a Menu and a Popover treat it as they treat a Button. The ARIA the overlay
 * aims at its trigger lands on the AvatarButton, never on the anchor around
 * it, a press opens the overlay, and focus returns to it when the overlay
 * closes. The contract grammar states a member's own behaviour, so what two
 * members do together is tested here.
 */

beforeAll(installTestTheme)

const ITEMS = [{ label: 'Sign out', onSelect: () => {} }]

const FACE = { name: 'Ada Lovelace', label: 'Account menu' }

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
    const { host } = await mount(() =>
      h('div', [
        h(Menu, { items: ITEMS, align: 'end' }, { trigger: () => h(AvatarButton, FACE) }),
        h(Menu, { items: ITEMS }, { trigger: () => h(Button, { label: 'Actions' }) }),
      ]),
    )
    await holds(
      getByRole(host, 'button', { name: 'Account menu' }),
      getByRole(host, 'button', { name: 'Actions' }),
      'menu',
    )
  })

  it('carries a Popover’s ARIA, as a Button does, and takes focus back when it closes', async () => {
    const { host } = await mount(() =>
      h('div', [
        h(
          Popover,
          { label: 'Account' },
          { trigger: () => h(AvatarButton, FACE), default: () => h('p', 'Signed in as Ada') },
        ),
        h(
          Popover,
          { label: 'Filter configuration' },
          { trigger: () => h(Button, { label: 'Filters' }), default: () => h('p', 'Body') },
        ),
      ]),
    )
    await holds(
      getByRole(host, 'button', { name: 'Account menu' }),
      getByRole(host, 'button', { name: 'Filters' }),
      'dialog',
    )
  })
})
