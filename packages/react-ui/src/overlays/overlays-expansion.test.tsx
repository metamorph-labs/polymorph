import { render, screen } from '@testing-library/react'
import { userEvent } from 'vitest/browser'
import { useState } from 'react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { assertGoverned } from '@polymorph/react'
import { Button } from '../controls/Button'
import { tokenColor } from '../controls/token-probe'
import { installTestTheme } from '@polymorph/engine/testing'
import { Menu, type MenuEntry, type MenuProps, type MenuSubmenuEntry } from './Menu'
import { Popover, type PopoverProps } from './Popover'
import { Tabs, type TabsProps } from './Tabs'

/**
 * Menu, Popover and Tabs.
 *
 * Radix provides the behaviour, so these tests cover what the vocabulary adds
 * on top, and the boundaries between three components that all open something.
 */

beforeAll(installTestTheme)

// RTL unmounts between tests but does not put focus back, and a `Tab` that
// starts from a detached node goes nowhere.
beforeEach(() => {
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
})

const noop = () => {}

const TRIGGER = <Button variant="ghost" tone="neutral" iconOnly icon="overflow" label="Actions" />

describe('the closed surfaces', () => {
  it('leave no way to style any of them from a call site', () => {
    assertGoverned<MenuProps>(true)
    assertGoverned<PopoverProps>(true)
    assertGoverned<TabsProps>(true)
  })
})

describe('Menu', () => {
  function open(items: MenuEntry[]) {
    render(<Menu defaultOpen trigger={TRIGGER} items={items} />)
    return screen.getByRole('menu')
  }

  it('runs the command it was given and closes', async () => {
    const onSelect = vi.fn()
    open([{ label: 'Assign to me', onSelect }])

    // Uses the keyboard: a menu is keyboard-first, and the panel is portalled
    // to wherever it fits, which in a short test viewport is off-screen.
    await userEvent.keyboard('{ArrowDown}{Enter}')
    expect(onSelect).toHaveBeenCalledTimes(1)
    await vi.waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
  })

  it('renders a keyboard hint as a key, not as text', () => {
    open([{ label: 'Snooze', kbd: 'S', onSelect: noop }])
    // A hint depicts a key, so it renders through `Kbd`. Menu never binds the
    // shortcut it shows.
    expect(screen.getByRole('menuitem', { name: /Snooze/ }).querySelector('kbd')?.textContent).toBe(
      'S',
    )
  })

  it('marks a destructive command quietly', () => {
    // Red text, never a red fill. The command stays low-key, and the
    // ConfirmDialog it leads to carries the strong warning.
    const menu = open([{ label: 'Delete', tone: 'danger', onSelect: noop }])
    const item = screen.getByRole('menuitem', { name: 'Delete' })
    expect(item.dataset['tone']).toBe('danger')
    expect(getComputedStyle(item).color).toBe(tokenColor('--pm-danger-text'))
    expect(getComputedStyle(item).backgroundColor).toBe('rgba(0, 0, 0, 0)')
    expect(menu).toBeTruthy()
  })

  it('separates and labels groups with the menu’s own semantics', () => {
    // Radix's separator, not the vocabulary's, because inside a menu the
    // divider has a role, and `Separator` is deliberately decorative.
    const menu = open([
      { kind: 'label', label: 'This ticket' },
      { label: 'Snooze', onSelect: noop },
      { kind: 'separator' },
      { label: 'Delete', onSelect: noop },
    ])
    expect(menu.querySelector('[role="separator"]')).not.toBeNull()
    expect(screen.getByText('This ticket')).toBeTruthy()
  })

  it('will not run a disabled command', async () => {
    const onSelect = vi.fn()
    open([{ label: 'Merge into…', disabled: true, onSelect }])
    const item = screen.getByRole('menuitem', { name: 'Merge into…' })
    expect(item.dataset['disabled']).toBe('')

    // Arrowing skips it: a disabled item is not a stop.
    await userEvent.keyboard('{ArrowDown}{Enter}')
    expect(onSelect).not.toHaveBeenCalled()
  })
})

describe('Menu — checkbox entries', () => {
  it('is a real menuitemcheckbox, announced by state with a decorative check', async () => {
    render(
      <Menu
        defaultOpen
        trigger={TRIGGER}
        items={[
          { kind: 'checkbox', label: 'Status', checked: true, onCheckedChange: noop },
          { kind: 'checkbox', label: 'Assignee', checked: false, onCheckedChange: noop },
        ]}
      />,
    )
    const status = screen.getByRole('menuitemcheckbox', { name: 'Status' })
    expect(status.getAttribute('aria-checked')).toBe('true')
    expect(status.dataset['state']).toBe('checked')
    expect(screen.getByRole('menuitemcheckbox', { name: 'Assignee' }).dataset['state']).toBe(
      'unchecked',
    )

    // Select's check column, unchanged: the glyph sits in a reserved column in
    // the accent, and the label keeps the row's colour.
    const check = status.querySelector('svg[data-icon="confirm"]')?.parentElement as HTMLElement
    expect(check).toBeTruthy()
    await vi.waitFor(() =>
      expect(getComputedStyle(check).color).toBe(tokenColor('--pm-accent-text')),
    )
    expect(
      screen.getByRole('menuitemcheckbox', { name: 'Assignee' }).querySelector('svg'),
    ).toBeNull()
  })

  it('toggles without dismissing, so several filters can be set in one open', async () => {
    const onCheckedChange = vi.fn()
    render(
      <Menu
        defaultOpen
        trigger={TRIGGER}
        items={[{ kind: 'checkbox', label: 'Status', checked: false, onCheckedChange }]}
      />,
    )

    await userEvent.keyboard('{ArrowDown}{Enter}')
    expect(onCheckedChange).toHaveBeenCalledWith(true)
    // Still open: this entry kind exists so the menu does not close on each toggle.
    expect(screen.getByRole('menu')).toBeTruthy()

    // Escape still closes it; staying open applies to toggles, not a trap.
    await userEvent.keyboard('{Escape}')
    await vi.waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
  })

  it('reserves the leading slot for the check, so a checkbox entry takes no icon', () => {
    const entry: MenuEntry = {
      kind: 'checkbox',
      label: 'Status',
      // @ts-expect-error — the leading slot is the check's (menu.md).
      icon: 'user',
      checked: true,
      onCheckedChange: noop,
    }
    expect(entry).toBeTruthy()
  })
})

describe('Menu — the controlled pair', () => {
  it('reports every open and close, and obeys the prop over its own state', async () => {
    const onOpenChange = vi.fn()
    const { rerender } = render(
      <Menu
        open={false}
        onOpenChange={onOpenChange}
        trigger={TRIGGER}
        items={[{ label: 'Assign to me', onSelect: noop }]}
      />,
    )
    expect(screen.queryByRole('menu')).toBeNull()

    await userEvent.click(screen.getByRole('button', { name: 'Actions' }))
    expect(onOpenChange).toHaveBeenCalledWith(true)
    // The caller has not accepted the change, so the menu stays closed.
    expect(screen.queryByRole('menu')).toBeNull()

    rerender(
      <Menu
        open
        onOpenChange={onOpenChange}
        trigger={TRIGGER}
        items={[{ label: 'Assign to me', onSelect: noop }]}
      />,
    )
    await vi.waitFor(() => expect(screen.getByRole('menu')).toBeTruthy())
  })

  it('lets an app close on "apply" after several checkbox toggles', async () => {
    function Controlled() {
      const [open, setOpen] = useState(true)
      return (
        <Menu
          open={open}
          onOpenChange={setOpen}
          trigger={TRIGGER}
          items={[
            { kind: 'checkbox', label: 'Status', checked: true, onCheckedChange: noop },
            { label: 'Apply', onSelect: () => setOpen(false) },
          ]}
        />
      )
    }
    render(<Controlled />)
    expect(screen.getByRole('menu')).toBeTruthy()

    // The main use of the controlled pair, as an app would write it: a toggle
    // keeps the menu open, and "apply" is the row that closes it.
    await userEvent.click(screen.getByRole('menuitemcheckbox', { name: 'Status' }))
    expect(screen.getByRole('menu')).toBeTruthy()

    await userEvent.click(screen.getByRole('menuitem', { name: 'Apply' }))
    await vi.waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
  })
})

/**
 * Submenus allow one nested level, enforced by the type rather than by
 * convention.
 */
describe('Menu — one level down', () => {
  const NESTED: MenuEntry[] = [
    { label: 'Assign to me', onSelect: noop },
    {
      kind: 'submenu',
      label: 'Move to',
      items: [
        { label: 'Billing', onSelect: noop },
        { label: 'Onboarding', onSelect: noop },
      ],
    },
  ]

  it('cannot nest twice, and the type enforces it', () => {
    const twice: MenuSubmenuEntry = {
      kind: 'submenu',
      label: 'Move to',
      items: [
        // @ts-expect-error — a menu three levels deep is a navigation tree
        // behind a button, and that content belongs on a page.
        { kind: 'submenu', label: 'Queues', items: [] },
      ],
    }
    expect(twice.items).toHaveLength(1)
  })

  it('opens the nested list from the row marked as a submenu', async () => {
    render(<Menu defaultOpen trigger={TRIGGER} items={NESTED} />)
    const trigger = screen.getByRole('menuitem', { name: /Move to/ })
    // The row carries the affordance: `aria-haspopup` tells a reader that it
    // opens a list rather than running a command.
    expect(trigger.getAttribute('aria-haspopup')).toBe('menu')

    await userEvent.click(trigger)
    await vi.waitFor(() => expect(screen.getByRole('menuitem', { name: 'Billing' })).toBeTruthy())
  })

  it('runs a nested command exactly like a top-level one', async () => {
    const onSelect = vi.fn()
    render(
      <Menu
        defaultOpen
        trigger={TRIGGER}
        items={[{ kind: 'submenu', label: 'Move to', items: [{ label: 'Billing', onSelect }] }]}
      />,
    )
    // By keyboard, because that is where submenus most often go wrong:
    // ArrowDown highlights the row, ArrowRight opens the branch, and Enter runs
    // the command inside it.
    await userEvent.keyboard('{ArrowDown}{ArrowRight}{Enter}')
    expect(onSelect).toHaveBeenCalledTimes(1)
    // The whole menu closes, not just the branch, because the command has run.
    await vi.waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
  })

  it('renders a nested row identically to a parent row', async () => {
    render(<Menu defaultOpen trigger={TRIGGER} items={NESTED} />)
    await userEvent.click(screen.getByRole('menuitem', { name: /Move to/ }))
    const parent = screen.getByRole('menuitem', { name: /Assign to me/ })
    const nested = await vi.waitFor(() => screen.getByRole('menuitem', { name: 'Billing' }))
    // Byte-identical, because the same function renders both. A submenu with
    // different rows would look like a different kind of surface.
    expect(nested.className).toBe(parent.className)
  })
})

describe('Popover', () => {
  it('names its panel, because a panel of controls needs a landmark', () => {
    render(
      <Popover defaultOpen trigger={TRIGGER} label="Filter configuration">
        <p>Body</p>
      </Popover>,
    )
    expect(screen.getByRole('dialog', { name: 'Filter configuration' })).toBeTruthy()
  })

  it('cannot be written without a name', () => {
    // @ts-expect-error — `label` is required, deliberately.
    const bad: PopoverProps = { trigger: TRIGGER, children: 'Body' }
    expect(bad.children).toBe('Body')
  })

  it('closes on Escape and hands focus back to the control', async () => {
    /*
     * The reason `TriggerAnchor` exists. Radix restores focus to the trigger it
     * was given, and a governed control cannot be that trigger because it has
     * no `ref`. So the trigger is a span, and unless the anchor restores focus
     * by hand, focus goes to `<body>` and the next Tab starts from the top of
     * the page.
     */
    render(
      <Popover defaultOpen trigger={TRIGGER} label="Filter configuration">
        <p>Body</p>
      </Popover>,
    )
    expect(screen.getByRole('dialog', { name: 'Filter configuration' })).toBeTruthy()

    await userEvent.keyboard('{Escape}')
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await vi.waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Actions' })),
    )
  })

  it('leaves focus on a control the reader moved to while it closed', async () => {
    // A non-modal surface closes when focus leaves it. The control that took
    // focus keeps it: the return to the trigger is only for focus that was in
    // the panel or nowhere.
    render(
      <>
        <Popover defaultOpen trigger={TRIGGER} label="Filter configuration">
          <p>Body</p>
        </Popover>
        <Button label="Elsewhere" />
      </>,
    )
    expect(screen.getByRole('dialog', { name: 'Filter configuration' })).toBeTruthy()
    const elsewhere = screen.getByRole('button', { name: 'Elsewhere' })
    elsewhere.focus()
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(document.activeElement).toBe(elsewhere)
  })

  it('moves Radix’s ARIA onto the control a reader actually focuses', () => {
    // The other half of the anchor's job. Radix puts `aria-haspopup` and
    // `aria-expanded` on the span it cloned, which nobody focuses.
    render(
      <Popover defaultOpen trigger={TRIGGER} label="Filter configuration">
        <p>Body</p>
      </Popover>,
    )
    const control = screen.getByRole('button', { name: 'Actions' })
    expect(control.getAttribute('aria-expanded')).toBe('true')
    expect(control.getAttribute('aria-haspopup')).toBe('dialog')
    // It is never left on the span: `aria-expanded` on an element with no role
    // is itself a violation, and axe checks every fixture for it.
    expect(control.parentElement?.hasAttribute('aria-expanded')).toBe(false)
  })
})

describe('Tabs', () => {
  const TABS = [
    { value: 'inbox', label: 'Inbox', count: 12 },
    { value: 'mine', label: 'Assigned to me', count: 3 },
    { value: 'archive', label: 'Archive' },
  ]

  function mount(props: Partial<TabsProps> = {}) {
    render(
      <Tabs tabs={TABS} {...props}>
        {TABS.map((tab) => (
          <Tabs.Content key={tab.value} value={tab.value}>
            <p>{`${tab.label} panel`}</p>
          </Tabs.Content>
        ))}
      </Tabs>,
    )
  }

  it('turns vertical without becoming a second component', async () => {
    // Vertical is for labels long enough that a horizontal strip would wrap,
    // because wrapped tabs no longer read as peers.
    mount({ orientation: 'vertical' })
    const list = screen.getByRole('tablist')
    expect(list.getAttribute('aria-orientation')).toBe('vertical')
    expect(getComputedStyle(list).flexDirection).toBe('column')

    // Same selection model and panels, and the arrow keys follow the axis, as
    // Radix does given the orientation.
    await userEvent.click(screen.getByRole('tab', { name: /Inbox/ }))
    await userEvent.keyboard('{ArrowDown}')
    expect(document.activeElement?.textContent).toContain('Assigned to me')
  })

  it('runs the rule down the start edge instead of along the bottom', async () => {
    mount({ orientation: 'vertical' })
    // Everything in the list is a tab except the rule that moves between them,
    // so this selector matches the indicator and not a trigger.
    const rule = await vi.waitFor(() => {
      const node = screen
        .getByRole('tablist')
        .querySelector(':scope > :not([role="tab"])') as HTMLElement | null
      expect(node?.getBoundingClientRect().height).toBeGreaterThan(0)
      return node as HTMLElement
    })
    const box = rule.getBoundingClientRect()
    // A vertical rule is tall and 2px wide; the horizontal one is the transpose.
    expect(box.width).toBeCloseTo(2, 0)
    expect(box.height).toBeGreaterThan(box.width)
  })

  it('ends the vertical rule with the final trigger instead of the panel', () => {
    render(
      <Tabs tabs={TABS} orientation="vertical">
        <Tabs.Content value="inbox">
          {Array.from({ length: 12 }, (_, index) => (
            <p key={index}>{`Panel row ${index + 1}`}</p>
          ))}
        </Tabs.Content>
        <Tabs.Content value="mine">
          <p>Assigned to me panel</p>
        </Tabs.Content>
        <Tabs.Content value="archive">
          <p>Archive panel</p>
        </Tabs.Content>
      </Tabs>,
    )

    const list = screen.getByRole('tablist')
    const root = list.parentElement as HTMLElement
    const tabs = screen.getAllByRole('tab')
    const finalTab = tabs[tabs.length - 1] as HTMLElement
    const listBox = list.getBoundingClientRect()

    expect(listBox.height).toBeLessThan(root.getBoundingClientRect().height)
    expect(listBox.bottom).toBeCloseTo(finalTab.getBoundingClientRect().bottom, 0)
  })

  it('opens on the first tab rather than on nothing', () => {
    // A strip with no selection shows no panel.
    mount()
    expect(screen.getByRole('tab', { name: /Inbox/ }).dataset['state']).toBe('active')
    expect(screen.getByText('Inbox panel')).toBeTruthy()
  })

  it('shows one panel at a time', async () => {
    mount()
    await userEvent.click(screen.getByRole('tab', { name: /Archive/ }))
    expect(screen.getByText('Archive panel')).toBeTruthy()
    expect(screen.queryByText('Inbox panel')).toBeNull()
  })

  it('moves the count into the accent with its own tab', async () => {
    mount()
    const badgeOf = (name: RegExp) =>
      screen.getByRole('tab', { name }).querySelector('[data-tone]') as HTMLElement

    expect(badgeOf(/Inbox/).dataset['tone']).toBe('accent')
    expect(badgeOf(/Assigned to me/).dataset['tone']).toBe('neutral')

    await userEvent.click(screen.getByRole('tab', { name: /Assigned to me/ }))
    expect(badgeOf(/Assigned to me/).dataset['tone']).toBe('accent')
    expect(badgeOf(/Inbox/).dataset['tone']).toBe('neutral')
  })

  it('draws one rule that measures the active tab, not one per trigger', async () => {
    mount({ defaultValue: 'mine' })
    const list = screen.getByRole('tablist')
    const active = screen.getByRole('tab', { name: /Assigned to me/ })

    // The rule appears with the first measurement, which comes from the
    // ResizeObserver rather than a synchronous read, so it renders a frame
    // after the triggers.
    await vi.waitFor(() => {
      const rules = list.querySelectorAll(':scope > div')
      expect(rules).toHaveLength(1)
      expect(Math.round((rules[0] as HTMLElement).getBoundingClientRect().width)).toBe(
        Math.round(active.getBoundingClientRect().width),
      )
    })
  })

  it('will not open a tab that is not ready', async () => {
    render(
      <Tabs
        tabs={[
          { value: 'overview', label: 'Overview' },
          { value: 'usage', label: 'Usage', disabled: true },
        ]}
      >
        <Tabs.Content value="overview">
          <p>Overview panel</p>
        </Tabs.Content>
        <Tabs.Content value="usage">
          <p>Usage panel</p>
        </Tabs.Content>
      </Tabs>,
    )
    const disabled = screen.getByRole('tab', { name: 'Usage' })
    expect(disabled.dataset['disabled']).toBe('')
    await userEvent.click(disabled, { force: true })
    expect(screen.getByText('Overview panel')).toBeTruthy()
  })
})

describe('Tabs — keepMounted', () => {
  /** A panel that would lose its state if a tab switch unmounted it. */
  function Draft() {
    const [text, setText] = useState('')
    return (
      <input aria-label="Draft" value={text} onChange={(event) => setText(event.target.value)} />
    )
  }

  function mountKept(keepMounted: boolean) {
    render(
      <Tabs
        keepMounted={keepMounted}
        tabs={[
          { value: 'reply', label: 'Reply' },
          { value: 'notes', label: 'Notes' },
        ]}
      >
        <Tabs.Content value="reply">
          <Draft />
        </Tabs.Content>
        <Tabs.Content value="notes">
          <p>Notes panel</p>
        </Tabs.Content>
      </Tabs>,
    )
  }

  it('keeps the inactive panel in the DOM, hidden from layout and the tree', async () => {
    mountKept(true)
    const panels = () => [...document.querySelectorAll('[role="tabpanel"]')] as HTMLElement[]
    expect(panels()).toHaveLength(2)

    const inactive = panels().find((panel) => panel.dataset['state'] === 'inactive') as HTMLElement
    expect(inactive.hidden, 'the kept panel must hide itself').toBe(true)
    // Out of the layout: `hidden` computes to display none, which also keeps it
    // out of the accessibility tree.
    expect(getComputedStyle(inactive).display).toBe('none')

    await userEvent.click(screen.getByRole('tab', { name: 'Notes' }))
    await vi.waitFor(() => {
      const reply = panels().find((panel) => panel.dataset['state'] === 'inactive')
      expect(reply?.hidden).toBe(true)
    })
  })

  it('lets a form survive a tab switch, which is why the prop exists', async () => {
    mountKept(true)
    const draft = screen.getByLabelText('Draft')
    await userEvent.click(draft)
    await userEvent.keyboard('half-written reply')

    await userEvent.click(screen.getByRole('tab', { name: 'Notes' }))
    await userEvent.click(screen.getByRole('tab', { name: 'Reply' }))
    expect((screen.getByLabelText('Draft') as HTMLInputElement).value).toBe('half-written reply')
  })

  it('unmounts by default, so the common case does not pay to mount everything', async () => {
    mountKept(false)
    // Radix keeps a hidden shell per panel. What unmounts by default is the
    // content, which keepMounted keeps on purpose.
    const inactive = [...document.querySelectorAll('[role="tabpanel"]')].find(
      (panel) => (panel as HTMLElement).dataset['state'] === 'inactive',
    ) as HTMLElement
    expect(inactive.hidden).toBe(true)
    expect(inactive.childElementCount).toBe(0)

    await userEvent.click(screen.getByRole('tab', { name: 'Notes' }))
    await userEvent.click(screen.getByRole('tab', { name: 'Reply' }))
    // Unmounted and rebuilt, so the draft is lost. That is the default's cost,
    // and the reason for keepMounted.
    expect((screen.getByLabelText('Draft') as HTMLInputElement).value).toBe('')
  })
})
