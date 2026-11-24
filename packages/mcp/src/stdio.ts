import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'

import { createServer } from './server'
import type { ToolContext } from './tools'

/**
 * Starts the server over this process's stdin and stdout, with the tools
 * bound to `context`.
 *
 * From here on stdout carries only protocol frames. A stray line on it
 * corrupts a frame and the client disconnects, so the entry point that calls
 * this writes its diagnostics to stderr.
 */
export async function serveStdio(context: ToolContext): Promise<McpServer> {
  const server = createServer(context)
  await server.connect(new StdioServerTransport())
  return server
}
