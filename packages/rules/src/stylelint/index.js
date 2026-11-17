/**
 * `@polymorph/rules/stylelint`: the CSS red rules.
 *
 * Plain JS because node loads `stylelint.config.js` natively and cannot read
 * TypeScript. The ESLint rules live in `../rules/` and are TS.
 */

import stylelint from 'stylelint'

// An import attribute instead of `readFileSync(import.meta.url)`. Node loads
// this module natively from stylelint.config.js, and tests load it through
// Vite's transform. Only the import works in both.
import motion from '../../../../design/motion/motion.json' with { type: 'json' }
import owners from '../../scoped-token-owners.json' with { type: 'json' }
import { matchesAny } from '../glob.js'
import { lengthFamily, nearestColor, nearestDuration, nearestLength } from './catalogue.js'
import { nearest, PM_PREFIX, readsIn } from './tokens.js'
import { findRawValues, isGovernedProperty } from './values.js'

const { createPlugin, utils } = stylelint

/**
 * Where the value starts inside `prop: value`. It is computed from the raw
 * separator, not by subtracting the value's length from the declaration's,
 * because `!important` and trailing comments come after the value and would
 * shift every underline to the left.
 *
 * @param {import('postcss').Declaration} decl
 */
function valueIndex(decl) {
  return decl.prop.length + (decl.raws.between ?? ':').length
}

/** @type {Record<string, string[]>} */
export const DEFAULT_TOKEN_OWNERS = owners

/**
 * Every report carries its answer, under 200 characters (`rules/advice.ts`
 * states the standard for both plugins). The first sentence is always kept;
 * the rest only while the message fits.
 *
 * @param {string} head
 * @param {string[]} sentences
 */
function fit(head, sentences) {
  let message = head
  for (const [index, sentence] of sentences.filter(Boolean).entries()) {
    if (index > 0 && `${message} ${sentence}`.length >= 200) continue
    message = `${message} ${sentence}`
  }
  return message
}

/* -------------------------------------------------------------------------- */
/* Stage 1 — vocabulary CSS may only express decisions through tokens          */
/* -------------------------------------------------------------------------- */

const tokenValuesOnly = 'polymorph/token-values-only'

const tokenValuesOnlyMessages = utils.ruleMessages(tokenValuesOnly, {
  rejected: (text, property, advice) =>
    fit(`Unexpected raw value "${text}" in "${property}".`, advice),
})

/** `var(--pm-space-4)`, as a code span. */
const varOf = (name) => `\`var(${name})\``

/**
 * The nearest token as a sentence: `It is var(--pm-space-4) (12px).`, both
 * steps when two are equally near, and the negation a negative length needs.
 *
 * @param {import('./catalogue').NearestAmount} near
 */
function nearestSentence(near) {
  const named = `${varOf(near.name)} (${near.value})`
  const which = near.also
    ? `It is between ${named} and ${varOf(near.also.name)} (${near.also.value})`
    : `${near.exact ? 'It is' : 'Nearest is'} ${named}`
  return near.negative ? `${which}, negated: \`calc(-1 * var(${near.name}))\`.` : `${which}.`
}

/**
 * What a raw value should have been: the nearest token by value when the
 * config passes the theme's values, and the family otherwise. Every answer
 * names a `--pm-*` token, because that is the only lawful answer in a recipe.
 *
 * @param {{ text: string, reason: string }} offender
 * @param {string} property
 * @param {import('./catalogue').TokenValues | undefined} values
 * @returns {string[]}
 */
function tokenAdvice(offender, property, values) {
  const { text, reason } = offender
  const lower = property.toLowerCase()
  // A shadow's parts are not tokens; the whole shadow is one.
  if (/shadow$/.test(lower)) {
    return ['Read a whole `var(--pm-shadow-*)` or `var(--pm-glow-*)` step, not its parts.']
  }
  if (reason.includes('colour')) {
    const near = nearestColor(text, values?.color, lower)
    return near
      ? [`Its nearest role is ${near.names.map(varOf).join(' or ')} (${near.value}).`]
      : [
          'Read a colour role: `var(--pm-text-*)`, `var(--pm-bg-*)`, `var(--pm-border-*)` or `var(--pm-accent-*)`.',
        ]
  }
  if (reason.includes('duration')) {
    const near = nearestDuration(text, values)
    return near ? [nearestSentence(near)] : ['Read a `var(--pm-motion-duration-*)` token.']
  }
  if (reason.includes('length')) {
    const near = nearestLength(text, values, lower)
    const family = lengthFamily(lower)
    const fallback = {
      space: 'Read a `var(--pm-space-*)` step.',
      radius: 'Read a `var(--pm-radius-*)` step.',
      text: 'Read a `var(--pm-text-*-size)` step.',
      size: 'Read a `var(--pm-control-height-*)` or `var(--pm-space-*)` token.',
    }[family]
    return [
      near ? nearestSentence(near) : fallback,
      'Lawful literals: 0, 1px, 2px, 100%, auto, viewport units and 9999px.',
    ]
  }
  if (reason.includes('weight')) return ['Read a `var(--pm-text-*-weight)` token.']
  if (reason.includes('stacking')) {
    return [
      'Read `var(--pm-z-raise)`, `var(--pm-z-shell)`, `var(--pm-z-overlay)` or `var(--pm-z-toast)`.',
    ]
  }
  return ['Only `var(--pm-*)` properties may be read here.']
}

const tokenValuesOnlyRule = (primary, secondary) => (root, result) => {
  if (
    !utils.validateOptions(
      result,
      tokenValuesOnly,
      { actual: primary, possible: [true] },
      {
        actual: secondary,
        possible: { values: [(value) => typeof value === 'object' && value !== null] },
        optional: true,
      },
    )
  ) {
    return
  }
  const values = secondary?.values

  root.walkDecls((decl) => {
    if (!isGovernedProperty(decl.prop)) return

    const valueOffset = valueIndex(decl)
    for (const offender of findRawValues(decl.value, decl.prop)) {
      utils.report({
        result,
        ruleName: tokenValuesOnly,
        node: decl,
        index: valueOffset + offender.index,
        endIndex: valueOffset + offender.index + offender.text.length,
        message: tokenValuesOnlyMessages.rejected(
          offender.text,
          decl.prop,
          tokenAdvice(offender, decl.prop, values),
        ),
      })
    }
  })
}

tokenValuesOnlyRule.ruleName = tokenValuesOnly
tokenValuesOnlyRule.messages = tokenValuesOnlyMessages

/* -------------------------------------------------------------------------- */
/* Stage 2 — pattern-scoped tokens stay inside their owning pattern            */
/* -------------------------------------------------------------------------- */

const scopedTokenOwners = 'polymorph/scoped-token-owners'

const scopedTokenOwnersMessages = utils.ruleMessages(scopedTokenOwners, {
  rejected: (namespace, owner) =>
    `"${namespace}*" belongs to ${owner}, not this file (packages/rules/scoped-token-owners.json). ` +
    `Read a theme-scoped token here, or list the file if it owns the pattern.`,
})

/** The owning files, named by the first, as the ESLint rule names them. */
function ownerOf(globs) {
  const [first] = globs
  if (first === undefined) return 'no file'
  const segments = first.split('/')
  const literal = segments.filter((segment) => !segment.includes('*'))
  const name = `${literal[literal.length - 1] ?? first}${literal.length < segments.length ? '/' : ''}`
  return globs.length > 1 ? `${name} and ${globs.length - 1} more` : name
}

const scopedTokenOwnersRule = (primary, secondary) => (root, result) => {
  if (!utils.validateOptions(result, scopedTokenOwners, { actual: primary, possible: [true] })) {
    return
  }

  const owners = secondary?.owners ?? DEFAULT_TOKEN_OWNERS
  const file = root.source?.input?.from ?? ''

  const check = (node, text, index) => {
    for (const [namespace, globs] of Object.entries(owners)) {
      const at = text.indexOf(namespace)
      if (at === -1) continue
      if (matchesAny(file, globs)) continue
      utils.report({
        result,
        ruleName: scopedTokenOwners,
        node,
        index: index + at,
        endIndex: index + at + namespace.length,
        message: scopedTokenOwnersMessages.rejected(namespace, ownerOf(globs)),
      })
    }
  }

  root.walkDecls((decl) => {
    check(decl, decl.prop, 0)
    check(decl, decl.value, valueIndex(decl))
  })
}

scopedTokenOwnersRule.ruleName = scopedTokenOwners
scopedTokenOwnersRule.messages = scopedTokenOwnersMessages

/* -------------------------------------------------------------------------- */
/* Stage 2 — motion belongs to the vocabulary                                  */
/* -------------------------------------------------------------------------- */

const noMotionOutsideVocabulary = 'polymorph/no-motion-outside-vocabulary'

/**
 * Where a one-off motion goes. A zone lifts nothing for a Stylelint rule,
 * because a stylesheet is not inside any element: the motion moves out of the
 * stylesheet into a `style` prop inside a zone in the TSX. A `@keyframes` has
 * no `style` form, so it moves to the TSX as a whole.
 */
const ZONE_IN_TSX = {
  declaration: 'move it to `style` inside a `<Bespoke reason="…">` zone in the TSX',
  keyframes: 'animate it in the TSX inside a `<Bespoke reason="…">` zone',
}

const noMotionMessages = utils.ruleMessages(noMotionOutsideVocabulary, {
  rejected: (what, member) => {
    const zone = what === '@keyframes' ? ZONE_IN_TSX.keyframes : ZONE_IN_TSX.declaration
    if (member === null) {
      return fit(`Unexpected ${what} outside the vocabulary.`, [
        `Compose the member that moves (rung 1), or ${zone} (rung 4).`,
        "Motion binds to a member's states (docs/motion.md).",
      ])
    }
    const bindings = member.bindings.map((binding) => `\`${binding}\``)
    return fit(`Unexpected ${what} on the ${member.slug} member${member.state}.`, [
      bindings.length > 0
        ? `\`<${member.name}>\` already animates it (${bindings.slice(0, 2).join(', ')}), so drop this (rung 1).`
        : `Its motion is \`<${member.name}>\`'s own, so drop this (rung 1).`,
      `For a one-off, ${zone} (rung 4).`,
    ])
  },
})

/**
 * Member names that do not read back from their slug by capitalising each word.
 * `fix-api.test.ts` checks every member's name against this.
 */
export const SLUG_NAMES = { 'otp-input': 'OTPInput', 'qr-code': 'QRCode' }

/**
 * The member a selector names through `[data-member="…"]`, with the motion
 * bindings it already has and the state the selector picks, or `null`.
 *
 * @param {string} selector
 */
function memberIn(selector) {
  const slug = /\[\s*data-member\s*=\s*['"]?([a-z0-9-]+)/i.exec(selector)?.[1]?.toLowerCase()
  if (!slug) return null
  const name =
    SLUG_NAMES[slug] ?? slug.replace(/(^|-)([a-z0-9])/g, (_, __, letter) => letter.toUpperCase())
  const prefix = `${slug.replace(/-/g, '')}.`
  const bindings = Object.keys(motion.bindings).filter((binding) => binding.startsWith(prefix))
  const pseudo = /:(hover|focus-visible|focus-within|focus|active|checked|disabled)\b/.exec(
    selector,
  )?.[1]
  const stated = /\[\s*data-state\s*=\s*['"]?([a-z-]+)/i.exec(selector)?.[1]
  const state = stated ? `'s ${stated} state` : pseudo ? `'s ${pseudo} state` : ''
  return { slug, name, bindings, state }
}

/** The member named by the selector of the rule a declaration sits in, if any. */
function memberOf(node) {
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (parent.type === 'rule') {
      const found = parent.selectors.map(memberIn).find(Boolean)
      if (found) return found
    }
  }
  return null
}

const noMotionRule = (primary) => (root, result) => {
  if (
    !utils.validateOptions(result, noMotionOutsideVocabulary, { actual: primary, possible: [true] })
  ) {
    return
  }

  root.walkDecls((decl) => {
    if (!/^(transition|animation)(-|$)/i.test(decl.prop)) return
    utils.report({
      result,
      ruleName: noMotionOutsideVocabulary,
      node: decl,
      message: noMotionMessages.rejected(`"${decl.prop}"`, memberOf(decl)),
    })
  })

  root.walkAtRules(/^(-\w+-)?keyframes$/i, (atRule) => {
    utils.report({
      result,
      ruleName: noMotionOutsideVocabulary,
      node: atRule,
      message: noMotionMessages.rejected('@keyframes', null),
    })
  })
}

noMotionRule.ruleName = noMotionOutsideVocabulary
noMotionRule.messages = noMotionMessages

/* -------------------------------------------------------------------------- */
/* Stage 2 — recipes are theme-neutral                                         */
/* -------------------------------------------------------------------------- */

const noThemeSelectors = 'polymorph/no-theme-selectors'

/** A selector as a message quotes it: whole when short, its start when long. */
const quoted = (selector) => (selector.length > 40 ? `${selector.slice(0, 39)}…` : selector)

const noThemeMessages = utils.ruleMessages(noThemeSelectors, {
  rejected: (selector) =>
    fit(
      `Unexpected "${quoted(selector)}" in vocabulary CSS: a recipe never knows its system or palette.`,
      [
        'Make it a token value, or branch on an axis token such as `--pm-axis-depth`.',
        'For example: `@container style(--pm-axis-depth: flat)`.',
      ],
    ),
})

/**
 * `[data-system]`, `[data-palette]` or `[data-theme]` in any form, in a selector.
 *
 * All three are banned. A pairing is two attributes, and a ban on only one name
 * could be bypassed by renaming. `[data-theme]` is a retired attribute and stays
 * on the list so that reintroducing it is still illegal, because nothing else
 * in the tree would catch it.
 *
 * It catches the bare attribute as well as `[data-system="terminal"]`. A recipe
 * has no lawful reason to know a pairing exists, and `[data-system] .x` is how
 * a "scope it to themed pages" edit starts before it becomes a theme check.
 */
const THEME_SELECTOR = /\[\s*data-(system|palette|theme)(\s*[$^*|~]?=|\s*\])/i

const noThemeSelectorsRule = (primary) => (root, result) => {
  if (!utils.validateOptions(result, noThemeSelectors, { actual: primary, possible: [true] }))
    return

  root.walkRules((rule) => {
    // `selectors`, not `selector`, so a comma-separated list reports the
    // offending selector instead of the whole line.
    for (const selector of rule.selectors) {
      if (!THEME_SELECTOR.test(selector)) continue
      utils.report({
        result,
        ruleName: noThemeSelectors,
        node: rule,
        word: selector,
        message: noThemeMessages.rejected(selector),
      })
    }
  })
}

noThemeSelectorsRule.ruleName = noThemeSelectors
noThemeSelectorsRule.messages = noThemeMessages

/* -------------------------------------------------------------------------- */
/* A recipe never selects on the identity attribute                           */
/* -------------------------------------------------------------------------- */

const noMemberSelectors = 'polymorph/no-member-selectors'

const noMemberMessages = utils.ruleMessages(noMemberSelectors, {
  rejected: (selector) =>
    fit(
      `Unexpected "${quoted(selector)}" in vocabulary CSS: a component branching on its own name.`,
      [
        'Read the class token; a per-member exception goes in the system file (overrides.exceptions).',
      ],
    ),
})

/**
 * `[data-member]` in any form, with a value or bare. The theme emitter's
 * exception blocks use this attribute to target one member. Every component
 * root writes it, and nothing in the vocabulary reads it. A recipe that selects
 * on it bypasses the class-token layer, and this rule reports the first attempt.
 */
const MEMBER_SELECTOR = /\[\s*data-member(\s*[$^*|~]?=|\s*\])/i

const noMemberSelectorsRule = (primary) => (root, result) => {
  if (!utils.validateOptions(result, noMemberSelectors, { actual: primary, possible: [true] }))
    return

  root.walkRules((rule) => {
    for (const selector of rule.selectors) {
      if (!MEMBER_SELECTOR.test(selector)) continue
      utils.report({
        result,
        ruleName: noMemberSelectors,
        node: rule,
        word: selector,
        message: noMemberMessages.rejected(selector),
      })
    }
  })
}

noMemberSelectorsRule.ruleName = noMemberSelectors
noMemberSelectorsRule.messages = noMemberMessages

/* -------------------------------------------------------------------------- */
/* Every token a stylesheet reads must exist (the check consumers get)         */
/* -------------------------------------------------------------------------- */

const noGhostTokens = 'polymorph/no-ghost-tokens'

const noGhostMessages = utils.ruleMessages(noGhostTokens, {
  rejected: (how, name, near) => {
    const head =
      `Unexpected ${how}(${name}): nothing emits or declares it, so the browser is dropping ` +
      `the whole declaration.`
    // As many near names as fit, nearest first.
    let names = near.map((candidate) => `\`${candidate}\``)
    while (names.length > 0 && `${head} Did you mean ${names.join(', ')}?`.length >= 200) {
      names = names.slice(0, -1)
    }
    return names.length === 0 ? head : `${head} Did you mean ${names.join(', ')}?`
  },
  noUniverse:
    `polymorph/no-ghost-tokens was switched on without a token list, so it cannot tell a real ` +
    `property from a ghost: pass [true, { tokens: [...] }] with the properties your theme emits.`,
})

/**
 * Where an at-rule's params start, so an offset inside them points at the right
 * column: `@` + the name + the whitespace after it. It uses `raws.afterName`,
 * because `@container  style(…)` is lawful and assuming a single space would
 * underline one character to the left of the error.
 */
function paramIndex(atRule) {
  return 1 + atRule.name.length + (atRule.raws.afterName ?? '').length
}

/**
 * A recipe may only read a token that exists.
 *
 * Example: `var(--pm-accent-border)` in a layered background. No such token
 * exists (the accent family has fills, and the border family is
 * `--pm-border-*`), and CSS discards the whole declaration when a custom
 * property cannot resolve. Every layer of that background disappears, on every
 * theme, with no error anywhere.
 *
 * **What it knows and what it cannot.** Part of "what exists" is the emitted
 * token set, which only the theme engine knows. It arrives as the `tokens`
 * option, taken from the sheet the engine writes, not from a hand-kept list.
 * The other part is the pattern-scoped tokens a stylesheet declares for itself
 * (`--pm-page-*` in an archetype, `--pm-shell-*` in another). A rule that sees
 * one file at a time can only collect the ones this file declares. A property
 * declared in one stylesheet and read in another (it inherits, so it resolves
 * at runtime) is therefore a false positive. The correct response is a
 * `stylelint-disable-next-line` on that line.
 *
 * `one-opener` splits its law the same way, for the same reason.
 * `token-references.test.ts` checks the whole corpus and is the stronger check,
 * but it cannot ship, because it tests this repository's trees. This rule ships
 * to consumers and runs in their Bespoke zones, which is where they lawfully
 * write CSS that reads tokens and where no law from this repository runs.
 *
 * In this repository the two agree exactly. Every `--pm-*` the vocabulary
 * declares for itself is read only in the stylesheet that declares it, so the
 * per-file collection loses nothing. If that stops being true, this rule fails
 * in the repository's own `lint:css` instead of silently disagreeing with the
 * repository law.
 *
 * **It suggests but does not fix.** The message includes the nearest real name,
 * but nothing rewrites to it. A wrong token name is rarely a typo. It is usually
 * a guessed name, such as `--pm-accent-fg` for the token that is actually
 * `--pm-accent-contrast`, and its nearest neighbour is then a different token
 * one letter away. A ghost drops a declaration and is reported. Text repainted
 * in its own background colour would be neither dropped nor reported.
 */
const noGhostTokensRule = (primary, secondary) => (root, result) => {
  if (
    !utils.validateOptions(
      result,
      noGhostTokens,
      { actual: primary, possible: [true] },
      { actual: secondary, possible: { tokens: [(value) => typeof value === 'string'] } },
    )
  ) {
    return
  }

  const emitted = secondary?.tokens ?? []
  if (emitted.length === 0) {
    // Report an error instead of passing silently. Without a token list the rule
    // would call every reference a ghost or, with the opposite default, call
    // every ghost lawful. Nobody would notice the second failure.
    utils.report({
      result,
      ruleName: noGhostTokens,
      node: root,
      message: noGhostMessages.noUniverse,
    })
    return
  }

  const known = new Set(emitted)
  root.walkDecls((decl) => {
    if (decl.prop.startsWith(PM_PREFIX)) known.add(decl.prop)
  })

  const complain = (node, read, offset) => {
    if (known.has(read.name)) return
    const index = offset + read.index
    utils.report({
      result,
      ruleName: noGhostTokens,
      node,
      index,
      endIndex: index + read.name.length,
      message: noGhostMessages.rejected(read.how, read.name, nearest(read.name, known)),
    })
  }

  // One walk over everything instead of a pass per node kind, so warnings come
  // out in file order. A list that jumps back up the file is harder to work
  // through.
  root.walk((node) => {
    if (node.type === 'decl') {
      const offset = valueIndex(node)
      for (const read of readsIn(node.value)) complain(node, read, offset)
      return
    }
    // `@container style(--pm-axis-depth: flat)` is the lawful way to branch on an
    // axis instead of a theme, and a misspelling there costs the most. The query
    // matches nothing, the branch never runs, and the recipe behaves as if it
    // were not there.
    if (node.type === 'atrule') {
      const offset = paramIndex(node)
      for (const read of readsIn(node.params)) complain(node, read, offset)
    }
  })
}

noGhostTokensRule.ruleName = noGhostTokens
noGhostTokensRule.messages = noGhostMessages

/* -------------------------------------------------------------------------- */
/* Application CSS does not re-make the theme's decisions                      */
/* -------------------------------------------------------------------------- */

/*
 * The four rules below govern application stylesheets. A stylesheet can undo
 * every decision the theme made without writing one raw value: it re-declares
 * a token, scopes a rule to one pairing, restyles a member through its
 * identity attribute, or rescales every rem at the root. `token-values-only`
 * does not see the first, because a custom property is not a governed
 * property, and the vocabulary's selector rules do not run on application CSS.
 * Each report names the theme document that owns the decision and the rung
 * that answers a local need.
 */

const noTokenDeclarations = 'polymorph/no-token-declarations'

/** Spacing tokens, which follow the density axis. */
const DENSITY_TOKEN = /^--pm-(?:space|control-height|inset)-/

/** Colour roles, which the palette sets: a text role is `--pm-text-<role>` with no step. */
const COLOUR_TOKEN =
  /^--pm-(?:(?:accent|bg|border|danger|success|warning|info|selection|chart)(?:-|$)|text-[a-z]+$)/

const RADIUS_TOKEN = /^--pm-radius-/

const noTokenMessages = utils.ruleMessages(noTokenDeclarations, {
  rejected: (name) => {
    const head = `Unexpected declaration of "${name}" in application CSS:`
    if (DENSITY_TOKEN.test(name)) {
      return fit(`${head} spacing is the density's.`, [
        'Use `<DensityScope value="compact">` on a subtree (rung 2) or `<Stack patch={…}>` on one (rung 3).',
      ])
    }
    if (COLOUR_TOKEN.test(name)) {
      return fit(`${head} a colour is the palette's (docs/theming.md).`, [
        'Pick a member\'s `tone="…"` (rung 1) or `<ToneScope value="inverse">` (rung 2).',
      ])
    }
    if (RADIUS_TOKEN.test(name)) {
      return fit(`${head} a radius is the system's (docs/theming.md).`, [
        'One card takes `<Card patch={…}>` (rung 3).',
      ])
    }
    return fit(`${head} its value is the system's (docs/theming.md).`, [
      'Pick the member\'s `variant="…"` or `size="…"` (rung 1).',
    ])
  },
})

/**
 * A `--pm-*` custom property declared in application CSS.
 *
 * The theme emits every `--pm-*` property, and the cascade lets any later
 * declaration win. A product that re-declares `--pm-accent-bg` per palette and
 * mode has a second palette that no contrast law checks. Reading a token is
 * lawful; declaring one is not. A property of the application's own, with any
 * other prefix, is not this rule's concern.
 */
const noTokenDeclarationsRule = (primary) => (root, result) => {
  if (!utils.validateOptions(result, noTokenDeclarations, { actual: primary, possible: [true] }))
    return

  root.walkDecls((decl) => {
    if (!decl.prop.startsWith(PM_PREFIX)) return
    utils.report({
      result,
      ruleName: noTokenDeclarations,
      node: decl,
      word: decl.prop,
      message: noTokenMessages.rejected(decl.prop),
    })
  })
}

noTokenDeclarationsRule.ruleName = noTokenDeclarations
noTokenDeclarationsRule.messages = noTokenMessages

const noAppThemeSelectors = 'polymorph/no-app-theme-selectors'

/**
 * The attributes the theme runtime and the scopes write: the pairing, the
 * mode, the density, the tone and the motion temperament. `DATA_ATTRS` in
 * `packages/theme/src/css-vars.ts` names them, and `application.test.ts`
 * lints a selector on each of those.
 */
const THEME_ATTRIBUTES = [
  'data-system',
  'data-palette',
  'data-mode',
  'data-density',
  'data-tone',
  'data-motion',
]

const THEME_ATTRIBUTE = new RegExp(
  `\\[\\s*(${THEME_ATTRIBUTES.join('|')})(\\s*[$^*|~]?=|\\s*\\])`,
  'gi',
)

/**
 * What answers a branch on the mode, the tone or the density, which every
 * token already follows. A branch on the system, the palette or the motion
 * temperament is answered by the theme document, and that answer wins when a
 * selector names both kinds.
 */
const BRANCH_ANSWERS = {
  'data-mode':
    'Tokens already follow the mode: read one, or use `<ToneScope value="inverse">` (rung 2).',
  'data-tone':
    'Tokens already follow the tone: read one, or use `<ToneScope value="inverse">` (rung 2).',
  'data-density':
    'Tokens already follow density: read one, or use `<DensityScope value="compact">` (rung 2).',
}

const noAppThemeMessages = utils.ruleMessages(noAppThemeSelectors, {
  rejected: (selector, attribute) =>
    fit(`Unexpected "${quoted(selector)}" in application CSS: a branch on the theme.`, [
      BRANCH_ANSWERS[attribute] ??
        'Put a value one theme needs in that theme (docs/theming.md), or pick a `variant="…"` (rung 1).',
    ]),
})

/**
 * A selector on an attribute the theme runtime writes, in application CSS.
 *
 * The vocabulary's `no-theme-selectors` keeps a recipe from knowing its
 * pairing. This is the same law for the application, over every attribute the
 * runtime writes, because a rule scoped to `[data-palette="petrol"]` or
 * `[data-mode="dark"]` is a theme decision made outside the theme, where the
 * admission laws never see it.
 */
const noAppThemeSelectorsRule = (primary) => (root, result) => {
  if (!utils.validateOptions(result, noAppThemeSelectors, { actual: primary, possible: [true] }))
    return

  root.walkRules((rule) => {
    for (const selector of rule.selectors) {
      const named = [...selector.matchAll(THEME_ATTRIBUTE)].map((match) => match[1].toLowerCase())
      if (named.length === 0) continue
      const attribute = named.find((name) => !(name in BRANCH_ANSWERS)) ?? named[0]
      utils.report({
        result,
        ruleName: noAppThemeSelectors,
        node: rule,
        word: selector,
        message: noAppThemeMessages.rejected(selector, attribute),
      })
    }
  })
}

noAppThemeSelectorsRule.ruleName = noAppThemeSelectors
noAppThemeSelectorsRule.messages = noAppThemeMessages

const noAppMemberSelectors = 'polymorph/no-app-member-selectors'

const noAppMemberMessages = utils.ruleMessages(noAppMemberSelectors, {
  rejected: (selector, member) =>
    fit(`Unexpected "${quoted(selector)}" in application CSS: it restyles a member.`, [
      `Use ${member === null ? 'the member\'s `variant="…"`' : `\`<${member.name}>\`'s props`} (rung 1), ` +
        "the system file's exceptions, or a new variant (rung 5).",
    ]),
})

/**
 * A selector on the identity attribute, in application CSS.
 *
 * Every member root writes `data-member`. A stylesheet that selects it changes
 * a member's appearance in one product without changing the member, and the
 * next release of the member silently undoes it or collides with it. The
 * lawful forms are the member's own props, a per-member exception in the
 * system file, or a new variant.
 */
const noAppMemberSelectorsRule = (primary) => (root, result) => {
  if (!utils.validateOptions(result, noAppMemberSelectors, { actual: primary, possible: [true] }))
    return

  root.walkRules((rule) => {
    for (const selector of rule.selectors) {
      if (!MEMBER_SELECTOR.test(selector)) continue
      utils.report({
        result,
        ruleName: noAppMemberSelectors,
        node: rule,
        word: selector,
        message: noAppMemberMessages.rejected(selector, memberIn(selector)),
      })
    }
  })
}

noAppMemberSelectorsRule.ruleName = noAppMemberSelectors
noAppMemberSelectorsRule.messages = noAppMemberMessages

const noRootFontSize = 'polymorph/no-root-font-size'

const noRootFontSizeMessages = utils.ruleMessages(noRootFontSize, {
  rejected: (property) =>
    fit(`Unexpected "${property}" on the root in application CSS: it rescales every rem token.`, [
      'Type size is the system\'s (docs/theming.md); density is `<DensityScope value="compact">` (rung 2).',
    ]),
})

/** CSS-wide keywords, which set no size of their own. */
const WIDE_KEYWORD = /^(inherit|initial|unset|revert|revert-layer)$/i

/**
 * Sizes that equal the initial root size, so they rescale nothing. A reset
 * that sets one on `html, body, div` is not a decision about type size.
 */
const INITIAL_SIZE = /^(100%|1rem|16px|medium)$/i

/** A font size in a `font` shorthand: a length, a percentage, a size keyword or a function. */
const SIZE_TOKEN =
  /^([\d.]+[a-z%]+|(xx?-|xxx-)?(small|large)|medium|smaller|larger|(calc|min|max|clamp|var)\(.*)$/i

/**
 * Splits `text` at each `separator` character outside parentheses, so a
 * comma or a combinator inside `:is(…)` stays with its argument.
 */
function splitTopLevel(text, separator) {
  const parts = []
  let depth = 0
  let current = ''
  for (const character of text) {
    if (character === '(') depth += 1
    if (character === ')') depth -= 1
    if (depth === 0 && separator.test(character)) {
      parts.push(current)
      current = ''
      continue
    }
    current += character
  }
  parts.push(current)
  return parts.map((part) => part.trim()).filter((part) => part !== '')
}

/**
 * Whether a selector's subject is the root element: `html` or `:root`,
 * compounded or not (`html[data-x]`, `:root:has(dialog)`), or inside `:is()`
 * or `:where()` in the subject (`:where(html)`). A descendant of the root
 * (`html body`) is not, and neither is a negation (`:not(html)`).
 */
function selectsRoot(selector) {
  const flat = selector.replace(/\[[^\]]*\]/g, '[]')
  const subject = splitTopLevel(flat, /[\s>+~]/).pop() ?? ''
  // The subject with every argument blanked, so `:not(html)` and `:has(:root)` do not count.
  const own = subject.replace(/\((?:[^()]|\([^()]*\))*\)/g, '()')
  if (/^html(?![\w-])/i.test(own) || /:root(?![\w-])/i.test(own)) return true
  for (const match of subject.matchAll(/:(?:is|where)\(/gi)) {
    let depth = 1
    let end = match.index + match[0].length
    while (end < subject.length && depth > 0) {
      if (subject[end] === '(') depth += 1
      if (subject[end] === ')') depth -= 1
      end += 1
    }
    const argument = subject.slice(match.index + match[0].length, end - 1)
    if (splitTopLevel(argument, /,/).some(selectsRoot)) return true
  }
  return false
}

/**
 * The size a `font-size` or `font` value sets, or `null` for a value that
 * sets none: a CSS-wide keyword, or a shorthand that is one keyword
 * (`font: menu`). A shorthand's size is its first size token, before an
 * optional `/line-height`.
 */
function sizeSet(property, value) {
  if (WIDE_KEYWORD.test(value)) return null
  if (property === 'font-size') return value
  if (/^[a-z-]+$/i.test(value)) return null
  const size = splitTopLevel(value, /\s/)
    .map((token) => splitTopLevel(token, /\//)[0] ?? '')
    .find((token) => SIZE_TOKEN.test(token))
  return size ?? value
}

/**
 * A font size set on the root element, in application CSS.
 *
 * Every `rem` in the theme is relative to the root's font size: the type
 * scale, the space steps, the control heights. A root at `81.25%` shrinks all
 * of them at once, including the 16px floor that keeps a text field from
 * zooming on iOS, and no law sees it. Density and the type scale are the
 * system's decisions. The `font` shorthand sets the size too, so it is read
 * the same way unless its value is a single keyword. A size equal to the
 * initial one (`100%`, `1rem`, `16px`, `medium`) rescales nothing and is left.
 */
const noRootFontSizeRule = (primary) => (root, result) => {
  if (!utils.validateOptions(result, noRootFontSize, { actual: primary, possible: [true] })) return

  root.walkDecls((decl) => {
    const property = decl.prop.toLowerCase()
    if (property !== 'font-size' && property !== 'font') return
    const size = sizeSet(property, decl.value.trim())
    if (size === null || INITIAL_SIZE.test(size)) return
    const rule = decl.parent
    if (rule?.type !== 'rule') return
    if (!rule.selectors.some(selectsRoot)) return
    utils.report({
      result,
      ruleName: noRootFontSize,
      node: decl,
      word: decl.prop,
      message: noRootFontSizeMessages.rejected(decl.prop),
    })
  })
}

noRootFontSizeRule.ruleName = noRootFontSize
noRootFontSizeRule.messages = noRootFontSizeMessages

/* -------------------------------------------------------------------------- */

export const RULE_NAMES = {
  tokenValuesOnly,
  scopedTokenOwners,
  noMotionOutsideVocabulary,
  noThemeSelectors,
  noMemberSelectors,
  noGhostTokens,
  noTokenDeclarations,
  noAppThemeSelectors,
  noAppMemberSelectors,
  noRootFontSize,
}

/**
 * The CSS rules for application stylesheets, each switched on. A config
 * spreads it into the block for its application CSS and adds
 * `no-ghost-tokens`, which needs the token list. `verify` and this
 * repository's `stylelint.config.js` apply it, and the fragment
 * `polymorph add` writes names the same rules.
 *
 * @type {Record<string, true>}
 */
export const applicationRules = {
  [noMotionOutsideVocabulary]: true,
  [noTokenDeclarations]: true,
  [noAppThemeSelectors]: true,
  [noAppMemberSelectors]: true,
  [noRootFontSize]: true,
}

export default [
  createPlugin(tokenValuesOnly, tokenValuesOnlyRule),
  createPlugin(scopedTokenOwners, scopedTokenOwnersRule),
  createPlugin(noMotionOutsideVocabulary, noMotionRule),
  createPlugin(noThemeSelectors, noThemeSelectorsRule),
  createPlugin(noMemberSelectors, noMemberSelectorsRule),
  createPlugin(noGhostTokens, noGhostTokensRule),
  createPlugin(noTokenDeclarations, noTokenDeclarationsRule),
  createPlugin(noAppThemeSelectors, noAppThemeSelectorsRule),
  createPlugin(noAppMemberSelectors, noAppMemberSelectorsRule),
  createPlugin(noRootFontSize, noRootFontSizeRule),
]
