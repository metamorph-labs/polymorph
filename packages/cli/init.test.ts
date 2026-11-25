import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

import { buildRegistry, renderSystemCard, type Registry } from '@polymorph/registry'
// Each package's own lock over its `dist`. The packages' `packaging.test.ts`
// and `scratch.test.ts` build the same trees. See the note on `beforeAll`.
import { buildEngine, lockEngineDist } from '../engine/dist-lock'
import { buildReact, lockReactDist } from '../react/dist-lock'
import { buildReactUi, lockReactUiDist } from '../react-ui/dist-lock'
import { buildRules, lockRulesDist } from '../rules/dist-lock'
// The emitter's own marker and import source. A test may read the spec
// package; the CLI may not depend on it.
import { EMITTED_MARKER, IMPORT_SOURCE } from '../spec/src/emit'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { installNodeModules, read, ROOT, runIn, write } from './consumer-app'

/**
 * `polymorph init`'s acceptance test, run for real.
 *
 * The requirement: *one command, run from a checkout, gives a new app that
 * typechecks, builds, and lints clean under the red rules, with an agent's
 * tools configured and a first screen emitted from a spec.* The test runs the
 * bin as a person would, into a directory outside the workspace, with
 * `--no-install`, because the published packages are what is under test and
 * GitHub Packages is not. It then installs the four packages from their `dist`
 * the way `scratch.test.ts` does (`consumer-app.ts`), with only what the new
 * `package.json` declares, build tools included, and runs the app's own tools
 * in it.
 *
 * `scratch.test.ts` covers the vendored path. This covers the installed one:
 * `@polymorph/react-ui` from its build, the theme compiled by the engine's Vite
 * plugin, and the red rules loaded from `@polymorph/rules` as a dev dependency.
 */

const BIN = resolve(ROOT, 'packages/cli/bin/polymorph.js')
const MCP_BIN = resolve(ROOT, 'packages/mcp/bin/polymorph-mcp.js')

let parent: string
let app: string
let registry: Registry
let output: string

/**
 * `init` runs first and reads no `dist`, so it runs before the locks. The four
 * builds then run under their locks, taken in the order every holder takes
 * them (engine, React foundation, rules, vocabulary), so two holders never
 * wait on each other. The locks are held until `installNodeModules` has copied
 * each `dist` into the app, which is this file's last read of those trees.
 * `packages/engine/dist-lock.ts` has the details.
 */
beforeAll(async () => {
  registry = buildRegistry(ROOT)
  parent = mkdtempSync(resolve(tmpdir(), 'polymorph-init-'))
  app = resolve(parent, 'first-app')
  output = execFileSync(process.execPath, [BIN, 'init', 'first-app', '--no-install'], {
    cwd: parent,
    stdio: 'pipe',
  }).toString()

  const releases: (() => void)[] = []
  try {
    releases.push(await lockEngineDist('init.test.ts'))
    releases.push(await lockReactDist('init.test.ts'))
    releases.push(await lockRulesDist('init.test.ts'))
    releases.push(await lockReactUiDist('init.test.ts'))
    buildEngine()
    buildReact()
    buildRules()
    buildReactUi()

    installNodeModules(app, 'declared')
  } finally {
    for (const release of releases.reverse()) release()
  }
}, 900_000)

afterAll(() => {
  if (parent) rmSync(parent, { recursive: true, force: true })
})

const run = (command: string, args: string[]) => runIn(app, command, args)

describe('polymorph init writes an app', () => {
  it('writes every file it reports, in the order it reports them', () => {
    const files = [
      'package.json',
      '.npmrc',
      '.gitignore',
      'index.html',
      'tsconfig.json',
      '.prettierrc.json',
      'src/main.tsx',
      'src/vite-env.d.ts',
      'vite.config.ts',
      'src/theme/plain.json',
      'src/theme/neutral.json',
      'polymorph.eslint.js',
      'polymorph.stylelint.js',
      'eslint.config.js',
      'stylelint.config.js',
      'AGENTS.md',
      'CLAUDE.md',
      'polymorph/system-card.md',
      '.claude/skills/polymorph-screen/SKILL.md',
      '.agents/skills/polymorph-screen/SKILL.md',
      '.mcp.json',
      '.cursor/mcp.json',
      '.codex/config.toml',
      'polymorph/agents.json',
      'src/screens/welcome.json',
      'src/screens/Welcome.tsx',
      'src/App.tsx',
    ]
    for (const file of files) expect(existsSync(resolve(app, file)), file).toBe(true)

    const reported = files.map((file) => output.indexOf(` ${file}`))
    expect(reported.every((at) => at >= 0)).toBe(true)
    expect([...reported].sort((a, b) => a - b)).toEqual(reported)
    expect(output).toContain('cd first-app')
    expect(output).toContain('pnpm dev')
  })

  it('writes an .npmrc that names the token and never holds one', () => {
    expect(read(app, '.npmrc')).toBe(
      '@metamorph-labs:registry=https://npm.pkg.github.com\n' +
        '//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}\n',
    )
  })

  it('points the MCP server at this checkout’s bin, run against the app', () => {
    const config = JSON.parse(read(app, '.mcp.json')) as {
      mcpServers: { polymorph: { command: string; args: string[] } }
    }
    expect(config.mcpServers.polymorph).toEqual({
      command: 'node',
      args: [MCP_BIN, '--project', '.'],
    })
    expect(existsSync(MCP_BIN)).toBe(true)
  })

  it('writes the registry’s system card, and tells an agent to read it', () => {
    expect(read(app, 'polymorph/system-card.md')).toBe(renderSystemCard(registry))
    const agents = read(app, 'AGENTS.md').replace(/\s+/g, ' ')
    expect(agents).toContain('@polymorph/react-ui')
    expect(agents).toContain('polymorph/system-card.md')
    expect(agents).toContain(`${BIN} card`)
    expect(agents).toContain(`${BIN} validate <file>`)
    expect(agents).toContain('polymorph-screen/1')
    expect(agents).toContain(`${BIN} render <spec.json>`)
    expect(read(app, 'CLAUDE.md')).toBe('@AGENTS.md\n')
    for (const skill of [
      'polymorph-screen',
      'polymorph-rules',
      'polymorph-setup',
      'polymorph-theme',
    ]) {
      expect(read(app, `.claude/skills/${skill}/SKILL.md`)).toContain(`name: ${skill}`)
      expect(read(app, `.agents/skills/${skill}/SKILL.md`)).toContain(`name: ${skill}`)
    }
  })

  it('writes the theme’s values into both lint fragments', () => {
    // The Vite plugin compiles the theme after these are written, so the
    // values are the registry's for the same system and palette.
    for (const config of ['polymorph.eslint.js', 'polymorph.stylelint.js']) {
      const fragment = read(app, config)
      expect(fragment, config).not.toContain('const VALUES = {}\n')
      expect(fragment, config).toContain("    '--pm-space-4': '12px',")
      expect(fragment, config).toMatch(/ {4}'--pm-accent-bg': '[^']+',/)
    }
  })

  it('copies the theme the registry names, byte for byte', () => {
    const plain = registry.theme.systems.find((system) => system.name === 'plain')
    const neutral = registry.theme.palettes.find((palette) => palette.name === 'neutral')
    expect(read(app, 'src/theme/plain.json')).toBe(read(ROOT, plain?.file ?? ''))
    expect(read(app, 'src/theme/neutral.json')).toBe(read(ROOT, neutral?.file ?? ''))
  })

  it('emits the first screen from its spec', () => {
    const screen = read(app, 'src/screens/Welcome.tsx')
    expect(screen).toContain(EMITTED_MARKER)
    expect(screen).toContain(`from '${IMPORT_SOURCE}'`)
    expect(screen).toContain('export function Welcome')
    // Formatted with the app's Prettier settings, which `init` wrote first.
    expect(screen).not.toContain(';\n')
  })
})

describe('the app works', () => {
  it('typechecks', () => {
    const result = run('npx', ['tsc', '--noEmit'])
    expect(result.output).toBe('')
    expect(result.code).toBe(0)
  }, 120_000)

  it('builds, with the theme compiled and its fonts bundled', () => {
    const result = run('npx', ['vite', 'build', '--logLevel', 'warn'])
    expect(result.code, result.output).toBe(0)

    const html = read(app, 'dist/index.html')
    expect(html).toContain('data-system="plain"')
    expect(html).toContain('data-palette="neutral"')

    const assets = readdirSync(resolve(app, 'dist/assets'))
    expect(assets.some((name) => name.endsWith('.woff2'))).toBe(true)
    const css = assets
      .filter((name) => name.endsWith('.css'))
      .map((name) => read(app, `dist/assets/${name}`))
      .join('\n')
    expect(css).toContain('Geist')
    // The minifier may drop the quotes around an attribute value.
    expect(css).toMatch(/\[data-system=["']?plain["']?\]/)
  }, 180_000)

  it('lints clean under the red rules', () => {
    const eslint = run('npx', ['eslint', 'src'])
    expect(eslint.output).toBe('')
    expect(eslint.code).toBe(0)

    const stylelint = run('npx', ['stylelint', 'src/**/*.css', '--allow-empty-input'])
    expect(stylelint.output).toBe('')
    expect(stylelint.code).toBe(0)
  }, 120_000)

  it('rewrites a raw `<button>` as the member under `eslint --fix`, imported from the vocabulary', () => {
    // The app imports every member from `@polymorph/react-ui`, so its config
    // switches the fix on (`fixableRawControls`). A vendoring config does not.
    write(
      app,
      'src/Fixed.tsx',
      `export function Fixed() {\n  return <button type="button">Save</button>\n}\n`,
    )
    const result = run('npx', ['eslint', '--fix', 'src/Fixed.tsx'])
    const fixed = read(app, 'src/Fixed.tsx')
    rmSync(resolve(app, 'src/Fixed.tsx'))

    expect(result.output).toBe('')
    expect(result.code).toBe(0)
    expect(fixed).toBe(
      `import { Button } from '@polymorph/react-ui'\n\n` +
        `export function Fixed() {\n  return <Button label="Save" />\n}\n`,
    )
  }, 120_000)

  it('goes red on a style decision, so the clean result above means something', () => {
    write(
      app,
      'src/Seeded.tsx',
      `export const gap = '12px'\n\n` +
        `export function Seeded() {\n  return <div style={{ padding: 12, color: 'rebeccapurple' }} />\n}\n`,
    )
    const result = run('npx', ['eslint', 'src'])
    rmSync(resolve(app, 'src/Seeded.tsx'))

    expect(result.code).toBe(1)
    expect(result.output).toContain('polymorph/no-raw-styles')
    // Each report names the step, not only the family (`p={…}`), because init
    // wrote the theme's values into the config the rule reads.
    expect(result.output).toContain('It is space step 4 (`--pm-space-4`)')
    expect(result.output).toContain('`<Stack p={4}>`')
  }, 120_000)
})
