#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, relative, resolve } from 'node:path'

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

import { readToml } from '../harnesses.mjs'
import { scriptedTurns } from './script.mjs'

/**
 * A stand-in for `codex exec`, which `pnpm eval --runner codex --fake` runs in
 * place of Codex, as `eval/fake/cli.mjs` stands in for Claude Code. It plays
 * the scripted model's turns (`eval/fake/<brief>.<mode>.json`, read by
 * `--script`) and prints the JSON lines `codex exec --json` prints: the event
 * and item shapes of `codex-rs/exec/src/exec_events.rs` in
 * https://github.com/openai/codex, summarised at
 * https://learn.chatgpt.com/docs/non-interactive-mode. It has never been
 * compared with a real Codex's output; `docs/verification.md` lists what a
 * real run has to confirm.
 *
 * It starts the MCP server its overrides name and calls the tools through it
 * for real, so a scripted run through the `codex` runner exercises the
 * runner's arguments, the eval's MCP server and its journal, and the reading
 * of the stream, with no Codex and no model. Codex reports its tokens once,
 * when its turn ends, so the stand-in sums the script's usage into one
 * `turn.completed`: every input token as `input_tokens`, the cache reads as
 * `cached_input_tokens` and the cache writes as `cache_write_input_tokens`.
 *
 * It refuses to start without the arguments the runner depends on, so a
 * runner that dropped one fails here rather than passing against a stand-in
 * that did not look. There are two sets:
 *
 * - **The eval's tools** (`--sandbox read-only`): the eval's system prompt as
 *   `model_instructions_file`, its MCP server and no other, every tool of
 *   Codex's own turned off.
 * - **A project** (`--sandbox workspace-write`, a script marked `project`):
 *   no prompt and no server of the eval's, the project trusted, the network
 *   on, every MCP server the project configures in `.codex/config.toml`
 *   approved. A turn's blocks are actions: `write` writes a file in the
 *   project, `shell` reports a command and the output the script gives it
 *   (nothing is run), `mcp` calls a server of the project's, `skill` reads a
 *   skill's `SKILL.md`, and `text` is a message.
 *
 * A `plan` block, in either set, plays Codex's plan tool: a `todo_list` item
 * holding the block's `items`.
 *
 * A turn written `{ "codex": { "failed": … } }` plays Codex failing: an
 * `error` event, then `turn.failed`. `delay` waits that many milliseconds
 * before the turn is played, as a model takes time to answer.
 */

const VALUED = new Set(['--script', '--sandbox', '--model', '--color', '-c'])
const FLAGS = new Set(['exec', '--json', '--skip-git-repo-check', '--ephemeral', '--trust', '-'])

/** The `CODEX*` variables the runner keeps, besides `CODEX_HOME`. */
const KEPT = new Set(['CODEX_API_KEY', 'CODEX_ACCESS_TOKEN', 'CODEX_CA_CERTIFICATE', 'CODEX_HOME'])

function refuse(reason) {
  console.error(`fake codex: ${reason}`)
  process.exit(1)
}

const argv = process.argv.slice(2)
if (argv.includes('--version')) {
  console.log('scripted (the eval’s stand-in for Codex)')
  process.exit(0)
}

/** The arguments, and the `-c` overrides read as TOML. */
function options() {
  const chosen = new Map()
  const overrides = new Map()
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index]
    if (FLAGS.has(flag)) chosen.set(flag, true)
    else if (VALUED.has(flag)) {
      const value = argv[index + 1]
      if (value === undefined) refuse(`\`${flag}\` needs a value`)
      index += 1
      if (flag !== '-c') chosen.set(flag, value)
      else {
        const at = value.indexOf('=')
        if (at < 1) refuse(`\`-c ${value}\` is not \`key=value\``)
        overrides.set(value.slice(0, at), readToml(value.slice(at + 1)))
      }
    } else refuse(`unknown argument "${flag}"`)
  }
  if (argv[0] !== '--script' || argv[2] !== 'exec') {
    refuse('the runner must pass `--script <file>` and then `exec`')
  }
  if (argv.at(-1) !== '-') refuse('the runner must end with `-`, the prompt on stdin')
  for (const flag of ['--json', '--skip-git-repo-check', '--ephemeral']) {
    if (!chosen.has(flag)) refuse(`the runner must pass \`${flag}\``)
  }
  if (overrides.get('approval_policy') !== 'never') {
    refuse('the runner must pass `-c approval_policy="never"`')
  }
  return { chosen, overrides }
}

/** Refuses unless every override in `wanted` has the value given. */
function requireOverrides(overrides, wanted) {
  for (const [key, value] of Object.entries(wanted)) {
    if (JSON.stringify(overrides.get(key)) !== JSON.stringify(value)) {
      refuse(`the runner must pass \`-c ${key}=${JSON.stringify(value)}\``)
    }
  }
}

/** Codex's home: set, existing, and not the owner's own. */
function checkHome() {
  const home = process.env.CODEX_HOME
  if (home === undefined || !existsSync(home))
    refuse('the runner must set `CODEX_HOME` to a home of the run’s own')
  const own = resolve(homedir(), '.codex')
  if (existsSync(own) && realpathSync(home) === realpathSync(own)) {
    refuse('`CODEX_HOME` is the owner’s own home')
  }
  for (const name of Object.keys(process.env)) {
    if (name.startsWith('CODEX') && !KEPT.has(name)) refuse(`the runner left \`${name}\` set`)
  }
}

/**
 * The `[mcp_servers.<name>]` tables of a project's `.codex/config.toml`, each
 * with the `command`, `args` and `cwd` it sets. Only what a server needs to
 * start is read.
 */
function projectServers(file) {
  if (!existsSync(file)) return {}
  const servers = {}
  let current = null
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const header = /^\s*\[(.+)\]\s*$/.exec(line)
    if (header !== null) {
      const name = /^mcp_servers\.("?)([^".]+)\1$/.exec(header[1].trim())
      current = name === null ? null : (servers[name[2]] = {})
      continue
    }
    const entry = /^\s*([A-Za-z0-9_-]+)\s*=\s*(.+)$/.exec(line)
    if (current !== null && entry !== null && ['command', 'args', 'cwd'].includes(entry[1])) {
      current[entry[1]] = readToml(entry[2].trim())
    }
  }
  return servers
}

async function readStdin() {
  let text = ''
  for await (const chunk of process.stdin) text += chunk
  return text
}

const emit = (event) => process.stdout.write(`${JSON.stringify(event)}\n`)

const { chosen, overrides } = options()
checkHome()
const script = JSON.parse(readFileSync(chosen.get('--script'), 'utf8'))
const project = script.project === true
const sandbox = chosen.get('--sandbox')

/** Each server's launch, by name, and the client once it is started. */
let servers = {}
if (project) {
  if (sandbox !== 'workspace-write') refuse('a project run needs `--sandbox workspace-write`')
  if (!chosen.has('--trust')) refuse('a project run needs `--trust`, so its configuration loads')
  requireOverrides(overrides, { 'sandbox_workspace_write.network_access': true })
  for (const key of ['model_instructions_file', 'mcp_servers']) {
    if (overrides.has(key))
      refuse(`a project run gives the harness nothing of the eval’s: \`${key}\``)
  }
  servers = projectServers(resolve(process.cwd(), '.codex/config.toml'))
  for (const name of Object.keys(servers)) {
    requireOverrides(overrides, { [`mcp_servers.${name}.default_tools_approval_mode`]: 'approve' })
  }
} else {
  if (sandbox !== 'read-only') refuse('a run with the eval’s tools needs `--sandbox read-only`')
  requireOverrides(overrides, {
    'features.shell_tool': false,
    'features.unified_exec': false,
    'features.view_image': false,
    'features.multi_agent': false,
    'features.apps': false,
    web_search: 'disabled',
    'skills.include_instructions': false,
    'skills.bundled.enabled': false,
  })
  const instructions = overrides.get('model_instructions_file')
  if (typeof instructions !== 'string' || readFileSync(instructions, 'utf8').trim() === '') {
    refuse('the runner must pass the system prompt as `-c model_instructions_file=<file>`')
  }
  servers = overrides.get('mcp_servers')
  if (servers === undefined) refuse('the runner must pass `-c mcp_servers=…`, empty or not')
  const names = Object.keys(servers)
  if (names.some((name) => name !== 'polymorph')) refuse('the eval’s server is the only one')
  if (names.length === 1) {
    const { required, default_tools_approval_mode: approval } = servers.polymorph
    if (required !== true) refuse('the eval’s server must be `required`')
    if (approval !== 'approve') refuse('every tool of the eval’s server must be approved')
  }
}

const prompt = await readStdin()
if (prompt.trim() === '') refuse('no prompt arrived on stdin')

/** The clients of the servers started so far, by name. */
const clients = new Map()
async function clientOf(name) {
  if (clients.has(name)) return clients.get(name)
  const server = servers[name]
  if (server === undefined) return null
  const client = new Client({ name: 'fake-codex', version: '1.0.0' })
  await client.connect(
    new StdioClientTransport({
      command: server.command,
      args: server.args ?? [],
      cwd: server.cwd ?? process.cwd(),
      env: { ...process.env, ...server.env },
      stderr: 'inherit',
    }),
  )
  clients.set(name, client)
  return client
}

// Codex starts its MCP servers, and lists their tools, before the model's first request.
for (const name of Object.keys(servers)) {
  const client = await clientOf(name)
  await client.listTools()
}

emit({ type: 'thread.started', thread_id: 'fake-thread' })
emit({ type: 'turn.started' })

let items = 0
const nextId = () => `item_${items++}`
const total = { input: 0, cacheRead: 0, cacheWrite: 0, output: 0 }

/** One MCP call, reported as Codex reports it: started, then completed or failed. */
async function mcpCall(server, tool, input) {
  const id = nextId()
  const item = {
    id,
    type: 'mcp_tool_call',
    server,
    tool,
    arguments: input,
    result: null,
    error: null,
  }
  emit({ type: 'item.started', item: { ...item, status: 'in_progress' } })
  const client = await clientOf(server)
  if (client === null) {
    const error = { message: `unknown MCP server '${server}'` }
    emit({ type: 'item.completed', item: { ...item, error, status: 'failed' } })
    return
  }
  const answer = await client.callTool({ name: tool, arguments: input })
  const result = { content: answer.content, structured_content: null }
  emit({
    type: 'item.completed',
    item: { ...item, result, status: answer.isError ? 'failed' : 'completed' },
  })
}

/** One shell command, reported with the output the script gives it. Nothing is run. */
function command(text, output = '', exitCode = 0) {
  const id = nextId()
  const shown = `bash -lc '${text.replace(/'/g, `'\\''`)}'`
  const item = { id, type: 'command_execution', command: shown, aggregated_output: '' }
  emit({ type: 'item.started', item: { ...item, exit_code: null, status: 'in_progress' } })
  emit({
    type: 'item.completed',
    item: {
      ...item,
      aggregated_output: output,
      exit_code: exitCode,
      status: exitCode === 0 ? 'completed' : 'failed',
    },
  })
}

/** One file written in the project, reported as the patch Codex applies. */
function write(path, content) {
  const target = resolve(process.cwd(), path)
  if (relative(process.cwd(), target).startsWith('..')) refuse(`${path} is outside the project`)
  const kind = existsSync(target) ? 'update' : 'add'
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, content)
  const id = nextId()
  const changes = [{ path: target, kind }]
  emit({ type: 'item.started', item: { id, type: 'file_change', changes, status: 'in_progress' } })
  emit({ type: 'item.completed', item: { id, type: 'file_change', changes, status: 'completed' } })
}

const message = (text) =>
  emit({ type: 'item.completed', item: { id: nextId(), type: 'agent_message', text } })

const next = scriptedTurns(chosen.get('--script'))
for (;;) {
  const turn = next()
  if (turn.delay !== undefined) await new Promise((done) => setTimeout(done, turn.delay))
  if (turn.codex !== undefined) {
    emit({ type: 'error', message: turn.codex.failed })
    emit({ type: 'turn.failed', error: { message: turn.codex.failed } })
    process.exitCode = 1
    break
  }
  const usage = turn.usage
  total.input +=
    usage.input_tokens + usage.cache_read_input_tokens + usage.cache_creation_input_tokens
  total.cacheRead += usage.cache_read_input_tokens
  total.cacheWrite += usage.cache_creation_input_tokens
  total.output += usage.output_tokens

  let acted = false
  for (const block of turn.content) {
    if (block.type === 'text') message(block.text)
    else if (block.type === 'tool_use') {
      acted = true
      await mcpCall('polymorph', block.name, block.input ?? {})
    } else if (block.type === 'mcp') {
      acted = true
      await mcpCall(block.server, block.tool, block.input ?? {})
    } else if (block.type === 'write') {
      acted = true
      write(block.path, block.content)
    } else if (block.type === 'shell') {
      acted = true
      command(block.command, block.output, block.exitCode)
    } else if (block.type === 'plan') {
      const items = (block.items ?? []).map((text) => ({ text, completed: false }))
      emit({ type: 'item.started', item: { id: nextId(), type: 'todo_list', items } })
    } else if (block.type === 'skill') {
      acted = true
      const file = `.agents/skills/${block.name}/SKILL.md`
      const found = existsSync(resolve(process.cwd(), file))
      command(
        `cat ${file}`,
        found ? readFileSync(resolve(process.cwd(), file), 'utf8') : `cat: ${file}: No such file`,
        found ? 0 : 1,
      )
    } else refuse(`a turn holds a block of type \`${block.type}\``)
  }
  if (!acted) {
    emit({
      type: 'turn.completed',
      usage: {
        input_tokens: total.input,
        cached_input_tokens: total.cacheRead,
        cache_write_input_tokens: total.cacheWrite,
        output_tokens: total.output,
        reasoning_output_tokens: 0,
      },
    })
    break
  }
}

for (const client of clients.values()) await client.close()
