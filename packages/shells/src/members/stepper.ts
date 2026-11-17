import {
  cond,
  describeMember,
  each,
  el,
  emit,
  flag,
  identity,
  js,
  lit,
  member,
  text,
  when,
} from '../dsl'

const MIGRATION = [
  { label: 'Connect' },
  { label: 'Map fields' },
  { label: 'Review' },
  { label: 'Import' },
]

const DESCRIBED = [
  { label: 'Connect', description: 'Point us at your old help desk' },
  { label: 'Map fields', description: 'Match their names to ours' },
  { label: 'Review', description: 'Check a sample of 20 tickets' },
  { label: 'Import', description: 'Roughly an hour for 10,000' },
]

/** A completed step is a button when the caller handles `stepSelect`; read as the member renders. */
const INTERACTIVE = "row.walk === 'completed' && listening.stepSelect"

/**
 * Stepper (`design/components/stepper.md`): progress through an ordered flow.
 * It reports progress and is not Tabs: a completed step may be revisited, an
 * upcoming one never is and is never focusable. Each step says its position
 * and state in words, in a visually hidden span; the number and the check are
 * decorative. Zag's steps machine models a tab list over panels, which the
 * spec is not, so the member is plain.
 */
export default describeMember({
  member: 'Stepper',
  dir: 'structure',
  recipe: 'structure/stepper',
  types: {
    StepperOrientation: "NonNullable<StepperProps['orientation']>",

    // `error` replaces the walk state in `data-state`; `aria-current`, the connector fill and
    // revisiting still follow `activeIndex`.
    Step: '{ label: string; description?: string; error?: boolean }',
    StepperSpokenState: "'completed' | 'active' | 'upcoming' | 'error'",
    // A function, not four words, because word order is the catalog's grammar.
    StepperSpoken:
      '(step: { position: number; count: number; state: StepperSpokenState }) => string',
  },
  defaults: {
    orientation: lit('horizontal'),
    spoken:
      "({ position, count, state }: Parameters<StepperSpoken>[0]) => `step ${position} of ${count}, ${({ completed: 'completed', active: 'current', upcoming: 'not started', error: 'error' })[state]}`",
  },
  derived: {
    // Each step's place in the walk (`completed` before the active index, `upcoming` after
    // it) and the state it shows, which an error replaces.
    rows: "steps.map((step, index) => ((walk: 'completed' | 'active' | 'upcoming') => ({ step, index, walk, state: step.error === true ? ('error' as const) : walk }))(index < activeIndex ? 'completed' : index === activeIndex ? 'active' : 'upcoming'))",
  },
  // The spec's `agent` fence. An agent revisits a completed step by its index, as a press on that
  // step does; the flow is the caller's, so the active step moves when it passes `activeIndex`.
  agent: {
    on: 'root',
    state: {
      'active-index': 'activeIndex',
      steps: 'rows.map((row) => ({ label: row.step.label, state: row.state }))',
    },
    actions: {
      set: {
        argument: 'number',
        run: `(() => {
          if (!listening.stepSelect) throw new Error('These steps are not revisitable.')
          if (!Number.isInteger(value) || value < 0 || value >= activeIndex) {
            throw new Error(\`Step \${value} is not a completed step, so it cannot be revisited.\`)
          }
          emit('stepSelect', value)
        })()`,
      },
    },
  },
  template: el(
    'ol',
    {
      ref: 'root',
      class: ['root'],
      attrs: { 'data-orientation': 'orientation', ...identity('Stepper') },
    },
    [
      // By position: no spec makes a step's label unique, and Svelte throws on a repeated key.
      each('rows', 'row', 'row.index', [
        el(
          'li',
          {
            part: 'step',
            class: ['step'],
            attrs: {
              'data-state': 'row.state',
              'data-interactive': flag(INTERACTIVE),
              // By position, not the error flag, so the active step stays marked in error.
              'aria-current': when("row.walk === 'active'", lit('step')),
            },
          },
          [
            el(
              { expr: `(${INTERACTIVE}) ? 'button' : 'span'` },
              {
                part: 'control',
                class: ['control'],
                attrs: { type: when(INTERACTIVE, lit('button')) },
                on: { click: emit('stepSelect', { args: ['row.index'], when: INTERACTIVE }) },
              },
              [
                // Decorative: the spoken suffix says the position and the state in words.
                el(
                  'span',
                  {
                    part: 'indicator',
                    class: ['indicator'],
                    attrs: { 'aria-hidden': lit('true') },
                  },
                  [
                    cond(
                      "row.state === 'error'",
                      [member('Icon', { name: lit('error'), size: lit('sm') })],
                      "row.state === 'completed'",
                      [
                        // The pop animates this wrapper, so the check pops in and the circle does not.
                        el('span', { class: ['check'] }, [
                          member('Icon', { name: lit('confirm'), size: lit('sm') }),
                        ]),
                      ],
                      [text('row.index + 1')],
                    ),
                  ],
                ),
                el('span', { part: 'copy', class: ['copy'] }, [
                  el('span', { part: 'label', class: ['label'] }, [text('row.step.label')]),
                  cond('row.step.description !== undefined', [
                    el('span', { part: 'description', class: ['description'] }, [
                      text('row.step.description'),
                    ]),
                  ]),
                  el('span', { part: 'spoken', class: ['spoken'] }, [
                    text(
                      '`, ${spoken({ position: row.index + 1, count: steps.length, state: row.state })}`',
                    ),
                  ]),
                ]),
              ],
            ),
            // The fill follows position, so it is marked on the connector, not the step.
            cond('row.index !== steps.length - 1', [
              el('span', {
                part: 'connector',
                class: ['connector'],
                attrs: { 'data-filled': flag("row.walk === 'completed'") },
              }),
            ]),
          ],
        ),
      ]),
    ],
  ),
  states: [
    {
      name: 'mid-flow — two done, one current, one to come',
      props: { steps: MIGRATION, activeIndex: 2 },
      expect: { 'data-orientation': 'horizontal' },
    },
    { name: 'start — nothing behind you yet', props: { steps: MIGRATION, activeIndex: 0 } },
    { name: 'end — the last step is the current one', props: { steps: MIGRATION, activeIndex: 3 } },
    { name: 'with descriptions', props: { steps: DESCRIBED, activeIndex: 1 } },
    {
      name: 'revisitable — completed steps are real buttons',
      props: { steps: MIGRATION, activeIndex: 2, onStepSelect: js('() => {}') },
    },
    {
      name: 'vertical',
      props: { steps: DESCRIBED, activeIndex: 2, orientation: 'vertical' },
      expect: { 'data-orientation': 'vertical' },
    },
    {
      name: 'errored step — the danger family on the mark, the sentence unchanged',
      props: {
        steps: [
          { label: 'Connect' },
          { label: 'Map fields', error: true },
          { label: 'Review' },
          { label: 'Import' },
        ],
        activeIndex: 2,
      },
    },
  ],
})
