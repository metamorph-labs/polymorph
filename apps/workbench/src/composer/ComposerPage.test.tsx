/**
 * @vitest-environment jsdom
 *
 * The composer page's interaction laws. Four checks on behaviour that is easy to get slightly
 * wrong:
 *
 *  - **The layers are an accessible tree.** Depth is stated in attributes, not only drawn, and
 *    the selected row is marked selected, never as the current page.
 *  - **Open asks first.** It is the most destructive control on the page. It replaces the
 *    composition, clears the history and persists, and nothing can undo it. So it asks for
 *    confirmation, as the milder "Start from…" does.
 *  - **One document has one file name.** The copied emit command and the saved file use the same
 *    kebab-case function, so they agree on acronyms.
 *  - **A save note applies only to its document.** The note disappears once the document changes.
 *
 * The file requests a DOM in its docblock because it tests a rendered page and clicks on it.
 */

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { ComposerPage } from './ComposerPage'
import { slugOf } from './protocol'
import { currentSpec, replaceComposition, startingSpec } from './store'

beforeAll(() => {
  // jsdom 30 provides neither, and the vocabulary's phone-layout hooks call both.
  window.matchMedia ??= ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  // The overlay library calls both when a listbox opens.
  Element.prototype.scrollIntoView ??= function () {}
  Element.prototype.hasPointerCapture ??= function () {
    return false
  }
})

beforeEach(() => {
  replaceComposition(startingSpec())
})

afterEach(cleanup)

/** Picks an option from a listbox through the keyboard path, which jsdom supports. */
function choose(field: string, label: string): void {
  fireEvent.click(screen.getByLabelText(field))
  const option = screen.getAllByRole('option').find((entry) => entry.textContent?.includes(label))
  if (option === undefined) throw new Error(`no option matching ${label}`)
  fireEvent.keyDown(option, { key: 'Enter' })
}

describe('the layers are an accessible tree', () => {
  it('states its structure in attributes, not only visually', () => {
    render(<ComposerPage />)
    const tree = screen.getByRole('tree')
    const items = screen.getAllByRole('treeitem')

    // The starting document: a Stack holding a Heading and a Text.
    expect(items.length).toBeGreaterThanOrEqual(3)
    expect(items[0]?.getAttribute('aria-level')).toBe('1')
    expect(items[1]?.getAttribute('aria-level')).toBe('2')
    expect(tree.contains(items[1] as Node)).toBe(true)

    // The selected row is marked selected, not as the current page.
    expect(items[0]?.getAttribute('aria-selected')).toBe('true')
    expect(items[1]?.getAttribute('aria-selected')).toBe('false')
    expect(tree.querySelector('[aria-current]')).toBeNull()
  })

  it('follows the selection', () => {
    render(<ComposerPage />)
    fireEvent.click(screen.getByRole('button', { name: /Heading/ }))
    const items = screen.getAllByRole('treeitem')
    expect(items[0]?.getAttribute('aria-selected')).toBe('false')
    expect(items[1]?.getAttribute('aria-selected')).toBe('true')
  })
})

describe('Open asks first', () => {
  it('does not replace the composition until the question is answered', () => {
    render(<ComposerPage />)
    choose('Open', 'settings.json')

    // Nothing has changed yet, which is what this test checks.
    expect(currentSpec().name).toBe('Untitled')
    expect(screen.getByText(/Replace this composition\?/)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Replace' }))
    expect(currentSpec().name).toBe('SettingsView')
  })

  it('leaves the composition alone when the answer is no', () => {
    render(<ComposerPage />)
    choose('Open', 'inbox.json')
    const dialog = screen.getByRole('alertdialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(currentSpec().name).toBe('Untitled')
  })
})

describe('one document has one file name', () => {
  it('spells acronyms the same way everywhere', async () => {
    // Two separate kebab-case functions would disagree here: the copied command would name
    // `apiscreen.json` while the endpoint writes `api-screen.json`.
    expect(slugOf('APIScreen')).toBe('api-screen')
    expect(slugOf('CRMScreen')).toBe('crm-screen')
    expect(slugOf('InboxView')).toBe('inbox-view')

    const written: string[] = []
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: (text: string) => {
          written.push(text)
          return Promise.resolve()
        },
      },
    })

    replaceComposition({ ...startingSpec(), name: 'APIScreen' })
    render(<ComposerPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Copy emit command' }))
    await waitFor(() => expect(written).toHaveLength(1))
    expect(written[0]).toBe('pnpm emit design/screens/api-screen.json')
  })

  it('downloads the file under the name Save would write, and lets the browser finish', () => {
    vi.useFakeTimers()
    const revoked: string[] = []
    const clicked: string[] = []
    // jsdom cannot navigate. The test checks the anchor's file name when it is clicked, not the
    // click itself.
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clicked.push(this.download)
    })
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: () => 'blob:probe',
      revokeObjectURL: (url: string) => revoked.push(url),
    })

    try {
      replaceComposition({ ...startingSpec(), name: 'CRMScreen' })
      render(<ComposerPage />)
      fireEvent.click(screen.getByRole('button', { name: 'Download spec' }))

      expect(clicked).toEqual(['crm-screen.json'])
      // Revoking in the same task can cancel the download the click started.
      expect(revoked).toEqual([])
      vi.runAllTimers()
      expect(revoked).toEqual(['blob:probe'])
    } finally {
      vi.unstubAllGlobals()
      vi.restoreAllMocks()
      vi.useRealTimers()
    }
  })
})

describe('a save note applies only to its document', () => {
  it('disappears when the document it describes changes', async () => {
    vi.stubGlobal('fetch', () =>
      Promise.resolve({
        json: () => Promise.resolve({ ok: true, written: ['design/screens/untitled.json'] }),
      }),
    )
    try {
      render(<ComposerPage />)
      fireEvent.click(screen.getByRole('button', { name: 'Save to design/' }))
      await screen.findByText(/Saved design\/screens\/untitled\.json/)

      // After one keystroke, the note describes a document that no longer exists.
      fireEvent.change(screen.getByLabelText('Purpose'), { target: { value: 'Something else' } })
      expect(screen.queryByText(/Saved design\/screens\/untitled\.json/)).toBeNull()
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
