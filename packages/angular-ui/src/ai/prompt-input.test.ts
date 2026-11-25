import { Component, signal } from '@angular/core'
import { userEvent } from 'vitest/browser'
import { describe, expect, it, vi } from 'vitest'

import {
  promptTriggersLaw,
  type PromptLawDialogMount,
  type PromptLawMount,
  type PromptLawProps,
} from '@polymorph/conformance/prompt-triggers'

import { mountComponent } from '../mount'
import { Dialog } from '../overlays/Dialog'
import { PromptInput, type PromptTrigger } from './PromptInput'

/**
 * PromptInput's mentions and commands in the Angular shell
 * (`design/components/prompt-input.md`), as
 * `@polymorph/conformance/prompt-triggers` states them for every web shell.
 */

/** The application around the composer: it holds the props the law sets and the handlers it passes. */
@Component({
  selector: 'test-held-prompt-input',
  imports: [PromptInput],
  template: `@if (law(); as law) {
    <pm-prompt-input
      label="Message"
      [defaultValue]="law.defaultValue"
      [messages]="law.messages"
      [triggers]="triggers()"
      [value]="held().value"
      (change)="law.onChange($event)"
      (submit)="law.onSubmit($event)"
    />
  }`,
})
class Held {
  /** What the law mounts the composer with. The composer is drawn once it is set. */
  readonly law = signal<PromptLawMount | undefined>(undefined)
  readonly held = signal<PromptLawProps>({ triggers: undefined, value: undefined })
  readonly triggers = () => this.held().triggers as PromptTrigger[] | undefined
}

/** The composer inside an open Dialog, which stays open until it reports `false`. */
@Component({
  selector: 'test-prompt-input-in-dialog',
  imports: [Dialog, PromptInput],
  template: `@if (law(); as law) {
    <pm-dialog title="Compose" [open]="open()" (openChange)="change(law, $event)">
      <pm-prompt-input label="Message" [triggers]="triggers(law)" />
    </pm-dialog>
  }`,
})
class InDialog {
  readonly law = signal<PromptLawDialogMount | undefined>(undefined)
  readonly open = signal(true)
  readonly triggers = (law: PromptLawDialogMount) => law.triggers as PromptTrigger[]
  change(law: PromptLawDialogMount, next: boolean) {
    law.onOpenChange(next)
    this.open.set(next)
  }
}

promptTriggersLaw({
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
  async mountInDialog(options) {
    const { ref } = await mountComponent(InDialog)
    ;(ref.instance as InDialog).law.set(options)
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
const heard = { submit: vi.fn() }

/** A composer that reports a send. */
@Component({
  selector: 'test-sending',
  imports: [PromptInput],
  template: `<pm-prompt-input label="Message" (submit)="heard.submit($event)" />`,
})
class Sending {
  readonly heard = heard
}

/** A composer with three chips, whose application removes each one asked for. */
@Component({
  selector: 'test-chips',
  imports: [PromptInput],
  template: `<pm-prompt-input
    label="Message"
    [attachments]="attachments()"
    (attach)="none()"
    (reject)="none()"
    (removeAttachment)="remove($event)"
    (submit)="none()"
  />`,
})
class Chips {
  readonly attachments = signal([
    { id: 'a', name: 'spec.pdf' },
    { id: 'b', name: 'notes.txt' },
    { id: 'c', name: 'shot.png' },
  ])
  none() {}
  remove(id: string) {
    this.attachments.update((was) => was.filter((one) => one.id !== id))
  }
}

const message = () =>
  document.querySelector<HTMLTextAreaElement>('[data-member="prompt-input"] textarea')
const removeControl = (name: string) =>
  document.querySelector<HTMLElement>(`button[aria-label="Remove ${name}"]`)

describe('PromptInput — keys and chips', () => {
  it('sends nothing on a key an input method is handling, Safari’s confirming Enter included', async () => {
    heard.submit = vi.fn()
    await mountComponent(Sending)
    const field = message() as HTMLTextAreaElement
    field.focus()
    await userEvent.keyboard('にほん')
    for (const how of ['composing', 'processed'] as const) {
      expect(inputMethodKey(field, 'Enter', how).defaultPrevented, how).toBe(false)
    }
    await sleep(30)
    expect(heard.submit).not.toHaveBeenCalled()
    await userEvent.keyboard('{Enter}')
    await vi.waitFor(() => expect(heard.submit).toHaveBeenCalledWith('にほん'))
  })

  it('moves focus to the next chip’s remove control once a chip is removed, else the previous one, else the field', async () => {
    await mountComponent(Chips)
    removeControl('notes.txt')?.focus()
    await userEvent.keyboard('{Enter}')
    await vi.waitFor(() => expect(document.activeElement).toBe(removeControl('shot.png')))
    await userEvent.keyboard('{Enter}')
    await vi.waitFor(() => expect(document.activeElement).toBe(removeControl('spec.pdf')))
    await userEvent.keyboard('{Enter}')
    await vi.waitFor(() => expect(document.activeElement).toBe(message()))
  })
})
