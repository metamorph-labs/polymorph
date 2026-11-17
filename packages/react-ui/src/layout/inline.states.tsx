import { FixtureBox } from '../conventions/FixtureBox'
import { type ComponentStates, Icon } from '@polymorph/react'
import { Inline } from './Inline'

/** States fixture, from `design/components/inline.md`'s States table. */

export const states: ComponentStates = {
  component: 'Inline',

  entries: [
    {
      name: 'control row — mixed heights centre',
      render: () => (
        <Inline gap={3}>
          <FixtureBox tall>tall</FixtureBox>
          <FixtureBox>short</FixtureBox>
          <Icon name="settings" label="Settings" />
        </Inline>
      ),
      expect: { 'data-align': 'center', 'data-gap': '3' },
    },
    {
      name: 'baseline text run',
      render: () => (
        <Inline gap={3} align="baseline">
          <FixtureBox tall>tall</FixtureBox>
          <FixtureBox>short</FixtureBox>
        </Inline>
      ),
      expect: { 'data-align': 'baseline' },
    },
    {
      name: 'wrapping tag list',
      render: () => (
        <Inline gap={2} wrap>
          {Array.from({ length: 14 }, (_, index) => (
            <FixtureBox key={index}>{`tag ${index + 1}`}</FixtureBox>
          ))}
        </Inline>
      ),
      expect: { 'data-wrap': '' },
    },
    {
      name: 'justify between',
      render: () => (
        <Inline gap={3} justify="between">
          <FixtureBox>left</FixtureBox>
          <FixtureBox>right</FixtureBox>
        </Inline>
      ),
      expect: { 'data-justify': 'between' },
    },
    {
      name: 'as nav',
      render: () => (
        <Inline as="nav" gap={4}>
          <FixtureBox>Inbox</FixtureBox>
          <FixtureBox>Settings</FixtureBox>
        </Inline>
      ),
    },
  ],

  requiredSelectors: [],
}
