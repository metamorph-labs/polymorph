import { cleanup, render } from '@testing-library/react'
import { flushSync } from 'react-dom'
import { hydrateRoot } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { DATA_ATTRS, hydrateTheme, setMode, STORAGE_KEYS, teardownTheme } from '@polymorph/engine'

import { useMode } from './mode'

/**
 * `useMode`: the document's colour mode preference and the mode it resolves to,
 * kept current for a React component.
 */

const root = document.documentElement

afterEach(() => {
  cleanup()
  teardownTheme()
  vi.unstubAllGlobals()
  root.removeAttribute(DATA_ATTRS.mode)
  localStorage.removeItem(STORAGE_KEYS.mode)
})

function Probe() {
  const { preference, mode } = useMode()
  return <output data-preference={preference} data-applied={mode} />
}

const probe = (within: ParentNode = document) => within.querySelector('output') as HTMLOutputElement
const read = (within?: ParentNode) =>
  `${probe(within).getAttribute('data-preference')}/${probe(within).getAttribute('data-applied')}`

/** A `prefers-color-scheme` query the test turns, with the listeners the runtime adds to it. */
function stubScheme(dark: boolean): { turn(next: boolean): void } {
  const listeners = new Set<() => void>()
  let matches = dark
  vi.stubGlobal('matchMedia', (query: string) => ({
    media: query,
    get matches() {
      return matches
    },
    addEventListener: (_: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
  }))
  return {
    turn(next) {
      matches = next
      for (const listener of [...listeners]) listener()
    },
  }
}

describe('useMode', () => {
  it('reads the document, and renders again after a setMode from any caller', () => {
    setMode('light')
    render(<Probe />)
    expect(read()).toBe('light/light')

    flushSync(() => setMode('dark'))
    expect(read()).toBe('dark/dark')
  })

  it('keeps the preference and renders the new mode when the OS changes under system', () => {
    const scheme = stubScheme(false)
    setMode('system')
    render(<Probe />)
    expect(read()).toBe('system/light')

    flushSync(() => scheme.turn(true))
    expect(read()).toBe('system/dark')
    expect(root.getAttribute(DATA_ATTRS.mode)).toBe('dark')
  })
})

describe('useMode on a server and while React hydrates', () => {
  it('reads system and light on a server', () => {
    setMode('dark')
    expect(renderToString(<Probe />)).toBe(
      '<output data-preference="system" data-applied="light"></output>',
    )
  })

  it('hydrates the server’s markup with no mismatch, then renders the stored choice', async () => {
    const markup = renderToString(<Probe />)
    // What the pre-paint script leaves for a reader who chose dark on an earlier visit.
    localStorage.setItem(STORAGE_KEYS.mode, 'dark')
    root.setAttribute(DATA_ATTRS.mode, 'dark')
    await hydratesToDark(markup)
  })

  it('hydrates with no mismatch on a first visit whose system opens dark, then renders it', async () => {
    const markup = renderToString(<Probe />)
    expect(markup).toBe('<output data-preference="system" data-applied="light"></output>')
    // What a first visit leaves: the pre-paint script painted the system's dark default, and
    // hydration applied it without storing it.
    hydrateTheme('terminal', {
      systems: { terminal: 'petrol' },
      palettes: ['petrol'],
      modes: { terminal: 'dark' },
    })
    try {
      await hydratesToDark(markup)
      expect(localStorage.getItem(STORAGE_KEYS.mode)).toBeNull()
    } finally {
      root.removeAttribute(DATA_ATTRS.system)
      root.removeAttribute(DATA_ATTRS.palette)
    }
  })
})

/** Hydrates the server's markup and waits for the document's dark reading, with no mismatch. */
async function hydratesToDark(markup: string): Promise<void> {
  const host = document.createElement('div')
  host.innerHTML = markup
  document.body.append(host)
  const reported: string[] = []
  const error = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    reported.push(args.map(String).join(' '))
  })
  const hydrated = hydrateRoot(host, <Probe />, {
    onRecoverableError: (failure) => reported.push(String(failure)),
  })
  try {
    const element = probe(host)
    await vi.waitFor(() => expect(read(host)).toBe('dark/dark'))
    // React kept the server's element and reported no mismatch.
    expect(probe(host)).toBe(element)
    expect(reported).toEqual([])
  } finally {
    error.mockRestore()
    hydrated.unmount()
    host.remove()
  }
}
