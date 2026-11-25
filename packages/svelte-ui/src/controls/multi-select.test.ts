import { page, userEvent } from 'vitest/browser'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { installTestTheme } from '@polymorph/engine/testing'
import sheet from '@polymorph/recipes/overlays/sheet.module.css'

import { render } from '../mount'
import FieldInDialogHarness from '../testing/FieldInDialogHarness.svelte'
import { live } from '../testing/live.svelte'
import MultiSelectElsewhereHarness from '../testing/MultiSelectElsewhereHarness.svelte'
import MultiSelectFormHarness from '../testing/MultiSelectFormHarness.svelte'
import MultiSelect from './MultiSelect.svelte'

/**
 * MultiSelect in the Svelte shell, where it differs from what its machine does
 * on its own (`design/components/multi-select.md`): the value in options order,
 * Enter toggling without closing, Escape's two stages, the mint row and the
 * refusal, the maximum, the chips' keyboard and focus, and the sheet below
 * `30rem`, which the conformance law's desktop width never reaches, as the
 * React member has them (`packages/react-ui/src/controls/MultiSelect.tsx`).
 */

beforeAll(installTestTheme)

const PEOPLE = [
  { value: 'ada', label: 'Ada Lovelace' },
  { value: 'grace', label: 'Grace Hopper' },
  { value: 'alan', label: 'Alan Turing' },
  { value: 'annie', label: 'Annie Easley' },
]

const field = () =>
  document.querySelector<HTMLInputElement>('[data-member="multi-select"] input[role="combobox"]')
const root = () => document.querySelector<HTMLElement>('[data-member="multi-select"]:has(input)')

/**
 * Waits for the list to open, and then for the frame in which the machine
 * focuses the field. Focus a test moves away before that frame is taken back
 * by it. A reader cannot act within one frame of the list opening.
 */
async function opened(): Promise<void> {
  await vi.waitFor(() => expect(root()?.getAttribute('data-state')).toBe('open'))
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
}
const listbox = () => document.querySelector<HTMLElement>('[role="listbox"]')
const highlighted = () => document.querySelector<HTMLElement>('[role="option"][data-highlighted]')
const option = (label: string) =>
  [...document.querySelectorAll<HTMLElement>('[role="option"]')].find((row) =>
    row.textContent?.includes(label),
  )
const chipTexts = () =>
  [
    ...document.querySelectorAll(
      '[data-member="multi-select"]:has(input) > ul > li:not([data-removing])',
    ),
  ].map((chip) => chip.firstElementChild?.textContent?.trim())
const removeButton = (label: string) =>
  document.querySelector<HTMLElement>(`button[aria-label="Remove ${label}"]`)
const announcer = () =>
  root()?.querySelector<HTMLElement>('span[aria-live="polite"]')?.textContent?.trim()

describe('choosing', () => {
  it('opens on typing, filters, highlights the first row, and reports in options order', async () => {
    const onChange = vi.fn()
    await render(MultiSelect, { options: PEOPLE, onChange, 'aria-label': 'Assignees' })
    await userEvent.click(field() as HTMLElement)
    await userEvent.keyboard('an')
    await vi.waitFor(() => expect(listbox()).not.toBeNull())
    expect([...document.querySelectorAll('[role="option"]')].map((row) => row.textContent)).toEqual(
      ['Alan Turing', 'Annie Easley'],
    )
    await vi.waitFor(() => expect(highlighted()?.textContent).toBe('Alan Turing'))
    await userEvent.keyboard('{ArrowDown}{Enter}')
    expect(onChange).toHaveBeenLastCalledWith(['annie'])
    await userEvent.keyboard('{ArrowUp}{Enter}')
    // Options order, not the order of the picks.
    expect(onChange).toHaveBeenLastCalledWith(['alan', 'annie'])
    // Choosing keeps the list open and the text, so several picks follow one query.
    expect(root()?.getAttribute('data-state')).toBe('open')
    expect(field()?.value).toBe('an')
    expect(option('Alan')?.getAttribute('aria-selected')).toBe('true')
  })

  it('opens from the arrows on the first or last row, and walks without wrapping', async () => {
    await render(MultiSelect, { options: PEOPLE, 'aria-label': 'Assignees' })
    await userEvent.click(field() as HTMLElement)
    await userEvent.keyboard('{ArrowUp}')
    await vi.waitFor(() => expect(highlighted()?.textContent).toBe('Annie Easley'))
    await userEvent.keyboard('{ArrowDown}')
    expect(highlighted()?.textContent).toBe('Annie Easley')
    await userEvent.keyboard('{Escape}{ArrowDown}')
    await vi.waitFor(() => expect(highlighted()?.textContent).toBe('Ada Lovelace'))
  })

  it('closes on the first Escape and clears the text on the second', async () => {
    await render(MultiSelect, { options: PEOPLE, 'aria-label': 'Assignees' })
    await userEvent.click(field() as HTMLElement)
    await userEvent.keyboard('gr')
    await opened()
    await userEvent.keyboard('{Escape}')
    await vi.waitFor(() => expect(root()?.getAttribute('data-state')).toBe('closed'))
    expect(field()?.value).toBe('gr')
    await userEvent.keyboard('{Escape}')
    expect(field()?.value).toBe('')
  })

  it('announces a removal from the list as it announces one from a chip', async () => {
    await render(MultiSelect, {
      options: PEOPLE,
      defaultValue: ['ada', 'grace'],
      defaultOpen: true,
      'aria-label': 'Assignees',
    })
    await userEvent.click(option('Ada') as HTMLElement)
    await vi.waitFor(() => expect(announcer()).toBe('Ada Lovelace removed, 1 selected'))
    expect(root()?.getAttribute('data-state')).toBe('open')
  })
})

describe('the text', () => {
  it('reports each keystroke of a controlled text and shows the app’s value', async () => {
    const onInputChange = vi.fn()
    const query = live({
      options: PEOPLE,
      inputValue: '',
      onInputChange,
      'aria-label': 'Assignees',
    })
    await render(MultiSelect, query)
    await userEvent.click(field() as HTMLElement)
    await userEvent.keyboard('g')
    expect(onInputChange).toHaveBeenLastCalledWith('g')
    await vi.waitFor(() => expect(field()?.value).toBe(''))
    query.inputValue = 'gra'
    await vi.waitFor(() => expect(field()?.value).toBe('gra'))
    await vi.waitFor(() => expect(document.querySelectorAll('[role="option"]')).toHaveLength(1))
    await userEvent.keyboard('{Escape}')
    await vi.waitFor(() => expect(listbox()).toBeNull())
    await userEvent.keyboard('{Escape}')
    expect(onInputChange).toHaveBeenLastCalledWith('')
  })
})

describe('custom values', () => {
  it('offers the text as a mint row, adds it, clears the text and announces it', async () => {
    const onChange = vi.fn()
    await render(MultiSelect, {
      options: PEOPLE,
      allowCustom: true,
      defaultValue: ['ada'],
      onChange,
      'aria-label': 'Labels',
    })
    await userEvent.click(field() as HTMLElement)
    await userEvent.keyboard('on-call')
    await vi.waitFor(() =>
      expect(document.querySelector('[data-mint]')?.textContent).toContain('Add "on-call"'),
    )
    await vi.waitFor(() => expect(highlighted()?.hasAttribute('data-mint')).toBe(true))
    await userEvent.keyboard('{Enter}')
    expect(onChange).toHaveBeenLastCalledWith(['ada', 'on-call'])
    expect(field()?.value).toBe('')
    await vi.waitFor(() => expect(announcer()).toBe('on-call added, 2 selected'))
    expect(chipTexts()).toEqual(['Ada Lovelace', 'on-call'])
  })

  it('answers a commit it cannot take with a flash and the reason', async () => {
    await render(MultiSelect, {
      options: PEOPLE,
      allowCustom: true,
      defaultValue: ['on-call'],
      'aria-label': 'Labels',
    })
    const flashed: boolean[] = []
    new MutationObserver(() => flashed.push(root()?.hasAttribute('data-refused') ?? false)).observe(
      root() as HTMLElement,
      { attributes: true, attributeFilter: ['data-refused'] },
    )
    await userEvent.click(field() as HTMLElement)
    await userEvent.keyboard('on-call')
    await opened()
    expect(document.querySelector('[data-mint]')).toBeNull()
    await userEvent.keyboard('{Enter}')
    await vi.waitFor(() => expect(announcer()).toBe('"on-call" is already selected'))
    expect(flashed[0]).toBe(true)
  })
})

describe('the maximum', () => {
  it('is read-only, disables unchosen options and keeps chosen ones', async () => {
    const onChange = vi.fn()
    await render(MultiSelect, {
      options: PEOPLE,
      defaultValue: ['ada', 'grace'],
      max: 2,
      defaultOpen: true,
      onChange,
      'aria-label': 'Assignees',
    })
    expect(root()?.hasAttribute('data-at-max')).toBe(true)
    expect(field()?.readOnly).toBe(true)
    expect(option('Alan')?.hasAttribute('data-disabled')).toBe(true)
    expect(option('Ada')?.hasAttribute('data-disabled')).toBe(false)
    // Dispatched, because a pointer cannot press a disabled option.
    option('Alan')?.click()
    expect(onChange).not.toHaveBeenCalled()
    await userEvent.click(option('Grace') as HTMLElement)
    expect(onChange).toHaveBeenLastCalledWith(['ada'])
  })
})

describe('the chips', () => {
  it('walks the chips from the field and back, keeping the list open and the field focused as one', async () => {
    const onBlur = vi.fn()
    await render(MultiSelect, {
      options: PEOPLE,
      defaultValue: ['grace', 'ada'],
      onBlur,
      'aria-label': 'Assignees',
    })
    // In options order, whatever order the value was given in.
    expect(chipTexts()).toEqual(['Ada Lovelace', 'Grace Hopper'])
    await userEvent.click(field() as HTMLElement)
    await userEvent.keyboard('{ArrowDown}')
    await opened()
    await userEvent.keyboard('{ArrowLeft}')
    expect(document.activeElement).toBe(removeButton('Grace Hopper'))
    await userEvent.keyboard('{ArrowLeft}')
    expect(document.activeElement).toBe(removeButton('Ada Lovelace'))
    await userEvent.keyboard('{ArrowRight}{ArrowRight}')
    expect(document.activeElement).toBe(field())
    expect(root()?.getAttribute('data-state')).toBe('open')
    expect(onBlur).not.toHaveBeenCalled()
  })

  it('moves focus to the next chip on removal, then to the field, and announces it', async () => {
    const onChange = vi.fn()
    await render(MultiSelect, {
      options: PEOPLE,
      defaultValue: ['ada', 'grace'],
      onChange,
      'aria-label': 'Assignees',
    })
    await userEvent.click(removeButton('Ada Lovelace') as HTMLElement)
    expect(onChange).toHaveBeenLastCalledWith(['grace'])
    expect(document.activeElement).toBe(removeButton('Grace Hopper'))
    await vi.waitFor(() => expect(announcer()).toBe('Ada Lovelace removed, 1 selected'))
    await userEvent.keyboard('{Delete}')
    expect(onChange).toHaveBeenLastCalledWith([])
    expect(document.activeElement).toBe(field())
  })

  it('plays the enter for a chip chosen after it mounts, and slides the others into a gap', async () => {
    await render(MultiSelect, {
      options: PEOPLE,
      defaultValue: ['ada', 'grace'],
      'aria-label': 'Assignees',
    })
    const chip = (label: string) =>
      [
        ...document.querySelectorAll<HTMLElement>(
          '[data-member="multi-select"]:has(input) > ul > li',
        ),
      ].find((element) => element.firstElementChild?.textContent?.trim() === label) as HTMLElement
    await vi.waitFor(() => expect(chip('Ada Lovelace').style.scale).not.toBe(''))
    expect(chip('Ada Lovelace').getAnimations()).toHaveLength(0)
    await userEvent.click(field() as HTMLElement)
    await userEvent.keyboard('alan')
    await vi.waitFor(() => expect(highlighted()?.textContent).toBe('Alan Turing'))
    // The presence marks the chip's motion pattern in the same step that starts
    // its enter, so the animation is read when that mark lands; a later read
    // could find the enter already over when the whole suite runs.
    const atEnter = new Promise<number>((resolve) => {
      const observer = new MutationObserver(() => {
        const added = chip('Alan Turing')
        if (!added?.hasAttribute('data-motion-pattern')) return
        observer.disconnect()
        resolve(added.getAnimations().length)
      })
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['data-motion-pattern'],
      })
    })
    await userEvent.keyboard('{Enter}')
    expect(await atEnter).toBeGreaterThan(0)
    const slides = () =>
      chip('Alan Turing')
        .getAnimations()
        .filter((animation) =>
          (animation.effect as KeyframeEffect).getKeyframes().some((frame) => 'transform' in frame),
        ).length
    // A chip starts its slide in the step that takes the removed chip out of
    // the list, so the slide is read when that chip leaves; a read after the
    // awaited click could find the slide already over when the whole suite runs.
    const atGap = new Promise<number>((resolve) => {
      const observer = new MutationObserver((records) => {
        const left = records.some((record) =>
          [...record.removedNodes].some((node) => node instanceof HTMLLIElement),
        )
        if (!left) return
        observer.disconnect()
        resolve(slides())
      })
      observer.observe(chip('Alan Turing').parentElement as HTMLElement, { childList: true })
    })
    await userEvent.click(removeButton('Ada Lovelace') as HTMLElement)
    expect(await atGap).toBeGreaterThan(0)
  })

  it('removes the last chip on Backspace in an empty field', async () => {
    const onChange = vi.fn()
    await render(MultiSelect, {
      options: PEOPLE,
      defaultValue: ['ada', 'grace'],
      onChange,
      'aria-label': 'Assignees',
    })
    await userEvent.click(field() as HTMLElement)
    await userEvent.keyboard('{Backspace}')
    expect(onChange).toHaveBeenLastCalledWith(['ada'])
  })
})

describe('leaving the field', () => {
  it('closes the list and blurs once when focus leaves the field and the panel', async () => {
    const onBlur = vi.fn()
    await render(MultiSelectElsewhereHarness, {
      options: PEOPLE,
      onBlur,
      'aria-label': 'Assignees',
    })
    await userEvent.click(field() as HTMLElement)
    await userEvent.keyboard('{ArrowDown}')
    await opened()
    document.querySelector<HTMLElement>('button:not([aria-label]):not([tabindex])')?.focus()
    await vi.waitFor(() => expect(root()?.getAttribute('data-state')).toBe('closed'))
    expect(onBlur).toHaveBeenCalledTimes(1)
    expect(document.activeElement?.textContent).toBe('Elsewhere')
  })

  it('closes the list when focus leaves for nowhere, as when the window loses it', async () => {
    // The machine's own dismissal hears focus arriving outside; focus that arrives nowhere
    // closes the list through the member's blur, and stays where it went.
    const onBlur = vi.fn()
    await render(MultiSelect, { options: PEOPLE, onBlur, 'aria-label': 'Assignees' })
    await userEvent.click(field() as HTMLElement)
    await userEvent.keyboard('{ArrowDown}')
    await opened()
    field()?.blur()
    await vi.waitFor(() => expect(root()?.getAttribute('data-state')).toBe('closed'))
    expect(onBlur).toHaveBeenCalledTimes(1)
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    expect(document.activeElement).toBe(document.body)
  })

  it('serialises in options order into a hidden input, disabled with the member', async () => {
    const { host } = await render(MultiSelectFormHarness, {
      fields: [
        {
          name: 'assignees',
          options: PEOPLE,
          defaultValue: ['grace', 'ada'],
          'aria-label': 'Assignees',
        },
        {
          name: 'locked',
          disabled: true,
          options: PEOPLE,
          defaultValue: ['ada'],
          'aria-label': 'Locked',
        },
      ],
    })
    const form = host.querySelector('form') as HTMLFormElement
    expect([...new FormData(form).entries()]).toEqual([['assignees', 'ada,grace']])
  })
})

describe('the sheet, below `30rem`', () => {
  afterEach(async () => {
    await page.viewport(1280, 800)
  })

  it('lists the options in a bottom sheet, keeps it open on a pick and closes on the scrim', async () => {
    await page.viewport(420, 800)
    const onChange = vi.fn()
    await render(MultiSelect, {
      defaultOpen: true,
      options: PEOPLE,
      onChange,
      'aria-label': 'Assignees',
    })
    const sheetPanel = () => document.querySelector<HTMLElement>('[data-presentation="sheet"]')
    await vi.waitFor(() => expect(sheetPanel()).not.toBeNull())
    expect(sheetPanel()?.querySelectorAll('[role="option"]')).toHaveLength(4)
    // The field rises above the scrim, so its chips and input still take presses.
    expect(root()?.hasAttribute('data-sheeting')).toBe(true)
    await userEvent.click(option('Grace') as HTMLElement)
    expect(onChange).toHaveBeenLastCalledWith(['grace'])
    expect(sheetPanel()).not.toBeNull()
    const scrim = document.querySelector<HTMLElement>(`.${sheet.scrim}`) as HTMLElement
    // Below the field, which sits above the scrim at the top of the page.
    await userEvent.click(scrim, { position: { x: 10, y: 200 } })
    await vi.waitFor(() => expect(sheetPanel()).toBeNull(), { timeout: 3_000 })
  })
})

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * A key an input method is handling, dispatched on `target`: marked `isComposing`, or reported
 * with key code 229 after the composition has ended, as Safari sends the Enter that confirms it.
 */
function inputMethodKey(
  target: HTMLElement,
  key: string,
  how: 'composing' | 'processed',
): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
    isComposing: how === 'composing',
  })
  if (how === 'processed') Object.defineProperty(event, 'keyCode', { value: 229 })
  target.dispatchEvent(event)
  return event
}

describe('keys', () => {
  it('leaves every key an input method is handling to it', async () => {
    const onChange = vi.fn()
    await render(MultiSelect, { options: PEOPLE, onChange, 'aria-label': 'Assignees' })
    await userEvent.click(field() as HTMLElement)
    await userEvent.keyboard('gr')
    await opened()
    for (const how of ['composing', 'processed'] as const) {
      expect(inputMethodKey(field() as HTMLElement, 'Enter', how).defaultPrevented, how).toBe(false)
    }
    // Escape while the list is open is the machine's layer's, which leaves a composing one alone.
    inputMethodKey(field() as HTMLElement, 'Escape', 'composing')
    await sleep(30)
    expect(onChange).not.toHaveBeenCalled()
    expect(root()?.getAttribute('data-state')).toBe('open')
    expect(field()?.value).toBe('gr')
    await userEvent.keyboard('{Enter}')
    expect(onChange).toHaveBeenLastCalledWith(['grace'])
  })

  it('inside a Dialog, closes the list, then clears the text with the Dialog open, then closes it', async () => {
    const onOpenChange = vi.fn()
    await render(FieldInDialogHarness, { field: 'multi-select', options: PEOPLE, onOpenChange })
    await vi.waitFor(() => expect(field()).not.toBeNull())
    await userEvent.click(field() as HTMLElement)
    await userEvent.keyboard('gr')
    await opened()
    await userEvent.keyboard('{Escape}')
    await vi.waitFor(() => expect(root()?.getAttribute('data-state')).toBe('closed'))
    expect(field()?.value).toBe('gr')
    await userEvent.keyboard('{Escape}')
    await vi.waitFor(() => expect(field()?.value).toBe(''))
    await sleep(60)
    expect(onOpenChange).not.toHaveBeenCalled()
    await userEvent.keyboard('{Escape}')
    await vi.waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
  })

  it('follows a right-to-left line: → moves back into the chips and ← forward to the field', async () => {
    const { host } = await render(MultiSelect, {
      options: PEOPLE,
      defaultValue: ['ada', 'grace'],
      'aria-label': 'Assignees',
    })
    host.dir = 'rtl'
    await userEvent.click(field() as HTMLElement)
    await userEvent.keyboard('{ArrowLeft}')
    expect(document.activeElement).toBe(field())
    await userEvent.keyboard('{ArrowRight}')
    expect(document.activeElement).toBe(removeButton('Grace Hopper'))
    await userEvent.keyboard('{ArrowRight}')
    expect(document.activeElement).toBe(removeButton('Ada Lovelace'))
    await userEvent.keyboard('{ArrowLeft}{ArrowLeft}')
    expect(document.activeElement).toBe(field())
  })
})
