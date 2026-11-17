import { afterEach, describe, expect, it, vi } from 'vitest'

import type { PageRecord } from './page'

/**
 * When an element renders, against how the page's script reaches the parser.
 *
 * A module script runs after the parser has written the whole document, so
 * every element is defined with its children in place. A classic script in
 * `<head>` defines the elements before the parser reaches them, and the parser
 * connects each element before it writes the element's children. The queue
 * waits for `DOMContentLoaded` while the document is loading, so in both an
 * element renders once, after its children are written, and adopts the
 * elements inside it: no element renders on its own and is disposed when the
 * element around it takes it. An element inside another finishes rendering
 * first, because its member renders inside the outer member's slot.
 *
 * Each test loads the page's script (`page.ts`) into a frame of its own. The
 * classic case writes the frame's document in parts after the script has
 * defined the elements, which is what a classic script in `<head>` meets: the
 * parser creates each element as a defined element, connects it while its
 * children are still unwritten, and the document is loading until it closes.
 */

const PAGE = new URL('./page.ts', import.meta.url).href

const frames: HTMLIFrameElement[] = []
afterEach(() => {
  for (const frame of frames.splice(0)) frame.remove()
})

/** A frame whose document runs the page's script, once the script has defined the elements. */
async function framed(body: string): Promise<{ window: Window; record: PageRecord }> {
  const frame = document.createElement('iframe')
  frames.push(frame)
  frame.srcdoc = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Page</title></head><body>${body}<script type="module" src="${PAGE}"></script></body></html>`
  document.body.append(frame)
  const window = await vi.waitFor(
    () => {
      const inner = frame.contentWindow as (Window & { polymorphPage?: PageRecord }) | null
      if (inner?.polymorphPage === undefined) throw new Error('the page has not run')
      return inner
    },
    { timeout: 20_000, interval: 50 },
  )
  // The frame's own load has ended, so no event of it reaches the document a test writes.
  await vi.waitFor(() => expect(window.document.readyState).toBe('complete'))
  return { window, record: (window as unknown as { polymorphPage: PageRecord }).polymorphPage }
}

const task = () => new Promise<void>((settle) => setTimeout(settle, 20))

/** The FormField's label, its control, and the attributes left on the elements. */
function wiring(document: Document) {
  const label = document.querySelector('label')
  const input = document.querySelector('input:not([type="hidden"])')
  const host = document.querySelector('poly-input')
  return {
    labelled: label !== null && input !== null && label.htmlFor === input.id && input.id !== '',
    describedBy: input?.getAttribute('aria-describedby') ?? null,
    hostAttributes: host === null ? [] : [...host.attributes].map((attribute) => attribute.name),
  }
}

describe('a module script, which runs after the document is written', () => {
  it('renders each element once, inside the element around it, with its children in place', async () => {
    const { window, record } = await framed(
      '<poly-form-field label="Email" description="We never share it."><poly-input name="email" id="email"></poly-input></poly-form-field>',
    )
    await vi.waitFor(() => expect(wiring(window.document).labelled).toBe(true))
    expect(record.events.map(({ element, event }) => `${element} ${event}`)).toEqual([
      'poly-input render',
      'poly-form-field render',
    ])
    const read = wiring(window.document)
    expect(read.describedBy).toMatch(/description/)
    // The control's `id` is a prop, read off the element, where a label would find it first.
    expect(read.hostAttributes).toEqual(['name'])
  })

  it('reads a checkbox the field holds as the row it labels', async () => {
    const { window } = await framed(
      '<poly-form-field label="Agree"><poly-checkbox name="agree"></poly-checkbox></poly-form-field>',
    )
    await vi.waitFor(() =>
      expect(
        window.document.querySelector('[data-member="form-field"]')?.getAttribute('data-kind'),
      ).toBe('row-labelled'),
    )
  })
})

describe('a classic script, which defines the elements before the parser writes them', () => {
  it('waits for the document to load, then renders each element once, with its children', async () => {
    const { window, record } = await framed('')
    record.events.length = 0
    const document = window.document
    document.open()
    document.write('<!doctype html><html lang="en"><head><title>Page</title></head><body>')
    document.write('<poly-form-field label="Email" description="We never share it.">')
    await task()
    // The parser has connected the field before its children: it is defined and waits.
    const field = document.querySelector('poly-form-field') as HTMLElement
    expect(field.constructor).toBe(window.customElements.get('poly-form-field'))
    expect(field.childNodes.length).toBe(0)
    expect(document.readyState).toBe('loading')
    expect(record.events).toEqual([])
    document.write('<poly-input name="email"></poly-input>')
    await task()
    expect(record.events).toEqual([])
    document.write('</poly-form-field></body></html>')
    document.close()
    await vi.waitFor(() => expect(wiring(document).labelled).toBe(true))
    expect(record.events.map(({ element, event }) => `${element} ${event}`)).toEqual([
      'poly-input render',
      'poly-form-field render',
    ])
    expect(record.events.map(({ readyState }) => readyState)).not.toContain('loading')
  })
})
