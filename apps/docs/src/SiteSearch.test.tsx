/**
 * @vitest-environment jsdom
 *
 * The site search's behaviour: where choosing an entry goes, and the keys that
 * open the palette. The file requests a DOM in its docblock because it reads
 * the address, dispatches key presses and mounts the component.
 */

import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { searchIndex } from './search'
import { goTo, SiteSearch, toCommandItems } from './SiteSearch'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true

beforeEach(() => {
  window.history.replaceState(null, '', '/')
})

describe('goTo', () => {
  it('routes to another page with its fragment', () => {
    goTo('/guides/rules#the-inventory')
    expect(window.location.pathname).toBe('/guides/rules')
    expect(window.location.hash).toBe('#the-inventory')
  })

  it('changes only the fragment for a section of the page already shown', () => {
    window.history.replaceState(null, '', '/guides/rules')
    const length = window.history.length
    goTo('/guides/rules#the-inventory')
    expect(window.location.pathname).toBe('/guides/rules')
    expect(window.location.hash).toBe('#the-inventory')
    expect(window.history.length).toBe(length + 1)
  })

  it('scrolls to the section when its fragment is already the address', () => {
    window.history.replaceState(null, '', '/guides/rules#the-inventory')
    const heading = document.createElement('h2')
    heading.id = 'the-inventory'
    heading.scrollIntoView = vi.fn()
    document.body.append(heading)
    goTo('/guides/rules#the-inventory')
    expect(heading.scrollIntoView).toHaveBeenCalledOnce()
    heading.remove()
  })
})

describe('toCommandItems', () => {
  it('gives each entry its group and keywords, and goes to its page when chosen', () => {
    const items = toCommandItems(searchIndex({}))
    const theming = items.find((item) => item.id === 'guide:theming')!
    expect(theming).toMatchObject({ label: 'Theming', group: 'Guides' })
    expect(theming.keywords).toContain('theming')
    theming.onSelect()
    expect(window.location.pathname).toBe('/guides/theming')
  })
})

describe('the shortcut', () => {
  let container: HTMLDivElement
  let root: Root
  let onOpenChange: ReturnType<typeof vi.fn<(open: boolean) => void>>

  function Closed() {
    const [open] = useState(false)
    return <SiteSearch open={open} onOpenChange={onOpenChange} />
  }

  beforeEach(() => {
    onOpenChange = vi.fn<(open: boolean) => void>()
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
    act(() => root.render(<Closed />))
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  const press = (init: KeyboardEventInit, target: EventTarget = document.body) =>
    act(() => {
      target.dispatchEvent(
        new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }),
      )
    })

  it('opens the palette on the platform’s command key and K', () => {
    const apple = /Mac|iPhone|iPad|iPod/.test(navigator.platform)
    press({ key: 'k', ...(apple ? { metaKey: true } : { ctrlKey: true }) })
    expect(onOpenChange).toHaveBeenCalledWith(true)
  })

  it('opens the palette on / outside a text field, and leaves / to a field', () => {
    press({ key: '/' })
    expect(onOpenChange).toHaveBeenCalledTimes(1)
    const field = document.createElement('textarea')
    document.body.append(field)
    press({ key: '/' }, field)
    expect(onOpenChange).toHaveBeenCalledTimes(1)
    field.remove()
  })

  it('opens on / typed with Shift, as a keyboard layout that has no / key of its own types it', () => {
    press({ key: '/', shiftKey: true })
    expect(onOpenChange).toHaveBeenCalledWith(true)
  })

  it('ignores K without the command key, and with Shift', () => {
    press({ key: 'k' })
    press({ key: 'K', metaKey: true, ctrlKey: true, shiftKey: true })
    expect(onOpenChange).not.toHaveBeenCalled()
  })
})

describe('the palette', () => {
  it('lists pages and guides at once, then members and guide sections once they load', async () => {
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    const options = () =>
      [...document.querySelectorAll('[role="option"]')].map((node) => node.textContent)

    await act(async () => root.render(<SiteSearch open onOpenChange={() => {}} />))
    expect(options()).toContain('Get started')
    expect(options()).toContain('Theming')

    await vi.waitFor(() => {
      expect(options()).toContain('Button')
      expect(options()).toContain('The colour engine')
    })
    act(() => root.unmount())
    container.remove()
  })
})
