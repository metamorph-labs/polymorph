import { type ComponentStates } from '@polymorph/react'
import { Inline } from '../layout/Inline'
import { Stack } from '../layout/Stack'
import { Separator } from './Separator'

/** States fixture, from `design/components/separator.md`'s States table. */

export const states: ComponentStates = {
  component: 'Separator',

  entries: [
    /*
     * The bare entries carry `expect`, because the completeness law checks the
     * rendered *root*, and a composed entry's root is the Stack around it.
     */
    {
      name: 'horizontal',
      render: () => <Separator />,
      expect: { 'data-orientation': 'horizontal' },
    },
    {
      name: 'vertical',
      render: () => <Separator orientation="vertical" />,
      expect: { 'data-orientation': 'vertical' },
    },
    {
      name: 'between two things composition cannot separate',
      render: () => (
        <Stack gap={4}>
          <p>Everything above this line is one thought.</p>
          <Separator />
          <p>Everything below it is another.</p>
        </Stack>
      ),
    },
    {
      name: 'in a toolbar row',
      render: () => (
        <Inline gap={3} align="center">
          <span>Cut</span>
          <span>Copy</span>
          <Separator orientation="vertical" />
          <span>Undo</span>
        </Inline>
      ),
    },
    {
      name: 'no margins of its own — the gap is the parent’s',
      render: () => (
        <Stack gap={7}>
          <p>A wider gap around the same separator.</p>
          <Separator />
          <p>Spacing is one decision, made in one place.</p>
        </Stack>
      ),
    },
    {
      name: 'labelled — the word is content, the flanking rules stay silent',
      render: () => <Separator label="OR" />,
      expect: { 'data-orientation': 'horizontal', 'aria-hidden': null },
    },
  ],

  requiredSelectors: ['[data-orientation="vertical"]'],
}
