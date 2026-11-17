import { type ComponentStates } from '@polymorph/react'
import { ErrorSummary } from './ErrorSummary'

/** States fixture, from `design/components/error-summary.md`'s States table. */

export const states: ComponentStates = {
  component: 'ErrorSummary',

  entries: [
    {
      name: 'two errors — every line a door',
      render: () => (
        <ErrorSummary
          title="The ticket can't be raised yet"
          errors={[
            { label: 'Subject is required', fieldId: 'subject' },
            { label: 'Pick a priority', fieldId: 'priority' },
          ]}
        />
      ),
      expect: { role: 'alert' },
    },
    {
      name: 'one error — list semantics kept, the count is content',
      render: () => (
        <ErrorSummary
          title="The ticket can't be raised yet"
          errors={[{ label: 'Subject is required', fieldId: 'subject' }]}
        />
      ),
      expect: { role: 'alert' },
    },
    {
      name: 'long labels — the underline survives the wrap',
      render: () => (
        <ErrorSummary
          title="The ticket can't be raised yet"
          errors={[
            {
              label:
                'The reproduction steps need at least one step the support agent can follow before the ticket can be routed',
              fieldId: 'steps',
            },
            { label: 'Pick a priority', fieldId: 'priority' },
          ]}
        />
      ),
    },
    {
      name: 'empty — no errors is silence, not an empty box',
      render: () => <ErrorSummary title="The ticket can't be raised yet" errors={[]} />,
      rendersNothing: true,
    },
  ],

  /*
   * Hover and focus only. The member has no variants, sizes or tone, and its
   * only states are the links'.
   */
  requiredSelectors: [':hover', ':focus-visible'],
}
