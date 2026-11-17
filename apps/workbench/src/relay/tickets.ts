import { getLocalTimeZone, type CalendarDate } from '@internationalized/date'
import type { BadgeTone, SortDirection } from '@polymorph/react-ui'

/**
 * Relay's data.
 *
 * This is a fixture rather than a fetch. The demo product exists to show the vocabulary can build
 * a real screen, and a loading state fed by a real server would test the server instead. The data
 * has the shape a real support inbox has (a status, a priority, an assignee who may not be set),
 * so the screens must handle the same cases a real screen does.
 */

export const STATUSES = ['open', 'pending', 'solved'] as const
export type Status = (typeof STATUSES)[number]

export const PRIORITIES = ['urgent', 'high', 'normal', 'low'] as const
export type Priority = (typeof PRIORITIES)[number]

export interface Ticket {
  id: string
  subject: string
  requester: string
  status: Status
  priority: Priority
  /** Minutes since the last reply. Rendered relative, sorted numerically. */
  updatedMinutesAgo: number
  assignee?: string
}

/**
 * The people a ticket can be assigned to.
 *
 * A fixed list with more names than a `Select` should hold. That is why the assignee field is a
 * Combobox and the priority field is not. A list you scan is a Select, and a list you search is a
 * Combobox. The boundary is around a dozen names.
 */
export interface Agent {
  id: string
  name: string
  /**
   * The agent's team. The assignee Combobox shows it under the name but does not match on it
   * (see `NewTicketPage.tsx`).
   */
  team: string
}

export const AGENTS: readonly Agent[] = [
  { id: 'rowan', name: 'Rowan Ellis', team: 'Platform' },
  { id: 'ada', name: 'Ada Okonkwo', team: 'Platform' },
  { id: 'marta', name: 'Marta Reyes', team: 'Billing' },
  { id: 'sven', name: 'Sven Lindqvist', team: 'Billing' },
  { id: 'noor', name: 'Noor Haddad', team: 'Identity' },
  { id: 'tomas', name: 'Tomás Ferreira', team: 'Identity' },
  { id: 'wei', name: 'Wei Zhang', team: 'Integrations' },
  { id: 'imani', name: 'Imani Brooks', team: 'Integrations' },
  { id: 'leah', name: 'Leah Stern', team: 'Onboarding' },
  { id: 'oskar', name: 'Oskar Nowak', team: 'Onboarding' },
]

export function agentNamed(id: string | null): Agent | undefined {
  return id === null ? undefined : AGENTS.find((agent) => agent.id === id)
}

/**
 * The text of the confirmation toast after a ticket is created.
 *
 * It is here rather than in the form because it is a decision about Relay's data, like
 * `relativeTime`, and because it is the part of the assignee and due-date handling most likely to
 * be wrong in a subtle way. "Unassigned" is stated rather than omitted, so the user does not have
 * to notice something missing.
 *
 * The date is formatted through `Intl` from a `CalendarDate`. No JS `Date` is used except in
 * `toDate`, the one conversion, where a formatter needs it (the rule in `calendar.md`).
 */
export function assignmentSummary(assignee: string | null, due: CalendarDate | null): string {
  const agent = agentNamed(assignee)
  const who = agent === undefined ? 'Unassigned' : `Assigned to ${agent.name}`
  if (due === null) return who

  const when = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' }).format(
    due.toDate(getLocalTimeZone()),
  )
  return `${who} · due ${when}`
}

/** Status and priority both render as Badges, and the tone carries the signal. */
export const STATUS_TONE: Record<Status, BadgeTone> = {
  open: 'info',
  pending: 'warning',
  solved: 'success',
}

export const PRIORITY_TONE: Record<Priority, BadgeTone> = {
  urgent: 'danger',
  high: 'warning',
  normal: 'neutral',
  low: 'neutral',
}

export const TICKETS: readonly Ticket[] = [
  {
    id: 'T-2041',
    subject: 'Webhook retries stop after the first 5xx',
    requester: 'dana@northwind.example',
    status: 'open',
    priority: 'urgent',
    updatedMinutesAgo: 4,
    assignee: 'Rowan',
  },
  {
    id: 'T-2038',
    subject: 'SSO login loops back to the sign-in page',
    requester: 'm.okafor@lattice.example',
    status: 'open',
    priority: 'high',
    updatedMinutesAgo: 26,
  },
  {
    id: 'T-2035',
    subject: 'Export produces an empty CSV for archived projects',
    requester: 'support@brightline.example',
    status: 'pending',
    priority: 'normal',
    updatedMinutesAgo: 91,
    assignee: 'Ada',
  },
  {
    id: 'T-2031',
    subject: 'Billing address will not accept a Dutch postcode',
    requester: 'j.devries@kade.example',
    status: 'open',
    priority: 'normal',
    updatedMinutesAgo: 143,
  },
  {
    id: 'T-2028',
    subject: 'Requesting a second seat on the trial plan',
    requester: 'ops@fieldnote.example',
    status: 'pending',
    priority: 'low',
    updatedMinutesAgo: 320,
    assignee: 'Rowan',
  },
  {
    id: 'T-2019',
    subject: 'Two-factor codes rejected on the mobile app',
    requester: 'r.almeida@vela.example',
    status: 'solved',
    priority: 'high',
    updatedMinutesAgo: 1_412,
    assignee: 'Ada',
  },
  {
    id: 'T-2014',
    subject: 'Invoice PDF shows the wrong VAT rate',
    requester: 'finance@brightline.example',
    status: 'solved',
    priority: 'normal',
    updatedMinutesAgo: 2_880,
    assignee: 'Rowan',
  },
]

/**
 * Label casing, not data casing. A status is `open` in the fixture and "Open" on screen.
 * Capitalising at render time keeps the value for comparisons and the label for display.
 */
export function capitalize(word: string): string {
  return `${word.charAt(0).toUpperCase()}${word.slice(1)}`
}

/** Whole units only, because a support queue is scanned, and "2h" scans faster than "2h 11m". */
export function relativeTime(minutes: number): string {
  if (minutes < 60) return `${minutes}m ago`
  if (minutes < 60 * 24) return `${Math.round(minutes / 60)}h ago`
  return `${Math.round(minutes / (60 * 24))}d ago`
}

/**
 * The queue's four numbers, and their values a week ago.
 *
 * The previous values are stated rather than computed, because the fixture holds one snapshot
 * and a trend needs two. Stating them here rather than in the screen keeps the arithmetic
 * consistent. The chip on a stat card is computed from these two numbers, so a ticket added to
 * `TICKETS` changes the value and the chip together, and the two cannot disagree.
 */
export interface QueueMeasure {
  value: number
  previous: number
}

export interface QueueSummary {
  open: QueueMeasure
  urgent: QueueMeasure
  /** Minutes since the last reply, at the middle of the queue. */
  responseMinutes: QueueMeasure
  solved: QueueMeasure
}

const LAST_WEEK: Record<keyof QueueSummary, number> = {
  open: 5,
  urgent: 3,
  responseMinutes: 121,
  solved: 3,
}

const WEEK_IN_MINUTES = 7 * 24 * 60

/** The middle value, rounded to a whole minute. `0` for an empty queue. */
function median(values: readonly number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1
    ? (sorted[middle] as number)
    : Math.round(((sorted[middle - 1] as number) + (sorted[middle] as number)) / 2)
}

export function queueSummary(tickets: readonly Ticket[]): QueueSummary {
  const count = (predicate: (ticket: Ticket) => boolean) => tickets.filter(predicate).length

  return {
    open: { value: count((t) => t.status === 'open'), previous: LAST_WEEK.open },
    urgent: { value: count((t) => t.priority === 'urgent'), previous: LAST_WEEK.urgent },
    responseMinutes: {
      value: median(tickets.map((t) => t.updatedMinutesAgo)),
      previous: LAST_WEEK.responseMinutes,
    },
    solved: {
      value: count((t) => t.status === 'solved' && t.updatedMinutesAgo < WEEK_IN_MINUTES),
      previous: LAST_WEEK.solved,
    },
  }
}

/**
 * The change, in the form the stat chip expects: a direction and a pre-formatted label.
 *
 * The minus sign is U+2212, not a hyphen, because a number's sign is a mathematical operator and
 * the hyphen renders at half height next to tabular figures. `0%` counts as up, because an
 * unchanged queue has not got worse. In both cases the label shows the number, not a judgement.
 */
export function movement(measure: QueueMeasure): { direction: 'up' | 'down'; label: string } {
  if (measure.previous === 0) return { direction: 'up', label: 'new' }
  const change = Math.round(((measure.value - measure.previous) / measure.previous) * 100)
  return {
    direction: change < 0 ? 'down' : 'up',
    label: `${change < 0 ? '−' : '+'}${Math.abs(change)}%`,
  }
}

/** Whole units, the way `relativeTime` reads them, without the "ago". */
export function duration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`
}

export interface TicketFilters {
  query: string
  /** `null` means any status. See `NO_FILTERS`. */
  status: Status | null
  /** `null` means any priority. */
  priority: Priority | null
}

/**
 * "No filter" is `null`, which is how the vocabulary represents it.
 *
 * `Select` treats `''` as nothing selected and renders a blank trigger, which pushes a screen to
 * invent its own sentinel (for example `'any'`). `emptyOption` removes that need. It gives the
 * neutral choice a label and reports `null` when it is picked, so no screen needs a sentinel and
 * two filter screens cannot use different ones.
 */
export const NO_FILTERS: TicketFilters = { query: '', status: null, priority: null }

export function filtersAreSet(filters: TicketFilters): boolean {
  return filters.query !== '' || filters.status !== null || filters.priority !== null
}

/**
 * Filters and sorts in one place, so the Inbox only renders the list it receives. `direction`
 * sorts by recency, the only ordering a queue needs.
 */
export function visibleTickets(
  tickets: readonly Ticket[],
  filters: TicketFilters,
  direction: SortDirection,
): Ticket[] {
  const query = filters.query.trim().toLowerCase()

  const matched = tickets.filter((ticket) => {
    if (filters.status !== null && ticket.status !== filters.status) return false
    if (filters.priority !== null && ticket.priority !== filters.priority) return false
    if (query === '') return true
    return (
      ticket.subject.toLowerCase().includes(query) ||
      ticket.requester.toLowerCase().includes(query) ||
      ticket.id.toLowerCase().includes(query)
    )
  })

  // Ascending is oldest first. The column shows times, and ascending on a time column means the
  // earliest at the top, not the smallest number.
  return matched.sort((a, b) =>
    direction === 'asc'
      ? b.updatedMinutesAgo - a.updatedMinutesAgo
      : a.updatedMinutesAgo - b.updatedMinutesAgo,
  )
}
