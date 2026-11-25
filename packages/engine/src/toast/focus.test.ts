import { afterEach, describe, expect, it } from 'vitest'

import { focusAfterToast, followToastFocus } from './focus'

/**
 * Where focus goes when a toast that holds it leaves. The viewports' own tests check the
 * moves through each framework; these check what the list records as focus enters it.
 */

const page = document.createElement('div')
document.body.append(page)

afterEach(() => {
  page.replaceChildren()
})

function draw(): { field: HTMLInputElement; list: HTMLElement; card: HTMLElement } {
  page.innerHTML = `
    <input id="field" aria-label="Subject" />
    <div role="region" aria-label="Notifications (F8)">
      <ol data-toast-part="list" tabindex="-1">
        <li data-member="toast" data-state="open" tabindex="0">Saved</li>
      </ol>
    </div>`
  return {
    field: page.querySelector('#field') as HTMLInputElement,
    list: page.querySelector('ol') as HTMLElement,
    card: page.querySelector('li') as HTMLElement,
  }
}

describe('followToastFocus', () => {
  it('keeps where focus came from when the window takes focus back', () => {
    const { field, list, card } = draw()
    const stop = followToastFocus(list)
    field.focus()
    card.focus()
    // The reader switches to another application and back: the card loses focus and takes it
    // again, each time with no `relatedTarget`.
    card.dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
    card.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
    card.setAttribute('data-state', 'closed')
    focusAfterToast(card)
    expect(document.activeElement).toBe(field)
    stop()
  })
})
