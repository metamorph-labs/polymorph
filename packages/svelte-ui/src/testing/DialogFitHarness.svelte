<script lang="ts">
  /**
   * A Dialog open from its first render, with one paragraph for each string in
   * `paragraphs` and, when `footer` is a label, one Button with that label in
   * its footer, for the dialog-fit law (`overlays/dialog.test.ts`).
   */
  import type { DialogFitLawMount } from '@polymorph/conformance/dialog-fit'

  import Button from '../controls/Button.svelte'
  import Dialog from '../overlays/Dialog.svelte'

  let {
    title,
    description,
    size,
    presentation,
    paragraphs,
    footer: action,
  }: DialogFitLawMount = $props()
</script>

{#if action === undefined}
  <Dialog defaultOpen {title} {description} {size} {presentation}>
    {#each paragraphs as text, at (at)}<p>{text}</p>{/each}
  </Dialog>
{:else}
  <Dialog defaultOpen {title} {description} {size} {presentation}>
    {#snippet footer()}<Button label={action} />{/snippet}
    {#each paragraphs as text, at (at)}<p>{text}</p>{/each}
  </Dialog>
{/if}
