import { act, cleanup, render, screen } from '@testing-library/react'
import { createElement, lazy, Suspense, type ReactElement } from 'react'
import { afterEach, describe, expect, it } from 'vitest'

import { serverPassed } from '@polymorph/conformance/server-passed'
import { useSupplied } from './supplied'

/**
 * Tests `useSupplied`: a member reads an element, and the element's type,
 * whether a client component created it or a server component passed it.
 */

afterEach(cleanup)

function Field({ label }: { label: string }) {
  return <input aria-label={label} />
}
Field.kind = 'field'

/** Reads what a member reads: the element's props, and a static on its type. */
function Reader({ control }: { control: ReactElement<{ label: string }> }) {
  const element = useSupplied(control)
  const type = useSupplied(element.type) as { kind?: string }
  return (
    <output>
      {element.props.label}/{String(type.kind)}
    </output>
  )
}

describe('useSupplied', () => {
  it('returns an element a client component created as it came', () => {
    const control = <Field label="Subject" />
    function Same() {
      return <output>{String(useSupplied(control) === control)}</output>
    }
    render(<Same />)
    expect(screen.getByRole('status').textContent).toBe('true')
  })

  it('reads an element a server component passed', () => {
    render(<Reader control={serverPassed(<Field label="Subject" />)} />)
    expect(screen.getByRole('status').textContent).toBe('Subject/field')
  })

  it('reads a static from a type that names a client component', () => {
    const control = createElement(serverPassed(Field), { label: 'Subject' })
    render(<Reader control={serverPassed(control)} />)
    expect(screen.getByRole('status').textContent).toBe('Subject/field')
  })

  it('waits for an element that is still loading', async () => {
    let load = () => {}
    const loaded = new Promise<void>((resolve) => {
      load = resolve
    })
    // Awaited, because a render that suspends is retried only after an
    // awaited `act` scope.
    await act(async () => {
      render(
        <Suspense fallback={<p>loading</p>}>
          <Reader control={serverPassed(<Field label="Subject" />, loaded)} />
        </Suspense>,
      )
    })
    expect(screen.getByText('loading')).toBeTruthy()
    await act(async () => {
      load()
      await loaded
    })
    expect(screen.getByRole('status').textContent).toBe('Subject/field')
  })

  it('leaves a component `React.lazy` wraps to React', () => {
    // Its payload is not a thenable. React resolves it when it renders it.
    const Deferred = lazy(() => Promise.resolve({ default: Field }))
    function Same() {
      return <output>{String(useSupplied(Deferred) === Deferred)}</output>
    }
    render(<Same />)
    expect(screen.getByRole('status').textContent).toBe('true')
  })
})
