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
import { Button } from '../controls/Button'
import { FormField } from '../controls/FormField'
import { Input } from '../controls/Input'
import { reachCuts, shadowCuts, shadowReach, tokenLength } from '../controls/token-probe'
import { Stack } from '../layout/Stack'
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

/**
 * Room in the panes. The list and the detail's scroll clip what they hold at their padding edge:
 * a field's or a Button's seat shadow, and a control's focus mark, a 2px line drawn a `space-1`
 * gap outside it. Each takes that room where the page owns the space past it: every side with one
 * pane, and in the split the list's side at the seam and the detail's start side, in its gutter.
 */
describe('room in the panes', () => {
  const form = (name: string) => (
    <Stack gap={3}>
      <Input aria-label={`${name} name`} defaultValue="Orbit" />
      <FormField label={`${name} owner`}>
        <Input defaultValue="Platform" />
      </FormField>
      <Button variant="solid" tone="accent" label={`Save ${name}`} />
    </Stack>
  )

  /** Each control in `region`, with its cuts on `sides`: of the seat and of a focus mark. */
  function cuts(region: HTMLElement, sides: readonly string[]): string[] {
    const mark = Number.parseFloat(tokenLength('--pm-space-1')) + 2
    const controls = [
      ...region.querySelectorAll<HTMLElement>('[data-member="input"], [data-member="button"]'),
    ]
    expect(controls).toHaveLength(3)
    return controls.flatMap((control) => {
      expect(shadowReach(control).bottom, 'the control draws no seat').toBeGreaterThan(0)
      return [...shadowCuts(control), ...reachCuts(control, mark)]
        .filter((cut) => sides.some((side) => cut.startsWith(`${side},`)))
        .map((cut) => `${control.textContent || control.querySelector('input')?.value}: ${cut}`)
    })
  }

  const props = {
    title: 'Support',
    listLabel: 'Tickets',
    emptyState: { title: 'No ticket selected' },
    backLabel: 'All tickets',
    onBack: () => {},
  }

  it('cuts nothing at the seam or in the detail’s gutter, in the split, and moves nothing', async () => {
    const host = box(1000)
    render(<MasterDetailPage {...props} list={form('List')} detail={form('Detail')} />, {
      container: host,
    })
    await vi.waitFor(() => expect(page().dataset['layout']).toBe('split'))
    const list = screen.getByRole('region', { name: 'Tickets' })
    const detail = page().querySelector('[data-master-detail-page-part="detail"]') as HTMLElement
    expect(cuts(list, ['right']), 'the list, at the seam').toEqual([])
    expect(cuts(detail, ['left']), 'the detail, in its gutter').toEqual([])

    const seam = screen.getByRole('separator', { name: 'Tickets' }).getBoundingClientRect()
    const first = (region: HTMLElement) =>
      (region.querySelector('[data-member="input"]') as HTMLElement).getBoundingClientRect()
    expect(first(list).right).toBeCloseTo(seam.left, 1)
    expect(first(detail).left).toBeCloseTo(
      seam.right +
        Number.parseFloat(getComputedStyle(page()).getPropertyValue('--pm-content-gutter')),
      1,
    )
    host.remove()
  })

  for (const shown of ['list', 'detail'] as const) {
    it(`cuts nothing at any side of the ${shown}, with one pane, and moves nothing`, async () => {
      const host = box(400)
      render(
        <MasterDetailPage
          {...props}
          list={form('List')}
          detail={shown === 'detail' ? form('Detail') : undefined}
        />,
        { container: host },
      )
      await vi.waitFor(() => expect(page().dataset['layout']).toBe('single'))
      const region =
        shown === 'list'
          ? screen.getByRole('region', { name: 'Tickets' })
          : // The detail's scroll, after the way back.
            (page().querySelector('[data-master-detail-page-part="detail"]')
              ?.lastElementChild as HTMLElement)
      expect(cuts(region, ['left', 'right', 'top', 'bottom'])).toEqual([])

      const style = getComputedStyle(page())
      const inset = page().getBoundingClientRect().left + Number.parseFloat(style.paddingLeft)
      const control = region.querySelector('[data-member="input"]') as HTMLElement
      expect(control.getBoundingClientRect().left).toBeCloseTo(inset, 1)
      expect(document.scrollingElement?.scrollWidth).toBe(document.scrollingElement?.clientWidth)
      host.remove()
    })
  }
})
