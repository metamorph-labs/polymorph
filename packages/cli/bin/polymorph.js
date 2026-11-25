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
 *
 * The verbs that ask the MCP tools (`card`, `validate`, `render`, …) and `mcp`
 * need the server's code, which `packages/cli/src` may not import. So this file
 * builds both functions from `packages/mcp/src` with the context the MCP bin
 * builds: the registry, this checkout as the root the vocabulary is read from,
 * the working directory as the project, and the workbench's screen builder.
 * Each is loaded the first time a verb calls it, so `add` or `diff` never loads
 * the linters the tools carry.
 */

const SOURCE = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const ROOT = process.cwd()

const jiti = createJiti(import.meta.url)
const { buildRegistry } = await jiti.import(resolve(SOURCE, 'packages/registry/src/build.ts'))
const { main } = await jiti.import(resolve(SOURCE, 'packages/cli/src/cli.ts'))

const registry = buildRegistry(SOURCE)

/** The context the MCP server is built from, for a project or for none. */
const context = (project) => ({
  registry,
  root: SOURCE,
  project,
  screenBuilder: resolve(SOURCE, 'apps/workbench/screen.build.mjs'),
})

let caller
const tools = async (name, args) => {
  if (caller === undefined) {
    const { toolCaller } = await jiti.import(resolve(SOURCE, 'packages/mcp/src/oneshot.ts'))
    caller = toolCaller(context(ROOT))
  }
  return caller(name, args)
}

const serve = async ({ project }) => {
  const { serveStdio } = await jiti.import(resolve(SOURCE, 'packages/mcp/src/stdio.ts'))
  await serveStdio(context(project))
}

const { code } = await main(
  {
    root: ROOT,
    source: SOURCE,
    registry,
    out: (line) => console.log(line),
    err: (line) => console.error(line),
    // What `polymorph init` and `agents` wire a project to: this checkout's MCP
    // server, which its `.mcp.json` launches by its path on this machine, and
    // the screen emitter `init` runs once, with the node that runs this file.
    programs: {
      mcp: { command: 'node', args: [resolve(SOURCE, 'packages/mcp/bin/polymorph-mcp.js')] },
      emit: { command: process.execPath, args: [resolve(SOURCE, 'packages/spec/bin/emit.js')] },
      // What the agent files `init` and `agents` write name before a verb: this bin.
      polymorph: { command: 'node', args: [resolve(SOURCE, 'packages/cli/bin/polymorph.js')] },
    },
    origin: 'checkout',
    tools,
    serve,
  },
  process.argv.slice(2),
)

process.exit(code)
