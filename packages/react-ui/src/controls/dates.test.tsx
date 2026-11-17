import { CalendarDate, CalendarDateTime, getLocalTimeZone, today } from '@internationalized/date'
import { render } from '@testing-library/react'
import axeCore, { type RunOptions } from 'axe-core'
import { useState } from 'react'
import { page, userEvent } from 'vitest/browser'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { createAgentBridge } from '@polymorph/engine/agent'

import { assertGoverned } from '@polymorph/react'
import { agentRegistrations, installTestTheme } from '@polymorph/engine/testing'
import { Calendar, type CalendarProps } from './Calendar'
import { DatePicker, type DatePickerProps } from './DatePicker'
import { Input } from './Input'
import { tokenColor } from './token-probe'

/**
 * Calendar and DatePicker, in a real browser.
 *
 * They are tested together because they are two halves of one component. A keyboard user types
 * into the field, and a pointer user opens the grid. The focus hand-off between them, the only one
 * allowed in the vocabulary (`design/components/README-substrates.md`), can only be observed with
 * real focus.
 */

const JULY = new CalendarDate(2026, 7, 15)
const NOW = today(getLocalTimeZone())

beforeAll(installTestTheme)

function mount(node: React.ReactElement): HTMLElement {
  return render(node).container.firstElementChild as HTMLElement
}

const days = (root: ParentNode = document) =>
  [...root.querySelectorAll('[role="button"]')].filter(
    (node) => node.getAttribute('data-selected') !== null || node.textContent?.match(/^\d+$/),
  ) as HTMLElement[]

const dayNamed = (root: ParentNode, label: string) =>
  days(root).find((day) => day.textContent === label) as HTMLElement

const byLabel = (label: string) =>
  document.querySelector(`[aria-label="${label}"]`) as HTMLElement | null

/** The keys that activate a native button, in user-event's syntax. */
const ACTIVATION_KEYS = [
  ['Enter', '{Enter}'],
  ['Space', ' '],
] as const

/** The popover panel, located as the conformance law locates it (`@polymorph/conformance`'s `parts.ts`). */
const popoverPanel = () =>
  document.querySelector('[data-member="date-picker"][role="dialog"]') as HTMLElement | null

/* Fixtures for the sheet (the conventions' sheet presentation). The viewport resets after every
   test, because a test that crosses the breakpoint sets the width itself (sheet.test.tsx). */
const NARROW = 420
const WIDE = 1280

afterEach(async () => {
  await page.viewport(WIDE, 800)
})

const sheetPanel = () => document.querySelector('[data-presentation="sheet"]') as HTMLElement | null
const scrim = () => document.querySelector('[data-motion-pattern="fade"]') as HTMLElement | null

/** The axe exceptions from laws.test.tsx, for the reasons recorded there. */
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

describe('the closed surfaces', () => {
  it('have no style escape hatch', () => {
    assertGoverned<CalendarProps>(true)
    assertGoverned<DatePickerProps>(true)
  })
})

describe('Calendar — the grid', () => {
  it('marks the chosen day, and paints it from the selection family', async () => {
    const root = mount(<Calendar defaultValue={JULY} aria-label="Due" />)
    const selected = root.querySelector('[data-selected]') as HTMLElement
    expect(selected.textContent).toBe('15')

    await vi.waitFor(() => {
      const style = getComputedStyle(selected)
      expect(style.backgroundColor).toBe(tokenColor('--pm-selection-bg'))
      expect(style.color).toBe(tokenColor('--pm-selection-text'))
      expect(style.borderTopColor).toBe(tokenColor('--pm-selection-border'))
    })
  })

  /**
   * Tests the selection roles. A selected day and a hovered day are two states, and the selected
   * one remains when the pointer leaves.
   *
   * The assertion is about which *roles* each state uses, not their values. `selection.bg` and
   * `accent.subtle` both resolve to `accent(3)` in the shipped role map, so the fills are equal and
   * the border tells them apart. That is a theme-layer decision (the role scale). If it changes,
   * this test still passes, because it checks that the recipe uses the right role.
   */
  it('does not paint a hovered day the way it paints the chosen one', async () => {
    const root = mount(<Calendar defaultValue={JULY} aria-label="Due" />)
    const chosen = root.querySelector('[data-selected]') as HTMLElement
    const other = dayNamed(root, '16')
    await userEvent.hover(other)

    await vi.waitFor(() => {
      expect(getComputedStyle(other).backgroundColor).toBe(tokenColor('--pm-accent-subtle'))
    })
    // The border belongs to the selection, and the hovered day has none.
    expect(getComputedStyle(chosen).borderTopColor).toBe(tokenColor('--pm-selection-border'))
    expect(getComputedStyle(other).borderTopColor).not.toBe(tokenColor('--pm-selection-border'))

    // The selection also stays after the pointer leaves, which is the other difference from hover.
    await userEvent.unhover(other)
    expect((root.querySelector('[data-selected]') as HTMLElement).textContent).toBe('15')
  })

  it('marks today without selecting it', () => {
    const root = mount(<Calendar aria-label="Due" />)
    const todayCell = root.querySelector('[data-today]') as HTMLElement
    expect(todayCell.textContent).toBe(String(NOW.day))
    expect(todayCell.getAttribute('aria-current')).toBe('date')
    expect(todayCell.hasAttribute('data-selected')).toBe(false)
    // A border, never a fill, because today is not a selection.
    expect(getComputedStyle(todayCell).borderTopColor).toBe(tokenColor('--pm-accent-bg'))
  })

  it('strikes out a day the app marks unavailable, and does not select it', async () => {
    const onChange = vi.fn()
    const root = mount(
      <Calendar
        focusedValue={new CalendarDate(2026, 7, 1)}
        isDateUnavailable={(date) => date.day === 4}
        onChange={onChange}
        aria-label="Due"
      />,
    )
    const fourth = dayNamed(root, '4')
    expect(fourth.dataset['unavailable']).toBe('')
    expect(getComputedStyle(fourth).textDecorationLine).toContain('line-through')

    fourth.click()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('disables out-of-range days', () => {
    const root = mount(
      <Calendar
        focusedValue={new CalendarDate(2026, 7, 1)}
        minValue={new CalendarDate(2026, 7, 10)}
        maxValue={new CalendarDate(2026, 7, 20)}
        aria-label="Due"
      />,
    )
    expect(dayNamed(root, '5').dataset['disabled']).toBe('')
    expect(dayNamed(root, '15').dataset['disabled']).toBeUndefined()
    expect(dayNamed(root, '25').dataset['disabled']).toBe('')
  })

  /**
   * Read from the *cells*, not the day buttons. React Aria renders a neighbouring month's dates as
   * ordinary cells with no button role, so a query for `[role="button"]` would find 31 days and
   * miss the four grey ones beside them.
   */
  it('renders no days from neighbouring months', () => {
    const root = mount(<Calendar focusedValue={new CalendarDate(2026, 7, 1)} aria-label="Due" />)
    const filled = [...root.querySelectorAll('td')]
      .map((cell) => cell.textContent?.trim())
      .filter((text) => text !== '')

    // July 2026 has 31 days and starts on a Wednesday, so the first three cells
    // and the last one hold nothing at all.
    expect(filled.map(Number)).toEqual([...new Array(31).keys()].map((day) => day + 1))
    expect([...root.querySelectorAll('tbody tr')][0]?.children[0]?.textContent).toBe('')
  })

  it('starts the week on the requested day', () => {
    const monday = mount(
      <Calendar focusedValue={JULY} firstDayOfWeek={1} locale="en-US" aria-label="Due" />,
    )
    expect(monday.querySelector('th')?.getAttribute('aria-label')).toBe('Monday')

    const sunday = mount(<Calendar focusedValue={JULY} locale="en-US" aria-label="Due" />)
    expect(sunday.querySelector('th')?.getAttribute('aria-label')).toBe('Sunday')
  })

  it('gives columns full accessible names and short visible labels', () => {
    const root = mount(<Calendar focusedValue={JULY} locale="en-US" aria-label="Due" />)
    const headers = [...root.querySelectorAll('th')]
    expect(headers).toHaveLength(7)
    for (const header of headers) {
      expect(header.getAttribute('scope')).toBe('col')
      expect(header.getAttribute('aria-label')?.length).toBeGreaterThan(
        (header.textContent ?? '').length,
      )
    }
  })

  it('uses the locale it was given', () => {
    const german = mount(<Calendar defaultValue={JULY} locale="de-DE" aria-label="Fällig" />)
    expect(german.textContent).toContain('Juli')
    // The German week starts on Monday by default.
    expect(german.querySelector('th')?.getAttribute('aria-label')).toBe('Montag')
  })

  it('uses tabular figures, so the columns stay aligned', () => {
    const root = mount(<Calendar focusedValue={JULY} aria-label="Due" />)
    expect(getComputedStyle(dayNamed(root, '1')).fontVariantNumeric).toContain('tabular-nums')
  })
})

describe('Calendar — navigation', () => {
  it('changes month from its header and records the direction', async () => {
    const root = mount(<Calendar defaultValue={JULY} locale="en-US" aria-label="Due" />)
    expect(root.textContent).toContain('July 2026')

    await userEvent.click(byLabel('Next month') as HTMLElement)
    expect(root.textContent).toContain('August 2026')
    expect((root.querySelector('table') as HTMLElement).dataset['travel']).toBe('next')

    await userEvent.click(byLabel('Previous month') as HTMLElement)
    await userEvent.click(byLabel('Previous month') as HTMLElement)
    expect(root.textContent).toContain('June 2026')
    expect((root.querySelector('table') as HTMLElement).dataset['travel']).toBe('previous')
  })

  it('announces the new month', () => {
    const root = mount(<Calendar defaultValue={JULY} aria-label="Due" />)
    const title = [...root.querySelectorAll('[aria-live]')][0] as HTMLElement
    expect(title.getAttribute('aria-live')).toBe('polite')
    expect(title.textContent).toContain('July')
  })

  it('is one tab stop, and the arrow keys move between days', async () => {
    const root = mount(<Calendar defaultValue={JULY} aria-label="Due" />)
    const stops = days(root).filter((day) => day.getAttribute('tabindex') === '0')
    expect(stops, 'a roving focus has exactly one stop').toHaveLength(1)

    stops[0]?.focus()
    await userEvent.keyboard('{ArrowRight}')
    expect((document.activeElement as HTMLElement).textContent).toBe('16')
    await userEvent.keyboard('{ArrowDown}')
    expect((document.activeElement as HTMLElement).textContent).toBe('23')
  })

  it('pages by month from the keyboard', async () => {
    const root = mount(<Calendar defaultValue={JULY} locale="en-US" aria-label="Due" />)
    ;(days(root).find((day) => day.getAttribute('tabindex') === '0') as HTMLElement).focus()
    await userEvent.keyboard('{PageDown}')
    expect(root.textContent).toContain('August 2026')
  })

  it('selects on Enter and reports a CalendarDate', async () => {
    const onChange = vi.fn()
    const root = mount(<Calendar defaultValue={JULY} onChange={onChange} aria-label="Due" />)
    ;(days(root).find((day) => day.getAttribute('tabindex') === '0') as HTMLElement).focus()
    await userEvent.keyboard('{ArrowRight}{Enter}')

    expect(onChange).toHaveBeenCalled()
    const value = onChange.mock.calls[0]?.[0] as CalendarDate
    expect(value.toString()).toBe('2026-07-16')
  })

  it('goes inert when the whole grid is disabled', () => {
    const onChange = vi.fn()
    const root = mount(
      <Calendar disabled defaultValue={JULY} onChange={onChange} aria-label="Due" />,
    )
    expect(days(root).every((day) => day.dataset['disabled'] === '')).toBe(true)
    dayNamed(root, '16').click()
    expect(onChange).not.toHaveBeenCalled()
  })
})

describe('DatePicker — the field', () => {
  const shared = (element: Element) => {
    const style = getComputedStyle(element)
    return {
      height: style.height,
      background: style.backgroundColor,
      border: `${style.borderTopWidth} ${style.borderTopStyle} ${style.borderTopColor}`,
      radius: style.borderTopLeftRadius,
      paddingInline: style.paddingLeft,

      // The control seat shadow, used by the whole field family, is compared so it cannot drift.
      shadow: style.boxShadow,
    }
  }

  for (const size of ['sm', 'md', 'lg'] as const) {
    it(`is Input's container at ${size}`, () => {
      expect(shared(mount(<DatePicker size={size} aria-label="Due" />))).toEqual(
        shared(mount(<Input size={size} aria-label="Subject" />)),
      )
    })
  }

  it('is a named group, not a text box', () => {
    const field = mount(<DatePicker aria-label="Due" />)
    expect(field.getAttribute('role')).toBe('group')
    expect(field.querySelectorAll('[role="spinbutton"]').length).toBeGreaterThanOrEqual(3)
  })

  it('shows its placeholders while empty, in the muted role', () => {
    const field = mount(<DatePicker aria-label="Due" />)
    const segments = [...field.querySelectorAll('[data-segment]')] as HTMLElement[]
    expect(segments.map((segment) => segment.dataset['segment']).sort()).toEqual([
      'day',
      'month',
      'year',
    ])
    for (const segment of segments) {
      expect(segment.dataset['placeholder']).toBe('')
      expect(getComputedStyle(segment).color).toBe(tokenColor('--pm-text-muted'))
    }
  })

  it('orders its segments from the locale', () => {
    const order = (field: HTMLElement) =>
      [...field.querySelectorAll('[data-segment]')].map(
        (segment) => (segment as HTMLElement).dataset['segment'],
      )

    expect(
      order(mount(<DatePicker locale="en-US" defaultValue={JULY} aria-label="Due" />)),
    ).toEqual(['month', 'day', 'year'])
    expect(
      order(mount(<DatePicker locale="de-DE" defaultValue={JULY} aria-label="Due" />)),
    ).toEqual(['day', 'month', 'year'])
  })

  it('uses tabular figures for the digits', () => {
    const field = mount(<DatePicker defaultValue={JULY} aria-label="Due" />)
    const segment = field.querySelector('[data-segment]') as HTMLElement
    expect(getComputedStyle(segment).fontVariantNumeric).toContain('tabular-nums')
  })

  it('accepts typing and stepping without opening the popup', async () => {
    const onChange = vi.fn()
    const field = mount(
      <DatePicker locale="en-US" defaultValue={JULY} onChange={onChange} aria-label="Due" />,
    )
    const day = field.querySelector('[data-segment="day"]') as HTMLElement
    day.focus()
    await userEvent.keyboard('{ArrowUp}')

    expect(onChange).toHaveBeenCalled()
    expect((onChange.mock.calls[0]?.[0] as CalendarDate).toString()).toBe('2026-07-16')
    expect(document.querySelector('table'), 'the grid opened by itself').toBeNull()
    expect(document.activeElement).toBe(day)
  })

  it('marks a value outside its range invalid', () => {
    const field = mount(
      <DatePicker
        defaultValue={new CalendarDate(2026, 7, 28)}
        maxValue={new CalendarDate(2026, 7, 20)}
        aria-label="Due"
      />,
    )
    expect(field.dataset['invalid']).toBe('')
    expect(getComputedStyle(field).borderTopColor).toBe(tokenColor('--pm-danger-border'))
  })

  it('clears back to its placeholders', async () => {
    const onChange = vi.fn()
    const field = mount(
      <DatePicker clearable defaultValue={JULY} onChange={onChange} aria-label="Due" />,
    )
    await userEvent.click(field.querySelector('[aria-label="Clear"]') as HTMLElement)
    expect(onChange).toHaveBeenCalledWith(null)
    expect(field.querySelector('[data-segment]')?.getAttribute('data-placeholder')).toBe('')
  })

  /*
   * The clear button sits inside React Aria's pressable field, whose press handler takes Enter and
   * Space from every element in it. The keys are pressed on the button itself, so the test fails if
   * the field takes them. The button leaves with the value, so focus must land on a segment.
   */
  for (const [name, keys] of ACTIVATION_KEYS) {
    it(`clears from the keyboard on ${name}, and moves focus to the first segment`, async () => {
      const onChange = vi.fn()
      const field = mount(
        <DatePicker clearable defaultValue={JULY} onChange={onChange} aria-label="Due" />,
      )
      ;(field.querySelector('[aria-label="Clear"]') as HTMLElement).focus()
      await userEvent.keyboard(keys)

      expect(onChange).toHaveBeenCalledWith(null)
      await vi.waitFor(() => expect(field.querySelector('[aria-label="Clear"]')).toBeNull())
      expect(document.activeElement).toBe(field.querySelector('[data-segment]'))
    })
  }

  it('serializes ISO-8601 under its name', () => {
    const { container } = render(
      <form>
        <DatePicker name="due" defaultValue={JULY} aria-label="Due" />
      </form>,
    )
    expect(new FormData(container.firstElementChild as HTMLFormElement).get('due')).toBe(
      '2026-07-15',
    )
  })
})

describe('DatePicker — the focus hand-off', () => {
  it('opens onto the focused day, not onto the previous-month button', async () => {
    const field = mount(<DatePicker defaultValue={JULY} aria-label="Due" />)
    await userEvent.click(field.querySelector('[aria-label="Show calendar"]') as HTMLElement)

    await vi.waitFor(() => expect(document.querySelector('table')).not.toBeNull())
    await vi.waitFor(() => {
      const active = document.activeElement as HTMLElement
      expect(active.getAttribute('role')).toBe('button')
      expect(active.textContent).toBe('15')
    })
    expect(field.dataset['state']).toBe('open')
  })

  /*
   * The keyboard path to the popup (the spec's `key Enter opens`, `key Space opens` and
   * `focus on-open day`). The trigger is inside React Aria's pressable field, so the keys are
   * pressed on the trigger itself rather than delivered as a click.
   */
  for (const [name, keys] of ACTIVATION_KEYS) {
    it(`opens from the trigger on ${name}, onto the focused day`, async () => {
      const field = mount(<DatePicker defaultValue={JULY} aria-label="Due" />)
      ;(field.querySelector('[aria-label="Show calendar"]') as HTMLElement).focus()
      await userEvent.keyboard(keys)

      await vi.waitFor(() => expect(field.dataset['state']).toBe('open'))
      await vi.waitFor(() => {
        const active = document.activeElement as HTMLElement
        expect(popoverPanel()?.contains(active)).toBe(true)
        expect(active.getAttribute('role')).toBe('button')
        expect(active.textContent).toBe('15')
      })
    })
  }

  it('leaves the segments their own keys: digits type, Enter stays put, Alt+ArrowDown opens', async () => {
    const onChange = vi.fn()
    const field = mount(
      <DatePicker locale="en-US" defaultValue={JULY} onChange={onChange} aria-label="Due" />,
    )
    const day = field.querySelector('[data-segment="day"]') as HTMLElement
    day.focus()

    await userEvent.keyboard('2')
    expect((onChange.mock.calls.at(-1)?.[0] as CalendarDate).toString()).toBe('2026-07-02')

    await userEvent.keyboard('{Enter}')
    expect(field.dataset['state']).toBe('closed')
    expect(document.activeElement).toBe(day)
    expect(onChange).toHaveBeenCalledTimes(1)

    await userEvent.keyboard('{Alt>}{ArrowDown}{/Alt}')
    await vi.waitFor(() => expect(field.dataset['state']).toBe('open'))
    await vi.waitFor(() => expect(popoverPanel()?.contains(document.activeElement)).toBe(true))
  })

  it('gives focus back to the trigger on Escape', async () => {
    const field = mount(<DatePicker defaultValue={JULY} aria-label="Due" />)
    const trigger = field.querySelector('[aria-label="Show calendar"]') as HTMLElement
    await userEvent.click(trigger)
    await vi.waitFor(() => expect(document.querySelector('table')).not.toBeNull())

    await userEvent.keyboard('{Escape}')
    await vi.waitFor(() => expect(field.dataset['state']).toBe('closed'))
    await vi.waitFor(() => expect(document.activeElement).toBe(trigger))
  })

  it('closes on a selection and shows it in the segments', async () => {
    const onChange = vi.fn()
    const field = mount(
      <DatePicker locale="en-US" defaultValue={JULY} onChange={onChange} aria-label="Due" />,
    )
    await userEvent.click(field.querySelector('[aria-label="Show calendar"]') as HTMLElement)
    await vi.waitFor(() => expect(document.querySelector('table')).not.toBeNull())

    const grid = document.querySelector('table') as HTMLElement
    await userEvent.click(dayNamed(grid, '20'))

    expect((onChange.mock.calls.at(-1)?.[0] as CalendarDate).toString()).toBe('2026-07-20')
    await vi.waitFor(() => expect(field.dataset['state']).toBe('closed'))
    expect(field.textContent).toContain('20')
  })

  it('does not open when disabled', () => {
    const field = mount(<DatePicker disabled defaultValue={JULY} aria-label="Due" />)
    const trigger = field.querySelector('[aria-label="Show calendar"]') as HTMLButtonElement
    expect(trigger.disabled).toBe(true)
    trigger.click()
    expect(document.querySelector('table')).toBeNull()
  })
})

/**
 * The sheet, below 30rem (date-picker.md's sheet cell, using the conventions' sheet
 * presentation).
 *
 * Calendar is unchanged inside the sheet, because the sheet is a different container around the
 * same calendar. The one allowed focus hand-off still works after re-anchoring: trigger → the
 * roving day, Escape back to the trigger, and a selection closes and returns focus to the field.
 * The segments stay the primary input at every width, and the field never becomes a sheet.
 */
describe('DatePicker — the sheet, below 30rem', () => {
  async function openSheet(node: React.ReactElement): Promise<HTMLElement> {
    await page.viewport(NARROW, 800)
    const field = mount(node)
    await userEvent.click(field.querySelector('[aria-label="Show calendar"]') as HTMLElement)
    await vi.waitFor(() => expect(sheetPanel()).not.toBeNull())
    return field
  }

  it('shows a sheet under auto as a named modal dialog, with the grid unchanged inside', async () => {
    const field = await openSheet(<DatePicker defaultValue={JULY} aria-label="Due" />)
    const panel = sheetPanel() as HTMLElement
    expect(panel.getAttribute('role')).toBe('dialog')
    expect(panel.getAttribute('aria-modal')).toBe('true')
    expect(panel.getAttribute('aria-label')).toBe('Choose a date')
    // The grid is Calendar's own: a real table, with the selected day styled from the selection
    // family.
    const grid = panel.querySelector('table') as HTMLElement
    expect(grid).not.toBeNull()
    const selected = panel.querySelector('[data-selected]') as HTMLElement
    expect(selected.textContent).toBe('15')
    await vi.waitFor(() => {
      expect(getComputedStyle(selected).backgroundColor).toBe(tokenColor('--pm-selection-bg'))
    })
    // The field stays in the page and never becomes a sheet.
    expect(panel.contains(field)).toBe(false)
    expect(field.dataset['state']).toBe('open')
  })

  it('hands focus to the roving day on open, not to the previous-month button', async () => {
    await openSheet(<DatePicker defaultValue={JULY} aria-label="Due" />)
    await vi.waitFor(() => {
      const active = document.activeElement as HTMLElement
      expect(active.getAttribute('role')).toBe('button')
      expect(active.textContent).toBe('15')
    })
  })

  for (const [name, keys] of ACTIVATION_KEYS) {
    it(`opens the sheet from the trigger on ${name}, onto the roving day`, async () => {
      await page.viewport(NARROW, 800)
      const field = mount(<DatePicker defaultValue={JULY} aria-label="Due" />)
      ;(field.querySelector('[aria-label="Show calendar"]') as HTMLElement).focus()
      await userEvent.keyboard(keys)

      await vi.waitFor(() => expect(sheetPanel()).not.toBeNull())
      await vi.waitFor(() => {
        const active = document.activeElement as HTMLElement
        expect(sheetPanel()?.contains(active)).toBe(true)
        expect(active.textContent).toBe('15')
      })
    })
  }

  it('gives focus back to the trigger on Escape', async () => {
    const field = await openSheet(<DatePicker defaultValue={JULY} aria-label="Due" />)
    const trigger = field.querySelector('[aria-label="Show calendar"]') as HTMLElement

    await userEvent.keyboard('{Escape}')
    await vi.waitFor(() => expect(sheetPanel()).toBeNull())
    await vi.waitFor(() => expect(document.activeElement).toBe(trigger))
    expect(field.dataset['state']).toBe('closed')
  })

  it('closes on a choice, fills the segments, and returns focus to the field', async () => {
    const onChange = vi.fn()
    const field = await openSheet(
      <DatePicker locale="en-US" defaultValue={JULY} onChange={onChange} aria-label="Due" />,
    )
    const grid = sheetPanel()?.querySelector('table') as HTMLElement
    await userEvent.click(dayNamed(grid, '20'))

    expect((onChange.mock.calls.at(-1)?.[0] as CalendarDate).toString()).toBe('2026-07-20')
    await vi.waitFor(() => expect(sheetPanel()).toBeNull())
    expect(field.textContent).toContain('20')
    await vi.waitFor(() =>
      expect(document.activeElement).toBe(field.querySelector('[aria-label="Show calendar"]')),
    )
  })

  it('dismisses on a scrim press', async () => {
    const field = await openSheet(<DatePicker defaultValue={JULY} aria-label="Due" />)
    await userEvent.click(scrim() as HTMLElement)
    await vi.waitFor(() => expect(sheetPanel()).toBeNull())
    expect(field.dataset['state']).toBe('closed')
  })

  it('keeps the popover under presentation="popover" at the same width', async () => {
    await page.viewport(NARROW, 800)
    const field = mount(
      <DatePicker defaultValue={JULY} presentation="popover" defaultOpen aria-label="Due" />,
    )
    await vi.waitFor(() => expect(document.querySelector('table')).not.toBeNull())
    expect(sheetPanel()).toBeNull()
    expect(document.querySelector('[data-side]')).not.toBeNull()
    expect(field.dataset['state']).toBe('open')
  })

  it('never uses a sheet above the breakpoint', async () => {
    mount(<DatePicker defaultValue={JULY} defaultOpen aria-label="Due" />)
    await vi.waitFor(() => expect(document.querySelector('table')).not.toBeNull())
    expect(sheetPanel()).toBeNull()
  })

  it('passes axe open', async () => {
    await openSheet(<DatePicker defaultValue={JULY} aria-label="Due" />)
    expect(await audit(document.body)).toEqual([])
  })
})

/**
 * An agent sets a date through the bridge as ISO text, as the specs' `agent` fences declare
 * (`design/components/calendar.md` and `date-picker.md`, Agent). React Aria holds the value, so
 * the date reaches the member whether or not the caller controls it, and `onChange` reports it.
 */
describe('an agent', () => {
  it('sets the date of an uncontrolled and a controlled Calendar, and shows its month', async () => {
    const bridge = createAgentBridge()
    try {
      const free = vi.fn()
      const held = vi.fn()
      function Held() {
        const [value, setValue] = useState<CalendarDate | null>(JULY)
        return (
          <Calendar
            aria-label="Held"
            value={value}
            onChange={(next) => {
              held(next)
              setValue(next)
            }}
          />
        )
      }
      const { container } = render(
        <>
          <Calendar aria-label="Free" defaultValue={JULY} onChange={free} />
          <Held />
        </>,
      )
      const calendars = bridge.snapshot().members.filter((member) => member.member === 'Calendar')
      const [one, two] = calendars
      expect(one?.state).toEqual({ value: '2026-07-15', disabled: false })
      // The month buttons are the calendar's own parts, so no Button is listed.
      expect(bridge.snapshot().members.map((member) => member.member)).toEqual([
        'Calendar',
        'Calendar',
      ])

      const set = await bridge.act([{ id: one?.id, action: 'set', value: '2026-09-03' }])
      expect(set.results[0]).toMatchObject({
        ok: true,
        changed: { value: { from: '2026-07-15', to: '2026-09-03' } },
      })
      expect(free).toHaveBeenLastCalledWith(new CalendarDate(2026, 9, 3))
      const first = container.querySelector('[data-member="calendar"]') as HTMLElement
      await vi.waitFor(() => expect(first.querySelector('[data-selected]')?.textContent).toBe('3'))

      const changed = await bridge.act([{ id: two?.id, action: 'set', value: '2026-07-20' }])
      expect(changed.results[0]).toMatchObject({
        ok: true,
        changed: { value: { to: '2026-07-20' } },
      })
      expect(held).toHaveBeenLastCalledWith(new CalendarDate(2026, 7, 20))
    } finally {
      bridge.dispose()
    }
  })

  it('refuses text that is not a date, and a day the calendar does not allow', async () => {
    const bridge = createAgentBridge()
    try {
      const onChange = vi.fn()
      render(
        <Calendar
          aria-label="Due date"
          defaultValue={JULY}
          minValue={new CalendarDate(2026, 7, 10)}
          maxValue={new CalendarDate(2026, 7, 20)}
          isDateUnavailable={(date) => date.day === 16}
          onChange={onChange}
        />,
      )
      const [member] = bridge.snapshot().members
      for (const [text, reason] of [
        ['July 17', 'YYYY-MM-DD'],
        ['2026-07-21', 'outside the dates'],
        ['2026-07-16', 'does not offer'],
      ] as const) {
        const { results } = await bridge.act([{ id: member?.id, action: 'set', value: text }])
        expect(results[0], text).toMatchObject({
          ok: false,
          error: { code: 'failed', message: expect.stringContaining(reason) },
        })
      }
      expect(onChange).not.toHaveBeenCalled()
    } finally {
      bridge.dispose()
    }
  })

  it('sets, clears, opens and closes a DatePicker, and withholds its parts', async () => {
    const bridge = createAgentBridge()
    try {
      const onChange = vi.fn()
      render(<DatePicker aria-label="Due date" onChange={onChange} presentation="popover" />)
      const listed = () => bridge.snapshot().members.map((member) => member.member)
      // The field's calendar button is the picker's own part.
      expect(listed()).toEqual(['DatePicker'])
      const [member] = bridge.snapshot().members

      const set = await bridge.act([{ id: member?.id, action: 'set', value: '2026-07-16' }])
      expect(set.results[0]).toMatchObject({
        ok: true,
        changed: { value: { from: '', to: '2026-07-16' } },
      })
      expect(onChange).toHaveBeenLastCalledWith(new CalendarDate(2026, 7, 16))

      const opened = await bridge.act([{ id: member?.id, action: 'open' }])
      expect(opened.results[0]).toMatchObject({ ok: true, changed: { open: { to: true } } })
      await vi.waitFor(() => expect(popoverPanel()).not.toBeNull())
      // The Calendar in the popup, its month buttons and the field's calendar button are withheld.
      expect(listed()).toEqual(['DatePicker'])
      const closed = await bridge.act([{ id: member?.id, action: 'close' }])
      expect(closed.results[0]).toMatchObject({ ok: true, changed: { open: { to: false } } })

      const cleared = await bridge.act([{ id: member?.id, action: 'clear' }])
      expect(cleared.results[0]).toMatchObject({ ok: true, changed: { value: { to: '' } } })
      expect(onChange).toHaveBeenLastCalledWith(null)
    } finally {
      bridge.dispose()
    }
  })

  it('withholds the field and the open popup together, anchored and in the sheet', async () => {
    for (const [width, open] of [
      [WIDE, popoverPanel],
      [NARROW, sheetPanel],
    ] as const) {
      await page.viewport(width, 800)
      const bridge = createAgentBridge()
      const { unmount } = render(<DatePicker aria-label="Due date" defaultValue={JULY} />)
      try {
        const [member] = bridge.snapshot().members
        const opened = await bridge.act([{ id: member?.id, action: 'open' }])
        expect(opened.results[0]).toMatchObject({ ok: true, changed: { open: { to: true } } })
        await vi.waitFor(() => expect(open()).not.toBeNull())
        // The field's calendar Button, the Calendar and its two month Buttons are registered.
        const inside = agentRegistrations().filter(({ id }) => id !== member?.id)
        expect(inside.map((registration) => registration.member).sort()).toEqual([
          'Button',
          'Button',
          'Button',
          'Calendar',
        ])
        // None of them is listed, found or run while the popup is open.
        expect(bridge.snapshot().members.map((listed) => listed.member)).toEqual(['DatePicker'])
        expect(bridge.query({ name: 'Show calendar' })).toEqual([])
        expect(bridge.query({ member: 'Calendar' })).toEqual([])
        for (const { id } of inside) {
          const { results } = await bridge.act([{ id, action: 'press' }])
          expect(results[0]).toMatchObject({ ok: false, error: { code: 'unknown-member' } })
        }
      } finally {
        bridge.dispose()
        unmount()
      }
    }
  })

  it('reads and sets a datetime at its granularity, and refuses a finer time', async () => {
    const bridge = createAgentBridge()
    try {
      const onChange = vi.fn()
      render(
        <DatePicker
          aria-label="Starts"
          granularity="minute"
          defaultValue={new CalendarDateTime(2026, 7, 15, 9, 30)}
          onChange={onChange}
        />,
      )
      const [member] = bridge.snapshot().members
      expect(member?.state['value']).toBe('2026-07-15T09:30:00')
      const set = await bridge.act([
        { id: member?.id, action: 'set', value: '2026-07-16T14:45:00' },
      ])
      expect(set.results[0]).toMatchObject({
        ok: true,
        changed: { value: { to: '2026-07-16T14:45:00' } },
      })
      expect(onChange).toHaveBeenLastCalledWith(new CalendarDateTime(2026, 7, 16, 14, 45))
      for (const text of ['2026-07-16', '2026-07-16T14:45:30']) {
        const { results } = await bridge.act([{ id: member?.id, action: 'set', value: text }])
        expect(results[0], text).toMatchObject({ ok: false, error: { code: 'failed' } })
      }
    } finally {
      bridge.dispose()
    }
  })
})
