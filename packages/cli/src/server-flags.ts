/**
 * The MCP server's command line: `[--project <path>] [--read-only]`.
 *
 * Everything that starts the server reads its arguments here: `polymorph mcp`
 * (`tool-verbs.ts`), the checkout's `packages/mcp/bin/polymorph-mcp.js` and the
 * published tools' `polymorph-mcp`. So one command line starts the same server
 * however it is run. It lives in this package, which the server's package
 * depends on, so the CLI's verb can read it too; `@polymorph/mcp` re-exports
 * it.
 *
 * The arguments are parsed strictly. An unknown flag stops the server instead
 * of being ignored. Otherwise a mistyped `--readonly` would be ignored, and
 * someone who asked for a read-only server would get one that writes.
 *
 * This module imports nothing, so an entry point reads its arguments, and
 * refuses wrong ones, before it loads the server.
 */

export interface ServerFlags {
  /** The project as given, relative to the directory the server was started in. */
  project?: string
  /** A server with no project, which registers no write tool. */
  readOnly: boolean
}

/** The flags, after the program's name in a usage line. */
export const SERVER_FLAGS = '[--project <path>] [--read-only]'

/** A command line the server does not accept. The message says which argument and why. */
export class ServerFlagsError extends Error {
  override name = 'ServerFlagsError'
}

export function serverFlags(argv: readonly string[]): ServerFlags {
  let project: string | undefined
  let readOnly = false

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index] as string
    if (argument === '--read-only') {
      readOnly = true
    } else if (argument === '--project') {
      index += 1
      project = argv[index]
      if (project === undefined || project.startsWith('--')) {
        throw new ServerFlagsError('`--project` needs a path')
      }
    } else if (argument.startsWith('--project=')) {
      project = argument.slice('--project='.length)
      if (project === '') throw new ServerFlagsError('`--project` needs a path')
    } else {
      throw new ServerFlagsError(`unknown argument "${argument}"`)
    }
  }

  return { ...(project === undefined ? {} : { project }), readOnly }
}
