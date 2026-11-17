import { Component, signal } from '@angular/core'
import { getByRole } from '@testing-library/dom'
import { userEvent } from 'vitest/browser'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { installTestTheme } from '@polymorph/engine/testing'

import { mountComponent } from '../mount'
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
