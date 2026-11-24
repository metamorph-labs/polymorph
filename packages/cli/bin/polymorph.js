#!/usr/bin/env node
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { createJiti } from 'jiti'

/**
 * `polymorph`, the installer's entry point.
 *
 * Plain JS run through `jiti`, like `bin/registry.js` and `bin/inventory.js`.
 * Node runs this file directly. Everything it calls is TypeScript, because the
 * MCP server and the tests import the same functions.
 *
 * There are two separate roots. `SOURCE` is this repository, which holds the
 * vocabulary an install copies from. `ROOT` is the directory the command runs
 * in, which is the consumer's repository. Mixing them up would vendor a project
 * into itself, so they are separate arguments throughout, and nothing below
 * `run` reads `process.cwd()`.
 *
 * The registry is built here instead of read from a file because it is never
 * committed. The catalogue is whatever the publishing tree produces, and for a
 * workspace-local install that tree is this one. The published tools
 * (`packages/tools`) read the `registry.json` they ship instead, and `main`
 * receives the same shape either way.
 */

const SOURCE = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const ROOT = process.cwd()

const jiti = createJiti(import.meta.url)
const { buildRegistry } = await jiti.import(resolve(SOURCE, 'packages/registry/src/build.ts'))
const { main } = await jiti.import(resolve(SOURCE, 'packages/cli/src/cli.ts'))

const { code } = await main(
  {
    root: ROOT,
    source: SOURCE,
    registry: buildRegistry(SOURCE),
    out: (line) => console.log(line),
    // What `polymorph init` wires a new app to: this checkout's MCP server,
    // which its `.mcp.json` launches by its path on this machine, and the
    // screen emitter it runs once, with the node that runs this file.
    programs: {
      mcp: { command: 'node', args: [resolve(SOURCE, 'packages/mcp/bin/polymorph-mcp.js')] },
      emit: { command: process.execPath, args: [resolve(SOURCE, 'packages/spec/bin/emit.js')] },
    },
    origin: 'checkout',
  },
  process.argv.slice(2),
)

process.exit(code)
