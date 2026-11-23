import { userEvent } from 'vitest/browser'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { createRenderEffect } from 'solid-js'

import { define, ERROR_EVENT, type ElementDefinition } from '@polymorph/elements'
import { installTestTheme } from '@polymorph/engine/testing'

import { mountNodes } from '../mount'

/**
 * A member that throws, and what the page hears of it.
 *
 * - **As it first renders**: the element renders nothing, and the elements
 *   around it render.
 * - **As it updates** (an effect that runs again when a prop changes): what it
 *   had rendered stays, and the effect that threw stops.
 * - Both dispatch `poly-error` on the element with the error. Unless a
 *   listener cancels it, the error is reported as an uncaught one is
 *   (`reportError`): `window`'s `error` event and the console.
 * - **In an event handler** (a click the member handles): Solid calls the
 *   handler outside the member's rendering, so the error is the browser's
 *   uncaught error, on `window`'s `error` event, with no `poly-error`.
 *
 * The members here are a test's own, defined with the foundation's `define`.
 */

beforeAll(installTestTheme)

const definition = (tag: string): ElementDefinition => ({
  tag,
  member: 'Thrower',
  props: { fail: 'boolean' },
  events: {},
  slots: [],
})

/** Throws as it first renders. */
function OnRender(): never {
  throw new Error('thrown as it rendered')
}

/** Renders a paragraph, and throws from an effect once `fail` is set. */
function OnUpdate(props: { fail?: boolean }) {
  createRenderEffect(() => {
    if (props.fail === true) throw new Error('thrown as it updated')
  })
  return <p data-thrower="">Rendered first</p>
}

/** Renders a button whose click handler throws. */
function OnClick() {
  return (
    <button
      type="button"
      onClick={() => {
        throw new Error('thrown by a click')
      }}
    >
      Press
    </button>
  )
}

define(definition('poly-test-on-render'), OnRender as never)
define(definition('poly-test-on-update'), OnUpdate as never)
define(definition('poly-test-on-click'), OnClick as never)

const reported: unknown[] = []
const report = (event: ErrorEvent) => {
  reported.push(event.error)
  // Heard here, so the test runner does not count it as the test's own error.
  event.preventDefault()
}

beforeAll(() => window.addEventListener('error', report))
afterEach(() => {
  reported.length = 0
})

function element(tag: string, cancel = false): { node: HTMLElement; heard: unknown[] } {
  const node = document.createElement(tag)
  const heard: unknown[] = []
  node.addEventListener(ERROR_EVENT, (event) => {
    heard.push((event as CustomEvent<unknown>).detail)
    if (cancel) event.preventDefault()
  })
  return { node, heard }
}

describe('a member that throws as it first renders', () => {
  it('renders nothing, leaves the elements beside it rendered, and reports the error', async () => {
    const { node, heard } = element('poly-test-on-render')
    const beside = document.createElement('p')
    beside.textContent = 'Beside'
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { host } = await mountNodes(node, beside)
    await vi.waitFor(() => expect(heard).toHaveLength(1))
    expect((heard[0] as Error).message).toBe('thrown as it rendered')
    expect(node.textContent).toBe('')
    expect(host.textContent).toBe('Beside')
    expect(reported).toEqual([heard[0]])
    errors.mockRestore()
  })

  it('reports nothing when a listener cancels poly-error', async () => {
    const { node, heard } = element('poly-test-on-render', true)
    await mountNodes(node)
    await vi.waitFor(() => expect(heard).toHaveLength(1))
    expect(reported).toEqual([])
  })
})

describe('a member that throws as it updates', () => {
  it('keeps what it had rendered, and reports the error', async () => {
    const { node, heard } = element('poly-test-on-update')
    await mountNodes(node)
    await vi.waitFor(() => expect(node.querySelector('[data-thrower]')).not.toBeNull())
    ;(node as unknown as { fail: boolean }).fail = true
    await vi.waitFor(() => expect(heard).toHaveLength(1))
    expect((heard[0] as Error).message).toBe('thrown as it updated')
    expect(node.querySelector('[data-thrower]')?.textContent).toBe('Rendered first')
    expect(reported).toEqual([heard[0]])
  })
})

describe('a member whose event handler throws', () => {
  it('leaves the error to the browser, with no poly-error', async () => {
    const { node, heard } = element('poly-test-on-click')
    await mountNodes(node)
    const button = await vi.waitFor(() => {
      const found = node.querySelector('button')
      if (found === null) throw new Error('not rendered')
      return found
    })
    await userEvent.click(button)
    await vi.waitFor(() => expect(reported).toHaveLength(1))
    expect((reported[0] as Error).message).toBe('thrown by a click')
    expect(heard).toEqual([])
    expect(node.querySelector('button')).toBe(button)
  })
})
