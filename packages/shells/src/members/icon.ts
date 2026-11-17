import { ICON_ROLE_META, ICON_ROLES, type IconGroup } from '@polymorph/engine'

import { describeMember, el, fx, identity, lit, when } from '../dsl'

/** The role sweep's groups, in the React fixture's order. */
const GROUP_ORDER: IconGroup[] = ['action', 'navigation', 'status', 'object', 'form']

/**
 * Icon (`design/components/icon.md`): the only member that renders a glyph. It
 * ships in the foundation, as React's does, and draws through `Glyph`.
 *
 * The fixture draws its context box with the fixture-box recipe React's
 * FixtureBox uses, and sweeps every role by group, as the React fixture does,
 * so the whole set can be reviewed for consistency at once.
 */
export default describeMember({
  member: 'Icon',
  dir: 'icon',
  home: 'foundation',
  fixtureDir: 'conventions',
  recipe: './icon.module.css',
  recipes: { box: 'conventions/fixture-box' },
  defaults: { size: lit('md') },
  derived: { meaningful: 'label !== undefined' },
  template: el('Glyph', {
    class: ['icon'],
    attrs: {
      glyph: 'name',
      'data-size': 'size',
      'data-icon': 'name',
      'aria-hidden': when('!meaningful', 'true'),
      role: when('meaningful', lit('img')),
      'aria-label': 'label',
      ...identity('Icon'),
    },
  }),
  states: [
    {
      name: 'default — decorative',
      props: { name: 'add' },
      expect: { 'aria-hidden': 'true', 'data-size': 'md', role: null },
    },
    { name: 'size sm', props: { name: 'add', size: 'sm' }, expect: { 'data-size': 'sm' } },
    { name: 'size md', props: { name: 'add', size: 'md' }, expect: { 'data-size': 'md' } },
    { name: 'size lg', props: { name: 'add', size: 'lg' }, expect: { 'data-size': 'lg' } },
    {
      name: 'sizes side by side — each sits on its own text line box',
      many: {
        within: { member: 'Inline', props: { gap: 4, align: 'baseline' } },
        each: [
          { props: { name: 'add', size: 'sm' } },
          { props: { name: 'add', size: 'md' } },
          { props: { name: 'add', size: 'lg' } },
        ],
      },
    },
    {
      name: 'labelled — meaningful',
      props: { name: 'warning', label: 'Warning' },
      expect: { role: 'img', 'aria-label': 'Warning', 'aria-hidden': null },
    },
    {
      // There is no `color` prop: the second icon takes the accent text role from its box.
      name: 'inherits colour from context',
      many: {
        within: { member: 'Inline', props: { gap: 4 } },
        each: [{ props: { name: 'error', label: 'Error, on the page text role' } }],
        also: [
          {
            element: 'span',
            class: ['box.box'],
            children: [fx('Icon', { name: 'error', label: 'Error, on the accent text role' })],
          },
        ],
      },
    },
    ...GROUP_ORDER.map((group) => ({
      name: `all ${group} roles`,
      many: {
        within: { member: 'Inline', props: { gap: 4, wrap: true } },
        each: ICON_ROLES.filter((role) => ICON_ROLE_META[role].group === group).map((role) => ({
          props: { name: role, label: role },
        })),
      },
    })),
  ],
})
