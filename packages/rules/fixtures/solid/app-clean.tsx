// The same screen, expressed lawfully: composition and content, no decisions.
import { For } from 'solid-js'

import { Button, Icon, Stack, Table } from '@polymorph/solid-ui'

export function Inbox(props: { tickets: Ticket[]; onArchive: () => void }) {
  return (
    <Stack gap={4} p={5}>
      <Button variant="solid" tone="accent" label="Archive" onClick={props.onArchive}>
        <Icon name="archive" />
      </Button>
      <Table rows={props.tickets} />
      <For each={props.tickets}>{(ticket) => <p>{ticket.title}</p>}</For>
    </Stack>
  )
}

interface Ticket {
  id: string
  title: string
}
