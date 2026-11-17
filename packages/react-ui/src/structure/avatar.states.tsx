import { type ComponentStates } from '@polymorph/react'
import { Inline } from '../layout/Inline'
import { Avatar } from './Avatar'

/**
 * States fixture, from `design/components/avatar.md`'s States table.
 *
 * The image entries use a data URI rather than a URL, because a fixture that
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
  component: 'Avatar',

  entries: [
    {
      name: 'initials — two words become two letters',
      render: () => <Avatar name="Ada Lovelace" />,
      expect: { 'data-fallback': 'initials', 'data-size': 'md' },
    },
    {
      name: 'a single word takes its first two letters',
      render: () => <Avatar name="Rowan" />,
      expect: { 'data-fallback': 'initials' },
    },
    {
      name: 'an image, over the initials it replaces',
      render: () => <Avatar name="Ada Lovelace" src={PORTRAIT} />,
      expect: { 'data-fallback': null },
    },
    {
      name: 'no name at all — the unassigned edge',
      render: () => <Avatar name="" />,
      expect: { 'data-fallback': 'icon' },
    },
    {
      name: 'three sizes',
      render: () => (
        <Inline gap={3} align="center">
          <Avatar name="Ada Lovelace" size="sm" />
          <Avatar name="Ada Lovelace" size="md" />
          <Avatar name="Ada Lovelace" size="lg" />
        </Inline>
      ),
    },
    {
      /*
       * The hash picks role families the theme already emits, so `laws.test.ts`
       * checks every pair here, and re-theming applies to them.
       */
      name: 'identity tones — the same name is the same colour, always',
      render: () => (
        <Inline gap={3} align="center">
          <Avatar name="Ada Lovelace" />
          <Avatar name="Grace Hopper" />
          <Avatar name="Alan Turing" />
          <Avatar name="Katherine Johnson" />
          <Avatar name="Edsger Dijkstra" />
          <Avatar name="Barbara Liskov" />
        </Inline>
      ),
    },
    {
      name: 'standing alone, so it carries the name itself',
      render: () => <Avatar name="Ada Lovelace" label="Ada Lovelace" />,
    },
    {
      name: 'beside a visible name, so it does not',
      render: () => (
        <Inline gap={2} align="center">
          <Avatar name="Ada Lovelace" size="sm" />
          <span>Ada Lovelace</span>
        </Inline>
      ),
    },
    {
      name: 'a group of five with max 3 — three marks and a "+2" that is real text',
      render: () => (
        <Avatar.Group label="Assignees" max={3}>
          <Avatar name="Ada Lovelace" />
          <Avatar name="Grace Hopper" />
          <Avatar name="Alan Turing" />
          <Avatar name="Katherine Johnson" />
          <Avatar name="Barbara Liskov" />
        </Avatar.Group>
      ),
    },
    {
      name: 'a group under max — every mark drawn, no chip',
      render: () => (
        <Avatar.Group label="Reviewers" max={4}>
          <Avatar name="Ada Lovelace" />
          <Avatar name="Grace Hopper" />
        </Avatar.Group>
      ),
    },
  ],

  requiredSelectors: ['[data-fallback="initials"]', '[data-tone="info"]', '[data-tone="danger"]'],
}
