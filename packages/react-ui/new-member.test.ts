import { execFileSync } from 'node:child_process'
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

/**
 * Runs `pnpm new:member` for real.
 *
 * The generator's job is to edit four hand-maintained lists, the three
 * platform files, the five framework maps and the two phone platforms' pending
 * lists with the counts their laws pin, so this test runs it and reads what it
 * wrote. It runs against a **temp copy**: a new directory with those real
 * files, unchanged, plus the directories a member is written to. It does not
 * use the working tree. A test that generated a member into
 * `packages/react-ui/src` would leave the repository half-populated if
 * interrupted, and while it ran, a parallel suite would see a phantom component
 * in `GALLERIES` and a spec the staleness law cannot resolve. The copy costs a
 * few `cp`s and avoids all of that.
 *
 * The copy is as good a test subject as the real tree: the files are the real
 * ones, byte for byte, so an insert in the wrong place here is in the wrong
 * place there too. It cannot show the member passing the vocabulary's laws.
 * That needs the real repository and is checked by hand when the generator
 * changes: generate, run the suite, remove.
 *
 * It is at the package root rather than in `src/` on purpose, for the same
 * reason as `packages/engine/packaging.test.ts`: `src/**` is the vocabulary's
 * browser project, and this is a node test about files on disk.
 */

const REPO = process.cwd()
const SCRIPT = resolve(REPO, 'packages/react-ui/bin/new-member.mjs')
const PLATFORM_FILES = [
  'design/platforms/web.json',
  'design/platforms/ios.json',
  'design/platforms/android.json',
]
const FRAMEWORK_FILES = [
  'design/frameworks/vue.json',
  'design/frameworks/svelte.json',
  'design/frameworks/solid.json',
  'design/frameworks/angular.json',
  'design/frameworks/elements.json',
]
/** Each phone platform's pending list, its constant, and the law file and count that pin it. */
const PENDING_LISTS = [
  {
    file: 'packages/native/src/pending.ts',
    constant: 'PENDING',
    law: 'packages/native/src/laws.test.ts',
    count: 'PENDING_COUNT',
  },
  {
    file: 'packages/native/src/kotlin-pending.ts',
    constant: 'KOTLIN_PENDING',
    law: 'packages/native/src/kotlin-laws.test.ts',
    count: 'KOTLIN_PENDING_COUNT',
  },
]

/** The phone files' placeholder, which the platform law refuses until the author decides. */
const UNDECIDED = { status: 'native', reason: 'DECIDE: read the spec and set the status' }

/** The entry block each file gains, in the file's own format. */
const block = (file: string): string =>
  file.endsWith('/web.json')
    ? '    "Sketchpad": {\n      "status": "native"\n    },\n'
    : '    "Sketchpad": {\n      "status": "native",\n      "reason": "DECIDE: read the spec and set the status"\n    },\n'

const WIRING = [
  'packages/react-ui/src/index.ts',
  'packages/react-ui/src/galleries.ts',
  'packages/react-ui/src/galleries.test.tsx',
  'packages/react-ui/src/selectors.test.ts',
  ...PLATFORM_FILES,
  ...FRAMEWORK_FILES,
  ...PENDING_LISTS.flatMap(({ file, law }) => [file, law]),
]

/** The names a pending list holds, read from its literal. */
function pendingNames(source: string, constant: string): string[] {
  const literal = source.match(new RegExp(`${constant}: readonly string\\[\\] = \\[([^\\]]*)\\]`))
  expect(literal, `${constant} not found`).not.toBeNull()
  return [...(literal?.[1] ?? '').matchAll(/'([^']+)'/g)].map((match) => match[1] ?? '')
}

/** The count a law file pins. */
function pinned(source: string, count: string): number {
  const match = source.match(new RegExp(`^const ${count} = (\\d+)$`, 'm'))
  expect(match, `${count} not found`).not.toBeNull()
  return Number(match?.[1])
}

let root = ''

/** A fresh copy of everything the generator reads or writes. */
function scratch(): string {
  const dir = mkdtempSync(resolve(tmpdir(), 'polymorph-new-member-'))
  mkdirSync(resolve(dir, 'packages/react-ui/src/structure'), { recursive: true })
  mkdirSync(resolve(dir, 'design/components'), { recursive: true })
  for (const file of WIRING) {
    mkdirSync(resolve(dir, file, '..'), { recursive: true })
    cpSync(resolve(REPO, file), resolve(dir, file))
  }
  return dir
}

interface Run {
  status: number
  stdout: string
  stderr: string
}

function generate(...args: string[]): Run {
  return generateIn(root, ...args)
}

function generateIn(dir: string, ...args: string[]): Run {
  try {
    const stdout = execFileSync(process.execPath, [SCRIPT, ...args, '--root', dir], {
      cwd: REPO,
      encoding: 'utf8',
      // Captured rather than inherited: half these runs are refusals, and
      // printing every one would hide the test results.
      stdio: 'pipe',
    })
    return { status: 0, stdout, stderr: '' }
  } catch (thrown) {
    const error = thrown as { status: number; stdout: string; stderr: string }
    return { status: error.status, stdout: error.stdout, stderr: error.stderr }
  }
}

const read = (file: string) => readFileSync(resolve(root, file), 'utf8')
const has = (file: string) => existsSync(resolve(root, file))

/** The six files a member is, for the name used throughout. */
const FILES = [
  'packages/react-ui/src/structure/Sketchpad.tsx',
  'packages/recipes/src/structure/sketchpad.module.css',
  'packages/react-ui/src/structure/sketchpad.states.tsx',
  'packages/react-ui/src/structure/sketchpad.test.tsx',
  'design/components/sketchpad.md',
  'packages/shells/src/members/sketchpad.ts',
]

beforeAll(() => {
  root = scratch()
})

afterAll(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('a name that is not a member', () => {
  it('refuses anything that is not a component name', () => {
    expect(generate('sketchpad').status).toBe(1)
    expect(generate('Spark-line').status).toBe(1)
    expect(generate('Sketchpad', '--tier', 'widgets').stderr).toContain('unknown tier')
    expect(generate().stderr).toContain('no name given')
  })

  it('writes nothing at all on a dry run, and says so', () => {
    // Compares before with after rather than searching for the name. The four
    // files are copies of the real ones, so "does not contain Sketchpad" would
    // test the repository rather than the dry run.
    const before = WIRING.map(read)
    const run = generate('Sketchpad', '--dry-run')

    expect(run.status).toBe(0)
    expect(run.stdout).toContain('dry run, nothing written')
    expect(run.stdout).toContain('design/components/sketchpad.md')
    for (const file of FILES) expect(has(file), file).toBe(false)
    expect(WIRING.map(read)).toEqual(before)
  })
})

describe('the six files', () => {
  beforeAll(() => {
    expect(generate('Sketchpad', '--tier', 'structure').status).toBe(0)
  })

  it('all exist, named the way the rest of the tier is named', () => {
    for (const file of FILES) expect(has(file), file).toBe(true)
  })

  it('gives the component a props type the entry point can export', () => {
    const source = read('packages/react-ui/src/structure/Sketchpad.tsx')
    expect(source).toContain('export interface SketchpadProps')
    // The recipe is in the recipes package, at the member's own path.
    expect(source).toContain(
      "import styles from '@polymorph/recipes/structure/sketchpad.module.css'",
    )
    expect(source).toContain('export function Sketchpad({ label }: SketchpadProps)')
  })

  it("leaves the 'use client' decision open, and names the law that checks it", () => {
    const source = read('packages/react-ui/src/structure/Sketchpad.tsx')
    // Not marked: a stub needs nothing from a browser, and the law's second
    // direction fails on a directive that is not needed.
    expect(source.startsWith("'use client'")).toBe(false)
    expect(source).toContain('client-directive.test.ts')
  })

  it('writes the spec API in the grammar the staleness law parses', () => {
    const spec = read('design/components/sketchpad.md')
    // The fenced form, not a table. A fence that names the props type is read as
    // the component's API directly, while a table's other columns read as prose
    // to a person and as props to the parser.
    expect(spec).toContain('## API')
    expect(spec).toContain('```ts\ninterface SketchpadProps {')
    const api = spec.slice(spec.indexOf('## API'), spec.indexOf('## Recipes'))
    expect(api, 'the stub must not offer the misleading form').not.toContain('| Prop |')
  })

  it('declares a states fixture in the shape the completeness law reads', () => {
    const states = read('packages/react-ui/src/structure/sketchpad.states.tsx')
    expect(states).toContain("component: 'Sketchpad'")
    expect(states).toContain('entries: [')
    expect(states).toContain('requiredSelectors: []')
  })

  it('describes the member for the generated frameworks, as the stub component renders it', () => {
    const description = read('packages/shells/src/members/sketchpad.ts')
    expect(description).toContain("member: 'Sketchpad'")
    expect(description).toContain("dir: 'structure'")
    // The recipe the component imports, and the class and prop it renders.
    expect(description).toContain("recipe: 'structure/sketchpad'")
    expect(description).toContain(
      "el('div', { class: ['root'], attrs: { ...identity('Sketchpad') } }",
    )
    expect(description).toContain("[text('label')]")
    // One fixture entry, by the name the React fixture gives its one entry.
    expect(description).toContain("states: [{ name: 'default', props: { label: 'Sketchpad' } }]")
  })
})

describe('the four lists', () => {
  it('exports the pair from index.ts, in the tier and in order', () => {
    const index = read('packages/react-ui/src/index.ts')
    expect(index).toContain("export { Sketchpad } from './structure/Sketchpad'")
    expect(index).toContain("export type { SketchpadProps } from './structure/Sketchpad'")
    // Alphabetical inside the tier block, which is how the file is ordered.
    expect(index.indexOf('Skeleton')).toBeLessThan(index.indexOf('Sketchpad'))
    expect(index.indexOf('Sketchpad')).toBeLessThan(index.indexOf('Spinner'))
  })

  it('imports the fixture in galleries.ts and places it in the array', () => {
    const galleries = read('packages/react-ui/src/galleries.ts')
    expect(galleries).toContain(
      "import { states as sketchpad } from './structure/sketchpad.states'",
    )
    // The array's order is a reading order, so a generated member goes last,
    // in the same position in both arrays that pin it.
    expect(galleries).toMatch(/conversationPage,\n {2}sketchpad,\n]/)
  })

  it('names it in both of the arrays galleries.test.tsx pins', () => {
    const test = read('packages/react-ui/src/galleries.test.tsx')
    expect(test).toMatch(/'ConversationPage',\n {6}'Sketchpad',\n {4}\]/)
    expect(test).toMatch(/'conversation-page',\n {6}'sketchpad',\n {4}\]/)
  })

  it('registers the stylesheet in selectors.test.ts, both halves of the lookup', () => {
    const selectors = read('packages/react-ui/src/selectors.test.ts')
    expect(selectors).toContain(
      "import sketchpadCss from '@polymorph/recipes/structure/sketchpad.module.css?raw'",
    )
    expect(selectors).toContain("'sketchpad.module.css': sketchpadCss,")
    expect(selectors).toContain("Sketchpad: 'sketchpad.module.css',")
  })

  it('leaves the lists it did not add to untouched', () => {
    // The insert adds a line and rewrites nothing: everything that was in the
    // file is still there, in the same order.
    const galleries = read('packages/react-ui/src/galleries.ts')
    expect(galleries).toContain('  timeline,\n')
    expect(galleries.split('\n').filter((line) => line.includes('sketchpad'))).toHaveLength(2)
  })
})

describe('the platform map', () => {
  it('gives the member a native entry on the web and a DECIDE placeholder on the phones, in name order', () => {
    for (const file of PLATFORM_FILES) {
      const source = read(file)
      const map = JSON.parse(source) as { members: Record<string, unknown> }
      expect(map.members['Sketchpad'], file).toEqual(
        file.endsWith('/web.json') ? { status: 'native' } : UNDECIDED,
      )
      // Sorted by name, as the platform law requires, and written in the
      // file's own format, so prettier has nothing to change.
      const names = Object.keys(map.members)
      expect(names, file).toEqual([...names].sort((a, b) => a.localeCompare(b)))
      expect(source, file).toContain(
        `"Skeleton": {\n      "status": "native"\n    },\n${block(file)}`,
      )
    }
  })

  it('adds one block per file and rewrites nothing', () => {
    for (const file of PLATFORM_FILES) {
      const before = readFileSync(resolve(REPO, file), 'utf8')
      expect(read(file).replace(block(file), ''), file).toBe(before)
    }
  })
})

describe('the framework maps', () => {
  it('gives the member a DECIDE placeholder in every map, in name order', () => {
    for (const file of FRAMEWORK_FILES) {
      const source = read(file)
      const map = JSON.parse(source) as { members: Record<string, unknown> }
      expect(map.members['Sketchpad'], file).toEqual(UNDECIDED)
      const names = Object.keys(map.members)
      expect(names, file).toEqual([...names].sort((a, b) => a.localeCompare(b)))
    }
  })

  it('adds one block per map and rewrites nothing', () => {
    for (const file of FRAMEWORK_FILES) {
      const before = readFileSync(resolve(REPO, file), 'utf8')
      expect(read(file).replace(block(file), ''), file).toBe(before)
    }
  })
})

describe('the pending lists', () => {
  it("adds the member to each phone platform's list, in name order", () => {
    for (const { file, constant } of PENDING_LISTS) {
      const before = pendingNames(readFileSync(resolve(REPO, file), 'utf8'), constant)
      const after = pendingNames(read(file), constant)
      expect(after, file).toEqual([...before, 'Sketchpad'].sort((a, b) => a.localeCompare(b)))
    }
  })

  it('raises the count each law pins by one, and changes nothing else in the law', () => {
    for (const { law, count } of PENDING_LISTS) {
      const before = readFileSync(resolve(REPO, law), 'utf8')
      const after = read(law)
      expect(pinned(after, count), law).toBe(pinned(before, count) + 1)
      expect(after.replace(/^const \w+_COUNT = \d+$/m, ''), law).toBe(
        before.replace(/^const \w+_COUNT = \d+$/m, ''),
      )
    }
  })
})

describe('a member a platform or a framework already settles', () => {
  let other = ''

  beforeAll(() => {
    // Drawboard has a SwiftUI rendering, is absent on Android, and is absent
    // in every framework, as ImageEditor is in the frameworks.
    other = scratch()
    mkdirSync(resolve(other, 'platforms/ios/Sources/PolymorphUI'), { recursive: true })
    writeFileSync(resolve(other, 'platforms/ios/Sources/PolymorphUI/Drawboard.swift'), '')
    const settle = (file: string, entry: Record<string, string>) => {
      const map = JSON.parse(readFileSync(resolve(other, file), 'utf8')) as {
        members: Record<string, unknown>
      }
      map.members = Object.fromEntries(
        Object.entries({ ...map.members, Drawboard: entry }).sort(([a], [b]) => a.localeCompare(b)),
      )
      writeFileSync(resolve(other, file), `${JSON.stringify(map, null, 2)}\n`)
    }
    settle('design/platforms/android.json', {
      status: 'absent',
      reason: 'a test entry',
      substitute: 'none',
    })
    for (const file of FRAMEWORK_FILES) settle(file, { status: 'absent', reason: 'a test entry' })
  })

  afterAll(() => {
    rmSync(other, { recursive: true, force: true })
  })

  it('adds it to no pending list and raises no count', () => {
    const lists = PENDING_LISTS.flatMap(({ file, law }) => [file, law])
    const before = lists.map((file) => readFileSync(resolve(other, file), 'utf8'))
    expect(generateIn(other, 'Drawboard').status).toBe(0)
    expect(lists.map((file) => readFileSync(resolve(other, file), 'utf8'))).toEqual(before)
  })

  it('writes no description for a member every framework marks absent', () => {
    expect(existsSync(resolve(other, 'packages/shells/src/members/drawboard.ts'))).toBe(false)
    expect(existsSync(resolve(other, 'packages/react-ui/src/structure/Drawboard.tsx'))).toBe(true)
  })
})

describe('a name that is already a member', () => {
  it('refuses, and names both the collision and the way out', () => {
    const run = generate('Sketchpad')

    expect(run.status).toBe(1)
    expect(run.stderr).toContain('already exists')
    expect(run.stderr).toContain('packages/react-ui/src/structure/Sketchpad.tsx')
    expect(run.stderr).toContain('--rewire')
  })

  it('adds nothing twice when asked to rewire a member that is fully wired', () => {
    const before = WIRING.map(read)
    const run = generate('Sketchpad', '--rewire')

    expect(run.status).toBe(0)
    expect(run.stdout).toContain('wiring: already complete')
    expect(WIRING.map(read)).toEqual(before)
  })

  it('fills in one missing slot and only that slot, repairing a half-wired member', () => {
    // The exact state the wiring law fails on: the files present, and one list
    // missing an entry.
    const path = 'packages/react-ui/src/galleries.test.tsx'
    const whole = read(path)
    const opened = whole.replace("      'Sketchpad',\n", '')
    expect(opened, 'the entry to remove was not found').not.toBe(whole)
    writeFileSync(resolve(root, path), opened)

    const run = generate('Sketchpad', '--rewire')

    expect(run.status).toBe(0)
    expect(run.stdout).toContain('galleries.test.tsx')
    // Byte-identical to the fully wired file: the missing entry is restored in
    // its original position, and nothing else moves.
    expect(read(path)).toBe(whole)
  })

  it('restores a platform entry the same way', () => {
    const path = 'design/platforms/android.json'
    const whole = read(path)
    const opened = whole.replace(block(path), '')
    expect(opened, 'the entry to remove was not found').not.toBe(whole)
    writeFileSync(resolve(root, path), opened)

    const run = generate('Sketchpad', '--rewire')

    expect(run.status).toBe(0)
    expect(run.stdout).toContain('design/platforms/android.json')
    expect(read(path)).toBe(whole)
  })
})
