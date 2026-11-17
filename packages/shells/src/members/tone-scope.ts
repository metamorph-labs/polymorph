import { describeMember, el, lit, slot } from '../dsl'

/**
 * ToneScope: rung 2 of the exception ladder (`docs/rules.md`). `inverse`
 * redeclares the core surface, text and border roles from the theme's opposite
 * mode on a subtree, through the attribute the theme runtime reads.
 */
export default describeMember({
  member: 'ToneScope',
  dir: 'exceptions',
  recipe: null,
  types: {
    Tone: "NonNullable<ToneScopeProps['value']>",
    ScopeElement: "NonNullable<ToneScopeProps['as']>",
  },
  defaults: { as: lit('div') },
  template: el({ expr: 'as' }, { attrs: { 'data-tone': 'value' } }, [slot()]),
  states: [],
})
