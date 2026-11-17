<script lang="ts">
  /**
   * A Menu and a Popover, each drawn twice for `controls/avatar-button.test.ts`:
   * once with an AvatarButton as its trigger and once with a Button, so the
   * test reads the overlay's ARIA on both.
   */
  import AvatarButton from '../controls/AvatarButton.svelte'
  import Button from '../controls/Button.svelte'
  import Menu from '../overlays/Menu.svelte'
  import Popover from '../overlays/Popover.svelte'

  const items = [{ label: 'Sign out', onSelect: () => {} }]
</script>

<Menu {items} align="end">
  {#snippet trigger()}<AvatarButton name="Ada Lovelace" label="Account menu" />{/snippet}
</Menu>
<Menu {items}>
  {#snippet trigger()}<Button label="Actions" />{/snippet}
</Menu>
<Popover label="Account">
  {#snippet trigger()}<AvatarButton name="Ada Lovelace" label="Account panel" />{/snippet}
  <p>Signed in as Ada</p>
</Popover>
<Popover label="Filter configuration">
  {#snippet trigger()}<Button label="Filters" />{/snippet}
  <p>Body</p>
</Popover>
