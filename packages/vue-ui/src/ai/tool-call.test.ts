import { userEvent } from 'vitest/browser'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { h, ref } from 'vue'

import { installTestTheme } from '@polymorph/engine/testing'

import { mount } from '../mount'
import ToolCall from './ToolCall.vue'

/**
 * ToolCall in the Vue shell (`design/components/tool-call.md`): a row with
 * nothing inside is no button, and the row becomes one when its body arrives,
 * as the React member's does on its next render. The output slot is part of
 * the body, so filling it later opens the row up.
 */

beforeAll(installTestTheme)

const trigger = () =>
  document.querySelector<HTMLButtonElement>('[data-member="tool-call"] button') as HTMLButtonElement

const output = () =>
  [...document.querySelectorAll('p')].find((element) => element.textContent === 'contents') ?? null

describe('the body', () => {
  it('turns the row into a button when its output slot is filled after it mounts', async () => {
    const done = ref(false)
    await mount(() =>
      h(
        ToolCall,
        { name: 'read_file', status: 'done' },
        done.value ? { output: () => [h('p', 'contents')] } : {},
      ),
    )
    expect(trigger().disabled).toBe(true)
    done.value = true
    await vi.waitFor(() => expect(trigger().disabled).toBe(false))
    await userEvent.click(trigger())
    await vi.waitFor(() => expect(output()).not.toBeNull())
    expect(trigger().getAttribute('aria-expanded')).toBe('true')
  })

  it('turns the button back into a row when the output slot is emptied', async () => {
    const done = ref(true)
    await mount(() =>
      h(
        ToolCall,
        { name: 'read_file', status: 'done' },
        done.value ? { output: () => [h('p', 'contents')] } : {},
      ),
    )
    expect(trigger().disabled).toBe(false)
    done.value = false
    await vi.waitFor(() => expect(trigger().disabled).toBe(true))
  })
})
