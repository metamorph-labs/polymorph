#!/usr/bin/env node
/**
 * `node scripts/trust-npmjs.mjs` makes the publish workflow
 * (`.github/workflows/publish.yml` in metamorph-labs/polymorph) the trusted
 * publisher of every package `PUBLISHED_NAMES` lists, on npmjs.com. After that
 * the workflow uploads with no token, and each package can refuse tokens
 * altogether.
 *
 * It runs from the owner's machine, in a terminal: logged in to npmjs.com as an
 * owner of the packages (`npm login`), with npm 11.15 or later. A package must
 * exist on npmjs.com before it can trust a publisher, so a new package's first
 * release goes up with `node scripts/publish-packages.mjs --to npmjs`, and this
 * runs after it.
 *
 * npm asks for an approval in the browser before it adds a publisher. Its
 * approval page offers to skip the approval for five minutes, and one approval
 * with that option covers the packages that follow.
 *
 * The run can be repeated. npm refuses a second publisher for a package, so the
 * script asks npm which publisher a package trusts and leaves a package that
 * names the workflow as it is. npm answers that question only inside the five
 * minutes: the script reads the answer from a pipe, and npm asks for an
 * approval only on a terminal. A package npm does not answer for is added, and
 * one whose add fails is asked about once more, because the approval that add
 * asked for can open the five minutes.
 *
 * A package that fails does not stop the run. The run names each one at its
 * end and exits non-zero.
 *
 *   node scripts/trust-npmjs.mjs            # add the trusted publisher
 *   node scripts/trust-npmjs.mjs --dry-run  # say what it would add
 */
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { setTimeout as pause } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'

import { createJiti } from 'jiti'

const ROOT = resolve(fileURLToPath(import.meta.url), '../..')
const REPOSITORY = 'metamorph-labs/polymorph'
const WORKFLOW = 'publish.yml'
const REGISTRY = 'https://registry.npmjs.org'
/** npm's help for `npm trust` asks for two seconds between calls, to stay under its rate limit. */
const PAUSE_MS = 2000

const { PUBLISHED_NAMES } = await createJiti(import.meta.url).import(
  resolve(ROOT, 'packages/registry/src/install.ts'),
)
const dryRun = process.argv.includes('--dry-run')

/**
 * Whether npm says the package trusts the workflow. `undefined` is no answer:
 * npm wants an approval it cannot ask for here, or the package has no
 * publisher and npm reports that as an error. npm's error text is dropped,
 * because no answer is an expected outcome and the add that follows reports its
 * own.
 */
function trustsTheWorkflow(name) {
  try {
    const listed = execFileSync('npm', ['trust', 'list', name, '--json', '--registry', REGISTRY], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    return listed.includes(REPOSITORY) && listed.includes(WORKFLOW)
  } catch {
    return undefined
  }
}

const names = Object.values(PUBLISHED_NAMES)
const failed = []

console.log(
  'trust: npm opens an approval page in the browser. Its option to skip the approval for five minutes covers the packages that follow.',
)

for (const [index, name] of names.entries()) {
  if (index > 0) await pause(PAUSE_MS)
  if (trustsTheWorkflow(name)) {
    console.log(`trust: ${name} already trusts ${REPOSITORY} ${WORKFLOW}`)
    continue
  }
  const args = ['trust', 'github', name, '--repo', REPOSITORY, '--file', WORKFLOW]
  args.push('--allow-publish', '--yes', '--registry', REGISTRY)
  if (dryRun) args.push('--dry-run')
  try {
    execFileSync('npm', args, { stdio: 'inherit' })
    console.log(`trust: ${name} trusts ${REPOSITORY} ${WORKFLOW}${dryRun ? ' (dry run)' : ''}`)
  } catch {
    if (trustsTheWorkflow(name)) {
      console.log(`trust: ${name} already trusts ${REPOSITORY} ${WORKFLOW}`)
    } else {
      failed.push(name)
      console.error(`trust: ${name} was not added. npm's error is above.`)
    }
  }
}

if (failed.length > 0) {
  console.error(
    [
      `trust: ${failed.length} of ${names.length} packages were not added:`,
      ...failed.map((name) => `  ${name}`),
      'npm refuses a second publisher, so a package that already trusts the workflow is listed here when npm did not answer for it.',
      'To see what a package trusts, run in a terminal: npm trust list <package>',
    ].join('\n'),
  )
  process.exit(1)
}
