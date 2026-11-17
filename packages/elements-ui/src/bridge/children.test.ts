import { beforeAll, describe, expect, it, vi } from 'vitest'

import { installTestTheme } from '@polymorph/engine/testing'

import { PolyElement } from '@polymorph/elements'

import '../controls/Button'
import type { PolyStackElement } from '../layout/Stack'
import '../layout/Stack'
import '../overlays/Dialog'
import '../structure/Badge'
import { mount } from '../mount'

/**
 * Content the page changes after a member has rendered, as htmx swaps it.
 *
 * A node the page adds to an element, before or after the member's
 * rendering, joins the slot its `slot` attribute names, and a `poly-*` element
 * among them renders inside the member as one the page wrote at first. A swap
 * that replaces the element's children renders the member again from the new
 * ones, and disposes the members the old ones held. `restore` puts back the
 * children the page wrote. A child the page takes out through the element
 * (`removeChild`) leaves its slot, wherever the member drew it.
 */

const stackOf = (host: HTMLElement) => host.querySelector('poly-stack') as PolyStackElement

/** The badges' text, in the order the stack draws them. */
const badges = (host: HTMLElement) =>
  [...host.querySelectorAll('[data-member="stack"] [data-member="badge"]')].map((badge) =>
    badge.textContent?.trim(),
  )

beforeAll(installTestTheme)

describe('content added after the member rendered', () => {
  it('joins the default slot at its end, and a member there renders inside the member', async () => {
    const { host } = await mount({
      name: 'appended',
      html: '<poly-stack gap="2"><poly-badge>One</poly-badge></poly-stack>',
    })
    expect(badges(host)).toEqual(['One'])
    const two = document.createElement('poly-badge')
    two.textContent = 'Two'
    stackOf(host).append(two)
    await vi.waitFor(() => expect(badges(host)).toEqual(['One', 'Two']))
    // The new element is inside the stack's rendering, not beside it.
    expect(two.parentElement?.getAttribute('data-member')).toBe('stack')
  })

  it('joins the slot its `slot` attribute names', async () => {
    const { host } = await mount({
      name: 'footer',
      html: '<poly-dialog title="Later" default-open><poly-button slot="trigger" label="Open"></poly-button><p>Body</p></poly-dialog>',
    })
    const panel = await vi.waitFor(() => {
      const found = document.querySelector('[role="dialog"]')
      if (found === null) throw new Error('the panel did not open')
      return found
    })
    expect(panel.querySelector('[data-dialog-part="footer"]')).toBeNull()
    const done = document.createElement('poly-button')
    done.setAttribute('slot', 'footer')
    done.setAttribute('label', 'Done')
    host.querySelector('poly-dialog')?.append(done)
    await vi.waitFor(() =>
      expect(
        document.querySelector('[role="dialog"] [data-dialog-part="footer"] button')?.textContent,
      ).toContain('Done'),
    )
  })

  it('reads text added to a member’s text, and renders no member around it again', async () => {
    const { host } = await mount({
      name: 'text',
      html: '<poly-stack gap="2"><poly-badge>New</poly-badge></poly-stack>',
    })
    const stack = host.querySelector('[data-member="stack"]')
    const events: string[] = []
    const stop = PolyElement.observe((element, event) =>
      events.push(`${element.localName} ${event}`),
    )
    host.querySelector('poly-badge')?.append(' and more')
    await vi.waitFor(() =>
      expect(host.querySelector('[data-member="badge"]')?.textContent).toBe('New and more'),
    )
    stop()
    expect(events).toEqual([])
    expect(host.querySelector('[data-member="stack"]')).toBe(stack)
  })
})

describe('content that replaces the member’s', () => {
  it('renders the member again from the new children, and disposes the old ones’ members', async () => {
    const { host } = await mount({
      name: 'replaced',
      html: '<poly-stack gap="2"><poly-badge>One</poly-badge><poly-badge>Two</poly-badge></poly-stack>',
    })
    const events: string[] = []
    const stop = PolyElement.observe((element, event) =>
      events.push(`${element.localName} ${event}`),
    )
    stackOf(host).innerHTML = '<poly-badge>Fresh</poly-badge>'
    await vi.waitFor(() => expect(badges(host)).toEqual(['Fresh']))
    stop()
    expect(events.filter((event) => event.endsWith('dispose')).sort()).toEqual([
      'poly-badge dispose',
      'poly-badge dispose',
      'poly-stack dispose',
    ])
    expect(host.querySelectorAll('[data-member="stack"]')).toHaveLength(1)
  })

  it('puts back the children the page wrote when the member is restored', async () => {
    const html =
      '<poly-stack gap="2"><poly-badge>One</poly-badge><p slot="nowhere">Two</p></poly-stack>'
    const { host } = await mount({ name: 'restored', html })
    expect(host.querySelector('[data-member="stack"]')).not.toBeNull()
    stackOf(host).restore()
    expect(host.innerHTML).toBe(html)
  })
})

describe('content the page takes out through the element', () => {
  it('leaves its slot, and joins it again when the page adds it back', async () => {
    const { host } = await mount({
      name: 'taken out',
      html: '<poly-stack gap="2"><poly-badge>One</poly-badge><poly-badge>Two</poly-badge></poly-stack>',
    })
    const stack = stackOf(host)
    const two = host.querySelectorAll('poly-badge')[1] as Element
    expect(badges(host)).toEqual(['One', 'Two'])
    expect(stack.removeChild(two)).toBe(two)
    await vi.waitFor(() => expect(badges(host)).toEqual(['One']))
    expect(two.isConnected).toBe(false)
    stack.append(two)
    await vi.waitFor(() => expect(badges(host)).toEqual(['One', 'Two']))
  })

  it('takes a named slot’s child out, which keeps its `slot` attribute', async () => {
    const { host } = await mount({
      name: 'footer taken out',
      html: '<poly-dialog title="Later" default-open><p>Body</p><poly-button slot="footer" label="Done"></poly-button></poly-dialog>',
    })
    const footer = () => document.querySelector('[role="dialog"] [data-dialog-part="footer"]')
    await vi.waitFor(() => expect(footer()?.textContent).toContain('Done'))
    const dialog = host.querySelector('poly-dialog') as Element
    const done = footer()?.querySelector('poly-button') as Element
    dialog.removeChild(done)
    await vi.waitFor(() => expect(footer()).toBeNull())
    expect(done.getAttribute('slot')).toBe('footer')
    dialog.append(done)
    await vi.waitFor(() => expect(footer()?.textContent).toContain('Done'))
  })

  it('leaves the child out of the markup `restore` puts back', async () => {
    const { host } = await mount({
      name: 'restored without',
      html: '<poly-stack gap="2"><poly-badge>One</poly-badge><poly-badge>Two</poly-badge></poly-stack>',
    })
    const stack = stackOf(host)
    stack.removeChild(host.querySelectorAll('poly-badge')[1] as Element)
    stack.restore()
    expect(host.innerHTML).toBe('<poly-stack gap="2"><poly-badge>One</poly-badge></poly-stack>')
  })

  it('refuses a node that is neither its child nor in one of its slots, as `Node.removeChild` does', async () => {
    const { host } = await mount({
      name: 'stranger',
      html: '<poly-stack gap="2"><poly-badge>One</poly-badge></poly-stack>',
    })
    const stranger = document.createElement('p')
    expect(() => stackOf(host).removeChild(stranger)).toThrow(DOMException)
  })
})
