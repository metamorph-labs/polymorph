/**
 * `@polymorph/screen`: screens a model writes and a host draws at run time.
 *
 * A run-time screen is a `polymorph-screen/1` document, the format
 * `@polymorph/spec` validates and emits, drawn at once instead of compiled.
 * This package is what every renderer of one shares, with no framework, no
 * DOM and no dependency: the vocabulary table, `checkScreen`, `parsePartial`,
 * the walk, and the card a host puts in the model's prompt.
 *
 * Each part is a subpath of its own as well, so a host pays only for what it
 * imports: `@polymorph/screen/partial` holds no vocabulary, and
 * `@polymorph/screen/walk` holds none of the table or the card.
 */

export {
  answerFor,
  isCallback,
  returnTypeOf,
  sampleOf,
  stubFor,
  valueAt,
  type Fill,
  type Stub,
} from './actions'
export { checkScreen, type ScreenCheck, type ScreenCheckOptions } from './check'
export { outputContract, runtimeCard, type CardOptions } from './card'
export { argumentsToJson, toJson, type JsonValue } from './json'
export {
  allowedMembers,
  CODE_HOSTS,
  defaultMembers,
  memberFault,
  memberNames,
  surfaceOf,
  type MemberOptions,
  type ScreenSurface,
  type ScreenVocabulary,
  type TableMember,
  type TablePart,
  type TablePrimitive,
  type TableProp,
} from './members'
export { parsePartial, type PartialDocument } from './partial'
export { addressFault, ADDRESS_KEYS, ADDRESS_SCHEMES } from './urls'
export { VOCABULARY } from './vocabulary'
export {
  createScreen,
  materialize,
  type Drawn,
  type DrawnFrom,
  type Materials,
  type Screen,
  type ScreenAction,
  type ScreenFault,
  type ScreenNode,
  type ScreenOptions,
  type ScreenUpdate,
} from './walk'
