import { render, screen } from '@testing-library/react'
import { userEvent } from 'vitest/browser'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { assertGoverned } from '@polymorph/react'
import { createAgentBridge } from '@polymorph/engine/agent'
import { agentRegistrations, installTestTheme } from '@polymorph/engine/testing'
import { ColorInput, type ColorInputProps } from './ColorInput'

/**
 * ColorInput, in a real browser.
 *
 * The field works without the popup: hex in, commit on blur or Enter, invalid text reverted. The
 * popup, when opened, is React Aria's two-channel picker wired to the same value. The tests also
 * cover the colour model's one trap: hex loses the hue at the extremes, and the mirror keeps it.
 */

beforeAll(installTestTheme)

const field = () => screen.getByRole('textbox') as HTMLInputElement

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

describe('the closed surface', () => {
  it('has no style escape hatch', () => {
    assertGoverned<ColorInputProps>(true)
  })
})

describe('the field', () => {
  it('shows the value as bare digits after a # prefix the user never types', () => {
    render(<ColorInput defaultValue="#8864F0" pickerLabel="Choose accent colour" />)
    expect(field().value).toBe('8864f0')
    expect(screen.getByText('#')).toBeTruthy()
  })

  it('commits on Enter, normalized to lowercase hex', async () => {
    const onChange = vi.fn()
    render(<ColorInput pickerLabel="Choose accent colour" onChange={onChange} />)
    await userEvent.tripleClick(field())
    await userEvent.keyboard('0089EA{Enter}')
    expect(onChange).toHaveBeenLastCalledWith('#0089ea')
    expect(field().value).toBe('0089ea')
  })

  it('commits nothing on an Enter an input method is handling', async () => {
    const onChange = vi.fn()
    render(<ColorInput pickerLabel="Choose accent colour" onChange={onChange} />)
    await userEvent.tripleClick(field())
    await userEvent.keyboard('0089EA')
    inputMethodKey(field(), 'Enter', 'composing')
    inputMethodKey(field(), 'Enter', 'processed')
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(onChange).not.toHaveBeenCalled()
    await userEvent.keyboard('{Enter}')
    expect(onChange).toHaveBeenLastCalledWith('#0089ea')
  })

  it('commits on blur, and expands the three-digit shorthand', async () => {
    const onChange = vi.fn()
    render(
      <div>
        <ColorInput pickerLabel="Choose accent colour" onChange={onChange} />
        <a href="#next">Next stop</a>
      </div>,
    )
    await userEvent.tripleClick(field())
    await userEvent.keyboard('f0c')
    await userEvent.keyboard('{Tab}')
    expect(onChange).toHaveBeenLastCalledWith('#ff00cc')
  })

  it('strips a pasted #, so "#8864f0" lands as digits', async () => {
    const onChange = vi.fn()
    render(<ColorInput pickerLabel="Choose accent colour" onChange={onChange} />)
    await userEvent.tripleClick(field())
    await userEvent.keyboard('#8864f0{Enter}')
    expect(onChange).toHaveBeenLastCalledWith('#8864f0')
  })

  it('reverts invalid text to the previous colour instead of showing an error', async () => {
    const onChange = vi.fn()
    render(
      <ColorInput defaultValue="#8864f0" pickerLabel="Choose accent colour" onChange={onChange} />,
    )
    await userEvent.tripleClick(field())
    await userEvent.keyboard('zz{Enter}')
    expect(onChange).not.toHaveBeenCalled()
    expect(field().value).toBe('8864f0')
  })

  it('serializes through the hidden input when named', () => {
    render(<ColorInput defaultValue="#8864f0" name="accent" pickerLabel="Choose accent colour" />)
    const hidden = document.querySelector('input[type="hidden"][name="accent"]')
    expect(hidden?.getAttribute('value')).toBe('#8864f0')
  })

  it('uses eight digits with alpha', async () => {
    const onChange = vi.fn()
    render(
      <ColorInput
        alpha
        defaultValue="#8864f0cc"
        pickerLabel="Choose highlight colour"
        onChange={onChange}
      />,
    )
    expect(field().value).toBe('8864f0cc')
    await userEvent.tripleClick(field())
    await userEvent.keyboard('0089ea80{Enter}')
    expect(onChange).toHaveBeenLastCalledWith('#0089ea80')
  })
})

describe('the picker', () => {
  it('opens from the swatch as a named dialog holding the two-channel plane and the hue rail', async () => {
    render(<ColorInput defaultValue="#8864f0" pickerLabel="Choose accent colour" />)
    await userEvent.click(screen.getByRole('button', { name: 'Choose accent colour' }))
    expect(screen.getByRole('dialog', { name: 'Choose accent colour' })).toBeTruthy()
    // React Aria's accessibility model: two range inputs for the plane and one for the hue rail,
    // so three channels and no alpha. The unfocused plane input is hidden with aria-hidden, so
    // form listings count one "2d slider".
    expect(screen.getAllByRole('slider', { hidden: true })).toHaveLength(3)
  })

  it('adds the alpha rail only when the value carries the channel', async () => {
    render(
      <ColorInput
        alpha
        defaultValue="#8864f0cc"
        pickerLabel="Choose highlight colour"
        defaultOpen
      />,
    )
    await vi.waitFor(() => expect(screen.getAllByRole('slider', { hidden: true })).toHaveLength(4))
  })

  it('moves the value from the keyboard, one channel at a time', async () => {
    const onChange = vi.fn()
    render(
      <ColorInput
        defaultValue="#808080"
        pickerLabel="Choose accent colour"
        onChange={onChange}
        defaultOpen
      />,
    )
    const [saturation] = await vi.waitFor(() => {
      const sliders = screen.getAllByRole('slider', { hidden: true })
      expect(sliders.length).toBe(3)
      return sliders
    })
    ;(saturation as HTMLElement).focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(onChange).toHaveBeenCalled()
    expect(onChange.mock.lastCall?.[0]).toMatch(/^#[0-9a-f]{6}$/)
  })

  it('keeps the hue that hex cannot carry', async () => {
    render(<ColorInput defaultValue="#00ff00" pickerLabel="Choose accent colour" defaultOpen />)
    const sliders = await vi.waitFor(() => {
      const found = screen.getAllByRole('slider', { hidden: true })
      expect(found.length).toBe(3)
      return found
    })
    // The plane is one tab stop that drives both channels: arrows move x and PageUp/PageDown move
    // y (brightness). The hue rail comes after it.
    const plane = sliders[0] as HTMLInputElement
    const hue = sliders[2] as HTMLInputElement

    plane.focus()
    await userEvent.keyboard('{PageDown}'.repeat(10))
    // The hex value is black, but the picker still holds the green hue.
    expect(field().value).toBe('000000')
    expect(Number(hue.value)).toBe(120)
  })
})

/**
 * An agent sees ColorInput, and not the Input or the picker's Popover it draws, and sets it by
 * its hex as the hex field's commit does, as the spec's `agent` fence declares
 * (`design/components/color-input.md`, Agent).
 */
describe('an agent', () => {
  it('sees one ColorInput with the picker open, and nothing its panel draws', async () => {
    render(
      <ColorInput
        defaultValue="#8864f0"
        pickerLabel="Choose accent colour"
        aria-label="Accent colour"
        defaultOpen
      />,
    )
    const panel = await vi.waitFor(() => {
      const found = document.querySelector('[data-member="popover"]')
      if (found === null) throw new Error('the picker is not open yet')
      return found
    })
    // The Popover registers nothing, and the Input the field draws is withheld.
    expect(
      agentRegistrations()
        .map((entry) => entry.member)
        .sort(),
    ).toEqual(['ColorInput', 'Input'])
    const registration = agentRegistrations().find((entry) => entry.member === 'ColorInput')
    expect(registration?.withholds).toContain(panel)
    const bridge = createAgentBridge()
    try {
      expect(bridge.snapshot().members.map((member) => [member.member, member.name])).toEqual([
        ['ColorInput', 'Accent colour'],
      ])
      expect(bridge.query({ member: 'Popover' })).toEqual([])
      expect(bridge.query({ name: 'Choose accent colour' })).toEqual([])
    } finally {
      bridge.dispose()
    }
  })

  it('sets a hex in the forms the field reads, and refuses text it would revert', async () => {
    const bridge = createAgentBridge()
    try {
      const onChange = vi.fn()
      render(
        <ColorInput
          defaultValue="#8864f0"
          pickerLabel="Choose accent colour"
          aria-label="Accent colour"
          onChange={onChange}
        />,
      )
      const fields = bridge.snapshot().members
      expect(fields.map((member) => [member.member, member.name])).toEqual([
        ['ColorInput', 'Accent colour'],
      ])
      expect(bridge.query({ member: 'Input' })).toEqual([])
      const id = fields[0]?.id
      const { results } = await bridge.act([
        { id, action: 'set', value: '#0089EA' },
        { id, action: 'set', value: '0af' },
        { id, action: 'set', value: '#8864f0cc' },
      ])
      expect(results).toMatchObject([
        { ok: true, changed: { value: { from: '#8864f0', to: '#0089ea' } } },
        { ok: true, changed: { value: { from: '#0089ea', to: '#00aaff' } } },
        // A field without `alpha` drops the fourth channel.
        { ok: true, changed: { value: { from: '#00aaff', to: '#8864f0' } } },
      ])
      expect(field().value).toBe('8864f0')
      const refused = await bridge.act([{ id, action: 'set', value: 'blue' }])
      expect(refused.results[0]).toMatchObject({
        ok: false,
        error: { code: 'failed', message: expect.stringContaining('not a hex colour') },
      })
      expect(onChange.mock.calls).toEqual([['#0089ea'], ['#00aaff'], ['#8864f0']])
    } finally {
      bridge.dispose()
    }
  })

  it('reports through a controlled caller, and reads the value the caller keeps', async () => {
    const bridge = createAgentBridge()
    try {
      const kept = vi.fn()
      render(
        <ColorInput
          value="#0089ea"
          onChange={kept}
          pickerLabel="Choose accent colour"
          aria-label="Accent colour"
        />,
      )
      const [member] = bridge.snapshot().members
      const { results } = await bridge.act([{ id: member?.id, action: 'set', value: '#8864f0' }])
      expect(results[0]).toEqual({ ok: true, id: member?.id, changed: {} })
      expect(kept).toHaveBeenCalledWith('#8864f0')
      expect(field().value).toBe('0089ea')
    } finally {
      bridge.dispose()
    }
  })
})
