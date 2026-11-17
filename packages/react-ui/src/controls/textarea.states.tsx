import { type ComponentStates } from '@polymorph/react'
import { FormField } from './FormField'
import { Textarea } from './Textarea'

/** States fixture, from `design/components/textarea.md`'s States table. */

const NOTE =
  'Retries stop after the first 5xx and never resume. Re-delivering by hand works, ' +
  'so the endpoint is reachable.'

/**
 * Long enough that a four-row box would scroll, and split into lines rather than left to
 * wrap. If the fixture's growth depended on the column width, it would show nothing
 * reliable at whatever width the gallery has.
 */
const LONG = [
  'Steps:',
  '1. Create a webhook endpoint that returns 502 once.',
  '2. Send a delivery.',
  '3. Watch the retry schedule stop instead of backing off.',
  '',
  'First failure 09:12 UTC, POST /hooks/deliveries. Re-delivering by hand works,',
  'so the endpoint is reachable and nothing appears in the request log.',
].join('\n')

export const states: ComponentStates = {
  component: 'Textarea',

  entries: [
    {
      name: 'rest',
      render: () => <Textarea placeholder="What happened?" aria-label="Notes" />,
      expect: { 'data-resize': 'vertical', 'data-invalid': null },
    },
    {
      name: 'with a value',
      render: () => <Textarea defaultValue={NOTE} aria-label="Notes" />,
    },
    {
      name: 'invalid',
      render: () => <Textarea defaultValue="Too short." invalid aria-label="Notes" />,
      expect: { 'data-invalid': '' },
    },
    {
      name: 'disabled',
      render: () => <Textarea defaultValue={NOTE} disabled aria-label="Notes" />,
      expect: { 'data-disabled': '' },
    },
    {
      name: 'read only',
      render: () => <Textarea defaultValue={NOTE} readOnly aria-label="Notes" />,
      expect: { 'data-readonly': '' },
    },
    {
      name: 'taller — the height decision, in line units',
      render: () => <Textarea rows={8} defaultValue={NOTE} aria-label="Notes" />,
    },
    {
      name: 'not resizable',
      render: () => <Textarea resize="none" defaultValue={NOTE} aria-label="Notes" />,
      expect: { 'data-resize': 'none' },
    },
    {
      name: 'autosize — the box is as tall as what is in it',
      render: () => <Textarea autosize defaultValue={LONG} aria-label="Notes" />,
      expect: { 'data-autosize': '', 'data-resize': 'none' },
    },
    {
      name: 'autosize, with one line — `rows` is still the floor',
      render: () => <Textarea autosize defaultValue="It broke." aria-label="Notes" />,
      expect: { 'data-autosize': '' },
    },
    {
      name: 'in a FormField, in error',
      render: () => (
        <FormField label="What happened?" error="Tell us what you were doing at the time.">
          <Textarea defaultValue="It broke." />
        </FormField>
      ),
    },
  ],

  requiredSelectors: [
    ':hover',
    ':focus-visible',
    '[data-invalid]',
    '[data-disabled]',
    '::placeholder',
  ],
}
