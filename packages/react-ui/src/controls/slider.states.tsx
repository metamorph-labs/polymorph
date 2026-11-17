import { type ComponentStates } from '@polymorph/react'
import { Stack } from '../layout/Stack'
import { Slider } from './Slider'

/** States fixture, from `design/components/slider.md`'s States table. */

export const states: ComponentStates = {
  component: 'Slider',

  entries: [
    {
      name: 'rest',
      render: () => <Slider defaultValue={40} aria-label="Volume" />,
      expect: { 'data-orientation': 'horizontal', 'data-disabled': null },
    },
    {
      name: 'zero / full — the two ends of the fill',
      render: () => (
        <Stack gap={5}>
          <Slider defaultValue={0} aria-label="Empty" />
          <Slider defaultValue={100} aria-label="Full" />
        </Stack>
      ),
    },
    {
      name: 'stepped',
      render: () => <Slider defaultValue={40} step={10} aria-label="Sample rate" />,
    },
    {
      name: 'with readout',
      render: () => <Slider defaultValue={40} showValue aria-label="Volume" />,
    },
    {
      name: 'formatted — one formatter writes the readout and the spoken value',
      render: () => (
        <Slider defaultValue={40} showValue formatValue={(v) => `${v}%`} aria-label="Opacity" />
      ),
    },
    {
      name: 'range — two thumbs, the fill between them',
      render: () => <Slider range defaultValue={[20, 60]} aria-label="Price range" />,
    },
    {
      name: 'range with readout — both values, an en dash between',
      render: () => <Slider range defaultValue={[20, 60]} showValue aria-label="Price range" />,
    },
    {
      name: 'invalid',
      render: () => <Slider defaultValue={90} invalid aria-label="Budget" />,
      expect: { 'data-invalid': '' },
    },
    {
      name: 'disabled',
      render: () => <Slider defaultValue={40} disabled aria-label="Locked" />,
      expect: { 'data-disabled': '' },
    },
  ],

  requiredSelectors: [
    ':hover',
    ':focus-visible',
    '[data-state="dragging"]',
    '[data-invalid]',
    '[data-disabled]',
  ],
}
