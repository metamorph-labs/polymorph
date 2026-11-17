import { userEvent } from 'vitest/browser'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { h } from 'vue'

import { installTestTheme } from '@polymorph/engine/testing'

import { mount } from '../mount'
import Select from './Select.vue'

/**
 * Select in the Vue shell, where it differs from what its machine does on its
 * own (`design/components/select.md`): a closed Select takes no focus when it
 * mounts, focus returns to the trigger when the list closes, and an empty
 * choice with no default is the choice the trigger shows.
 */

beforeAll(installTestTheme)

const PRIORITIES = [
  { value: 'urgent', label: 'Urgent' },
  { value: 'normal', label: 'Normal' },
]

const trigger = () => document.querySelector<HTMLElement>('button[data-member="select"]')

describe('Select and focus', () => {
  it('takes no focus when a closed Select mounts', async () => {
    ;(document.activeElement as HTMLElement | null)?.blur()
    await mount(() => h(Select, { options: PRIORITIES, ariaLabel: 'Priority' }))
    await new Promise((settle) => setTimeout(settle, 100))
    expect(document.activeElement).toBe(document.body)
  })

  it('returns focus to the trigger when the list closes', async () => {
    await mount(() => h(Select, { options: PRIORITIES, ariaLabel: 'Priority' }))
    await userEvent.click(trigger() as HTMLElement)
    await vi.waitFor(() =>
      expect(document.activeElement?.closest('[role="listbox"]')).not.toBeNull(),
    )
    await userEvent.keyboard('{Escape}')
    await vi.waitFor(() => expect(document.activeElement).toBe(trigger()))
  })
})

describe('Select with an empty choice', () => {
  it('shows the empty choice, not a placeholder, when nothing else is chosen', async () => {
    await mount(() =>
      h(Select, { options: PRIORITIES, emptyOption: 'All statuses', ariaLabel: 'Status' }),
    )
    expect(trigger()?.textContent).toContain('All statuses')
    expect(trigger()?.hasAttribute('data-placeholder')).toBe(false)
  })
})
