<!-- The same screen, expressed lawfully: composition and content, no decisions. -->
<script lang="ts">
  import { Button, Icon, Stack, Table } from '@polymorph/svelte-ui'

  interface Ticket {
    id: string
    title: string
  }

  let { tickets, onArchive }: { tickets: Ticket[]; onArchive: () => void } = $props()
</script>

<Stack gap={4} p={5}>
  <Button variant="solid" tone="accent" label="Archive" onClick={onArchive}>
    <Icon name="archive" />
  </Button>
  <Table rows={tickets} />
  {#each tickets as ticket (ticket.id)}
    <p>{ticket.title}</p>
  {/each}
</Stack>
