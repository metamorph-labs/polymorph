import { render, screen } from '@testing-library/react'
import axeCore, { type RunOptions } from 'axe-core'
import { useState, type ReactNode } from 'react'
import { page, userEvent } from 'vitest/browser'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { Button } from '../controls/Button'
import { Input } from '../controls/Input'
import { Select } from '../controls/Select'
import { SplitButton } from '../controls/SplitButton'
import { tokenLength } from '../controls/token-probe'
import { installTestTheme } from '@polymorph/engine/testing'
import { ContextMenu } from './ContextMenu'
import { Dialog } from './Dialog'
import { Menu, type MenuEntry } from './Menu'
import { Popover } from './Popover'
import { Tooltip, TooltipProvider } from './Tooltip'
import menuCss from '@polymorph/recipes/overlays/menu.module.css?raw'
import popoverCss from '@polymorph/recipes/overlays/popover.module.css?raw'
import sheetCss from '@polymorph/recipes/overlays/sheet.module.css?raw'

/**
 * The sheet presentation (`design/components/README.md`), in a real browser at
 * phone width.
 *
 * Sheet behaviour depends on the viewport, so the states fixtures, rendered at
 * the suite's desktop width, cannot show it. These are browser tests, like
 * those for Dialog's full-screen sheet and the focus-zoom minimum. Crossing the
 * breakpoint is an explicit line of test code (`page.viewport`), never an
 * unstated default.
 *
 * Two claims are tested where they are implemented, not here:
 *
 *  - **Reduced motion appears in place.** The projection is the engine's
 *    (`sheet → fade`, tested in `packages/engine/src/motion/values.test.ts` and
 *    resolved for every binding by `patterns.test.ts`). The harness cannot
 *    emulate `prefers-reduced-motion`, so this file asserts that the panel
 *    uses the `sheet` pattern (`data-motion-pattern`), the binding whose
 *    projection those laws already pin.
 *  - **Safe-area padding.** The harness cannot emulate a notch, so `env()`
 *    resolves to `0`. The computed padding shows the `calc()` parsed and
 *    applied, and the raw-source assertion checks that the `env()` term is
 *    inside it.
 */

beforeAll(installTestTheme)

const NARROW = 420
const WIDE = 1280

afterEach(async () => {
  await page.viewport(WIDE, 800)
})

const sheetPanel = () => document.querySelector('[data-presentation="sheet"]') as HTMLElement | null
const menuList = () => document.querySelector('[role="menu"]') as HTMLElement | null
const menuItems = () =>
  [...document.querySelectorAll('[role="menuitem"], [role="menuitemcheckbox"]')] as HTMLElement[]
const highlighted = () => menuItems().find((item) => item.hasAttribute('data-highlighted'))
const scrim = () => document.querySelector('[data-motion-pattern="fade"]') as HTMLElement | null

/** laws.test.tsx's exceptions, for the same recorded reasons. */
const AXE_OPTIONS: RunOptions = {
  rules: {
    region: { enabled: false },
    'page-has-heading-one': { enabled: false },
    'color-contrast': { enabled: false },
    'aria-hidden-focus': { enabled: false },
  },
}

async function audit(target: Element): Promise<string[]> {
  const results = await axeCore.run(target, AXE_OPTIONS)
  return results.violations.map(
    (violation) => `${violation.id}: ${violation.help} (${violation.nodes.length} node(s))`,
  )
}

const noop = () => {}

const TRIGGER = <Button variant="ghost" tone="neutral" iconOnly icon="overflow" label="Actions" />

const ENTRIES: MenuEntry[] = [
  { label: 'Assign to me', icon: 'user', onSelect: noop },
  { label: 'Snooze', kbd: 'S', onSelect: noop },
  { kind: 'separator' },
  { kind: 'label', label: 'Danger zone' },
  { label: 'Delete', tone: 'danger', onSelect: noop },
]

describe('Menu — the sheet, below 30rem', () => {
  async function openSheet(entries: MenuEntry[] = ENTRIES) {
    await page.viewport(NARROW, 800)
    render(<Menu trigger={TRIGGER} items={entries} />)
    await userEvent.click(screen.getByRole('button', { name: 'Actions' }))
    await vi.waitFor(() => expect(sheetPanel()).not.toBeNull())
    return sheetPanel() as HTMLElement
  }

  it('uses the full sheet presentation: bottom-attached, full-width, top corners, top border, the cap, the pattern', async () => {
    const panel = await openSheet()

    // Bottom-attached and full-width, the phone pattern, not a popper. The
    // test waits, because the panel slides in from the bottom edge and a
    // measurement during the enter would catch it mid-animation.
    await vi.waitFor(() => {
      const box = panel.getBoundingClientRect()
      expect(box.bottom).toBeCloseTo(window.innerHeight, 0)
      expect(box.width).toBeCloseTo(window.innerWidth, 0)
      // As tall as its content, never the whole screen; that form is Dialog's.
      expect(box.height).toBeLessThan(window.innerHeight * 0.66 + 1)
    })

    const style = getComputedStyle(panel)
    expect(style.borderTopLeftRadius).toBe(tokenLength('--pm-radius-lg'))
    expect(style.borderTopRightRadius).toBe(tokenLength('--pm-radius-lg'))
    expect(style.borderBottomLeftRadius).toBe('0px')
    expect(style.borderTopWidth).toBe('1px')
    expect(style.borderBottomWidth).toBe('0px')
    // The 66dvh cap (the vh rule above it serves engines without dvh).
    expect(Number.parseFloat(style.maxBlockSize)).toBeCloseTo(window.innerHeight * 0.66, 0)

    // The sheet presentation's motion: the `sheet` pattern, whose
    // reduced-motion projection the engine laws pin (see the header).
    expect(panel.dataset['motionPattern']).toBe('sheet')
  })

  it('is still a menu: role, rows in order, the danger tone, the hint, the label row', async () => {
    await openSheet()
    const list = menuList() as HTMLElement
    expect(list).not.toBeNull()

    const items = menuItems()
    expect(items.map((item) => item.textContent)).toEqual(['Assign to me', 'SnoozeS', 'Delete'])
    expect(items[2]?.getAttribute('data-tone')).toBe('danger')
    expect(list.querySelector('[role="separator"]')).not.toBeNull()
    expect(list.textContent).toContain('Danger zone')
  })

  it('wires the trigger as the popper lane does, and answers arrows, typeahead and Escape', async () => {
    await openSheet()
    // The trigger is outside the open sheet, which hides the page from assistive software.
    const control = screen.getByRole('button', { name: 'Actions', hidden: true })
    expect(control.getAttribute('aria-haspopup')).toBe('menu')
    expect(control.getAttribute('aria-expanded')).toBe('true')

    // Roving focus: the first row has focus on open (as with Radix's keyboard
    // open), and arrows move the highlight with DOM focus.
    await vi.waitFor(() => expect(highlighted()?.textContent).toBe('Assign to me'))
    expect(document.activeElement).toBe(highlighted())

    await userEvent.keyboard('{ArrowDown}')
    await vi.waitFor(() => expect(highlighted()?.textContent).toBe('SnoozeS'))

    // Typeahead: typing a character jumps by label.
    await userEvent.keyboard('d')
    await vi.waitFor(() => expect(highlighted()?.textContent).toBe('Delete'))

    // Escape closes and focus returns to the trigger control.
    await userEvent.keyboard('{Escape}')
    await vi.waitFor(() => expect(sheetPanel()).toBeNull())
    await vi.waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Actions' })),
    )
  })

  it('dismisses on selection, running the command', async () => {
    const onSelect = vi.fn()
    await openSheet([{ label: 'Assign to me', onSelect }])
    await userEvent.click(menuItems()[0] as HTMLElement)
    expect(onSelect).toHaveBeenCalledOnce()
    await vi.waitFor(() => expect(sheetPanel()).toBeNull())
  })

  it('dismisses on a scrim press', async () => {
    await openSheet()
    await userEvent.click(scrim() as HTMLElement)
    await vi.waitFor(() => expect(sheetPanel()).toBeNull())
  })

  it('stays open across checkbox toggles, announcing and redrawing each one, as the popper does', async () => {
    await page.viewport(NARROW, 800)

    function Filters() {
      const [watching, setWatching] = useState(false)
      return (
        <Menu
          trigger={TRIGGER}
          items={[
            {
              kind: 'checkbox',
              label: 'Watching',
              checked: watching,
              onCheckedChange: setWatching,
            },
            { label: 'Assign to me', onSelect: noop },
          ]}
        />
      )
    }
    render(<Filters />)
    await userEvent.click(screen.getByRole('button', { name: 'Actions' }))
    await vi.waitFor(() => expect(sheetPanel()).not.toBeNull())

    const checkbox = () => document.querySelector('[role="menuitemcheckbox"]') as HTMLElement | null
    expect(checkbox()?.getAttribute('aria-checked')).toBe('false')
    expect(checkbox()?.dataset['state']).toBe('unchecked')

    await userEvent.click(checkbox() as HTMLElement)
    // The sheet stays open, and the row is now checked in attribute and state.
    await vi.waitFor(() => expect(checkbox()?.getAttribute('aria-checked')).toBe('true'))
    expect(checkbox()?.dataset['state']).toBe('checked')
    expect(sheetPanel()).not.toBeNull()
  })

  it('keeps the popper with presentation="popover", at the same width', async () => {
    await page.viewport(NARROW, 800)
    render(<Menu trigger={TRIGGER} items={ENTRIES} presentation="popover" />)
    await userEvent.click(screen.getByRole('button', { name: 'Actions' }))
    await vi.waitFor(() => expect(menuList()).not.toBeNull())

    expect(sheetPanel()).toBeNull()
    // Radix's popper, with its side attribute: the anchored form.
    expect(menuList()?.getAttribute('data-side')).toBeTruthy()
  })

  it('never uses a sheet above 30rem', async () => {
    render(<Menu trigger={TRIGGER} items={ENTRIES} defaultOpen />)
    await vi.waitFor(() => expect(menuList()).not.toBeNull())
    expect(sheetPanel()).toBeNull()
  })

  it('flattens a submenu into the label+group form', async () => {
    await openSheet([
      { label: 'Assign to me', onSelect: noop },
      {
        kind: 'submenu',
        label: 'Move to',
        items: [
          { label: 'Backlog', onSelect: noop },
          { label: 'Done', onSelect: noop },
        ],
      },
    ])
    // The sheet, not the popper: the submenu renders as its label followed by
    // its items inline (as `design/components/menu.md` specifies), so touch
    // users pay no navigation cost.
    const list = menuList() as HTMLElement
    expect(list.textContent).toContain('Move to')
    expect(menuItems().map((item) => item.textContent)).toEqual(['Assign to me', 'Backlog', 'Done'])
    // The label is a heading in the flat list, not a command row.
    expect(menuItems().some((item) => item.textContent === 'Move to')).toBe(false)
  })

  it('reaches a flattened item by arrows and typeahead, and runs it', async () => {
    const onSelect = vi.fn()
    await openSheet([
      { label: 'Assign to me', onSelect: noop },
      {
        kind: 'submenu',
        label: 'Move to',
        items: [
          { label: 'Backlog', onSelect: noop },
          { label: 'Done', onSelect },
        ],
      },
    ])
    await vi.waitFor(() => expect(highlighted()?.textContent).toBe('Assign to me'))

    // Arrows move straight through the flattened group, with no branch to open.
    await userEvent.keyboard('{ArrowDown}')
    await vi.waitFor(() => expect(highlighted()?.textContent).toBe('Backlog'))

    // Typeahead jumps by label across what was the submenu boundary.
    await userEvent.keyboard('d')
    await vi.waitFor(() => expect(highlighted()?.textContent).toBe('Done'))

    await userEvent.keyboard('{Enter}')
    expect(onSelect).toHaveBeenCalledOnce()
    await vi.waitFor(() => expect(sheetPanel()).toBeNull())
  })

  it('shows a disabled submenu’s label but does not render its items', async () => {
    await openSheet([
      { label: 'Assign to me', onSelect: noop },
      {
        kind: 'submenu',
        label: 'Move to',
        disabled: true,
        items: [{ label: 'Backlog', onSelect: noop }],
      },
    ])
    // The popper's semantics carry over (the sheet presentation requires
    // semantics to survive re-anchoring). In the popper a disabled submenu's
    // row is visible and its items are unreachable and never shown. So the
    // label row renders (adaptation never hides what the wide form shows,
    // `docs/layout.md`) and the items stay out of the DOM, as
    // `design/components/menu.md` specifies. The popper announces one disabled
    // group, and rendering n disabled commands would announce more than it does.
    const list = menuList() as HTMLElement
    expect(list.textContent).toContain('Move to')
    expect(menuItems().map((item) => item.textContent)).toEqual(['Assign to me'])
  })

  it('adds the safe-area inset to the member edge padding', async () => {
    await openSheet()
    const list = menuList() as HTMLElement
    // env() resolves to 0 in this harness. The computed value shows the calc
    // parsed and applied; the source line checks the env term inside it.
    expect(getComputedStyle(list).paddingBlockEnd).toBe(tokenLength('--pm-space-2'))
    expect(menuCss).toContain('env(safe-area-inset-bottom, 0px)')
    expect(sheetCss).toContain('max-block-size: 66vh')
    expect(sheetCss).toContain('max-block-size: 66dvh')
  })

  it('passes axe open', async () => {
    await openSheet()
    expect(await audit(document.body)).toEqual([])
  })
})

describe('Popover — the sheet is an opt-in that makes it modal', () => {
  const CONTENT = (
    <>
      <Input aria-label="Assignee" />
      <Button label="Apply" />
    </>
  )

  it('under auto, never uses a sheet: anchored and non-modal at phone width, per its contract', async () => {
    await page.viewport(NARROW, 800)
    render(
      <Popover trigger={<Button label="Filter" />} label="Filter tickets" defaultOpen>
        {CONTENT}
      </Popover>,
    )
    await vi.waitFor(() =>
      expect(document.querySelector('[data-state="open"][data-side]')).not.toBeNull(),
    )
    expect(sheetPanel()).toBeNull()
    expect(scrim()).toBeNull()
  })

  it('under sheet below 30rem, becomes a modal sheet: scrim, containment, a named dialog', async () => {
    await page.viewport(NARROW, 800)
    render(
      <Popover
        trigger={<Button label="Filter" />}
        label="Filter tickets"
        presentation="sheet"
        defaultOpen
      >
        {CONTENT}
      </Popover>,
    )
    await vi.waitFor(() => expect(sheetPanel()).not.toBeNull())

    const panel = sheetPanel() as HTMLElement
    expect(panel.getAttribute('role')).toBe('dialog')
    expect(panel.getAttribute('aria-modal')).toBe('true')
    expect(panel.getAttribute('aria-label')).toBe('Filter tickets')
    expect(scrim()).not.toBeNull()

    // The sheet presentation's anatomy on the same shared box, checked after
    // the slide-in.
    await vi.waitFor(() => {
      const box = panel.getBoundingClientRect()
      expect(box.bottom).toBeCloseTo(window.innerHeight, 0)
      expect(box.width).toBeCloseTo(window.innerWidth, 0)
    })

    // Containment: the tab loop stays inside the panel, so it is really modal.
    await vi.waitFor(() => expect(panel.contains(document.activeElement)).toBe(true))
    for (let step = 0; step < 4; step += 1) {
      await userEvent.keyboard('{Tab}')
      expect(panel.contains(document.activeElement), 'focus escaped the sheet').toBe(true)
    }

    // Its own edge padding includes the safe-area padding.
    const body = panel.firstElementChild as HTMLElement
    expect(getComputedStyle(body).paddingBlockEnd).toBe(tokenLength('--pm-space-5'))
    expect(popoverCss).toContain('env(safe-area-inset-bottom, 0px)')

    expect(await audit(document.body)).toEqual([])
  })

  it('dismisses on Escape and on the scrim, returning focus to the trigger', async () => {
    await page.viewport(NARROW, 800)
    render(
      <Popover trigger={<Button label="Filter" />} label="Filter tickets" presentation="sheet">
        {CONTENT}
      </Popover>,
    )
    const trigger = screen.getByRole('button', { name: 'Filter' })
    trigger.focus()
    await userEvent.keyboard('{Enter}')
    await vi.waitFor(() => expect(sheetPanel()).not.toBeNull())

    await userEvent.keyboard('{Escape}')
    await vi.waitFor(() => expect(sheetPanel()).toBeNull())
    await vi.waitFor(() => expect(document.activeElement).toBe(trigger))

    await userEvent.click(trigger)
    await vi.waitFor(() => expect(sheetPanel()).not.toBeNull())
    await userEvent.click(scrim() as HTMLElement)
    await vi.waitFor(() => expect(sheetPanel()).toBeNull())
  })

  it('leaves the sheet open when Escape closes a Tooltip inside it', async () => {
    await page.viewport(NARROW, 800)
    render(
      <TooltipProvider>
        <Popover trigger={<Button label="Filter" />} label="Filter tickets" presentation="sheet">
          <Input aria-label="Assignee" />
          <Tooltip content="Assign the ticket to yourself">
            <Button label="Me" />
          </Tooltip>
        </Popover>
      </TooltipProvider>,
    )
    screen.getByRole('button', { name: 'Filter' }).focus()
    await userEvent.keyboard('{Enter}')
    await vi.waitFor(() => expect(sheetPanel()?.contains(document.activeElement)).toBe(true))
    // Focus is put on the control, because WebKit's Tab passes over buttons.
    screen.getByRole('button', { name: 'Me', hidden: true }).focus()
    await vi.waitFor(() => expect(document.querySelector('[role="tooltip"]')).not.toBeNull())

    await userEvent.keyboard('{Escape}')
    await vi.waitFor(() => expect(document.querySelector('[role="tooltip"]')).toBeNull())
    await new Promise((settle) => setTimeout(settle, 300))
    expect(sheetPanel(), 'the Escape that closed the Tooltip closed the sheet').not.toBeNull()

    await userEvent.keyboard('{Escape}')
    await vi.waitFor(() => expect(sheetPanel()).toBeNull())
  })

  it('under sheet above 30rem, changes nothing: anchored, non-modal, no attribute', async () => {
    render(
      <Popover
        trigger={<Button label="Filter" />}
        label="Filter tickets"
        presentation="sheet"
        defaultOpen
      >
        {CONTENT}
      </Popover>,
    )
    await vi.waitFor(() =>
      expect(document.querySelector('[data-state="open"][data-side]')).not.toBeNull(),
    )
    expect(sheetPanel()).toBeNull()
    expect(scrim()).toBeNull()
  })
})

/**
 * The identity law (`data-member`) on the lane the fixtures cannot reach.
 *
 * `laws.test.tsx` requires one rendered fixture entry per member to carry
 * `[data-member="<slug>"]`, and the galleries render at the suite's desktop
 * width. So for every member with a sheet, the popper lane's attribute
 * satisfies the law, and the law never checks the phone lane. Members whose
 * sheet is their own markup set it anyway: Select marks its `sheetList`, and
 * Combobox, MultiSelect, Popover and the date pickers mark the body they own
 * inside the shared panel. The three that share `sheet-menu.tsx` must do the
 * same. Their surface is styled entirely with the member's own classes, and
 * without a name on it an exception written for `menu` would reach the popper
 * panel but stop at `30rem`.
 *
 * Where the name goes matters, and Popover sets the rule. The panel is
 * `sheet.tsx`'s box, shared by every member with a sheet, and putting a
 * member's name on it would tell the exceptions system that the member owns a
 * surface it only borrows. The name goes on the one element inside it that the
 * member owns and styles: the `<ul role="menu">` with that member's
 * `sheetList` class. Select's sheet lane puts it in the same place.
 */
describe('the sheet lane carries the member’s own name', () => {
  /** Inside the shared panel, never on it, because the shared box carries no member's name. */
  const named = (slug: string) => sheetPanel()?.querySelector(`[data-member="${slug}"]`) ?? null

  it('Menu — the sheet opened from its trigger', async () => {
    await page.viewport(NARROW, 800)
    render(<Menu trigger={TRIGGER} items={ENTRIES} />)
    await userEvent.click(screen.getByRole('button', { name: 'Actions' }))
    await vi.waitFor(() => expect(sheetPanel()).not.toBeNull())

    expect(named('menu')).toBe(menuList())
  })

  it('ContextMenu — the sheet opened by the gesture', async () => {
    await page.viewport(NARROW, 800)
    render(
      <ContextMenu entries={ENTRIES}>
        <div>The ticket surface</div>
      </ContextMenu>,
    )
    await userEvent.click(screen.getByText('The ticket surface'), { button: 'right' })
    await vi.waitFor(() => expect(sheetPanel()).not.toBeNull())

    expect(named('context-menu')).toBe(menuList())
  })

  it('SplitButton — the sheet behind its chevron', async () => {
    await page.viewport(NARROW, 800)
    render(<SplitButton label="Resolve" entries={ENTRIES} menuLabel="More resolve options" />)
    await userEvent.click(screen.getByRole('button', { name: 'More resolve options' }))
    await vi.waitFor(() => expect(sheetPanel()).not.toBeNull())

    expect(named('split-button')).toBe(menuList())
  })

  it('leaves the shared panel unnamed, because it is `sheet.tsx`’s box, not the member’s', async () => {
    await page.viewport(NARROW, 800)
    render(<Menu trigger={TRIGGER} items={ENTRIES} />)
    await userEvent.click(screen.getByRole('button', { name: 'Actions' }))
    await vi.waitFor(() => expect(sheetPanel()).not.toBeNull())

    expect(sheetPanel()?.hasAttribute('data-member')).toBe(false)
  })
})

/**
 * A sheet opened from inside a Dialog is portalled out of it, to the end of
 * the body. It is a layer and a focus scope of its own, so the Dialog's trap
 * does not pull focus out of it, Escape closes the sheet and not the Dialog,
 * and a press on its scrim is not a press outside the Dialog.
 */
describe('a sheet inside a Dialog', () => {
  const dialogPanel = () => document.querySelector<HTMLElement>('[data-member="dialog"]')
  const selectSheet = () => document.querySelector<HTMLElement>('[role="listbox"]')
  // The Dialog draws a scrim too; the sheet's is portalled after it.
  const sheetScrim = () =>
    [...document.querySelectorAll<HTMLElement>('[data-motion-pattern="fade"]')].at(-1) ?? null

  const OPTIONS = [
    { value: 'billing', label: 'Billing' },
    { value: 'onboarding', label: 'Onboarding' },
  ]

  async function openInDialog(content: ReactNode, trigger: () => HTMLElement) {
    await page.viewport(NARROW, 800)
    render(
      <Dialog defaultOpen title="Edit ticket">
        {content}
      </Dialog>,
    )
    await vi.waitFor(() => expect(dialogPanel()).not.toBeNull())
    const control = trigger()
    control.focus()
    await userEvent.keyboard('{Enter}')
    await vi.waitFor(() => expect(sheetPanel()).not.toBeNull())
    return control
  }

  it('keeps focus in a Menu’s sheet, and Escape closes only the sheet', async () => {
    const trigger = await openInDialog(
      <Menu
        trigger={<Button label="More" />}
        items={[
          { label: 'Archive', onSelect: () => undefined },
          { label: 'Delete', onSelect: () => undefined },
        ]}
      />,
      () => screen.getByRole('button', { name: 'More' }),
    )
    await vi.waitFor(() => expect(sheetPanel()?.contains(document.activeElement)).toBe(true))
    await userEvent.keyboard('{ArrowDown}')
    expect(document.activeElement?.textContent).toContain('Delete')

    await userEvent.keyboard('{Escape}')
    await vi.waitFor(() => expect(menuList()).toBeNull())
    expect(dialogPanel(), 'Escape closed the Dialog beneath the sheet').not.toBeNull()
    await vi.waitFor(() => expect(document.activeElement).toBe(trigger))
  })

  it('keeps focus in a Select’s sheet, and Escape closes only the sheet', async () => {
    const trigger = await openInDialog(<Select aria-label="Queue" options={OPTIONS} />, () =>
      screen.getByRole('combobox', { name: 'Queue' }),
    )
    await vi.waitFor(() => expect(selectSheet()?.contains(document.activeElement)).toBe(true))
    await userEvent.keyboard('{Escape}')
    await vi.waitFor(() => expect(selectSheet()).toBeNull())
    expect(dialogPanel(), 'Escape closed the Dialog beneath the sheet').not.toBeNull()
    await vi.waitFor(() => expect(document.activeElement).toBe(trigger))
  })

  it('closes the sheet and not the Dialog on a press on its scrim', async () => {
    await openInDialog(<Select aria-label="Queue" options={OPTIONS} />, () =>
      screen.getByRole('combobox', { name: 'Queue' }),
    )
    const cover = await vi.waitFor(() => {
      const element = sheetScrim()
      expect(element?.dataset['state']).toBe('open')
      return element as HTMLElement
    })
    // The scrim's top edge, which the panel at the bottom does not cover.
    const box = cover.getBoundingClientRect()
    await userEvent.click(cover, { position: { x: box.width / 2, y: 8 } })
    await vi.waitFor(() => expect(selectSheet()).toBeNull())
    expect(dialogPanel(), 'the press on the scrim closed the Dialog').not.toBeNull()
  })

  it('hides the rest of the page from assistive software while it is open', async () => {
    await openInDialog(<Select aria-label="Queue" options={OPTIONS} />, () =>
      screen.getByRole('combobox', { name: 'Queue' }),
    )
    const outside = () =>
      [...document.body.children].filter(
        (element) =>
          !element.contains(sheetPanel()) &&
          !element.contains(sheetScrim()) &&
          !element.matches('script, style, template, link'),
      )
    await vi.waitFor(() => {
      expect(outside().length).toBeGreaterThan(0)
      for (const element of outside()) expect(element.getAttribute('aria-hidden')).toBe('true')
    })
    const dialogHost = [...document.body.children].find((element) =>
      element.contains(dialogPanel()),
    )
    await userEvent.keyboard('{Escape}')
    await vi.waitFor(() => expect(selectSheet()).toBeNull())
    await vi.waitFor(() => expect(dialogHost?.getAttribute('aria-hidden')).toBeNull())
  })
})
