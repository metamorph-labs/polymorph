import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

import { buildRegistry, PUBLISHED_NAMES, type Registry } from '@polymorph/registry'
import { admitTheme } from '@polymorph/theme'
import { afterAll, describe, expect, it } from 'vitest'

import { run } from './cli'
import { eslintFragment, installedEslintFragment, stylelintFragment, tokenValuesIn } from './emit'
import {
  APP_TOOLING,
  INSTALL_COMMAND,
  installApp,
  planInit,
  REACT_RANGE,
  refuseDirectory,
} from './init'
import { DEFAULT_DIR } from './plan'

/**
 * `polymorph init`, without building anything: the plan, the refusals and the
 * command's output. `init.test.ts` at the package root builds the app it
 * writes, lints it and typechecks it.
 */

const ROOT = resolve(import.meta.dirname, '../../..')
const registry: Registry = buildRegistry(ROOT)
const programs = {
  mcp: resolve(ROOT, 'packages/mcp/bin/polymorph-mcp.js'),
  emit: resolve(ROOT, 'packages/spec/bin/emit.js'),
}

const scratch = mkdtempSync(resolve(tmpdir(), 'polymorph-init-unit-'))
afterAll(() => {
  rmSync(scratch, { recursive: true, force: true })
})

function cli(argv: string[], options: { withPrograms?: boolean } = {}) {
  const lines: string[] = []
  const outcome = run(
    {
      root: scratch,
      source: ROOT,
      registry,
      out: (line) => lines.push(line),
      ...(options.withPrograms === false ? {} : { programs }),
    },
    argv,
  )
  return { code: outcome.code, output: lines.join('\n') }
}

const manifestOf = (plan: ReturnType<typeof planInit>) => {
  const step = plan.steps.find((entry) => entry.path === 'package.json')
  if (step?.kind !== 'write') throw new Error('the plan writes no package.json')
  return JSON.parse(step.contents) as {
    name: string
    dependencies: Record<string, string>
    devDependencies: Record<string, string>
    scripts: Record<string, string>
  }
}

describe('the plan', () => {
  const plan = planInit(registry, { dir: '/somewhere/My App!', programs })

  it('themes the app with the default system and the palette it declares', () => {
    const plain = registry.theme.systems.find((system) => system.name === 'plain')
    expect(plan.system.name).toBe('plain')
    expect(plan.palette).toBe(plain?.defaultPalette)
  })

  it('names the package after the directory, in the form npm accepts', () => {
    expect(plan.name).toBe('my-app')
    expect(manifestOf(plan).name).toBe('my-app')
  })

  it('installs the published packages under their workspace names, at the registry’s ranges', () => {
    const { dependencies, devDependencies } = manifestOf(plan)
    for (const name of ['@polymorph/engine', '@polymorph/react', '@polymorph/react-ui']) {
      expect(dependencies[name], name).toBe(
        `npm:${PUBLISHED_NAMES[name]}@${registry.packages[name]}`,
      )
    }
    // Only the lint configs load the rules.
    expect(devDependencies['@polymorph/rules']).toBe(
      `npm:${PUBLISHED_NAMES['@polymorph/rules']}@${registry.packages['@polymorph/rules']}`,
    )
    expect(dependencies['@polymorph/rules']).toBeUndefined()
    expect(dependencies['react']).toBe(REACT_RANGE)
  })

  it('installs the fonts the system names, because the plugin imports them', () => {
    const { dependencies } = manifestOf(plan)
    for (const font of plan.system.fonts) {
      expect(dependencies[font.package], font.package).toBe(registry.packages[font.package])
    }
  })

  it('copies the theme from the files the registry names', () => {
    const palette = registry.theme.palettes.find((entry) => entry.name === plan.palette)
    expect(plan.steps.filter((step) => step.kind === 'copy')).toEqual([
      { kind: 'copy', path: `src/theme/${plan.system.name}.json`, from: plan.system.file },
      { kind: 'copy', path: `src/theme/${plan.palette}.json`, from: palette?.file },
    ])
  })

  it('writes the spec before it emits the screen, and the container after', () => {
    const paths = plan.steps.map((step) => step.path)
    expect(paths.indexOf('src/screens/welcome.json')).toBeLessThan(
      paths.indexOf('src/screens/Welcome.tsx'),
    )
    expect(paths.indexOf('src/screens/Welcome.tsx')).toBeLessThan(paths.indexOf('src/App.tsx'))
    expect(plan.steps.find((step) => step.path === 'src/screens/Welcome.tsx')?.kind).toBe('emit')
  })

  it('tells an agent that the MCP server’s path belongs to one machine', () => {
    const step = plan.steps.find((entry) => entry.path === 'AGENTS.md')
    if (step?.kind !== 'write') throw new Error('the plan writes no AGENTS.md')
    expect(step.contents).toContain('The path is machine-specific.')
    expect(step.contents).toContain('add `.mcp.json` to `.gitignore`')
  })

  it('tells an agent it can see a screen, and what that needs', () => {
    const step = plan.steps.find((entry) => entry.path === 'AGENTS.md')
    if (step?.kind !== 'write') throw new Error('the plan writes no AGENTS.md')
    expect(step.contents).toContain('call `render_screen` with its spec')
    expect(step.contents).toContain('`pnpm exec playwright install chromium`')
  })

  it('tells an agent how another library’s component is hosted, in each framework', () => {
    for (const framework of ['react', 'vue', 'svelte', 'solid', 'angular'] as const) {
      const written = planInit(registry, { dir: '/x/app', programs, framework }).steps.find(
        (entry) => entry.path === 'AGENTS.md',
      )
      if (written?.kind !== 'write') throw new Error('the plan writes no AGENTS.md')
      expect(written.contents, framework).toContain(
        framework === 'angular'
          ? '`<pm-third-party library="…" reason="…">`'
          : '`<ThirdParty library="…" reason="…">`',
      )
      expect(written.contents, framework).toContain(
        `\`useThemeValues()\` from \`@polymorph/${framework}\``,
      )
    }
  })

  it('takes any catalogue system by name', () => {
    const pastel = planInit(registry, { dir: '/x/app', system: 'pastel', programs })
    expect(pastel.palette).toBe('amethyst')
    expect(manifestOf(pastel).dependencies).toHaveProperty('@fontsource-variable/plus-jakarta-sans')
  })
})

/**
 * The values in the lint fragments.
 *
 * `polymorph add` reads them from the sheet it compiles. An app `init` writes
 * compiles its theme in the Vite plugin, after the fragments exist, so `init`
 * writes the registry's instead. Both must be the same answer, or the same
 * system would name a different step depending on how it was installed.
 */
describe('the lint fragments', () => {
  const plan = planInit(registry, { dir: '/somewhere/app', programs })
  const written = (target: ReturnType<typeof planInit>, path: string): string => {
    const step = target.steps.find((entry) => entry.path === path)
    if (step?.kind !== 'write') throw new Error(`the plan writes no ${path}`)
    return step.contents
  }

  /** What `polymorph add` reads from the compiled sheet of a system and its own palette. */
  const compiled = (name: string) => {
    const system = registry.theme.systems.find((entry) => entry.name === name)
    const palette = registry.theme.palettes.find((entry) => entry.name === system?.defaultPalette)
    const json = (file = '') => JSON.parse(readFileSync(resolve(ROOT, file), 'utf8')) as unknown
    const admission = admitTheme({ system: json(system?.file), palette: json(palette?.file) })
    expect(admission.lawful, name).toBe(true)
    return tokenValuesIn(admission.css ?? '')
  }

  it('carry the theme’s values, so a report names the step and not only the family', () => {
    for (const path of ['polymorph.eslint.js', 'polymorph.stylelint.js']) {
      const fragment = written(plan, path)
      expect(fragment, path).not.toContain('const VALUES = {}\n')
      expect(fragment, path).toContain("    '--pm-space-4': '12px',")
      expect(fragment, path).toContain(
        `    '--pm-accent-bg': '${plan.system.tokenValues.color['--pm-accent-bg']}',`,
      )
    }
  })

  it('carry the values `polymorph add` reads from the compiled sheet of the same system', () => {
    const values = compiled(plan.system.name)
    expect(written(plan, 'polymorph.eslint.js')).toBe(installedEslintFragment(values))
    expect(written(plan, 'polymorph.stylelint.js')).toBe(
      stylelintFragment(DEFAULT_DIR, registry.theme.customProperties, values),
    )
  })

  it('switch the `<button>` fix on, which the vendoring fragment leaves off', () => {
    // An app `init` writes imports every member from `@polymorph/react-ui`, so
    // the fix can import `Button` from there. A vendored app imports by path.
    const installed = written(plan, 'polymorph.eslint.js')
    expect(installed).toMatch(/ {6}\.\.\.allRules,\n {6}\.\.\.fixableRawControls,\n/)
    expect(eslintFragment(DEFAULT_DIR)).not.toContain('fixableRawControls')
  })

  it('have no block for a vendored tree, because the app has none', () => {
    const installed = written(plan, 'polymorph.eslint.js')
    expect(installed).not.toContain('vendorable-imports')
    expect(installed).not.toContain(DEFAULT_DIR)
    expect(installed).not.toContain('ignores')
  })

  it('read every system the way `polymorph add` reads its compiled sheet', () => {
    // A dark-default system and the compact and comfortable ones included: the
    // values are what the pairing renders before any scope attribute applies.
    for (const system of registry.theme.systems) {
      expect(system.tokenValues, system.name).toEqual(compiled(system.name))
    }
  })
})

describe('the tool ranges', () => {
  const root = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8')) as {
    devDependencies: Record<string, string>
  }
  const vocabulary = JSON.parse(
    readFileSync(resolve(ROOT, 'packages/react-ui/package.json'), 'utf8'),
  ) as { peerDependencies: Record<string, string> }

  it('are the ranges this repository builds and lints with', () => {
    // A new app starts on the tools the vocabulary and the rules are tested
    // against. A bump at the root fails here until it is made in `init.ts`.
    for (const [name, range] of Object.entries(APP_TOOLING)) {
      expect(range, name).toBe(root.devDependencies[name])
    }
  })

  it('take React at the vocabulary’s peer range', () => {
    expect(REACT_RANGE).toBe(vocabulary.peerDependencies['react'])
    expect(REACT_RANGE).toBe(vocabulary.peerDependencies['react-dom'])
  })
})

describe('where an app may be created', () => {
  it('accepts a directory that does not exist yet, or an empty one', () => {
    expect(refuseDirectory(resolve(scratch, 'new/deeper'), ROOT, registry)).toBeNull()
    const empty = resolve(scratch, 'empty')
    mkdirSync(empty)
    expect(refuseDirectory(empty, ROOT, registry)).toBeNull()
  })

  it('takes a directory with only `.git` as empty, because it is a fresh repository', () => {
    const fresh = resolve(scratch, 'fresh')
    mkdirSync(resolve(fresh, '.git'), { recursive: true })
    expect(refuseDirectory(fresh, ROOT, registry)).toBeNull()
  })

  it('refuses a directory with files in it', () => {
    const used = resolve(scratch, 'used')
    mkdirSync(used)
    writeFileSync(resolve(used, 'README.md'), 'mine\n')
    expect(refuseDirectory(used, ROOT, registry)).toContain('is not empty')
  })

  it('refuses the checkout and anything inside it', () => {
    expect(refuseDirectory(ROOT, ROOT, registry)).not.toBeNull()
    expect(refuseDirectory(resolve(ROOT, 'apps/new-app'), ROOT, registry)).toContain(
      'inside the polymorph checkout',
    )
  })

  it('refuses another copy of polymorph, recognised by its contents', () => {
    const copy = resolve(scratch, 'other-clone')
    mkdirSync(resolve(copy, registry.vendor.base, '..'), { recursive: true })
    writeFileSync(resolve(copy, registry.vendor.base), '')
    expect(refuseDirectory(resolve(copy, 'apps/new-app'), ROOT, registry)).toContain(
      'inside a checkout of polymorph',
    )
  })
})

describe('the command', () => {
  it('lists the plan on a dry run and writes nothing', () => {
    const { code, output } = cli(['init', 'dry', '--dry-run', '--system', 'journal'])
    expect(code).toBe(0)
    expect(output).toContain('journal + umber')
    expect(output).toContain('src/theme/journal.json')
    expect(output).toContain('.mcp.json')
    expect(output).toContain('pnpm install')
    expect(existsSync(resolve(scratch, 'dry'))).toBe(false)
  })

  it('lists the catalogue for a system it does not have, and fails', () => {
    const { code, output } = cli(['init', 'nope', '--system', 'nonesuch'])
    expect(code).toBe(1)
    expect(output).toContain('no system called "nonesuch"')
    for (const system of registry.theme.systems) expect(output).toContain(system.name)
    expect(existsSync(resolve(scratch, 'nope'))).toBe(false)
  })

  it('refuses a non-empty directory and leaves it as it was', () => {
    const { code, output } = cli(['init', 'used'])
    expect(code).toBe(1)
    expect(output).toContain('is not empty')
    expect(readFileSync(resolve(scratch, 'used/README.md'), 'utf8')).toBe('mine\n')
  })

  it('writes the app, emits its first screen, and says what to do next', () => {
    // In process, so the writer is measured here. `init.test.ts` at the
    // package root runs the bin and builds what this writes.
    const { code, output } = cli(['init', 'written', '--no-install'])
    const app = resolve(scratch, 'written')

    expect(code, output).toBe(0)
    expect(output).toContain('emitted    src/screens/Welcome.tsx')
    expect(readFileSync(resolve(app, 'src/screens/Welcome.tsx'), 'utf8')).toContain(
      'export function Welcome',
    )
    expect(output).toContain(`cd written && NODE_AUTH_TOKEN=$(gh auth token) ${INSTALL_COMMAND}`)
    expect(existsSync(resolve(app, 'node_modules'))).toBe(false)
  }, 120_000)

  it('reports an emitter that refuses the spec, instead of writing a screen', () => {
    const refusing = resolve(scratch, 'refusing-emit.mjs')
    writeFileSync(refusing, "console.error('not lawful'); process.exit(1)\n")
    const lines: string[] = []
    const outcome = run(
      {
        root: scratch,
        source: ROOT,
        registry,
        out: (line) => lines.push(line),
        programs: { ...programs, emit: refusing },
      },
      ['init', 'refused', '--no-install'],
    )

    expect(outcome.code).toBe(1)
    expect(lines.join('\n')).toContain('the emitter refused src/screens/welcome.json')
    expect(lines.join('\n')).toContain('not lawful')
    expect(existsSync(resolve(scratch, 'refused/src/screens/Welcome.tsx'))).toBe(false)
  })

  it('needs exactly one directory', () => {
    expect(cli(['init']).code).toBe(1)
    expect(cli(['init', 'a', 'b']).code).toBe(1)
  })

  it('refuses to run without the programs it wires the app to', () => {
    const { code, output } = cli(['init', 'orphan', '--dry-run'], { withPrograms: false })
    expect(code).toBe(1)
    expect(output).toContain('MCP server and screen emitter')
  })
})

/**
 * The install step, against stand-in programs. A real `pnpm install` would
 * reach GitHub Packages, and a real `gh` would hand over this machine's token.
 * Each test puts a directory of shell scripts on `PATH` instead, so it decides
 * which programs exist and what they answer.
 */
describe('the install', () => {
  /** A `PATH` holding only the named stand-ins. */
  function programsOnPath(scripts: Record<string, string>): string {
    const bin = mkdtempSync(resolve(scratch, 'bin-'))
    for (const [name, body] of Object.entries(scripts)) {
      writeFileSync(resolve(bin, name), `#!/bin/sh\n${body}\n`)
      chmodSync(resolve(bin, name), 0o755)
    }
    return bin
  }

  function emptyApp(): string {
    const app = mkdtempSync(resolve(scratch, 'app-'))
    writeFileSync(resolve(app, '.npmrc'), '//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}\n')
    return app
  }

  /**
   * A pnpm that records the token and the arguments it was given, in the
   * directory it ran in.
   */
  const recordingPnpm =
    'printf %s "$NODE_AUTH_TOKEN" > "$PWD/seen-token"; printf %s "$*" > "$PWD/seen-args"'

  /** A pnpm that prints what the real one prints for a failed fetch, on stdout, and fails. */
  const failingPnpm = (message: string) => `printf '%s\\n' '${message}'; exit 1`

  /** What pnpm prints when the registry has no such package, or no release in the range. */
  const NOT_FOUND =
    '[ERR_PNPM_FETCH_404] GET https://npm.pkg.github.com/@metamorph-labs%2Fpolymorph-engine: Not Found - 404'
  const NO_MATCHING_VERSION =
    '[ERR_PNPM_NO_MATCHING_VERSION] No matching version found for @metamorph-labs/polymorph-react@^1.0.0'

  function installWith(scripts: Record<string, string>, env: NodeJS.ProcessEnv = {}) {
    const app = emptyApp()
    const lines: string[] = []
    const outcome = installApp(app, { ...env, PATH: programsOnPath(scripts) }, (line) =>
      lines.push(line),
    )
    return { app, outcome, output: lines.join('\n') }
  }

  it('asks the GitHub CLI for a token, and gives it to pnpm in the environment only', () => {
    const { app, outcome } = installWith({ gh: 'echo gh-issued-token', pnpm: recordingPnpm })

    expect(outcome).toBe('installed')
    expect(readFileSync(resolve(app, 'seen-token'), 'utf8')).toBe('gh-issued-token')
    expect(readFileSync(resolve(app, '.npmrc'), 'utf8')).not.toContain('gh-issued-token')
    // The install spawns the stub programs, which a loaded machine starts slowly.
  }, 30_000)

  it('says when it used the GitHub CLI’s token, and recommends a read-only one', () => {
    const { output } = installWith({ gh: 'echo gh-issued-token', pnpm: recordingPnpm })
    const notes = output.split('\n').filter((line) => line.includes('gh auth token'))
    expect(notes).toHaveLength(1)
    expect(notes[0]).toContain('NODE_AUTH_TOKEN is unset')
    expect(notes[0]).toContain('only read:packages')
    expect(output).not.toContain('gh-issued-token')
  }, 30_000)

  it('prefers NODE_AUTH_TOKEN, without asking the GitHub CLI or saying anything about it', () => {
    const { app, outcome, output } = installWith(
      { gh: 'exit 1', pnpm: recordingPnpm },
      { NODE_AUTH_TOKEN: 'from-env' },
    )

    expect(outcome).toBe('installed')
    expect(readFileSync(resolve(app, 'seen-token'), 'utf8')).toBe('from-env')
    expect(output).not.toContain('gh auth token')
  })

  it('installs the app on its own, outside any pnpm workspace above it', () => {
    const { app } = installWith({ pnpm: recordingPnpm }, { NODE_AUTH_TOKEN: 'from-env' })
    expect(readFileSync(resolve(app, 'seen-args'), 'utf8')).toBe('install --ignore-workspace')
    expect(INSTALL_COMMAND).toBe('pnpm install --ignore-workspace')
  })

  it('replays what pnpm printed, with the token masked', () => {
    const { output } = installWith(
      { pnpm: 'echo "resolved with $NODE_AUTH_TOKEN"; echo "warned" >&2' },
      { NODE_AUTH_TOKEN: 'secret-token' },
    )
    expect(output).toContain('resolved with [token]')
    expect(output).toContain('warned')
    expect(output).not.toContain('secret-token')
  })

  it('tells a release that is not published from a token the registry refused', () => {
    const token = { NODE_AUTH_TOKEN: 'from-env' }
    expect(installWith({ pnpm: failingPnpm(NOT_FOUND) }, token).outcome).toBe('unpublished')
    expect(installWith({ pnpm: failingPnpm(NO_MATCHING_VERSION) }, token).outcome).toBe(
      'unpublished',
    )
    // npm's codes, on stderr, mean the same.
    expect(
      installWith(
        { pnpm: "echo 'npm error code ETARGET @metamorph-labs/polymorph-rules' >&2; exit 1" },
        token,
      ).outcome,
    ).toBe('unpublished')

    for (const refused of [
      '[ERR_PNPM_FETCH_401] GET https://npm.pkg.github.com/@metamorph-labs%2Fpolymorph-engine: Unauthorized - 401',
      '[ERR_PNPM_FETCH_403] GET https://npm.pkg.github.com/@metamorph-labs%2Fpolymorph-engine: Forbidden - 403',
    ]) {
      expect(installWith({ pnpm: failingPnpm(refused) }, token).outcome, refused).toBe(
        'unauthorized',
      )
    }
  })

  it('does not call a missing release of someone else’s package unpublished', () => {
    // A font range with no release is not a polymorph release to wait for.
    const font =
      '[ERR_PNPM_NO_MATCHING_VERSION] No matching version found for @fontsource-variable/geist@^99.0.0'
    expect(installWith({ pnpm: failingPnpm(font) }, { NODE_AUTH_TOKEN: 'x' }).outcome).toBe(
      'failed',
    )
  })

  it('has no token when the GitHub CLI is absent or logged out', () => {
    expect(installApp(emptyApp(), { PATH: programsOnPath({}) })).toBe('no-token')
    expect(installApp(emptyApp(), { PATH: programsOnPath({ gh: 'exit 1' }) })).toBe('no-token')
  })

  it('tells a missing pnpm from a failed install', () => {
    const token = { NODE_AUTH_TOKEN: 'from-env' }
    expect(installApp(emptyApp(), { ...token, PATH: programsOnPath({}) })).toBe('no-pnpm')
    expect(installApp(emptyApp(), { ...token, PATH: programsOnPath({ pnpm: 'exit 1' }) })).toBe(
      'failed',
    )
  })

  /**
   * `polymorph init <dir>` with the given stand-ins on `PATH` and the given
   * token. The command reads the process's own environment, so it is swapped
   * for the length of the call and put back.
   */
  function initWith(dir: string, scripts: Record<string, string>, token?: string) {
    const saved = { PATH: process.env['PATH'], NODE_AUTH_TOKEN: process.env['NODE_AUTH_TOKEN'] }
    process.env['PATH'] = programsOnPath(scripts)
    if (token === undefined) delete process.env['NODE_AUTH_TOKEN']
    else process.env['NODE_AUTH_TOKEN'] = token
    try {
      return cli(['init', dir])
    } finally {
      for (const [name, value] of Object.entries(saved)) {
        if (value === undefined) delete process.env[name]
        else process.env[name] = value
      }
    }
  }

  it('writes the app, then prints the token hint and fails when there is no token', () => {
    const { code, output } = initWith('tokenless', {})
    expect(code).toBe(1)
    expect(output).toContain('there is no token')
    expect(output).toContain('gh auth refresh -s read:packages')
    expect(output).toContain(`cd tokenless && NODE_AUTH_TOKEN=$(gh auth token) ${INSTALL_COMMAND}`)
    expect(existsSync(resolve(scratch, 'tokenless/src/App.tsx'))).toBe(true)
  }, 120_000)

  it('writes the app, then names the packages that are not published yet and the release steps', () => {
    const { code, output } = initWith('unreleased', { pnpm: failingPnpm(NOT_FOUND) }, 'from-env')
    expect(code).toBe(1)
    // pnpm's own report, then what it means.
    expect(output).toContain(NOT_FOUND)
    expect(output).toContain('not published at those versions yet')
    for (const pkg of [
      '@polymorph/engine',
      '@polymorph/react',
      '@polymorph/react-ui',
      '@polymorph/rules',
    ]) {
      expect(output).toContain(`  ${PUBLISHED_NAMES[pkg]}@${registry.packages[pkg]}\n`)
    }
    expect(output).toContain('CONTRIBUTING.md')
    expect(output).toContain('pnpm publish:packages')
    expect(output).not.toContain('gh auth refresh')
    expect(existsSync(resolve(scratch, 'unreleased/src/App.tsx'))).toBe(true)
  }, 120_000)

  it('writes the app, then prints the token hint when the registry refuses the token', () => {
    const refused =
      '[ERR_PNPM_FETCH_401] GET https://npm.pkg.github.com/@metamorph-labs%2Fpolymorph-engine: Unauthorized - 401'
    const { code, output } = initWith('refused-token', { pnpm: failingPnpm(refused) }, 'from-env')
    expect(code).toBe(1)
    expect(output).toContain('the registry refused the token')
    expect(output).toContain('gh auth refresh -s read:packages')
    expect(output).not.toContain('not published')
    expect(existsSync(resolve(scratch, 'refused-token/src/App.tsx'))).toBe(true)
  }, 120_000)
})
