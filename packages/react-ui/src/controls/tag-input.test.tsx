import { render, screen } from '@testing-library/react'
import { useState } from 'react'
import { page, userEvent } from 'vitest/browser'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { PASTE_IS_UNREADABLE } from '@polymorph/conformance/engines'
import { assertGoverned } from '@polymorph/react'
import { createAgentBridge } from '@polymorph/engine/agent'
import { fixedWidthHost, installTestTheme } from '@polymorph/engine/testing'
import { Dialog } from '../overlays/Dialog'
import { FormField } from './FormField'
import { TagInput, type TagInputProps } from './TagInput'
import styles from '@polymorph/recipes/controls/tag-input.module.css'
import { tokenColor, tokenLength } from './token-probe'

/**
 * TagInput. The component is mostly its commit rules (what counts as a tag, what a
 * duplicate does, what Backspace removes), so these tests check them. They also check
 * one structural fact: the chips are a real list of real buttons, not styled divs.
 */

beforeAll(installTestTheme)

function mount(node: React.ReactElement): HTMLElement {
  return render(node).container.firstElementChild as HTMLElement
}

const field = () => screen.getByRole('textbox') as HTMLInputElement
const chipTexts = () => screen.getAllByRole('listitem').map((chip) => chip.textContent)
const partOf = (root: HTMLElement, part: string) =>
  root.querySelector(`.${part.split(' ').join('.')}`) as HTMLElement

/**
 * A real `paste` event carrying real clipboard data, dispatched directly.
 *
 * The browser harness's `userEvent.paste` goes through the platform clipboard, which a
 * headless run does not fill. These tests are about what the component does with the
 * list on the clipboard, not how it got there. The returned event shows whether the
 * component handled the paste itself or left it to the field.
 */
function paste(target: HTMLElement, text: string): ClipboardEvent {
  const data = new DataTransfer()
  data.setData('text', text)
  const event = new ClipboardEvent('paste', {
    bubbles: true,
    cancelable: true,
    clipboardData: data,
  })
  target.dispatchEvent(event)
  return event
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * A key an input method is handling, dispatched on `target`: marked `isComposing`, or reported
 * with key code 229 after the composition has ended, as Safari sends the Enter that confirms it.
 * The returned event shows whether the member left its default alone.
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

describe('the closed surface', () => {
  it('has no style escape hatch', () => {
    assertGoverned<TagInputProps>(true)
  })
})

describe('committing', () => {
  it('takes a tag on Enter', async () => {
    const onChange = vi.fn()
    mount(<TagInput onChange={onChange} aria-label="Invite" />)
    await userEvent.click(field())
    await userEvent.keyboard('ada@relay.dev{Enter}')

    expect(onChange).toHaveBeenCalledWith(['ada@relay.dev'])
    expect(chipTexts()).toEqual(['ada@relay.dev'])
    // The field empties, because the value moved into a chip.
    expect((field() as HTMLInputElement).value).toBe('')
  })

  it('takes one on a comma, and never leaves the comma behind', async () => {
    mount(<TagInput aria-label="Invite" />)
    await userEvent.click(field())
    await userEvent.keyboard('billing,')
    expect(chipTexts()).toEqual(['billing'])
    expect((field() as HTMLInputElement).value).toBe('')
  })

  it('normalizes through `validate`, and refuses what it returns null for', async () => {
    const onChange = vi.fn()
    mount(
      <TagInput
        onChange={onChange}
        validate={(raw) => (raw.includes('@') ? raw.trim().toLowerCase() : null)}
        aria-label="Invite"
      />,
    )
    await userEvent.click(field())
    await userEvent.keyboard('  ADA@relay.dev  {Enter}')
    expect(onChange).toHaveBeenLastCalledWith(['ada@relay.dev'])

    await userEvent.keyboard('nonsense{Enter}')
    // Rejected: no chip and no message. The flash is the only feedback.
    expect(chipTexts()).toEqual(['ada@relay.dev'])
    expect(screen.queryByText('nonsense')).toBeNull()
  })

  it('trims and refuses the empty string by default', async () => {
    const onChange = vi.fn()
    mount(<TagInput onChange={onChange} aria-label="Invite" />)
    await userEvent.click(field())
    await userEvent.keyboard('   {Enter}')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('flashes the existing chip for a duplicate', async () => {
    const onChange = vi.fn()
    const root = mount(
      <TagInput defaultValue={['billing']} onChange={onChange} aria-label="Labels" />,
    )
    /*
     * Observed as it is set, not read afterwards.
     *
     * `data-flash` is cleared by `animationend`, so reading it after the keystroke races
     * a real animation. The test loses that race intermittently when a large suite slows
     * the browser down. A MutationObserver sees the attribute whatever happens next. It
     * is also the more accurate check: the requirement is that the existing chip
     * flashes, not that it is still flashing when the test looks.
     */
    const answered: string[] = []
    new MutationObserver((records) => {
      for (const record of records) {
        const target = record.target as HTMLElement
        if (target.dataset['flash'] === '') answered.push(target.textContent ?? '')
      }
    }).observe(root, { attributes: true, attributeFilter: ['data-flash'], subtree: true })

    await userEvent.click(field())
    await userEvent.keyboard('billing{Enter}')

    expect(chipTexts()).toEqual(['billing'])
    expect(onChange).not.toHaveBeenCalled()
    expect(answered).toEqual(['billing'])
  })

  it.skipIf(PASTE_IS_UNREADABLE)('splits a pasted list on commas and newlines', () => {
    const onChange = vi.fn()
    mount(<TagInput onChange={onChange} aria-label="Invite" />)
    const event = paste(field(), 'ada@relay.dev, grace@relay.dev\nalan@relay.dev')

    expect(onChange).toHaveBeenCalledWith(['ada@relay.dev', 'grace@relay.dev', 'alan@relay.dev'])
    expect(event.defaultPrevented).toBe(true)
  })

  it('leaves a single pasted value to the field, where it can still be edited', () => {
    mount(<TagInput aria-label="Invite" />)
    const event = paste(field(), 'ada@relay.dev')

    // Not intercepted. The browser's paste puts the text in the field, and the user
    // commits it.
    expect(event.defaultPrevented).toBe(false)
    expect(screen.queryAllByRole('listitem')).toEqual([])
  })

  it('abandons uncommitted text on Escape, and only that', async () => {
    mount(<TagInput defaultValue={['billing']} aria-label="Labels" />)
    await userEvent.click(field())
    await userEvent.keyboard('regressio{Escape}')
    expect((field() as HTMLInputElement).value).toBe('')
    expect(chipTexts()).toEqual(['billing'])
  })
})

describe('an input method', () => {
  it('keeps every key it is handling, so no half-typed text becomes a tag', async () => {
    const onChange = vi.fn()
    mount(<TagInput defaultValue={['billing']} onChange={onChange} aria-label="Labels" />)
    await userEvent.click(field())
    await userEvent.keyboard('にほ')
    for (const how of ['composing', 'processed'] as const) {
      for (const key of ['Enter', ',', 'Escape']) {
        expect(inputMethodKey(field(), key, how).defaultPrevented, `${how} ${key}`).toBe(false)
      }
    }
    await sleep(30)
    expect(field().value).toBe('にほ')
    expect(chipTexts()).toEqual(['billing'])
    expect(onChange).not.toHaveBeenCalled()

    // The Enter after the composition is the field's, and Backspace in the composition of an
    // empty field removes no chip.
    await userEvent.keyboard('{Enter}')
    expect(chipTexts()).toEqual(['billing', 'にほ'])
    inputMethodKey(field(), 'Backspace', 'composing')
    await sleep(30)
    expect(chipTexts()).toEqual(['billing', 'にほ'])
  })
})

describe('inside a Dialog', () => {
  it('clears uncommitted text on Escape with the Dialog still open, and the next Escape closes it', async () => {
    const onOpenChange = vi.fn()
    render(
      <Dialog title="Labels" defaultOpen onOpenChange={onOpenChange}>
        <TagInput aria-label="Labels" />
      </Dialog>,
    )
    await userEvent.click(field())
    await userEvent.keyboard('regressio{Escape}')
    await vi.waitFor(() => expect(field().value).toBe(''))
    await sleep(60)
    expect(onOpenChange).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toBeTruthy()

    await userEvent.keyboard('{Escape}')
    await vi.waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
  })
})

describe('removing', () => {
  it('removes with the chip’s own button', async () => {
    const onChange = vi.fn()
    mount(
      <TagInput defaultValue={['billing', 'regression']} onChange={onChange} aria-label="Labels" />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Remove billing' }))
    expect(onChange).toHaveBeenCalledWith(['regression'])
  })

  it('removes the last chip on Backspace in an empty field, and not before', async () => {
    const onChange = vi.fn()
    mount(
      <TagInput defaultValue={['billing', 'regression']} onChange={onChange} aria-label="Labels" />,
    )
    await userEvent.click(field())

    await userEvent.keyboard('x{Backspace}')
    expect(onChange).not.toHaveBeenCalled()

    await userEvent.keyboard('{Backspace}')
    expect(onChange).toHaveBeenCalledWith(['billing'])
  })

  it('removes a focused chip with Delete, using only the keyboard', async () => {
    const onChange = vi.fn()
    mount(
      <TagInput defaultValue={['billing', 'regression']} onChange={onChange} aria-label="Labels" />,
    )
    await userEvent.click(field())
    // ← with the caret at position 0 moves into the chips.
    await userEvent.keyboard('{ArrowLeft}')
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Remove regression' }))

    await userEvent.keyboard('{ArrowLeft}')
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Remove billing' }))

    await userEvent.keyboard('{Delete}')
    expect(onChange).toHaveBeenCalledWith(['regression'])
  })

  it('moves back out of the chips into the field', async () => {
    mount(<TagInput defaultValue={['billing']} aria-label="Labels" />)
    await userEvent.click(field())
    await userEvent.keyboard('{ArrowLeft}{ArrowRight}')
    expect(document.activeElement).toBe(field())
  })

  it('reads the writing direction for an arrow only, and not for each typed character', async () => {
    mount(<TagInput defaultValue={['billing']} aria-label="Labels" />)
    await userEvent.click(field())
    const read = vi.spyOn(window, 'getComputedStyle')
    try {
      await userEvent.keyboard('abc')
      expect(read.mock.calls.filter(([element]) => element === field())).toEqual([])
    } finally {
      read.mockRestore()
    }
  })

  it('follows a right-to-left line: → moves back into the chips and ← forward to the field', async () => {
    render(
      <div dir="rtl">
        <TagInput defaultValue={['billing', 'regression']} aria-label="Labels" />
      </div>,
    )
    const chip = (tag: string) => screen.getByRole('button', { name: `Remove ${tag}` })
    await userEvent.click(field())
    await userEvent.keyboard('{ArrowLeft}')
    expect(document.activeElement).toBe(field())

    await userEvent.keyboard('{ArrowRight}')
    expect(document.activeElement).toBe(chip('regression'))
    await userEvent.keyboard('{ArrowRight}')
    expect(document.activeElement).toBe(chip('billing'))
    await userEvent.keyboard('{ArrowLeft}')
    expect(document.activeElement).toBe(chip('regression'))
    await userEvent.keyboard('{ArrowLeft}')
    expect(document.activeElement).toBe(field())
  })

  it('never leaves focus on the body when a chip is removed', async () => {
    mount(<TagInput defaultValue={['billing', 'regression']} aria-label="Labels" />)
    await userEvent.click(screen.getByRole('button', { name: 'Remove billing' }))
    expect(document.activeElement).not.toBe(document.body)
  })

  it('announces the removal politely', async () => {
    const root = mount(<TagInput defaultValue={['billing', 'regression']} aria-label="Labels" />)
    await userEvent.click(screen.getByRole('button', { name: 'Remove billing' }))

    const live = root.querySelector('[aria-live="polite"]') as HTMLElement
    expect(live.textContent).toBe('billing removed, 1 remain')
  })

  it('offers no removes at all when disabled', () => {
    mount(<TagInput disabled defaultValue={['billing']} aria-label="Labels" />)
    expect(screen.queryByRole('button', { name: 'Remove billing' })).toBeNull()
  })
})

describe('the maximum', () => {
  /*
   * At the maximum the field is neither unmounted nor disabled. Unmounting would leave a
   * label that names nothing. Disabling only half fixes that: a disabled input is out of
   * the tab order and the focusable tree, so a full field would have a `<label for>`
   * whose target cannot be reached. Keyboard users would reach the chips' remove buttons
   * with nothing before them to say what they belong to, while the chips stay fully
   * interactive.
   *
   * `readOnly` is the HTML state for exactly this: still the field, still focusable,
   * still labelled, and it accepts no text.
   */
  it('becomes read-only at max and stays reachable by keyboard', async () => {
    const root = mount(<TagInput defaultValue={['a', 'b', 'c']} max={3} aria-label="Labels" />)
    const input = field() as HTMLInputElement

    expect(root.dataset['state']).toBe('at-max')
    expect(input.readOnly).toBe(true)
    expect(input.disabled).toBe(false)

    // Reachable, which is the point: focus lands on it, and a click on the container
    // still moves focus there.
    input.focus()
    expect(document.activeElement).toBe(input)

    input.blur()
    // Dispatched on the container itself, because that is the target under test. A real
    // click lands at a coordinate, and with this many chips the container's centre is
    // a chip.
    root.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
    expect(document.activeElement).toBe(input)
  })

  it('accepts no text and commits nothing at the maximum', async () => {
    const onChange = vi.fn()
    mount(
      <TagInput defaultValue={['a', 'b', 'c']} max={3} onChange={onChange} aria-label="Labels" />,
    )
    await userEvent.click(field())
    await userEvent.keyboard('regression{Enter}')

    // Inactive rather than refusing: nothing is typed, so there is nothing to refuse
    // and no flash.
    expect((field() as HTMLInputElement).value).toBe('')
    expect(onChange).not.toHaveBeenCalled()
    expect(chipTexts()).toEqual(['a', 'b', 'c'])
  })

  it('explains why in the field’s existing description', () => {
    render(
      <FormField label="Labels" description="Comma separates">
        <TagInput defaultValue={['a', 'b', 'c']} max={3} />
      </FormField>,
    )
    const described = (field().getAttribute('aria-describedby') ?? '')
      .split(' ')
      .map((id) => document.getElementById(id)?.textContent)

    // Derived from `max`, so the announced number is the number the field enforces. It
    // is added to the field's description rather than replacing it, as the count is
    // below the maximum.
    expect(described).toContain('Maximum of 3 added')
    expect(described).toContain('Comma separates')
  })

  it('keeps the chips removable, and Backspace removes from a full field', async () => {
    const onChange = vi.fn()
    mount(
      <TagInput defaultValue={['a', 'b', 'c']} max={3} onChange={onChange} aria-label="Labels" />,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Remove a' }))
    expect(onChange).toHaveBeenLastCalledWith(['b', 'c'])

    // And from the keyboard, inside the field, which a disabled input would not allow.
    await userEvent.click(field())
    await userEvent.keyboard('{Backspace}')
    expect(onChange).toHaveBeenLastCalledWith(['b'])
  })

  it.skipIf(PASTE_IS_UNREADABLE)('stops a paste at the maximum instead of overflowing it', () => {
    const onChange = vi.fn()
    mount(<TagInput max={2} onChange={onChange} aria-label="Labels" />)
    paste(field(), 'a,b,c,d')
    expect(onChange).toHaveBeenCalledWith(['a', 'b'])
  })
})

describe('touched validation, with blur on the container', () => {
  it('does not fire when focus moves between the parts of one control', async () => {
    const onBlur = vi.fn()
    mount(<TagInput defaultValue={['ada', 'grace']} onBlur={onBlur} aria-label="Invite" />)

    field().focus()
    // ← from the field moves to the last chip's remove button. That is the same
    // control, so it is not a blur.
    await userEvent.keyboard('{ArrowLeft}')
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Remove grace')
    await userEvent.keyboard('{ArrowLeft}')
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Remove ada')
    await userEvent.keyboard('{ArrowRight}{ArrowRight}')
    expect(document.activeElement).toBe(field())

    expect(onBlur).not.toHaveBeenCalled()
  })

  it('fires once when focus leaves the whole field', async () => {
    const onBlur = vi.fn()
    render(
      <>
        <TagInput defaultValue={['ada']} onBlur={onBlur} aria-label="Invite" />
        <button type="button">Elsewhere</button>
      </>,
    )

    field().focus()
    screen.getByRole('button', { name: 'Elsewhere' }).focus()
    expect(onBlur).toHaveBeenCalledTimes(1)
  })
})

describe('the field it sits in', () => {
  it('is labelled through the inner input, the way an Input is', () => {
    render(
      <FormField label="Invite people" description="Comma separates">
        <TagInput defaultValue={['ada@relay.dev']} />
      </FormField>,
    )
    expect(screen.getByRole('textbox', { name: 'Invite people' })).toBeTruthy()
  })

  it('adds the chip count to the field’s description rather than replacing it', () => {
    render(
      <FormField label="Invite people" description="Comma separates">
        <TagInput defaultValue={['ada@relay.dev', 'grace@relay.dev']} />
      </FormField>,
    )
    const described = (field().getAttribute('aria-describedby') ?? '')
      .split(' ')
      .map((id) => document.getElementById(id)?.textContent)
    expect(described).toContain('Comma separates')
    expect(described).toContain('2 added')
  })

  it('takes invalid from the field and sets it on the input too', () => {
    render(
      <FormField label="Invite people" error="At least one person">
        <TagInput />
      </FormField>,
    )
    expect(field().getAttribute('aria-invalid')).toBe('true')
  })

  it('keeps all the wiring at max, so a full field is still labelled', () => {
    const { container } = render(
      <FormField label="Invite people" description="Comma separates" required>
        <TagInput defaultValue={['ada@relay.dev', 'grace@relay.dev', 'alan@relay.dev']} max={3} />
      </FormField>,
    )
    const input = screen.getByRole('textbox', { name: 'Invite people' }) as HTMLInputElement
    const label = container.querySelector('label') as HTMLLabelElement

    // The label's target exists, which is the point. A `for` that points at a node not
    // in the document names nothing. A `for` that points at a disabled node is barely
    // better, because the keyboard cannot reach it.
    expect(label.htmlFor).toBe(input.id)
    expect(document.getElementById(label.htmlFor)).toBe(input)
    expect(input.readOnly).toBe(true)
    expect(input.disabled).toBe(false)
    expect(input.getAttribute('aria-required')).toBe('true')

    const described = (input.getAttribute('aria-describedby') ?? '')
      .split(' ')
      .map((id) => document.getElementById(id)?.textContent)
    expect(described).toContain('Comma separates')
    expect(described).toContain('Maximum of 3 added')
  })

  it('posts the same values at max, because the maximum does not change the value', () => {
    // `readOnly` and `disabled` differ in an important way for forms: a disabled
    // control is not successful and posts nothing. A full field still has values.
    const { container } = render(
      <form>
        <TagInput name="invitees" defaultValue={['a', 'b']} max={2} aria-label="Invite" />
      </form>,
    )
    const form = container.querySelector('form') as HTMLFormElement
    expect(new FormData(form).get('invitees')).toBe('a,b')
  })

  it('serialises comma-joined for a native form post', () => {
    const root = mount(
      <TagInput
        name="invitees"
        defaultValue={['ada@relay.dev', 'grace@relay.dev']}
        aria-label="Invite"
      />,
    )
    const hidden = root.querySelector('input[type="hidden"]') as HTMLInputElement
    expect(hidden.name).toBe('invitees')
    expect(hidden.value).toBe('ada@relay.dev,grace@relay.dev')
    expect(hidden.disabled).toBe(false)
  })

  it('posts nothing while disabled, because the hidden input is disabled too', () => {
    const { container } = render(
      <form>
        <TagInput disabled name="invitees" defaultValue={['ada@relay.dev']} aria-label="Invite" />
      </form>,
    )
    const hidden = container.querySelector('input[type="hidden"]') as HTMLInputElement
    expect(hidden.disabled).toBe(true)

    // The browser's rule, checked rather than assumed: a disabled control is not
    // successful, so the post contains no `invitees` at all.
    const form = container.querySelector('form') as HTMLFormElement
    expect([...new FormData(form).keys()]).toEqual([])
  })
})

describe('recipe', () => {
  it('uses Input’s container styles in every state', () => {
    const rest = mount(<TagInput aria-label="Invite" />)
    expect(getComputedStyle(rest).backgroundColor).toBe(tokenColor('--pm-bg-surface'))
    expect(getComputedStyle(rest).borderTopColor).toBe(tokenColor('--pm-border-field'))

    const invalid = mount(<TagInput invalid aria-label="Invite" />)
    expect(getComputedStyle(invalid).borderTopColor).toBe(tokenColor('--pm-danger-border'))

    const disabled = mount(<TagInput disabled aria-label="Invite" />)
    expect(getComputedStyle(disabled).backgroundColor).toBe(tokenColor('--pm-bg-subtle'))
    expect(getComputedStyle(disabled).cursor).toBe('not-allowed')
  })

  it('keeps the tag a pill, whatever the geometry axis', () => {
    const root = mount(<TagInput defaultValue={['billing']} aria-label="Labels" />)
    const chip = partOf(root, styles.chip as string)
    const radius = Number.parseFloat(getComputedStyle(chip).borderTopLeftRadius)
    expect(radius).toBeGreaterThanOrEqual(chip.getBoundingClientRect().height / 2)
  })

  it('grows with its rows, unlike Input', () => {
    // The same width for both, so the only difference is the number of chips.
    const narrow = (node: React.ReactElement) =>
      render(node, { container: fixedWidthHost(280) }).container.firstElementChild as HTMLElement

    const one = narrow(<TagInput defaultValue={['billing']} aria-label="Labels" />)
    const many = narrow(
      <TagInput
        defaultValue={['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight']}
        aria-label="Labels"
      />,
    )
    expect(many.getBoundingClientRect().height).toBeGreaterThan(one.getBoundingClientRect().height)
  })

  it('meets the minimum target size from inside a chip that is smaller', () => {
    // The chip is `control-height-sm` minus its padding on purpose, so the button
    // enlarges its hit area with a negative inset instead of enlarging the chip. This
    // is the technique from checkbox.module.css, tested the same way.
    const root = mount(<TagInput defaultValue={['billing']} aria-label="Labels" />)
    const button = screen.getByRole('button', { name: 'Remove billing' })
    const laidOut = button.getBoundingClientRect()
    const inset = Number.parseFloat(getComputedStyle(button, '::before').insetBlockStart || '0')
    const floor = Number.parseFloat(tokenLength('--pm-control-height-sm'))

    expect(laidOut.height).toBeLessThan(floor)
    expect(laidOut.height - 2 * inset).toBeGreaterThanOrEqual(floor)
    expect(laidOut.width - 2 * inset).toBeGreaterThanOrEqual(floor)
    expect(root).toBeTruthy()
  })
})

describe('the list is a real list', () => {
  it('is `<ul>` of `<li>`, flowing inline with the field', () => {
    const root = mount(<TagInput defaultValue={['billing']} aria-label="Labels" />)
    const list = root.querySelector('ul') as HTMLElement
    expect(list.firstElementChild?.tagName).toBe('LI')
    // `display: contents` lets the field continue after the last chip instead of
    // starting a block under the list.
    expect(getComputedStyle(list).display).toBe('contents')
  })
})

describe('the focus-zoom floor, below 30rem', () => {
  afterEach(async () => {
    await page.viewport(1280, 800)
  })

  it('sets the inline input to the text-entry floor’s size, and the chips do not change', async () => {
    await page.viewport(420, 800)
    const root = mount(<TagInput defaultValue={['billing']} aria-label="Labels" />)

    await vi.waitFor(() => {
      expect(getComputedStyle(field()).fontSize).toBe(tokenLength('--pm-text-entry-size'))
    })
    // Chips are not text entry (tag-input.md's cell), so they keep their own size.
    const chip = root.querySelector(`.${styles.chip}`) as HTMLElement
    expect(getComputedStyle(chip).fontSize).toBe(tokenLength('--pm-text-sm-size'))
  })
})

/**
 * An agent adds a tag as Enter commits one and clears them all, as the spec's `agent` fence
 * declares (`design/components/tag-input.md`, Agent), and is refused what Enter would not add.
 */
describe('an agent', () => {
  it('adds tags to an uncontrolled and a controlled TagInput, and clears them', async () => {
    const bridge = createAgentBridge()
    try {
      const onChange = vi.fn()
      function Held() {
        const [value, setValue] = useState(['ada@relay.dev'])
        return <TagInput value={value} onChange={setValue} aria-label="Held" />
      }
      render(
        <>
          <TagInput onChange={onChange} aria-label="Free" />
          <Held />
        </>,
      )
      const [free, held] = bridge.snapshot().members
      expect(free).toMatchObject({ member: 'TagInput', name: 'Free', state: { value: [] } })
      const { results } = await bridge.act([
        { id: free?.id, action: 'add', value: '  billing ' },
        { id: free?.id, action: 'add', value: 'regression' },
        { id: held?.id, action: 'add', value: 'grace@relay.dev' },
        { id: held?.id, action: 'clear' },
      ])
      expect(results).toMatchObject([
        { ok: true, changed: { value: { from: [], to: ['billing'] } } },
        { ok: true, changed: { value: { from: ['billing'], to: ['billing', 'regression'] } } },
        { ok: true, changed: { value: { to: ['ada@relay.dev', 'grace@relay.dev'] } } },
        { ok: true, changed: { value: { to: [] } } },
      ])
      expect(onChange.mock.calls).toEqual([[['billing']], [['billing', 'regression']]])
    } finally {
      bridge.dispose()
    }
  })

  it('refuses what Enter would not add, and leaves the tags as they were', async () => {
    const bridge = createAgentBridge()
    try {
      const onChange = vi.fn()
      render(
        <>
          <TagInput
            defaultValue={['billing']}
            validate={(raw) => (raw.includes('@') ? raw.trim() : null)}
            onChange={onChange}
            aria-label="Invite"
          />
          <TagInput defaultValue={['a', 'b']} max={2} onChange={onChange} aria-label="Full" />
        </>,
      )
      const [invite, full] = bridge.snapshot().members
      for (const [id, value, words] of [
        [invite?.id, 'not an address', 'refuses'],
        [invite?.id, 'ada@relay.dev, grace@relay.dev', 'comma'],
        [full?.id, 'c', 'maximum of 2'],
      ] as const) {
        const { results } = await bridge.act([{ id, action: 'add', value }])
        expect(results[0]).toMatchObject({
          ok: false,
          error: { code: 'failed', message: expect.stringContaining(words) },
        })
      }
      await bridge.act([{ id: invite?.id, action: 'add', value: 'ada@relay.dev' }])
      const again = await bridge.act([{ id: invite?.id, action: 'add', value: 'ada@relay.dev ' }])
      expect(again.results[0]).toMatchObject({
        ok: false,
        error: { code: 'failed', message: expect.stringContaining('already holds') },
      })
      expect(onChange.mock.calls).toEqual([[['billing', 'ada@relay.dev']]])
    } finally {
      bridge.dispose()
    }
  })
})
