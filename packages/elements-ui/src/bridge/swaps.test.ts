import { beforeAll, describe, expect, it, vi } from 'vitest'

import { PolyElement, restore } from '@polymorph/elements'
import { installTestTheme } from '@polymorph/engine/testing'

import '../controls/Button'
import '../layout/Stack'
import '../structure/Alert'
import '../structure/Badge'
import '../structure/Card'
import '../structure/Table'
import '../structure/TableBody'
import '../structure/TableCell'
import '../structure/TableRow'
import { mount } from '../mount'

/**
 * A member with several slots under the page's changes, as htmx swaps them,
 * and `restore` over a page whose members hold members.
 *
 * An Alert has three: its text, `action` and `secondary-action`. A node the
 * page adds joins the slot its `slot` attribute names, at the start of it when
 * it is added before the member's rendering and at the end when it is added
 * after. A swap of the element's children renders the member again from the
 * new ones, slot by slot. `restore` disposes every member a page holds and
 * puts back the markup the page wrote, so a snapshot of the page renders again
 * when it is put back.
 */

beforeAll(installTestTheme)

/** The Alert's text, without its title and its buttons. */
const body = (host: HTMLElement) => {
  const alert = host.querySelector('[data-member="alert"]')
  const title = alert?.querySelector('p')?.textContent ?? ''
  const labels = [...(alert?.querySelectorAll('button') ?? [])].map((button) => button.textContent)
  return labels.reduce(
    (text, label) => text.replace(label ?? '', ''),
    (alert?.textContent ?? '').replace(title, ''),
  )
}

/** The Alert's buttons, in the order it draws them. */
const buttons = (host: HTMLElement) =>
  [...host.querySelectorAll('[data-member="alert"] button')].map((button) =>
    button.textContent?.trim(),
  )

const ALERT =
  '<poly-alert title="Sync paused">Changes wait until you are back.<poly-button slot="action" label="Reconnect"></poly-button></poly-alert>'

describe('a member with several slots follows the page’s changes', () => {
  it('puts each added node in the slot it names, before or after what the slot held', async () => {
    const { host } = await mount({ name: 'added', html: ALERT })
    const alert = host.querySelector('poly-alert') as unknown as PolyElement
    expect(buttons(host)).toEqual(['Reconnect'])

    const later = document.createElement('poly-button')
    later.setAttribute('slot', 'secondary-action')
    later.setAttribute('label', 'Later')
    alert.append(later)
    await vi.waitFor(() => expect(buttons(host)).toEqual(['Reconnect', 'Later']))

    const first = document.createElement('poly-button')
    first.setAttribute('slot', 'action')
    first.setAttribute('label', 'Retry')
    alert.prepend(first)
    await vi.waitFor(() => expect(buttons(host)).toEqual(['Retry', 'Reconnect', 'Later']))

    alert.prepend('Offline. ')
    await vi.waitFor(() => expect(body(host)).toBe('Offline. Changes wait until you are back.'))
  })

  it('renders every slot again from children that replace the old ones', async () => {
    const { host } = await mount({ name: 'swapped', html: ALERT })
    const alert = host.querySelector('poly-alert') as unknown as PolyElement
    const disposed: string[] = []
    const stop = PolyElement.observe((element, event) => {
      if (event === 'dispose') disposed.push(element.localName)
    })
    alert.innerHTML =
      'Back online.<poly-button slot="secondary-action" label="Dismiss"></poly-button>'
    await vi.waitFor(() => expect(body(host)).toBe('Back online.'))
    stop()
    expect(buttons(host)).toEqual(['Dismiss'])
    expect(disposed.sort()).toEqual(['poly-alert', 'poly-button'])
    expect(host.querySelectorAll('[data-member="alert"]')).toHaveLength(1)
  })

  it('draws no buttons once a swap leaves both action slots empty', async () => {
    const { host } = await mount({ name: 'emptied', html: ALERT })
    expect(buttons(host)).toEqual(['Reconnect'])
    ;(host.querySelector('poly-alert') as unknown as PolyElement).innerHTML = 'Resumed.'
    await vi.waitFor(() => expect(body(host)).toBe('Resumed.'))
    expect(buttons(host)).toEqual([])
  })
})

/**
 * Whether an element holds the markup `html` writes: the same nodes, each
 * element with the same attributes in any order, because an attribute a
 * member's prop took off goes back after the others.
 */
function sameMarkup(element: Element, html: string): boolean {
  const written = document.createElement('div')
  written.innerHTML = html
  const read = element.cloneNode(true) as Element
  read.normalize()
  return (
    read.childNodes.length === written.childNodes.length &&
    [...read.childNodes].every((node, index) => node.isEqualNode(written.childNodes[index] as Node))
  )
}

describe('restore over a page whose members hold members', () => {
  const PAGE = [
    '<poly-card title="Queue">',
    '<poly-stack gap="2"><poly-badge tone="accent">Open</poly-badge><p slot="nowhere">Note</p></poly-stack>',
    '<poly-table label="Tickets"><poly-table-body><poly-table-row id="row-1" data-ticket="1"><poly-table-cell>T-1</poly-table-cell></poly-table-row></poly-table-body></poly-table>',
    '</poly-card>',
    ALERT,
  ].join('')

  it('disposes every member and puts back the markup the page wrote', async () => {
    const { host } = await mount({ name: 'page', html: PAGE })
    expect(host.querySelector('tr#row-1')?.getAttribute('data-ticket')).toBe('1')
    const disposed: string[] = []
    const stop = PolyElement.observe((element, event) => {
      if (event === 'dispose') disposed.push(element.localName)
    })
    restore(host)
    stop()
    expect(sameMarkup(host, PAGE), host.innerHTML).toBe(true)
    expect(host.querySelector('[data-member]')).toBeNull()
    expect(disposed.sort()).toEqual(
      [
        'poly-alert',
        'poly-badge',
        'poly-button',
        'poly-card',
        'poly-stack',
        'poly-table',
        'poly-table-body',
        'poly-table-cell',
        'poly-table-row',
      ].sort(),
    )
  })

  it('renders a snapshot of the restored page again when the page puts it back', async () => {
    const { host } = await mount({ name: 'snapshot', html: PAGE })
    restore(host)
    const snapshot = host.innerHTML
    host.innerHTML = snapshot
    await vi.waitFor(() => expect(host.querySelector('tr#row-1')).not.toBeNull())
    expect(host.querySelectorAll('[data-member="card"]')).toHaveLength(1)
    expect(host.querySelectorAll('[data-member="alert"]')).toHaveLength(1)
    expect(host.querySelector('[data-member="badge"]')?.textContent).toBe('Open')
  })
})
