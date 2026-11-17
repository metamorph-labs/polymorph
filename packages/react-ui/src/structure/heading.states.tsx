import { type ComponentStates } from '@polymorph/react'
import { Stack } from '../layout/Stack'
import { Heading } from './Heading'
import { Text } from './Text'

/**
 * States fixture, from `design/components/heading.md`'s States table.
 *
 * The last entry is the caption pairing the spec argues for (a `Text` beside the
 * heading in a Stack), shown because the API cannot express it.
 */

export const states: ComponentStates = {
  component: 'Heading',

  entries: [
    {
      name: 'section heading',
      render: () => <Heading>Members</Heading>,
      expect: { 'data-level': '2' },
    },
    {
      name: 'subsection',
      render: () => <Heading level={3}>Invited</Heading>,
      expect: { 'data-level': '3' },
    },
    {
      name: 'sub-subsection — body’s size, weight marking the rung',
      render: () => <Heading level={4}>By email</Heading>,
      expect: { 'data-level': '4' },
    },
    {
      // The id carries the member's name, because a gallery shows every entry on one page.
      name: 'with an id — the section a fragment link names',
      render: () => <Heading id="heading-members">Members</Heading>,
      expect: { id: 'heading-members' },
    },
    {
      name: 'with a caption beside it — composition, not a note prop',
      render: () => (
        <Stack gap={1}>
          <Heading>Members</Heading>
          <Text size="sm" tone="secondary">
            Everyone who can open a ticket in this workspace.
          </Text>
        </Stack>
      ),
    },
  ],

  requiredSelectors: [],
}
