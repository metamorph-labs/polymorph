/**
 * The ladder, climbed properly — the other half of the inventory's fixture pair.
 * Every rung declared, every escape visible, nothing turned off by hand.
 *
 * Lives in `fixtures/` beside its unlawful twin: both are read by
 * `inventory.test.ts` and neither is linted as source.
 */
import { Bespoke, Card, DensityScope, Stack, ToneScope } from '@polymorph/react-ui'

export function Screen() {
  return (
    <Stack gap={4}>
      {/* rung 2 — the same theme, denser here */}
      <DensityScope value="compact">
        <Card>dense region</Card>
      </DensityScope>

      <ToneScope value="inverse">
        <Card>inverted region</Card>
      </ToneScope>

      {/* rung 3 — a named decision re-assigned, never a raw value */}
      <Card patch={{ p: 4, radius: 'sm' }}>tighter card</Card>

      {/* rung 4 — declared, and the reason is the point */}
      <Bespoke reason="Marketing's what's-new panel: a one-off illustration that still consumes theme tokens.">
        {/* eslint-disable-next-line polymorph/no-raw-interactive -- inside a declared zone */}
        <div onClick={() => undefined}>bespoke promo</div>
      </Bespoke>
    </Stack>
  )
}
