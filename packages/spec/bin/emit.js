#!/usr/bin/env node
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { createJiti } from 'jiti'

/**
 * `pnpm emit <spec.json> [out.tsx]` emits a screen from its spec.
 *
 * The command itself is `emitCommand` (`src/command.ts`), which says what each
 * output and flag emits and what it refuses. This file is its checkout entry
 * point: it builds the registry from this tree, as the repository's other bins
 * do, and reads the native member packages from it. The published tools run
 * the same function over the registry they ship.
 *
 * This file is plain JS loaded through `jiti`, like the repository's other bins, so
 * node runs it directly. Everything it calls is TypeScript because the MCP
 * server imports the same functions.
 */

const SOURCE = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')

const jiti = createJiti(import.meta.url)
const { buildRegistry } = await jiti.import(resolve(SOURCE, 'packages/registry/src/build.ts'))
const { emitCommand } = await jiti.import(resolve(SOURCE, 'packages/spec/src/command.ts'))

// The exit code is set, not forced: a forced exit can cut off a screen printed to a pipe.
process.exitCode = await emitCommand({
  // Built when the command first needs it, after the refusals that need none.
  registry: () => buildRegistry(SOURCE),
  source: SOURCE,
  cwd: process.cwd(),
  argv: process.argv.slice(2),
  print: (text) => process.stdout.write(text),
  complain: (line) => console.error(line),
})
