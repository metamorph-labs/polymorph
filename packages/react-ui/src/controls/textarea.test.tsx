import { render, screen } from '@testing-library/react'
import { page, userEvent } from 'vitest/browser'
import { createRef, useState, type SyntheticEvent } from 'react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { assertGoverned } from '@polymorph/react'
import { createAgentBridge } from '@polymorph/engine/agent'
import { installTestTheme } from '@polymorph/engine/testing'
import { FormField } from './FormField'
import { Textarea, type TextareaProps } from './Textarea'
import { tokenColor, tokenLength } from './token-probe'

/**
 * Textarea (`design/components/textarea.md`).
 *
 * Input's design extended vertically, so most of its behaviour is Input's and already
 * tested. These tests cover the differences: what it deliberately does not inherit, and
 * the one thing it adds.
 */

beforeAll(installTestTheme)

function mount(props: Partial<TextareaProps> = {}) {
  const { container } = render(<Textarea aria-label="Notes" {...props} />)
  return container.firstElementChild as HTMLTextAreaElement
}

describe('the closed surface', () => {
  it('has no style escape hatch', () => {
    assertGoverned<TextareaProps>(true)
  })

  it('inherits none of Input’s extras', () => {
    // No sizes, no leading icon, no clear button, no trailing slot. A long value is
    // edited rather than cleared, and `rows` sets the height.
    // @ts-expect-error — a multi-line field has no `size`; `rows` sets the height.
    const sized: TextareaProps = { size: 'sm' }
    // @ts-expect-error — nothing is embedded in it, so there is no icon slot.
    const decorated: TextareaProps = { icon: 'search' }
    // @ts-expect-error — a long value is edited, not discarded in one click.
    const clearable: TextareaProps = { clearable: true }

    expect([sized, decorated, clearable]).toHaveLength(3)
  })
})

describe('the height decision', () => {
  it('is rows, in line units', () => {
    expect(mount().rows).toBe(4)
    expect(mount({ rows: 8 }).rows).toBe(8)
  })

  it('never falls below a control height, however few rows it is given', () => {
    // A one-row textarea is still a field, and a field shorter than every other control
    // on the form would look like a rendering bug.
    const box = mount({ rows: 1 })
    expect(Number.parseFloat(getComputedStyle(box).minBlockSize)).toBeGreaterThan(0)
  })
})

describe('resizing', () => {
  it('is vertical by default, and never horizontal', () => {
    // Column width belongs to the layout, not the user. A field dragged wider than its
    // line length would break the layout.
    expect(getComputedStyle(mount()).resize).toBe('vertical')
  })

  it('can be fixed', () => {
    const box = mount({ resize: 'none' })
    expect(box.dataset['resize']).toBe('none')
    expect(getComputedStyle(box).resize).toBe('none')
  })
})

/**
 * `autosize` is opt-in, for the reason the spec gives: a field that grows while typing
 * moves everything below it.
 */
describe('autosize', () => {
  const LINES = 'one\ntwo\nthree\nfour\nfive\nsix\nseven\neight'
  const noop = () => {}

  it('is as tall as its content', () => {
    const one = mount({ autosize: true, defaultValue: 'one line' })
    const many = mount({ autosize: true, defaultValue: LINES })
    expect(many.getBoundingClientRect().height).toBeGreaterThan(one.getBoundingClientRect().height)
  })

  it('shrinks back when content is removed', () => {
    // `scrollHeight` never reads below the element's own height, so a field measured
    // without resetting the height first can only grow.
    const { container, rerender } = render(
      <Textarea aria-label="Notes" autosize value={LINES} onChange={noop} />,
    )
    const box = container.firstElementChild as HTMLTextAreaElement
    const tall = box.getBoundingClientRect().height

    rerender(<Textarea aria-label="Notes" autosize value="one line" onChange={noop} />)
    expect(box.getBoundingClientRect().height).toBeLessThan(tall)
  })

  it('keeps `rows` as the floor', () => {
    // The caller still decides the height, and autosize only adds to it. Without the
    // floor the field would measure its one line and stay there, and `rows`, which is
    // documented as setting the height, would have no effect.
    const box = mount({ autosize: true, rows: 6, defaultValue: 'one line' })
    const floor = mount({ rows: 6 }).getBoundingClientRect().height

    expect(box.getBoundingClientRect().height).toBeGreaterThanOrEqual(floor)
    // And at most one rounded pixel above it. `scrollHeight` and `offsetHeight` are
    // integers, so the border-box calculation lands on a whole pixel where the intrinsic
    // height does not.
    expect(box.getBoundingClientRect().height).toBeLessThan(floor + 1)
  })

  it('removes the drag handle, so the height has only one owner', () => {
    const box = mount({ autosize: true })
    expect(box.dataset['autosize']).toBe('')
    expect(box.dataset['resize']).toBe('none')
    expect(getComputedStyle(box).resize).toBe('none')
  })

  it('leaves a plain field’s height alone', () => {
    const box = mount({ defaultValue: LINES })
    expect(box.dataset['autosize']).toBeUndefined()
    expect(box.style.height).toBe('')
  })
})

describe('focus and blur, as in Input', () => {
  it('reports focus and blur, as Input does', () => {
    const onBlur = vi.fn()
    const onFocus = vi.fn()
    const box = mount({ onBlur, onFocus })

    box.focus()
    expect(onFocus).toHaveBeenCalledTimes(1)

    box.blur()
    expect(onBlur).toHaveBeenCalledTimes(1)
  })

  it('opens focused when asked', () => {
    const box = mount({ autoFocus: true })
    expect(document.activeElement).toBe(box)
  })
})

describe('states', () => {
  it('reports what was typed', async () => {
    const onChange = vi.fn()
    mount({ onChange })
    await userEvent.type(screen.getByRole('textbox'), 'broke')
    expect(onChange).toHaveBeenLastCalledWith('broke', expect.anything())
  })

  it('keeps the error border on hover', async () => {
    const box = mount({ invalid: true })
    expect(box.dataset['invalid']).toBe('')
    expect(getComputedStyle(box).borderTopColor).toBe(tokenColor('--pm-danger-border'))

    await userEvent.hover(box)
    expect(getComputedStyle(box).borderTopColor).toBe(tokenColor('--pm-danger-border'))
  })

  it('separates disabled from read-only', () => {
    // Read-only is a value you can select but not change. Disabled is a field that is
    // not part of this form yet.
    expect(mount({ readOnly: true }).dataset['readonly']).toBe('')
    expect(mount({ disabled: true }).dataset['disabled']).toBe('')
    expect(mount({ disabled: true }).disabled).toBe(true)
    expect(mount({ readOnly: true }).disabled).toBe(false)
  })
})

describe('wiring', () => {
  it('is labelled, described and invalidated by its FormField, exactly as Input is', () => {
    render(
      <FormField label="What happened?" error="Tell us what you were doing at the time.">
        <Textarea />
      </FormField>,
    )
    const box = screen.getByRole('textbox', {
      name: 'What happened?',
      description: 'Tell us what you were doing at the time.',
    })
    expect(box.getAttribute('aria-invalid')).toBe('true')
  })

  it('can be named by a label elsewhere, for a SettingsRow', () => {
    render(
      <>
        <span id="notes-label">Internal notes</span>
        <Textarea aria-labelledby="notes-label" />
      </>,
    )
    expect(screen.getByRole('textbox', { name: 'Internal notes' })).toBeTruthy()
  })
})

/**
 * The control seam, as on Input, on a field that also measures itself. The check
 * specific to Textarea: the autosizer and the caller hold the same node, so the height
 * the member writes is on the element the binding reads, through every controlled
 * rerender.
 */
describe('the control seam', () => {
  const MANY = Array.from({ length: 8 }, (_, index) => `line ${index + 1}`).join('\n')
  const noop = () => {}

  function selectionOf(event: SyntheticEvent<HTMLTextAreaElement>) {
    const { selectionStart, selectionEnd, selectionDirection } = event.currentTarget
    return { start: selectionStart, end: selectionEnd, direction: selectionDirection }
  }

  function engineWrites(box: HTMLTextAreaElement, text: string) {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set?.call(box, text)
  }

  it('hands the same <textarea> to the caller and to the autosizer', () => {
    const ref = createRef<HTMLTextAreaElement>()
    const box = mount({ autosize: true, defaultValue: MANY, controlRef: ref })
    expect(ref.current).toBe(box)
    // The autosizer measured this node. The height it wrote is on the element the caller
    // holds, and it matches the content.
    expect(ref.current?.style.height).not.toBe('')
    const one = mount({ autosize: true, defaultValue: 'one line' })
    expect(box.getBoundingClientRect().height).toBeGreaterThan(one.getBoundingClientRect().height)
  })

  it('keeps autosizing through controlled rerenders, on the same node', () => {
    const attach = vi.fn()
    const { container, rerender } = render(
      <Textarea aria-label="Notes" autosize value={MANY} onChange={noop} controlRef={attach} />,
    )
    const box = container.firstElementChild as HTMLTextAreaElement
    const tall = box.getBoundingClientRect().height

    rerender(
      <Textarea aria-label="Notes" autosize value="one" onChange={noop} controlRef={attach} />,
    )
    expect(container.firstElementChild).toBe(box)
    expect(box.getBoundingClientRect().height).toBeLessThan(tall)
    // Attached once: the node never changed, so the ref was called only once.
    expect(attach).toHaveBeenCalledTimes(1)
    expect(attach).toHaveBeenCalledWith(box)
  })

  it('calls a callback ref with the node, then with null', () => {
    const seen: (HTMLTextAreaElement | null)[] = []
    const { container, unmount } = render(
      <Textarea
        aria-label="Notes"
        controlRef={(node) => {
          seen.push(node)
        }}
      />,
    )
    const box = container.firstElementChild
    expect(seen).toEqual([box])

    unmount()
    expect(seen).toEqual([box, null])
  })

  it('keeps the caret where the user put it across a rerender', () => {
    const { container, rerender } = render(
      <Textarea aria-label="Notes" value="hello world" onChange={noop} />,
    )
    const box = container.firstElementChild as HTMLTextAreaElement
    box.focus()
    box.setSelectionRange(2, 5, 'backward')

    rerender(<Textarea aria-label="Notes" value="hello world" invalid onChange={noop} />)
    expect(container.firstElementChild).toBe(box)
    expect(box.selectionStart).toBe(2)
    expect(box.selectionEnd).toBe(5)
    expect(box.selectionDirection).toBe('backward')
  })

  it('reports the selection as the platform holds it: start, end and direction', async () => {
    const seen: ReturnType<typeof selectionOf>[] = []
    const box = mount({
      defaultValue: 'hello world',
      onSelect: (event) => {
        seen.push(selectionOf(event))
      },
    })
    await userEvent.click(box)
    await userEvent.keyboard('{End}{Shift>}{ArrowLeft}{ArrowLeft}{/Shift}')
    expect(seen.at(-1)).toEqual({ start: 9, end: 11, direction: 'backward' })
  })

  it('delivers the IME events as the platform fires them, with no extra change', () => {
    const onChange = vi.fn()
    const onCompositionStart = vi.fn()
    const onCompositionEnd = vi.fn()
    const box = mount({ onChange, onCompositionStart, onCompositionEnd })
    box.focus()
    box.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: '' }))
    engineWrites(box, 'に')
    box.dispatchEvent(
      new InputEvent('input', {
        bubbles: true,
        data: 'に',
        inputType: 'insertCompositionText',
        isComposing: true,
      }),
    )
    box.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: 'に' }))

    expect(onCompositionStart).toHaveBeenCalledTimes(1)
    expect(onCompositionEnd).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith('に', expect.anything())
  })
})

describe('the focus-zoom floor, below 30rem', () => {
  afterEach(async () => {
    await page.viewport(1280, 800)
  })

  it('sets the textarea to the text-entry floor’s size and line height, and nothing else', async () => {
    await page.viewport(420, 800)
    const box = mount()

    await vi.waitFor(() => {
      expect(getComputedStyle(box).fontSize).toBe(tokenLength('--pm-text-entry-size'))
    })
    // Only the metrics change. The text colour is unchanged.
    expect(getComputedStyle(box).color).toBe(tokenColor('--pm-text-primary'))
  })
})

/**
 * An agent fills and clears a Textarea through the bridge, as its spec's `agent` fence declares
 * (`design/components/textarea.md`, Agent): through the field, as typing does, so `onChange` runs
 * in both forms. A read-only field refuses both.
 */
describe('an agent', () => {
  it('fills and clears an uncontrolled and a controlled Textarea through its own change path', async () => {
    const bridge = createAgentBridge()
    try {
      const free = vi.fn()
      function Held() {
        const [value, setValue] = useState('first')
        return <Textarea aria-label="Held" value={value} onChange={(next) => setValue(next)} />
      }
      render(
        <>
          <Textarea aria-label="Free" onChange={free} />
          <Held />
        </>,
      )
      const [one, two] = bridge.snapshot().members
      expect(one).toMatchObject({ member: 'Textarea', name: 'Free', state: { value: '' } })
      expect(two).toMatchObject({ name: 'Held', state: { value: 'first' } })

      const filled = await bridge.act([{ id: one?.id, action: 'fill', value: 'One\nTwo' }])
      expect(filled.results[0]).toEqual({
        ok: true,
        id: one?.id,
        changed: { value: { from: '', to: 'One\nTwo' } },
      })
      expect(free).toHaveBeenLastCalledWith('One\nTwo', expect.anything())

      const held = await bridge.act([
        { id: two?.id, action: 'fill', value: 'second' },
        { id: two?.id, action: 'clear' },
      ])
      expect(held.results).toMatchObject([
        { ok: true, changed: { value: { from: 'first', to: 'second' } } },
        { ok: true, changed: { value: { from: 'second', to: '' } } },
      ])
      expect(screen.getByLabelText('Held')).toHaveProperty('value', '')
    } finally {
      bridge.dispose()
    }
  })

  it('reads the value a controlled caller keeps, after a fill it did not take', async () => {
    const bridge = createAgentBridge()
    try {
      const onChange = vi.fn()
      render(<Textarea aria-label="Kept" value="kept" onChange={onChange} />)
      const [member] = bridge.snapshot().members
      const { results } = await bridge.act([{ id: member?.id, action: 'fill', value: 'other' }])
      expect(results[0]).toEqual({ ok: true, id: member?.id, changed: {} })
      expect(onChange).toHaveBeenCalledWith('other', expect.anything())
      expect(bridge.snapshot().members[0]?.state['value']).toBe('kept')
    } finally {
      bridge.dispose()
    }
  })

  it('is refused by a read-only Textarea, which keeps its value', async () => {
    const bridge = createAgentBridge()
    try {
      const onChange = vi.fn()
      render(<Textarea aria-label="Fixed" readOnly defaultValue="kept" onChange={onChange} />)
      const [member] = bridge.snapshot().members
      expect(member?.state).toEqual({
        value: 'kept',
        disabled: false,
        invalid: false,
        readonly: true,
      })
      for (const step of [{ action: 'fill', value: 'other' }, { action: 'clear' }]) {
        const { results } = await bridge.act([{ id: member?.id, ...step }])
        expect(results[0]).toMatchObject({
          ok: false,
          error: { code: 'failed', message: expect.stringContaining('read-only') },
        })
      }
      expect(onChange).not.toHaveBeenCalled()
      expect(screen.getByLabelText('Fixed')).toHaveProperty('value', 'kept')
    } finally {
      bridge.dispose()
    }
  })
})
