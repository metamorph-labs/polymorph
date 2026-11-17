import { Component, signal } from '@angular/core'
import { describe, expect, it, vi } from 'vitest'

import { createAgentBridge } from '@polymorph/engine/agent'

import { mountComponent } from '../mount'
import { Checkbox } from './Checkbox'

/**
 * An agent reads and sets the Angular Checkbox through the bridge,
 * uncontrolled and controlled, as its spec's `agent` fence declares
 * (`design/components/checkbox.md`, Agent). The machine owns the value in
 * both forms, so an action calls `setChecked` and the member emits
 * `checkedChange`.
 */

type Checked = boolean | 'indeterminate'

/** What the application's handlers call, set by each test. */
const handlers = {
  free: (_next: Checked) => {},
  controlled: (_next: Checked) => {},
}

/** The application: an uncontrolled Checkbox, and a controlled one whose value it holds. */
@Component({
  selector: 'test-held-checkboxes',
  imports: [Checkbox],
  template: `<pm-checkbox label="Email me about replies" (checkedChange)="free($event)" />
    <pm-checkbox label="Urgent" [checked]="checked()" (checkedChange)="controlled($event)" />`,
})
class Held {
  readonly checked = signal<Checked>(false)
  free(next: Checked): void {
    handlers.free(next)
  }
  controlled(next: Checked): void {
    handlers.controlled(next)
    this.checked.set(next)
  }
}

@Component({
  selector: 'test-disabled-checkboxes',
  imports: [Checkbox],
  template: `<pm-checkbox [disabled]="true" label="Email me" (checkedChange)="free($event)" />
    <pm-checkbox checked="indeterminate" label="Select all" />`,
})
class Disabled {
  free(next: Checked): void {
    handlers.free(next)
  }
}

/** A frame for the zoneless application to draw what changed. */
const frame = () => new Promise((resolve) => requestAnimationFrame(resolve))

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
      const controlled = vi.fn(() => acting.push(bridge.acting))
      handlers.free = free
      handlers.controlled = controlled
      const { ref } = await mountComponent(Held)
      const host = ref.instance as Held

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
      await frame()
      expect(box('Email me').getAttribute('aria-checked')).toBe('true')
      expect(free).toHaveBeenLastCalledWith(true)
      const unchecked = await bridge.act([{ id: email?.id, action: 'uncheck' }])
      expect(unchecked.results[0]).toEqual({
        ok: true,
        id: email?.id,
        changed: { checked: { from: true, to: false } },
      })
      await frame()
      expect(box('Email me').getAttribute('aria-checked')).toBe('false')
      expect(free).toHaveBeenLastCalledWith(false)

      const set = await bridge.act([{ id: urgent?.id, action: 'check' }])
      expect(set.results[0]).toEqual({
        ok: true,
        id: urgent?.id,
        changed: { checked: { from: false, to: true } },
      })
      await frame()
      expect(box('Urgent').getAttribute('aria-checked')).toBe('true')
      expect(controlled).toHaveBeenLastCalledWith(true)
      await bridge.act([{ id: urgent?.id, action: 'uncheck' }])
      await frame()
      expect(box('Urgent').getAttribute('aria-checked')).toBe('false')

      // The application sets the value: the handle reads it, not the value at mount.
      host.checked.set(true)
      await frame()
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
      handlers.free = onCheckedChange
      await mountComponent(Disabled)
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
