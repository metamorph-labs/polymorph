#!/usr/bin/env node
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  collectExceptions,
  formatTable,
  hostedLibraries,
  NAMELESS_BOUNDARY,
} from '../src/inventory.js'

/**
 * `pnpm inventory`.
 *
 * Prints the table, writes the machine-readable copy, and exits non-zero on an
 * undeclared deviation: a bare `eslint-disable` naming one of this plugin's rules
 * that is not inside a `<Bespoke>`, or a `<ThirdParty>` that writes no `library`
 * out. Declared exceptions never fail. The ladder is
 * meant to be used, and a build that failed on rung 4 would push people back to
 * the bare disable comment that rung 4 replaces. After the count it names the
 * libraries the `<ThirdParty>` boundaries host.
 *
 * The JSON is a report, not a source of truth. It is gitignored, regenerated on
 * demand, and nothing reads it back. No generated intermediates live in the
 * repo, so nothing here needs a freshness test.
 */

const root = process.cwd()
const exceptions = collectExceptions(root)

process.stdout.write(formatTable(exceptions))

const out = resolve(root, 'exceptions.json')
writeFileSync(out, `${JSON.stringify(exceptions, null, 2)}\n`)

const undeclared = exceptions.filter((exception) => exception.rung === null)
const nameless = undeclared.filter((exception) => exception.kind === NAMELESS_BOUNDARY)
const disables = undeclared.length - nameless.length
if (disables > 0) {
  process.stderr.write(
    `\n${disables} undeclared deviation(s). A rule turned off by hand is a decision ` +
      `nobody can find later — wrap the code in <Bespoke reason="…"> so it appears above.\n`,
  )
}
if (nameless.length > 0) {
  process.stderr.write(
    `\n${nameless.length} <ThirdParty> with no library written out. A boundary hosts nothing ` +
      `until it names the package it hosts: <ThirdParty library="…" reason="…">.\n`,
  )
}
if (undeclared.length > 0) process.exit(1)

process.stdout.write(`\n${exceptions.length} declared exception(s). Written to ${out}\n`)

const hosted = hostedLibraries(exceptions)
if (hosted.length > 0) {
  process.stdout.write(
    `${hosted.length} hosted librar${hosted.length === 1 ? 'y' : 'ies'}: ${hosted.join(', ')}\n`,
  )
}
