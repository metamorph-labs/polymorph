import { render } from '@testing-library/react'
import { userEvent } from 'vitest/browser'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { PASTE_IS_UNREADABLE } from '@polymorph/conformance/engines'
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
import { installTestTheme } from '@polymorph/engine/testing'
import { FormField } from './FormField'
import { OTPInput, type OTPInputProps } from './OTPInput'

/**
 * OTPInput, in a real browser.
 *
 * These tests cover the single-input design: one focusable element, one label target,
 * a caret that always stays at the end, and drawn cells that always match the value.
 * Everything here needs a real caret, real selection and real keystrokes.
 */

beforeAll(installTestTheme)

function mount(node: React.ReactElement): HTMLElement {
  return render(node).container.firstElementChild as HTMLElement
}

/**
 * Dispatches a real `paste` event with real clipboard data. It is TagInput's helper,
 * used for the same reason: the harness's `userEvent.paste` goes through the platform
 * clipboard, which a headless run does not fill.
 */
function paste(target: HTMLElement, text: string): void {
  const data = new DataTransfer()
  data.setData('text', text)
  target.dispatchEvent(
    new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data }),
  )
}

const input = (root: HTMLElement) => root.querySelector('input') as HTMLInputElement
const cells = (root: HTMLElement) => [...root.querySelectorAll('span[aria-hidden]')]
const painted = (root: HTMLElement) =>
  cells(root)
    .map((cell) => cell.textContent ?? '')
    .join('')

describe('the closed surface', () => {
  it('has no style escape hatch', () => {
    assertGoverned<OTPInputProps>(true)
  })
})

describe('the single input', () => {
  it('is one focusable value with one real label target', async () => {
    const { getByLabelText } = render(
      <FormField label="Verification code" description="We sent a code to a@relay.dev.">
        <OTPInput />
      </FormField>,
    )

    // FormField's `<label for>` reaches the one real input. This is the main reason
    // the member is a single input.
    const field = getByLabelText('Verification code') as HTMLInputElement
    expect(field.tagName).toBe('INPUT')
    expect(field.getAttribute('autocomplete')).toBe('one-time-code')
    expect(field.getAttribute('inputmode')).toBe('numeric')

    // The cells are presentational, and the group is one tab stop.
    await userEvent.click(field)
    expect(document.activeElement).toBe(field)
  })

  it('draws a cell per typed digit and filters everything else', async () => {
    const onChange = vi.fn()
    const root = mount(<OTPInput onChange={onChange} aria-label="Verification code" />)

    await userEvent.click(input(root))
    await userEvent.keyboard('4a2b8')
    expect(onChange).toHaveBeenLastCalledWith('428')
    expect(painted(root)).toBe('428')
    expect(cells(root).filter((cell) => cell.hasAttribute('data-filled'))).toHaveLength(3)
  })

  it('keeps the caret at the end, where clicks and arrows cannot move it', async () => {
    const root = mount(<OTPInput defaultValue="42" aria-label="Verification code" />)

    // A press over the first cell lands on the input that covers the group (the drawn
    // cells ignore the pointer), and the caret goes to the end, not the click point.
    await userEvent.click(input(root), { position: { x: 8, y: 8 } })
    expect(document.activeElement).toBe(input(root))
    expect(input(root).selectionStart).toBe(2)

    await userEvent.keyboard('{ArrowLeft}{Home}')
    expect(input(root).selectionStart).toBe(2)

    // The caret cell shows the caret position, and only while focused.
    expect(cells(root)[2]?.hasAttribute('data-caret')).toBe(true)
    input(root).blur()
    await vi.waitFor(() =>
      expect(cells(root).some((cell) => cell.hasAttribute('data-caret'))).toBe(false),
    )
  })

  it('deletes back with Backspace and ignores typing when full', async () => {
    const onChange = vi.fn()
    const root = mount(
      <OTPInput defaultValue="428051" onChange={onChange} aria-label="Verification code" />,
    )

    await userEvent.click(input(root))
    await userEvent.keyboard('9')
    expect(onChange).not.toHaveBeenCalled()
    expect(painted(root)).toBe('428051')

    await userEvent.keyboard('{Backspace}')
    expect(onChange).toHaveBeenLastCalledWith('42805')
    await userEvent.keyboard('9')
    expect(onChange).toHaveBeenLastCalledWith('428059')
  })

  it('shows the ring on the last cell when full and focused', async () => {
    const root = mount(<OTPInput defaultValue="428051" aria-label="Verification code" />)

    // When full, the caret has nowhere further to go. A focused control must still
    // show focus, so the proxy focus ring goes on the LAST cell.
    await userEvent.click(input(root))
    const last = cells(root)[5] as HTMLElement
    expect(last.hasAttribute('data-caret')).toBe(true)
    expect(last.hasAttribute('data-filled')).toBe(true)
    expect(cells(root).filter((cell) => cell.hasAttribute('data-caret'))).toHaveLength(1)
    expect(getComputedStyle(last).outlineStyle).toBe('solid')

    // Backspace empties the last cell, which keeps the caret as the empty slot.
    await userEvent.keyboard('{Backspace}')
    expect(cells(root)[5]?.hasAttribute('data-caret')).toBe(true)
    expect(cells(root)[5]?.hasAttribute('data-filled')).toBe(false)

    // Blur removes the caret cell, so the ring never stays after focus leaves.
    input(root).blur()
    await vi.waitFor(() =>
      expect(cells(root).some((cell) => cell.hasAttribute('data-caret'))).toBe(false),
    )
  })

  it('draws the caret cell’s mark inside a wrong code’s danger border, so both show', async () => {
    // The mark lies inside the cell's edge, and a wrong code draws its state in the border, so the
    // mark moves in past the border, as the focus convention moves it on an invalid field.
    const root = mount(<OTPInput invalid aria-label="Verification code" />)
    await userEvent.click(input(root))
    const caret = getComputedStyle(cells(root)[0] as HTMLElement)
    expect(caret.outlineStyle).toBe('solid')
    expect(-Number.parseFloat(caret.outlineOffset)).toBe(
      Number.parseFloat(caret.outlineWidth) + Number.parseFloat(caret.borderTopWidth),
    )
  })

  it('draws the caret cell’s focus inside its edge where a system that moves the mark outside chooses the field border style', async () => {
    // A nested pairing whose system moves every mark outside (an offset of 0) and sets
    // `overrides.focus.field`, read by the recipe's style query, as Input's field reads it
    // through the focus convention.
    const theme = resolveTheme(
      composeTheme(
        {
          ...exampleQuietSystem,
          name: 'example-otp-border',
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
    const root = render(<OTPInput aria-label="Verification code" />, { container: host }).container
      .firstElementChild as HTMLElement

    await userEvent.click(input(root))
    const caret = cells(root)[0] as HTMLElement
    expect(caret.hasAttribute('data-caret')).toBe(true)
    expect(getComputedStyle(caret).outlineStyle).toBe('solid')
    expect(getComputedStyle(caret).outlineWidth).toBe(theme.tokens.focus.width)
    expect(getComputedStyle(caret).outlineOffset).toBe(`-${theme.tokens.focus.width}`)
    host.remove()
  })
})

describe('the completion callbacks', () => {
  it('fires onComplete once, after onChange, on the transition to full', async () => {
    const calls: string[] = []
    const onChange = vi.fn(() => calls.push('change'))
    const onComplete = vi.fn(() => calls.push('complete'))
    const root = mount(
      <OTPInput
        length={4}
        defaultValue="425"
        onChange={onChange}
        onComplete={onComplete}
        aria-label="Verification code"
      />,
    )

    await userEvent.click(input(root))
    await userEvent.keyboard('1')

    expect(onComplete).toHaveBeenCalledExactlyOnceWith('4251')
    expect(calls).toEqual(['change', 'complete'])

    // When full, more typing neither changes the value nor fires again.
    await userEvent.keyboard('9')
    expect(onComplete).toHaveBeenCalledOnce()
  })

  it.skipIf(PASTE_IS_UNREADABLE)(
    'fills the cells from the first one on paste, replacing the existing value',
    async () => {
      const onComplete = vi.fn()
      const root = mount(
        <OTPInput defaultValue="99" onComplete={onComplete} aria-label="Verification code" />,
      )

      await userEvent.click(input(root))
      // A pasted code can include any punctuation the sender added.
      paste(input(root), 'code: 428-051')

      await vi.waitFor(() => expect(painted(root)).toBe('428051'))
      expect(onComplete).toHaveBeenCalledExactlyOnceWith('428051')
    },
  )
})

describe('the form post', () => {
  it('serialises from the real input directly, with no hidden input', () => {
    const root = mount(<OTPInput name="otp" defaultValue="428051" aria-label="Verification code" />)
    expect(input(root).name).toBe('otp')
    expect(input(root).value).toBe('428051')
    expect(root.querySelectorAll('input')).toHaveLength(1)
  })
})

/**
 * An agent reads that the code is there and never what it is, and enters none, as the spec's
 * `agent` fence declares (`design/components/otp-input.md`, Agent): a person types the code
 * they were sent.
 */
describe('an agent', () => {
  it('reads the code as secret in every output and is given no action', async () => {
    const bridge = createAgentBridge()
    try {
      const heard: unknown[] = []
      bridge.subscribe((change) => heard.push(change))
      const root = mount(<OTPInput defaultValue="73" aria-label="Verification code" />)
      input(root).focus()
      await userEvent.keyboard('9051')
      await vi.waitFor(() => expect(input(root).value).toBe('739051'))

      const [member] = bridge.snapshot().members
      expect(member).toMatchObject({
        member: 'OTPInput',
        name: 'Verification code',
        state: { value: { secret: true }, disabled: false, invalid: false },
        actions: [],
      })
      expect(JSON.stringify(bridge.snapshot())).not.toContain('739051')
      expect(bridge.query({ name: '739051' })).toEqual([])
      expect(bridge.query({ text: '739051' })).toEqual([])
      const { results } = await bridge.act([{ id: member?.id, action: 'fill', value: '111111' }])
      expect(results[0]).toMatchObject({ ok: false, error: { code: 'not-allowed', allowed: [] } })
      expect(input(root).value).toBe('739051')
      expect(JSON.stringify([results, heard])).not.toContain('739051')
    } finally {
      bridge.dispose()
    }
  })
})
