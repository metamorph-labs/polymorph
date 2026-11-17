import { type ComponentStates, CONTROL_SIZES } from '@polymorph/react'
import { Inline } from '../layout/Inline'
import { AvatarButton } from './AvatarButton'

/**
 * States fixture, from `design/components/avatar-button.md`'s States table.
 *
 * The image entry uses a data URI rather than a URL, as Avatar's does, because a fixture that
 * depends on the network renders differently when the request fails.
 */

const PORTRAIT =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">' +
      '<rect width="64" height="64" fill="#557"/>' +
      '<circle cx="32" cy="24" r="12" fill="#bbd"/>' +
      '<circle cx="32" cy="62" r="22" fill="#bbd"/>' +
      '</svg>',
  )

export const states: ComponentStates = {
  component: 'AvatarButton',

  entries: [
    {
      name: 'initials — named by the action, not the person',
      render: () => <AvatarButton name="Ada Lovelace" label="Account menu" />,
      expect: {
        'data-variant': 'ghost',
        'data-tone': 'neutral',
        'data-size': 'md',
        'aria-label': 'Account menu',
        'data-state': null,
      },
    },
    {
      name: 'an image, over the initials it replaces',
      render: () => <AvatarButton name="Ada Lovelace" src={PORTRAIT} label="Account menu" />,
    },
    {
      name: 'no name — the user glyph',
      render: () => <AvatarButton name="" label="Sign in" />,
    },
    {
      name: 'small',
      render: () => <AvatarButton name="Ada Lovelace" label="Account menu" size="sm" />,
      expect: { 'data-size': 'sm' },
    },
    {
      name: 'large — the box follows the face',
      render: () => <AvatarButton name="Ada Lovelace" label="Account menu" size="lg" />,
      expect: { 'data-size': 'lg' },
    },
    {
      name: 'three sizes',
      render: () => (
        <Inline gap={3} align="center">
          {CONTROL_SIZES.map((size) => (
            <AvatarButton
              key={size}
              name="Ada Lovelace"
              label={`Account menu (${size})`}
              size={size}
            />
          ))}
        </Inline>
      ),
    },
    {
      name: 'loading',
      render: () => <AvatarButton name="Ada Lovelace" label="Account menu" loading />,
      expect: { 'data-state': 'loading', 'aria-busy': 'true' },
    },
    {
      name: 'disabled',
      render: () => <AvatarButton name="Ada Lovelace" label="Account menu" disabled />,
      expect: { 'data-disabled': '', disabled: '' },
    },
    {
      name: 'pressed on — the active cell, latched',
      render: () => <AvatarButton name="Ada Lovelace" label="Show my tickets" pressed />,
      expect: { 'data-state': 'on', 'aria-pressed': 'true' },
    },
    {
      name: 'pressed off — the rest cell',
      render: () => <AvatarButton name="Ada Lovelace" label="Show my tickets" pressed={false} />,
      expect: { 'data-state': 'off', 'aria-pressed': 'false' },
    },
    {
      name: 'current',
      render: () => <AvatarButton name="Ada Lovelace" label="Your profile" current />,
      expect: { 'aria-current': 'page' },
    },
  ],

  /*
   * States that no prop can produce. The styles themselves are Button's, checked by
   * `button.states.tsx`. These are the ones this stylesheet must still receive through
   * `composes`. An AvatarButton without its ring or hover would look like a Button but behave
   * like a div.
   */
  requiredSelectors: [
    ':hover',
    ':active',
    ':focus-visible',
    '[data-disabled]',
    '[data-state="loading"]',
    '[data-state="on"]',
  ],
}
