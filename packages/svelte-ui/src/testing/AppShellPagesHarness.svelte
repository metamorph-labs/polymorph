<script lang="ts">
  /**
   * An AppShell whose page changes under it, as the app's router changes it,
   * for `archetypes/app-shell.test.ts`.
   */
  import AppShell from '../archetypes/AppShell.svelte'
  import AppShellNavItem from '../archetypes/AppShellNavItem.svelte'

  let { transitionKey, pending }: { transitionKey: string; pending: boolean } = $props()
</script>

<AppShell {transitionKey} {pending}>
  {#snippet sidebar()}<AppShellNavItem icon="inbox" label="Inbox" href="#inbox" />{/snippet}
  <h1>Settings</h1>
</AppShell>
