import { afterEach, describe, expect, it } from 'vitest'
import { For } from 'solid-js'

import { getToasts, removeToast, toast, useToasts } from '@polymorph/solid'

import { mount } from '../mount'

/**
 * The Solid foundation's toast store: React's API over the engine's store, and
 * `useToasts`, which a viewport renders from. The store's rules are the
 * engine's, tested there; this checks that a component follows it.
 */

afterEach(() => {
  for (const record of getToasts()) removeToast(record.id)
})

describe('the toast store', () => {
  it('raises from anywhere, and a component following it re-renders', async () => {
    function Titles() {
      const records = useToasts()
      return (
        <ol>
          <For each={records()}>{(record) => <li>{record.title}</li>}</For>
        </ol>
      )
    }
    const { host } = await mount(() => <Titles />)
    expect(host.querySelectorAll('li')).toHaveLength(0)

    const id = toast.success('Ticket archived')
    await Promise.resolve()
    expect(host.textContent).toBe('Ticket archived')
    expect(getToasts()[0]).toMatchObject({ id, tone: 'success' })

    toast({ id, title: 'Ticket restored' })
    await Promise.resolve()
    expect(host.querySelectorAll('li')).toHaveLength(1)
    expect(host.textContent).toBe('Ticket restored')
  })
})
