import { page, userEvent } from 'vitest/browser'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { TAB_PASSES_BUTTONS } from '@polymorph/conformance/engines'
import { installTestTheme } from '@polymorph/engine/testing'
import sheet from '@polymorph/recipes/overlays/sheet.module.css'

import Button from '../controls/Button'
import Select from '../controls/Select'
import { mount } from '../mount'
import Dialog from './Dialog'
import Menu, { type MenuEntry } from './Menu'
import Popover from './Popover'

/**
 * The sheet presentation in the Solid shell (`design/components/README.md`):
 * below `30rem`, Select and Menu under `'auto'` and Popover under `'sheet'`
 * draw their list or panel in the shared bottom sheet, with a scrim, as the
 * React members do. The conformance law runs at a desktop width, so the sheet
 * forms are tested here, by crossing the threshold explicitly.
 */

beforeAll(installTestTheme)

const NARROW = 420
const WIDE = 1280

afterEach(async () => {
  await page.viewport(WIDE, 800)
})

const PRIORITIES = [
  { value: 'urgent', label: 'Urgent' },
  { value: 'high', label: 'High' },
  { value: 'normal', label: 'Normal' },
]

const sheetPanel = () => document.querySelector<HTMLElement>('[data-presentation="sheet"]')
const scrim = () => document.querySelector<HTMLElement>(`.${sheet.scrim}`)

describe('Select under `auto`', () => {
  it('lists its options in a bottom sheet below the threshold', async () => {
    await page.viewport(NARROW, 800)
    await mount(() => <Select defaultOpen={true} options={PRIORITIES} aria-label="Priority" />)
    await vi.waitFor(() => expect(sheetPanel()).not.toBeNull())
    const list = sheetPanel()?.querySelector('[data-member="select"]')
    expect(list?.getAttribute('role')).toBe('listbox')
    expect(list?.querySelectorAll('[role="option"]')).toHaveLength(3)
    expect(scrim()).not.toBeNull()
    // Pinned to the bottom edge, the full width of the window.
    const box = (sheetPanel() as HTMLElement).getBoundingClientRect()
    expect(box.width).toBeCloseTo(window.innerWidth, 0)
    expect(box.bottom).toBeCloseTo(window.innerHeight, 0)
  })

  it('closes on a choice and reports it', async () => {
    await page.viewport(NARROW, 800)
    const change = vi.fn()
    await mount(() => (
      <Select defaultOpen={true} options={PRIORITIES} aria-label="Priority" onChange={change} />
    ))
    await vi.waitFor(() => expect(sheetPanel()).not.toBeNull())
    const high = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find((option) =>
      option.textContent?.includes('High'),
    )
    await userEvent.click(high as HTMLElement)
    expect(change).toHaveBeenCalledWith('high')
    await vi.waitFor(() => expect(sheetPanel()).toBeNull())
  })

  it('closes on Escape and on a press on the scrim', async () => {
    await page.viewport(NARROW, 800)
    const { unmount } = await mount(() => (
      <Select defaultOpen={true} options={PRIORITIES} aria-label="Priority" />
    ))
    await vi.waitFor(() => expect(sheetPanel()).not.toBeNull())
    await userEvent.keyboard('{Escape}')
    await vi.waitFor(() => expect(sheetPanel()).toBeNull())
    unmount()

    await mount(() => <Select defaultOpen={true} options={PRIORITIES} aria-label="Priority" />)
    await vi.waitFor(() => expect(scrim()).not.toBeNull())
    await new Promise((settle) => setTimeout(settle, 120))
    await userEvent.click(scrim() as HTMLElement, { position: { x: 10, y: 10 } })
    await vi.waitFor(() => expect(sheetPanel()).toBeNull())
  })

  it('keeps the anchored panel above the threshold, and under `popover`', async () => {
    const { unmount } = await mount(() => (
      <Select defaultOpen={true} options={PRIORITIES} aria-label="Priority" />
    ))
    await vi.waitFor(() =>
      expect(document.querySelector('[data-member="select"][role="listbox"]')).not.toBeNull(),
    )
    expect(sheetPanel()).toBeNull()
    unmount()

    await page.viewport(NARROW, 800)
    await mount(() => (
      <Select
        defaultOpen={true}
        presentation="popover"
        options={PRIORITIES}
        aria-label="Priority"
      />
    ))
    await vi.waitFor(() =>
      expect(document.querySelector('[data-member="select"][role="listbox"]')).not.toBeNull(),
    )
    expect(sheetPanel()).toBeNull()
  })
})

describe('Menu under `auto`', () => {
  const noop = () => {}

  it('flattens its submenus into the sheet, and leaves a disabled one its label alone', async () => {
    await page.viewport(NARROW, 800)
    const billing = vi.fn()
    const items: MenuEntry[] = [
      { label: 'Assign to me', onSelect: noop },
      {
        kind: 'submenu',
        label: 'Move to',
        items: [
          { label: 'Billing', onSelect: billing },
          { label: 'Onboarding', onSelect: noop },
        ],
      },
      {
        kind: 'submenu',
        label: 'Snooze until',
        disabled: true,
        items: [{ label: 'Tomorrow', onSelect: noop }],
      },
    ]
    await mount(() => (
      <Menu defaultOpen={true} items={items} trigger={<Button label="Actions" />} />
    ))
    await vi.waitFor(() => expect(sheetPanel()).not.toBeNull())
    const list = sheetPanel()?.querySelector('[data-member="menu"]') as HTMLElement
    expect(list.getAttribute('role')).toBe('menu')
    const rows = [...list.querySelectorAll('[role^="menuitem"]')].map((row) => row.textContent)
    expect(rows).toEqual(['Assign to me', 'Billing', 'Onboarding'])
    expect(list.textContent).toContain('Move to')
    expect(list.textContent).toContain('Snooze until')
    expect(list.textContent).not.toContain('Tomorrow')

    const row = [...list.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(
      (candidate) => candidate.textContent === 'Billing',
    )
    await userEvent.click(row as HTMLElement)
    expect(billing).toHaveBeenCalledTimes(1)
    await vi.waitFor(() => expect(sheetPanel()).toBeNull())
  })
})

describe('Popover under `sheet`', () => {
  const body = () => (
    <>
      <Button label="Apply" />
      <Button label="Reset" />
    </>
  )

  it.skipIf(TAB_PASSES_BUTTONS)(
    'is a modal sheet below the threshold, which holds focus',
    async () => {
      await page.viewport(NARROW, 800)
      await mount(() => <Button label="Outside" />)
      await mount(() => (
        <Popover
          defaultOpen={true}
          presentation="sheet"
          label="Filter configuration"
          trigger={<Button label="Configure" />}
        >
          {body()}
        </Popover>
      ))
      await vi.waitFor(() => expect(sheetPanel()).not.toBeNull())
      const panel = sheetPanel() as HTMLElement
      expect(panel.getAttribute('role')).toBe('dialog')
      expect(panel.getAttribute('aria-modal')).toBe('true')
      expect(panel.getAttribute('aria-label')).toBe('Filter configuration')
      expect(panel.querySelector('[data-member="popover"]')).not.toBeNull()
      await vi.waitFor(() => expect(panel.contains(document.activeElement)).toBe(true))
      for (let step = 0; step < 4; step += 1) {
        await userEvent.keyboard('{Tab}')
        expect(panel.contains(document.activeElement), 'focus escaped the sheet').toBe(true)
      }
      await userEvent.keyboard('{Escape}')
      await vi.waitFor(() => expect(sheetPanel()).toBeNull())
    },
  )

  it('stays anchored under `auto` at every width', async () => {
    await page.viewport(NARROW, 800)
    await mount(() => (
      <Popover
        defaultOpen={true}
        label="Filter configuration"
        trigger={<Button label="Configure" />}
      >
        {body()}
      </Popover>
    ))
    await vi.waitFor(() => expect(document.querySelector('[data-member="popover"]')).not.toBeNull())
    expect(sheetPanel()).toBeNull()
  })
})

describe('Dialog under `sheet`', () => {
  it('plays the sheet binding below the threshold and its own above it', async () => {
    const dialog = () => (
      <Dialog
        defaultOpen={true}
        presentation="sheet"
        title="Snooze until"
        trigger={<Button label="Open" />}
      >
        <p>body</p>
      </Dialog>
    )
    const panel = () => document.querySelector<HTMLElement>('[data-member="dialog"]')

    const { unmount } = await mount(dialog)
    await vi.waitFor(() => expect(panel()?.getAttribute('data-motion-pattern')).toBe('scale-fade'))
    unmount()

    await page.viewport(NARROW, 800)
    await mount(dialog)
    await vi.waitFor(() => expect(panel()?.getAttribute('data-presentation')).toBe('sheet'))
    await vi.waitFor(() => expect(panel()?.getAttribute('data-motion-pattern')).toBe('sheet'))
  })
})
