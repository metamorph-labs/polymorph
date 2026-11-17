import { cond, describeMember, el, identity, lit, member, run, text } from '../dsl'

const LABELS = { label: 'Record a voice message', stopLabel: 'Stop recording' }

/**
 * RecordButton (`design/components/record-button.md`): a Button preset that
 * starts and stops a recording the application makes. The application owns
 * the microphone and passes whether it records, for how long and how loud;
 * the member draws that and reports each press, and changes nothing itself.
 *
 * The Button's name says what a press does, so it changes with `recording`.
 * The meter is drawn before the Button, so the Button stays the same element
 * and keeps focus when the application starts and stops recording. The time is
 * the engine's `clockTime`, as AudioPlayer's clock is.
 */
export default describeMember({
  member: 'RecordButton',
  dir: 'controls',
  recipe: 'controls/record-button',
  defaults: { recording: 'false', disabled: 'false', size: lit('md') },
  derived: {
    // The level as a share from 0 to 1. A value that is not a number is no level.
    share: 'level !== undefined && Number.isFinite(level) ? Math.min(1, Math.max(0, level)) : 0',
  },
  // The spec's `agent` fence. An agent reads whether the application records and stops a
  // recording, and never starts one: a recording captures the room around the person. The Button
  // is this member's own part, so the member registers in its place and withholds it. A stop is
  // the Button's own click (`agentPress`), which reaches `stop` as a person's press does.
  agent: {
    on: 'root',
    element: "root?.querySelector('button')",
    state: { recording: 'recording', disabled: 'disabled' },
    actions: {
      stop: `(() => {
        if (!recording) throw new Error('Nothing is recording.')
        agentPress(root?.querySelector('button'))
      })()`,
    },
    withholds: 'root',
  },
  template: el(
    'span',
    {
      part: 'root',
      class: ['root'],
      // Holds the Button an agent's handle names, and withholds it.
      ref: 'root',
      attrs: {
        'data-state': "recording ? 'recording' : undefined",
        'data-size': 'size',
        ...identity('RecordButton'),
      },
    },
    [
      cond('recording', [
        el(
          'span',
          {
            part: 'meter',
            class: ['meter'],
            attrs: { 'data-record-button-part': lit('meter') },
          },
          [
            // Data, not a decision: the level is the application's measurement.
            el('span', {
              part: 'mark',
              class: ['mark'],
              attrs: { 'aria-hidden': lit('true') },
              geometry: { '--pm-record-button-level': 'share' },
            }),
            cond('elapsed !== undefined', [
              el('span', { part: 'elapsed', class: ['elapsed'] }, [
                text('clockTime(elapsed ?? 0, locale)'),
              ]),
            ]),
          ],
        ),
      ]),
      member(
        'Button',
        {
          variant: "recording ? 'outline' : 'ghost'",
          tone: lit('neutral'),
          size: 'size',
          iconOnly: 'true',
          icon: "recording ? 'stop' : 'record'",
          label: 'recording ? stopLabel : label',
          disabled: 'disabled',
        },
        { on: { click: run("recording ? emit('stop') : emit('start')") } },
      ),
    ],
  ),
  states: [
    {
      name: 'rest — ready to record',
      props: LABELS,
      expect: { 'data-state': null, 'data-size': 'md' },
    },
    {
      name: 'recording — the time and the level beside the stop control',
      props: { ...LABELS, recording: true, elapsed: 12, level: 0.6 },
      expect: { 'data-state': 'recording' },
    },
    {
      name: 'silent — recording with no input level',
      props: { ...LABELS, recording: true, elapsed: 47, level: 0 },
      expect: { 'data-state': 'recording' },
    },
    {
      name: 'starting — recording before the app counts a second',
      props: { ...LABELS, recording: true },
      expect: { 'data-state': 'recording' },
    },
    {
      name: 'sm — the size a composer’s toolbar takes',
      props: { ...LABELS, size: 'sm', recording: true, elapsed: 75, level: 0.3 },
      expect: { 'data-size': 'sm' },
    },
    {
      name: 'disabled',
      props: { ...LABELS, disabled: true },
      expect: { 'data-state': null },
    },
  ],
})
