import { render } from '@testing-library/react'
import axeCore, { type RunOptions } from 'axe-core'
import { useState } from 'react'
import { page, userEvent } from 'vitest/browser'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { createAgentBridge } from '@polymorph/engine/agent'

import { assertGoverned } from '@polymorph/react'
import { installTestTheme } from '@polymorph/engine/testing'
import { Combobox } from './Combobox'
import { MultiSelect, type MultiSelectOption, type MultiSelectProps } from './MultiSelect'
import { TagInput } from './TagInput'

/**
 * MultiSelect, in a real browser.
 *
 * These tests cover behaviour that needs a real browser: DOM focus stays in the input
 * while `aria-activedescendant` drives the listbox, selecting does not close the popup,
 * at max one popup both refuses adds and allows removals, and the value follows options
 * order whatever order the pointer picked. The states fixture already checks that the
 * states render. This file checks the behaviour between them.
 */

const ASSIGNEES: MultiSelectOption[] = [
  { value: 'ada', label: 'Ada Lovelace' },
  { value: 'grace', label: 'Grace Hopper' },
  { value: 'alan', label: 'Alan Turing' },
  { value: 'edsger', label: 'Edsger Dijkstra', disabled: true },
]

beforeAll(installTestTheme)

function mount(node: React.ReactElement): HTMLElement {
  return render(node).container.firstElementChild as HTMLElement
}

const input = (field: HTMLElement) => field.querySelector('input[type="text"]') as HTMLInputElement
const chevron = (field: HTMLElement) =>
  field.querySelector('[aria-label="Show options"]') as HTMLButtonElement
const listbox = () => document.querySelector('[role="listbox"]') as HTMLElement | null
const options = () => [...document.querySelectorAll('[role="option"]')] as HTMLElement[]
const optionNamed = (label: string) =>
  options().find((option) => option.textContent?.includes(label)) as HTMLElement

async function open(field: HTMLElement): Promise<void> {
  await userEvent.click(chevron(field))
  await vi.waitFor(() => expect(listbox()).not.toBeNull())
}

/* Viewport widths for the sheet tests (the conventions' sheet presentation). The
   viewport resets after every test, so each test that needs the narrow width sets it
   (as in sheet.test.tsx). */
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
    assertGoverned<MultiSelectProps>(true)
  })
})

describe('the focus boundary', () => {
  it('keeps DOM focus in the input while arrows drive the listbox', async () => {
    const field = mount(<MultiSelect options={ASSIGNEES} aria-label="Assignees" />)
    await userEvent.click(input(field))
    await userEvent.keyboard('{ArrowDown}')
    await vi.waitFor(() => expect(listbox()).not.toBeNull())

    expect(document.activeElement).toBe(input(field))
    expect(input(field).getAttribute('aria-expanded')).toBe('true')

    // The highlight is virtual. It moves and is announced through
    // `aria-activedescendant`, while focus stays put.
    const first = input(field).getAttribute('aria-activedescendant')
    expect(first).not.toBeNull()
    expect(document.getElementById(first as string)?.textContent).toContain('Ada')

    await userEvent.keyboard('{ArrowDown}')
    const second = input(field).getAttribute('aria-activedescendant')
    expect(document.getElementById(second as string)?.textContent).toContain('Grace')
    expect(document.activeElement).toBe(input(field))
  })

  it('skips a disabled option during keyboard navigation', async () => {
    const field = mount(<MultiSelect options={ASSIGNEES} aria-label="Assignees" />)
    await userEvent.click(input(field))
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}')

    // Ada → Grace → Alan. Edsger is disabled, so the highlight stops before him.
    const active = input(field).getAttribute('aria-activedescendant')
    expect(document.getElementById(active as string)?.textContent).toContain('Alan')
  })
})

describe('selection never dismisses', () => {
  it('toggles on pointer press and keeps the popup open and focus in the input', async () => {
    const onChange = vi.fn()
    const field = mount(
      <MultiSelect options={ASSIGNEES} onChange={onChange} aria-label="Assignees" />,
    )
    await open(field)

    await userEvent.click(optionNamed('Grace'))
    expect(onChange).toHaveBeenLastCalledWith(['grace'])
    expect(listbox()).not.toBeNull()
    expect(optionNamed('Grace').getAttribute('data-state')).toBe('checked')

    await userEvent.click(optionNamed('Ada'))
    expect(onChange).toHaveBeenLastCalledWith(['ada', 'grace'])
    expect(listbox()).not.toBeNull()
  })

  it('toggles the highlighted option on Enter without closing', async () => {
    const onChange = vi.fn()
    const field = mount(
      <MultiSelect options={ASSIGNEES} onChange={onChange} aria-label="Assignees" />,
    )
    await userEvent.click(input(field))
    await userEvent.keyboard('{ArrowDown}{Enter}')

    expect(onChange).toHaveBeenLastCalledWith(['ada'])
    expect(listbox()).not.toBeNull()

    // Enter again unchecks it, and the panel stays open.
    await userEvent.keyboard('{Enter}')
    expect(onChange).toHaveBeenLastCalledWith([])
    expect(listbox()).not.toBeNull()
  })

  it('reports options order, never click order', async () => {
    const onChange = vi.fn()
    const field = mount(
      <MultiSelect options={ASSIGNEES} onChange={onChange} aria-label="Assignees" />,
    )
    await open(field)

    await userEvent.click(optionNamed('Alan'))
    await userEvent.click(optionNamed('Ada'))
    expect(onChange).toHaveBeenLastCalledWith(['ada', 'alan'])

    // The chips use the same order as the reported value, because a selection is a set.
    const chips = [...field.querySelectorAll('li')].map((chip) => chip.textContent)
    expect(chips[0]).toContain('Ada')
    expect(chips[1]).toContain('Alan')
  })
})

describe('Escape, the APG order', () => {
  it('closes first and clears the filter text second', async () => {
    const field = mount(<MultiSelect options={ASSIGNEES} aria-label="Assignees" />)
    await userEvent.click(input(field))
    await userEvent.keyboard('gra')
    await vi.waitFor(() => expect(listbox()).not.toBeNull())
    expect(options()).toHaveLength(1)

    await userEvent.keyboard('{Escape}')
    await vi.waitFor(() => expect(listbox()).toBeNull())
    expect(input(field).value).toBe('gra')

    await userEvent.keyboard('{Escape}')
    expect(input(field).value).toBe('')
  })
})

describe('the async channel', () => {
  it('reports every keystroke and follows the controlled inputValue round-trip', async () => {
    const onInputChange = vi.fn()
    const view = render(
      <MultiSelect
        options={ASSIGNEES}
        inputValue=""
        onInputChange={onInputChange}
        aria-label="Assignees"
      />,
    )
    const field = view.container.firstElementChild as HTMLElement

    // Controlled means the parent owns the text. The keystroke is reported, and the
    // displayed text does not change until the prop does.
    await userEvent.click(input(field))
    await userEvent.keyboard('g')
    expect(onInputChange).toHaveBeenLastCalledWith('g')
    expect(input(field).value).toBe('')

    // The app passes the query back and the list narrows.
    view.rerender(
      <MultiSelect
        options={ASSIGNEES}
        inputValue="gra"
        onInputChange={onInputChange}
        aria-label="Assignees"
      />,
    )
    await vi.waitFor(() => expect(listbox()).not.toBeNull())
    expect(input(field).value).toBe('gra')
    expect(options()).toHaveLength(1)
    expect(options()[0]?.textContent).toContain('Grace')

    // Escape's second stage clears the text through the same callback.
    await userEvent.keyboard('{Escape}')
    await vi.waitFor(() => expect(listbox()).toBeNull())
    await userEvent.keyboard('{Escape}')
    expect(onInputChange).toHaveBeenLastCalledWith('')
  })

  it('renders server rows unfiltered under filter={false}', async () => {
    // Two "server results" for a query neither label contains. If the member filtered
    // them again, neither would render.
    const field = mount(
      <MultiSelect
        options={ASSIGNEES.slice(0, 2)}
        filter={false}
        inputValue="zzz"
        onInputChange={() => {}}
        defaultOpen
        aria-label="Assignees"
      />,
    )
    await vi.waitFor(() => expect(listbox()).not.toBeNull())
    expect(input(field).value).toBe('zzz')
    expect(options()).toHaveLength(2)
  })
})

describe('Backspace and chip navigation (as in TagInput)', () => {
  it('removes the last chip from an empty input, and Enter commits no text', async () => {
    const onChange = vi.fn()
    const field = mount(
      <MultiSelect
        options={ASSIGNEES}
        defaultValue={['ada', 'grace']}
        onChange={onChange}
        aria-label="Assignees"
      />,
    )
    await userEvent.click(input(field))
    await userEvent.keyboard('{Backspace}')
    expect(onChange).toHaveBeenLastCalledWith(['ada'])

    // By default typed text is only a filter. Enter with no highlighted option does
    // nothing. Adding typed text needs `allowCustom`'s row, which does not exist
    // without the flag.
    await userEvent.keyboard('zzz')
    await vi.waitFor(() => expect(listbox()).not.toBeNull())
    await userEvent.keyboard('{Enter}')
    expect(onChange).toHaveBeenLastCalledWith(['ada'])
  })

  it('moves between chips with arrows and returns to the input', async () => {
    const field = mount(
      <MultiSelect options={ASSIGNEES} defaultValue={['ada', 'grace']} aria-label="Assignees" />,
    )
    await userEvent.click(input(field))
    await userEvent.keyboard('{ArrowLeft}')
    expect((document.activeElement as HTMLElement).getAttribute('aria-label')).toBe(
      'Remove Grace Hopper',
    )

    await userEvent.keyboard('{ArrowLeft}')
    expect((document.activeElement as HTMLElement).getAttribute('aria-label')).toBe(
      'Remove Ada Lovelace',
    )

    await userEvent.keyboard('{ArrowRight}{ArrowRight}')
    expect(document.activeElement).toBe(input(field))
  })
})

describe('allowCustom — the mint row', () => {
  it('offers Add "{text}" for unmatched text, adds it on Enter, and clears the text', async () => {
    const onChange = vi.fn()
    const field = mount(
      <MultiSelect allowCustom options={ASSIGNEES} onChange={onChange} aria-label="Labels" />,
    )
    await userEvent.click(input(field))
    await userEvent.keyboard('on-call')
    await vi.waitFor(() => expect(optionNamed('Add "on-call"')).toBeDefined())

    const offer = optionNamed('Add "on-call"')
    expect(offer.dataset['mint']).toBe('')
    // It is the only visible row, so the highlight is on it. Enter adds the value
    // through the same toggle every option uses.
    await userEvent.keyboard('{Enter}')
    expect(onChange).toHaveBeenLastCalledWith(['on-call'])
    // The text cleared, and the chip is labelled by the value, not the `Add` label.
    expect(input(field).value).toBe('')
    expect(field.textContent).toContain('on-call')
    expect(field.textContent).not.toContain('Add "')
  })

  it('adds a custom value by pointer and keeps the popup open', async () => {
    const onChange = vi.fn()
    const field = mount(
      <MultiSelect allowCustom options={ASSIGNEES} onChange={onChange} aria-label="Labels" />,
    )
    await userEvent.click(input(field))
    await userEvent.keyboard('escalation')
    await vi.waitFor(() => expect(optionNamed('Add "escalation"')).toBeDefined())
    await userEvent.click(optionNamed('Add "escalation"'))
    expect(onChange).toHaveBeenLastCalledWith(['escalation'])
    expect(listbox()).not.toBeNull()
    expect(document.activeElement).toBe(input(field))
  })

  it('selects the mint row on release, so the row still exists for its mousedown', async () => {
    const onChange = vi.fn()
    const field = mount(
      <MultiSelect allowCustom options={ASSIGNEES} onChange={onChange} aria-label="Labels" />,
    )
    await userEvent.click(input(field))
    await userEvent.keyboard('escalation')
    await vi.waitFor(() => expect(optionNamed('Add "escalation"')).toBeDefined())
    const offer = optionNamed('Add "escalation"')

    // Press without releasing. A row selected on pointerdown would already be gone
    // here, so the mousedown that follows a real press would have no handler to cancel
    // it, and WebKit would then clear the input's focus. Chromium does not show that
    // focus loss, so this test checks the mechanism instead: the row is still mounted
    // and nothing has been added.
    // The event looks like a real pointer, because React Aria treats a 1×1 pointer
    // with no pressure as a virtual click and never starts the press. The release must
    // land on the pressed row, so the coordinates are the row's centre.
    const box = offer.getBoundingClientRect()
    const press = {
      bubbles: true,
      pointerId: 11,
      pointerType: 'mouse',
      isPrimary: true,
      button: 0,
      width: 23,
      height: 23,
      pressure: 0.5,
      clientX: box.x + box.width / 2,
      clientY: box.y + box.height / 2,
    }
    offer.dispatchEvent(new PointerEvent('pointerdown', press))
    expect(offer.isConnected).toBe(true)
    expect(onChange).not.toHaveBeenCalled()

    offer.dispatchEvent(new PointerEvent('pointerup', press))
    await vi.waitFor(() => expect(onChange).toHaveBeenLastCalledWith(['escalation']))
    expect(document.activeElement).toBe(input(field))
  })

  it('hides the mint row for a match, a duplicate, and rejected text', async () => {
    const field = mount(
      <MultiSelect
        allowCustom
        options={ASSIGNEES}
        defaultValue={['on-call']}
        aria-label="Labels"
      />,
    )
    await userEvent.click(input(field))

    // An existing option, matched by label (Intl-based equality). The real row is
    // shown, so no mint row duplicates it.
    await userEvent.keyboard('ada lovelace')
    await vi.waitFor(() => expect(optionNamed('Ada Lovelace')).toBeDefined())
    expect(options().some((option) => option.dataset['mint'] === '')).toBe(false)

    // Already selected: nothing to add.
    await userEvent.keyboard('{Escape}{Escape}')
    await userEvent.keyboard('on-call')
    await vi.waitFor(() => expect(listbox()).not.toBeNull())
    expect(options().some((option) => option.dataset['mint'] === '')).toBe(false)

    // Whitespace alone never becomes a value.
    await userEvent.keyboard('{Escape}{Escape}')
    await userEvent.keyboard('   ')
    await vi.waitFor(() => expect(listbox()).not.toBeNull())
    expect(options().some((option) => option.dataset['mint'] === '')).toBe(false)
  })

  it('normalizes through validate, and hides the row when validate rejects', async () => {
    const onChange = vi.fn()
    const validate = (raw: string) => {
      const trimmed = raw.trim().toLowerCase()
      return trimmed.includes(' ') ? null : trimmed
    }
    const field = mount(
      <MultiSelect
        allowCustom
        validate={validate}
        options={ASSIGNEES}
        onChange={onChange}
        aria-label="Labels"
      />,
    )
    await userEvent.click(input(field))
    await userEvent.keyboard('URGENT')
    await vi.waitFor(() => expect(optionNamed('Add "urgent"')).toBeDefined())
    await userEvent.keyboard('{Enter}')
    expect(onChange).toHaveBeenLastCalledWith(['urgent'])

    await userEvent.keyboard('two words')
    await vi.waitFor(() => expect(listbox()).not.toBeNull())
    expect(options().some((option) => option.dataset['mint'] === '')).toBe(false)
  })

  it('hides the mint row at max', async () => {
    const field = mount(
      <MultiSelect
        allowCustom
        max={1}
        options={ASSIGNEES}
        defaultValue={['ada']}
        aria-label="Labels"
      />,
    )
    // The input is read-only at max, so no text is typed. The test only opens the list.
    await open(field)
    expect(options().some((option) => option.dataset['mint'] === '')).toBe(false)
  })
})

describe('refusal is answered (the WCAG 3.3.1 correction)', () => {
  const live = (field: HTMLElement) =>
    [...field.querySelectorAll('[aria-live="polite"]')].map((node) => node.textContent).join(' ')

  it('flashes the field and announces why when Enter is pressed on rejected text', async () => {
    const field = mount(
      <MultiSelect allowCustom validate={() => null} options={ASSIGNEES} aria-label="Labels" />,
    )
    await userEvent.click(input(field))
    await userEvent.keyboard('nope')
    await vi.waitFor(() => expect(listbox()).not.toBeNull())
    // There is no mint row (validate rejected the text), so nothing is highlighted.
    expect(options().length).toBe(0)
    // The flag is observed rather than read afterwards, because the flash clears it when
    // the animation ends, which on a busy machine can happen before the next line runs.
    let flashed = false
    const watch = new MutationObserver(() => {
      if (field.dataset['refused'] === '') flashed = true
    })
    watch.observe(field, { attributes: true, attributeFilter: ['data-refused'] })
    await userEvent.keyboard('{Enter}')
    watch.disconnect()
    expect(flashed || field.dataset['refused'] === '').toBe(true)
    expect(live(field)).toContain('Cannot add "nope"')
  })

  it('names the value when Enter is pressed on one already selected', async () => {
    const field = mount(
      <MultiSelect
        allowCustom
        options={ASSIGNEES}
        defaultValue={['on-call']}
        aria-label="Labels"
      />,
    )
    await userEvent.click(input(field))
    await userEvent.keyboard('on-call')
    await vi.waitFor(() => expect(listbox()).not.toBeNull())
    await userEvent.keyboard('{Enter}')
    expect(live(field)).toContain('"on-call" is already selected')
  })

  it('without allowCustom, text is only a filter', async () => {
    const field = mount(<MultiSelect options={ASSIGNEES} aria-label="Labels" />)
    await userEvent.click(input(field))
    await userEvent.keyboard('nope{Enter}')
    expect(field.dataset['refused']).toBeUndefined()
  })
})

describe('the messages prop (the WCAG 3.1.2 correction)', () => {
  it('localizes the mint row, the announcement and the labels', async () => {
    const field = mount(
      <MultiSelect
        allowCustom
        options={ASSIGNEES}
        messages={{
          add: (text) => `Añadir «${text}»`,
          added: (value, count) => `${value} añadido, ${count} seleccionados`,
          showOptions: 'Mostrar opciones',
          selected: (count) => `${count} seleccionados`,
        }}
        aria-label="Etiquetas"
      />,
    )
    expect(field.querySelector('[aria-label="Mostrar opciones"]')).not.toBeNull()

    await userEvent.click(input(field))
    await userEvent.keyboard('turno')
    await vi.waitFor(() => expect(optionNamed('Añadir «turno»')).toBeDefined())
    await userEvent.keyboard('{Enter}')
    const spoken = [...field.querySelectorAll('[aria-live="polite"]')]
      .map((node) => node.textContent)
      .join(' ')
    expect(spoken).toContain('turno añadido, 1 seleccionados')
  })
})

describe('paging (as in Combobox)', () => {
  it('fires onLoadMore once per options length at the list end', async () => {
    const onLoadMore = vi.fn()
    const field = mount(
      <MultiSelect options={ASSIGNEES} onLoadMore={onLoadMore} aria-label="Assignees" />,
    )
    await open(field)
    listbox()?.dispatchEvent(new Event('scroll'))
    listbox()?.dispatchEvent(new Event('scroll'))
    expect(onLoadMore).toHaveBeenCalledTimes(1)
  })

  it('fires from keyboard navigation alone when the highlight reaches the last row', async () => {
    const onLoadMore = vi.fn()
    const field = mount(
      <MultiSelect options={ASSIGNEES} onLoadMore={onLoadMore} aria-label="Assignees" />,
    )
    // Open on the first row and move to the end with no scroll event. The delegate
    // skips the disabled row.
    await userEvent.click(input(field))
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}')
    await vi.waitFor(() => expect(onLoadMore).toHaveBeenCalledTimes(1))
    // Staying on the last row does not fire again until the app appends.
    await userEvent.keyboard('{ArrowDown}')
    expect(onLoadMore).toHaveBeenCalledTimes(1)
  })

  it('does not fire when the highlight reaches the mint row', async () => {
    const onLoadMore = vi.fn()
    const field = mount(
      <MultiSelect allowCustom options={ASSIGNEES} onLoadMore={onLoadMore} aria-label="Labels" />,
    )
    await userEvent.click(input(field))
    // No option matches the text, so the mint row is the only visible row and the
    // highlight lands on it.
    await userEvent.keyboard('escalations-rota')
    await vi.waitFor(() => expect(optionNamed('Add "escalations-rota"')).toBeDefined())
    expect(onLoadMore).not.toHaveBeenCalled()
  })

  it('does not fire while loading', async () => {
    const onLoadMore = vi.fn()
    const field = mount(
      <MultiSelect loading options={ASSIGNEES} onLoadMore={onLoadMore} aria-label="Assignees" />,
    )
    await open(field)
    listbox()?.dispatchEvent(new Event('scroll'))
    expect(onLoadMore).not.toHaveBeenCalled()
  })
})

describe('at max (as in TagInput)', () => {
  it('keeps the input focusable and read-only, refuses adds, allows removals', async () => {
    const onChange = vi.fn()
    const field = mount(
      <MultiSelect
        max={2}
        options={ASSIGNEES}
        defaultValue={['ada', 'grace']}
        onChange={onChange}
        aria-label="Assignees"
      />,
    )

    expect(field.hasAttribute('data-at-max')).toBe(true)
    expect(input(field).readOnly).toBe(true)
    await userEvent.click(input(field))
    expect(document.activeElement).toBe(input(field))

    // The description states the maximum, from the prop, in one element and one
    // sentence.
    const description = field.querySelector(`#${input(field).getAttribute('aria-describedby')}`)
    expect(description?.textContent).toBe('Maximum of 2 selected')

    await open(field)
    // An unchecked option uses the disabled recipe and ignores the toggle. `force`
    // skips Playwright's actionability wait. Playwright already refuses to press an
    // `aria-disabled` element, so forcing the click checks that the member also
    // ignores it.
    expect(optionNamed('Alan').hasAttribute('data-disabled')).toBe(true)
    await userEvent.click(optionNamed('Alan'), { force: true })
    expect(onChange).not.toHaveBeenCalled()

    // Unchecking is how a full field removes a value, so checked options stay active.
    await userEvent.click(optionNamed('Grace'))
    expect(onChange).toHaveBeenLastCalledWith(['ada'])

    // The first field's popup is still open. On the stacking scale an open overlay is
    // above page content, including the second instance this test mounts under the
    // panel. This test is not about which one paints on top, so the popup is closed
    // the way a user would close it.
    await userEvent.keyboard('{Escape}')

    // Backspace still removes the last chip, so a full field can be changed without
    // a mouse.
    const refilled = mount(
      <MultiSelect
        max={2}
        options={ASSIGNEES}
        defaultValue={['ada', 'grace']}
        aria-label="Assignees"
      />,
    )
    await userEvent.click(input(refilled))
    await userEvent.keyboard('{Backspace}')
    await vi.waitFor(() =>
      expect(
        [...refilled.querySelectorAll('li')].map((chip) => chip.textContent).join(),
      ).not.toContain('Grace'),
    )
  })
})

describe('the form post', () => {
  it('serialises comma-joined, options-ordered, and disabled with the field', () => {
    const field = mount(
      <MultiSelect
        name="assignees"
        options={ASSIGNEES}
        defaultValue={['grace', 'ada']}
        aria-label="Assignees"
      />,
    )
    const hidden = field.querySelector('input[type="hidden"]') as HTMLInputElement
    expect(hidden.name).toBe('assignees')
    expect(hidden.value).toBe('ada,grace')

    const off = mount(
      <MultiSelect
        name="assignees"
        disabled
        options={ASSIGNEES}
        defaultValue={['ada']}
        aria-label="Assignees"
      />,
    )
    expect((off.querySelector('input[type="hidden"]') as HTMLInputElement).disabled).toBe(true)
  })
})

/**
 * The spec names both parents: the field is TagInput's container, and the panel is
 * Select's recipe via Combobox. Both are copied into this member's stylesheet. Copies
 * can drift apart, so these tests compare the computed styles (Combobox compares
 * itself against Input for the same reason).
 */
describe('the recipes resolve to their parents’', () => {
  const box = (element: Element) => {
    const style = getComputedStyle(element)
    return {
      background: style.backgroundColor,
      border: `${style.borderTopWidth} ${style.borderTopStyle} ${style.borderTopColor}`,
      radius: style.borderTopLeftRadius,
      minHeight: style.minHeight,
      padding: `${style.paddingTop} ${style.paddingLeft}`,
      fontSize: style.fontSize,

      // The control seat shadow. Both parents use it, so the comparison includes it.
      // The overlay panels share `shadow-overlay`.
      shadow: style.boxShadow,
    }
  }

  it('the field resolves to TagInput’s container', () => {
    const field = mount(<MultiSelect options={ASSIGNEES} aria-label="Assignees" />)
    const parent = mount(<TagInput aria-label="Labels" />)
    expect(box(field)).toEqual(box(parent))
  })

  it('the panel resolves to Combobox’s', async () => {
    const field = mount(<MultiSelect options={ASSIGNEES} aria-label="Assignees" />)
    await open(field)
    const panel = listbox()?.parentElement as HTMLElement

    const sibling = mount(<Combobox defaultOpen options={[]} aria-label="Assignee" />)
    await vi.waitFor(() =>
      expect(document.querySelectorAll('[role="listbox"]').length).toBeGreaterThan(1),
    )
    const parentPanel = [...document.querySelectorAll('[role="listbox"]')]
      .map((node) => node.parentElement as HTMLElement)
      .find((node) => node !== panel) as HTMLElement

    expect(box(panel)).toEqual(box(parentPanel))
    expect(sibling).toBeTruthy()
  })
})

/**
 * The sheet below 30rem (the spec's sheet cell, the same as Combobox's; the
 * conventions' sheet presentation).
 *
 * The focus boundary still holds in the sheet. DOM focus stays in the input in the page,
 * the listbox uses `aria-activedescendant`, the sheet has no focus scope, and the scrim
 * dismisses without trapping focus. Selecting does not close the sheet, so several
 * picks need one open. The at-max rules are unchanged.
 */
describe('the sheet, below 30rem', () => {
  async function openSheet(node: React.ReactElement): Promise<HTMLElement> {
    await page.viewport(NARROW, 800)
    const field = mount(node)
    await userEvent.click(chevron(field))
    await vi.waitFor(() => expect(sheetPanel()).not.toBeNull())
    return field
  }

  it('shows a sheet under auto with the listbox inside, and the field keeps focus', async () => {
    const field = await openSheet(<MultiSelect options={ASSIGNEES} aria-label="Assignees" />)
    expect(sheetPanel()?.contains(listbox() as HTMLElement)).toBe(true)
    expect(sheetPanel()?.contains(field)).toBe(false)
    expect(document.activeElement).toBe(input(field))
    expect(listbox()?.getAttribute('aria-multiselectable')).toBe('true')
  })

  it('drives the sheet listbox by activedescendant while DOM focus never moves', async () => {
    const field = await openSheet(<MultiSelect options={ASSIGNEES} aria-label="Assignees" />)
    await userEvent.keyboard('{ArrowDown}')
    await vi.waitFor(() => {
      const active = input(field).getAttribute('aria-activedescendant')
      expect(active).toBeTruthy()
      const highlighted = options().find((option) => option.hasAttribute('data-highlighted'))
      expect(highlighted?.id).toBe(active)
    })
    expect(document.activeElement).toBe(input(field))
  })

  it('keeps the sheet open across several selections', async () => {
    const onChange = vi.fn()
    const field = await openSheet(
      <MultiSelect options={ASSIGNEES} onChange={onChange} aria-label="Assignees" />,
    )
    await userEvent.click(optionNamed('Grace Hopper'))
    await userEvent.click(optionNamed('Ada Lovelace'))

    // Both selections applied in options order, and the sheet stayed open.
    expect(onChange).toHaveBeenLastCalledWith(['ada', 'grace'])
    expect(sheetPanel()).not.toBeNull()
    await vi.waitFor(() => {
      expect(optionNamed('Grace Hopper').dataset['state']).toBe('checked')
      expect(optionNamed('Ada Lovelace').dataset['state']).toBe('checked')
    })
    // The chips appear in the field, in the page.
    expect(field.querySelectorAll('li').length).toBe(2)
    expect(document.activeElement).toBe(input(field))
  })

  it('filters in the sheet and highlights the first visible option', async () => {
    const field = await openSheet(<MultiSelect options={ASSIGNEES} aria-label="Assignees" />)
    await userEvent.type(input(field), 'gra')
    await vi.waitFor(() => {
      expect(options().map((option) => option.textContent)).toEqual(['Grace Hopper'])
      expect(options()[0]?.hasAttribute('data-highlighted')).toBe(true)
    })
    expect(sheetPanel()).not.toBeNull()
  })

  it('applies the at-max rules in the sheet, refusing adds and allowing removals', async () => {
    const field = await openSheet(
      <MultiSelect
        options={ASSIGNEES}
        defaultValue={['ada', 'grace']}
        max={2}
        aria-label="Assignees"
      />,
    )
    expect(field.dataset['atMax']).toBe('')
    expect(input(field).readOnly).toBe(true)

    // The unchecked option is disabled. It is clicked natively, because Playwright
    // waits for a disabled element to become enabled and this one never does (as in
    // select.test.tsx).
    expect(optionNamed('Alan Turing').dataset['disabled']).toBe('')
    const refused = optionNamed('Alan Turing')
    refused.click()
    expect(refused.dataset['state']).toBe('unchecked')

    // Unchecking removes a value from a full field, and the sheet stays open.
    await userEvent.click(optionNamed('Grace Hopper'))
    await vi.waitFor(() => expect(optionNamed('Grace Hopper').dataset['state']).toBe('unchecked'))
    expect(sheetPanel()).not.toBeNull()
    await vi.waitFor(() => expect(field.dataset['atMax']).toBeUndefined())
  })

  it('keeps Escape as the input’s two-stage handler: close first, then clear', async () => {
    const field = await openSheet(<MultiSelect options={ASSIGNEES} aria-label="Assignees" />)
    await userEvent.type(input(field), 'gra')

    await userEvent.keyboard('{Escape}')
    await vi.waitFor(() => expect(sheetPanel()).toBeNull())
    expect(input(field).value).toBe('gra')

    await userEvent.keyboard('{Escape}')
    await vi.waitFor(() => expect(input(field).value).toBe(''))
  })

  it('raises the field above the scrim so taps reach the chips and the input', async () => {
    const field = await openSheet(<MultiSelect options={ASSIGNEES} aria-label="Assignees" />)
    await userEvent.type(input(field), 'al')
    expect(field.hasAttribute('data-sheeting')).toBe(true)

    // As in Combobox. The in-page part of the control stacks above the portalled
    // scrim, so the browser's hit test returns the input, and the tap moves the caret
    // instead of dismissing.
    const box = input(field).getBoundingClientRect()
    const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)
    expect(hit).toBe(input(field))

    await userEvent.click(input(field))
    expect(sheetPanel()).not.toBeNull()
    expect(document.activeElement).toBe(input(field))
    expect(input(field).value).toBe('al')
  })

  it('dismisses on a scrim press without trapping', async () => {
    const field = await openSheet(<MultiSelect options={ASSIGNEES} aria-label="Assignees" />)
    await userEvent.click(scrim() as HTMLElement)
    await vi.waitFor(() => expect(sheetPanel()).toBeNull())
    expect(field.dataset['state']).toBe('closed')
  })

  it('pins the popper under presentation="popover", at the same width', async () => {
    await page.viewport(NARROW, 800)
    const field = mount(
      <MultiSelect options={ASSIGNEES} presentation="popover" defaultOpen aria-label="Assignees" />,
    )
    await vi.waitFor(() => expect(listbox()).not.toBeNull())
    expect(sheetPanel()).toBeNull()
    expect(listbox()?.parentElement?.getAttribute('data-side')).toBeTruthy()
    expect(field.dataset['state']).toBe('open')
  })

  it('never shows a sheet above the breakpoint', async () => {
    mount(<MultiSelect options={ASSIGNEES} defaultOpen aria-label="Assignees" />)
    await vi.waitFor(() => expect(listbox()).not.toBeNull())
    expect(sheetPanel()).toBeNull()
  })

  it('passes axe open', async () => {
    await openSheet(
      <MultiSelect options={ASSIGNEES} defaultValue={['ada']} aria-label="Assignees" />,
    )
    expect(await audit(document.body)).toEqual([])
  })
})

/**
 * An agent sets the whole selection through the bridge, as the spec's `agent` fence declares
 * (`design/components/multi-select.md`, Agent). The member holds its values, so the set reaches
 * the chips whether or not the caller controls it, and `onChange` reports it in options order.
 */
describe('an agent', () => {
  const chips = (field: HTMLElement) =>
    [...field.querySelectorAll('ul li')].map((chip) => chip.textContent)

  it('sets the selection of an uncontrolled and a controlled field, in options order', async () => {
    const bridge = createAgentBridge()
    try {
      const free = vi.fn()
      const held = vi.fn()
      function Held() {
        const [value, setValue] = useState<string[]>(['ada'])
        return (
          <MultiSelect
            aria-label="Held"
            options={ASSIGNEES}
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
          <MultiSelect aria-label="Free" options={ASSIGNEES} onChange={free} />
          <Held />
        </>,
      )
      const [one, two] = bridge.snapshot().members
      expect(one).toMatchObject({
        name: 'Free',
        state: {
          value: [],
          options: [
            { id: 'ada', label: 'Ada Lovelace' },
            { id: 'grace', label: 'Grace Hopper' },
            { id: 'alan', label: 'Alan Turing' },
            { id: 'edsger', label: 'Edsger Dijkstra', disabled: true },
          ],
          'input-value': '',
          open: false,
        },
      })

      const chosen = await bridge.act([{ id: one?.id, action: 'choose', value: ['alan', 'ada'] }])
      expect(chosen.results[0]).toMatchObject({
        ok: true,
        changed: { value: { from: [], to: ['ada', 'alan'] } },
      })
      expect(free).toHaveBeenLastCalledWith(['ada', 'alan'])
      const fields = container.querySelectorAll<HTMLElement>('[data-member="multi-select"]')
      await vi.waitFor(() => expect(chips(fields[0] as HTMLElement)).toHaveLength(2))

      const changed = await bridge.act([{ id: two?.id, action: 'choose', value: ['grace'] }])
      expect(changed.results[0]).toMatchObject({
        ok: true,
        changed: { value: { from: ['ada'], to: ['grace'] } },
      })
      expect(held).toHaveBeenLastCalledWith(['grace'])

      // An empty set clears the field.
      const cleared = await bridge.act([{ id: one?.id, action: 'choose', value: [] }])
      expect(cleared.results[0]).toMatchObject({ ok: true, changed: { value: { to: [] } } })

      // A disabled option is refused, and nothing is reported.
      const refused = await bridge.act([{ id: one?.id, action: 'choose', value: ['edsger'] }])
      expect(refused.results[0]).toMatchObject({ ok: false, error: { code: 'invalid-value' } })
      expect(free).toHaveBeenCalledTimes(2)
    } finally {
      bridge.dispose()
    }
  })

  it('refuses more values than the maximum, an unchosen option at it, and text while full', async () => {
    const bridge = createAgentBridge()
    try {
      const onChange = vi.fn()
      render(
        <MultiSelect
          aria-label="Reviewers"
          options={ASSIGNEES}
          max={2}
          defaultValue={['ada']}
          onChange={onChange}
        />,
      )
      const [member] = bridge.snapshot().members
      const over = await bridge.act([
        { id: member?.id, action: 'choose', value: ['ada', 'grace', 'alan'] },
      ])
      expect(over.results[0]).toMatchObject({
        ok: false,
        error: { code: 'failed', message: expect.stringContaining('at most 2') },
      })
      const full = await bridge.act([{ id: member?.id, action: 'choose', value: ['ada', 'grace'] }])
      expect(full.results[0]).toMatchObject({ ok: true })
      // At the maximum an unchosen option is disabled, as a person sees it.
      expect(bridge.snapshot().members[0]?.state['options']).toContainEqual({
        id: 'alan',
        label: 'Alan Turing',
        disabled: true,
      })
      const swapped = await bridge.act([{ id: member?.id, action: 'choose', value: ['alan'] }])
      expect(swapped.results[0]).toMatchObject({ ok: false, error: { code: 'invalid-value' } })
      const typed = await bridge.act([{ id: member?.id, action: 'fill', value: 'Ed' }])
      expect(typed.results[0]).toMatchObject({
        ok: false,
        error: { code: 'failed', message: expect.stringContaining('read-only') },
      })
      expect(onChange).toHaveBeenCalledTimes(1)
    } finally {
      bridge.dispose()
    }
  })

  it('lists a minted value as a choice labelled by itself, so a set can keep it', async () => {
    const bridge = createAgentBridge()
    try {
      const onInputChange = vi.fn()
      render(
        <MultiSelect
          aria-label="Labels"
          allowCustom
          options={ASSIGNEES}
          defaultValue={['ada', 'night-shift']}
          onInputChange={onInputChange}
        />,
      )
      const [member] = bridge.snapshot().members
      expect(member?.state['options']).toContainEqual({ id: 'night-shift', label: 'night-shift' })
      const kept = await bridge.act([
        { id: member?.id, action: 'choose', value: ['night-shift', 'grace'] },
      ])
      expect(kept.results[0]).toMatchObject({
        ok: true,
        changed: { value: { from: ['ada', 'night-shift'], to: ['grace', 'night-shift'] } },
      })
      const typed = await bridge.act([{ id: member?.id, action: 'fill', value: 'Gr' }])
      expect(typed.results[0]).toMatchObject({
        ok: true,
        changed: { 'input-value': { from: '', to: 'Gr' } },
      })
      expect(onInputChange).toHaveBeenLastCalledWith('Gr')
    } finally {
      bridge.dispose()
    }
  })
})
