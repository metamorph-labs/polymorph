import { type ComponentStates } from '@polymorph/react'
import { CopyButton } from './CopyButton'

/** States fixture, from `design/components/copy-button.md`'s States table. */

export const states: ComponentStates = {
  component: 'CopyButton',

  entries: [
    {
      name: 'rest',
      render: () => (
        <CopyButton
          value="pnpm add @polymorph/react-ui"
          label="Copy install command"
          copiedLabel="Copied"
        />
      ),
      expect: { 'aria-label': 'Copy install command', 'data-state': null },
    },
    {
      name: 'sm',
      render: () => (
        <CopyButton
          value="pnpm add @polymorph/react-ui"
          label="Copy install command"
          copiedLabel="Copied"
          size="sm"
        />
      ),
      expect: { 'data-size': 'sm' },
    },
    {
      name: 'disabled',
      render: () => (
        <CopyButton
          value="pnpm add @polymorph/react-ui"
          label="Copy install command"
          copiedLabel="Copied"
          disabled
        />
      ),
      expect: { 'data-disabled': '' },
    },
  ],

  /*
   * No `copied` entry, per the fixture rule. The confirmed state follows an event and cannot be
   * rendered from public props, so the attribute is listed here and the unit test covers the
   * swap, announce and revert sequence. The other selectors are Button's, reached by composition.
   */
  requiredSelectors: [
    '[data-state="copied"]',
    ':hover',
    ':active',
    ':focus-visible',
    '[data-disabled]',
  ],
}
