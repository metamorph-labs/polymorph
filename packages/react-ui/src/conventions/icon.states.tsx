import {
  type ComponentStates,
  Icon,
  ICON_ROLE_META,
  ICON_ROLES,
  type IconGroup,
} from '@polymorph/react'

import { Inline } from '../layout/Inline'
import { FixtureBox } from './FixtureBox'

/**
 * States fixture, from `design/components/icon.md`'s States table.
 *
 * The role sweep is extra, beyond the spec's four rows. It renders every role by
 * group, so the whole icon set can be reviewed for consistency at once. A table
 * of names cannot show that.
 */

const GROUP_ORDER: IconGroup[] = ['action', 'navigation', 'status', 'object', 'form']

function RoleSweep({ group }: { group: IconGroup }) {
  const roles = ICON_ROLES.filter((role) => ICON_ROLE_META[role].group === group)
  return (
    <Inline gap={4} wrap>
      {roles.map((role) => (
        <Icon key={role} name={role} label={role} />
      ))}
    </Inline>
  )
}

export const states: ComponentStates = {
  component: 'Icon',

  entries: [
    {
      name: 'default — decorative',
      render: () => <Icon name="add" />,
      expect: { 'aria-hidden': 'true', 'data-size': 'md', role: null },
    },
    { name: 'size sm', render: () => <Icon name="add" size="sm" />, expect: { 'data-size': 'sm' } },
    { name: 'size md', render: () => <Icon name="add" size="md" />, expect: { 'data-size': 'md' } },
    { name: 'size lg', render: () => <Icon name="add" size="lg" />, expect: { 'data-size': 'lg' } },
    {
      name: 'sizes side by side — each sits on its own text line box',
      render: () => (
        <Inline gap={4} align="baseline">
          <Icon name="add" size="sm" />
          <Icon name="add" size="md" />
          <Icon name="add" size="lg" />
        </Inline>
      ),
    },
    {
      name: 'labelled — meaningful',
      render: () => <Icon name="warning" label="Warning" />,
      expect: { role: 'img', 'aria-label': 'Warning', 'aria-hidden': null },
    },
    {
      // There is no `color` prop. An icon takes its colour from its context, so
      // this entry shows it in two contexts.
      name: 'inherits colour from context',
      render: () => (
        <Inline gap={4}>
          <Icon name="error" label="Error, on the page text role" />
          <FixtureBox>
            <Icon name="error" label="Error, on the accent text role" />
          </FixtureBox>
        </Inline>
      ),
    },
    ...GROUP_ORDER.map((group) => ({
      name: `all ${group} roles`,
      render: () => <RoleSweep group={group} />,
    })),
  ],

  // Static: no interactive states to reach.
  requiredSelectors: [],
}
