import { h, nextTick, reactive } from 'vue'
import { describe, expect, it, vi } from 'vitest'

import { createAgentBridge } from '@polymorph/engine/agent'

import { mount } from '../mount'
import Checkbox from './Checkbox.vue'

/**
 * An agent reads and sets the Vue Checkbox through the bridge, uncontrolled
 * and controlled, as its spec's `agent` fence declares
 * (`design/components/checkbox.md`, Agent). The machine owns the value in
 * both forms, so an action calls `setChecked` and the machine emits
 * `checkedChange`.
 */

const box = (name: string) =>
  [...document.querySelectorAll<HTMLElement>('[role="checkbox"]')].find((element) =>
    element.closest('label')?.textContent?.includes(name),
  ) as HTMLElement

describe('an agent', () => {
  it('reads, checks and unchecks an uncontrolled and a controlled Checkbox', async () => {
    const bridge = createAgentBridge()
    try {
      const acting: boolean[] = []
      const free = vi.fn(() => acting.push(bridge.acting))
      const held = reactive({ checked: false as boolean | 'indeterminate' })
      const controlled = vi.fn((next: boolean | 'indeterminate') => {
        acting.push(bridge.acting)
        held.checked = next
      })
      await mount(() => h(Checkbox, { label: 'Email me about replies', onCheckedChange: free }))
      await mount(() =>
        h(Checkbox, { label: 'Urgent', checked: held.checked, onCheckedChange: controlled }),
      )

      const [email, urgent] = bridge.snapshot().members
      expect(bridge.snapshot().members).toEqual([
        {
          id: email?.id,
          member: 'Checkbox',
          name: 'Email me about replies',
          state: { checked: false, disabled: false },
          actions: [{ name: 'check' }, { name: 'uncheck' }],
        },
        {
          id: urgent?.id,
          member: 'Checkbox',
          name: 'Urgent',
          state: { checked: false, disabled: false },
          actions: [{ name: 'check' }, { name: 'uncheck' }],
        },
      ])

      const checked = await bridge.act([
        { target: { name: 'Email me about replies' }, action: 'check' },
      ])
      expect(checked.results).toEqual([
        { ok: true, id: email?.id, changed: { checked: { from: false, to: true } } },
      ])
      expect(box('Email me').getAttribute('aria-checked')).toBe('true')
      expect(free).toHaveBeenLastCalledWith(true)
      const unchecked = await bridge.act([{ id: email?.id, action: 'uncheck' }])
      expect(unchecked.results[0]).toEqual({
        ok: true,
        id: email?.id,
        changed: { checked: { from: true, to: false } },
      })
      expect(box('Email me').getAttribute('aria-checked')).toBe('false')
      expect(free).toHaveBeenLastCalledWith(false)

      const set = await bridge.act([{ id: urgent?.id, action: 'check' }])
      expect(set.results[0]).toEqual({
        ok: true,
        id: urgent?.id,
        changed: { checked: { from: false, to: true } },
      })
      expect(box('Urgent').getAttribute('aria-checked')).toBe('true')
      expect(controlled).toHaveBeenLastCalledWith(true)
      await bridge.act([{ id: urgent?.id, action: 'uncheck' }])
      expect(box('Urgent').getAttribute('aria-checked')).toBe('false')

      // The application sets the value: the handle reads it, not the value at mount.
      held.checked = true
      await nextTick()
      expect(bridge.snapshot().members[1]?.state).toEqual({ checked: true, disabled: false })
      const after = await bridge.act([{ id: urgent?.id, action: 'uncheck' }])
      expect(after.results[0]).toEqual({
        ok: true,
        id: urgent?.id,
        changed: { checked: { from: true, to: false } },
      })

      // Every handler call came from an agent's step.
      expect(acting).toEqual([true, true, true, true, true])
    } finally {
      bridge.dispose()
    }
  })

  it('refuses a disabled Checkbox, lists no action on it, and reads indeterminate as mixed', async () => {
    const bridge = createAgentBridge()
    try {
      const onCheckedChange = vi.fn()
      await mount(() => h(Checkbox, { disabled: true, label: 'Email me', onCheckedChange }))
      await mount(() => h(Checkbox, { checked: 'indeterminate', label: 'Select all' }))
      const [disabled, mixed] = bridge.snapshot().members
      expect(disabled?.state).toEqual({ checked: false, disabled: true })
      expect(disabled?.actions).toEqual([])
      const { results } = await bridge.act([{ id: disabled?.id, action: 'check' }])
      expect(results[0]).toEqual({
        ok: false,
        id: disabled?.id,
        error: { code: 'disabled', message: expect.any(String) },
      })
      expect(onCheckedChange).not.toHaveBeenCalled()
      expect(mixed?.state['checked']).toBe('mixed')
    } finally {
      bridge.dispose()
    }
  })
})
