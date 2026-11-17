#!/usr/bin/env node
/**
 * `pnpm publish:packages` publishes the installable packages to GitHub
 * Packages: `@polymorph/engine`, `@polymorph/rules`, `@polymorph/react`,
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
 * Steps: `pnpm gate`, then per package: build, `pnpm pack` (which applies
 * `publishConfig` and pins `workspace:` ranges), rewrite the packed manifest for
 * the registry, check it, publish it. `@polymorph/recipes` has no build: it
 * publishes its `src/` as it is, and the consumer's bundler compiles it.
 *
 *   node scripts/publish-packages.mjs              # publish
 *   node scripts/publish-packages.mjs --dry-run    # everything but the upload, the gate included
 *   node scripts/publish-packages.mjs --out <dir>  # also keep the final tarballs
 *
 * Auth: `NODE_AUTH_TOKEN`, or the GitHub CLI's token (`gh auth token`), which
 * needs the `write:packages` scope (`gh auth refresh -s write:packages`).
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
  published.publishConfig = { registry: REGISTRY }
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

function authConfig() {
  const token = process.env.NODE_AUTH_TOKEN || run('gh', ['auth', 'token']).trim()
  if (!token) fail('no token: set NODE_AUTH_TOKEN or log in with `gh auth login`')
  const config = join(mkdtempSync(join(tmpdir(), 'polymorph-npmrc-')), '.npmrc')
  // The token stays in the environment; the file only names the variable.
  writeFileSync(config, `//npm.pkg.github.com/:_authToken=\${NODE_AUTH_TOKEN}\n`)
  return { config, env: { ...process.env, NODE_AUTH_TOKEN: token } }
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
if (!dryRun && run('git', ['tag', '--list', `v${release}`]).trim() !== '')
  fail(`v${release} is already a release — run \`pnpm version-packages\` first`)

if (!dryRun && !clean()) fail('the working tree is not clean — publish from a commit')

// Auth before the gate, so a missing token fails in seconds rather than after it.
const auth = dryRun ? null : authConfig()
gate()
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

  if (dryRun) {
    run('npm', ['publish', contents, '--dry-run', '--registry', REGISTRY], { stdio: 'inherit' })
    console.log(`publish: ${label} — dry run, not uploaded`)
    continue
  }

  const npm = ['--registry', REGISTRY, '--userconfig', auth.config]
  let existing = ''
  try {
    existing = run('npm', ['view', label, 'version', ...npm], {
      env: auth.env,
      stdio: 'pipe',
    }).trim()
  } catch {
    // Not found is the expected answer.
  }
  if (existing) fail(`${label} is already published — bump the version with changesets first`)

  run('npm', ['publish', contents, ...npm], { env: auth.env, stdio: 'inherit' })
  console.log(`publish: ${label} published`)
}

rmSync(work, { recursive: true, force: true })
if (auth) rmSync(auth.config, { force: true })

if (!dryRun) {
  console.log(`publish: ${release} is published. Tag the release commit and push it:`)
  console.log(`  git tag -a v${release} -m "Release ${release}"`)
  console.log(`  git push origin main v${release}`)
}
