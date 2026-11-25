import type { Readable, Writable } from 'node:stream'

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js'

import { createServer } from './server'
import type { ToolContext } from './tools'

/**
 * The server over stdio, until the client has gone.
 *
 * `bin/polymorph-mcp.js` and `polymorph mcp` both start the server through
 * this function, so the two are one server with one lifetime. It resolves
 * when the client has closed its end of stdin and every request it sent has
 * its answer, or when the transport closes. An entry point may then exit
 * without cutting off an answer still being written. The SDK's transport does
 * not watch for the end of stdin, so this does, and it counts the requests
 * that are still open.
 *
 * Nothing here writes to stdout but the transport: stdout is the protocol.
 */
export async function serveStdio(
  context: ToolContext,
  streams: { stdin?: Readable; stdout?: Writable } = {},
): Promise<void> {
  const stdin = streams.stdin ?? process.stdin
  const stdout = streams.stdout ?? process.stdout

  const server = createServer(context)
  const transport = new StdioServerTransport(stdin, stdout)

  /** The requests the client has sent and the server has not answered, by id. */
  const open = new Set<string | number>()
  let ended = false
  let finish = () => {}
  const finished = new Promise<void>((resolve) => (finish = resolve))
  const settle = () => {
    if (ended && open.size === 0) finish()
  }

  const send = transport.send.bind(transport)
  transport.send = async (message: JSONRPCMessage) => {
    await send(message)
    if (isResponse(message)) {
      open.delete(message.id)
      settle()
    }
  }

  await server.connect(transport)

  // The protocol has set its handlers by now; each is wrapped, not replaced.
  const receive = transport.onmessage
  transport.onmessage = (message: JSONRPCMessage) => {
    if (isRequest(message)) open.add(message.id)
    // A request the client cancels gets no answer.
    if (isCancellation(message)) open.delete(message.params.requestId)
    receive?.(message)
  }
  const closed = transport.onclose
  transport.onclose = () => {
    closed?.()
    finish()
  }

  stdin.once('end', () => {
    ended = true
    settle()
  })
  // When nothing is left to happen in the process, the session is over, even
  // if a count above missed an answer.
  const idle = () => finish()
  process.once('beforeExit', idle)

  await finished
  process.off('beforeExit', idle)
}

type Message = JSONRPCMessage & Record<string, unknown>

/** A request from the client, which the server owes an answer. */
function isRequest(message: JSONRPCMessage): message is Message & { id: string | number } {
  return 'method' in message && 'id' in message
}

/** An answer the server sends: a result or an error, for a request's id. */
function isResponse(message: JSONRPCMessage): message is Message & { id: string | number } {
  return 'id' in message && !('method' in message) && ('result' in message || 'error' in message)
}

function isCancellation(
  message: JSONRPCMessage,
): message is Message & { params: { requestId: string | number } } {
  return (
    'method' in message &&
    message.method === 'notifications/cancelled' &&
    !('id' in message) &&
    typeof (message as { params?: { requestId?: unknown } }).params?.requestId !== 'undefined'
  )
}
