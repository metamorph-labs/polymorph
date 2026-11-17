import { beforeAll, describe, expect, it, vi } from 'vitest'
import { h, ref } from 'vue'

import { installTestTheme } from '@polymorph/engine/testing'

import { mount } from '../mount'
import Command from './Command.vue'

/**
 * Command in the Vue shell, where it shows what the React palette shows
 * (`packages/react-ui/src/overlays/Command.tsx`): the listbox named as React
 * Aria names a combobox's listbox, apart from the field, and the panel growing
 * from its top edge, as the React member's surface grows from the side and
 * alignment it is given.
 */

beforeAll(installTestTheme)

const ITEMS = [
  { id: 'new', label: 'New ticket', onSelect: () => {} },
  { id: 'assign', label: 'Assign to me', onSelect: () => {} },
]

const panel = () => document.querySelector<HTMLElement>('[role="dialog"][data-member="command"]')
const listbox = () => document.querySelector<HTMLElement>('[role="listbox"]')
const field = () => document.querySelector<HTMLInputElement>('[role="combobox"]')

describe('the palette', () => {
  it('names its listbox Suggestions and its field by the placeholder', async () => {
    await mount(() =>
      h(Command, {
        open: true,
        onOpenChange: () => {},
        items: ITEMS,
        placeholder: 'Search the commands…',
      }),
    )
    await vi.waitFor(() => expect(listbox()).not.toBeNull())
    expect(listbox()?.getAttribute('aria-label')).toBe('Suggestions')
    expect(listbox()?.hasAttribute('aria-labelledby')).toBe(false)
    expect(field()?.getAttribute('aria-label')).toBe('Search the commands…')
  })

  it('grows from its top edge, centred', async () => {
    const open = ref(false)
    await mount(() =>
      h(Command, {
        open: open.value,
        onOpenChange: (next: boolean) => {
          open.value = next
        },
        items: ITEMS,
      }),
    )
    open.value = true
    // Firefox writes the third axis out, as `center top 0px`.
    await vi.waitFor(() => expect(panel()?.style.transformOrigin).toMatch(/^center top( 0px)?$/))
  })
})
