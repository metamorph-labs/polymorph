/**
 * @vitest-environment jsdom
 *
 * The inspector's laws. Four checks on how what a control shows matches what it writes to the
 * document:
 *
 *  - **Every row has a name.** A screen reader cannot announce a field whose label points at
 *    nothing, and a test cannot find it.
 *  - **A compound part edits its own props.** `SettingsRow.Group` is not `SettingsRow`, and the
 *    validator treats them differently.
 *  - **A cleared required number is absent, not `null`.** The law panel can explain an absent
 *    key, but `null` is a value the type cannot hold.
 *  - **A partly typed list keeps what was typed.** `Number('')` is `0`, so a naive parse would
 *    turn "3," into `[3, 0]` while the user types.
 *
 * The file requests a DOM in its docblock because it tests rendered controls and the document
 * they write.
 */

import type { SpecElement } from '@polymorph/spec/schema'
import { validateSpec } from '@polymorph/spec/validate'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'

import { REGISTRY } from '../registry'
import { Inspector } from './Inspector'
import { elementAt } from './model'
import { currentSpec, replaceComposition, startingSpec } from './store'

beforeAll(() => {
  // jsdom 30 provides neither, and the vocabulary's phone-layout hooks call both.
  window.matchMedia ??= ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
})

afterEach(cleanup)

/** The member under test, alone in a document, with the store holding the same document. */
function inspect(element: SpecElement) {
  const spec = { ...startingSpec(), root: { component: 'Stack', children: [element] } }
  replaceComposition(spec)
  render(<Inspector spec={spec} address="$.children[0]" element={element} />)
  return () => elementAt(currentSpec(), '$.children[0]')
}

describe('every row is a named field', () => {
  it('gives each control an accessible name', () => {
    // FormField names its control by cloning an id onto it. If the row wrapped the control in an
    // `Inline`, the `Inline` would drop every prop that is not a layout prop. The label's
    // `htmlFor` would point at an id no element has, and no row in the panel would have an
    // accessible name.
    inspect({ component: 'Progress', props: { label: 'Import', value: 40 } })
    expect(screen.getByLabelText('label')).toBeTruthy()
    expect(screen.getByLabelText('value')).toBeTruthy()
  })

  it('shows Reset only where there is a default to return to', () => {
    // Reset is in the label row. It is a real, named button, and it is absent on a required prop
    // because there is no default to return to.
    inspect({ component: 'Progress', props: { label: 'Import', value: 40, tone: 'danger' } })
    expect(screen.getByLabelText('Reset tone to the component default')).toBeTruthy()
    expect(screen.queryByLabelText('Reset value to the component default')).toBeNull()
  })
})

describe('a compound part is not its owner', () => {
  it('offers only the props of the part, not those of the owner', () => {
    // `SettingsRow.Group` has `Group.title` in the registry. A panel that resolved `SettingsRow`
    // and hid every dotted name would offer `label` and `description`, which belong to the row.
    // Typing there would write `label` onto the Group. The law panel would report
    // "`SettingsRow.Group` has no prop `label`", and Save would stay disabled until it was
    // undone.
    const read = inspect({
      component: 'SettingsRow.Group',
      props: { title: 'Appearance' },
      children: ['Rows go here'],
    })

    expect(screen.getByLabelText('title')).toBeTruthy()
    expect(screen.queryByLabelText(/^label/)).toBeNull()
    expect(screen.queryByLabelText(/^description/)).toBeNull()

    fireEvent.change(screen.getByLabelText('title'), { target: { value: 'Appearance and motion' } })
    expect(read()?.props?.['title']).toBe('Appearance and motion')
    expect(validateSpec(REGISTRY, currentSpec()).faults).toEqual([])
  })
})

describe('what a control writes when it is emptied', () => {
  it('clears a required number to absent, never to null', () => {
    // `NumberInput` reports `null` for an empty field. Written to the document, it produces
    // `Progress prop value wants \`number\`, got null`, a fault with no Reset next to it because a
    // required prop has none.
    const read = inspect({ component: 'Progress', props: { label: 'Import', value: 40 } })
    const field = screen.getByLabelText('value')
    fireEvent.change(field, { target: { value: '' } })
    fireEvent.blur(field)

    expect(read()?.props?.['value']).toBeUndefined()
    // An absent key is also a fault, but it is one the law panel can explain.
    const messages = validateSpec(REGISTRY, currentSpec()).faults.map((fault) => fault.message)
    expect(messages.some((message) => message.includes('missing its required prop'))).toBe(true)
    expect(messages.some((message) => message.includes('got null'))).toBe(false)
  })

  it('parses a partly typed list as what was typed', () => {
    // `Number('')` is `0`. A naive parse would turn the trailing comma of "3," into a second data
    // point, so the chart would jump while typing, and clearing the field would write `[0]`
    // rather than an empty list.
    const read = inspect({ component: 'Sparkline', props: { label: 'Trend', data: [3, 5] } })
    const field = screen.getByLabelText('data')

    fireEvent.change(field, { target: { value: '3,' } })
    expect(read()?.props?.['data']).toEqual([3])

    fireEvent.change(field, { target: { value: '3, 5, 4' } })
    expect(read()?.props?.['data']).toEqual([3, 5, 4])

    fireEvent.change(field, { target: { value: '' } })
    expect(read()?.props?.['data']).toEqual([])
  })
})
