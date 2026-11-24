import { execFileSync, spawnSync } from 'node:child_process'
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { builtinModules } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import {
  getDefaultEnvironment,
  StdioClientTransport,
} from '@modelcontextprotocol/sdk/client/stdio.js'
import { namedFiles, PUBLISHED_NAMES, TOOLS_PACKAGE, type Registry } from '@polymorph/registry'
import ts from 'typescript'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { buildElementsUi, lockElementsUiDist } from '../elements-ui/dist-lock'
// What the native emitters read of each platform's member package. A test may
// read the spec package; the tools ship what it names.
import { NATIVE_FILES } from '../spec/src/emit-native'
import { buildTools, lockToolsDist } from './dist-lock'

/**
 * The packaging law of the published tools: the package packed as the publish
 * step packs it, installed where no checkout is, and its bins run there.
 *
 * The tools are the one package a person runs rather than imports, so the law
 * is about what a person sees. `--help` and `init` answer, the app `init`
 * writes names no path of this machine and matches the checkout's app apart
 * from the files that say where the server runs from, `add`, `diff`,
 * `update`, `check` and `theme validate` work in a project that has the tools
 * in its `node_modules`, and the MCP server answers a real client over stdio.
 * The tarball holds only what the package declares, every file the registry
 * names, and no path of this machine.
 *
 * **What the install is.** The tarball is cut as `scripts/publish-packages.mjs`
 * cuts it: `pnpm pack`, the licence and notice added, the manifest rewritten
 * for the registry, packed again. It is unpacked into `node_modules` of a
 * scratch project under the system's temporary directory, outside this
 * repository and every workspace, and its bins are linked into
 * `node_modules/.bin` as a package manager links them. Its dependencies are the
 * ones this workspace installed for `packages/tools`, linked into the package's
 * own `node_modules`, as `packages/cli/consumer-app.ts` assembles an app: no
 * test here reaches a registry over the network. A dependency the manifest
 * does not declare is therefore missing there and fails here, as it would for
 * a person.
 *
 * **The builds.** The tools ship the elements' no-build files, so the
 * elements vocabulary is built first, then the tools, each under its lock
 * (`dist-lock.ts`), held until the tarball is packed.
 */

const PACKAGE = import.meta.dirname
const ROOT = resolve(PACKAGE, '../..')
const NAME = PUBLISHED_NAMES[TOOLS_PACKAGE] as string

const SCRATCH = mkdtempSync(resolve(tmpdir(), 'polymorph-tools-'))
/** The project the tools are installed in, and the write tools write in. */
const PROJECT = resolve(SCRATCH, 'project')
/** The installed package. */
const INSTALLED = resolve(PROJECT, 'node_modules', NAME)

let tarball: string
let registry: Registry

/** A shell's environment: no package manager ran the command. */
const shell = (): NodeJS.ProcessEnv =>
  Object.fromEntries(
    Object.entries(process.env).filter(([name]) => !name.toLowerCase().startsWith('npm_')),
  )

interface Run {
  code: number
  stdout: string
  stderr: string
}

/** One of the installed bins, run as a shell runs it, in `cwd`. */
function bin(name: string, args: string[], cwd = PROJECT): Run {
  const result = spawnSync(resolve(PROJECT, 'node_modules/.bin', name), args, {
    cwd,
    env: shell(),
    encoding: 'utf8',
    timeout: 120_000,
  })
  return { code: result.status ?? 1, stdout: result.stdout, stderr: result.stderr }
}

/** Every file below `dir`, relative to it, with `/` between segments. */
function filesBelow(dir: string): string[] {
  const found: string[] = []
  const walk = (at: string): void => {
    for (const entry of readdirSync(resolve(dir, at), { withFileTypes: true })) {
      const path = at === '' ? entry.name : `${at}/${entry.name}`
      if (entry.isDirectory()) walk(path)
      else found.push(path)
    }
  }
  walk('')
  return found.sort()
}

/**
 * The tarball the publish step uploads: `pnpm pack`, then the licence and
 * notice and the manifest `scripts/publish-packages.mjs` writes (the published
 * name, no workspace fields), packed again.
 */
function pack(): string {
  const work = resolve(SCRATCH, 'pack')
  mkdirSync(work, { recursive: true })
  execFileSync('pnpm', ['pack', '--pack-destination', work], { cwd: PACKAGE, stdio: 'pipe' })
  const packed = readdirSync(work).find((file) => file.endsWith('.tgz')) as string
  execFileSync('tar', ['-xzf', resolve(work, packed), '-C', work])

  const contents = resolve(work, 'package')
  for (const file of ['LICENSE', 'NOTICE'])
    copyFileSync(resolve(ROOT, file), resolve(contents, file))
  const manifest = JSON.parse(readFileSync(resolve(contents, 'package.json'), 'utf8')) as Record<
    string,
    unknown
  >
  const { private: _private, devDependencies: _dev, scripts: _scripts, ...published } = manifest
  writeFileSync(
    resolve(contents, 'package.json'),
    `${JSON.stringify({ ...published, name: NAME, publishConfig: { access: 'public' } }, null, 2)}\n`,
  )
  const file = execFileSync('npm', ['pack', contents, '--pack-destination', SCRATCH], {
    cwd: SCRATCH,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
    .trim()
    .split('\n')
    .pop() as string
  return resolve(SCRATCH, file)
}

/** The tarball unpacked into the project's `node_modules`, its dependencies and bins linked. */
function install(): void {
  mkdirSync(INSTALLED, { recursive: true })
  execFileSync('tar', ['-xzf', tarball, '-C', INSTALLED, '--strip-components', '1'])
  const manifest = JSON.parse(readFileSync(resolve(INSTALLED, 'package.json'), 'utf8')) as {
    version: string
    bin: Record<string, string>
    dependencies: Record<string, string>
    optionalDependencies: Record<string, string>
  }
  const project = {
    name: 'project',
    private: true,
    devDependencies: { [NAME]: `^${manifest.version}` },
  }
  writeFileSync(resolve(PROJECT, 'package.json'), `${JSON.stringify(project, null, 2)}\n`)
  for (const name of Object.keys({ ...manifest.dependencies, ...manifest.optionalDependencies })) {
    const target = resolve(INSTALLED, 'node_modules', name)
    mkdirSync(dirname(target), { recursive: true })
    symlinkSync(realpathSync(resolve(PACKAGE, 'node_modules', name)), target, 'dir')
  }
  mkdirSync(resolve(PROJECT, 'node_modules/.bin'), { recursive: true })
  for (const [name, path] of Object.entries(manifest.bin)) {
    chmodSync(resolve(INSTALLED, path), 0o755)
    symlinkSync(resolve(INSTALLED, path), resolve(PROJECT, 'node_modules/.bin', name), 'file')
  }
}

beforeAll(async () => {
  const releases: (() => void)[] = []
  try {
    releases.push(await lockElementsUiDist('packages/tools/packaging.test.ts'))
    buildElementsUi()
    releases.push(await lockToolsDist('packages/tools/packaging.test.ts'))
    buildTools()
    tarball = pack()
  } finally {
    for (const release of releases.reverse()) release()
  }
  install()
  registry = JSON.parse(
    readFileSync(resolve(INSTALLED, 'dist/registry/registry.json'), 'utf8'),
  ) as Registry
}, 900_000)

afterAll(() => {
  rmSync(SCRATCH, { recursive: true, force: true })
})

/* -------------------------------------------------------------------------- */
/* The tarball                                                                */
/* -------------------------------------------------------------------------- */

describe('the tarball', () => {
  const listing = () =>
    execFileSync('tar', ['-tzf', tarball], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
      .trim()
      .split('\n')
      .filter((entry) => !entry.endsWith('/'))

  /** The source tree the tools ship, from the registry they ship. */
  const shippedSource = (): string[] => {
    const noBuild = registry.vendor.frameworks.elements.noBuild?.dir ?? ''
    return [
      ...namedFiles(registry),
      ...filesBelow(resolve(INSTALLED, 'dist', noBuild)).map((path) => `${noBuild}/${path}`),
      ...Object.values(NATIVE_FILES).flatMap(({ contract, drawn }) => [contract, drawn]),
    ]
  }

  it('is named and ranged for the registry, and runs its two bins', () => {
    const manifest = JSON.parse(readFileSync(resolve(INSTALLED, 'package.json'), 'utf8')) as {
      name: string
      version: string
      bin: Record<string, string>
      dependencies: Record<string, string>
    }
    expect(manifest.name).toBe('@metamorph-labs/polymorph')
    expect(manifest.version).toBe(registry.version)
    expect(Object.keys(manifest.bin).sort()).toEqual(['polymorph', 'polymorph-mcp'])
    // The six polymorph packages are bundled, so the tools install with no other.
    expect(Object.keys(manifest.dependencies).filter((name) => name.includes('polymorph'))).toEqual(
      [],
    )
  })

  it('holds no file outside the declared set', () => {
    const source = new Set(shippedSource())
    const BUNDLED = /^(?:packages\/(?:cli|mcp|spec|registry|theme|rules|tools)\/|design\/).*\.js$/
    const stray = listing()
      .map((entry) => entry.replace(/^package\//, ''))
      .filter((path) => {
        if (['package.json', 'README.md', 'CHANGELOG.md', 'LICENSE', 'NOTICE'].includes(path)) {
          return false
        }
        if (!path.startsWith('dist/')) return true
        const inside = path.slice('dist/'.length)
        return !(
          ['polymorph.js', 'polymorph-mcp.js', 'emit.js', 'registry/registry.json'].includes(
            inside,
          ) ||
          inside.startsWith('screen/') ||
          BUNDLED.test(inside) ||
          source.has(inside)
        )
      })
    expect(stray).toEqual([])
  })

  it('ships every file the registry names, as this tree holds it', () => {
    const files = shippedSource()
    // The registry names every member's files in every framework, so the list is long.
    expect(files.length).toBeGreaterThan(1000)
    expect(files).toContain(registry.vendor.base)
    const missing = files.filter((path) => !existsSync(resolve(INSTALLED, 'dist', path)))
    expect(missing).toEqual([])
    const changed = files.filter(
      (path) =>
        !readFileSync(resolve(INSTALLED, 'dist', path)).equals(readFileSync(resolve(ROOT, path))),
    )
    expect(changed).toEqual([])
  })

  it('ships the page render_screen draws in, built', () => {
    expect(existsSync(resolve(INSTALLED, 'dist/screen/screen.html'))).toBe(true)
  })

  it('names no path of this machine', () => {
    const paths = [...new Set([ROOT, realpathSync(ROOT)])]
    const text = /\.(?:js|json|md|css|html|ts|tsx|vue|svelte|swift|kt)$/
    const found = filesBelow(INSTALLED)
      .filter((path) => !path.startsWith('node_modules/') && text.test(path))
      .filter((path) => {
        const contents = readFileSync(resolve(INSTALLED, path), 'utf8')
        return paths.some((root) => contents.includes(root))
      })
    expect(found).toEqual([])
  })

  /**
   * A published module that imports a package the manifest does not declare
   * resolves in this workspace, where pnpm installs it for another package, and
   * fails on a person's machine. The modules are read as built, because only
   * the build shows which imports remain, and with TypeScript's scanner,
   * because the CLI's modules hold the code of the apps `init` writes as text.
   */
  it('declares every package its modules import', () => {
    const manifest = JSON.parse(readFileSync(resolve(INSTALLED, 'package.json'), 'utf8')) as {
      dependencies: Record<string, string>
      optionalDependencies: Record<string, string>
    }
    const modules = filesBelow(resolve(INSTALLED, 'dist')).filter(
      (path) =>
        path.endsWith('.js') &&
        !path.startsWith('screen/') &&
        !path.startsWith('packages/elements-ui/'),
    )
    const imported = new Set<string>()
    for (const path of modules) {
      const source = readFileSync(resolve(INSTALLED, 'dist', path), 'utf8')
      for (const { fileName: specifier } of ts.preProcessFile(source, true, true).importedFiles) {
        if (specifier.startsWith('.') || specifier.startsWith('node:')) continue
        if (builtinModules.includes(specifier)) continue
        // The scanner reads a template's `import '${pkg}'` as an import. It is the text of a file.
        if (specifier.includes('${')) continue
        imported.add(
          specifier.startsWith('@')
            ? specifier.split('/').slice(0, 2).join('/')
            : (specifier.split('/')[0] as string),
        )
      }
    }
    // The modules were read, so an empty difference means something.
    expect(imported).toContain('eslint')
    expect(imported).toContain('@modelcontextprotocol/sdk')
    const declared = new Set(
      Object.keys({ ...manifest.dependencies, ...manifest.optionalDependencies }),
    )
    expect([...imported].filter((name) => !declared.has(name)).sort()).toEqual([])
  })
})

/* -------------------------------------------------------------------------- */
/* The CLI                                                                    */
/* -------------------------------------------------------------------------- */

describe('the installed CLI', () => {
  it('answers --help', () => {
    const { code, stdout } = bin('polymorph', ['--help'])
    expect(code).toBe(0)
    expect(stdout).toContain('polymorph init <dir>')
    expect(stdout).toContain('--registry <name>')
  })

  it('lists an app on a dry run, and writes nothing', () => {
    const { code, stdout } = bin('polymorph', ['init', 'dry', '--no-install', '--dry-run'])
    expect(code, stdout).toBe(0)
    expect(stdout).toContain('.mcp.json')
    expect(stdout).toContain('src/screens/Welcome.tsx')
    expect(existsSync(resolve(PROJECT, 'dry'))).toBe(false)
  })

  describe('init', () => {
    const parents = {
      published: resolve(SCRATCH, 'published'),
      checkout: resolve(SCRATCH, 'checkout'),
    }
    let output: Run

    beforeAll(() => {
      for (const parent of Object.values(parents)) mkdirSync(parent, { recursive: true })
      output = bin('polymorph', ['init', 'first-app', '--no-install'], parents.published)
      // The checkout's bin writes the same app with the registry the published tools default to.
      execFileSync(
        process.execPath,
        [
          resolve(ROOT, 'packages/cli/bin/polymorph.js'),
          'init',
          'first-app',
          '--no-install',
          '--registry',
          'npmjs',
        ],
        { cwd: parents.checkout, env: shell(), stdio: 'pipe' },
      )
    }, 300_000)

    const app = (origin: keyof typeof parents) => resolve(parents[origin], 'first-app')
    const read = (origin: keyof typeof parents, path: string) =>
      readFileSync(resolve(app(origin), path), 'utf8')

    it('writes the app and says to install it with npm', () => {
      expect(output.code, output.stderr).toBe(0)
      expect(output.stdout).toContain('emitted    src/screens/Welcome.tsx')
      expect(output.stdout).toContain('cd first-app && npm install && npm run dev')
    })

    it('runs the server with npx, naming no path of any machine', () => {
      const config = JSON.parse(read('published', '.mcp.json')) as {
        mcpServers: { polymorph: { command: string; args: string[] } }
      }
      expect(config.mcpServers.polymorph).toEqual({
        command: 'npx',
        args: ['-y', `${NAME}@^${registry.version}`, 'mcp', '--project', '.'],
      })
      for (const file of filesBelow(app('published'))) {
        expect(read('published', file), file).not.toContain(SCRATCH)
        expect(read('published', file), file).not.toContain(realpathSync(SCRATCH))
      }
    })

    it('lists the tools as a dev dependency at the release, so npx runs that copy', () => {
      const manifest = JSON.parse(read('published', 'package.json')) as {
        devDependencies: Record<string, string>
      }
      expect(manifest.devDependencies[NAME]).toBe(`^${registry.version}`)
    })

    it('writes the checkout’s app, apart from where the server runs from', () => {
      expect(filesBelow(app('published'))).toEqual(filesBelow(app('checkout')))
      const ORIGIN_FILES = ['package.json', '.mcp.json', 'AGENTS.md']
      for (const file of filesBelow(app('published')).filter(
        (path) => !ORIGIN_FILES.includes(path),
      )) {
        expect(read('published', file), file).toBe(read('checkout', file))
      }
      const published = JSON.parse(read('published', 'package.json')) as {
        devDependencies: Record<string, string>
      }
      delete published.devDependencies[NAME]
      expect(published).toEqual(JSON.parse(read('checkout', 'package.json')))
      expect(read('published', 'AGENTS.md')).not.toContain('machine-specific')
    })

    it('writes the app in each other framework, its welcome screen emitted', () => {
      const screens = {
        vue: 'src/screens/Welcome.vue',
        svelte: 'src/screens/Welcome.svelte',
        solid: 'src/screens/Welcome.tsx',
        angular: 'src/screens/welcome.ts',
      }
      for (const [framework, screen] of Object.entries(screens)) {
        const run = bin(
          'polymorph',
          ['init', `${framework}-app`, '--framework', framework, '--no-install'],
          parents.published,
        )
        expect(run.code, `${framework}: ${run.stdout}${run.stderr}`).toBe(0)
        expect(existsSync(resolve(parents.published, `${framework}-app`, screen)), framework).toBe(
          true,
        )
      }
    }, 300_000)

    it('writes a page with no build, from the files the package ships', () => {
      const run = bin('polymorph', ['init', 'page', '--framework', 'elements'], parents.published)
      expect(run.code, run.stdout + run.stderr).toBe(0)
      const noBuild = registry.vendor.frameworks.elements.noBuild?.dir ?? ''
      expect(
        readFileSync(resolve(parents.published, 'page/public/polymorph/polymorph.js')).equals(
          readFileSync(resolve(INSTALLED, 'dist', noBuild, 'polymorph.js')),
        ),
      ).toBe(true)
      const config = JSON.parse(
        readFileSync(resolve(parents.published, 'page/.mcp.json'), 'utf8'),
      ) as { mcpServers: { polymorph: { command: string } } }
      expect(config.mcpServers.polymorph.command).toBe('npx')
    })
  })

  describe('in a project that has the tools in its node_modules', () => {
    it('plans an install, then makes it, refusing nothing', () => {
      const dry = bin('polymorph', ['add', 'button', '--dry-run'])
      expect(dry.code, dry.stdout).toBe(0)
      expect(dry.stdout).toContain('src/polymorph/controls/Button.tsx')

      const made = bin('polymorph', ['add', 'button'])
      expect(made.code, made.stdout).toBe(0)
      expect(
        readFileSync(resolve(PROJECT, 'src/polymorph/controls/Button.tsx'), 'utf8').length,
      ).toBeGreaterThan(0)
    })

    it('compares the install with the release, and has nothing to update', () => {
      const diff = bin('polymorph', ['diff'])
      expect(diff.code, diff.stdout).toBe(0)
      expect(diff.stdout).toContain('up to date')
      const update = bin('polymorph', ['update'])
      expect(update.code, update.stdout).toBe(0)
    })

    it('runs the red rules over a file with a violation, and exits 1', () => {
      mkdirSync(resolve(PROJECT, 'src/app'), { recursive: true })
      writeFileSync(
        resolve(PROJECT, 'src/app/Seeded.tsx'),
        'export function Seeded() {\n  return <div style={{ padding: 12 }} />\n}\n',
      )
      const { code, stdout } = bin('polymorph', ['check', 'src/app'])
      expect(code).toBe(1)
      expect(stdout).toContain('polymorph/no-raw-styles')
      expect(stdout).toContain('src/app/Seeded.tsx')
    })

    it('validates a system and palette given by path', () => {
      const system = registry.theme.systems.find((entry) => entry.name === 'pastel')
      const palette = registry.theme.palettes.find((entry) => entry.name === system?.defaultPalette)
      const { code, stdout } = bin('polymorph', [
        'theme',
        'validate',
        resolve(INSTALLED, 'dist', system?.file ?? ''),
        resolve(INSTALLED, 'dist', palette?.file ?? ''),
      ])
      expect(code, stdout).toBe(0)
      expect(stdout).toContain('lawful')
    })
  })
})

/* -------------------------------------------------------------------------- */
/* The MCP server                                                             */
/* -------------------------------------------------------------------------- */

/** One tool call, as the text and the content kinds an agent reads. */
async function call(
  client: Client,
  name: string,
  args: Record<string, unknown>,
): Promise<{ isError: boolean; text: string; kinds: string[] }> {
  const result = (await client.callTool({ name, arguments: args })) as {
    isError?: boolean
    content: { type: string; text?: string }[]
  }
  return {
    isError: result.isError === true,
    text: result.content[0]?.text ?? '',
    kinds: result.content.map((part) => part.type),
  }
}

const SPEC = {
  spec: 'polymorph-screen/1',
  name: 'Probe',
  purpose: 'A probe of the published server.',
  inputs: [{ name: 'onSave', type: '() => void' }],
  root: {
    component: 'Stack',
    props: { gap: 4, p: 4 },
    children: [{ component: 'Button', props: { label: 'Save', onClick: { $: 'onSave' } } }],
  },
}

/** A client of the installed server, started as `.mcp.json` starts it, in the project. */
async function connect(args: string[], env: Record<string, string> = {}): Promise<Client> {
  const client = new Client({ name: 'tools-packaging', version: '0' })
  await client.connect(
    new StdioClientTransport({
      command: resolve(PROJECT, 'node_modules/.bin/polymorph'),
      args: ['mcp', ...args],
      cwd: PROJECT,
      env: { ...getDefaultEnvironment(), ...env },
    }),
  )
  return client
}

describe('the installed MCP server', () => {
  let client: Client

  beforeAll(async () => {
    client = await connect(['--project', '.'])
  }, 120_000)

  afterAll(async () => {
    await client?.close()
  })

  it('serves the card of the release it shipped with', async () => {
    const { text } = await call(client, 'get_system_card', {})
    expect(text).toContain('Button')
    expect(client.getServerVersion()?.version).toBe(registry.version)
  })

  it('reads a member’s source from the shipped tree', async () => {
    const { text } = await call(client, 'get_component', { name: 'Button', source: true })
    const answer = JSON.parse(text) as { files: { path: string; contents: string }[] }
    const source = answer.files.find((file) => file.path.endsWith('controls/Button.tsx'))
    expect(source?.contents).toBe(readFileSync(resolve(ROOT, source?.path ?? ''), 'utf8'))
  })

  it('validates code, a stylesheet against the shipped catalogue, and a spec', async () => {
    const code = JSON.parse(
      (
        await call(client, 'validate', {
          code: 'export const A = () => <div style={{ padding: 12 }} />',
        })
      ).text,
    ) as { violations: { rule: string }[] }
    expect(code.violations.map((violation) => violation.rule)).toContain('polymorph/no-raw-styles')

    // The ghost-token rule lists the tokens the catalogue's reference pairing emits, which the
    // rules read from the systems the package ships.
    const css = JSON.parse(
      (
        await call(client, 'validate', {
          code: '.a { color: var(--pm-not-a-token); }',
          filename: 'src/a.css',
        })
      ).text,
    ) as { violations: { rule: string }[]; fatal: string | null }
    expect(css.fatal).toBeNull()
    expect(css.violations.map((violation) => violation.rule)).toContain('polymorph/no-ghost-tokens')

    const spec = JSON.parse((await call(client, 'validate', { spec: SPEC })).text) as {
      ok: boolean
    }
    expect(spec.ok).toBe(true)
  })

  it('emits a screen into the project', async () => {
    const { isError, text } = await call(client, 'emit_screen', {
      spec: SPEC,
      path: 'src/screens/Probe.tsx',
    })
    expect(isError, text).toBe(false)
    expect(readFileSync(resolve(PROJECT, 'src/screens/Probe.tsx'), 'utf8')).toContain(
      'export function Probe',
    )
  })

  it('installs a member into the project', async () => {
    const { isError, text } = await call(client, 'install', { items: ['dialog'] })
    expect(isError, text).toBe(false)
    expect(existsSync(resolve(PROJECT, 'src/polymorph/overlays/Dialog.tsx'))).toBe(true)
  })

  it('draws a screen in the page it ships, where Playwright has its Chromium', async () => {
    // Whether this machine's Playwright can start its Chromium, asked of the same Playwright.
    const { chromium } = await import('playwright')
    const browser = await chromium.launch().catch(() => null)
    const present = browser !== null
    await browser?.close()
    const answer = await call(client, 'render_screen', {
      spec: SPEC,
      system: 'plain',
      viewports: ['phone'],
    })
    if (present) {
      expect(answer.isError, answer.text).toBe(false)
      expect(answer.kinds).toEqual(['text', 'image'])
      expect((JSON.parse(answer.text) as { blocked?: string[] }).blocked).toBeUndefined()
    } else {
      expect(answer.isError).toBe(true)
      expect(answer.text).toContain('install chromium')
    }
  }, 180_000)
})

/**
 * The same server where Playwright has downloaded no browser, which is every
 * machine until someone downloads one. The browsers directory is pointed at an
 * empty one, so the launch fails the way it does there.
 */
describe('the installed MCP server with no browser', () => {
  const NO_BROWSERS = resolve(SCRATCH, 'no-browsers')
  let bare: Client

  beforeAll(async () => {
    mkdirSync(NO_BROWSERS, { recursive: true })
    bare = await connect(['--read-only'], { PLAYWRIGHT_BROWSERS_PATH: NO_BROWSERS })
  }, 120_000)

  afterAll(async () => {
    await bare?.close()
  })

  it('answers render_screen with the command that downloads the browser its Playwright uses', async () => {
    const { isError, text } = await call(bare, 'render_screen', { spec: SPEC, system: 'plain' })
    const playwright = JSON.parse(
      readFileSync(resolve(INSTALLED, 'node_modules/playwright/package.json'), 'utf8'),
    ) as { version: string }
    expect(isError).toBe(true)
    expect(text).toContain(`\`npx -y playwright@${playwright.version} install chromium\``)
    expect(text).not.toContain('pnpm exec')
  }, 120_000)

  it('registers no write tool when started read-only', async () => {
    const { tools } = await bare.listTools()
    expect(tools.map((tool) => tool.name)).not.toContain('install')
  })
})

describe('the server’s own bin', () => {
  it('refuses an unknown flag on stderr, before it starts', () => {
    const { code, stdout, stderr } = bin('polymorph-mcp', ['--readonly'])
    expect(code).toBe(1)
    expect(stdout).toBe('')
    expect(stderr).toContain('unknown argument "--readonly"')
    expect(stderr).toContain('usage: polymorph-mcp [--project <path>] [--read-only]')
  })

  it('is the server `polymorph mcp` starts', () => {
    const { code, stderr } = bin('polymorph', ['mcp', '--readonly'])
    expect(code).toBe(1)
    expect(stderr).toContain('usage: polymorph mcp [--project <path>] [--read-only]')
  })
})
