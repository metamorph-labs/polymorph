import { Component, signal } from '@angular/core'
import { userEvent } from 'vitest/browser'
import { describe, expect, it, vi } from 'vitest'

import {
  inlineEditLaw,
  type InlineEditLawMount,
  type InlineEditLawProps,
} from '@polymorph/conformance/inline-edit'

import { mountComponent } from '../mount'
import { Dialog } from '../overlays/Dialog'
import { InlineEdit } from './InlineEdit'

/**
 * InlineEdit's opening, saving, cancelling, a save that waits and the row's
 * height, in the Angular shell (`design/components/inline-edit.md`), as
 * `@polymorph/conformance/inline-edit` states them for every web shell.
 */

/** The application around the member: it holds the props the law sets and the handlers it passes. */
@Component({
  selector: 'test-held-inline-edit',
  imports: [InlineEdit],
  template: `@if (law(); as law) {
    <pm-inline-edit
      label="Project name"
      [defaultEditing]="law.defaultEditing"
      [value]="held().value"
      [editing]="held().editing"
      [pending]="held().pending"
      [error]="held().error"
      [required]="held().required"
      [size]="held().size"
      (commit)="law.onCommit($event)"
      (editingChange)="law.onEditingChange($event)"
    />
  }`,
})
class Held {
  /** What the law mounts the member with. The member is drawn once it is set. */
  readonly law = signal<InlineEditLawMount | undefined>(undefined)
  readonly held = signal<InlineEditLawProps>({
    value: '',
    editing: undefined,
    pending: false,
    error: undefined,
    required: false,
    size: 'md',
  })
}

inlineEditLaw({
  shell: 'Angular',
  async mount(options) {
    const { ref } = await mountComponent(Held)
    const host = ref.instance as Held
    host.held.set(options.props)
    host.law.set(options)
    return {
      set(next) {
        host.held.update((was) => ({ ...was, ...next }))
      },
    }
  },
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

/** What the components below report to the test that mounted them. */
const heard = { commit: vi.fn(), editingChange: vi.fn(), openChange: vi.fn() }

/** An open field that reports a save and a close. */
@Component({
  selector: 'test-editing',
  imports: [InlineEdit],
  template: `<pm-inline-edit
    label="Project name"
    value="Acme"
    [defaultEditing]="true"
    (commit)="heard.commit($event)"
    (editingChange)="heard.editingChange($event)"
  />`,
})
class Editing {
  readonly heard = heard
}

/** A field inside an open Dialog, which stays open until it reports `false`. */
@Component({
  selector: 'test-inline-edit-in-dialog',
  imports: [Dialog, InlineEdit],
  template: `<pm-dialog title="Project" [open]="open()" (openChange)="change($event)">
    <pm-inline-edit
      label="Project name"
      value="Acme"
      (editingChange)="heard.editingChange($event)"
    />
  </pm-dialog>`,
})
class InDialog {
  readonly heard = heard
  readonly open = signal(true)
  change(next: boolean) {
    heard.openChange(next)
    this.open.set(next)
  }
}

const textbox = () => document.querySelector<HTMLInputElement>('[data-member="inline-edit"] input')

describe('InlineEdit — keys', () => {
  it('leaves every key an input method is handling to it: Enter saves nothing, Escape keeps the field', async () => {
    heard.commit = vi.fn()
    heard.editingChange = vi.fn()
    await mountComponent(Editing)
    const field = textbox() as HTMLInputElement
    for (const how of ['composing', 'processed'] as const) {
      for (const key of ['Enter', 'Escape']) {
        expect(inputMethodKey(field, key, how).defaultPrevented, `${how} ${key}`).toBe(false)
      }
    }
    await sleep(30)
    expect(heard.commit).not.toHaveBeenCalled()
    expect(heard.editingChange).not.toHaveBeenCalled()
    expect(textbox()).toBe(field)
  })

  it('cancels on Escape inside a Dialog with the Dialog still open, and the next Escape closes it', async () => {
    heard.editingChange = vi.fn()
    heard.openChange = vi.fn()
    await mountComponent(InDialog)
    const edit = await vi.waitFor(() => {
      const found = document.querySelector<HTMLElement>('[data-member="inline-edit"] button')
      expect(found).not.toBeNull()
      return found as HTMLElement
    })
    await userEvent.click(edit)
    await vi.waitFor(() => expect(document.activeElement).toBe(textbox()))
    await userEvent.keyboard('{Escape}')
    await vi.waitFor(() => expect(heard.editingChange).toHaveBeenLastCalledWith(false))
    await sleep(60)
    expect(heard.openChange).not.toHaveBeenCalled()
    await userEvent.keyboard('{Escape}')
    await vi.waitFor(() => expect(heard.openChange).toHaveBeenCalledWith(false))
  })
})
