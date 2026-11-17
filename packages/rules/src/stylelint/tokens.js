/**
 * The mechanics of the vocabulary-integrity law: which custom properties a
 * stylesheet declares, which ones it reads, and which real name a wrong one was
 * meant to be.
 *
 * It is plain JS for the same reason as the neighbouring files: node loads
 * `stylelint.config.js` natively and cannot read TypeScript. It is separate from
 * `index.js` so the pieces can be tested and reused without a plugin.
 *
 * The law itself is `packages/rules/src/token-references.test.ts`. A recipe may
 * only read a token that exists, because CSS silently discards the **whole
 * declaration** when a custom property cannot resolve. That law checks the
 * whole corpus at once and is the stronger check. `polymorph/no-ghost-tokens`
 * in `index.js` is the check that ships to a consumer's repository, where that
 * law does not exist. Both use this file, so they agree on what counts as a
 * reference.
 */

import valueParser from 'postcss-value-parser'

/** The vocabulary's namespace. Other namespaces are declared by others. */
export const PM_PREFIX = '--pm-'

/**
 * A declaration, never a read.
 *
 * The prefix alternation makes the distinction. A declaration starts a line or
 * follows a `;`/`{`. Reads with the same `name:` shape, such as
 * `style(--pm-axis-depth: flat)`, are always inside parentheses. Matching those
 * as declarations would let a misspelled style query declare the token it fails
 * to find.
 */
const DECLARATION = /(?:^|[;{])\s*(--pm-[a-zA-Z0-9_-]+)\s*:/gm

/**
 * Every `--pm-*` property a stylesheet declares, read from its text.
 *
 * This is for CSS that arrives as a string: the sheet the theme engine emits,
 * which is the source of the full token list. Inside a Stylelint rule the parser
 * has already done this and `decl.prop` holds the result, so the rule uses
 * PostCSS instead of this function.
 */
export function customPropertiesIn(css) {
  return [...css.matchAll(DECLARATION)].map((match) => match[1])
}

/**
 * Replaces comments with spaces instead of deleting them. Text about a token is
 * not a reference to it, and a file explaining why `--pm-accent-border` does not
 * exist would otherwise report itself. Blanking keeps every offset after a
 * comment pointing at the right column.
 */
export function blankComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ' '))
}

/**
 * Every `--pm-*` a value or an at-rule's params reads, with its offset inside
 * the string it was found in.
 *
 * Both ways a stylesheet reads a property are collected: `var()`, and the
 * `style()` query, which is the lawful way for a recipe to branch on an axis. A
 * misspelled style query fails even more quietly than a misspelled `var()`. The
 * branch never runs, and the recipe behaves as if it were not there.
 *
 * Fallbacks are checked too and are not exempt. `var(--pm-border-defualt,
 * var(--pm-border-default))` always renders correctly but never reads the token
 * it meant to. The fallback hides the typo without fixing it. A rename leaves a
 * ghost in the fallback more often than in the first argument.
 */
export function readsIn(text) {
  const found = []

  valueParser(text).walk((node) => {
    if (node.type !== 'function') return
    const how = node.value.toLowerCase()
    if (how !== 'var' && how !== 'style') return

    const [first] = node.nodes
    if (!first || first.type !== 'word') return
    // `--radix-*` is the positioning engine's namespace, measured at runtime and
    // declared by nothing here. `token-values-only` decides which other
    // namespaces a value may use.
    if (!first.value.startsWith(PM_PREFIX)) return

    found.push({ name: first.value, how, index: first.sourceIndex })
    // Keep walking, because the fallback is also a read.
  })

  return found
}

/**
 * Edit distance, intentionally not the substring search `packages/spec` uses for
 * component names.
 *
 * A wrong component name is usually a different industry word, such as `Modal`
 * for `Dialog`, which edit distance cannot connect. A wrong token name is
 * usually a **misspelling**: a transposition, a plural, or a synonym for one
 * segment. Edit distance finds those and substring matching misses them.
 * `--pm-accnet-bg` shares no substring with `--pm-accent-bg`.
 */
export function distance(a, b) {
  let previous = [...Array(b.length + 1).keys()]

  for (let i = 1; i <= a.length; i++) {
    const row = [i]
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(
        previous[j] + 1,
        row[j - 1] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      )
    }
    previous = row
  }

  return previous[b.length]
}

/**
 * Up to three near names, or none when nothing is close.
 *
 * A validator that guesses is worse than one that says nothing. Suggesting
 * `--pm-space-0` for an unrelated name confidently sends the reader to the
 * wrong place.
 */
export function nearest(name, known) {
  const ceiling = Math.max(3, Math.round(name.length / 3))
  return [...known]
    .map((candidate) => ({ candidate, gap: distance(name, candidate) }))
    .filter(({ gap }) => gap <= ceiling)
    .sort((a, b) => a.gap - b.gap || a.candidate.localeCompare(b.candidate))
    .slice(0, 3)
    .map(({ candidate }) => candidate)
}

/** ` Did you mean `--pm-accent-bg`?`: a sentence to append, or an empty string. */
export function suggestion(name, known) {
  const near = nearest(name, known)
  return near.length === 0 ? '' : ` Did you mean ${near.map((n) => `\`${n}\``).join(', ')}?`
}
