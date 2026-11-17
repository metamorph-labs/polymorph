import { describeMember, el, slot } from '../dsl'

/**
 * Bespoke: rung 4 of the exception ladder (`docs/rules.md`), a declared escape
 * zone. It paints nothing and inherits everything; `data-bespoke` carries the
 * reason, which the inventory reads.
 */
export default describeMember({
  member: 'Bespoke',
  dir: 'exceptions',
  recipe: 'exceptions/bespoke',
  template: el('div', { class: ['bespoke'], attrs: { 'data-bespoke': 'reason' } }, [slot()]),
  states: [],
})
