import { describe, expect, it, vi } from 'vitest'

import { define, PolyElement, type ElementDefinition } from '@polymorph/elements'
import { Checkbox, FormField, Input } from '@polymorph/solid-ui'

import { DEFINITIONS } from '../definitions'

/**
 * The order the page defines its tags in. An element only schedules its
 * render when it is defined, and the queue renders a microtask later in
 * document order, so a field defined before its control, or after it, renders
 * the same: each element renders once, the field adopts its control and
 * hands it its id and its description, and reads a checkbox it holds as the
 * row it labels. No control renders on its own first, to be disposed when
 * the field takes it.
 *
 * Each test defines the members under tags of its own, after their markup is
 * in the document, so it decides the order.
 */

/** A member's definition under a tag of the test's own. */
const as = (tag: string, from: string): ElementDefinition => ({
  ...(DEFINITIONS[from] as ElementDefinition),
  tag,
})

/** Markup for the tags of one order: a field with an input, and a field with a checkbox. */
function written(prefix: string): HTMLElement {
  const host = document.createElement('div')
  host.innerHTML = `<${prefix}-field label="Email" description="We never share it."><${prefix}-input name="email"></${prefix}-input></${prefix}-field><${prefix}-field label="Agree"><${prefix}-checkbox name="agree"></${prefix}-checkbox></${prefix}-field>`
  document.body.append(host)
  return host
}

/** Each element's renders and disposals while `run` runs and its rendering settles. */
async function recorded(run: () => Promise<void>): Promise<string[]> {
  const events: string[] = []
  const stop = PolyElement.observe((element, event) => events.push(`${element.localName} ${event}`))
  try {
    await run()
  } finally {
    stop()
  }
  return events.sort()
}

function wired(host: HTMLElement): void {
  const [email, agree] = [...host.querySelectorAll('[data-member="form-field"]')]
  const label = email?.querySelector('label')
  const input = email?.querySelector('input:not([type="hidden"])')
  expect(input?.id).toBeTruthy()
  expect(label?.htmlFor).toBe(input?.id)
  expect(input?.getAttribute('aria-describedby')).toMatch(/description/)
  expect(agree?.getAttribute('data-kind')).toBe('row-labelled')
}

describe('the order the tags are defined in', () => {
  it('renders a field defined before the controls it holds as one defined after them', async () => {
    const host = written('order-a')
    const events = await recorded(async () => {
      define(as('order-a-field', 'poly-form-field'), FormField)
      define(as('order-a-input', 'poly-input'), Input)
      define(as('order-a-checkbox', 'poly-checkbox'), Checkbox)
      await vi.waitFor(() => wired(host))
    })
    expect(events).toEqual([
      'order-a-checkbox render',
      'order-a-field render',
      'order-a-field render',
      'order-a-input render',
    ])
    host.remove()
  })

  it('renders a field defined after the controls it holds as one defined before them', async () => {
    const host = written('order-b')
    const events = await recorded(async () => {
      define(as('order-b-checkbox', 'poly-checkbox'), Checkbox)
      define(as('order-b-input', 'poly-input'), Input)
      define(as('order-b-field', 'poly-form-field'), FormField)
      await vi.waitFor(() => wired(host))
    })
    expect(events).toEqual([
      'order-b-checkbox render',
      'order-b-field render',
      'order-b-field render',
      'order-b-input render',
    ])
    host.remove()
  })
})
