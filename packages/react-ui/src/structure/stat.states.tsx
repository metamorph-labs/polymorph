import { type ComponentStates } from '@polymorph/react'
import { Stat } from './Stat'

/** States fixture, from `design/components/stat.md`'s States table. */

export const states: ComponentStates = {
  component: 'Stat',

  entries: [
    {
      name: 'a number and its name',
      render: () => <Stat label="Open tickets" value="128" />,
    },
    {
      name: 'with a glyph',
      render: () => <Stat label="Response time" value="2h 14m" icon="time" />,
    },
    {
      name: 'up, and up is good',
      render: () => <Stat label="Resolved" value="342" delta={{ value: '12%', direction: 'up' }} />,
    },
    {
      name: 'down, and down is good — direction is not sentiment',
      render: () => (
        <Stat
          label="Open tickets"
          value="128"
          delta={{ value: '8%', direction: 'down', positive: true }}
        />
      ),
    },
    {
      name: 'down, and down is bad',
      render: () => (
        <Stat label="Satisfaction" value="91%" delta={{ value: '3pts', direction: 'down' }} />
      ),
    },
    {
      name: 'up, and up is bad',
      render: () => (
        <Stat
          label="Escalations"
          value="17"
          delta={{ value: '4', direction: 'up', positive: false }}
        />
      ),
    },
    {
      name: 'a description instead of a delta',
      render: () => <Stat label="Backlog" value="1,204" description="vs last week" />,
    },
    {
      name: 'not a number — no tabular figures for a word',
      render: () => <Stat label="Busiest channel" value="Email" numeric={false} />,
    },

    /*
     * The full dashboard block card: a chip for the movement and two lines for
     * its meaning and period. No `delta`, which would state the movement twice.
     */
    {
      name: 'trend up — the movement as a chip, not a verdict',
      render: () => (
        <Stat
          label="Solved this week"
          value="1,204"
          trend={{ direction: 'up', label: '+12.5%' }}
          footer={{
            primary: 'Trending up this month',
            secondary: 'Against the same week last month',
          }}
        />
      ),
    },
    {
      name: 'trend down — the same chip, the other way',
      render: () => (
        <Stat
          label="Median response"
          value="2h 23m"
          trend={{ direction: 'down', label: '−18%' }}
          footer={{ primary: 'Faster than last week', secondary: 'Across every open queue' }}
        />
      ),
    },
    {
      name: 'a footer with no trend — the glyph goes with the chip',
      render: () => (
        <Stat
          label="Open tickets"
          value="128"
          footer={{ primary: 'Steady all week', secondary: 'Nothing has been waiting past a day' }}
        />
      ),
    },
    {
      name: 'a trend with no footer — the whole card is the number',
      render: () => (
        <Stat label="Urgent" value="1" trend={{ direction: 'down', label: '2 fewer' }} />
      ),
    },
  ],

  requiredSelectors: ['[data-positive]'],
}
