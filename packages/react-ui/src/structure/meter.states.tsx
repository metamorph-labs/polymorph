import { type ComponentStates } from '@polymorph/react'
import { Meter } from './Meter'

/** States fixture, from `design/components/meter.md`'s States table. */

export const states: ComponentStates = {
  component: 'Meter',

  entries: [
    {
      name: 'below its thresholds',
      render: () => (
        <Meter
          label="Storage used"
          value={30}
          max={50}
          warning={40}
          danger={45}
          valueText="30 GB of 50 GB"
        />
      ),
      expect: { 'data-tone': 'accent' },
    },
    {
      name: 'between its thresholds — warning',
      render: () => (
        <Meter
          label="Storage used"
          value={42}
          max={50}
          warning={40}
          danger={45}
          valueText="42 GB of 50 GB"
        />
      ),
      expect: { 'data-tone': 'warning' },
    },
    {
      name: 'above its thresholds — danger',
      render: () => (
        <Meter
          label="Storage used"
          value={48}
          max={50}
          warning={40}
          danger={45}
          valueText="48 GB of 50 GB"
        />
      ),
      expect: { 'data-tone': 'danger' },
    },
    {
      name: 'at min',
      render: () => <Meter label="Seats taken" value={0} max={20} valueText="0 of 20 seats" />,
      expect: { 'data-tone': 'accent' },
    },
    {
      name: 'at max — the budget is spent',
      render: () => (
        <Meter
          label="Budget spent"
          value={2000}
          max={2000}
          danger={2000}
          valueText="€2,000 of €2,000"
        />
      ),
      expect: { 'data-tone': 'danger' },
    },
    {
      name: 'outside the range is clamped, and its band still holds',
      render: () => (
        <Meter label="Allowance used" value={130} danger={100} valueText="Over by 30 GB" />
      ),
      expect: { 'data-tone': 'danger' },
    },
    {
      name: 'without the value text',
      render: () => <Meter label="Cold share" value={62} />,
      expect: { 'data-tone': 'accent' },
    },
    {
      name: 'danger without the value text — the glyph alone',
      render: () => <Meter label="Queue depth" value={92} danger={85} />,
      expect: { 'data-tone': 'danger' },
    },
    {
      name: 'messages — the glyph named in another language',
      render: () => (
        <Meter
          label="Speicher belegt"
          value={42}
          max={50}
          warning={40}
          danger={45}
          valueText="42 GB von 50 GB"
          messages={{ warning: 'Hoch', danger: 'Kritisch' }}
        />
      ),
      expect: { 'data-tone': 'warning' },
    },
  ],

  /*
   * Every tone is reached by a prop. The direction is the document's, which no
   * prop reaches: the fill grows from the right in a right-to-left page.
   */
  requiredSelectors: ['[data-tone="warning"]', '[data-tone="danger"]', '[dir="rtl"]'],
}
