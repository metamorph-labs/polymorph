import { getAllByRole, getByRole, queryByRole } from '@testing-library/dom'
import { userEvent } from 'vitest/browser'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { installTestTheme } from '@polymorph/engine/testing'

/**
 * The law for what a Diff says and where focus is when a collapsed run opens
 * (`design/components/diff.md`, A11y), which every web shell's Diff test calls
 * with a mount of its own. A contract statement reads one part's role, name or
 * attribute (`docs/conformance.md`). This law reads what the contract grammar
 * cannot state: the words a screen reader hears across the member's parts,
 * each line's text with its whitespace, and focus after a press.
 *
 * The law focuses a button from a script and reads `document.activeElement`,
 * because Tab passes over buttons in WebKit.
 */

/** The props the law mounts a Diff with. */
export interface DiffLawProps {
  before?: string | null
  after?: string | null
  display?: 'inline' | 'lines'
  label?: string
  context?: number
}

export interface DiffLaw {
  /** The shell's name as the law's titles say it: `Vue`. */
  readonly shell: string
  /** Mounts one Diff with these props, and no other Diff. A prop the law leaves out is not passed. */
  mount(props: DiffLawProps): Promise<unknown>
}

/**
 * What assistive technology reads in an element: its text, without the parts
 * hidden from it. Not normalised, so a missing or doubled space shows.
 */
export function diffReading(element: Element): string {
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

/** The one Diff on the page, or `null` when it renders nothing. */
const diff = () => document.querySelector<HTMLElement>('[data-member="diff"]')

const root = (): HTMLElement => {
  const element = diff()
  if (element === null) throw new Error('the Diff rendered nothing')
  return element
}

/** The rows that are lines, in order: every list item that is not a collapsed run. */
const lineRows = (): HTMLElement[] =>
  [...root().querySelectorAll<HTMLElement>('li')].filter(
    (item) => item.querySelector('button') === null,
  )

/** A row's line: the text of its last part, as it is drawn. */
const lineOf = (row: HTMLElement): string => row.lastElementChild?.textContent ?? ''

/** Fourteen lines of a configuration, and the same with its seventh line changed. */
const BEFORE = [
  '{',
  '  "a": 1,',
  '  "b": 2,',
  '  "c": 3,',
  '  "d": 4,',
  '  "e": 5,',
  '  "retries": 5,',
  '  "f": 6,',
  '  "g": 7,',
  '  "h": 8,',
  '  "i": 9,',
  '  "j": 10,',
  '  "k": 11',
  '}',
]
const AFTER = BEFORE.map((line) => (line === '  "retries": 5,' ? '  "retries": 8,' : line))

const LINES: DiffLawProps = {
  display: 'lines',
  label: 'Configuration',
  before: BEFORE.join('\n'),
  after: AFTER.join('\n'),
}

export function diffLaw({ shell, mount }: DiffLaw): void {
  describe(`${shell} Diff — what it says`, () => {
    beforeAll(installTestTheme)

    it('reads a changed value as "from", the old value, "to", the new value', async () => {
      await mount({ before: 'Draft', after: 'Active' })

      expect(diffReading(root())).toBe('from Draft to Active')
      expect(root().querySelector('del')?.textContent).toBe('Draft')
      expect(root().querySelector('ins')?.textContent).toBe('Active')
      // The arrow is drawn, and hidden from assistive technology.
      expect(root().textContent).toContain('→')
      expect(root().querySelector('[aria-hidden="true"]')?.textContent).toBe('→')
    })

    it('reads an addition as "added" and the new value, with no old value', async () => {
      await mount({ after: 'Ada Okonkwo' })

      expect(diffReading(root())).toBe('added Ada Okonkwo')
      expect(root().querySelector('ins')?.textContent).toBe('Ada Okonkwo')
      expect(root().querySelector('del')).toBeNull()
      expect(root().textContent).not.toContain('→')
      // The sign is the mark a sighted reader has, and it is hidden from assistive technology.
      expect(root().querySelector('[aria-hidden="true"]')?.textContent?.trim()).toBe('+')
    })

    it('reads a removal as "removed" and the old value, with no new value', async () => {
      await mount({ before: 'Ada Okonkwo', after: null })

      expect(diffReading(root())).toBe('removed Ada Okonkwo')
      expect(root().querySelector('del')?.textContent).toBe('Ada Okonkwo')
      expect(root().querySelector('ins')).toBeNull()
    })

    it('reads an empty side as a missing one', async () => {
      await mount({ before: '', after: 'Active' })
      expect(diffReading(root())).toBe('added Active')
    })

    it('writes an unchanged value as plain text', async () => {
      await mount({ before: 'Active', after: 'Active' })

      expect(root().textContent).toBe('Active')
      expect(root().querySelector('del, ins')).toBeNull()
      expect(root().tagName).toBe('SPAN')
    })

    it('renders nothing when neither side has a value', async () => {
      await mount({ before: null, after: '' })
      expect(diff()).toBeNull()

      await mount({ display: 'lines', label: 'Configuration' })
      expect(diff()).toBeNull()
    })

    it('draws the lines form as a named region holding one list', async () => {
      await mount(LINES)

      expect(getByRole(document.body, 'region', { name: 'Configuration' })).toBe(root())
      const lists = getAllByRole(root(), 'list')
      expect(lists).toHaveLength(1)
      // Three lines of context on each side of the change, the two changed lines, and two runs.
      expect(lists[0]?.children).toHaveLength(10)
    })

    it('keeps three lines beside the change, and each line’s text as it was written', async () => {
      await mount(LINES)

      expect(lineRows().map(lineOf)).toEqual([
        '  "c": 3,',
        '  "d": 4,',
        '  "e": 5,',
        '  "retries": 5,',
        '  "retries": 8,',
        '  "f": 6,',
        '  "g": 7,',
        '  "h": 8,',
      ])
    })

    it('reads a changed line as "removed" or "added" and the line, and marks it for the eye', async () => {
      await mount(LINES)
      const rows = lineRows()
      const [unchanged, removed, added] = [rows[2], rows[3], rows[4]] as HTMLElement[]

      expect(diffReading(removed as HTMLElement)).toBe('removed   "retries": 5,')
      expect(diffReading(added as HTMLElement)).toBe('added   "retries": 8,')
      expect(diffReading(unchanged as HTMLElement)).toBe('  "e": 5,')

      const marker = (row: HTMLElement | undefined) => row?.querySelector('[aria-hidden="true"]')
      expect(marker(removed)?.textContent).toBe('−')
      expect(marker(added)?.textContent).toBe('+')
      expect(marker(unchanged)?.textContent).toBe('')
      expect(removed?.getAttribute('data-kind')).toBe('removed')
      expect(added?.getAttribute('data-kind')).toBe('added')
      expect(unchanged?.hasAttribute('data-kind')).toBe(false)
    })

    it('draws the unchanged lines past the context as one closed button that says how many', async () => {
      await mount(LINES)

      const buttons = getAllByRole(root(), 'button')
      expect(buttons.map((button) => button.textContent)).toEqual([
        '3 unchanged lines',
        '4 unchanged lines',
      ])
      for (const button of buttons) {
        expect(button.getAttribute('aria-expanded')).toBe('false')
        expect(button.hasAttribute('aria-controls')).toBe(false)
      }
      expect(root().textContent).not.toContain('"a": 1')
    })

    it('shows a run’s lines under its button when pressed, and keeps focus on the button', async () => {
      await mount(LINES)
      const button = getByRole<HTMLButtonElement>(root(), 'button', { name: '4 unchanged lines' })
      button.focus()
      expect(document.activeElement).toBe(button)

      await userEvent.keyboard('{Enter}')
      await vi.waitFor(() => expect(button.getAttribute('aria-expanded')).toBe('true'))

      // The button is the element the reader pressed, and focus has not left it.
      expect(button.isConnected).toBe(true)
      expect(document.activeElement).toBe(button)

      // It names the list that holds the lines it showed.
      const shown = document.getElementById(button.getAttribute('aria-controls') ?? '')
      expect(shown?.getAttribute('role')).toBe('list')
      expect([...(shown?.children ?? [])].map((row) => lineOf(row as HTMLElement))).toEqual([
        '  "i": 9,',
        '  "j": 10,',
        '  "k": 11',
        '}',
      ])
      expect(root().contains(shown)).toBe(true)

      // The other run stays closed.
      expect(
        getByRole(root(), 'button', { name: '3 unchanged lines' }).getAttribute('aria-expanded'),
      ).toBe('false')
    })

    it('hides the lines again on a second press, with focus still on the button', async () => {
      await mount(LINES)
      const button = getByRole<HTMLButtonElement>(root(), 'button', { name: '4 unchanged lines' })
      button.focus()
      await userEvent.keyboard('{Enter}')
      await vi.waitFor(() => expect(button.getAttribute('aria-expanded')).toBe('true'))

      await userEvent.keyboard('{Enter}')
      await vi.waitFor(() => expect(button.getAttribute('aria-expanded')).toBe('false'))

      expect(button.hasAttribute('aria-controls')).toBe(false)
      expect(root().textContent).not.toContain('"k": 11')
      expect(document.activeElement).toBe(button)
    })

    it('draws every line and no button with an infinite context', async () => {
      await mount({ ...LINES, context: Infinity })

      expect(queryByRole(root(), 'button')).toBeNull()
      expect(lineRows()).toHaveLength(BEFORE.length + 1)
    })
  })
}
