#!/usr/bin/env node
/**
 * `pnpm publish:packages` publishes the installable packages to GitHub
 * Packages, or with `--to npmjs` to npmjs.com: `@polymorph/engine`, `@polymorph/rules`, `@polymorph/react`,
 * `@polymorph/recipes`, `@polymorph/react-ui`, `@polymorph/vue`,
 * `@polymorph/vue-ui`, `@polymorph/svelte`, `@polymorph/svelte-ui`,
 * `@polymorph/solid`, `@polymorph/solid-ui`, `@polymorph/elements`,
 * `@polymorph/elements-ui`, `@polymorph/angular` and `@polymorph/angular-ui`,
 * as `@metamorph-labs/polymorph-engine`, `@metamorph-labs/polymorph-rules`,
 * `@metamorph-labs/polymorph-react`, `@metamorph-labs/polymorph-recipes`,
 * `@metamorph-labs/polymorph-react-ui`, `@metamorph-labs/polymorph-vue`,
 * `@metamorph-labs/polymorph-vue-ui`, `@metamorph-labs/polymorph-svelte`,
 * `@metamorph-labs/polymorph-svelte-ui`, `@metamorph-labs/polymorph-solid`,
 * `@metamorph-labs/polymorph-solid-ui`, `@metamorph-labs/polymorph-elements`,
 * `@metamorph-labs/polymorph-elements-ui`, `@metamorph-labs/polymorph-angular`
 * and `@metamorph-labs/polymorph-angular-ui`.
 *
 * Inside this repository the packages keep their `@polymorph/*` names, which
 * every import, test and doc uses. GitHub Packages requires a package's scope to
 * be the owner of the repository, so the names change only at the registry.
 * npmjs.com receives the same names, under the `metamorph-labs` organisation, so
 * an alias reads the same on either registry and only a consumer's `.npmrc`
 * chooses between them.
 * A dependency on another of these packages is published as an `npm:` alias:
 * `@metamorph-labs/polymorph-react` depends on
 * `"@polymorph/engine": "npm:@metamorph-labs/polymorph-engine@^<version>"`, and a
 * consumer installs each package under its `@polymorph/*` alias, so no import
 * changes. A peer dependency on one is published as a range under the
 * workspace name (`published-ranges.mjs` has both forms and the reason).
 * `docs/consuming.md` has the consumer's side.
 *
 * Every package is published at one version, the release's, and the script
 * ends by printing the tag for it (`releaseVersion`).
 *
 * Steps: `pnpm gate` (or, with `--tagged`, the tag's record of it), then per package: build, `pnpm pack` (which applies
 * `publishConfig` and pins `workspace:` ranges), rewrite the packed manifest for
 * the registry, check it, publish it. `@polymorph/recipes` has no build: it
 * publishes its `src/` as it is, and the consumer's bundler compiles it.
 *
 *   node scripts/publish-packages.mjs              # publish
 *   node scripts/publish-packages.mjs --dry-run    # everything but the upload, the gate included
 *   node scripts/publish-packages.mjs --out <dir>  # also keep the final tarballs
 *   node scripts/publish-packages.mjs --to npmjs   # publish to npmjs.com, as public packages
 *   node scripts/publish-packages.mjs --to npmjs --tagged   # publish the tagged commit, whose gate passed
 *
 * Auth for GitHub Packages: `NODE_AUTH_TOKEN`, or the GitHub CLI's token
 * (`gh auth token`), which needs the `write:packages` scope
 * (`gh auth refresh -s write:packages`). Auth for npmjs.com: trusted publishing in a
 * GitHub Actions job with `id-token: write`, else `NPM_TOKEN`, else the login in
 * the user's own `~/.npmrc`. A token that does not bypass two-factor
 * authentication stops each upload for a one-time code, so use a granular token
 * that bypasses it.
 *
 * The release is tagged after its first registry receives it: the script makes
 * the annotated tag, and its message records the commit the gate passed on. A
 * second registry receives what the tagged commit holds: with the tag present,
 * the script publishes only from a commit that differs from the tag in this
 * script alone. With `--tagged` it publishes the tag's own commit and reads the
 * gate's result from the tag instead of running the gate again. The publish
 * workflow (`.github/workflows/publish.yml`) does that on a GitHub-hosted runner
 * when the tag is pushed, because npmjs.com's trusted publishing accepts an
 * upload only from there.
 *
 * The registry names and the registry URL come from `@polymorph/registry`
 * (`PUBLISHED_NAMES`, `PUBLISHED_REGISTRY` in `packages/registry/src/install.ts`),
 * the table `polymorph init` writes a new app's aliases from. This script keeps
 * only what is about publishing: the order and what each build bundles.
 */
import { execFileSync } from 'node:child_process'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { createJiti } from 'jiti'

import { publishedRanges, rangeFaults } from './published-ranges.mjs'
import { publishedSideEffects } from './published-side-effects.mjs'

const ROOT = resolve(fileURLToPath(import.meta.url), '../..')
const REPOSITORY = 'https://github.com/metamorph-labs/polymorph'

// TypeScript source, loaded through `jiti` as the repository's bins load theirs.
const { PUBLISHED_NAMES: PUBLISHED, PUBLISHED_REGISTRY: REGISTRY } = await createJiti(
  import.meta.url,
).import(resolve(ROOT, 'packages/registry/src/install.ts'))

/** In publish order: a package's dependencies and peer dependencies go first. */
const PACKAGES = [
  {
    dir: 'packages/engine',
    // Bundled into the engine's build (`packages/engine/vite.config.ts`), types
    // included (`packages/engine/scripts/emit-types.mjs`), so not a dependency of
    // the package.
    bundled: ['@polymorph/theme'],
  },
  // Peer-depends on the engine: `./stylelint/emitted` composes a theme to list
  // the tokens that exist.
  { dir: 'packages/rules', bundled: [] },
  { dir: 'packages/react', bundled: [] },
  // CSS Modules source, packed as it is: `build: false` skips the build and
  // allows the `src/` directory every other package keeps out of its tarball.
  { dir: 'packages/recipes', bundled: [], build: false },
  // Depends on the recipes, which its build compiles in.
  { dir: 'packages/react-ui', bundled: [] },
  // The Vue foundation, on the engine, and the Vue vocabulary on it and the recipes.
  { dir: 'packages/vue', bundled: [] },
  { dir: 'packages/vue-ui', bundled: [] },
  // The Svelte foundation and vocabulary, in the same order. Their builds write their components
  // as source, which the consumer's Svelte compiles (`packages/svelte/scripts/package.mjs`).
  { dir: 'packages/svelte', bundled: [] },
  { dir: 'packages/svelte-ui', bundled: [] },
  // The Solid foundation and vocabulary, in the same order. Each build writes a browser's
  // build and a server's (`packages/solid-ui/vite.build.config.ts`).
  { dir: 'packages/solid', bundled: [] },
  { dir: 'packages/solid-ui', bundled: [] },
  // The elements foundation and vocabulary, on the Solid foundation and vocabulary. The
  // vocabulary's build also writes the files a page with no build loads (`dist/cdn/`), with Solid,
  // Zag and every member bundled (`packages/elements-ui/vite.build.config.ts`).
  { dir: 'packages/elements', bundled: [] },
  { dir: 'packages/elements-ui', bundled: [] },
  // The Angular foundation and vocabulary, in the same order. Each build is Angular's partial
  // compilation, which the consumer's Angular linker finishes (`packages/angular/scripts/package.mjs`).
  { dir: 'packages/angular', bundled: [] },
  { dir: 'packages/angular-ui', bundled: [] },
].map((entry) => {
  const workspaceName = readJson(resolve(ROOT, entry.dir, 'package.json')).name
  const name = PUBLISHED[workspaceName]
  if (!name) fail(`${workspaceName} has no published name in the registry's PUBLISHED_NAMES`)
  return { ...entry, name }
})

const unlisted = Object.keys(PUBLISHED).filter(
  (workspaceName) => !PACKAGES.some(({ name }) => name === PUBLISHED[workspaceName]),
)
if (unlisted.length > 0)
  fail(`the registry publishes ${unlisted.join(', ')}, and this script does not`)

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const outIndex = args.indexOf('--out')
const out = outIndex === -1 ? null : resolve(args[outIndex + 1] ?? '')
const fromTag = args.includes('--tagged')

/**
 * The registries a release can go to. npmjs.com publishes a scoped package as
 * restricted unless it is told otherwise, and an organisation without a paid
 * plan cannot hold a restricted one, so its packages are published as public.
 */
const TARGETS = {
  github: { registry: REGISTRY, variable: 'NODE_AUTH_TOKEN', access: null },
  npmjs: { registry: 'https://registry.npmjs.org', variable: 'NPM_TOKEN', access: 'public' },
}
const toIndex = args.indexOf('--to')
const targetName = toIndex === -1 ? 'github' : (args[toIndex + 1] ?? '')
const TARGET = TARGETS[targetName]
if (!TARGET) fail(`--to takes ${Object.keys(TARGETS).join(' or ')}, not "${targetName}"`)

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function run(command, commandArgs, options = {}) {
  return execFileSync(command, commandArgs, { cwd: ROOT, encoding: 'utf8', ...options })
}

function fail(message) {
  console.error(`publish: ${message}`)
  process.exit(1)
}

/** Rewrites the packed manifest, unpacked in `directory`, for the registry. */
function rewrite(manifest, { name, dir, bundled }, directory) {
  const published = { ...manifest, name }
  delete published.private
  delete published.devDependencies
  delete published.scripts

  Object.assign(published, publishedRanges(published, PUBLISHED, bundled))
  // `sideEffects` names source files for the workspace; the package ships their
  // built counterparts, or none (`published-side-effects.mjs`).
  if (Array.isArray(published.sideEffects)) {
    published.sideEffects = publishedSideEffects(published.sideEffects, directory)
  }
  published.publishConfig = {
    registry: TARGET.registry,
    ...(TARGET.access ? { access: TARGET.access } : {}),
  }
  published.repository = { type: 'git', url: `git+${REPOSITORY}.git`, directory: dir }
  return published
}

/** Fails on what a consumer's resolver would reject, before the upload rather than after. */
function check(directory, manifest, { build = true } = {}) {
  for (const fault of rangeFaults(manifest)) fail(fault)
  const targets = []
  const walk = (value) => {
    if (typeof value === 'string') targets.push(value)
    else if (value && typeof value === 'object') Object.values(value).forEach(walk)
  }
  walk(manifest.exports)
  walk(manifest.bin)
  // A pattern target (`./src/*.module.css`) is checked by the directory its
  // `*` expands under.
  const missing = targets.filter((target) => !existsSync(resolve(directory, target.split('*')[0])))
  if (missing.length > 0)
    fail(`${manifest.name} exports or runs files it does not ship: ${missing.join(', ')}`)
  if (build && existsSync(resolve(directory, 'src'))) {
    fail(`${manifest.name} ships its src/ directory`)
  }
}

/**
 * The npm arguments and environment that authenticate an upload. A token stays
 * in the environment; the config file written for it only names the variable.
 * Without `NPM_TOKEN`, npmjs.com is reached with the login in the user's own
 * `~/.npmrc`, which is checked here so that a missing login fails before the gate.
 */
function authConfig() {
  const host = TARGET.registry.replace(/^https:\/\//, '')
  // Trusted publishing: in a GitHub Actions job with `id-token: write`, npm trades
  // the job's identity token for a short-lived upload token itself.
  if (
    targetName === 'npmjs' &&
    !process.env.NPM_TOKEN &&
    process.env.ACTIONS_ID_TOKEN_REQUEST_URL
  ) {
    console.log('publish: npmjs.com through trusted publishing')
    return { config: null, args: ['--registry', TARGET.registry], env: process.env }
  }
  const fromGh = targetName === 'github' ? () => run('gh', ['auth', 'token']).trim() : () => ''
  const token = process.env[TARGET.variable] || fromGh()
  if (!token && targetName === 'npmjs') {
    try {
      const user = run('npm', ['whoami', '--registry', TARGET.registry], { stdio: 'pipe' }).trim()
      console.log(`publish: npmjs.com as ${user}`)
    } catch {
      fail('no npmjs.com login: set NPM_TOKEN, or log in with `npm login`')
    }
    return { config: null, args: ['--registry', TARGET.registry], env: process.env }
  }
  if (!token) fail(`no token: set ${TARGET.variable} or log in with \`gh auth login\``)
  const config = join(mkdtempSync(join(tmpdir(), 'polymorph-npmrc-')), '.npmrc')
  writeFileSync(config, `//${host}/:_authToken=\${${TARGET.variable}}\n`)
  return {
    config,
    args: ['--registry', TARGET.registry, '--userconfig', config],
    env: { ...process.env, [TARGET.variable]: token },
  }
}

function clean() {
  return run('git', ['status', '--porcelain']).trim() === ''
}

/**
 * The laws are the release's precondition. Nothing else runs them before an
 * upload: there is no hosted CI, and a tarball cut from a commit whose gate
 * never ran would carry a vocabulary nobody checked for contrast or
 * completeness. It is `pnpm gate` itself rather than a subset, so a release
 * promises exactly what the gate checks. A dry run runs it too, because a dry
 * run is the whole release except the upload.
 */
function gate() {
  console.log('publish: running the gate')
  try {
    run('pnpm', ['gate'], { stdio: 'inherit' })
  } catch {
    fail('the gate is red: fix it, then publish from the commit that passes')
  }
}

/**
 * `--tagged` stands in for the gate on a runner that cannot run it: the browser
 * projects, the native laws' toolchains and the gate's length belong on the
 * owner's machine. The gate ran there, on this commit, before the first upload
 * made the tag, and the tag's message says so (`GATE_RECORD`). A lightweight tag,
 * a tag without that line, or a checkout that is not the tag's commit is
 * refused. A dry run uploads nothing and reads no tag, so the workflow can be
 * tried on any branch.
 */
function recordedGate() {
  if (dryRun) return
  if (!tagged) fail(`--tagged needs the tag v${release}`)
  const commit = run('git', ['rev-parse', `v${release}^{commit}`]).trim()
  if (commit !== HEAD) fail(`HEAD is not v${release}: check out the tag`)
  const [type, ...message] = run('git', [
    'for-each-ref',
    `refs/tags/v${release}`,
    '--format=%(objecttype)%0a%(contents)',
  ]).split('\n')
  if (type !== 'tag' || !message.includes(GATE_RECORD))
    fail(`v${release} records no gate that passed on ${HEAD}: publish from a machine that runs it`)
  console.log(`publish: v${release} records that the gate passed on ${HEAD}`)
}

/**
 * The release's version. Every package carries it and the release tag is `v`
 * and that version, so the tag is derived here and never typed. A package at
 * another version, or a tag that already exists, means `pnpm version-packages`
 * has not run for this release.
 */
function releaseVersion() {
  const versions = PACKAGES.map(({ dir }) => [
    dir,
    readJson(resolve(ROOT, dir, 'package.json')).version,
  ])
  const distinct = [...new Set(versions.map(([, version]) => version))]
  if (distinct.length !== 1) {
    const listed = versions.map(([dir, version]) => `${dir} ${version}`).join(', ')
    fail(`the packages disagree on the release's version: ${listed}`)
  }
  return distinct[0]
}

const release = releaseVersion()
const tagged = run('git', ['tag', '--list', `v${release}`]).trim() !== ''
const HEAD = run('git', ['rev-parse', 'HEAD']).trim()
/** The line the release tag's message carries once the gate has passed on its commit. */
const GATE_RECORD = `Gate: passed at ${HEAD}`
if (!dryRun && !fromTag && tagged && targetName === 'github')
  fail(`v${release} is already a release — run \`pnpm version-packages\` first`)
// A second registry receives what the first one did. The script that uploads may
// have changed since the tag, for that registry; nothing it builds or packs may.
const SELF = 'scripts/publish-packages.mjs'
if (!dryRun && tagged) {
  const changed = run('git', ['diff', '--name-only', `v${release}`, 'HEAD'])
    .split('\n')
    .filter((path) => path !== '' && path !== SELF)
  if (changed.length > 0)
    fail(
      `HEAD differs from v${release} in ${changed.join(', ')}: publish ${release} from v${release}`,
    )
}

if (!dryRun && !clean()) fail('the working tree is not clean — publish from a commit')

// Auth before the gate, so a missing token fails in seconds rather than after it.
const auth = dryRun ? null : authConfig()
if (fromTag) recordedGate()
else gate()
// Everything the gate writes is gitignored. If that ever stops being true, the
// tarballs would be cut from a tree that is not the commit.
if (!dryRun && !clean()) fail('the gate changed tracked files: commit them, then publish')

const work = mkdtempSync(join(tmpdir(), 'polymorph-publish-'))

for (const entry of PACKAGES) {
  const directory = resolve(ROOT, entry.dir)
  const workspaceName = readJson(resolve(directory, 'package.json')).name
  if (entry.build !== false) {
    console.log(`publish: building ${workspaceName}`)
    run('pnpm', ['--filter', workspaceName, 'build'], { stdio: 'inherit' })
  }

  const packed = resolve(work, entry.name.replace(/[@/]/g, '_'))
  mkdirSync(packed, { recursive: true })
  run('pnpm', ['pack', '--pack-destination', packed], { cwd: directory })
  const tarball = readdirSync(packed).find((file) => file.endsWith('.tgz'))
  if (!tarball) fail(`pnpm pack wrote no tarball for ${workspaceName}`)
  run('tar', ['-xzf', resolve(packed, tarball), '-C', packed])

  const contents = resolve(packed, 'package')
  // The licence and notices live at the repository root; every package ships them.
  for (const file of ['LICENSE', 'NOTICE'])
    copyFileSync(resolve(ROOT, file), resolve(contents, file))
  const manifest = rewrite(readJson(resolve(contents, 'package.json')), entry, contents)
  writeFileSync(resolve(contents, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  check(contents, manifest, entry)

  const label = `${manifest.name}@${manifest.version}`
  if (out) {
    mkdirSync(out, { recursive: true })
    const file = run('npm', ['pack', contents, '--pack-destination', out]).trim().split('\n').pop()
    console.log(`publish: ${label} → ${join(out, file)}`)
  }

  const npm = auth ? auth.args : ['--registry', TARGET.registry]
  let existing = ''
  try {
    existing = run('npm', ['view', label, 'version', ...npm], {
      env: auth?.env ?? process.env,
      stdio: 'pipe',
    }).trim()
  } catch {
    // Not found is the expected answer.
  }
  // From the tag the contents are fixed, so a package already uploaded is the same
  // tarball, and a run that stopped part-way is finished by running it again. A dry
  // run has packed and checked the package already, and npm's own dry run would
  // refuse the version.
  if (existing && (fromTag || dryRun)) {
    console.log(`publish: ${label} is already on ${TARGET.registry}, skipped`)
    continue
  }
  if (existing) fail(`${label} is already published — bump the version with changesets first`)

  if (dryRun) {
    run('npm', ['publish', contents, '--dry-run', '--registry', TARGET.registry], {
      stdio: 'inherit',
    })
    console.log(`publish: ${label} — dry run, not uploaded`)
    continue
  }

  const access = TARGET.access ? ['--access', TARGET.access] : []
  run('npm', ['publish', contents, ...access, ...npm], { env: auth.env, stdio: 'inherit' })
  console.log(`publish: ${label} published`)
}

rmSync(work, { recursive: true, force: true })
if (auth?.config) rmSync(auth.config, { force: true })

if (!dryRun && tagged) console.log(`publish: ${release} is published to ${TARGET.registry}`)
else if (!dryRun) {
  run('git', ['tag', '-a', `v${release}`, '-m', `Release ${release}`, '-m', GATE_RECORD])
  console.log(`publish: ${release} is published and tagged v${release}. Push the tag by name;`)
  console.log('the publish workflow then uploads the tagged commit to npmjs.com:')
  console.log(`  git push origin main v${release}`)
}
