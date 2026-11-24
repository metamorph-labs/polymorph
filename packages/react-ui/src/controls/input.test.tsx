import { page, userEvent } from 'vitest/browser'
import { render, screen } from '@testing-library/react'
import { createRef, useState, type SyntheticEvent } from 'react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { assertGoverned } from '@polymorph/react'
import {
  appendThemeCSS,
  composeTheme,
  emitThemeCSS,
  exampleQuietSystem,
  exampleVioletPalette,
  resolveTheme,
} from '@polymorph/engine'
import { createAgentBridge } from '@polymorph/engine/agent'
import { fixedWidthHost, installTestTheme } from '@polymorph/engine/testing'
import { Input, type InputProps } from './Input'
import { tokenColor, tokenLength } from './token-probe'

/**
 * Input, in a real browser. The tests cover what a container around a native control can get
 * wrong: the ring must surround the field rather than the inner box, clearing must behave exactly
 * like typing, and the container's state must reach the parts that are not the input.
 */

beforeAll(installTestTheme)

interface Mounted {
  field: HTMLElement
  input: HTMLInputElement
  clear: HTMLButtonElement | null
}

/** RTL's own container. It is attached to the body for the cascade, and RTL cleans it up. */
function mount(node: React.ReactElement): Mounted {
  const { container } = render(node)
  return {
    field: container.firstElementChild as HTMLElement,
    input: container.querySelector('input') as HTMLInputElement,
    clear: container.querySelector('button'),
  }
}

describe('the closed surface', () => {
  it('has no style escape hatch', () => {
    assertGoverned<InputProps>(true)
  })
})

describe('the container is what the user sees', () => {
  it('styles the border and the fill on the container, not the input', () => {
    const { field, input } = mount(<Input aria-label="Subject" />)
    expect(getComputedStyle(field).backgroundColor).toBe(tokenColor('--pm-bg-surface'))
    expect(getComputedStyle(field).borderTopColor).toBe(tokenColor('--pm-border-field'))
    expect(getComputedStyle(input).backgroundColor).toBe('rgba(0, 0, 0, 0)')
    expect(getComputedStyle(input).borderTopWidth).toBe('0px')
  })

  it('takes its height from the control token at every size', () => {
    for (const size of ['sm', 'md', 'lg'] as const) {
      const { field } = mount(<Input size={size} aria-label="Subject" />)
      expect(getComputedStyle(field).height, size).toBe(tokenLength(`--pm-control-height-${size}`))
    }
  })

  it('draws the focus ring around the field when the inner input is focused', () => {
    const { field, input } = mount(<Input aria-label="Subject" />)
    expect(getComputedStyle(field).outlineStyle).toBe('none')

    input.focus({ focusVisible: true } as FocusOptions)
    // The ring is on the container, not the input. A ring on the input would sit a padding's
    // width inside the border that users see as the field.
    expect(getComputedStyle(field).outlineStyle).toBe('solid')
    expect(getComputedStyle(field).outlineWidth).toBe(tokenLength('--pm-focus-width'))
    expect(getComputedStyle(input).outlineStyle).toBe('none')
  })

  it('draws focus inside its edge where a system that moves the mark outside chooses the field border style', () => {
    // The system's choice reaches the member through its recipe alone: a nested pairing whose
    // system moves every mark outside (an offset of 0) and sets `overrides.focus.field`, read by
    // the focus convention's style query.
    const theme = resolveTheme(
      composeTheme(
        {
          ...exampleQuietSystem,
          name: 'example-input-border',
          overrides: { focus: { offset: 0, field: 'border' } },
        },
        exampleVioletPalette,
      ),
    )
    appendThemeCSS(emitThemeCSS(theme), theme.name)
    const host = document.createElement('div')
    host.setAttribute('data-system', theme.system)
    host.setAttribute('data-palette', theme.palette)
    document.body.append(host)
    const { container } = render(<Input aria-label="Subject" />, { container: host })
    const field = container.firstElementChild as HTMLElement
    container.querySelector('input')!.focus({ focusVisible: true } as FocusOptions)

    expect(getComputedStyle(field).outlineStyle).toBe('solid')
    expect(getComputedStyle(field).outlineWidth).toBe(theme.tokens.focus.width)
    expect(getComputedStyle(field).outlineOffset).toBe(`-${theme.tokens.focus.width}`)
    host.remove()
  })

  it('focuses the input when the container itself is clicked', () => {
    const { field, input } = mount(<Input icon="search" aria-label="Subject" />)
    field.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    expect(document.activeElement).toBe(input)
  })
})

describe('state reaches the parts that are not the input', () => {
  it('colours the leading icon from the field state', () => {
    const rest = mount(<Input icon="search" aria-label="Subject" />)
    const leading = (node: HTMLElement) => node.querySelector('span') as HTMLElement
    expect(getComputedStyle(leading(rest.field)).color).toBe(tokenColor('--pm-text-muted'))

    const invalid = mount(<Input invalid icon="search" aria-label="Subject" />)
    expect(getComputedStyle(leading(invalid.field)).color).toBe(tokenColor('--pm-danger-text'))

    const disabled = mount(<Input disabled icon="search" aria-label="Subject" />)
    expect(getComputedStyle(leading(disabled.field)).color).toBe(tokenColor('--pm-text-disabled'))
  })

  it('mirrors invalid to the attribute and to ARIA', () => {
    const { field, input } = mount(<Input invalid aria-label="Subject" />)
    expect(field.dataset['invalid']).toBe('')
    expect(input.getAttribute('aria-invalid')).toBe('true')
    expect(getComputedStyle(field).borderTopColor).toBe(tokenColor('--pm-danger-border'))
  })

  it('keeps the error border under a pointer', () => {
    // The hover rule excludes invalid rather than being out-specified by it, so this can be
    // checked without synthesising a hover: the rule cannot match.
    const { field } = mount(<Input invalid aria-label="Subject" />)
    expect(field.matches(':hover')).toBe(false)
    expect(getComputedStyle(field).borderTopColor).toBe(tokenColor('--pm-danger-border'))
  })

  it('marks read-only differently from disabled, and stays focusable and selectable', () => {
    const { field, input } = mount(<Input readOnly defaultValue="x" aria-label="Subject" />)
    expect(field.dataset['readonly']).toBe('')
    expect(field.dataset['disabled']).toBeUndefined()
    expect(input.readOnly).toBe(true)
    input.focus()
    expect(document.activeElement).toBe(input)
  })

  it('disables the native control, not just the styling', () => {
    const { field, input } = mount(<Input disabled aria-label="Subject" />)
    expect(input.disabled).toBe(true)
    expect(field.dataset['disabled']).toBe('')
    expect(getComputedStyle(field).backgroundColor).toBe(tokenColor('--pm-bg-subtle'))
  })
})

describe('type="number"', () => {
  it('sets min, max and step on the inner input, and leaves the rest to the platform', () => {
    const { input } = mount(<Input type="number" min={0} max={10} step={2} aria-label="Retries" />)
    expect(input.type).toBe('number')
    expect(input.min).toBe('0')
    expect(input.max).toBe('10')
    expect(input.step).toBe('2')
  })

  it('still reports a string, as the native input does (NumberInput parses numbers)', async () => {
    const onChange = vi.fn()
    const { input } = mount(<Input type="number" onChange={onChange} aria-label="Retries" />)
    await userEvent.click(input)
    await userEvent.keyboard('7')
    expect(onChange).toHaveBeenLastCalledWith('7', expect.anything())
  })
})

describe('the affixes', () => {
  function affixesOf(field: HTMLElement): HTMLElement[] {
    return [...field.querySelectorAll('span')].filter((node) => node.getAttribute('aria-hidden'))
  }

  it('sits beside the value at adornment strength, and never inside it', () => {
    const { field, input } = mount(
      <Input prefix="$" suffix="USD" defaultValue="120" aria-label="Amount" />,
    )
    const [prefix, suffix] = affixesOf(field)
    expect(prefix?.textContent).toBe('$')
    expect(suffix?.textContent).toBe('USD')
    expect(getComputedStyle(prefix as HTMLElement).color).toBe(tokenColor('--pm-text-muted'))
    // The affix only shows the unit and is not part of the value.
    expect(input.value).toBe('120')
  })

  it('flanks the value in reading order — prefix before the input, suffix after', () => {
    const { field, input } = mount(<Input prefix="$" suffix="USD" aria-label="Amount" />)
    const [prefix, suffix] = affixesOf(field)
    expect(
      (prefix as HTMLElement).compareDocumentPosition(input) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(
      input.compareDocumentPosition(suffix as HTMLElement) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it('is hidden from screen readers, so a unit that matters belongs in the label', () => {
    const { field } = mount(<Input prefix="$" aria-label="Amount" />)
    expect(affixesOf(field)[0]?.getAttribute('aria-hidden')).toBe('true')
  })

  it('takes the disabled colour with the icon, like every other adornment', () => {
    const { field } = mount(<Input prefix="$" disabled aria-label="Amount" />)
    expect(getComputedStyle(affixesOf(field)[0] as HTMLElement).color).toBe(
      tokenColor('--pm-text-disabled'),
    )
  })

  it('keeps its width and the padding after it in a narrow field, where the value gives way', () => {
    const suffix = '.preview.enduring.run'
    const wide = mount(<Input suffix={suffix} defaultValue="orbit" aria-label="Hostname" />)
    const natural = (affixesOf(wide.field)[0] as HTMLElement).getBoundingClientRect().width

    const host = fixedWidthHost(220)
    const { container } = render(
      <Input
        suffix={suffix}
        defaultValue="orbit-notes-for-the-quarterly-launch"
        aria-label="Hostname"
      />,
      { container: host },
    )
    const field = container.firstElementChild as HTMLElement
    const input = container.querySelector('input') as HTMLInputElement
    const frame = field.getBoundingClientRect()
    const box = (affixesOf(field)[0] as HTMLElement).getBoundingClientRect()
    const style = getComputedStyle(field)
    const end =
      frame.right -
      Number.parseFloat(style.borderRightWidth) -
      Number.parseFloat(style.paddingRight)

    expect(frame.width, 'the field fits its container').toBeLessThanOrEqual(220.5)
    expect(box.width, 'the affix keeps the width of its text').toBeCloseTo(natural, 0)
    expect(box.right, 'the field keeps its padding after the affix').toBeLessThanOrEqual(end + 0.5)
    expect(input.scrollWidth, 'the value does not fit').toBeGreaterThan(input.clientWidth)
    // The browser draws the ellipsis while the field is not focused, and scrolls the value to
    // the caret while it is.
    expect(getComputedStyle(input).textOverflow, 'the value ends in an ellipsis').toBe('ellipsis')
    host.remove()
  })
})

describe('the focus pair', () => {
  it('reports blur and focus, for touched validation without reading the DOM', async () => {
    const onBlur = vi.fn()
    const onFocus = vi.fn()
    const { input } = mount(<Input onBlur={onBlur} onFocus={onFocus} aria-label="Subject" />)

    input.focus()
    expect(onFocus).toHaveBeenCalledTimes(1)

    input.blur()
    expect(onBlur).toHaveBeenCalledTimes(1)
  })

  it('opens focused when asked, for surfaces that already moved the user', () => {
    const { input } = mount(<Input autoFocus aria-label="Subject" />)
    expect(document.activeElement).toBe(input)
  })
})

describe('exact', () => {
  it('turns off correction, capitals and spell check on the inner input', () => {
    const { input } = mount(<Input exact aria-label="Project name" />)
    expect(input.getAttribute('autocorrect')).toBe('off')
    expect(input.getAttribute('autocapitalize')).toBe('off')
    expect(input.spellcheck).toBe(false)
  })

  it('leaves a field without it to the platform', () => {
    const { input } = mount(<Input aria-label="Subject" />)
    expect(input.hasAttribute('autocorrect')).toBe(false)
    expect(input.hasAttribute('autocapitalize')).toBe(false)
    expect(input.hasAttribute('spellcheck')).toBe(false)
  })
})

describe('change', () => {
  it('reports the value, not the event, first', async () => {
    const onChange = vi.fn()
    const { input } = mount(<Input onChange={onChange} aria-label="Subject" />)
    await userEvent.click(input)
    await userEvent.keyboard('hi')
    expect(onChange).toHaveBeenLastCalledWith('hi', expect.anything())
  })

  it('drives a controlled caller', async () => {
    function Controlled() {
      const [value, setValue] = useState('')
      return <Input value={value} onChange={setValue} aria-label="Subject" />
    }
    const { input } = mount(<Controlled />)
    await userEvent.click(input)
    await userEvent.keyboard('two')
    expect(input.value).toBe('two')
  })
})

describe('clearable', () => {
  it('shows the clear button only while there is something to clear', () => {
    expect(mount(<Input clearable aria-label="Subject" />).clear).toBeNull()
    expect(
      mount(<Input clearable defaultValue="urgent" aria-label="Subject" />).clear,
    ).not.toBeNull()
  })

  it('presses like every other control, and never uses the danger role', () => {
    // The embedded-adornment convention (input.md): the clear is
    // an action, not a status, so an invalid field does not recolour it.
    const { clear } = mount(<Input clearable invalid defaultValue="???" aria-label="Query" />)
    expect(getComputedStyle(clear as HTMLElement).color).toBe(tokenColor('--pm-text-muted'))
    expect(getComputedStyle(clear as HTMLElement).borderTopLeftRadius).toBe(
      tokenLength('--pm-radius-sm'),
    )
  })

  it('never offers to clear a field that cannot be edited', () => {
    expect(
      mount(<Input clearable disabled defaultValue="x" aria-label="Subject" />).clear,
    ).toBeNull()
    expect(
      mount(<Input clearable readOnly defaultValue="x" aria-label="Subject" />).clear,
    ).toBeNull()
  })

  it('clears through the same path as typing, and reports it', () => {
    const onChange = vi.fn()
    const { input, clear } = mount(
      <Input clearable defaultValue="urgent" onChange={onChange} aria-label="Subject" />,
    )
    clear?.click()
    expect(input.value).toBe('')
    expect(onChange).toHaveBeenCalledWith('', expect.anything())
  })

  it('clears a controlled field too, which a direct callback could not', () => {
    function Controlled() {
      const [value, setValue] = useState('urgent')
      return <Input clearable value={value} onChange={setValue} aria-label="Subject" />
    }
    const { input, clear } = mount(<Controlled />)
    clear?.click()
    expect(input.value).toBe('')
  })

  it('returns focus to the field, so the next keystroke lands where it should', () => {
    const { input, clear } = mount(<Input clearable defaultValue="urgent" aria-label="Subject" />)
    clear?.click()
    expect(document.activeElement).toBe(input)
  })

  it('is a real, named, tab-reachable button', () => {
    const { clear } = mount(<Input clearable defaultValue="urgent" aria-label="Subject" />)
    expect(clear?.tagName).toBe('BUTTON')
    expect(clear?.getAttribute('aria-label')).toBe('Clear')
    expect(clear?.tabIndex).toBe(0)
  })

  it('meets the target floor, squared off against the field height', () => {
    const { clear } = mount(<Input clearable defaultValue="urgent" aria-label="Subject" />)
    const box = (clear as HTMLElement).getBoundingClientRect()
    expect(box.width).toBeCloseTo(box.height, 1)
    expect(box.width).toBeGreaterThanOrEqual(24)
  })
})

/**
 * The control seam.
 *
 * An application binding needs the native element, for example a collaboration layer restoring a
 * caret after a remote edit, or a form library reading a selection. The only other way to reach it
 * is a `querySelector` into a frame whose structure is not guaranteed. The tests cover identity
 * and delivery: both owners hold the same node, it survives every rerender, and the platform's
 * events reach the caller exactly as fired. The member moves no selection and adds no change.
 */
describe('the control seam', () => {
  const noop = () => {}

  /** The selection as the platform holds it, read off the event's own target. */
  function selectionOf(event: SyntheticEvent<HTMLInputElement>) {
    const { selectionStart, selectionEnd, selectionDirection } = event.currentTarget
    return { start: selectionStart, end: selectionEnd, direction: selectionDirection }
  }

  /** What an engine does mid-composition: writes the text past React's tracker. */
  function engineWrites(input: HTMLInputElement, text: string) {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, text)
  }

  it('passes the native input to an object ref, and clears it on unmount', () => {
    const ref = createRef<HTMLInputElement>()
    const { container, unmount } = render(<Input controlRef={ref} aria-label="Subject" />)
    // The control, not the frame. A plain `ref` would point at the frame.
    expect(ref.current).toBe(container.querySelector('input'))
    expect(ref.current).not.toBe(container.firstElementChild)

    unmount()
    expect(ref.current).toBeNull()
  })

  it('calls a callback ref with the node, then with null', () => {
    const seen: (HTMLInputElement | null)[] = []
    const { container, unmount } = render(
      <Input
        controlRef={(node) => {
          seen.push(node)
        }}
        aria-label="Subject"
      />,
    )
    const input = container.querySelector('input')
    expect(seen).toEqual([input])

    unmount()
    expect(seen).toEqual([input, null])
  })

  it('keeps one node through controlled rerenders, and leaves the caret where it was', () => {
    const attach = vi.fn()
    const { rerender } = render(
      <Input value="hello world" onChange={noop} controlRef={attach} aria-label="Subject" />,
    )
    const input = screen.getByRole('textbox') as HTMLInputElement
    expect(attach).toHaveBeenCalledWith(input)
    input.focus()
    input.setSelectionRange(2, 5)

    // A rerender the app caused for its own reasons. The member does not touch the selection, so
    // the caret stays where the user left it.
    rerender(
      <Input
        value="hello world"
        invalid
        onChange={noop}
        controlRef={attach}
        aria-label="Subject"
      />,
    )
    expect(input.selectionStart).toBe(2)
    expect(input.selectionEnd).toBe(5)

    // A value change is written into the same element, which is attached once and never passed
    // again, so a binding's reference survives every keystroke.
    rerender(
      <Input value="hello, world" onChange={noop} controlRef={attach} aria-label="Subject" />,
    )
    expect(screen.getByRole('textbox')).toBe(input)
    expect(input.value).toBe('hello, world')
    expect(attach).toHaveBeenCalledTimes(1)
  })

  it('reports the selection as the platform holds it — start, end and direction', async () => {
    const seen: ReturnType<typeof selectionOf>[] = []
    const { input } = mount(
      <Input
        defaultValue="hello world"
        onSelect={(event) => {
          seen.push(selectionOf(event))
        }}
        aria-label="Subject"
      />,
    )
    await userEvent.click(input)
    await userEvent.keyboard('{End}{Shift>}{ArrowLeft}{ArrowLeft}{/Shift}')
    expect(seen.at(-1)).toEqual({ start: 9, end: 11, direction: 'backward' })
  })

  it('delivers the IME pair as the platform fires it, and echoes no extra change', () => {
    const onChange = vi.fn()
    const onCompositionStart = vi.fn()
    const onCompositionEnd = vi.fn()
    const { input } = mount(
      <Input
        onChange={onChange}
        onCompositionStart={onCompositionStart}
        onCompositionEnd={onCompositionEnd}
        aria-label="Subject"
      />,
    )
    input.focus()
    input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: '' }))
    // The engine writes the composing text and fires `input` once, mid-composition.
    engineWrites(input, 'に')
    input.dispatchEvent(
      new InputEvent('input', {
        bubbles: true,
        data: 'に',
        inputType: 'insertCompositionText',
        isComposing: true,
      }),
    )
    input.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: 'に' }))

    expect(onCompositionStart).toHaveBeenCalledTimes(1)
    expect(onCompositionEnd).toHaveBeenCalledTimes(1)
    expect(onCompositionEnd.mock.calls[0]?.[0].data).toBe('に')
    // One change for one input event: nothing is suppressed while composing, and nothing is added
    // when it ends.
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith('に', expect.anything())
  })

  it('clears through the node the caller holds, by the same path and element', () => {
    const ref = createRef<HTMLInputElement>()
    const onChange = vi.fn()
    const { clear } = mount(
      <Input
        clearable
        defaultValue="urgent"
        controlRef={ref}
        onChange={onChange}
        aria-label="Subject"
      />,
    )
    clear?.click()
    expect(ref.current?.value).toBe('')
    expect(onChange).toHaveBeenCalledWith('', expect.anything())
    expect(document.activeElement).toBe(ref.current)
  })
})

describe('the phone minimum font size, below 30rem', () => {
  afterEach(async () => {
    await page.viewport(1280, 800)
  })

  it('gives the inner input the text-entry floor’s size and line height, and changes nothing else', async () => {
    await page.viewport(420, 800)
    const { field, input } = mount(<Input size="sm" aria-label="Subject" />)

    await vi.waitFor(() => {
      expect(getComputedStyle(input).fontSize).toBe(tokenLength('--pm-text-entry-size'))
    })
    // Only the input changes. The container keeps its size's text tokens and height, so the
    // leading icon, affix and clear button do not move.
    expect(getComputedStyle(field).fontSize).toBe(tokenLength('--pm-text-xs-size'))
    expect(getComputedStyle(field).height).toBe(tokenLength('--pm-control-height-sm'))
  })
})

/**
 * An agent fills and clears an Input through the bridge, as its spec's `agent` fence declares
 * (`design/components/input.md`, Agent): through the field, as typing does, so `onChange` runs in
 * both forms. A read-only field refuses both, and a password field never lets its value out.
 */
describe('an agent', () => {
  it('fills and clears an uncontrolled and a controlled Input through its own change path', async () => {
    const bridge = createAgentBridge()
    try {
      const free = vi.fn()
      function Held() {
        const [value, setValue] = useState('first')
        return <Input aria-label="Held" value={value} onChange={(next) => setValue(next)} />
      }
      render(
        <>
          <Input aria-label="Free" onChange={free} />
          <Held />
        </>,
      )
      const [one, two] = bridge.snapshot().members
      expect(one).toMatchObject({ name: 'Free', state: { value: '', readonly: false } })
      expect(two).toMatchObject({ name: 'Held', state: { value: 'first' } })

      const filled = await bridge.act([{ id: one?.id, action: 'fill', value: 'Ada' }])
      expect(filled.results[0]).toEqual({
        ok: true,
        id: one?.id,
        changed: { value: { from: '', to: 'Ada' } },
      })
      expect(free).toHaveBeenLastCalledWith('Ada', expect.anything())
      expect(screen.getByLabelText('Free')).toHaveProperty('value', 'Ada')

      const held = await bridge.act([{ id: two?.id, action: 'fill', value: 'second' }])
      expect(held.results[0]).toMatchObject({ ok: true, changed: { value: { to: 'second' } } })
      expect(screen.getByLabelText('Held')).toHaveProperty('value', 'second')
      const cleared = await bridge.act([{ id: two?.id, action: 'clear' }])
      expect(cleared.results[0]).toMatchObject({
        ok: true,
        changed: { value: { from: 'second', to: '' } },
      })
    } finally {
      bridge.dispose()
    }
  })

  it('is refused by a read-only Input, which keeps its value', async () => {
    const bridge = createAgentBridge()
    try {
      const onChange = vi.fn()
      render(<Input aria-label="Fixed" readOnly defaultValue="kept" onChange={onChange} />)
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

  it('reads a password Input as secret everywhere, and fills none', async () => {
    const SECRET = 'correct-horse-battery'
    const bridge = createAgentBridge()
    try {
      render(<Input aria-label="Password" type="password" defaultValue={SECRET} />)
      const [member] = bridge.snapshot().members
      expect(member?.state['value']).toEqual({ secret: true })
      expect(JSON.stringify(bridge.snapshot())).not.toContain('horse')
      expect(bridge.query({ name: SECRET })).toEqual([])
      expect(bridge.query({ text: SECRET })).toEqual([])
      const heard: unknown[] = []
      bridge.subscribe((change) => heard.push(change))
      const fill = await bridge.act([{ id: member?.id, action: 'fill', value: 'typed-by-agent' }])
      expect(fill.results[0]).toMatchObject({
        ok: false,
        error: { code: 'failed', message: expect.stringContaining('A person types a password') },
      })
      expect(screen.getByLabelText('Password')).toHaveProperty('value', SECRET)
      const clear = await bridge.act([{ id: member?.id, action: 'clear' }])
      expect(clear.results[0]).toEqual({ ok: true, id: member?.id, changed: {} })
      expect(JSON.stringify([fill, clear, heard])).not.toContain('horse')
    } finally {
      bridge.dispose()
    }
  })
})
