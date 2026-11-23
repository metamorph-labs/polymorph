import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * The editor's entry imported on a server. It lives at the package root, not
 * in `src/`, because `src/**` is the engine's browser project and this test
 * needs a runtime with no document.
 *
 * A server renders the field before any editor runs, so importing the entry
 * must read no `window`, `document` or `navigator`. Node has a `navigator` of
 * its own, so the test also imports with none, as an older runtime has.
 */

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

describe('the editor entry on a server', () => {
  it('imports with no document and no window', async () => {
    expect(typeof globalThis.document).toBe('undefined')
    expect(typeof globalThis.window).toBe('undefined')
    const entry = await import('./src/rich-text-editor/index')
    expect(typeof entry.createRichTextEditor).toBe('function')
  })

  it('imports with no navigator', async () => {
    vi.stubGlobal('navigator', undefined)
    vi.resetModules()
    const entry = await import('./src/rich-text-editor/index')
    expect(typeof entry.createRichTextEditor).toBe('function')
  })
})
