#!/usr/bin/env node
import { appendFileSync, readFileSync } from 'node:fs'

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'

import { callTool, loadToolbox, messageOf } from './toolbox.mjs'

/**
 * The MCP server the agent eval's `cli` and `codex` runners give `claude -p`
 * and `codex exec` (`eval/run.mjs`, `docs/verification.md`, "The agent
 * eval"). It serves the four tools the Messages API runner offers, under the
 * same names, with the same descriptions and schemas, answered by the same
 * functions (`eval/toolbox.mjs`), over stdio as `polymorph-mcp` serves its
 * own.
 *
 * It serves the eval's tools instead of running `polymorph-mcp`, because the
 * two differ where the eval measures. The eval's `validate` also emits a spec
 * and holds the TSX to the red rules, and its `get_component` adds the
 * opening of the member's design spec. A model offered `polymorph-mcp` could
 * stop on a verdict the API runner's model is never shown, and the two
 * runners' numbers would not compare. The functions underneath are the ones
 * `polymorph-mcp` binds (`packages/mcp/src/tools.ts`).
 *
 * Every call is written to the journal as one JSON line before it is
 * answered: the tool, and for `validate` the verdict and the document, or the
 * fault. The runner reads the journal as the CLI reports each result, so it
 * counts the verdicts the model was shown and no other. Listing the tools is
 * written too, so the runner can tell that the CLI had them before its first
 * request.
 *
 * The tool list and the registry come from the runner as files. The server
 * answers the CLI's handshake before it loads the tools, because the CLI
 * waits only a few seconds for a server to connect. A call waits until the
 * tools have loaded. A server that cannot load them reports a fault, which
 * ends the run as the harness's failure.
 *
 * stdout carries only protocol messages. The server exits when the CLI
 * closes its stdin, so a CLI the runner stopped leaves no server behind.
 */

const USAGE =
  'usage: node eval/mcp.mjs --mode spec|tsx --tools <file> --registry <file> --journal <file>'

function refuse(reason) {
  console.error(`eval/mcp.mjs: ${reason}\n${USAGE}`)
  process.exit(1)
}

function options(argv) {
  const chosen = {}
  for (let index = 0; index < argv.length; index += 2) {
    const [flag, value] = [argv[index], argv[index + 1]]
    const key = {
      '--mode': 'mode',
      '--tools': 'tools',
      '--registry': 'registry',
      '--journal': 'journal',
    }[flag]
    if (key === undefined) refuse(`unknown argument "${flag}"`)
    if (value === undefined) refuse(`\`${flag}\` needs a value`)
    chosen[key] = value
  }
  for (const key of ['mode', 'tools', 'registry', 'journal']) {
    if (chosen[key] === undefined) refuse(`\`--${key}\` is required`)
  }
  if (chosen.mode !== 'spec' && chosen.mode !== 'tsx') refuse('`--mode` is `spec` or `tsx`')
  return chosen
}

const { mode, tools, registry, journal } = options(process.argv.slice(2))
const listed = JSON.parse(readFileSync(tools, 'utf8'))

/** The system card is read once per run, as the API runner reads it, and this server serves one run. */
const memo = new Map()

let loading
const toolbox = () =>
  (loading ??= loadToolbox({ registry: JSON.parse(readFileSync(registry, 'utf8')) }))

const text = (value) => [{ type: 'text', text: value }]

async function call(block) {
  let loaded
  try {
    loaded = await toolbox()
  } catch (error) {
    return { fault: `the eval's MCP server could not load its tools: ${messageOf(error)}` }
  }
  return callTool(loaded, mode, block, memo)
}

const server = new Server(
  { name: 'polymorph-eval', version: '1.0.0' },
  { capabilities: { tools: {} } },
)

server.setRequestHandler(ListToolsRequestSchema, () => {
  // The runner checks the CLI had the tools before its first request.
  appendFileSync(journal, `${JSON.stringify({ listed: listed.map((tool) => tool.name) })}\n`)
  // The tools load once this answer has gone back, so the handshake never waits for them.
  setTimeout(() => toolbox().catch(() => {}), 50)
  return { tools: listed }
})

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const block = { name: request.params.name, input: request.params.arguments ?? {} }
  const outcome = await call(block)
  appendFileSync(
    journal,
    `${JSON.stringify({
      tool: block.name,
      ...(outcome.verdict === undefined ? {} : { verdict: outcome.verdict }),
      ...(outcome.submitted === undefined ? {} : { submitted: outcome.submitted }),
      ...(outcome.fault === undefined ? {} : { fault: outcome.fault }),
      ...(outcome.failed === undefined ? {} : { failed: outcome.failed }),
    })}\n`,
  )
  if (outcome.fault !== undefined) {
    return { content: text(`The harness failed: ${outcome.fault}`), isError: true }
  }
  return { content: text(outcome.content), ...(outcome.isError ? { isError: true } : {}) }
})

process.stdin.on('end', () => process.exit(0))
await server.connect(new StdioServerTransport())
