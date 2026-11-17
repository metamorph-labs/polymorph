import { describeMember, el, slot } from '../dsl'

/**
 * ThirdParty: rung 4 of the exception ladder (`docs/rules.md`), the declared
 * boundary around another library's component. It paints nothing and inherits
 * everything; `data-third-party` carries the library and `data-reason` the
 * reason, and the inventory reads both from the source.
 */
export default describeMember({
  member: 'ThirdParty',
  dir: 'exceptions',
  recipe: 'exceptions/third-party',
  template: el(
    'div',
    { class: ['thirdParty'], attrs: { 'data-third-party': 'library', 'data-reason': 'reason' } },
    [slot()],
  ),
  states: [],
})
