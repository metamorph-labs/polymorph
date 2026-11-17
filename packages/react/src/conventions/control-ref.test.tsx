import { cleanup, render } from '@testing-library/react'
import { createRef, useEffect, type Ref } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useControlRef } from './control-ref'

/**
 * Tests `useControlRef` in isolation. The members' tests check that Input and
 * Textarea expose their real element. This file checks the merge: both owners
 * see one node for every React ref shape, and detaching matches what React does
 * on the element directly.
 */

afterEach(cleanup)

interface ProbeProps {
  external?: Ref<HTMLInputElement>
  /** Reports the member's own view of the node after every commit. */
  inside?: (node: HTMLInputElement | null) => void
  value?: string
}

function Probe({ external, inside, value }: ProbeProps) {
  const [nodeRef, attach] = useControlRef(external)
  useEffect(() => {
    inside?.(nodeRef.current)
  })
  return <input ref={attach} defaultValue={value} aria-label="Probe" />
}

describe('the member and the caller share one node', () => {
  it('fills an object ref and the member’s own handle with the same element', () => {
    const external = createRef<HTMLInputElement>()
    const inside = vi.fn()
    const { container } = render(<Probe external={external} inside={inside} />)

    const input = container.querySelector('input')
    expect(input).not.toBeNull()
    expect(external.current).toBe(input)
    expect(inside).toHaveBeenLastCalledWith(input)
  })

  it('calls a callback ref with the node, and again with null on unmount', () => {
    const seen: (HTMLInputElement | null)[] = []
    const { container, unmount } = render(
      <Probe
        external={(node) => {
          seen.push(node)
        }}
      />,
    )
    const input = container.querySelector('input')
    expect(seen).toEqual([input])

    unmount()
    expect(seen).toEqual([input, null])
  })

  it('clears an object ref on unmount', () => {
    const external = createRef<HTMLInputElement>()
    const { unmount } = render(<Probe external={external} />)
    expect(external.current).not.toBeNull()

    unmount()
    expect(external.current).toBeNull()
  })

  it('gives the member its handle when there is no external ref', () => {
    const inside = vi.fn()
    const { container } = render(<Probe inside={inside} />)
    expect(inside).toHaveBeenLastCalledWith(container.querySelector('input'))
  })
})

describe('matches React’s own ref handling', () => {
  it('runs a callback ref’s cleanup on detach instead of calling it with null', () => {
    // In React 19 a callback ref may return a cleanup, and is then never called
    // with `null`. The merge must do the same, or a binding that unsubscribes in
    // its cleanup leaks the subscription.
    const cleanupFn = vi.fn()
    const external = vi.fn(() => cleanupFn)
    const { unmount } = render(<Probe external={external} />)
    expect(external).toHaveBeenCalledTimes(1)
    expect(cleanupFn).not.toHaveBeenCalled()

    unmount()
    expect(cleanupFn).toHaveBeenCalledTimes(1)
    expect(external).toHaveBeenCalledTimes(1)
  })

  it('does not call a stable ref again on rerender, because the node is unchanged', () => {
    const external = vi.fn()
    const { rerender } = render(<Probe external={external} value="a" />)
    rerender(<Probe external={external} value="b" />)
    rerender(<Probe external={external} value="c" />)
    expect(external).toHaveBeenCalledTimes(1)
  })

  it('moves the node from an old ref to a new one when the caller swaps them', () => {
    const first = createRef<HTMLInputElement>()
    const second = createRef<HTMLInputElement>()
    const inside = vi.fn()
    const { container, rerender } = render(<Probe external={first} inside={inside} />)
    const input = container.querySelector('input')
    expect(first.current).toBe(input)

    rerender(<Probe external={second} inside={inside} />)
    expect(first.current).toBeNull()
    expect(second.current).toBe(input)
    // The member's own handle still points at the same node.
    expect(inside).toHaveBeenLastCalledWith(input)
  })
})
