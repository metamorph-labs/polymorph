import { CalendarDate } from '@internationalized/date'
import { render } from '@testing-library/react'
import axeCore, { type RunOptions } from 'axe-core'
import { page, userEvent } from 'vitest/browser'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { assertGoverned } from '@polymorph/react'
import { createAgentBridge } from '@polymorph/engine/agent'
import { agentRegistrations, installTestTheme } from '@polymorph/engine/testing'
import { DateRangePicker, type DateRangePickerProps, type DateRange } from './DateRangePicker'
import { Input } from './Input'
import { tokenColor } from './token-probe'

/**
 * DateRangePicker in a real browser. The anchored keyboard model, the two-stage Escape and the
 * selection mapping (endpoints in the selection family, middles in the wash) all depend on real
 * focus and computed styles.
 */

const REPORT: DateRange = {
  start: new CalendarDate(2026, 6, 1),
  end: new CalendarDate(2026, 6, 14),
}

beforeAll(installTestTheme)

function mount(node: React.ReactElement): HTMLElement {
  return render(node).container.firstElementChild as HTMLElement
}

const grid = () => document.querySelector('table')

const days = (root: ParentNode = document) =>
  [...root.querySelectorAll('[role="button"]')].filter((node) =>
    node.textContent?.match(/^\d+$/),
  ) as HTMLElement[]

const dayNamed = (label: string) => days().find((day) => day.textContent === label) as HTMLElement

const attrsOf = (label: string) => {
  const day = dayNamed(label)
  return {
    start: day.hasAttribute('data-range-start'),
    middle: day.hasAttribute('data-range-middle'),
    end: day.hasAttribute('data-range-end'),
  }
}

/* Fixtures for the sheet (the conventions' sheet presentation). The viewport resets after every
   test, because a test that crosses the breakpoint sets the width itself (sheet.test.tsx). */
const NARROW = 420
const WIDE = 1280

afterEach(async () => {
  await page.viewport(WIDE, 800)
})

const sheetPanel = () => document.querySelector('[data-presentation="sheet"]') as HTMLElement | null

/** The popover panel, located as the conformance law locates it (`@polymorph/conformance`'s `parts.ts`). */
const popoverPanel = () =>
  document.querySelector('[data-member="date-range-picker"][role="dialog"]') as HTMLElement | null

/** The keys that activate a native button, in user-event's syntax. */
const ACTIVATION_KEYS = [
  ['Enter', '{Enter}'],
  ['Space', ' '],
] as const
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

describe('the closed surface', () => {
  it('has no style escape hatch', () => {
    assertGoverned<DateRangePickerProps>(true)
  })
})

describe('DateRangePicker — the field', () => {
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
      expect(shared(mount(<DateRangePicker size={size} aria-label="Report range" />))).toEqual(
        shared(mount(<Input size={size} aria-label="Subject" />)),
      )
    })
  }

  it('is one named group holding two named halves', () => {
    const field = mount(<DateRangePicker aria-label="Report range" />)
    expect(field.getAttribute('role')).toBe('group')
    // Six spinbuttons: day, month and year, twice.
    expect(field.querySelectorAll('[role="spinbutton"]').length).toBe(6)
    // React Aria names the halves. The en-dash carries no meaning.
    expect(field.textContent).toContain('–')
  })

  it('shows both groups as placeholders while empty', () => {
    const field = mount(<DateRangePicker aria-label="Report range" />)
    const placeholders = field.querySelectorAll('[data-segment][data-placeholder]')
    expect(placeholders.length).toBe(6)
  })

  it('marks a reversed pair invalid, as React Aria reports it', () => {
    const field = mount(
      <DateRangePicker
        defaultValue={{ start: REPORT.end, end: REPORT.start }}
        aria-label="Report range"
      />,
    )
    expect(field.dataset['invalid']).toBe('')
    expect(getComputedStyle(field).borderTopColor).toBe(tokenColor('--pm-danger-border'))
  })

  it('serializes ISO-8601 twice, one hidden input per end', () => {
    const { container } = render(
      <form>
        <DateRangePicker
          startName="from"
          endName="to"
          defaultValue={REPORT}
          aria-label="Report range"
        />
      </form>,
    )
    const form = container.firstElementChild as HTMLFormElement
    const data = new FormData(form)
    expect(data.get('from')).toBe('2026-06-01')
    expect(data.get('to')).toBe('2026-06-14')
  })

  it('clears both groups to placeholders and reports null', async () => {
    const onChange = vi.fn()
    const field = mount(
      <DateRangePicker
        clearable
        defaultValue={REPORT}
        onChange={onChange}
        aria-label="Report range"
      />,
    )
    await userEvent.click(field.querySelector('[aria-label="Clear"]') as HTMLElement)
    expect(onChange).toHaveBeenCalledWith(null)
    expect(field.querySelectorAll('[data-segment][data-placeholder]').length).toBe(6)
  })

  /*
   * The clear button sits inside React Aria's pressable range field, which takes Enter and Space
   * from every element in it. The keys are pressed on the button itself. The button leaves with the
   * value, so focus must land on the start half's first segment.
   */
  for (const [name, keys] of ACTIVATION_KEYS) {
    it(`clears from the keyboard on ${name}, and moves focus to the first segment`, async () => {
      const onChange = vi.fn()
      const field = mount(
        <DateRangePicker
          clearable
          defaultValue={REPORT}
          onChange={onChange}
          aria-label="Report range"
        />,
      )
      ;(field.querySelector('[aria-label="Clear"]') as HTMLElement).focus()
      await userEvent.keyboard(keys)

      expect(onChange).toHaveBeenCalledWith(null)
      expect(field.querySelectorAll('[data-segment][data-placeholder]').length).toBe(6)
      await vi.waitFor(() => expect(field.querySelector('[aria-label="Clear"]')).toBeNull())
      expect(document.activeElement).toBe(field.querySelector('[data-segment]'))
    })
  }
})

/**
 * The keyboard path to the popup (the spec's `key Enter opens`, `key Space opens` and
 * `focus on-open day`). The trigger is inside React Aria's pressable range field, so the keys are
 * pressed on the trigger itself rather than delivered as a click. The segments keep their own keys.
 */
describe('DateRangePicker — the trigger from the keyboard', () => {
  for (const [name, keys] of ACTIVATION_KEYS) {
    it(`opens on ${name}, onto the focused day`, async () => {
      const field = mount(
        <DateRangePicker locale="en-US" defaultValue={REPORT} aria-label="Report range" />,
      )
      ;(field.querySelector('[aria-label="Show calendar"]') as HTMLElement).focus()
      await userEvent.keyboard(keys)

      await vi.waitFor(() => expect(field.dataset['state']).toBe('open'))
      await vi.waitFor(() => {
        const active = document.activeElement as HTMLElement
        expect(popoverPanel()?.contains(active)).toBe(true)
        expect(active.getAttribute('role')).toBe('button')
        expect(active.textContent).toBe('1')
      })
    })
  }

  it('leaves the segments their own keys: digits type, Enter stays put, Alt+ArrowDown opens', async () => {
    const onChange = vi.fn()
    const field = mount(
      <DateRangePicker
        locale="en-US"
        defaultValue={REPORT}
        onChange={onChange}
        aria-label="Report range"
      />,
    )
    const endDay = field.querySelectorAll('[data-segment="day"]')[1] as HTMLElement
    endDay.focus()

    await userEvent.keyboard('2')
    const typed = onChange.mock.calls.at(-1)?.[0] as DateRange
    expect(typed.end.toString()).toBe('2026-06-02')

    await userEvent.keyboard('{Enter}')
    expect(field.dataset['state']).toBe('closed')
    expect(document.activeElement).toBe(endDay)
    expect(onChange).toHaveBeenCalledTimes(1)

    await userEvent.keyboard('{Alt>}{ArrowDown}{/Alt}')
    await vi.waitFor(() => expect(field.dataset['state']).toBe('open'))
    await vi.waitFor(() => expect(popoverPanel()?.contains(document.activeElement)).toBe(true))
  })
})

describe('DateRangePicker — the range cells', () => {
  it('marks the range role of each cell, not only membership', async () => {
    mount(<DateRangePicker defaultOpen defaultValue={REPORT} aria-label="Report range" />)
    await vi.waitFor(() => expect(grid()).not.toBeNull())

    expect(attrsOf('1')).toEqual({ start: true, middle: false, end: false })
    expect(attrsOf('7')).toEqual({ start: false, middle: true, end: false })
    expect(attrsOf('14')).toEqual({ start: false, middle: false, end: true })
    expect(attrsOf('20')).toEqual({ start: false, middle: false, end: false })
    // The single-date attribute stays Calendar's.
    expect(document.querySelector('[data-selected]')).toBeNull()
  })

  it('gives a one-day range both endpoint attributes and no middles', async () => {
    mount(
      <DateRangePicker
        defaultOpen
        defaultValue={{ start: new CalendarDate(2026, 6, 8), end: new CalendarDate(2026, 6, 8) }}
        aria-label="Report range"
      />,
    )
    await vi.waitFor(() => expect(grid()).not.toBeNull())

    expect(attrsOf('8')).toEqual({ start: true, middle: false, end: true })
    expect(document.querySelector('[data-range-middle]')).toBeNull()
  })

  it('paints endpoints from the selection family and middles as the accent wash', async () => {
    mount(<DateRangePicker defaultOpen defaultValue={REPORT} aria-label="Report range" />)
    await vi.waitFor(() => expect(grid()).not.toBeNull())

    const start = dayNamed('1')
    const middle = dayNamed('7')
    await vi.waitFor(() => {
      const startStyle = getComputedStyle(start)
      expect(startStyle.backgroundColor).toBe(tokenColor('--pm-selection-bg'))
      expect(startStyle.color).toBe(tokenColor('--pm-selection-text'))
      expect(startStyle.borderTopColor).toBe(tokenColor('--pm-selection-border'))
    })

    const middleStyle = getComputedStyle(middle)
    expect(middleStyle.backgroundColor).toBe(tokenColor('--pm-accent-subtle'))
    // The wash is the whole change. Text stays primary, and the middle has square corners so the
    // band reads as one shape.
    expect(middleStyle.color).toBe(tokenColor('--pm-text-primary'))
    expect(middleStyle.borderTopLeftRadius).toBe('0px')
  })

  it('uses the ghost wash for hover, because the accent wash means in-range only', async () => {
    mount(<DateRangePicker defaultOpen defaultValue={REPORT} aria-label="Report range" />)
    await vi.waitFor(() => expect(grid()).not.toBeNull())

    const outside = dayNamed('20')
    await userEvent.hover(outside)
    await vi.waitFor(() => {
      expect(getComputedStyle(outside).backgroundColor).toBe(tokenColor('--pm-bg-subtle'))
    })
  })

  it('strikes unavailable days and keeps them reachable', async () => {
    mount(
      <DateRangePicker
        defaultOpen
        defaultValue={REPORT}
        isDateUnavailable={(date) => date.day === 20}
        aria-label="Report range"
      />,
    )
    await vi.waitFor(() => expect(grid()).not.toBeNull())

    const struck = dayNamed('20')
    expect(struck.dataset['unavailable']).toBe('')
    expect(getComputedStyle(struck).textDecorationLine).toContain('line-through')
  })
})

describe('DateRangePicker — the anchored keyboard model', () => {
  async function openEmpty(onChange?: (value: DateRange | null) => void) {
    const field = mount(
      <DateRangePicker
        locale="en-US"
        minValue={new CalendarDate(2026, 6, 1)}
        maxValue={new CalendarDate(2026, 6, 30)}
        onChange={onChange}
        aria-label="Report range"
      />,
    )
    await userEvent.click(field.querySelector('[aria-label="Show calendar"]') as HTMLElement)
    await vi.waitFor(() => expect(grid()).not.toBeNull())
    await vi.waitFor(() => {
      expect((document.activeElement as HTMLElement).getAttribute('role')).toBe('button')
    })
    return field
  }

  it('anchors on Enter, extends with arrows as a live preview, and commits on Enter', async () => {
    const onChange = vi.fn()
    const field = await openEmpty(onChange)
    // With no value, the popup opens on today, clamped into the bounds. After June that is the last
    // allowed day, June 30, so the range extends *backwards* from the anchor here.
    const anchor = (document.activeElement as HTMLElement).textContent

    await userEvent.keyboard('{Enter}')
    // A half-entered range is never reported.
    expect(onChange).not.toHaveBeenCalled()

    await userEvent.keyboard('{ArrowLeft}{ArrowLeft}')
    // The preview *is* the range being made, so the cells get the attributes while selecting.
    // `data-range-start` is always the *earlier* date, whichever end the anchor is. The range is
    // three days wide, not two, because keyboard anchoring moves the focused date one day. That is
    // React Aria's own indication that selection has started.
    await vi.waitFor(() => {
      expect(document.querySelector('[data-range-end]')?.textContent).toBe(anchor)
      expect(document.querySelectorAll('[data-range-middle]').length).toBe(2)
      expect(document.querySelector('[data-range-start]')).not.toBeNull()
    })

    await userEvent.keyboard('{Enter}')
    await vi.waitFor(() => expect(onChange).toHaveBeenCalled())
    const range = onChange.mock.calls[0]?.[0] as DateRange
    expect(range.end.compare(range.start)).toBe(3)

    // Committing the end closes the popup and fills both segment groups.
    await vi.waitFor(() => expect(field.dataset['state']).toBe('closed'))
    expect(field.querySelectorAll('[data-segment][data-placeholder]').length).toBe(0)
  })

  it('cancels first and closes second (two-stage Escape)', async () => {
    const onChange = vi.fn()
    const field = await openEmpty(onChange)

    await userEvent.keyboard('{Enter}{ArrowLeft}')
    await vi.waitFor(() => expect(document.querySelector('[data-range-start]')).not.toBeNull())

    // Stage one: the in-progress range is cancelled, and the popup stays open.
    await userEvent.keyboard('{Escape}')
    await vi.waitFor(() => expect(document.querySelector('[data-range-start]')).toBeNull())
    expect(field.dataset['state']).toBe('open')
    expect(onChange).not.toHaveBeenCalled()

    // Stage two: with no anchor set, Escape closes and returns focus.
    await userEvent.keyboard('{Escape}')
    await vi.waitFor(() => expect(field.dataset['state']).toBe('closed'))
    await vi.waitFor(() =>
      expect(document.activeElement).toBe(field.querySelector('[aria-label="Show calendar"]')),
    )
  })

  it('cancelling an in-progress range keeps the committed value', async () => {
    const onChange = vi.fn()
    const field = mount(
      <DateRangePicker
        locale="en-US"
        defaultValue={REPORT}
        onChange={onChange}
        aria-label="Report range"
      />,
    )
    await userEvent.click(field.querySelector('[aria-label="Show calendar"]') as HTMLElement)
    await vi.waitFor(() => expect(grid()).not.toBeNull())

    // Start a new range by choosing a new start, then cancel it.
    await userEvent.keyboard('{Enter}')
    await userEvent.keyboard('{Escape}')

    expect(field.dataset['state']).toBe('open')
    expect(onChange).not.toHaveBeenCalled()
    // The committed range is still shown.
    await vi.waitFor(() => {
      expect(document.querySelector('[data-range-start]')?.textContent).toBe('1')
      expect(document.querySelector('[data-range-end]')?.textContent).toBe('14')
    })
  })

  it('does not open when disabled', () => {
    const field = mount(
      <DateRangePicker disabled defaultValue={REPORT} aria-label="Report range" />,
    )
    const trigger = field.querySelector('[aria-label="Show calendar"]') as HTMLButtonElement
    expect(trigger.disabled).toBe(true)
    trigger.click()
    expect(grid()).toBeNull()
  })
})

/**
 * The sheet, below 30rem (the spec's presentation row, same as DatePicker, using the conventions'
 * sheet presentation).
 *
 * RangeCalendar is unchanged inside the sheet. The tests check that three behaviours still work
 * after re-anchoring: the focus hand-off (trigger → the roving day), the anchored keyboard model,
 * and the two-stage Escape (cancel first, close second).
 */
describe('the sheet, below 30rem', () => {
  async function openSheet(node: React.ReactElement): Promise<HTMLElement> {
    await page.viewport(NARROW, 800)
    const field = mount(node)
    await userEvent.click(field.querySelector('[aria-label="Show calendar"]') as HTMLElement)
    await vi.waitFor(() => expect(sheetPanel()).not.toBeNull())
    return field
  }

  it('shows a sheet under auto as a named modal dialog with the range cells inside', async () => {
    const field = await openSheet(
      <DateRangePicker locale="en-US" defaultValue={REPORT} aria-label="Report range" />,
    )
    const panel = sheetPanel() as HTMLElement
    expect(panel.getAttribute('role')).toBe('dialog')
    expect(panel.getAttribute('aria-modal')).toBe('true')
    expect(panel.getAttribute('aria-label')).toBe('Choose a date range')

    // The grid is the member's own, unchanged, with range roles on the cells.
    expect(panel.querySelector('table')).not.toBeNull()
    await vi.waitFor(() => {
      expect(attrsOf('1')).toEqual({ start: true, middle: false, end: false })
      expect(attrsOf('7')).toEqual({ start: false, middle: true, end: false })
      expect(attrsOf('14')).toEqual({ start: false, middle: false, end: true })
    })
    expect(panel.contains(field)).toBe(false)
  })

  it('hands focus to the roving day on open', async () => {
    await openSheet(
      <DateRangePicker locale="en-US" defaultValue={REPORT} aria-label="Report range" />,
    )
    await vi.waitFor(() => {
      const active = document.activeElement as HTMLElement
      expect(active.getAttribute('role')).toBe('button')
      expect(sheetPanel()?.contains(active)).toBe(true)
    })
  })

  for (const [name, keys] of ACTIVATION_KEYS) {
    it(`opens the sheet from the trigger on ${name}, onto the roving day`, async () => {
      await page.viewport(NARROW, 800)
      const field = mount(
        <DateRangePicker locale="en-US" defaultValue={REPORT} aria-label="Report range" />,
      )
      ;(field.querySelector('[aria-label="Show calendar"]') as HTMLElement).focus()
      await userEvent.keyboard(keys)

      await vi.waitFor(() => expect(sheetPanel()).not.toBeNull())
      await vi.waitFor(() => {
        const active = document.activeElement as HTMLElement
        expect(sheetPanel()?.contains(active)).toBe(true)
        expect(active.getAttribute('role')).toBe('button')
      })
    })
  }

  it('still cancels first and closes second in the sheet (two-stage Escape)', async () => {
    const onChange = vi.fn()
    const field = await openSheet(
      <DateRangePicker
        locale="en-US"
        minValue={new CalendarDate(2026, 6, 1)}
        maxValue={new CalendarDate(2026, 6, 30)}
        onChange={onChange}
        aria-label="Report range"
      />,
    )
    await vi.waitFor(() => {
      expect((document.activeElement as HTMLElement).getAttribute('role')).toBe('button')
    })

    // Start a range.
    await userEvent.keyboard('{Enter}{ArrowLeft}')
    await vi.waitFor(() => expect(document.querySelector('[data-range-start]')).not.toBeNull())

    // Stage one: the range is cancelled, and the sheet stays open.
    await userEvent.keyboard('{Escape}')
    await vi.waitFor(() => expect(document.querySelector('[data-range-start]')).toBeNull())
    expect(sheetPanel()).not.toBeNull()
    expect(field.dataset['state']).toBe('open')
    expect(onChange).not.toHaveBeenCalled()

    // Stage two: with no anchor set, Escape closes and focus returns.
    await userEvent.keyboard('{Escape}')
    await vi.waitFor(() => expect(sheetPanel()).toBeNull())
    await vi.waitFor(() =>
      expect(document.activeElement).toBe(field.querySelector('[aria-label="Show calendar"]')),
    )
  })

  it('commits an anchored range and closes, filling both groups, with the same keyboard model', async () => {
    const onChange = vi.fn()
    const field = await openSheet(
      <DateRangePicker
        locale="en-US"
        minValue={new CalendarDate(2026, 6, 1)}
        maxValue={new CalendarDate(2026, 6, 30)}
        onChange={onChange}
        aria-label="Report range"
      />,
    )
    await vi.waitFor(() => {
      expect((document.activeElement as HTMLElement).getAttribute('role')).toBe('button')
    })

    await userEvent.keyboard('{Enter}{ArrowLeft}{Enter}')
    await vi.waitFor(() => expect(onChange).toHaveBeenCalled())
    await vi.waitFor(() => expect(sheetPanel()).toBeNull())
    expect(field.querySelectorAll('[data-segment][data-placeholder]').length).toBe(0)
    await vi.waitFor(() =>
      expect(document.activeElement).toBe(field.querySelector('[aria-label="Show calendar"]')),
    )
  })

  it('dismisses on a scrim press', async () => {
    const field = await openSheet(
      <DateRangePicker locale="en-US" defaultValue={REPORT} aria-label="Report range" />,
    )
    await userEvent.click(scrim() as HTMLElement)
    await vi.waitFor(() => expect(sheetPanel()).toBeNull())
    expect(field.dataset['state']).toBe('closed')
  })

  it('keeps the popover under presentation="popover" at the same width', async () => {
    await page.viewport(NARROW, 800)
    const field = mount(
      <DateRangePicker
        locale="en-US"
        defaultValue={REPORT}
        presentation="popover"
        defaultOpen
        aria-label="Report range"
      />,
    )
    await vi.waitFor(() => expect(grid()).not.toBeNull())
    expect(sheetPanel()).toBeNull()
    expect(document.querySelector('[data-side]')).not.toBeNull()
    expect(field.dataset['state']).toBe('open')
  })

  it('never uses a sheet above the breakpoint', async () => {
    mount(
      <DateRangePicker
        locale="en-US"
        defaultValue={REPORT}
        defaultOpen
        aria-label="Report range"
      />,
    )
    await vi.waitFor(() => expect(grid()).not.toBeNull())
    expect(sheetPanel()).toBeNull()
  })

  it('passes axe open', async () => {
    await openSheet(
      <DateRangePicker locale="en-US" defaultValue={REPORT} aria-label="Report range" />,
    )
    expect(await audit(document.body)).toEqual([])
  })
})

/**
 * An agent sets the range through the bridge as one ISO text, as the spec's `agent` fence
 * declares (`design/components/date-range-picker.md`, Agent), and `onChange` reports it.
 */
describe('an agent', () => {
  it('sets and clears the range, and refuses an end before its start', async () => {
    const bridge = createAgentBridge()
    try {
      const onChange = vi.fn()
      render(
        <DateRangePicker aria-label="Report window" defaultValue={REPORT} onChange={onChange} />,
      )
      const [member] = bridge.snapshot().members
      expect(member).toMatchObject({
        member: 'DateRangePicker',
        state: { value: '2026-06-01/2026-06-14', open: false },
      })
      // The field's calendar button is the picker's own part.
      expect(bridge.snapshot().members).toHaveLength(1)

      const set = await bridge.act([
        { id: member?.id, action: 'set', value: '2026-06-03/2026-06-03' },
      ])
      expect(set.results[0]).toMatchObject({
        ok: true,
        changed: { value: { from: '2026-06-01/2026-06-14', to: '2026-06-03/2026-06-03' } },
      })
      expect(onChange).toHaveBeenLastCalledWith({
        start: new CalendarDate(2026, 6, 3),
        end: new CalendarDate(2026, 6, 3),
      })
      for (const text of ['2026-06-14/2026-06-01', '2026-06-01 to 2026-06-14']) {
        const { results } = await bridge.act([{ id: member?.id, action: 'set', value: text }])
        expect(results[0], text).toMatchObject({ ok: false, error: { code: 'failed' } })
      }
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
      const { unmount } = render(
        <DateRangePicker aria-label="Report window" defaultValue={REPORT} />,
      )
      try {
        const [member] = bridge.snapshot().members
        const opened = await bridge.act([{ id: member?.id, action: 'open' }])
        expect(opened.results[0]).toMatchObject({ ok: true, changed: { open: { to: true } } })
        await vi.waitFor(() => expect(open()).not.toBeNull())
        // The field's calendar Button and the grid's two month Buttons are registered.
        const inside = agentRegistrations().filter(({ id }) => id !== member?.id)
        expect(inside.map((registration) => registration.member)).toEqual([
          'Button',
          'Button',
          'Button',
        ])
        // None of them is listed, found or run while the popup is open.
        expect(bridge.snapshot().members.map((listed) => listed.member)).toEqual([
          'DateRangePicker',
        ])
        expect(bridge.query({ name: 'Show calendar' })).toEqual([])
        expect(bridge.query({ member: 'Button' })).toEqual([])
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
})
