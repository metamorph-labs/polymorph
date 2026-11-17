import { type ComponentStates } from '@polymorph/react'
import { RecordButton } from './RecordButton'

/** States fixture, from `design/components/record-button.md`'s States table. */

const LABELS = { label: 'Record a voice message', stopLabel: 'Stop recording' }

export const states: ComponentStates = {
  component: 'RecordButton',

  entries: [
    {
      name: 'rest — ready to record',
      render: () => <RecordButton {...LABELS} />,
      expect: { 'data-state': null, 'data-size': 'md' },
    },
    {
      name: 'recording — the time and the level beside the stop control',
      render: () => <RecordButton {...LABELS} recording elapsed={12} level={0.6} />,
      expect: { 'data-state': 'recording' },
    },
    {
      name: 'silent — recording with no input level',
      render: () => <RecordButton {...LABELS} recording elapsed={47} level={0} />,
      expect: { 'data-state': 'recording' },
    },
    {
      name: 'starting — recording before the app counts a second',
      render: () => <RecordButton {...LABELS} recording />,
      expect: { 'data-state': 'recording' },
    },
    {
      name: 'sm — the size a composer’s toolbar takes',
      render: () => <RecordButton {...LABELS} size="sm" recording elapsed={75} level={0.3} />,
      expect: { 'data-size': 'sm' },
    },
    {
      name: 'disabled',
      render: () => <RecordButton {...LABELS} disabled />,
      expect: { 'data-state': null },
    },
  ],

  /*
   * None. Recording is a prop, and the Button styles its own hover, focus and
   * press. The halo's size is data set inline. PromptInput's fixture shows the
   * member in its trailing slot.
   */
  requiredSelectors: [],
}
