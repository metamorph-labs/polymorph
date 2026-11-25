import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

import { buildRegistry, type Registry } from '@polymorph/registry'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { main, run, type Cli } from './cli'
import { synopsis, VERB_GROUPS, verbNamed, VERBS, type ToolAnswer } from './verbs'

/**
 * The verbs as data, and the command line around the verbs that ask the MCP
 * tools.
 *
 * This file holds what needs no tool: the list's own shape, the help, the
 * grammar each verb reads, the exit code of a command line that cannot be
 * read, and the refusal when the entry point supplied no tools or no server.
 * `packages/mcp/src/verbs.test.ts` runs every verb with the real tools, and
 * holds the list to the server's table of tools.
 */

const ROOT = resolve(import.meta.dirname, '../../..')
let registry: Registry

const PROJECT = mkdtempSync(resolve(tmpdir(), 'polymorph-verbs-'))

beforeAll(() => {
  registry = buildRegistry(ROOT)
}, 120_000)

afterAll(() => rmSync(PROJECT, { recursive: true, force: true }))

/** A run of the CLI, with stdout and stderr kept apart. */
async function polymorph(argv: string[], extra: Partial<Cli> = {}) {
  const out: string[] = []
  const err: string[] = []
  const { code } = await main(
    {
      root: PROJECT,
      source: ROOT,
      registry,
      out: (line) => out.push(line),
      err: (line) => err.push(line),
      ...extra,
    },
    argv,
  )
  return { code, out: out.join('\n'), err: err.join('\n') }
}

/** A caller that records what it was asked and answers with nothing. */
function recording(): { calls: { name: string; args: unknown }[]; tools: Cli['tools'] } {
  const calls: { name: string; args: unknown }[] = []
  return {
    calls,
    tools: async (name, args): Promise<ToolAnswer> => {
      calls.push({ name, args })
      return { value: name === 'get_system_card' ? '# card' : [], images: [], isError: false }
    },
  }
}

describe('the verbs, as data', () => {
  it('names each verb once, in a group the help lists', () => {
    const names = VERBS.map((verb) => verb.name)
    expect(new Set(names).size).toBe(names.length)
    for (const verb of VERBS) expect(VERB_GROUPS, verb.name).toContain(verb.group)
    for (const group of VERB_GROUPS) {
      expect(
        VERBS.some((verb) => verb.group === group),
        group,
      ).toBe(true)
    }
  })

  it('declares exactly the flags its usage names', () => {
    for (const verb of VERBS) {
      expect(verb.usage.startsWith(`polymorph ${verb.name}`), verb.name).toBe(true)
      const named = [...verb.usage.matchAll(/--([a-z-]+)/g)].map((match) => match[1])
      expect(named, verb.name).toEqual(verb.flags.map((flag) => flag.name))
    }
  })

  it('gives every verb that asks the tools a `--json`, and only those', () => {
    for (const verb of VERBS.filter((entry) => entry.needs === 'tools')) {
      expect(verb.tools.length, verb.name).toBeGreaterThan(0)
      expect(
        verb.flags.map((flag) => flag.name),
        verb.name,
      ).toContain('json')
    }
    expect(VERBS.filter((verb) => verb.needs === 'server').map((verb) => verb.name)).toEqual([
      'mcp',
    ])
  })

  it('finds a verb of two words by its first two words', () => {
    expect(verbNamed('theme', 'propose')?.name).toBe('theme propose')
    expect(verbNamed('theme', 'validate')?.needs).toBeNull()
    expect(verbNamed('theme', undefined)).toBeUndefined()
    expect(verbNamed('card', '--json')?.name).toBe('card')
  })
})

describe('the help', () => {
  it('lists every verb, in its group', async () => {
    const { code, out } = await polymorph(['help'])
    expect(code).toBe(0)
    for (const verb of VERBS) expect(out, verb.name).toContain(synopsis(verb))
    const headings = VERB_GROUPS.map((group) => out.indexOf(`\n${group.charAt(0).toUpperCase()}`))
    expect(headings.every((index) => index > 0)).toBe(true)
    expect([...headings].sort((a, b) => a - b)).toEqual(headings)
  })

  it('prints a verb’s usage, flags and tools for `--help`, and asks no tool', async () => {
    for (const verb of VERBS) {
      const { calls, tools } = recording()
      const argv = [...verb.name.split(' '), '--help']
      const { code, out } = await polymorph(argv, { tools, serve: async () => {} })
      expect(code, verb.name).toBe(0)
      expect(out, verb.name).toContain(`usage: ${verb.usage}`)
      for (const flag of verb.flags) expect(out, verb.name).toContain(`--${flag.name}`)
      for (const tool of verb.tools) expect(out, verb.name).toContain(`\`${tool}\``)
      expect(calls).toEqual([])
    }
  })

  it('says a verb that asks the tools runs through `main`', () => {
    const lines: string[] = []
    const cli = { root: PROJECT, source: ROOT, registry, out: (line: string) => lines.push(line) }
    expect(run(cli, ['card']).code).toBe(1)
    expect(lines.join('\n')).toContain('runs through `main`')
    expect(run(cli, ['theme', 'propose', 'calm']).code).toBe(1)
  })

  it('answers a command it does not have as a usage error', async () => {
    const { code, out } = await polymorph(['cards'])
    expect(code).toBe(2)
    expect(out).toContain('no such command "cards"')
  })
})

describe('a command line a verb cannot read', () => {
  it('exits 2 and names the problem and the usage, asking no tool', async () => {
    const cases: [string[], string][] = [
      [['card', '--frameworks', 'vue'], 'it takes no flag "--frameworks"'],
      [['card', '--framework'], '`--framework` needs a value'],
      [['card', '--json=yes'], '`--json` takes no value'],
      [['component'], 'name one member'],
      [['search', '--limit', 'ten'], '`--limit` is a count'],
      [['plan'], 'name at least one'],
      [['validate'], 'name a file'],
      [['validate', 'missing.tsx'], 'there is no file missing.tsx'],
      [['validate', '.'], '`polymorph check .` runs the red rules over a directory'],
      [['validate', 'a.tsx', '--filename', 'b.tsx'], '`--filename` names the text read from stdin'],
      [['fix', 'a.tsx', 'b.tsx'], 'name one file'],
      [['emit', 'spec.json'], 'name the spec and the file to write'],
      [['render', 'spec.json'], '`--system <name>`'],
      [['theme', 'propose'], 'say what the theme should be'],
      [['theme', 'propose', 'calm', '--overwrite'], 'say where `--save` writes'],
    ]
    for (const [argv, said] of cases) {
      const { calls, tools } = recording()
      const { code, out } = await polymorph(argv, { tools })
      expect(code, argv.join(' ')).toBe(2)
      expect(out, argv.join(' ')).toContain(said)
      expect(out, argv.join(' ')).toContain('usage: polymorph ')
      expect(calls, argv.join(' ')).toEqual([])
    }
  })

  it('answers an unknown framework on `component` as a refusal, as `card` answers one', async () => {
    const { calls, tools } = recording()
    const { code, out } = await polymorph(['component', 'Button', '--framework', 'ember'], {
      tools,
    })
    expect(code).toBe(1)
    expect(out).toContain('no framework called "ember"')
    expect(calls).toEqual([])
  })

  it('refuses a `.json` file that is not a screen spec, and asks no tool', async () => {
    writeFileSync(resolve(PROJECT, 'data.json'), JSON.stringify({ name: 'not-a-spec' }))
    const { calls, tools } = recording()
    const { code, out } = await polymorph(['validate', 'data.json'], { tools })
    expect(code).toBe(2)
    expect(out).toContain('data.json is not a screen spec')
    expect(calls).toEqual([])
  })

  it('keeps stdout JSON under `--json`', async () => {
    const { code, out } = await polymorph(['card', '--json', '--platforms', 'ios'], recording())
    expect(code).toBe(2)
    expect((JSON.parse(out) as { error: string }).error).toContain('--platforms')
  })

  it('reads `--name=value`, and a flag before the verb', async () => {
    const { calls, tools } = recording()
    await polymorph(['--json', 'card', '--platform=ios', '--framework', 'vue'], { tools })
    expect(calls).toEqual([
      { name: 'get_system_card', args: { framework: 'vue', platform: 'ios' } },
    ])
  })
})

describe('an entry point that supplies no tools or no server', () => {
  it('refuses a verb that asks the tools with one line', async () => {
    const { code, out } = await polymorph(['card'])
    expect(code).toBe(1)
    expect(out.split('\n')).toHaveLength(1)
    expect(out).toContain('asks the MCP tools')
  })

  it('refuses `mcp` on stderr, because stdout would be the protocol', async () => {
    const { code, out, err } = await polymorph(['mcp'])
    expect(code).toBe(1)
    expect(out).toBe('')
    expect(err).toContain('starts the MCP server')
  })
})

describe('polymorph mcp', () => {
  /** Runs `mcp` with a starter that records the project it was given. */
  async function started(argv: string[]) {
    const projects: { project?: string }[] = []
    const result = await polymorph(['mcp', ...argv], {
      serve: async (options) => {
        projects.push(options)
      },
    })
    return { ...result, projects }
  }

  it('starts the server for the root, or for `--project` resolved against it', async () => {
    expect((await started([])).projects).toEqual([{ project: PROJECT }])
    expect((await started(['--project', 'app'])).projects).toEqual([
      { project: resolve(PROJECT, 'app') },
    ])
    expect((await started(['--project=/elsewhere'])).projects).toEqual([{ project: '/elsewhere' }])
  })

  it('starts a server with no project for `--read-only`', async () => {
    const { code, projects, out } = await started(['--read-only', '--project', 'app'])
    expect(code).toBe(0)
    expect(projects).toEqual([{}])
    expect(out).toBe('')
  })

  it('refuses a flag it does not take on stderr, and starts nothing', async () => {
    const { code, projects, out, err } = await started(['--readonly'])
    expect(code).toBe(2)
    expect(projects).toEqual([])
    expect(out).toBe('')
    expect(err).toContain('unknown argument "--readonly"')
    expect(err).toContain('usage: polymorph mcp [--project <path>] [--read-only]')
  })
})
