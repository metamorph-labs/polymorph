import { execSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * The server-rendering law for `'use client'` directives.
 *
 * A React Server Components consumer imports a component from a server module.
 * If that component uses a hook, attaches a handler, or touches the DOM, the
 * import fails at build time unless the module declares `'use client'`. The
 * directive is therefore part of the vocabulary's public contract, not a build
 * detail. A component that loses one breaks a consumer's build, not this
 * repository's tests, so without this law nothing here would notice.
 *
 * The law applies in **both directions**. A missing directive breaks RSC. An
 * unneeded one fails more quietly and costs more in total, because it pulls the
 * module and everything it imports into the client bundle. `Icon` is the
 * example: it takes a role and renders an `<svg>`, needs nothing from the
 * client, and stays a server component because this law forbids marking it.
 *
 * The heuristic below is the definition. It is intentionally simple and
 * visible, so widening it is a deliberate edit here and not a directive that
 * slips through in an unread diff.
 */

const ROOT = process.cwd()

/** Anything that calls a hook. `use[A-Z]` is React's own naming rule. */
const HOOK = /\buse[A-Z]\w*\s*\(/

/**
 * Anything that needs a browser. A JSX handler prop is included because a
 * server component can neither receive a function prop nor pass one to a DOM
 * element. Forwarding `onClick` is enough to make a module client-side.
 */
// Matched against code with its comments removed. A global name used as an
// object key (`document: FileText`, an icon role) is not the global. Two known
// limits: the bare-word globals still match English text in JSX (such as "the
// document root"), which is reworded at the call site instead of handled here,
// because a looser pattern would miss `typeof window` guards. And `git ls-files`
// cannot see a file until it is tracked, so a new module is first scanned one
// commit late.
const BROWSER =
  /\bon[A-Z]\w*\s*=[{=]|addEventListener|\bdocument\b(?!\s*:)|\bwindow\b(?!\s*:)|\bmatchMedia\b/

/** Source without its comments, so text in a comment never matches as code. */
const withoutComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')

/**
 * Libraries that only run on the client. `@polymorph/react/motion` is the
 * presence and indicator components; the engine's own motion module is not on
 * this list, because only the React half of it renders.
 */
const CLIENT_PACKAGE =
  /from '(@radix-ui\/|motion|react-aria|react-stately|@polymorph\/react\/motion)/

const DIRECTIVE = "'use client'"

/**
 * The vocabulary and the two packages it is built on. An RSC consumer's server
 * imports all three, so a directive in any of them is part of the contract.
 */
function vocabularyFiles(): string[] {
  const listed = execSync(
    'git ls-files ' +
      ['react-ui', 'react', 'engine']
        .flatMap((name) => [`'packages/${name}/src/**/*.ts'`, `'packages/${name}/src/**/*.tsx'`])
        .join(' '),
    { cwd: ROOT },
  )
    .toString()
    .split('\n')
    .filter(Boolean)

  // Tests never ship, so they never reach a consumer's server. A tracked file
  // the working tree has deleted or moved ships nowhere either.
  return listed.filter((file) => !/\.test\.tsx?$/.test(file) && existsSync(resolve(ROOT, file)))
}

interface Module {
  file: string
  needs: boolean
  has: boolean
  why: string[]
}

const modules: Module[] = vocabularyFiles().map((file) => {
  const source = readFileSync(resolve(ROOT, file), 'utf8')
  const why: string[] = []
  if (HOOK.test(source)) why.push('calls a hook')
  if (BROWSER.test(withoutComments(source))) why.push('needs a browser')
  if (CLIENT_PACKAGE.test(source)) why.push('imports a client-only substrate')

  return {
    file,
    needs: why.length > 0,
    has: source.startsWith(`${DIRECTIVE}\n`),
    why,
  }
})

describe('the vocabulary marks exactly the modules that run on the client', () => {
  it('finds the vocabulary, so a pass is meaningful', () => {
    expect(modules.length).toBeGreaterThan(100)
    expect(modules.some((module) => module.file.endsWith('controls/Button.tsx'))).toBe(true)
  })

  it('marks every module that needs a browser', () => {
    const unmarked = modules
      .filter((module) => module.needs && !module.has)
      .map((module) => `${module.file} — ${module.why.join(', ')}`)

    expect(unmarked, 'these break an RSC consumer’s build, and nothing else would say so').toEqual(
      [],
    )
  })

  it('leaves every module that does not need a browser unmarked', () => {
    const overmarked = modules
      .filter((module) => !module.needs && module.has)
      .map((module) => module.file)

    expect(
      overmarked,
      'a needless directive drags this module and its subtree into the client bundle',
    ).toEqual([])
  })

  it('puts the directive on the first line, where a bundler finds it', () => {
    for (const module of modules.filter((entry) => entry.has)) {
      const source = readFileSync(resolve(ROOT, module.file), 'utf8')
      const [first = '', second = ''] = source.split('\n')
      expect(first, module.file).toBe(DIRECTIVE)
      expect(second, `${module.file}: leave a blank line under the directive`).toBe('')
    }
  })

  it('keeps Icon a server component, as the no-unneeded-directive check requires', () => {
    const icon = modules.find((module) => module.file === 'packages/react/src/icon/Icon.tsx')
    expect(icon?.needs, 'Icon takes a role and renders an svg — it needs nothing').toBe(false)
    expect(icon?.has).toBe(false)
  })
})

/**
 * A compound member's parts are read from the member: `<Tabs.Content>`.
 *
 * A server component that imports a client module gets a reference to each of
 * its exports, and a reference has no properties, so `Tabs.Content` would be
 * `undefined` there and the page would fail to render. A member with parts is
 * therefore declared in a module without the directive, which attaches the
 * parts, and its root and parts are in a client module beside it when they
 * need a browser (`overlays/Tabs.tsx` and `overlays/tabs-parts.tsx`).
 *
 * A part is attached by assignment (`Tabs.Content = TabsContent`) or with
 * `Object.assign`. A part's name starts with a capital, which tells it from a
 * static value such as `controlKind`, which only a client module reads.
 */
const ATTACHES_PART = /^[A-Z]\w*\.[A-Z]\w*\s*=[^=]|\bObject\.assign\(\s*[A-Z]\w*\s*,\s*\{\s*[A-Z]/m

describe('a server component can read a compound member’s parts', () => {
  const compound = vocabularyFiles().filter(
    (file) =>
      file.startsWith('packages/react-ui/src/') &&
      !/\.states\.tsx$/.test(file) &&
      ATTACHES_PART.test(withoutComments(readFileSync(resolve(ROOT, file), 'utf8'))),
  )

  it('finds the compound members, so a pass is meaningful', () => {
    expect(compound).toEqual(
      expect.arrayContaining([
        'packages/react-ui/src/overlays/Tabs.tsx',
        'packages/react-ui/src/structure/Table.tsx',
        'packages/react-ui/src/archetypes/Dashboard.tsx',
      ]),
    )
  })

  it('attaches every part in a module without the directive', () => {
    const marked = compound.filter((file) =>
      readFileSync(resolve(ROOT, file), 'utf8').startsWith(`${DIRECTIVE}\n`),
    )
    expect(
      marked,
      'a server component reads `undefined` for a part attached in a client module',
    ).toEqual([])
  })
})
