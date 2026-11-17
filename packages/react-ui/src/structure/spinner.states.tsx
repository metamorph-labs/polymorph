import { type ComponentStates } from '@polymorph/react'
import { Inline } from '../layout/Inline'
import { Stack } from '../layout/Stack'
import { Spinner } from './Spinner'

/** States fixture, from `design/components/spinner.md`'s States table. */

export const states: ComponentStates = {
  component: 'Spinner',

  entries: [
    { name: 'md — the default', render: () => <Spinner />, expect: { 'data-size': 'md' } },
    {
      name: 'three sizes',
      render: () => (
        <Inline gap={4} align="center">
          <Spinner size="sm" label="Loading small" />
          <Spinner size="md" label="Loading medium" />
          <Spinner size="lg" label="Loading large" />
        </Inline>
      ),
    },
    {
      name: 'a label that says what is loading',
      render: () => <Spinner label="Fetching tickets" />,
    },
    {
      name: 'takes its colour from where it sits',
      render: () => (
        <Stack gap={3}>
          <Inline gap={3} align="center">
            <Spinner label="Loading" />
            <span>inherits the surrounding text colour</span>
          </Inline>
        </Stack>
      ),
    },
    {
      name: 'owns no layout — centring is the region’s decision',
      render: () => (
        <Stack gap={3} align="center">
          <Spinner size="lg" label="Loading the inbox" />
        </Stack>
      ),
    },
  ],

  requiredSelectors: [],
}
