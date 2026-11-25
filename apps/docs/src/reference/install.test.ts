import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { publishedTools } from '../../../../packages/cli/src/init'
import { mcpConfig } from '../../../../packages/cli/src/init-app'
import { DEFAULT_SYSTEM } from '../../../../packages/cli/src/plan'
import { REGISTRY } from '../registry'
import { PUBLISHED_NAMES } from './facts'
import { GUIDE, INIT_SYSTEM, MCP_CONFIG, QUICK_START, TARGETS } from './install'

/**
 * The install page prints commands a reader runs outside this repository. These assertions hold
 * them to the files they name, the CLI's own templates and the guide they link.
 */

const ROOT = resolve(import.meta.dirname, '../../../..')
const read = (path: string) => readFileSync(resolve(ROOT, path), 'utf8')

/** GitHub's anchor for a Markdown heading. */
const anchorOf = (heading: string) =>
  `#${heading
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s/g, '-')}`

const snippets = TARGETS.flatMap((target) => [
  ...(target.create === undefined ? [] : [target.create]),
  ...target.add,
])

describe('the install page', () => {
  it('starts a new app with the system polymorph init uses', () => {
    expect(INIT_SYSTEM).toBe(DEFAULT_SYSTEM)
  })

  it('shows the MCP config the published tools write into .mcp.json', () => {
    const tools = publishedTools(REGISTRY)
    expect(JSON.parse(MCP_CONFIG)).toEqual(
      JSON.parse(mcpConfig({ command: tools.command, args: [...tools.args, 'mcp'] })),
    )
  })

  it('copies theme files that exist', () => {
    const palette = REGISTRY.theme.systems.find((system) => system.name === INIT_SYSTEM)
    expect(existsSync(resolve(ROOT, `design/systems/${INIT_SYSTEM}.json`))).toBe(true)
    expect(existsSync(resolve(ROOT, `design/palettes/${palette?.defaultPalette}.json`))).toBe(true)
  })

  it('links sections of docs/consuming.md that exist', () => {
    const headings = new Set(
      read('docs/consuming.md')
        .split('\n')
        .filter((line) => /^#{2,3} /.test(line))
        .map((line) => anchorOf(line.replace(/^#+ /, ''))),
    )
    expect(GUIDE).toBe('/guides/consuming')
    for (const target of TARGETS) expect(headings, target.value).toContain(target.anchor)
  })

  it('says an existing app installs from npm with no setup, as docs/consuming.md does', () => {
    // The page drops the `.npmrc` step because the guide says none is needed. When the guide
    // stops saying so, this fails, and the step comes back.
    expect(read('docs/consuming.md')).toMatch(
      /npmjs\.com[\s\S]{0,80}aliases install with no\s+configuration and no token/,
    )
    for (const target of TARGETS) {
      for (const step of target.add) expect(step.code ?? '').not.toContain('_authToken')
    }
  })

  it('writes each Vite plugin import as the CLI writes it', () => {
    const templates = readdirSync(resolve(ROOT, 'packages/cli/src'))
      .filter((file) => /^init.*\.ts$/.test(file) && !file.endsWith('.test.ts'))
      .map((file) => read(`packages/cli/src/${file}`))
      .join('\n')
    const imports = snippets
      .flatMap((snippet) => snippet.code.split('\n'))
      .filter((line) =>
        /^import .* from '(@vitejs|@sveltejs|vite-plugin-solid|@analogjs)/.test(line),
      )
    expect(imports.length).toBeGreaterThan(0)
    for (const line of imports) expect(templates, line).toContain(line)
  })

  it('names only published packages', () => {
    const named = [
      ...[QUICK_START, ...snippets.map((snippet) => snippet.code)]
        .join('\n')
        .matchAll(/'(@polymorph\/[a-z-]+)|"(@polymorph\/[a-z-]+)"/g),
    ].map((match) => match[1] ?? match[2])
    expect(named.length).toBeGreaterThan(0)
    for (const name of named) expect(Object.keys(PUBLISHED_NAMES), name).toContain(name)
  })
})
