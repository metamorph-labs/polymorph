import { afterEach, describe, expect, it, vi } from 'vitest'

import { inheritedMethod, restore } from '@polymorph/elements'

import '../controls/Button'
import '../overlays/Dialog'
import '../structure/Diff'

/**
 * A prop named as a method every element inherits. Diff's `before` and
 * `after` are `ChildNode.before()` and `after()`, which a page and its
 * libraries call on any element to insert beside it. Such a prop gets no
 * property, so the method keeps working on its element, and its attribute
 * sets it. A prop named as an accessor (`title`, `id`, `ariaLabel`) keeps its
 * property, which replaces the element's own.
 */

const hosts: HTMLElement[] = []

function written(html: string): HTMLElement {
  const host = document.createElement('div')
  host.innerHTML = html
  document.body.append(host)
  hosts.push(host)
  return host
}

afterEach(() => {
  for (const host of hosts.splice(0)) {
    restore(host)
    host.remove()
  }
})

describe('a prop named as a method every element inherits', () => {
  it('finds the methods on the prototype chain, and not the accessors', () => {
    for (const method of ['before', 'after', 'remove', 'focus', 'closest']) {
      expect(inheritedMethod(method), method).toBe(true)
    }
    for (const accessor of ['id', 'title', 'role', 'ariaLabel', 'prefix', 'value']) {
      expect(inheritedMethod(accessor), accessor).toBe(false)
    }
  })

  it('keeps the method on the element, and its attribute sets the prop', async () => {
    const host = written('<poly-diff before="Draft" after="Active"></poly-diff>')
    const diff = host.querySelector('poly-diff') as HTMLElement
    await vi.waitFor(() => expect(host.querySelector('ins')?.textContent).toBe('Active'))
    expect(host.querySelector('del')?.textContent).toBe('Draft')

    // The methods are the DOM's, and they work: a page inserts beside the element.
    expect(diff.before).toBe(Element.prototype.before)
    expect(diff.after).toBe(Element.prototype.after)
    const marker = document.createElement('span')
    diff.after(marker)
    expect(diff.nextSibling).toBe(marker)

    diff.setAttribute('after', 'Archived')
    await vi.waitFor(() => expect(host.querySelector('ins')?.textContent).toBe('Archived'))
    diff.removeAttribute('before')
    await vi.waitFor(() => expect(host.querySelector('del')).toBeNull())
    expect(host.querySelector('ins')?.textContent).toBe('Archived')
  })

  it('leaves a prop named as an accessor its property', async () => {
    const host = written(
      '<poly-dialog title="Confirm"><poly-button slot="trigger" label="Open"></poly-button>Body</poly-dialog>',
    )
    const dialog = host.querySelector('poly-dialog') as HTMLElement & { title: string }
    await vi.waitFor(() => expect(host.querySelector('button')).not.toBeNull())
    expect(dialog.title).toBe('Confirm')
    dialog.title = 'Confirm the order'
    expect(dialog.title).toBe('Confirm the order')
    // The property is the prop's: the element keeps no `title` attribute that would show a tooltip.
    expect(dialog.hasAttribute('title')).toBe(false)
  })
})
