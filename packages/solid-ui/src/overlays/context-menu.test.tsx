import { userEvent } from 'vitest/browser'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { installTestTheme } from '@polymorph/engine/testing'

import Button from '../controls/Button'
import { mount } from '../mount'
import ContextMenu from './ContextMenu'

/**
 * ContextMenu's focus return in the Solid shell (`design/components/context-menu.md`): once the
 * menu closes, focus goes back to where it was when the press began. The surface reads that place
 * in the capture phase of the press, before the machine moves focus into the list.
 */

beforeAll(installTestTheme)

const panel = () => document.querySelector<HTMLElement>('[role="menu"]')

describe('ContextMenu returns focus to where the press began', () => {
  it('focuses the control the reader pressed on once Escape closes the menu', async () => {
    await mount(() => (
      <ContextMenu entries={[{ label: 'Assign to me', onSelect: () => {} }]}>
        <Button label="Ticket" />
      </ContextMenu>
    ))
    const ticket = document.querySelector<HTMLElement>('[data-member="button"]') as HTMLElement
    ticket.focus()
    await userEvent.click(ticket, { button: 'right' })
    await vi.waitFor(() => expect(panel()?.contains(document.activeElement)).toBe(true))

    await userEvent.keyboard('{Escape}')
    await vi.waitFor(() => expect(panel()).toBeNull())
    await vi.waitFor(() => expect(document.activeElement).toBe(ticket))
  })
})
