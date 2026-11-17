import { beforeAll, describe, expect, it, vi } from 'vitest'

import { installTestTheme } from '@polymorph/engine/testing'

import '../ai/AttachmentChip'
import { mount } from '../mount'

/**
 * Whether the page handles an event, which a member reads (`listening`):
 * AttachmentChip draws its remove Button only for a caller that handles
 * `remove`.
 *
 * The element counts the listeners added through its own `addEventListener`.
 * A listener added before the element was defined is the browser's and not
 * counted, so the chip draws no Button; the `listens` attribute names the
 * events a page handles by delegation or before the elements load, and the
 * event reaches every listener once it is dispatched.
 */

const removeButton = (host: HTMLElement) =>
  host.querySelector('[data-member="attachment-chip"] button')

const CHIP = '<poly-attachment-chip name="brief.pdf" status="done"></poly-attachment-chip>'

beforeAll(installTestTheme)

describe('listening — a member asks whether the page handles an event', () => {
  it('reads no listener as no handler, and one added through the element as one', async () => {
    const { host } = await mount({ name: 'chip', html: CHIP })
    expect(removeButton(host)).toBeNull()
    const chip = host.querySelector('poly-attachment-chip') as HTMLElement
    const heard: unknown[] = []
    const listener = (event: Event) => heard.push((event as CustomEvent<unknown>).detail)
    chip.addEventListener('poly-remove', listener)
    const button = await vi.waitFor(() => {
      const found = removeButton(host)
      if (found === null) throw new Error('no remove Button')
      return found as HTMLButtonElement
    })
    button.click()
    expect(heard).toEqual([null])
    chip.removeEventListener('poly-remove', listener)
    await vi.waitFor(() => expect(removeButton(host)).toBeNull())
  })

  it('does not count a listener added before the element was defined, and reads `listens`', async () => {
    const template = document.createElement('template')
    template.innerHTML = CHIP
    const chip = template.content.firstElementChild as HTMLElement
    const heard: string[] = []
    // Added while the element is in the template's document, where it is not defined.
    chip.addEventListener('poly-remove', (event) => heard.push(event.type))
    const host = document.createElement('div')
    document.body.append(host)
    host.append(chip)
    await new Promise((settle) => requestAnimationFrame(settle))
    expect(removeButton(host)).toBeNull()
    chip.setAttribute('listens', 'remove')
    const button = await vi.waitFor(() => {
      const found = removeButton(host)
      if (found === null) throw new Error('no remove Button')
      return found as HTMLButtonElement
    })
    button.click()
    expect(heard).toEqual(['poly-remove'])
    chip.removeAttribute('listens')
    await vi.waitFor(() => expect(removeButton(host)).toBeNull())
    host.remove()
  })

  it('stops counting a listener once it has run, when it was added once', async () => {
    const { host } = await mount({ name: 'once', html: CHIP })
    const chip = host.querySelector('poly-attachment-chip') as HTMLElement
    chip.addEventListener('poly-remove', () => {}, { once: true })
    const button = await vi.waitFor(() => {
      const found = removeButton(host)
      if (found === null) throw new Error('no remove Button')
      return found as HTMLButtonElement
    })
    button.click()
    await vi.waitFor(() => expect(removeButton(host)).toBeNull())
  })
})
