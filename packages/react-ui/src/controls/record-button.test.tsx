import { render, screen } from '@testing-library/react'
import { useState } from 'react'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { assertGoverned } from '@polymorph/react'
import { recordButtonLaw, type RecordButtonState } from '@polymorph/conformance/record-button'
import { createAgentBridge } from '@polymorph/engine/agent'
import { installTestTheme } from '@polymorph/engine/testing'
import { PromptInput } from '../ai/PromptInput'
import { RecordButton, type RecordButtonProps } from './RecordButton'
import { tokenColor } from './token-probe'

/**
 * RecordButton. What every web shell's RecordButton reports and draws is the
 * law `@polymorph/conformance/record-button` states, which this file calls for
 * the React shell. The rest is the recipe and its place in a composer.
 */

beforeAll(installTestTheme)

/** The application around the member: it holds what it records, and the law sets it. */
recordButtonLaw({
  shell: 'React',
  async mount(props) {
    let set: (next: Partial<RecordButtonState>) => void = () => {}
    function Application() {
      const [state, setState] = useState<Partial<RecordButtonState>>({})
      set = (next) => setState((current) => ({ ...current, ...next }))
      return <RecordButton {...props} {...state} />
    }
    render(<Application />)
    return {
      set: async (next) => {
        set(next)
        await new Promise((resolve) => requestAnimationFrame(resolve))
      },
    }
  },
})

const LABELS = { label: 'Record a voice message', stopLabel: 'Stop recording' }

const root = () =>
  document.querySelector<HTMLElement>('[data-member="record-button"]') as HTMLElement
const mark = () =>
  root().querySelector<HTMLElement>('[data-record-button-part="meter"] [aria-hidden="true"]')

describe('the closed surface', () => {
  it('has no style escape hatch', () => {
    assertGoverned<RecordButtonProps>(true)
  })
})

describe('the Button', () => {
  it('is a quiet glyph at rest and gains a frame while recording', () => {
    const { rerender } = render(<RecordButton {...LABELS} />)
    const button = screen.getByRole('button')
    expect(button.dataset['variant']).toBe('ghost')
    expect(button.dataset['tone']).toBe('neutral')
    expect(button.hasAttribute('data-icon-only')).toBe(true)

    rerender(<RecordButton {...LABELS} recording />)
    expect(screen.getByRole('button')).toBe(button)
    expect(button.dataset['variant']).toBe('outline')
    expect(button.dataset['tone']).toBe('neutral')
  })

  it('takes Button’s size', () => {
    render(<RecordButton {...LABELS} size="sm" />)
    expect(screen.getByRole('button').dataset['size']).toBe('sm')
  })

  it('is natively disabled when disabled', () => {
    render(<RecordButton {...LABELS} disabled />)
    expect((screen.getByRole('button') as HTMLButtonElement).disabled).toBe(true)
  })
})

describe('recipe', () => {
  it('draws the dot in the danger text colour', () => {
    render(<RecordButton {...LABELS} recording elapsed={3} level={0.5} />)
    expect(getComputedStyle(mark() as HTMLElement, '::after').backgroundColor).toBe(
      tokenColor('--pm-danger-text'),
    )
  })

  it('clamps a level outside the range', () => {
    render(<RecordButton {...LABELS} recording level={4} />)
    expect((mark() as HTMLElement).style.getPropertyValue('--pm-record-button-level')).toBe('1')
  })

  it('draws the time in secondary text, a step smaller at sm', () => {
    render(<RecordButton {...LABELS} recording elapsed={9} />)
    const medium = root().querySelector('[data-record-button-part="meter"] > :last-child')
    expect(getComputedStyle(medium as HTMLElement).color).toBe(tokenColor('--pm-text-secondary'))
    const mediumSize = Number.parseFloat(getComputedStyle(medium as HTMLElement).fontSize)

    render(<RecordButton {...LABELS} size="sm" recording elapsed={9} />)
    const small = document.querySelectorAll(
      '[data-member="record-button"] [data-record-button-part="meter"] > :last-child',
    )[1] as HTMLElement
    expect(Number.parseFloat(getComputedStyle(small).fontSize)).toBeLessThanOrEqual(mediumSize)
  })
})

describe('in a composer', () => {
  it('sits in PromptInput’s trailing slot, before send', () => {
    render(
      <PromptInput
        label="Message"
        onSubmit={() => {}}
        trailing={<RecordButton {...LABELS} size="sm" />}
      />,
    )
    const record = screen.getByRole('button', { name: 'Record a voice message' })
    const send = screen.getByRole('button', { name: 'Send' })
    expect(record.compareDocumentPosition(send) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})

describe('an agent', () => {
  it('reads the recording, stops it, and cannot start one', async () => {
    const bridge = createAgentBridge()
    try {
      const onStart = vi.fn()
      const onStop = vi.fn()
      render(<RecordButton {...LABELS} onStart={onStart} onStop={onStop} />)
      render(<RecordButton {...LABELS} recording elapsed={12} onStart={onStart} onStop={onStop} />)

      // One member for each control a person sees: the Buttons are withheld.
      const [rest, live] = bridge.snapshot().members
      expect(bridge.snapshot().members.map((member) => member.member)).toEqual([
        'RecordButton',
        'RecordButton',
      ])
      expect(rest).toMatchObject({
        name: 'Record a voice message',
        state: { recording: false, disabled: false },
        actions: [{ name: 'stop' }],
      })
      expect(live?.name).toBe('Stop recording')

      // Nothing records at rest, so a stop is refused and no handler runs.
      const refused = await bridge.act([{ id: rest?.id, action: 'stop' }])
      expect(refused.results[0]).toEqual({
        ok: false,
        id: rest?.id,
        error: { code: 'failed', message: expect.stringContaining('Nothing is recording.') },
      })
      // A start is not an agent's.
      const started = await bridge.act([{ id: rest?.id, action: 'start' }])
      expect(started.results[0]).toMatchObject({
        ok: false,
        error: { code: 'not-allowed', allowed: ['stop'] },
      })
      expect(onStart).not.toHaveBeenCalled()

      const stopped = await bridge.act([{ id: live?.id, action: 'stop' }])
      expect(stopped.results[0]).toMatchObject({ ok: true, id: live?.id })
      expect(onStop).toHaveBeenCalledTimes(1)
      expect(onStart).not.toHaveBeenCalled()
    } finally {
      bridge.dispose()
    }
  })
})
