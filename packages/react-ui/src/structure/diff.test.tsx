import { render, screen, within } from '@testing-library/react'
import { userEvent } from 'vitest/browser'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { assertGoverned } from '@polymorph/react'
import { diffLaw, diffReading } from '@polymorph/conformance/diff'
import { installTestTheme } from '@polymorph/engine/testing'
import { Alert } from './Alert'
import { Diff, type DiffMessages, type DiffProps } from './Diff'
import { Table } from './Table'
import { Text } from './Text'

/**
 * What a Diff says, and what a collapsed run does with focus, is the law every
 * shell runs (`@polymorph/conformance/diff`). The tests after it are the claims
 * a browser settles for the recipe, which every shell shares: the inline form
 * takes the text around it and wraps with it, its arrow turns with the page's
 * direction, the lines form's wash stops at the marker, and a long line wraps
 * at a phone's width.
 */

beforeAll(installTestTheme)

afterEach(() => {
  document.documentElement.removeAttribute('dir')
  vi.restoreAllMocks()
})

describe('the closed surface', () => {
  it('has no style escape hatch', () => {
    assertGoverned<DiffProps>(true)
  })
})

diffLaw({
  shell: 'React',
  async mount(props) {
    render(<Diff {...props} />)
  },
})

/** The Diff the test rendered. */
const diff = () => document.querySelector<HTMLElement>('[data-member="diff"]') as HTMLElement

/** The page's width on a phone. */
const PHONE = 375

/** A line with no break in it, longer than a phone is wide. */
const LONG = `signing_key=whsec_${'JBSWY3DPEHPK3PXP'.repeat(8)}`

describe('Diff — the inline form', () => {
  it('takes the family, size and colour of the text around it', () => {
    render(
      <Text size="sm" tone="secondary">
        The owner changed: <Diff before="Ada Okonkwo" after="Grace Hopper" />.
      </Text>,
    )
    const around = getComputedStyle(diff().parentElement as HTMLElement)

    for (const part of [diff(), ...diff().querySelectorAll<HTMLElement>('del, ins')]) {
      const style = getComputedStyle(part)
      expect(style.fontFamily).toBe(around.fontFamily)
      expect(style.fontSize).toBe(around.fontSize)
      expect(style.color).toBe(around.color)
      // No box of its own.
      expect(style.display).toBe('inline')
      expect(style.backgroundColor).toBe('rgba(0, 0, 0, 0)')
    }
  })

  it('strikes the old value through and leaves the new one unmarked', () => {
    render(<Diff before="Draft" after="Active" />)

    expect(getComputedStyle(diff().querySelector('del') as HTMLElement).textDecorationLine).toBe(
      'line-through',
    )
    // A browser underlines `ins`, and an underline in running text reads as a link.
    expect(getComputedStyle(diff().querySelector('ins') as HTMLElement).textDecorationLine).toBe(
      'none',
    )
  })

  it('takes no room for the words only a screen reader hears', () => {
    render(
      <Text>
        <Diff before="Draft" after="Active" />
      </Text>,
    )
    const [from, to] = [...diff().querySelectorAll<HTMLElement>(':scope > span:not([aria-hidden])')]

    expect(from?.textContent).toBe('from ')
    expect(to?.textContent).toBe(' to ')
    for (const word of [from, to]) {
      const box = (word as HTMLElement).getBoundingClientRect()
      expect(box.width).toBeLessThanOrEqual(1)
      expect(box.height).toBeLessThanOrEqual(1)
    }
  })

  it('reads the same on an Alert’s wash, in the colour of the Alert’s text', () => {
    render(
      <Alert tone="warning" title="The project was renamed">
        Name: <Diff before="apollo" after="apollo-eu" />
      </Alert>,
    )

    expect(diffReading(diff())).toBe('from apollo to apollo-eu')
    const around = getComputedStyle(diff().parentElement as HTMLElement).color
    expect(getComputedStyle(diff().querySelector('del') as HTMLElement).color).toBe(around)
    expect(getComputedStyle(diff().querySelector('ins') as HTMLElement).color).toBe(around)
  })

  it('sits in a table cell as text, and widens no cell past its value', () => {
    render(
      <Table label="Ticket changes">
        <Table.Body>
          <Table.Row>
            <Table.Cell>T-1041</Table.Cell>
            <Table.Cell>
              <Diff before="Waiting" after="Closed" />
            </Table.Cell>
          </Table.Row>
        </Table.Body>
      </Table>,
    )
    const cell = screen.getAllByRole('cell')[1] as HTMLElement

    expect(diff().parentElement).toBe(cell)
    expect(diffReading(cell)).toBe('from Waiting to Closed')
    expect(getComputedStyle(diff()).fontSize).toBe(getComputedStyle(cell).fontSize)
  })

  it('wraps like the text around it', () => {
    render(
      <div style={{ inlineSize: '160px' }}>
        <Text>
          <Diff
            before="Escalate to the platform team on call"
            after="Escalate to the billing team during office hours"
          />
        </Text>
      </div>,
    )
    const box = diff().closest('div') as HTMLElement

    // Each value breaks across lines, and nothing is wider than the column.
    expect(diff().querySelector('del')?.getClientRects().length).toBeGreaterThan(1)
    expect(diff().querySelector('ins')?.getClientRects().length).toBeGreaterThan(1)
    expect(box.scrollWidth).toBeLessThanOrEqual(box.clientWidth)
  })

  it('points the arrow from the old value to the new one in either direction', () => {
    const centre = (element: Element | null) => {
      const box = (element as HTMLElement).getBoundingClientRect()
      return box.left + box.width / 2
    }
    const { unmount } = render(<Diff before="Draft" after="Active" />)
    const arrow = () => diff().querySelector('[aria-hidden="true"]') as HTMLElement

    // Left to right: the old value, the arrow as it is written, the new value.
    expect(centre(diff().querySelector('del'))).toBeLessThan(centre(arrow()))
    expect(centre(arrow())).toBeLessThan(centre(diff().querySelector('ins')))
    expect(getComputedStyle(arrow()).transform).toBe('none')
    unmount()

    document.documentElement.setAttribute('dir', 'rtl')
    render(<Diff before="Draft" after="Active" />)

    // Right to left: the old value is on the right, and the glyph is mirrored to point left.
    expect(centre(diff().querySelector('del'))).toBeGreaterThan(centre(arrow()))
    expect(centre(arrow())).toBeGreaterThan(centre(diff().querySelector('ins')))
    expect(getComputedStyle(arrow()).transform).toBe('matrix(-1, 0, 0, 1, 0, 0)')
  })

  it('says the words it is given', () => {
    const messages: DiffMessages = {
      from: 'de',
      to: 'à',
      added: 'ajouté',
      removed: 'supprimé',
      unchanged: (count) => `${count} lignes inchangées`,
    }
    const { unmount } = render(<Diff before="Brouillon" after="Actif" messages={messages} />)
    expect(diffReading(diff())).toBe('de Brouillon à Actif')
    unmount()

    render(
      <Diff
        display="lines"
        label="Configuration"
        before={'a\nb\nc\nd'}
        after={'a\nb\nc\ne'}
        context={1}
        messages={messages}
      />,
    )
    expect(screen.getByRole('button', { name: '2 lignes inchangées' })).toBeTruthy()
    const rows = within(diff()).getAllByRole('listitem')
    expect(rows.map(diffReading)).toContain('supprimé d')
    expect(rows.map(diffReading)).toContain('ajouté e')
  })
})

describe('Diff — the lines form', () => {
  const lines = (props: Partial<DiffProps> = {}) =>
    render(
      <Diff
        display="lines"
        label="Granted operations"
        before={'tickets.read\ntickets.write\nbilling.read'}
        after={'tickets.read\ntickets.write\npayments.refund'}
        {...props}
      />,
    )

  /** A row's marker cell and its text, by the row's kind. */
  const parts = (kind: 'added' | 'removed') => {
    const row = diff().querySelector(`li[data-kind="${kind}"]`) as HTMLElement
    return {
      marker: row.querySelector('[aria-hidden="true"]') as HTMLElement,
      text: row.lastElementChild as HTMLElement,
    }
  }

  it('sets its lines in the mono family at the sm step', () => {
    lines()
    const style = getComputedStyle(diff())
    const probe = document.createElement('div')
    probe.style.cssText = 'font-family: var(--pm-font-mono); font-size: var(--pm-text-sm-size)'
    document.body.append(probe)

    expect(style.fontFamily).toBe(getComputedStyle(probe).fontFamily)
    expect(style.fontSize).toBe(getComputedStyle(probe).fontSize)
    probe.remove()
  })

  it('washes the marker cell with the row’s status and leaves the line’s text on the surface', () => {
    lines()
    const added = parts('added')
    const removed = parts('removed')
    const clear = 'rgba(0, 0, 0, 0)'

    expect(getComputedStyle(added.marker).backgroundColor).not.toBe(clear)
    expect(getComputedStyle(removed.marker).backgroundColor).not.toBe(clear)
    expect(getComputedStyle(added.marker).backgroundColor).not.toBe(
      getComputedStyle(removed.marker).backgroundColor,
    )
    // The contrast law holds the line's text on the surface, not on a status wash.
    expect(getComputedStyle(added.text).backgroundColor).toBe(clear)
    expect(getComputedStyle(removed.text).backgroundColor).toBe(clear)
    // Not colour alone: each marker cell holds its glyph.
    expect(added.marker.textContent).toBe('+')
    expect(removed.marker.textContent).toBe('−')
  })

  it('sets a changed line in the primary text colour and an unchanged one a step quieter', () => {
    lines()
    const unchanged = diff().querySelector('li:not([data-kind])')?.lastElementChild as HTMLElement

    expect(getComputedStyle(parts('added').text).color).toBe(getComputedStyle(diff()).color)
    expect(getComputedStyle(unchanged).color).not.toBe(getComputedStyle(diff()).color)
  })

  it('compares a list of ids passed one on each line', () => {
    lines()
    expect(within(diff()).getAllByRole('listitem').map(diffReading)).toEqual([
      'tickets.read',
      'tickets.write',
      'removed billing.read',
      'added payments.refund',
    ])
  })

  it('reads a new text as every line added, and a deleted one as every line removed', () => {
    const { unmount } = lines({ before: undefined })
    expect(within(diff()).getAllByRole('listitem').map(diffReading)).toEqual([
      'added tickets.read',
      'added tickets.write',
      'added payments.refund',
    ])
    unmount()

    lines({ after: null })
    expect(within(diff()).getAllByRole('listitem').map(diffReading)).toEqual([
      'removed tickets.read',
      'removed tickets.write',
      'removed billing.read',
    ])
  })

  it('draws two texts with no change as one collapsed run', () => {
    lines({ after: 'tickets.read\ntickets.write\nbilling.read\n' })

    expect(screen.getByRole('button', { name: '3 unchanged lines' })).toBeTruthy()
    expect(diff().querySelector('li[data-kind]')).toBeNull()
  })

  it('keeps an empty line as a row one line tall', () => {
    lines({ before: 'first\n\nlast', after: 'first\n\nend', context: Infinity })
    const rows = within(diff()).getAllByRole('listitem')

    expect(rows).toHaveLength(4)
    expect(rows[1]?.lastElementChild?.textContent).toBe('')
    expect((rows[1] as HTMLElement).getBoundingClientRect().height).toBeCloseTo(
      (rows[0] as HTMLElement).getBoundingClientRect().height,
      1,
    )
  })

  it('opens a collapsed run on a click, and closes it on the next', async () => {
    lines({
      before: 'a\nb\nc\nd\ne\nf\ng\nold',
      after: 'a\nb\nc\nd\ne\nf\ng\nnew',
    })
    const button = screen.getByRole('button', { name: '4 unchanged lines' })

    await userEvent.click(button)
    expect(button.getAttribute('aria-expanded')).toBe('true')
    const shown = document.getElementById(button.getAttribute('aria-controls') as string)
    expect(shown?.textContent).toBe('abcd')

    await userEvent.click(button)
    expect(button.getAttribute('aria-expanded')).toBe('false')
    expect(button.hasAttribute('aria-controls')).toBe(false)
    expect(diff().textContent).not.toContain('abcd')
  })

  it('wraps a line with no break in it, so it never widens a phone’s page', () => {
    render(
      <div style={{ inlineSize: `${PHONE}px` }}>
        <Diff display="lines" label="Webhook endpoint" before={`a\n${LONG}`} after={`b\n${LONG}`} />
      </div>,
    )
    const box = diff().parentElement as HTMLElement
    const rows = within(diff()).getAllByRole('listitem')
    const long = rows[rows.length - 1] as HTMLElement

    expect(diff().getBoundingClientRect().width).toBeLessThanOrEqual(PHONE)
    expect(diff().scrollWidth).toBeLessThanOrEqual(diff().clientWidth)
    expect(box.scrollWidth).toBeLessThanOrEqual(box.clientWidth)
    // The long line takes more than one line of the row.
    expect(long.getBoundingClientRect().height).toBeGreaterThan(
      (rows[0] as HTMLElement).getBoundingClientRect().height * 1.5,
    )
  })

  it('keeps a line’s indentation', () => {
    lines({ before: '{\n  "a": 1\n}', after: '{\n    "a": 1\n}' })
    const added = parts('added').text

    expect(added.textContent).toBe('    "a": 1')
    expect(getComputedStyle(added).whiteSpace).toBe('pre-wrap')
  })

  it('warns in development when the lines form has no label', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    lines({ label: undefined })

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Diff: the `lines` form is a region'))
    expect(screen.queryByRole('region')).toBeNull()
  })

  it('does not warn for the inline form, which takes no label', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    render(<Diff before="Draft" after="Active" />)
    expect(warn).not.toHaveBeenCalled()
  })
})
