<script lang="ts">
  /**
   * A Menu whose trigger is a Button labelled "Actions", for
   * `overlays/sheet.test.ts`. Every prop is passed to the Menu.
   */
  import Button from '../controls/Button.svelte'
  import Menu, { type MenuProps } from '../overlays/Menu.svelte'

  let props: Omit<MenuProps, 'trigger'> = $props()
</script>

<Menu {...props}>
  {#snippet trigger()}<Button label="Actions" />{/snippet}
</Menu>
