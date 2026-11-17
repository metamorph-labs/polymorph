import { type ComponentStates } from '@polymorph/react'
import { RelativeTime } from './RelativeTime'

/**
 * States fixture, from `design/components/relative-time.md`'s States table.
 *
 * Values are computed *at render* relative to now, so a gallery cell or a
 * screenshot never drifts. The one fixed string is the calendar date, which
 * checks the day-and-larger units, the date-only absolute form and the
 * `dateTime` passthrough.
 */

const MINUTE_MS = 60_000
const HOUR_MS = 3_600_000
const DAY_MS = 86_400_000

const back = (ms: number) => new Date(Date.now() - ms).toISOString()
const ahead = (ms: number) => new Date(Date.now() + ms).toISOString()

export const states: ComponentStates = {
  component: 'RelativeTime',

  entries: [
    {
      name: 'minutes — the queue register',
      render: () => <RelativeTime value={back(5 * MINUTE_MS)} />,
    },
    {
      name: 'hours',
      render: () => <RelativeTime value={back(2 * HOUR_MS)} />,
    },
    {
      name: 'days, long — for sentences',
      render: () => <RelativeTime value={back(3 * DAY_MS)} format="long" />,
    },
    {
      name: 'auto — prose surfaces get "yesterday"',
      render: () => <RelativeTime value={back(DAY_MS)} numeric="auto" format="long" />,
    },
    {
      name: 'calendar date — days and larger, only',
      render: () => <RelativeTime value="2026-08-04" />,
      expect: { datetime: '2026-08-04' },
    },
    {
      name: 'due date — the future flows through unharmed',
      render: () => <RelativeTime value={ahead(2 * DAY_MS)} />,
    },
    {
      name: 'just now — the one honest word for under a minute',
      render: () => <RelativeTime value={back(20_000)} />,
    },
    {
      // A fixed moment: the absolute form changes at every minute, and a server render and a
      // mount seconds apart must agree.
      name: 'absolute — the moment itself, in the reader’s zone',
      render: () => <RelativeTime value="2026-08-04T14:05:00Z" mode="absolute" />,
    },
    {
      name: 'absolute calendar date — the date alone',
      render: () => <RelativeTime value="2026-08-04" mode="absolute" />,
      expect: { datetime: '2026-08-04' },
    },
    {
      name: 'both — the moment, then how long ago',
      render: () => <RelativeTime value="2026-08-04T14:05:00Z" mode="both" />,
    },
    {
      name: 'invalid — no honest phrase, so nothing renders',
      render: () => <RelativeTime value="not-a-date" />,
      rendersNothing: true,
    },
  ],

  /*
   * None. A word has no state, size or tone, and nothing here can be pressed.
   */
  requiredSelectors: [],
}
