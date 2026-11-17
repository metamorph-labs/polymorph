import { describe, expect, it } from 'vitest'

import { gallerySlug } from '@polymorph/react'

/**
 * The wiring law: every member on the filesystem appears in every list.
 *
 * A member's React side is five files plus entries in four hand-maintained
 * lists in other files, and without this law a missing entry fails nothing. A states file with
 * no entry in `galleries.ts` is a fixture the completeness law and the axe pass
 * never run. A member with no line in `galleries.test.tsx` is never counted by
 * the registry law. With no line in `selectors.test.ts`, the
 * `requiredSelectors` contract is never read. The component ships, the laws
 * pass, and none of them checks it. This file catches that.
 *
 * The filesystem is the source of truth: every `*.states.tsx` under `src/` is a
 * member, whether or not anything imports it. Each of the four lists is then
 * checked for that member, and a miss names the member and the list it is
 * missing from, because "something is wrong with the wiring" is not
 * actionable.
 *
 * **Sources are read as text, on purpose.** Two of the four lists are array
 * literals inside `it()` callbacks in `galleries.test.tsx`. Nothing exports
 * them, and importing a test file from a test file would register its suites
 * here again. So this reads the shipped source through Vite's `?raw`, as
 * `selectors.test.ts` reads stylesheets and `reduced-motion.test.ts` reads
 * media queries; that is the repo's pattern for a law that checks source rather
 * than behaviour. The cost is that the parsing below is regex over source, so
 * it depends on the shape of those files (an `@wiring` anchor, an object
 * literal named `SOURCES`). Each of those dependencies fails loudly (a missing
 * anchor is its own failure), and the first test asserts that the parse found a
 * whole vocabulary, so a law that read nothing cannot pass.
 *
 * Deliberately not checked here: that a spec exists and still describes the
 * props (the spec-staleness law, `packages/rules/src/spec-api.ts`), and that
 * the mapped stylesheet styles what the fixture promises (`selectors.test.ts`).
 * This law answers one question for every member at once: is the member
 * visible to the tooling?
 *
 * `pnpm new:member` writes all four entries. A generator fixes hand-maintained
 * lists, and this law makes the generator's omissions fail loudly.
 *
 * A member also needs an entry in each platform file (`design/platforms/*.json`)
 * and each framework map (`design/frameworks/*.json`), which the generator
 * writes too. Those checks are the platform law and the framework law
 * (`packages/registry/src/platforms.test.ts`, `frameworks.test.ts`) rather than
 * more lists here: they run in node against the member list the registry builds
 * (the ladder's primitives included), name the file an entry is missing from,
 * and use the same functions that stop `pnpm registry` from building without
 * the entry. The generator's other writes have their own laws too: the
 * description by each generated vocabulary's map law (`packages/vue-ui/laws.test.ts`
 * and its siblings), and the pending lists by the native conformance laws
 * (`packages/native/src/laws.test.ts`, `kotlin-laws.test.ts`).
 */

// --- the sources ----------------------------------------------------------

/** Every fixture on disk, keyed by its path under `src/`. */
const STATES_FILES: Record<string, string> = Object.fromEntries(
  Object.entries(
    import.meta.glob<string>('./**/*.states.tsx', {
      query: '?raw',
      import: 'default',
      eager: true,
    }),
  ).map(([path, source]) => [path.replace('./', ''), source]),
)

/** The one file a literal glob matched. A glob that matched nothing is a bug here. */
function one(matched: Record<string, string>, what: string): string {
  const [source] = Object.values(matched)
  if (source === undefined) throw new Error(`wiring law: ${what} did not resolve`)
  return source
}

const GALLERIES_TS = one(
  import.meta.glob<string>('./galleries.ts', { query: '?raw', import: 'default', eager: true }),
  'galleries.ts',
)

const GALLERIES_TEST = one(
  import.meta.glob<string>('./galleries.test.tsx', {
    query: '?raw',
    import: 'default',
    eager: true,
  }),
  'galleries.test.tsx',
)

const SELECTORS_TEST = one(
  import.meta.glob<string>('./selectors.test.ts', {
    query: '?raw',
    import: 'default',
    eager: true,
  }),
  'selectors.test.ts',
)

const INDEX_TS = one(
  import.meta.glob<string>('./index.ts', { query: '?raw', import: 'default', eager: true }),
  'index.ts',
)

// --- reading source -------------------------------------------------------

/**
 * Comments removed before any quote is read.
 *
 * The arrays in `galleries.test.tsx` have grouping comments, and some contain
 * an apostrophe ("PageHeader's alternative"). Extracting quoted strings without
 * stripping comments first would read that as an opening quote and consume the
 * rest of the list.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
}

/** Every single-quoted string in a stretch of source, in order. */
function quoted(text: string): string[] {
  return [...text.matchAll(/'([^']*)'/g)].map((match) => match[1] as string)
}

/**
 * The text inside the first bracket pair at or after `from`, brackets balanced.
 *
 * `''` when there is no opener, which every caller treats as "the list is
 * missing": the same failure as an empty list, naming the same missing list.
 */
function bracketed(source: string, from: number, open = '[', close = ']'): string {
  const start = source.indexOf(open, from)
  if (start === -1) return ''
  let depth = 0
  for (let at = start; at < source.length; at += 1) {
    const character = source[at]
    if (character === open) depth += 1
    else if (character === close) {
      depth -= 1
      if (depth === 0) return source.slice(start + 1, at)
    }
  }
  return ''
}

/**
 * The array an `@wiring <name>` anchor is attached to, as its quoted strings.
 *
 * The anchor is found in the raw source, because it is itself a comment. The
 * brackets are then counted with comments removed, so a comment inside the
 * array cannot open or close one.
 */
export function anchoredList(source: string, anchor: string): string[] {
  const at = source.indexOf(`@wiring ${anchor}`)
  if (at === -1) return []
  return quoted(bracketed(stripComments(source.slice(at)), 0))
}

/**
 * Everything after the `=` of a `const <name>… =` declaration, comments gone.
 *
 * It starts after the `=` on purpose. `GALLERIES: readonly ComponentStates[] =`
 * has a pair of brackets in its type annotation, and a bracket reader that
 * started at the name would read that empty array as the registry and find
 * every member missing.
 */
function initializer(source: string, name: string): string {
  const bare = stripComments(source)
  const match = new RegExp(`\\bconst ${name}\\b[^=]*=`).exec(bare)
  return match === null ? '' : bare.slice(match.index + match[0].length)
}

/** The body of a top-level `const <name> = { … }` object literal. */
function objectBody(source: string, name: string): string {
  return bracketed(initializer(source, name), 0, '{', '}')
}

// --- the four lists, as sets ----------------------------------------------

/** Everything the law reads, gathered so the checks below can be pure functions. */
export interface WiringCorpus {
  /** `structure/timeline.states.tsx` → its source. */
  states: Record<string, string>
  galleries: string
  galleriesTest: string
  selectorsTest: string
  index: string
}

export interface Member {
  /** The name the fixture declares — the identity every list is keyed by. */
  component: string
  /** Where the fixture lives, under `src/`. */
  file: string
}

/** The members on disk: what a fixture calls itself, and where it is. */
function membersOnDisk(corpus: WiringCorpus): Member[] {
  return Object.entries(corpus.states)
    .map(([file, source]) => ({
      component: /component:\s*'([^']+)'/.exec(stripComments(source))?.[1] ?? '',
      file,
    }))
    .filter((member) => member.component !== '')
    .sort((left, right) => left.component.localeCompare(right.component))
}

/** `galleries.ts` — the states file each local name was imported from. */
function galleryImports(source: string): Map<string, string> {
  const imports = new Map<string, string>()
  for (const [, local, path] of stripComments(source).matchAll(
    /import\s*\{\s*states as (\w+)\s*\}\s*from\s*'\.\/([^']+)'/g,
  )) {
    imports.set(local as string, `${path as string}.tsx`)
  }
  return imports
}

/** `galleries.ts` — the local names placed in the `GALLERIES` array. */
function galleryEntries(source: string): Set<string> {
  const body = bracketed(initializer(source, 'GALLERIES'), 0)
  return new Set(
    body
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean),
  )
}

/** `selectors.test.ts` — component → the stylesheet basename it is mapped to. */
function stylesheetMap(source: string): Map<string, string> {
  const map = new Map<string, string>()
  for (const [, component, sheet] of objectBody(source, 'STYLESHEET').matchAll(
    /(\w+)\s*:\s*'([^']+)'/g,
  )) {
    map.set(component as string, sheet as string)
  }
  return map
}

/** `selectors.test.ts` — the stylesheet basenames registered as readable source. */
function sourceKeys(source: string): Set<string> {
  const keys = new Set<string>()
  for (const [, sheet] of objectBody(source, 'SOURCES').matchAll(/'([^']+)'\s*:/g)) {
    keys.add(sheet as string)
  }
  return keys
}

/** `index.ts` — every name the entry point exports, values and types alike. */
function exportedNames(source: string): Set<string> {
  const names = new Set<string>()
  for (const [, list] of stripComments(source).matchAll(
    /export\s+(?:type\s+)?\{([^}]*)\}\s+from\s+'[^']+'/g,
  )) {
    for (const name of (list as string).split(',')) {
      const bare = name
        .trim()
        .replace(/^type\s+/, '')
        .split(/\s+as\s+/)[0]
        ?.trim()
      if (bare) names.add(bare)
    }
  }
  return names
}

/** The component names a fixture imports from a sibling module in this package. */
function localImports(source: string): Set<string> {
  const names = new Set<string>()
  for (const [, list] of stripComments(source).matchAll(
    /import\s*\{([^}]*)\}\s*from\s*'\.\.?\//g,
  )) {
    for (const name of (list as string).split(',')) {
      const bare = name
        .trim()
        .replace(/^type\s+/, '')
        .split(/\s+as\s+/)[0]
        ?.trim()
      if (bare) names.add(bare)
    }
  }
  return names
}

// --- the law --------------------------------------------------------------

/** Which list a finding is about, so each `it` below can report only its own. */
export type WiringList =
  | 'galleries.ts'
  | 'galleries.test.tsx COMPONENTS'
  | 'galleries.test.tsx SLUGS'
  | 'selectors.test.ts'
  | 'index.ts'

export interface WiringFinding {
  list: WiringList
  message: string
}

/**
 * Every member against every list, in one pass. A member missing from three
 * lists is reported three times, which is what a half-finished wiring job
 * needs, rather than only the first miss.
 */
export function auditWiring(corpus: WiringCorpus): WiringFinding[] {
  const findings: WiringFinding[] = []
  const say = (list: WiringList, message: string) => findings.push({ list, message })

  const imports = galleryImports(corpus.galleries)
  const placed = galleryEntries(corpus.galleries)
  const registered = new Set(
    [...imports.entries()].filter(([local]) => placed.has(local)).map(([, file]) => file),
  )
  const components = new Set(anchoredList(corpus.galleriesTest, 'components'))
  const slugs = new Set(anchoredList(corpus.galleriesTest, 'slugs'))
  const stylesheets = stylesheetMap(corpus.selectorsTest)
  const sources = sourceKeys(corpus.selectorsTest)
  const exported = exportedNames(corpus.index)

  for (const { component, file } of membersOnDisk(corpus)) {
    const has = `${component} has states (${file}) but`

    if (!registered.has(file)) {
      const imported = [...imports.values()].includes(file)
      say(
        'galleries.ts',
        imported
          ? `${has} its import is never placed in the GALLERIES array — the gallery, the completeness law and the axe pass all read that array`
          : `${has} no entry in galleries.ts — a member the completeness law cannot see`,
      )
      // No downstream list is expected to include a member the registry lacks,
      // so reporting the other four would repeat this finding.
      continue
    }

    if (!components.has(component)) {
      say(
        'galleries.test.tsx COMPONENTS',
        `${has} no entry in galleries.test.tsx's COMPONENTS — the exact-order list that pins what the vocabulary delivers`,
      )
    }

    const slug = gallerySlug(component)
    if (!slugs.has(slug)) {
      say(
        'galleries.test.tsx SLUGS',
        `${has} no entry in galleries.test.tsx's SLUGS — expected '${slug}', the route its fixture answers on`,
      )
    }

    const sheet = stylesheets.get(component)
    if (sheet === undefined) {
      say(
        'selectors.test.ts',
        `${has} no entry in selectors.test.ts's STYLESHEET — the \`requiredSelectors\` law reads that map to find the stylesheet a member ships, and skips what it cannot find`,
      )
    } else if (!sources.has(sheet)) {
      say(
        'selectors.test.ts',
        `${component} is mapped to ${sheet}, which has no entry in selectors.test.ts's SOURCES — the map points at a stylesheet the law cannot read`,
      )
    }

    // Applies when the fixture imports the component by name from a sibling
    // module. Toast is why the condition exists: its fixture renders `toast()`
    // into a `<Toaster />`, there is no `Toast` component to export, and
    // requiring one would invent a member.
    const source = corpus.states[file] ?? ''
    if (localImports(source).has(component)) {
      if (!exported.has(component)) {
        say(
          'index.ts',
          `${has} no export in index.ts — a member no consumer can import, and no vendored copy contains`,
        )
      }
      if (!exported.has(`${component}Props`)) {
        say(
          'index.ts',
          `${has} no \`${component}Props\` export in index.ts — the spec-staleness law reads the prop type from the entry point, and reports a member it cannot resolve rather than checking it`,
        )
      }
    }
  }

  return findings
}

const REPO: WiringCorpus = {
  states: STATES_FILES,
  galleries: GALLERIES_TS,
  galleriesTest: GALLERIES_TEST,
  selectorsTest: SELECTORS_TEST,
  index: INDEX_TS,
}

const FINDINGS = auditWiring(REPO)
const about = (list: WiringList) =>
  FINDINGS.filter((finding) => finding.list === list).map((finding) => finding.message)

describe('the wiring law found its subject', () => {
  it('reads a whole vocabulary from disk, so a pass is meaningful', () => {
    // A law whose parse silently returned nothing passes every assertion under
    // it. These numbers are minimums, not counts: they show that the parse ran.
    expect(membersOnDisk(REPO).length).toBeGreaterThan(50)
    expect(anchoredList(GALLERIES_TEST, 'components').length).toBeGreaterThan(50)
    expect(anchoredList(GALLERIES_TEST, 'slugs').length).toBeGreaterThan(50)
    expect(stylesheetMap(SELECTORS_TEST).size).toBeGreaterThan(50)
    expect(exportedNames(INDEX_TS).size).toBeGreaterThan(50)
  })

  it('agrees with the registry it is checking', () => {
    // The one exact number: every fixture on disk is in the array, and the
    // array holds nothing else. Both directions, in one line.
    expect(galleryEntries(GALLERIES_TS).size).toBe(membersOnDisk(REPO).length)
  })
})

describe('every member on disk is in every list that has to see it', () => {
  it('is registered in galleries.ts', () => {
    expect(about('galleries.ts')).toEqual([])
  })

  it("is named in galleries.test.tsx's component list", () => {
    expect(about('galleries.test.tsx COMPONENTS')).toEqual([])
  })

  it("is routed in galleries.test.tsx's slug list", () => {
    expect(about('galleries.test.tsx SLUGS')).toEqual([])
  })

  it('is mapped to a readable stylesheet in selectors.test.ts', () => {
    expect(about('selectors.test.ts')).toEqual([])
  })

  it('is exported from index.ts, component and props type both', () => {
    expect(about('index.ts')).toEqual([])
  })
})

describe('the wiring law detects faults', () => {
  /**
   * Shows the law failing, while the suite passes. A real orphaned states file
   * cannot be in the repository, because it would break the laws this one
   * protects. So the checker runs on a corpus with one instead, as
   * `laws.test.tsx` does for the completeness check.
   *
   * The corpus below is the smallest input shaped like the four lists: one
   * member wired everywhere, and one wired nowhere.
   */
  const ORPHANED: WiringCorpus = {
    states: {
      'structure/timeline.states.tsx':
        "import { Timeline } from './Timeline'\nexport const states = { component: 'Timeline' }",
      'structure/sparkline.states.tsx':
        "import { Sparkline } from './Sparkline'\nexport const states = { component: 'Sparkline' }",
    },
    galleries: [
      "import { states as timeline } from './structure/timeline.states'",
      'export const GALLERIES = [timeline]',
    ].join('\n'),
    galleriesTest: [
      '// @wiring components',
      "expect(x).toEqual(['Timeline'])",
      '// @wiring slugs',
      "expect(slugs).toEqual(['timeline'])",
    ].join('\n'),
    selectorsTest: [
      "const SOURCES = { 'timeline.module.css': timelineCss }",
      "const STYLESHEET = { Timeline: 'timeline.module.css' }",
    ].join('\n'),
    index:
      "export { Timeline } from './structure/Timeline'\nexport type { TimelineProps } from './structure/Timeline'",
  }

  it('names the member, and the one list it is missing from', () => {
    expect(auditWiring(ORPHANED).map((finding) => finding.message)).toEqual([
      'Sparkline has states (structure/sparkline.states.tsx) but no entry in galleries.ts — a member the completeness law cannot see',
    ])
  })

  it('names every downstream list once the member is registered', () => {
    const halfWired: WiringCorpus = {
      ...ORPHANED,
      galleries: [
        "import { states as sparkline } from './structure/sparkline.states'",
        "import { states as timeline } from './structure/timeline.states'",
        'export const GALLERIES = [timeline, sparkline]',
      ].join('\n'),
    }

    expect(auditWiring(halfWired).map((finding) => finding.message)).toEqual([
      "Sparkline has states (structure/sparkline.states.tsx) but no entry in galleries.test.tsx's COMPONENTS — the exact-order list that pins what the vocabulary delivers",
      "Sparkline has states (structure/sparkline.states.tsx) but no entry in galleries.test.tsx's SLUGS — expected 'sparkline', the route its fixture answers on",
      "Sparkline has states (structure/sparkline.states.tsx) but no entry in selectors.test.ts's STYLESHEET — the `requiredSelectors` law reads that map to find the stylesheet a member ships, and skips what it cannot find",
      'Sparkline has states (structure/sparkline.states.tsx) but no export in index.ts — a member no consumer can import, and no vendored copy contains',
      'Sparkline has states (structure/sparkline.states.tsx) but no `SparklineProps` export in index.ts — the spec-staleness law reads the prop type from the entry point, and reports a member it cannot resolve rather than checking it',
    ])
  })

  it('catches an import that was never placed in the array', () => {
    const imported: WiringCorpus = {
      ...ORPHANED,
      galleries: [
        "import { states as sparkline } from './structure/sparkline.states'",
        "import { states as timeline } from './structure/timeline.states'",
        'export const GALLERIES = [timeline]',
      ].join('\n'),
    }

    expect(auditWiring(imported).map((finding) => finding.message)).toEqual([
      'Sparkline has states (structure/sparkline.states.tsx) but its import is never placed in the GALLERIES array — the gallery, the completeness law and the axe pass all read that array',
    ])
  })

  it('catches a stylesheet mapped to a source nothing reads', () => {
    const unreadable: WiringCorpus = {
      ...ORPHANED,
      states: {
        'structure/timeline.states.tsx': ORPHANED.states['structure/timeline.states.tsx'] as string,
      },
      selectorsTest: "const SOURCES = {}\nconst STYLESHEET = { Timeline: 'timeline.module.css' }",
    }

    expect(auditWiring(unreadable).map((finding) => finding.message)).toEqual([
      "Timeline is mapped to timeline.module.css, which has no entry in selectors.test.ts's SOURCES — the map points at a stylesheet the law cannot read",
    ])
  })

  it('fails when an anchor is removed, rather than reading an empty list as agreement', () => {
    const anchorless: WiringCorpus = { ...ORPHANED, galleriesTest: 'no anchors here' }
    const missing = auditWiring(anchorless).map((finding) => finding.list)

    expect(missing).toContain('galleries.test.tsx COMPONENTS')
    expect(missing).toContain('galleries.test.tsx SLUGS')
  })
})
