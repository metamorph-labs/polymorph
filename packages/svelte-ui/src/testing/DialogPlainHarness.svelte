<script lang="ts">
  /**
   * A Dialog titled "Details" whose trigger is a plain `<button>` and whose
   * body is one paragraph, for `conventions/slotted.test.ts`.
   */
  import Dialog from '../overlays/Dialog.svelte'
</script>

<Dialog title="Details">
  {#snippet trigger()}<button type="button">Open details</button>{/snippet}
  <p>body</p>
</Dialog>
