#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * `pnpm new:member <Name> [--tier structure]` — a member, wired.
 *
 * A member is six files *and four hand-maintained lists in other files*. Miss
 * one and the member is invisible to the machinery — the completeness law never
 * renders it, the axe pass never audits it, the `requiredSelectors` law never
 * reads its stylesheet — and every gate stays green.
 *
 * The recipe is written to `packages/recipes/src/<tier>/`, at the path the
 * member has under `packages/react-ui/src/`, and the component imports it as
 * `@polymorph/recipes/<tier>/<slug>.module.css`. It has no framework in it, so
 * it lives in the package every framework's members import it from.
 *
 * The sixth file is the member's framework-neutral description,
 * `packages/shells/src/members/<slug>.ts`, from which `pnpm shells` writes the
 * Vue, Svelte, Solid and Angular members and the member's element. The stub renders what the stub
 * component renders. A description is found by its file, so it joins no list.
 *
 * It is also an entry in each platform file (`design/platforms/*.json`), which
 * says how the member renders on that platform. The registry refuses to build
 * without one, and `packages/registry/src/platforms.test.ts` names the file it
 * is missing from. This writes a `native` entry into the web file, where every
 * member is native, and a placeholder into each phone file whose `reason`
 * begins with `DECIDE`. The platform law refuses the placeholder, so the author
 * reads the spec and sets the status before the registry builds again.
 *
 * Each framework map (`design/frameworks/*.json`) gets the same placeholder,
 * which the framework law (`packages/registry/src/frameworks.test.ts`) refuses
 * until the author decides whether that framework ships the member. A member
 * is native in a framework exactly when it has a description, so deciding
 * `absent` everywhere means deleting the description too.
 *
 * Each phone platform's pending list gets the member
 * (`packages/native/src/pending.ts` for SwiftUI,
 * `packages/native/src/kotlin-pending.ts` for Compose), and the count its law
 * pins (`PENDING_COUNT` in `packages/native/src/laws.test.ts`,
 * `KOTLIN_PENDING_COUNT` in `packages/native/src/kotlin-laws.test.ts`) rises
 * by one. The native conformance laws hold every member the platform renders
 * to a rendering or that list, so a member decided `absent` there leaves the
 * list, and a member whose rendering lands leaves it too, each lowering the
 * count. A member that already has a rendering, or that the platform file
 * already marks absent, is not added.
 *
 * The answer is generation over prose. The lists are still hand-maintained
 * (they are hand-*written* on purpose — see the reasoning at the top of
 * `galleries.test.tsx`), but nobody has to remember them: this writes every
 * slot, `wiring.test.ts` reds if a slot is ever missing, and the system card
 * gets no longer.
 *
 * What it deliberately does not do is decide anything. The stubs it writes are
 * shaped correctly and say nothing: the spec has its headings and its
 * machine-read grammar and no design in it, the component has one prop, the
 * fixture has one entry. Everything a house voice would have to invent is left
 * as a marked decision, and the tail printed at the end names each one.
 *
 * Plain node, no dependencies, no build step — same shape as
 * `packages/rules/bin/inventory.js`. The one duplication that buys is `slugOf`
 * below, which restates the rule `gallerySlug` owns; `wiring.test.ts` compares
 * the slug this writes against the real function on every run, so a divergence
 * is a red rather than a bad route.
 */

/**
 * The seven tiers. A tier's spec dir is `design/components/` for every tier but
 * `archetypes` — a chart is a member, not a page, and so is a chat message.
 */
const TIERS = ['structure', 'controls', 'overlays', 'layout', 'charts', 'ai', 'archetypes']

const USAGE = [
  'usage: pnpm new:member <Name> [--tier structure|controls|overlays|layout|charts|ai|archetypes]',
  '                              [--dry-run] [--rewire] [--root <dir>]',
  '',
  '  <Name>      PascalCase, as the vocabulary will export it — Timeline, DataTable',
  '  --tier      where it lives (default: structure)',
  '  --dry-run   print the six files and the wiring edits, write nothing',
  '  --rewire    an existing member: fill in only the wiring slots it is missing',
  '  --root      the repository to write into (default: the one this script is in)',
].join('\n')

// --- arguments ------------------------------------------------------------

function parseArgs(argv) {
  const options = { name: '', tier: 'structure', dryRun: false, rewire: false, root: '' }

  for (let at = 0; at < argv.length; at += 1) {
    const arg = argv[at]
    if (arg === '--dry-run') options.dryRun = true
    else if (arg === '--rewire') options.rewire = true
    else if (arg === '--tier' || arg === '--root') {
      const value = argv[at + 1]
      if (value === undefined || value.startsWith('--')) fail(`${arg} needs a value`)
      options[arg === '--tier' ? 'tier' : 'root'] = value
      at += 1
    } else if (arg.startsWith('--')) fail(`unknown option ${arg}`)
    else if (options.name === '') options.name = arg
    else fail(`unexpected argument ${arg} — one name at a time`)
  }

  if (options.name === '') fail('no name given')
  if (!/^[A-Z][A-Za-z0-9]*$/.test(options.name)) {
    fail(`${options.name} is not a component name — PascalCase, letters and digits`)
  }
  if (!TIERS.includes(options.tier)) {
    fail(`unknown tier ${options.tier} — one of ${TIERS.join(', ')}`)
  }
  return options
}

function fail(message) {
  console.error(`new:member: ${message}\n\n${USAGE}`)
  process.exit(1)
}

/**
 * The route name, restating `gallerySlug`'s rule
 * (`packages/engine/src/conventions/slug.ts`). This script cannot import the
 * function without a TypeScript loader it otherwise has no use for.
 * `wiring.test.ts` checks the slug in the route list against the real function,
 * so this copy cannot drift silently.
 */
function slugOf(name) {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
    .toLowerCase()
}

/** `CodeBlock` → `codeBlock`; the local name a fixture is imported under. */
function localOf(name, taken) {
  const camel = name.charAt(0).toLowerCase() + name.slice(1)
  // `switch` and `toast` are the two the vocabulary already hit: a reserved word
  // cannot be a binding, and a name already bound would shadow it.
  const reserved = new Set(['switch', 'case', 'default', 'class', 'function', 'new', 'delete'])
  return reserved.has(camel) || taken.includes(camel) ? `${camel}States` : camel
}

// --- the templates --------------------------------------------------------

function componentFile({ name, slug, tier, spec }) {
  return `import { memberAttr } from '@polymorph/react'

import styles from '@polymorph/recipes/${tier}/${slug}.module.css'

/**
 * DECIDE: one sentence saying what a ${name} is, in the product's words
 * (\`${spec}\`).
 *
 * DECIDE: and one saying what it is *not* — the neighbour a reader will confuse
 * it with, and the rule that separates them. The specs that read best in this
 * repository all do this (\`timeline.md\` against Stepper, \`alert.md\` against
 * Toast); a component whose boundary is written down is one nobody has to
 * re-argue.
 */

/*
 * DECIDE: \`'use client'\`, or nothing. This stub carries no directive, which is
 * a claim — that nothing here calls a hook, attaches a handler, reads the DOM,
 * or imports a client-only substrate (Radix, motion, react-aria). Put the
 * directive on the very first line, with a blank line under it, the moment that
 * stops being true.
 *
 * The law runs in **both directions** (\`packages/rules/src/client-directive.test.ts\`):
 * a module that needs the directive and has none breaks an RSC consumer's build,
 * and a module that carries one it does not need drags itself and everything
 * under it into the client bundle. Nothing else in the repository notices
 * either.
 */

export interface ${name}Props {
  /** DECIDE: the real surface. One documented prop per decision the caller makes. */
  label: string
}

export function ${name}({ label }: ${name}Props) {
  // The identity attribute: the exception seam's address. The root — and
  // any portaled surface this member grows — wears it; the identity law in
  // \`laws.test.tsx\` reds a member whose fixtures never show it.
  return (
    <div className={styles.root} {...memberAttr('${name}')}>
      {label}
    </div>
  )
}
`
}

function stylesheetFile({ name, spec }) {
  return `/* ${name} — \`${spec}\`.
 *
 * DECIDE: the recipe. Every length, colour, radius, shadow and duration below
 * comes from a \`--pm-*\` token: Stylelint's \`polymorph/token-values-only\` refuses
 * a raw value, and \`packages/rules/src/token-references.test.ts\` refuses a token
 * that does not exist — a misspelled name throws its whole declaration away
 * without a word, which is the failure that law was written for.
 *
 * \`design/components/README.md\` assigns radius and size by component class;
 * \`pnpm registry\` prints the token set with its values. */

.root {
  display: flex;
  flex-direction: column;
  gap: var(--pm-space-3);
}
`
}

function statesFile({ name, spec }) {
  return `import { type ComponentStates } from '@polymorph/react'
import { ${name} } from './${name}'

/** States fixture, from \`${spec}\`'s States table. */

export const states: ComponentStates = {
  component: '${name}',

  /*
   * DECIDE: one entry per row of the spec's States table. Every entry is
   * rendered by \`laws.test.tsx\` — which asserts each \`expect\` attribute it
   * promises and runs axe over the result — and drawn by the workbench gallery.
   * An entry that renders nothing says so with \`rendersNothing: true\`, and is
   * held to that in both directions.
   */
  entries: [{ name: 'default', render: () => <${name} label="${name}" /> }],

  /*
   * DECIDE: the states a **prop cannot reach** — hover, focus-visible, active,
   * and the attribute states a substrate sets on its own. A fixture can never
   * render those, so \`selectors.test.ts\` greps the shipped stylesheet (through
   * \`composes\`) for each selector listed here instead.
   *
   * That is the whole of what this field means: it is not the component's
   * published attribute contract, which the registry reads from the stylesheet
   * that keys on it. A component whose every state is prop-reachable leaves this
   * empty and is complete — an empty list is a claim, not an omission.
   */
  requiredSelectors: [],
}
`
}

function testFile({ name, slug }) {
  return `import { render, screen } from '@testing-library/react'
import { beforeAll, describe, expect, it } from 'vitest'

import { assertGoverned } from '@polymorph/react'
import { installTestTheme } from '@polymorph/engine/testing'
import { ${name}, type ${name}Props } from './${name}'

/**
 * DECIDE: what is worth a real browser.
 *
 * This project's component tests run in chromium, so the claims worth writing
 * here are the ones only a browser can settle: computed geometry against a
 * token, a focus order, a state that a substrate — not a prop — produces. Claims
 * the states fixture already makes do not need restating; \`laws.test.tsx\`
 * renders every entry and audits it.
 */

beforeAll(installTestTheme)

describe('the closed surface', () => {
  it('has no style escape hatch', () => {
    assertGoverned<${name}Props>(true)
  })
})

describe('${name}', () => {
  it('renders what it was handed', () => {
    render(<${name} label="A ${slug}" />)
    expect(screen.getByText('A ${slug}')).toBeTruthy()
  })
})
`
}

function specFile({ name }) {
  const fence = '```'
  return `# ${name}

DECIDE: what a ${name} is, in two or three sentences — and what it is *not*, next
to the component a reader will confuse it with. Say which substrate it rests on,
or that it rests on none.

## Anatomy

${fence}
[root]
  [part]*
${fence}

## API

${fence}ts
interface ${name}Props {
  label: string // DECIDE: the real surface, one line of intent per prop
}
${fence}

<!-- The API section is machine-read (packages/rules/src/spec-api.ts): every prop
     the code ships must be a prop this section declares, and the reverse, in a
     law that goes red on drift. Two grammars are accepted — this fenced \`ts\`
     block naming the props type, or a markdown table whose header has a literal
     \`Prop\` column. Prefer the fence: a table's other columns read like prose
     to a human and like props to the parser. A fence that names the type wins
     over a table if a spec carries both. -->

Attributes: DECIDE — the \`data-*\` this component surfaces, and the rest state
that carries none. The "Attribute contract" section of
\`design/components/README.md\` is the shared one.

## Recipes (exact tokens)

| Part | Tokens |
| --- | --- |
| root | DECIDE: the exact \`--pm-*\` tokens, part by part |

## States

| Entry | Render | Expect |
| --- | --- | --- |
| default | DECIDE | DECIDE |

\`requiredSelectors\`: DECIDE — the states a prop cannot reach (hover, focus,
active, and what a substrate sets itself), or none, said out loud.

## Motion

DECIDE: what moves, on which state change, and which motion token times it — or
that nothing moves, which is also a decision worth writing down.

## Icons

DECIDE: which \`IconRole\`s, and whether they are decorative or named.

## A11y

DECIDE: the roles and the reading order, the accessible name, what is hidden from
the accessibility tree and why nothing is lost with it.

## Agent

DECIDE: what an agent reads off a ${name} and does with it, and why anything is
withheld, then the \`agent\` fence that restates it (\`docs/agents.md\`). A member an
agent has nothing to read or do with keeps the section, with the reason and no
fence. A control or an overlay must decide; another member may delete the section.
`
}

function descriptionFile({ name, slug, tier, spec }) {
  return `import { describeMember, el, identity, text } from '../dsl'

/**
 * ${name} (\`${spec}\`): DECIDE: the spec's opening sentence.
 *
 * DECIDE: the template. It renders the DOM the React member renders, part for
 * part and class for class, because every framework's member is held to the
 * React member's markup, states and contract (\`docs/shells.md\`). This stub
 * matches the stub component. When every framework map marks ${name} absent,
 * delete this file: a member is native in a framework exactly when it has a
 * description.
 */
export default describeMember({
  member: '${name}',
  dir: '${tier}',
  recipe: '${tier}/${slug}',
  template: el('div', { class: ['root'], attrs: { ...identity('${name}') } }, [text('label')]),
  // DECIDE: one entry per entry of the React states fixture, by the same name.
  states: [{ name: 'default', props: { label: '${name}' } }],
})
`
}

// --- editing the four lists -----------------------------------------------

/** The line offset a line-oriented insert lands on: the start of `at`'s line. */
function lineStart(source, at) {
  return source.lastIndexOf('\n', at) + 1
}

/**
 * The offset just past the `=` of a `const <name> … =` declaration.
 *
 * Not the offset of the name: `GALLERIES: readonly ComponentStates[] =` carries a
 * pair of brackets in its own type annotation, and a reader that started at the
 * name would append the new member to that empty annotation instead.
 */
function initializerAt(source, declaration) {
  const at = source.indexOf(declaration)
  return at === -1 ? -1 : source.indexOf('=', at) + 1
}

/**
 * The offset of the closer that matches the first `open` at or after `from`.
 *
 * Counted on the source as written — the stripped copy would have the wrong
 * offsets — which is safe for the four literals edited here: their comments hold
 * prose, not brackets. `wiring.test.ts` is the check that an insert landed where
 * it was meant to.
 */
function closerAfter(source, from, open, close) {
  const start = source.indexOf(open, from)
  if (start === -1) return -1
  let depth = 0
  for (let at = start; at < source.length; at += 1) {
    if (source[at] === open) depth += 1
    else if (source[at] === close) {
      depth -= 1
      if (depth === 0) return at
    }
  }
  return -1
}

/** Appends `line` as the last item of the literal opened after `from`. */
function appendToLiteral(source, from, line, open = '[', close = ']') {
  if (from < 0) return null
  const closer = closerAfter(source, from, open, close)
  if (closer === -1) return null
  const at = lineStart(source, closer)
  return `${source.slice(0, at)}${line}\n${source.slice(at)}`
}

/** Inserts `lines` before the first statement in `sorted` that outranks `key`. */
function insertSorted(source, statements, key, lines) {
  const after = statements.find((statement) => statement.key.localeCompare(key) > 0)
  if (after !== undefined) {
    const at = lineStart(source, after.start)
    return `${source.slice(0, at)}${lines}\n${source.slice(at)}`
  }
  const last = statements[statements.length - 1]
  if (last === undefined) return null
  return `${source.slice(0, last.end)}\n${lines}${source.slice(last.end)}`
}

/** Every match of `pattern`, as `{ key, start, end }` — `key` is capture 1. */
function statementsOf(source, pattern) {
  return [...source.matchAll(pattern)].map((match) => ({
    key: match[1],
    start: match.index,
    end: match.index + match[0].length,
  }))
}

/** The platform files, in the order the registry keys a member's entries. */
const PLATFORMS = ['web', 'ios', 'android']

/** The framework maps. React has none, because every member is native there. */
const FRAMEWORKS = ['vue', 'svelte', 'solid', 'angular', 'elements']

/**
 * The placeholder the phone entries and the framework entries carry. The
 * platform law and the framework law refuse a `reason` that begins with
 * `DECIDE` (`UNDECIDED` in `packages/registry/src/platforms.ts` and
 * `packages/registry/src/frameworks.ts`).
 */
const UNDECIDED_REASON = 'DECIDE: read the spec and set the status'

/**
 * Each phone platform's pending list, the constant in it, where a rendering
 * lives, and the law file that pins the list's length.
 */
const PENDING = {
  ios: {
    file: 'packages/native/src/pending.ts',
    constant: 'PENDING',
    law: 'packages/native/src/laws.test.ts',
    count: 'PENDING_COUNT',
    rendering: (name) => `platforms/ios/Sources/PolymorphUI/${name}.swift`,
  },
  android: {
    file: 'packages/native/src/kotlin-pending.ts',
    constant: 'KOTLIN_PENDING',
    law: 'packages/native/src/kotlin-laws.test.ts',
    count: 'KOTLIN_PENDING_COUNT',
    rendering: (name) => `platforms/android/ui/src/main/kotlin/dev/polymorph/ui/${name}.kt`,
  },
}

/** A map file's `members`, or `null` when the file is missing or does not parse. */
function membersOf(root, file) {
  try {
    const members = JSON.parse(readFileSync(resolve(root, file), 'utf8'))?.members
    return typeof members === 'object' && members !== null ? members : null
  } catch {
    return null
  }
}

/**
 * The entry for `name` in one platform file or framework map, placed in name
 * order: `native`, and, when `placeholder` is set, the `DECIDE` placeholder as
 * its reason, which the law refuses until the author replaces it. The web
 * entry is the only one without a placeholder, because every member is native
 * on the web.
 *
 * The file is read as JSON to decide (is the entry there, which entry comes
 * after it) and edited as text, so an entry someone formatted by hand keeps its
 * form. The result must parse, or the edit counts as stuck and nothing is
 * written.
 */
function mapEntry(source, name, placeholder) {
  let map
  try {
    map = JSON.parse(source)
  } catch {
    return null
  }
  const members = map?.members
  if (typeof members !== 'object' || members === null) return null
  if (Object.hasOwn(members, name)) return source

  const fields = ['"status": "native"']
  if (placeholder) fields.push(`"reason": ${JSON.stringify(UNDECIDED_REASON)}`)
  const body = fields.map((field) => `      ${field}`).join(',\n')
  const entry = `    ${JSON.stringify(name)}: {\n${body}\n    }`
  const after = Object.keys(members).find((key) => key.localeCompare(name) > 0)
  let next = null
  if (after !== undefined) {
    const at = source.indexOf(`\n    ${JSON.stringify(after)}:`)
    if (at !== -1) next = `${source.slice(0, at + 1)}${entry},\n${source.slice(at + 1)}`
  } else {
    // The last entry gains a comma, and the new one closes the object.
    const at = source.lastIndexOf('\n  }')
    if (at !== -1 && Object.keys(members).length > 0) {
      next = `${source.slice(0, at)},\n${entry}${source.slice(at)}`
    }
  }

  try {
    return next !== null && Object.hasOwn(JSON.parse(next).members, name) ? next : null
  } catch {
    return null
  }
}

/** The names a pending list's literal holds, and the literal's text, or `null`. */
function pendingLiteral(source, constant) {
  const match = source.match(
    new RegExp(`(export const ${constant}: readonly string\\[\\] = )\\[([^\\]]*)\\]`),
  )
  if (match === null) return null
  return {
    text: match[0],
    head: match[1],
    names: [...match[2].matchAll(/'([^']+)'/g)].map((m) => m[1]),
  }
}

/**
 * Whether the member joins a phone platform's pending list: not when it has a
 * rendering there, not when the platform file already marks it absent, and not
 * when the list already names it.
 */
function joinsPending(root, name, platform) {
  const pending = PENDING[platform]
  if (existsSync(resolve(root, pending.rendering(name)))) return false
  if (membersOf(root, `design/platforms/${platform}.json`)?.[name]?.status === 'absent')
    return false
  let source
  try {
    source = readFileSync(resolve(root, pending.file), 'utf8')
  } catch {
    return false
  }
  return !(pendingLiteral(source, pending.constant)?.names.includes(name) ?? true)
}

/**
 * The pending list with `name` in name order among the names it holds, written
 * as Prettier writes the literal: one line when it fits in 100 columns, one name
 * per line when it does not.
 */
function pendingEntry(source, constant, name) {
  const literal = pendingLiteral(source, constant)
  if (literal === null) return null
  if (literal.names.includes(name)) return source
  const names = [...literal.names]
  const at = names.findIndex((other) => other.localeCompare(name) > 0)
  names.splice(at === -1 ? names.length : at, 0, name)
  const line = `${literal.head}[${names.map((other) => `'${other}'`).join(', ')}]`
  const text =
    line.length <= 100
      ? line
      : `${literal.head}[\n${names.map((other) => `  '${other}',`).join('\n')}\n]`
  return source.replace(literal.text, text)
}

/** The law file with its pinned count raised by one, or `null` when the pin is not found. */
function raisedCount(source, count) {
  const pattern = new RegExp(`^const ${count} = (\\d+)$`, 'm')
  const match = source.match(pattern)
  if (match === null) return null
  return source.replace(pattern, `const ${count} = ${Number(match[1]) + 1}`)
}

/**
 * The edits: the four lists, the platform files, the framework maps, and the
 * phone platforms' pending lists with their pinned counts. Each is idempotent
 * by construction: it looks for what it would write and does nothing if it is
 * already there, so a re-run after a half-landed one fills in only the gaps.
 * That is what `--rewire` is for.
 */
function wiringEdits({ name, slug, tier, local, root }) {
  return [
    {
      file: 'packages/react-ui/src/index.ts',
      what: `export { ${name} } and export type { ${name}Props }`,
      apply(source) {
        const exportLine = `export { ${name} } from './${tier}/${name}'`
        if (source.includes(exportLine)) return source
        const lines = `${exportLine}\nexport type { ${name}Props } from './${tier}/${name}'`
        const tierExports = statementsOf(
          source,
          new RegExp(`export \\{ (\\w+)[^}]*\\} from '\\./${tier}/[^']+'`, 'g'),
        )
        if (tierExports.length > 0) return insertSorted(source, tierExports, name, lines)
        // A tier with nothing exported yet: after everything, with a blank line,
        // because a new block is what it is.
        const every = statementsOf(source, /export (?:type )?\{[^}]*\} from '([^']+)'/g)
        const last = every[every.length - 1]
        return last === undefined
          ? null
          : `${source.slice(0, last.end)}\n\n${lines}${source.slice(last.end)}`
      },
    },
    {
      file: 'packages/react-ui/src/galleries.ts',
      what: `import { states as ${local} } and its place in GALLERIES`,
      apply(source) {
        const importLine = `import { states as ${local} } from './${tier}/${slug}.states'`
        let next = source
        if (!next.includes(importLine)) {
          const tierImports = statementsOf(
            next,
            new RegExp(`import \\{ states as (\\w+) \\} from '\\./${tier}/[^']+'`, 'g'),
          )
          const anyImport = statementsOf(next, /import \{ states as (\w+) \} from '[^']+'/g)
          next =
            insertSorted(next, tierImports, local, importLine) ??
            insertSorted(next, anyImport, local, importLine)
          if (next === null) return null
        }
        if (new RegExp(`^\\s*${local},$`, 'm').test(next)) return next
        return appendToLiteral(next, initializerAt(next, 'const GALLERIES'), `  ${local},`)
      },
    },
    {
      file: 'packages/react-ui/src/galleries.test.tsx',
      what: `'${name}' in the @wiring components list, '${slug}' in @wiring slugs`,
      apply(source) {
        let next = source
        for (const [anchor, entry] of [
          ['components', name],
          ['slugs', slug],
        ]) {
          const at = next.indexOf(`@wiring ${anchor}`)
          if (at === -1) {
            console.error(
              `new:member: galleries.test.tsx has no \`@wiring ${anchor}\` anchor — ` +
                "restore it (see the file's doc comment) or add the entry by hand",
            )
            return null
          }
          if (new RegExp(`^\\s*'${entry}',$`, 'm').test(next.slice(at))) continue
          next = appendToLiteral(next, at, `      '${entry}',`)
          if (next === null) return null
        }
        return next
      },
    },
    {
      file: 'packages/react-ui/src/selectors.test.ts',
      what: 'the ?raw import, the SOURCES entry and the STYLESHEET entry',
      apply(source) {
        const sheet = `${slug}.module.css`
        const binding = `${local.replace(/States$/, '')}Css`
        let next = source

        const importLine = `import ${binding} from '@polymorph/recipes/${tier}/${sheet}?raw'`
        if (!next.includes(importLine)) {
          const tierImports = statementsOf(
            next,
            new RegExp(`import (\\w+) from '@polymorph/recipes/${tier}/[^']+\\?raw'`, 'g'),
          )
          const anyImport = statementsOf(next, /import (\w+) from '[^']+\?raw'/g)
          // Grouped by tier and otherwise in the order they were added: this
          // lands at the end of its tier's run rather than sorted into it.
          const run = tierImports.length > 0 ? tierImports : anyImport
          const last = run[run.length - 1]
          if (last === undefined) return null
          next = `${next.slice(0, last.end)}\n${importLine}${next.slice(last.end)}`
        }

        if (!next.includes(`'${sheet}':`)) {
          next = appendToLiteral(
            next,
            initializerAt(next, 'const SOURCES'),
            `  '${sheet}': ${binding},`,
            '{',
            '}',
          )
          if (next === null) return null
        }

        if (!new RegExp(`^\\s*${name}: '`, 'm').test(next)) {
          next = appendToLiteral(
            next,
            initializerAt(next, 'const STYLESHEET'),
            `  ${name}: '${sheet}',`,
            '{',
            '}',
          )
        }
        return next
      },
    },
    ...PLATFORMS.map((platform) => ({
      file: `design/platforms/${platform}.json`,
      what:
        platform === 'web'
          ? `a native entry for ${name}, in name order`
          : `a DECIDE placeholder for ${name}, in name order`,
      apply: (source) => mapEntry(source, name, platform !== 'web'),
    })),
    ...FRAMEWORKS.map((framework) => ({
      file: `design/frameworks/${framework}.json`,
      what: `a DECIDE placeholder for ${name}, in name order`,
      apply: (source) => mapEntry(source, name, true),
    })),
    ...Object.entries(PENDING).flatMap(([platform, pending]) => {
      const joins = joinsPending(root, name, platform)
      return [
        {
          file: pending.file,
          what: `${name} in ${pending.constant}, in name order`,
          apply: (source) => (joins ? pendingEntry(source, pending.constant, name) : source),
        },
        {
          file: pending.law,
          what: `${pending.count} raised by one`,
          apply: (source) => (joins ? raisedCount(source, pending.count) : source),
        },
      ]
    }),
  ]
}

// --- the run --------------------------------------------------------------

const options = parseArgs(process.argv.slice(2))
const ROOT = options.root
  ? resolve(process.cwd(), options.root)
  : resolve(dirname(fileURLToPath(import.meta.url)), '../../..')

const name = options.name
const slug = slugOf(name)
const tier = options.tier
const specDir = tier === 'archetypes' ? 'design/archetypes' : 'design/components'
const spec = `${specDir}/${slug}.md`
const src = `packages/react-ui/src/${tier}`
// The recipe goes to the recipes package, at the path its member has here.
const recipes = `packages/recipes/src/${tier}`

const galleriesPath = resolve(ROOT, 'packages/react-ui/src/galleries.ts')
if (!existsSync(galleriesPath)) fail(`${ROOT} does not look like the repository (no galleries.ts)`)

/**
 * The local name the fixture is imported under.
 *
 * Read from `galleries.ts` when this member is already imported — including a
 * binding a person chose by hand — so that a `--rewire` run recognises its own
 * work instead of deciding the name is taken and importing it a second time.
 */
const bindings = [
  ...readFileSync(galleriesPath, 'utf8').matchAll(/states as (\w+) \} from '([^']+)'/g),
]
const already = bindings.find((match) => match[2] === `./${tier}/${slug}.states`)
const local =
  already?.[1] ??
  localOf(
    name,
    bindings.map((match) => match[1]),
  )

/*
 * A member every framework map already marks absent has no description, and
 * `--rewire` on it must not write one: a description makes it native there.
 */
const describedNowhere = FRAMEWORKS.every(
  (framework) =>
    membersOf(ROOT, `design/frameworks/${framework}.json`)?.[name]?.status === 'absent',
)

const files = [
  { path: `${src}/${name}.tsx`, render: componentFile },
  { path: `${recipes}/${slug}.module.css`, render: stylesheetFile },
  { path: `${src}/${slug}.states.tsx`, render: statesFile },
  { path: `${src}/${slug}.test.tsx`, render: testFile },
  { path: spec, render: specFile },
  ...(describedNowhere
    ? []
    : [{ path: `packages/shells/src/members/${slug}.ts`, render: descriptionFile }]),
].map((file) => ({ ...file, exists: existsSync(resolve(ROOT, file.path)) }))

const standing = files.filter((file) => file.exists)
if (standing.length > 0 && !options.rewire) {
  console.error(
    `new:member: ${name} already exists — ${standing.map((file) => file.path).join(', ')}\n\n` +
      `  Pick another name, or delete those files first.\n` +
      `  If what is missing is its wiring, \`pnpm new:member ${name} --tier ${tier} --rewire\`\n` +
      `  fills in only the files and the slots it is missing and touches nothing else.`,
  )
  process.exit(1)
}

const context = { name, slug, tier, local, spec, root: ROOT }

/*
 * Every edit is computed before anything is written. A generator that failed
 * halfway would leave exactly the state this generator exists to prevent —
 * files on disk that no list mentions — and it would do it while telling you it had
 * failed, which is worse than either outcome alone.
 */
const plan = wiringEdits(context).map((edit) => {
  const path = resolve(ROOT, edit.file)
  const before = readFileSync(path, 'utf8')
  return { ...edit, path, before, after: edit.apply(before) }
})

const stuck = plan.filter((edit) => edit.after === null || edit.after === undefined)
if (stuck.length > 0) {
  console.error(
    `new:member: could not wire ${stuck.map((edit) => edit.file).join(', ')} — nothing written.\n` +
      stuck.map((edit) => `  ${edit.file}: ${edit.what}`).join('\n'),
  )
  process.exit(1)
}

const written = []
for (const file of files) {
  if (file.exists) continue
  written.push(file.path)
  if (options.dryRun) continue
  mkdirSync(resolve(ROOT, dirname(file.path)), { recursive: true })
  writeFileSync(resolve(ROOT, file.path), file.render(context))
}

const wired = []
for (const edit of plan) {
  if (edit.after === edit.before) continue
  wired.push(`${edit.file} — ${edit.what}`)
  if (!options.dryRun) writeFileSync(edit.path, edit.after)
}

// --- what it could not decide ---------------------------------------------

const say = (line = '') => console.log(line)
const mark = options.dryRun ? 'would write' : 'wrote'

say(`${name} (${tier}, /${slug})${options.dryRun ? ' — dry run, nothing written' : ''}`)
say()
say(written.length > 0 ? `  ${mark}:` : '  no files to write — every one already exists')
for (const path of written) say(`    ${path}`)
say()
if (wired.length > 0) {
  say(`  ${options.dryRun ? 'would wire' : 'wired'}:`)
  for (const line of wired) say(`    ${line}`)
} else {
  say('  wiring: already complete — every list, map and pending list has this member')
}

say()
say('  What the generator cannot decide, and no law will decide for you:')
say(`    · the spec. \`${spec}\` has the headings and the machine-read API grammar;`)
say('      what the component IS, what it is NOT, the exact tokens, the states table,')
say('      the motion and the a11y reading are design decisions. Every DECIDE marker')
say('      in the files above is one of them.')
say("    · `'use client'`. The stub carries none, which is a claim. The directive law")
say('      runs in both directions, and neither direction is guessable from a stub.')
say('    · gallery order. The entry was appended to the end of GALLERIES and to the')
say('      end of both arrays in galleries.test.tsx. That order is a reading order,')
say(`      not an index — if ${name} belongs elsewhere in it, move it in all three,`)
say('      together, and the tests stay green.')
say('    · the platform map. design/platforms/web.json says native, as for every')
say(`      member. ios.json and android.json give ${name} a DECIDE placeholder, which`)
say('      the platform law refuses: decide whether it renders natively, adapted (say')
say('      how, in `as`) or not at all (`absent`, with a `reason` and a `substitute`).')
say(`      An absent ${name} leaves that platform's pending list, and its pinned count`)
say('      drops by one.')
say('    · the framework maps. design/frameworks/{vue,svelte,solid,angular,elements}.json give')
say(`      ${name} the same placeholder: decide whether each framework ships it. The`)
say(`      description (packages/shells/src/members/${slug}.ts) renders it in every`)
say('      framework that does; write its template to match the React member, and')
say('      delete it if no framework ships the member.')
say('    · the native renderings. A member native or adapted on iOS or Android stays')
say('      in that pending list until its SwiftUI or Compose file lands (docs/native.md).')
say()
say('  Once the phone entries are decided, in this order:')
say('    1. each framework entry: "absent", with a reason, so the registry builds; the')
say('       registry refuses a native member whose shell is not generated')
say('    2. pnpm shells             the member in Vue, Svelte, Solid and Angular, and')
say('                               its element, from its description')
say('    3. each framework entry that ships it: "native", without a reason')
say('    4. pnpm registry           the catalogue and the system card, the maps checked')
say('    5. pnpm native:contracts   the Swift and Kotlin contracts the renderings conform to')
say()
say('  What will judge it:')
say('    pnpm typecheck')
say('    pnpm exec vitest run packages/react-ui  completeness + axe over every fixture')
say('                                            entry, the requiredSelectors check, and')
say('                                            the wiring law, which names a missing slot')
say('    pnpm exec vitest run packages/registry  the platform and framework maps: an entry')
say('                                            in every file, no DECIDE placeholder, and')
say('                                            a reason for an absent entry')
say('    pnpm exec vitest run packages/rules     spec staleness (both directions), token')
say("                                            existence, the 'use client' law, one-opener")
say("    pnpm test                               the generated members' laws in each")
say('                                            framework, and the native laws over the')
say('                                            pending lists')
say('    pnpm lint                               the red rules, Stylelint values, prettier')
say('    pnpm gate:ios, pnpm gate:android        once a native rendering lands')
say()
say(`  Read CONTRIBUTING.md once; ${spec} is the next thing to write.`)
