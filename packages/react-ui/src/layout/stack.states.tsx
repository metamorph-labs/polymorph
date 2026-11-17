import { FixtureBox } from '../conventions/FixtureBox'
import { type ComponentStates } from '@polymorph/react'
import { Stack } from './Stack'

/** States fixture, from `design/components/stack.md`'s States table. */

function Chips({ count = 3 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, index) => (
        <FixtureBox key={index}>{`item ${index + 1}`}</FixtureBox>
      ))}
    </>
  )
}

export const states: ComponentStates = {
  component: 'Stack',

  entries: [
    {
      name: 'gap 3',
      render: () => (
        <Stack gap={3}>
          <Chips />
        </Stack>
      ),
      expect: { 'data-gap': '3' },
    },
    {
      name: 'gap 6',
      render: () => (
        <Stack gap={6}>
          <Chips />
        </Stack>
      ),
      expect: { 'data-gap': '6' },
    },
    {
      name: 'padded p 5',
      render: () => (
        <Stack gap={2} p={5}>
          <Chips count={2} />
        </Stack>
      ),
      expect: { 'data-p': '5' },
    },
    {
      name: 'axis override p 5 py 2',
      render: () => (
        <Stack gap={2} p={5} py={2}>
          <Chips count={2} />
        </Stack>
      ),
      expect: { 'data-p': '5', 'data-py': '2' },
    },
    {
      name: 'align center, justify between',
      render: () => (
        <Stack gap={3} align="center" justify="between">
          <Chips />
        </Stack>
      ),
      expect: { 'data-align': 'center', 'data-justify': 'between' },
    },
    {
      name: 'as list',
      render: () => (
        <Stack as="ul" gap={2}>
          <li>
            <FixtureBox>li one</FixtureBox>
          </li>
          <li>
            <FixtureBox>li two</FixtureBox>
          </li>
        </Stack>
      ),
    },
    {
      name: 'patched — rung 3',
      render: () => (
        <Stack gap={6} patch={{ gap: 2 }}>
          <Chips />
        </Stack>
      ),
      expect: { 'data-gap': '2' },
    },
  ],

  requiredSelectors: [],
}
