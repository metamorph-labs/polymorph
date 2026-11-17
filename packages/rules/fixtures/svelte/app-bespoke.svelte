<!--
  Rung 4. Inside a declared zone the vocabulary rules are suspended — the cost
  of the exception is that it is visible, bounded and inventoried, not that it
  is forbidden (the exception ladder, docs/rules.md).
-->
<script lang="ts">
  import { animate } from 'motion'
  import { fade } from 'svelte/transition'

  import { Bespoke } from '@polymorph/svelte-ui'
</script>

<Bespoke reason="what's-new panel: one-off illustration for the launch">
  <div
    class="promo"
    style="padding: 24px; background: #4087de"
    style:color="#ffffff"
    onclick={() => animate('.x', {})}
  >
    <svg viewBox="0 0 120 40"></svg>
    <button>Read more</button>
    <span class:shown={true} transition:fade>New</span>
  </div>
</Bespoke>
