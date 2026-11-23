/**
 * `@polymorph/registry`: the canonical catalogue, generated from source.
 *
 * The architecture rule is **one canonical registry, three thin fronts** (CLI,
 * MCP, HTTPS JSON). This package is the registry. A front may reshape its data
 * but must not compute anything the registry does not already hold. A front
 * that does becomes a second source of truth.
 *
 * The registry is never committed. It is built at publish time from the
 * publishing tree, so there is no freshness law and no generated file in git
 * that can drift.
 */

export { buildRegistry, renderRegistry } from './build'
export type { Registry } from './build'

export {
  ANNOUNCEMENTS,
  ARIA_ROLES,
  BEHAVIOUR_SHAPE,
  CLICK_EFFECTS,
  CONTRACT_FENCE,
  DISMISSALS,
  KEY_EFFECTS,
  KEYS,
  MODIFIERS,
  readBehaviour,
  readContract,
  resolveState,
  STATEMENT_KINDS,
} from './behaviour'
export type { ClickEffect, Contract, ContractFault, KeyEffect } from './behaviour'

export {
  AGENT_FENCE,
  AGENT_KEYWORDS,
  AGENT_SECTION,
  AGENT_SHAPE,
  AGENT_STATEMENT_KINDS,
  ARGUMENT_TYPES,
  DESTRUCTIVE_NEVER,
  EVIDENCE_ATTRIBUTE,
  WITHHOLDS_CONTENTS,
  EVIDENCE_KINDS,
  readAgent,
  readAgentContract,
  STATE_TYPES,
} from './agent'
export type {
  AgentAction,
  AgentArgumentType,
  AgentContract,
  AgentDestructive,
  AgentDestructiveNever,
  AgentDestructiveOption,
  AgentEvidence,
  AgentFault,
  AgentState,
  AgentStatement,
  AgentStateType,
  AgentWithholdsContents,
} from './agent'

export { CHARS_PER_TOKEN, estimateTokens, renderSystemCard } from './card'
export type { CardOptions } from './card'

export { firstDifference } from './diff'

export {
  fileClosure,
  fontPackage,
  fontsFor,
  NO_BUILD_FILES,
  PREPAINT,
  PUBLISHED_NAMES,
  PUBLISHED_REGISTRY,
} from './install'
export type { FontRequirement } from './install'

export { auditExceptions, memberSlug } from './exceptions'

export {
  codeFrameworkOf,
  DEFAULT_FRAMEWORK,
  FRAMEWORK_DOCUMENT,
  FRAMEWORK_ENTRY,
  FRAMEWORK_EXTENSIONS,
  FRAMEWORK_FOUNDATION,
  FRAMEWORK_NAMES,
  FRAMEWORK_STATUSES,
  FRAMEWORK_VOCABULARY,
  FRAMEWORKS,
  frameworkFaults,
  frameworkFile,
  frameworkOfPath,
  MAPPED_FRAMEWORKS,
  unionParts,
  vueBinding,
} from './frameworks'
export type {
  Framework,
  FrameworkDocument,
  FrameworkEntry,
  FrameworkStatus,
  MappedFramework,
  MemberFrameworks,
  VueBinding,
} from './frameworks'
export type { ExceptionLike, MemberLike } from './exceptions'

export {
  DEFAULT_PLATFORM,
  NO_SUBSTITUTE,
  PLATFORM_DOCUMENT,
  PLATFORM_ENTRY,
  PLATFORM_STATUSES,
  PLATFORMS,
  platformFaults,
  platformFile,
} from './platforms'
export type {
  MemberPlatforms,
  Platform,
  PlatformDocument,
  PlatformEntry,
  PlatformStatus,
} from './platforms'

export { scoreComponent, searchRegistry } from './search'
export type { SearchFilters, SearchHit } from './search'

export { REGISTRY_SHAPE, SCHEMA_ID } from './schema'

export {
  arr,
  bool,
  defs,
  jsonSchema,
  nullable,
  num,
  obj,
  rec,
  ref,
  str,
  union,
  validate,
} from './shape'
export type { JsonSchema, Shape } from './shape'

export type { LadderRung, RegistryLaw } from './rulings'
export type { RegistryPalette, RegistrySystem, ThemeCatalogue, ThemeRenames } from './theme'
export type {
  ExceptionPrimitive,
  RegistryComponent,
  RegistryDataType,
  RegistryProp,
} from './vocabulary'
