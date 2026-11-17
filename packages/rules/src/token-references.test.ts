import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  composeTheme,
  emitThemeCSS,
  parsePalette,
  parseSystem,
  PM_PREFIX,
  resolveTheme,
  type Palette,
  type System,
} from '@polymorph/engine'
import valueParser from 'postcss-value-parser'
import { describe, expect, it } from 'vitest'

/**
 * The vocabulary-integrity law: a recipe may only read a token that exists.
 *
 * Example: `var(--pm-accent-border)` in a layered background. No such token
 * exists (the accent family has fills, and the border family is
 * `--pm-border-*`), and CSS discards the **whole declaration** when a custom
 * property cannot resolve. Every layer of that background disappears, on every
 * theme, and no check fails. The name has the right prefix, so
 * `token-values-only` passes, and no other law checks whether the name refers
 * to anything. This law covers that.
 *
 * It is a repo law, not a Stylelint rule, for the same reason
 * `repo-laws.test.ts` exists: the question cannot be answered one file at a
 * time. Part of the answer is the emitted token set, which only the theme
 * engine knows. The other part is the scoped tokens the vocabulary declares for
 * itself (`--pm-page-*` in one archetype, `--pm-shell-*` in another), which only
 * the whole corpus shows. A per-file rule would need both passed in, and a
 * hand-maintained list of existing tokens goes stale and lets the next ghost
 * through.
 *
 * Both ways a stylesheet reads a property are checked: `var()`, and the
 * `style()` query, the lawful way for a recipe to branch on an axis. A
 * misspelled style query fails even more quietly than a misspelled `var()`. The
 * branch never runs, and the recipe behaves as if it were not there.
 */

const ROOT = process.cwd()

/**
 * The vocabulary's stylesheets: the recipes in `packages/recipes`, plus the
 * icon module that ships from `packages/react`. `packages/react-ui` is walked
 * too, so a stylesheet left there is still checked. The directories are walked,
 * not listed, so a new component is checked as soon as its stylesheet exists.
 * They are walked on disk, not through `git ls-files`, so it is also checked
 * before it is committed.
 */
const CORPUS = ['packages/recipes/src', 'packages/react-ui/src', 'packages/react/src']

/* -------------------------------------------------------------------------- */
/* Reading a stylesheet                                                        */
/* -------------------------------------------------------------------------- */

interface Source {
  file: string
  /** Comment-blanked, so an offset still points at the right line. */
  css: string
}

interface Read {
  file: string
  line: number
  name: string
  /** `var` or `style`, the two ways a stylesheet reads a property. */
  how: string
}

function stylesheets(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(resolve(ROOT, dir), { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue
    const path = `${dir}/${entry.name}`
    if (entry.isDirectory()) out.push(...stylesheets(path))
    else if (entry.name.endsWith('.css')) out.push(path)
  }
  return out
}

/**
 * Comments are replaced with spaces, not deleted. Text about a token is not a
 * reference to it (this file's own header would otherwise be a violation), and
 * every offset after a comment must still point at the right line.
 */
function blankComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ' '))
}

/**
 * A declaration, never a read. The prefix alternation makes the distinction. A
 * declaration starts a line or follows a `;`/`{`. Reads with the same `name:`
 * shape, such as `style(--pm-axis-depth: flat)`, are always inside parentheses.
 * Matching those as declarations would let a misspelled style query declare the
 * token it fails to find.
 */
const DECLARATION = /(?:^|[;{])\s*(--pm-[a-zA-Z0-9_-]+)\s*:/gm

function declarationsIn(css: string): string[] {
  return [...css.matchAll(DECLARATION)].map((match) => match[1] as string)
}

function readsIn({ file, css }: Source): Read[] {
  const found: Read[] = []
  const line = (index: number) => css.slice(0, index).split('\n').length

  valueParser(css).walk((node) => {
    if (node.type !== 'function') return
    const how = node.value.toLowerCase()
    if (how !== 'var' && how !== 'style') return

    const [first] = node.nodes
    if (!first || first.type !== 'word') return
    // `--radix-*` is the positioning engine's namespace, measured at runtime and
    // declared by nothing here. `token-values-only` decides which other
    // namespaces a value may use.
    if (!first.value.startsWith(PM_PREFIX)) return

    found.push({ file, line: line(node.sourceIndex), name: first.value, how })
    // Keep walking. A fallback can contain another read, and a rename leaves a
    // ghost there more often than in the first argument.
  })

  return found
}

/* -------------------------------------------------------------------------- */
/* What exists                                                                 */
/* -------------------------------------------------------------------------- */

const DESIGN = (dir: string) => resolve(ROOT, 'design', dir)

function load<T>(dir: string, parse: (raw: unknown) => T): T[] {
  return readdirSync(DESIGN(dir))
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => parse(JSON.parse(readFileSync(resolve(DESIGN(dir), file), 'utf8'))))
}

const systems = load<System>('systems', parseSystem)
const palettes = new Map(load<Palette>('palettes', parsePalette).map((p) => [p.name, p]))

/**
 * A pairing's emitted property names, read from what the emitter writes, not
 * from the role constants it writes from. Those lists differ, because density,
 * mode, temperament and tone scopes each re-declare a subset. A recipe can
 * resolve only what is on the page.
 */
function emittedBy(system: System): Set<string> {
  const palette = palettes.get(system.defaultPalette)
  if (!palette) throw new Error(`no palette called "${system.defaultPalette}" for ${system.name}`)
  return new Set(declarationsIn(emitThemeCSS(resolveTheme(composeTheme(system, palette)))))
}

const perSystem = systems.map((system) => ({ name: system.name, names: emittedBy(system) }))

/**
 * The **intersection** over every shipped pairing, intentionally. A recipe may
 * not read a property that only some pairings emit, because the recipe cannot
 * choose which theme it is rendered with. The sets are currently identical, and
 * the law below checks that instead of assuming it.
 */
const EMITTED = new Set(
  [...(perSystem[0]?.names ?? [])].filter((name) =>
    perSystem.every(({ names }) => names.has(name)),
  ),
)

/**
 * The other part of what exists: the pattern-scoped tokens the vocabulary
 * declares for itself. No theme emits them, by design, because an archetype's
 * spacing is the archetype's decision. A law that only knew the emitted set
 * would call each of them a ghost.
 */
const SOURCES: Source[] = CORPUS.flatMap(stylesheets).map((file) => ({
  file,
  css: blankComments(readFileSync(resolve(ROOT, file), 'utf8')),
}))

const DECLARED = new Set(SOURCES.flatMap(({ css }) => declarationsIn(css)))
const KNOWN = new Set([...EMITTED, ...DECLARED])

function ghosts(sources: readonly Source[]): Read[] {
  return sources.flatMap(readsIn).filter((read) => !KNOWN.has(read.name))
}

/* -------------------------------------------------------------------------- */
/* Corrections                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Edit distance, intentionally not the substring search `packages/spec` uses for
 * component names. A wrong component name is usually a different industry word,
 * such as `Modal` for `Dialog`, which edit distance cannot connect. A wrong token
 * name is usually a **misspelling**: a transposition, a plural, or a synonym for
 * one segment. Edit distance finds those and substring matching misses them.
 * `--pm-accnet-bg` shares no substring with `--pm-accent-bg`.
 */
function distance(a: string, b: string): number {
  let previous = [...Array(b.length + 1).keys()]

  for (let i = 1; i <= a.length; i++) {
    const row = [i]
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(
        (previous[j] as number) + 1,
        (row[j - 1] as number) + 1,
        (previous[j - 1] as number) + (a[i - 1] === b[j - 1] ? 0 : 1),
      )
    }
    previous = row
  }

  return previous[b.length] as number
}

/**
 * Up to three near names, or none when nothing is close. A validator that
 * guesses is worse than one that says nothing. Suggesting `--pm-space-0` for an
 * unrelated name confidently sends the reader to the wrong place.
 */
function nearest(name: string): string[] {
  const ceiling = Math.max(3, Math.round(name.length / 3))
  return [...KNOWN]
    .map((candidate) => ({ candidate, gap: distance(name, candidate) }))
    .filter(({ gap }) => gap <= ceiling)
    .sort((a, b) => a.gap - b.gap || a.candidate.localeCompare(b.candidate))
    .slice(0, 3)
    .map(({ candidate }) => candidate)
}

/** `packages/recipes/src/x.css:14 — var(--pm-accnet-bg) — did you mean `--pm-accent-bg`?` */
function report(read: Read): string {
  const near = nearest(read.name)
  const suggestion =
    near.length === 0 ? '' : ` — did you mean ${near.map((name) => `\`${name}\``).join(', ')}?`
  return `${read.file}:${read.line} — ${read.how}(${read.name})${suggestion}`
}

/* -------------------------------------------------------------------------- */
/* The laws                                                                    */
/* -------------------------------------------------------------------------- */

describe('the token list is read from the emitter', () => {
  it('finds the catalogue and the properties it emits', () => {
    expect(systems.length, 'no shipped systems — the universe would be empty').toBeGreaterThan(0)
    expect(EMITTED.size).toBeGreaterThan(150)
    // A sample across the four kinds of decision, so a list that lost a whole
    // family still fails even if it is long enough.
    for (const name of [
      '--pm-accent-bg',
      '--pm-border-default',
      '--pm-space-4',
      '--pm-text-sm-size',
      '--pm-motion-duration-control',
      '--pm-axis-depth',
    ]) {
      expect(EMITTED.has(name), name).toBe(true)
    }
  })

  it('emits the same property names for every pairing', () => {
    // This is why the intersection above can be called "the token set". A
    // property one system emits and another does not would be a token a recipe
    // could read on one theme and lose on another: the same failure, caused by a
    // theme switch instead of a typo.
    for (const { name, names } of perSystem) {
      const missing = [...EMITTED].filter((property) => !names.has(property))
      const extra = [...names].filter((property) => !EMITTED.has(property))
      expect({ system: name, missing, extra }).toEqual({ system: name, missing: [], extra: [] })
    }
  })

  it('leaves the pattern-scoped tokens to the vocabulary that declares them', () => {
    // The two parts of `KNOWN` do not overlap: these exist, and no theme emits
    // them.
    for (const name of ['--pm-page-padding-x', '--pm-shell-topbar-height']) {
      expect(EMITTED.has(name), `${name} is emitted?`).toBe(false)
      expect(DECLARED.has(name), `${name} is declared?`).toBe(true)
      expect(KNOWN.has(name), name).toBe(true)
    }
  })
})

describe('every token the vocabulary reads exists', () => {
  it('finds the vocabulary stylesheets, so a pass is meaningful', () => {
    expect(SOURCES.length).toBeGreaterThan(40)
    for (const file of [
      'packages/recipes/src/controls/button.module.css',
      'packages/recipes/src/archetypes/app-shell.module.css',
      'packages/react/src/icon/icon.module.css',
    ]) {
      expect(
        SOURCES.some((source) => source.file === file),
        file,
      ).toBe(true)
    }
    // The walk also parsed them. A corpus with no reads at all would pass every
    // assertion below.
    expect(SOURCES.flatMap(readsIn).length).toBeGreaterThan(500)
  })

  it('names no custom property that nothing declares', () => {
    expect(
      ghosts(SOURCES).map(report),
      'an unresolvable custom property takes its whole declaration with it, silently',
    ).toEqual([])
  })
})

describe('a ghost reference is reported (seeded failure)', () => {
  /**
   * The law tested against a committed file that is intentionally wrong, so it
   * can be tested without breaking the vocabulary. `fixtures.test.ts` and
   * `inventory.test.ts` use the same arrangement. Only the files are substituted.
   * The existing tokens are still the real emitted set and the real corpus's
   * declarations, because a fixture that also supplied the token list would test
   * a different law.
   */
  const FIXTURE = 'packages/rules/fixtures/vocabulary-ghost-token.css'
  const fixture: Source = {
    file: FIXTURE,
    css: blankComments(readFileSync(resolve(ROOT, FIXTURE), 'utf8')),
  }

  const found = ghosts([fixture])

  it('reports every form of ghost, and nothing else', () => {
    expect(found.map((read) => read.name)).toEqual([
      // The `--pm-accent-border` case exactly: no fallback, so the layered
      // background it is in resolves to nothing.
      '--pm-accent-border',
      // A wrong name whose fallback always renders correctly. It is not exempt:
      // the fallback hides the typo without fixing it.
      '--pm-border-defualt',
      // A ghost inside a fallback, which is what a rename often leaves.
      '--pm-shadow-lifted',
      // The axis style query, misspelled: the query matches nothing and the
      // branch never runs.
      '--pm-axis-dpeth',
    ])
  })

  it('counts an emitted token and a locally declared one as existing', () => {
    // The same fixture reads `--pm-space-4` (emitted) and
    // `--pm-shell-topbar-height` (declared by an archetype). Neither is reported
    // above, which is what keeps the law usable.
    const names = readsIn(fixture).map((read) => read.name)
    expect(names).toContain('--pm-space-4')
    expect(names).toContain('--pm-shell-topbar-height')
  })

  it('names the file, the line and the nearest real token', () => {
    const typo = found.find((read) => read.name === '--pm-border-defualt')
    expect(typo).toBeDefined()
    expect(report(typo as Read)).toMatch(
      /^packages\/rules\/fixtures\/vocabulary-ghost-token\.css:\d+ — var\(--pm-border-defualt\) — did you mean `--pm-border-default`/,
    )
  })

  it('points at the line the reference is on', () => {
    const ghost = found.find((read) => read.name === '--pm-accent-border')
    const line = fixture.css.split('\n')[(ghost?.line ?? 0) - 1] ?? ''
    expect(line).toContain('--pm-accent-border')
  })

  it('reports nothing in the lawful fixture', () => {
    const clean = 'packages/rules/fixtures/vocabulary-clean.css'
    expect(
      ghosts([{ file: clean, css: blankComments(readFileSync(resolve(ROOT, clean), 'utf8')) }]),
    ).toEqual([])
  })

  it('reports nothing in the file that breaks every other CSS law', () => {
    // `vocabulary-violations.css` contains raw values, foreign namespaces and
    // theme selectors, but every `--pm-*` name in it is real. The laws are
    // independent. This one asks only whether the name refers to anything, not
    // whether a value should be a token or whether this file may read a token.
    const other = 'packages/rules/fixtures/vocabulary-violations.css'
    expect(
      ghosts([{ file: other, css: blankComments(readFileSync(resolve(ROOT, other), 'utf8')) }]),
    ).toEqual([])
  })
})
