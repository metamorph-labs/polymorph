import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, resolve } from 'node:path'

import { buildRegistry, type Registry } from '@polymorph/registry'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { applyPlan } from './apply'
import { run } from './cli'
import { tokenValuesIn } from './emit'
import { digest, readManifest } from './manifest'
import { PatchError } from './patch'
import { planInstall } from './plan'
import { diffInstall, updateInstall } from './status'

/**
 * Installing, and then maintaining the install.
 *
 * Most of this file tests what happens after `add`, when the consumer has
 * edited a vendored file and the registry has changed. Vendored source is
 * *their* code. An installer that treats it as a cache to refresh will
 * eventually delete somebody's work without saying so. The tests below create
 * that collision on purpose.
 *
 * The upstream side is a **copy** of this repository's source tree, so a test
 * can change the registry: it edits the copy and checks that the install
 * notices. Reading the real tree would only allow testing changes on the
 * consumer's side.
 */

const ROOT = resolve(import.meta.dirname, '../../..')
const registry: Registry = buildRegistry(ROOT)

const temporaries: string[] = []

function temporary(prefix: string): string {
  const path = mkdtempSync(resolve(tmpdir(), `polymorph-${prefix}-`))
  temporaries.push(path)
  return path
}

afterAll(() => {
  // Make the tree writable before removing it. `rmSync`'s `force` ignores a
  // missing file, but not a directory it cannot write into.
  if (frozen !== null) setWritable(frozen, true)
  for (const path of temporaries) rmSync(path, { recursive: true, force: true })
})

/** A copy of the source an install reads from, so tests can change it. */
function sourceCopy(): string {
  const path = temporary('source')
  for (const directory of [
    'packages/react-ui/src',
    'packages/recipes/src',
    'design/systems',
    'design/palettes',
  ]) {
    cpSync(resolve(ROOT, directory), resolve(path, directory), { recursive: true })
  }
  return path
}

/**
 * The upstream tree, copied once.
 *
 * The copy is hundreds of files, and most tests here only read it. Copying it
 * before every test would spend much of this file's runtime rebuilding the same
 * tree. It is copied once, and the few tests that change the upstream tree get
 * their own copy from `mutableSource()`.
 *
 * The shared copy is made read-only, which makes sharing it safe and not only
 * fast. A test that writes into it by mistake gets `EACCES` at the write, on the
 * line that caused the failure. An unprotected shared tree would corrupt every
 * later test in file order and blame one of them. The permission enforces what
 * would otherwise be a convention in a comment.
 */
let pristine: string | null = null
let frozen: string | null = null

function pristineSource(): string {
  if (pristine === null) {
    pristine = sourceCopy()
    setWritable(pristine, false)
    frozen = pristine
  }
  return pristine
}

/** A private tree for a test that changes upstream on purpose. */
function mutableSource(): string {
  source = sourceCopy()
  return source
}

/** Deepest-first to freeze, shallowest-first to thaw, so traversal never fails. */
function setWritable(root: string, writable: boolean): void {
  const paths = readdirSync(root, { recursive: true, encoding: 'utf8' }).map((entry) =>
    resolve(root, entry),
  )
  const order = writable ? [root, ...paths] : [...paths.reverse(), root]
  for (const path of order) chmodSync(path, writable ? 0o755 : 0o555)
}

/** A minimal Vite app, of the shape `create-vite` leaves behind. */
function consumer(): string {
  const path = temporary('app')
  write(path, 'package.json', '{\n  "name": "app",\n  "dependencies": {}\n}\n')
  write(
    path,
    'index.html',
    '<!doctype html>\n<html>\n  <head>\n    <title>App</title>\n  </head>\n  <body><div id="root"></div></body>\n</html>\n',
  )
  write(
    path,
    'src/main.tsx',
    "import { createRoot } from 'react-dom/client'\n\ncreateRoot(document.body).render(null)\n",
  )
  return path
}

function write(root: string, path: string, contents: string): void {
  mkdirSync(dirname(resolve(root, path)), { recursive: true })
  writeFileSync(resolve(root, path), contents)
}

function read(root: string, path: string): string {
  return readFileSync(resolve(root, path), 'utf8')
}

let app: string
let source: string

beforeEach(() => {
  app = consumer()
  source = pristineSource()
})

const install = (items: string[], force = false) =>
  applyPlan(app, source, registry, planInstall(registry, items), { force })

/** Everything under a root, so a test can say "and nothing else happened". */
const tree = (root: string): string[] =>
  readdirSync(root, { recursive: true, encoding: 'utf8' }).sort()

describe('polymorph add', () => {
  it('writes the closure, the manifest and the lint rules', () => {
    const result = install(['button'])

    expect(read(app, 'src/polymorph/controls/Button.tsx')).toContain('export function Button')
    expect(read(app, 'src/polymorph/conventions/focus.module.css')).toContain(':focus-visible')

    // The rules are written and also linked into the consumer's configs.
    expect(read(app, 'polymorph.eslint.js')).toContain('@polymorph/rules/eslint')
    expect(read(app, 'eslint.config.js')).toContain('polymorph.eslint.js')
    expect(read(app, 'stylelint.config.js')).toContain('polymorph.stylelint.js')
    expect(result.patched).toContain('eslint.config.js')

    const manifest = readManifest(app)
    expect(manifest?.components).toEqual(['Button'])
    expect(manifest?.files['src/polymorph/controls/Button.tsx']?.source).toBe(
      'packages/react-ui/src/controls/Button.tsx',
    )
    expect(manifest?.files['src/polymorph/controls/button.module.css']?.source).toBe(
      'packages/recipes/src/controls/button.module.css',
    )
  })

  it('copies the recipe beside its member and imports the copy', () => {
    install(['button'])
    // The member imports its recipe from `@polymorph/recipes` here. The copy
    // imports the file beside it, so the consumer installs no recipes package.
    const button = read(app, 'src/polymorph/controls/Button.tsx')
    expect(button).toContain("import styles from './button.module.css'")
    expect(button).not.toContain('@polymorph/recipes')
    expect(read(app, 'src/polymorph/controls/button.module.css')).toContain('.button')
    expect(readManifest(app)?.files['src/polymorph/controls/Button.tsx']?.hash).toBe(digest(button))
    // And the rewrite is not mistaken for a change on either side.
    const states = new Map(diffInstall(app, source, registry).files.map((f) => [f.path, f.state]))
    expect(states.get('src/polymorph/controls/Button.tsx')).toBe('clean')
  })

  it('writes the installed theme’s values into both lint configs, and keeps them', () => {
    install(['button'])
    // No system to read yet: the configs carry the registry's values for the
    // default system, so a report still names a step and not only the family.
    const plain = registry.theme.systems.find((system) => system.name === 'plain')?.tokenValues
    expect(plain?.space['--pm-space-4']).toBeDefined()
    for (const config of ['polymorph.eslint.js', 'polymorph.stylelint.js']) {
      expect(read(app, config)).not.toContain('const VALUES = {}\n')
      expect(read(app, config)).toContain(`'--pm-space-4': '${plain?.space['--pm-space-4']}',`)
      expect(read(app, config)).toContain(`'--pm-accent-bg': '${plain?.color['--pm-accent-bg']}',`)
    }

    // The values are the compiled sheet's own, so a report names the token at
    // the value this app renders, not the value some other pairing has.
    install(['theme:pastel'])
    const values = tokenValuesIn(read(app, 'src/polymorph/themes/theme.css'))
    const accent = values.color?.['--pm-accent-bg']
    const step = values.space?.['--pm-space-4']
    expect(accent).toBeDefined()
    expect(accent).not.toBe(plain?.color['--pm-accent-bg'])
    expect(step).toBeDefined()
    for (const config of ['polymorph.eslint.js', 'polymorph.stylelint.js']) {
      expect(read(app, config)).toContain(`'--pm-accent-bg': '${accent}',`)
      expect(read(app, config)).toContain(`'--pm-space-4': '${step}',`)
    }

    // An install that adds no theme reads the sheet already installed, so it
    // rewrites the configs without emptying them.
    install(['dialog'])
    expect(read(app, 'polymorph.stylelint.js')).toContain(`'--pm-accent-bg': '${accent}',`)
    expect(read(app, 'polymorph.eslint.js')).toContain(`'--pm-space-4': '${step}',`)
  })

  it('installs a palette’s more-contrast partner beside it and compiles it under the query', () => {
    // No shipped palette names a partner, so the upstream copy and the registry
    // are given one: orchid gives way to iris.
    source = mutableSource()
    const orchid = JSON.parse(read(source, 'design/palettes/orchid.json')) as object
    write(
      source,
      'design/palettes/orchid.json',
      JSON.stringify({ ...orchid, moreContrast: 'iris' }),
    )
    const naming: Registry = {
      ...registry,
      theme: {
        ...registry.theme,
        palettes: registry.theme.palettes.map((palette) =>
          palette.name === 'orchid' ? { ...palette, moreContrast: 'iris' } : palette,
        ),
      },
    }
    applyPlan(app, source, naming, planInstall(naming, ['theme:pastel', 'palette:orchid']))

    expect(readManifest(app)?.palettes).toEqual(['amethyst', 'iris', 'orchid'])
    const sheet = read(app, 'src/polymorph/themes/pairings/pastel--orchid.css')
    expect(sheet).toContain('@media (prefers-contrast: more), (forced-colors: active)')
    // amethyst names no partner, so the main sheet has no query.
    expect(read(app, 'src/polymorph/themes/theme.css')).not.toContain('prefers-contrast')
  })

  it('refuses to compile a palette whose partner is not installed', () => {
    // The plan comes from a registry that does not know of the partner, so
    // iris is not installed, and admission refuses orchid without it.
    source = mutableSource()
    const orchid = JSON.parse(read(source, 'design/palettes/orchid.json')) as object
    write(
      source,
      'design/palettes/orchid.json',
      JSON.stringify({ ...orchid, moreContrast: 'iris' }),
    )
    expect(() => install(['theme:pastel', 'palette:orchid'])).toThrow(
      /pastel × orchid does not admit —\n {2}schema: moreContrast: "orchid" names "iris"/,
    )
  })

  it('gives an install whose sheet holds no pairing the default system’s values', () => {
    // A palette with no system compiles an empty main sheet, as in an app that
    // builds its own theme at run time. The fragment's header says whose values
    // these are.
    install(['palette:orchid'])
    expect(read(app, 'src/polymorph/themes/theme.css')).toBe('')
    const plain = registry.theme.systems.find((system) => system.name === 'plain')?.tokenValues
    const eslint = read(app, 'polymorph.eslint.js')
    expect(eslint).toContain(`'--pm-accent-bg': '${plain?.color['--pm-accent-bg']}',`)
    expect(eslint).toContain("gets the registry's values for\n * `plain` with its own palette")
  })

  it('writes the base layer and makes the generated module import it first', () => {
    install(['button', 'theme:pastel'])

    // On disk, and tracked like any other vendored file, so an edit to it is
    // kept and an upstream change to it is applied.
    expect(read(app, 'src/polymorph/base.css')).toContain('box-sizing: border-box')
    expect(readManifest(app)?.files['src/polymorph/base.css']?.source).toBe(
      'packages/recipes/src/base.css',
    )

    // Imported from the one module every consumer loads at their entry. A
    // vendored file that nothing imports breaks the install as much as a missing
    // file.
    const module_ = read(app, 'src/polymorph/themes/index.ts')
    expect(module_).toContain("import '../base.css'")
    expect(module_.indexOf("import '../base.css'")).toBeLessThan(module_.indexOf('@fontsource'))
  })

  it('keeps the base layer through an update rather than pruning it', () => {
    // It reaches the manifest by a different path from the closure files, so
    // `prune` must be told it is still carried. Otherwise the first update after
    // an install silently deletes the base layer.
    install(['button', 'theme:pastel'])
    const result = updateInstall(app, source, registry)

    expect(result.removed).not.toContain('src/polymorph/base.css')
    expect(existsSync(resolve(app, 'src/polymorph/base.css'))).toBe(true)
    expect(read(app, 'src/polymorph/themes/index.ts')).toContain("import '../base.css'")
  })

  it('keeps a file that was at an install path before the install', () => {
    // The consumer's own component, under a directory they already use. The
    // manifest has no record of it, so the installer has no claim to replace it,
    // and replacing it would delete work the installer never wrote.
    const theirs = 'export const Button = () => null\n'
    write(app, 'src/components/controls/Button.tsx', theirs)

    const result = applyPlan(
      app,
      source,
      registry,
      planInstall(registry, ['button'], { dir: 'src/components' }),
    )

    expect(result.skipped).toEqual(['src/components/controls/Button.tsx'])
    expect(read(app, 'src/components/controls/Button.tsx')).toBe(theirs)
    // Kept and not adopted. The manifest does not claim a file the install did not write.
    expect(readManifest(app)?.files['src/components/controls/Button.tsx']).toBeUndefined()
    expect(result.written).toContain('src/components/controls/button.module.css')
  })

  it('adopts a file that already matches what it would write', () => {
    // A vendored tree whose manifest was lost. Unedited files are byte-identical
    // to the source, so adopting them loses nothing. An edited one is kept.
    install(['button'])
    rmSync(resolve(app, 'polymorph.json'))
    const edited = `${read(app, 'src/polymorph/controls/Button.tsx')}\n// mine\n`
    writeFileSync(resolve(app, 'src/polymorph/controls/Button.tsx'), edited)

    const result = install(['button'])

    expect(result.skipped).toEqual(['src/polymorph/controls/Button.tsx'])
    expect(read(app, 'src/polymorph/controls/Button.tsx')).toBe(edited)
    expect(readManifest(app)?.files['src/polymorph/controls/button.module.css']).toBeDefined()
  })

  it('is idempotent: a second run changes nothing', () => {
    install(['button'])
    const before = read(app, 'polymorph.json')
    const html = read(app, 'index.html')

    install(['button'])
    expect(read(app, 'polymorph.json')).toBe(before)
    expect(read(app, 'index.html')).toBe(html)
  })

  it('adds to an existing install instead of replacing it', () => {
    install(['button'])
    install(['theme:pastel'])

    expect(readManifest(app)?.components).toEqual(['Button'])
    expect(readManifest(app)?.systems).toEqual(['pastel'])
    expect(readManifest(app)?.palettes).toEqual(['amethyst'])
    expect(read(app, 'src/polymorph/controls/Button.tsx')).toContain('export function Button')
  })

  it('adds a second system to the module the first one generated', () => {
    install(['theme:pastel'])
    install(['theme:journal'])

    const sheet = read(app, 'src/polymorph/themes/theme.css')
    // Recompiled from everything installed, not from this plan. Otherwise the
    // second install would silently uninstall the first.
    expect(sheet).toContain('[data-system="pastel"][data-palette="amethyst"]')
    expect(sheet).toContain('[data-system="journal"][data-palette="umber"]')
    expect(read(app, 'src/polymorph/themes/index.ts')).toContain(
      '"systems":{"journal":"umber","pastel":"amethyst"}',
    )
    // The manifest sorts, so this is alphabetical rather than install order.
    expect(readManifest(app)?.systems).toEqual(['journal', 'pastel'])
    expect(readManifest(app)?.palettes).toEqual(['amethyst', 'umber'])
  })

  it('adds a palette to a system that did not declare it, and keeps it lazy', () => {
    install(['theme:pastel'])
    install(['palette:orchid'])

    expect(JSON.parse(read(app, 'src/polymorph/themes/palettes/orchid.json'))).toMatchObject({
      name: 'orchid',
    })
    const module_ = read(app, 'src/polymorph/themes/index.ts')
    // Installed and reachable through `ensurePairing` and its own sheet. The
    // main sheet still holds one block per system.
    expect(module_).toContain("'pastel/orchid': () => import('./pairings/pastel--orchid')")
    expect(read(app, 'src/polymorph/themes/pairings/pastel--orchid.css')).toContain(
      '[data-system="pastel"][data-palette="orchid"]',
    )
    expect(read(app, 'src/polymorph/themes/theme.css')).not.toContain('[data-palette="orchid"]')
    expect(readManifest(app)?.palettes).toEqual(['amethyst', 'orchid'])
    expect(readManifest(app)?.systems).toEqual(['pastel'])
  })

  it('vendors the exception ladder’s primitives, and keeps them through an update', () => {
    // The rung the installed rules point at, installed by the same command as
    // the member. It is recorded as a member asked for by name, so later
    // commands treat it as one: `update` replays the name, finds it still
    // shipped, and re-vendors it instead of pruning it.
    install(['button', 'bespoke'])

    const zone = 'src/polymorph/exceptions/Bespoke.tsx'
    expect(read(app, zone)).toContain('export function Bespoke')
    expect(read(app, 'src/polymorph/exceptions/bespoke.module.css')).toContain('display: contents')
    expect(readManifest(app)?.components).toEqual(['Bespoke', 'Button'])
    expect(readManifest(app)?.files[zone]?.source).toBe(
      'packages/react-ui/src/exceptions/Bespoke.tsx',
    )

    const result = updateInstall(app, source, registry)
    expect(result.removed).toEqual([])
    expect(result.notes.join('\n')).not.toContain('no longer ships')
    expect(existsSync(resolve(app, zone))).toBe(true)
    expect(readManifest(app)?.components).toEqual(['Bespoke', 'Button'])
  })
})

describe('polymorph help', () => {
  it('names every primitive of the exception ladder that `add` installs', () => {
    // The rules answer a report with a primitive by name, and the help is where
    // a consumer reads what `add` takes. The list is the registry's, so a
    // primitive the registry gains is one the help must name.
    const lines: string[] = []
    const { code } = run({ root: app, source, registry, out: (line) => lines.push(line) }, ['help'])
    expect(code).toBe(0)

    const primitives = registry.exceptions.primitives.map((primitive) => primitive.name)
    expect(primitives).toContain('ThirdParty')
    for (const name of primitives) {
      const item = name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()
      expect(lines.join('\n'), name).toContain(`\`${item}\``)
      expect(planInstall(registry, [item]).requested, item).toEqual([name])
    }
  })
})

describe('the install stays inside the repository', () => {
  const lines: string[] = []
  const polymorph = (argv: string[]) => {
    lines.length = 0
    return run({ root: app, source, registry, out: (line) => lines.push(line) }, argv)
  }

  it('refuses a directory that climbs out, and changes nothing', () => {
    const before = tree(app)
    const escape = resolve(app, '../../escape')

    expect(polymorph(['add', 'button', '--dir', '../../escape']).code).toBe(1)

    expect(lines.join('\n')).toContain('must stay inside your repository')
    expect(existsSync(escape)).toBe(false)
    expect(tree(app)).toEqual(before)
  })

  it('refuses an absolute directory', () => {
    const escape = resolve(tmpdir(), 'polymorph-absolute-escape')
    expect(polymorph(['add', 'button', '--dir', escape]).code).toBe(1)
    expect(existsSync(escape)).toBe(false)
  })

  it('refuses it on a dry run too, which prints the plan', () => {
    // A dry run prints the plan. Refusing only at the write would still print
    // eight paths outside the repository.
    expect(polymorph(['add', 'button', '--dir', '../../escape', '--dry-run']).code).toBe(1)
    expect(lines.join('\n')).not.toContain('../../escape/controls/Button.tsx')
  })

  it('refuses a manifest that was edited to point outside', () => {
    install(['button'])
    const manifest = JSON.parse(read(app, 'polymorph.json')) as { dir: string }
    write(app, 'polymorph.json', JSON.stringify({ ...manifest, dir: '../../escape' }))

    expect(() => updateInstall(app, source, registry)).toThrow('must stay inside your repository')
  })

  /*
   * `dir` is one way out of the repository, and the *file keys* are another. A
   * `prune` that tested them with a string prefix against the install directory
   * and resolved them afterwards would let `src/polymorph/../../../victim` pass
   * the test, resolve outside the repository, and be deleted by `--force`. A
   * committed, hand-editable file that arrives through a pull request is not a
   * trusted input, and one of the things it reaches is `rmSync`.
   */
  const tampered = (path: string): void => {
    install(['button'])
    const manifest = JSON.parse(read(app, 'polymorph.json')) as {
      files: Record<string, { hash: string; source: string | null }>
    }
    manifest.files[path] = { hash: digest('anything'), source: null }
    write(app, 'polymorph.json', JSON.stringify(manifest, null, 2))
  }

  /** A file outside the app, and the manifest key that resolves to it. */
  const outside = () => {
    const name = `${basename(app)}-victim.txt`
    return { path: resolve(app, `../${name}`), key: `src/polymorph/../../../${name}` }
  }

  it('refuses a manifest whose file key climbs out of the repository', () => {
    const victim = outside()
    tampered(victim.key)

    // Refused whole, at the read, with the key named. It is not filtered
    // silently or left to whichever caller resolves it first.
    expect(() => readManifest(app)).toThrow('must stay inside your repository')
    expect(() => readManifest(app)).toThrow(victim.key)
    expect(() => diffInstall(app, source, registry)).toThrow('must stay inside your repository')
  })

  it('refuses an absolute file key too', () => {
    tampered(resolve(tmpdir(), 'polymorph-absolute-victim.txt'))
    expect(() => readManifest(app)).toThrow('must stay inside your repository')
  })

  it('never deletes a file outside the repository, even with --force', () => {
    // `prune` is the destructive path. Testing a key with a string prefix
    // against the install directory and resolving it afterwards would let this
    // key pass and delete a file outside. The refusal at the read makes that
    // path unreachable, because `update` never gets far enough to resolve the
    // key.
    const victim = outside()
    writeFileSync(victim.path, 'precious\n')
    tampered(victim.key)

    for (const force of [false, true]) {
      expect(() => updateInstall(app, source, registry, { force })).toThrow(
        'must stay inside your repository',
      )
      expect(existsSync(victim.path), `--force ${String(force)}`).toBe(true)
    }

    expect(readFileSync(victim.path, 'utf8')).toBe('precious\n')
    rmSync(victim.path)
  })
})

describe('add and update refuse a checkout of polymorph', () => {
  const lines: string[] = []
  const polymorph = (root: string, from: string, argv: string[]) => {
    lines.length = 0
    return run({ root, source: from, registry, out: (line) => lines.push(line) }, argv)
  }

  it('refuses the checkout the CLI reads from, and a directory inside it, writing nothing', () => {
    // A stand-in for the checkout: nothing is read from it before the refusal.
    const checkout = temporary('checkout')
    write(checkout, 'apps/app/package.json', '{}\n')
    for (const root of [checkout, resolve(checkout, 'apps/app')]) {
      for (const argv of [['add', 'button'], ['update']]) {
        expect(polymorph(root, checkout, argv).code, `${root} ${argv[0] ?? ''}`).toBe(1)
        expect(lines.join('\n')).toContain('is in a checkout of polymorph')
      }
    }
    expect(tree(checkout)).toEqual(['apps', 'apps/app', 'apps/app/package.json'])
  })

  it('refuses another clone, which holds the base layer where the registry reads it', () => {
    const clone = temporary('clone')
    write(clone, 'package.json', '{}\n')
    write(clone, registry.vendor.base, 'html {}\n')
    expect(polymorph(clone, source, ['add', 'button']).code).toBe(1)
    expect(existsSync(resolve(clone, 'polymorph.json'))).toBe(false)
  })

  it('refuses a directory inside another clone, as init does', () => {
    // `apps/workbench` in a second clone: the base layer is two levels up.
    const clone = temporary('clone')
    write(clone, registry.vendor.base, 'html {}\n')
    write(clone, 'apps/workbench/package.json', '{}\n')
    const nested = resolve(clone, 'apps/workbench')
    for (const argv of [['add', 'button'], ['update']]) {
      expect(polymorph(nested, source, argv).code, argv[0]).toBe(1)
      expect(lines.join('\n')).toContain(`is in a checkout of polymorph (${realpathSync(clone)})`)
    }
    expect(tree(nested)).toEqual(['package.json'])
  })

  it('still prints a dry run in the checkout, which writes nothing', () => {
    expect(polymorph(ROOT, ROOT, ['add', 'button', '--dry-run']).code).toBe(0)
    expect(lines.join('\n')).toContain('src/polymorph/controls/Button.tsx')
  })
})

describe("the application's own ESLint config", () => {
  /** What `create-next-app` writes: the config is `eslint.config.mjs`. */
  const NEXT = "import next from 'eslint-config-next'\n\nexport default [\n  ...next,\n]\n"

  it('links the rules into the config the application has, and writes no second one', () => {
    write(app, 'eslint.config.mjs', NEXT)
    const result = install(['theme:plain'])

    expect(read(app, 'eslint.config.mjs')).toContain(
      "import polymorph from './polymorph.eslint.js'",
    )
    expect(read(app, 'eslint.config.mjs')).toContain('...polymorph,\n  ...next,')
    expect(result.patched).toContain('eslint.config.mjs')
    // ESLint reads `eslint.config.js` first, so one written here would replace theirs.
    expect(existsSync(resolve(app, 'eslint.config.js'))).toBe(false)
  })

  it('names that config when it cannot edit it', () => {
    write(app, 'eslint.config.mjs', 'const config = {}\n')
    expect(() => install(['theme:plain'])).toThrow('cannot edit eslint.config.mjs')
  })
})

describe('an install that fails partway through', () => {
  /** No `export default` to splice into, so `linkEslintConfig` throws. */
  const UNPATCHABLE = 'module.exports = { rules: {} }\n'
  const BUTTON = 'src/polymorph/controls/Button.tsx'

  it('has already written the manifest, so every file it wrote is tracked', () => {
    write(app, 'eslint.config.js', UNPATCHABLE)
    expect(() => install(['button'])).toThrow(PatchError)

    // The files are on disk and the patch never ran. If the manifest were
    // written last, it would not exist, and none of these files would be tracked.
    const manifest = readManifest(app)
    expect(manifest?.files[BUTTON]?.source).toBe('packages/react-ui/src/controls/Button.tsx')
    expect(manifest?.files[BUTTON]?.hash).toBe(digest(read(app, BUTTON)))
    for (const file of planInstall(registry, ['button']).files) {
      expect(manifest?.files[file.to], file.to).toBeDefined()
    }
  })

  it('keeps an edit made before the retry, which an untracked install would overwrite', () => {
    write(app, 'eslint.config.js', UNPATCHABLE)
    expect(() => install(['button'])).toThrow(PatchError)

    const theirs = `${read(app, BUTTON)}\n// mine\n`
    writeFileSync(resolve(app, BUTTON), theirs)

    write(app, 'eslint.config.js', 'export default []\n')
    const result = install(['button'])

    expect(result.skipped).toContain(BUTTON)
    expect(read(app, BUTTON)).toBe(theirs)
    expect(result.patched).toContain('eslint.config.js')
  })
})

describe('a theme install includes everything it needs to render', () => {
  it('brings both halves, the fonts, the pre-paint script and the call that runs it', () => {
    install(['theme:pastel'])

    expect(JSON.parse(read(app, 'src/polymorph/themes/systems/pastel.json'))).toMatchObject({
      name: 'pastel',
      defaultPalette: 'amethyst',
    })
    expect(JSON.parse(read(app, 'src/polymorph/themes/palettes/amethyst.json'))).toMatchObject({
      name: 'amethyst',
    })

    const dependencies = (
      JSON.parse(read(app, 'package.json')) as {
        dependencies: Record<string, string>
      }
    ).dependencies
    expect(dependencies['@fontsource-variable/plus-jakarta-sans']).toMatch(/^\^\d/)
    expect(dependencies['@fontsource-variable/fira-code']).toMatch(/^\^\d/)

    // Before first paint. Otherwise the page renders once in the wrong theme and
    // then corrects itself, and the script exists to prevent that flash.
    const html = read(app, 'index.html')
    expect(html).toContain('data-polymorph="prepaint"')
    expect(html.indexOf('data-polymorph')).toBeLessThan(html.indexOf('<title'))

    // If nothing calls the generated module, the theme never renders: the fonts
    // are installed, the stylesheet is never built, and the page shows Helvetica.
    const entry = read(app, 'src/main.tsx')
    expect(entry).toContain("import { installThemes } from './polymorph/themes'")
    expect(entry.indexOf('installThemes()')).toBeLessThan(entry.indexOf('createRoot(document'))
  })

  it('adds a note when there is no entry to call it from', () => {
    rmSync(resolve(app, 'src/main.tsx'))
    const result = install(['theme:pastel'])
    expect(result.notes.join(' ')).toContain('installThemes()')
  })

  it('leaves the entry alone when the manifest says the application installs its themes', () => {
    install(['theme:pastel'])
    // An application that installs its themes from a module of its own
    // removes the call. Without the field, every update puts it back.
    const own = "import { installOwnThemes } from './own-theme'\n\ninstallOwnThemes()\n"
    write(app, 'src/main.tsx', own)
    updateInstall(app, source, registry)
    expect(read(app, 'src/main.tsx')).toContain('installThemes()')

    write(app, 'src/main.tsx', own)
    const manifest = JSON.parse(read(app, 'polymorph.json')) as Record<string, unknown>
    write(app, 'polymorph.json', JSON.stringify({ ...manifest, appInstallsThemes: true }))

    const updated = updateInstall(app, source, registry)
    install(['palette:orchid'])
    expect(read(app, 'src/main.tsx')).toBe(own)
    expect(updated.patched).not.toContain('src/main.tsx')
    // The field survives the manifest's rewrites, and nothing else about the
    // theme changes: it is compiled, and the pre-paint script is in place.
    expect(readManifest(app)?.appInstallsThemes).toBe(true)
    expect(read(app, 'polymorph.json')).toContain('"appInstallsThemes": true')
    expect(read(app, 'src/polymorph/themes/theme.css')).toContain('[data-system="pastel"]')
    expect(read(app, 'index.html')).toContain('data-polymorph="prepaint"')
  })
})

describe('polymorph diff', () => {
  it('reports a clean install as clean', () => {
    install(['button'])
    const report = diffInstall(app, source, registry)
    expect(
      report.files.filter((file) => file.state !== 'clean' && file.state !== 'generated'),
    ).toEqual([])
    expect(report.installed).toBe(report.available)
  })

  it('tells their edit from our change, and from both at once', () => {
    mutableSource()
    install(['button'])

    const mine = 'src/polymorph/controls/Button.tsx'
    const ours = 'src/polymorph/layout/Inline.tsx'
    const both = 'src/polymorph/controls/button.module.css'

    // Theirs.
    writeFileSync(resolve(app, mine), `${read(app, mine)}\n// mine\n`)
    // Ours: the upstream copy changes and the installed file does not.
    const upstream = 'packages/react-ui/src/layout/Inline.tsx'
    writeFileSync(resolve(source, upstream), `${read(source, upstream)}\n// upstream\n`)
    // Both.
    writeFileSync(resolve(app, both), `${read(app, both)}\n/* mine */\n`)
    const upstreamCss = 'packages/recipes/src/controls/button.module.css'
    writeFileSync(resolve(source, upstreamCss), `${read(source, upstreamCss)}\n/* upstream */\n`)

    const states = new Map(diffInstall(app, source, registry).files.map((f) => [f.path, f.state]))
    expect(states.get(mine)).toBe('edited')
    expect(states.get(ours)).toBe('upstream')
    expect(states.get(both)).toBe('diverged')
    expect(states.get('src/polymorph/conventions/focus.module.css')).toBe('clean')
  })

  it('notices a file that was deleted', () => {
    install(['button'])
    rmSync(resolve(app, 'src/polymorph/controls/button.module.css'))
    const states = new Map(diffInstall(app, source, registry).files.map((f) => [f.path, f.state]))
    expect(states.get('src/polymorph/controls/button.module.css')).toBe('missing')
  })

  it('reports a file deleted upstream as removed, not unchanged', () => {
    mutableSource()
    install(['button'])
    rmSync(resolve(source, 'packages/react-ui/src/layout/Inline.tsx'))

    // The recorded hash must not substitute for the missing source. The file
    // would compare equal to itself and always report clean.
    const states = new Map(diffInstall(app, source, registry).files.map((f) => [f.path, f.state]))
    expect(states.get('src/polymorph/layout/Inline.tsx')).toBe('removed')
  })

  it('does not report edits to generated files', () => {
    install(['theme:pastel'])
    writeFileSync(resolve(app, 'polymorph.eslint.js'), '// scribbled on\n')
    const states = new Map(diffInstall(app, source, registry).files.map((f) => [f.path, f.state]))
    expect(states.get('polymorph.eslint.js')).toBe('generated')
  })

  it('refuses to report on a directory nothing was installed into', () => {
    expect(() => diffInstall(consumer(), source, registry)).toThrow('nothing has been installed')
  })
})

describe('polymorph update', () => {
  it('takes our change and keeps their edit', () => {
    mutableSource()
    install(['button'])

    const mine = 'src/polymorph/controls/Button.tsx'
    const theirs = `${read(app, mine)}\n// mine\n`
    writeFileSync(resolve(app, mine), theirs)

    const upstream = 'packages/react-ui/src/layout/Inline.tsx'
    writeFileSync(resolve(source, upstream), `${read(source, upstream)}\n// upstream\n`)

    const result = updateInstall(app, source, registry)

    expect(result.skipped).toContain(mine)
    expect(read(app, mine)).toBe(theirs)
    expect(read(app, 'src/polymorph/layout/Inline.tsx')).toContain('// upstream')
  })

  it('applies ours under --force, and lists the files it wrote', () => {
    install(['button'])
    const mine = 'src/polymorph/controls/Button.tsx'
    writeFileSync(resolve(app, mine), '// gone\n')

    const result = updateInstall(app, source, registry, { force: true })
    expect(result.skipped).toEqual([])
    expect(result.written).toContain(mine)
    expect(read(app, mine)).toContain('export function Button')
  })

  it('restores a file the consumer deleted', () => {
    install(['button'])
    rmSync(resolve(app, 'src/polymorph/controls/button.module.css'))
    updateInstall(app, source, registry)
    expect(read(app, 'src/polymorph/controls/button.module.css')).toContain('.button')
  })

  it('picks up a file that did not exist at install time', () => {
    // Replayed from the manifest's *requested* items, not its file list, so
    // files added to a closure are picked up. Replaying the file list would keep
    // the install at its original shape.
    mutableSource()
    install(['button'])

    const added = 'packages/recipes/src/conventions/new-convention.module.css'
    writeFileSync(resolve(source, added), '.x {\n  color: var(--pm-text);\n}\n')

    // A later publish, as the consumer would see it: the same registry with one
    // more file in Button's closure. Rebuilding from the copied tree is not
    // possible, because `buildRegistry` reads a whole repository and this copy
    // is two directories of source.
    const next: Registry = {
      ...registry,
      version: '1.1.0',
      components: registry.components.map((component) =>
        component.name === 'Button'
          ? {
              ...component,
              dependencies: {
                ...component.dependencies,
                files: [...component.dependencies.files, added],
              },
            }
          : component,
      ),
    }

    const result = updateInstall(app, source, next)

    expect(read(app, 'src/polymorph/conventions/new-convention.module.css')).toContain('.x')
    expect(result.manifest.version).toBe('1.1.0')
  })

  it('deletes a file the vocabulary dropped, when their copy is untouched', () => {
    mutableSource()
    install(['button'])
    const dropped = 'src/polymorph/layout/Inline.tsx'
    rmSync(resolve(source, 'packages/react-ui/src/layout/Inline.tsx'))

    const result = updateInstall(app, source, registry)

    expect(result.removed).toContain(dropped)
    expect(existsSync(resolve(app, dropped))).toBe(false)
    // The manifest also drops it. Otherwise every later diff would report the
    // file as missing.
    expect(readManifest(app)?.files[dropped]).toBeUndefined()
    // The rest of the closure is untouched by a deletion.
    expect(read(app, 'src/polymorph/layout/layout.module.css')).toContain('.layout')
  })

  it('keeps a dropped file the consumer edited, and says why', () => {
    mutableSource()
    install(['button'])
    const dropped = 'src/polymorph/layout/Inline.tsx'
    const theirs = `${read(app, dropped)}\n// mine\n`
    writeFileSync(resolve(app, dropped), theirs)
    rmSync(resolve(source, 'packages/react-ui/src/layout/Inline.tsx'))

    const result = updateInstall(app, source, registry)

    expect(result.removed).not.toContain(dropped)
    expect(read(app, dropped)).toBe(theirs)
    expect(result.notes.join(' ')).toContain(dropped)
    expect(readManifest(app)?.files[dropped]).toBeDefined()
  })

  it('deletes a dropped file under --force, edited or not', () => {
    mutableSource()
    install(['button'])
    const dropped = 'src/polymorph/layout/Inline.tsx'
    writeFileSync(resolve(app, dropped), `${read(app, dropped)}\n// mine\n`)
    rmSync(resolve(source, 'packages/react-ui/src/layout/Inline.tsx'))

    const result = updateInstall(app, source, registry, { force: true })

    expect(result.removed).toContain(dropped)
    expect(existsSync(resolve(app, dropped))).toBe(false)
  })

  it('refuses to update a directory nothing was installed into', () => {
    expect(() => updateInstall(consumer(), source, registry)).toThrow('nothing has been installed')
  })
})

/**
 * A component that no longer exists.
 *
 * The manifest records what was installed at the time, so a name in it can
 * outlive its registry entry, for example a component we removed or renamed.
 * `planInstall` refuses an unknown name. That is right for `add`, where somebody
 * typed a wrong name. It is wrong for `update`: the name came from us, the
 * removal is our change, and only the update can remove the files. If the
 * update threw on the name, the stale files would never be pruned, because the
 * only command that can remove them would fail.
 */
describe('a component the registry no longer ships', () => {
  /** Two files a removed component left behind: one untouched, one edited. */
  const haunt = (name: string) => {
    install(['button'])

    const pristine = 'src/polymorph/ghosts/Pristine.tsx'
    const edited = 'src/polymorph/ghosts/Edited.tsx'
    write(app, pristine, 'export const pristine = 1\n')
    write(app, edited, 'export const edited = 2\n')

    const manifest = readManifest(app)
    if (!manifest) throw new Error('no manifest')
    manifest.components.push(name)
    manifest.files[pristine] = { hash: digest(read(app, pristine)), source: `x/${name}.tsx` }
    manifest.files[edited] = { hash: digest(read(app, edited)), source: `x/${name}Edited.tsx` }
    write(app, 'polymorph.json', JSON.stringify(manifest, null, 2))

    // The consumer edits it after the install recorded it.
    writeFileSync(resolve(app, edited), 'export const edited = 2 // mine\n')

    return { pristine, edited }
  }

  it('updates cleanly, prunes the pristine file and keeps the edited one', () => {
    const { pristine, edited } = haunt('Ghost')

    const result = updateInstall(app, source, registry)

    // The rest of the install is updated.
    expect(read(app, 'src/polymorph/controls/Button.tsx')).toContain('export function Button')

    // The removed component's files are pruned like any other dropped file.
    // There is no separate rule for a removed component.
    expect(result.removed).toContain(pristine)
    expect(existsSync(resolve(app, pristine))).toBe(false)
    expect(result.removed).not.toContain(edited)
    expect(read(app, edited)).toContain('// mine')

    // The notes say why, so nobody has to diff two registries.
    expect(result.notes.join('\n')).toContain('Ghost no longer ships')
    expect(result.notes.join('\n')).toContain(edited)

    // The manifest stops claiming the component, so the next update is quiet.
    expect(readManifest(app)?.components).toEqual(['Button'])
    expect(readManifest(app)?.files[pristine]).toBeUndefined()
    expect(updateInstall(app, source, registry).notes.join('\n')).not.toContain('no longer ships')
  })

  it('names the nearest shipped name, because a rename is the usual cause', () => {
    // `Date` stands for the name `DatePicker` had before a rename. The
    // suggestion is the CLI's own: the same guess a mistyped `polymorph add`
    // gets, obtained without throwing the error that carries it.
    haunt('Date')
    expect(updateInstall(app, source, registry).notes.join('\n')).toContain('"DatePicker"')
  })

  it('deletes an edited file too under --force', () => {
    const { edited } = haunt('Ghost')
    const result = updateInstall(app, source, registry, { force: true })

    expect(result.removed).toContain(edited)
    expect(existsSync(resolve(app, edited))).toBe(false)
  })

  it('does the same for a system the registry dropped', () => {
    install(['theme:pastel'])
    const manifest = readManifest(app)
    if (!manifest) throw new Error('no manifest')
    manifest.systems.push('atlantis')
    write(app, 'polymorph.json', JSON.stringify(manifest, null, 2))

    const result = updateInstall(app, source, registry)
    expect(result.notes.join('\n')).toContain('theme:atlantis no longer ships')
    expect(readManifest(app)?.systems).toEqual(['pastel'])
    // The rest of the install still works.
    expect(read(app, 'src/polymorph/themes/theme.css')).toContain(
      '[data-system="pastel"][data-palette="amethyst"]',
    )
  })
})

/**
 * A vendored file the application imports by path.
 *
 * `update` plans from the members the manifest asked for, so a member that
 * came along with another is carried only while that one brings it. The
 * application can still import it directly, and deleting it then breaks the
 * application's build.
 */
describe('a vendored file the application imports', () => {
  const ZONE = 'src/polymorph/exceptions/Bespoke.tsx'

  /** Bespoke installed, then no longer among the members asked for, as if it had come along. */
  const cameAlong = (): void => {
    install(['button', 'bespoke'])
    const manifest = JSON.parse(read(app, 'polymorph.json')) as { components: string[] }
    manifest.components = ['Button']
    write(app, 'polymorph.json', JSON.stringify(manifest, null, 2))
  }

  it('adopts a member the application imports, and keeps updating it', () => {
    cameAlong()
    write(
      app,
      'src/brand/Marks.tsx',
      "import { Bespoke } from '../polymorph/exceptions/Bespoke'\n\nexport const Marks = Bespoke\n",
    )

    const result = updateInstall(app, source, registry)

    expect(existsSync(resolve(app, ZONE))).toBe(true)
    expect(existsSync(resolve(app, 'src/polymorph/exceptions/bespoke.module.css'))).toBe(true)
    expect(result.removed).toEqual([])
    expect(readManifest(app)?.components).toEqual(['Bespoke', 'Button'])
    expect(result.notes.join('\n')).toContain(
      'Bespoke is no longer brought by the members polymorph.json lists, and src/brand/Marks.tsx ' +
        'imports it',
    )
    // Listed now, so the next update carries it with no note.
    expect(updateInstall(app, source, registry).notes.join('\n')).not.toContain('Bespoke')
  })

  it('reads an import through a path alias', () => {
    cameAlong()
    write(app, 'src/App.tsx', "import { Bespoke } from '@/polymorph/exceptions/Bespoke'\n")
    updateInstall(app, source, registry)
    expect(readManifest(app)?.components).toEqual(['Bespoke', 'Button'])
  })

  it('still deletes a member nothing imports', () => {
    cameAlong()
    const result = updateInstall(app, source, registry)
    expect(result.removed).toContain(ZONE)
    expect(readManifest(app)?.components).toEqual(['Button'])
  })

  it('keeps a file the registry dropped while the application imports it, and what it imports', () => {
    install(['button'])
    const ghost = 'src/polymorph/ghosts/Ghost.tsx'
    const helper = 'src/polymorph/ghosts/helper.ts'
    write(app, ghost, "import { helper } from './helper'\n\nexport const Ghost = helper\n")
    write(app, helper, 'export const helper = 1\n')
    const manifest = readManifest(app)
    if (!manifest) throw new Error('no manifest')
    manifest.files[ghost] = { hash: digest(read(app, ghost)), source: 'x/Ghost.tsx' }
    manifest.files[helper] = { hash: digest(read(app, helper)), source: 'x/helper.ts' }
    write(app, 'polymorph.json', JSON.stringify(manifest, null, 2))
    write(app, 'src/App.tsx', "import { Ghost } from './polymorph/ghosts/Ghost'\n")

    // Kept under --force too: it decides between their edit and ours, and
    // deleting a module the application imports breaks its build.
    const result = updateInstall(app, source, registry, { force: true })

    expect(result.removed).toEqual([])
    expect(existsSync(resolve(app, ghost))).toBe(true)
    expect(existsSync(resolve(app, helper))).toBe(true)
    const notes = result.notes.join('\n')
    expect(notes).toContain(
      `${ghost} is no longer part of the vocabulary, and src/App.tsx imports it`,
    )
    expect(notes).toContain(
      `${helper} is no longer part of the vocabulary, and ${ghost} imports it`,
    )

    // Once the application stops importing it, the next update deletes it.
    write(app, 'src/App.tsx', 'export {}\n')
    expect(updateInstall(app, source, registry).removed.sort()).toEqual([ghost, helper])
  })
})

/**
 * A system the catalogue now ships under another name.
 *
 * `plain` shipped as `shadcn`, and an install recorded then names `shadcn` in
 * its manifest. The registry records the rename, so `update` moves the install
 * instead of dropping its only system.
 */
describe('a system the registry renamed', () => {
  const OLD = 'src/polymorph/themes/systems/shadcn.json'

  /** An install of `plain` rewritten as the install of `shadcn` it was before the rename. */
  const recordedAsShadcn = (): void => {
    install(['theme:plain'])
    const current = 'src/polymorph/themes/systems/plain.json'
    const text = read(app, current).replace('"name": "plain"', '"name": "shadcn"')
    rmSync(resolve(app, current))
    write(app, OLD, text)
    const manifest = readManifest(app)
    if (!manifest) throw new Error('no manifest')
    delete manifest.files[current]
    manifest.files[OLD] = { hash: digest(text), source: 'design/systems/shadcn.json' }
    manifest.systems = ['shadcn']
    write(app, 'polymorph.json', JSON.stringify(manifest, null, 2))
  }

  it('moves the install to the current name, and deletes the old document', () => {
    recordedAsShadcn()

    const result = updateInstall(app, source, registry)

    expect(readManifest(app)?.systems).toEqual(['plain'])
    expect(JSON.parse(read(app, 'src/polymorph/themes/systems/plain.json'))).toMatchObject({
      name: 'plain',
    })
    expect(result.removed).toContain(OLD)
    expect(existsSync(resolve(app, OLD))).toBe(false)
    expect(read(app, 'src/polymorph/themes/theme.css')).toContain(
      '[data-system="plain"][data-palette="neutral"]',
    )
    expect(result.notes.join('\n')).toContain(
      'theme:shadcn is now theme:plain, the same document renamed — the install moves to it; ' +
        'change "shadcn" to "plain" wherever your code names it',
    )
    // Nothing is left to move.
    expect(updateInstall(app, source, registry).notes.join('\n')).not.toContain('shadcn')
  })

  it('keeps the old document where it was edited, and still moves the install', () => {
    recordedAsShadcn()
    const edited = `${read(app, OLD)}\n`
    writeFileSync(resolve(app, OLD), edited)

    const result = updateInstall(app, source, registry)

    expect(read(app, OLD)).toBe(edited)
    expect(result.notes.join('\n')).toContain(
      `${OLD} is no longer part of the vocabulary, and you have edited it — kept`,
    )
    expect(readManifest(app)?.systems).toEqual(['plain'])
  })
})

describe('a member the install’s framework no longer ships', () => {
  it('is dropped by `update` with the map’s reason, instead of failing the update', () => {
    // React still ships Tabs, so a check against the React members alone
    // would replan it in Vue and throw at the member the Vue map refuses.
    // The source is this checkout, which holds the Vue tree; only `app` is
    // written.
    applyPlan(app, ROOT, registry, planInstall(registry, ['tabs'], { framework: 'vue' }))
    expect(existsSync(resolve(app, 'src/polymorph/overlays/Tabs.vue'))).toBe(true)
    const withdrawn: Registry = {
      ...registry,
      components: registry.components.map((component) =>
        component.name === 'Tabs'
          ? {
              ...component,
              frameworks: {
                ...component.frameworks,
                vue: { status: 'absent', reason: 'no Vue shell yet' },
              },
            }
          : component,
      ),
    }

    const result = updateInstall(app, ROOT, withdrawn)

    expect(result.notes).toContain(
      'Tabs no longer ships in vue — no Vue shell yet; its files are on their way out',
    )
    expect(readManifest(app)?.components).toEqual([])
    expect(readManifest(app)?.framework).toBe('vue')
    expect(result.removed).toContain('src/polymorph/overlays/Tabs.vue')
    expect(existsSync(resolve(app, 'src/polymorph/overlays/Tabs.vue'))).toBe(false)
  })
})
