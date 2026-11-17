import { type ComponentStates } from '@polymorph/react'
import { Link } from './Link'
import { FormField } from './FormField'
import { PasswordInput } from './PasswordInput'

/** States fixture, from `design/components/password-input.md`'s States table. */

export const states: ComponentStates = {
  component: 'PasswordInput',

  entries: [
    {
      name: 'rest',
      render: () => <PasswordInput toggleLabel="Show password" aria-label="Password" />,
      expect: { 'data-state': 'hidden' },
    },
    {
      name: 'with value — masked, and never in an announcement',
      render: () => (
        <PasswordInput toggleLabel="Show password" defaultValue="hunter2" aria-label="Password" />
      ),
      expect: { 'data-state': 'hidden' },
    },
    {
      name: 'sm',
      render: () => <PasswordInput toggleLabel="Show password" size="sm" aria-label="Password" />,
      expect: { 'data-size': 'sm' },
    },
    {
      name: 'invalid',
      render: () => <PasswordInput toggleLabel="Show password" invalid aria-label="Password" />,
      expect: { 'data-invalid': '' },
    },
    {
      name: 'disabled — the toggle goes with the field',
      render: () => <PasswordInput toggleLabel="Show password" disabled aria-label="Password" />,
      expect: { 'data-disabled': '' },
    },
    {
      name: 'readOnly — reveal still matters for a generated password',
      render: () => (
        <PasswordInput
          toggleLabel="Show password"
          readOnly
          defaultValue="k9!vX2#mQ8"
          aria-label="Password"
        />
      ),
      expect: { 'data-readonly': '' },
    },
    {
      name: 'via FormField — the login block',
      render: () => (
        <FormField
          label="Password"
          labelEnd={
            <Link href="/reset" variant="standalone">
              Forgot?
            </Link>
          }
          id="password"
        >
          <PasswordInput toggleLabel="Show password" />
        </FormField>
      ),
      expect: { 'data-kind': 'field' },
    },
  ],

  /*
   * The revealed state has no fixture entry. Like CopyButton's `copied`, it only
   * exists after a user action, so `[data-state="visible"]` is listed here and the
   * member's unit test checks that toggling keeps the value. The other selectors are
   * Input's, reached through composition.
   */
  requiredSelectors: [
    '[data-state="hidden"]',
    '[data-state="visible"]',
    ':hover',
    ':focus-visible',
    '[data-invalid]',
    '[data-disabled]',
    '::placeholder',
  ],
}
