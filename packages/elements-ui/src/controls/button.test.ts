import { describe, expect, it, vi } from 'vitest'

import { createAgentBridge } from '@polymorph/engine/agent'

import { mount } from '../mount'
import './Button'

/**
 * A page with no build names an element for its agent policy with
 * `data-agent-key` on the `poly-*` element itself. The element keeps the
 * attribute and draws no box, and its member's control is inside it, so the
 * bridge reads the key around the control as it does in every renderer.
 */
describe('an agent', () => {
  it('is kept from pressing the element the page keyed, whatever its label says', async () => {
    const bridge = createAgentBridge({
      settleMs: 0,
      policy: {
        deny: ({ keys = [] }, action) => keys.includes('place-order') && action === 'press',
      },
    })
    try {
      const { host } = await mount({
        name: 'keyed',
        html: '<poly-button data-agent-key="place-order" label="Commander"></poly-button><poly-button label="Enregistrer"></poly-button>',
      })
      const pressed = vi.fn()
      host.querySelector('poly-button')?.addEventListener('poly-click', pressed)
      const [order, save] = await vi.waitFor(() => {
        const members = bridge.snapshot().members
        expect(members).toHaveLength(2)
        return members
      })
      expect(order).toMatchObject({ name: 'Commander', actions: [] })
      expect(save).toMatchObject({ name: 'Enregistrer', actions: [{ name: 'press' }] })
      const { results } = await bridge.act([{ id: order?.id, action: 'press' }])
      expect(results[0]).toMatchObject({ ok: false, error: { code: 'not-allowed' } })
      expect(pressed).not.toHaveBeenCalled()
      expect(host.querySelector('poly-button')?.getAttribute('data-agent-key')).toBe('place-order')
    } finally {
      bridge.dispose()
    }
  })
})
