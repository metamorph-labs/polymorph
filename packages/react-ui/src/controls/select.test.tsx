import { act, render, screen } from '@testing-library/react'
import { useState } from 'react'
import axeCore, { type RunOptions } from 'axe-core'
import { page, userEvent } from 'vitest/browser'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { assertGoverned } from '@polymorph/react'
import { selectValueLaw, SELECT_VALUE_LAW_OPTIONS } from '@polymorph/conformance/select-value'
import { createAgentBridge } from '@polymorph/engine/agent'
import { installTestTheme } from '@polymorph/engine/testing'
import { Input } from './Input'
import { Select, type SelectOption, type SelectProps } from './Select'
import { tokenColor, tokenLength } from './token-probe'

/**
 * Select, in a real browser. This is why `@polymorph/react-ui` tests run in chromium. Radix's
 * listbox needs real pointer and keyboard APIs, and the panel is portalled and positioned
 * by measurement. jsdom cannot be relied on for any of these.
 */

const OPTIONS: SelectOption[] = [
  { value: 'urgent', label: 'Urgent' },
  { value: 'high', label: 'High' },
  { value: 'normal', label: 'Normal' },
]

beforeAll(installTestTheme)

/** RTL's container: attached to the body so the cascade applies, and cleaned up by RTL. */
function mount(node: React.ReactElement): HTMLElement {
  return render(node).container.firstElementChild as HTMLElement
}

const items = () => [...document.querySelectorAll('[role="option"]')] as HTMLElement[]
const panel = () => document.querySelector('[role="listbox"]') as HTMLElement | null

/* Viewport widths for the sheet tests (the conventions' sheet presentation). The
   viewport resets after every test, so each test that needs the narrow width sets it
   explicitly instead of inheriting it (as in sheet.test.tsx). */
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
    assertGoverned<SelectProps>(true)
  })
})

/**
 * The spec says the trigger uses Input's recipe "in every state". Two stylesheets
 * define it separately, so the test compares computed values. Matching source text
 * proves nothing, and this catches the two drifting apart.
 */
describe('the trigger matches Input', () => {
  const shared = (element: Element) => {
    const style = getComputedStyle(element)
    return {
      height: style.height,
      background: style.backgroundColor,
      border: `${style.borderTopWidth} ${style.borderTopStyle} ${style.borderTopColor}`,
      radius: style.borderTopLeftRadius,
      fontSize: style.fontSize,
      paddingInline: style.paddingLeft,

      // The control seat shadow, used by the whole field family. Compared here so it
      // cannot drift. The disabled case is compared too, because both must remove it.
      shadow: style.boxShadow,
    }
  }

  for (const size of ['sm', 'md', 'lg'] as const) {
    it(`matches Input at ${size}, in rest`, () => {
      const trigger = mount(<Select size={size} options={OPTIONS} aria-label="Priority" />)
      const field = mount(<Input size={size} aria-label="Subject" />)
      expect(shared(trigger)).toEqual(shared(field))
    })
  }

  it('matches Input when invalid, and when disabled', () => {
    expect(shared(mount(<Select invalid options={OPTIONS} aria-label="P" />))).toEqual(
      shared(mount(<Input invalid aria-label="S" />)),
    )
    expect(shared(mount(<Select disabled options={OPTIONS} aria-label="P" />))).toEqual(
      shared(mount(<Input disabled aria-label="S" />)),
    )
  })
})

describe('the closed trigger', () => {
  it('starts closed and reports it', () => {
    const trigger = mount(<Select options={OPTIONS} placeholder="Choose" aria-label="Priority" />)
    expect(trigger.dataset['state']).toBe('closed')
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
  })

  it('shows the placeholder in the muted role until there is a value', () => {
    const empty = mount(<Select options={OPTIONS} placeholder="Choose" aria-label="Priority" />)
    expect(empty.dataset['placeholder']).toBe('')
    expect(getComputedStyle(empty).color).toBe(tokenColor('--pm-text-muted'))

    const chosen = mount(<Select options={OPTIONS} defaultValue="high" aria-label="Priority" />)
    expect(chosen.dataset['placeholder']).toBeUndefined()
    expect(chosen.textContent).toContain('High')
    expect(getComputedStyle(chosen).color).toBe(tokenColor('--pm-text-primary'))
  })

  it('accepts the same FormField wiring as a field', () => {
    const trigger = mount(
      <Select
        options={OPTIONS}
        id="priority"
        aria-describedby="priority-error"
        aria-required
        invalid
        aria-label="Priority"
      />,
    )
    expect(trigger.id).toBe('priority')
    expect(trigger.getAttribute('aria-describedby')).toBe('priority-error')
    expect(trigger.getAttribute('aria-required')).toBe('true')
    expect(trigger.getAttribute('aria-invalid')).toBe('true')
  })

  it('keeps Radix’s own state attributes, which a spread of undefined values would erase', () => {
    const trigger = mount(<Select disabled options={OPTIONS} aria-label="Priority" />)
    expect(trigger.dataset['disabled']).toBe('')
    expect(trigger.dataset['state']).toBe('closed')
  })
})

describe('opening', () => {
  it('opens on click and marks the trigger open', async () => {
    const trigger = mount(<Select options={OPTIONS} placeholder="Choose" aria-label="Priority" />)
    await userEvent.click(trigger)
    expect(panel()).not.toBeNull()
    expect(trigger.dataset['state']).toBe('open')
    expect(items()).toHaveLength(3)
  })

  it('opens from the keyboard', async () => {
    const trigger = mount(<Select options={OPTIONS} placeholder="Choose" aria-label="Priority" />)
    trigger.focus()
    await userEvent.keyboard('{Enter}')
    expect(panel()).not.toBeNull()
  })

  it('rotates the chevron while open, and only then', async () => {
    const trigger = mount(<Select options={OPTIONS} placeholder="Choose" aria-label="Priority" />)
    const chevron = trigger.querySelector('svg[data-icon="expand"]')?.parentElement as HTMLElement
    expect(getComputedStyle(chevron).transform).toBe('none')
    await userEvent.click(trigger)
    expect(getComputedStyle(chevron).transform).not.toBe('none')
  })

  it('anchors below its trigger with a hairline gap', async () => {
    // A rule, not a preference (select.md). Popper mode, because the anchored origin
    // reads side data that only popper provides. A 2px gap so the panel's border does
    // not merge with the trigger's into one line.
    const trigger = mount(<Select options={OPTIONS} placeholder="Choose" aria-label="Priority" />)
    await userEvent.click(trigger)
    const content = panel() as HTMLElement
    expect(content.dataset['side']).toBe('bottom')
    expect(content.dataset['align']).toBe('start')
    const gap = content.getBoundingClientRect().top - trigger.getBoundingClientRect().bottom
    expect(gap).toBeCloseTo(2, 0)
  })

  it('sizes the panel to at least the trigger, from the measured width', async () => {
    const trigger = mount(<Select options={OPTIONS} placeholder="Choose" aria-label="Priority" />)
    await userEvent.click(trigger)
    const content = panel() as HTMLElement
    // `offsetWidth`, not the client rect. The panel is mid-`scale-fade` on open, and a
    // bounding rect would report the layout width times the enter scale.
    expect(content.offsetWidth).toBeGreaterThanOrEqual(trigger.offsetWidth)
  })
})

describe('choosing', () => {
  it('reports the value and closes', async () => {
    const onChange = vi.fn()
    const trigger = mount(
      <Select options={OPTIONS} placeholder="Choose" onChange={onChange} aria-label="Priority" />,
    )
    await userEvent.click(trigger)
    await userEvent.click(items()[1] as HTMLElement)
    expect(onChange).toHaveBeenCalledWith('high')
    expect(trigger.textContent).toContain('High')
  })

  it('moves the selection with the arrow keys and commits on Enter', async () => {
    const onChange = vi.fn()
    const trigger = mount(
      <Select options={OPTIONS} defaultValue="urgent" onChange={onChange} aria-label="Priority" />,
    )
    trigger.focus()
    await userEvent.keyboard('{Enter}')
    await userEvent.keyboard('{ArrowDown}')
    await userEvent.keyboard('{Enter}')
    expect(onChange).toHaveBeenCalledWith('high')
  })

  it('marks the chosen item checked, and highlights the one under the cursor', async () => {
    const trigger = mount(<Select options={OPTIONS} defaultValue="high" aria-label="Priority" />)
    await userEvent.click(trigger)
    const checked = items().find((item) => item.dataset['state'] === 'checked')
    expect(checked?.textContent).toContain('High')
    expect(items().some((item) => item.hasAttribute('data-highlighted'))).toBe(true)
  })

  it('colours a highlighted item from the accent roles', async () => {
    const trigger = mount(<Select options={OPTIONS} defaultValue="high" aria-label="Priority" />)
    await userEvent.click(trigger)
    const highlighted = items().find((item) => item.hasAttribute('data-highlighted')) as HTMLElement
    // Waited for, because the background changes through `stateFeedback`'s transition,
    // and the first frame still shows the starting value.
    await vi.waitFor(() => {
      const style = getComputedStyle(highlighted)
      expect(style.backgroundColor).toBe(tokenColor('--pm-accent-subtle'))
      expect(style.color).toBe(tokenColor('--pm-accent-text'))
    })
  })

  it('ignores a disabled option', async () => {
    const onChange = vi.fn()
    const trigger = mount(
      <Select
        options={[...OPTIONS, { value: 'archived', label: 'Archived', disabled: true }]}
        placeholder="Choose"
        onChange={onChange}
        aria-label="Priority"
      />,
    )
    await userEvent.click(trigger)
    const archived = items().find((item) => item.textContent?.includes('Archived')) as HTMLElement
    expect(archived.dataset['disabled']).toBe('')
    expect(getComputedStyle(archived).color).toBe(tokenColor('--pm-text-disabled'))
    // A native click, for the same reason as in the disabled-trigger test.
    archived.click()
    expect(onChange).not.toHaveBeenCalled()
    expect(panel(), 'a disabled option closed the panel').not.toBeNull()
  })

  it('closes on Escape and returns focus to the trigger', async () => {
    const trigger = mount(<Select options={OPTIONS} placeholder="Choose" aria-label="Priority" />)
    await userEvent.click(trigger)
    await userEvent.keyboard('{Escape}')
    expect(trigger.dataset['state']).toBe('closed')
    await vi.waitFor(() => expect(document.activeElement).toBe(trigger))
  })

  it('does not open when disabled', async () => {
    // A native click rather than the pointer harness. Playwright waits for an element
    // to become enabled, and this one never does, which is what the test checks.
    const trigger = mount(<Select disabled options={OPTIONS} aria-label="Priority" />)
    expect((trigger as HTMLButtonElement).disabled).toBe(true)
    trigger.click()
    expect(panel()).toBeNull()
  })
})

/**
 * The empty choice (select.md).
 *
 * Radix reserves `''` for "nothing selected". Without this feature, every screen that
 * wants a selectable "Any status" would invent its own sentinel string. These tests cover
 * the shared solution: one empty choice, `null` as its only public value, and a private
 * Radix value that never leaks.
 */
describe('the empty choice', () => {
  it('is the first item, before the given options', async () => {
    const trigger = mount(<Select options={OPTIONS} emptyOption="Any status" aria-label="Status" />)
    await userEvent.click(trigger)
    expect(items()).toHaveLength(OPTIONS.length + 1)
    expect(items()[0]?.textContent).toContain('Any status')
  })

  it('shows on the trigger as a real value, not as a placeholder', () => {
    // The key point of the empty choice: "Any status" is a chosen state, so it is not
    // styled as a missing value.
    const trigger = mount(<Select options={OPTIONS} emptyOption="Any status" aria-label="Status" />)
    expect(trigger.textContent).toContain('Any status')
    expect(trigger.dataset['placeholder']).toBeUndefined()
    expect(getComputedStyle(trigger).color).toBe(tokenColor('--pm-text-primary'))
  })

  it('is checked when it is the selection', async () => {
    const trigger = mount(
      <Select options={OPTIONS} emptyOption="Any status" defaultValue={null} aria-label="Status" />,
    )
    await userEvent.click(trigger)
    expect(items()[0]?.dataset['state']).toBe('checked')
  })

  it('reports null rather than a string', async () => {
    const onChange = vi.fn()
    const trigger = mount(
      <Select
        options={OPTIONS}
        emptyOption="Any status"
        defaultValue="high"
        onChange={onChange}
        aria-label="Status"
      />,
    )
    await userEvent.click(trigger)
    await userEvent.click(items()[0] as HTMLElement)
    expect(onChange).toHaveBeenCalledWith(null)
    expect(trigger.textContent).toContain('Any status')
  })

  it('goes back to a real option, and reports that one as a string', async () => {
    const onChange = vi.fn()
    const trigger = mount(
      <Select options={OPTIONS} emptyOption="Any status" onChange={onChange} aria-label="Status" />,
    )
    await userEvent.click(trigger)
    await userEvent.click(items()[2] as HTMLElement)
    expect(onChange).toHaveBeenCalledWith('high')
  })

  it('accepts null as a controlled value and shows the empty choice', () => {
    const trigger = mount(
      <Select
        options={OPTIONS}
        emptyOption="Any status"
        value={null}
        onChange={() => {}}
        aria-label="Status"
      />,
    )
    expect(trigger.textContent).toContain('Any status')
  })

  it('keeps the placeholder for a Select that offers no empty choice', () => {
    const trigger = mount(<Select options={OPTIONS} placeholder="Choose" aria-label="Priority" />)
    expect(trigger.dataset['placeholder']).toBe('')
  })
})

/**
 * The private value, and the three places the spec forbids it from reaching: props, DOM
 * data attributes, and form serialisation.
 *
 * The tests read the value the only way code outside the component can, from Radix's
 * hidden native select, where the item values are written. They then check that it
 * appears in none of the forbidden places. Comparing against a hard-coded copy of the
 * sentinel would only show that two strings match.
 */
describe('the private value stays private', () => {
  function inForm(): HTMLFormElement {
    const { container } = render(
      <form>
        <Select name="status" options={OPTIONS} emptyOption="Any status" aria-label="Status" />
      </form>,
    )
    return container.firstElementChild as HTMLFormElement
  }

  /**
   * Opened, because Radix registers an item's value with its hidden native select only
   * while the panel is mounted. That is also when every item is in the DOM, so it is when
   * a leak would appear.
   */
  async function openInForm(): Promise<HTMLFormElement> {
    const form = inForm()
    await userEvent.click(form.querySelector('[role="combobox"]') as HTMLElement)
    return form
  }

  /** The only item value that no screen supplied. */
  function sentinelIn(form: HTMLFormElement): string {
    const supplied = new Set(OPTIONS.map((option) => option.value))
    const written = [...form.querySelectorAll('option')].map((option) => option.value)
    const unknown = written.filter((value) => value !== '' && !supplied.has(value))
    expect(unknown, 'Radix stopped writing the item values down').toHaveLength(1)
    return unknown[0] as string
  }

  it('submits the empty string under the field’s name', () => {
    expect(new FormData(inForm()).get('status')).toBe('')
  })

  it('submits a real option’s own value, unchanged', async () => {
    const form = await openInForm()
    await userEvent.click(items()[2] as HTMLElement)
    expect(new FormData(form).get('status')).toBe('high')
  })

  it('reaches no data attribute anywhere in the tree', async () => {
    const form = await openInForm()
    const sentinel = sentinelIn(form)

    const leaks: string[] = []
    for (const element of document.querySelectorAll('*')) {
      for (const attribute of element.attributes) {
        if (attribute.name.startsWith('data-') && attribute.value.includes(sentinel)) {
          leaks.push(`${element.tagName.toLowerCase()}[${attribute.name}]`)
        }
      }
    }
    expect(leaks).toEqual([])
  })

  it('is not what the form would submit, under any name', async () => {
    const form = await openInForm()
    expect([...new FormData(form).values()]).not.toContain(sentinelIn(form))
  })
})

/**
 * Two prop combinations a type cannot reject, because each prop is allowed alone
 * (`conventions/dev.ts`). Both come from the empty choice. A warning that never fires is
 * no better than none, so these tests check that they fire.
 */
describe('the dev warnings', () => {
  function captureWarnings() {
    return vi.spyOn(console, 'warn').mockImplementation(() => {})
  }

  it('warns that emptyOption takes priority over a placeholder, and applies it', () => {
    const warn = captureWarnings()
    const trigger = mount(
      <Select
        options={OPTIONS}
        emptyOption="Any status"
        placeholder="Choose"
        aria-label="Status"
      />,
    )
    expect(warn.mock.calls.flat().join(' ')).toContain('mutually exclusive')
    // Applied, not just warned about: the trigger shows the empty choice's label and is
    // not in its placeholder state.
    expect(trigger.textContent).toContain('Any status')
    expect(trigger.textContent).not.toContain('Choose')
    expect(trigger.dataset['placeholder']).toBeUndefined()
    warn.mockRestore()
  })

  it('warns when a caller that held a value hands the choice back with undefined', () => {
    const warn = captureWarnings()
    let hold: (value: string | null | undefined) => void = () => {}
    function Held() {
      const [value, setValue] = useState<string | null | undefined>(undefined)
      hold = setValue
      return <Select options={OPTIONS} placeholder="Choose" value={value} aria-label="Priority" />
    }
    render(<Held />)
    act(() => hold('high'))
    expect(warn).not.toHaveBeenCalled()
    act(() => hold(undefined))
    expect(warn.mock.calls.flat().join(' ')).toContain('`null`')
    warn.mockRestore()
  })

  it('does not warn when the props are valid', () => {
    const warn = captureWarnings()
    mount(<Select options={OPTIONS} emptyOption="Any status" aria-label="Status" />)
    mount(<Select options={OPTIONS} placeholder="Choose" aria-label="Priority" />)
    // `null` is nothing chosen, with or without an empty choice to show for it.
    mount(<Select options={OPTIONS} placeholder="Choose" value={null} aria-label="Priority" />)
    mount(
      <Select options={OPTIONS} placeholder="Choose" defaultValue={null} aria-label="Priority" />,
    )
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })
})

/**
 * The value an application holds: `null` is nothing chosen, shown as the placeholder or the
 * empty choice, in the popper and in the sheet. `@polymorph/conformance/select-value` states it
 * for every web shell.
 */
selectValueLaw({
  shell: 'React',
  mount({ value, placeholder, emptyOption, name, onChange }) {
    let hold: (next: string | null) => void = () => {}
    function Held() {
      const [held, setHeld] = useState<string | null>(value)
      hold = setHeld
      return (
        <Select
          aria-label="Priority"
          options={SELECT_VALUE_LAW_OPTIONS}
          {...(placeholder === undefined ? {} : { placeholder })}
          {...(emptyOption === undefined ? {} : { emptyOption })}
          name={name}
          value={held}
          onChange={onChange}
        />
      )
    }
    render(<Held />)
    return Promise.resolve({ set: (next) => act(() => hold(next)) })
  },
})

describe('the panel', () => {
  it('is a surface: overlay fill, subtle border, overlay shadow, lg radius', async () => {
    const trigger = mount(<Select options={OPTIONS} placeholder="Choose" aria-label="Priority" />)
    await userEvent.click(trigger)
    const style = getComputedStyle(panel() as HTMLElement)
    expect(style.backgroundColor).toBe(tokenColor('--pm-bg-overlay'))
    expect(style.borderTopColor).toBe(tokenColor('--pm-border-subtle'))
    expect(style.borderTopLeftRadius).toBe(tokenLength('--pm-radius-lg'))
    expect(style.boxShadow).not.toBe('none')
  })

  it('never grows past the space the positioning engine measured', async () => {
    const trigger = mount(<Select options={OPTIONS} placeholder="Choose" aria-label="Priority" />)
    await userEvent.click(trigger)
    const content = panel() as HTMLElement
    // The max-height comes from `--radix-select-content-available-height`. If the token
    // law rejected it, the declaration would be dropped and this would read `none`.
    expect(getComputedStyle(content).maxHeight).not.toBe('none')
  })
})

describe('groups', () => {
  const GROUPED: SelectProps['options'] = [
    { value: 'all', label: 'Everything' },
    {
      label: 'Queues',
      options: [
        { value: 'billing', label: 'Billing' },
        { value: 'onboarding', label: 'Onboarding' },
      ],
    },
  ]

  it('names each group’s options by its visible label', async () => {
    const trigger = mount(<Select options={GROUPED} placeholder="Choose" aria-label="Queue" />)
    await userEvent.click(trigger)

    const group = document.querySelector('[role="group"]') as HTMLElement
    expect(group, 'Radix Group renders the grouping role').not.toBeNull()
    const labelledBy = group.getAttribute('aria-labelledby') as string
    expect(document.getElementById(labelledBy)?.textContent).toBe('Queues')
  })

  it('uses Menu’s label style: smallest step, uppercase, muted', async () => {
    const trigger = mount(<Select options={GROUPED} placeholder="Choose" aria-label="Queue" />)
    await userEvent.click(trigger)

    const label = [...document.querySelectorAll('[role="group"] *')].find(
      (node) => node.textContent === 'Queues' && !node.closest('[role="option"]'),
    ) as HTMLElement
    const style = getComputedStyle(label)
    expect(style.textTransform).toBe('uppercase')
    expect(style.color).toBe(tokenColor('--pm-text-muted'))
  })

  it('keeps a mixed list selectable across the group boundary', async () => {
    const onChange = vi.fn()
    const trigger = mount(
      <Select options={GROUPED} onChange={onChange} placeholder="Choose" aria-label="Queue" />,
    )
    await userEvent.click(trigger)
    await userEvent.click(items().find((item) => item.textContent === 'Billing') as HTMLElement)
    expect(onChange).toHaveBeenCalledWith('billing')
  })
})

describe('descriptions', () => {
  const DESCRIBED: SelectOption[] = [
    { value: 'urgent', label: 'Urgent', description: 'Answer within the hour' },
    { value: 'normal', label: 'Normal', description: 'Within two days' },
    { value: 'low', label: 'Low' },
  ]

  it('draws the second line as in Combobox: xs, muted, under the label', async () => {
    const trigger = mount(<Select options={DESCRIBED} placeholder="Choose" aria-label="Priority" />)
    await userEvent.click(trigger)

    // The second option, on purpose. The first is highlighted when the panel opens, and a
    // highlighted row's description inherits the highlight colour, which is a separate
    // rule from the rest style tested here.
    const option = items()[1] as HTMLElement
    const description = [...option.querySelectorAll('span')].find(
      (node) => node.textContent === 'Within two days',
    ) as HTMLElement
    expect(description).toBeTruthy()
    expect(getComputedStyle(description).color).toBe(tokenColor('--pm-text-muted'))
    expect(Number.parseFloat(getComputedStyle(description).fontSize)).toBeLessThan(
      Number.parseFloat(getComputedStyle(option).fontSize),
    )
  })

  it('lets a two-line item grow while a one-line item keeps the minimum height', async () => {
    const trigger = mount(<Select options={DESCRIBED} placeholder="Choose" aria-label="Priority" />)
    await userEvent.click(trigger)

    const floor = Number.parseFloat(tokenLength('--pm-control-height-sm'))
    // Waited for, because the panel enters with `scale-fade`, and a rect measured during
    // the enter is 0.94 of the row's size.
    await vi.waitFor(() => {
      const rows = items()
      const plain = rows[2] as HTMLElement
      const described = rows[0] as HTMLElement
      expect(plain.getBoundingClientRect().height).toBeCloseTo(floor, 0)
      expect(described.getBoundingClientRect().height).toBeGreaterThan(floor)
    })
  })

  it('never leaks the description into the trigger’s value', async () => {
    const trigger = mount(
      <Select options={DESCRIBED} defaultValue="urgent" aria-label="Priority" />,
    )
    // Radix copies `ItemText` into the value slot. The description sits outside it so a
    // one-line field stays one line.
    expect(trigger.textContent).toContain('Urgent')
    expect(trigger.textContent).not.toContain('Answer within the hour')
  })
})

/**
 * The sheet below 30rem (select.md's sheet cell; the conventions' sheet presentation).
 *
 * Radix ties this member's listbox to its popper, so the sheet implements the semantics
 * with react-aria. Every test here checks that something still works in the sheet: the
 * trigger, the value behaviour, serialization, the empty choice, typeahead and disabled
 * options must all behave as they do with the popper.
 */
describe('the sheet, below 30rem', () => {
  async function openSheet(node: React.ReactElement): Promise<HTMLElement> {
    await page.viewport(NARROW, 800)
    const trigger = mount(node)
    await userEvent.click(trigger)
    await vi.waitFor(() => expect(sheetPanel()).not.toBeNull())
    return trigger
  }

  it('shows a sheet under auto, with the listbox inside the sheet panel', async () => {
    await openSheet(<Select options={OPTIONS} placeholder="Choose" aria-label="Priority" />)
    const list = panel() as HTMLElement
    expect(list).not.toBeNull()
    expect(sheetPanel()?.contains(list)).toBe(true)
    expect(items()).toHaveLength(3)
  })

  it('renders the same trigger styles and attributes as the popper version', async () => {
    await page.viewport(NARROW, 800)
    // Both versions at the same width. The sheet version renders its own trigger, so the
    // test compares computed values. Matching source text proves nothing.
    const sheetLane = mount(<Select options={OPTIONS} placeholder="Choose" aria-label="P" />)
    const popperLane = mount(
      <Select options={OPTIONS} placeholder="Choose" presentation="popover" aria-label="P" />,
    )

    const resolved = (element: Element) => {
      const style = getComputedStyle(element)
      return {
        height: style.height,
        background: style.backgroundColor,
        border: `${style.borderTopWidth} ${style.borderTopStyle} ${style.borderTopColor}`,
        radius: style.borderTopLeftRadius,
        fontSize: style.fontSize,
        paddingInline: style.paddingLeft,
        color: style.color,
      }
    }
    expect(resolved(sheetLane)).toEqual(resolved(popperLane))

    for (const attribute of [
      'role',
      'aria-autocomplete',
      'aria-expanded',
      'data-state',
      'data-size',
      'data-placeholder',
    ]) {
      expect(sheetLane.getAttribute(attribute), attribute).toBe(popperLane.getAttribute(attribute))
    }
  })

  it('styles rows with the popper recipes: minimum height, highlight, muted labels', async () => {
    await openSheet(<Select options={OPTIONS} defaultValue="high" aria-label="Priority" />)
    const rows = items()
    // The row without the highlight uses the rest recipe at the popper's minimum height.
    const rest = rows.find((row) => !row.hasAttribute('data-highlighted')) as HTMLElement
    await vi.waitFor(() => {
      expect(rest.getBoundingClientRect().height).toBeCloseTo(
        Number.parseFloat(tokenLength('--pm-control-height-sm')),
        0,
      )
    })
    // The highlighted row uses the accent background. This is Radix's single-attribute
    // model, achieved with react-aria through real focus.
    const highlighted = rows.find((row) => row.hasAttribute('data-highlighted')) as HTMLElement
    await vi.waitFor(() => {
      const style = getComputedStyle(highlighted)
      expect(style.backgroundColor).toBe(tokenColor('--pm-accent-subtle'))
      expect(style.color).toBe(tokenColor('--pm-accent-text'))
    })
  })

  it('opens on the selection, handles typeahead and arrows, and commits on Enter', async () => {
    const onChange = vi.fn()
    const trigger = await openSheet(
      <Select options={OPTIONS} defaultValue="high" onChange={onChange} aria-label="Priority" />,
    )

    // As in Radix, the selected item gets focus first and is marked as selected.
    await vi.waitFor(() => {
      expect((document.activeElement as HTMLElement).textContent).toContain('High')
    })
    expect(document.activeElement?.getAttribute('aria-selected')).toBe('true')
    expect((document.activeElement as HTMLElement).dataset['state']).toBe('checked')

    // Typeahead moves by label without committing, and the sheet stays open.
    await userEvent.keyboard('n')
    await vi.waitFor(() => {
      expect((document.activeElement as HTMLElement).textContent).toContain('Normal')
    })
    expect(sheetPanel()).not.toBeNull()
    expect(onChange).not.toHaveBeenCalled()

    // Enter commits and reports, and the selection closes the sheet (the sheet's list
    // of dismissal triggers).
    await userEvent.keyboard('{Enter}')
    expect(onChange).toHaveBeenCalledWith('normal')
    await vi.waitFor(() => expect(sheetPanel()).toBeNull())
    expect(trigger.textContent).toContain('Normal')
    await vi.waitFor(() => expect(document.activeElement).toBe(trigger))
  })

  it('serializes like the popper version, with the empty string for the empty choice', async () => {
    await page.viewport(NARROW, 800)
    const { container } = render(
      <form>
        <Select name="status" options={OPTIONS} emptyOption="Any status" aria-label="Status" />
      </form>,
    )
    const form = container.firstElementChild as HTMLFormElement
    expect(new FormData(form).get('status')).toBe('')

    await userEvent.click(form.querySelector('[role="combobox"]') as HTMLElement)
    await vi.waitFor(() => expect(sheetPanel()).not.toBeNull())
    await userEvent.click(items().find((item) => item.textContent?.includes('High')) as HTMLElement)
    await vi.waitFor(() => expect(sheetPanel()).toBeNull())
    expect(new FormData(form).get('status')).toBe('high')
  })

  it('keeps the empty choice first, null when picked, and a real value on the trigger', async () => {
    const onChange = vi.fn()
    const trigger = await openSheet(
      <Select
        options={OPTIONS}
        emptyOption="Any status"
        defaultValue="high"
        onChange={onChange}
        aria-label="Status"
      />,
    )
    expect(items()[0]?.textContent).toContain('Any status')

    await userEvent.click(items()[0] as HTMLElement)
    expect(onChange).toHaveBeenCalledWith(null)
    await vi.waitFor(() => expect(sheetPanel()).toBeNull())
    // "All" is a chosen state, not a missing value.
    expect(trigger.textContent).toContain('Any status')
    expect(trigger.dataset['placeholder']).toBeUndefined()
    expect(getComputedStyle(trigger).color).toBe(tokenColor('--pm-text-primary'))
  })

  it('ignores a disabled option and stays open, as the popper does', async () => {
    const onChange = vi.fn()
    await openSheet(
      <Select
        options={[...OPTIONS, { value: 'archived', label: 'Archived', disabled: true }]}
        placeholder="Choose"
        onChange={onChange}
        aria-label="Priority"
      />,
    )
    const archived = items().find((item) => item.textContent?.includes('Archived')) as HTMLElement
    expect(archived.dataset['disabled']).toBe('')
    archived.click()
    expect(onChange).not.toHaveBeenCalled()
    expect(sheetPanel(), 'a disabled option closed the sheet').not.toBeNull()
  })

  it('announces a group under its visible label inside the sheet', async () => {
    await openSheet(
      <Select
        options={[
          { value: 'all', label: 'Everything' },
          {
            label: 'Queues',
            options: [
              { value: 'billing', label: 'Billing' },
              { value: 'onboarding', label: 'Onboarding' },
            ],
          },
        ]}
        placeholder="Choose"
        aria-label="Queue"
      />,
    )
    const group = sheetPanel()?.querySelector('[role="group"]') as HTMLElement
    expect(group).not.toBeNull()
    const labelledBy = group.getAttribute('aria-labelledby') as string
    expect(document.getElementById(labelledBy)?.textContent).toBe('Queues')
    expect(items().map((item) => item.textContent)).toEqual(['Everything', 'Billing', 'Onboarding'])
  })

  it('dismisses on Escape and on the scrim, returning focus to the trigger', async () => {
    const trigger = await openSheet(
      <Select options={OPTIONS} placeholder="Choose" aria-label="Priority" />,
    )
    await userEvent.keyboard('{Escape}')
    await vi.waitFor(() => expect(sheetPanel()).toBeNull())
    await vi.waitFor(() => expect(document.activeElement).toBe(trigger))
    expect(trigger.dataset['state']).toBe('closed')

    await userEvent.click(trigger)
    await vi.waitFor(() => expect(sheetPanel()).not.toBeNull())
    await userEvent.click(scrim() as HTMLElement)
    await vi.waitFor(() => expect(sheetPanel()).toBeNull())
  })

  it('pins the popper under presentation="popover", at the same width', async () => {
    await page.viewport(NARROW, 800)
    render(
      <Select
        options={OPTIONS}
        placeholder="Choose"
        presentation="popover"
        defaultOpen
        aria-label="Priority"
      />,
    )
    await vi.waitFor(() => expect(panel()).not.toBeNull())
    expect(sheetPanel()).toBeNull()
    expect(panel()?.getAttribute('data-side')).toBeTruthy()
  })

  it('never shows a sheet above the breakpoint', async () => {
    render(<Select options={OPTIONS} placeholder="Choose" defaultOpen aria-label="Priority" />)
    await vi.waitFor(() => expect(panel()).not.toBeNull())
    expect(sheetPanel()).toBeNull()
  })

  it('passes axe open', async () => {
    await openSheet(<Select options={OPTIONS} defaultValue="high" aria-label="Priority" />)
    expect(await audit(document.body)).toEqual([])
  })
})

/**
 * An agent chooses an option through the bridge, without opening the list, as the spec's `agent`
 * fence declares (`design/components/select.md`, Agent). The member holds its value, so the
 * choice reaches the trigger whether or not the caller controls it, and `onChange` reports it.
 */
describe('an agent', () => {
  const CHOICES: SelectOption[] = [
    { value: 'urgent', label: 'Urgent' },
    { value: 'high', label: 'High' },
    { value: 'archived', label: 'Archived', disabled: true },
  ]
  const trigger = (name: string) => screen.getByRole('combobox', { name })

  it('chooses in an uncontrolled and a controlled Select, without opening either', async () => {
    const bridge = createAgentBridge()
    try {
      const free = vi.fn()
      const held = vi.fn()
      function Held() {
        const [value, setValue] = useState<string | null>('urgent')
        return (
          <Select
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
          <Select aria-label="Free" options={CHOICES} placeholder="Choose" onChange={free} />
          <Held />
        </>,
      )
      const [one, two] = bridge.snapshot().members
      expect(one).toMatchObject({
        name: 'Free',
        state: {
          value: null,
          options: [
            { id: 'urgent', label: 'Urgent' },
            { id: 'high', label: 'High' },
            { id: 'archived', label: 'Archived', disabled: true },
          ],
          open: false,
          disabled: false,
        },
      })
      expect(two?.state['value']).toBe('urgent')

      const chosen = await bridge.act([{ id: one?.id, action: 'choose', value: 'high' }])
      expect(chosen.results[0]).toEqual({
        ok: true,
        id: one?.id,
        changed: { value: { from: null, to: 'high' } },
      })
      expect(free).toHaveBeenLastCalledWith('high')
      expect(trigger('Free').textContent).toContain('High')
      expect(trigger('Free').getAttribute('aria-expanded')).toBe('false')

      const changed = await bridge.act([{ id: two?.id, action: 'choose', value: 'high' }])
      expect(changed.results[0]).toMatchObject({
        ok: true,
        changed: { value: { from: 'urgent', to: 'high' } },
      })
      expect(held).toHaveBeenLastCalledWith('high')
      expect(trigger('Held').textContent).toContain('High')

      // A disabled option is refused, and nothing is reported.
      const refused = await bridge.act([{ id: one?.id, action: 'choose', value: 'archived' }])
      expect(refused.results[0]).toMatchObject({ ok: false, error: { code: 'invalid-value' } })
      expect(free).toHaveBeenCalledTimes(1)
    } finally {
      bridge.dispose()
    }
  })

  it('keeps a controlled Select on the value its caller passes back', async () => {
    const bridge = createAgentBridge()
    try {
      const onChange = vi.fn()
      render(<Select aria-label="Fixed" options={CHOICES} value="urgent" onChange={onChange} />)
      const [member] = bridge.snapshot().members
      const { results } = await bridge.act([{ id: member?.id, action: 'choose', value: 'high' }])
      expect(results[0]).toEqual({ ok: true, id: member?.id, changed: {} })
      expect(onChange).toHaveBeenCalledWith('high')
      expect(trigger('Fixed').textContent).toContain('Urgent')
    } finally {
      bridge.dispose()
    }
  })

  it('names the empty choice by the empty string, which onChange reports as null', async () => {
    const bridge = createAgentBridge()
    try {
      const onChange = vi.fn()
      render(
        <Select
          aria-label="Status"
          options={CHOICES}
          emptyOption="All statuses"
          defaultValue="urgent"
          onChange={onChange}
        />,
      )
      const [member] = bridge.snapshot().members
      expect(member?.state['options']).toContainEqual({ id: '', label: 'All statuses' })
      const { results } = await bridge.act([{ id: member?.id, action: 'choose', value: '' }])
      expect(results[0]).toMatchObject({ ok: true, changed: { value: { from: 'urgent', to: '' } } })
      expect(onChange).toHaveBeenLastCalledWith(null)
      expect(trigger('Status').textContent).toContain('All statuses')
    } finally {
      bridge.dispose()
    }
  })

  it('opens and closes the list', async () => {
    const bridge = createAgentBridge()
    try {
      render(<Select aria-label="Priority" options={CHOICES} />)
      const [member] = bridge.snapshot().members
      const opened = await bridge.act([{ id: member?.id, action: 'open' }])
      expect(opened.results[0]).toMatchObject({
        ok: true,
        changed: { open: { from: false, to: true } },
      })
      await vi.waitFor(() => expect(document.querySelector('[role="listbox"]')).not.toBeNull())
      const closed = await bridge.act([{ id: member?.id, action: 'close' }])
      expect(closed.results[0]).toMatchObject({
        ok: true,
        changed: { open: { from: true, to: false } },
      })
      await vi.waitFor(() => expect(document.querySelector('[role="listbox"]')).toBeNull())
    } finally {
      bridge.dispose()
    }
  })
})
