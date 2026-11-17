import { type ComponentStates } from '@polymorph/react'
import styles from '@polymorph/recipes/structure/diff.module.css'

import { Alert } from './Alert'
import { Diff } from './Diff'
import { Table } from './Table'
import { Text } from './Text'

/**
 * States fixture, from `design/components/diff.md`'s States table.
 *
 * The inline form's entries set it where it is used: alone, in a sentence, on
 * an Alert's wash and in a table cell. The lines form's entries compare a
 * configuration with one change, a list of ids, and a text whose every line
 * changed.
 */

const CONFIGURATION = {
  workspace: 'relay-eu',
  region: 'eu-west-1',
  retention: { days: 30, archive: true, tiers: ['hot', 'warm'] },
  sync: { interval: 300, batch: 500, retries: 5, backoff: 'exponential' },
  notifications: { email: true, digest: 'daily', channels: ['#support', '#on-call'] },
  limits: { seats: 25, projects: 100, storageGb: 500 },
  features: { audit: true, sso: false, exports: true },
}

/** A governed payload as an app passes it: formatted text, one key per line. */
const CONFIGURATION_BEFORE = JSON.stringify(CONFIGURATION, null, 2)
const CONFIGURATION_AFTER = JSON.stringify(
  { ...CONFIGURATION, sync: { ...CONFIGURATION.sync, retries: 8 } },
  null,
  2,
)

/** A list of ids is compared with one id on each line. */
const GRANTS_BEFORE = ['tickets.read', 'tickets.write', 'billing.read', 'reports.export'].join('\n')
const GRANTS_AFTER = [
  'tickets.read',
  'tickets.write',
  'payments.refund',
  'reports.export',
  'members.manage',
].join('\n')

const BODY_BEFORE = ['Hi Ada,', 'Your export is ready.', 'Thanks'].join('\n')
const BODY_AFTER = [
  'Hello Ada,',
  'Your export failed and will run again tonight.',
  'Thank you for your patience',
].join('\n')

/** Lines with no break in them: a callback URL and its signing key. */
const ENDPOINT_BEFORE = [
  'callback=https://hooks.example.org/v1/deliveries/4f0c2a7e9b1d4c53a8e6f1b2c3d4e5f6/acknowledge',
  'signing_key=whsec_JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP',
].join('\n')
const ENDPOINT_AFTER = [
  'callback=https://hooks.example.org/v2/deliveries/4f0c2a7e9b1d4c53a8e6f1b2c3d4e5f6/acknowledge',
  'signing_key=whsec_JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP',
].join('\n')

export const states: ComponentStates = {
  component: 'Diff',

  entries: [
    {
      name: 'a changed value — the old one struck through, then the new one',
      render: () => <Diff before="Draft" after="Active" />,
    },
    {
      name: 'an addition — only a new value',
      render: () => <Diff after="Ada Okonkwo" />,
    },
    {
      name: 'a removal — only an old value',
      render: () => <Diff before="Ada Okonkwo" after={null} />,
    },
    {
      name: 'no change — the value as plain text',
      render: () => <Diff before="Active" after="Active" />,
    },
    {
      name: 'in a sentence — the font and size of the text around it',
      render: () => (
        <Text>
          The owner changed: <Diff before="Ada Okonkwo" after="Grace Hopper" />.
        </Text>
      ),
    },
    {
      name: 'in an Alert — on the tone’s wash',
      render: () => (
        <Alert tone="warning" title="The project was renamed">
          Name: <Diff before="apollo" after="apollo-eu" />
        </Alert>
      ),
    },
    {
      name: 'in a Table cell',
      render: () => (
        <Table label="Ticket changes">
          <Table.Head>
            <Table.Row>
              <Table.Header>Ticket</Table.Header>
              <Table.Header>Status</Table.Header>
            </Table.Row>
          </Table.Head>
          <Table.Body>
            <Table.Row>
              <Table.Cell>T-1041</Table.Cell>
              <Table.Cell>
                <Diff before="Waiting" after="Closed" />
              </Table.Cell>
            </Table.Row>
            <Table.Row>
              <Table.Cell>T-1039</Table.Cell>
              <Table.Cell>
                <Diff before="Open" after="Open" />
              </Table.Cell>
            </Table.Row>
          </Table.Body>
        </Table>
      ),
    },
    {
      name: 'lines — one change in a long text, the unchanged runs collapsed',
      render: () => (
        <Diff
          display="lines"
          label="Workspace configuration"
          before={CONFIGURATION_BEFORE}
          after={CONFIGURATION_AFTER}
        />
      ),
      expect: { 'aria-label': 'Workspace configuration' },
    },
    {
      name: 'lines — a list of ids, one on each line',
      render: () => (
        <Diff
          display="lines"
          label="Granted operations"
          before={GRANTS_BEFORE}
          after={GRANTS_AFTER}
        />
      ),
    },
    {
      name: 'lines — every line changed',
      render: () => (
        <Diff display="lines" label="Message body" before={BODY_BEFORE} after={BODY_AFTER} />
      ),
    },
    {
      name: 'lines — every line kept, with an infinite context',
      render: () => (
        <Diff
          display="lines"
          label="Workspace configuration"
          before={CONFIGURATION_BEFORE}
          after={CONFIGURATION_AFTER}
          context={Infinity}
        />
      ),
    },
    {
      name: 'lines — a new text, every line added',
      render: () => <Diff display="lines" label="Granted operations" after={GRANTS_AFTER} />,
    },
    {
      name: 'lines — long lines wrap in a narrow box',
      render: () => (
        <div className={styles.harnessNarrow}>
          <Diff
            display="lines"
            label="Webhook endpoint"
            before={ENDPOINT_BEFORE}
            after={ENDPOINT_AFTER}
          />
        </div>
      ),
    },
  ],

  /*
   * The page's reading direction, which no prop of the member sets: the inline
   * form's arrow is mirrored under it. A row's kind is its lines' own, and the
   * collapsed run's Button draws its own hover and focus.
   */
  requiredSelectors: ['[dir="rtl"]'],
}
