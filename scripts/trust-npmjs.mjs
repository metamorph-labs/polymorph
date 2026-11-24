#!/usr/bin/env node
/**
 * `node scripts/trust-npmjs.mjs` makes the publish workflow
 * (`.github/workflows/publish.yml` in metamorph-labs/polymorph) the trusted
 * publisher of every package `PUBLISHED_NAMES` lists, on npmjs.com. After that
 * the workflow uploads with no token, and each package can refuse tokens
 * altogether.
 *
 * It runs once per package, from the owner's machine: logged in to npmjs.com as an
 * owner of the packages (`npm login`), with npm 11.15 or later. npm asks for a
 * one-time code. A package must exist on npmjs.com before it can trust a
 * publisher, so a new package's first release goes up with
 * `node scripts/publish-packages.mjs --to npmjs`, and this runs after it.
 * A package that already trusts the workflow is reported and left as it is.
 *
 *   node scripts/trust-npmjs.mjs            # add the trusted publisher
 *   node scripts/trust-npmjs.mjs --dry-run  # say what it would add
 */
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { createJiti } from 'jiti'

const ROOT = resolve(fileURLToPath(import.meta.url), '../..')
const REPOSITORY = 'metamorph-labs/polymorph'
const WORKFLOW = 'publish.yml'
const REGISTRY = 'https://registry.npmjs.org'

const { PUBLISHED_NAMES } = await createJiti(import.meta.url).import(
  resolve(ROOT, 'packages/registry/src/install.ts'),
)
const dryRun = process.argv.includes('--dry-run')

for (const name of Object.values(PUBLISHED_NAMES)) {
  let listed = ''
  try {
    listed = execFileSync('npm', ['trust', 'list', name, '--json', '--registry', REGISTRY], {
      encoding: 'utf8',
      stdio: ['inherit', 'pipe', 'inherit'],
    })
  } catch {
    // A package with no trusted publisher can answer with an error.
  }
  if (listed.includes(REPOSITORY) && listed.includes(WORKFLOW)) {
    console.log(`trust: ${name} already trusts ${REPOSITORY} ${WORKFLOW}`)
    continue
  }
  const args = ['trust', 'github', name, '--repo', REPOSITORY, '--file', WORKFLOW]
  args.push('--allow-publish', '--yes', '--registry', REGISTRY)
  if (dryRun) args.push('--dry-run')
  execFileSync('npm', args, { stdio: 'inherit' })
  console.log(`trust: ${name} trusts ${REPOSITORY} ${WORKFLOW}${dryRun ? ' (dry run)' : ''}`)
}
