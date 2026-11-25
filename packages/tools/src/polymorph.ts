import { main, type ServerStarter, type ToolCaller } from '@polymorph/cli'

import { shippedContext, shippedPrograms, shippedRegistry, SOURCE } from './shipped'

/**
 * `polymorph`, the published CLI: the checkout's `polymorph`, with the
 * registry and the source tree this package ships, so it needs no checkout.
 *
 * There are two roots, as in the checkout's bin. `SOURCE` is this package's
 * `dist/`, which holds the vocabulary an install copies from. The directory
 * the command runs in is the consumer's repository, and the tools' project.
 *
 * The verbs that ask the MCP tools call them through `tools`, and `mcp` starts
 * the server through `serve`, each built from the bundled server the first
 * time a verb needs it, over the shipped registry, the shipped source tree and
 * the shipped screen page. So `add` and `diff` never load the linters or the
 * MCP SDK the tools carry.
 *
 * The exit code is set, not forced, so a long report printed to a pipe is not
 * cut off.
 */

const root = process.cwd()
const registry = shippedRegistry()

let caller: ToolCaller | undefined
const tools: ToolCaller = async (name, args) => {
  if (caller === undefined) {
    const { toolCaller } = await import('@polymorph/mcp')
    caller = toolCaller(shippedContext(root, registry))
  }
  return caller(name, args)
}

const serve: ServerStarter = async ({ project }) => {
  const { serveStdio } = await import('@polymorph/mcp')
  await serveStdio(shippedContext(project, registry))
}

const { code } = await main(
  {
    root,
    source: SOURCE,
    registry,
    out: (line) => console.log(line),
    err: (line) => console.error(line),
    programs: shippedPrograms(registry),
    origin: 'published',
    tools,
    serve,
  },
  process.argv.slice(2),
)
process.exitCode = code
