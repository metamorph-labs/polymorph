#!/usr/bin/env node
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, relative, resolve } from 'node:path'

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
 * A configuration that names no server is the `runtime` mode's: the stand-in
 * then starts none, offers no tool and needs no `--allowedTools`, as the CLI
 * does with `--tools ""` and an empty configuration.
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
 *
 * A script marked `project` is the project lane's (`eval/project.mjs`): the
 * CLI runs in an app with its own prompt and tools, the project's settings
 * and the servers of the project's `.mcp.json`, and nothing of the eval's.
 * The stand-in then checks the project lane's flags instead, and a turn's
 * blocks are actions, played as Claude Code's tools: `write` as `Write`,
 * which writes the file in the project; `shell` as `Bash`, which reports the
 * output the script gives it and runs nothing; `mcp` as a call to a server
 * of the project's, made for real; `skill` as `Skill`, which finds the skill
 * in `.claude/skills/`; and `text` as a message.
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

/** What the project lane must pass instead, the same way. */
const PROJECT_REQUIRED = {
  '-p': true,
  '--output-format': 'stream-json',
  '--include-partial-messages': true,
  '--verbose': true,
  '--strict-mcp-config': true,
  '--setting-sources': 'project',
  '--permission-mode': 'acceptEdits',
}

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
  if (!chosen.has('--script')) refuse('the CLI runner must pass `--script`')
  const project = JSON.parse(readFileSync(chosen.get('--script'), 'utf8')).project === true
  for (const [flag, value] of Object.entries(project ? PROJECT_REQUIRED : REQUIRED)) {
    if (chosen.get(flag) !== value) refuse(`the CLI runner must pass \`${flag}\` ${value}`)
  }
  for (const flag of ['--mcp-config', ...(project ? [] : ['--system-prompt'])]) {
    if (!chosen.has(flag)) refuse(`the CLI runner must pass \`${flag}\``)
  }
  if (project) {
    // The harness keeps its own prompt, its own tools and the project's skills.
    for (const flag of ['--system-prompt', '--tools', '--disable-slash-commands']) {
      if (chosen.has(flag)) refuse(`a project run gives the CLI nothing of the eval’s: \`${flag}\``)
    }
  }
  return { chosen, project }
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

const { chosen, project } = options(argv)
const prompt = await readStdin()
if (prompt.trim() === '') refuse('no prompt arrived on stdin')

const config = JSON.parse(readFileSync(chosen.get('--mcp-config'), 'utf8'))
const servers = Object.keys(config.mcpServers ?? {})
const entry = config.mcpServers?.polymorph
if (!project && servers.length > 0 && entry === undefined) {
  refuse('the MCP config names servers, and no `polymorph` server')
}
if (servers.length > 0 && !chosen.has('--allowedTools')) {
  refuse('the CLI runner must pass `--allowedTools` for the tools it serves')
}
const allowed = new Set((chosen.get('--allowedTools') ?? '').split(','))
if (project) {
  for (const tool of ['Bash', 'Skill', ...servers.map((server) => `mcp__${server}`)]) {
    if (!allowed.has(tool)) refuse(`a project run must allow \`${tool}\``)
  }
}
/** The journal the server writes, which a turn's `journal` appends to. */
const serverArgs = entry?.args ?? []
const journal = serverArgs.includes('--journal')
  ? serverArgs[serverArgs.indexOf('--journal') + 1]
  : undefined

/** The configuration's MCP servers, started as the CLI starts them, by name. */
const clients = new Map()
let tools = []
for (const name of servers) {
  const server = config.mcpServers[name]
  const client = new Client({ name: 'fake-claude', version: '1.0.0' })
  await client.connect(
    new StdioClientTransport({
      command: server.command,
      args: server.args ?? [],
      env: { ...process.env, ...server.env },
      stderr: 'inherit',
    }),
  )
  clients.set(name, client)
  tools = [
    ...tools,
    ...(await client.listTools()).tools.map((tool) => `mcp__${name}__${tool.name}`),
  ]
}
const client = clients.get('polymorph') ?? null
const model = chosen.get('--model') ?? 'fake'

emit({
  type: 'system',
  subtype: 'init',
  cwd: process.cwd(),
  tools: project ? ['Bash', 'Read', 'Write', 'Edit', 'Skill', ...tools] : tools,
  mcp_servers: servers.map((name) => ({ name, status: 'connected' })),
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

/** A project turn's action, as the Claude Code tool call that makes it. */
function asToolUse(block, index) {
  const id = `toolu_project_${index}_${Math.random().toString(36).slice(2, 8)}`
  switch (block.type) {
    case 'write':
      return {
        type: 'tool_use',
        id,
        name: 'Write',
        input: { file_path: resolve(process.cwd(), block.path), content: block.content },
      }
    case 'shell':
      return { type: 'tool_use', id, name: 'Bash', input: { command: block.command }, block }
    case 'mcp':
      return {
        type: 'tool_use',
        id,
        name: `mcp__${block.server}__${block.tool}`,
        input: block.input ?? {},
      }
    case 'skill':
      return { type: 'tool_use', id, name: 'Skill', input: { skill: block.name } }
    default:
      return block
  }
}

/** One project action carried out, as its tool result. */
async function act(call) {
  const result = (content, isError = false) => ({
    type: 'tool_result',
    tool_use_id: call.id,
    content,
    ...(isError ? { is_error: true } : {}),
  })
  if (call.name === 'Write') {
    const target = call.input.file_path
    if (!isAbsolute(target) || relative(process.cwd(), target).startsWith('..')) {
      return result(`Permission to use Write has been denied.`, true)
    }
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, call.input.content)
    return result(`File created successfully at: ${target}`)
  }
  if (call.name === 'Bash') {
    const { output = '', exitCode = 0 } = call.block
    return result(exitCode === 0 ? output : `Exit code ${exitCode}\n${output}`, exitCode !== 0)
  }
  if (call.name === 'Skill') {
    const file = resolve(process.cwd(), '.claude/skills', call.input.skill, 'SKILL.md')
    return existsSync(file)
      ? result(`Launching skill: ${call.input.skill}`)
      : result(`Unknown skill: ${call.input.skill}`, true)
  }
  const [, server, ...rest] = call.name.split('__')
  const named = clients.get(server)
  if (named === undefined) return result(`No such tool available: ${call.name}`, true)
  const answer = await named.callTool({ name: rest.join('__'), arguments: call.input })
  return { ...result(answer.content, answer.isError === true) }
}

/** What the tools answer a turn's calls. A tool the runner did not allow is denied, as `--permission-mode dontAsk` denies it. */
async function answered(calls) {
  const results = []
  if (project) {
    for (const call of calls) results.push(await act(call))
    return results
  }
  for (const call of calls) {
    if (client === null || !allowed.has(`${PREFIX}${call.name}`)) {
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

/** The calls a turn makes: none when its response did not stop to use tools. */
const callsOf = (message) =>
  message.stop_reason === 'tool_use'
    ? (message.content ?? []).filter((block) => block.type === 'tool_use')
    : []

/** The turn an `ahead` turn has already played the calls of, with their results. */
let early = null

/** A project turn with its actions as tool calls, which stops to use tools when it has any. */
function projectTurn(message) {
  const content = message.content.map(asToolUse)
  const calls = content.some((block) => block.type === 'tool_use')
  return { ...message, content, stop_reason: calls ? 'tool_use' : 'end_turn' }
}

for (let turn = 1; ; turn += 1) {
  const scripted = early?.message ?? next()
  const message = project && scripted.cli === undefined ? projectTurn(scripted) : scripted
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
    // A shell call carries its scripted output along, which the CLI never shows.
    const shown = { ...block }
    delete shown.block
    const named =
      block.type === 'tool_use' && !project ? { ...shown, name: `${PREFIX}${block.name}` } : shown
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
      permission_denials: [],
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

for (const open of clients.values()) await open.close()
