import { type ComponentStates } from '@polymorph/react'

import { Alert } from './Alert'
import { Highlight } from './Highlight'
import { Table } from './Table'
import { Text } from './Text'

/**
 * States fixture, from `design/components/highlight.md`'s States table.
 *
 * The entries set a Highlight where a search result is read: alone, in a
 * sentence, in a table cell and on an Alert's wash. Each marks by a query or by
 * the ranges a search engine returned.
 */

const RESULTS = [
  { id: 'T-1041', subject: 'Refund for invoice 2026-118 was sent twice' },
  { id: 'T-1039', subject: 'Invoice address shows the old office' },
  { id: 'T-1032', subject: 'Export of last year’s invoices times out' },
]

export const states: ComponentStates = {
  component: 'Highlight',

  entries: [
    {
      name: 'a query — every occurrence marked, whatever its case',
      render: () => (
        <Highlight text="Invoice 2026-118 replaces the draft invoice" query="invoice" />
      ),
    },
    {
      name: 'several terms',
      render: () => (
        <Highlight text="Northwind renewed its 2026 support plan" query={['north', '2026']} />
      ),
    },
    {
      name: 'ranges from a search engine',
      render: () => (
        <Highlight
          text="Refunds are running for the March invoices"
          ranges={[
            [0, 7],
            [12, 19],
          ]}
        />
      ),
    },
    {
      name: 'no match — the text as it is',
      render: () => <Highlight text="Billing address updated" query="invoice" />,
    },
    {
      name: 'case folded in the page’s locale',
      render: () => <Highlight text="İSTANBUL OFİSİ" query="istanbul" locale="tr" />,
    },
    {
      name: 'in a sentence — the font and size of the text around it',
      render: () => (
        <Text size="sm" tone="secondary">
          Matched in the subject:{' '}
          <Highlight text="Invoice address shows the old office" query="office" />
        </Text>
      ),
    },
    {
      name: 'in a Table cell',
      render: () => (
        <Table label="Tickets that match “invoice”">
          <Table.Head>
            <Table.Row>
              <Table.Header>Ticket</Table.Header>
              <Table.Header>Subject</Table.Header>
            </Table.Row>
          </Table.Head>
          <Table.Body>
            {RESULTS.map((result) => (
              <Table.Row key={result.id}>
                <Table.Cell>{result.id}</Table.Cell>
                <Table.Cell>
                  <Highlight text={result.subject} query="invoice" />
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
      ),
    },
    {
      name: 'in an Alert — the weight marks it on the same wash',
      render: () => (
        <Alert tone="warning" title="Two tickets match">
          <Highlight text="Refund for invoice 2026-118 was sent twice" query="refund" />
        </Alert>
      ),
    },
  ],

  requiredSelectors: [],
}
