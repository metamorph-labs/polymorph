<script lang="ts">
  /**
   * A Dialog whose trigger is a Button labelled "Open" and whose body is one
   * paragraph, for `overlays/sheet.test.ts`. Every prop is passed to the Dialog.
   */
  import Button from '../controls/Button.svelte'
  import Dialog, { type DialogProps } from '../overlays/Dialog.svelte'

  let props: Omit<DialogProps, 'trigger' | 'children'> = $props()
</script>

<Dialog {...props}>
  {#snippet trigger()}<Button label="Open" />{/snippet}
  <p>body</p>
</Dialog>
