import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import {
  getDefaultEnvironment,
  StdioClientTransport,
} from '@modelcontextprotocol/sdk/client/stdio.js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { READ_TOOL_NAMES, TOOL_NAMES, WRITE_TOOL_NAMES } from './src/server'

/**
 * The MCP server's acceptance test: a scripted agent transcript against the
 * real server.
 *
 * The server makes two promises, and this file tests both.
 *
 * **"A scripted agent transcript exercises every tool."** This tests the
 * *server*, not the functions, which have their own file. A real
 * `polymorph-mcp` process is spawned the way an MCP client spawns one, and the
 * SDK's own client talks to it over stdio. Everything between an agent and an
 * answer is covered: the process boot, the handshake, the JSON-RPC framing,
 * the Zod argument schemas, and the serialisation. The transcript below is one
 * session in order, because that is how an agent uses the tools: discover,
 * read, plan, check, *propose*, and then *write*. The agent asks for a theme
 * in words and gets two files and a verdict, and the last calls put a screen,
 * a component and that theme into a repository.
 *
 * The repository is a scratch directory outside the workspace, passed to the
 * server with `--project`. The process itself runs here, in the checkout the
 * vocabulary lives in, where an install must never be written. A second
 * server, started `--read-only`, tests the other case: with no project it
 * offers no write tool.
 *
 * **"`validate` returns the same diagnostics as the local toolchain on
 * identical input."** Checked at the end against ESLint, run over the same
 * fixture the way this repository runs it. Not similar diagnostics, and not
 * only the same rule ids: the same rules at the same lines and columns,
 * compared as data.
 *
 * One more note on stdio. stdout *is* the protocol here, so a single stray
 * `console.log` in the server or anything it imports corrupts a frame and the
 * client disconnects. Every other test in the repository would miss that
 * failure, and this one catches it. That is reason enough to spawn a process
 * instead of using an in-memory transport.
 */

const ROOT = resolve(import.meta.dirname, '../..')

/** The catalogue's size as `design/` states it, derived and never hard-coded. */
function catalogueWidth(half: 'systems' | 'palettes'): number {
  return readdirSync(resolve(ROOT, 'design', half)).filter((file) => file.endsWith('.json')).length
}
const BIN = resolve(ROOT, 'packages/mcp/bin/polymorph-mcp.js')

/** A repository for the write tools: a directory with a manifest, outside the workspace. */
function scratchProject(): string {
  const path = mkdtempSync(resolve(tmpdir(), 'polymorph-transcript-'))
  writeFileSync(
    resolve(path, 'package.json'),
    `${JSON.stringify({ name: 'scratch', private: true, dependencies: {} }, null, 2)}\n`,
  )
  return path
}

const PROJECT = scratchProject()

let client: Client

/** One tool call, unwrapped to the text the agent would read. */
async function call(name: string, args: Record<string, unknown> = {}): Promise<string> {
  const result = (await client.callTool({ name, arguments: args })) as {
    isError?: boolean
    content: { type: string; text: string }[]
  }
  const [first] = result.content
  expect(first?.type, `${name} answered with something that is not text`).toBe('text')
  return first?.text ?? ''
}

async function callJson<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  return JSON.parse(await call(name, args)) as T
}

beforeAll(async () => {
  client = new Client({ name: 'transcript', version: '0' })
  await client.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: [BIN, '--project', PROJECT],
      cwd: ROOT,
    }),
  )
}, 120_000)

afterAll(async () => {
  await client?.close()
  rmSync(PROJECT, { recursive: true, force: true })
})

describe('an agent uses the system', () => {
  it('lists every tool, each declaring its effect on a repository', async () => {
    const { tools } = await client.listTools()

    expect(tools.map((tool) => tool.name).sort()).toEqual([...TOOL_NAMES].sort())
    const writes: readonly string[] = WRITE_TOOL_NAMES
    for (const tool of tools) {
      // A client asks a person about every call to a tool not marked safe, and a
      // tool that writes while marked safe is worse. Nine read, four write, and
      // each one says which.
      expect(tool.annotations?.readOnlyHint, tool.name).toBe(!writes.includes(tool.name))
      expect((tool.description ?? '').length, tool.name).toBeGreaterThan(60)
    }

    // Of the four that write, only the install is additive: it adds files and
    // config lines, and keeps any file somebody has edited. The others can
    // replace one (their own earlier output, one the caller said to overwrite,
    // a source file a fix rewrote), and their annotations say so.
    const destructive = tools.filter((tool) => tool.annotations?.destructiveHint === true)
    expect(destructive.map((tool) => tool.name).sort()).toEqual([
      'emit_screen',
      'fix_file',
      'save_theme',
    ])
  })

  it('is told what the system is before it is told what is in it', () => {
    // Server instructions reach the model as context, before any tool call.
    // Stating "style is not a call-site decision" up front prevents the
    // violation, which is better than any rule firing later.
    expect(client.getInstructions()).toContain('may not express a colour')
    expect(client.getServerVersion()?.name).toBe('polymorph')
  })

  /* ---- the session, in the order an agent has it ------------------------- */

  it('1. reads the card, and gets the whole vocabulary in one call', async () => {
    const card = await call('get_system_card')
    expect(card).toContain('Button')
    expect(card).toContain('exception ladder')
    // The card is meant to be the *first* call, so it must be cheap. The budget
    // is set and justified in `packages/registry/src/card.test.ts`.
    expect(card.length).toBeLessThan(40_871)
  })

  it('2. searches for the thing it needs, by the word it would use', async () => {
    const hits = await callJson<{ name: string; matched: string; purpose: string }[]>(
      'search_components',
      { query: 'modal' },
    )
    expect(hits[0]?.name).toBe('Dialog')
    expect(hits[0]?.purpose).toContain('interruption')

    // Every tier the catalogue has must be one the argument schema accepts. The
    // server's enum is a hand-written copy, and this check keeps it in line with
    // the data.
    const tiers = new Set(
      (await callJson<{ tier: string }[]>('search_components', { limit: 200 })).map(
        (hit) => hit.tier,
      ),
    )
    expect(tiers.has('charts')).toBe(true)
    for (const tier of tiers) {
      const narrowed = await callJson<{ tier: string }[]>('search_components', { tier, limit: 200 })
      expect(narrowed.length, tier).toBeGreaterThan(0)
      expect(narrowed.every((hit) => hit.tier === tier)).toBe(true)
    }
  })

  it('3. reads the component, and gets its lawful cells rather than prose', async () => {
    const { component } = await callJson<{
      component: { props: { name: string }[]; grid: Record<string, string[]>; states: string[] }
    }>('get_component', { name: 'Button' })

    expect(component.props.map((prop) => prop.name)).toContain('label')
    // An agent cannot guess the grid. There is no neutral filled button, and a
    // call site that tried would be a type error, not a badly styled button.
    expect(component.grid['solid']).toEqual(['accent', 'danger'])
    expect(component.grid['outline']).toContain('neutral')
    expect(component.states.length).toBeGreaterThan(5)
  })

  it('4. is corrected when it invents a name', async () => {
    const answer = await call('get_component', { name: 'Modal' })
    expect(answer).toContain('did you mean')
    expect(answer).toContain('Dialog')
  })

  it('5. asks what installing it would take', async () => {
    const plan = await callJson<{
      requested: string[]
      files: { to: string }[]
      packages: Record<string, string>
      systems: { name: string; defaultPalette: string; fonts: { package: string }[] }[]
      palettes: { name: string; file: { to: string } }[]
    }>('get_install_plan', { items: ['button', 'dialog', 'theme:pastel', 'palette:orchid'] })

    expect(plan.requested).toEqual(['Button', 'Dialog'])
    expect(plan.packages['@radix-ui/react-dialog']).toMatch(/^\^\d/)
    // A theme is a pairing bundle (the system, the palette it declares and the
    // fonts). A palette asked for on its own is installed beside it and works
    // with any installed system.
    expect(plan.systems[0]?.name).toBe('pastel')
    expect(plan.systems[0]?.defaultPalette).toBe('amethyst')
    expect(plan.systems[0]?.fonts.length).toBeGreaterThan(0)
    expect(plan.palettes.map((palette) => palette.name)).toEqual(['amethyst', 'orchid'])
    // The closure, not only the three files: the convention stylesheets that
    // belong to no component are included too.
    expect(plan.files.map((file) => file.to)).toContain(
      'src/polymorph/conventions/focus.module.css',
    )
  })

  it('6. asks which settings a theme has, and is told there are two sets', async () => {
    const theme = await callJson<{
      axes: { name: string; exposed: boolean }[]
      systems: { name: string; defaultPalette: string; axes: Record<string, string> }[]
      palettes: { name: string; accentHue: number; chromaBudget: string }[]
      customProperties?: string[]
    }>('get_theme_axes')

    expect(theme.axes).toHaveLength(8)
    expect(theme.axes.filter((axis) => axis.exposed).map((axis) => axis.name)).toEqual([
      'geometry',
      'depth',
      'ornament',
    ])

    // Both halves, at the catalogue's current size. The counts are read from
    // `design/`, never hard-coded, so this check grows with the catalogue. What
    // stays fixed is the split: the lists combine (any palette on any system).
    // An agent that read one combined list would think there are as many looks
    // as systems, instead of systems times palettes.
    expect(theme.systems.length).toBe(catalogueWidth('systems'))
    expect(theme.palettes.length).toBe(catalogueWidth('palettes'))
    expect(theme.systems.length).not.toBe(theme.palettes.length)
    const pastel = theme.systems.find((system) => system.name === 'pastel')
    expect(pastel?.defaultPalette).toBe('amethyst')
    expect(pastel?.axes['geometry']).toBe('soft')
    expect(theme.palettes.every((palette) => palette.chromaBudget !== undefined)).toBe(true)
    expect(theme.customProperties).toBeUndefined()
  })

  it('7. writes a screen, checks it, and is told it is lawful', async () => {
    const answer = await callJson<{ ok: boolean; violations: unknown[] }>('validate', {
      code:
        "import { Button, Stack } from '@polymorph/react-ui'\n\n" +
        'export function Screen() {\n' +
        '  return (\n' +
        '    <Stack gap={4}>\n' +
        '      <Button variant="solid" tone="accent" label="Save" />\n' +
        '    </Stack>\n' +
        '  )\n' +
        '}\n',
    })

    expect(answer.violations).toEqual([])
    expect(answer.ok).toBe(true)
  })

  it('7a. asks to see a screen it specified, and gets it drawn at two widths', async () => {
    const result = (await client.callTool({
      name: 'render_screen',
      arguments: {
        spec: JSON.stringify({
          spec: 'polymorph-screen/1',
          name: 'SaveBar',
          purpose: 'A title over one action.',
          inputs: [
            { name: 'title', type: 'string' },
            { name: 'onSave', type: '() => void' },
          ],
          root: {
            component: 'Stack',
            props: { gap: 4, p: 4 },
            children: [
              { component: 'Text', children: [{ $: 'title' }] },
              {
                component: 'Button',
                props: {
                  variant: 'solid',
                  tone: 'accent',
                  label: 'Save',
                  onClick: { $: 'onSave' },
                },
              },
            ],
          },
        }),
        system: 'plain',
        data: { title: 'Unsaved changes' },
      },
    })) as {
      isError?: boolean
      content: { type: string; text?: string; data?: string; mimeType?: string }[]
    }

    // The pictures cross the real transport as image content: base64 in a
    // JSON-RPC frame, after the text an agent reads first.
    expect(result.isError).not.toBe(true)
    expect(result.content.map((part) => part.type)).toEqual(['text', 'image', 'image'])
    expect(result.content.slice(1).every((part) => part.mimeType === 'image/png')).toBe(true)

    const answer = JSON.parse(result.content[0]?.text ?? '{}') as {
      ok: boolean
      pairing: { system: string; palette: string; mode: string }
      states: {
        state: string
        inputs: { name: string; from: string }[]
        views: { viewport: string; faults: unknown[]; failed: unknown[] }[]
      }[]
      blocked?: string[]
    }
    expect(answer.ok).toBe(true)
    expect(answer.pairing.system).toBe('plain')
    expect(answer.states).toHaveLength(1)
    expect(answer.states[0]?.state).toBe('populated')
    expect(answer.states[0]?.inputs).toMatchObject([
      { name: 'title', from: 'data' },
      { name: 'onSave', from: 'stub' },
    ])
    expect(answer.states[0]?.views.map((view) => view.viewport)).toEqual(['phone', 'desktop'])
    // The page asked for nothing but itself: no request left it.
    expect(answer.blocked).toBeUndefined()
  }, 120_000)

  it('8. writes one as it would without the system, and is shown the ladder rungs', async () => {
    const answer = await callJson<{
      ok: boolean
      violations: {
        rule: string
        line: number
        law: string
        climb: { rung: number; name: string; declaredAs: string | null }[]
      }[]
    }>('validate', {
      code:
        'export function Screen() {\n' +
        '  return (\n' +
        '    <div style={{ padding: 12, background: "#7c3aed" }}>\n' +
        '      <button onClick={() => {}}>Save</button>\n' +
        '    </div>\n' +
        '  )\n' +
        '}\n',
    })

    expect(answer.ok).toBe(false)
    const rules = answer.violations.map((violation) => violation.rule)
    expect(rules).toContain('polymorph/no-raw-styles')
    expect(rules).toContain('polymorph/no-raw-interactive')

    // Every violation carries the ladder, so the answer is "here is the
    // shortest lawful way to do this" instead of "no".
    for (const violation of answer.violations) {
      expect(violation.law, violation.rule).not.toBe('')
      expect(violation.climb.length, violation.rule).toBeGreaterThan(0)
      expect(violation.climb[0]?.rung, violation.rule).toBe(1)
    }
    const bespoke = answer.violations[0]?.climb.find((rung) => rung.rung === 4)
    expect(bespoke?.declaredAs).toBe('Bespoke | ThirdParty')
  })

  it('9. checks a stylesheet, and gets the CSS half of the laws', async () => {
    const answer = await callJson<{ filename: string; violations: { rule: string }[] }>(
      'validate',
      {
        code: '.hero {\n  transition: transform 200ms ease;\n}\n',
      },
    )
    expect(answer.filename.endsWith('.css')).toBe(true)
    expect(answer.violations.map((violation) => violation.rule)).toEqual([
      'polymorph/no-motion-outside-vocabulary',
    ])
  })

  it('9a. passes a screen to `fix`, and gets it back with every mechanical fix applied', async () => {
    const answer = await callJson<{
      ok: boolean
      changed: boolean
      code: string
      fixed: Record<string, number>
      violations: { rule: string; climb: { rung: number }[] }[]
    }>('fix', {
      code:
        "import { Search } from 'lucide-react'\n\n" +
        'export function Screen() {\n' +
        '  return (\n' +
        '    <div style={{ padding: 12 }}>\n' +
        '      <Search />\n' +
        '      <button onClick={() => {}}>Save</button>\n' +
        '    </div>\n' +
        '  )\n' +
        '}\n',
    })

    // The glyph and the button each had exactly one lawful rewrite, and both
    // are applied by the rules' own fixes, the ones `eslint --fix` applies.
    expect(answer.changed).toBe(true)
    expect(answer.code).toContain('<Icon name="search" />')
    // A `<button>` that never said its `type` is a submit button, so the
    // member that replaces it says so.
    expect(answer.code).toContain('<Button label="Save" onClick={() => {}} type="submit" />')
    expect(Object.keys(answer.fixed).sort()).toEqual([
      'polymorph/no-external-icons',
      'polymorph/no-raw-interactive',
    ])

    // The style on the `<div>` is a decision, so it is still there, reported
    // with the ladder exactly as step 8 reported it.
    expect(answer.ok).toBe(false)
    expect(answer.violations.map((violation) => violation.rule)).toEqual([
      'polymorph/no-raw-styles',
    ])
    expect(answer.violations[0]?.climb[0]?.rung).toBe(1)
  })

  /* ---- the agent asks for a theme rather than for a component ------------ */

  interface Proposal {
    system: { name: string; axes: Record<string, string>; fonts: Record<string, unknown> }
    palette: { name: string; accentHue: number; neutralTint: number; chromaBudget: string }
    basedOn: { system: string; palette: string }
    rationale: { word: string; why: string; moves: { field: string; from: string; to: string }[] }[]
    unmapped: string[]
    lawful: boolean
    faults: string[]
  }

  /** The pair returned in step 10, kept for the step that saves it. */
  let proposed: Proposal

  it('10. describes a theme in words, and gets two files back with a verdict', async () => {
    const answer = await callJson<Proposal>('propose_theme', {
      intent: 'calmer, more editorial, warmer paper',
      basedOn: { system: 'pop', palette: 'orchid' },
    })
    proposed = answer

    // Two complete documents, not advice about how to write them.
    expect(answer.basedOn).toEqual({ system: 'pop', palette: 'orchid' })
    expect(Object.keys(answer.system.axes)).toHaveLength(8)
    expect(Object.keys(answer.system.fonts)).toEqual(['body', 'display', 'mono'])
    expect(answer.system.name).toBe(answer.palette.name)

    // The rationale is the projection table, applied: each word with what it
    // changed, so an agent can question a proposal instead of only accepting it.
    expect(answer.rationale.map((entry) => entry.word)).toEqual([
      'calmer',
      'editorial',
      'warmer',
      'paper',
    ])
    const fields = answer.rationale.flatMap((entry) => entry.moves.map((move) => move.field))
    expect(fields).toContain('axes.typePersonality')
    expect(fields).toContain('palette.accentHue')
    expect(answer.system.axes['typePersonality']).toBe('editorial')

    // The verdict: the tool resolved the pair through the engine before
    // answering, so `lawful` is a measurement.
    expect(answer.lawful).toBe(true)
    expect(answer.faults).toEqual([])
    expect(answer.unmapped).toEqual([])
  })

  it('11. is told which of its words the system does not have', async () => {
    const answer = await callJson<Proposal>('propose_theme', {
      intent: 'something zesty and brutalist',
    })
    // Not guessed at, and not silently dropped: an agent that reads this knows
    // it asked for something the vocabulary cannot express.
    expect(answer.unmapped).toEqual(['zesty', 'brutalist'])
    expect(answer.rationale).toEqual([])
  })

  it('12. asks for a pair that cannot be built, and is told why instead of being handed one', async () => {
    const answer = await callJson<Proposal>('propose_theme', {
      intent: 'calmer',
      basedOn: { palette: 'chartreuse' },
    })

    expect(answer.lawful).toBe(false)
    expect(answer.faults.length).toBeGreaterThan(0)
    expect(answer.faults[0]).toContain('no palette called "chartreuse"')
    // The correction carries the catalogue, so the retry is obvious.
    expect(answer.faults[0]).toContain('orchid')
    // A proposal still comes back. The agent sees what it would have got, and
    // the pair is still complete and checked.
    expect(Object.keys(answer.system.axes)).toHaveLength(8)
  })

  /* ---- and then it lands what it was answered ---------------------------- */

  const inProject = (path: string) => resolve(PROJECT, path)

  it('13. describes a screen, and the system writes the file', async () => {
    const spec = JSON.stringify({
      spec: 'polymorph-screen/1',
      name: 'SaveBar',
      purpose: 'One action, bound to the container.',
      inputs: [{ name: 'onSave', type: '() => void' }],
      root: {
        component: 'Stack',
        props: { gap: 4 },
        children: [
          {
            component: 'Button',
            props: { variant: 'solid', tone: 'accent', label: 'Save', onClick: { $: 'onSave' } },
          },
        ],
      },
    })

    const answer = await callJson<{ ok: boolean; path: string; outcome: string }>('emit_screen', {
      spec,
      path: 'src/screens/SaveBar.tsx',
    })
    expect(answer).toMatchObject({ ok: true, path: 'src/screens/SaveBar.tsx', outcome: 'written' })

    // The file is in the project the server was started for, not in the
    // directory the process runs in, which is this checkout.
    const code = readFileSync(inProject('src/screens/SaveBar.tsx'), 'utf8')
    expect(existsSync(resolve(ROOT, 'src/screens/SaveBar.tsx'))).toBe(false)

    // The written file is what `validate` calls lawful. The agent never typed
    // the screen, so it had no chance to type a violation.
    const checked = await callJson<{ ok: boolean }>('validate', { code })
    expect(checked.ok).toBe(true)

    // The document is an argument of the call as it is, with no second
    // escaping, and the server reads it as it reads the text.
    const document = JSON.parse(spec) as Record<string, unknown>
    const asObject = await callJson<{ ok: boolean; kind: string }>('validate', { spec: document })
    expect(asObject).toMatchObject({ ok: true, kind: 'spec' })
    const again = await callJson<{ ok: boolean; outcome: string }>('emit_screen', {
      spec: document,
      path: 'src/screens/SaveBar.tsx',
    })
    expect(again).toMatchObject({ ok: true, outcome: 'unchanged' })
  })

  it('14. installs a component it planned in step 5', async () => {
    const answer = await callJson<{
      requested: string[]
      written: string[]
      extended: string[]
      next: string
    }>('install', { items: ['button'] })

    expect(answer.requested).toEqual(['Button'])
    expect(answer.written).toContain('src/polymorph/controls/Button.tsx')
    expect(existsSync(inProject('src/polymorph/controls/Button.tsx'))).toBe(true)
    // The rules were installed with the source. That is the half of an install
    // that a copied file lacks.
    expect(answer.extended).toContain('eslint.config.js')
    expect(readFileSync(inProject('package.json'), 'utf8')).toContain('@polymorph/react')
  })

  it('15. saves the theme it was proposed in step 10', async () => {
    const answer = await callJson<{ saved: boolean; written: string[]; fonts: unknown[] }>(
      'save_theme',
      { system: proposed.system, palette: proposed.palette },
    )

    expect(answer.saved).toBe(true)
    expect(answer.written).toEqual([
      `design/systems/${proposed.system.name}.json`,
      `design/palettes/${proposed.palette.name}.json`,
    ])
    expect(answer.fonts.length).toBeGreaterThan(0)
    const landed = JSON.parse(
      readFileSync(inProject(`design/palettes/${proposed.palette.name}.json`), 'utf8'),
    ) as { accentHue: number }
    expect(landed.accentHue).toBe(proposed.palette.accentHue)
  })

  it('15a. edits a file with its own tools, and has it fixed in place', async () => {
    // What an agent's own edit leaves behind: a member with a `className`.
    const path = 'src/screens/Toolbar.tsx'
    writeFileSync(
      inProject(path),
      "import { Button } from '@polymorph/react-ui'\n\n" +
        'export const Toolbar = () => <Button className="primary" label="Save" />\n',
    )

    const answer = await callJson<{ ok: boolean; changed: boolean; fixed: Record<string, number> }>(
      'fix_file',
      { path },
    )

    // The answer is a count and a verdict. The code went from disk to disk.
    expect(answer).toMatchObject({
      ok: true,
      changed: true,
      fixed: { 'polymorph/no-raw-styles': 1 },
    })
    expect(readFileSync(inProject(path), 'utf8')).toContain('<Button label="Save" />')
  })

  it('16. is refused with a message it can act on, and nothing is written', async () => {
    const before = readdirSync(PROJECT, { recursive: true }).sort()

    // A path out of the project, and a name the registry does not have. Each is
    // marked as an error, and each says what to do instead.
    const refused = async (name: string, args: Record<string, unknown>) => {
      const result = (await client.callTool({ name, arguments: args })) as {
        isError?: boolean
        content: { text: string }[]
      }
      expect(result.isError, name).toBe(true)
      return result.content[0]?.text ?? ''
    }

    expect(await refused('emit_screen', { spec: '{}', path: '../SaveBar.tsx' })).toContain(
      'must stay inside your repository',
    )
    expect(await refused('install', { items: ['pastel'] })).toContain('did you mean "theme:pastel"')

    expect(readdirSync(PROJECT, { recursive: true }).sort()).toEqual(before)
  })
})

/**
 * The flags decide whether a server may write, so they are parsed strictly. An
 * unknown flag stops the bin, with a message on stderr, before any client is
 * answered.
 */
describe('a server started with a flag it does not know', () => {
  const start = (...args: string[]) => {
    try {
      execFileSync(process.execPath, [BIN, ...args], { cwd: PROJECT, stdio: 'pipe' })
      return { status: 0, stderr: '' }
    } catch (error) {
      const failure = error as { status: number; stderr: Buffer }
      return { status: failure.status, stderr: failure.stderr.toString() }
    }
  }

  it('stops instead of starting a server that writes', () => {
    // If `--readonly` were ignored, someone who asked for a server without
    // write tools would get one with them.
    for (const args of [
      ['--readonly'],
      ['--project'],
      ['--project', '--read-only'],
      ['--project='],
    ]) {
      const { status, stderr } = start(...args)
      expect(status, args.join(' ')).toBe(1)
      expect(stderr, args.join(' ')).toContain('usage: polymorph-mcp')
    }
  })
})

/**
 * The server as a client starts it: in the repository it was opened on, with
 * no flags. The working directory is the project.
 */
describe('a server started in a repository', () => {
  const HERE = scratchProject()
  let local: Client

  beforeAll(async () => {
    local = new Client({ name: 'transcript-in-place', version: '0' })
    await local.connect(
      new StdioClientTransport({ command: process.execPath, args: [BIN], cwd: HERE }),
    )
  }, 120_000)

  afterAll(async () => {
    await local?.close()
    rmSync(HERE, { recursive: true, force: true })
  })

  it('writes into the directory it was started in', async () => {
    const result = (await local.callTool({
      name: 'install',
      arguments: { items: ['bespoke'] },
    })) as { content: { text: string }[] }
    const answer = JSON.parse(result.content[0]?.text ?? '{}') as { written: string[] }

    expect(answer.written).toContain('src/polymorph/exceptions/Bespoke.tsx')
    expect(existsSync(resolve(HERE, 'src/polymorph/exceptions/Bespoke.tsx'))).toBe(true)
  })
})

/**
 * The same server with nowhere to write. `--read-only` is the only difference,
 * and the result is the read-only server its annotations describe.
 */
describe('a server started read-only', () => {
  let reader: Client

  beforeAll(async () => {
    reader = new Client({ name: 'transcript-read-only', version: '0' })
    await reader.connect(
      new StdioClientTransport({
        command: process.execPath,
        args: [BIN, '--read-only'],
        // Started *in* a repository, as a client would start it. The flag
        // overrides the working directory, which would otherwise be the project.
        cwd: PROJECT,
      }),
    )
  }, 120_000)

  afterAll(async () => {
    await reader?.close()
  })

  it('offers the nine tools that read, and no tool that writes', async () => {
    const { tools } = await reader.listTools()
    expect(tools.map((tool) => tool.name).sort()).toEqual([...READ_TOOL_NAMES].sort())
    expect(tools.every((tool) => tool.annotations?.readOnlyHint === true)).toBe(true)
    // The instructions an agent is given describe the server it is talking to.
    expect(reader.getInstructions()).not.toContain('install')
  })
})

/**
 * The same server on a machine where Playwright has downloaded no browser,
 * which is every machine until someone runs the install. The browsers
 * directory is pointed at an empty one, so the launch fails the way it does
 * there.
 */
describe('a server on a machine with no browser', () => {
  const NO_BROWSERS = mkdtempSync(resolve(tmpdir(), 'polymorph-no-browsers-'))
  let bare: Client

  beforeAll(async () => {
    bare = new Client({ name: 'transcript-no-browser', version: '0' })
    await bare.connect(
      new StdioClientTransport({
        command: process.execPath,
        args: [BIN, '--read-only'],
        cwd: ROOT,
        env: { ...getDefaultEnvironment(), PLAYWRIGHT_BROWSERS_PATH: NO_BROWSERS },
      }),
    )
  }, 120_000)

  afterAll(async () => {
    await bare?.close()
    rmSync(NO_BROWSERS, { recursive: true, force: true })
  })

  it('answers `render_screen` with the command that installs one', async () => {
    const result = (await bare.callTool({
      name: 'render_screen',
      arguments: {
        spec: JSON.stringify({
          spec: 'polymorph-screen/1',
          name: 'Bare',
          purpose: 'A probe.',
          inputs: [],
          root: { component: 'Stack', props: { gap: 4 }, children: [] },
        }),
        system: 'plain',
      },
    })) as { isError?: boolean; content: { type: string; text: string }[] }

    expect(result.isError).toBe(true)
    expect(result.content).toHaveLength(1)
    expect(result.content[0]?.text).toContain('pnpm exec playwright install chromium')
    expect(result.content[0]?.text).toContain(ROOT)
  }, 120_000)

  it('still answers every other tool', async () => {
    const { tools } = await bare.listTools()
    expect(tools.map((tool) => tool.name)).toContain('render_screen')

    const result = (await bare.callTool({
      name: 'search_components',
      arguments: { query: 'dialog' },
    })) as { isError?: boolean; content: { text: string }[] }
    expect(result.isError).not.toBe(true)
    expect((JSON.parse(result.content[0]?.text ?? '[]') as { name: string }[])[0]?.name).toBe(
      'Dialog',
    )
  })
})

/**
 * The second half of the acceptance test. `validate` is not a lint-like
 * service. It is *the* lint run, which is what makes it useful.
 */
describe('validate agrees with the local toolchain, on identical input', () => {
  /*
   * A probe file, written under `apps/` and removed afterwards.
   *
   * The path matters and cannot be faked. This repository's `eslint.config.ts`
   * applies the application rules by glob (`apps/**`), so a fixture linted
   * where it lives is not governed by any red rule. A comparison against it
   * would prove nothing while looking rigorous. Identical input means the same
   * bytes *at the same path*.
   *
   * `packages/rules/src/repo-laws.test.ts` walks `apps/` in a parallel worker
   * and excludes exactly this path from its corpus laws, because the fixture
   * composes both openers on purpose. It pins the literal below, so renaming
   * the probe here without the matching edit there fails a law instead of
   * causing a race.
   */
  const PROBE = 'apps/workbench/src/relay/validate-probe.tsx'
  const code = readFileSync(resolve(ROOT, 'packages/rules/fixtures/app-violations.tsx'), 'utf8')

  interface Reported {
    rule: string
    line: number
    column: number
  }

  const ordered = (found: Reported[]) =>
    [...found].sort(
      (a, b) => a.line - b.line || a.column - b.column || a.rule.localeCompare(b.rule),
    )

  /**
   * Run once, in `beforeAll`, and shared.
   *
   * Booting ESLint with this repository's flat config takes a few seconds on an
   * idle machine, and longer with the browser projects running beside it.
   * Calling it from each test would time out under full-suite load. Running it
   * once is also correct: the two assertions are two questions about one lint
   * run, not two runs.
   */
  let local: Reported[] = []

  beforeAll(() => {
    writeFileSync(resolve(ROOT, PROBE), code)
    local = localToolchain()
  }, 120_000)

  afterAll(() => {
    rmSync(resolve(ROOT, PROBE), { force: true })
  })

  /** ESLint, discovered and run the way a human runs it. */
  function localToolchain(): Reported[] {
    let stdout = ''
    try {
      stdout = execFileSync('npx', ['eslint', '--format', 'json', PROBE], {
        cwd: ROOT,
        stdio: 'pipe',
      }).toString()
    } catch (error) {
      // Exit 1 means "found problems", which is expected here. The report is
      // still on stdout.
      const failure = error as { status?: number; stdout?: Buffer }
      if (failure.status !== 1 || !failure.stdout) throw error
      stdout = failure.stdout.toString()
    }

    const [file] = JSON.parse(stdout) as {
      messages: { ruleId: string | null; line: number; column: number }[]
    }[]

    return ordered(
      (file?.messages ?? [])
        // The repository's config also runs `js.recommended`, `typescript-eslint`
        // and `react-hooks`. `validate` reports only the red rules and says so.
        // Comparing the other rules would compare two different questions.
        .filter((message) => message.ruleId?.startsWith('polymorph/'))
        .map((message) => ({
          rule: message.ruleId as string,
          line: message.line,
          column: message.column,
        })),
    )
  }

  it('finds violations, so agreement is not vacuous', () => {
    expect(local.length).toBeGreaterThan(4)
    expect(new Set(local.map((entry) => entry.rule)).size).toBeGreaterThan(3)
  })

  it('reports the same rules at the same places', async () => {
    const served = await callJson<{ violations: Reported[]; warnings?: Reported[] }>('validate', {
      code,
      filename: PROBE,
    })

    // Rule, line and column. Comparing only rule ids would pass even if the two
    // disagreed about where the problem was. `validate` answers with the groups a consumer
    // installs, which report the usage rules as warnings, and this repository's config makes
    // them errors (`usageRulesAsErrors`), so the places are compared across both lists.
    expect(
      ordered(
        [...served.violations, ...(served.warnings ?? [])].map((violation) => ({
          rule: violation.rule,
          line: violation.line,
          column: violation.column,
        })),
      ),
    ).toEqual(local)
  })
})
