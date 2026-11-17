import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { buildRegistry, type Registry } from '@polymorph/registry'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createServer, READ_TOOL_NAMES, TOOL_NAMES } from './server'

/**
 * The protocol wiring, checked in this process.
 *
 * `tools.test.ts` and `write.test.ts` check what each tool answers, as
 * functions. `transcript.test.ts` checks the real server over stdio, as a
 * client uses it. Between them is `server.ts` itself: which name is bound to
 * which function, under which argument schema, and what a refusal looks like
 * once the protocol has wrapped it. This file tests that over an in-memory
 * transport, with the same server object, the SDK's own client, and no
 * subprocess.
 *
 * Every tool is called once. A name bound to the wrong function, or a handler
 * that throws where it should answer, fails here in milliseconds instead of
 * after the transcript's process boot.
 */

const ROOT = resolve(import.meta.dirname, '../../..')
const registry: Registry = buildRegistry(ROOT)

const PROJECT = mkdtempSync(resolve(tmpdir(), 'polymorph-server-'))

interface Answer {
  isError: boolean
  text: string
}

/** The page `render_screen` draws in is built by the workbench, as the entry point says. */
const SCREEN_BUILDER = resolve(ROOT, 'apps/workbench/screen.build.mjs')

async function connect(project?: string, screenBuilder?: string): Promise<Client> {
  const [near, far] = InMemoryTransport.createLinkedPair()
  const server = createServer({
    registry,
    root: ROOT,
    ...(project ? { project } : {}),
    ...(screenBuilder ? { screenBuilder } : {}),
  })
  const client = new Client({ name: 'wiring', version: '0' })
  await Promise.all([server.connect(far), client.connect(near)])
  return client
}

let client: Client

const call = async (name: string, args: Record<string, unknown> = {}): Promise<Answer> => {
  const result = (await client.callTool({ name, arguments: args })) as {
    isError?: boolean
    content: { text: string }[]
  }
  return { isError: result.isError === true, text: result.content[0]?.text ?? '' }
}

const json = async <T>(name: string, args: Record<string, unknown> = {}): Promise<T> => {
  const answer = await call(name, args)
  expect(answer.isError, `${name}: ${answer.text}`).toBe(false)
  return JSON.parse(answer.text) as T
}

beforeAll(async () => {
  writeFileSync(
    resolve(PROJECT, 'package.json'),
    JSON.stringify({ name: 'wired', dependencies: { '@polymorph/react-ui': '^1.0.0' } }),
  )
  client = await connect(PROJECT, SCREEN_BUILDER)
})

afterAll(async () => {
  await client.close()
  rmSync(PROJECT, { recursive: true, force: true })
})

describe('a server with a project', () => {
  it('registers every tool, and no other', async () => {
    const { tools } = await client.listTools()
    expect(tools.map((tool) => tool.name).sort()).toEqual([...TOOL_NAMES].sort())
  })

  it('binds each read tool to the function of its name', async () => {
    expect(
      (await json<{ name: string }[]>('search_components', { query: 'dialog' }))[0]?.name,
    ).toBe('Dialog')
    expect(
      (await json<{ component: { name: string } }>('get_component', { name: 'button' })).component
        .name,
    ).toBe('Button')
    expect(
      (await json<{ requested: string[] }>('get_install_plan', { items: ['button'] })).requested,
    ).toEqual(['Button'])
    expect((await call('get_system_card')).text).toContain('exception ladder')
    expect((await json<{ axes: unknown[] }>('get_theme_axes')).axes).toHaveLength(8)
    expect((await json<{ kind: string }>('validate', { code: 'export const a = 1' })).kind).toBe(
      'code',
    )
    expect((await json<{ changed: boolean }>('fix', { code: 'export const a = 1' })).changed).toBe(
      false,
    )
    expect(
      (await json<{ unmapped: string[] }>('propose_theme', { intent: 'calmer zesty' })).unmapped,
    ).toEqual(['zesty'])
  })

  it('answers `render_screen` with its measurements as text, then one PNG for each view', async () => {
    const spec = JSON.stringify({
      spec: 'polymorph-screen/1',
      name: 'Wired',
      purpose: 'A probe.',
      inputs: [{ name: 'title', type: 'string' }],
      root: { component: 'Text', children: [{ $: 'title' }] },
    })
    const result = (await client.callTool({
      name: 'render_screen',
      arguments: { spec, system: 'plain', data: { title: 'Drawn' } },
    })) as {
      isError?: boolean
      content: { type: string; text?: string; data?: string; mimeType?: string }[]
    }

    expect(result.isError).not.toBe(true)
    // The text is first, so a client that shows only the first part shows the faults.
    expect(result.content.map((part) => part.type)).toEqual(['text', 'image', 'image'])
    const answer = JSON.parse(result.content[0]?.text ?? '{}') as {
      ok: boolean
      states: { views: { viewport: string; image: number }[] }[]
    }
    expect(answer.ok).toBe(true)
    expect(answer.states[0]?.views).toMatchObject([
      { viewport: 'phone', image: 1 },
      { viewport: 'desktop', image: 2 },
    ])
    for (const picture of result.content.slice(1)) {
      expect(picture.mimeType).toBe('image/png')
      expect(
        Buffer.from(picture.data ?? '', 'base64')
          .subarray(1, 4)
          .toString(),
      ).toBe('PNG')
    }

    // An unlawful spec is an answer to read, not a failed tool.
    const unlawful = await json<{ ok: boolean; specFaults: unknown[] }>('render_screen', {
      spec: spec.replace('"Text"', '"Txt"'),
      system: 'plain',
    })
    expect(unlawful.ok).toBe(false)
    expect(unlawful.specFaults.length).toBeGreaterThan(0)
  }, 120_000)

  it('passes a platform to the card and the search, and refuses one it does not map', async () => {
    expect((await call('get_system_card', { platform: 'ios' })).text).toContain(
      'Rendered for **ios**',
    )
    const hits = await json<{ name: string }[]>('search_components', {
      query: 'tooltip',
      platform: 'ios',
    })
    expect(hits.map((hit) => hit.name)).not.toContain('Tooltip')
    expect((await call('get_system_card', { platform: 'watchos' })).isError).toBe(true)
  })

  it('binds each write tool to the function of its name', async () => {
    const spec = JSON.stringify({
      spec: 'polymorph-screen/1',
      name: 'Wired',
      purpose: 'A probe.',
      inputs: [],
      root: { component: 'Stack', props: { gap: 4 }, children: [] },
    })
    expect(
      (await json<{ outcome: string }>('emit_screen', { spec, path: 'src/Wired.tsx' })).outcome,
    ).toBe('written')
    expect(readFileSync(resolve(PROJECT, 'src/Wired.tsx'), 'utf8')).toContain(
      'export function Wired',
    )

    mkdirSync(resolve(PROJECT, 'src'), { recursive: true })
    writeFileSync(
      resolve(PROJECT, 'src/Bar.tsx'),
      'import { Button } from \'@polymorph/react-ui\'\nexport const Bar = () => <Button className="x" label="Go" />\n',
    )
    expect((await json<{ changed: boolean }>('fix_file', { path: 'src/Bar.tsx' })).changed).toBe(
      true,
    )

    const proposal = await json<{ system: { name: string }; palette: unknown }>('propose_theme', {
      intent: 'calmer',
    })
    expect(
      (
        await json<{ saved: boolean }>('save_theme', {
          system: proposal.system,
          palette: proposal.palette,
        })
      ).saved,
    ).toBe(true)

    expect(
      (await json<{ requested: string[] }>('install', { items: ['bespoke'] })).requested,
    ).toEqual(['Bespoke'])
  })

  it('answers an expected failure as a tool error with a message', async () => {
    // Each of these throws inside its function. The client receives a result
    // marked as an error, with the message written for an agent to act on, never
    // a protocol failure.
    for (const [name, args, sentence] of [
      ['get_component', { name: 'Modal' }, 'did you mean'],
      ['get_install_plan', { items: ['pastel'] }, '"theme:pastel"'],
      ['emit_screen', { spec: '{}', path: '../Out.tsx' }, 'must stay inside your repository'],
      ['install', { items: ['nothing-called-this'] }, 'nothing in the registry'],
      ['save_theme', { system: {}, palette: {}, dir: '/elsewhere' }, 'must stay inside'],
      ['fix_file', { path: 'src/Missing.tsx' }, 'does not exist'],
    ] as const) {
      const answer = await call(name, args)
      expect(answer.isError, name).toBe(true)
      expect(answer.text, name).toContain(sentence)
    }
  })

  it('tells an agent about the write tools it has', () => {
    expect(client.getInstructions()).toContain('`fix_file`')
  })
})

describe('a server with no project', () => {
  it('registers only the read tools', async () => {
    const reader = await connect()
    const { tools } = await reader.listTools()

    expect(tools.map((tool) => tool.name).sort()).toEqual([...READ_TOOL_NAMES].sort())
    expect(reader.getInstructions()).not.toContain('write into the project')
    // `fix` is a read: code in, code out. It is there without a project.
    expect(tools.map((tool) => tool.name)).toContain('fix')
    await reader.close()
  })

  it('answers `render_screen` as a tool error when it has no page to draw in', async () => {
    // This server was created with no builder, as a host other than the entry
    // point might create one. The tool is listed, and says what it lacks.
    const reader = await connect()
    const result = (await reader.callTool({
      name: 'render_screen',
      arguments: {
        spec: JSON.stringify({
          spec: 'polymorph-screen/1',
          name: 'Wired',
          purpose: 'A probe.',
          inputs: [],
          root: { component: 'Stack', props: { gap: 4 }, children: [] },
        }),
        system: 'plain',
      },
    })) as { isError?: boolean; content: { text: string }[] }

    expect(result.isError).toBe(true)
    expect(result.content[0]?.text).toContain('was not given a builder')
    await reader.close()
  })
})
