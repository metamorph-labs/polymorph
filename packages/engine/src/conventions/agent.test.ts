import { afterEach, describe, expect, it, vi } from 'vitest'

import { agentEntries, agentFill, agentMember, agentPress, followAgentMembers } from './agent'

/**
 * The agent registry and the two DOM helpers a member's actions write
 * through. The registry is a list with a follower; the helpers write the way
 * a person's typing and pressing do, so every renderer's own listeners run.
 */

const releases: (() => void)[] = []

afterEach(() => {
  releases.splice(0).forEach((release) => release())
  document.body.replaceChildren()
})

const handle = (member = 'Checkbox') => ({
  member,
  element: () => null,
  state: () => ({}),
  actions: {},
})

describe('the registry', () => {
  it('holds a member while it is registered and gives each registration its own id', () => {
    const first = handle()
    const removeFirst = agentMember(first)
    const removeSecond = agentMember(first)
    releases.push(removeSecond)
    const [a, b] = agentEntries()
    expect(a?.handle).toBe(first)
    expect(b?.handle).toBe(first)
    expect(a?.id).toMatch(/^checkbox-\d+$/)
    expect(a?.id).not.toBe(b?.id)

    removeFirst()
    expect(agentEntries().map((entry) => entry.id)).toEqual([b?.id])
  })

  it("spells an id from the member's name as its data-member is spelled", () => {
    releases.push(agentMember(handle('DatePicker')))
    expect(agentEntries()[0]?.id).toMatch(/^date-picker-\d+$/)
  })

  it('tells a follower about each addition and removal, and stops when asked', () => {
    const follower = vi.fn()
    const stop = followAgentMembers(follower)
    const remove = agentMember(handle())
    expect(follower).toHaveBeenCalledTimes(1)
    remove()
    expect(follower).toHaveBeenCalledTimes(2)
    // A second removal removes nothing and tells no one.
    remove()
    expect(follower).toHaveBeenCalledTimes(2)
    stop()
    releases.push(agentMember(handle()))
    expect(follower).toHaveBeenCalledTimes(2)
  })

  it('registers a member even when a follower throws', () => {
    const stop = followAgentMembers(() => {
      throw new Error('a broken bridge')
    })
    releases.push(stop)
    releases.push(agentMember(handle()))
    expect(agentEntries()).toHaveLength(1)
  })
})

describe('agentFill', () => {
  it('writes an input and dispatches one bubbling input event', () => {
    const field = document.createElement('input')
    document.body.append(field)
    const heard: string[] = []
    document.body.addEventListener('input', (event) => {
      heard.push((event.target as HTMLInputElement).value)
    })
    agentFill(field, 'Ada')
    expect(field.value).toBe('Ada')
    expect(heard).toEqual(['Ada'])
  })

  it('writes a textarea', () => {
    const area = document.createElement('textarea')
    document.body.append(area)
    const onInput = vi.fn()
    area.addEventListener('input', onInput)
    agentFill(area, 'Two\nlines')
    expect(area.value).toBe('Two\nlines')
    expect(onInput).toHaveBeenCalledTimes(1)
  })

  it('writes through the prototype, past a setter the element holds itself', () => {
    // React keeps the value it last saw in a setter on the element itself.
    const field = document.createElement('input')
    document.body.append(field)
    let seen = ''
    const native = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')
    Object.defineProperty(field, 'value', {
      configurable: true,
      get: () => native?.get?.call(field) as string,
      set: (next: string) => {
        seen = next
        native?.set?.call(field, next)
      },
    })
    agentFill(field, 'Ada')
    expect(field.value).toBe('Ada')
    expect(seen).toBe('')
  })

  it('refuses an element that is not a field', () => {
    expect(() => agentFill(document.createElement('div'), 'x')).toThrow(TypeError)
    expect(() => agentFill(null, 'x')).toThrow(TypeError)
  })
})

describe('agentPress', () => {
  it('presses an element with its own click, so a submit button submits its form', () => {
    const form = document.createElement('form')
    const submit = document.createElement('button')
    submit.type = 'submit'
    form.append(submit)
    document.body.append(form)
    const onSubmit = vi.fn((event: Event) => event.preventDefault())
    form.addEventListener('submit', onSubmit)
    agentPress(submit)
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  it('does nothing to a disabled control, as a press does nothing', () => {
    const button = document.createElement('button')
    button.disabled = true
    document.body.append(button)
    const onClick = vi.fn()
    button.addEventListener('click', onClick)
    agentPress(button)
    expect(onClick).not.toHaveBeenCalled()
  })

  it('refuses an element it cannot press', () => {
    expect(() => agentPress(undefined)).toThrow(TypeError)
  })
})
