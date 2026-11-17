import { type ComponentStates } from '@polymorph/react'
import { Sparkline } from './Sparkline'

/** States fixture, from `design/components/sparkline.md`'s States table. */

export const states: ComponentStates = {
  component: 'Sparkline',

  entries: [
    {
      name: 'down-good',
      render: () => (
        <Sparkline
          data={[42, 40, 41, 38, 35, 36, 33, 31, 32, 29, 27, 26]}
          label="First response, trending down"
        />
      ),
      expect: { 'data-size': 'sm' },
    },
    {
      name: 'up',
      render: () => (
        <Sparkline
          data={[180, 195, 190, 210, 220, 216, 240, 251, 248, 262, 270, 284]}
          label="Ticket volume, trending up"
        />
      ),
    },
    {
      name: 'flat with noise',
      render: () => (
        <Sparkline
          data={[92, 91, 93, 92, 92, 94, 93, 92, 93, 93, 92, 93]}
          label="CSAT, holding steady"
        />
      ),
    },
    {
      name: 'two points',
      render: () => <Sparkline data={[12, 19]} label="Escalations, up week on week" />,
    },
    {
      name: 'md',
      render: () => (
        <Sparkline
          data={[180, 195, 190, 210, 220, 216, 240, 251, 248, 262, 270, 284]}
          label="Ticket volume, trending up"
          size="md"
        />
      ),
      expect: { 'data-size': 'md' },
    },
    {
      // A trend needs two points, and both of these have fewer. They render
      // nothing, because a lone dot would imply a shape the data does not have.
      name: 'empty',
      render: () => <Sparkline data={[]} label="No history yet" />,
      rendersNothing: true,
    },
    {
      name: 'single point',
      render: () => <Sparkline data={[7]} label="One week only" />,
      rendersNothing: true,
    },
  ],

  requiredSelectors: ["[data-size='md']"],
}
