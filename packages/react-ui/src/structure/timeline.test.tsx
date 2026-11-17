import { render, screen } from '@testing-library/react'
import { beforeAll, describe, expect, it } from 'vitest'

import { assertGoverned } from '@polymorph/react'
import { installTestTheme } from '@polymorph/engine/testing'
import { Timeline, type TimelineEvent, type TimelineProps } from './Timeline'

/**
 * Timeline, in a real browser.
 *
 * Two things. The marker column carries no information: it is a coloured
 * circle, so it is hidden and the title says what happened. And nothing is
 * focusable, because a list with focusable steps would be a Stepper.
 */

beforeAll(installTestTheme)

const HISTORY: TimelineEvent[] = [
  { title: 'Ticket opened', time: '3 days ago', icon: 'add', tone: 'info' },
  { title: 'Assigned to Ada Okonkwo', time: '2 days ago', detail: 'Out of the Platform queue.' },
  { title: 'Escalated to urgent', time: '4 hours ago', icon: 'warning', tone: 'danger' },
  { title: 'Replied to the customer', time: '20 minutes ago', icon: 'comment' },
]

const events = () => [...document.querySelectorAll('li')]
const marks = () =>
  events().map((event) => event.querySelector('[data-mark]') as HTMLElement | null)

describe('the closed surface', () => {
  it('has no style escape hatch', () => {
    assertGoverned<TimelineProps>(true)
  })
})

describe('the given sequence', () => {
  it('draws one event per entry, in the order they were given', () => {
    render(<Timeline events={HISTORY} label="Ticket history" />)
    expect(events().map((event) => event.textContent)).toEqual([
      'Ticket opened3 days ago',
      'Assigned to Ada Okonkwo2 days agoOut of the Platform queue.',
      'Escalated to urgent4 hours ago',
      'Replied to the customer20 minutes ago',
    ])
  })

  it('names the list, because it is rarely the only list on the page', () => {
    render(<Timeline events={HISTORY} label="Ticket history" />)
    expect(screen.getByRole('list', { name: 'Ticket history' })).toBeTruthy()
  })

  it('renders nothing for an empty list', () => {
    const { container } = render(<Timeline events={[]} label="Ticket history" />)
    expect(container.firstElementChild).toBeNull()
  })
})

describe('the mark is visual, and the title carries the meaning', () => {
  it('hides the whole marker column from screen readers', () => {
    render(<Timeline events={HISTORY} label="Ticket history" />)
    for (const event of events()) {
      const marker = event.firstElementChild as HTMLElement
      expect(marker.getAttribute('aria-hidden')).toBe('true')
    }
  })

  it('leaves the marker out of what the list announces', () => {
    render(<Timeline events={HISTORY} label="Ticket history" />)
    // Every glyph is inside the hidden column, so a row's accessible text is the
    // text column only.
    const [first] = screen.getAllByRole('listitem')
    expect(first?.textContent).toBe('Ticket opened3 days ago')
    expect(document.querySelectorAll('svg')).toHaveLength(3)
  })

  it('draws a plain dot when an event has no icon role', () => {
    render(<Timeline events={HISTORY} label="Ticket history" />)
    expect(marks().map((mark) => mark?.dataset['mark'])).toEqual(['icon', 'dot', 'icon', 'icon'])
  })

  it('keeps every glyph decorative', () => {
    const { container } = render(<Timeline events={HISTORY} label="Ticket history" />)
    for (const glyph of container.querySelectorAll('svg')) {
      expect(glyph.getAttribute('aria-hidden')).toBe('true')
    }
  })
})

describe('tone is emphasis, and neutral is the default', () => {
  it('sets no attribute at all for an event with no tone, or a neutral one', () => {
    render(
      <Timeline
        events={[
          { title: 'Untoned', time: 'now' },
          { title: 'Explicitly neutral', time: 'now', tone: 'neutral' },
        ]}
        label="Ticket history"
      />,
    )
    expect(events().map((event) => event.hasAttribute('data-tone'))).toEqual([false, false])
  })

  it('sets data-tone for every other tone', () => {
    render(<Timeline events={HISTORY} label="Ticket history" />)
    expect(events().map((event) => event.dataset['tone'])).toEqual([
      'info',
      undefined,
      'danger',
      undefined,
    ])
  })
})

describe('a record of the past has no controls', () => {
  it('offers nothing to click and nothing to focus', () => {
    render(<Timeline events={HISTORY} label="Ticket history" />)
    expect(screen.queryAllByRole('button')).toHaveLength(0)
    expect(screen.queryAllByRole('link')).toHaveLength(0)
    expect(document.querySelectorAll('[tabindex]')).toHaveLength(0)
  })

  it('draws the connecting rule between marks and never after the last one', () => {
    render(<Timeline events={HISTORY} label="Ticket history" />)
    const drawn = events().map(
      (event) =>
        getComputedStyle(event.firstElementChild as HTMLElement, '::after').content !== 'none',
    )
    expect(drawn).toEqual([true, true, true, false])
  })

  it('has no rule to draw when there is a single event', () => {
    render(<Timeline events={HISTORY.slice(0, 1)} label="Ticket history" />)
    const marker = (events()[0] as HTMLElement).firstElementChild as HTMLElement
    expect(getComputedStyle(marker, '::after').content).toBe('none')
  })
})
