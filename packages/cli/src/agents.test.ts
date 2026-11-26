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
import { parse as parseToml } from 'smol-toml'
import { afterAll, describe, expect, it } from 'vitest'

import {
  AGENT_RECORD,
  commandLine,
  DEFAULT_HARNESSES,
  HARNESSES,
  planAgents,
  projectLint,
  readAgentRecord,
  type AgentOptions,
  type ProjectLint,
} from './agents'
import { freshEslintConfig } from './apply'
import { newerRelease, run } from './cli'
import { planInit, publishedTools, TOOLS_NAME } from './init'
import type { Origin, Program } from './init-app'
import { pinnedTools, pluginFiles } from './plugin'
import { SKILL_NAMES, SkillFactError, skillFiles } from './skills'
import { NAMED } from './skills/facts'
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

/** A project's lint that loads the red rules, as an app `init` writes has. */
const RULES_LINT: ProjectLint = { command: 'npm run lint', redRules: true }

const options = (
  framework: Framework,
  origin: Origin,
  lint: ProjectLint | null = RULES_LINT,
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
        options(framework, origin, framework === 'elements' ? null : RULES_LINT),
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
/* Every member, prop and part a text names                                   */
/* -------------------------------------------------------------------------- */

/** Every member and primitive by name, with its props and its parts' props. */
const MEMBERS = new Map<string, { props: Set<string>; parts: Map<string, Set<string>> }>(
  [...registry.components, ...registry.exceptions.primitives].map((member) => {
    const parts = (member as { parts?: { name: string; props: { name: string }[] }[] }).parts
    return [
      member.name,
      {
        props: new Set(member.props.map((prop) => prop.name)),
        parts: new Map(
          (Array.isArray(parts) ? parts : []).map((part) => [
            part.name,
            new Set(part.props.map((prop) => prop.name)),
          ]),
        ),
      },
    ]
  }),
)

/** The props of a member or of `Member.Part`, or `null` when the registry has neither. */
function propsOf(name: string): Set<string> | null {
  const [member, part] = name.split('.')
  const found = MEMBERS.get(member as string)
  if (found === undefined) return null
  if (part === undefined) return found.props
  return found.parts.get(part) ?? null
}

/** The keys of the data type a member's prop takes, when the type is one the registry declares. */
function fieldsOf(member: string, prop: string): Set<string> | null {
  const type = [...registry.components, ...registry.exceptions.primitives]
    .find((entry) => entry.name === member)
    ?.props.find((entry) => entry.name === prop)
    ?.type.split('|')[0]
    ?.trim()
  const declared = registry.dataTypes.find((entry) => entry.name === type)
  return declared === undefined ? null : new Set(declared.fields.map((field) => field.name))
}

/**
 * What a text says that the registry does not hold: a member, part or prop
 * in code font, in JSX or in a JSON spec that it lacks, a patch key its patch
 * type lacks, and an exception at a rung its member is not. A tag imported
 * from another package in the same block is that package's, not a member.
 * Neither is a name a text takes through `Facts.x`, which the law below holds
 * to the source that declares it.
 */
function factFaults(text: string): string[] {
  const faults: string[] = []
  const tagged = (code: string, foreign: Set<string>) => {
    for (const [, name, attributes] of code.matchAll(
      // A `<` straight after a name opens a type argument (`useState<Turn>`), not an element.
      /(?<![\w$])<([A-Z][A-Za-z0-9]*(?:\.[A-Z][A-Za-z0-9]*)?)\b([^<>]*)>/g,
    )) {
      if (foreign.has(name as string) || NAMED.has(name as string)) continue
      const props = propsOf(name as string)
      if (props === null) {
        faults.push(`<${name}>: no such member or part`)
        continue
      }
      for (const [, prop] of (attributes as string).matchAll(/([A-Za-z][\w-]*)=/g)) {
        // `key` is React's own, on any element a list renders.
        if (prop !== 'key' && !props.has(prop as string))
          faults.push(`<${name} ${prop}>: no such prop`)
      }
      for (const [, keys] of (attributes as string).matchAll(/patch=\{\{([^}]*)\}\}/g)) {
        const fields = fieldsOf(name as string, 'patch')
        for (const [, key] of (keys as string).matchAll(/([A-Za-z]\w*):/g)) {
          if (fields === null || !fields.has(key as string))
            faults.push(`<${name} patch.${key}>: no such key`)
        }
      }
    }
  }
  const spec = (node: unknown): void => {
    if (Array.isArray(node)) return node.forEach(spec)
    if (node === null || typeof node !== 'object') return
    const element = node as Record<string, unknown>
    if (typeof element['component'] === 'string') {
      const name = element['component']
      const props = propsOf(name)
      if (props === null) faults.push(`"${name}": no such member or part`)
      for (const prop of Object.keys((element['props'] as object | undefined) ?? {})) {
        if (props !== null && !props.has(prop)) faults.push(`"${name}".${prop}: no such prop`)
      }
      const exception = element['exception'] as { rung?: number } | undefined
      const primitive = registry.exceptions.primitives.find((entry) => entry.name === name)
      if (exception !== undefined && primitive?.rung !== exception.rung) {
        faults.push(`"${name}": no exception at rung ${exception.rung}`)
      }
    }
    Object.values(element).forEach(spec)
  }
  const fences = [...text.matchAll(/```(\w*)\n([\s\S]*?)```/g)]
  for (const [, language, code] of fences) {
    if (language === 'tsx') {
      const foreign = new Set(
        [...(code as string).matchAll(/import \{([^}]+)\} from '(?!@polymorph\/)[^']+'/g)].flatMap(
          ([, names]) => (names as string).split(',').map((each) => each.trim()),
        ),
      )
      tagged(code as string, foreign)
    }
    if (language === 'json') spec(JSON.parse(code as string))
  }
  const prose = text.replace(/```[\s\S]*?```/g, '')
  for (const [, code] of prose.matchAll(/`([^`]+)`/g)) {
    if (/^[A-Z][A-Za-z0-9]*(?:\.[A-Z][A-Za-z0-9]*)?$/.test(code as string)) {
      if (propsOf(code as string) === null && !NAMED.has(code as string))
        faults.push(`\`${code}\`: no such member or part`)
    }
    if ((code as string).startsWith('<') && /^<[A-Z]/.test(code as string))
      tagged(code as string, new Set())
  }
  return faults
}

/** The verbs whose answer depends on the app's framework, so a text names it. */
const FRAMEWORK_VERBS = ['card', 'search', 'component', 'plan', 'add', 'validate', 'fix', 'emit']

describe('every member, prop and part a text names', () => {
  const all = texts()

  it('is in the registry, in code font, in JSX and in a spec', () => {
    expect(
      all.flatMap(({ where, text }) => factFaults(text).map((fault) => `${where}: ${fault}`)),
    ).toEqual([])
  })

  it('reads a member, a prop or a patch key the registry lacks as a fault', () => {
    expect(factFaults('`Card.Header`')).not.toEqual([])
    expect(factFaults('`TextField`')).not.toEqual([])
    expect(factFaults('```tsx\n<Heading tone="secondary">x</Heading>\n```')).not.toEqual([])
    expect(factFaults('```tsx\n<Card patch={{ gap: 2 }}>x</Card>\n```')).not.toEqual([])
    expect(
      factFaults('```json\n{ "component": "Heading", "props": { "size": "lg" } }\n```'),
    ).not.toEqual([])
    expect(factFaults("```tsx\nimport { Map } from 'maps'\n<Map center={c} />\n```")).toEqual([])
    expect(factFaults('`Button` and `Table.Row`')).toEqual([])
    expect(factFaults('```tsx\nconst [open, setOpen] = useState<Detail>()\n```')).toEqual([])
    expect(
      factFaults('```tsx\n{items.map((item) => <Badge key={item.id}>{item.name}</Badge>)}\n```'),
    ).toEqual([])
  })

  it('stops the texts being written when the registry lacks what a sentence names', () => {
    const heading = registry.components.find((member) => member.name === 'Heading')
    const without = {
      ...registry,
      components: registry.components.map((member) =>
        member === heading
          ? { ...member, props: member.props.filter((prop) => prop.name !== 'level') }
          : member,
      ),
    }
    expect(() => skillFiles(without, 'npx -y x')).toThrow(SkillFactError)
  })

  it('names the framework on every command whose answer depends on it', () => {
    const missing = all.flatMap(({ where, text, run }) =>
      commandsIn(text, run)
        .filter((command) => FRAMEWORK_VERBS.includes(words(command)[0] as string))
        .filter((command) => !/--framework \S+/.test(command))
        .map((command) => `${where}: \`${command}\``),
    )
    expect(missing).toEqual([])
  })
})

/* -------------------------------------------------------------------------- */
/* Every name a text takes from a package or a native source                  */
/* -------------------------------------------------------------------------- */

/** The source file a module names, by its package's `exports`, or `null`. */
function moduleSource(specifier: string): string | null {
  const [scope, name, ...rest] = specifier.split('/')
  const subpath = rest.length === 0 ? '.' : `./${rest.join('/')}`
  for (const dir of readdirSync(resolve(ROOT, 'packages'))) {
    const manifest = resolve(ROOT, 'packages', dir, 'package.json')
    if (!existsSync(manifest)) continue
    const json = JSON.parse(readFileSync(manifest, 'utf8')) as {
      name?: string
      exports?: Record<string, unknown>
    }
    if (json.name !== `${scope}/${name}`) continue
    const target = json.exports?.[subpath]
    return typeof target === 'string' ? resolve(ROOT, 'packages', dir, target) : null
  }
  return null
}

/** Every source file at a path: the file, or each file below the directory. */
function sourcesAt(path: string): string[] {
  if (!existsSync(path)) return []
  return readdirSync(path, { withFileTypes: true, recursive: true }).length === 0
    ? []
    : readdirSync(path, { withFileTypes: true, recursive: true })
        .filter((entry) => entry.isFile())
        .map((entry) => resolve(entry.parentPath, entry.name))
}

/**
 * Whether a source file declares `name`, or exports it by name, itself or in a
 * file or a module it exports whole (`export * from`). It reads TypeScript, Swift and
 * Kotlin declarations by their keyword.
 */
function declares(file: string, name: string, seen = new Set<string>()): boolean {
  if (seen.has(file) || !existsSync(file)) return false
  seen.add(file)
  const source = readFileSync(file, 'utf8')
  const keyword =
    'const|function|class|interface|type|enum|struct|func|fun|protocol|object|typealias|val|var|let|case'
  if (new RegExp(`\\b(?:${keyword})\\s+${name}\\b`).test(source)) return true
  if (new RegExp(`export\\s+(?:type\\s+)?\\{[^}]*\\b${name}\\b[^}]*\\}`).test(source)) return true
  return [...source.matchAll(/export \* from '([^']+)'/g)].some(([, from]) => {
    const module = from as string
    if (!module.startsWith('.')) {
      const entry = moduleSource(module)
      return entry !== null && declares(entry, name, seen)
    }
    return ['.ts', '.tsx', '/index.ts'].some((ending) =>
      declares(resolve(dirname(file), `${module}${ending}`), name, seen),
    )
  })
}

/** Why a name a text takes through `Facts.x` is not in the source it names, or nothing. */
function nameFault(name: string, from: string): string | null {
  if (from.startsWith('@polymorph/')) {
    const file = moduleSource(from)
    if (file === null) return `${name}: no module ${from}`
    return declares(file, name) ? null : `${name}: ${from} does not export it`
  }
  const path = resolve(ROOT, from)
  if (!existsSync(path)) return `${name}: no source at ${from}`
  const files = from.includes('.') ? [path] : sourcesAt(path)
  return files.some((file) => declares(file, name)) ? null : `${name}: ${from} does not declare it`
}

describe('every name a text takes from a package or a native source', () => {
  texts()

  it('is declared where the text says it is', () => {
    expect([...NAMED].flatMap(([name, from]) => nameFault(name, from) ?? [])).toEqual([])
  })

  it('reads a name its source lacks, and a source that is not there, as a fault', () => {
    expect(nameFault('useThemeValues', '@polymorph/react')).toBeNull()
    expect(nameFault('NoSuchExport', '@polymorph/react')).not.toBeNull()
    expect(nameFault('useThemeValues', '@polymorph/react/nowhere')).not.toBeNull()
    expect(nameFault('Anything', 'platforms/nowhere')).not.toBeNull()
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
        options(framework, 'published', framework === 'elements' ? null : RULES_LINT),
      )
      const block = plan.steps.find((step) => step.path === 'AGENTS.md')?.piece ?? ''
      expect(block.split('\n').length, framework).toBeLessThanOrEqual(45)
      expect(block, framework).toContain('`polymorph/system-card.md`')
      for (const name of SKILL_NAMES) expect(block, framework).toContain(`\`${name}\``)
    }
  })

  it('says the project’s lint runs the red rules only when its config loads them', () => {
    const check = `${commandLine(PUBLISHED.polymorph)} check src`
    const rules = planAgents(registry, options('react', 'published', RULES_LINT)).steps[0]?.piece
    expect(rules).toContain('`npm run lint` runs the same red rules')
    expect(rules).toContain(check)
    const own = planAgents(
      registry,
      options('react', 'published', { command: 'npm run lint', redRules: false }),
    ).steps[0]?.piece
    expect(own).not.toContain('runs the same red rules')
    expect(own?.replace(/\s+/g, ' ')).toContain("`npm run lint` is the project's own lint")
    expect(own).toContain(check)
    const none = planAgents(registry, options('react', 'published', null)).steps[0]?.piece
    expect(none).toContain(check)
  })

  it('finds the evidence that a project’s lint loads the red rules in its ESLint config', () => {
    const script = { 'package.json': '{ "scripts": { "lint": "eslint src" } }\n' }
    expect(projectLint(project(script), 'npm')).toEqual({
      command: 'npm run lint',
      redRules: false,
    })
    const fragment = project({
      ...script,
      'pnpm-lock.yaml': '',
      'eslint.config.js':
        "import polymorph from './polymorph.eslint.js'\nexport default [...polymorph]\n",
    })
    expect(projectLint(fragment, 'npm')).toEqual({ command: 'pnpm lint', redRules: true })
    const plugin = project({
      ...script,
      'eslint.config.mjs': "import { rules } from '@polymorph/rules'\nexport default []\n",
    })
    expect(projectLint(plugin, 'npm')?.redRules).toBe(true)
    expect(projectLint(project(), 'npm')).toBeNull()
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
    expect(upgrade.output).toContain('replaced with polymorph’s by `--force`')
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

  it('reads a file with CRLF line endings as the one it wrote, and keeps its endings', () => {
    const dir = project({ 'AGENTS.md': '# Ours\r\n\r\nOur own rules.\r\n' })
    expect(agents(dir).code).toBe(0)
    // A checkout with Git's `core.autocrlf` gives every text file CRLF endings.
    const written = ['AGENTS.md', '.claude/skills/polymorph-screen/SKILL.md', '.mcp.json']
    for (const path of written) {
      writeFileSync(resolve(dir, path), read(dir, path).replace(/\r?\n/g, '\r\n'))
    }
    const rerun = agents(dir)
    expect(rerun.output).toContain('are as polymorph wrote them')
    expect(rerun.output).not.toContain('kept yours')

    const upgrade = agents(dir, [], { ...registry, version: '99.0.0' })
    expect(upgrade.output).not.toContain('kept yours')
    for (const path of written) {
      const text = read(dir, path)
      expect(text, path).toContain(`${TOOLS_NAME}@^99.0.0`)
      expect(text.replace(/\r\n/g, ''), path).not.toContain('\n')
    }
    expect(read(dir, 'AGENTS.md').startsWith('# Ours\r\n\r\nOur own rules.\r\n')).toBe(true)
  })

  it('leaves a Codex config that declares the server in any form, and writes one that parses', () => {
    const forms = {
      'a table': '[mcp_servers.polymorph]\ncommand = "mine"\n',
      'a quoted table': '[mcp_servers."polymorph".env]\nA = "b"\n',
      'a key under mcp_servers': '[mcp_servers]\npolymorph = { command = "mine" }\n',
      'a dotted key': 'mcp_servers.polymorph.command = "mine"\n',
      'a dotted key under mcp_servers': '[mcp_servers]\npolymorph.command = "mine" # ours\n',
      'an inline mcp_servers': 'mcp_servers = { other = { command = "other" } }\n',
      'a table after a string that holds the other delimiter':
        'note = """\n\'\'\'\n"""\n[mcp_servers.polymorph]\ncommand = "mine"\n',
    }
    for (const [form, toml] of Object.entries(forms)) {
      const dir = project({ '.codex/config.toml': toml })
      const outcome = agents(dir)
      expect(outcome.output, form).toContain('kept yours .codex/config.toml')
      expect(read(dir, '.codex/config.toml'), form).toBe(toml)
      expect(() => parseToml(toml), form).not.toThrow()
    }
    const fine = {
      'another server': '[mcp_servers.other]\ncommand = "other"\n',
      'another server by a dotted key': 'model = "x"\nmcp_servers.other.command = "other"\n',
      'a string that names it': 'note = "[mcp_servers.polymorph] is ours"\n',
      'a comment that names it': '# [mcp_servers.polymorph]\nmodel = "x"\n',
      'a multi-line string that names it': 'note = """\n[mcp_servers.polymorph]\n"""\n',
    }
    for (const [form, toml] of Object.entries(fine)) {
      const dir = project({ '.codex/config.toml': toml })
      agents(dir)
      const written = read(dir, '.codex/config.toml')
      expect(written, form).toContain('# polymorph:start')
      const parsed = parseToml(written) as { mcp_servers: Record<string, unknown> }
      expect(parsed.mcp_servers['polymorph'], form).toBeDefined()
    }
  })

  it('refuses to write an older release’s files over a newer one’s, unless forced', () => {
    const dir = project()
    expect(agents(dir, [], { ...registry, version: '99.1.0' }).code).toBe(0)
    const before = snapshot(dir)
    const older = agents(dir)
    expect(older.code).toBe(1)
    expect(older.output).toContain('polymorph 99.1.0 wrote these agent files')
    expect(older.output).toContain(`this is polymorph ${registry.version}, an older release`)
    expect(snapshot(dir)).toEqual(before)
    expect(agents(dir, ['--force']).code).toBe(0)
    expect(readAgentRecord(dir)?.version).toBe(registry.version)
  })

  it('reads releases in order, a release above its prerelease', () => {
    expect(newerRelease('1.0.18', '1.0.17')).toBe(true)
    expect(newerRelease('1.0.17', '1.0.17')).toBe(false)
    expect(newerRelease('1.0.9', '1.0.17')).toBe(false)
    expect(newerRelease('2.0.0', '1.9.9')).toBe(true)
    expect(newerRelease('1.1.0', '1.1.0-next.2')).toBe(true)
    expect(newerRelease('1.1.0-next.10', '1.1.0-next.2')).toBe(true)
    expect(newerRelease('1.1.0-next.1', '1.1.0')).toBe(false)
  })

  it('removes a harness’s files when asked, keeping what another harness reads and what was edited', () => {
    const dir = project()
    expect(agents(dir).code).toBe(0)
    writeFileSync(
      resolve(dir, '.cursor/mcp.json'),
      read(dir, '.cursor/mcp.json').replace('"stdio"', '"stdio", "env": {}'),
    )
    const outcome = agents(dir, ['--remove', 'cursor,claude'])
    expect(outcome.code, outcome.output).toBe(0)
    expect(readAgentRecord(dir)?.harnesses).toEqual(['codex'])
    expect(existsSync(resolve(dir, '.claude'))).toBe(false)
    expect(existsSync(resolve(dir, '.mcp.json'))).toBe(false)
    // Codex reads `.agents/skills/` too, and the Cursor entry was edited.
    expect(existsSync(resolve(dir, '.agents/skills/polymorph-screen/SKILL.md'))).toBe(true)
    expect(outcome.output).toContain('kept yours .cursor/mcp.json')
    // `--force` writes only what the plan still has, so it is not offered for a removed part.
    expect(outcome.output).not.toContain('--force')
    expect(read(dir, 'CLAUDE.md')).toBe('@AGENTS.md\n')
    // A rerun brings back none of them.
    agents(dir)
    expect(existsSync(resolve(dir, '.claude'))).toBe(false)
    expect(agents(dir, ['--remove', 'codex']).code).toBe(2)
    expect(agents(dir, ['--harness', 'claude', '--remove', 'claude']).code).toBe(2)
  })

  it('writes no record through a link out of the project', () => {
    const outside = project()
    const dir = project()
    symlinkSync(outside, resolve(dir, 'polymorph'), 'dir')
    const outcome = agents(dir)
    expect(outcome.code).toBe(1)
    expect(outcome.output).toContain(`refused    ${AGENT_RECORD}`)
    expect(outcome.output).not.toContain('recorded')
    expect(readdirSync(outside)).toEqual([])
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
    const decide = {
      'package.json': '{ "name": "app", "scripts": { "lint": "eslint src" } }\n',
      'package-lock.json': '{}\n',
      'eslint.config.js': freshEslintConfig(),
    }
    const fromInit = project(decide)
    for (const step of written) {
      if (step.kind !== 'write') throw new Error(`${step.path} is not written`)
      mkdirSync(dirname(resolve(fromInit, step.path)), { recursive: true })
      writeFileSync(resolve(fromInit, step.path), step.contents)
    }
    const fromAgents = project(decide)
    expect(agents(fromAgents).code).toBe(0)
    expect(snapshot(fromAgents)).toEqual(snapshot(fromInit))

    const before = snapshot(fromInit)
    const rerun = agents(fromInit)
    expect(rerun.output).toContain('are as polymorph wrote them')
    expect(snapshot(fromInit)).toEqual(before)
  })
})
