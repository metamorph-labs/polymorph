import { Component } from '@angular/core'
import { getByRole } from '@testing-library/dom'
import { userEvent } from 'vitest/browser'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { installTestTheme } from '@polymorph/engine/testing'

import { mountComponent } from '../mount'
import { Menu } from '../overlays/Menu'
import { Popover } from '../overlays/Popover'
import { AvatarButton } from './AvatarButton'
import { Button } from './Button'

/**
 * AvatarButton as an overlay's trigger in the Angular shell
 * (`design/components/avatar-button.md`), as the React member's test holds it:
 * a Menu and a Popover treat it as they treat a Button. The ARIA the overlay
 * aims at its trigger lands on the AvatarButton's `<button>`, never on the
 * anchor around it, a press opens the overlay, and focus returns to it when
 * the overlay closes. The contract grammar states a member's own behaviour, so
 * what two members do together is tested here.
 */

beforeAll(installTestTheme)

@Component({
  selector: 'test-avatar-menus',
  imports: [AvatarButton, Button, Menu],
  template: `<pm-menu [items]="items" align="end"
      ><ng-container ngProjectAs="[slot=trigger]"
        ><pm-avatar-button
          name="Ada Lovelace"
          label="Account menu"
        ></pm-avatar-button></ng-container
    ></pm-menu>
    <pm-menu [items]="items"
      ><ng-container ngProjectAs="[slot=trigger]"
        ><pm-button label="Actions"></pm-button></ng-container
    ></pm-menu>`,
})
class Menus {
  readonly items = [{ label: 'Sign out', onSelect: () => {} }]
}

@Component({
  selector: 'test-avatar-popovers',
  imports: [AvatarButton, Button, Popover],
  template: `<pm-popover label="Account"
      ><ng-container ngProjectAs="[slot=trigger]"
        ><pm-avatar-button name="Ada Lovelace" label="Account menu"></pm-avatar-button
      ></ng-container>
      <p>Signed in as Ada</p></pm-popover
    >
    <pm-popover label="Filter configuration"
      ><ng-container ngProjectAs="[slot=trigger]"
        ><pm-button label="Filters"></pm-button
      ></ng-container>
      <p>Body</p></pm-popover
    >`,
})
class Popovers {}

/** Opens from `trigger`, checks the overlay's ARIA on it against `plain`, and closes with Escape. */
async function holds(trigger: HTMLElement, plain: HTMLElement, popup: string): Promise<void> {
  await vi.waitFor(() => expect(trigger.getAttribute('aria-haspopup')).toBe(popup))
  for (const attribute of ['aria-haspopup', 'aria-expanded']) {
    expect(trigger.getAttribute(attribute), attribute).toBe(plain.getAttribute(attribute))
  }
  // An Angular member is a `<button>` inside its `pm-*` host, inside the overlay's anchor.
  const anchor = trigger.closest('span')
  expect(anchor?.hasAttribute('aria-haspopup')).toBe(false)
  expect(anchor?.hasAttribute('aria-expanded')).toBe(false)

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
    const { host } = await mountComponent(Menus)
    await holds(
      getByRole(host, 'button', { name: 'Account menu' }),
      getByRole(host, 'button', { name: 'Actions' }),
      'menu',
    )
  })

  it('carries a Popover’s ARIA, as a Button does, and takes focus back when it closes', async () => {
    const { host } = await mountComponent(Popovers)
    await holds(
      getByRole(host, 'button', { name: 'Account menu' }),
      getByRole(host, 'button', { name: 'Filters' }),
      'dialog',
    )
  })
})
