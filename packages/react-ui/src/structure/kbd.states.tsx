import { type ComponentStates } from '@polymorph/react'
import { Inline } from '../layout/Inline'
import { Kbd } from './Kbd'

/** States fixture, from `design/components/kbd.md`'s States table. */

export const states: ComponentStates = {
  component: 'Kbd',

  entries: [
    { name: 'single key', render: () => <Kbd>K</Kbd> },
    {
      name: 'a modifier pair — two keys and the prose between them',
      render: () => (
        <Inline gap={1} align="center">
          <Kbd>⌘</Kbd>
          <span>+</span>
          <Kbd>K</Kbd>
        </Inline>
      ),
    },
    {
      name: 'a sequence, where the joiner is a different word',
      render: () => (
        <Inline gap={2} align="center">
          <Kbd>G</Kbd>
          <span>then</span>
          <Kbd>I</Kbd>
        </Inline>
      ),
    },
    {
      name: 'as a menu hint',
      render: () => (
        <Inline gap={4} align="center" justify="between">
          <span>Search everything</span>
          <Inline gap={1} align="center">
            <Kbd>⌘</Kbd>
            <Kbd>K</Kbd>
          </Inline>
        </Inline>
      ),
    },
    {
      name: 'a wide key keeps the cap shape',
      render: () => <Kbd>Esc</Kbd>,
    },
  ],

  requiredSelectors: [],
}
