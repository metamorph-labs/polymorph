/**
 * The red rules, as a consumer's ESLint config imports them (`docs/rules.md`).
 *
 * The rules ship as `@polymorph/rules`, not inside the engine or the React
 * foundation. They are dev-time and run inside a consumer's ESLint, not inside
 * their app. A bundler that followed them from a runtime entry would pull the
 * linter into a browser build, so the rules and the components do not share a
 * module graph.
 *
 * The red rules come with the install. The config fragment `polymorph add`
 * writes into a consumer's repository (`packages/cli/src/emit.ts`) extends
 * their flat config from this entry. That includes `parser`, because every one
 * of these rules reads TSX and ESLint's default parser cannot, and what a Solid
 * app's config adds (`solidSettings` and `fixableSolidControls`) and an
 * Angular app's (`angularSettings`).
 */
export {
  allRules,
  angularSettings,
  fixableRawControls,
  fixableSolidControls,
  parser,
  PLUGIN_NAME,
  plugin,
  plugin as default,
  rules,
  SCOPED_TOKEN_OWNERS,
  solidSettings,
  stageOneRules,
  stageTwoRules,
  vendorableRules,
} from './index'
export type { PolymorphPlugin, PolymorphRuleName } from './index'
