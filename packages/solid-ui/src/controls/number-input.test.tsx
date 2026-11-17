import { userEvent } from 'vitest/browser'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { createSignal } from 'solid-js'

import { installTestTheme } from '@polymorph/engine/testing'

import { mount } from '../mount'
import NumberInput from './NumberInput'

/**
 * NumberInput's `onChange` in Solid reports what React's `onChange` reports
 * (`design/components/number-input.md`): committed numbers, never drafts.
 * Typed text commits on blur and Enter, a step commits as it fires, the empty
 * field commits `null`, unparseable text restores the last committed number,
 * and no commit is reported twice. A parent that controls `value` can hold a
 * draft such as `1.` while it is typed, and a value it keeps wins over a step.
 */

beforeAll(installTestTheme)

const field = () => document.querySelector<HTMLInputElement>('[data-member="number-input"] input')
/** The step-up button: the second of the pair, which follows the number line. */
const stepUp = () =>
  document.querySelectorAll<HTMLButtonElement>('[data-member="number-input"] button')[1]

async function uncontrolled(defaultValue: number | null) {
  const change = vi.fn()
  await mount(() => (
    <NumberInput defaultValue={defaultValue} aria-label="Agents on this plan" onChange={change} />
  ))
  return change
}

describe('NumberInput reports committed numbers', () => {
  it('reports nothing while typing, and the number once on blur', async () => {
    const change = await uncontrolled(5)
    await userEvent.click(field() as HTMLInputElement)
    await userEvent.keyboard('{ControlOrMeta>}a{/ControlOrMeta}12')
    expect(change).not.toHaveBeenCalled()
    await userEvent.keyboard('{Tab}')
    await vi.waitFor(() => expect(change.mock.calls).toEqual([[12]]))
  })

  it('commits on Enter, and does not report the same number again on blur', async () => {
    const change = await uncontrolled(5)
    await userEvent.click(field() as HTMLInputElement)
    await userEvent.keyboard('{ControlOrMeta>}a{/ControlOrMeta}7{Enter}')
    await vi.waitFor(() => expect(change.mock.calls).toEqual([[7]]))
    await userEvent.keyboard('{Tab}')
    await new Promise((settle) => setTimeout(settle, 50))
    expect(change.mock.calls).toEqual([[7]])
  })

  it('commits each step as it fires, from the keys and from the steppers', async () => {
    const change = await uncontrolled(5)
    await userEvent.click(field() as HTMLInputElement)
    await userEvent.keyboard('{ArrowUp}')
    await vi.waitFor(() => expect(change.mock.calls).toEqual([[6]]))
    await userEvent.click(stepUp() as HTMLButtonElement)
    await vi.waitFor(() => expect(change.mock.calls).toEqual([[6], [7]]))
    await userEvent.keyboard('{Tab}')
    await new Promise((settle) => setTimeout(settle, 50))
    expect(change.mock.calls).toEqual([[6], [7]])
  })

  it('commits the empty field as null, never NaN', async () => {
    const change = await uncontrolled(5)
    await userEvent.click(field() as HTMLInputElement)
    await userEvent.keyboard('{ControlOrMeta>}a{/ControlOrMeta}{Backspace}{Tab}')
    await vi.waitFor(() => expect(change.mock.calls).toEqual([[null]]))
  })

  it('restores the last committed number when the text does not parse', async () => {
    const change = await uncontrolled(5)
    await userEvent.click(field() as HTMLInputElement)
    await userEvent.keyboard('{ControlOrMeta>}a{/ControlOrMeta}-{Tab}')
    await vi.waitFor(() => expect(field()?.value).toBe('5'))
    expect(change).not.toHaveBeenCalled()
  })
})

describe('NumberInput under a parent that controls its value', () => {
  async function controlled(accept: boolean) {
    const [held, setHeld] = createSignal<number | null>(5)
    const change = vi.fn((next: number | null) => {
      if (accept) setHeld(next)
    })
    function Parent() {
      return <NumberInput value={held()} aria-label="Agents on this plan" onChange={change} />
    }
    await mount(() => <Parent />)
    return { held, setHeld, change }
  }

  it('holds a draft that is not yet a number, and commits it', async () => {
    const { held, change } = await controlled(true)
    await userEvent.click(field() as HTMLInputElement)
    await userEvent.keyboard('{ControlOrMeta>}a{/ControlOrMeta}1.')
    expect(field()?.value).toBe('1.')
    await userEvent.keyboard('5{Tab}')
    await vi.waitFor(() => expect(held()).toBe(1.5))
    expect(change.mock.calls).toEqual([[1.5]])
    expect(field()?.value).toBe('1.5')
  })

  it('follows a value the parent sets, and reports nothing for it', async () => {
    const { setHeld, change } = await controlled(true)
    setHeld(9)
    await vi.waitFor(() => expect(field()?.value).toBe('9'))
    setHeld(null)
    await vi.waitFor(() => expect(field()?.value).toBe(''))
    expect(change).not.toHaveBeenCalled()
  })

  it('goes back to the value a parent keeps when it refuses a step', async () => {
    const { held, change } = await controlled(false)
    await userEvent.click(field() as HTMLInputElement)
    await userEvent.keyboard('{ArrowUp}')
    await vi.waitFor(() => expect(change.mock.calls).toEqual([[6]]))
    await vi.waitFor(() => expect(field()?.value).toBe('5'))
    expect(held()).toBe(5)
  })
})
