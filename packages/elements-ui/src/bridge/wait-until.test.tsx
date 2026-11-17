import { createSignal, type JSX } from 'solid-js'
import { describe, expect, it, vi } from 'vitest'

import { define, PolymorphEvent } from '@polymorph/elements'

import { mount } from '../mount'

/**
 * What a member gets back from a callback it invokes (`invoke`), as a
 * ConfirmDialog waits on the save its confirm starts: the promises listeners
 * hand the event's `waitUntil`, settled together, or nothing when none did. A
 * probe member stands in for one: it calls `onConfirm` on a press and shows
 * whether it is waiting.
 */

function Probe(props: { onConfirm?: () => unknown }): JSX.Element {
  const [state, setState] = createSignal('idle')
  const confirm = async () => {
    const result = props.onConfirm?.()
    if (!(result instanceof Promise)) {
      setState('done')
      return
    }
    setState('pending')
    const values = await result
    setState(`done ${JSON.stringify(values)}`)
  }
  return (
    <button type="button" onClick={() => void confirm()}>
      {state()}
    </button>
  )
}

define(
  {
    tag: 'probe-confirm',
    member: 'Probe',
    props: {},
    events: { onConfirm: { type: 'poly-confirm' } },
    slots: [],
  },
  Probe,
)

const PROBE = { name: 'probe', html: '<probe-confirm></probe-confirm>' }

describe('waitUntil — a listener hands the member a promise', () => {
  it('keeps the member waiting until every promise listeners handed it settles', async () => {
    const { host } = await mount(PROBE)
    const probe = host.querySelector('probe-confirm') as HTMLElement
    let finish: (value: string) => void = () => {}
    probe.addEventListener('poly-confirm', (event) => {
      ;(event as PolymorphEvent).waitUntil(new Promise((settle) => (finish = settle)))
    })
    probe.addEventListener('poly-confirm', (event) => {
      ;(event as PolymorphEvent).waitUntil(Promise.resolve('saved'))
    })
    const button = host.querySelector('button') as HTMLButtonElement
    button.click()
    await vi.waitFor(() => expect(button.textContent).toBe('pending'))
    finish('sent')
    await vi.waitFor(() => expect(button.textContent).toBe('done ["sent","saved"]'))
  })

  it('hands the member nothing when no listener waits', async () => {
    const { host } = await mount(PROBE)
    const probe = host.querySelector('probe-confirm') as HTMLElement
    const heard: Event[] = []
    probe.addEventListener('poly-confirm', (event) => heard.push(event))
    const button = host.querySelector('button') as HTMLButtonElement
    button.click()
    await vi.waitFor(() => expect(button.textContent).toBe('done'))
    expect(heard).toHaveLength(1)
    expect(heard[0]).toBeInstanceOf(PolymorphEvent)
    expect([heard[0]?.bubbles, heard[0]?.composed, heard[0]?.cancelable]).toEqual([
      true,
      true,
      false,
    ])
  })

  it('refuses a promise handed after the event was dispatched', async () => {
    const { host } = await mount(PROBE)
    const probe = host.querySelector('probe-confirm') as HTMLElement
    let kept: PolymorphEvent | undefined
    probe.addEventListener('poly-confirm', (event) => (kept = event as PolymorphEvent))
    ;(host.querySelector('button') as HTMLButtonElement).click()
    await vi.waitFor(() => expect(kept).toBeDefined())
    expect(() => kept?.waitUntil(Promise.resolve())).toThrow(/while the event is dispatched/)
  })
})
