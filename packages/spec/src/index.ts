/**
 * `@polymorph/spec`: screens as composition, not as code.
 *
 * A declarative JSON screen format that expresses composition, variants,
 * bindings and declared exceptions, and never style or motion. An emitter turns
 * a spec into TSX (React's or Solid's), a Vue or Svelte single-file component
 * or an Angular standalone component, and checks it against the red rules
 * before writing it, and a spec for `ios` or `android` into a SwiftUI or
 * Compose view held to the native screen contract.
 *
 * The main value is the *validation*, not the emission. A spec is checked
 * against the registry before any code is written: the component exists, every
 * prop exists on it, the grid has the variant × tone cell, and a declared
 * exception sits at the component's actual rung. Agents get these four things
 * wrong, and each becomes a fault with a path instead of a plausible-looking
 * screen.
 *
 * The agent-loop acceptance test runs on it (`docs/verification.md`). The
 * registry tells an agent what the system is, and the MCP server lets it check
 * code it has already written. This package gives the agent something to
 * *produce* that the system can check, which "produces a spec that passes all
 * laws" requires.
 */

export {
  ELEMENTS_UNEMITTED,
  EMITTED_MARKER,
  emitScreen,
  IMPORT_SOURCE,
  SOLID_IMPORT_SOURCE,
  UnemittedFrameworkError,
} from './emit'
export type { EmitOptions } from './emit'
export { MissingRegistryError, VUE_IMPORT_SOURCE } from './emit-vue'
export { SVELTE_IMPORT_SOURCE } from './emit-svelte'
export { ANGULAR_IMPORT_SOURCE, angularScreenSelector } from './emit-angular'
export {
  MissingContractError,
  NATIVE_FILES,
  NativeContractError,
  readNativePackage,
} from './emit-native'
export { SWIFT_MODULE, SwiftContractError, swiftNames } from './emit-swift'
export {
  KOTLIN_PACKAGE,
  KotlinContractError,
  KotlinPackageError,
  kotlinNames,
  kotlinPackageOf,
} from './emit-kotlin'

// The root entry has a compiler and a linter behind it, so its `validateSpec`
// also checks each input's type with the TypeScript parser. The `./validate`
// subpath is for the browser and checks only the composition.
export { emitCheckedScreen, validateSpec } from './lawful'
export type { CheckedScreen } from './lawful'

export { BINDING_PATH, SCREEN_SHAPE, SPEC_ID, isBinding, isElement, isObjectValue } from './schema'
export type {
  Binding,
  ObjectValue,
  ScreenInput,
  ScreenSpec,
  SpecElement,
  SpecException,
  SpecValue,
} from './schema'

export type {
  NativePackage,
  NativePlatform,
  SpecFault,
  SpecJudges,
  SpecOptions,
  SpecValidation,
} from './validate'
