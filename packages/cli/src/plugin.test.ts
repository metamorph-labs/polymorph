import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { buildRegistry, type Registry } from '@polymorph/registry'
import { describe, expect, it } from 'vitest'

import { MCP_NAME, PLUGIN_DIR, PLUGIN_ICONS, PLUGIN_NAME, pinnedTools } from './plugin'
import { SKILL_NAMES } from './skills'

/**
 * The laws of the repository's plugin for coding agents (`plugin.ts`, written by
 * `pnpm agents`).
 *
 * **Freshness.** Every file `pnpm agents` writes is compared with the copy on
 * disk, as `scripts/agents.mjs --check` compares them: a file that differs, is
 * missing or is no longer written fails, and so does a drawn icon that is
 * missing or the wrong size. Each names the release, so a version bump fails
 * here until the generator runs.
 *
 * **Listing limits.** Each manifest is held to what the directories ask of
 * it, so an edit that breaks a listing requirement fails here and not in a
 * submission portal: Claude Code's manifest and marketplace
 * (code.claude.com/docs/en/plugins-reference, plugins/marketplace-reference),
 * the portable manifest with OpenAI's fields and its MCP config
 * (developers.openai.com/plugins/build/plugins, plugins/deploy/submission, and
 * the schemas at agent-plugins.org/schemas/1.0.0), Codex's marketplace, and
 * the MCP Registry's `server.json` (modelcontextprotocol.io/registry).
 */

const ROOT = resolve(import.meta.dirname, '../../..')
const registry: Registry = buildRegistry(ROOT)

type ImportModule = (path: string) => Promise<Record<string, unknown>>
interface AgentsScript {
  pluginOutput: (importModule: ImportModule) => Promise<Map<string, string>>
  drawnIcons: (importModule: ImportModule) => Promise<[string, number][]>
  staleFiles: (files: Map<string, string>, icons: [string, number][], dir: string) => string[]
  pngSize: (bytes: Buffer) => { width: number; height: number } | null
}
const script = (await import(
  /* @vite-ignore */ pathToFileURL(resolve(ROOT, 'scripts/agents.mjs')).href
)) as AgentsScript
const importModule: ImportModule = (path) =>
  import(/* @vite-ignore */ path) as Promise<Record<string, unknown>>

const readJson = <T>(path: string): T => JSON.parse(readFileSync(resolve(ROOT, path), 'utf8')) as T
const inPlugin = (path: string) => join(PLUGIN_DIR, path)

/** Every file below the plugin directory, relative to it. */
function pluginFiles(): string[] {
  const found: string[] = []
  const walk = (at: string): void => {
    for (const entry of readdirSync(resolve(ROOT, PLUGIN_DIR, at), { withFileTypes: true })) {
      const path = at === '' ? entry.name : `${at}/${entry.name}`
      if (entry.isDirectory()) walk(path)
      else found.push(path)
    }
  }
  walk('')
  return found
}

const https = (url: unknown, max = 1024) =>
  typeof url === 'string' && url.startsWith('https://') && url.length <= max

describe('the plugin is what `pnpm agents` writes', () => {
  it('has every file current, and nothing it does not write', async () => {
    const files = await script.pluginOutput(importModule)
    const icons = await script.drawnIcons(importModule)
    expect(files.size).toBeGreaterThan(SKILL_NAMES.length)
    expect(script.staleFiles(files, icons, PLUGIN_DIR), 'run `pnpm agents`').toEqual([])
  }, 120_000)

  it('names the release in every manifest, and runs exactly that release', () => {
    const version = registry.version
    expect(readJson<{ version: string }>(inPlugin('.claude-plugin/plugin.json'))).toMatchObject({
      version,
    })
    expect(readJson<{ version: string }>(inPlugin('plugin.json'))).toMatchObject({ version })
    const pinned = pinnedTools(registry).args.join(' ')
    for (const path of pluginFiles()) {
      if (!/\.(md|json)$/.test(path)) continue
      const text = readFileSync(resolve(ROOT, PLUGIN_DIR, path), 'utf8')
      // Anthropic's directory refuses a launcher that runs a range or `latest`.
      for (const [launch] of text.matchAll(/npx (?:-y )?@metamorph-labs\/polymorph@\S+/g)) {
        expect(launch, path).toBe(`npx ${pinned}`)
      }
    }
  })
})

describe('the Claude Code plugin and marketplace', () => {
  const manifest = readJson<Record<string, unknown>>(inPlugin('.claude-plugin/plugin.json'))
  const marketplace = readJson<Record<string, unknown>>('.claude-plugin/marketplace.json')

  it('has a kebab-case name, a version, a description, an author and a licence', () => {
    expect(manifest['name']).toBe(PLUGIN_NAME)
    expect(PLUGIN_NAME).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    expect(typeof manifest['description']).toBe('string')
    expect((manifest['author'] as { name: string }).name.length).toBeGreaterThan(0)
    expect(manifest['license']).toBe('MIT')
  })

  it('fills the fields the directory lists it with: an icon in the plugin and https links', () => {
    expect(existsSync(resolve(ROOT, PLUGIN_DIR, manifest['icon'] as string))).toBe(true)
    expect(manifest['icon']).toMatch(/^\.\//)
    for (const key of [
      'homepage',
      'documentationUrl',
      'supportUrl',
      'privacyPolicyUrl',
      'termsOfServiceUrl',
    ]) {
      expect(https(manifest[key]), key).toBe(true)
    }
  })

  it('has a README of at least 40 words outside code, and no hooks, symbolic links or system files', () => {
    const readme = readFileSync(resolve(ROOT, PLUGIN_DIR, 'README.md'), 'utf8')
    const prose = readme.replace(/```[\s\S]*?```/g, ' ')
    expect(prose.split(/\s+/).filter(Boolean).length).toBeGreaterThanOrEqual(40)
    const files = pluginFiles()
    expect(files.filter((path) => path.startsWith('hooks/'))).toEqual([])
    expect(
      files.filter((path) => /(^|\/)(\.DS_Store|Thumbs\.db|desktop\.ini)$/.test(path)),
    ).toEqual([])
    expect(files.length).toBeLessThanOrEqual(512)
    for (const path of files) {
      const size = readFileSync(resolve(ROOT, PLUGIN_DIR, path)).length
      expect(size, path).toBeLessThan(path.endsWith('.png') ? 5 * 1024 * 1024 : 256 * 1024)
    }
  })

  it('declares one server, read-only, in `.mcp.json`', () => {
    const config = readJson<{ mcpServers: Record<string, { args: string[] }> }>(
      inPlugin('.mcp.json'),
    )
    expect(Object.keys(config.mcpServers)).toEqual([PLUGIN_NAME])
    expect(config.mcpServers[PLUGIN_NAME]?.args).toContain('--read-only')
  })

  it('is listed by a marketplace with an owner and a relative source, and no version of its own', () => {
    expect(marketplace['name']).toMatch(/^[A-Za-z0-9][A-Za-z0-9._-]*$/)
    expect((marketplace['owner'] as { name: string }).name.length).toBeGreaterThan(0)
    const [entry, ...rest] = marketplace['plugins'] as Record<string, unknown>[]
    expect(rest).toEqual([])
    expect(entry?.['name']).toBe(PLUGIN_NAME)
    expect(entry?.['source']).toBe(`./${PLUGIN_DIR}`)
    // `plugin.json` sets the version, and an entry that sets one too draws a warning.
    expect(entry).not.toHaveProperty('version')
  })

  it('lets the open skills CLI find the skills through the marketplace, with no second copy', () => {
    // The skills CLI searches `<source>/skills` of each local plugin a marketplace lists
    // (`src/plugin-manifest.ts` in vercel-labs/skills).
    const [entry] = marketplace['plugins'] as { source: string }[]
    for (const name of SKILL_NAMES) {
      expect(existsSync(resolve(ROOT, entry?.source ?? '', 'skills', name, 'SKILL.md')), name).toBe(
        true,
      )
    }
  })
})

describe('the portable manifest with OpenAI’s fields, and Codex’s marketplace', () => {
  const manifest = readJson<Record<string, unknown>>(inPlugin('plugin.json'))
  const openai = (manifest['extensions'] as Record<string, Record<string, unknown>>)['com.openai']
  const face = openai?.['interface'] as Record<string, unknown>

  /**
   * The portable manifest names no `skills` and no `mcpServers`, and Codex still finds both:
   *
   * - developers.openai.com/plugins/build/plugins.md: "Portable packages discover skills from the
   *   root `skills/` directory, so the manifest doesn't need a `skills` field", and "Fixed package
   *   paths identify its portable components: `skills/` contains skills, and `mcp.json` configures
   *   MCP servers."
   * - developers.openai.com/plugins/deploy/submission.md, in its field table: `skills` and
   *   `mcpServers` are "Codex only", and "Portable packages always discover skills in `skills/`
   *   and MCP servers in `mcp.json`."
   * - agent-plugins.org/schemas/1.0.0/plugin.schema.json sets `additionalProperties: false` and
   *   lists neither key, so the portable manifest may not carry them.
   */
  it('has only the keys the Agent Plugins schema allows', () => {
    expect(manifest['$schema']).toBe('https://agent-plugins.org/schemas/1.0.0/plugin.schema.json')
    const allowed = [
      '$schema',
      'name',
      'version',
      'description',
      'author',
      'homepage',
      'repository',
      'license',
      'keywords',
      'extensions',
    ]
    expect(Object.keys(manifest).filter((key) => !allowed.includes(key))).toEqual([])
    expect(
      Object.keys(manifest['author'] as object).filter(
        (key) => !['name', 'email', 'url'].includes(key),
      ),
    ).toEqual([])
    expect(manifest['name']).toMatch(/^(?!.*(?:--|\.\.))[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/)
  })

  it('keeps each field within the submission limits', () => {
    expect((manifest['name'] as string).length).toBeLessThanOrEqual(64)
    expect((manifest['description'] as string).length).toBeLessThanOrEqual(4000)
    expect((manifest['author'] as { name: string }).name.length).toBeLessThanOrEqual(120)
    expect((manifest['keywords'] as string[]).length).toBeLessThanOrEqual(25)
    expect((face['displayName'] as string).length).toBeLessThanOrEqual(30)
    expect((face['shortDescription'] as string).length).toBeLessThanOrEqual(30)
    expect((face['longDescription'] as string).length).toBeLessThanOrEqual(4000)
    expect((face['developerName'] as string).length).toBeLessThanOrEqual(80)
    expect(typeof face['category']).toBe('string')
    const capabilities = face['capabilities'] as string[]
    expect(capabilities.length).toBeLessThanOrEqual(20)
    for (const capability of capabilities) expect(capability.length).toBeLessThanOrEqual(120)
    for (const key of ['websiteURL', 'supportURL', 'privacyPolicyURL', 'termsOfServiceURL']) {
      expect(https(face[key]), key).toBe(true)
    }
    const prompts = face['defaultPrompt'] as string[]
    expect(prompts.length).toBeLessThanOrEqual(3)
    expect(new Set(prompts).size).toBe(prompts.length)
    for (const prompt of prompts) expect(prompt.length).toBeLessThanOrEqual(128)
    expect(face['brandColor']).toMatch(/^#[0-9A-Fa-f]{6}$/)
    expect(face['brandColorDark']).toMatch(/^#[0-9A-Fa-f]{6}$/)
  })

  it('names square icons of at least 48 pixels that are in the plugin', () => {
    for (const key of ['composerIcon', 'composerIconDark', 'logo', 'logoDark']) {
      const path = face[key] as string
      expect(path, key).toMatch(/^\.\/assets\//)
      const size = script.pngSize(readFileSync(resolve(ROOT, PLUGIN_DIR, path)))
      expect(size, key).not.toBeNull()
      expect(size?.width, key).toBe(size?.height)
      expect(size?.width ?? 0, key).toBeGreaterThanOrEqual(48)
    }
    const svg = readFileSync(resolve(ROOT, PLUGIN_DIR, PLUGIN_ICONS.svg), 'utf8')
    expect(svg).toMatch(/viewBox="0 0 (\d+) \1"/)
    // Anthropic's directory refuses an icon that holds a style, a script or an animation.
    expect(svg).not.toMatch(/<(style|script|foreignObject|animate)\b|\son\w+=/)
  })

  it('carries no hooks or app mappings, which a public listing cannot have', () => {
    expect(openai).not.toHaveProperty('hooks')
    expect(openai).not.toHaveProperty('apps')
    expect(existsSync(resolve(ROOT, PLUGIN_DIR, '.codex-plugin'))).toBe(false)
  })

  it('has five review cases a reviewer runs and three the plugin declines', () => {
    const cases = (openai?.['review'] as { test_cases: Record<string, Record<string, string>[]> })
      .test_cases
    expect(cases['positive']?.length).toBe(5)
    expect(cases['negative']?.length).toBe(3)
    for (const entry of cases['positive'] ?? []) {
      for (const field of ['description', 'prompt', 'tools_triggered', 'expected_behavior']) {
        expect(entry[field]?.length, field).toBeGreaterThan(0)
      }
    }
    for (const entry of cases['negative'] ?? []) {
      expect(entry['description']?.length).toBeGreaterThan(0)
      expect(entry['prompt']?.length).toBeGreaterThan(0)
    }
  })

  it('declares its one server in the portable MCP config, as the schema shapes a stdio server', () => {
    const config = readJson<{
      $schema: string
      mcpServers: Record<string, Record<string, unknown>>
    }>(inPlugin('mcp.json'))
    expect(config.$schema).toBe('https://agent-plugins.org/schemas/1.0.0/mcp.schema.json')
    expect(Object.keys(config.mcpServers)).toEqual([PLUGIN_NAME])
    const server = config.mcpServers[PLUGIN_NAME] as Record<string, unknown>
    expect(
      Object.keys(server).filter((key) => !['type', 'command', 'args', 'env', 'cwd'].includes(key)),
    ).toEqual([])
    expect(server['type']).toBe('stdio')
    expect(server['args']).toContain('--read-only')
  })

  it('is listed by Codex’s marketplace with a local source, a policy and a category', () => {
    const marketplace = readJson<Record<string, unknown>>('.agents/plugins/marketplace.json')
    expect(typeof marketplace['name']).toBe('string')
    expect(
      (marketplace['interface'] as { displayName: string }).displayName.length,
    ).toBeGreaterThan(0)
    const [entry] = marketplace['plugins'] as Record<string, unknown>[]
    expect(entry?.['name']).toBe(PLUGIN_NAME)
    expect(entry?.['source']).toEqual({ source: 'local', path: `./${PLUGIN_DIR}` })
    const policy = entry?.['policy'] as { installation: string; authentication: string }
    expect(['AVAILABLE', 'INSTALLED_BY_DEFAULT', 'NOT_AVAILABLE']).toContain(policy.installation)
    expect(typeof policy.authentication).toBe('string')
    expect(typeof entry?.['category']).toBe('string')
  })
})

describe('the MCP Registry entry', () => {
  const server = readJson<Record<string, unknown>>('packages/tools/server.json')
  const tools = readJson<{ name: string; version: string; mcpName: string }>(
    'packages/tools/package.json',
  )

  it('is the published package’s, by the name the package declares', () => {
    expect(server['name']).toBe(MCP_NAME)
    expect(tools.mcpName).toBe(MCP_NAME)
    expect(MCP_NAME).toMatch(/^io\.github\.metamorph-labs\/[a-zA-Z0-9._-]+$/)
    expect(server['version']).toBe(tools.version)
    expect(server['version']).toBe(registry.version)
  })

  it('describes the server in at most 100 characters, and runs `polymorph mcp` over stdio', () => {
    expect((server['description'] as string).length).toBeLessThanOrEqual(100)
    const [entry, ...rest] = server['packages'] as Record<string, unknown>[]
    expect(rest).toEqual([])
    expect(entry).toMatchObject({
      registryType: 'npm',
      identifier: '@metamorph-labs/polymorph',
      version: registry.version,
      transport: { type: 'stdio' },
      packageArguments: [{ type: 'positional', value: 'mcp' }],
    })
    expect((server['repository'] as { source: string }).source).toBe('github')
  })
})
