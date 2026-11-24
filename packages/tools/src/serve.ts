import { resolve } from 'node:path'

import { SERVER_FLAGS, serverFlags, ServerFlagsError } from '@polymorph/mcp/flags'

/**
 * Starts the MCP server over stdio, from the arguments after the program's
 * name: `polymorph-mcp [--project <path>] [--read-only]`, and
 * `polymorph mcp` with the same flags.
 *
 * The flags are read by the parser the checkout's server reads them with, and
 * refused before the server is loaded. The project is resolved here, against
 * the directory the server was started in, because a client starts a stdio
 * server in the repository it works on. stdout carries only protocol frames,
 * so every refusal goes to stderr.
 */
export async function serve(program: string, argv: readonly string[]): Promise<void> {
  const refuse = (reason: string): never => {
    console.error(`${program}: ${reason}`)
    process.exit(1)
  }

  let readOnly = false
  let project: string | undefined
  try {
    ;({ readOnly, project } = serverFlags(argv))
  } catch (error) {
    if (!(error instanceof ServerFlagsError)) throw error
    refuse(`${error.message}\nusage: ${program} ${SERVER_FLAGS}`)
  }

  const [{ serveStdio }, { shippedContext }] = await Promise.all([
    import('@polymorph/mcp'),
    import('./shipped'),
  ])
  try {
    await serveStdio(shippedContext(readOnly ? undefined : resolve(process.cwd(), project ?? '.')))
  } catch (error) {
    refuse(error instanceof Error ? error.message : String(error))
  }
}
