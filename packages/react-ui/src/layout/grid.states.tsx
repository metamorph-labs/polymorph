import { FixtureBox } from '../conventions/FixtureBox'
import { type ComponentStates } from '@polymorph/react'
import { Grid } from './Grid'
import type { GridColumns } from './Grid'

/** States fixture, from `design/components/grid.md`'s States table. */

function Cells({ count }: { count: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, index) => (
        <FixtureBox key={index}>{`cell ${index + 1}`}</FixtureBox>
      ))}
    </>
  )
}

const COLUMN_ENTRIES: GridColumns[] = [2, 3, 4]

export const states: ComponentStates = {
  component: 'Grid',

  entries: [
    ...COLUMN_ENTRIES.map((columns) => ({
      name: `${columns} columns`,
      render: () => (
        <Grid columns={columns} gap={3}>
          <Cells count={6} />
        </Grid>
      ),
      expect: { 'data-columns': String(columns) },
    })),
    {
      name: 'gapped — both axes',
      render: () => (
        <Grid columns={3} gap={5}>
          <Cells count={6} />
        </Grid>
      ),
      expect: { 'data-gap': '5' },
    },
    {
      name: 'twelve columns',
      render: () => (
        <Grid columns={12} gap={2}>
          <Cells count={12} />
        </Grid>
      ),
      expect: { 'data-columns': '12' },
    },
    {
      name: 'patched — rung 3',
      render: () => (
        <Grid columns={3} gap={5} patch={{ gap: 2 }}>
          <Cells count={6} />
        </Grid>
      ),
      expect: { 'data-gap': '2' },
    },
  ],

  requiredSelectors: [],
}
