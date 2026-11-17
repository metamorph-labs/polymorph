import { afterEach, describe, expect, it } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'

import { getToasts, removeToast, toast, useToasts } from '@polymorph/vue'

import { mount } from '../mount'

/**
 * The Vue foundation's toast store: React's API over the engine's store, and
 * `useToasts`, which a viewport renders from. The store's rules are the
 * engine's, tested there; this checks that a component follows it.
 */

afterEach(() => {
  for (const record of getToasts()) removeToast(record.id)
})

describe('the toast store', () => {
  it('raises from anywhere, and a component following it re-renders', async () => {
    const Titles = defineComponent({
      setup() {
        const records = useToasts()
        return () =>
          h(
            'ol',
            records.value.map((record) => h('li', { key: record.id }, record.title)),
          )
      },
    })
    const { host } = await mount(() => h(Titles))
    expect(host.querySelectorAll('li')).toHaveLength(0)

    const id = toast.success('Ticket archived')
    await nextTick()
    expect(host.textContent).toBe('Ticket archived')
    expect(getToasts()[0]).toMatchObject({ id, tone: 'success' })

    toast({ id, title: 'Ticket restored' })
    await nextTick()
    expect(host.querySelectorAll('li')).toHaveLength(1)
    expect(host.textContent).toBe('Ticket restored')
  })
})
