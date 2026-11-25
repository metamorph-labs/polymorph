import { spawn } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

import { validate } from '@polymorph/registry/shape'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  claudeProjectArguments,
  codexProjectArguments,
  judgeProject,
  mcpServersOf,
  meterCodexUsage,
  resolveTools,
  screenOf,
  SetupError,
  snapshot,
  skillOfPath,
  skillsIn,
  verbsIn,
  writtenSince,
} from './project.mjs'
import { readResults, renderReport } from './report.mjs'
import { loadRequirements } from './requirements.mjs'
import { RESULTS_SHAPE } from './results-shape'
import { evalRunner } from './running'
import { loadToolbox } from './toolbox.mjs'

/**
 * The agent eval's project lane (`eval/project.mjs`, `docs/verification.md`,
 * "The project lane"), tested with the scripted harnesses: `eval/fake/cli.mjs`
 * for Claude Code and `eval/fake/codex.mjs` for Codex.
 *
 * Every eval here sets its app up with `polymorph init` for real and judges
 * each project with `polymorph check` and the brief's requirements for real.
 * None installs the app's packages: a scripted harness sets its app up
 * uninstalled, and the stand-in eval passes `--no-install`, so no run here
 * typechecks or builds, and the test needs no network. The judge's typecheck
 * and build are tested apart, on a fixture project whose `typecheck` and
 * `build` scripts are stubs.
 *
 * Four runs of one brief play the four ways a harness can leave a project: a
 * lawful screen that meets its brief, an unlawful module, nothing at all, and
 * a run past the turn budget (`eval/fake/settings-workspace.project*.json`).
 */

const ROOT = resolve(import.meta.dirname, '..')
const SCRATCH = mkdtempSync(resolve(tmpdir(), 'polymorph-eval-project-test-'))
const FAKE_CLI = resolve(ROOT, 'eval/fake/cli.mjs')
const SETTINGS = ['--briefs', 'eval/briefs/settings-workspace.md']
const CHECKOUT_BIN = resolve(ROOT, 'packages/cli/bin/polymorph.js')
const SERVER_BIN = resolve(ROOT, 'packages/mcp/bin/polymorph-mcp.js')

/** Every eval this file starts, a few at a time; any still running when the file ends is stopped. */
const runner = evalRunner(ROOT)

interface ProjectRecord {
  brief: string
  run: number
  lawful: boolean
  violations: string[]
  builds: boolean | null
  buildFault: string | null
  meetsBrief: boolean | null
  failedRequirements: string[]
  screen: { kind: string; files: string[] } | null
  written: string[]
  ended: string
  harnessFault: string | null
  inputTokens: number | null
  cacheReadTokens: number | null
  cacheWriteTokens: number | null
  outputTokens: number | null
  wallMs: number
  turns: number | null
  mcpCalls: Record<string, number>
  verbs: Record<string, number>
  shellCommands: number
  skills: string[]
  denied: number | null
  retries: number | null
}

interface ProjectResults {
  at: string
  model: string
  mode: string
  runner: string
  cliVersion: string
  fake: boolean
  partial: boolean
  stopped: unknown
  briefs: string[]
  settings: Record<string, unknown>
  project: {
    tools: { from: string; path: string; version: string | null }
    installed: boolean
    agents: { ran: boolean; said: string }
    mcpServers: string[]
  }
  outputs: string
  summary: { overall: Record<string, unknown>; briefs: Record<string, unknown>[] }
  records: ProjectRecord[]
}

interface Evaluation {
  directory: string
  file: string
  code: number
  stderr: string
  results: ProjectResults
  outputs: {
    outputs: {
      brief: string
      run: number
      document: { answer: string | null; files: Record<string, string> }
    }[]
  }
  readme: string
}

/** One `eval/run.mjs` run into its own scratch directory, and what it wrote. */
async function evaluate(name: string, args: string[], env: NodeJS.ProcessEnv = {}) {
  const directory = resolve(SCRATCH, name)
  const { code, stderr } = await runner.run([...args, '--out', directory], env)
  const file = readdirSync(directory).find(
    (entry) => entry.endsWith('.json') && !entry.endsWith('.outputs.json'),
  )
  if (file === undefined) throw new Error(`${name} wrote no results:\n${stderr}`)
  const results = JSON.parse(readFileSync(resolve(directory, file), 'utf8')) as ProjectResults
  return {
    directory,
    file,
    code,
    stderr,
    results,
    outputs: JSON.parse(readFileSync(resolve(directory, results.outputs), 'utf8')),
    readme: readFileSync(resolve(directory, 'README.md'), 'utf8'),
  } as Evaluation
}

/**
 * A tools directory whose `polymorph` has the `agents` verb: it writes each
 * harness's MCP entry and a skill, and hands every other verb to this
 * checkout's bin. The lane runs the verb when the tools have it and goes on
 * without it when they do not; this fixture is the first case.
 */
function toolsWithAgents() {
  const directory = resolve(SCRATCH, 'tools-with-agents')
  mkdirSync(directory, { recursive: true })
  writeFileSync(
    resolve(directory, 'package.json'),
    JSON.stringify({
      name: 'tools-with-agents',
      version: '0.0.0-test',
      type: 'module',
      bin: { polymorph: './polymorph.js' },
    }),
  )
  const skill =
    '---\nname: polymorph\ndescription: Build screens with polymorph.\n---\n\nWrite specs.\n'
  const lines = [
    "import { spawnSync } from 'node:child_process'",
    "import { mkdirSync, writeFileSync } from 'node:fs'",
    'const [verb, ...rest] = process.argv.slice(2)',
    "if (verb === 'agents') {",
    "  const harness = rest[rest.indexOf('--harness') + 1]",
    "  const skills = harness === 'codex' ? '.agents/skills/polymorph' : '.claude/skills/polymorph'",
    '  mkdirSync(skills, { recursive: true })',
    `  writeFileSync(skills + '/SKILL.md', ${JSON.stringify(skill)})`,
    "  if (harness === 'codex') {",
    "    mkdirSync('.codex', { recursive: true })",
    "    writeFileSync('.codex/config.toml', " +
      JSON.stringify(
        `[mcp_servers.polymorph]\ncommand = "node"\nargs = [${JSON.stringify(SERVER_BIN)}, "--project", "."]\n`,
      ) +
      ')',
    '  }',
    "  console.log('wrote the skill and the MCP entry for ' + harness)",
    '  process.exit(0)',
    '}',
    `const ran = spawnSync(process.execPath, [${JSON.stringify(CHECKOUT_BIN)}, ...process.argv.slice(2)], { stdio: 'inherit' })`,
    'process.exit(ran.status ?? 1)',
  ]
  writeFileSync(resolve(directory, 'polymorph.js'), `${lines.join('\n')}\n`)
  return directory
}

const STAND_IN = resolve(SCRATCH, 'claude')

/**
 * What `--claude` starts in place of the owner's Claude Code: a shell script
 * that keeps its arguments and the request on its stdin, then hands over to
 * `eval/fake/cli.mjs` with `script`.
 */
function standIn(script: object) {
  mkdirSync(STAND_IN, { recursive: true })
  writeFileSync(resolve(STAND_IN, 'run.json'), JSON.stringify(script))
  const node = process.execPath
  const file = resolve(STAND_IN, 'claude')
  const lines = [
    '#!/bin/sh',
    `if [ "$1" = "--version" ]; then exec '${node}' '${FAKE_CLI}' --version; fi`,
    `printf '%s\\0' "$@" > '${STAND_IN}/args'`,
    `cat > '${STAND_IN}/stdin'`,
    `exec '${node}' '${FAKE_CLI}' --script '${STAND_IN}/run.json' "$@" < '${STAND_IN}/stdin'`,
  ]
  writeFileSync(file, `${lines.join('\n')}\n`, { mode: 0o755 })
  return file
}

const runs: Record<string, Evaluation> = {}
const LANE = ['--fake', '--mode', 'project', ...SETTINGS]

// The four runs through each stand-in. The evals of the later sections have setups of their own.
beforeAll(async () => {
  const [cli, codex] = await Promise.all([
    evaluate('cli', [...LANE, '--runner', 'cli', '--runs', '4', '--max-turns', '8']),
    evaluate('codex', [...LANE, '--runner', 'codex', '--runs', '4', '--max-turns', '8']),
  ])
  Object.assign(runs, { cli, codex })
}, 120_000)

afterAll(() => {
  runner.stopAll()
  rmSync(SCRATCH, { recursive: true, force: true })
})

const record = (evaluation: Evaluation, run: number) =>
  evaluation.results.records.find((entry) => entry.run === run) as ProjectRecord

const SETTINGS_REQUIREMENTS = [
  'four-sections',
  'settings-described',
  'name-field',
  'two-switches',
  'two-choices',
  'delete-asks-first',
  'confirmation-names-the-workspace',
]

/* -------------------------------------------------------------------------- */
/* The four runs                                                              */
/* -------------------------------------------------------------------------- */

describe('the project lane, with the scripted harnesses', () => {
  for (const harness of ['cli', 'codex'] as const) {
    describe(`through the ${harness} runner`, () => {
      const evaluation = () => runs[harness] as Evaluation

      it('judges a lawful screen that meets its brief, and what the harness called', () => {
        const lawful = record(evaluation(), 1)
        expect(lawful).toMatchObject({
          lawful: true,
          violations: [],
          builds: null,
          meetsBrief: true,
          failedRequirements: [],
          screen: { kind: 'spec', files: ['src/screens/settings-workspace.json'] },
          ended: 'answered',
          harnessFault: null,
          // Through either harness: the script's usage, cached and uncached together.
          inputTokens: 65_700,
          cacheReadTokens: 50_200,
          cacheWriteTokens: 11_300,
          outputTokens: 2_760,
          mcpCalls: { emit_screen: 1, get_system_card: 1 },
          verbs: { check: 1 },
          denied: 0,
        })
        // Codex looks for a skill by reading its file in the shell; Claude Code calls `Skill`.
        expect(lawful.shellCommands).toBe(harness === 'cli' ? 2 : 3)
        // The scripted harness loads no skill, though `agents` wrote them.
        expect(lawful.skills).toEqual([])
        expect(lawful.turns).toBe(harness === 'cli' ? 6 : null)
        // Claude Code reports its retries; Codex reports none.
        expect(lawful.retries).toBe(harness === 'cli' ? 0 : null)
        // Each harness has the project's MCP server, which `agents` configured, and emits the screen.
        expect(lawful.written).toEqual([
          'src/screens/WorkspaceSettings.tsx',
          'src/screens/settings-workspace.json',
        ])
      })

      it('judges an unlawful module, in the words of the check', () => {
        const unlawful = record(evaluation(), 2)
        expect(unlawful).toMatchObject({
          lawful: false,
          meetsBrief: false,
          screen: { kind: 'tsx', files: ['src/screens/Settings.tsx'] },
          ended: 'answered',
        })
        expect(unlawful.violations).toEqual(
          expect.arrayContaining([
            expect.stringContaining('src/screens/Settings.tsx: polymorph/no-raw-interactive'),
            expect.stringContaining('src/screens/Settings.tsx: polymorph/no-raw-styles'),
          ]),
        )
      })

      it('judges a project the harness left as it was: lawful, with no screen', () => {
        expect(record(evaluation(), 3)).toMatchObject({
          lawful: true,
          meetsBrief: false,
          failedRequirements: SETTINGS_REQUIREMENTS,
          screen: null,
          written: [],
          ended: 'answered',
        })
      })

      it('stops a harness at its turn budget, and judges what it left', () => {
        const stopped = record(evaluation(), 4)
        expect(stopped).toMatchObject({ ended: 'turns', lawful: true, written: [] })
        if (harness === 'cli') {
          // Claude Code reports what it refused in its result, which a stopped run never reaches.
          expect(stopped).toMatchObject({
            turns: 8,
            inputTokens: 8_000,
            shellCommands: 8,
            denied: null,
          })
        } else {
          // Codex reports its tokens when its turn ends, and the budget stopped it first.
          expect(stopped).toMatchObject({ turns: null, inputTokens: null, outputTokens: null })
          expect(stopped.shellCommands).toBe(8)
        }
      })

      it('summarises each rate over the runs judged for it', () => {
        const { overall } = evaluation().results.summary
        expect(overall).toMatchObject({
          runs: 4,
          measured: 4,
          endings: { answered: 3, turns: 1, time: 0, harness: 0 },
          lawfulRate: 0.75,
          lawfulMeasured: 4,
          // Not installed, so no run was built.
          buildsRate: null,
          buildsMeasured: 0,
          meetsBriefRate: 0.25,
          meetsBriefMeasured: 4,
          allThreeRate: null,
          allThreeMeasured: 0,
          mcpCalls: { emit_screen: 1, get_system_card: 1 },
          verbs: { check: 1 },
        })
      })

      it('records the harness, the tools and how the app was set up', () => {
        const { results, file } = evaluation()
        expect(file).toBe(`${results.at.slice(0, 10)}-fake-project-${harness}.json`)
        expect(results).toMatchObject({
          mode: 'project',
          runner: harness,
          cliVersion: 'scripted',
          settings: { framework: 'react', maxTurns: 8, maxMinutes: 20 },
          project: {
            tools: {
              from: 'checkout',
              path: CHECKOUT_BIN,
              version: JSON.parse(readFileSync(resolve(ROOT, 'packages/cli/package.json'), 'utf8'))
                .version,
            },
            installed: false,
            // The checkout's tools have the verb, so `agents --harness <name>` ran.
            agents: { ran: true },
            // `.mcp.json` for Claude Code, and `.codex/config.toml` for Codex, which runs trusted.
            mcpServers: ['polymorph'],
          },
        })
        expect(validate(RESULTS_SHAPE, results)).toEqual([])
      })

      it('keeps the files the harness wrote, and its last message, beside the results', () => {
        const [first] = evaluation().outputs.outputs
        expect(first?.document.answer).toContain('src/screens/settings-workspace.json')
        expect(
          JSON.parse(first?.document.files['src/screens/settings-workspace.json'] ?? ''),
        ).toEqual(
          JSON.parse(
            readFileSync(resolve(ROOT, 'eval/fake/settings-workspace/answer.json'), 'utf8'),
          ),
        )
      })
    })
  }
})

describe('the project lane, with tools that have the `agents` verb', () => {
  beforeAll(async () => {
    runs.codexTools = await evaluate('codex-tools', [
      ...LANE,
      ...['--runner', 'codex', '--tools', toolsWithAgents()],
    ])
  }, 90_000)

  it('runs the verb, and the harness finds the MCP server and the skill it wrote', () => {
    const { results } = runs.codexTools as Evaluation
    expect(results.project).toMatchObject({
      tools: { from: 'directory', version: '0.0.0-test' },
      agents: { ran: true, said: 'wrote the skill and the MCP entry for codex' },
      mcpServers: ['polymorph'],
    })
    expect(results.project.tools.path).toMatch(/tools-with-agents\/polymorph\.js$/)
    // Codex now has the project's server, so the screen is emitted, and it loads the skill.
    expect(results.records[0]).toMatchObject({
      lawful: true,
      meetsBrief: true,
      skills: ['polymorph'],
      mcpCalls: { emit_screen: 1, get_system_card: 1 },
      written: ['src/screens/WorkspaceSettings.tsx', 'src/screens/settings-workspace.json'],
    })
  })
})

describe('the project lane, through a stand-in for the owner’s Claude Code', () => {
  // A harness that is still connecting when its time runs out.
  beforeAll(async () => {
    runs.timed = await evaluate(
      'timed',
      [
        ...['--runner', 'cli', '--claude', standIn({ project: true, turns: [{ delay: 60_000 }] })],
        ...['--mode', 'project', '--no-install', '--max-minutes', '0.02', ...SETTINGS],
        ...['--model', 'local-model', '--effort', 'high'],
      ],
      { ANTHROPIC_API_KEY: '' },
    )
  }, 90_000)

  it('stops a harness at its time budget, and judges what it left', () => {
    const { results, code } = runs.timed as Evaluation
    expect(code).toBe(0)
    expect(results.records[0]).toMatchObject({ ended: 'time', lawful: true, written: [] })
    expect(results.settings).toMatchObject({ maxMinutes: 0.02, effort: 'high' })
    expect(results.project.installed).toBe(false)
  })

  it('gives Claude Code the brief as its request, and nothing of the eval’s', () => {
    const args = readFileSync(resolve(STAND_IN, 'args'), 'utf8').split('\0')
    const after = (flag: string) => args[args.indexOf(flag) + 1]
    expect(after('--model')).toBe('local-model')
    expect(after('--effort')).toBe('high')
    expect(after('--setting-sources')).toBe('project')
    expect(after('--permission-mode')).toBe('acceptEdits')
    expect(after('--permission-prompts')).toBe('none')
    // No `Bash` permission: the sandbox lets its commands run, and nothing outside it.
    expect(after('--allowedTools')).toBe('Skill,mcp__polymorph')
    expect(after('--mcp-config')).toMatch(/\/app\/\.mcp\.json$/)
    const settings = JSON.parse(after('--settings') ?? '') as {
      sandbox: {
        enabled: boolean
        failIfUnavailable: boolean
        allowUnsandboxedCommands: boolean
        filesystem: { allowWrite: string[]; denyWrite: string[] }
        network: { allowedDomains: string[] }
      }
      permissions: { blockWritesOutsideWorkingDirectories: boolean }
    }
    expect(settings.sandbox).toMatchObject({
      enabled: true,
      failIfUnavailable: true,
      allowUnsandboxedCommands: false,
      network: {
        allowedDomains: [
          'registry.npmjs.org',
          'npm.pkg.github.com',
          'pkg-npm.githubusercontent.com',
        ],
      },
    })
    // The eval's npm cache and pnpm store may be written, and the template every run copies may not.
    expect(settings.sandbox.filesystem.allowWrite.map((path) => path.split('/').at(-1))).toEqual([
      'npm-cache',
      'pnpm-store',
    ])
    expect(settings.sandbox.filesystem.denyWrite).toEqual([
      expect.stringMatching(/polymorph-eval-project-[^/]+\/template$/),
    ])
    expect(settings.permissions.blockWritesOutsideWorkingDirectories).toBe(true)
    for (const flag of ['--system-prompt', '--tools', '--disable-slash-commands']) {
      expect(args).not.toContain(flag)
    }
    const request = readFileSync(resolve(STAND_IN, 'stdin'), 'utf8')
    expect(request).toBe(
      `${readFileSync(resolve(ROOT, 'eval/briefs/settings-workspace.md'), 'utf8').trim()}\n\n` +
        'Build the screen the brief describes, in this app.',
    )
  })
})

/* -------------------------------------------------------------------------- */
/* Refusals                                                                   */
/* -------------------------------------------------------------------------- */

describe('the project lane refuses to start', () => {
  const refusal = (args: string[]) => runner.run(args).then((ran) => (ran.code === 0 ? null : ran))

  it('with the `api` runner, or a flag that bounds the eval’s own tools', async () => {
    expect((await refusal(['--fake', '--mode', 'project']))?.stderr).toContain(
      'the `api` runner is no harness',
    )
    expect(
      (await refusal(['--fake', '--mode', 'project', '--runner', 'cli', '--max-iterations', '2']))
        ?.stderr,
    ).toContain('`--max-turns` and `--max-minutes` bound its runs')
  })

  it('with a flag of the lane in another mode', async () => {
    for (const flag of [
      ['--tools', '.'],
      ['--max-turns', '3'],
      ['--max-minutes', '2'],
      ['--no-install'],
    ]) {
      expect((await refusal(['--fake', ...flag]))?.stderr, flag[0]).toContain(
        `\`${flag[0]}\` belongs to the project lane`,
      )
    }
  })

  // The eval builds the registry before it sets the app up, which takes longer than a test's
  // default time under load.
  it('with tools that are not there', async () => {
    const failure = await refusal([
      ...['--fake', '--mode', 'project', '--runner', 'cli', ...SETTINGS],
      ...['--tools', resolve(SCRATCH, 'no-such-tools')],
    ])
    expect(failure?.stderr).toContain('which does not exist')
  }, 60_000)
})

/* -------------------------------------------------------------------------- */
/* The pieces                                                                 */
/* -------------------------------------------------------------------------- */

describe('reading what a harness called', () => {
  it('finds the `polymorph` verbs a shell command runs, however it starts the CLI', () => {
    const cases: [string, string[]][] = [
      ['npx -y @metamorph-labs/polymorph@^1.0.17 card --json', ['card']],
      ["bash -lc 'npx -y @metamorph-labs/polymorph@latest search table'", ['search']],
      ['pnpm polymorph check src', ['check']],
      [
        'node /x/packages/cli/bin/polymorph.js validate a.json && polymorph emit a.json A.tsx',
        ['validate', 'emit'],
      ],
      ['npx -y @metamorph-labs/polymorph@^1 --json component Button', ['component']],
      ['node /x/packages/mcp/bin/polymorph-mcp.js --project .', ['mcp']],
      ['cat polymorph/system-card.md', []],
      ['cd polymorph && ls', []],
      ['npx polymorphic-thing build', []],
    ]
    for (const [command, verbs] of cases) expect(verbsIn(command), command).toEqual(verbs)
  })

  it('finds the skill a path or a command reads', () => {
    expect(skillsIn("bash -lc 'cat .agents/skills/polymorph/SKILL.md'")).toEqual(['polymorph'])
    expect(skillOfPath('/app/.claude/skills/screens/SKILL.md')).toBe('screens')
    expect(skillOfPath('/app/AGENTS.md')).toBeNull()
  })

  it('reads the MCP servers a project configures for each harness', () => {
    const dir = resolve(SCRATCH, 'servers')
    mkdirSync(resolve(dir, '.codex'), { recursive: true })
    writeFileSync(
      resolve(dir, '.mcp.json'),
      JSON.stringify({ mcpServers: { polymorph: {}, other: {} } }),
    )
    writeFileSync(
      resolve(dir, '.codex/config.toml'),
      'model = "x"\n[mcp_servers.polymorph]\ncommand = "node"\n[mcp_servers."docs"]\nurl = "https://x"\n[profiles.a]\n',
    )
    expect(mcpServersOf(dir, 'cli')).toEqual(['other', 'polymorph'])
    expect(mcpServersOf(dir, 'codex')).toEqual(['docs', 'polymorph'])
    expect(mcpServersOf(resolve(SCRATCH, 'nowhere'), 'codex')).toEqual([])
  })

  it('meters Codex’s usage with the uncached input apart, and nothing when it reports none', () => {
    const meter = { input: 0, cacheRead: 0, cacheWrite: 0, output: 0, reported: false } as Record<
      string,
      unknown
    >
    meterCodexUsage(meter, {
      input_tokens: 1000,
      cached_input_tokens: 600,
      cache_write_input_tokens: 100,
      output_tokens: 50,
    })
    expect(meter).toEqual({
      input: 300,
      cacheRead: 600,
      cacheWrite: 100,
      output: 50,
      reported: true,
      cacheWriteReported: true,
    })
    const older = { input: 0, cacheRead: 0, cacheWrite: 0, output: 0, reported: false } as Record<
      string,
      unknown
    >
    meterCodexUsage(older, { input_tokens: 1000, cached_input_tokens: 600, output_tokens: 50 })
    expect(older).toMatchObject({ input: 400, cacheWriteReported: false })
    const none = { input: 0, reported: false } as Record<string, unknown>
    meterCodexUsage(none, {})
    expect(none).toEqual({ input: 0, reported: false })
  })
})

describe('choosing what is judged', () => {
  /** The text each written file holds, for the files whose text decides. */
  const texts: Record<string, string> = {
    'src/app/settings.component.ts': "@Component({ selector: 'app-settings', template: '' })",
    'src/lib/format.ts': 'export const format = (value: number) => `${value}`',
    'public/settings.html': '<poly-page><poly-heading>Settings</poly-heading></poly-page>',
    'public/notes.html': '<p>Notes</p>',
  }
  const read = (path: string) => texts[path] ?? ''

  it('judges the specs a harness wrote, or else its modules, or else says it cannot', () => {
    expect(screenOf(['src/screens/a.json', 'src/screens/A.tsx', 'src/App.tsx'], read)).toEqual({
      kind: 'spec',
      files: ['src/screens/a.json'],
    })
    expect(screenOf(['src/App.tsx', 'src/screens/A.tsx', 'src/vite-env.d.ts'], read)).toEqual({
      kind: 'tsx',
      files: ['src/App.tsx', 'src/screens/A.tsx'],
    })
    expect(screenOf(['src/screens/A.vue'], read)).toEqual({
      kind: 'unread',
      files: ['src/screens/A.vue'],
    })
    expect(screenOf(['src/app/settings.component.ts', 'src/lib/format.ts'], read)).toEqual({
      kind: 'unread',
      files: ['src/app/settings.component.ts'],
    })
    expect(screenOf(['public/settings.html', 'public/notes.html'], read)).toEqual({
      kind: 'unread',
      files: ['public/settings.html'],
    })
  })

  it('finds no screen in files that hold none, so the brief is not met', () => {
    expect(screenOf(['AGENTS.md', '.claude/settings.json'], read)).toBeNull()
    // A helper module in a React app is no screen the requirements cannot read: it is no screen.
    expect(screenOf(['src/lib/format.ts', 'public/notes.html'], read)).toBeNull()
  })

  it('leaves out the caches and output a build writes', () => {
    const dir = resolve(SCRATCH, 'caches')
    const write = (path: string) => {
      mkdirSync(resolve(dir, path, '..'), { recursive: true })
      writeFileSync(resolve(dir, path), 'x')
    }
    write('src/App.tsx')
    const before = snapshot(dir)
    for (const path of [
      'dist/index.html',
      '.angular/cache/a.json',
      'node_modules/.vite/deps/a.js',
      'build/out.js',
      'tsconfig.tsbuildinfo',
      '.eslintcache',
      'src/screens/settings.json',
    ]) {
      write(path)
    }
    expect(writtenSince(before, dir)).toEqual(['src/screens/settings.json'])
  })
})

describe('the tools', () => {
  it('are this checkout’s bin when none are named, or the bin a directory declares', () => {
    expect(resolveTools(undefined, { scratch: SCRATCH })).toMatchObject({
      from: 'checkout',
      path: CHECKOUT_BIN,
    })
    expect(resolveTools('packages/cli', { scratch: SCRATCH, cwd: ROOT })).toMatchObject({
      from: 'directory',
      path: CHECKOUT_BIN,
      command: [process.execPath, CHECKOUT_BIN],
    })
  })

  it('are refused when they hold no bin, or are neither a directory nor a tarball', () => {
    const empty = resolve(SCRATCH, 'empty-tools')
    mkdirSync(empty, { recursive: true })
    expect(() => resolveTools(empty, { scratch: SCRATCH })).toThrow(SetupError)
    expect(() => resolveTools(resolve(ROOT, 'package.json'), { scratch: SCRATCH })).toThrow(
      'a packed tarball',
    )
  })
})

describe('the arguments a harness is started with in a project', () => {
  const settings = { fake: false, model: 'local-model', effort: 'high' }

  it('give Claude Code the project’s servers and settings, and none of the owner’s', () => {
    const args = claudeProjectArguments({
      settings,
      config: '/app/.mcp.json',
      servers: ['a', 'b'],
      sandbox: { allowWrite: ['/scratch/npm-cache'], denyWrite: ['/scratch/template'] },
    })
    expect(args).toEqual(
      expect.arrayContaining([
        '--setting-sources',
        'project',
        '--strict-mcp-config',
        '--permission-prompts',
        'none',
      ]),
    )
    expect(args[args.indexOf('--allowedTools') + 1]).toBe('Skill,mcp__a,mcp__b')
    expect(JSON.parse(args[args.indexOf('--settings') + 1] ?? '')).toMatchObject({
      sandbox: {
        enabled: true,
        filesystem: { allowWrite: ['/scratch/npm-cache'], denyWrite: ['/scratch/template'] },
      },
    })
  })

  it('trust the project for Codex, approve its servers and turn the owner’s skills off', () => {
    const args = codexProjectArguments({
      settings,
      servers: ['polymorph'],
      skills: ['/home/me/.agents/skills/mine/SKILL.md'],
    })
    expect(args).toEqual(expect.arrayContaining(['--trust', '--sandbox', 'workspace-write']))
    expect(args).toContain('mcp_servers.polymorph.default_tools_approval_mode="approve"')
    expect(args).toContain(
      'skills.config=[{ path = "/home/me/.agents/skills/mine/SKILL.md", enabled = false }]',
    )
    expect(args).toContain('model_reasoning_effort="high"')
    expect(args.at(-1)).toBe('-')
  })
})

describe('the judge', () => {
  /** A project with a lawful spec and stub scripts: the typecheck passes, and the build as `build` says. */
  function fixture(name: string, build: string) {
    const dir = resolve(SCRATCH, name)
    mkdirSync(resolve(dir, 'src/screens'), { recursive: true })
    writeFileSync(
      resolve(dir, 'package.json'),
      JSON.stringify({
        name,
        private: true,
        scripts: { typecheck: 'node -e "process.exit(0)"', build },
      }),
    )
    writeFileSync(
      resolve(dir, 'src/screens/settings.json'),
      readFileSync(resolve(ROOT, 'eval/fake/settings-workspace/answer.json'), 'utf8'),
    )
    return dir
  }

  it('runs the typecheck and the build of an installed app, and says which failed', async () => {
    const toolbox = await loadToolbox()
    const required = loadRequirements({
      registry: toolbox.registry,
      shapes: toolbox.requirementShapes,
    }) as Map<string, { requirements: { id: string }[] }>
    const requirements = required.get('settings-workspace')?.requirements ?? []
    const tools = resolveTools(undefined, { scratch: SCRATCH })
    const judge = (dir: string, installed: boolean) =>
      judgeProject({
        dir,
        tools,
        toolbox,
        requirements,
        written: ['src/screens/settings.json'],
        installed,
      })

    const broken = await judge(
      fixture('broken', `node -e "console.error('the build broke'); process.exit(1)"`),
      true,
    )
    expect(broken).toMatchObject({ lawful: true, builds: false, meetsBrief: true })
    expect(broken.buildFault).toContain('`build` failed')
    expect(broken.buildFault).toContain('the build broke')

    const built = await judge(fixture('built', 'node -e "process.exit(0)"'), true)
    expect(built).toMatchObject({ lawful: true, builds: true, buildFault: null })

    const uninstalled = await judge(fixture('uninstalled', 'node -e "process.exit(1)"'), false)
    expect(uninstalled).toMatchObject({ builds: null, buildFault: null })

    // A `package.json` the harness broke is its work: the run counts, unlawful and unbuilt.
    const unreadable = fixture('unreadable', 'node -e "process.exit(0)"')
    writeFileSync(resolve(unreadable, 'package.json'), '{ "name": "unreadable", ')
    const judged = await judge(unreadable, true)
    expect(judged).toMatchObject({ lawful: false, builds: false, meetsBrief: true })
    expect(judged.buildFault).toContain('`package.json` cannot be read')
    expect(judged.violations).toEqual([expect.stringContaining('package.json: it cannot be read')])
  }, 120_000)
})

/* -------------------------------------------------------------------------- */
/* A signal                                                                   */
/* -------------------------------------------------------------------------- */

describe('a signal to the eval', () => {
  /** Whether a process is still running. */
  const running = (pid: number) => {
    try {
      process.kill(pid, 0)
      return true
    } catch {
      return false
    }
  }

  /** What `read` gives once it gives something, checked every tenth of a second. */
  async function until<T>(read: () => T | undefined, ms: number): Promise<T> {
    for (const ends = Date.now() + ms; Date.now() < ends;) {
      const value = read()
      if (value !== undefined) return value
      await new Promise((done) => setTimeout(done, 100))
    }
    throw new Error('it never came')
  }

  it('stops the harness group, removes the template and the run, and exits non-zero', async () => {
    const directory = resolve(SCRATCH, 'signalled')
    // The eval's scratch directories go where `TMPDIR` says, so the test can see they are gone.
    const temporary = resolve(directory, 'tmp')
    const files = resolve(directory, 'harness-files')
    mkdirSync(temporary, { recursive: true })
    mkdirSync(files, { recursive: true })
    const harness = resolve(files, 'claude')
    writeFileSync(
      harness,
      [
        '#!/bin/sh',
        `if [ "$1" = "--version" ]; then echo '9.9.9 (Claude Code)'; exit 0; fi`,
        `echo $$ > '${files}/pid'`,
        // A command of the harness's own, in its group, which must stop with it.
        `sleep 60 & echo $! > '${files}/child'`,
        'exec sleep 60',
      ].join('\n') + '\n',
      { mode: 0o755 },
    )
    const child = spawn(
      process.execPath,
      [
        ...['eval/run.mjs', '--mode', 'project', '--runner', 'cli', '--claude', harness],
        ...['--model', 'local-model', '--no-install', ...SETTINGS],
        ...['--out', resolve(directory, 'out')],
      ],
      {
        cwd: ROOT,
        env: { ...process.env, TMPDIR: temporary, ANTHROPIC_API_KEY: '' },
        stdio: 'ignore',
      },
    )
    const exited = new Promise<number | null>((done) => child.on('close', (code) => done(code)))
    try {
      const pidOf = (name: string) => {
        const file = resolve(files, name)
        return existsSync(file) ? Number(readFileSync(file, 'utf8')) || undefined : undefined
      }
      // `init` sets the template up first, which takes a while.
      const pid = await until(() => pidOf('pid'), 90_000)
      const left = await until(() => pidOf('child'), 5_000)
      expect(running(pid)).toBe(true)
      child.kill('SIGINT')
      expect(await exited).toBe(130)
      await until(() => (running(pid) || running(left) ? undefined : true), 5_000)
      expect(readdirSync(temporary).filter((entry) => entry.startsWith('polymorph-eval-'))).toEqual(
        [],
      )
    } finally {
      child.kill('SIGKILL')
    }
  }, 120_000)
})

/* -------------------------------------------------------------------------- */
/* The report                                                                 */
/* -------------------------------------------------------------------------- */

describe('the report', () => {
  it('gives the project lane a section of its own, and names no number from a scripted run', () => {
    const { readme } = runs.cli as Evaluation
    expect(readme).toContain('## The project lane')
    expect(readme).toContain('No project number is recorded')
    expect(readme).toContain('### fake (scripted model')
    expect(readme).toMatch(
      /\| CLI scripted \| default \| react, not installed \| .* \| ran \| 1 of 8 × 4 \| 75% /,
    )
    expect(readme).toContain(
      'MCP tools emit_screen 1, get_system_card 1; `polymorph` verbs check 1',
    )
    expect(readme).toContain('Projects that did not end lawful, in the words of the check:')
  })

  it('names the latest full real run as the project number, with each rate’s runs', () => {
    const directory = resolve(SCRATCH, 'real')
    mkdirSync(directory)
    const { results } = runs.codex as Evaluation
    writeFileSync(
      resolve(directory, '2026-01-01-gpt-codex-project-codex.json'),
      JSON.stringify({
        ...results,
        fake: false,
        model: 'gpt-codex',
        cliVersion: '0.98.0',
        briefs: ['settings-workspace'],
      }),
    )
    const page = renderReport(readResults(directory), resolve(directory, 'README.md'))
    expect(page).toContain(
      '**The project number:** `gpt-codex`, Codex’s default effort, through Codex 0.98.0, a react ' +
        'app set up by the tools',
    )
    expect(page).toContain(
      '75% end lawful (30% to 95%, 4 runs), 25% meet their brief (5% to 70%, 4 runs)',
    )
    expect(page).toContain('1 stopped at the turn budget, 4 were not built')
    expect(existsSync(resolve(directory, 'README.md'))).toBe(false)
  })
})
