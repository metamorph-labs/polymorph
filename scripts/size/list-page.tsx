import 'virtual:polymorph/theme'
import { Button, ListPage, Table } from '@polymorph/react-ui'
import { createRoot } from 'react-dom/client'

createRoot(document.getElementById('root')!).render(
  <ListPage
    title="Inbox"
    actions={<Button icon="add" label="New ticket" />}
    emptyState={{ title: 'No tickets yet' }}
  >
    <Table label="Tickets">
      <Table.Head>
        <Table.Row>
          <Table.Header>Subject</Table.Header>
        </Table.Row>
      </Table.Head>
      <Table.Body>
        <Table.Row>
          <Table.Cell>Login fails</Table.Cell>
        </Table.Row>
      </Table.Body>
    </Table>
  </ListPage>,
)
