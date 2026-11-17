import { render, screen } from '@testing-library/react'
import { useState } from 'react'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import {
  MASTER_DETAIL_ITEMS,
  masterDetailLaw,
  type MasterDetailLawProps,
} from '@polymorph/conformance/master-detail'
import { installTestTheme } from '@polymorph/engine/testing'
import { assertGoverned } from '@polymorph/react'
import { MasterDetailPage, type MasterDetailPageProps } from './MasterDetailPage'

/**
 * MasterDetailPage, in a real browser.
 *
 * The archetype's decisions are geometry and focus, which need a real
 * browser. Its two arrangements and where focus goes are the law's
 * (`@polymorph/conformance/master-detail`), which this file calls for React.
 * The tests here check that the page declares its scope on its own root, that
 * it fills the region it is given, and that the list pane scrolls while the
 * detail stays.
 */

beforeAll(installTestTheme)

describe('the closed surface', () => {
  it('has no style escape hatch', () => {
    assertGoverned<MasterDetailPageProps>(true)
  })
})

masterDetailLaw({
  shell: 'React',
  mount({ props, onBack }) {
    let change: (next: Partial<MasterDetailLawProps>) => void = () => {}
    function Held() {
      const [held, setHeld] = useState(props)
      change = (next) => setHeld((was) => ({ ...was, ...next }))
      return (
        <div style={{ inlineSize: `${held.width}px`, blockSize: '480px' }}>
          <MasterDetailPage
            title="Support"
            actions={<button type="button">New ticket</button>}
            listLabel="Tickets"
            list={
              <ul>
                {MASTER_DETAIL_ITEMS.map((name) => (
                  <li key={name}>
                    {held.buttons ? (
                      <button
                        type="button"
                        aria-current={held.current === name ? 'true' : undefined}
                      >
                        {name}
                      </button>
                    ) : (
                      name
                    )}
                  </li>
                ))}
              </ul>
            }
            detail={
              held.detail ? (
                <>
                  <h2>Bravo</h2>
                  <button type="button">Reply</button>
                </>
              ) : undefined
            }
            emptyState={{ title: 'No ticket selected' }}
            backLabel="All tickets"
            onBack={onBack}
          />
        </div>
      )
    }
    render(<Held />)
    return Promise.resolve({ set: (next) => change(next) })
  },
})

function box(width: number): HTMLElement {
  const host = document.createElement('div')
  host.style.cssText = `width: ${width}px; height: 480px;`
  document.body.append(host)
  return host
}

const page = () => document.querySelector('[data-member="master-detail-page"]') as HTMLElement

const rows = (count: number) => (
  <ul>
    {Array.from({ length: count }, (_, index) => (
      <li key={index}>
        <button type="button">{`Ticket ${index + 1}`}</button>
      </li>
    ))}
  </ul>
)

describe('the geometry', () => {
  it('declares the page scope on its root and fills the region it is given', async () => {
    const host = box(1000)
    render(
      <MasterDetailPage
        title="Support"
        listLabel="Tickets"
        list={rows(3)}
        emptyState={{ title: 'No ticket selected' }}
        backLabel="All tickets"
        onBack={() => {}}
      />,
      { container: host },
    )
    await vi.waitFor(() => expect(page().dataset['layout']).toBe('split'))
    expect(getComputedStyle(page()).getPropertyValue('--pm-page-padding-x').trim()).not.toBe('')
    expect(page().getBoundingClientRect().height).toBeCloseTo(480, 0)
    const separator = screen.getByRole('separator', { name: 'Tickets' })
    const padding = Number.parseFloat(getComputedStyle(page()).paddingBottom)
    expect(separator.getBoundingClientRect().bottom).toBeCloseTo(
      host.getBoundingClientRect().bottom - padding,
      0,
    )
    host.remove()
  })

  it('scrolls the list pane on its own while the detail stays', async () => {
    const host = box(1000)
    render(
      <MasterDetailPage
        title="Support"
        listLabel="Tickets"
        list={rows(40)}
        detail={<h2>Ticket 2</h2>}
        emptyState={{ title: 'No ticket selected' }}
        backLabel="All tickets"
        onBack={() => {}}
      />,
      { container: host },
    )
    const list = screen.getByRole('region', { name: 'Tickets' })
    expect(list.scrollHeight).toBeGreaterThan(list.clientHeight)
    const heading = screen.getByRole('heading', { level: 2, name: 'Ticket 2' })
    const before = heading.getBoundingClientRect().top
    list.scrollTop = list.scrollHeight
    await vi.waitFor(() => expect(list.scrollTop).toBeGreaterThan(0))
    expect(heading.getBoundingClientRect().top).toBe(before)
    expect(document.scrollingElement?.scrollTop ?? 0).toBe(0)
    host.remove()
  })
})
