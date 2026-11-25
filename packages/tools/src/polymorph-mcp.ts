import { resolve } from 'node:path'

import { SERVER_FLAGS, serverFlags, ServerFlagsError, type ServerFlags } from '@polymorph/cli'

import { shippedContext } from './shipped'

/**
 * `polymorph-mcp`, the published MCP server over stdio: the checkout's
 * `polymorph-mcp`, with the registry and the files this package ships, and
 * the server `polymorph mcp` starts. Point an MCP client at
 * `npx -y @metamorph-labs/polymorph@<range> mcp`, or at this bin where the
 * package is installed.
 *
 * The flags are read by the parser everything that starts the server reads
 * them with, and refused before the server is loaded. The project is resolved
 * against the directory the server was started in, because a client starts a
 * stdio server in the repository it works on. stdout carries only protocol
 * frames, so every refusal goes to stderr.
 */

/** Exits with a message on stderr. stdout is the protocol, and no client is connected yet. */
function refuse(reason: string): never {
  console.error(`polymorph-mcp: ${reason}`)
  process.exit(1)
}

let flags: ServerFlags = { readOnly: false }
try {
  flags = serverFlags(process.argv.slice(2))
} catch (error) {
  if (!(error instanceof ServerFlagsError)) throw error
  refuse(`${error.message}\nusage: polymorph-mcp ${SERVER_FLAGS}`)
}

const { serveStdio } = await import('@polymorph/mcp')
try {
  await serveStdio(
    shippedContext(flags.readOnly ? undefined : resolve(process.cwd(), flags.project ?? '.')),
  )
} catch (error) {
  refuse(error instanceof Error ? error.message : String(error))
}
