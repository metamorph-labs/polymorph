import { CalendarDate } from '@internationalized/date'
import { describe, expect, it } from 'vitest'

import {
  AGENTS,
  assignmentSummary,
  filtersAreSet,
  NO_FILTERS,
  PRIORITY_TONE,
  relativeTime,
  STATUS_TONE,
  TICKETS,
  visibleTickets,
  type TicketFilters,
} from './tickets'

/**
 * Relay's own logic.
 *
 * The screens use the vocabulary, and the law tests cover the vocabulary. No law covers the code
 * Relay itself contains: which tickets a filter keeps, the order they come back in, and whether
 * "no filter" really means no filter. That is ordinary application logic, and it can be wrong
 * like any other.
 */

const withFilters = (overrides: Partial<TicketFilters>): TicketFilters => ({
  ...NO_FILTERS,
  ...overrides,
})

describe('the unfiltered inbox', () => {
  it('keeps every ticket', () => {
    expect(visibleTickets(TICKETS, NO_FILTERS, 'desc')).toHaveLength(TICKETS.length)
  })

  it('does not report itself as filtered', () => {
    // The Clear-filters control depends on this, and offering to clear filters nobody set would
    // confuse the user.
    expect(filtersAreSet(NO_FILTERS)).toBe(false)
  })

  it('treats a whitespace-only query as no query', () => {
    expect(visibleTickets(TICKETS, withFilters({ query: '   ' }), 'desc')).toHaveLength(
      TICKETS.length,
    )
  })
})

describe('filtering', () => {
  it('narrows by status', () => {
    const solved = visibleTickets(TICKETS, withFilters({ status: 'solved' }), 'desc')
    expect(solved.length).toBeGreaterThan(0)
    expect(solved.every((ticket) => ticket.status === 'solved')).toBe(true)
  })

  it('narrows by priority', () => {
    const urgent = visibleTickets(TICKETS, withFilters({ priority: 'urgent' }), 'desc')
    expect(urgent.map((ticket) => ticket.id)).toEqual(['T-2041'])
  })

  it('combines filters rather than choosing between them', () => {
    const both = visibleTickets(
      TICKETS,
      withFilters({ status: 'solved', priority: 'urgent' }),
      'desc',
    )
    expect(both).toEqual([])
  })

  it('searches the subject, the requester and the id', () => {
    const bySubject = visibleTickets(TICKETS, withFilters({ query: 'webhook' }), 'desc')
    const byRequester = visibleTickets(TICKETS, withFilters({ query: 'brightline' }), 'desc')
    const byId = visibleTickets(TICKETS, withFilters({ query: 't-2019' }), 'desc')

    expect(bySubject.map((ticket) => ticket.id)).toEqual(['T-2041'])
    expect(byRequester.length).toBe(2)
    expect(byId.map((ticket) => ticket.id)).toEqual(['T-2019'])
  })

  it('ignores case, because people rarely type a ticket id in capitals', () => {
    expect(visibleTickets(TICKETS, withFilters({ query: 'SSO' }), 'desc')).toHaveLength(1)
  })

  it('returns an empty list rather than every ticket', () => {
    // The screen shows an EmptyState for a filter with no matches. It never renders if such a
    // filter returns the unfiltered list instead.
    expect(visibleTickets(TICKETS, withFilters({ query: 'zzzz' }), 'desc')).toEqual([])
  })
})

describe('"no filter" is null, as in the vocabulary', () => {
  /*
   * Radix uses `''` for "nothing chosen", which differs from explicitly choosing "none" and
   * renders a blank trigger. `Select`'s `emptyOption` offers an explicit "none" and reports
   * `null`, so a screen needs no sentinel of its own (for example `'any'`). These tests check that
   * no sentinel is used.
   */
  it('matches everything', () => {
    expect(
      visibleTickets(TICKETS, withFilters({ status: null, priority: null }), 'desc'),
    ).toHaveLength(TICKETS.length)
  })

  it('is the value of status and priority in NO_FILTERS', () => {
    expect(NO_FILTERS.status).toBeNull()
    expect(NO_FILTERS.priority).toBeNull()
  })

  it('counts as unset', () => {
    expect(filtersAreSet(withFilters({ status: null }))).toBe(false)
    expect(filtersAreSet(withFilters({ status: 'open' }))).toBe(true)
    expect(filtersAreSet(withFilters({ query: 'a' }))).toBe(true)
  })
})

describe('sorting by recency', () => {
  it('puts the newest first when descending', () => {
    const [first] = visibleTickets(TICKETS, NO_FILTERS, 'desc')
    expect(first?.id).toBe('T-2041')
  })

  it('puts the oldest first when ascending', () => {
    // A time column, not a number column. Ascending means earliest at the top, which is the
    // largest minutes-ago value. Getting this backwards raises no error.
    const [first] = visibleTickets(TICKETS, NO_FILTERS, 'asc')
    expect(first?.id).toBe('T-2014')
  })

  it('leaves the source list alone', () => {
    // `Array.prototype.sort` mutates, and the source here is a module constant
    // shared by every render.
    const before = TICKETS.map((ticket) => ticket.id)
    visibleTickets(TICKETS, NO_FILTERS, 'asc')
    expect(TICKETS.map((ticket) => ticket.id)).toEqual(before)
  })
})

describe('relative time', () => {
  it('formats whole units, because a queue is scanned', () => {
    expect(relativeTime(4)).toBe('4m ago')
    expect(relativeTime(59)).toBe('59m ago')
    expect(relativeTime(60)).toBe('1h ago')
    expect(relativeTime(1_439)).toBe('24h ago')
    expect(relativeTime(1_440)).toBe('1d ago')
    expect(relativeTime(2_880)).toBe('2d ago')
  })
})

describe('the tone tables cover their enums', () => {
  it('has a tone for every status and priority a ticket can hold', () => {
    // A missing entry is `undefined`, which Badge would treat as its default without error, so a
    // solved ticket would show the neutral tone.
    for (const ticket of TICKETS) {
      expect(STATUS_TONE[ticket.status], ticket.status).toBeDefined()
      expect(PRIORITY_TONE[ticket.priority], ticket.priority).toBeDefined()
    }
  })
})

/**
 * The assignment summary.
 *
 * This is the only part of the assignee and due-date fields that is Relay's logic rather than the
 * vocabulary's: which of four forms the confirmation toast takes. New tickets start unassigned
 * and undated, so both states must read as sentences, not as gaps.
 */
describe('the confirmation text for assignee and due date', () => {
  const AUGUST = new CalendarDate(2026, 8, 12)

  it('names the assignee', () => {
    expect(assignmentSummary('ada', null)).toBe('Assigned to Ada Okonkwo')
  })

  it('says unassigned rather than omitting the assignee', () => {
    // This guards against an empty description. A toast that reports only the known fields
    // leaves the user to notice what is missing.
    expect(assignmentSummary(null, null)).toBe('Unassigned')
  })

  it('adds the date when there is one, in either case', () => {
    expect(assignmentSummary('rowan', AUGUST)).toContain('Assigned to Rowan Ellis · due ')
    expect(assignmentSummary(null, AUGUST)).toContain('Unassigned · due ')
  })

  it('formats the date through Intl, from a CalendarDate', () => {
    // Day and month, no year. Due dates fall within the next few weeks, and in "12 Aug 2026" a
    // third of the width is the year, which nobody needs.
    const summary = assignmentSummary(null, AUGUST)
    expect(summary).toMatch(/due \d{1,2} \w+|due \w+ \d{1,2}/)
    expect(summary).not.toContain('2026')
  })

  it('treats an unknown id as unassigned instead of throwing', () => {
    // In a real product the roster would come from a fetch. A stale id in a draft should read as
    // unassigned, not crash the success path.
    expect(assignmentSummary('nobody', null)).toBe('Unassigned')
  })
})

describe('the assignee roster', () => {
  it('has unique ids, because the combobox keys on them', () => {
    expect(new Set(AGENTS.map((agent) => agent.id)).size).toBe(AGENTS.length)
  })

  it('is long enough to need search', () => {
    // This is why the field is a Combobox and the priority field is a Select. If the roster
    // becomes short enough to scan, the control is wrong, and this test flags it.
    expect(AGENTS.length).toBeGreaterThan(8)
  })
})
