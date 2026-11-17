import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { assertGoverned } from '@polymorph/react'
import { installTestTheme } from '@polymorph/engine/testing'
import { CopyButton, type CopyButtonProps } from './CopyButton'

/**
 * CopyButton, in a real browser.
 *
 * The tests cover the sequence (copy, confirm for 2000ms, revert) and the rules around it. The
 * accessible name never changes, the confirmation goes through one status region, and a refused
 * write changes no glyph and announces nothing. The clipboard is stubbed, because the subject is
 * the member's behaviour on both outcomes, not the engine's permission policy. A real headless
 * clipboard behaves differently per engine (the two tag-input paste tests already record that
 * limitation).
 */

beforeAll(installTestTheme)

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

const button = () => screen.getByRole('button', { name: 'Copy install command' })
const status = () => document.querySelector('[role="status"]') as HTMLElement

function mount(overrides: Partial<CopyButtonProps> = {}) {
  return render(
    <CopyButton
      value="pnpm add @polymorph/react-ui"
      label="Copy install command"
      copiedLabel="Copied"
      {...overrides}
    />,
  )
}

/** The stubbed clipboard: resolves means the write succeeded, rejects means it was refused. */
function stubClipboard(outcome: 'resolves' | 'rejects') {
  return vi
    .spyOn(navigator.clipboard, 'writeText')
    .mockImplementation(() =>
      outcome === 'resolves' ? Promise.resolve() : Promise.reject(new Error('denied')),
    )
}

/** Click, then flush the clipboard promise's microtask into React. */
async function copy() {
  fireEvent.click(button())
  await act(async () => {})
}

describe('the closed surface', () => {
  it('has no style escape hatch', () => {
    assertGoverned<CopyButtonProps>(true)
  })
})

describe('the gesture', () => {
  it('writes `value` to the clipboard exactly, including whitespace', async () => {
    const write = stubClipboard('resolves')
    mount({ value: '  pnpm add @polymorph/react-ui\n' })
    await copy()
    expect(write).toHaveBeenCalledWith('  pnpm add @polymorph/react-ui\n')
  })

  it('confirms for 2000ms, then reverts', async () => {
    stubClipboard('resolves')
    vi.useFakeTimers()
    mount()
    await copy()

    expect(button().dataset['state']).toBe('copied')
    expect(status().textContent).toBe('Copied')

    await act(async () => {
      vi.advanceTimersByTime(1999)
    })
    expect(button().dataset['state']).toBe('copied')

    await act(async () => {
      vi.advanceTimersByTime(1)
    })
    expect(button().hasAttribute('data-state')).toBe(false)
    expect(status().textContent).toBe('')
  })

  it('copies again and restarts the timer on a click during the confirmation', async () => {
    const write = stubClipboard('resolves')
    vi.useFakeTimers()
    mount()
    await copy()

    await act(async () => {
      vi.advanceTimersByTime(1500)
    })
    await copy()
    expect(write).toHaveBeenCalledTimes(2)

    // Past the first deadline, still shown because the second click reset the timer.
    await act(async () => {
      vi.advanceTimersByTime(1500)
    })
    expect(button().dataset['state']).toBe('copied')

    await act(async () => {
      vi.advanceTimersByTime(500)
    })
    expect(button().hasAttribute('data-state')).toBe(false)
  })
})

describe('the glyph is decorative and the status region announces', () => {
  it('swaps copy for confirm while copied, with both glyphs decorative', async () => {
    stubClipboard('resolves')
    vi.useFakeTimers()
    const { container } = mount()

    const glyphs = container.querySelector('[aria-hidden="true"]') as HTMLElement
    expect(glyphs.querySelectorAll('svg')).toHaveLength(2)

    await copy()
    // Both stay mounted and the state drives the swap, so the confirmation can fade out. The
    // stylesheet controls visibility from `data-state`.
    expect(button().dataset['state']).toBe('copied')
    expect(glyphs.querySelectorAll('svg')).toHaveLength(2)
  })

  it('keeps the accessible name constant while confirming', async () => {
    stubClipboard('resolves')
    vi.useFakeTimers()
    mount()
    await copy()
    expect(button().getAttribute('aria-label')).toBe('Copy install command')
  })

  it('renders the status region empty from the start, so it exists before it announces', () => {
    mount()
    expect(status()).toBeTruthy()
    expect(status().textContent).toBe('')
  })
})

describe('a refused write', () => {
  it('changes no glyph, announces nothing, and logs a development warning', async () => {
    stubClipboard('rejects')
    const warned = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mount()
    await copy()

    expect(button().hasAttribute('data-state')).toBe(false)
    expect(status().textContent).toBe('')
    expect(warned).toHaveBeenCalledTimes(1)
    expect(String(warned.mock.calls[0]?.[0])).toContain('CopyButton')
  })
})

describe('Button attributes, by reference', () => {
  it('sets ghost/neutral/icon-only at size md', () => {
    mount()
    const element = button()
    expect(element.dataset['variant']).toBe('ghost')
    expect(element.dataset['tone']).toBe('neutral')
    expect(element.hasAttribute('data-icon-only')).toBe(true)
    expect(element.dataset['size']).toBe('md')
  })

  it('is natively disabled when disabled, so a click does not copy', async () => {
    const write = stubClipboard('resolves')
    mount({ disabled: true })
    const element = button() as HTMLButtonElement
    expect(element.disabled).toBe(true)
    fireEvent.click(element)
    await act(async () => {})
    expect(write).not.toHaveBeenCalled()
    expect(element.hasAttribute('data-state')).toBe(false)
  })
})
