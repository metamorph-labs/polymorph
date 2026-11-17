<script lang="ts">
  /**
   * The law's page for `overlays/tour.test.ts`: a row of the targets
   * `TOUR_LAW_TARGETS` names, each around one Button, and one Tour. Every prop
   * is passed to the Tour.
   */
  import { TOUR_LAW_TARGETS } from '@polymorph/conformance/tour'

  import Button from '../controls/Button.svelte'
  import Inline from '../layout/Inline.svelte'
  import Tour, { type TourProps } from '../overlays/Tour.svelte'
  import TourTarget from '../overlays/TourTarget.svelte'

  let props: TourProps = $props()
</script>

<div>
  <Inline gap={3}>
    {#each TOUR_LAW_TARGETS as target (target.name)}
      <TourTarget name={target.name}><Button label={target.label} /></TourTarget>
    {/each}
  </Inline>
  <Tour {...props} />
</div>
