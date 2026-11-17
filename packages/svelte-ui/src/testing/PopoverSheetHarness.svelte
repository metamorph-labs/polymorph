<script lang="ts">
  /**
   * A Popover whose trigger is a Button labelled "Configure" and whose panel
   * holds an "Apply" and a "Reset" Button, for `overlays/sheet.test.ts`. Every
   * prop is passed to the Popover.
   */
  import Button from '../controls/Button.svelte'
  import Popover, { type PopoverProps } from '../overlays/Popover.svelte'

  let props: Omit<PopoverProps, 'trigger' | 'children'> = $props()
</script>

<Popover {...props}>
  {#snippet trigger()}<Button label="Configure" />{/snippet}
  <Button label="Apply" />
  <Button label="Reset" />
</Popover>
