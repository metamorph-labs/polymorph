<script lang="ts">
  /**
   * A Tooltip around a text field below the fold, between two other fields,
   * for `overlays/tooltip.test.ts`: a Tab from the field above scrolls the page.
   */
  import Input from '../controls/Input.svelte'
  import Tooltip from '../overlays/Tooltip.svelte'
</script>

<div>
  <Input aria-label="Above" />
  <div style="block-size: 200vh"></div>
  <Tooltip content="Archive this ticket"><Input aria-label="Below" /></Tooltip>
  <Input aria-label="After" />
</div>
