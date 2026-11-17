import { render, screen, within } from '@testing-library/react'
import { userEvent } from 'vitest/browser'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { TAB_PASSES_BUTTONS } from '@polymorph/conformance/engines'
import { assertGoverned } from '@polymorph/react'
import { createAgentBridge } from '@polymorph/engine/agent'
import { installTestTheme } from '@polymorph/engine/testing'
import { Button } from '../controls/Button'
import { Switch } from '../controls/Switch'
import { Badge } from './Badge'
import { List, type ListItemProps, type ListProps } from './List'

/**
 * What a browser settles for List: which element takes a row's press, that a
 * trailing control still takes its own, how a link's click is routed, and that
 * a long title wraps inside a narrow column.
 */

beforeAll(installTestTheme)

/**
 * Dispatches a click on a link and reports whether the member took it from the
 * browser. The watch is on the document, so it runs after React's handler and
 * reads what the member decided. It then cancels the click itself: a modified
 * click the member leaves alone would open a tab the test cannot close. A
 * listener on the link would run before React's, and the member would see a
 * click that is already cancelled and leave it for that reason alone.
 */
function taken(link: HTMLElement, init: MouseEventInit = {}): boolean {
  let prevented = false
  const watch = (event: MouseEvent) => {
    prevented = event.defaultPrevented
    event.preventDefault()
  }
  document.addEventListener('click', watch)
  link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ...init }))
  document.removeEventListener('click', watch)
  return prevented
}

describe('the closed surface', () => {
  it('has no style escape hatch on the list or an item', () => {
    assertGoverned<ListProps>(true)
    assertGoverned<ListItemProps>(true)
  })
})

describe('the list', () => {
  it('is a named list of its items', () => {
    render(
      <List label="Members">
        <List.Item title="Ada Okafor" />
        <List.Item title="Bao Tran" />
      </List>,
    )
    const list = screen.getByRole('list', { name: 'Members' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(2)
  })
})

describe('an item that is read', () => {
  it('has no control and no interactive mark', () => {
    render(
      <List label="Sign-ins">
        <List.Item title="Ada Okafor" description="Owner" meta="2m" />
      </List>,
    )
    const item = screen.getByRole('listitem')
    expect(within(item).queryByRole('link')).toBeNull()
    expect(within(item).queryByRole('button')).toBeNull()
    expect(item.hasAttribute('data-interactive')).toBe(false)
    expect(within(item).getByText('Owner')).toBeTruthy()
    expect(within(item).getByText('2m')).toBeTruthy()
  })

  it('is never the current item, because it has no page or detail to be open', () => {
    render(
      <List label="Sign-ins">
        <List.Item title="Ada Okafor" description="Owner" current />
        <List.Item title="Bao Tran" description="Member" />
      </List>,
    )
    const [ada, bao] = screen.getAllByRole('listitem') as [HTMLElement, HTMLElement]
    // The filled row says "this one is open" to a reader who sees it. Nothing
    // could say it to a reader who does not: there is no link or button to
    // carry `aria-current`. So the fill is not drawn either.
    expect(ada.hasAttribute('data-current')).toBe(false)
    expect(getComputedStyle(ada).backgroundColor).toBe(getComputedStyle(bao).backgroundColor)
  })
})

describe('an item that navigates', () => {
  it('is a link named by its title, whose target covers the row', async () => {
    const onNavigate = vi.fn()
    render(
      <List label="Members">
        <List.Item
          title="Ada Okafor"
          description="Owner"
          href="/members/ada"
          onNavigate={onNavigate}
        />
      </List>,
    )
    const item = screen.getByRole('listitem')
    const link = within(item).getByRole('link', { name: 'Ada Okafor' })
    expect(link.getAttribute('href')).toBe('/members/ada')
    expect(item.hasAttribute('data-interactive')).toBe(true)

    // A press on the row, away from the title, is a press on the link.
    await userEvent.click(item)
    expect(onNavigate).toHaveBeenCalledExactlyOnceWith('/members/ada')
  })

  it('leaves a click that opens a new tab to the browser', () => {
    const onNavigate = vi.fn()
    render(
      <List label="Members">
        <List.Item title="Ada Okafor" href="#ada" onNavigate={onNavigate} />
      </List>,
    )
    const link = screen.getByRole('link')
    for (const init of [
      { metaKey: true },
      { ctrlKey: true },
      { shiftKey: true },
      { altKey: true },
      { button: 1 },
    ]) {
      expect(taken(link, init), JSON.stringify(init)).toBe(false)
    }
    expect(onNavigate).not.toHaveBeenCalled()
    // The same dispatch without a modifier is the app's, so the loop above tests the member.
    expect(taken(link)).toBe(true)
    expect(onNavigate).toHaveBeenCalledExactlyOnceWith('#ada')
  })

  it('opens from the keyboard', async () => {
    const onNavigate = vi.fn()
    render(
      <List label="Members">
        <List.Item title="Ada Okafor" href="/members/ada" onNavigate={onNavigate} />
      </List>,
    )
    screen.getByRole('link').focus()
    await userEvent.keyboard('{Enter}')
    expect(onNavigate).toHaveBeenCalledExactlyOnceWith('/members/ada')
  })

  it('marks the item of the open page', () => {
    render(
      <List label="Members">
        <List.Item title="Ada Okafor" href="#ada" />
        <List.Item title="Bao Tran" description="Member" meta="1d" href="#bao" current />
      </List>,
    )
    const [ada, bao] = screen.getAllByRole('listitem') as [HTMLElement, HTMLElement]
    expect(within(bao).getByRole('link').getAttribute('aria-current')).toBe('page')
    expect(within(ada).getByRole('link').hasAttribute('aria-current')).toBe(false)

    // A probe resolves the tokens, so the test names no colour.
    const probe = document.createElement('span')
    probe.style.cssText = 'color: var(--pm-text-secondary); background: var(--pm-selection-surface)'
    document.body.append(probe)
    const surface = getComputedStyle(probe)
    expect(getComputedStyle(bao).backgroundColor).toBe(surface.backgroundColor)
    expect(getComputedStyle(ada).backgroundColor).not.toBe(surface.backgroundColor)
    // The text keeps its colours: the contrast law holds every text role on the
    // selected surface. `selected-surface.test.tsx` draws it in a system with no hue.
    expect(getComputedStyle(within(bao).getByRole('link')).color).toBe(
      getComputedStyle(within(ada).getByRole('link')).color,
    )
    expect(getComputedStyle(within(bao).getByText('Member')).color).toBe(surface.color)
    expect(getComputedStyle(within(bao).getByText('1d')).color).toBe(surface.color)
    probe.remove()
  })
})

describe('an item that is picked', () => {
  it('is a button named by its title, and a press anywhere on the row picks it', async () => {
    const onSelect = vi.fn()
    render(
      <List label="Accounts">
        <List.Item title="Ada Okafor" description="Owner" onSelect={onSelect} current />
      </List>,
    )
    const item = screen.getByRole('listitem')
    const button = within(item).getByRole('button', { name: 'Ada Okafor' })
    expect(button.getAttribute('aria-current')).toBe('true')
    expect(item.hasAttribute('data-current')).toBe(true)

    await userEvent.click(item)
    expect(onSelect).toHaveBeenCalledTimes(1)
  })
})

describe('a trailing control', () => {
  it('takes its own press, and the row does not', async () => {
    const onNavigate = vi.fn()
    const onResend = vi.fn()
    render(
      <List label="Invitations">
        <List.Item
          title="Ada Okafor"
          href="/invitations/ada"
          onNavigate={onNavigate}
          trailing={
            <Button variant="outline" tone="neutral" size="sm" label="Resend" onClick={onResend} />
          }
        />
      </List>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Resend' }))
    expect(onResend).toHaveBeenCalledTimes(1)
    expect(onNavigate).not.toHaveBeenCalled()
  })

  it('that is not a control leaves its press to the row', async () => {
    const onNavigate = vi.fn()
    render(
      <List label="Members">
        <List.Item
          title="Ada Okafor"
          href="/members/ada"
          onNavigate={onNavigate}
          trailing={<Badge>Admin</Badge>}
        />
      </List>,
    )
    // The row shows its hover fill and a pointer over the Badge, so a press
    // there is a press on the row. The press is aimed at the Badge's centre
    // through the row, because the Badge itself takes no pointer event.
    const item = screen.getByRole('listitem')
    const row = item.getBoundingClientRect()
    const badge = screen.getByText('Admin').getBoundingClientRect()
    await userEvent.click(item, {
      position: {
        x: badge.left + badge.width / 2 - row.left,
        y: badge.top + badge.height / 2 - row.top,
      },
    })
    expect(onNavigate).toHaveBeenCalledExactlyOnceWith('/members/ada')
  })

  it.each([
    ['is loading', { loading: true }],
    ['is disabled', { disabled: true }],
  ])('that %s keeps its press from the row', async (_state, state) => {
    const onNavigate = vi.fn()
    const onRevoke = vi.fn()
    render(
      <List label="Members">
        <List.Item
          title="Ada Okafor"
          href="/members/ada"
          onNavigate={onNavigate}
          trailing={
            <Button
              variant="outline"
              tone="danger"
              size="sm"
              label="Revoke"
              onClick={onRevoke}
              {...state}
            />
          }
        />
      </List>,
    )
    // A loading Button turns its own pointer events off, so the press is aimed
    // at its centre through the row, as a finger aims it. It must stop at the
    // trailing box: a second press on a busy "Revoke" must not follow the row.
    const item = screen.getByRole('listitem')
    const row = item.getBoundingClientRect()
    const button = screen.getByRole('button', { name: 'Revoke' }).getBoundingClientRect()
    await userEvent.click(item, {
      position: {
        x: button.left + button.width / 2 - row.left,
        y: button.top + button.height / 2 - row.top,
      },
    })
    expect(onNavigate).not.toHaveBeenCalled()
    expect(onRevoke).not.toHaveBeenCalled()
  })

  it('beside a mark takes the press on the mark too', async () => {
    const onNavigate = vi.fn()
    render(
      <List label="Members">
        <List.Item
          title="Ada Okafor"
          href="/members/ada"
          onNavigate={onNavigate}
          trailing={
            <>
              <Badge>Admin</Badge>
              <Button variant="outline" tone="neutral" size="sm" label="Resend" />
            </>
          }
        />
      </List>,
    )
    const item = screen.getByRole('listitem')
    const row = item.getBoundingClientRect()
    const badge = screen.getByText('Admin').getBoundingClientRect()
    await userEvent.click(item, {
      position: {
        x: badge.left + badge.width / 2 - row.left,
        y: badge.top + badge.height / 2 - row.top,
      },
    })
    expect(onNavigate).not.toHaveBeenCalled()
  })

  it('that is a Switch takes its own press anywhere on it', async () => {
    const onNavigate = vi.fn()
    const onCheckedChange = vi.fn()
    render(
      <List label="Notifications">
        <List.Item
          title="Weekly digest"
          href="/notifications/digest"
          onNavigate={onNavigate}
          trailing={<Switch aria-label="Weekly digest" onCheckedChange={onCheckedChange} />}
        />
      </List>,
    )
    await userEvent.click(screen.getByRole('switch', { name: 'Weekly digest' }))
    expect(onCheckedChange).toHaveBeenCalledExactlyOnceWith(true)
    expect(onNavigate).not.toHaveBeenCalled()
  })

  it.skipIf(TAB_PASSES_BUTTONS)('is a second tab stop after the row’s own', async () => {
    render(
      <List label="Invitations">
        <List.Item
          title="Ada Okafor"
          href="#ada"
          trailing={<Button variant="outline" tone="neutral" size="sm" label="Resend" />}
        />
      </List>,
    )
    screen.getByRole('link').focus()
    await userEvent.keyboard('{Tab}')
    await vi.waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Resend' })),
    )
  })
})

describe('a long title', () => {
  it('wraps inside a narrow column and does not widen it', () => {
    const title =
      'ticket-export-2026-eu-west-1-production-customer-support-archive-part-0001-of-0042'
    render(
      <div data-testid="column" style={{ inlineSize: '240px' }}>
        <List label="Exports">
          <List.Item title={title} description={`${title}.zip`} meta="4.2 GB" />
        </List>
      </div>,
    )
    const column = screen.getByTestId('column')
    expect(column.scrollWidth).toBeLessThanOrEqual(column.clientWidth)
    // The whole title is drawn: it wraps onto further lines and is not clipped.
    const drawn = screen.getByText(title)
    expect(drawn.scrollWidth).toBeLessThanOrEqual(drawn.clientWidth)
    expect(drawn.getBoundingClientRect().height).toBeGreaterThan(
      parseFloat(getComputedStyle(drawn).lineHeight),
    )
  })
})

/**
 * An agent picks an item through the bridge, as the spec's `agent` fence
 * declares (`design/components/list.md`, Agent): the items are read from the
 * list in the document, and a pick is a press on the item's own link or
 * button, which reaches the routing seam and `onSelect` as a person's does.
 */
describe('an agent', () => {
  it('reads the items a person can pick and the current one, and no item that is only read', () => {
    const bridge = createAgentBridge()
    try {
      render(
        <List label="Members">
          <List.Item title="Ada Okafor" href="#ada" />
          <List.Item title="Bao Tran" href="#ada" current />
          <List.Item title="Carmen Ruiz" description="Invited" current />
          <List.Item title="Dee Mensah" onSelect={() => {}} />
        </List>,
      )
      const [list] = bridge.snapshot().members
      expect(list).toMatchObject({
        member: 'List',
        name: 'Members',
        state: {
          // The second item that shares an `href` is a row of its own, so a choice of its own.
          items: [
            { id: '#ada', label: 'Ada Okafor' },
            { id: '#ada (2)', label: 'Bao Tran' },
            { id: 'Dee Mensah', label: 'Dee Mensah' },
          ],
          current: '#ada (2)',
        },
        actions: [{ name: 'choose', argument: 'id' }],
      })
    } finally {
      bridge.dispose()
    }
  })

  it('reads no current item when the item marked current is only read', () => {
    const bridge = createAgentBridge()
    try {
      render(
        <List label="Sign-ins">
          <List.Item title="Ada Okafor" current />
          <List.Item title="Bao Tran" />
        </List>,
      )
      const [list] = bridge.snapshot().members
      expect(list?.state).toEqual({ items: [], current: null })
    } finally {
      bridge.dispose()
    }
  })

  it('picks a link through onNavigate and a button through onSelect', async () => {
    const bridge = createAgentBridge()
    try {
      const onNavigate = vi.fn()
      const onSelect = vi.fn()
      render(
        <List label="Members">
          <List.Item title="Ada Okafor" href="/members/ada" onNavigate={onNavigate} />
          <List.Item title="Bao Tran" onSelect={onSelect} />
        </List>,
      )
      const [list] = bridge.snapshot().members
      const { results } = await bridge.act([
        { id: list?.id, action: 'choose', value: '/members/ada' },
        { id: list?.id, action: 'choose', value: 'Bao Tran' },
      ])
      expect(results).toMatchObject([{ ok: true }, { ok: true }])
      expect(onNavigate).toHaveBeenCalledExactlyOnceWith('/members/ada')
      expect(onSelect).toHaveBeenCalledTimes(1)
    } finally {
      bridge.dispose()
    }
  })

  it('refuses an item that is only read, and leaves a trailing control to its own member', async () => {
    const bridge = createAgentBridge()
    try {
      const onSelect = vi.fn()
      render(
        <List label="Invitations">
          <List.Item title="Ada Okafor" description="Invited" />
          <List.Item
            title="Bao Tran"
            onSelect={onSelect}
            trailing={<Button variant="outline" tone="neutral" size="sm" label="Resend" />}
          />
        </List>,
      )
      const { members } = bridge.snapshot()
      const list = members.find((member) => member.member === 'List')
      const resend = members.find((member) => member.member === 'Button')
      expect(list?.state).toEqual({ items: [{ id: 'Bao Tran', label: 'Bao Tran' }], current: null })
      expect(resend).toMatchObject({ name: 'Resend', within: list?.id })
      const { results } = await bridge.act([
        { id: list?.id, action: 'choose', value: 'Ada Okafor' },
      ])
      expect(results[0]).toMatchObject({ ok: false, error: { code: 'invalid-value' } })
      expect(onSelect).not.toHaveBeenCalled()
    } finally {
      bridge.dispose()
    }
  })
})
