/**
 * `@polymorph/shells`: the framework-neutral member descriptions and the
 * renderers that write each framework's shell from them (`docs/shells.md`).
 */
export * from './dsl'
export { loadMembers, orderMembers } from './members'
export {
  ANGULAR_TARGET,
  ELEMENTS_TARGET,
  componentPath,
  describedMembers,
  descriptionPath,
  generatedOnDisk,
  generateShells,
  GENERATED_MARKER,
  isPrimitive,
  partPath,
  registryMember,
  staleness,
  statesPath,
  SOLID_TARGET,
  SVELTE_TARGET,
  TARGETS,
  targetNamed,
  VUE_TARGET,
} from './generate'
export type { ShellTarget } from './generate'
export { fixtureName, gridEntries, partProps } from './common'
export {
  svelteComponentPath,
  svelteInterface,
  sveltePartPath,
  svelteStatesPath,
  SVELTE_FOUNDATION_SRC,
  SVELTE_VOCABULARY_SRC,
} from './svelte'
export type { SvelteProp } from './svelte'
export {
  solidComponentPath,
  solidInterface,
  solidPartPath,
  solidStatesPath,
  SOLID_FOUNDATION_SRC,
  SOLID_VOCABULARY_SRC,
} from './solid'
export {
  angularComponentPath,
  angularInterface,
  angularPartPath,
  angularSelector,
  angularStatesPath,
  angularType,
  ANGULAR_FOUNDATION_SRC,
  ANGULAR_VOCABULARY_SRC,
  hostAttribute,
} from './angular'
export type { AngularProp } from './angular'
export {
  codecOf,
  elementShape,
  elementShapes,
  elementsComponentPath,
  elementsMembers,
  elementsPartPath,
  elementsStatesPath,
  ELEMENTS_FOUNDATION_SRC,
  ELEMENTS_MAP,
  ELEMENTS_VOCABULARY_SRC,
} from './elements'
export type { ElementShape } from './elements'
