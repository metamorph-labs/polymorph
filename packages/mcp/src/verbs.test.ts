import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { main, VERBS, type Cli, type ToolCaller } from '@polymorph/cli'
import { buildRegistry, type Registry } from '@polymorph/registry'
import { afterAll, beforeAll, describe, expect, expectTypeOf, it } from 'vitest'

import { toolCaller } from './oneshot'
import { createServer, encoded, TOOL_NAMES, TOOLS, WRITE_TOOL_NAMES } from './server'
import type {
  EmitScreenAnswer,
  FixAnswer,
  FixFileAnswer,
  ProposeAnswer,
  RenderScreenAnswer,
  SaveThemeAnswer,
  ValidateAnswer,
} from './tools'

/**
 * The CLI's verbs, run with the real tools.
 *
 * Every verb that asks a tool goes through `main` with the caller an entry
 * point supplies (`toolCaller`), in a scratch project outside the workspace.
 * The checks are the promises the verbs make: `--json` prints exactly the
 * tool's answer; the plain reading of `validate` has one line for each
 * violation; the exit code says whether the answer was clean; `emit` writes
 * the bytes `emit_screen` writes. `polymorph mcp` is spoken to over stdio by a
 * client written by hand, as the bin runs it.
 *
 * The first block is the law between the two lists: every tool the server
 * registers is the job of a verb, and every tool a verb names is registered.
 * It is here because this package depends on the CLI and the CLI may not
 * depend on this one.
 */

const ROOT = resolve(import.meta.dirname, '../../..')
const BIN = resolve(ROOT, 'packages/cli/bin/polymorph.js')
const SCREEN_BUILDER = resolve(ROOT, 'apps/workbench/screen.build.mjs')

let registry: Registry

const temporaries: string[] = []
afterAll(() => {
  for (const path of temporaries) rmSync(path, { recursive: true, force: true })
})

/** A repository for the verbs to work in: a manifest that depends on the React vocabulary, and `files`. */
function project(files: Record<string, string> = {}): string {
  const root = mkdtempSync(resolve(tmpdir(), 'polymorph-verbs-'))
  temporaries.push(root)
  const all = {
    'package.json': JSON.stringify({
      name: 'scratch',
      private: true,
      dependencies: { '@polymorph/react-ui': '^1.0.0' },
    }),
    ...files,
  }
  for (const [path, text] of Object.entries(all)) {
    mkdirSync(dirname(resolve(root, path)), { recursive: true })
    writeFileSync(resolve(root, path), text)
  }
  return root
}

/** The caller an entry point builds for a project. */
const callerFor = (root: string): ToolCaller =>
  toolCaller({ registry, root: ROOT, project: root, screenBuilder: SCREEN_BUILDER })

/** A run of the CLI in `root`, with the real caller, stdout and stderr kept apart. */
async function polymorph(root: string, argv: string[], extra: Partial<Cli> = {}) {
  const out: string[] = []
  const err: string[] = []
  const { code } = await main(
    {
      root,
      source: ROOT,
      registry,
      out: (line) => out.push(line),
      err: (line) => err.push(line),
      tools: callerFor(root),
      ...extra,
    },
    argv,
  )
  return { code, out: out.join('\n'), err: err.join('\n') }
}

/** What the tool answers for the same call, made directly. */
async function asked(root: string, name: string, args: Record<string, unknown>) {
  const answer = await callerFor(root)(name, args)
  expect(answer.isError, `${name}: ${String(answer.value)}`).toBe(false)
  return answer.value
}

const RAW_BUTTON =
  'export function App() {\n  return (\n    <div>\n      <button>Save</button>\n' +
  '      <div style={{ padding: 12 }} />\n    </div>\n  )\n}\n'

const LAWFUL =
  'import { Button } from \'@polymorph/react-ui\'\n\nexport const A = () => <Button label="Go" />\n'

const SPEC = {
  spec: 'polymorph-screen/1',
  name: 'Inbox',
  purpose: 'A title and an action.',
  inputs: [
    { name: 'title', type: 'string' },
    { name: 'onNew', type: '() => void' },
  ],
  root: {
    component: 'Stack',
    props: { gap: 4, p: 4 },
    children: [
      { component: 'Text', children: [{ $: 'title' }] },
      { component: 'Button', props: { label: 'New ticket', onClick: { $: 'onNew' } } },
    ],
  },
}

const UNLAWFUL_SPEC = { ...SPEC, name: 'Broken', root: { component: 'Modal', props: {} } }

beforeAll(() => {
  registry = buildRegistry(ROOT)
}, 120_000)

/* -------------------------------------------------------------------------- */
/* The two lists                                                              */
/* -------------------------------------------------------------------------- */

describe('every tool is a verb, and every verb names a tool that exists', () => {
  it('registers from one table: the names the server lists, and the writes it declares', () => {
    expect(TOOLS.map((entry) => entry.name)).toEqual([...TOOL_NAMES])
    expect(TOOLS.filter((entry) => entry.writes).map((entry) => entry.name)).toEqual([
      ...WRITE_TOOL_NAMES,
    ])
  })

  it('gives each tool a verb that does its job', () => {
    const named = new Set(VERBS.flatMap((verb) => verb.tools))
    const missing = TOOL_NAMES.filter((tool) => !named.has(tool))
    expect(missing, 'a tool with no verb: add one to `VERBS` in packages/cli/src/verbs.ts').toEqual(
      [],
    )
  })

  it('names only tools the server registers', () => {
    const tools: readonly string[] = TOOL_NAMES
    for (const verb of VERBS) {
      for (const tool of verb.tools) expect(tools, `${verb.name} names ${tool}`).toContain(tool)
    }
  })

  it('reads each answer as the tool declares it', () => {
    // The CLI types what its readings read, because it may not import these.
    // Each answer must fit the reading, so a field a reading relies on cannot
    // be renamed in the tool alone.
    expectTypeOf<ValidateAnswer>().toMatchTypeOf<{
      ok: boolean
      fatal: string | null
      violations?: { rule: string; line: number; column: number; message: string }[]
      faults?: { path: string; message: string }[]
    }>()
    expectTypeOf<FixAnswer>().toMatchTypeOf<{ changed: boolean; code: string; fixed: object }>()
    expectTypeOf<FixFileAnswer>().toMatchTypeOf<{ changed: boolean; notes: string[] }>()
    expectTypeOf<EmitScreenAnswer>().toMatchTypeOf<{ ok: boolean; faults: object[] }>()
    expectTypeOf<RenderScreenAnswer>().toMatchTypeOf<{ ok: boolean; fatal: string | null }>()
    expectTypeOf<ProposeAnswer>().toMatchTypeOf<{ lawful: boolean; unmapped: string[] }>()
    expectTypeOf<SaveThemeAnswer>().toMatchTypeOf<{ saved: boolean; written: string[] }>()
  })
})

/* -------------------------------------------------------------------------- */
/* The caller and the server answer alike                                     */
/* -------------------------------------------------------------------------- */

describe('the one-shot caller answers as the server does', () => {
  let client: Client
  let readOnly: Client
  const root = project()

  async function connect(withProject: boolean): Promise<Client> {
    const [near, far] = InMemoryTransport.createLinkedPair()
    const server = createServer({
      registry,
      root: ROOT,
      ...(withProject ? { project: root } : {}),
      screenBuilder: SCREEN_BUILDER,
    })
    const connected = new Client({ name: 'parity', version: '0' })
    await Promise.all([server.connect(far), connected.connect(near)])
    return connected
  }

  beforeAll(async () => {
    client = await connect(true)
    readOnly = await connect(false)
  })
  afterAll(async () => {
    await client.close()
    await readOnly.close()
  })

  const calls: [string, Record<string, unknown>][] = [
    ['get_system_card', { framework: 'vue' }],
    ['search_components', { query: 'dialog', limit: 3 }],
    ['get_component', { name: 'Modal' }],
    ['validate', { code: RAW_BUTTON, filename: 'src/App.tsx' }],
    ['validate', { spec: UNLAWFUL_SPEC }],
    ['search_components', { limit: 'ten' }],
    ['get_install_plan', { items: [] }],
    ['no_such_tool', {}],
  ]

  it('gives the same text, error flag and content for the same call', async () => {
    const call = callerFor(root)
    for (const [name, args] of calls) {
      const overProtocol = await client.callTool({ name, arguments: args })
      expect(encoded(await call(name, args)), name).toEqual({
        ...(overProtocol.isError === true ? { isError: true } : {}),
        content: overProtocol.content,
      })
    }
  })

  it('has no write tool without a project, as a read-only server has none', async () => {
    const call = toolCaller({ registry, root: ROOT })
    for (const name of WRITE_TOOL_NAMES) {
      const overProtocol = await readOnly.callTool({ name, arguments: {} })
      const answer = await call(name, {})
      expect(answer.isError, name).toBe(true)
      expect(encoded(answer), name).toEqual({ isError: true, content: overProtocol.content })
    }
  })
})

/* -------------------------------------------------------------------------- */
/* Each verb, with the real tools                                             */
/* -------------------------------------------------------------------------- */

describe('`--json` prints exactly the tool’s answer', () => {
  const root = project({ 'src/App.tsx': RAW_BUTTON, 'screens/inbox.json': JSON.stringify(SPEC) })

  const cases: [string[], string, Record<string, unknown>][] = [
    [['card', '--framework', 'svelte'], 'get_system_card', { framework: 'svelte' }],
    [
      ['search', 'date', 'picker', '--limit', '2'],
      'search_components',
      { query: 'date picker', limit: 2 },
    ],
    [['component', 'Button', '--source'], 'get_component', { name: 'Button', source: true }],
    [['axes', '--values'], 'get_theme_axes', { tokenValues: true }],
    [['plan', 'button', 'theme:pastel'], 'get_install_plan', { items: ['button', 'theme:pastel'] }],
    [['validate', 'src/App.tsx'], 'validate', { code: RAW_BUTTON, filename: 'src/App.tsx' }],
    [['validate', 'screens/inbox.json'], 'validate', { spec: JSON.stringify(SPEC) }],
    [['fix', 'src/App.tsx', '--dry-run'], 'fix', { code: RAW_BUTTON, filename: 'src/App.tsx' }],
    [['theme', 'propose', 'calm', 'editorial'], 'propose_theme', { intent: 'calm editorial' }],
  ]

  it('for each verb that reads', async () => {
    for (const [argv, tool, args] of cases) {
      const { out } = await polymorph(root, [...argv, '--json'])
      expect(JSON.parse(out), argv.join(' ')).toEqual(await asked(root, tool, args))
    }
  }, 120_000)

  it('for a refusal, as `{ "error" }`, with exit code 1', async () => {
    const { code, out } = await polymorph(root, ['component', 'Modal', '--json'])
    expect(code).toBe(1)
    expect(JSON.parse(out)).toEqual({ error: expect.stringContaining('did you mean') as string })
  })
})

describe('polymorph validate', () => {
  const root = project({
    'src/App.tsx': RAW_BUTTON,
    'src/Lawful.tsx': LAWFUL,
    'screens/inbox.json': JSON.stringify(SPEC, null, 2),
    'screens/broken.json': JSON.stringify(UNLAWFUL_SPEC, null, 2),
    'screens/not-json.json': '{ "spec": ',
  })

  it('prints one line for each violation, with its answer under it, and exits 1', async () => {
    const { code, out } = await polymorph(root, ['validate', 'src/App.tsx'])
    const answer = (await asked(root, 'validate', {
      code: RAW_BUTTON,
      filename: 'src/App.tsx',
    })) as ValidateAnswer
    expect(answer.violations?.length).toBeGreaterThan(1)

    const reported = out.split('\n').filter((line) => /^src\/App\.tsx:\d+:\d+ {2}/.test(line))
    expect(reported).toHaveLength(answer.violations?.length ?? 0)
    for (const violation of answer.violations ?? []) {
      expect(out).toContain(
        `src/App.tsx:${violation.line}:${violation.column}  ${violation.rule}  ${violation.message}`,
      )
    }
    expect(out).toContain('    climb  rung 1')
    expect(out).toContain('    use    <Button label> (rung 1)')
    expect(code).toBe(1)
  })

  it('exits 0 on a clean file, and reads several', async () => {
    expect(await polymorph(root, ['validate', 'src/Lawful.tsx'])).toMatchObject({
      code: 0,
      out: 'No violations.',
    })
    const { code, out } = await polymorph(root, ['validate', 'src/Lawful.tsx', 'src/App.tsx'])
    expect(code).toBe(1)
    expect(out).toContain('src/App.tsx:4:7')

    const { out: json } = await polymorph(root, [
      'validate',
      'src/Lawful.tsx',
      'src/App.tsx',
      '--json',
    ])
    expect((JSON.parse(json) as ValidateAnswer[]).map((answer) => answer.ok)).toEqual([true, false])
  })

  it('checks a `.json` file as a screen spec', async () => {
    expect(await polymorph(root, ['validate', 'screens/inbox.json'])).toMatchObject({
      code: 0,
      out: 'No violations.',
    })
    const broken = await polymorph(root, ['validate', 'screens/broken.json'])
    expect(broken.code).toBe(1)
    expect(broken.out).toContain('screens/broken.json  $.root  no component called `Modal`')

    const unread = await polymorph(root, ['validate', 'screens/not-json.json'])
    expect(unread.code).toBe(1)
    expect(unread.out).toContain('screens/not-json.json  not read: the spec is not JSON')
  })

  it('reads stdin for `-`, under `--filename`', async () => {
    const input = async () => RAW_BUTTON
    const { code, out } = await polymorph(root, ['validate', '-', '--filename', 'src/Typed.tsx'], {
      input,
    })
    expect(code).toBe(1)
    expect(out).toContain('src/Typed.tsx:4:7  polymorph/no-raw-interactive')

    const spec = await polymorph(root, ['validate', '-', '--filename', 'x.json'], {
      input: async () => JSON.stringify(SPEC),
    })
    expect(spec).toMatchObject({ code: 0, out: 'No violations.' })
  })
})

describe('polymorph fix', () => {
  it('prints the fixed code alone on stdout with `--dry-run`, and writes nothing', async () => {
    const root = project({ 'src/App.tsx': RAW_BUTTON })
    const { code, out, err } = await polymorph(root, ['fix', 'src/App.tsx', '--dry-run'])
    const answer = (await asked(root, 'fix', {
      code: RAW_BUTTON,
      filename: 'src/App.tsx',
    })) as FixAnswer
    expect(`${out}\n`).toBe(answer.code)
    expect(err).toContain('src/App.tsx  fixed: polymorph/no-raw-interactive ×1')
    expect(err).toContain('polymorph/no-raw-styles')
    expect(code).toBe(1)
    expect(readFileSync(resolve(root, 'src/App.tsx'), 'utf8')).toBe(RAW_BUTTON)
  })

  it('rewrites the file as `fix_file` does, and reports what is left', async () => {
    const root = project({ 'src/App.tsx': RAW_BUTTON })
    const twin = project({ 'src/App.tsx': RAW_BUTTON })

    const { code, out } = await polymorph(root, ['fix', 'src/App.tsx', '--json'])
    const answer = (await asked(twin, 'fix_file', { path: 'src/App.tsx' })) as FixFileAnswer
    expect(JSON.parse(out)).toEqual(answer)
    expect(code).toBe(1)
    expect(readFileSync(resolve(root, 'src/App.tsx'), 'utf8')).toBe(
      readFileSync(resolve(twin, 'src/App.tsx'), 'utf8'),
    )
    expect(readFileSync(resolve(root, 'src/App.tsx'), 'utf8')).toContain('<Button label="Save"')

    const again = await polymorph(root, ['fix', 'src/App.tsx'])
    expect(again.out).toContain('src/App.tsx  nothing to fix')
  })
})

describe('polymorph emit', () => {
  it('writes the bytes `emit_screen` writes', async () => {
    const root = project({ 'screens/inbox.json': JSON.stringify(SPEC) })
    const twin = project()

    const { code, out } = await polymorph(root, ['emit', 'screens/inbox.json', 'src/Inbox.tsx'])
    expect(code).toBe(0)
    expect(out).toContain('written    src/Inbox.tsx (Inbox, tsx)')
    await asked(twin, 'emit_screen', { spec: SPEC, path: 'src/Inbox.tsx' })
    expect(readFileSync(resolve(root, 'src/Inbox.tsx'))).toEqual(
      readFileSync(resolve(twin, 'src/Inbox.tsx')),
    )
  })

  it('writes nothing for an unlawful spec, and refuses a path outside the project', async () => {
    const root = project({ 'screens/broken.json': JSON.stringify(UNLAWFUL_SPEC) })
    const unlawful = await polymorph(root, ['emit', 'screens/broken.json', 'src/Broken.tsx'])
    expect(unlawful.code).toBe(1)
    expect(unlawful.out).toContain('no component called `Modal`')
    expect(existsSync(resolve(root, 'src/Broken.tsx'))).toBe(false)

    const outside = await polymorph(root, ['emit', 'screens/broken.json', '../Elsewhere.tsx'])
    expect(outside.code).toBe(1)
    expect(outside.out).toContain('must stay inside your repository')
  })
})

describe('polymorph plan', () => {
  it('prints what `add --dry-run` prints for the same items', async () => {
    const root = project()
    const planned = await polymorph(root, ['plan', 'dialog', 'palette:orchid'])
    const dry = await polymorph(root, ['add', 'dialog', 'palette:orchid', '--dry-run'])
    expect(planned.code).toBe(0)
    expect(planned.out).toBe(dry.out)
    expect(planned.out).toContain('came along')
  })
})

describe('polymorph theme propose', () => {
  it('saves the proposal with `--save`, and prints both answers under `--json`', async () => {
    const root = project()
    const { code, out } = await polymorph(root, [
      'theme',
      'propose',
      'calm',
      '--based-on',
      'journal/umber',
      '--save',
      '--json',
    ])
    expect(code).toBe(0)
    const both = JSON.parse(out) as { propose_theme: ProposeAnswer; save_theme: SaveThemeAnswer }
    expect(both.propose_theme).toEqual(
      await asked(root, 'propose_theme', {
        intent: 'calm',
        basedOn: { system: 'journal', palette: 'umber' },
      }),
    )
    expect(both.save_theme.saved).toBe(true)
    for (const path of both.save_theme.written) expect(existsSync(resolve(root, path))).toBe(true)
  })
})

describe('polymorph render', () => {
  it('writes each picture beside the spec and prints its faults and paths', async (context) => {
    const root = project({ 'screens/inbox.json': JSON.stringify(SPEC) })
    const { code, out } = await polymorph(root, [
      'render',
      'screens/inbox.json',
      '--system',
      'plain',
      '--viewports',
      'phone',
    ])
    // The tool says when Playwright's Chromium is missing (`browserAdvice`);
    // the gate's machines have it, and a machine without it cannot draw.
    context.skip(out.includes('playwright install'), `no browser to draw in: ${out}`)

    expect(code).toBe(0)
    expect(out).toContain('plain + neutral, light')
    expect(out).toContain('sampled phone  375×812')
    expect(out).toContain('screens/inbox.render/sampled-phone.png')
    expect(out).toContain('No layout faults.')
    const png = readFileSync(resolve(root, 'screens/inbox.render/sampled-phone.png'))
    expect(png.subarray(1, 4).toString()).toBe('PNG')

    const json = await polymorph(root, [
      'render',
      'screens/inbox.json',
      '--system',
      'plain',
      '--viewports',
      'phone',
      '--out',
      'shots',
      '--json',
    ])
    const answer = JSON.parse(json.out) as RenderScreenAnswer
    expect(answer.states?.[0]?.views[0]?.image).toBe(1)
    expect(existsSync(resolve(root, 'shots/sampled-phone.png'))).toBe(true)
  }, 240_000)

  it('answers an unlawful spec with its faults, drawing nothing', async () => {
    const root = project({ 'screens/broken.json': JSON.stringify(UNLAWFUL_SPEC) })
    const { code, out } = await polymorph(root, [
      'render',
      'screens/broken.json',
      '--system',
      'plain',
    ])
    expect(code).toBe(1)
    expect(out).toContain('screens/broken.json  not drawn: the spec is not lawful')
    expect(out).toContain('screens/broken.json  $.root  no component called `Modal`')
    expect(existsSync(resolve(root, 'screens/broken.render'))).toBe(false)
  })
})

/* -------------------------------------------------------------------------- */
/* polymorph mcp, as a client starts it                                       */
/* -------------------------------------------------------------------------- */

/**
 * Starts `polymorph mcp` the way a client does, writes `messages` to its stdin
 * one line each, closes stdin, and collects every line of stdout until the
 * process exits.
 */
function session(argv: string[], messages: object[], cwd: string) {
  return new Promise<{ code: number | null; replies: Record<string, unknown>[]; err: string }>(
    (resolveSession, reject) => {
      const child = spawn(process.execPath, [BIN, 'mcp', ...argv], { cwd })
      let out = ''
      let err = ''
      child.stdout.on('data', (chunk: Buffer) => (out += chunk.toString()))
      child.stderr.on('data', (chunk: Buffer) => (err += chunk.toString()))
      child.on('error', reject)
      child.on('exit', (code) =>
        resolveSession({
          code,
          err,
          replies: out
            .split('\n')
            .filter(Boolean)
            .map((line) => JSON.parse(line) as Record<string, unknown>),
        }),
      )
      child.stdin.end(messages.map((message) => `${JSON.stringify(message)}\n`).join(''))
    },
  )
}

const HANDSHAKE = [
  {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'by-hand', version: '0' },
    },
  },
  { jsonrpc: '2.0', method: 'notifications/initialized' },
  { jsonrpc: '2.0', id: 2, method: 'tools/list' },
]

describe('polymorph mcp', () => {
  it('answers every request a client sent before it closed stdin, then exits 0', async () => {
    const root = project()
    const { code, replies, err } = await session(
      [],
      [
        ...HANDSHAKE,
        {
          jsonrpc: '2.0',
          id: 3,
          method: 'tools/call',
          params: { name: 'validate', arguments: { code: RAW_BUTTON } },
        },
      ],
      root,
    )

    expect(err).toBe('')
    expect(code).toBe(0)
    expect(replies.map((reply) => reply['id'])).toEqual([1, 2, 3])
    const [hello, listed, validated] = replies as {
      result: {
        serverInfo?: { name: string }
        tools?: { name: string }[]
        content?: { text: string }[]
      }
    }[]
    expect(hello?.result.serverInfo?.name).toBe('polymorph')
    expect(listed?.result.tools?.map((tool) => tool.name).sort()).toEqual([...TOOL_NAMES].sort())
    expect(JSON.parse(validated?.result.content?.[0]?.text ?? '{}')).toMatchObject({ ok: false })
  }, 120_000)

  it('offers no write tool with `--read-only`', async () => {
    const { code, replies } = await session(['--read-only'], HANDSHAKE, project())
    expect(code).toBe(0)
    const listed = replies[1] as { result: { tools: { name: string }[] } }
    const writes: readonly string[] = WRITE_TOOL_NAMES
    expect(
      listed.result.tools.map((tool) => tool.name).filter((name) => writes.includes(name)),
    ).toEqual([])
  }, 120_000)
})
