import { type ComponentStates } from '@polymorph/react'
import { FormField } from './FormField'
import { OTPInput } from './OTPInput'

/**
 * States fixture, from `design/components/otp-input.md`'s States table.
 *
 * The caret state needs focus, so it is listed in `requiredSelectors`, and the browser
 * test reaches it with real focus and a real keystroke.
 */

export const states: ComponentStates = {
  component: 'OTPInput',

  entries: [
    {
      name: 'empty — six cells, no placeholder dots',
      render: () => <OTPInput aria-label="Verification code" />,
      expect: { 'data-invalid': null, 'data-disabled': null },
    },
    {
      name: 'four — the other length real code systems use',
      render: () => <OTPInput length={4} aria-label="Verification code" />,
    },
    {
      name: 'partial — the code so far, the caret riding the tail',
      render: () => <OTPInput defaultValue="42" aria-label="Verification code" />,
    },
    {
      name: 'full — read-complete',
      render: () => <OTPInput defaultValue="428051" aria-label="Verification code" />,
    },
    {
      name: 'invalid — the code is wrong, not a digit',
      render: () => <OTPInput invalid defaultValue="428051" aria-label="Verification code" />,
      expect: { 'data-invalid': '' },
    },
    {
      name: 'disabled',
      render: () => <OTPInput disabled aria-label="Verification code" />,
      expect: { 'data-disabled': '' },
    },
    {
      name: 'via FormField — one label, one honest target',
      render: () => (
        <FormField label="Verification code" error="That code didn’t match.">
          <OTPInput defaultValue="428051" />
        </FormField>
      ),
    },
  ],

  requiredSelectors: [
    ':focus-within',
    '[data-caret]',
    '[data-filled]',
    '[data-invalid]',
    '[data-disabled]',
  ],
}
