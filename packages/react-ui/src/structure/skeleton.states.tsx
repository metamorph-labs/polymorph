import { type ComponentStates } from '@polymorph/react'
import { Inline } from '../layout/Inline'
import { Stack } from '../layout/Stack'
import { Skeleton } from './Skeleton'

/** States fixture, from `design/components/skeleton.md`'s States table. */

export const states: ComponentStates = {
  component: 'Skeleton',

  entries: [
    {
      name: 'text, default step',
      render: () => <Skeleton />,
      expect: { 'data-shape': 'text' },
    },
    {
      name: 'text steps — each is the line box it stands in for',
      render: () => (
        <Stack gap={3}>
          {(['xs', 'sm', 'md', 'lg', 'xl', '2xl', '3xl'] as const).map((step) => (
            <Skeleton key={step} textStep={step} width={10} />
          ))}
        </Stack>
      ),
    },
    {
      name: 'rect',
      render: () => <Skeleton shape="rect" size={8} width={10} />,
      expect: { 'data-shape': 'rect' },
    },
    {
      name: 'circle',
      render: () => <Skeleton shape="circle" size={7} />,
      expect: { 'data-shape': 'circle' },
    },
    {
      name: 'a loading row, the way a page would use it',
      render: () => (
        <Inline gap={4}>
          <Skeleton shape="circle" size={7} />
          <Stack gap={2} justify="center">
            <Skeleton textStep="md" width={10} />
            <Skeleton textStep="sm" width={9} />
          </Stack>
        </Inline>
      ),
    },
    {
      name: 'a named region',
      render: () => <Skeleton label="Loading tickets" />,
      expect: { role: 'status', 'aria-label': 'Loading tickets', 'aria-hidden': null },
    },
  ],

  requiredSelectors: ['[data-shape="text"]', '[data-shape="circle"]'],
}
