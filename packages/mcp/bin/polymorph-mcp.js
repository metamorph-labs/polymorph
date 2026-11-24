#!/usr/bin/env node
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { createJiti } from 'jiti'

/**
 * `polymorph-mcp`, the server over stdio.
 *
 * Point an MCP client at this file. There is no port, no auth and nothing to
 * deploy. It is a local package run against the consumer's own repository, so
 * it works with every client and needs no hosting.
 *
 * **Nothing may be written to stdout except protocol frames.** stdout is the
 * transport, so a stray `console.log` anywhere below produces a corrupt
 * JSON-RPC message and the client disconnects. Diagnostics go to stderr. That
 * is why the failure path below uses `console.error`, and why the registry
 * build, which prints nothing, runs before the transport is connected.
 *
 * There are two separate roots, as in `bin/polymorph.js`. `SOURCE` is this
 * repository, which holds the vocabulary the server answers questions about.
 * The project is the repository being worked on, and it is the only place the
 * write tools write. By default the project is the working directory, because
 * an agent working in a repository starts its stdio servers there.
 * `--project <path>` names another, for a client that starts servers somewhere
 * else. Nothing below this file reads `process.cwd()`.
 * `--read-only` starts the server with no project, and a server with no
 * project registers no write tool.
 *
 * The arguments are parsed strictly, before the server is loaded, by the
 * parser every entry point shares (`src/flags.ts`). An unknown flag stops the
 * server instead of being ignored. Otherwise a mistyped `--readonly` would be
 * ignored, and someone who asked for a read-only server would get one that
 * writes.
 *
 * `render_screen` draws in a page the workbench owns. This file names the
 * program that builds it, as it names the two roots, and the tool runs that
 * program the first time it is called (`src/render.ts`).
 *
 * The published tools (`packages/tools`) start the same server from the
 * `registry.json` and the built page they ship, with no build.
 */

const SOURCE = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const jiti = createJiti(import.meta.url)

const { SERVER_FLAGS, serverFlags, ServerFlagsError } = await jiti.import(
  resolve(SOURCE, 'packages/mcp/src/flags.ts'),
)

/** Exits with a message on stderr. stdout is the protocol, and no client is connected yet. */
function refuse(reason) {
  console.error(`polymorph-mcp: ${reason}\nusage: polymorph-mcp ${SERVER_FLAGS}`)
  process.exit(1)
}

let flags
try {
  flags = serverFlags(process.argv.slice(2))
} catch (error) {
  if (!(error instanceof ServerFlagsError)) throw error
  refuse(error.message)
}

const PROJECT = flags.readOnly ? undefined : resolve(process.cwd(), flags.project ?? '.')

const { buildRegistry } = await jiti.import(resolve(SOURCE, 'packages/registry/src/build.ts'))
const { serveStdio } = await jiti.import(resolve(SOURCE, 'packages/mcp/src/stdio.ts'))

try {
  await serveStdio({
    registry: buildRegistry(SOURCE),
    root: SOURCE,
    project: PROJECT,
    screenBuilder: resolve(SOURCE, 'apps/workbench/screen.build.mjs'),
  })
} catch (error) {
  console.error(`polymorph-mcp: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
}
