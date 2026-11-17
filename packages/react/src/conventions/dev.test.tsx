import { cleanup, render } from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useDevWarnings } from './dev'

/**
 * Tests `useDevWarnings`: a chart logs each of its model's warnings when the
 * warning appears, and not again while it stays in the list, however often
 * the list changes around it.
 */

afterEach(cleanup)

function Probe({ messages }: { messages: readonly string[] }) {
  useDevWarnings(messages)
  return null
}

const logged = (warn: { mock: { calls: unknown[][] } }) =>
  warn.mock.calls.map(([message]) => String(message))

describe('useDevWarnings', () => {
  it('logs a message once while it stays in the list, and again when it returns', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const { rerender } = render(<Probe messages={['one']} />)
      expect(logged(warn)).toEqual(['polymorph: one'])

      rerender(<Probe messages={['one', 'two']} />)
      expect(logged(warn), 'a change elsewhere in the list logs only what is new').toEqual([
        'polymorph: one',
        'polymorph: two',
      ])

      rerender(<Probe messages={['two']} />)
      rerender(<Probe messages={['two', 'one']} />)
      expect(logged(warn), 'a message that left the list is logged when it returns').toEqual([
        'polymorph: one',
        'polymorph: two',
        'polymorph: one',
      ])
    } finally {
      warn.mockRestore()
    }
  })

  it('logs once on a mount that runs its effects twice', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      render(
        <StrictMode>
          <Probe messages={['one']} />
        </StrictMode>,
      )
      expect(logged(warn)).toEqual(['polymorph: one'])
    } finally {
      warn.mockRestore()
    }
  })

  it('logs each mount’s warnings for itself', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      render(
        <>
          <Probe messages={['shared']} />
          <Probe messages={['shared']} />
        </>,
      )
      expect(logged(warn)).toEqual(['polymorph: shared', 'polymorph: shared'])
    } finally {
      warn.mockRestore()
    }
  })
})
