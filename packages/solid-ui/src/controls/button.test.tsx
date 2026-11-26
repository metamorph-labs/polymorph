import { describe, expect, it, vi } from 'vitest'

import { createAgentBridge } from '@polymorph/engine/agent'

import { mount } from '../mount'
import Button from './Button'

/**
 * A page names a generated member for its agent policy with the key it sets
 * on an element around it (`data-agent-key`), as it does a React one: the
 * bridge reads the key from the document, so the member needs no prop for it.
 */
describe('an agent', () => {
  it('is kept from pressing the Button the page keyed, whatever its label says', async () => {
    const onClick = vi.fn()
    const bridge = createAgentBridge({
      settleMs: 0,
      policy: {
        deny: ({ keys = [] }, action) => keys.includes('place-order') && action === 'press',
      },
    })
    try {
      await mount(() => (
        <div data-agent-key="place-order">
          <Button label="Commander" onClick={onClick} />
        </div>
      ))
      await mount(() => <Button label="Enregistrer" />)
      const [order, save] = bridge.snapshot().members
      expect(order).toMatchObject({ name: 'Commander', actions: [] })
      expect(save).toMatchObject({ name: 'Enregistrer', actions: [{ name: 'press' }] })
      const { results } = await bridge.act([{ id: order?.id, action: 'press' }])
      expect(results[0]).toMatchObject({ ok: false, error: { code: 'not-allowed' } })
      expect(onClick).not.toHaveBeenCalled()
    } finally {
      bridge.dispose()
    }
  })
})
