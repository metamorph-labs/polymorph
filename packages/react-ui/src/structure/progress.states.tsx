import { type ComponentStates } from '@polymorph/react'
import { Inline } from '../layout/Inline'
import { Stack } from '../layout/Stack'
import { Progress } from './Progress'

/** States fixture, from `design/components/progress.md`'s States table. */

export const states: ComponentStates = {
  component: 'Progress',

  entries: [
    {
      name: 'nothing done yet',
      render: () => <Progress value={0} label="Import progress" />,
      expect: { 'data-tone': 'accent', 'aria-valuenow': '0', 'data-shape': null },
    },
    {
      name: 'part way',
      render: () => <Progress value={33} label="Import progress" />,
      expect: { 'aria-valuenow': '33' },
    },
    {
      name: 'complete',
      render: () => <Progress value={100} label="Import progress" />,
      expect: { 'aria-valuenow': '100' },
    },
    {
      name: 'danger — over quota, not nearly done',
      render: () => <Progress value={80} label="Storage used" tone="danger" />,
      expect: { 'data-tone': 'danger' },
    },
    {
      name: 'out of range is clamped, because a bar cannot overflow',
      render: () => <Progress value={140} label="Clamped" />,
      expect: { 'aria-valuenow': '100' },
    },
    {
      name: 'renders no text — the caption composes',
      render: () => (
        <Stack gap={2}>
          <Progress value={62} label="Migration" />
          <span>3 of 5 tables migrated</span>
        </Stack>
      ),
    },
    {
      name: 'ring sm',
      render: () => <Progress value={25} label="Uploading report.pdf" shape="ring" size="sm" />,
      expect: { 'data-shape': 'ring', 'data-size': 'sm', 'aria-valuenow': '25' },
    },
    {
      name: 'ring md — the default size',
      render: () => <Progress value={60} label="Uploading report.pdf" shape="ring" />,
      expect: { 'data-shape': 'ring', 'data-size': 'md', 'aria-valuenow': '60' },
    },
    {
      name: 'ring lg, complete',
      render: () => <Progress value={100} label="Uploading report.pdf" shape="ring" size="lg" />,
      expect: { 'data-shape': 'ring', 'data-size': 'lg', 'aria-valuenow': '100' },
    },
    {
      name: 'ring danger — the task failed',
      render: () => <Progress value={80} label="Upload failed" shape="ring" tone="danger" />,
      expect: { 'data-shape': 'ring', 'data-tone': 'danger' },
    },
    {
      name: 'ring renders no text — the caption composes',
      render: () => (
        <Inline gap={2}>
          <Progress value={40} label="Uploading report.pdf" shape="ring" size="sm" />
          <span>2 of 5 files</span>
        </Inline>
      ),
    },
  ],

  /*
   * The direction is the document's, which no prop reaches: the bar's fill
   * grows from the right in a right-to-left page, and the ring does not turn.
   */
  requiredSelectors: ['[data-tone="danger"]', '[dir="rtl"]'],
}
