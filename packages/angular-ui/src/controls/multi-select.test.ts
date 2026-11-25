import { Component, signal } from '@angular/core'
import { getByRole } from '@testing-library/dom'
import { userEvent } from 'vitest/browser'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { installTestTheme } from '@polymorph/engine/testing'

import { mountComponent } from '../mount'
import { Dialog } from '../overlays/Dialog'
import { MultiSelect } from './MultiSelect'

/**
 * MultiSelect's controlled text in the Angular shell
 * (`design/components/multi-select.md`). A controlled field shows the
 * caller's value until the caller changes it, as a controlled input does, so
 * the member puts the field back after each keystroke. It does so once
 * Angular has rendered the caller's update (`afterRender`): put back before
 * that render, the field would take the stale text and the caret would jump
 * to its end on every keystroke. Text the caller takes keeps the caret where
 * the reader typed, after the machine has moved it to the end.
 */

beforeAll(installTestTheme)

const OPTIONS = [
  { value: 'bug', label: 'Bug' },
  { value: 'billing', label: 'Billing' },
]

/** A caller that holds the text and takes every change. */
@Component({
  selector: 'test-following',
  imports: [MultiSelect],
  template: `<pm-multi-select
    aria-label="Labels"
    [options]="options"
    [inputValue]="text()"
    (inputChange)="text.set($event)"
  />`,
})
class Following {
  readonly options = OPTIONS
  readonly text = signal('')
}

/** A caller that holds the text and takes no change. */
@Component({
  selector: 'test-holding',
  imports: [MultiSelect],
  template: `<pm-multi-select aria-label="Labels" [options]="options" inputValue="bug" />`,
})
class Holding {
  readonly options = OPTIONS
}

const field = (host: HTMLElement) => getByRole(host, 'combobox') as HTMLInputElement

/** The frame after Angular's next render, when the member has written the field. */
const rendered = () =>
  new Promise<void>((settle) => requestAnimationFrame(() => requestAnimationFrame(() => settle())))

describe('MultiSelect’s controlled text', () => {
  it('keeps the caret where the reader types', async () => {
    const { host, ref } = await mountComponent(Following)
    const input = field(host)
    await userEvent.click(input)
    await userEvent.keyboard('bg')
    await vi.waitFor(() => expect((ref.instance as Following).text()).toBe('bg'))
    // The caller's text reaches the field at Angular's next render, and the machine moves
    // the caret to the end when it writes the field. A reader moves the caret after that.
    await rendered()
    input.setSelectionRange(1, 1)
    await userEvent.keyboard('u')
    await vi.waitFor(() => expect((ref.instance as Following).text()).toBe('bug'))
    await rendered()
    expect(input.value).toBe('bug')
    expect(input.selectionStart).toBe(2)
  })

  it('puts the field back to the caller’s text when the caller keeps it', async () => {
    const { host } = await mountComponent(Holding)
    const input = field(host)
    await userEvent.click(input)
    await userEvent.keyboard('s')
    await vi.waitFor(() => expect(input.value).toBe('bug'))
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

const PEOPLE = [
  { value: 'ada', label: 'Ada Lovelace' },
  { value: 'grace', label: 'Grace Hopper' },
  { value: 'alan', label: 'Alan Turing' },
]

/** What the components below report to the test that mounted them. */
const heard = { change: vi.fn(), openChange: vi.fn() }

/** A field that reports its value. */
@Component({
  selector: 'test-reporting',
  imports: [MultiSelect],
  template: `<pm-multi-select
    aria-label="Assignees"
    [options]="options"
    (change)="heard.change($event)"
  />`,
})
class Reporting {
  readonly options = PEOPLE
  readonly heard = heard
}

/** A field inside an open Dialog, which stays open until it reports `false`. */
@Component({
  selector: 'test-multi-select-in-dialog',
  imports: [Dialog, MultiSelect],
  template: `<pm-dialog title="Assign" [open]="open()" (openChange)="change($event)">
    <pm-multi-select aria-label="Assignees" [options]="options" />
  </pm-dialog>`,
})
class InDialog {
  readonly options = PEOPLE
  readonly open = signal(true)
  change(next: boolean) {
    heard.openChange(next)
    this.open.set(next)
  }
}

/** A field holding two chips. */
@Component({
  selector: 'test-two-chips',
  imports: [MultiSelect],
  template: `<pm-multi-select
    aria-label="Assignees"
    [options]="options"
    [defaultValue]="chosen"
  />`,
})
class TwoChips {
  readonly options = PEOPLE
  readonly chosen = ['ada', 'grace']
}

const combobox = () =>
  document.querySelector<HTMLInputElement>('[data-member="multi-select"] input[role="combobox"]')
const state = () =>
  document.querySelector<HTMLElement>('[data-member="multi-select"]:has(input)')?.dataset['state']
const removeButton = (label: string) =>
  document.querySelector<HTMLElement>(`button[aria-label="Remove ${label}"]`)

describe('MultiSelect’s keys', () => {
  it('leaves every key an input method is handling to it', async () => {
    heard.change = vi.fn()
    await mountComponent(Reporting)
    await userEvent.click(combobox() as HTMLElement)
    await userEvent.keyboard('gr')
    await vi.waitFor(() => expect(state()).toBe('open'))
    await rendered()
    for (const how of ['composing', 'processed'] as const) {
      expect(inputMethodKey(combobox() as HTMLElement, 'Enter', how).defaultPrevented, how).toBe(
        false,
      )
    }
    // Escape while the list is open is the machine's layer's, which leaves a composing one alone.
    inputMethodKey(combobox() as HTMLElement, 'Escape', 'composing')
    await sleep(30)
    expect(heard.change).not.toHaveBeenCalled()
    expect(state()).toBe('open')
    expect(combobox()?.value).toBe('gr')
    await userEvent.keyboard('{Enter}')
    await vi.waitFor(() => expect(heard.change).toHaveBeenLastCalledWith(['grace']))
  })

  it('inside a Dialog, closes the list, then clears the text with the Dialog open, then closes it', async () => {
    heard.openChange = vi.fn()
    await mountComponent(InDialog)
    await vi.waitFor(() => expect(combobox()).not.toBeNull())
    await userEvent.click(combobox() as HTMLElement)
    await userEvent.keyboard('gr')
    await vi.waitFor(() => expect(state()).toBe('open'))
    await rendered()
    await userEvent.keyboard('{Escape}')
    await vi.waitFor(() => expect(state()).toBe('closed'))
    expect(combobox()?.value).toBe('gr')
    await userEvent.keyboard('{Escape}')
    await vi.waitFor(() => expect(combobox()?.value).toBe(''))
    await sleep(60)
    expect(heard.openChange).not.toHaveBeenCalled()
    await userEvent.keyboard('{Escape}')
    await vi.waitFor(() => expect(heard.openChange).toHaveBeenCalledWith(false))
  })

  it('follows a right-to-left line: → moves back into the chips and ← forward to the field', async () => {
    const { host } = await mountComponent(TwoChips)
    host.dir = 'rtl'
    await userEvent.click(combobox() as HTMLElement)
    await userEvent.keyboard('{ArrowLeft}')
    expect(document.activeElement).toBe(combobox())
    await userEvent.keyboard('{ArrowRight}')
    expect(document.activeElement).toBe(removeButton('Grace Hopper'))
    await userEvent.keyboard('{ArrowRight}')
    expect(document.activeElement).toBe(removeButton('Ada Lovelace'))
    await userEvent.keyboard('{ArrowLeft}{ArrowLeft}')
    expect(document.activeElement).toBe(combobox())
  })
})
