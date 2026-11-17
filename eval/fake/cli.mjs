#!/usr/bin/env node
import { appendFileSync, readFileSync } from 'node:fs'

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

import { scriptedTurns } from './script.mjs'

/**
 * A stand-in for `claude -p`, which `pnpm eval --runner cli --fake` runs in
 * place of the Claude Code CLI. It plays the scripted model's turns
 * (`eval/fake/<brief>.<mode>.json`, read by `--script`) the way the CLI plays
 * a real model's: it starts the MCP server the `--mcp-config` file names,
 * calls the tools through it, and prints the CLI's `stream-json` events,
 * the raw stream events included. A scripted run through the CLI runner
 * therefore exercises the runner's flags, the eval's MCP server and its
 * journal, and the reading of the stream, with no CLI and no model.
 *
 * It refuses to start without the flags the runner depends on, so a runner
 * that dropped one fails here rather than passing against a stand-in that did
 * not look.
 *
 * A turn written `{ "cli": { "error": …, "result": … } }` plays the CLI
 * failing instead of the model answering: a `rate_limit` error is reported
 * the way the CLI reports a usage limit, and any other the way it reports an
 * API error.
 *
 * Two more fields of a turn play what the runner has to survive:
 *
 *  - `delay`: milliseconds the stand-in waits before it plays the turn, as a
 *    model takes time to answer. A runner that stops the CLI ends the wait.
 *  - `journal`: text the stand-in appends to the run's journal once the turn's
 *    calls are answered and before it reports their results, as the server
 *    would if it were still writing. Text that does not end in a newline is a
 *    line half written, and a line that is not JSON is one the runner cannot
 *    read.
 *  - `ahead`: the stand-in makes the next turn's calls before it reports this
 *    turn's results, so the server has written their lines by then. That is
 *    the journal a runner finds when it reads the CLI's output a turn late.
 */

const PREFIX = 'mcp__polymorph__'

const VALUED = new Set([
  '--script',
  '--model',
  '--effort',
  '--system-prompt',
  '--tools',
  '--allowedTools',
  '--permission-mode',
  '--mcp-config',
  '--setting-sources',
  '--output-format',
])

const FLAGS = new Set([
  '-p',
  '--strict-mcp-config',
  '--disable-slash-commands',
  '--no-session-persistence',
  '--include-partial-messages',
  '--verbose',
])

/** What the runner must pass, as the flag and the value it must have, or `true` for a bare flag. */
const REQUIRED = {
  '-p': true,
  '--output-format': 'stream-json',
  '--include-partial-messages': true,
  '--verbose': true,
  '--strict-mcp-config': true,
  '--tools': '',
  '--permission-mode': 'dontAsk',
  '--setting-sources': '',
}

function refuse(reason) {
  console.error(`fake claude: ${reason}`)
  process.exit(1)
}

function options(argv) {
  const chosen = new Map()
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index]
    if (FLAGS.has(flag)) chosen.set(flag, true)
    else if (VALUED.has(flag)) {
      const value = argv[index + 1]
      if (value === undefined) refuse(`\`${flag}\` needs a value`)
      chosen.set(flag, value)
      index += 1
    } else refuse(`unknown argument "${flag}"`)
  }
  for (const [flag, value] of Object.entries(REQUIRED)) {
    if (chosen.get(flag) !== value) refuse(`the CLI runner must pass \`${flag}\` ${value}`)
  }
  for (const flag of ['--script', '--allowedTools', '--mcp-config', '--system-prompt']) {
    if (!chosen.has(flag)) refuse(`the CLI runner must pass \`${flag}\``)
  }
  return chosen
}

async function readStdin() {
  let text = ''
  for await (const chunk of process.stdin) text += chunk
  return text
}

const emit = (event) =>
  process.stdout.write(`${JSON.stringify({ ...event, session_id: 'fake' })}\n`)

const argv = process.argv.slice(2)
if (argv.includes('--version')) {
  console.log('scripted (the eval’s stand-in for Claude Code)')
  process.exit(0)
}

const chosen = options(argv)
const prompt = await readStdin()
if (prompt.trim() === '') refuse('no prompt arrived on stdin')

const config = JSON.parse(readFileSync(chosen.get('--mcp-config'), 'utf8'))
const entry = config.mcpServers?.polymorph
if (entry === undefined) refuse('the MCP config names no `polymorph` server')
/** The journal the server writes, which a turn's `journal` appends to. */
const serverArgs = entry.args ?? []
const journal = serverArgs.includes('--journal')
  ? serverArgs[serverArgs.indexOf('--journal') + 1]
  : undefined

const client = new Client({ name: 'fake-claude', version: '1.0.0' })
await client.connect(
  new StdioClientTransport({
    command: entry.command,
    args: serverArgs,
    env: { ...process.env, ...entry.env },
    stderr: 'inherit',
  }),
)
const { tools } = await client.listTools()
const allowed = new Set(chosen.get('--allowedTools').split(','))
const model = chosen.get('--model') ?? 'fake'

emit({
  type: 'system',
  subtype: 'init',
  cwd: process.cwd(),
  tools: tools.map((tool) => `${PREFIX}${tool.name}`),
  mcp_servers: [{ name: 'polymorph', status: 'connected' }],
  model,
  permissionMode: chosen.get('--permission-mode'),
  claude_code_version: 'scripted',
})

const next = scriptedTurns(chosen.get('--script'))
const total = {
  input_tokens: 0,
  cache_creation_input_tokens: 0,
  cache_read_input_tokens: 0,
  output_tokens: 0,
}

/** What the tools answer a turn's calls. A tool the runner did not allow is denied, as `--permission-mode dontAsk` denies it. */
async function answered(calls) {
  const results = []
  for (const call of calls) {
    if (!allowed.has(`${PREFIX}${call.name}`)) {
      results.push({
        type: 'tool_result',
        tool_use_id: call.id,
        content: `Permission to use ${PREFIX}${call.name} has been denied.`,
        is_error: true,
      })
      continue
    }
    const answer = await client.callTool({ name: call.name, arguments: call.input })
    results.push({
      type: 'tool_result',
      tool_use_id: call.id,
      content: answer.content,
      ...(answer.isError ? { is_error: true } : {}),
    })
  }
  return results
}

const callsOf = (message) => (message.content ?? []).filter((block) => block.type === 'tool_use')

/** The turn an `ahead` turn has already played the calls of, with their results. */
let early = null

for (let turn = 1; ; turn += 1) {
  const message = early?.message ?? next()
  const made = early?.results
  early = null
  if (message.delay !== undefined) await new Promise((done) => setTimeout(done, message.delay))

  if (message.cli !== undefined) {
    const { error, result } = message.cli
    if (error === 'rate_limit') {
      emit({ type: 'rate_limit_event', rate_limit_info: { status: 'rejected' } })
    }
    emit({
      type: 'assistant',
      message: {
        id: `fake_error_${turn}`,
        model: '<synthetic>',
        content: [{ type: 'text', text: result }],
      },
      error,
    })
    emit({ type: 'result', subtype: 'success', is_error: true, result, usage: total })
    break
  }

  const id = `msg_fake_${turn}`
  const { output_tokens: output, ...input } = message.usage
  emit({
    type: 'stream_event',
    event: {
      type: 'message_start',
      message: {
        id,
        type: 'message',
        role: 'assistant',
        model,
        content: [],
        usage: { ...input, output_tokens: 0 },
      },
    },
  })
  // The CLI reports each content block as an assistant message of its own.
  for (const block of message.content) {
    const named = block.type === 'tool_use' ? { ...block, name: `${PREFIX}${block.name}` } : block
    emit({
      type: 'assistant',
      message: {
        id,
        type: 'message',
        role: 'assistant',
        model,
        content: [named],
        stop_reason: null,
      },
    })
  }
  emit({
    type: 'stream_event',
    event: {
      type: 'message_delta',
      delta: { stop_reason: message.stop_reason },
      usage: { output_tokens: output },
    },
  })
  emit({ type: 'stream_event', event: { type: 'message_stop' } })
  for (const [key, value] of Object.entries(message.usage)) total[key] = (total[key] ?? 0) + value

  const calls = message.content.filter((block) => block.type === 'tool_use')
  if (message.stop_reason !== 'tool_use' || calls.length === 0) {
    const text = message.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n')
    emit({
      type: 'result',
      subtype: 'success',
      is_error: false,
      num_turns: turn,
      result: text,
      stop_reason: message.stop_reason,
      usage: total,
      total_cost_usd: 0,
    })
    break
  }

  const results = made ?? (await answered(calls))
  if (message.ahead) {
    const following = next()
    early = { message: following, results: await answered(callsOf(following)) }
  }
  if (message.journal !== undefined) {
    if (journal === undefined) refuse('a turn writes to the journal, and the server has none')
    appendFileSync(journal, message.journal)
  }
  emit({ type: 'user', message: { role: 'user', content: results } })
}

await client.close()
