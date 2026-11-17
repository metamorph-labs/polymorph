import { tick } from 'svelte'
import { afterEach, describe, expect, it } from 'vitest'

import { getToasts, removeToast, toast } from '@polymorph/svelte'

import { render } from '../mount'
import ToastStoreHarness from '../testing/ToastStoreHarness.svelte'

/**
 * The Svelte foundation's toast store: React's API over the engine's store,
 * and `useToasts`, which a viewport renders from. The store's rules are the
 * engine's, tested there; this checks that a component follows it.
 */

afterEach(() => {
  for (const record of getToasts()) removeToast(record.id)
})

describe('the toast store', () => {
  it('raises from anywhere, and a component following it re-renders', async () => {
    const { host } = await render(ToastStoreHarness, {})
    expect(host.querySelectorAll('li')).toHaveLength(0)

    const id = toast.success('Ticket archived')
    await tick()
    expect(host.textContent).toBe('Ticket archived')
    expect(getToasts()[0]).toMatchObject({ id, tone: 'success' })

    toast({ id, title: 'Ticket restored' })
    await tick()
    expect(host.querySelectorAll('li')).toHaveLength(1)
    expect(host.textContent).toBe('Ticket restored')
  })
})
