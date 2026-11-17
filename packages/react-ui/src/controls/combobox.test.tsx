import { render, screen } from '@testing-library/react'
import axeCore, { type RunOptions } from 'axe-core'
import { useState } from 'react'
import { page, userEvent } from 'vitest/browser'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { createAgentBridge } from '@polymorph/engine/agent'

import { assertGoverned } from '@polymorph/react'
import { installTestTheme } from '@polymorph/engine/testing'
import { Combobox, type ComboboxOption, type ComboboxProps } from './Combobox'
import { Input } from './Input'
import { tokenColor, tokenLength } from './token-probe'

/**
 * Combobox, in a real browser.
 *
 * These tests cover the boundary between two libraries as much as the component. React Aria
 * drives a listbox it never focuses, and Radix positions a panel without trapping focus. Both can
 * only be observed with real focus, real pointer events and real measurement, which is why this
 * package runs in chromium.
 */

const PEOPLE: ComboboxOption[] = [
  { value: 'ada', label: 'Ada Lovelace' },
  { value: 'grace', label: 'Grace Hopper' },
  { value: 'alan', label: 'Alan Turing' },
]

beforeAll(installTestTheme)

function mount(node: React.ReactElement): HTMLElement {
  return render(node).container.firstElementChild as HTMLElement
}

const input = (field: HTMLElement) => field.querySelector('input') as HTMLInputElement
const chevron = (field: HTMLElement) =>
  field.querySelector('[aria-label="Show options"]') as HTMLButtonElement
const listbox = () => document.querySelector('[role="listbox"]') as HTMLElement | null
const options = () => [...document.querySelectorAll('[role="option"]')] as HTMLElement[]
const content = () => listbox()?.parentElement as HTMLElement

async function open(field: HTMLElement): Promise<HTMLElement> {
  await userEvent.click(chevron(field))
  await vi.waitFor(() => expect(listbox()).not.toBeNull())
  return field
}

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

describe('the closed surface', () => {
  it('has no style escape hatch', () => {
    assertGoverned<ComboboxProps>(true)
  })
})

/**
 * The spec says the trigger follows Input's recipe. Two separate stylesheets implement it, so the
 * guarantee must compare what they *resolve* to. Select's test makes the same comparison for the
 * same reason.
 */
describe('the field matches Input', () => {
  const shared = (element: Element) => {
    const style = getComputedStyle(element)
    return {
      height: style.height,
      background: style.backgroundColor,
      border: `${style.borderTopWidth} ${style.borderTopStyle} ${style.borderTopColor}`,
      radius: style.borderTopLeftRadius,
      fontSize: style.fontSize,
      paddingInline: style.paddingLeft,

      // The control seat shadow, used by the whole field family, is compared so it cannot drift.
      // The disabled comparison checks that both remove it.
      shadow: style.boxShadow,
    }
  }

  for (const size of ['sm', 'md', 'lg'] as const) {
    it(`matches Input at ${size}, in rest`, () => {
      const field = mount(<Combobox size={size} options={PEOPLE} aria-label="Assignee" />)
      const control = mount(<Input size={size} aria-label="Subject" />)
      expect(shared(field)).toEqual(shared(control))
    })
  }

  it('matches Input when invalid, and when disabled', () => {
    expect(shared(mount(<Combobox invalid options={PEOPLE} aria-label="A" />))).toEqual(
      shared(mount(<Input invalid aria-label="S" />)),
    )
    expect(shared(mount(<Combobox disabled options={PEOPLE} aria-label="A" />))).toEqual(
      shared(mount(<Input disabled aria-label="S" />)),
    )
  })
})

describe('the closed field', () => {
  it('starts closed and reports it', () => {
    const field = mount(<Combobox options={PEOPLE} aria-label="Assignee" />)
    expect(field.dataset['state']).toBe('closed')
    expect(input(field).getAttribute('role')).toBe('combobox')
    expect(input(field).getAttribute('aria-expanded')).toBe('false')
    expect(listbox()).toBeNull()
  })

  it('shows the selected label as the input’s text', () => {
    const field = mount(<Combobox options={PEOPLE} defaultValue="grace" aria-label="Assignee" />)
    expect(input(field).value).toBe('Grace Hopper')
  })

  it('accepts the FormField wiring a field would', () => {
    const field = mount(
      <Combobox
        options={PEOPLE}
        id="assignee"
        aria-describedby="assignee-error"
        aria-required
        invalid
        aria-label="Assignee"
      />,
    )
    expect(input(field).id).toBe('assignee')
    expect(input(field).getAttribute('aria-describedby')).toContain('assignee-error')
    expect(input(field).getAttribute('aria-required')).toBe('true')
    expect(input(field).getAttribute('aria-invalid')).toBe('true')
  })
})

describe('opening', () => {
  it('opens from the chevron and marks the field open', async () => {
    const field = await open(mount(<Combobox options={PEOPLE} aria-label="Assignee" />))
    expect(field.dataset['state']).toBe('open')
    expect(options()).toHaveLength(3)
  })

  /**
   * The focus boundary (`README-substrates.md`), asserted rather than assumed. The popup takes no
   * focus scope, so the caret never leaves the input and the listbox is driven by
   * `aria-activedescendant`. This is the one test that fails if someone uses a React Aria overlay
   * hook.
   */
  it('leaves DOM focus in the input, and drives the list by activedescendant', async () => {
    const field = mount(<Combobox options={PEOPLE} aria-label="Assignee" />)
    input(field).focus()
    await userEvent.keyboard('{ArrowDown}')
    await vi.waitFor(() => expect(listbox()).not.toBeNull())

    expect(document.activeElement).toBe(input(field))
    const active = input(field).getAttribute('aria-activedescendant')
    expect(active).toBeTruthy()
    expect(options()[0]?.id).toBe(active)
    expect(options()[0]?.dataset['highlighted']).toBe('')
  })

  it('is not a dialog, because the panel only positions its content', async () => {
    await open(mount(<Combobox options={PEOPLE} aria-label="Assignee" />))
    expect(document.querySelector('[role="dialog"]')).toBeNull()
  })

  it('anchors below its field with a small gap, and is at least as wide', async () => {
    const field = await open(mount(<Combobox options={PEOPLE} aria-label="Assignee" />))
    const box = content()
    expect(box.dataset['side']).toBe('bottom')
    const gap = box.getBoundingClientRect().top - field.getBoundingClientRect().bottom
    expect(gap).toBeCloseTo(2, 0)
    // `offsetWidth`, not the client rect, because the panel is mid-`scale-fade` on open.
    expect(box.offsetWidth).toBeGreaterThanOrEqual(field.offsetWidth)
  })

  it('paints the panel as a surface', async () => {
    await open(mount(<Combobox options={PEOPLE} aria-label="Assignee" />))
    const style = getComputedStyle(content())
    expect(style.backgroundColor).toBe(tokenColor('--pm-bg-overlay'))
    expect(style.borderTopColor).toBe(tokenColor('--pm-border-subtle'))
    expect(style.borderTopLeftRadius).toBe(tokenLength('--pm-radius-lg'))
    expect(style.boxShadow).not.toBe('none')
  })

  /**
   * Two comboboxes on one page. React Aria implements virtual focus by dispatching real `focus`
   * events on the option elements, and a Radix dismissable layer treats any focus outside itself
   * as a reason to close. So unless `onFocusOutside` is prevented, a second open combobox closes
   * the first. This test guards that fix.
   */
  it('lets two of them be open at once', async () => {
    render(
      <>
        <Combobox defaultOpen options={PEOPLE} aria-label="Assignee" />
        <Combobox defaultOpen options={PEOPLE} aria-label="Reporter" />
      </>,
    )
    await vi.waitFor(() => expect(document.querySelectorAll('[role="listbox"]')).toHaveLength(2))
    // Checked again after a delay, because a dismissal can arrive a tick later.
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(document.querySelectorAll('[role="listbox"]')).toHaveLength(2)
  })

  it('does not open when disabled', async () => {
    const field = mount(<Combobox disabled options={PEOPLE} aria-label="Assignee" />)
    expect(input(field).disabled).toBe(true)
    chevron(field).click()
    expect(listbox()).toBeNull()
  })
})

describe('filtering', () => {
  it('narrows on `contains`, the locale-aware default', async () => {
    const field = mount(<Combobox options={PEOPLE} aria-label="Assignee" />)
    await userEvent.click(input(field))
    await userEvent.keyboard('hopp')
    await vi.waitFor(() => expect(options()).toHaveLength(1))
    expect(options()[0]?.textContent).toContain('Grace Hopper')
  })

  it('narrows from the start when asked to', async () => {
    const field = mount(<Combobox filter="startsWith" options={PEOPLE} aria-label="Assignee" />)
    await userEvent.click(input(field))
    await userEvent.keyboard('hopp')
    await vi.waitFor(() => expect(options()).toHaveLength(0))
  })

  /** `false` is the async case: the app has filtered, and the member must not filter again. */
  it('leaves the list alone when the app owns the query', async () => {
    const field = mount(
      <Combobox
        filter={false}
        options={PEOPLE}
        inputValue="nothing matches this"
        onInputChange={() => {}}
        aria-label="Assignee"
      />,
    )
    await open(field)
    expect(options()).toHaveLength(3)
  })
})

describe('choosing', () => {
  it('commits on Enter, closes, and reports the value', async () => {
    const onChange = vi.fn()
    const field = mount(<Combobox options={PEOPLE} onChange={onChange} aria-label="Assignee" />)
    input(field).focus()
    await userEvent.keyboard('{ArrowDown}')
    await vi.waitFor(() => expect(listbox()).not.toBeNull())
    await userEvent.keyboard('{ArrowDown}{Enter}')

    expect(onChange).toHaveBeenCalledWith('grace')
    expect(input(field).value).toBe('Grace Hopper')
    await vi.waitFor(() => expect(field.dataset['state']).toBe('closed'))
  })

  it('marks the chosen option checked, and paints a highlight from the accent roles', async () => {
    const field = await open(
      mount(<Combobox options={PEOPLE} defaultValue="grace" aria-label="Assignee" />),
    )
    const checked = options().find((option) => option.dataset['state'] === 'checked')
    expect(checked?.textContent).toContain('Grace Hopper')

    const highlighted = options().find((option) => option.hasAttribute('data-highlighted'))
    expect(highlighted, 'nothing was highlighted').toBeDefined()
    // Waited for, because the wash arrives through `stateFeedback`'s transition and the first
    // frame still has the starting value.
    await vi.waitFor(() => {
      const style = getComputedStyle(highlighted as HTMLElement)
      expect(style.backgroundColor).toBe(tokenColor('--pm-accent-subtle'))
      expect(style.color).toBe(tokenColor('--pm-accent-text'))
    })
    expect(field.dataset['state']).toBe('open')
  })

  it('refuses a disabled option', async () => {
    const onChange = vi.fn()
    const field = mount(
      <Combobox
        options={[...PEOPLE, { value: 'archived', label: 'Archived', disabled: true }]}
        onChange={onChange}
        aria-label="Assignee"
      />,
    )
    await open(field)
    const archived = options().find((option) => option.textContent?.includes('Archived'))
    expect(archived?.dataset['disabled']).toBe('')
    expect(getComputedStyle(archived as HTMLElement).color).toBe(tokenColor('--pm-text-disabled'))
    archived?.click()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('closes on Escape and keeps the caret where it was', async () => {
    const field = mount(<Combobox options={PEOPLE} aria-label="Assignee" />)
    input(field).focus()
    await userEvent.keyboard('{ArrowDown}')
    await vi.waitFor(() => expect(listbox()).not.toBeNull())
    await userEvent.keyboard('{Escape}')
    await vi.waitFor(() => expect(field.dataset['state']).toBe('closed'))
    expect(document.activeElement).toBe(input(field))
  })
})

describe('touched-validation', () => {
  it('fires onBlur after the blur is resolved, when the draft is already gone', async () => {
    // Free text that matches nothing becomes `null` on blur, and the input restores the selected
    // label. The app's check on leave must read that resolved field, never the abandoned draft.
    // So the resolution runs first, and when the handler fires the input already holds the
    // restored value.
    const seen = vi.fn()
    const field = mount(
      <Combobox
        options={PEOPLE}
        defaultValue="ada"
        onBlur={(event) => seen((event.target as HTMLInputElement).value)}
        aria-label="Assignee"
      />,
    )

    input(field).focus()
    await userEvent.keyboard('zzz')
    input(field).blur()

    await vi.waitFor(() => expect(seen).toHaveBeenCalledTimes(1))
    expect(seen).toHaveBeenCalledWith('Ada Lovelace')
  })

  it('does not fire while focus stays in the field', async () => {
    const onBlur = vi.fn()
    const field = mount(<Combobox options={PEOPLE} onBlur={onBlur} aria-label="Assignee" />)
    input(field).focus()
    await userEvent.keyboard('{ArrowDown}')
    await vi.waitFor(() => expect(listbox()).not.toBeNull())
    // Arrowing through the listbox moves virtual focus only. DOM focus never left the input, and a
    // blur here would mark every keyboard user's field as touched before they chose anything.
    await userEvent.keyboard('{ArrowDown}')
    expect(onBlur).not.toHaveBeenCalled()
  })
})

describe('async loading', () => {
  it('holds the panel’s size with three skeleton rows, and spins in the field', async () => {
    const field = mount(<Combobox defaultOpen loading options={[]} aria-label="Assignee" />)
    await vi.waitFor(() => expect(listbox()).not.toBeNull())

    expect(field.dataset['loading']).toBe('')
    expect(chevron(field).querySelector('[data-icon="loading"]')).not.toBeNull()
    const rows = content().querySelectorAll('[data-shape="text"]')
    expect(rows).toHaveLength(3)

    // The glyph spins, as the spec requires, with MultiSelect's structure: the wrapper runs the
    // ambient animation, and the glyph fades in.
    const wrap = chevron(field).querySelector('[data-icon="loading"]')?.parentElement as HTMLElement
    expect(getComputedStyle(wrap).animationName).not.toBe('none')
  })

  it('announces loading once in a polite live region', async () => {
    const field = mount(<Combobox defaultOpen loading options={[]} aria-label="Assignee" />)
    await vi.waitFor(() => expect(listbox()).not.toBeNull())
    const status = field.querySelector('[role="status"]') as HTMLElement
    expect(status.textContent).toBe('Loading options…')
  })

  it('shows one muted row when nothing matched, and announces the same words', async () => {
    const field = mount(
      <Combobox defaultOpen options={[]} emptyMessage="No people found" aria-label="Assignee" />,
    )
    await vi.waitFor(() => expect(listbox()).not.toBeNull())

    const empty = [...content().children].find((child) => child.textContent === 'No people found')
    expect(empty, 'no empty row').toBeDefined()
    expect(getComputedStyle(empty as HTMLElement).color).toBe(tokenColor('--pm-text-muted'))
    // Hidden from assistive technology because the live region already announced it.
    expect((empty as HTMLElement).getAttribute('aria-hidden')).toBe('true')
    expect(field.querySelector('[role="status"]')?.textContent).toBe('No people found')
  })

  it('announces the result count', async () => {
    const field = mount(<Combobox defaultOpen options={PEOPLE} aria-label="Assignee" />)
    await vi.waitFor(() => expect(listbox()).not.toBeNull())
    expect(field.querySelector('[role="status"]')?.textContent).toBe('3 options')
  })
})

describe('clearing and serialising', () => {
  it('clears to null and returns focus to the input', async () => {
    const onChange = vi.fn()
    const field = mount(
      <Combobox
        clearable
        options={PEOPLE}
        defaultValue="alan"
        onChange={onChange}
        aria-label="Assignee"
      />,
    )
    await userEvent.click(field.querySelector('[aria-label="Clear"]') as HTMLElement)
    expect(onChange).toHaveBeenCalledWith(null)
    expect(input(field).value).toBe('')
    expect(document.activeElement).toBe(input(field))
  })

  it('offers no clear until there is something to clear', () => {
    const field = mount(<Combobox clearable options={PEOPLE} aria-label="Assignee" />)
    expect(field.querySelector('[aria-label="Clear"]')).toBeNull()
  })

  it('submits the selected value, not the typed text', () => {
    const { container } = render(
      <form>
        <Combobox name="assignee" options={PEOPLE} defaultValue="ada" aria-label="Assignee" />
      </form>,
    )
    const form = container.firstElementChild as HTMLFormElement
    expect(new FormData(form).get('assignee')).toBe('ada')
  })

  it('submits nothing when nothing is chosen', () => {
    const { container } = render(
      <form>
        <Combobox name="assignee" options={PEOPLE} aria-label="Assignee" />
      </form>,
    )
    expect(new FormData(container.firstElementChild as HTMLFormElement).get('assignee')).toBe('')
  })
})

describe('allowsCustomValue', () => {
  it('keeps the draft on blur and serialises it while nothing is selected', async () => {
    const { container } = render(
      <>
        <form>
          <Combobox allowsCustomValue name="assignee" options={PEOPLE} aria-label="Assignee" />
        </form>
        <Input aria-label="Elsewhere" />
      </>,
    )
    const form = container.querySelector('form') as HTMLFormElement
    const field = form.firstElementChild as HTMLElement

    await userEvent.click(input(field))
    await userEvent.keyboard('Quarterly review')
    // Real focus movement, not a pointer press, because the draft filtered the list to its empty
    // row and that open panel covers the other field.
    ;(container.querySelector('[aria-label="Elsewhere"]') as HTMLElement).focus()

    // Without the flag, the blur resolution clears the text and sets the value to null. With it,
    // the draft stays and the form posts it.
    await vi.waitFor(() => expect(input(field).value).toBe('Quarterly review'))
    expect(new FormData(form).get('assignee')).toBe('Quarterly review')
  })

  it('still serialises the selection once one is made', async () => {
    const { container } = render(
      <form>
        <Combobox
          allowsCustomValue
          name="assignee"
          options={PEOPLE}
          defaultValue="ada"
          aria-label="Assignee"
        />
      </form>,
    )
    const form = container.firstElementChild as HTMLFormElement
    expect(new FormData(form).get('assignee')).toBe('ada')
  })
})

describe('paging', () => {
  it('fires onLoadMore once per options length at the list end, and again after an append', async () => {
    const onLoadMore = vi.fn()
    const { rerender } = render(
      <Combobox defaultOpen options={PEOPLE} onLoadMore={onLoadMore} aria-label="Assignee" />,
    )
    await vi.waitFor(() => expect(listbox()).not.toBeNull())

    // A short list is already at its end, so any scroll counts as reaching the end. This is the
    // case the guard handles, because a wheel held at the end keeps scrolling.
    listbox()?.dispatchEvent(new Event('scroll'))
    listbox()?.dispatchEvent(new Event('scroll'))
    expect(onLoadMore).toHaveBeenCalledTimes(1)

    // The append resets it.
    rerender(
      <Combobox
        defaultOpen
        options={[...PEOPLE, { value: 'annie', label: 'Annie Easley' }]}
        onLoadMore={onLoadMore}
        aria-label="Assignee"
      />,
    )
    listbox()?.dispatchEvent(new Event('scroll'))
    expect(onLoadMore).toHaveBeenCalledTimes(2)
  })

  it('does not fire while loading', async () => {
    const onLoadMore = vi.fn()
    mount(
      <Combobox
        defaultOpen
        loading
        options={PEOPLE}
        onLoadMore={onLoadMore}
        aria-label="Assignee"
      />,
    )
    await vi.waitFor(() => expect(listbox()).not.toBeNull())
    listbox()?.dispatchEvent(new Event('scroll'))
    expect(onLoadMore).not.toHaveBeenCalled()
  })

  it('fires from keyboard navigation alone when the highlight reaches the last row', async () => {
    const onLoadMore = vi.fn()
    const field = mount(
      <Combobox defaultOpen options={PEOPLE} onLoadMore={onLoadMore} aria-label="Assignee" />,
    )
    await vi.waitFor(() => expect(listbox()).not.toBeNull())
    // Real focus, not a click, because a pointer press on the input closes the open popup and the
    // test needs it open.
    input(field).focus()
    // Down the whole list with no scroll event. The highlight position triggers the request.
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}')
    await vi.waitFor(() => expect(onLoadMore).toHaveBeenCalledTimes(1))
    // Staying on the last row requests nothing more until the app appends.
    await userEvent.keyboard('{ArrowDown}')
    expect(onLoadMore).toHaveBeenCalledTimes(1)
  })
})

describe('localizable messages (WCAG 3.1.2)', () => {
  it('localizes the field labels through messages', () => {
    const field = mount(
      <Combobox
        clearable
        options={PEOPLE}
        defaultValue="ada"
        messages={{ showOptions: 'Mostrar opciones', clear: 'Borrar' }}
        aria-label="Responsable"
      />,
    )
    expect(field.querySelector('[aria-label="Mostrar opciones"]')).not.toBeNull()
    expect(field.querySelector('[aria-label="Borrar"]')).not.toBeNull()
  })
})

/**
 * The sheet, below 30rem (combobox.md's sheet cell, using the conventions' sheet presentation).
 *
 * The focus boundary still holds after re-anchoring. DOM focus never leaves the input in the page,
 * the listbox is still driven by `aria-activedescendant`, the sheet takes no focus scope, and the
 * scrim is only a dismiss target. The collection hooks are unaffected by the presentation.
 */
describe('the sheet, below 30rem', () => {
  async function openSheet(node: React.ReactElement): Promise<HTMLElement> {
    await page.viewport(NARROW, 800)
    const field = mount(node)
    await userEvent.click(chevron(field))
    await vi.waitFor(() => expect(sheetPanel()).not.toBeNull())
    return field
  }

  it('shows a sheet under auto with the listbox inside, and the field stays in the page', async () => {
    const field = await openSheet(<Combobox options={PEOPLE} aria-label="Assignee" />)
    const list = listbox() as HTMLElement
    expect(sheetPanel()?.contains(list)).toBe(true)
    // The field did not move into the sheet.
    expect(sheetPanel()?.contains(field)).toBe(false)
    expect(field.dataset['state']).toBe('open')
  })

  it('keeps DOM focus in the input while arrows drive the sheet listbox by activedescendant', async () => {
    const field = await openSheet(<Combobox options={PEOPLE} aria-label="Assignee" />)
    expect(document.activeElement).toBe(input(field))

    await userEvent.keyboard('{ArrowDown}')
    await vi.waitFor(() => {
      const active = input(field).getAttribute('aria-activedescendant')
      expect(active).toBeTruthy()
      const highlighted = options().find((option) => option.hasAttribute('data-highlighted'))
      expect(highlighted?.id).toBe(active)
    })
    // Focus never moved, which is what the boundary requires.
    expect(document.activeElement).toBe(input(field))
  })

  it('filters in the sheet the same way as in the popover', async () => {
    const field = await openSheet(<Combobox options={PEOPLE} aria-label="Assignee" />)
    await userEvent.type(input(field), 'gra')
    await vi.waitFor(() => {
      expect(options().map((option) => option.textContent)).toEqual(['Grace Hopper'])
    })
    expect(sheetPanel()).not.toBeNull()
  })

  it('commits on a press, closes, and fills the input, because a single choice dismisses', async () => {
    const onChange = vi.fn()
    const field = await openSheet(
      <Combobox options={PEOPLE} onChange={onChange} aria-label="Assignee" />,
    )
    await userEvent.click(options()[1] as HTMLElement)
    expect(onChange).toHaveBeenCalledWith('grace')
    await vi.waitFor(() => expect(sheetPanel()).toBeNull())
    expect(input(field).value).toBe('Grace Hopper')
  })

  it('leaves Escape to the input, which closes the sheet and reverts the draft in React Aria’s order', async () => {
    // Like the blur resolution: with a selection in place, Escape closes and the abandoned draft
    // reverts to the selected label. The same key does the same next to the popover, because the
    // handler is on the input and the input never moved.
    const field = await openSheet(
      <Combobox options={PEOPLE} defaultValue="ada" aria-label="Assignee" />,
    )
    await userEvent.type(input(field), 'zzz')

    await userEvent.keyboard('{Escape}')
    await vi.waitFor(() => expect(sheetPanel()).toBeNull())
    await vi.waitFor(() => expect(input(field).value).toBe('Ada Lovelace'))
    expect(document.activeElement).toBe(input(field))
  })

  it('raises the field above the scrim, so a tap on the input moves the caret', async () => {
    const field = await openSheet(<Combobox options={PEOPLE} aria-label="Assignee" />)
    await userEvent.type(input(field), 'al')
    expect(field.hasAttribute('data-sheeting')).toBe(true)

    /*
     * Without the raise, this tap lands on the scrim, dismissing the sheet and clearing the query.
     * The field is raised one intra-member step above the overlay layer, so the browser's hit test
     * must return the input.
     */
    const box = input(field).getBoundingClientRect()
    const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)
    expect(hit).toBe(input(field))

    await userEvent.click(input(field))
    expect(sheetPanel()).not.toBeNull()
    expect(document.activeElement).toBe(input(field))
    expect(input(field).value).toBe('al')
  })

  it('dismisses on a scrim press without trapping focus', async () => {
    const field = await openSheet(<Combobox options={PEOPLE} aria-label="Assignee" />)
    await userEvent.click(scrim() as HTMLElement)
    await vi.waitFor(() => expect(sheetPanel()).toBeNull())
    expect(field.dataset['state']).toBe('closed')
  })

  it('shows the loading skeleton rows in the sheet at option height', async () => {
    await page.viewport(NARROW, 800)
    const field = mount(<Combobox loading options={[]} aria-label="Assignee" />)
    await userEvent.click(chevron(field))
    await vi.waitFor(() => expect(sheetPanel()).not.toBeNull())
    const rows = sheetPanel()?.querySelectorAll('[aria-hidden="true"] > *')
    expect(rows?.length).toBe(3)
    expect(field.dataset['loading']).toBe('')
  })

  it('keeps the popover under presentation="popover" at the same width', async () => {
    await page.viewport(NARROW, 800)
    const field = mount(
      <Combobox options={PEOPLE} presentation="popover" defaultOpen aria-label="Assignee" />,
    )
    await vi.waitFor(() => expect(listbox()).not.toBeNull())
    expect(sheetPanel()).toBeNull()
    // Radix's popover sets `data-side` because it is anchored.
    expect(content().getAttribute('data-side')).toBeTruthy()
    expect(field.dataset['state']).toBe('open')
  })

  it('never uses a sheet above the breakpoint', async () => {
    mount(<Combobox options={PEOPLE} defaultOpen aria-label="Assignee" />)
    await vi.waitFor(() => expect(listbox()).not.toBeNull())
    expect(sheetPanel()).toBeNull()
  })

  it('passes axe open', async () => {
    await openSheet(<Combobox options={PEOPLE} defaultValue="ada" aria-label="Assignee" />)
    expect(await audit(document.body)).toEqual([])
  })
})

describe('the phone minimum font size, below 30rem', () => {
  it('gives the real input the text-entry floor’s size and line height, and changes nothing else', async () => {
    await page.viewport(NARROW, 800)
    const field = mount(<Combobox options={PEOPLE} aria-label="Assignee" />)

    await vi.waitFor(() => {
      expect(getComputedStyle(input(field)).fontSize).toBe(tokenLength('--pm-text-entry-size'))
    })
    // The container keeps its own text size. Nothing outside the input changes.
    expect(getComputedStyle(field).fontSize).toBe(tokenLength('--pm-text-sm-size'))
  })
})

/**
 * An agent chooses, types and clears through the bridge, as the spec's `agent` fence declares
 * (`design/components/combobox.md`, Agent). React Aria holds the value, so the choice reaches the
 * field whether or not the caller controls it, and `onChange` reports it.
 */
describe('an agent', () => {
  const CHOICES: ComboboxOption[] = [
    ...PEOPLE,
    { value: 'archived', label: 'Archived', disabled: true },
  ]

  it('chooses in an uncontrolled and a controlled Combobox, among options the text hides', async () => {
    const bridge = createAgentBridge()
    try {
      const free = vi.fn()
      const held = vi.fn()
      function Held() {
        const [value, setValue] = useState<string | null>('ada')
        return (
          <Combobox
            aria-label="Held"
            options={CHOICES}
            value={value}
            onChange={(next) => {
              held(next)
              setValue(next)
            }}
          />
        )
      }
      render(
        <>
          <Combobox aria-label="Free" options={CHOICES} defaultValue="grace" onChange={free} />
          <Held />
        </>,
      )
      const [one, two] = bridge.snapshot().members
      expect(one).toMatchObject({
        name: 'Free',
        state: {
          value: 'grace',
          options: [
            { id: 'ada', label: 'Ada Lovelace' },
            { id: 'grace', label: 'Grace Hopper' },
            { id: 'alan', label: 'Alan Turing' },
            { id: 'archived', label: 'Archived', disabled: true },
          ],
          'input-value': 'Grace Hopper',
          open: false,
          disabled: false,
          invalid: false,
        },
      })

      // The field's text leaves only Grace Hopper, and the agent chooses Alan Turing. React Aria
      // writes the label into the field in an effect after the value, which WebKit can run after
      // the step reports, so the field is waited for.
      const chosen = await bridge.act([{ id: one?.id, action: 'choose', value: 'alan' }])
      expect(chosen.results[0]).toMatchObject({
        ok: true,
        changed: { value: { from: 'grace', to: 'alan' } },
      })
      expect(free).toHaveBeenLastCalledWith('alan')
      await vi.waitFor(() =>
        expect(screen.getByRole('combobox', { name: 'Free' })).toHaveProperty(
          'value',
          'Alan Turing',
        ),
      )

      const changed = await bridge.act([{ id: two?.id, action: 'choose', value: 'grace' }])
      expect(changed.results[0]).toMatchObject({
        ok: true,
        changed: { value: { from: 'ada', to: 'grace' } },
      })
      expect(held).toHaveBeenLastCalledWith('grace')

      // A disabled option is refused, and nothing is reported.
      const refused = await bridge.act([{ id: one?.id, action: 'choose', value: 'archived' }])
      expect(refused.results[0]).toMatchObject({ ok: false, error: { code: 'invalid-value' } })
      expect(free).toHaveBeenCalledTimes(1)
    } finally {
      bridge.dispose()
    }
  })

  it('types a query that onInputChange reports, and clears the choice and the text', async () => {
    const bridge = createAgentBridge()
    try {
      const onChange = vi.fn()
      const onInputChange = vi.fn()
      render(
        <Combobox
          aria-label="Assignee"
          options={PEOPLE}
          defaultValue="ada"
          onChange={onChange}
          onInputChange={onInputChange}
        />,
      )
      const [member] = bridge.snapshot().members
      const typed = await bridge.act([{ id: member?.id, action: 'fill', value: 'Gra' }])
      expect(typed.results[0]).toMatchObject({
        ok: true,
        changed: { 'input-value': { from: 'Ada Lovelace', to: 'Gra' } },
      })
      expect(onInputChange).toHaveBeenLastCalledWith('Gra')

      const cleared = await bridge.act([{ id: member?.id, action: 'clear' }])
      expect(cleared.results[0]).toMatchObject({
        ok: true,
        changed: { value: { from: 'ada', to: null } },
      })
      expect(onChange).toHaveBeenLastCalledWith(null)
      await vi.waitFor(() =>
        expect(screen.getByRole('combobox', { name: 'Assignee' })).toHaveProperty('value', ''),
      )
    } finally {
      bridge.dispose()
    }
  })

  it('opens the list on every option, as the chevron does, and closes it', async () => {
    const bridge = createAgentBridge()
    try {
      render(<Combobox aria-label="Assignee" options={PEOPLE} defaultValue="ada" />)
      const [member] = bridge.snapshot().members
      const opened = await bridge.act([{ id: member?.id, action: 'open' }])
      expect(opened.results[0]).toMatchObject({
        ok: true,
        changed: { open: { from: false, to: true } },
      })
      await vi.waitFor(() => expect(options()).toHaveLength(PEOPLE.length))
      const closed = await bridge.act([{ id: member?.id, action: 'close' }])
      expect(closed.results[0]).toMatchObject({
        ok: true,
        changed: { open: { from: true, to: false } },
      })
      await vi.waitFor(() => expect(listbox()).toBeNull())
    } finally {
      bridge.dispose()
    }
  })
})
