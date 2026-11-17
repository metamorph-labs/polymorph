<script lang="ts">
  /**
   * Two Tooltips side by side in an Inline, each around a Button, for
   * `overlays/tooltip.test.ts`.
   */
  import Button from '../controls/Button.svelte'
  import Inline from '../layout/Inline.svelte'
  import Tooltip from '../overlays/Tooltip.svelte'
</script>

<Inline gap={2}>
  <Tooltip content="Archive"><Button label="One" /></Tooltip>
  <Tooltip content="Duplicate"><Button label="Two" /></Tooltip>
</Inline>
