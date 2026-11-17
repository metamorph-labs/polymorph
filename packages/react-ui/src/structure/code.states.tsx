import { type ComponentStates } from '@polymorph/react'
import { Text } from './Text'
import { Code } from './Code'

/**
 * States fixture, from `design/components/code.md`'s States table.
 *
 * Every entry sets the chip in prose, its only use. The `sm`/`md` pair shows the
 * recipe's decision: one mono size whatever the prose size.
 */

/** A string with no break in it: an authenticator's setup URI. */
const SETUP_KEY =
  'otpauth://totp/Relay:ada@example.com?secret=JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP&issuer=Relay'

export const states: ComponentStates = {
  component: 'Code',

  entries: [
    {
      name: 'inline',
      render: () => (
        <Text>
          Set <Code>pm-system</Code> on the page root.
        </Text>
      ),
    },
    {
      name: 'one mono size, whatever the prose around it',
      render: () => (
        <Text size="sm" tone="secondary">
          Run <Code>pnpm registry</Code> — the same chip, a step down in the prose.
        </Text>
      ),
    },
    {
      name: 'several in a sentence',
      render: () => (
        <Text>
          <Code>data-system</Code> and <Code>data-palette</Code> are the pairing the DOM wears.
        </Text>
      ),
    },
    {
      name: 'a long string breaks inside the chip',
      render: () => (
        <Text>
          Or type <Code>{SETUP_KEY}</Code> into the app.
        </Text>
      ),
    },
  ],

  requiredSelectors: [],
}
