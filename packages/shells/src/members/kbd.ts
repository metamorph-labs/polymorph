import { describeMember, el, fx, identity, slot } from '../dsl'

const key = (label: string) => fx('Kbd', {}, { default: [label] })

/** Kbd (`design/components/kbd.md`): a key, drawn as its cap. */
export default describeMember({
  member: 'Kbd',
  dir: 'structure',
  recipe: 'structure/kbd',
  template: el('kbd', { class: ['kbd'], attrs: { ...identity('Kbd') } }, [slot()]),
  states: [
    { name: 'single key', slots: { default: ['K'] } },
    {
      name: 'a modifier pair — two keys and the prose between them',
      many: {
        within: { member: 'Inline', props: { gap: 1, align: 'center' } },
        each: [],
        also: [key('⌘'), { element: 'span', children: ['+'] }, key('K')],
      },
    },
    {
      name: 'a sequence, where the joiner is a different word',
      many: {
        within: { member: 'Inline', props: { gap: 2, align: 'center' } },
        each: [],
        also: [key('G'), { element: 'span', children: ['then'] }, key('I')],
      },
    },
    {
      name: 'as a menu hint',
      many: {
        within: { member: 'Inline', props: { gap: 4, align: 'center', justify: 'between' } },
        each: [],
        also: [
          { element: 'span', children: ['Search everything'] },
          fx('Inline', { gap: 1, align: 'center' }, { default: [key('⌘'), key('K')] }),
        ],
      },
    },
    { name: 'a wide key keeps the cap shape', slots: { default: ['Esc'] } },
  ],
})
