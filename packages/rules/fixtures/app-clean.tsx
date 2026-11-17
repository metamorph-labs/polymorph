// The same screen, expressed lawfully: composition and content, no decisions.
import { Button, Icon, Stack, Table } from '@polymorph/react-ui'

export function Inbox({ tickets, onArchive }: { tickets: Ticket[]; onArchive: () => void }) {
  return (
    <Stack gap="4" p="5">
      <Button variant="solid" tone="accent" onClick={onArchive}>
        <Icon name="archive" />
        Archive
      </Button>
      <Table rows={tickets} />
    </Stack>
  )
}

interface Ticket {
  id: string
  title: string
}
