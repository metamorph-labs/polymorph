import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { RULE_CLIMB, rules, stageOneRules, stageTwoRules, vendorableRules } from '@polymorph/rules'
import { RUNG_MARKERS } from '@polymorph/rules/inventory'
import { RULE_NAMES as CSS_RULE_NAMES } from '@polymorph/rules/stylelint'

/**
 * The two things a consumer needs that are not components: how far they may
 * deviate, and what will stop them.
 *
 * The ladder is read from `docs/rules.md`, where it is written down. The laws are
 * read from the ESLint plugin, where they are enforced. Neither is copied here.
 * A registry that restated the ladder would be a second copy of it, and this
 * document is generated so that no copy exists to drift.
 */

export interface LadderRung {
  rung: number
  name: string
  summary: string
  declaredAs: string | null
}

export interface RegistryLaw {
  name: string
  /** Which half of the system it governs. The two halves have different authors. */
  applies: 'application' | 'vocabulary'
  /** `code` rules run under ESLint, `css` under Stylelint. */
  language: 'code' | 'css'
  /**
   * For an application rule, what it needs before it can apply. Stage 1 rules
   * apply from the first line of application code. Stage 2 rules need the
   * vocabulary and the exception ladder in place (forbidding `<button>` only
   * makes sense once `<Button>` exists). `null` for a rule with no stage: the
   * vocabulary rules, and the CSS rules, which apply wherever their stylesheets
   * are.
   */
  stage: number | null
  /**
   * Which rungs of the exception ladder answer a violation of this rule, highest
   * first. An empty list is deliberate, not a gap. The ladder governs
   * application code, so a rule that governs the vocabulary has no rung.
   */
  climb: number[]
  summary: string
}

const LADDER_DOC = 'docs/rules.md'
const LADDER_HEADING = /^###\s.*exception ladder/i
const RUNG = /^(\d+)\.\s+\*\*(.+?)\*\*\s+—\s+(.*)$/

/**
 * The five rungs, in order, from the ladder's own numbered list.
 *
 * It throws instead of returning a partial result. A parser that reported only
 * three rungs would publish a ladder with two options missing. An agent reading
 * it would then climb to `Bespoke` for something rung 2 covers, which is the
 * failure the ladder exists to prevent.
 */
export function readLadder(root: string): LadderRung[] {
  const lines = readFileSync(resolve(root, LADDER_DOC), 'utf8').split('\n')
  const start = lines.findIndex((line) => LADDER_HEADING.test(line))
  if (start === -1) throw new Error(`registry: ${LADDER_DOC} has no exception-ladder section`)

  const rungs: LadderRung[] = []
  for (const line of lines.slice(start + 1)) {
    // The rungs sit directly under their heading. The next heading ends them.
    if (/^#{1,6}\s/.test(line)) break
    const match = RUNG.exec(line.trim())
    if (!match) continue

    const rung = Number(match[1])
    rungs.push({
      rung,
      name: (match[2] as string).trim(),
      // One sentence. The doc explains each rung at length, and a catalogue
      // entry that copied the explanation would only duplicate the doc.
      summary: ((match[3] as string).split(/\.\s/)[0] as string).replace(/\.$/, '').trim(),
      declaredAs: RUNG_MARKERS[rung] ?? null,
    })
  }

  if (rungs.length !== 5) {
    throw new Error(
      `registry: expected the ladder's five rungs in ${LADDER_DOC}, parsed ${rungs.length}`,
    )
  }
  return rungs
}

/**
 * The CSS half, which has no `meta.docs` to read a description from.
 *
 * Stylelint rules are functions with a `ruleName` and a message factory, so the
 * one-line summary lives here. It is the only hand-copied text in this file,
 * and the plugin's shape forces it. What each rule *says* at a violation is
 * still read from the rule itself. This is only the catalogue entry, and
 * `repo-laws.test.ts` checks the names against the real plugin.
 */
const CSS_LAWS: Record<string, { applies: RegistryLaw['applies']; summary: string }> = {
  [CSS_RULE_NAMES.tokenValuesOnly]: {
    applies: 'vocabulary',
    summary: 'Vocabulary CSS expresses a design value only through a `--pm-*` token.',
  },
  [CSS_RULE_NAMES.scopedTokenOwners]: {
    applies: 'vocabulary',
    summary: 'Pattern-scoped tokens are declared and referenced only by their owning pattern.',
  },
  [CSS_RULE_NAMES.noMotionOutsideVocabulary]: {
    applies: 'application',
    summary: 'Motion binds to component state and is never declared by application CSS.',
  },
  [CSS_RULE_NAMES.noThemeSelectors]: {
    applies: 'vocabulary',
    summary: 'A recipe may never know which house system it is in.',
  },
  [CSS_RULE_NAMES.noMemberSelectors]: {
    applies: 'vocabulary',
    summary:
      'A recipe never selects on a member name; per-member exceptions live in the system file.',
  },
  [CSS_RULE_NAMES.noGhostTokens]: {
    // Applies to every stylesheet that reads a token, vocabulary or application.
    // The token must exist. This is the half of the vocabulary-integrity law that
    // ships to consumers.
    applies: 'vocabulary',
    summary: 'Every `--pm-*` a stylesheet reads names a property that exists.',
  },
  [CSS_RULE_NAMES.noTokenDeclarations]: {
    applies: 'application',
    summary: 'Application CSS reads `--pm-*` tokens and never declares one.',
  },
  [CSS_RULE_NAMES.noAppThemeSelectors]: {
    applies: 'application',
    summary: "Application CSS never branches on the theme's attributes.",
  },
  [CSS_RULE_NAMES.noAppMemberSelectors]: {
    applies: 'application',
    summary: 'Application CSS never restyles a member through `data-member`.',
  },
  [CSS_RULE_NAMES.noRootFontSize]: {
    applies: 'application',
    summary: 'Application CSS never sets the root font size.',
  },
}

/**
 * Every rung a rule can send someone to, checked against the ladder it names.
 *
 * A table that points at a missing rung is worse than no table. An agent told
 * to "climb to rung 6" gets an instruction the system cannot follow, and the
 * instruction looks authoritative.
 */
function climbFor(rule: string, ladder: LadderRung[]): number[] {
  const climb = RULE_CLIMB[rule]
  if (climb === undefined) {
    throw new Error(
      `registry: ${rule} declares no rung to climb — see packages/rules/src/ladder.ts`,
    )
  }

  const rungs = new Set(ladder.map((entry) => entry.rung))
  const unknown = climb.filter((rung) => !rungs.has(rung))
  if (unknown.length > 0) {
    throw new Error(
      `registry: ${rule} points at rung ${unknown.join(', ')}, which the ladder does not have`,
    )
  }
  return climb
}

/**
 * The red rules, with what each one governs and which rungs it points to.
 *
 * They are read from the rule records, not from a list here, because the config
 * decides which rules it applies. A rule that is in the plugin but in no record
 * would arrive here with no data. This function refuses to publish it, so the
 * registry reports dead config in the plugin.
 */
export function readLaws(ladder: LadderRung[]): RegistryLaw[] {
  const applied = new Map<string, { applies: RegistryLaw['applies']; stage: number | null }>()
  for (const name of Object.keys(stageOneRules))
    applied.set(name, { applies: 'application', stage: 1 })
  for (const name of Object.keys(stageTwoRules))
    applied.set(name, { applies: 'application', stage: 2 })
  for (const name of Object.keys(vendorableRules)) {
    applied.set(name, { applies: 'vocabulary', stage: null })
  }

  const code: RegistryLaw[] = Object.entries(rules).map(([name, rule]) => {
    const where = applied.get(`polymorph/${name}`)
    if (!where) {
      throw new Error(
        `registry: polymorph/${name} is in the plugin and in no config — nothing applies it`,
      )
    }
    return {
      name: `polymorph/${name}`,
      ...where,
      language: 'code',
      climb: climbFor(`polymorph/${name}`, ladder),
      summary: rule.meta?.docs?.description ?? '',
    }
  })

  /*
   * The CSS half is included because its absence only shows once a front uses
   * it: `validate` on a stylesheet would report rules the catalogue does not
   * list. A registry that describes only half the laws is not reliable for any
   * of them.
   */
  const css: RegistryLaw[] = Object.entries(CSS_LAWS).map(([name, law]) => ({
    name,
    applies: law.applies,
    language: 'css',
    // Stages order the ESLint application rules by prerequisite. A CSS rule
    // applies wherever its stylesheets are, so it has no stage.
    stage: null,
    climb: climbFor(name, ladder),
    summary: law.summary,
  }))

  return [...code, ...css].sort(
    (a, b) => a.name.localeCompare(b.name) || a.language.localeCompare(b.language),
  )
}
