import { useState } from 'react'

import {
  AppShell,
  Badge,
  Button,
  Card,
  Grid,
  ListPage,
  RelativeTime,
  SearchInput,
  Select,
  Stat,
  Table,
  Tooltip,
  type BadgeTone,
  type EmptyStateProps,
  type StatProps,
} from '@polymorph/react-ui'

import { navigate } from '../harness/router'
import { PAGES_ROOT } from './routes'

/**
 * Exemplar: **Ledger**, a sales CRM. The ListPage archetype inside a full product frame.
 *
 * The records screen has the three things a list needs: a summary band that explains the numbers
 * before anyone reads a row, filters that work, and an empty state. The empty state is reachable
 * here by typing a name that matches no account. The archetype requires `emptyState`, and this
 * page makes it reachable so the exemplar actually shows it.
 *
 * Like the other exemplars, an AppShell replaces the workbench shell, because it is 100vh and
 * renders its own `<main>`. Vocabulary only: no CSS, no `className`, no raw controls.
 */

type Stage = 'Discovery' | 'Proposal' | 'Negotiation' | 'Closed won' | 'Closed lost'

/** The stage colour matches a word already on the row and never replaces it. */
const STAGE_TONE: Record<Stage, BadgeTone> = {
  Discovery: 'info',
  Proposal: 'accent',
  Negotiation: 'warning',
  'Closed won': 'success',
  'Closed lost': 'neutral',
}

const STAGES: Stage[] = ['Discovery', 'Proposal', 'Negotiation', 'Closed won', 'Closed lost']

const OWNERS = ['Priya Raman', 'Dez Okafor', 'Tomas Lindqvist', 'Naomi Beck']

interface Account {
  name: string
  stage: Stage
  owner: string
  /** Pre-formatted, like every number the vocabulary draws. */
  arr: string
  /** ISO-8601, so `RelativeTime` reads it as a calendar date and shifts no timezone. */
  lastActivity: string
}

/**
 * Largest account first, because the ARR header shows a `desc` sort indicator. A sort indicator
 * over unsorted rows would misinform readers.
 */
const ACCOUNTS: Account[] = [
  {
    name: 'Harborline Freight',
    stage: 'Negotiation',
    owner: 'Priya Raman',
    arr: '$412,000',
    lastActivity: '2026-08-18',
  },
  {
    name: 'Cobalt Health Group',
    stage: 'Proposal',
    owner: 'Dez Okafor',
    arr: '$268,000',
    lastActivity: '2026-08-12',
  },
  {
    name: 'Marlowe Robotics',
    stage: 'Closed won',
    owner: 'Naomi Beck',
    arr: '$184,500',
    lastActivity: '2026-08-17',
  },
  {
    name: 'Juniper Rail',
    stage: 'Discovery',
    owner: 'Tomas Lindqvist',
    arr: '$150,000',
    lastActivity: '2026-08-05',
  },
  {
    name: 'Tidewater Optics',
    stage: 'Negotiation',
    owner: 'Priya Raman',
    arr: '$96,000',
    lastActivity: '2026-08-18',
  },
  {
    name: 'Westmark Dairy',
    stage: 'Proposal',
    owner: 'Naomi Beck',
    arr: '$74,500',
    lastActivity: '2026-08-09',
  },
  {
    name: 'Pinegrove Studios',
    stage: 'Discovery',
    owner: 'Dez Okafor',
    arr: '$48,000',
    lastActivity: '2026-08-15',
  },
  {
    name: 'Alder & Vine',
    stage: 'Closed lost',
    owner: 'Tomas Lindqvist',
    arr: '$22,750',
    lastActivity: '2026-08-03',
  },
]

/**
 * The band above the filters. Its numbers are of two kinds on purpose: the first two describe the
 * accounts on this page, and the last two cover ninety days of history. The footers say which,
 * because readers misread a number whose period is not stated.
 */
const SUMMARY: StatProps[] = [
  {
    label: 'Pipeline value',
    value: '$1.05M',
    trend: { direction: 'up', label: '+$186k' },
    footer: { primary: 'Six deals still open', secondary: 'Everything not yet closed' },
  },
  {
    label: 'Open deals',
    value: '6',
    trend: { direction: 'up', label: '+2' },
    footer: { primary: 'Two more than in July', secondary: 'Discovery through negotiation' },
  },
  {
    label: 'Win rate',
    value: '38%',
    delta: { value: '4pts', direction: 'down', positive: false },
    footer: { primary: 'Down since the March repricing', secondary: 'Closed deals, last 90 days' },
  },
  {
    label: 'Days to close',
    value: '41',
    delta: { value: '6 days', direction: 'down', positive: true },
    footer: { primary: 'Faster than last quarter', secondary: 'First call to signature' },
  },
]

export function CrmPage() {
  const [query, setQuery] = useState('')
  const [stage, setStage] = useState<string | null>(null)
  const [owner, setOwner] = useState<string | null>(null)

  const needle = query.trim().toLowerCase()
  const visible = ACCOUNTS.filter(
    (account) =>
      (stage === null || account.stage === stage) &&
      (owner === null || account.owner === owner) &&
      (needle === '' || account.name.toLowerCase().includes(needle)),
  )

  const filtering = needle !== '' || stage !== null || owner !== null

  function clearFilters() {
    setQuery('')
    setStage(null)
    setOwner(null)
  }

  /**
   * Two empty states, chosen by why the list is empty. "No accounts yet" offers a way to add one.
   * "Nothing matches" offers a way to clear the filters, with a different sentence and button.
   */
  const emptyState: EmptyStateProps = filtering
    ? {
        icon: 'search',
        title: 'No accounts match',
        description: 'Nothing in the book answers to those filters.',
        secondaryAction: (
          <Button variant="ghost" tone="neutral" label="Clear filters" onClick={clearFilters} />
        ),
      }
    : {
        icon: 'inbox',
        title: 'No accounts yet',
        description: 'Add the first company your team is working, and it will show up here.',
        action: <Button variant="soft" icon="add" label="New account" />,
      }

  return (
    <AppShell
      brand={
        <Badge variant="solid" tone="accent">
          Ledger
        </Badge>
      }
      sidebar={
        <>
          <AppShell.NavGroup label="Pipeline">
            <AppShell.NavItem icon="table" label="Accounts" current onSelect={() => {}} />
            <AppShell.NavItem icon="tag" label="Deals" onSelect={() => {}} />
            <AppShell.NavItem icon="team" label="Contacts" onSelect={() => {}} />
            <AppShell.NavItem icon="time" label="Activity" onSelect={() => {}} />
          </AppShell.NavGroup>
          <AppShell.NavGroup label="Workspace">
            <AppShell.NavItem icon="document" label="Reports" onSelect={() => {}} />
            <AppShell.NavItem icon="settings" label="Settings" onSelect={() => {}} />
          </AppShell.NavGroup>
        </>
      }
      sidebarFooter={<AppShell.UserCard name="Priya Raman" detail="priya@ledger.example" />}
      topbar={{
        leading: (
          <Tooltip content="Back to the workbench's page index">
            <Button
              variant="ghost"
              tone="neutral"
              size="sm"
              icon="back"
              label="All pages"
              onClick={() => navigate(PAGES_ROOT)}
            />
          </Tooltip>
        ),
        trailing: (
          <Button variant="outline" tone="neutral" size="sm" icon="download" label="Export book" />
        ),
      }}
    >
      <ListPage
        title="Accounts"
        description="Every company the team is working, largest book first."
        actions={<Button icon="add" label="New account" />}
        summary={
          <Grid columns={4} gap={6}>
            {SUMMARY.map((stat) => (
              <Card key={stat.label}>
                <Stat {...stat} />
              </Card>
            ))}
          </Grid>
        }
        filters={
          <>
            <SearchInput
              size="sm"
              value={query}
              onChange={setQuery}
              placeholder="Search accounts…"
              aria-label="Search accounts"
            />
            <Select
              size="sm"
              aria-label="Stage"
              emptyOption="All stages"
              value={stage}
              onChange={setStage}
              options={STAGES.map((name) => ({ value: name, label: name }))}
            />
            <Select
              size="sm"
              aria-label="Owner"
              emptyOption="All owners"
              value={owner}
              onChange={setOwner}
              options={OWNERS.map((name) => ({ value: name, label: name }))}
            />
          </>
        }
        empty={visible.length === 0}
        emptyState={emptyState}
      >
        <Table label="Accounts">
          <Table.Head>
            <Table.Row>
              <Table.Header>Account</Table.Header>
              <Table.Header>Stage</Table.Header>
              <Table.Header>Owner</Table.Header>
              <Table.Header numeric sortable sortDirection="desc">
                ARR
              </Table.Header>
              <Table.Header>Last activity</Table.Header>
            </Table.Row>
          </Table.Head>
          <Table.Body>
            {visible.map((account) => (
              <Table.Row key={account.name} interactive>
                <Table.Cell>{account.name}</Table.Cell>
                <Table.Cell>
                  <Badge tone={STAGE_TONE[account.stage]}>{account.stage}</Badge>
                </Table.Cell>
                <Table.Cell>{account.owner}</Table.Cell>
                <Table.Cell numeric>{account.arr}</Table.Cell>
                <Table.Cell>
                  <RelativeTime value={account.lastActivity} />
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
      </ListPage>
    </AppShell>
  )
}
