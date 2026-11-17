/**
 * `@polymorph/mcp`: the system as tools for an agent.
 *
 * One of the registry's three thin fronts. The CLI puts the vocabulary in
 * another repository. This server answers questions about it while the
 * consumer writes code. It also reports when the code is unlawful, and which
 * rung of the exception ladder to use if the deviation is intended.
 *
 * Nine tools read, all over `@polymorph/registry`. Nothing here is a source of
 * truth. `thin-front.test.ts` checks that this package never opens the
 * vocabulary, and `transcript.test.ts` runs the real server over a real
 * transport and checks that `validate` agrees with the local toolchain.
 *
 * `fix` is `validate` with the mechanical part of the answer applied: the
 * rules' own fixes, for the violations that have exactly one lawful rewrite.
 *
 * `propose_theme` gives an agent access to the theme axes. It takes an intent
 * and returns a complete candidate pair, with the coherence and contrast
 * verdict from running the real engine over it. It writes nothing.
 *
 * `render_screen` shows an agent the screen it specified. It draws a lawful
 * spec in a browser at a phone width and a desktop width, and returns the
 * pictures and the layout faults measured in the page. It writes nothing.
 *
 * Four tools write, each one writing what a read tool answered: `emit_screen`
 * compiles a validated spec to a TSX file, `install` applies an install plan,
 * `save_theme` saves an admitted pair, and `fix_file` applies the fixes to a
 * file. They write into the project the server was started for and nowhere
 * else. A server with no project has none of them.
 *
 * Stdio only: a local package a consumer runs against their own repository. No
 * hosting, no auth, and it works with every MCP client. Nothing in these tools
 * assumes a transport, so a hosted HTTP variant would need no change to them.
 */

export { createServer, READ_TOOL_NAMES, TOOL_NAMES, WRITE_TOOL_NAMES } from './server'

export {
  DEFAULT_THEME_DIR,
  emitScreen,
  EscapingDirError,
  fix,
  fixFile,
  getComponent,
  getInstallPlan,
  getSystemCard,
  getThemeAxes,
  IGNORED,
  install,
  PROJECTIONS,
  proposeTheme,
  RefusedWriteError,
  renderScreen,
  saveTheme,
  ScreenUnavailableError,
  searchComponents,
  UnfinishedInstallError,
  UnknownComponentError,
  UnknownItemError,
  validate,
  vocabulary,
} from './tools'

export type {
  ComponentAnswer,
  ComponentArgs,
  EmitScreenAnswer,
  EmitScreenArgs,
  FixAnswer,
  FixArgs,
  FixFileAnswer,
  FixFileArgs,
  InstallAnswer,
  InstallArgs,
  InstallPlanArgs,
  LayoutFault,
  Move,
  Projection,
  ProposeAnswer,
  ProposeArgs,
  RationaleEntry,
  RenderedScreen,
  RenderScreenAnswer,
  RenderScreenArgs,
  Rung,
  SaveThemeAnswer,
  SaveThemeArgs,
  ScreenState,
  ScreenView,
  SearchArgs,
  SearchHit,
  SystemCardArgs,
  ThemeAnswer,
  ThemeArgs,
  ToolContext,
  ValidateAnswer,
  ValidateArgs,
  Violation,
} from './tools'

/**
 * The parts of a violation that carry its answer: the rule's own rewrite and
 * the lawful alternatives its message names (`./violations`).
 */
export type { Alternative, DiagnosticFix } from './violations'
