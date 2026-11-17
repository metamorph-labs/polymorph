import { getByRole } from '@testing-library/dom'
import { userEvent } from 'vitest/browser'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { installTestTheme } from '@polymorph/engine/testing'

/**
 * The law for how a LogView follows its newest line and what it says
 * (`design/components/log-view.md`), which every web shell's LogView test
 * calls with a mount of its own, and the React member's test too. A contract
 * statement reads one part's role, name or attribute (`docs/conformance.md`).
 * This law reads what the contract grammar cannot state: where the log is
 * scrolled after lines arrive and after the reader scrolls, the words a screen
 * reader hears for a line, whether a long line wraps, and how long a line
 * takes to arrive in a log of five thousand.
 */

/** One line, as the law passes it. */
export interface LogViewLawLine {
  id: string
  text: string
  level?: 'info' | 'warning' | 'error'
  time?: string
  source?: string
}

/** The props the law mounts a LogView with, and may set again after it mounts. */
export interface LogViewLawProps {
  lines: LogViewLawLine[]
  streaming?: boolean
  wrap?: boolean
}

export interface MountedLogView {
  /** The element the shell mounted into. The law sizes it, so the log has a box to fill. */
  readonly host: HTMLElement
  /** Sets props on the log, as its parent's state would. */
  set(next: Partial<LogViewLawProps>): void | Promise<void>
}

export interface LogViewLaw {
  /** The shell's name as the law's titles say it: `Vue`. */
  readonly shell: string
  /**
   * Mounts one LogView labelled `Build output` with these props, and no other
   * LogView. A prop the law leaves out is not passed.
   */
  mount(props: LogViewLawProps): Promise<MountedLogView>
}

/** The one LogView on the page. */
const root = (): HTMLElement => {
  const element = document.querySelector<HTMLElement>('[data-member="log-view"]')
  if (element === null) throw new Error('the LogView rendered nothing')
  return element
}

const port = (): HTMLElement => getByRole(root(), 'log')

/** The rows that are lines: every item of the list that assistive technology reads. */
const rows = (): HTMLElement[] =>
  [...port().querySelectorAll<HTMLElement>('li')].filter(
    (item) => item.getAttribute('aria-hidden') !== 'true',
  )

/** What assistive technology reads in an element: its text, without the parts hidden from it. */
function reading(element: Element): string {
  let read = ''
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) read += node.textContent ?? ''
    else if (node instanceof Element && node.getAttribute('aria-hidden') !== 'true') {
      node.childNodes.forEach(walk)
    }
  }
  walk(element)
  return read
}

/** Within the follow's slack of the end (`FOLLOW_SLACK_PX`). */
const atEnd = (region: HTMLElement) =>
  region.scrollHeight - region.scrollTop - region.clientHeight <= 24

/** `count` ordinary lines, numbered from `from`. */
const numbered = (count: number, from = 0): LogViewLawLine[] =>
  Array.from({ length: count }, (_, at) => ({
    id: `n${from + at}`,
    text: `line ${from + at}: compiled packages/relay/src/module-${from + at}.ts`,
  }))

/** A line with no break in it, wider than the law's box. */
const LONG = `signing_key=whsec_${'JBSWY3DPEHPK3PXP'.repeat(8)}`

/**
 * Resolves once `check` holds, read once a frame. A frame is the finest step a
 * reader sees, so a stall shows in it.
 */
function frames(check: () => boolean, timeout = 5000): Promise<void> {
  const start = performance.now()
  return new Promise((settle, fail) => {
    const look = () => {
      const spent = performance.now() - start
      if (check()) settle()
      else if (spent > timeout) fail(new Error(`not settled after ${timeout}ms`))
      else requestAnimationFrame(look)
    }
    look()
  })
}

export function logViewLaw({ shell, mount }: LogViewLaw): void {
  /** Mounts the log in a 480 × 240 box. */
  async function boxed(props: LogViewLawProps): Promise<MountedLogView> {
    const mounted = await mount(props)
    mounted.host.style.cssText = 'inline-size: 480px; block-size: 240px;'
    return mounted
  }

  describe(`${shell} LogView — what it says`, () => {
    beforeAll(installTestTheme)

    it('is one log named by its label, which announces nothing on its own', async () => {
      await mount({ lines: numbered(3) })

      const log = getByRole(document.body, 'log', { name: 'Build output' })
      expect(root().contains(log)).toBe(true)
      expect(log.getAttribute('aria-live')).toBe('off')
      expect(log.hasAttribute('aria-busy')).toBe(false)
      expect(getByRole(log, 'list').children).toHaveLength(3)
    })

    it('is busy while more lines are coming, with a caret no screen reader reads', async () => {
      const log = await mount({ lines: numbered(3), streaming: true })

      expect(port().getAttribute('aria-busy')).toBe('true')
      expect(root().hasAttribute('data-streaming')).toBe(true)
      const items = port().querySelectorAll('li')
      expect(items).toHaveLength(4)
      expect(items[3]?.getAttribute('aria-hidden')).toBe('true')
      expect(rows()).toHaveLength(3)

      await log.set({ streaming: false })
      await vi.waitFor(() => expect(port().hasAttribute('aria-busy')).toBe(false))
      expect(root().hasAttribute('data-streaming')).toBe(false)
      expect(port().querySelectorAll('li')).toHaveLength(3)
    })

    it('reads a line as its level, its time, its source and its text', async () => {
      await mount({
        lines: [
          {
            id: 'a',
            time: '14:24:08.019',
            level: 'error',
            source: 'svc-api',
            text: 'pg: connection reset by peer',
          },
          { id: 'b', level: 'warning', text: 'slow query 1840ms' },
          { id: 'c', level: 'info', source: 'svc-web', text: 'GET / 200' },
          { id: 'd', text: 'ordinary output' },
        ],
      })
      const [error, warning, info, plain] = rows() as [
        HTMLElement,
        HTMLElement,
        HTMLElement,
        HTMLElement,
      ]

      expect(reading(error).trim()).toBe('error 14:24:08.019 svc-api pg: connection reset by peer')
      expect(reading(warning).trim()).toBe('warning slow query 1840ms')
      expect(reading(info).trim()).toBe('info svc-web GET / 200')
      expect(reading(plain).trim()).toBe('ordinary output')
    })

    it('marks a level for the eye, and an ordinary line not at all', async () => {
      await mount({
        lines: [
          { id: 'a', level: 'error', text: 'Build failed.' },
          { id: 'b', level: 'warning', text: 'Unused import.' },
          { id: 'c', level: 'info', text: 'Done.' },
          { id: 'd', text: 'ordinary output' },
        ],
      })
      const [error, warning, info, plain] = rows()
      const mark = (row: HTMLElement | undefined) =>
        row?.querySelector('[aria-hidden="true"] [data-icon]')?.getAttribute('data-icon')

      expect(error?.getAttribute('data-level')).toBe('error')
      expect(mark(error)).toBe('error')
      expect(warning?.getAttribute('data-level')).toBe('warning')
      expect(mark(warning)).toBe('warning')
      expect(info?.getAttribute('data-level')).toBe('info')
      expect(mark(info)).toBe('info')
      expect(plain?.hasAttribute('data-level')).toBe(false)
      expect(mark(plain)).toBeUndefined()
    })

    it('keeps each line’s text as it was written, whitespace and all', async () => {
      const text = '  dist/index.html      0.48 kB  gzip:   0.31 kB'
      await mount({ lines: [{ id: 'a', text }] })
      expect(reading(rows()[0] as HTMLElement)).toBe(text)
    })
  })

  describe(`${shell} LogView — scrolling and following`, () => {
    beforeAll(installTestTheme)

    it('is a tab stop only while it overflows', async () => {
      const log = await boxed({ lines: numbered(2) })
      await vi.waitFor(() => expect(port().hasAttribute('tabindex')).toBe(false))
      await log.set({ lines: numbered(40) })
      await vi.waitFor(() => expect(port().getAttribute('tabindex')).toBe('0'))
    })

    it('starts at the end and stays there as lines arrive', async () => {
      const log = await boxed({ lines: numbered(40) })
      await vi.waitFor(() => expect(atEnd(port())).toBe(true))
      expect(port().scrollHeight).toBeGreaterThan(port().clientHeight * 2)

      await log.set({ lines: numbered(80) })
      await vi.waitFor(() => {
        expect(rows()).toHaveLength(80)
        expect(atEnd(port())).toBe(true)
      })
      expect(root().hasAttribute('data-state')).toBe(false)
    })

    it('stays where the reader scrolled, and the jump control returns them', async () => {
      const log = await boxed({ lines: numbered(40) })
      await vi.waitFor(() => expect(atEnd(port())).toBe(true))

      port().scrollTop = 0
      await vi.waitFor(() => expect(root().getAttribute('data-state')).toBe('detached'))
      await log.set({ lines: numbered(80) })
      await vi.waitFor(() => expect(rows()).toHaveLength(80))
      await new Promise((settle) => setTimeout(settle, 50))
      expect(port().scrollTop).toBe(0)

      const jump = getByRole(root(), 'button', { name: 'Jump to latest' })
      await userEvent.click(jump)
      await vi.waitFor(() => expect(atEnd(port())).toBe(true))
      await vi.waitFor(() => expect(root().hasAttribute('data-state')).toBe(false))

      // It follows again from the press.
      await log.set({ lines: numbered(120) })
      await vi.waitFor(() => {
        expect(rows()).toHaveLength(120)
        expect(atEnd(port())).toBe(true)
      })
    })

    it('follows again once the reader scrolls back to the end', async () => {
      const log = await boxed({ lines: numbered(40) })
      await vi.waitFor(() => expect(atEnd(port())).toBe(true))
      port().scrollTop = 0
      await vi.waitFor(() => expect(root().getAttribute('data-state')).toBe('detached'))

      port().scrollTop = port().scrollHeight
      await vi.waitFor(() => expect(root().hasAttribute('data-state')).toBe(false))
      await log.set({ lines: numbered(80) })
      await vi.waitFor(() => {
        expect(rows()).toHaveLength(80)
        expect(atEnd(port())).toBe(true)
      })
    })

    it('wraps a long line by default, so the log never scrolls sideways', async () => {
      await boxed({ lines: [{ id: 'a', text: LONG }, ...numbered(2)] })
      await vi.waitFor(() => expect(port().clientWidth).toBeGreaterThan(0))

      expect(root().hasAttribute('data-wrap')).toBe(true)
      expect(port().scrollWidth).toBeLessThanOrEqual(port().clientWidth)
      const [long, short] = rows() as [HTMLElement, HTMLElement]
      expect(long.getBoundingClientRect().height).toBeGreaterThan(
        short.getBoundingClientRect().height * 1.5,
      )
    })

    it('keeps a long line on one row with wrap off, and scrolls sideways', async () => {
      await boxed({ lines: [{ id: 'a', text: LONG }, ...numbered(2)], wrap: false })
      await vi.waitFor(() => expect(port().getAttribute('tabindex')).toBe('0'))

      expect(root().hasAttribute('data-wrap')).toBe(false)
      expect(port().scrollWidth).toBeGreaterThan(port().clientWidth)
      const [long, short] = rows() as [HTMLElement, HTMLElement]
      expect(long.getBoundingClientRect().height).toBe(short.getBoundingClientRect().height)
      // Every row reaches the same edge, so a level's wash spans the scrolled width.
      expect(short.getBoundingClientRect().width).toBe(long.getBoundingClientRect().width)
    })

    it('draws five thousand lines, and follows a new one without a visible stall', async () => {
      const lines = numbered(5000)
      const log = await boxed({ lines })
      await vi.waitFor(() => expect(atEnd(port())).toBe(true), { timeout: 10000 })
      expect(rows()).toHaveLength(5000)

      const spent: number[] = []
      let shown = lines
      for (let at = 0; at < 9; at += 1) {
        shown = [...shown, ...numbered(1, 5000 + at)]
        const start = performance.now()
        await log.set({ lines: shown })
        const count = shown.length
        await frames(() => rows().length === count && atEnd(port()))
        spent.push(performance.now() - start)
      }
      spent.sort((a, b) => a - b)
      // The median of nine arrivals: a line reaches the screen within a tenth
      // of a second, which a reader still sees as at once. The median, because
      // one arrival can wait on a collection or a test running beside it.
      expect(spent[4]).toBeLessThan(100)
    })
  })
}
