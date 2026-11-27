import { userEvent } from 'vitest/browser'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { h, ref } from 'vue'

import { commandLaw } from '@polymorph/conformance/command'
import { installTestTheme } from '@polymorph/engine/testing'

import { vueAdapter } from '../conformance/vue'
import { mount } from '../mount'
import Command from './Command.vue'

/**
 * Command in the Vue shell, where it shows what the React palette shows
 * (`packages/react-ui/src/overlays/Command.tsx`): the listbox named apart from
 * the field, by the palette's `label` (React Aria names the React one
 * `Suggestions`), and the panel growing from its top edge, as the React
 * member's surface grows from the side and alignment it is given.
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
  it('names its listbox by its label and its field by the placeholder', async () => {
    await mount(() =>
      h(Command, {
        open: true,
        onOpenChange: () => {},
        items: ITEMS,
        label: 'Ticket commands',
        placeholder: 'Search the commands…',
      }),
    )
    await vi.waitFor(() => expect(listbox()).not.toBeNull())
    expect(listbox()?.getAttribute('aria-label')).toBe('Ticket commands')
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

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * A key an input method is handling, dispatched on `target`: marked `isComposing`, or reported
 * with key code 229 after the composition has ended, as Safari sends the Enter that confirms it.
 */
function inputMethodKey(
  target: HTMLElement,
  key: string,
  how: 'composing' | 'processed',
): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
    isComposing: how === 'composing',
  })
  if (how === 'processed') Object.defineProperty(event, 'keyCode', { value: 229 })
  target.dispatchEvent(event)
  return event
}

describe('the query and an input method', () => {
  it('clears nothing and stays open on an Escape an input method is handling', async () => {
    const onOpenChange = vi.fn()
    await mount(() => h(Command, { open: true, onOpenChange, items: ITEMS }))
    await vi.waitFor(() => expect(document.activeElement).toBe(field()))
    await userEvent.keyboard('new')
    await vi.waitFor(() => expect(field()?.value).toBe('new'))
    inputMethodKey(field() as HTMLElement, 'Escape', 'composing')
    inputMethodKey(field() as HTMLElement, 'Escape', 'processed')
    await sleep(30)
    expect(field()?.value).toBe('new')
    expect(onOpenChange).not.toHaveBeenCalled()
    // The Escape after the composition clears the query, and the palette stays open.
    await userEvent.keyboard('{Escape}')
    await vi.waitFor(() => expect(field()?.value).toBe(''))
    expect(onOpenChange).not.toHaveBeenCalled()
  })
})

/**
 * What the status region says, by default and in a host's words from
 * `spoken`, as `@polymorph/conformance/command` states it for every web shell.
 */
commandLaw({ shell: 'Vue', adapter: vueAdapter })
