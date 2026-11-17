import { describeMember, el, fx, identity, lit, slot, spacing } from '../dsl'

const cells = (count: number) =>
  Array.from({ length: count }, (_, at) => fx('Badge', {}, { default: [`cell ${at + 1}`] }))

/** Grid (`design/components/grid.md`): equal tracks, token gaps. */
export default describeMember({
  member: 'Grid',
  dir: 'layout',
  recipe: 'layout/layout',
  types: {
    GridAlign: "NonNullable<GridProps['align']>",
    GridColumns: "NonNullable<GridProps['columns']>",
    GridElement: "NonNullable<GridProps['as']>",
  },
  defaults: { columns: '2', align: lit('stretch'), as: lit('div') },
  template: el(
    { expr: 'as' },
    {
      class: ['layout', 'grid'],
      spread: [spacing],
      attrs: {
        'data-columns': 'String(columns)',
        'data-align': 'align',
        ...identity('Grid'),
      },
    },
    [slot()],
  ),
  states: [
    ...[2, 3, 4].map((columns) => ({
      name: `${columns} columns`,
      props: { columns, gap: 3 },
      slots: { default: cells(6) },
      expect: { 'data-columns': String(columns) },
    })),
    {
      name: 'gapped — both axes',
      props: { columns: 3, gap: 5 },
      slots: { default: cells(6) },
      expect: { 'data-gap': '5' },
    },
    {
      name: 'twelve columns',
      props: { columns: 12, gap: 2 },
      slots: { default: cells(12) },
      expect: { 'data-columns': '12' },
    },
    {
      name: 'patched — rung 3',
      props: { columns: 3, gap: 5, patch: { gap: 2 } },
      slots: { default: cells(6) },
      expect: { 'data-gap': '2' },
    },
  ],
})
