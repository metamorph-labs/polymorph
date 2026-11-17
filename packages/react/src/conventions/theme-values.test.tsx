import { act, cleanup, render } from '@testing-library/react'
import {
  Activity,
  memo,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react'
import { hydrateRoot } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  DATA_ATTRS,
  parseColor,
  readThemeValues,
  themeVersion,
  type ThemeValues,
} from '@polymorph/engine'
import { installTestTheme } from '@polymorph/engine/testing'

import { useThemeValues } from './theme-values'

/**
 * `useThemeValues`: the engine's reading of the theme, kept current for a
 * React component that hands it to another library.
 */

const root = document.documentElement

/** Long enough for a mutation observer to have delivered what it saw. */
const settled = () => new Promise((resolve) => setTimeout(resolve, 30))

beforeEach(() => {
  installTestTheme()
})

// A probe left mounted would hold the engine's listener through the next test.
afterEach(() => {
  cleanup()
  for (const attribute of Object.values(DATA_ATTRS)) root.removeAttribute(attribute)
})

function Probe({ seen, scoped }: { seen: (theme: ThemeValues) => void; scoped?: boolean }) {
  const hostRef = useRef<HTMLSpanElement>(null)
  const theme = useThemeValues(scoped ? hostRef : undefined)
  useEffect(() => {
    seen(theme)
  }, [seen, theme])
  return <span ref={hostRef} />
}

/** A component that reads a value while it renders, as a `style` on what it hosts. */
function Bordered({ scoped }: { scoped?: boolean }) {
  const hostRef = useRef<HTMLDivElement>(null)
  const theme = useThemeValues(scoped ? hostRef : undefined)
  return (
    <div
      ref={hostRef}
      data-probe=""
      data-mode-read={theme.mode}
      style={{ height: '4px', borderColor: theme.color('border.subtle') }}
    />
  )
}

/** What a server renders for `Bordered`: it has no document, so it reads no colour. */
const SERVER_MARKUP = '<div data-probe="" data-mode-read="light" style="height:4px"></div>'

const probe = (within: ParentNode = document) => within.querySelector('[data-probe]') as HTMLElement

/** A colour as the element resolves a role, in the form a `style` serialises it. */
const resolved = (element: Element, role: 'border.subtle') =>
  parseColor(readThemeValues(element).color(role))

describe('useThemeValues', () => {
  it('gives the document’s values to an effect, and a new reading when the mode changes', async () => {
    const readings: string[] = []
    const seen = vi.fn((theme: ThemeValues) => {
      readings.push(`${theme.mode} ${theme.color('bg.app')}`)
    })
    render(<Probe seen={seen} />)
    expect(readings[0]).toMatch(/^light #[0-9a-f]{6}$/)
    const light = readings.at(-1)
    expect(new Set(readings).size).toBe(1)

    root.setAttribute(DATA_ATTRS.mode, 'dark')
    await vi.waitFor(() => expect(readings.at(-1)).toMatch(/^dark #[0-9a-f]{6}$/))
    expect(readings.at(-1)?.slice(5)).not.toBe(light?.slice(6))
  })

  it('keeps one reading while nothing changes', () => {
    const seen = vi.fn()
    const view = render(<Probe seen={seen} />)
    const taken = seen.mock.calls.length
    view.rerender(<Probe seen={seen} />)
    view.rerender(<Probe seen={seen} />)
    expect(seen).toHaveBeenCalledTimes(taken)
  })

  it('takes one reading when it mounts beside a reader that already follows the theme', () => {
    render(<Probe seen={() => {}} />)
    const seen = vi.fn()
    render(<Probe seen={seen} />)
    expect(seen).toHaveBeenCalledTimes(1)
  })

  it('does not take a new reading when a member beside it changes its own tone', async () => {
    const seen = vi.fn()
    const view = render(
      <>
        <Probe seen={seen} />
        <p {...{ [DATA_ATTRS.tone]: 'secondary' }} />
      </>,
    )
    const taken = seen.mock.calls.length
    view.container.querySelector('p')?.setAttribute(DATA_ATTRS.tone, 'danger')
    await settled()
    expect(seen).toHaveBeenCalledTimes(taken)
  })

  it('reads from the element its ref holds, so a scope around it is seen', () => {
    const outside = vi.fn()
    const inside = vi.fn()
    render(
      <>
        <Probe seen={outside} />
        <div {...{ [DATA_ATTRS.tone]: 'inverse' }}>
          <Probe seen={inside} scoped />
        </div>
      </>,
    )
    const [plain] = outside.mock.lastCall as [ThemeValues]
    const [inverse] = inside.mock.lastCall as [ThemeValues]
    expect(plain.mode).toBe('light')
    expect(inverse.mode).toBe('dark')
    expect(inverse.color('bg.surface')).not.toBe(plain.color('bg.surface'))
  })

  it('sees a change made after it rendered and before it followed the theme', async () => {
    // A layout effect runs between a render and the effect that subscribes.
    function Darkens({ children }: { children: ReactNode }) {
      useLayoutEffect(() => {
        root.setAttribute(DATA_ATTRS.mode, 'dark')
      }, [])
      return children
    }
    const view = render(
      <Darkens>
        <Bordered />
      </Darkens>,
    )
    const element = probe(view.container)
    await vi.waitFor(() => expect(element.getAttribute('data-mode-read')).toBe('dark'))
    expect(parseColor(element.style.borderColor)).toEqual(resolved(root, 'border.subtle'))
  })
})

describe('useThemeValues, read while React renders', () => {
  it('renders the document’s value, and the new one when the mode changes', async () => {
    render(<Bordered />)
    const element = probe()
    const light = parseColor(element.style.borderColor)
    expect(light).toEqual(resolved(root, 'border.subtle'))

    root.setAttribute(DATA_ATTRS.mode, 'dark')
    await vi.waitFor(() => expect(element.getAttribute('data-mode-read')).toBe('dark'))
    expect(parseColor(element.style.borderColor)).toEqual(resolved(root, 'border.subtle'))
    expect(parseColor(element.style.borderColor)).not.toEqual(light)
  })

  it.each([
    ['an inverse tone scope', DATA_ATTRS.tone, 'inverse'],
    ['a mode scope', DATA_ATTRS.mode, 'dark'],
  ])('renders again with its ref’s element, inside %s', (_scope, attribute, value) => {
    // Another reader holds the engine's listener, so nothing but the ref makes this one render again.
    render(<Probe seen={() => {}} />)
    const view = render(
      <div {...{ [attribute]: value }}>
        <Bordered scoped />
      </div>,
    )
    const element = probe(view.container)
    expect(element.getAttribute('data-mode-read')).toBe('dark')
    expect(parseColor(element.style.borderColor)).toEqual(resolved(element, 'border.subtle'))
    expect(resolved(element, 'border.subtle')).not.toEqual(resolved(root, 'border.subtle'))
  })

  it('gives a new reading once its ref has its element, so a value derived from it is made again', () => {
    render(<Probe seen={() => {}} />)
    const seen = vi.fn()
    render(
      <div {...{ [DATA_ATTRS.tone]: 'inverse' }}>
        <Probe seen={seen} scoped />
      </div>,
    )
    expect(seen).toHaveBeenCalledTimes(2)
    const [[first], [second]] = seen.mock.calls as [[ThemeValues], [ThemeValues]]
    // The first render has no element, so it reads the document root.
    expect(first.mode).toBe('light')
    expect(second.mode).toBe('dark')
    expect(second.color('bg.surface')).not.toBe(first.color('bg.surface'))
  })
})

describe('useThemeValues and a ref whose element arrives late, is replaced or leaves', () => {
  type Place = 'nowhere' | 'inverse' | 'compact'

  /** The ref's element inside the scope `at` names. Each scope gives a reading the other does not. */
  function Host({ at, hostRef }: { at: Place; hostRef: RefObject<HTMLSpanElement | null> }) {
    if (at === 'nowhere') return null
    const scope = at === 'inverse' ? DATA_ATTRS.tone : DATA_ATTRS.density
    return (
      <div key={at} {...{ [scope]: at }}>
        <span ref={hostRef} data-host="" />
      </div>
    )
  }

  /** A component that draws what it reads, and draws its ref's element where `at` says. */
  function Placed({ at }: { at: Place }) {
    const hostRef = useRef<HTMLSpanElement>(null)
    const theme = useThemeValues(hostRef)
    return (
      <div
        data-probe=""
        data-themed={String(theme.themed)}
        data-mode-read={theme.mode}
        data-height={theme.controlHeight('md')}
      >
        <Host at={at} hostRef={hostRef} />
      </div>
    )
  }

  const drawn = (element: Element) => ({
    themed: element.getAttribute('data-themed'),
    mode: element.getAttribute('data-mode-read'),
    height: Number(element.getAttribute('data-height')),
  })

  const read = (from?: Element | null) => {
    const theme = readThemeValues(from)
    return { themed: String(theme.themed), mode: theme.mode, height: theme.controlHeight('md') }
  }

  const host = (within: ParentNode) => within.querySelector('[data-host]')

  // Another reader holds the engine's listener in each test, so only the ref makes a reader render again.
  beforeEach(() => {
    render(<Probe seen={() => {}} />)
  })

  it('tells the three places apart by what an element in each reads', () => {
    const view = render(
      <>
        <Host at="inverse" hostRef={{ current: null }} />
        <Host at="compact" hostRef={{ current: null }} />
      </>,
    )
    const [inverse, compact] = [...view.container.querySelectorAll('[data-host]')]
    expect(read(inverse).mode).toBe('dark')
    expect(read(compact).mode).toBe('light')
    expect(read(compact).height).toBeLessThan(read().height)
    expect(read(inverse).height).toBe(read().height)
  })

  it('reads from an element its ref takes after the first render', () => {
    const view = render(<Placed at="nowhere" />)
    const element = probe(view.container)
    expect(drawn(element)).toEqual(read())

    view.rerender(<Placed at="inverse" />)
    expect(drawn(element)).toEqual(read(host(view.container)))
    expect(drawn(element).mode).toBe('dark')
  })

  it('reads from the element that replaces its ref’s element', () => {
    const view = render(<Placed at="inverse" />)
    const element = probe(view.container)
    const first = host(view.container)
    expect(drawn(element).mode).toBe('dark')

    view.rerender(<Placed at="compact" />)
    const second = host(view.container)
    expect(second).not.toBe(first)
    expect(drawn(element)).toEqual(read(second))
    expect(drawn(element).height).toBeLessThan(read().height)
  })

  it('reads the document root’s values once its ref’s element is removed', () => {
    const view = render(<Placed at="inverse" />)
    const element = probe(view.container)
    expect(drawn(element).mode).toBe('dark')

    view.rerender(<Placed at="nowhere" />)
    expect(host(view.container)).toBeNull()
    expect(drawn(element)).toEqual(read())
    expect(drawn(element).themed).toBe('true')
  })

  it('keeps its element when only a child renders, and reads the new one when its own component renders', () => {
    /** A child that moves the ref's element by its own state, so its parent does not render. */
    function Moves({ hostRef }: { hostRef: RefObject<HTMLSpanElement | null> }) {
      const [at, setAt] = useState<Place>('inverse')
      return (
        <>
          <button type="button" onClick={() => setAt('compact')}>
            Move
          </button>
          <Host at={at} hostRef={hostRef} />
        </>
      )
    }
    const seen = vi.fn()
    function Parent({ seen: report }: { seen: (theme: ThemeValues) => void }) {
      const hostRef = useRef<HTMLSpanElement>(null)
      const theme = useThemeValues(hostRef)
      useEffect(() => {
        report(theme)
      }, [report, theme])
      return <Moves hostRef={hostRef} />
    }
    const held = (): ThemeValues => (seen.mock.lastCall as [ThemeValues])[0]

    const view = render(<Parent seen={seen} />)
    expect(held().mode).toBe('dark')
    const readings = seen.mock.calls.length

    act(() => view.container.querySelector('button')?.click())
    expect(host(view.container)?.parentElement?.getAttribute(DATA_ATTRS.density)).toBe('compact')
    // The parent did not render, so it has no new reading. The element it holds has left the
    // document, which reads as the document root.
    expect(seen).toHaveBeenCalledTimes(readings)
    expect(held().themed).toBe(true)
    expect(held().mode).toBe('light')
    expect(held().controlHeight('md')).toBe(read().height)

    view.rerender(<Parent seen={seen} />)
    expect(held().controlHeight('md')).toBe(read(host(view.container)).height)
    expect(held().controlHeight('md')).toBeLessThan(read().height)
  })
})

describe('useThemeValues on a server and while React hydrates', () => {
  it('renders no value on a server', () => {
    // The server renderer reads the hook's server snapshot, in this document as in Node.
    expect(renderToString(<Bordered />)).toBe(SERVER_MARKUP)
    expect(renderToString(<Bordered scoped />)).toBe(SERVER_MARKUP)
  })

  it.each([
    ['from the document', false],
    ['from its ref’s element', true],
  ])('hydrates the server’s markup, then renders the value %s', async (_where, scoped) => {
    const host = document.createElement('div')
    host.setAttribute(DATA_ATTRS.mode, 'dark')
    host.innerHTML = SERVER_MARKUP
    document.body.append(host)
    const reported: string[] = []
    const error = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      reported.push(args.map(String).join(' '))
    })
    const hydrated = hydrateRoot(host, <Bordered scoped={scoped} />, {
      onRecoverableError: (failure) => reported.push(String(failure)),
    })
    try {
      const element = probe(host)
      await vi.waitFor(() => expect(element.style.borderColor).not.toBe(''))
      // React kept the server's element and reported no mismatch.
      expect(probe(host)).toBe(element)
      expect(reported).toEqual([])
      const from = scoped ? element : root
      expect(parseColor(element.style.borderColor)).toEqual(resolved(from, 'border.subtle'))
      expect(element.getAttribute('data-mode-read')).toBe(scoped ? 'dark' : 'light')
    } finally {
      error.mockRestore()
      hydrated.unmount()
      host.remove()
    }
  })
})

describe('useThemeValues and the engine’s listener', () => {
  /** Whether the engine holds a listener: its version grows on a change only while it does. */
  async function engineFollows(): Promise<boolean> {
    const version = themeVersion()
    const next = root.getAttribute(DATA_ATTRS.density) === 'compact' ? 'comfortable' : 'compact'
    root.setAttribute(DATA_ATTRS.density, next)
    await settled()
    return themeVersion() !== version
  }

  it('releases it when its component unmounts', async () => {
    const view = render(<Probe seen={() => {}} />)
    expect(await engineFollows()).toBe(true)
    view.unmount()
    expect(await engineFollows()).toBe(false)
  })

  it.each([
    ['whose children render again with it', false],
    ['whose children do not render again', true],
  ])(
    'is current when an Activity %s is shown after a change made while hidden',
    async (_, kept) => {
      const Kept = memo(Bordered)
      const tree = (mode: 'visible' | 'hidden') => (
        <Activity mode={mode}>{kept ? <Kept /> : <Bordered />}</Activity>
      )
      const view = render(tree('visible'))
      // A render after the mount, as most components have had by the time they are hidden.
      view.rerender(tree('visible'))
      const element = probe(view.container)
      expect(element.getAttribute('data-mode-read')).toBe('light')

      view.rerender(tree('hidden'))
      // React released the subscription with the hidden tree's effects.
      expect(await engineFollows()).toBe(false)
      root.setAttribute(DATA_ATTRS.mode, 'dark')
      await settled()

      view.rerender(tree('visible'))
      await vi.waitFor(() => expect(element.getAttribute('data-mode-read')).toBe('dark'))
      expect(parseColor(element.style.borderColor)).toEqual(resolved(root, 'border.subtle'))
    },
  )

  it('is current when an Activity is shown after a change another reader followed', async () => {
    render(<Probe seen={() => {}} />)
    const tree = (mode: 'visible' | 'hidden') => (
      <Activity mode={mode}>
        <Bordered />
      </Activity>
    )
    const view = render(tree('visible'))
    view.rerender(tree('visible'))
    const element = probe(view.container)

    view.rerender(tree('hidden'))
    root.setAttribute(DATA_ATTRS.mode, 'dark')
    await settled()

    view.rerender(tree('visible'))
    await vi.waitFor(() =>
      expect(parseColor(element.style.borderColor)).toEqual(resolved(root, 'border.subtle')),
    )
    expect(element.getAttribute('data-mode-read')).toBe('dark')
  })
})
