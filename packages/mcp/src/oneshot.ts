import type { ToolAnswer, ToolCaller } from '@polymorph/cli'
import {
  getParseErrorMessage,
  normalizeObjectSchema,
  safeParseAsync,
} from '@modelcontextprotocol/sdk/server/zod-compat.js'
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js'

import { TOOLS } from './server'
import type { ToolContext } from './tools'

/**
 * The tools, called by name outside the protocol: what `polymorph card`,
 * `validate`, `render` and the other verbs that ask a tool run on.
 *
 * A command line has no MCP client, and a client is not needed to call a
 * function. So the caller takes the server's own table (`TOOLS` in
 * `server.ts`) and does for one call what the SDK does for a request: it
 * finds the tool by name, checks the arguments with the tool's input schema,
 * calls the tool's function, and reports a refusal or an exception as a tool
 * error. The answer is the data the server would have encoded as text and
 * images. Each step is the SDK's own where the SDK has one (the schema check,
 * the error codes), so a call answers the same here as over the protocol, its
 * error messages included. `verbs.test.ts` compares the two.
 *
 * The context is the server's, and nothing here assumes a checkout: `root` is
 * where the vocabulary is read from, `project` where the write tools write,
 * and `screenBuilder` the program `render_screen` builds its page with. A
 * context with no project gives a caller with no write tool, as a server
 * started with `--read-only` has none.
 */
export function toolCaller(context: ToolContext): ToolCaller {
  const offered = new Map(
    TOOLS.filter((entry) => context.project !== undefined || !entry.writes).map((entry) => [
      entry.name as string,
      entry,
    ]),
  )

  return async (name: string, args: unknown): Promise<ToolAnswer> => {
    try {
      const entry = offered.get(name)
      if (entry === undefined) throw new McpError(ErrorCode.InvalidParams, `Tool ${name} not found`)

      const schema = normalizeObjectSchema(entry.inputSchema)
      if (schema === undefined) throw new Error(`polymorph: ${name} has no input schema`)
      const parsed = await safeParseAsync(schema, args)
      if (!parsed.success) {
        throw new McpError(
          ErrorCode.InvalidParams,
          `Input validation error: Invalid arguments for tool ${name}: ` +
            getParseErrorMessage(parsed.error),
        )
      }

      return await entry.answer(context, parsed.data as Record<string, unknown>)
    } catch (error) {
      // The server reports an exception from a tool as a tool error in the
      // exception's own words, and so does this.
      return {
        value: error instanceof Error ? error.message : String(error),
        images: [],
        isError: true,
      }
    }
  }
}
