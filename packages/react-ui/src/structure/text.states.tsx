import { type ComponentStates } from '@polymorph/react'
import { Code } from './Code'
import { Text } from './Text'

/** States fixture, from `design/components/text.md`'s States table. */

export const states: ComponentStates = {
  component: 'Text',

  entries: [
    {
      name: 'body',
      render: () => (
        <Text>
          A pairing is two JSON files: a system&rsquo;s eight axes and fonts, a palette&rsquo;s
          handful of colour seeds.
        </Text>
      ),
      expect: { 'data-size': 'md', 'data-tone': 'primary' },
    },
    {
      name: 'secondary sm',
      render: () => (
        <Text size="sm" tone="secondary">
          Everyone who can open a ticket in this workspace.
        </Text>
      ),
      expect: { 'data-size': 'sm', 'data-tone': 'secondary' },
    },
    {
      name: 'with emphasis',
      render: () => (
        <Text>
          Contrast, coherence and state completeness are <strong>laws</strong>, not guidelines.
        </Text>
      ),
      expect: { 'data-size': 'md', 'data-tone': 'primary' },
    },
    {
      name: 'emphasis inside secondary prose keeps the primary ink',
      render: () => (
        <Text size="sm" tone="secondary">
          Deviation is either <strong>impossible</strong> or loud.
        </Text>
      ),
      expect: { 'data-size': 'sm', 'data-tone': 'secondary' },
    },
    {
      name: 'with inline code in it',
      render: () => (
        <Text>
          Set <Code>pm-system</Code> on the page root and the page repaints.
        </Text>
      ),
      expect: { 'data-size': 'md', 'data-tone': 'primary' },
    },
    {
      name: 'one line',
      render: () => (
        <Text lines={1}>
          Replies reach the customer by email, stay in the ticket&rsquo;s history, and are
          searchable by everyone who can open the ticket in this workspace.
        </Text>
      ),
      expect: { 'data-lines': '1' },
    },
    {
      name: 'three lines',
      render: () => (
        <Text size="sm" tone="secondary" lines={3}>
          A pairing is two JSON files: a system&rsquo;s eight axes and fonts, and a palette&rsquo;s
          handful of colour seeds. The engine derives every role from them, checks each text role
          against each surface it can sit on, and refuses a pairing that fails. A redesign is an
          edit to one of the two files, and every screen follows it, because no screen names a
          colour, a length or a font of its own. The laws run on every change, so a pairing that
          drifts below the contrast floor is caught where it is made.
        </Text>
      ),
      expect: { 'data-lines': '3' },
    },
    {
      name: 'an id on one line',
      render: () => (
        <Text size="sm" lines={1}>
          <Code>9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08</Code>
        </Text>
      ),
      expect: { 'data-lines': '1' },
    },
  ],

  requiredSelectors: [],
}
