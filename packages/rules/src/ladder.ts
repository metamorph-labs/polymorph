import { RULE_NAMES } from './stylelint/index.js'

/**
 * Which rungs of the exception ladder answer each red rule.
 *
 * Agents work around a rule that only refuses. The exception ladder
 * (`docs/rules.md`) is the set of lawful alternatives ("always use the highest
 * rung that works"), and this table connects each rule to it. `validate` can
 * then return what was done and the shortest lawful alternative, instead of a
 * bare refusal.
 *
 * **One table, not a field per rule.** The rungs could be declared in each
 * rule's `meta`. They are here so a reader checking that the ladder is used
 * consistently reads one file instead of one file per rule. Which rung answers
 * which law is a policy, and a policy split across many files does not get
 * reviewed.
 *
 * **An empty list is deliberate.** The rules at the bottom of the table have no
 * rung. The ladder applies to application code (`inventory.js` says so where it
 * chooses what to scan), and those rules protect the vocabulary itself, which is
 * what exceptions are made from. A `<Bespoke>` zone inside a component would
 * defeat the component's purpose. `fixtures.test.ts` requires every rule in
 * either plugin to appear here, so each entry is a deliberate choice.
 */

/** Rung numbers as the exception ladder in `docs/rules.md` numbers them. */
export const RULE_CLIMB: Record<string, number[]> = {
  /*
   * A style decision in application code. The first rung almost always works,
   * because the variant exists. Otherwise `patch` re-assigns a token on a layout
   * primitive or Card, and a genuine one-off is a declared zone.
   */
  'polymorph/no-raw-styles': [1, 3, 4],

  /*
   * A stylesheet in application code. Rung 3 does not help, because a patch is a
   * token name, not a rule set. The answer is the vocabulary or a declared zone.
   */
  'polymorph/no-app-css': [1, 4],

  /** Raw `<button>`/`<a>`. The vocabulary has a member for it. A one-off composition is rung 4. */
  'polymorph/no-raw-interactive': [1, 4],

  /*
   * Motion imported by application code, or declared in application CSS.
   * Rung 1 when the motion is one a member already has: a fade-in is an
   * overlay's entrance, a height animation is Collapsible's, and the report
   * names the member. Otherwise only rung 4. Motion binds to component state
   * (`docs/motion.md`) and a screen cannot express it, so hand-written motion
   * is allowed only inside a declared zone.
   */
  'polymorph/no-external-motion': [1, 4],
  [RULE_NAMES.noMotionOutsideVocabulary]: [1, 4],

  /*
   * A charting library or a scale imported by application code. Rung 1 when
   * the library's call is a chart the vocabulary draws (recharts' `BarChart`
   * is `<BarChart>`), and the report names it. Otherwise only rung 4: the
   * chart members take `data`, `series` and axis config, and a screen that
   * needs more is drawing something the vocabulary does not draw, which is
   * what a declared zone is for. Rung 5 is intentionally absent: promoting a
   * chart form means designing a new chart member under the chart laws
   * (`docs/charts.md`), not a one-line map edit like the icon rule's.
   */
  'polymorph/no-external-dataviz': [1, 4],

  /*
   * A glyph imported directly. Rung 1 is `<Icon name="…">` with an existing
   * role. When no role has the meaning, the answer is rung 5 instead of a
   * zone. Adding a role is a one-line edit to the glyph map, the cheapest
   * promotion in the system. Rung 4 answers only an inline `<svg>` that is not
   * an icon at all: one-off art, which a zone may draw.
   */
  'polymorph/no-external-icons': [1, 4, 5],

  /*
   * Two openers on one page, which means two h1s. Only rung 1: the vocabulary
   * already has the opener the page needs, and the answer is to choose one. Rung
   * 4 is intentionally absent, because a declared zone suspends the vocabulary
   * rules but never the accessibility laws. This is the only application rule
   * with a one-rung ladder: the only lawful fix is to remove the second opener.
   */
  'polymorph/one-opener': [1],

  /*
   * A `--pm-*` property declared in application CSS. The theme document owns a
   * token's value, and the report names it, but a theme edit is not an
   * exception. The rungs answer the local need: a member's `tone` or `variant`
   * (1), a scope for a subtree's density or tone (2), a patch for one
   * instance's spacing or radius (3). Rung 4 is absent, because a token
   * declared in a zone would still reach the members inside it.
   */
  [RULE_NAMES.noTokenDeclarations]: [1, 2, 3],

  /*
   * Application CSS that branches on the theme's attributes. A value only one
   * pairing needs belongs in that system or palette, and the report says so.
   * The rungs answer a local need: a member's variant (1), or the scope that
   * sets a subtree's mode or density (2).
   */
  [RULE_NAMES.noAppThemeSelectors]: [1, 2],

  /*
   * Application CSS that restyles a member through `data-member`. The member's
   * own props answer most of it (1). A product-wide change to one member is a
   * per-member exception in the system file, outside the ladder. Anything else
   * is a variant the member lacks, which is a promotion (5). A zone cannot
   * help, because it never restyles the members inside it.
   */
  [RULE_NAMES.noAppMemberSelectors]: [1, 5],

  /*
   * A font size on the root, which rescales every rem token. The type scale is
   * the system's. A screen that needs to be denser takes a density scope (2).
   */
  [RULE_NAMES.noRootFontSize]: [2],

  /* ---- the vocabulary's own laws: no rung, on purpose --------------------- */

  /** About ownership, not deviation: own the pattern, or use a theme-scoped token. */
  'polymorph/scoped-token-owners': [],
  [RULE_NAMES.scopedTokenOwners]: [],

  /** Vocabulary CSS. The answer is the token, and there is no rung above it. */
  [RULE_NAMES.tokenValuesOnly]: [],

  /**
   * A recipe must never know which house system it is in. The answer is a token
   * value or an axis branch. A zone would not help.
   */
  [RULE_NAMES.noThemeSelectors]: [],

  /*
   * The identity attribute. Empty like the theme-selector rule, and the lawful
   * answer is outside the ladder. A recipe that needs to diverge declares an
   * exception in the system's file (`overrides.exceptions`), not a selector in
   * the component's stylesheet.
   */
  [RULE_NAMES.noMemberSelectors]: [],

  /*
   * A reference to a custom property that nothing declares. Empty, for a
   * different reason from the laws above: this is never an allowed deviation. A
   * declared zone suspends the rules about how a value may be expressed. It
   * cannot make an undefined name resolve, and the browser drops the
   * declaration either way. The fix is to correct the spelling or declare the
   * property, and the message names the nearest real name.
   */
  [RULE_NAMES.noGhostTokens]: [],

  /** The packaging boundary. It applies to code that leaves this repository. */
  'polymorph/vendorable-imports': [],
}
