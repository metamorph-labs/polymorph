import {
  Avatar,
  Badge,
  Button,
  Card,
  DataTable,
  DensityScope,
  FilterBar,
  Grid,
  Inline,
  ListPage,
  SearchInput,
  Select,
  Stat,
  type DataTableColumn,
  type DataTableSort,
  type StatProps,
} from '@polymorph/react-ui'
import { useState } from 'react'

import {
  capitalize,
  duration,
  filtersAreSet,
  movement,
  NO_FILTERS,
  PRIORITIES,
  PRIORITY_TONE,
  queueSummary,
  relativeTime,
  STATUS_TONE,
  STATUSES,
  TICKETS,
  visibleTickets,
  type Priority,
  type QueueMeasure,
  type Status,
  type Ticket,
  type TicketFilters,
} from './tickets'

/**
 * Relay's inbox. This file decides only what belongs to this screen: the columns, the cell
 * contents, and the empty state. The table, the filter row's clear control and the result
 * announcement come from the vocabulary: `ListPage`, `DataTable` and `FilterBar`.
 *
 * There is no CSS and no `className` in this file. The one declared exception is the table
 * region, a `<DensityScope value="compact">` at rung 2, which `pnpm inventory` lists by name.
 */

// The neutral choice is `emptyOption`, not a row in these lists. See `tickets.ts`. Labels are
// capitalised for display. The values stay raw, because the filter compares against them.
const STATUS_OPTIONS = STATUSES.map((status) => ({ value: status, label: capitalize(status) }))
const PRIORITY_OPTIONS = PRIORITIES.map((priority) => ({
  value: priority,
  label: capitalize(priority),
}))

/**
 * One constant used in two places. `ListPage` replaces the whole body when the list is empty, so
 * `DataTable` never renders its own copy here. But both require an empty state, and sharing the
 * object keeps the two from disagreeing about what the screen shows when it is empty.
 */
const EMPTY = {
  icon: 'search' as const,
  title: 'No tickets match these filters',
  description: 'Every conversation is still here — the filters are hiding them.',
}

/**
 * The four numbers above the queue.
 *
 * Every value is derived from `TICKETS`, so the band and the table cannot disagree. Filtering the
 * list down to one row leaves the counts unchanged, because they describe the queue, not the
 * filtered view. The chips are also derived, from the stated previous values in `tickets.ts`. So
 * a sentence like "two fewer than last week" is computed, not typed.
 *
 * Nothing here is a style decision. `Grid columns={4}` sets the maximum, and Grid's container
 * queries reduce it to two and then one as the region narrows. The Cards are Card, and the Stat
 * inside each is content with no surface of its own.
 */
function summaryStats(): StatProps[] {
  const queue = queueSummary(TICKETS)

  // Both values take their sign from the arithmetic, not from the wording, so a previous value
  // that moved the other way changes the sentence instead of making it wrong. This prevents
  // output like "Slower by −22m".
  const fewer = (measure: QueueMeasure) =>
    `${Math.abs(measure.value - measure.previous)} ${measure.value < measure.previous ? 'fewer' : 'more'} than last week`

  const pace = (measure: QueueMeasure) =>
    `${measure.value > measure.previous ? 'Slower' : 'Faster'} by ${duration(Math.abs(measure.value - measure.previous))} than last week`

  return [
    {
      label: 'Open tickets',
      value: String(queue.open.value),
      trend: movement(queue.open),
      footer: { primary: fewer(queue.open), secondary: 'Still waiting on someone' },
    },
    {
      label: 'Urgent',
      value: String(queue.urgent.value),
      trend: movement(queue.urgent),
      footer: { primary: fewer(queue.urgent), secondary: 'Triage before anything else' },
    },
    {
      label: 'Median response',
      value: duration(queue.responseMinutes.value),
      trend: movement(queue.responseMinutes),
      footer: {
        primary: pace(queue.responseMinutes),
        secondary: 'Since the last reply, queue-wide',
      },
    },
    {
      label: 'Solved this week',
      value: String(queue.solved.value),
      trend: movement(queue.solved),
      footer: {
        primary: fewer(queue.solved),
        secondary: 'Closed in the last seven days',
      },
    },
  ]
}

export interface InboxPageProps {
  onNewTicket: () => void
  onOpenTicket: (ticket: Ticket) => void
}

export function InboxPage({ onNewTicket, onOpenTicket }: InboxPageProps) {
  const [filters, setFilters] = useState<TicketFilters>(NO_FILTERS)
  const [sort, setSort] = useState<DataTableSort>({ key: 'updatedMinutesAgo', direction: 'desc' })

  const visible = visibleTickets(TICKETS, filters, sort.direction)
  const filtered = filtersAreSet(filters)

  const columns: DataTableColumn<Ticket>[] = [
    { key: 'subject', header: 'Ticket' },
    { key: 'requester', header: 'Requester' },
    {
      key: 'status',
      header: 'Status',
      cell: (ticket) => <Badge tone={STATUS_TONE[ticket.status]}>{ticket.status}</Badge>,
    },
    {
      key: 'priority',
      header: 'Priority',
      /*
       * Only exceptional values get emphasis. A Badge on every row would fill the column with
       * chips, and the two priorities used for triage would be lost among the three default
       * ones. Urgent and high keep the chip. Ordinary priorities are plain text.
       */
      cell: (ticket) =>
        ticket.priority === 'urgent' || ticket.priority === 'high' ? (
          <Badge variant="outline" tone={PRIORITY_TONE[ticket.priority]}>
            {ticket.priority}
          </Badge>
        ) : (
          capitalize(ticket.priority)
        ),
    },
    {
      key: 'assignee',
      header: 'Assignee',
      /*
       * An Avatar plus a name, not a Badge. An outline Badge with a `user` icon reading
       * "Unassigned" is too heavy for a state that appears in half the rows, and heavier than
       * the assigned rows it should contrast with. An avatar plus a name is quieter, and the
       * unassigned case differs only by having no picture.
       */
      cell: (ticket) => (
        <Inline gap={2} align="center">
          <Avatar name={ticket.assignee ?? ''} size="sm" />
          <span>{ticket.assignee ?? 'Unassigned'}</span>
        </Inline>
      ),
    },
    {
      key: 'updatedMinutesAgo',
      header: 'Updated',
      numeric: true,
      sortable: true,
      cell: (ticket) => relativeTime(ticket.updatedMinutesAgo),
    },
  ]

  return (
    <ListPage
      title="Inbox"
      /*
       * The header row is slim with the title on the left, following the site-header pattern.
       *
       * There is no description, because the summary band does that job. A sentence like "Every
       * conversation waiting on someone here" would restate the page name, above four cards that
       * say the same in numbers. The header row is one line: the page title and its one action.
       */
      actions={<Button icon="add" label="New ticket" onClick={onNewTicket} />}
      summary={
        <Grid columns={4} gap={6}>
          {summaryStats().map((stat) => (
            <Card key={stat.label}>
              <Stat {...stat} />
            </Card>
          ))}
        </Grid>
      }
      filters={
        <FilterBar
          isFiltered={filtered}
          onClear={() => setFilters(NO_FILTERS)}
          // The count is in the filter bar's live region, which is the main reason FilterBar
          // exists: a number that changes when you filter should be announced when it changes.
          resultCount={{ shown: visible.length, total: TICKETS.length }}
          search={
            <SearchInput
              size="sm"
              placeholder="Search tickets…"
              aria-label="Search tickets"
              value={filters.query}
              onChange={(query) => setFilters((current) => ({ ...current, query }))}
            />
          }
        >
          <Select
            size="sm"
            options={STATUS_OPTIONS}
            emptyOption="Any status"
            aria-label="Filter by status"
            value={filters.status}
            onChange={(status) =>
              setFilters((current) => ({ ...current, status: status as Status | null }))
            }
          />
          <Select
            size="sm"
            options={PRIORITY_OPTIONS}
            emptyOption="Any priority"
            aria-label="Filter by priority"
            value={filters.priority}
            onChange={(priority) =>
              setFilters((current) => ({ ...current, priority: priority as Priority | null }))
            }
          />
        </FilterBar>
      }
      empty={visible.length === 0}
      emptyState={{
        ...EMPTY,
        secondaryAction: (
          <Button
            variant="ghost"
            tone="neutral"
            label="Clear filters"
            onClick={() => setFilters(NO_FILTERS)}
          />
        ),
      }}
    >
      {/*
       * Rung 2: the only contextual scope in Relay.
       *
       * A queue is scanned, not read, so more rows in the viewport matter more here than the
       * spacing the rest of the product uses. This is rung 2 rather than a style override because
       * nothing new is invented: it is the same theme, in its compact variant, applied to a
       * region. If the app switches to a compact theme, the table stays one step denser than its
       * surroundings, which is the intended relationship.
       */}
      <DensityScope value="compact" as="section">
        <DataTable
          label="Tickets"
          stickyHeader
          columns={columns}
          data={visible}
          getRowId={(ticket) => ticket.id}
          sort={sort}
          onSortChange={setSort}
          emptyState={EMPTY}
          // A row opens its ticket's detail screen.
          onRowClick={onOpenTicket}
        />
      </DensityScope>
    </ListPage>
  )
}
