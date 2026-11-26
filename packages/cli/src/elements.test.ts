import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'

import { buildRegistry, type Registry } from '@polymorph/registry'
import { afterAll, describe, expect, it } from 'vitest'

import { main, run } from './cli'
import { elementsPrepaint, elementsThemeSheet, noBuildFiles } from './elements'
import { digest, readManifest } from './manifest'
import { ELEMENTS_DIR, planInstall } from './plan'

/**
 * The elements on a page with no build: `polymorph init --framework elements`,
 * and `add`, `update`, `diff` and `check` in the install it writes.
 *
 * The files a page loads the elements from are a build output, so each case
 * copies them from a fixture source tree: the checkout's `design/` (the theme's
 * documents), linked, and a no-build directory written here at the path the
 * registry names. The registry is the checkout's, with every member native in
 * elements, so the example page does not depend on which members the live map
 * marks native.
 */

const ROOT = resolve(import.meta.dirname, '../../..')
const live: Registry = buildRegistry(ROOT)
const NO_BUILD = live.vendor.frameworks.elements.noBuild?.dir ?? ''

/** The registry with every member native in elements, as it is once every member is an element. */
const registry: Registry = {
  ...live,
  components: live.components.map((component) => ({
    ...component,
    frameworks: {
      ...component.frameworks,
      elements:
        component.frameworks.elements.status === 'native'
          ? component.frameworks.elements
          : {
              status: 'native',
              shell: {
                origin: 'installed',
                sources: [],
                states: null,
                dependencies: { components: [], packages: [], files: [] },
              },
            },
    },
  })),
}

/** The checkout's programs, as its bin names them. */
const programs = {
  mcp: { command: 'node', args: [resolve(ROOT, 'packages/mcp/bin/polymorph-mcp.js')] },
  emit: { command: process.execPath, args: [resolve(ROOT, 'packages/spec/bin/emit.js')] },
}

const temporaries: string[] = []
afterAll(() => {
  for (const path of temporaries) rmSync(path, { recursive: true, force: true })
})

const temporary = (prefix: string): string => {
  const path = mkdtempSync(resolve(tmpdir(), prefix))
  temporaries.push(path)
  return path
}

const write = (root: string, path: string, text: string): void => {
  mkdirSync(dirname(resolve(root, path)), { recursive: true })
  writeFileSync(resolve(root, path), text)
}

/** The files the build writes, as a fixture: the loader, a chunk, the stylesheets, a house theme. */
const BUILT: Record<string, string> = {
  'polymorph.js':
    "import './chunks/runtime-a1.js'\ncustomElements.define('poly-button', class {})\n",
  'chunks/runtime-a1.js': 'export const runtime = 1\n',
  'polymorph-all.js': 'export {}\n',
  'polymorph.css': ':state(poly-host):not([hidden]) {\n  display: contents;\n}\n',
  'prepaint.js': '(function(){})()\n',
  'themes/plain.css': '[data-system="plain"] {\n}\n',
}

/** A source tree: the checkout's design documents and, unless `built` is false, the no-build files. */
function source(built = true): string {
  const root = temporary('polymorph-elements-source-')
  symlinkSync(resolve(ROOT, 'design'), resolve(root, 'design'))
  if (built)
    for (const [path, text] of Object.entries(BUILT)) write(root, `${NO_BUILD}/${path}`, text)
  return root
}

/** The CLI in `root`, reading `from`, with its output as one string. */
function cli(root: string, from: string, argv: string[], over: Registry = registry) {
  const lines: string[] = []
  const outcome = run(
    { root, source: from, registry: over, out: (line) => lines.push(line), programs },
    argv,
  )
  return { code: outcome.code, output: lines.join('\n') }
}

/** A new page, written by `init` into `site/` of a fresh directory. */
function page(
  from = source(),
  argv: string[] = [],
): { site: string; from: string; output: string } {
  const parent = temporary('polymorph-elements-app-')
  const outcome = cli(parent, from, ['init', 'site', '--framework', 'elements', ...argv])
  expect(outcome.code, outcome.output).toBe(0)
  return { site: resolve(parent, 'site'), from, output: outcome.output }
}

const read = (root: string, path: string): string => readFileSync(resolve(root, path), 'utf8')

describe('polymorph init --framework elements', () => {
  const { site, from, output } = page()

  it('copies every file the build wrote into the static directory, as the build wrote it', () => {
    for (const [path, text] of Object.entries(BUILT)) {
      expect(read(site, `${ELEMENTS_DIR}/${path}`), path).toBe(text)
    }
    expect(output).toContain('(elements, no build)')
  })

  it('compiles the theme sheet for the system and the palette it declares', () => {
    const sheet = read(site, `${ELEMENTS_DIR}/theme.css`)
    expect(sheet).toContain('[data-system="plain"][data-palette="neutral"]')
    expect(sheet).toBe(elementsThemeSheet(registry, from, ['plain'], ['neutral']))
  })

  it('writes a page that links the stylesheets, runs the prepaint script first, then loads the elements', () => {
    const html = read(site, 'public/index.html')
    const head = html.slice(html.indexOf('<head>'), html.indexOf('</head>'))
    // The stored theme choice runs before any stylesheet resolves.
    expect(head.split('\n')[1]).toContain(elementsPrepaint(registry))
    expect(head).toContain('<link rel="stylesheet" href="polymorph/polymorph.css" />')
    expect(head).toContain('<link rel="stylesheet" href="polymorph/theme.css" />')
    expect(head).toContain('<script type="module" src="polymorph/polymorph.js"></script>')
    expect(head.indexOf('polymorph.css')).toBeLessThan(head.indexOf('polymorph.js'))
    expect(html).toContain('<html lang="en" data-system="plain" data-palette="neutral">')
    // Exposing a page to an agent is its owner's decision, so the example states no agent setting.
    expect(html).not.toContain('data-agent')
    for (const tag of ['poly-stack', 'poly-heading', 'poly-text', 'poly-button']) {
      expect(html).toContain(`<${tag}`)
    }
    expect(html).toContain("addEventListener('poly-click'")
  })

  it('inlines the script built with each house system’s default mode', () => {
    const script = elementsPrepaint(registry)
    for (const system of registry.theme.systems) {
      if (system.defaultMode === 'light' || system.defaultMode === 'dark') {
        expect(script, system.name).toContain(`"${system.name}":"${system.defaultMode}"`)
      }
    }
    // The page names its system on `<html>`, so the script names no fallback.
    expect(script).toContain("n=t||d.getAttribute('data-system'),")
  })

  it('records every copy with its source and hash, and the sheet as generated', () => {
    const manifest = readManifest(site)
    expect(manifest).toMatchObject({
      dir: ELEMENTS_DIR,
      framework: 'elements',
      components: [],
      systems: ['plain'],
      palettes: ['neutral'],
      version: registry.version,
    })
    for (const [path, text] of Object.entries(BUILT)) {
      expect(manifest?.files[`${ELEMENTS_DIR}/${path}`]).toEqual({
        hash: digest(text),
        source: `${NO_BUILD}/${path}`,
      })
    }
    expect(manifest?.files[`${ELEMENTS_DIR}/theme.css`]?.source).toBeNull()
  })

  it('writes the elements card and an agent’s notes, and no package, lint config or build', () => {
    expect(read(site, 'polymorph/system-card.md')).toContain('`<poly-button>`')
    const agents = read(site, 'AGENTS.md').replace(/\s+/g, ' ')
    expect(agents).toContain('`<poly-third-party library="…" reason="…">`')
    expect(agents).toContain('The red rules do not read HTML')
    expect(agents).toContain('`<html data-agent="on-call">`')
    expect(agents).toContain('card --framework elements')
    expect(JSON.parse(read(site, '.mcp.json')).mcpServers.polymorph).toEqual({
      command: 'node',
      args: [...programs.mcp.args, '--project', '.'],
    })
    for (const file of ['package.json', '.npmrc', 'eslint.config.js', 'vite.config.ts']) {
      expect(existsSync(resolve(site, file)), file).toBe(false)
    }
  })

  it('takes the static directory from --dir, and lists the plan without writing on a dry run', () => {
    const elsewhere = page(source(), ['--dir', 'static']).site
    expect(existsSync(resolve(elsewhere, 'static/index.html'))).toBe(true)
    expect(readManifest(elsewhere)?.dir).toBe('static/polymorph')

    const parent = temporary('polymorph-elements-dry-')
    const dry = cli(parent, source(), ['init', 'site', '--framework', 'elements', '--dry-run'])
    expect(dry.code).toBe(0)
    expect(dry.output).toContain('    public/polymorph/polymorph.js')
    expect(dry.output).toContain('    polymorph.json')
    expect(existsSync(resolve(parent, 'site'))).toBe(false)
  })
})

describe('what init refuses', () => {
  it('refuses a source tree that has not built the files, and names the command that does', () => {
    const parent = temporary('polymorph-elements-unbuilt-')
    const from = source(false)
    const outcome = cli(parent, from, ['init', 'site', '--framework', 'elements'])
    expect(outcome.code).toBe(1)
    expect(outcome.output).toContain(`${NO_BUILD} is not built in ${from}`)
    expect(outcome.output).toContain('Run `pnpm build:packages`')
    expect(existsSync(resolve(parent, 'site'))).toBe(false)
    expect(() => noBuildFiles(registry, from)).toThrow('pnpm build:packages')
  })

  it('refuses a page member the elements vocabulary does not ship, naming it and why', () => {
    const without: Registry = {
      ...registry,
      components: registry.components.map((component) =>
        component.name === 'Heading'
          ? {
              ...component,
              frameworks: {
                ...component.frameworks,
                elements: { status: 'absent', reason: 'no element yet' },
              },
            }
          : component,
      ),
    }
    const parent = temporary('polymorph-elements-unshipped-')
    const outcome = cli(parent, source(), ['init', 'site', '--framework', 'elements'], without)
    expect(outcome.code).toBe(1)
    expect(outcome.output).toContain('  Heading: no element yet')
    expect(existsSync(resolve(parent, 'site'))).toBe(false)
  })

  it('refuses a static directory outside the app', () => {
    const parent = temporary('polymorph-elements-escape-')
    const outcome = cli(parent, source(), [
      'init',
      'site',
      '--framework',
      'elements',
      '--dir',
      '..',
    ])
    expect(outcome.code).toBe(1)
    expect(outcome.output).toContain('must stay inside your repository')
  })
})

describe('add in an elements install', () => {
  it('installs no member, and says that the page loads every element', () => {
    const { site, from } = page()
    const before = readFileSync(resolve(site, 'polymorph.json'))
    const outcome = cli(site, from, ['add', 'button', 'date-picker'])
    expect(outcome.code).toBe(0)
    expect(outcome.output).toContain(
      'Button is an element in the files `polymorph init --framework elements` copies',
    )
    expect(outcome.output).toContain('there is nothing to install per member')
    expect(readFileSync(resolve(site, 'polymorph.json'))).toEqual(before)
  })

  it('writes the theme sheet again with the system it adds, beside the one it had', () => {
    const { site, from } = page()
    const outcome = cli(site, from, ['add', 'theme:pastel'])
    expect(outcome.code, outcome.output).toBe(0)
    const sheet = read(site, `${ELEMENTS_DIR}/theme.css`)
    expect(sheet).toContain('[data-system="plain"][data-palette="neutral"]')
    expect(sheet).toContain('[data-system="pastel"][data-palette="amethyst"]')
    expect(outcome.output).toContain('`<html data-system="pastel" data-palette="amethyst">`')
    const manifest = readManifest(site)
    expect(manifest?.systems).toEqual(['pastel', 'plain'])
    expect(manifest?.palettes).toEqual(['amethyst', 'neutral'])
    expect(manifest?.files[`${ELEMENTS_DIR}/theme.css`]?.hash).toBe(digest(sheet))
  })

  it('keeps a theme sheet its owner edited, unless forced', () => {
    const { site, from } = page()
    write(site, `${ELEMENTS_DIR}/theme.css`, '/* mine */\n')
    expect(cli(site, from, ['add', 'theme:pastel']).output).toContain(
      `kept yours ${ELEMENTS_DIR}/theme.css`,
    )
    expect(read(site, `${ELEMENTS_DIR}/theme.css`)).toBe('/* mine */\n')
    cli(site, from, ['add', 'theme:pastel', '--force'])
    expect(read(site, `${ELEMENTS_DIR}/theme.css`)).toContain('[data-system="pastel"]')
  })

  it('refuses a member in another framework’s install, as every install does', () => {
    const { site, from } = page()
    expect(cli(site, from, ['add', 'button', '--framework', 'vue']).output).toContain(
      'this install vendors elements members',
    )
  })

  it('plans an elements install as notes and one theme sheet, with no package and no base layer', () => {
    const plan = planInstall(registry, ['button', 'theme:plain'], { framework: 'elements' })
    expect(plan).toMatchObject({
      dir: ELEMENTS_DIR,
      framework: 'elements',
      files: [],
      components: [],
      requested: [],
      base: null,
      packages: {},
      devPackages: {},
    })
    expect(plan.notes).toEqual([
      'Button is an element in the files `polymorph init --framework elements` copies, which ' +
        'define every tag at once — there is nothing to install per member',
    ])
    expect(plan.systems.map((system) => system.file.to)).toEqual([`${ELEMENTS_DIR}/theme.css`])
    expect(plan.palettes.map((palette) => palette.file.to)).toEqual([`${ELEMENTS_DIR}/theme.css`])
  })
})

describe('update and diff in an elements install', () => {
  it('copies what the build changed, keeps what the owner edited, and drops what the build no longer writes', () => {
    const { site, from } = page()
    write(from, `${NO_BUILD}/polymorph.js`, 'export const loader = 2\n')
    write(from, `${NO_BUILD}/polymorph-all.js`, 'export const all = 2\n')
    write(site, `${ELEMENTS_DIR}/polymorph-all.js`, '// mine\n')
    rmSync(resolve(from, NO_BUILD, 'chunks/runtime-a1.js'))
    write(from, `${NO_BUILD}/chunks/runtime-b2.js`, 'export const runtime = 2\n')

    const diff = cli(site, from, ['diff']).output
    expect(diff).toContain(`ours       ${ELEMENTS_DIR}/polymorph.js`)
    expect(diff).toContain(`both       ${ELEMENTS_DIR}/polymorph-all.js`)
    expect(diff).toContain(`dropped    ${ELEMENTS_DIR}/chunks/runtime-a1.js`)

    const outcome = cli(site, from, ['update'])
    expect(outcome.code, outcome.output).toBe(0)
    expect(read(site, `${ELEMENTS_DIR}/polymorph.js`)).toBe('export const loader = 2\n')
    expect(read(site, `${ELEMENTS_DIR}/chunks/runtime-b2.js`)).toBe('export const runtime = 2\n')
    expect(read(site, `${ELEMENTS_DIR}/polymorph-all.js`)).toBe('// mine\n')
    expect(existsSync(resolve(site, ELEMENTS_DIR, 'chunks/runtime-a1.js'))).toBe(false)
    expect(outcome.output).toContain(`kept yours ${ELEMENTS_DIR}/polymorph-all.js`)
    expect(outcome.output).toContain(`dropped    ${ELEMENTS_DIR}/chunks/runtime-a1.js`)

    const manifest = readManifest(site)
    expect(manifest?.files[`${ELEMENTS_DIR}/chunks/runtime-a1.js`]).toBeUndefined()
    expect(manifest?.files[`${ELEMENTS_DIR}/chunks/runtime-b2.js`]?.source).toBe(
      `${NO_BUILD}/chunks/runtime-b2.js`,
    )
    expect(cli(site, from, ['update']).output).toContain('nothing changed upstream')
    expect(cli(site, from, ['update', '--force']).output).toContain('wrote      1 files')
    expect(read(site, `${ELEMENTS_DIR}/polymorph-all.js`)).toBe('export const all = 2\n')
  })

  it('reads no page in check, and says so', async () => {
    const { site, from } = page()
    const lines: string[] = []
    const outcome = await main(
      { root: site, source: from, registry, out: (line) => lines.push(line), programs },
      ['check'],
      () => Promise.reject(new Error('a page was read')),
    )
    expect(outcome.code).toBe(0)
    expect(lines.join('\n')).toContain(
      '1 .html file was not read: it is an elements page, and the red rules do not read HTML',
    )
  })
})
