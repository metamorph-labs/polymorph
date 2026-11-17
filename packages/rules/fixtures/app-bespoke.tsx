// Rung 4. Inside a declared zone the vocabulary rules are suspended — the cost
// of the exception is that it is visible, bounded and inventoried, not that it
// is forbidden (the exception ladder, docs/rules.md).
import { animate } from 'motion'

import { Bespoke } from '@polymorph/react-ui'

export function Promo() {
  return (
    <Bespoke reason="what's-new panel: one-off illustration, ships with the 2026 launch">
      <div style={{ padding: '24px', background: '#4087de' }} onClick={() => animate('.x', {})}>
        <svg viewBox="0 0 120 40" />
        <button>Read more</button>
      </div>
    </Bespoke>
  )
}
