import { type ComponentStates } from '@polymorph/react'
import { Stack } from '../layout/Stack'
import { ProviderButton } from './ProviderButton'

/** States fixture, from `design/components/provider-button.md`'s States table. */

export const states: ComponentStates = {
  component: 'ProviderButton',

  entries: [
    {
      name: 'google',
      render: () => <ProviderButton provider="google" label="Continue with Google" />,
      expect: {
        'data-provider': 'google',
        'data-variant': 'outline',
        'data-tone': 'neutral',
        'data-size': 'md',
      },
    },
    {
      name: 'microsoft',
      render: () => <ProviderButton provider="microsoft" label="Continue with Microsoft" />,
      expect: { 'data-provider': 'microsoft' },
    },
    {
      name: 'github — the one mark that takes the text colour',
      render: () => <ProviderButton provider="github" label="Continue with GitHub" />,
      expect: { 'data-provider': 'github' },
    },
    {
      name: 'small',
      render: () => <ProviderButton provider="google" label="Continue with Google" size="sm" />,
      expect: { 'data-size': 'sm' },
    },
    {
      name: 'large',
      render: () => <ProviderButton provider="google" label="Continue with Google" size="lg" />,
      expect: { 'data-size': 'lg' },
    },
    {
      name: 'loading — the ceremony has started',
      render: () => <ProviderButton provider="google" label="Continue with Google" loading />,
      expect: { 'data-state': 'loading', 'aria-busy': 'true' },
    },
    {
      name: 'disabled',
      render: () => (
        <ProviderButton provider="microsoft" label="Continue with Microsoft" disabled />
      ),
      expect: { 'data-disabled': '' },
    },
    {
      name: 'a chooser — the card is the measure, so the column stretches them',
      render: () => (
        <Stack gap={3}>
          <ProviderButton provider="google" label="Continue with Google" />
          <ProviderButton provider="microsoft" label="Continue with Microsoft" />
          <ProviderButton provider="github" label="Continue with GitHub" />
        </Stack>
      ),
    },
    {
      name: 'localized',
      render: () => <ProviderButton provider="google" label="Mit Google fortfahren" />,
    },
  ],

  /*
   * States that no prop can produce. The styles themselves are Button's, checked by
   * `button.states.tsx`. These are the ones this stylesheet must still receive
   * through `composes`. A ProviderButton without its ring or hover would look like a
   * Button but behave like a div.
   */
  requiredSelectors: [
    ':hover',
    ':active',
    ':focus-visible',
    '[data-disabled]',
    '[data-state="loading"]',
  ],
}
