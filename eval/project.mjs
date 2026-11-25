import { spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  constants,
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, extname, relative, resolve, sep } from 'node:path'
import { createInterface } from 'node:readline'
import { clearTimeout, setTimeout } from 'node:timers'

import {
  claudeEnvironment,
  claudeHome,
  codexEnvironment,
  codexHome,
  HarnessError,
  LIMIT_WORDS,
  override,
  tail,
  track,
  trustProject,
} from './harnesses.mjs'
import { unmetAcross } from './requirements.mjs'
import { interval } from './spread.mjs'
import { messageOf, ROOT } from './toolbox.mjs'

/**
 * The project lane (`pnpm eval --mode project`): a harness, Claude Code or
 * Codex, started in a real polymorph app with only what the tools wrote there,
 * given the brief as an ordinary request, and judged on the project it leaves
 * (`docs/verification.md`, "The project lane").
 *
 * Once per eval, the lane sets a template up with the tools it was given:
 * `polymorph init`, the install `init` runs, and `polymorph agents` when the
 * tools have that verb. Each run copies the template, starts the harness in
 * the copy with the brief on stdin and no prompt or tool of the eval's, stops
 * it at its turn or time budget, and judges what the copy holds at the end:
 * the red rules over it (`polymorph check --json`), the specs the harness
 * wrote, the app's typecheck and build, and the brief's requirements.
 */

/**
 * The directories a project's snapshot leaves out: installed packages, a
 * build's output, the caches the frameworks' tools write, and history. A
 * harness that builds the app writes them, and they hold no screen.
 */
const UNWATCHED = new Set([
  'node_modules',
  'dist',
  'build',
  'out',
  'coverage',
  '.git',
  '.vite',
  '.angular',
  '.svelte-kit',
  '.cache',
  '.turbo',
])

/** Files a tool writes as a cache, which the snapshot leaves out wherever they are. */
const CACHE_FILE = /(?:\.tsbuildinfo|^\.eslintcache|^\.stylelintcache)$/

/** Each judged file's text is kept in the outputs file up to this many characters. */
const KEPT_CHARACTERS = 200_000

/** A run's violations are kept up to this many. */
const KEPT_VIOLATIONS = 20

/** A message kept in a record, cut so a results file stays readable. */
const clip = (text) => (text.length > 600 ? `${text.slice(0, 597)}...` : text)

/* -------------------------------------------------------------------------- */
/* The tools                                                                  */
/* -------------------------------------------------------------------------- */

/** The tools could not set the app up. The eval stops before any run, and says why. */
export class SetupError extends Error {}

/** The version a `package.json` names, or null. */
function versionIn(file) {
  try {
    const version = JSON.parse(readFileSync(file, 'utf8')).version
    return typeof version === 'string' ? version : null
  } catch {
    return null
  }
}

/** The `polymorph` bin a package directory declares, as an absolute path, or null. */
function binOf(directory) {
  const manifest = resolve(directory, 'package.json')
  if (!existsSync(manifest)) return null
  const { bin, name } = JSON.parse(readFileSync(manifest, 'utf8'))
  const declared =
    typeof bin === 'string' ? (name?.endsWith('polymorph') ? bin : null) : bin?.polymorph
  return typeof declared === 'string' ? resolve(directory, declared) : null
}

/**
 * The tools the lane sets each app up with, and how to run their `polymorph`:
 *
 * - none given: this checkout's bin (`packages/cli/bin/polymorph.js`), which
 *   is what a test uses;
 * - a directory: the `polymorph` bin its `package.json` declares, its
 *   `bin/polymorph.js`, or a `polymorph` file in it;
 * - a packed tarball (`.tgz`): installed once with npm into `scratch`, whose
 *   `polymorph` bin is then run. npm fetches the tarball's dependencies.
 */
export function resolveTools(given, { scratch, cwd = process.cwd() }) {
  if (given === undefined) {
    const bin = resolve(ROOT, 'packages/cli/bin/polymorph.js')
    return {
      from: 'checkout',
      path: bin,
      command: [process.execPath, bin],
      version: versionIn(resolve(ROOT, 'packages/cli/package.json')),
    }
  }
  const path = resolve(cwd, given)
  if (!existsSync(path)) throw new SetupError(`\`--tools\` names ${path}, which does not exist`)
  if (/\.(?:tgz|tar\.gz)$/.test(path)) return installTarball(path, scratch)
  if (!statSync(path).isDirectory()) {
    throw new SetupError('`--tools` names a packed tarball (`.tgz`) or a directory holding a bin')
  }
  const declared = binOf(path)
  if (declared !== null && !existsSync(declared)) {
    throw new SetupError(
      `\`--tools\` names ${path}, whose \`package.json\` declares its \`polymorph\` bin at ` +
        `${relative(path, declared)}, which does not exist: the package is not built. In this ` +
        'checkout, `pnpm build:packages` builds it',
    )
  }
  const candidates = [declared, resolve(path, 'bin/polymorph.js'), resolve(path, 'polymorph')]
  const bin = candidates.find((candidate) => candidate !== null && existsSync(candidate))
  if (bin === undefined) {
    throw new SetupError(
      `\`--tools\` names ${path}, which holds no \`polymorph\` bin: no \`bin\` in its ` +
        '`package.json`, no `bin/polymorph.js` and no `polymorph`',
    )
  }
  return {
    from: 'directory',
    path: bin,
    command: /\.[cm]?js$/.test(bin) ? [process.execPath, bin] : [bin],
    version: versionIn(resolve(path, 'package.json')),
  }
}

function installTarball(tarball, scratch) {
  const prefix = resolve(scratch, 'tools')
  mkdirSync(prefix, { recursive: true })
  writeFileSync(resolve(prefix, 'package.json'), '{ "private": true }\n')
  const npm = spawnSync('npm', ['install', '--no-audit', '--no-fund', tarball], {
    cwd: prefix,
    // npm's check for a newer npm is a request the install does not need.
    env: { ...process.env, ...packageStores(scratch), npm_config_update_notifier: 'false' },
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
  if (npm.status !== 0) {
    throw new SetupError(
      `npm could not install ${tarball}${tail(`${npm.stdout ?? ''}${npm.stderr ?? ''}`)}`,
    )
  }
  const dependencies = JSON.parse(readFileSync(resolve(prefix, 'package.json'), 'utf8'))
  const [name] = Object.keys(dependencies.dependencies ?? {})
  const bin = resolve(prefix, 'node_modules/.bin/polymorph')
  if (name === undefined || !existsSync(bin)) {
    throw new SetupError(`${tarball} installed no \`polymorph\` bin`)
  }
  return {
    from: 'tarball',
    path: tarball,
    command: [bin],
    version: versionIn(resolve(prefix, 'node_modules', name, 'package.json')),
  }
}

/**
 * Where npm and pnpm keep what they fetch and what they remember: inside the
 * eval's scratch directory, for the tools' install from a tarball, the
 * template's install, every harness and the judge's scripts. npm's cache
 * (`cache`), pnpm's store (`store-dir`), pnpm's metadata cache (`cache-dir`)
 * and pnpm's state (`state-dir`) all move there, so the owner's own are never
 * written, and both harnesses' sandboxes let a command write them, so a
 * harness can install a package. pnpm takes a setting from an `npm_config_`
 * variable, and the `pnpm_config_` one names it for a pnpm that reads only
 * its own prefix. The template is installed into this store, so a copy's
 * `node_modules` and the store a harness's pnpm finds agree.
 */
export function packageStores(scratch) {
  const at = (name) => resolve(scratch, name)
  return {
    npm_config_cache: at('npm-cache'),
    npm_config_store_dir: at('pnpm-store'),
    pnpm_config_store_dir: at('pnpm-store'),
    npm_config_cache_dir: at('pnpm-cache'),
    pnpm_config_cache_dir: at('pnpm-cache'),
    npm_config_state_dir: at('pnpm-state'),
    pnpm_config_state_dir: at('pnpm-state'),
  }
}

/** The directories `packageStores` names, once each. */
export const storeDirectories = (stores) => [...new Set(Object.values(stores))]

/** The tools' `polymorph` with `args`, run in `cwd`: its exit code and everything it printed. */
export function polymorph(tools, args, { cwd, env = process.env, timeout = 600_000 }) {
  const [command, ...prefix] = tools.command
  const result = spawnSync(command, [...prefix, ...args], {
    cwd,
    env,
    encoding: 'utf8',
    timeout,
    maxBuffer: 64 * 1024 * 1024,
  })
  return {
    code: result.status,
    stdout: result.stdout ?? '',
    output: `${result.stdout ?? ''}${result.stderr ?? ''}${result.error === undefined ? '' : result.error.message}`,
  }
}

/* -------------------------------------------------------------------------- */
/* The template                                                               */
/* -------------------------------------------------------------------------- */

/**
 * The app every run of the eval copies, set up once in `scratch`:
 *
 * 1. `polymorph init template --framework <framework>`, which installs the
 *    app's packages, or writes them without installing (`--no-install`) when
 *    `install` is false.
 * 2. `polymorph agents --harness <claude|codex>`, when the tools have the
 *    verb, so the harness finds its skills and its MCP entry. Tools without it
 *    say there is no such command; the harness then has what `init` wrote,
 *    and the results say so.
 *
 * Anything else that fails stops the eval before its first run.
 */
export function makeTemplate({ tools, framework, harness, scratch, install }) {
  const dir = resolve(scratch, 'template')
  const env = { ...process.env, ...packageStores(scratch) }
  const init = polymorph(
    tools,
    ['init', dir, '--framework', framework, ...(install ? [] : ['--no-install'])],
    { cwd: scratch, env },
  )
  if (init.code !== 0) {
    throw new SetupError(`\`polymorph init\` did not set the app up${tail(init.output)}`)
  }
  const named = harness === 'codex' ? 'codex' : 'claude'
  const agents = polymorph(tools, ['agents', '--harness', named], { cwd: dir, env })
  let ran
  if (agents.code === 0) ran = true
  else if (/no such command/i.test(agents.output)) ran = false
  else {
    throw new SetupError(`\`polymorph agents --harness ${named}\` failed${tail(agents.output)}`)
  }
  const said = ran
    ? agents.output.trim().split('\n').slice(-5).join('\n')
    : `the tools have no \`agents\` verb, so the harness has what \`init\` wrote`
  return {
    dir,
    installed: install,
    agents: { ran, said: clip(said) },
    mcpServers: mcpServersOf(dir, harness),
    // What it holds, so a run that writes into it is caught.
    files: snapshot(dir),
    // What the app is built with, so a run that takes it away is caught.
    manifest: manifestOf(dir),
  }
}

/** Whether a project has a `package.json`, and which of the scripts the judge runs it holds. */
function manifestOf(dir) {
  const file = resolve(dir, 'package.json')
  if (!existsSync(file)) return { present: false, scripts: [] }
  let scripts
  try {
    scripts = JSON.parse(readFileSync(file, 'utf8')).scripts ?? {}
  } catch (error) {
    throw new SetupError(`${file} cannot be read: ${error.message}`)
  }
  return {
    present: true,
    scripts: BUILD_SCRIPTS.filter((name) => typeof scripts[name] === 'string'),
  }
}

/** The scripts the judge runs, in order, when the app was installed. */
const BUILD_SCRIPTS = ['typecheck', 'build']

/**
 * The MCP servers a project configures for the harness, by name: the
 * `mcpServers` of `.mcp.json` for Claude Code, and the `[mcp_servers.<name>]`
 * tables of `.codex/config.toml` for Codex.
 */
export function mcpServersOf(dir, harness) {
  if (harness === 'codex') {
    const file = resolve(dir, '.codex/config.toml')
    if (!existsSync(file)) return []
    const names = [
      ...readFileSync(file, 'utf8').matchAll(/^\s*\[mcp_servers\.("?)([^\]".]+)\1\]/gm),
    ]
    return [...new Set(names.map((match) => match[2]))].sort()
  }
  const file = resolve(dir, '.mcp.json')
  if (!existsSync(file)) return []
  try {
    return Object.keys(JSON.parse(readFileSync(file, 'utf8')).mcpServers ?? {}).sort()
  } catch {
    return []
  }
}

/**
 * A run's own copy of the template. Symbolic links are copied as they are,
 * so the relative links of pnpm's `node_modules` resolve inside the copy, and
 * files are cloned where the file system can clone them, so a copy of an
 * installed app costs little. A harness that installs a package changes its
 * own copy only.
 */
export function copyProject(template, dir) {
  cpSync(template, dir, {
    recursive: true,
    verbatimSymlinks: true,
    mode: constants.COPYFILE_FICLONE,
  })
}

/** Every file of a project outside `UNWATCHED`, with a digest of what it holds. */
export function snapshot(dir) {
  const files = new Map()
  const walk = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name)
      if (entry.isDirectory()) {
        if (!UNWATCHED.has(entry.name)) walk(path)
      } else if (entry.isFile() && !CACHE_FILE.test(entry.name)) {
        const key = relative(dir, path).split(sep).join('/')
        files.set(key, createHash('sha256').update(readFileSync(path)).digest('hex'))
      }
    }
  }
  walk(dir)
  return files
}

/** The files a harness added or changed since `before`, sorted. */
export function writtenSince(before, dir) {
  const after = snapshot(dir)
  return [...after]
    .filter(([path, digest]) => before.get(path) !== digest)
    .map(([path]) => path)
    .sort()
}

/* -------------------------------------------------------------------------- */
/* Judging                                                                    */
/* -------------------------------------------------------------------------- */

/** Modules the requirements read as TSX: React's and Solid's, which name the same members. */
const MODULES = new Set(['.tsx', '.jsx'])

/**
 * Whether a file the harness wrote holds a screen the requirements cannot
 * read: a Vue or Svelte single-file component, an Angular component (a `.ts`
 * module that declares one), or a page that uses the elements. A plain `.ts`
 * module, such as a helper or a store, holds no screen.
 */
function unreadScreen(path, read) {
  const extension = extname(path)
  if (extension === '.vue' || extension === '.svelte') return path.startsWith('src/')
  if (extension === '.html') return /<poly-[a-z]/.test(read(path))
  if (extension === '.ts' && path.startsWith('src/') && !path.endsWith('.d.ts')) {
    return /@Component\s*\(/.test(read(path))
  }
  return false
}

/**
 * What the brief is judged on: the specs the harness wrote under
 * `src/screens/`, read together; or, when it wrote none, the React or Solid
 * modules it wrote under `src/`, read together; or, when it wrote neither,
 * a screen in a form the requirements cannot read (`unreadScreen`), which is
 * not judged. Null when the harness wrote no screen at all, which meets no
 * requirement. `read` gives a written file's text.
 */
export function screenOf(written, read) {
  const specs = written.filter((path) => /^src\/screens\/[^/]+\.json$/.test(path))
  if (specs.length > 0) return { kind: 'spec', files: specs }
  const modules = written.filter(
    (path) => path.startsWith('src/') && MODULES.has(extname(path)) && !path.endsWith('.d.ts'),
  )
  if (modules.length > 0) return { kind: 'tsx', files: modules }
  const unread = written.filter((path) => unreadScreen(path, read))
  return unread.length > 0 ? { kind: 'unread', files: unread } : null
}

/**
 * Why the project's `package.json` cannot be read, or null. A harness that
 * leaves it unreadable leaves an app that neither builds nor passes the red
 * rules, which read it to tell which vocabulary a file uses.
 */
function brokenManifest(dir) {
  const manifest = resolve(dir, 'package.json')
  if (!existsSync(manifest)) return null
  try {
    const parsed = JSON.parse(readFileSync(manifest, 'utf8'))
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? null
      : 'it is JSON, and not an object'
  } catch (error) {
    return messageOf(error)
  }
}

/** The `check --json` report in what the tools printed: the first line that opens an object, to the end. */
function reportIn(stdout) {
  const start = stdout.search(/^\{/m)
  if (start === -1) return null
  try {
    return JSON.parse(stdout.slice(start))
  } catch {
    return null
  }
}

/**
 * One of the app's scripts, run with pnpm in `env`: null when the app has no
 * such script. The caller has checked that `package.json` can be read.
 */
function script(dir, name, env) {
  const manifest = resolve(dir, 'package.json')
  if (!existsSync(manifest)) return null
  const scripts = JSON.parse(readFileSync(manifest, 'utf8')).scripts ?? {}
  if (typeof scripts[name] !== 'string') return null
  const result = spawnSync('pnpm', ['run', name], {
    cwd: dir,
    env,
    encoding: 'utf8',
    timeout: 600_000,
    maxBuffer: 64 * 1024 * 1024,
  })
  const printed = `${result.stdout ?? ''}${result.stderr ?? ''}${result.error?.message ?? ''}`
  return { ok: result.status === 0, printed }
}

/**
 * The project, judged as it stands:
 *
 * - **lawful**: the tools' `polymorph check --json` reads every file and
 *   reports no violation, and every spec the harness wrote under
 *   `src/screens/` passes the spec check `validate` runs (`eval/toolbox.mjs`).
 *   The red rules read code, so a spec that was never emitted is held to the
 *   spec check instead.
 * - **builds**: the app's `typecheck` and `build` scripts both pass, run with
 *   pnpm. Null when the app was not installed.
 * - **meetsBrief**: the screen (`screenOf`) meets the brief's requirements,
 *   read as `eval/requirements.mjs` reads a spec or a TSX module. A harness
 *   that wrote no screen meets none; a screen the requirements cannot read is
 *   not judged, and is null.
 *
 * A `package.json` the harness left unreadable is the harness's work: the
 * project is not lawful, and an installed one does not build. One it deleted,
 * or a `typecheck` or `build` script it took out of one, leaves an installed
 * app that does not build; `expected` is what the template's held. A check
 * that cannot run on a readable project throws, which ends the run as the
 * eval's own fault. `env` is what the scripts run in.
 */
export async function judgeProject({
  dir,
  tools,
  toolbox,
  requirements,
  written,
  installed,
  expected = { present: true, scripts: BUILD_SCRIPTS },
  env = process.env,
}) {
  const broken = brokenManifest(dir)
  let report
  if (broken === null) {
    const checked = polymorph(tools, ['check', '--json'], { cwd: dir })
    report = reportIn(checked.stdout)
    if (report === null) {
      throw new Error(`\`polymorph check --json\` printed no report${tail(checked.output)}`)
    }
  } else {
    report = {
      ok: false,
      files: [{ path: 'package.json', fatal: `it cannot be read: ${broken}`, violations: [] }],
    }
  }
  const violations = report.files.flatMap((file) => [
    ...(file.fatal === null ? [] : [`${file.path}: ${file.fatal}`]),
    ...file.violations.map((violation) => `${file.path}: ${violation.rule}: ${violation.message}`),
  ])

  const screen = screenOf(written, (path) => readFileSync(resolve(dir, path), 'utf8'))
  const specs = screen?.kind === 'spec' ? screen.files : []
  let specsLawful = true
  for (const path of specs) {
    const verdict = await toolbox.check('spec', readFileSync(resolve(dir, path), 'utf8'))
    if (verdict.ok) continue
    specsLawful = false
    violations.push(
      ...(verdict.fatal === null || verdict.fatal === undefined
        ? []
        : [`${path}: ${verdict.fatal}`]),
      ...(verdict.faults ?? []).map((fault) => `${path}: spec: ${fault.message}`),
      ...(verdict.violations ?? []).map(
        (violation) => `${path}: ${violation.rule}: ${violation.message ?? ''}`,
      ),
    )
  }

  let builds = null
  let buildFault = null
  const deleted = expected.present && !existsSync(resolve(dir, 'package.json'))
  if (installed && broken !== null) {
    builds = false
    buildFault = clip(`\`package.json\` cannot be read: ${broken}`)
  } else if (installed && deleted) {
    builds = false
    buildFault = 'the harness deleted `package.json`, which the app is built from'
  } else if (installed) {
    for (const name of BUILD_SCRIPTS) {
      const result = script(dir, name, env)
      if (result === null && expected.scripts.includes(name)) {
        builds = false
        buildFault = `the harness took the \`${name}\` script out of \`package.json\``
        break
      }
      if (result === null) continue
      builds = result.ok
      if (!result.ok) {
        buildFault = clip(`\`${name}\` failed${tail(result.printed)}`)
        break
      }
    }
  }

  let meetsBrief = false
  let failedRequirements = requirements.map((requirement) => requirement.id)
  if (screen?.kind === 'unread') {
    meetsBrief = null
    failedRequirements = []
  } else if (screen !== null) {
    const mode = screen.kind
    failedRequirements = unmetAcross(
      requirements,
      screen.files.map((path) => ({ mode, document: readFileSync(resolve(dir, path), 'utf8') })),
    )
    meetsBrief = failedRequirements.length === 0
  }

  return {
    lawful: report.ok && specsLawful,
    violations: violations.slice(0, KEPT_VIOLATIONS).map(clip),
    builds,
    buildFault,
    meetsBrief,
    failedRequirements,
    screen,
  }
}

/** What a run's outputs entry keeps: the harness's last message and the text of every file it wrote. */
export function keptFiles(dir, written) {
  return Object.fromEntries(
    written.map((path) => {
      const text = readFileSync(resolve(dir, path), 'utf8')
      return [path, text.length > KEPT_CHARACTERS ? `${text.slice(0, KEPT_CHARACTERS)}…` : text]
    }),
  )
}

/* -------------------------------------------------------------------------- */
/* What a harness called                                                      */
/* -------------------------------------------------------------------------- */

/** The verbs of the `polymorph` CLI (`packages/cli/src/cli.ts` and the tools package). */
const VERBS = [
  'agents',
  'add',
  'axes',
  'card',
  'check',
  'component',
  'diff',
  'emit',
  'fix',
  'help',
  'init',
  'mcp',
  'plan',
  'render',
  'search',
  'theme',
  'update',
  'validate',
]

/**
 * A `polymorph` invocation in a shell command: the published package through
 * `npx` or `pnpm dlx` (`@metamorph-labs/polymorph@<range>`), the bin by its
 * path (`…/bin/polymorph.js`), or `polymorph` on the `PATH`, through `pnpm` or
 * not, followed by its verb.
 */
const INVOCATION = new RegExp(
  `(?:^|[\\s;&|('"\`])(?:\\S*/)?(?:@metamorph-labs/polymorph(?:@[^\\s'"\`]+)?|polymorph(?:\\.js)?)` +
    `\\s+(?:--?[\\w-]+(?:=\\S+)?\\s+)*(${VERBS.join('|')})(?=$|[\\s;&|)'"\`])`,
  'g',
)

/** The `polymorph` verbs a shell command runs, in order. `polymorph-mcp` is the server, counted as `mcp`. */
export function verbsIn(command) {
  const verbs = [...command.matchAll(INVOCATION)].map((match) => match[1])
  const servers = command.match(/(?:^|[\s/;&|('"`])polymorph-mcp(?:\.js)?(?=$|[\s;&|)'"`])/g) ?? []
  return [...verbs, ...servers.map(() => 'mcp')]
}

/** The skill a path names when it is a skill's `SKILL.md`: the directory that holds it. */
export function skillOfPath(path) {
  return /(?:^|\/)SKILL\.md$/.test(path) ? basename(dirname(path)) : null
}

/** The skills a shell command reads: every `…/<skill>/SKILL.md` it names. */
export function skillsIn(command) {
  return [...command.matchAll(/([^\s'"`/]+)\/SKILL\.md\b/g)].map((match) => match[1])
}

/**
 * What a run's harness called, counted as it streams. `denied` starts as
 * `denied`: zero where the harness reports each refusal as it happens, and
 * null where it reports them only at the end, until it does.
 */
function newCalls(denied) {
  return { mcp: {}, verbs: {}, shell: 0, skills: new Set(), denied }
}

const bump = (record, key) => {
  record[key] = (record[key] ?? 0) + 1
}

function countShell(calls, command) {
  calls.shell += 1
  for (const verb of verbsIn(command)) bump(calls.verbs, verb)
}

/* -------------------------------------------------------------------------- */
/* Starting a harness                                                         */
/* -------------------------------------------------------------------------- */

/** The request a run sends: the brief, then what to do with it, as a person would ask. */
export const projectRequest = (brief) =>
  `${brief.trim()}\n\nBuild the screen the brief describes, in this app.`

/**
 * The hosts a harness's shell commands may reach in a project: npm's
 * registry and GitHub Packages, where the app's packages and the published
 * tools come from.
 */
export const REGISTRY_HOSTS = [
  'registry.npmjs.org',
  'npm.pkg.github.com',
  'pkg-npm.githubusercontent.com',
]

/**
 * The settings `claude -p` is given in a project, which confine its shell as
 * Codex's sandbox confines Codex's
 * (https://code.claude.com/docs/en/sandboxing.md,
 * https://code.claude.com/docs/en/settings.md):
 *
 * - `sandbox.enabled`, with `failIfUnavailable` so Claude Code refuses to
 *   start rather than run commands unsandboxed, and `allowUnsandboxedCommands`
 *   false so a blocked command cannot be retried outside the sandbox. A
 *   sandboxed command writes only in the working directory and the per-user
 *   temporary directory. `filesystem.allowWrite` adds npm's cache and pnpm's
 *   store (`packageStores`), and `filesystem.denyWrite` takes the template
 *   every run copies away.
 * - `autoAllowBashIfSandboxed`: a sandboxed command runs with no prompt, so
 *   no `Bash` permission is given.
 * - `network.allowedDomains`: the package registries (`REGISTRY_HOSTS`) and
 *   no other host.
 * - `permissions.blockWritesOutsideWorkingDirectories`: the file tools refuse
 *   a path outside the project.
 */
export function claudeSandbox({ allowWrite, denyWrite }) {
  return {
    sandbox: {
      enabled: true,
      failIfUnavailable: true,
      autoAllowBashIfSandboxed: true,
      allowUnsandboxedCommands: false,
      filesystem: { allowWrite, denyWrite },
      network: { allowedDomains: REGISTRY_HOSTS },
    },
    permissions: { blockWritesOutsideWorkingDirectories: true },
  }
}

/**
 * The flags `claude -p` is started with in a project. Each is load-bearing,
 * and `eval/fake/cli.mjs` checks them
 * (https://code.claude.com/docs/en/cli-reference.md).
 *
 * - No `--system-prompt` and no `--tools`: Claude Code's own prompt and
 *   tools, as a person runs it.
 * - `--setting-sources project`: the project's settings, skills and
 *   `CLAUDE.md`, and none of the owner's.
 * - `--settings`: the sandbox (`claudeSandbox`), above the project's settings.
 * - `--mcp-config <project>/.mcp.json --strict-mcp-config`: the servers the
 *   project configures and no other.
 * - `--permission-mode acceptEdits`, `--allowedTools` and
 *   `--permission-prompts none`: edits inside the project, skills and the
 *   project's MCP tools need no person, sandboxed commands run, and anything
 *   that would wait on a prompt is refused.
 */
export function claudeProjectArguments({ settings, config, servers, sandbox }) {
  return [
    '-p',
    ...(settings.fake ? [] : ['--model', settings.model]),
    ...(settings.effort === 'default' ? [] : ['--effort', settings.effort]),
    '--setting-sources',
    'project',
    '--settings',
    JSON.stringify(claudeSandbox(sandbox)),
    '--strict-mcp-config',
    '--mcp-config',
    config,
    '--permission-mode',
    'acceptEdits',
    '--permission-prompts',
    'none',
    '--allowedTools',
    ['Skill', ...servers.map((server) => `mcp__${server}`)].join(','),
    '--no-session-persistence',
    '--output-format',
    'stream-json',
    '--include-partial-messages',
    '--verbose',
  ]
}

/**
 * The owner's own skills, which a Codex run in a project turns off by path:
 * the personal ones in `~/.agents/skills` and the machine's in
 * `/etc/codex/skills` (https://learn.chatgpt.com/docs/build-skills). The
 * project's own, in `.agents/skills` inside it, stay on.
 */
export function ownSkills(home = homedir()) {
  return [resolve(home, '.agents/skills'), '/etc/codex/skills'].flatMap((directory) => {
    try {
      return readdirSync(directory)
        .map((entry) => resolve(directory, entry, 'SKILL.md'))
        .filter((file) => existsSync(file))
    } catch {
      return []
    }
  })
}

/**
 * The arguments `codex exec` is started with in a project. Each is
 * load-bearing, and `eval/fake/codex.mjs` checks them. The URL each rests on
 * is beside it.
 *
 * - `exec --json`: a run with no person, its events as JSON lines
 *   (https://learn.chatgpt.com/docs/non-interactive-mode).
 * - `--skip-git-repo-check`: the app is not a Git repository.
 * - `--ephemeral`: no session is saved.
 * - No flag trusts the project: the run's own Codex home does, which
 *   `trustProject` writes before Codex starts, so the project's `.codex/`
 *   configuration and MCP servers load.
 * - `--sandbox workspace-write` with `sandbox_workspace_write.network_access`:
 *   commands write inside the project and the temporary directory, which
 *   holds the eval's npm cache and pnpm store, and reach the network, any
 *   host, so `npx` and pnpm can fetch
 *   (https://learn.chatgpt.com/docs/config-file/config-reference).
 * - `approval_policy = "never"`: nothing waits for a person. Codex then denies
 *   an MCP call that needs approval, so every tool of each server the project
 *   configures is approved (`default_tools_approval_mode = "approve"`), as a
 *   person at the prompt would approve it.
 * - `skills.config`: the owner's own skills turned off by path (`ownSkills`).
 * - `history.persistence = "none"`, `check_for_update_on_startup = false`.
 * - `-`: the request on stdin.
 */
export function codexProjectArguments({ settings, servers, skills }) {
  return [
    'exec',
    '--json',
    '--skip-git-repo-check',
    '--ephemeral',
    '--color',
    'never',
    '--sandbox',
    'workspace-write',
    ...(settings.fake ? [] : ['--model', settings.model]),
    ...override('approval_policy', 'never'),
    ...override('sandbox_workspace_write.network_access', true),
    ...(settings.effort === 'default' ? [] : override('model_reasoning_effort', settings.effort)),
    ...servers.flatMap((server) =>
      override(`mcp_servers.${server}.default_tools_approval_mode`, 'approve'),
    ),
    ...(skills.length === 0
      ? []
      : override(
          'skills.config',
          skills.map((path) => ({ path, enabled: false })),
        )),
    ...override('history.persistence', 'none'),
    ...override('check_for_update_on_startup', false),
    '-',
  ]
}

/**
 * Starts a harness in its own process group, so stopping it stops what it
 * started too: its MCP servers and any command it left running.
 */
function startHarness(launcher, args, { cwd, env, request }) {
  const child = spawn(launcher.command, [...launcher.prefix, ...args], {
    cwd,
    env,
    stdio: ['pipe', 'pipe', 'pipe'],
    detached: true,
  })
  const exited = new Promise((done) => {
    child.on('close', (code, signal) => done({ code, signal }))
    child.on('error', (error) => done({ code: null, signal: null, error }))
  })
  // A signal to the eval reaches its own group, not this one, so it is stopped by hand.
  track(() => {
    try {
      process.kill(-child.pid, 'SIGKILL')
    } catch {
      // The group has ended.
    }
  }, exited)
  child.stdin.on('error', () => {})
  child.stdin.end(request)
  let stderr = ''
  child.stderr.on('data', (chunk) => (stderr = (stderr + chunk).slice(-8000)))
  const signal = (name) => {
    try {
      process.kill(-child.pid, name)
    } catch {
      // The group has ended.
    }
  }
  return { child, exited, stderr: () => stderr, signal }
}

/**
 * Runs one harness in `dir` until it ends or its budget stops it, and
 * returns how it ended, its turns, its wall time and what it called; its
 * tokens go to the run's meter as the reader reads them. `read.event` reads
 * one event of the harness's stream and may stop the harness; `read.finish`
 * turns how a harness that ended on its own ended into the run's ending, or
 * throws when the harness failed.
 *
 * The time budget, `budget.maxMs`, runs from the start. The turn budget and
 * the eval's token ceilings are the reader's to check.
 */
async function drive({ launcher, args, dir, env, request, budget, read }) {
  const started = Date.now()
  const harness = startHarness(launcher, args, { cwd: dir, env, request })
  let stop = null
  const halt = (decision) => {
    if (stop !== null) return
    stop = decision
    harness.signal('SIGTERM')
    setTimeout(() => harness.signal('SIGKILL'), 5000).unref()
  }
  const timer = setTimeout(() => halt({ ended: 'time' }), budget.maxMs)
  const state = read.start({ halt, started })
  try {
    for await (const line of createInterface({ input: harness.child.stdout })) {
      if (stop !== null) continue
      let event
      try {
        event = JSON.parse(line)
      } catch {
        continue
      }
      read.event(state, event)
    }
  } catch (error) {
    halt({ error })
    stop = { error }
    harness.child.stdout.resume()
  }
  const { code, signal, error } = await harness.exited
  clearTimeout(timer)
  // Whatever the harness left running in its group goes with it.
  harness.signal('SIGKILL')
  if (stop?.error !== undefined) throw stop.error
  const ended =
    stop !== null
      ? stop.ended
      : read.finish(state, { code, signal, error, stderr: harness.stderr() })
  return {
    ended,
    wallMs: Math.max(0, Date.now() - (state.startedAt ?? started)),
    ...read.report(state),
  }
}

/** What a Claude Code stream reports in a project, read as `claude -p` writes it. */
const claudeReader = ({ maxTurns, meter, ceilings }) => ({
  start: ({ halt, started }) => ({
    halt,
    startedAt: started,
    // Claude Code reports the calls it refused in its result, which a stopped run never reaches.
    calls: newCalls(null),
    turns: 0,
    open: null,
    pending: new Set(),
    /** The skill each call that loads one names, by the call's id, until its result comes back. */
    skillCalls: new Map(),
    limited: false,
    result: null,
    retries: 0,
    texts: [],
  }),
  event(state, event) {
    switch (event.type) {
      case 'system':
        if (event.subtype === 'init') state.startedAt = Date.now()
        else if (event.subtype === 'api_retry') state.retries += 1
        break
      case 'stream_event': {
        const inner = event.event ?? {}
        if (inner.type === 'message_start') {
          state.open = { usage: { ...inner.message?.usage } }
        } else if (inner.type === 'message_delta' && state.open !== null) {
          Object.assign(state.open.usage, inner.usage)
        } else if (inner.type === 'message_stop' && state.open !== null) {
          const usage = state.open.usage
          meter.input += usage.input_tokens ?? 0
          meter.cacheRead += usage.cache_read_input_tokens ?? 0
          meter.cacheWrite += usage.cache_creation_input_tokens ?? 0
          meter.output += usage.output_tokens ?? 0
          meter.reported = true
          state.open = null
          state.turns += 1
        }
        break
      }
      case 'assistant': {
        const message = event.message ?? {}
        if (message.model === '<synthetic>') {
          if (event.error === 'rate_limit') state.limited = true
          break
        }
        for (const block of message.content ?? []) {
          if (block.type === 'text' && block.text !== '') state.texts.push(block.text)
          if (block.type !== 'tool_use') continue
          state.pending.add(block.id)
          const input = block.input ?? {}
          if (block.name === 'Bash' && typeof input.command === 'string') {
            countShell(state.calls, input.command)
          } else if (block.name === 'Skill') {
            const name = input.skill ?? input.command ?? input.name
            if (typeof name === 'string') state.skillCalls.set(block.id, name)
          } else if (block.name === 'Read' && typeof input.file_path === 'string') {
            const skill = skillOfPath(input.file_path)
            if (skill !== null) state.skillCalls.set(block.id, skill)
          } else if (block.name.startsWith('mcp__')) {
            bump(state.calls.mcp, block.name.split('__').slice(2).join('__'))
          }
        }
        break
      }
      case 'user': {
        const content = Array.isArray(event.message?.content) ? event.message.content : []
        const answered = content.filter((block) => block.type === 'tool_result')
        if (answered.length === 0) break
        for (const block of answered) {
          state.pending.delete(block.tool_use_id)
          // A skill is loaded when the call that loads it succeeds.
          const skill = state.skillCalls.get(block.tool_use_id)
          if (skill !== undefined && block.is_error !== true) state.calls.skills.add(skill)
        }
        if (state.pending.size > 0) break
        // Every call of the turn is answered: where the next request would go out.
        if (state.turns >= maxTurns) state.halt({ ended: 'turns' })
        else {
          try {
            ceilings()
          } catch (error) {
            state.halt({ error })
          }
        }
        break
      }
      case 'rate_limit_event':
        if (event.rate_limit_info?.status === 'rejected') state.limited = true
        break
      case 'result':
        state.result = event
        break
    }
  },
  finish(state, { code, signal, error, stderr }) {
    const { result } = state
    if (result === null) {
      const how =
        error === undefined ? `exited with ${code ?? signal}` : `did not start: ${error.message}`
      throw new HarnessError('cli', `Claude Code ${how} before it reported a result${tail(stderr)}`)
    }
    if (result.is_error) {
      const said =
        typeof result.result === 'string' && result.result !== ''
          ? result.result
          : [result.subtype, ...(result.errors ?? [])].filter(Boolean).join(': ')
      throw new HarnessError(
        state.limited || LIMIT_WORDS.test(said) ? 'usage-limit' : 'cli',
        `Claude Code reported: ${said}`,
      )
    }
    if (Array.isArray(result.permission_denials)) {
      state.calls.denied = result.permission_denials.length
    }
    return 'answered'
  },
  report: (state) => ({
    turns: state.turns,
    calls: state.calls,
    retries: state.retries,
    answer: state.texts.at(-1) ?? null,
  }),
})

/**
 * Codex's `usage`, added to a run's meter in the meter's terms: `input` is
 * the uncached part. Codex's `input_tokens` counts every input token, cached
 * ones included (`non_cached_input` in `codex-rs/protocol/src/protocol.rs`
 * subtracts `cached_input_tokens` from it), and is taken to include the
 * cache writes too. Some versions of Codex report no
 * `cache_write_input_tokens`; where it is absent, `cacheWriteReported` stays
 * false. A `usage` with no
 * `input_tokens` reports nothing.
 */
export function meterCodexUsage(meter, usage = {}) {
  if (typeof usage.input_tokens !== 'number') return
  const cached = usage.cached_input_tokens ?? 0
  const written = usage.cache_write_input_tokens ?? 0
  meter.input += Math.max(0, usage.input_tokens - cached - written)
  meter.cacheRead += cached
  meter.cacheWrite += written
  meter.cacheWriteReported = typeof usage.cache_write_input_tokens === 'number'
  meter.output += usage.output_tokens ?? 0
  meter.reported = true
}

/** Tool items Codex reports, which its turn budget counts. */
const CODEX_STEPS = new Set(['command_execution', 'file_change', 'mcp_tool_call', 'web_search'])

/**
 * What a `codex exec --json` stream reports in a project. The event shapes
 * are those of `codex-rs/exec/src/exec_events.rs` in
 * https://github.com/openai/codex, summarised at
 * https://learn.chatgpt.com/docs/non-interactive-mode: `thread.started`,
 * `item.started` and `item.completed` for each item, `turn.completed` with
 * the thread's `usage`, or `turn.failed` with its `error`, and `error` for
 * what Codex reports while it goes on.
 */
const codexReader = ({ maxTurns, meter }) => ({
  start: ({ halt, started }) => ({
    halt,
    startedAt: started,
    calls: newCalls(0),
    steps: new Set(),
    completed: false,
    failed: null,
    lastError: null,
    texts: [],
  }),
  event(state, event) {
    switch (event.type) {
      case 'thread.started':
        state.startedAt = Date.now()
        break
      case 'item.started':
      case 'item.completed': {
        const item = event.item ?? {}
        if (CODEX_STEPS.has(item.type) && !state.steps.has(item.id)) {
          state.steps.add(item.id)
          if (state.steps.size > maxTurns) {
            state.halt({ ended: 'turns' })
            break
          }
        }
        if (event.type !== 'item.completed') break
        if (item.type === 'agent_message' && typeof item.text === 'string') {
          state.texts.push(item.text)
        } else if (item.type === 'command_execution' && typeof item.command === 'string') {
          countShell(state.calls, item.command)
          if (item.status === 'declined') state.calls.denied += 1
          // Codex loads a skill by reading its `SKILL.md`, and it is loaded when the read succeeds.
          if (item.exit_code === 0) {
            for (const skill of skillsIn(item.command)) state.calls.skills.add(skill)
          }
        } else if (item.type === 'mcp_tool_call' && typeof item.tool === 'string') {
          bump(state.calls.mcp, item.tool)
          if (/approval/i.test(item.error?.message ?? '')) state.calls.denied += 1
        }
        break
      }
      case 'error':
        state.lastError = event.message ?? null
        break
      case 'turn.completed':
        meterCodexUsage(meter, event.usage)
        state.completed = true
        break
      case 'turn.failed':
        state.failed = event.error?.message ?? state.lastError ?? 'turn failed'
        break
    }
  },
  finish(state, { code, signal, error, stderr }) {
    if (state.failed !== null) {
      throw new HarnessError(
        LIMIT_WORDS.test(state.failed) ? 'usage-limit' : 'cli',
        `Codex reported: ${state.failed}`,
      )
    }
    if (!state.completed) {
      const how =
        error === undefined ? `exited with ${code ?? signal}` : `did not start: ${error.message}`
      const said = state.lastError === null ? '' : `; it last reported: ${state.lastError}`
      throw new HarnessError('cli', `Codex ${how} before its turn ended${said}${tail(stderr)}`)
    }
    return 'answered'
  },
  // Codex reports neither its requests nor the ones it sent again.
  report: (state) => ({
    turns: null,
    calls: state.calls,
    retries: null,
    answer: state.texts.at(-1) ?? null,
  }),
})

/**
 * One run of one brief in the project lane, from the copy of the template to
 * the record. `lane` is the eval's: the harness and its launcher, the
 * template, the tools, the budget and the scratch directory. A failure of the
 * harness throws `HarnessError`, and a ceiling throws what `ceilings` throws;
 * both stop the eval. A failure while judging ends the run as `harness`.
 */
export async function runOnceProject({
  brief,
  run,
  text,
  lane,
  settings,
  toolbox,
  requirements,
  meter,
  ceilings,
}) {
  const directory = resolve(lane.scratch, `${brief}-${run}`)
  const dir = resolve(directory, 'app')
  mkdirSync(directory, { recursive: true })
  copyProject(lane.template.dir, dir)
  const before = snapshot(dir)

  const script = settings.fake ? ['--script', lane.scriptFor(brief, run)] : []
  const servers = lane.template.mcpServers
  const stores = packageStores(lane.scratch)
  let args
  let env
  let read
  if (lane.harness === 'codex') {
    const home = codexHome(resolve(directory, 'codex-home'))
    trustProject(home, dir)
    args = [...script, ...codexProjectArguments({ settings, servers, skills: ownSkills() })]
    env = codexEnvironment(home, stores)
    read = codexReader({ maxTurns: settings.maxTurns, meter })
  } else {
    const config = existsSync(resolve(dir, '.mcp.json'))
      ? resolve(dir, '.mcp.json')
      : resolve(directory, 'no-servers.json')
    if (!existsSync(config)) writeFileSync(config, '{ "mcpServers": {} }\n')
    const sandbox = { allowWrite: storeDirectories(stores), denyWrite: [lane.template.dir] }
    args = [...script, ...claudeProjectArguments({ settings, config, servers, sandbox })]
    // Claude Code keeps its state in a directory of the run's own when its sign-in survives that.
    env = claudeEnvironment({
      ...stores,
      ...(lane.harnessHome === 'scratch'
        ? { CLAUDE_CONFIG_DIR: claudeHome(resolve(directory, 'claude-home')) }
        : {}),
    })
    read = claudeReader({ maxTurns: settings.maxTurns, meter, ceilings })
  }

  const driven = await drive({
    launcher: lane.launcher,
    args,
    dir,
    env,
    request: projectRequest(text),
    budget: { maxMs: settings.maxMinutes * 60_000 },
    read,
  })

  const written = writtenSince(before, dir)
  // Both sandboxes let a command write in the temporary directory, where the template is.
  const touched = writtenSince(lane.template.files, lane.template.dir)
  if (touched.length > 0) {
    throw new HarnessError(
      'cli',
      `the harness wrote into the template every run copies (${touched.slice(0, 5).join(', ')}), ` +
        'so the runs after this one would not start from the same app',
    )
  }
  let judged
  let ended = driven.ended
  let harnessFault = null
  try {
    judged = await judgeProject({
      dir,
      tools: lane.tools,
      toolbox,
      requirements,
      written,
      installed: lane.template.installed,
      expected: lane.template.manifest,
      env: { ...process.env, ...stores },
    })
  } catch (error) {
    ended = 'harness'
    harnessFault = `judging the project failed: ${messageOf(error)}`
    judged = {
      lawful: false,
      violations: [],
      builds: null,
      buildFault: null,
      meetsBrief: null,
      failedRequirements: [],
      screen: null,
    }
  }
  const { calls } = driven
  const tokens = (value) => (meter.reported ? value : null)
  const record = {
    brief,
    run,
    lawful: judged.lawful,
    violations: judged.violations,
    builds: judged.builds,
    buildFault: judged.buildFault,
    meetsBrief: judged.meetsBrief,
    failedRequirements: judged.failedRequirements,
    screen: judged.screen,
    written,
    ended,
    harnessFault,
    inputTokens: tokens(meter.input + meter.cacheRead + meter.cacheWrite),
    cacheReadTokens: tokens(meter.cacheRead),
    cacheWriteTokens:
      lane.harness === 'codex' && !meter.cacheWriteReported ? null : tokens(meter.cacheWrite),
    outputTokens: tokens(meter.output),
    wallMs: driven.wallMs,
    turns: driven.turns,
    mcpCalls: sorted(calls.mcp),
    verbs: sorted(calls.verbs),
    shellCommands: calls.shell,
    skills: [...calls.skills].sort(),
    denied: calls.denied,
    retries: driven.retries,
  }
  const document = { answer: driven.answer, files: keptFiles(dir, written) }
  return { record, document, directory }
}

const sorted = (record) =>
  Object.fromEntries(Object.entries(record).sort(([a], [b]) => a.localeCompare(b)))

/* -------------------------------------------------------------------------- */
/* The summary                                                                */
/* -------------------------------------------------------------------------- */

const rounded = (value, places) => Math.round(value * 10 ** places) / 10 ** places

/** A count summed over the runs that report it, or null when runs ran and none reports it. */
const reportedSum = (records, field) => {
  const values = records.map((record) => record[field]).filter((value) => value !== null)
  return values.length === 0 && records.length > 0
    ? null
    : values.reduce((total, value) => total + value, 0)
}
const mean = (values) => values.reduce((total, value) => total + value, 0) / values.length

/**
 * The figures over a set of project runs. A run that ended `harness` is the
 * eval's failure and is left out of every figure but `endings`. Each rate is
 * over the runs that were judged for it: `builds` over the runs whose app was
 * installed, `meetsBrief` over the runs whose screen could be read, and the
 * three together over the runs judged for all three. Each rate has its 95%
 * interval and the number of runs it is over.
 */
export function summariseProject(records, endings) {
  const measured = records.filter((record) => record.ended !== 'harness')
  const rate = (name, judged, passed) => {
    const over = measured.filter(judged)
    const count = over.filter(passed).length
    const found = interval(count, over.length)
    return {
      [`${name}Rate`]: over.length === 0 ? null : rounded(count / over.length, 4),
      [`${name}Interval`]:
        found === null ? null : { low: rounded(found.low, 4), high: rounded(found.high, 4) },
      [`${name}Measured`]: over.length,
    }
  }
  const average = (field) => {
    const values = measured.map((record) => record[field]).filter((value) => value !== null)
    return values.length === 0 ? null : Math.round(mean(values))
  }
  const total = (field) => {
    const summed = {}
    for (const record of measured) {
      for (const [key, value] of Object.entries(record[field])) {
        summed[key] = (summed[key] ?? 0) + value
      }
    }
    return sorted(summed)
  }
  const failed = {}
  const skills = {}
  for (const record of measured) {
    for (const id of record.failedRequirements) bump(failed, `${record.brief}/${id}`)
    for (const skill of record.skills) bump(skills, skill)
  }
  return {
    runs: records.length,
    measured: measured.length,
    endings: Object.fromEntries(
      endings.map((ending) => [ending, records.filter((record) => record.ended === ending).length]),
    ),
    ...rate(
      'lawful',
      () => true,
      (record) => record.lawful,
    ),
    ...rate(
      'builds',
      (record) => record.builds !== null,
      (record) => record.builds,
    ),
    ...rate(
      'meetsBrief',
      (record) => record.meetsBrief !== null,
      (record) => record.meetsBrief,
    ),
    ...rate(
      'allThree',
      (record) => record.builds !== null && record.meetsBrief !== null,
      (record) => record.lawful && record.builds && record.meetsBrief,
    ),
    failedRequirements: sorted(failed),
    meanInputTokens: average('inputTokens'),
    meanOutputTokens: average('outputTokens'),
    meanWallMs: average('wallMs'),
    mcpCalls: total('mcpCalls'),
    verbs: total('verbs'),
    shellCommands: measured.reduce((sum, record) => sum + record.shellCommands, 0),
    skills: sorted(skills),
    denied: reportedSum(measured, 'denied'),
    retries: reportedSum(records, 'retries'),
  }
}
