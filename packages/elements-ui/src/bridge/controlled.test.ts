import { userEvent } from 'vitest/browser'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { installTestTheme } from '@polymorph/engine/testing'

import type { PolySwitchElement } from '../controls/Switch'
import '../controls/Switch'
import { mount } from '../mount'

/**
 * A controlled prop follows the reader, as a native control's value does:
 * after the member reports a change, the element sets its own prop to the
 * reported value, unless a listener cancels the change event or sets the prop
 * itself. A page that owns the value cancels the event. A property never
 * writes the attribute back.
 */

const control = (host: HTMLElement) => host.querySelector('[role="switch"]') as HTMLElement

beforeAll(installTestTheme)

describe('a controlled prop follows the reader', () => {
  it('takes the value the reader chose, and reports it in a cancelable change event', async () => {
    const { host } = await mount({
      name: 'switch',
      html: '<poly-switch aria-label="Notifications"></poly-switch>',
    })
    const element = host.querySelector('poly-switch') as PolySwitchElement
    const heard: CustomEvent<unknown>[] = []
    element.addEventListener('poly-checked-change', (event) => heard.push(event as CustomEvent))
    expect(element.checked).toBeUndefined()
    await userEvent.click(control(host))
    await vi.waitFor(() => expect(control(host).getAttribute('aria-checked')).toBe('true'))
    expect(element.checked).toBe(true)
    expect(heard.map((event) => [event.detail, event.cancelable, event.bubbles])).toEqual([
      [true, true, true],
    ])
    await userEvent.click(control(host))
    await vi.waitFor(() => expect(control(host).getAttribute('aria-checked')).toBe('false'))
    expect(element.checked).toBe(false)
    expect(element.hasAttribute('checked')).toBe(false)
  })

  it('keeps its value when a listener cancels the change', async () => {
    const { host } = await mount({
      name: 'owned',
      html: '<poly-switch aria-label="Notifications" checked="false"></poly-switch>',
    })
    const element = host.querySelector('poly-switch') as PolySwitchElement
    element.addEventListener('poly-checked-change', (event) => event.preventDefault())
    await userEvent.click(control(host))
    await new Promise((settle) => setTimeout(settle, 50))
    expect(element.checked).toBe(false)
    expect(control(host).getAttribute('aria-checked')).toBe('false')
  })

  it('keeps the value a listener sets, and takes one a script sets later', async () => {
    const { host } = await mount({
      name: 'set',
      html: '<poly-switch aria-label="Notifications" checked="false"></poly-switch>',
    })
    const element = host.querySelector('poly-switch') as PolySwitchElement
    const listener = () => {
      element.checked = false
    }
    element.addEventListener('poly-checked-change', listener)
    await userEvent.click(control(host))
    await new Promise((settle) => setTimeout(settle, 50))
    expect(element.checked).toBe(false)
    expect(control(host).getAttribute('aria-checked')).toBe('false')
    element.removeEventListener('poly-checked-change', listener)
    element.checked = true
    await vi.waitFor(() => expect(control(host).getAttribute('aria-checked')).toBe('true'))
    element.setAttribute('checked', 'false')
    await vi.waitFor(() => expect(control(host).getAttribute('aria-checked')).toBe('false'))
  })
})
