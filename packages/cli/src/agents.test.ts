import { createHash } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'

import { buildRegistry, FRAMEWORKS, type Framework, type Registry } from '@polymorph/registry'
import { afterAll, describe, expect, it } from 'vitest'

import {
  AGENT_RECORD,
  commandLine,
  DEFAULT_HARNESSES,
  HARNESSES,
  planAgents,
  readAgentRecord,
  type AgentOptions,
} from './agents'
import { run } from './cli'
import { planInit, publishedTools, TOOLS_NAME } from './init'
import type { Origin, Program } from './init-app'
import { pinnedTools, pluginFiles } from './plugin'
import { SKILL_NAMES, skillFiles } from './skills'
import { synopsis, verbNamed, VERBS } from './verbs'

/**
 * The laws of the agent files (`agents.ts`, `skills.ts`).
 *
 * The texts are product copy for a model, and a model runs what they say. So
 * every command a text names is held to the verb list: the verb exists, each
 * flag is one it takes with a value where it needs one, it has the arguments
 * its usage requires, and each system, palette, framework and member it names
 * is in the registry. Each skill is held to the Agent Skills format. And
 * `polymorph agents` is held to what it promises a project: a rerun changes
 * nothing, text outside its block and other servers are kept, an edited file
 * is kept and named, a link out of the project is refused, and `init` writes
 * what `agents` writes.
 */

const ROOT = resolve(import.meta.dirname, '../../..')
const registry: Registry = buildRegistry(ROOT)

const scratch = mkdtempSync(resolve(tmpdir(), 'polymorph-agents-'))
afterAll(() => rmSync(scratch, { recursive: true, force: true }))

/** The checkout's programs, as its bin names them. */
const CHECKOUT: { mcp: Program; emit: Program; polymorph: Program } = {
  mcp: { command: 'node', args: [resolve(ROOT, 'packages/mcp/bin/polymorph-mcp.js')] },
  emit: { command: process.execPath, args: [resolve(ROOT, 'packages/spec/bin/emit.js')] },
  polymorph: { command: 'node', args: [resolve(ROOT, 'packages/cli/bin/polymorph.js')] },
}

/** The published tools' programs, as `packages/tools/src/shipped.ts` names them. */
const PUBLISHED = {
  mcp: { command: 'npx', args: [...publishedTools(registry).args, 'mcp'] },
  emit: { command: process.execPath, args: ['/tools/emit.js'] },
  polymorph: publishedTools(registry),
}

const options = (
  framework: Framework,
  origin: Origin,
  lint: string | null = 'npm run lint',
): AgentOptions => {
  const programs = origin === 'checkout' ? CHECKOUT : PUBLISHED
  return {
    harnesses: HARNESSES,
    framework,
    origin,
    tools: programs.polymorph,
    mcp: programs.mcp,
    lint,
  }
}

/* -------------------------------------------------------------------------- */
/* Every command a text names                                                 */
/* -------------------------------------------------------------------------- */

/** Every text a harness reads, with the command that starts a verb in it. */
function texts(): { where: string; text: string; run: string }[] {
  const found: { where: string; text: string; run: string }[] = []
  for (const origin of ['published', 'checkout'] as const) {
    for (const framework of FRAMEWORKS) {
      const plan = planAgents(
        registry,
        options(framework, origin, framework === 'elements' ? null : 'npm run lint'),
      )
      for (const step of plan.steps) {
        if (step.path.endsWith('.md') && step.path !== 'polymorph/system-card.md') {
          found.push({
            where: `${origin} ${framework} ${step.path}`,
            text: step.contents,
            run: commandLine(origin === 'checkout' ? CHECKOUT.polymorph : PUBLISHED.polymorph),
          })
        }
      }
    }
  }
  for (const file of pluginFiles(registry)) {
    if (file.path.endsWith('.md')) {
      found.push({ where: file.path, text: file.contents, run: commandLine(pinnedTools(registry)) })
    }
  }
  return found
}

/** A command line's words, a double-quoted phrase as one. */
function words(line: string): string[] {
  return [...line.matchAll(/"([^"]*)"|(\S+)/g)].map((match) => match[1] ?? (match[2] as string))
}

/** Each command a text names after `run`: the rest of its line, to a closing backtick or a comment. */
function commandsIn(text: string, run: string): string[] {
  const commands: string[] = []
  for (const line of text.split('\n')) {
    let at = line.indexOf(`${run} `)
    while (at >= 0) {
      const rest = line.slice(at + run.length + 1)
      const end = [rest.indexOf('`'), rest.indexOf(' # ')].filter((index) => index >= 0)
      commands.push(rest.slice(0, end.length === 0 ? undefined : Math.min(...end)).trim())
      at = line.indexOf(`${run} `, at + 1)
    }
  }
  return commands
}

/** Why a command line is not one the CLI runs, or nothing. */
function faults(command: string): string[] {
  const argv = words(command)
  const verb = verbNamed(argv[0], argv[1])
  if (verb === undefined) return [`no verb "${argv[0]}"`]
  const given = argv.slice(verb.name.split(' ').length)
  const flags = new Map(verb.flags.map((flag) => [flag.name, flag]))
  const problems: string[] = []
  const positionals: string[] = []
  const placeholder = (word: string) => /^<.*>$/.test(word)
  for (let index = 0; index < given.length; index += 1) {
    const word = given[index] as string
    if (!word.startsWith('--')) {
      positionals.push(word)
      continue
    }
    const flag = flags.get(word.slice(2))
    if (flag === undefined) {
      problems.push(`${verb.name} takes no flag ${word}`)
      continue
    }
    if (flag.value === undefined) continue
    const value = given[index + 1]
    index += 1
    if (value === undefined || value.startsWith('--')) {
      problems.push(`${word} needs a value`)
      continue
    }
    if (placeholder(value)) continue
    if (flag.name === 'system' && !registry.theme.systems.some((system) => system.name === value)) {
      problems.push(`no system "${value}"`)
    }
    if (flag.name === 'framework' && !(FRAMEWORKS as readonly string[]).includes(value)) {
      problems.push(`no framework "${value}"`)
    }
    if (flag.name === 'based-on') {
      const [system, palette] = value.split('/')
      if (!registry.theme.systems.some((entry) => entry.name === system)) {
        problems.push(`no system "${system}"`)
      }
      if (palette && !registry.theme.palettes.some((entry) => entry.name === palette)) {
        problems.push(`no palette "${palette}"`)
      }
    }
    if (flag.name === 'harness') {
      for (const harness of value.split(',')) {
        if (![...HARNESSES, 'all'].includes(harness)) problems.push(`no harness "${harness}"`)
      }
    }
  }
  const required = (
    synopsis(verb)
      .slice(`polymorph ${verb.name}`.length)
      .match(/<[^>]+>|"<[^>]+>"/g) ?? []
  ).length
  if (positionals.length < required) {
    problems.push(`${verb.name} needs ${required} argument(s): \`${verb.usage}\``)
  }
  for (const item of positionals) {
    const [kind, name] = item.split(':')
    if (kind === 'theme' && !registry.theme.systems.some((system) => system.name === name)) {
      problems.push(`no system "${name}"`)
    }
    if (kind === 'palette' && !registry.theme.palettes.some((palette) => palette.name === name)) {
      problems.push(`no palette "${name}"`)
    }
  }
  if (verb.name === 'component' && positionals[0] !== undefined && !placeholder(positionals[0])) {
    const members = [...registry.components, ...registry.exceptions.primitives]
    if (!members.some((member) => member.name === positionals[0])) {
      problems.push(`no member "${positionals[0]}"`)
    }
  }
  return problems.map((problem) => `\`${command}\`: ${problem}`)
}

describe('every command a text names', () => {
  const all = texts()

  it('finds the texts and the commands in them, so a pass is not vacuous', () => {
    expect(all.length).toBeGreaterThan(SKILL_NAMES.length * 2)
    const named = new Set(
      all.flatMap(({ text, run }) => commandsIn(text, run).map((c) => words(c)[0])),
    )
    for (const verb of [
      'card',
      'search',
      'component',
      'validate',
      'fix',
      'emit',
      'render',
      'agents',
    ]) {
      expect(named, verb).toContain(verb)
    }
  })

  it('is a verb the CLI has, with flags it takes and the arguments it needs', () => {
    const problems = all.flatMap(({ where, text, run }) =>
      commandsIn(text, run).flatMap((command) =>
        faults(command).map((fault) => `${where}: ${fault}`),
      ),
    )
    expect(problems).toEqual([])
  })

  it('reads a command it does not have as a fault', () => {
    expect(faults('carde')).not.toEqual([])
    expect(faults('card --frame vue')).not.toEqual([])
    expect(faults('render spec.json --system')).not.toEqual([])
    expect(faults('emit spec.json')).not.toEqual([])
    expect(faults('add theme:nothing')).not.toEqual([])
    expect(faults('component Modal')).not.toEqual([])
    expect(faults('theme propose "calm" --based-on journal/umber')).toEqual([])
  })

  it('never runs the unscoped package, which is someone else’s', () => {
    for (const { where, text } of all) {
      expect(text, where).not.toMatch(/npx (-y )?polymorph\b/)
    }
  })

  it('names every rule and every MCP tool as the registry and the verbs have them', () => {
    const rules = new Set(registry.laws.map((law) => law.name))
    const tools = new Set(VERBS.flatMap((verb) => verb.tools))
    for (const { where, text } of all) {
      for (const [rule] of text.matchAll(
        /(?<![@\w/.-])polymorph\/[a-z]+(?:-[a-z]+)+(?![\w./-])/g,
      )) {
        expect(rules, `${where}: ${rule}`).toContain(rule)
      }
      for (const [, tool] of text.matchAll(/`([a-z]+(?:_[a-z]+)+)`/g)) {
        expect(tools, `${where}: ${tool}`).toContain(tool)
      }
    }
  })
})

/* -------------------------------------------------------------------------- */
/* The skills, in the Agent Skills format                                     */
/* -------------------------------------------------------------------------- */

/** The fields the Agent Skills format defines, and the only ones its reference validator admits. */
const SKILL_FIELDS = [
  'name',
  'description',
  'license',
  'compatibility',
  'metadata',
  'allowed-tools',
]

/** A skill's front matter as `key: value` lines, and its body. */
function frontMatter(text: string): { fields: Map<string, string>; body: string } {
  const match = /^---\n([\s\S]*?)\n---\n/.exec(text)
  if (match === null) throw new Error('no front matter')
  const fields = new Map(
    (match[1] as string).split('\n').map((line) => {
      const colon = line.indexOf(': ')
      return [line.slice(0, colon), line.slice(colon + 2)] as [string, string]
    }),
  )
  return { fields, body: text.slice(match[0].length) }
}

describe('each skill', () => {
  const files = skillFiles(registry, commandLine(PUBLISHED.polymorph))
  const byPath = new Map(files.map((file) => [file.path, file.contents]))

  for (const name of SKILL_NAMES) {
    describe(name, () => {
      const text = byPath.get(`${name}/SKILL.md`) as string

      it('has a SKILL.md whose name is its directory, in the format’s characters', () => {
        expect(text).toBeDefined()
        const { fields } = frontMatter(text)
        expect([...fields.keys()].filter((key) => !SKILL_FIELDS.includes(key))).toEqual([])
        expect(fields.get('name')).toBe(name)
        expect(name).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
        expect(name.length).toBeLessThanOrEqual(64)
      })

      it('describes what it does and when, within 1024 characters, as a plain YAML scalar', () => {
        const description = frontMatter(text).fields.get('description') ?? ''
        expect(description.length).toBeGreaterThan(0)
        expect(description.length).toBeLessThanOrEqual(1024)
        expect(description).toMatch(/\bUse (?:when|for)\b/)
        // A plain scalar ends at `: ` and at ` #`, and may not open with an indicator.
        expect(description).not.toMatch(/: | #|:$/)
        expect(description).not.toMatch(/^[-?:,[\]{}#&*!|>'"%@`]/)
      })

      it('keeps its body under 500 lines and about 5000 tokens', () => {
        const { body } = frontMatter(text)
        expect(body.split('\n').length).toBeLessThan(500)
        expect(body.length / 4).toBeLessThan(5000)
      })

      it('links each reference it has, one level deep, and each link resolves', () => {
        const { body } = frontMatter(text)
        const links = [...body.matchAll(/\]\(([^)#]+)\)/g)]
          .map((match) => match[1] as string)
          .filter((link) => !/^https?:/.test(link))
        for (const link of links) {
          expect(link, link).toMatch(/^references\/[^/]+\.md$/)
          expect(byPath.has(`${name}/${link}`), link).toBe(true)
        }
        const references = files
          .map((file) => file.path)
          .filter((path) => path.startsWith(`${name}/references/`))
        for (const reference of references) {
          expect(links, reference).toContain(reference.slice(name.length + 1))
        }
      })
    })
  }

  it('reads the ladder from the registry: every rung, and what declares it', () => {
    const rules = byPath.get('polymorph-rules/SKILL.md') as string
    for (const rung of registry.exceptions.ladder) {
      expect(rules).toContain(`**${rung.name}**`)
      for (const declared of (rung.declaredAs ?? '').split('|').filter(Boolean)) {
        expect(rules).toContain(`\`${declared.trim()}\``)
      }
    }
    for (const law of registry.laws.filter((entry) => entry.applies === 'application')) {
      expect(rules).toContain(`\`${law.name}\``)
    }
  })
})

/* -------------------------------------------------------------------------- */
/* The always-loaded text                                                     */
/* -------------------------------------------------------------------------- */

describe('the always-loaded text', () => {
  it('is short in every framework, and says where the skills and the card are', () => {
    for (const framework of FRAMEWORKS) {
      const plan = planAgents(
        registry,
        options(framework, 'published', framework === 'elements' ? null : 'npm run lint'),
      )
      const block = plan.steps.find((step) => step.path === 'AGENTS.md')?.piece ?? ''
      expect(block.split('\n').length, framework).toBeLessThanOrEqual(45)
      expect(block, framework).toContain('`polymorph/system-card.md`')
      for (const name of SKILL_NAMES) expect(block, framework).toContain(`\`${name}\``)
    }
  })

  it('names the project’s own lint, or `check` where there is none', () => {
    const npm = planAgents(registry, options('react', 'published', 'npm run lint'))
    expect(npm.steps[0]?.piece).toContain('`npm run lint` runs the same red rules')
    const none = planAgents(registry, options('react', 'published', null))
    expect(none.steps[0]?.piece).toContain(`${commandLine(PUBLISHED.polymorph)} check src`)
  })
})

/* -------------------------------------------------------------------------- */
/* polymorph agents in a project                                              */
/* -------------------------------------------------------------------------- */

let projects = 0

/** A new project directory outside every checkout, with the files given. */
function project(files: Record<string, string> = {}): string {
  projects += 1
  const dir = resolve(scratch, `project-${projects}`)
  for (const [path, contents] of Object.entries(files)) {
    mkdirSync(dirname(resolve(dir, path)), { recursive: true })
    writeFileSync(resolve(dir, path), contents)
  }
  mkdirSync(dir, { recursive: true })
  return dir
}

/** `polymorph agents` from the published tools, in `root`. */
function agents(root: string, argv: string[] = [], over: Registry = registry) {
  const lines: string[] = []
  const outcome = run(
    {
      root,
      source: ROOT,
      registry: over,
      out: (line) => lines.push(line),
      programs: {
        mcp: { command: 'npx', args: [...publishedTools(over).args, 'mcp'] },
        emit: PUBLISHED.emit,
        polymorph: publishedTools(over),
      },
      origin: 'published',
    },
    ['agents', ...argv],
  )
  return { code: outcome.code, output: lines.join('\n') }
}

/** Every file below `dir` with a hash of its bytes. */
function snapshot(dir: string): Record<string, string> {
  const found: Record<string, string> = {}
  const walk = (at: string): void => {
    for (const entry of readdirSync(resolve(dir, at), { withFileTypes: true })) {
      const path = at === '' ? entry.name : `${at}/${entry.name}`
      if (entry.isDirectory()) walk(path)
      else
        found[path] = createHash('sha256')
          .update(readFileSync(resolve(dir, path)))
          .digest('hex')
    }
  }
  walk('')
  return found
}

const read = (dir: string, path: string) => readFileSync(resolve(dir, path), 'utf8')

describe('polymorph agents', () => {
  it('writes the agent files for the default harnesses, and a rerun changes nothing', () => {
    const dir = project({
      'package.json': '{ "name": "app", "scripts": { "lint": "eslint ." } }\n',
    })
    const first = agents(dir)
    expect(first.code, first.output).toBe(0)
    expect(first.output).toContain('Claude Code, Codex and Cursor')
    for (const path of [
      'AGENTS.md',
      'CLAUDE.md',
      'polymorph/system-card.md',
      '.claude/skills/polymorph-screen/SKILL.md',
      '.agents/skills/polymorph-rules/references/ladder.md',
      '.mcp.json',
      '.cursor/mcp.json',
      '.codex/config.toml',
      AGENT_RECORD,
    ]) {
      expect(existsSync(resolve(dir, path)), path).toBe(true)
    }
    expect(readAgentRecord(dir)?.harnesses).toEqual([...DEFAULT_HARNESSES])
    const before = snapshot(dir)
    const second = agents(dir)
    expect(second.code).toBe(0)
    expect(second.output).toContain('are as polymorph wrote them')
    expect(snapshot(dir)).toEqual(before)
  })

  it('keeps the text outside its block, and the other servers of an MCP config', () => {
    const dir = project({
      'AGENTS.md': '# Our project\n\nOur own rules.\n',
      '.mcp.json': '{ "mcpServers": { "other": { "command": "other-server" } }, "extra": true }\n',
      'CLAUDE.md': '# Ours\n',
    })
    expect(agents(dir).code).toBe(0)
    const text = read(dir, 'AGENTS.md')
    expect(text.startsWith('# Our project\n\nOur own rules.\n\n<!-- polymorph:start')).toBe(true)
    expect(text.trimEnd().endsWith('<!-- polymorph:end -->')).toBe(true)
    const config = JSON.parse(read(dir, '.mcp.json')) as {
      mcpServers: Record<string, unknown>
      extra: boolean
    }
    expect(Object.keys(config.mcpServers)).toEqual(['other', 'polymorph'])
    expect(config.extra).toBe(true)
    expect(read(dir, 'CLAUDE.md')).toBe('# Ours\n\n@AGENTS.md\n')
  })

  it('brings unedited files up to a new release, keeps an edited one and names it', () => {
    const dir = project()
    expect(agents(dir).code).toBe(0)
    const edited = '.claude/skills/polymorph-theme/SKILL.md'
    writeFileSync(resolve(dir, edited), `${read(dir, edited)}\nOur note.\n`)
    writeFileSync(resolve(dir, 'AGENTS.md'), `${read(dir, 'AGENTS.md')}\nAfter the block.\n`)

    const next = { ...registry, version: '99.0.0' }
    const upgrade = agents(dir, [], next)
    expect(upgrade.code).toBe(0)
    expect(upgrade.output).toContain(`kept yours ${edited}`)
    expect(read(dir, edited)).toContain('Our note.')
    expect(read(dir, edited)).not.toContain('99.0.0')
    expect(read(dir, '.agents/skills/polymorph-theme/SKILL.md')).toContain(`${TOOLS_NAME}@^99.0.0`)
    expect(read(dir, 'AGENTS.md')).toContain(`${TOOLS_NAME}@^99.0.0`)
    expect(read(dir, 'AGENTS.md')).toContain('After the block.')

    const forced = agents(dir, ['--force'], next)
    expect(forced.code).toBe(0)
    expect(read(dir, edited)).not.toContain('Our note.')
  })

  it('keeps a file it did not write, unless forced, and a block someone edited', () => {
    const dir = project({ 'polymorph/system-card.md': '# An older card\n' })
    const first = agents(dir)
    expect(first.output).toContain('kept yours polymorph/system-card.md')
    expect(read(dir, 'polymorph/system-card.md')).toBe('# An older card\n')

    writeFileSync(
      resolve(dir, 'AGENTS.md'),
      read(dir, 'AGENTS.md').replace('## Polymorph', '## Polymorph, as we use it'),
    )
    const second = agents(dir, [], { ...registry, version: '99.0.0' })
    expect(second.output).toContain('kept yours AGENTS.md (the polymorph block)')
    expect(read(dir, 'AGENTS.md')).toContain('## Polymorph, as we use it')
  })

  it('adds the harnesses it is asked for to the ones it wrote before, and drops none', () => {
    const dir = project()
    expect(agents(dir, ['--harness', 'claude']).code).toBe(0)
    expect(existsSync(resolve(dir, '.claude/skills/polymorph-screen/SKILL.md'))).toBe(true)
    expect(existsSync(resolve(dir, '.agents/skills'))).toBe(false)
    expect(existsSync(resolve(dir, '.codex/config.toml'))).toBe(false)

    expect(agents(dir, ['--harness', 'codex']).code).toBe(0)
    expect(readAgentRecord(dir)?.harnesses).toEqual(['claude', 'codex'])
    expect(existsSync(resolve(dir, '.claude/skills/polymorph-screen/SKILL.md'))).toBe(true)
    expect(read(dir, '.codex/config.toml')).toContain('[mcp_servers.polymorph]')
  })

  it('removes a file it wrote that no release writes any more, unless it was edited', () => {
    const dir = project()
    expect(agents(dir).code).toBe(0)
    const gone = '.claude/skills/polymorph-old/SKILL.md'
    const kept = '.agents/skills/polymorph-old/SKILL.md'
    for (const path of [gone, kept]) {
      mkdirSync(dirname(resolve(dir, path)), { recursive: true })
      writeFileSync(resolve(dir, path), 'old\n')
    }
    writeFileSync(resolve(dir, kept), 'old, and ours now\n')
    const record = JSON.parse(read(dir, AGENT_RECORD)) as {
      files: Record<string, { part: string; hash: string }>
    }
    const hash = createHash('sha256').update('old\n').digest('hex')
    record.files[gone] = { part: 'file', hash }
    record.files[kept] = { part: 'file', hash }
    writeFileSync(resolve(dir, AGENT_RECORD), JSON.stringify(record))

    const outcome = agents(dir)
    expect(outcome.output).toContain(`removed    ${gone}`)
    expect(existsSync(resolve(dir, '.claude/skills/polymorph-old'))).toBe(false)
    expect(read(dir, kept)).toBe('old, and ours now\n')
  })

  it('leaves a Codex config that already has the server, and says so', () => {
    const toml = '[mcp_servers.polymorph]\ncommand = "polymorph-mcp"\n'
    const dir = project({ '.codex/config.toml': toml })
    const outcome = agents(dir)
    expect(outcome.code).toBe(0)
    expect(outcome.output).toContain('kept yours .codex/config.toml')
    expect(read(dir, '.codex/config.toml')).toBe(toml)
    expect(outcome.output).toContain('codex mcp add polymorph -- npx -y')
  })

  it('writes nothing on a dry run', () => {
    const dir = project()
    const outcome = agents(dir, ['--dry-run'])
    expect(outcome.code).toBe(0)
    expect(outcome.output).toContain('wrote      AGENTS.md')
    expect(readdirSync(dir)).toEqual([])
  })

  it('refuses a directory a link carries out of the project', () => {
    const outside = project()
    const dir = project()
    symlinkSync(outside, resolve(dir, '.claude'), 'dir')
    const outcome = agents(dir)
    expect(outcome.code).toBe(1)
    expect(outcome.output).toContain('refused    .claude/skills/polymorph-screen/SKILL.md')
    expect(readdirSync(outside)).toEqual([])
  })

  it('refuses inside a checkout of polymorph, and plans there on a dry run', () => {
    const checkout = project({ [registry.vendor.base]: '/* base */\n' })
    const refused = agents(checkout)
    expect(refused.code).toBe(1)
    expect(refused.output).toContain('is in a checkout of polymorph')
    expect(agents(checkout, ['--dry-run']).code).toBe(0)
    expect(existsSync(resolve(checkout, 'AGENTS.md'))).toBe(false)
  })

  it('refuses a harness, a framework or an argument it does not know, as a usage error', () => {
    const dir = project()
    expect(agents(dir, ['--harness', 'emacs']).code).toBe(2)
    expect(agents(dir, ['--framework', 'ember']).code).toBe(2)
    expect(agents(dir, ['claude']).code).toBe(2)
    expect(readdirSync(dir)).toEqual([])
  })

  it('refuses a record that names a path outside the project', () => {
    const dir = project({
      [AGENT_RECORD]: JSON.stringify({ version: '1.0.0', files: { '../x': { part: 'file' } } }),
    })
    const outcome = agents(dir)
    expect(outcome.code).toBe(1)
    expect(outcome.output).toContain('outside the project')
  })

  it('reads the framework from the project, and writes its card', () => {
    const dir = project({
      'package.json': JSON.stringify({ dependencies: { '@polymorph/svelte-ui': '^1.0.0' } }),
    })
    expect(agents(dir).code).toBe(0)
    expect(read(dir, 'AGENTS.md')).toContain('card --framework svelte')
    expect(readAgentRecord(dir)?.framework).toBe('svelte')
  })
})

describe('init and agents', () => {
  it('write the same agent files for the same project, and agents then changes nothing', () => {
    const plan = planInit(registry, {
      dir: resolve(scratch, 'from-init'),
      programs: PUBLISHED,
      origin: 'published',
      manager: 'npm',
    })
    const record = plan.steps.findIndex((step) => step.path === AGENT_RECORD)
    expect(record).toBeGreaterThan(0)
    const agentPaths = new Set([
      ...planAgents(registry, options('react', 'published')).steps.map((step) => step.path),
      AGENT_RECORD,
    ])
    const written = plan.steps.filter((step) => agentPaths.has(step.path))
    expect(written.map((step) => step.path).sort()).toEqual([...agentPaths].sort())

    // The project `init` writes, with the files that decide the lint line and the framework.
    const fromInit = project({
      'package.json': '{ "name": "app", "scripts": { "lint": "eslint src" } }\n',
      'package-lock.json': '{}\n',
    })
    for (const step of written) {
      if (step.kind !== 'write') throw new Error(`${step.path} is not written`)
      mkdirSync(dirname(resolve(fromInit, step.path)), { recursive: true })
      writeFileSync(resolve(fromInit, step.path), step.contents)
    }
    const fromAgents = project({
      'package.json': '{ "name": "app", "scripts": { "lint": "eslint src" } }\n',
      'package-lock.json': '{}\n',
    })
    expect(agents(fromAgents).code).toBe(0)
    expect(snapshot(fromAgents)).toEqual(snapshot(fromInit))

    const before = snapshot(fromInit)
    const rerun = agents(fromInit)
    expect(rerun.output).toContain('are as polymorph wrote them')
    expect(snapshot(fromInit)).toEqual(before)
  })
})
