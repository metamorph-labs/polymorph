import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { CLI_BIN, LLMS_PATHS, MCP_BIN, readLlmsFiles } from './llms'
import { MCP_CONFIG, OWN_THE_CODE, QUICK_START, TARGETS, THEME_STEPS } from './reference/install'
import { REGISTRY } from './registry'

/**
 * The files an agent fetches first. They are read from the registry the
 * generator wrote, as `vite.config.ts` reads them, so these assertions hold for
 * what the site serves and writes into `dist/`.
 */

const ROOT = resolve(import.meta.dirname, '../../..')
const files = readLlmsFiles(ROOT)
const text = (path: string) => files[path]?.body ?? ''

describe('/llms.txt points an agent at the contract', () => {
  const index = text(LLMS_PATHS.index)

  it('links the system card and the full text', () => {
    expect(index).toContain(`](${LLMS_PATHS.card})`)
    expect(index).toContain(`](${LLMS_PATHS.full})`)
  })

  it('names the MCP server and `init`, by bins that exist', () => {
    expect(index).toContain(`node <checkout>/${MCP_BIN}`)
    expect(index).toContain(`node <checkout>/${CLI_BIN} init`)
    expect(existsSync(resolve(ROOT, MCP_BIN))).toBe(true)
    expect(existsSync(resolve(ROOT, CLI_BIN))).toBe(true)
  })

  it('states the three facts an agent works by', () => {
    expect(index).toContain('The vocabulary is closed.')
    expect(index).toContain('Screens are specs or TSX under the rules.')
    expect(index).toContain('Every violation names its fix.')
  })

  it('lists every rule on application code, and no rule on the vocabulary alone', () => {
    const named = (applies: string) =>
      new Set(REGISTRY.laws.filter((law) => law.applies === applies).map((law) => law.name))
    const application = named('application')
    expect(application.size).toBeGreaterThan(0)
    for (const name of application) expect(index).toContain(`\`${name}\``)
    for (const name of named('vocabulary')) {
      if (!application.has(name)) expect(index).not.toContain(`\`${name}\``)
    }
  })

  it('stays short enough to read before anything else', () => {
    // It is an index into the contract, not a copy of it. The card is the long read.
    expect(index.length).toBeLessThan(text(LLMS_PATHS.card).length / 4)
  })
})

describe('the install page names the same bins', () => {
  // The page's commands are built in `reference/install.ts`, so these are the strings it shows.
  const commands = [
    QUICK_START,
    MCP_CONFIG,
    OWN_THE_CODE.code,
    ...THEME_STEPS.map((step) => step.code),
    ...TARGETS.flatMap((target) => [
      ...(target.create === undefined ? [] : [target.create.code]),
      ...target.add.map((step) => step.code),
    ]),
  ].join('\n')

  it('runs the CLI and the MCP server from a checkout, never by a bare name', () => {
    // Neither is published, so a bare `polymorph` or `polymorph-mcp` is a
    // command no reader has, and the CLI writes into the directory it runs in.
    expect(MCP_CONFIG).toContain('"command": "node"')
    expect(MCP_CONFIG).toContain(`/polymorph/${MCP_BIN}"`)
    expect(commands).toContain(`node ../polymorph/${CLI_BIN} add`)
    expect(commands).toContain(`node polymorph/${CLI_BIN} init`)
    expect(commands).not.toMatch(/^polymorph(-mcp)?\b/m)
  })
})

describe('/llms-full.txt is the contract in one fetch', () => {
  const card = readFileSync(resolve(ROOT, 'registry/system-card.md'), 'utf8')
  const full = text(LLMS_PATHS.full)

  it('begins with the system card’s first heading', () => {
    const heading = card.split('\n').find((line) => line.startsWith('# '))
    expect(heading).toBeDefined()
    expect(full.startsWith(`${heading}\n`)).toBe(true)
  })

  it('holds the whole card, then the rules page', () => {
    expect(full.startsWith(card.trimEnd())).toBe(true)
    const rules = readFileSync(resolve(ROOT, 'docs/rules.md'), 'utf8')
    expect(full.endsWith(`${rules.trimEnd()}\n`)).toBe(true)
  })

  it('serves the card itself at /system-card.md', () => {
    expect(text(LLMS_PATHS.card)).toBe(card)
  })
})
