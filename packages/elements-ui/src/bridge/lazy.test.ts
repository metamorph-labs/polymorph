import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  define,
  defineLazy,
  PolyElement,
  restore,
  type ElementDefinition,
} from '@polymorph/elements'
import Badge from '@polymorph/solid-ui/structure/Badge'
import Card from '@polymorph/solid-ui/structure/Card'
import Text from '@polymorph/solid-ui/structure/Text'

import { DEFINITIONS } from '../definitions'

/**
 * Tags defined before their members' code (`defineLazy`), as `polymorph.js`
 * defines every tag. An element of such a tag is defined at once, renders
 * nothing and carries no host state until its member's code has run, and the
 * queue loads the code of an element and of every element inside it before it
 * renders any of them, so the outer element still adopts the inner one. An
 * element added to a slot later, whose code nothing loaded, renders there
 * when its code arrives. A load that fails is reported, and its element
 * renders nothing while the others render.
 *
 * Each test defines its tags under names of its own, with a load it decides
 * the timing of.
 */

/** A member's definition under a tag of the test's own. */
const as = (tag: string, from: string): ElementDefinition => ({
  ...(DEFINITIONS[from] as ElementDefinition),
  tag,
})

/** A load the test releases: it runs `define` for the tag, as a member's module does. */
function held(definition: ElementDefinition, component: Parameters<typeof define>[1]) {
  let release = () => {}
  const loaded = new Promise<void>((done) => {
    release = done
  })
  const load = vi.fn(async () => {
    await loaded
    define(definition, component)
  })
  return { load, release }
}

const hosts: HTMLElement[] = []

/** Markup in the document, removed after the test. */
function written(html: string): HTMLElement {
  const host = document.createElement('div')
  host.innerHTML = html
  document.body.append(host)
  hosts.push(host)
  return host
}

const rendered = (element: Element | null) => element?.matches(':state(poly-host)') === true

afterEach(() => {
  for (const host of hosts.splice(0)) {
    restore(host)
    host.remove()
  }
})

describe('a tag defined before its member’s code', () => {
  it('is defined at once and renders when its code has run, with no host state before', async () => {
    const card = as('lazy-a-card', 'poly-card')
    const loading = held(card, Card)
    const element = defineLazy(card, loading.load)
    expect(customElements.get('lazy-a-card')).toBe(element)
    expect((element as typeof PolyElement).component).toBeUndefined()

    const host = written('<lazy-a-card title="Orders">Three wait.</lazy-a-card>')
    const written_ = host.querySelector('lazy-a-card') as PolyElement
    await vi.waitFor(() => expect(loading.load).toHaveBeenCalledTimes(1))
    // Defined, waiting for its code: the page's markup, and no host state.
    expect(written_.textContent).toBe('Three wait.')
    expect(rendered(written_)).toBe(false)

    loading.release()
    await vi.waitFor(() => expect(host.querySelector('[data-member="card"]')).not.toBeNull())
    expect(rendered(written_)).toBe(true)
    expect(host.querySelector('[data-member="card"]')?.textContent).toContain('Three wait.')
    expect(loading.load).toHaveBeenCalledTimes(1)
  })

  it('loads the code of the elements inside an element before it renders, so it adopts them', async () => {
    const card = as('lazy-b-card', 'poly-card')
    const text = as('lazy-b-text', 'poly-text')
    const cardLoad = held(card, Card)
    const textLoad = held(text, Text)
    defineLazy(card, cardLoad.load)
    defineLazy(text, textLoad.load)
    const renders: string[] = []
    const stop = PolyElement.observe((element, event) =>
      renders.push(`${element.localName} ${event}`),
    )

    const host = written(
      '<lazy-b-card title="Orders"><lazy-b-text tone="secondary">Inside.</lazy-b-text></lazy-b-card>',
    )
    await vi.waitFor(() => expect(textLoad.load).toHaveBeenCalledTimes(1))
    // The outer element's code arrives first; it still waits for the inner element's.
    cardLoad.release()
    await new Promise((settle) => setTimeout(settle, 50))
    expect(host.querySelector('[data-member="card"]')).toBeNull()
    textLoad.release()
    await vi.waitFor(() =>
      expect(host.querySelector('[data-member="card"] [data-member="text"]')).not.toBeNull(),
    )
    stop()
    // Each element renders once: the card, and the text inside it as the card's slot reads it.
    expect(renders.sort()).toEqual(['lazy-b-card render', 'lazy-b-text render'])
  })

  it('renders an element added to a slot later once its code has loaded', async () => {
    const card = as('lazy-c-card', 'poly-card')
    const badge = as('lazy-c-badge', 'poly-badge')
    define(card, Card)
    const badgeLoad = held(badge, Badge)
    defineLazy(badge, badgeLoad.load)

    const host = written('<lazy-c-card title="Orders">Three wait.</lazy-c-card>')
    await vi.waitFor(() => expect(host.querySelector('[data-member="card"]')).not.toBeNull())
    host
      .querySelector('lazy-c-card')
      ?.insertAdjacentHTML('beforeend', '<lazy-c-badge>New</lazy-c-badge>')
    await vi.waitFor(() => expect(badgeLoad.load).toHaveBeenCalledTimes(1))
    expect(host.querySelector('[data-member="badge"]')).toBeNull()
    badgeLoad.release()
    await vi.waitFor(() =>
      expect(host.querySelector('[data-member="card"] [data-member="badge"]')?.textContent).toBe(
        'New',
      ),
    )
  })

  it('reports a load that fails, renders nothing for it and renders the others', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const card = as('lazy-d-card', 'poly-card')
    const text = as('lazy-d-text', 'poly-text')
    defineLazy(card, () => Promise.reject(new Error('offline')))
    defineLazy(text, async () => {
      define(text, Text)
    })
    const host = written(
      '<lazy-d-card title="Orders">Kept as written.</lazy-d-card><lazy-d-text>Rendered.</lazy-d-text>',
    )
    await vi.waitFor(() => expect(host.querySelector('[data-member="text"]')).not.toBeNull())
    expect(error).toHaveBeenCalledWith(
      'polymorph: the code for <lazy-d-card> did not load',
      expect.any(Error),
    )
    const failed = host.querySelector('lazy-d-card')
    expect(failed?.textContent).toBe('Kept as written.')
    expect(rendered(failed)).toBe(false)
    error.mockRestore()
  })

  it('takes the host state off an element `restore` puts the page’s markup back in', async () => {
    const card = as('lazy-e-card', 'poly-card')
    define(card, Card)
    const host = written('<lazy-e-card title="Orders">Three wait.</lazy-e-card>')
    const element = host.querySelector('lazy-e-card') as PolyElement
    await vi.waitFor(() => expect(rendered(element)).toBe(true))
    element.restore()
    expect(rendered(element)).toBe(false)
    expect(element.textContent).toBe('Three wait.')
  })
})
