/**
 * `@polymorph/cli`: `polymorph init`, `add`, `diff`, `update`, `theme`, `check`, and the
 * verbs that ask the MCP tools (`card`, `validate`, `fix`, `render` and the rest).
 *
 * One of the registry's three thin fronts. It copies a chosen part of the
 * system into another repository and keeps the red rules running there. This
 * package holds no source of truth. The file closure, the version ranges, the
 * fonts and the pre-paint script are all read from `@polymorph/registry`, and
 * `thin-front.test.ts` checks that this package never opens the vocabulary.
 *
 * The model is "open code, closed usage". Open code is the vendoring: the
 * consumer gets real source that they own and can edit. Closed usage is the
 * second half of `add`. It extends the consumer's ESLint and Stylelint configs,
 * so their application code is held to the same laws as this repository's.
 * Without that half, an install would only be a copy with a manifest.
 */

export { applyPlan, freshEslintConfig, freshStylelintConfig } from './apply'
export type { ApplyOptions, ApplyResult } from './apply'

export {
  APP_TOOLING,
  catalogueLines,
  checkoutHolding,
  DEFAULT_SYSTEM,
  InitError,
  installApp,
  installCommand,
  mcpConfig,
  PACKAGE_MANAGERS,
  PACKAGE_REGISTRIES,
  packageManagerOf,
  planInit,
  publishedTools,
  REACT_RANGE,
  refuseDirectory,
  TOOLS_NAME,
  toolsRange,
  writeInit,
} from './init'
export type {
  InitPlan,
  InitPrograms,
  InitStep,
  InstallOptions,
  InstallOutcome,
  Origin,
  PackageManager,
  PackageRegistry,
  Program,
} from './init'

/**
 * The files a coding agent reads, as one plan (`planAgents`) that `init`, `polymorph agents`
 * and the repository's plugin (`pluginFiles`) all write from.
 */
export {
  AGENT_RECORD,
  applyAgents,
  commandLine,
  DEFAULT_HARNESSES,
  HARNESSES,
  planAgents,
  readAgentRecord,
} from './agents'
export type { AgentOptions, AgentPlan, AgentRecord, AgentStep, Harness } from './agents'
export { pluginFiles } from './plugin'
export { SKILL_NAMES, skillFiles } from './skills'

export { main, run } from './cli'
export type { Cli, Outcome } from './cli'

/**
 * The verbs as data (`VERBS`): name, group, summary, usage, flags and the MCP
 * tools each one's job is. The help, the docs and the agent skills read it, and
 * `verbHelp(verb)` is one verb's `--help`.
 * `ToolCaller` and `ServerStarter` are the two functions an entry point
 * supplies as `cli.tools` and `cli.serve`.
 */
export { synopsis, VERB_GROUPS, verbHelp, verbNamed, VERBS } from './verbs'
export type {
  ServerStarter,
  ToolAnswer,
  ToolCaller,
  ToolImage,
  Verb,
  VerbFlag,
  VerbGroup,
} from './verbs'

/**
 * The MCP server's command line, read alike by `polymorph mcp` and by every bin
 * that starts the server.
 */
export { SERVER_FLAGS, serverFlags, ServerFlagsError } from './server-flags'
export type { ServerFlags } from './server-flags'

export { check, CheckError, checkLines } from './check'

export {
  addElements,
  ELEMENTS_STATIC_DIR,
  elementsThemeSheet,
  NoBuildFilesError,
  noBuildFiles,
  planElementsInit,
  updateElements,
  UnshippedPageError,
} from './elements'
export type { ElementsInitPlan, ElementsInitStep, ElementsResult } from './elements'
export type { CheckedFile, CheckOptions, CheckReport, CheckViolation, Verify } from './check'

export {
  BASE_IMPORT,
  eslintFragment,
  generatedFiles,
  hasTheme,
  installedEslintFragment,
  stylelintFragment,
  themeModule,
} from './emit'
export type { FragmentOptions } from './emit'

export { digest, emptyManifest, MANIFEST_FILE, readManifest, writeManifest } from './manifest'
export type { Manifest, ManifestFile } from './manifest'

export {
  addDependencies,
  importThemes,
  injectPrepaint,
  linkEslintConfig,
  linkStylelintConfig,
  PatchError,
} from './patch'

export {
  DEFAULT_DIR,
  ELEMENTS_DIR,
  ELEMENTS_THEME_SHEET,
  elementsNote,
  escapes,
  EscapingDirError,
  nearestName,
  planInstall,
  shipped,
  UnknownItemError,
  vendoredText,
} from './plan'
export type { InstallPlan, PaletteInstall, PlanFile, PlanOptions, SystemInstall } from './plan'

export { VUE_RANGE, VUE_TOOLING } from './init-vue'

export {
  FrameworkMismatchError,
  installFramework,
  UnknownFrameworkError,
  UnshippedMemberError,
} from './vue'

export { diffInstall, updateInstall } from './status'
export type { DiffReport, FileState, FileStatus, UpdateResult } from './status'
