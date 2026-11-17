import { userEvent } from 'vitest/browser'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { installTestTheme } from '@polymorph/engine/testing'

import '../structure/Table'
import '../structure/TableBody'
import '../structure/TableCell'
import '../structure/TableHead'
import '../structure/TableHeader'
import '../structure/TableRow'

/**
 * A table's parts the page wrote, which its member renders in their
 * elements' place: a `<tr>` where the page wrote `<poly-table-row>`, so the
 * table's rows are the table's own and nothing stands between `tbody` and a
 * row. The part's element, out of the document, stays its controller: a prop
 * attribute set on it later renders the row again, its other attributes are
 * the row's, its listeners are the row's, and its events bubble from the row.
 */

beforeAll(installTestTheme)

const TABLE = `<poly-table label="Tickets"><poly-table-head><poly-table-row><poly-table-header>Ticket</poly-table-header><poly-table-header>Subject</poly-table-header></poly-table-row></poly-table-head><poly-table-body><poly-table-row interactive id="first" data-ticket="T-1041"><poly-table-cell>T-1041</poly-table-cell><poly-table-cell>Login loop</poly-table-cell></poly-table-row><poly-table-row><poly-table-cell>T-1039</poly-table-cell><poly-table-cell>Wrong currency</poly-table-cell></poly-table-row></poly-table-body></poly-table>`

/** The table markup, with its part elements as the page wrote them, before they render. */
async function written(): Promise<{ host: HTMLElement; rows: HTMLElement[] }> {
  const host = document.createElement('div')
  host.innerHTML = TABLE
  const rows = [...host.querySelectorAll<HTMLElement>('poly-table-row')]
  document.body.append(host)
  await vi.waitFor(() => expect(host.querySelector('table')).not.toBeNull())
  return { host, rows }
}

describe('a structural part takes its element’s place', () => {
  it('renders each row as the table’s own row, with no element between them', async () => {
    const { host } = await written()
    const table = host.querySelector('table') as HTMLTableElement
    expect(table.rows).toHaveLength(3)
    expect(host.querySelector('poly-table-row')).toBeNull()
    expect(host.querySelector('tbody > tr > td')?.textContent).toBe('T-1041')
    host.remove()
  })

  it('copies the part’s other attributes to its row, and follows them', async () => {
    const { host, rows } = await written()
    const [, first] = rows as [HTMLElement, HTMLElement]
    const tr = host.querySelector('tbody tr') as HTMLTableRowElement
    expect(tr.id).toBe('first')
    expect(tr.getAttribute('data-ticket')).toBe('T-1041')
    first.setAttribute('data-ticket', 'T-1042')
    first.setAttribute('hx-get', '/tickets/T-1042')
    await vi.waitFor(() => expect(tr.getAttribute('data-ticket')).toBe('T-1042'))
    expect(tr.getAttribute('hx-get')).toBe('/tickets/T-1042')
    first.removeAttribute('data-ticket')
    await vi.waitFor(() => expect(tr.hasAttribute('data-ticket')).toBe(false))
    host.remove()
  })

  it('renders the row again when a prop attribute changes on the part after it was replaced', async () => {
    const { host, rows } = await written()
    const second = rows[2] as HTMLElement
    const tr = () => host.querySelectorAll('tbody tr')[1] as HTMLTableRowElement
    expect(second.isConnected).toBe(false)
    expect(tr().hasAttribute('data-selected')).toBe(false)
    second.setAttribute('selected', '')
    await vi.waitFor(() => expect(tr().hasAttribute('data-selected')).toBe(true))
    second.removeAttribute('selected')
    await vi.waitFor(() => expect(tr().hasAttribute('data-selected')).toBe(false))
    host.remove()
  })

  it('gives the row the part’s listeners, and its events bubble from the row', async () => {
    const { host, rows } = await written()
    const first = rows[1] as HTMLElement
    const own: string[] = []
    const delegated: string[] = []
    first.addEventListener('poly-click', (event) => own.push(event.type))
    host.addEventListener('poly-click', (event) =>
      delegated.push((event.target as Element).localName),
    )
    await userEvent.click(host.querySelector('tbody tr td') as HTMLElement)
    await vi.waitFor(() => expect(own).toEqual(['poly-click']))
    expect(delegated).toEqual(['tr'])
    host.remove()
  })
})
