import { render } from '@testing-library/react'
import { page, userEvent } from 'vitest/browser'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { TAB_PASSES_BUTTONS } from '@polymorph/conformance/engines'
import { assertGoverned } from '@polymorph/react'
import { createAgentBridge } from '@polymorph/engine/agent'
import { installTestTheme } from '@polymorph/engine/testing'
import type { MenuEntry } from '../overlays/Menu'
import { Button } from './Button'
import { SplitButton, type SplitButtonAppearance, type SplitButtonProps } from './SplitButton'

/**
 * SplitButton, in a real browser.
 *
 * This member adds no new styles of its own: the halves compose Button's styles, and the
 * panel uses Menu's implementation. This file tests what only the group can show: the
 * seam's geometry, the two adjacent tab stops, and one loading state disabling both
 * halves at once.
 */

const noop = () => {}

const ENTRIES: MenuEntry[] = [
  { label: 'Resolve and notify', onSelect: noop },
  { label: 'Resolve as duplicate', onSelect: noop },
]

beforeAll(installTestTheme)

function mount(node: React.ReactElement): HTMLElement {
  return render(node).container.firstElementChild as HTMLElement
}

const primary = (group: HTMLElement) => group.querySelector('button') as HTMLButtonElement
const chevron = (group: HTMLElement) =>
  group.querySelector('button[aria-haspopup]') as HTMLButtonElement
const panel = () => document.querySelector('[role="menu"]') as HTMLElement | null

describe('the closed surface', () => {
  it('has no style escape hatch', () => {
    assertGoverned<SplitButtonProps>(true)
  })

  it('rejects ghost and danger at the type level', () => {
    // @ts-expect-error — no ghost, because a split needs a visible seam.
    const ghost: SplitButtonAppearance = { variant: 'ghost' }
    // @ts-expect-error — no danger, because destructive actions go through ConfirmDialog.
    const danger: SplitButtonAppearance = { tone: 'danger' }
    // @ts-expect-error — Button's law: no neutral filled variant.
    const filledNeutral: SplitButtonAppearance = { variant: 'solid', tone: 'neutral' }
    expect([ghost, danger, filledNeutral]).toBeTruthy()
  })
})

/**
 * Each half composes Button's recipe, so these tests compare computed styles, as
 * Combobox does against Input.
 */
describe('the halves resolve to Button', () => {
  const skin = (element: Element) => {
    const style = getComputedStyle(element)
    return {
      height: style.height,
      background: style.backgroundColor,
      color: style.color,
      fontSize: style.fontSize,
      shadow: style.boxShadow,
    }
  }

  for (const [variant, tone] of [
    ['solid', 'accent'],
    ['soft', 'accent'],
    ['outline', 'neutral'],
  ] as const) {
    it(`matches at ${variant}/${tone}`, () => {
      const group = mount(
        <SplitButton
          variant={variant as 'outline'}
          tone={tone as 'neutral'}
          label="Resolve"
          entries={ENTRIES}
          menuLabel="More resolve options"
        />,
      )
      const reference = mount(
        <Button variant={variant as 'outline'} tone={tone as 'neutral'} label="Resolve" />,
      )
      expect(skin(primary(group))).toEqual(skin(reference))
    })
  }

  it('squares the chevron at the control height', () => {
    const group = mount(
      <SplitButton label="Resolve" entries={ENTRIES} menuLabel="More resolve options" />,
    )
    const box = chevron(group).getBoundingClientRect()
    // Button's icon-only style sets width equal to the control height. This half has no
    // 1px inner border, because the seam replaces it.
    expect(Math.abs(box.width + 1 - box.height)).toBeLessThanOrEqual(1)
  })
})

describe('the seam', () => {
  it('is one pixel, full height, and visual only', () => {
    const group = mount(
      <SplitButton label="Resolve" entries={ENTRIES} menuLabel="More resolve options" />,
    )
    const seam = group.querySelector('[aria-hidden]') as HTMLElement
    const box = seam.getBoundingClientRect()

    expect(box.width).toBe(1)
    expect(box.height).toBe(group.getBoundingClientRect().height)
    expect(getComputedStyle(seam).pointerEvents).toBe('none')
  })
})

describe('the two halves', () => {
  it('the primary fires without opening anything', async () => {
    const onClick = vi.fn()
    const group = mount(
      <SplitButton
        onClick={onClick}
        label="Resolve"
        entries={ENTRIES}
        menuLabel="More resolve options"
      />,
    )
    await userEvent.click(primary(group))
    expect(onClick).toHaveBeenCalledOnce()
    expect(panel()).toBeNull()
  })

  it('the chevron opens the variants, and Escape returns focus to it', async () => {
    const group = mount(
      <SplitButton label="Resolve" entries={ENTRIES} menuLabel="More resolve options" />,
    )
    await userEvent.click(chevron(group))
    await vi.waitFor(() => expect(panel()).not.toBeNull())

    const items = [...(panel() as HTMLElement).querySelectorAll('[role="menuitem"]')]
    expect(items.map((item) => item.textContent)).toEqual([
      'Resolve and notify',
      'Resolve as duplicate',
    ])

    await userEvent.keyboard('{Escape}')
    await vi.waitFor(() => expect(panel()).toBeNull())
    // Radix returns focus one task after the panel closes. Its focus scope restores from
    // a `setTimeout(0)` in the unmount cleanup, and the panel traps focus while open, so
    // the component cannot return it earlier. The test waits, as the sheet test and
    // every overlay test do. Read in the same tick under a loaded runner, focus is
    // sometimes still on the body, and reaches the chevron one task later.
    await vi.waitFor(() => expect(document.activeElement).toBe(chevron(group)))
  })

  it.skipIf(TAB_PASSES_BUTTONS)(
    'is two adjacent tab stops, the default before its variants',
    async () => {
      const group = mount(
        <SplitButton label="Resolve" entries={ENTRIES} menuLabel="More resolve options" />,
      )
      primary(group).focus()
      await userEvent.keyboard('{Tab}')
      expect(document.activeElement).toBe(chevron(group))
    },
  )
})

describe('loading, which applies to the whole group', () => {
  it('disconnects the primary, disables the chevron, and keeps the width', () => {
    const onClick = vi.fn()
    const resting = mount(
      <SplitButton
        icon="confirm"
        onClick={onClick}
        label="Resolve"
        entries={ENTRIES}
        menuLabel="More resolve options"
      />,
    )
    const restingWidth = resting.getBoundingClientRect().width

    const loading = mount(
      <SplitButton
        loading
        icon="confirm"
        onClick={onClick}
        label="Resolve"
        entries={ENTRIES}
        menuLabel="More resolve options"
      />,
    )

    expect(primary(loading).getAttribute('data-state')).toBe('loading')
    expect(primary(loading).getAttribute('aria-busy')).toBe('true')
    expect(chevron(loading).disabled).toBe(true)
    expect(loading.getBoundingClientRect().width).toBe(restingWidth)

    primary(loading).focus()
    primary(loading).click()
    expect(onClick).not.toHaveBeenCalled()
  })

  it('disables both halves together', () => {
    const group = mount(
      <SplitButton disabled label="Resolve" entries={ENTRIES} menuLabel="More resolve options" />,
    )
    expect(primary(group).disabled).toBe(true)
    expect(chevron(group).disabled).toBe(true)
  })
})

/**
 * The sheet below 30rem (the same as Menu's; the conventions' sheet presentation).
 * The chevron opens the shared sheet instead of the anchored panel. The control group
 * itself does not change, because the halves are Buttons, and Buttons have no
 * phone-specific form.
 */
describe('the sheet, below 30rem', () => {
  const sheetPanel = () =>
    document.querySelector('[data-presentation="sheet"]') as HTMLElement | null

  afterEach(async () => {
    await page.viewport(1280, 800)
  })

  it('opens the entries as a sheet from the chevron, and only the panel changes shape', async () => {
    await page.viewport(420, 800)
    const group = mount(
      <SplitButton label="Resolve" entries={ENTRIES} menuLabel="More resolve options" />,
    )

    await userEvent.click(chevron(group))
    await vi.waitFor(() => expect(sheetPanel()).not.toBeNull())
    expect(chevron(group).getAttribute('data-state')).toBe('open')
    expect(chevron(group).getAttribute('aria-expanded')).toBe('true')

    // Menu's rows, inside the sheet's menu.
    const opened = panel() as HTMLElement
    expect(sheetPanel()?.contains(opened)).toBe(true)
    const items = [...opened.querySelectorAll('[role="menuitem"]')]
    expect(items.map((item) => item.textContent)).toEqual([
      'Resolve and notify',
      'Resolve as duplicate',
    ])

    // The group is unchanged: still one seam and two halves.
    expect(group.getBoundingClientRect().height).toBeGreaterThan(0)
  })

  it('shows entries with a submenu in the sheet too, flattened', async () => {
    await page.viewport(420, 800)
    const group = mount(
      <SplitButton
        label="Resolve"
        entries={[
          { label: 'Resolve and notify', onSelect: noop },
          { kind: 'submenu', label: 'Move to', items: [{ label: 'Backlog', onSelect: noop }] },
        ]}
        menuLabel="More resolve options"
      />,
    )

    await userEvent.click(chevron(group))
    await vi.waitFor(() => expect(sheetPanel()).not.toBeNull())

    // The submenu appears as its label followed by its items inline (menu.md).
    // `sheet-menu.tsx` does the flattening. This test only checks that this member
    // passes all entries through.
    const opened = panel() as HTMLElement
    expect(opened.textContent).toContain('Move to')
    const items = [...opened.querySelectorAll('[role="menuitem"]')]
    expect(items.map((item) => item.textContent)).toEqual(['Resolve and notify', 'Backlog'])
  })

  it('selection runs the command and dismisses; Escape returns focus to the chevron', async () => {
    await page.viewport(420, 800)
    const onSelect = vi.fn()
    const group = mount(
      <SplitButton
        label="Resolve"
        entries={[{ label: 'Resolve and notify', onSelect }]}
        menuLabel="More resolve options"
      />,
    )

    await userEvent.click(chevron(group))
    await vi.waitFor(() => expect(sheetPanel()).not.toBeNull())
    await userEvent.keyboard('{Escape}')
    await vi.waitFor(() => expect(sheetPanel()).toBeNull())
    await vi.waitFor(() => expect(document.activeElement).toBe(chevron(group)))

    await userEvent.click(chevron(group))
    await vi.waitFor(() => expect(sheetPanel()).not.toBeNull())
    await userEvent.click(document.querySelector('[role="menuitem"]') as HTMLElement)
    expect(onSelect).toHaveBeenCalledOnce()
    await vi.waitFor(() => expect(sheetPanel()).toBeNull())
  })

  it('pins the anchored panel under presentation="popover"', async () => {
    await page.viewport(420, 800)
    const group = mount(
      <SplitButton
        label="Resolve"
        entries={ENTRIES}
        menuLabel="More resolve options"
        presentation="popover"
      />,
    )
    await userEvent.click(chevron(group))
    await vi.waitFor(() => expect(panel()).not.toBeNull())
    expect(sheetPanel()).toBeNull()
    expect(panel()?.getAttribute('data-side')).toBeTruthy()
  })
})

describe('an agent', () => {
  /**
   * The bridge waits for the member to render, and React holds every update
   * inside a test's `act` scope until the scope ends. An agent's steps run on
   * a page, outside one.
   */
  async function asAgent<T>(run: () => Promise<T>): Promise<T> {
    const scope = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    const was = scope.IS_REACT_ACT_ENVIRONMENT
    scope.IS_REACT_ACT_ENVIRONMENT = false
    try {
      return await run()
    } finally {
      scope.IS_REACT_ACT_ENVIRONMENT = was
    }
  }

  it('sees one member, presses the primary and chooses a variant without opening', async () => {
    const bridge = createAgentBridge()
    try {
      const onClick = vi.fn()
      const notify = vi.fn()
      const onCheckedChange = vi.fn()
      render(
        <SplitButton
          label="Resolve"
          onClick={onClick}
          entries={[
            { label: 'Resolve and notify', onSelect: notify },
            { kind: 'checkbox', label: 'Close the thread', checked: false, onCheckedChange },
          ]}
          menuLabel="More resolve options"
        />,
      )
      const [member] = bridge.snapshot().members
      expect(bridge.snapshot().members).toHaveLength(1)
      expect(member).toMatchObject({
        member: 'SplitButton',
        name: 'Resolve',
        state: {
          disabled: false,
          loading: false,
          open: false,
          entries: [
            { id: 'Resolve and notify', label: 'Resolve and notify' },
            { id: 'Close the thread', label: 'Close the thread' },
          ],
        },
      })

      const { results } = await asAgent(() =>
        bridge.act([
          { id: member?.id, action: 'press' },
          { id: member?.id, action: 'choose', value: 'Resolve and notify' },
          { id: member?.id, action: 'choose', value: 'Close the thread' },
        ]),
      )
      expect(results.map((result) => result.ok)).toEqual([true, true, true])
      expect(onClick).toHaveBeenCalledOnce()
      expect(notify).toHaveBeenCalledOnce()
      expect(onCheckedChange).toHaveBeenCalledWith(true)
      expect(panel()).toBeNull()
    } finally {
      bridge.dispose()
    }
  })

  it('refuses a variant and the menu while its command runs', async () => {
    const bridge = createAgentBridge()
    try {
      const notify = vi.fn()
      render(
        <SplitButton
          label="Resolve"
          loading
          entries={[{ label: 'Resolve and notify', onSelect: notify }]}
          menuLabel="More resolve options"
        />,
      )
      const [member] = bridge.snapshot().members
      expect(member?.state['loading']).toBe(true)
      for (const step of [
        { id: member?.id, action: 'choose', value: 'Resolve and notify' },
        { id: member?.id, action: 'open' },
      ]) {
        const { results } = await asAgent(() => bridge.act([step]))
        expect(results[0]).toEqual({
          ok: false,
          id: member?.id,
          error: { code: 'failed', message: expect.stringContaining('running') },
        })
      }
      expect(notify).not.toHaveBeenCalled()
      expect(panel()).toBeNull()
    } finally {
      bridge.dispose()
    }
  })
})
