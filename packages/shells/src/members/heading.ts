import { describeMember, el, fx, identity, slot } from '../dsl'

/** Heading (`design/components/heading.md`): section headings, levels 2 to 4. */
export default describeMember({
  member: 'Heading',
  dir: 'structure',
  recipe: 'structure/heading',
  types: {
    HeadingLevel: "NonNullable<HeadingProps['level']>",
  },
  defaults: { level: '2' },
  template: el(
    // The element and the recipe use the same number, so the outline matches the size.
    { expr: "level === 4 ? 'h4' : level === 3 ? 'h3' : 'h2'" },
    { class: ['heading'], attrs: { id: 'id', 'data-level': 'level', ...identity('Heading') } },
    [slot()],
  ),
  states: [
    { name: 'section heading', slots: { default: ['Members'] }, expect: { 'data-level': '2' } },
    {
      name: 'subsection',
      props: { level: 3 },
      slots: { default: ['Invited'] },
      expect: { 'data-level': '3' },
    },
    {
      name: 'sub-subsection — body’s size, weight marking the rung',
      props: { level: 4 },
      slots: { default: ['By email'] },
      expect: { 'data-level': '4' },
    },
    {
      name: 'with an id — the section a fragment link names',
      props: { id: 'heading-members' },
      slots: { default: ['Members'] },
      expect: { id: 'heading-members' },
    },
    {
      name: 'with a caption beside it — composition, not a note prop',
      many: {
        within: { member: 'Stack', props: { gap: 1 } },
        each: [{ slots: { default: ['Members'] } }],
        also: [
          fx(
            'Text',
            { size: 'sm', tone: 'secondary' },
            { default: ['Everyone who can open a ticket in this workspace.'] },
          ),
        ],
      },
    },
  ],
})
