import { render, screen, within } from '@testing-library/react'
import { beforeAll, describe, expect, it } from 'vitest'

import { appendThemeCSS, emitThemeCSS, exampleInkTheme, resolveTheme } from '@polymorph/engine'
import { installTestTheme } from '@polymorph/engine/testing'
import { Button } from '../controls/Button'
import { DataTable } from './DataTable'
import { List } from './List'
import { Table } from './Table'

/**
 * A selected part that holds content of its own, in a system with no hue.
 *
 * Such a system draws `selection.bg` as its ink, the colour of primary text,
 * so a row filled with it cannot be read. These members fill with
 * `selection.surface`, which the contrast law holds every text role on
 * (`packages/theme/src/pairings.ts`). The test theme has a hue, and there the
 * two fills are one colour, so every test here draws inside an ink pairing.
 */

let host: HTMLElement

beforeAll(() => {
  installTestTheme()
  const theme = resolveTheme(exampleInkTheme)
  appendThemeCSS(emitThemeCSS(theme), theme.name)
  host = document.createElement('div')
  host.setAttribute('data-system', theme.system)
  host.setAttribute('data-palette', theme.palette)
  host.setAttribute('data-mode', 'light')
  document.body.append(host)
})

/** A colour token as the ink pairing resolves it, in the browser's own serialisation. */
function ink(token: string): string {
  const probe = document.createElement('span')
  probe.style.color = `var(${token})`
  host.append(probe)
  const { color } = getComputedStyle(probe)
  probe.remove()
  return color
}

function mount(ui: React.ReactElement) {
  const container = document.createElement('div')
  host.append(container)
  return render(ui, { container })
}

describe('the pairing these tests draw in', () => {
  it('draws the selection fill as the colour of primary text', () => {
    // The premise. With it gone, the tests below could pass on either fill.
    expect(ink('--pm-selection-bg')).not.toBe(ink('--pm-selection-surface'))
    expect(ink('--pm-selection-text')).not.toBe(ink('--pm-text-primary'))
  })
})

describe('Table’s selected row', () => {
  it('fills with the selected surface and leaves its cells their text colour', () => {
    mount(
      <Table>
        <Table.Body>
          <Table.Row interactive selected>
            <Table.Cell>Webhook retries</Table.Cell>
          </Table.Row>
        </Table.Body>
      </Table>,
    )
    const cell = getComputedStyle(screen.getByRole('cell', { name: 'Webhook retries' }))
    expect(cell.backgroundColor).toBe(ink('--pm-selection-surface'))
    expect(cell.backgroundColor).not.toBe(ink('--pm-selection-bg'))
    expect(cell.color).toBe(ink('--pm-text-primary'))
  })
})

describe('DataTable’s bulk bar', () => {
  it('fills with the selected surface, so its count and its buttons can be read', () => {
    mount(
      <DataTable
        label="Tickets"
        columns={[{ key: 'subject', header: 'Ticket' }]}
        data={[{ id: 'a', subject: 'Webhook retries' }]}
        getRowId={(row) => row.id}
        selection={new Set(['a'])}
        onSelectionChange={() => {}}
        bulkActions={<Button variant="ghost" tone="neutral" size="sm" label="Archive" />}
        emptyState={{ title: 'No tickets' }}
      />,
    )
    const count = screen.getByText('1 selected')
    const bar = count.closest('[data-pm-member="DataTable"] > *') as HTMLElement
    const filled = [count, ...ancestors(count, bar)].find(
      (element) => getComputedStyle(element).backgroundColor === ink('--pm-selection-surface'),
    )
    expect(filled, 'no ancestor of the count has the selected surface').toBeDefined()
    expect(getComputedStyle(count).color).toBe(ink('--pm-accent-text'))
    // The ink pairing's accent text is its primary text, which the fill holds.
    expect(getComputedStyle(count).color).toBe(ink('--pm-text-primary'))
    for (const element of [count, ...ancestors(count, bar)]) {
      expect(getComputedStyle(element).backgroundColor).not.toBe(ink('--pm-selection-bg'))
    }
  })
})

describe('List’s current item', () => {
  it('fills with the selected surface and leaves each line its text colour', () => {
    mount(
      <List label="Members">
        <List.Item title="Ada Okafor" description="Owner" meta="2m" href="#ada" />
        <List.Item title="Bao Tran" description="Member" meta="1d" href="#bao" current />
      </List>,
    )
    const [ada, bao] = screen.getAllByRole('listitem') as [HTMLElement, HTMLElement]
    expect(getComputedStyle(bao).backgroundColor).toBe(ink('--pm-selection-surface'))
    expect(getComputedStyle(bao).backgroundColor).not.toBe(ink('--pm-selection-bg'))
    expect(getComputedStyle(ada).backgroundColor).not.toBe(ink('--pm-selection-surface'))
    expect(getComputedStyle(within(bao).getByRole('link')).color).toBe(ink('--pm-text-primary'))
    expect(getComputedStyle(within(bao).getByText('Member')).color).toBe(ink('--pm-text-secondary'))
    expect(getComputedStyle(within(bao).getByText('1d')).color).toBe(ink('--pm-text-secondary'))
  })
})

/** The elements from `from`'s parent up to and including `to`. */
function ancestors(from: HTMLElement, to: HTMLElement | null): HTMLElement[] {
  const found: HTMLElement[] = []
  for (let at = from.parentElement; at !== null; at = at.parentElement) {
    found.push(at)
    if (at === to) break
  }
  return found
}
