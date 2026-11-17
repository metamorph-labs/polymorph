import { describeMember, el, lit, slot } from '../dsl'

/**
 * DensityScope: rung 2 of the exception ladder (`docs/rules.md`). It sets the
 * attribute the theme runtime sets on `<html>`, on a subtree, so the region
 * takes another density's variant of every token. It is a wrapper, not a
 * surface, so it has no recipe.
 */
export default describeMember({
  member: 'DensityScope',
  dir: 'exceptions',
  recipe: null,
  defaults: { as: lit('div') },
  template: el({ expr: 'as' }, { attrs: { 'data-density': 'value' } }, [slot()]),
  states: [],
})
