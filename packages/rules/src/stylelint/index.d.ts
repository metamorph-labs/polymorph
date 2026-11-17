import type { Plugin } from 'stylelint'

export declare const RULE_NAMES: {
  tokenValuesOnly: string
  scopedTokenOwners: string
  noMotionOutsideVocabulary: string
  noThemeSelectors: string
  noMemberSelectors: string
  noGhostTokens: string
  noTokenDeclarations: string
  noAppThemeSelectors: string
  noAppMemberSelectors: string
  noRootFontSize: string
}

/** The CSS rules for application stylesheets, each switched on. `no-ghost-tokens` is added beside them. */
export declare const applicationRules: Record<string, true>

export declare const DEFAULT_TOKEN_OWNERS: Record<string, string[]>

/** Member names that do not read back from their slug by capitalising each word. */
export declare const SLUG_NAMES: Record<string, string>

declare const plugins: Plugin[]
export default plugins
