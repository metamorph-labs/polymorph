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
 * The arguments are parsed strictly, before anything is loaded. An unknown
 * flag stops the server instead of being ignored. Otherwise a mistyped
 * `--readonly` would be ignored, and someone who asked for a read-only server
 * would get one that writes.
 *
 * `render_screen` draws in a page the workbench owns. This file names the
 * program that builds it, as it names the two roots, and the tool runs that
 * program the first time it is called (`src/render.ts`).
 *
 * `polymorph mcp` starts the same server through the same function
 * (`src/stdio.ts`), with the same two flags.
 *
 * A published package would read the `registry.json` shipped beside it instead
 * of building one, and the tools would behave the same.
 */

const USAGE = 'usage: polymorph-mcp [--project <path>] [--read-only]'

/** Exits with a message on stderr. stdout is the protocol, and no client is connected yet. */
function refuse(reason) {
  console.error(`polymorph-mcp: ${reason}\n${USAGE}`)
  process.exit(1)
}

function options(argv) {
  let project
  let readOnly = false

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--read-only') {
      readOnly = true
    } else if (argument === '--project') {
      index += 1
      project = argv[index]
      if (project === undefined || project.startsWith('--')) refuse('`--project` needs a path')
    } else if (argument.startsWith('--project=')) {
      project = argument.slice('--project='.length)
      if (project === '') refuse('`--project` needs a path')
    } else {
      refuse(`unknown argument "${argument}"`)
    }
  }

  return { project, readOnly }
}

const { project, readOnly } = options(process.argv.slice(2))

const SOURCE = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const PROJECT = readOnly ? undefined : resolve(process.cwd(), project ?? '.')

const jiti = createJiti(import.meta.url)
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
