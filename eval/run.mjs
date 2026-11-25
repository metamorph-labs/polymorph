#!/usr/bin/env node
import { execFileSync, spawn } from 'node:child_process'
import {
  existsSync,
  globSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, relative, resolve, sep } from 'node:path'
import { performance } from 'node:perf_hooks'
import { createInterface } from 'node:readline'
import { setTimeout as sleep } from 'node:timers/promises'
import { TextDecoder } from 'node:util'

import * as prettier from 'prettier'

import { scriptedTurns } from './fake/script.mjs'
import {
  claudeEnvironment,
  codexEnvironment,
  codexHome,
  HarnessError as CliError,
  LIMIT_WORDS,
  onInterrupt,
  override,
  tail,
  track,
  versionOf,
} from './harnesses.mjs'
import {
  makeTemplate,
  meterCodexUsage,
  resolveTools,
  runOnceProject,
  SetupError,
  summariseProject,
} from './project.mjs'
import { writeReport } from './report.mjs'
import { loadRequirements, unmet } from './requirements.mjs'
import { interval } from './spread.mjs'
import { callTool, loadScreen, loadToolbox, messageOf, ROOT } from './toolbox.mjs'

/**
 * `pnpm eval` gives a model a screen brief and the system's own tools, and
 * measures how it gets on: whether its first `validate` call is lawful, how
 * many calls it takes to get there, whether it ends lawful, whether the
 * screen it hands back has every part its brief requires, and what that costs
 * in tokens and time (`docs/verification.md`, "The agent eval").
 *
 * The brief's requirements are checked against the final document
 * (`eval/requirements.mjs`) and are never shown to the model. Every rate is
 * recorded with the interval its number of runs supports (`eval/spread.mjs`).
 *
 * The tools are the repository's own functions, loaded through `jiti` the way
 * the bins load them (`eval/toolbox.mjs`): the card, search and component
 * lookup are the MCP server's (`packages/mcp/src/tools.ts`), and `validate` is
 * the spec validator, the emitter and the red rules
 * (`packages/spec/src/lawful.ts`, `@polymorph/rules/verify`). So the eval
 * measures what an agent connected to `polymorph-mcp` meets, not a copy of it.
 *
 * `--mode runtime` is the run-time lane: what a host that draws a model's
 * screen at run time gets from one request with no tools. The system prompt is
 * the run-time card (`runtimeCard` from `@polymorph/screen`, the output
 * contract at its end) for the framework and members the run names, and the
 * brief is the message. The answer's document is read with `parsePartial`,
 * judged with `checkScreen` for the same framework and members, and held to
 * the brief's requirements as a `spec` document is. A run records the tokens
 * the API reports, cached and uncached apart, the time to the first text of
 * the answer and the time to its end.
 *
 * There are three runners. The `api` runner, the default, reaches the model
 * over the Messages API with `fetch`, streamed, because a long turn with
 * thinking can outlast the time Node's `fetch` waits for response headers. It
 * needs `ANTHROPIC_API_KEY`. The `cli` runner runs each brief through
 * `claude -p`, the owner's own Claude Code, with the same tools served over
 * MCP (`eval/mcp.mjs`), and needs no key (see "The Claude Code CLI" below).
 * The `codex` runner runs each brief through `codex exec`, the owner's own
 * Codex, with the same MCP server (see "The Codex CLI" below). All three feed
 * the same measurements, so their numbers compare, apart from what Codex does
 * not report.
 *
 * `--mode project` is the project lane (`eval/project.mjs`): the `cli` or
 * `codex` runner's harness started in an app the tools set up, given the
 * brief as an ordinary request and nothing else from the eval, and judged on
 * the project it leaves.
 *
 * `--fake` swaps the model for a scripted one (`eval/fake/`) that replays
 * turns, so the harness itself is testable without a key: in place of the
 * Messages API for the `api` runner, and in place of the CLI for the `cli`
 * runner (`eval/fake/cli.mjs`) and the `codex` runner (`eval/fake/codex.mjs`).
 * Everything downstream of the model, the tools included, runs for real
 * either way.
 *
 * A run writes `eval/results/<date>-<model>-<mode>.json`, the documents the
 * agent handed back beside it, and re-renders `eval/README.md`
 * (`eval/report.mjs`). Both files are rewritten after every run, marked
 * `partial` until the last one, so an eval that stops early keeps the runs it
 * finished without ever publishing them as the number. A fake run writes to a
 * temporary directory instead, and is refused `eval/results`, so the committed
 * results only ever hold real runs.
 */

const EVAL = resolve(ROOT, 'eval')
const BRIEFS = resolve(EVAL, 'briefs')
const RESULTS = resolve(EVAL, 'results')
const FAKES = resolve(EVAL, 'fake')
const MCP_SERVER = resolve(EVAL, 'mcp.mjs')
const FAKE_CLI = resolve(FAKES, 'cli.mjs')
const FAKE_CODEX = resolve(FAKES, 'codex.mjs')
const SUBSETS = resolve(EVAL, 'members')

/**
 * `ANTHROPIC_BASE_URL` points the eval at another host, as it does the SDKs; the
 * test uses a local one. A trailing slash is dropped, as the SDKs drop it.
 */
const API_URL = `${(process.env.ANTHROPIC_BASE_URL ?? 'https://api.anthropic.com').replace(/\/+$/, '')}/v1/messages`
const API_VERSION = '2023-06-01'

/** `--effort` values besides `default`, which sends none and leaves the model's own default. */
const EFFORT_LEVELS = ['low', 'medium', 'high', 'xhigh', 'max']

/** How the model is reached: the Messages API, the Claude Code CLI, or the Codex CLI. */
const RUNNERS = ['api', 'cli', 'codex']

/**
 * What a run hands back: a spec or a TSX module through the tools, a spec in
 * one request (`runtime`), or the project a harness leaves (`project`).
 */
const MODES = ['spec', 'tsx', 'runtime', 'project']

/** The mode with no tools and one request: the run-time lane. */
const RUNTIME = 'runtime'

/** The mode that starts a harness in an app and judges the project: the project lane. */
const PROJECT = 'project'

/** What `--thinking` sends as `thinking.type` in the `runtime` mode. */
const THINKING = ['adaptive', 'disabled', 'between_tools']

/** The flags that choose what the run-time card holds and how its request thinks. */
const RUNTIME_FLAGS = ['--thinking', '--members']

/** The flags that set the project lane's app up and bound its runs. */
const PROJECT_FLAGS = ['--tools', '--max-turns', '--max-minutes']

/** The project lane's budget per run, when no flag sets it. */
const PROJECT_DEFAULTS = { maxTurns: 80, maxMinutes: 20 }

const DEFAULTS = {
  runner: 'api',
  model: 'claude-sonnet-5-5',
  mode: 'spec',
  briefs: 'eval/briefs/*.md',
  runs: 1,
  maxIterations: 5,
  effort: 'default',
  /** What the `spec` and `tsx` modes always send. */
  thinking: 'adaptive',
  /**
   * The token ceilings, counted as a record counts them: every input token,
   * cached or not, every output token, and the tokens of attempts that broke
   * off. A run of the default model reads about 150,000 tokens, so the run
   * ceiling stops only a run that has run away, and the total covers eight
   * briefs at five runs each. No request starts once either is reached; the
   * eval then stops with the runs it finished written, marked partial.
   */
  maxTokensPerRun: 1_000_000,
  maxTokensTotal: 10_000_000,
}

/**
 * A run that keeps searching without ever settling is stopped here, set well
 * above what the cap of `validate` calls needs, so it ends only a run that has
 * stopped making progress. Cost is guarded by the token ceilings.
 */
const MAX_TURNS = 40

/** Streaming, so a large ceiling costs nothing until it is used. */
const MAX_TOKENS = 64000

/**
 * Transient failures are retried, an error event in the stream as well as an
 * HTTP status. Anything else, or a failure that outlasts the retries, stops
 * the eval with the runs it finished written, marked partial.
 */
const RETRYABLE = new Set([408, 409, 429, 500, 502, 503, 504, 529])
const RETRYABLE_EVENTS = new Set(['overloaded_error', 'api_error', 'rate_limit_error'])
const MAX_RETRIES = 6

const USAGE =
  'usage: pnpm eval [--runner api|cli|codex] [--claude <path>] [--codex <path>] [--model <id>] ' +
  '[--mode spec|tsx|runtime|project] [--briefs <glob>] [--runs <n>] [--max-iterations <n>] ' +
  '[--effort default|low|medium|high|xhigh|max] [--max-tokens-per-run <n>] ' +
  '[--max-tokens-total <n>] [--fake] [--out <dir>]\n' +
  '       with --mode runtime: [--thinking adaptive|disabled|between_tools] ' +
  '[--framework <name>] [--members default|<subset>|<Member,Member,…>]\n' +
  '       with --mode project and --runner cli|codex: [--tools <tarball|directory>] ' +
  '[--framework <name>] [--max-turns <n>] [--max-minutes <n>] [--no-install]'

const OPENING = 'Build the screen the brief describes.'

const CLOSING =
  'Call `validate` before you answer. Fix every fault and violation it reports, and call it ' +
  'again. Stop when it reports the document lawful, and answer with that document.'

/* -------------------------------------------------------------------------- */
/* Arguments                                                                  */
/* -------------------------------------------------------------------------- */

function refuse(reason) {
  console.error(`eval: ${reason}\n${USAGE}`)
  process.exit(1)
}

const positive = (flag, value) => {
  const number = Number(value)
  if (!Number.isInteger(number) || number < 1) refuse(`\`${flag}\` needs a whole number above 0`)
  return number
}

const VALUED = new Set([
  '--runner',
  '--claude',
  '--codex',
  '--model',
  '--mode',
  '--briefs',
  '--runs',
  '--max-iterations',
  '--effort',
  '--max-tokens-per-run',
  '--max-tokens-total',
  '--out',
  '--framework',
  ...RUNTIME_FLAGS,
  ...PROJECT_FLAGS,
])

/** A number above 0, whole or not: the project lane's time budget is in minutes. */
const above = (flag, value) => {
  const number = Number(value)
  if (!Number.isFinite(number) || number <= 0) refuse(`\`${flag}\` needs a number above 0`)
  return number
}

/** Strict, so a mistyped flag stops the eval instead of silently measuring something else. */
function options(argv) {
  const chosen = {
    ...DEFAULTS,
    ...PROJECT_DEFAULTS,
    fake: false,
    install: true,
    claude: 'claude',
    codex: 'codex',
    out: undefined,
    given: new Set(),
  }
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index]
    if (flag === '--fake') {
      chosen.fake = true
      continue
    }
    if (flag === '--no-install') {
      chosen.install = false
      chosen.given.add(flag)
      continue
    }
    if (!VALUED.has(flag)) refuse(`unknown argument "${flag}"`)
    const value = argv[index + 1]
    if (value === undefined || value.startsWith('--')) refuse(`\`${flag}\` needs a value`)
    index += 1
    chosen.given.add(flag)
    if (flag === '--runner') {
      if (!RUNNERS.includes(value)) refuse('`--runner` is `api`, `cli` or `codex`')
      chosen.runner = value
    } else if (flag === '--claude') chosen.claude = value
    else if (flag === '--codex') chosen.codex = value
    else if (flag === '--model') chosen.model = value
    else if (flag === '--tools') chosen.tools = value
    else if (flag === '--max-turns') chosen.maxTurns = positive(flag, value)
    else if (flag === '--max-minutes') chosen.maxMinutes = above(flag, value)
    else if (flag === '--mode') {
      if (!MODES.includes(value)) refuse('`--mode` is `spec`, `tsx`, `runtime` or `project`')
      chosen.mode = value
    } else if (flag === '--thinking') {
      if (!THINKING.includes(value)) refuse(`\`--thinking\` is one of ${THINKING.join(', ')}`)
      chosen.thinking = value
    } else if (flag === '--framework') chosen.framework = value
    else if (flag === '--members') chosen.members = value
    else if (flag === '--briefs') chosen.briefs = value
    else if (flag === '--runs') chosen.runs = positive(flag, value)
    else if (flag === '--max-iterations') chosen.maxIterations = positive(flag, value)
    else if (flag === '--effort') {
      if (value !== 'default' && !EFFORT_LEVELS.includes(value)) {
        refuse(`\`--effort\` is \`default\` or one of ${EFFORT_LEVELS.join(', ')}`)
      }
      chosen.effort = value
    } else if (flag === '--max-tokens-per-run') chosen.maxTokensPerRun = positive(flag, value)
    else if (flag === '--max-tokens-total') chosen.maxTokensTotal = positive(flag, value)
    else chosen.out = resolve(process.cwd(), value)
  }
  for (const flag of ['--model', '--effort', '--claude', '--codex', '--thinking']) {
    if (chosen.fake && chosen.given.has(flag)) {
      refuse(`\`--fake\` runs the scripted model, so \`${flag}\` does not apply`)
    }
  }
  if (chosen.given.has('--claude') && chosen.runner !== 'cli') {
    refuse('`--claude` names the CLI the `cli` runner runs: add `--runner cli`')
  }
  if (chosen.given.has('--codex') && chosen.runner !== 'codex') {
    refuse('`--codex` names the CLI the `codex` runner runs: add `--runner codex`')
  }
  // Codex names no model in what it reports, and the default model is a Claude model.
  if (chosen.runner === 'codex' && !chosen.fake && !chosen.given.has('--model')) {
    refuse(
      '`--runner codex` needs `--model`: Codex reports no model in its events, and the results ' +
        'must name the model they measured',
    )
  }
  const runtime = chosen.mode === RUNTIME
  const project = chosen.mode === PROJECT
  for (const flag of RUNTIME_FLAGS) {
    if (!runtime && chosen.given.has(flag)) {
      refuse(`\`${flag}\` belongs to the run-time lane: add \`--mode runtime\``)
    }
  }
  if (!runtime && !project && chosen.given.has('--framework')) {
    refuse(
      '`--framework` belongs to the run-time and project lanes: add `--mode runtime` or ' +
        '`--mode project`',
    )
  }
  for (const flag of [...PROJECT_FLAGS, '--no-install']) {
    if (!project && chosen.given.has(flag)) {
      refuse(`\`${flag}\` belongs to the project lane: add \`--mode project\``)
    }
  }
  if (project && chosen.runner === 'api') {
    refuse(
      '`--mode project` starts a harness in an app, and the `api` runner is no harness: it ' +
        'sends the requests itself. Add `--runner cli` or `--runner codex`',
    )
  }
  if (project && chosen.given.has('--max-iterations')) {
    refuse(
      '`--max-iterations` caps the eval’s `validate` calls, and `--mode project` offers the ' +
        'harness no eval tool: `--max-turns` and `--max-minutes` bound its runs',
    )
  }
  // A scripted harness writes the same files whatever the app holds, so it is set up uninstalled.
  if (chosen.fake) chosen.install = false
  if (runtime && chosen.given.has('--max-iterations')) {
    refuse('`--max-iterations` caps `validate` calls, and `--mode runtime` makes none')
  }
  if (chosen.given.has('--thinking') && chosen.runner === 'cli') {
    refuse('`--thinking` is what the API runner sends; the CLI chooses its own thinking')
  }
  if (chosen.given.has('--thinking') && chosen.runner === 'codex') {
    refuse('`--thinking` is what the API runner sends; Codex chooses its own reasoning')
  }
  if (chosen.given.has('--max-tokens-per-run') && chosen.runner === 'codex') {
    refuse(
      '`--max-tokens-per-run` cannot be held for Codex: it reports its tokens only when its ' +
        'turn completes, so no run can be stopped at the ceiling',
    )
  }
  // The committed results only ever hold real runs, so a fake run may not
  // write among them, wherever `--out` puts it.
  if (chosen.fake && chosen.out !== undefined && within(chosen.out, RESULTS)) {
    refuse('`--fake` never writes into eval/results: choose another `--out`, or leave it out')
  }
  if (chosen.fake) chosen.model = 'fake'
  return chosen
}

/**
 * Whether `path` is `directory` or inside it, after symbolic links are
 * resolved, so `/tmp/…` and `/private/tmp/…` are one place. Neither has to
 * exist yet. Compared without case, as on the default macOS and Windows
 * file systems: on a case-sensitive one that refuses more, never less.
 */
function within(path, directory) {
  const real = (target) => {
    const missing = []
    let existing = target
    while (!existsSync(existing) && dirname(existing) !== existing) {
      missing.unshift(basename(existing))
      existing = dirname(existing)
    }
    return resolve(realpathSync(existing), ...missing).toLowerCase()
  }
  const [inner, outer] = [real(path), real(directory)]
  return inner === outer || inner.startsWith(`${outer}${sep}`)
}

/* -------------------------------------------------------------------------- */
/* The models                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * A model is a function from the conversation so far to the next assistant
 * message: `{ content, stop_reason, usage }`, as the Messages API returns it.
 *
 * No refusal fallback is requested. A fallback answers with a different model
 * inside the same call, and the eval exists to measure the one it names.
 *
 * `meter` is the run's: the request adds its retries, the time it waited
 * before them and the tokens of attempts that broke off. `fixed` is what
 * every request of the run carries besides the conversation
 * (`loopRequest`, `runtimeRequest`).
 */
function apiModel({ apiKey, meter, fixed }) {
  return (messages) => request(apiKey, { ...fixed, messages }, meter)
}

/** What every request of a `spec` or `tsx` run carries besides the conversation. */
const loopRequest = ({ model, system, tools, effort }) => ({
  model,
  max_tokens: MAX_TOKENS,
  stream: true,
  thinking: { type: 'adaptive' },
  ...(effort === 'default' ? {} : { output_config: { effort } }),
  // Each turn resends the conversation, so the prefix is cached.
  cache_control: { type: 'ephemeral' },
  system,
  tools,
})

/**
 * What the one request of a `runtime` run carries besides the brief: the card
 * as the whole system prompt, marked for the cache, and no tools. Every run
 * of an eval sends the same card, so after the first request the card is read
 * from the cache, as it is for a host that caches its card, and the brief,
 * which differs, comes after it.
 */
const runtimeRequest = ({ model, card, effort, thinking }) => ({
  model,
  max_tokens: MAX_TOKENS,
  stream: true,
  thinking: { type: thinking },
  ...(effort === 'default' ? {} : { output_config: { effort } }),
  system: [{ type: 'text', text: card, cache_control: { type: 'ephemeral' } }],
})

/** A failure worth sending the request again for: an overload, a dropped connection. */
class RetryableError extends Error {}

/** The API refused, or kept failing. The eval stops, with the runs it finished written. */
class ApiError extends Error {
  reason = 'api'
}

/** A token ceiling was reached. The eval stops the same way. */
class CeilingError extends Error {
  constructor(reason, message) {
    super(message)
    this.reason = reason
  }
}

/** Every token one response's `usage` reports. */
const usageTokens = (usage) =>
  (usage.input_tokens ?? 0) +
  (usage.cache_read_input_tokens ?? 0) +
  (usage.cache_creation_input_tokens ?? 0) +
  (usage.output_tokens ?? 0)

async function request(apiKey, body, meter) {
  for (let attempt = 0; ; attempt += 1) {
    let failure
    // The time to the first token is taken from the attempt that was answered.
    const sentAt = performance.now()
    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': API_VERSION,
        },
        body: JSON.stringify(body),
      })
      if (response.ok) return { ...(await readStream(response.body)), sentAt }
      const detail = await response.text()
      if (!RETRYABLE.has(response.status)) {
        throw new ApiError(`the Messages API answered ${response.status}: ${detail}`)
      }
      failure = { reason: `HTTP ${response.status}`, after: response.headers.get('retry-after') }
    } catch (error) {
      // An attempt that broke off was billed for what it had read and written.
      if (error.usage !== undefined) meter.discardedTokens += usageTokens(error.usage)
      // No answer, a stream that broke off, or an overload: the whole request again.
      if (!(error instanceof RetryableError || isNetwork(error))) throw error
      failure = { reason: error.message, after: null }
    }
    if (attempt >= MAX_RETRIES) throw new ApiError(`the request kept failing: ${failure.reason}`)
    meter.retries += 1
    meter.backoffMs += await backoff(attempt, failure.after, failure.reason)
  }
}

/** A connection that failed or dropped, as Node's `fetch` reports one. */
const isNetwork = (error) =>
  error instanceof TypeError && (error.message === 'fetch failed' || error.message === 'terminated')

/** Waits before a retry, and returns how long it waited, in milliseconds. */
async function backoff(attempt, retryAfter, reason) {
  const seconds = Number(retryAfter) > 0 ? Number(retryAfter) : Math.min(60, 2 ** (attempt + 1))
  console.error(`eval: ${reason}; retrying in ${seconds}s`)
  const ms = Math.round(seconds * 1000)
  await sleep(ms)
  return ms
}

/**
 * The server-sent events of one streamed response, assembled into the message
 * the non-streaming API would have returned. Thinking blocks keep their
 * signatures, because they go back to the model unchanged on the next turn.
 *
 * A tool input that is not a JSON object is kept as the text the model wrote
 * in `unparsed`, under the call's id and with the reason, and the call's `input` is an empty
 * object: the API refuses an assistant turn whose call has any other kind of
 * input. The run answers that call with an `INVALID_JSON` error holding the
 * text. A
 * failure carries the `usage` reported so far, so the tokens of an attempt
 * that broke off are still counted.
 *
 * `firstTextAt` is when the first text of the answer arrived, or null when it
 * has none. A thinking delta is not text: a host has nothing to draw until the
 * answer's own text starts.
 */
async function readStream(body) {
  const message = {
    content: [],
    stop_reason: null,
    usage: {},
    unparsed: new Map(),
    firstTextAt: null,
  }
  try {
    await readEvents(body, message)
  } catch (error) {
    if (error instanceof RetryableError || error instanceof ApiError) {
      error.usage = { ...message.usage }
    }
    throw error
  }
  return message
}

async function readEvents(body, message) {
  const partial = new Map()
  const decoder = new TextDecoder()
  let buffer = ''

  const apply = (event) => {
    switch (event.type) {
      case 'message_start':
        Object.assign(message.usage, event.message.usage)
        break
      case 'content_block_start':
        message.content[event.index] = { ...event.content_block }
        if (event.content_block.type === 'tool_use') partial.set(event.index, '')
        break
      case 'content_block_delta': {
        const block = message.content[event.index]
        const delta = event.delta
        if (delta.type === 'text_delta') {
          block.text += delta.text
          if (delta.text !== '') message.firstTextAt ??= performance.now()
        } else if (delta.type === 'thinking_delta') block.thinking += delta.thinking
        else if (delta.type === 'signature_delta') block.signature = delta.signature
        else if (delta.type === 'input_json_delta') {
          partial.set(event.index, partial.get(event.index) + delta.partial_json)
        }
        break
      }
      case 'content_block_stop':
        if (partial.has(event.index)) {
          const block = message.content[event.index]
          const raw = partial.get(event.index)
          const read = inputOf(raw)
          block.input = read.input ?? {}
          if (read.input === undefined) message.unparsed.set(block.id, { raw, why: read.why })
        }
        break
      case 'message_delta':
        message.stop_reason = event.delta.stop_reason ?? message.stop_reason
        Object.assign(message.usage, event.usage)
        break
      case 'error': {
        // The same failures are retried in the stream as they are as an HTTP
        // status: a rate limit arriving mid-stream is a 429 that came late.
        const kind = event.error?.type ?? 'error'
        const failure = `${kind}: ${event.error?.message ?? 'no message'}`
        if (RETRYABLE_EVENTS.has(kind)) throw new RetryableError(failure)
        throw new ApiError(`the Messages API stream failed with ${failure}`)
      }
    }
  }

  const chunks = body[Symbol.asyncIterator]()
  for (;;) {
    let next
    try {
      next = await chunks.next()
    } catch (error) {
      throw new RetryableError(`the stream broke off: ${error.message}`)
    }
    if (next.done) break
    buffer = (buffer + decoder.decode(next.value, { stream: true })).replace(/\r\n/g, '\n')
    for (let end = buffer.indexOf('\n\n'); end !== -1; end = buffer.indexOf('\n\n')) {
      const data = buffer
        .slice(0, end)
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trimStart())
        .join('\n')
      buffer = buffer.slice(end + 2)
      if (data !== '') apply(JSON.parse(data))
    }
  }
  if (message.stop_reason === null) throw new RetryableError('the stream ended before the message')
}

/**
 * The scripted model, in place of the Messages API: it plays the turns of
 * the run's script (`scriptFor`, `eval/fake/script.mjs`), in order, whatever
 * it is sent.
 *
 * It checks what the real API would refuse: every tool call it made has to be
 * answered in the next message. A harness that forgot one would pass against
 * a fake that did not look.
 */
function fakeModel(file) {
  const next = scriptedTurns(file)
  return async (messages) => {
    answeredEveryCall(messages, file)
    return next()
  }
}

function answeredEveryCall(messages, file) {
  const last = messages.at(-1)
  const previous = messages.at(-2)
  if (last?.role !== 'user') throw new Error(`${file}: the conversation must end with a user turn`)
  if (previous?.role !== 'assistant') return
  const asked = previous.content.filter((block) => block.type === 'tool_use').map((b) => b.id)
  const answered = new Set(
    (Array.isArray(last.content) ? last.content : [])
      .filter((block) => block.type === 'tool_result')
      .map((block) => block.tool_use_id),
  )
  const missing = asked.filter((id) => !answered.has(id))
  if (missing.length > 0) throw new Error(`${file}: no tool_result for ${missing.join(', ')}`)
}

/* -------------------------------------------------------------------------- */
/* One run                                                                    */
/* -------------------------------------------------------------------------- */

function systemPrompt(mode, brief, toolbox) {
  const contract = readFileSync(resolve(EVAL, 'contracts', `${mode}.md`), 'utf8').trim()
  return [
    'You are building one screen with Polymorph, a design system with a closed vocabulary: a ' +
      'screen composes its members and binds content, and expresses no style of its own. The ' +
      'tools describe the vocabulary and check what you write.',
    '',
    '<brief>',
    brief.trim(),
    '</brief>',
    '',
    contract,
    ...(mode === 'spec' ? ['', '```json', toolbox.screenSchema, '```'] : []),
    '',
    CLOSING,
  ].join('\n')
}

/**
 * The message of a `runtime` run: the brief, then what to do with it. The
 * card is the whole system prompt, so nothing about the vocabulary is said
 * here, and the brief names no member (`eval/eval.test.ts`).
 */
const runtimeOpening = (brief) => `<brief>\n${brief.trim()}\n</brief>\n\n${OPENING}`

/** The document a final answer hands back: its last fenced block, preferring the mode's language. */
const FENCES = { spec: ['json'], tsx: ['tsx', 'ts', 'typescript', 'jsx', 'js'] }

function answerIn(text, mode) {
  const blocks = [...text.matchAll(/```([\w-]*)[^\n]*\n([\s\S]*?)```/g)].map((match) => ({
    language: match[1].toLowerCase(),
    body: match[2],
  }))
  const preferred = blocks.filter((block) => FENCES[mode].includes(block.language))
  const chosen = (preferred.length > 0 ? preferred : blocks).at(-1)
  if (chosen !== undefined) return chosen.body
  if (mode !== 'spec') return null
  try {
    JSON.parse(text)
    return text.trim()
  } catch {
    return null
  }
}

/**
 * What one `validate` answer reported, as counting keys. A spec fault's message
 * names the member, the prop and the value; with those elided, the same
 * mistake made on two members counts as one kind.
 */
function kindsOf(verdict) {
  const faultKind = (message) =>
    `spec: ${message
      .split(' — ')[0]
      .replace(/`[^`]*`/g, '`…`')
      .replace(/"[^"]*"/g, '"…"')
      .replace(/\b\d+\b/g, 'N')
      .trim()}`
  return [
    ...(verdict.faults ?? []).map((fault) => faultKind(fault.message)),
    ...(verdict.violations ?? []).map((violation) => violation.rule),
    ...(verdict.contract ?? []).map(() => 'contract'),
    ...(verdict.fatal === null || verdict.fatal === undefined ? [] : ['fatal']),
  ]
}

/** A message kept in a record, cut so a results file stays readable. */
const clip = (text) => (text.length > 600 ? `${text.slice(0, 597)}...` : text)

/**
 * What one unlawful `validate` answer said, kept in words so a miss can be
 * acted on: the counting keys in `violationsSeen` say what kind of mistake was
 * made, this says which member, prop or value.
 */
function missOf(verdict, call) {
  return {
    call,
    fatal: verdict.fatal === undefined || verdict.fatal === null ? null : clip(verdict.fatal),
    faults: (verdict.faults ?? []).map((fault) => clip(fault.message)),
    violations: (verdict.violations ?? []).map((violation) =>
      clip(
        violation.message === undefined
          ? violation.rule
          : `${violation.rule}: ${violation.message}`,
      ),
    ),
    contract: (verdict.contract ?? []).map(clip),
  }
}

/**
 * What one run has spent and waited for, kept outside it so a stopped run's
 * spend is still known. `input` is the uncached input. `reported` says
 * whether a harness that reports its tokens late (Codex, and Claude Code in a
 * project) has reported any; the `api` and `cli` runners read every
 * response's usage and do not set it.
 */
function newMeter() {
  return {
    input: 0,
    cacheRead: 0,
    cacheWrite: 0,
    output: 0,
    discardedTokens: 0,
    retries: 0,
    backoffMs: 0,
    reported: false,
  }
}

/** The tokens a ceiling counts: every token read and written, discarded attempts included. */
const spent = (meter) =>
  meter.input + meter.cacheRead + meter.cacheWrite + meter.output + meter.discardedTokens

/** A response that ended this way never counts as lawful, whatever text it carried. */
const CUT_OFF = new Set(['refusal', 'max_tokens'])

/**
 * Throws when a ceiling is reached. `limits.perRun` and `limits.total` are
 * the ceilings; `limits.before` is what the eval's earlier runs spent. Both
 * runners call it before every request, so no request starts once one is
 * reached.
 */
function checkCeilings(meter, limits) {
  const used = spent(meter)
  if (used >= limits.perRun) {
    throw new CeilingError(
      'tokens-per-run',
      `the run reached the per-run token ceiling (${used} of ${limits.perRun})`,
    )
  }
  if (limits.before + used >= limits.total) {
    throw new CeilingError(
      'tokens-total',
      `the eval reached the total token ceiling (${limits.before + used} of ${limits.total})`,
    )
  }
}

/** What one run's tool calls and `validate` answers add up to, as they happen. */
function newTally() {
  return {
    toolCalls: { get_system_card: 0, search_components: 0, get_component: 0, validate: 0 },
    seen: new Map(),
    misses: [],
    validations: 0,
    firstShot: null,
    lawfulAt: null,
    lastSubmitted: null,
    lastOk: false,
  }
}

function countCall(tally, name) {
  if (Object.hasOwn(tally.toolCalls, name)) tally.toolCalls[name] += 1
}

/** A call's input from the text the model streamed, or why that text is not a JSON object. */
function inputOf(raw) {
  if (raw === '') return { input: {} }
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    return { why: error instanceof Error ? error.message : String(error) }
  }
  if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
    return { input: parsed }
  }
  return { why: 'it is JSON, and not an object' }
}

function countVerdict(tally, verdict, submitted) {
  tally.validations += 1
  tally.lastSubmitted = submitted
  tally.lastOk = verdict.ok
  tally.firstShot ??= verdict.ok
  if (verdict.ok) tally.lawfulAt ??= tally.validations
  for (const kind of kindsOf(verdict)) tally.seen.set(kind, (tally.seen.get(kind) ?? 0) + 1)
  if (!verdict.ok) tally.misses.push(missOf(verdict, tally.validations))
}

/**
 * One run of one brief through the Messages API. Every request is preceded by
 * the ceilings' check. A `runtime` run offers no tool, so its first answer
 * ends it.
 *
 * `timing` is the first request's: when it was sent and when the first text
 * of its answer arrived. The scripted model reports neither, so its call is
 * timed around it.
 */
async function runOnce({
  brief,
  run,
  mode,
  model,
  opening,
  card,
  toolbox,
  requirements,
  maxIterations,
  meter,
  limits,
}) {
  const started = Date.now()
  const messages = [{ role: 'user', content: opening }]
  const tally = newTally()
  const memo = new Map()

  let turns = 0
  let ended = null
  let answer = null
  let harnessFault = null
  let timing = null

  while (ended === null) {
    if (turns >= MAX_TURNS) {
      ended = 'turns'
      break
    }
    checkCeilings(meter, limits)

    const sent = performance.now()
    const reply = await model(messages)
    const received = performance.now()
    const wrote = reply.content.some((block) => block.type === 'text' && block.text !== '')
    timing ??= {
      sentAt: reply.sentAt ?? sent,
      firstTextAt: reply.firstTextAt !== undefined ? reply.firstTextAt : wrote ? received : null,
    }
    turns += 1
    meter.input += reply.usage.input_tokens ?? 0
    meter.cacheRead += reply.usage.cache_read_input_tokens ?? 0
    meter.cacheWrite += reply.usage.cache_creation_input_tokens ?? 0
    meter.output += reply.usage.output_tokens ?? 0
    messages.push({ role: 'assistant', content: reply.content })

    if (reply.stop_reason !== 'tool_use') {
      ended = CUT_OFF.has(reply.stop_reason) ? reply.stop_reason : 'answered'
      answer = reply.content
        .filter((block) => block.type === 'text')
        .map((block) => block.text)
        .join('\n')
      break
    }

    // Every call in the turn is answered in one message, in the order it was made.
    const results = []
    for (const block of reply.content.filter((item) => item.type === 'tool_use')) {
      countCall(tally, block.name)
      const outcome = await answerCall(toolbox, mode, block, reply.unparsed, memo, brief, run)
      if (outcome.fault !== undefined) {
        // The harness failed, so the run measures nothing more about the model.
        harnessFault = outcome.fault
        tally.lastSubmitted = outcome.submitted
        ended = 'harness'
        break
      }
      if (outcome.verdict !== undefined) countVerdict(tally, outcome.verdict, outcome.submitted)
      results.push({
        type: 'tool_result',
        tool_use_id: block.id,
        content: outcome.content,
        ...(outcome.isError ? { is_error: true } : {}),
      })
    }
    if (ended !== null) break
    messages.push({ role: 'user', content: results })
    if (tally.validations >= maxIterations && !tally.lastOk) ended = 'cap'
  }

  return conclude({
    brief,
    run,
    mode,
    card,
    toolbox,
    requirements,
    tally,
    meter,
    started,
    timing,
    turns,
    ended,
    answer,
    harnessFault,
  })
}

/**
 * A run's record, the same for both runners. The harness judges the final
 * document itself, whatever the model claimed: whether it is lawful, and
 * which of the brief's requirements it does not meet. A response that was
 * refused or cut off is not judged: it never counts as lawful or as meeting
 * its brief, and it names no requirement as failed.
 */
async function conclude({ brief, run, mode, card, toolbox, tally, meter, started, turns, ...end }) {
  if (card !== null) return concludeRuntime({ brief, run, card, meter, started, ...end })
  let { ended, harnessFault } = end
  const document = (end.answer === null ? null : answerIn(end.answer, mode)) ?? tally.lastSubmitted
  let lawful = false
  let failedRequirements = []
  if (ended !== 'harness' && !CUT_OFF.has(ended)) {
    try {
      if (document !== null) lawful = (await toolbox.check(mode, document)).ok
      failedRequirements = unmet(end.requirements, mode, document)
    } catch (error) {
      harnessFault = `judging the final document failed: ${messageOf(error)}`
      ended = 'harness'
      lawful = false
      failedRequirements = []
    }
  }

  const record = {
    brief,
    run,
    firstShotLawful: tally.firstShot === true,
    iterations: tally.lawfulAt,
    lawful,
    meetsBrief: failedRequirements.length === 0 && ended !== 'harness' && !CUT_OFF.has(ended),
    failedRequirements,
    ended,
    harnessFault,
    inputTokens: meter.input + meter.cacheRead + meter.cacheWrite,
    cacheReadTokens: meter.cacheRead,
    cacheWriteTokens: meter.cacheWrite,
    outputTokens: meter.output,
    discardedTokens: meter.discardedTokens,
    wallMs: Math.max(0, Date.now() - started - meter.backoffMs),
    retries: meter.retries,
    backoffMs: meter.backoffMs,
    turns,
    toolCalls: tally.toolCalls,
    violationsSeen: Object.fromEntries([...tally.seen].sort(([a], [b]) => a.localeCompare(b))),
    misses: tally.misses,
  }
  return { record, document }
}

/**
 * A `runtime` run's record, the same for both runners. The answer's document
 * is read as a host reads it (`parsePartial`), and judged only when it is
 * whole: by the host's check (`checkScreen`, for the card's framework and
 * members) and by the brief's requirements, which read a run-time document as
 * they read a `spec` one. An answer with no whole document is not lawful and
 * meets no requirement. A response that was refused or cut off is not judged,
 * as in the other modes.
 *
 * There is one request and no `validate` call, so whether the answer is
 * lawful is the first shot as well, and the record holds it once.
 */
function concludeRuntime({ brief, run, card, meter, started, timing, requirements, ...end }) {
  let { ended, harnessFault } = end
  const answer = end.answer ?? ''
  let document = answer
  let lawful = false
  let failedRequirements = []
  let fatal = null
  let faults = []
  if (ended !== 'harness' && !CUT_OFF.has(ended)) {
    try {
      const read = card.parse(answer)
      if (read.document === undefined) fatal = 'the answer holds no document'
      else if (!read.complete) {
        fatal =
          read.error === null
            ? 'the document is cut short: the answer ends before it closes'
            : `the document stops being JSON at character ${read.error.at}, where it needs ` +
              read.error.message
      } else {
        document = read.document
        const verdict = card.check(document)
        lawful = verdict.ok
        faults = verdict.faults.map((fault) => clip(`${fault.path}: ${fault.message}`))
      }
      failedRequirements = unmet(requirements, 'spec', fatal === null ? document : null)
    } catch (error) {
      harnessFault = `judging the answer failed: ${messageOf(error)}`
      ended = 'harness'
      document = answer
      lawful = false
      failedRequirements = []
      fatal = null
      faults = []
    }
  }

  const firstTokenMs =
    timing === null || timing.firstTextAt === null
      ? null
      : Math.max(0, Math.round(timing.firstTextAt - timing.sentAt))
  const record = {
    brief,
    run,
    lawful,
    meetsBrief: failedRequirements.length === 0 && ended !== 'harness' && !CUT_OFF.has(ended),
    failedRequirements,
    ended,
    harnessFault,
    fatal,
    faults,
    inputTokens: meter.input + meter.cacheRead + meter.cacheWrite,
    uncachedInputTokens: meter.input,
    cacheWriteTokens: meter.cacheWrite,
    cacheReadTokens: meter.cacheRead,
    outputTokens: meter.output,
    discardedTokens: meter.discardedTokens,
    firstTokenMs,
    wallMs: Math.max(0, Date.now() - started - meter.backoffMs),
    retries: meter.retries,
    backoffMs: meter.backoffMs,
  }
  return { record, document }
}

/** What a `validate` call whose input was not a JSON object is recorded as. */
const UNPARSED_CALL = 'the input of the `validate` call is not a JSON object'

/**
 * The answer to one tool call. Whatever a tool throws goes back to the model
 * as an error result with the message, and the run goes on; only `validate`
 * failing inside its check ends the run, as a harness fault. An input that was
 * not a JSON object is never run: it goes back as the raw text, under
 * `INVALID_JSON`. Where the call was `validate`, it is a submission that is not
 * lawful, as a document that is not JSON is when it arrives as text.
 */
async function answerCall(toolbox, mode, block, unparsed, memo, brief, run) {
  const kept = unparsed?.get(block.id)
  if (kept !== undefined) {
    const { raw, why } = kept
    const answer = { content: JSON.stringify({ INVALID_JSON: raw, why }), isError: true }
    if (block.name !== 'validate') return answer
    const fatal = `${UNPARSED_CALL}: ${why}, in ${raw.length} characters`
    return { ...answer, verdict: { ok: false, faults: [], violations: [], fatal }, submitted: raw }
  }
  const outcome = await callTool(toolbox, mode, block, memo)
  if (outcome.failed !== undefined) {
    console.error(`eval: ${brief} #${run}: \`${block.name}\` failed: ${outcome.failed}`)
  }
  return outcome
}

/* -------------------------------------------------------------------------- */
/* The Claude Code CLI                                                        */
/* -------------------------------------------------------------------------- */

/**
 * `--runner cli` runs each brief through `claude -p` instead of the Messages
 * API: the owner's own Claude Code, signed in the way they sign it in, so the
 * eval needs no key of its own. Everything around the model is the API
 * runner's: the system prompt, the opening message, the four tools and their
 * answers, the iteration cap, the request limit, the ceilings, the judging
 * and the record.
 *
 * The CLI is given the tools by `eval/mcp.mjs`, the only MCP server it is
 * configured with, and nothing else. It gets no built-in tool, none of the
 * owner's settings, plugins, hooks, skills or other MCP servers, and an empty
 * directory outside the repository to work in, so it reads no CLAUDE.md.
 *
 * The CLI drives the loop itself, so the runner reads it. `stream-json` with
 * the raw stream events carries each request's usage as the API reported it,
 * and the server's journal carries each `validate` verdict. The runner stops
 * the CLI where the API runner would stop sending requests: at the iteration
 * cap, the request limit, a ceiling or a harness fault, and after a response
 * that ended in a refusal or at `max_tokens`. It stops it when the last tool
 * result of a turn goes back. The CLI may have sent its next request by then;
 * that request is abandoned, and is not in the record.
 *
 * A `runtime` run gives the CLI the card as its system prompt, the brief on
 * stdin, no built-in tool and an MCP configuration with no server, and stops
 * the CLI when its first response ends, so it is held to one request with no
 * tools. A CLI that reports a tool at start-up stops the eval. The CLI does
 * not report when it sends a request, so the run has no time to the first
 * token, and its wall time starts at the CLI's start-up report.
 */

/** How the CLI names the eval's MCP tools: the server's key in the config, then the tool. */
const CLI_PREFIX = 'mcp__polymorph__'

/** Generous, so the CLI hands every tool answer back whole, as the API runner does. */
const MCP_OUTPUT_TOKENS = 200_000

/**
 * The environment the CLI runs in (`claudeEnvironment`, `eval/harnesses.mjs`),
 * with its output capped at the API runner's `max_tokens` and its MCP output
 * at a size that hands every tool answer back whole.
 */
const cliEnvironment = () =>
  claudeEnvironment({
    CLAUDE_CODE_MAX_OUTPUT_TOKENS: String(MAX_TOKENS),
    MAX_MCP_OUTPUT_TOKENS: String(MCP_OUTPUT_TOKENS),
  })

/**
 * The tool definitions as an MCP server lists them. None is marked
 * `readOnlyHint`: Claude Code may run a turn's calls to read-only tools at the
 * same time, and the server would then journal their verdicts in the order
 * they finished. Unmarked, the calls run one at a time in the order the model
 * made them, which is the order the API runner answers them in.
 */
const mcpTools = (definitions) =>
  definitions.map(({ name, description, input_schema: inputSchema }) => ({
    name,
    description,
    inputSchema,
  }))

/** Every flag the runner passes; each one is load-bearing, and `eval/fake/cli.mjs` checks them. */
function cliArguments({ settings, system, config, names }) {
  return [
    '-p',
    ...(settings.fake ? [] : ['--model', settings.model]),
    ...(settings.effort === 'default' ? [] : ['--effort', settings.effort]),
    // The API runner's system prompt. The CLI adds a line of its own before it, and a note
    // of the working directory, the platform, the model and the date after the opening message.
    '--system-prompt',
    system,
    // No built-in tool, so the four MCP tools are all the model is offered, and in the
    // `runtime` mode, whose configuration names no server, nothing is.
    '--tools',
    '',
    ...(names.length === 0
      ? []
      : ['--allowedTools', names.map((name) => `${CLI_PREFIX}${name}`).join(',')]),
    '--permission-mode',
    'dontAsk',
    '--strict-mcp-config',
    '--mcp-config',
    config,
    // None of the owner's settings, so no plugin or hook of theirs runs.
    '--setting-sources',
    '',
    '--disable-slash-commands',
    '--no-session-persistence',
    '--output-format',
    'stream-json',
    '--include-partial-messages',
    '--verbose',
  ]
}

/**
 * The journal of a run's MCP server (`eval/mcp.mjs`), read as the harness
 * reports each call's result. `read` counts the verdicts the server wrote
 * since the last read, in the order it answered. Only a line that ends in a
 * newline is read. The server may still be appending one while the harness
 * reports another call's result, and that line is read whole at a later
 * read.
 *
 * A call's line is read once the harness has reported that call's result
 * (`answered`), and not before. The server writes the line when it answers,
 * and the harness may be a turn ahead of the line of its output the runner
 * is reading. A verdict read that early would count against the turn before
 * it, and the iteration cap would end the run without the turn that made the
 * call. Lines and results are matched by tool, so a result the server never
 * wrote a line for (a tool the harness denied or does not have) lets no other
 * tool's line through early.
 *
 * `listed` says whether the server has listed every tool in `names`. A line
 * that reports a fault is handed to `onFault`, and reading stops there.
 */
function journalReader({ file, names, brief, run, tally, onFault }) {
  /** How much of the journal has been read: every line up to the last one read whole. */
  let read = 0
  /** Per tool: the results the harness has reported and the journal lines read. */
  const answeredCalls = new Map()
  const readCalls = new Map()
  let listed = false
  return {
    get listed() {
      return listed
    },
    answered(tool) {
      answeredCalls.set(tool, (answeredCalls.get(tool) ?? 0) + 1)
    },
    read() {
      const text = readFileSync(file, 'utf8')
      const end = text.lastIndexOf('\n') + 1
      while (read < end) {
        const next = text.indexOf('\n', read) + 1
        const line = text.slice(read, next - 1)
        if (line === '') {
          read = next
          continue
        }
        const entry = JSON.parse(line)
        if (entry.listed !== undefined) {
          listed = names.every((name) => entry.listed.includes(name))
          read = next
          continue
        }
        const lines = readCalls.get(entry.tool) ?? 0
        if (lines >= (answeredCalls.get(entry.tool) ?? 0)) return
        readCalls.set(entry.tool, lines + 1)
        read = next
        if (entry.failed !== undefined) {
          console.error(`eval: ${brief} #${run}: \`${entry.tool}\` failed: ${entry.failed}`)
        }
        if (entry.fault !== undefined) {
          onFault(entry)
          return
        }
        if (entry.verdict !== undefined) countVerdict(tally, entry.verdict, entry.submitted)
      }
    },
  }
}

/**
 * One run of one brief through the CLI. `cli` is the eval's: the command that
 * starts the CLI, and the files every run's MCP server reads. It returns what
 * `runOnce` returns, and the cost the CLI reported when it finished on its own.
 */
async function runOnceCli({
  brief,
  run,
  mode,
  system,
  opening,
  card,
  settings,
  toolbox,
  requirements,
  cli,
  meter,
  limits,
}) {
  checkCeilings(meter, limits)

  const runtime = card !== null
  const directory = resolve(cli.scratch, `${brief}-${run}`)
  const app = resolve(directory, 'app')
  mkdirSync(app, { recursive: true })
  const journal = resolve(directory, 'journal.jsonl')
  writeFileSync(journal, '')
  const config = resolve(directory, 'mcp.json')
  const server = {
    type: 'stdio',
    command: process.execPath,
    args: [
      MCP_SERVER,
      ...['--mode', mode, '--tools', cli.tools, '--registry', cli.registry],
      ...['--journal', journal],
    ],
  }
  writeFileSync(config, JSON.stringify({ mcpServers: runtime ? {} : { polymorph: server } }))

  const child = spawn(
    cli.command,
    [
      ...cli.prefix,
      ...(settings.fake ? ['--script', cli.scriptFor(brief, run)] : []),
      ...cliArguments({ settings, system, config, names: runtime ? [] : cli.names }),
    ],
    { cwd: app, env: cliEnvironment(), stdio: ['pipe', 'pipe', 'pipe'] },
  )
  const exited = new Promise((done) => {
    child.on('close', (code, signal) => done({ code, signal }))
    child.on('error', (error) => done({ code: null, signal: null, error }))
  })
  track(() => child.kill('SIGKILL'), exited)
  child.stdin.on('error', () => {})
  child.stdin.end(opening)
  let stderr = ''
  child.stderr.on('data', (chunk) => (stderr = (stderr + chunk).slice(-8000)))

  const tally = newTally()
  let started = Date.now()
  let turns = 0
  /** The response being streamed: its id, its usage so far and its stop reason. */
  let open = null
  /** Each response's text, and its tool calls, by id; a call is counted once its response asked for tools. */
  const texts = new Map()
  const calls = new Map()
  let last = null
  const pending = new Set()
  /** Each call's tool by its id. */
  const toolOf = new Map()
  /** What the CLI said of the server at the start. */
  let connection = 'not listed'
  let limited = false
  let result = null
  let harnessFault = null
  /** What stopped the CLI before it finished: `{ ended }`, or `{ error }`, which stops the eval. */
  let stop = null

  const halt = (decision) => {
    if (stop !== null) return
    stop = decision
    child.kill('SIGTERM')
    setTimeout(() => child.kill('SIGKILL'), 5000).unref()
  }

  const journalLines = journalReader({
    file: journal,
    names: cli.names,
    brief,
    run,
    tally,
    onFault: (entry) => {
      // The harness failed, so the run measures nothing more about the model.
      harnessFault = entry.fault
      tally.lastSubmitted = entry.submitted ?? tally.lastSubmitted
      halt({ ended: 'harness' })
    },
  })
  const readJournal = () => journalLines.read()

  const streamed = (event) => {
    switch (event.type) {
      case 'message_start':
        if (!runtime && turns === 0 && !journalLines.listed) {
          readJournal()
          if (!journalLines.listed) {
            // Every run would go the same way, so the eval stops.
            const message =
              'the CLI sent its first request before the eval’s MCP server had listed its ' +
              `tools (the server was ${connection} when the CLI started); this version of ` +
              'the CLI does not wait for its MCP servers'
            halt({ error: new CliError('cli', message) })
            break
          }
        }
        open = { id: event.message.id, usage: { ...event.message.usage }, stopReason: null }
        break
      case 'message_delta':
        if (open === null) break
        Object.assign(open.usage, event.usage)
        open.stopReason = event.delta?.stop_reason ?? open.stopReason
        break
      case 'message_stop': {
        if (open === null) break
        turns += 1
        meter.input += open.usage.input_tokens ?? 0
        meter.cacheRead += open.usage.cache_read_input_tokens ?? 0
        meter.cacheWrite += open.usage.cache_creation_input_tokens ?? 0
        meter.output += open.usage.output_tokens ?? 0
        last = open
        open = null
        // One request: the first response ends the run, however it ended.
        if (runtime) halt({ ended: CUT_OFF.has(last.stopReason) ? last.stopReason : 'answered' })
        else if (last.stopReason === 'tool_use') {
          for (const call of calls.get(last.id) ?? []) {
            countCall(tally, call.name)
            pending.add(call.id)
            toolOf.set(call.id, call.name)
          }
        } else if (CUT_OFF.has(last.stopReason)) halt({ ended: last.stopReason })
        break
      }
    }
  }

  const onEvent = (event) => {
    switch (event.type) {
      case 'system':
        if (event.subtype === 'init') {
          started = Date.now()
          // Some versions report a server still connecting as `pending` here; the first
          // request is where the tools have to be there.
          connection =
            event.mcp_servers?.find((entry) => entry.name === 'polymorph')?.status ?? 'not listed'
          if (runtime) {
            // Every run would go the same way, so the eval stops.
            const offered = [
              ...(event.tools ?? []),
              ...(event.mcp_servers ?? []).map((server) => `the MCP server ${server.name}`),
            ]
            if (offered.length > 0) {
              const message =
                `the CLI started with ${offered.join(', ')}, and a runtime run offers the ` +
                'model no tool'
              halt({ error: new CliError('cli', message) })
            }
          } else if (connection !== 'connected' && connection !== 'pending') {
            const message = `the CLI did not connect to the eval’s MCP server (${connection})`
            halt({ error: new CliError('cli', message) })
          }
        } else if (event.subtype === 'api_retry') {
          // A response that broke off had been billed for what it read, as in the API runner.
          meter.retries += 1
          meter.backoffMs += Math.max(0, Math.round(Number(event.retry_delay_ms) || 0))
          if (open !== null) meter.discardedTokens += usageTokens(open.usage)
          open = null
        }
        break
      case 'stream_event':
        streamed(event.event ?? {})
        break
      case 'assistant': {
        const message = event.message ?? {}
        // A message the CLI wrote itself reports an error, not a model's answer.
        if (message.model === '<synthetic>') {
          if (event.error === 'rate_limit') limited = true
          break
        }
        for (const block of message.content ?? []) {
          if (block.type === 'text') {
            texts.set(message.id, [...(texts.get(message.id) ?? []), block.text])
          }
          if (block.type !== 'tool_use') continue
          const name = block.name.startsWith(CLI_PREFIX)
            ? block.name.slice(CLI_PREFIX.length)
            : block.name
          // A call reported after its response finished asking for tools is counted at once.
          if (last?.id === message.id && last.stopReason === 'tool_use') {
            countCall(tally, name)
            pending.add(block.id)
            toolOf.set(block.id, name)
          } else calls.set(message.id, [...(calls.get(message.id) ?? []), { id: block.id, name }])
        }
        break
      }
      case 'user': {
        const content = Array.isArray(event.message?.content) ? event.message.content : []
        const answered = content.filter((block) => block.type === 'tool_result')
        if (answered.length === 0) break
        for (const block of answered) {
          pending.delete(block.tool_use_id)
          const tool = toolOf.get(block.tool_use_id)
          if (tool !== undefined) journalLines.answered(tool)
        }
        readJournal()
        if (stop !== null || pending.size > 0) break
        // Every call of the turn is answered: where the API runner decides whether to send the next request.
        if (tally.validations >= settings.maxIterations && !tally.lastOk) halt({ ended: 'cap' })
        else if (turns >= MAX_TURNS) halt({ ended: 'turns' })
        else {
          try {
            checkCeilings(meter, limits)
          } catch (error) {
            halt({ error })
          }
        }
        break
      }
      case 'rate_limit_event':
        if (event.rate_limit_info?.status === 'rejected') limited = true
        break
      case 'result':
        result = event
        break
    }
  }

  try {
    for await (const line of createInterface({ input: child.stdout })) {
      if (stop !== null) continue
      let event
      try {
        event = JSON.parse(line)
      } catch {
        continue
      }
      onEvent(event)
    }
  } catch (error) {
    // An exception while reading the stream stops the CLI, which would
    // otherwise keep running against the owner's plan with nothing reading it.
    // The exception is what the run ends with, and what it prints from here on
    // is discarded.
    halt({ error })
    stop = { error }
    child.stdout.resume()
  }
  const { code, signal, error } = await exited
  rmSync(directory, { recursive: true, force: true })

  let ended
  let answer = null
  if (stop?.error !== undefined) throw stop.error
  if (stop !== null) {
    ended = stop.ended
    if (CUT_OFF.has(ended) || runtime) answer = (texts.get(last.id) ?? []).join('\n')
  } else if (result === null) {
    const how =
      error === undefined ? `exited with ${code ?? signal}` : `did not start: ${error.message}`
    throw new CliError('cli', `the CLI ${how} before it reported a result${tail(stderr)}`)
  } else if (result.is_error || last === null) {
    const said =
      typeof result.result === 'string' && result.result !== ''
        ? result.result
        : [result.subtype, ...(result.errors ?? [])].filter(Boolean).join(': ')
    throw new CliError(
      limited || LIMIT_WORDS.test(said) ? 'usage-limit' : 'cli',
      `the CLI reported: ${said}`,
    )
  } else {
    ended = 'answered'
    answer = texts.has(last.id) ? texts.get(last.id).join('\n') : (result.result ?? '')
  }

  const measured = await conclude({
    brief,
    run,
    mode,
    card,
    toolbox,
    requirements,
    tally,
    meter,
    started,
    // The CLI does not report when it sends a request.
    timing: { sentAt: null, firstTextAt: null },
    turns,
    ended,
    answer,
    harnessFault,
  })
  return { ...measured, cost: stop === null ? (result?.total_cost_usd ?? null) : null }
}

/* -------------------------------------------------------------------------- */
/* The Codex CLI                                                              */
/* -------------------------------------------------------------------------- */

/**
 * `--runner codex` runs each brief through `codex exec`, the owner's own
 * Codex, as the `cli` runner runs it through `claude -p`: the same system
 * prompt, opening message, four tools served by `eval/mcp.mjs`, iteration
 * cap, ceilings, judging and record. It has not been run against a real
 * Codex; `docs/verification.md` lists what only a real run can confirm.
 *
 * Codex gets a home of the run's own (`codexHome`, `eval/harnesses.mjs`), so
 * none of the owner's configuration, instructions, plugins or MCP servers
 * reach it, and an empty directory outside the repository to work in, so it
 * reads no `AGENTS.md`. Its own tools are turned off, the eval's MCP server
 * is the only one it is given, and the eval's system prompt replaces its own
 * instructions (`codexArguments`).
 *
 * Codex reports items as it goes and its tokens once, when its turn ends
 * (`turn.completed`); it reports no request. So the runner counts the
 * iteration cap as the CLI runner does, when the last call in flight has
 * been answered, and counts the request limit in tool calls. A run the
 * runner stops before Codex ends its turn has no token count, and records
 * null. A run with no request count records `turns` as null. Codex reports no
 * stop reason, so no run of it ends `refusal` or `max_tokens`, and no cost.
 *
 * Codex is expected to use the eval's tools and nothing else. A command, a
 * file change, a web search or another agent in its stream means a tool of
 * its own was still on, and every run would go the same way, so the eval
 * stops and says so.
 */

/**
 * Items that mean Codex used a tool of its own. `todo_list` is its plan tool,
 * which no setting turns off
 * (https://learn.chatgpt.com/docs/config-file/config-reference lists none).
 */
const CODEX_OWN_TOOLS = new Set([
  'command_execution',
  'file_change',
  'web_search',
  'collab_tool_call',
  'todo_list',
])

/**
 * Every argument `codex exec` is given. Each is load-bearing, and
 * `eval/fake/codex.mjs` checks them. The URL each rests on is beside it.
 *
 * - `exec --json`, `-` for the prompt on stdin, `--skip-git-repo-check`,
 *   `--ephemeral`: a run with no person, its events as JSON lines, in a
 *   directory that is no repository, with no session saved
 *   (https://learn.chatgpt.com/docs/non-interactive-mode,
 *   https://learn.chatgpt.com/docs/developer-commands).
 * - `--sandbox read-only` and `approval_policy = "never"`: nothing waits for
 *   a person and nothing is written.
 * - `model_instructions_file`: the eval's system prompt in place of Codex's
 *   built-in instructions
 *   (https://learn.chatgpt.com/docs/config-file/config-reference).
 * - `mcp_servers`: the eval's server and no other, `required` so a server
 *   that does not start fails the run, every tool approved, because
 *   `approval_policy = "never"` denies an MCP call that needs approval and
 *   the server marks no tool read-only (https://learn.chatgpt.com/docs/extend/mcp,
 *   `requires_mcp_tool_approval` in `codex-rs/core/src/mcp_tool_call.rs` of
 *   https://github.com/openai/codex), and each tool's output limit raised so
 *   every answer comes back whole.
 * - `features.*`, `web_search`, `skills.*`: Codex's own tools, its skills and
 *   their catalogue turned off, so the four tools are all the model is offered
 *   (https://learn.chatgpt.com/docs/config-file/config-reference).
 * - `history.persistence`, `check_for_update_on_startup`: nothing saved,
 *   nothing fetched.
 */
function codexArguments({ settings, instructions, server }) {
  return [
    'exec',
    '--json',
    '--skip-git-repo-check',
    '--ephemeral',
    '--color',
    'never',
    '--sandbox',
    'read-only',
    ...(settings.fake ? [] : ['--model', settings.model]),
    ...override('approval_policy', 'never'),
    ...(settings.effort === 'default' ? [] : override('model_reasoning_effort', settings.effort)),
    ...override('model_instructions_file', instructions),
    ...override('mcp_servers', server === null ? {} : { polymorph: server }),
    ...override('features.shell_tool', false),
    ...override('features.unified_exec', false),
    ...override('features.view_image', false),
    ...override('features.multi_agent', false),
    ...override('features.apps', false),
    ...override('web_search', 'disabled'),
    ...override('skills.include_instructions', false),
    ...override('skills.bundled.enabled', false),
    ...override('history.persistence', 'none'),
    ...override('check_for_update_on_startup', false),
    '-',
  ]
}

/**
 * One run of one brief through Codex. `codex` is the eval's: the command that
 * starts Codex, and the files every run's MCP server reads. It returns what
 * `runOnce` returns, with no cost.
 */
async function runOnceCodex({
  brief,
  run,
  mode,
  system,
  opening,
  card,
  settings,
  toolbox,
  requirements,
  codex,
  meter,
  limits,
}) {
  checkCeilings(meter, limits)

  const runtime = card !== null
  const directory = resolve(codex.scratch, `${brief}-${run}`)
  const app = resolve(directory, 'app')
  mkdirSync(app, { recursive: true })
  const journal = resolve(directory, 'journal.jsonl')
  writeFileSync(journal, '')
  const instructions = resolve(directory, 'instructions.md')
  writeFileSync(instructions, system)
  const server = runtime
    ? null
    : {
        command: process.execPath,
        args: [
          MCP_SERVER,
          ...['--mode', mode, '--tools', codex.tools, '--registry', codex.registry],
          ...['--journal', journal],
        ],
        required: true,
        startup_timeout_sec: 60,
        tool_timeout_sec: 600,
        default_tools_approval_mode: 'approve',
        tools: Object.fromEntries(
          codex.names.map((name) => [name, { output_token_limit: MCP_OUTPUT_TOKENS }]),
        ),
      }
  const home = codexHome(resolve(directory, 'codex-home'))

  const child = spawn(
    codex.command,
    [
      ...codex.prefix,
      ...(settings.fake ? ['--script', codex.scriptFor(brief, run)] : []),
      ...codexArguments({ settings, instructions, server }),
    ],
    { cwd: app, env: codexEnvironment(home), stdio: ['pipe', 'pipe', 'pipe'] },
  )
  const exited = new Promise((done) => {
    child.on('close', (code, signal) => done({ code, signal }))
    child.on('error', (error) => done({ code: null, signal: null, error }))
  })
  track(() => child.kill('SIGKILL'), exited)
  child.stdin.on('error', () => {})
  child.stdin.end(opening)
  let stderr = ''
  child.stderr.on('data', (chunk) => (stderr = (stderr + chunk).slice(-8000)))

  const tally = newTally()
  let started = Date.now()
  /** The MCP calls Codex has started and not yet reported, by item id, and every call it made. */
  const pending = new Map()
  const made = new Set()
  const texts = []
  let completed = false
  let failed = null
  let lastError = null
  let harnessFault = null
  let stop = null

  const halt = (decision) => {
    if (stop !== null) return
    stop = decision
    child.kill('SIGTERM')
    setTimeout(() => child.kill('SIGKILL'), 5000).unref()
  }

  const journalLines = journalReader({
    file: journal,
    names: codex.names,
    brief,
    run,
    tally,
    onFault: (entry) => {
      harnessFault = entry.fault
      tally.lastSubmitted = entry.submitted ?? tally.lastSubmitted
      halt({ ended: 'harness' })
    },
  })

  /** A call Codex made, counted once, whether it was reported started or only completed. */
  const madeCall = (item) => {
    if (made.has(item.id)) return
    made.add(item.id)
    countCall(tally, item.tool)
    pending.set(item.id, item.tool)
  }

  const ownTool = (item) => {
    const what =
      item.type === 'mcp_tool_call'
        ? `a tool of the MCP server \`${item.server}\``
        : `an item of type \`${item.type}\``
    const message =
      `Codex used ${what}, and the eval offers the model ` +
      (runtime ? 'no tool in a runtime run' : 'only its four tools') +
      ': this version of Codex keeps a tool of its own on that `codexArguments` turns off'
    halt({ error: new CliError('cli', message) })
  }

  const onEvent = (event) => {
    switch (event.type) {
      case 'thread.started':
        started = Date.now()
        break
      case 'item.started':
      case 'item.completed': {
        const item = event.item ?? {}
        if (CODEX_OWN_TOOLS.has(item.type)) {
          ownTool(item)
          break
        }
        if (item.type === 'mcp_tool_call') {
          if (runtime || item.server !== 'polymorph') {
            ownTool(item)
            break
          }
          madeCall(item)
        }
        if (event.type !== 'item.completed') break
        if (item.type === 'agent_message' && typeof item.text === 'string') texts.push(item.text)
        if (item.type !== 'mcp_tool_call') break
        pending.delete(item.id)
        journalLines.answered(item.tool)
        journalLines.read()
        if (stop !== null || pending.size > 0) break
        // Every call in flight is answered: where the API runner decides whether to send the next request.
        if (tally.validations >= settings.maxIterations && !tally.lastOk) halt({ ended: 'cap' })
        else if (made.size >= MAX_TURNS) halt({ ended: 'turns' })
        break
      }
      case 'error':
        lastError = event.message ?? lastError
        break
      case 'turn.completed':
        meterCodexUsage(meter, event.usage)
        completed = true
        break
      case 'turn.failed':
        failed = event.error?.message ?? lastError ?? 'turn failed'
        break
    }
  }

  try {
    for await (const line of createInterface({ input: child.stdout })) {
      if (stop !== null) continue
      let event
      try {
        event = JSON.parse(line)
      } catch {
        continue
      }
      onEvent(event)
    }
  } catch (error) {
    halt({ error })
    stop = { error }
    child.stdout.resume()
  }
  const { code, signal, error } = await exited
  if (!runtime && stop === null) journalLines.read()
  rmSync(directory, { recursive: true, force: true })

  let ended
  let answer = null
  if (stop?.error !== undefined) throw stop.error
  if (stop !== null) ended = stop.ended
  else if (failed !== null) {
    throw new CliError(
      LIMIT_WORDS.test(failed) ? 'usage-limit' : 'cli',
      `Codex reported: ${failed}`,
    )
  } else if (!completed) {
    const how =
      error === undefined ? `exited with ${code ?? signal}` : `did not start: ${error.message}`
    const said = lastError === null ? '' : `; it last reported: ${lastError}`
    throw new CliError('cli', `Codex ${how} before its turn ended${said}${tail(stderr)}`)
  } else if (!runtime && !journalLines.listed) {
    // Every run would go the same way, so the eval stops.
    throw new CliError(
      'cli',
      'Codex finished without listing the eval’s MCP server’s tools: this version of Codex ' +
        'did not start the server `codexArguments` names',
    )
  } else {
    ended = 'answered'
    answer = texts.at(-1) ?? ''
  }

  const measured = await conclude({
    brief,
    run,
    mode,
    card,
    toolbox,
    requirements,
    tally,
    meter,
    started,
    // Codex does not report when it sends a request.
    timing: { sentAt: null, firstTextAt: null },
    turns: null,
    ended,
    answer,
    harnessFault,
  })
  return { ...measured, record: unreported(measured.record, meter), cost: null }
}

/**
 * A Codex record with what Codex does not report set to null: the requests
 * it sent again, the time it waited for them and the tokens of attempts that
 * broke off, always; every token count when it reported none; and the cache
 * writes when it reports no such part.
 */
function unreported(record, meter) {
  const none = { retries: null, backoffMs: null, discardedTokens: null }
  if (meter.reported === false) {
    for (const field of [
      'inputTokens',
      'uncachedInputTokens',
      'cacheReadTokens',
      'cacheWriteTokens',
      'outputTokens',
    ]) {
      if (Object.hasOwn(record, field)) none[field] = null
    }
  } else if (meter.cacheWriteReported === false) none.cacheWriteTokens = null
  return { ...record, ...none }
}

/* -------------------------------------------------------------------------- */
/* The run-time card                                                          */
/* -------------------------------------------------------------------------- */

/**
 * The card a `runtime` run sends, and how its answer is read and checked,
 * for the framework and members the run names. The card and the check take
 * the same options, as a host passes the same `members` to both: a member
 * the card leaves out is one the check refuses.
 *
 * `record` is what the results file says of the card: its framework, how
 * its members were chosen, every member it lists and its length.
 */
async function cardFor({ framework: named, members: asked }) {
  const screen = await loadScreen()
  const framework = named ?? screen.defaultFramework
  if (!screen.frameworks.includes(framework)) {
    refuse(`\`--framework\` is one of ${screen.frameworks.join(', ')}`)
  }
  const { chosen, members } = membersOf(asked, screen)
  const options = { framework, ...(members === undefined ? {} : { members }) }
  const text = screen.runtimeCard(options)
  return {
    text,
    record: {
      framework,
      chosen,
      members: members ?? screen.defaultMembers(framework),
      characters: text.length,
    },
    parse: (answer) => screen.parsePartial(answer),
    check: (document) => screen.checkScreen(document, options),
  }
}

/** The subsets `--members` can name: `eval/members/<name>.json`, each a list of members. */
const subsets = () =>
  existsSync(SUBSETS)
    ? readdirSync(SUBSETS)
        .filter((file) => file.endsWith('.json'))
        .map((file) => basename(file, '.json'))
        .sort()
    : []

/**
 * The members `--members` names. Absent or `default`, the framework's own
 * default, which the card and the check choose themselves. A lower-case name
 * is a subset in `eval/members/`. Anything else is a list of members, joined
 * by commas. A name the vocabulary does not have stops the eval before any
 * run: the card would leave it out without a word.
 */
function membersOf(asked, screen) {
  if (asked === undefined || asked === 'default') return { chosen: 'default', members: undefined }
  let names
  let chosen
  if (/^[a-z][a-z0-9-]*$/.test(asked)) {
    const file = resolve(SUBSETS, `${asked}.json`)
    if (!existsSync(file)) {
      refuse(
        `no subset called \`${asked}\` in eval/members/; the subsets are ` +
          `${subsets().join(', ') || 'none'}, and a list of members is joined by commas`,
      )
    }
    names = JSON.parse(readFileSync(file, 'utf8'))
    if (!Array.isArray(names) || names.some((entry) => typeof entry !== 'string')) {
      refuse(`eval/members/${asked}.json is not a list of member names`)
    }
    chosen = asked
  } else {
    names = asked.split(',').map((entry) => entry.trim())
    chosen = 'list'
  }
  names = [...new Set(names.filter((entry) => entry !== ''))]
  if (names.length === 0) refuse('`--members` names no member')
  const known = new Set(screen.names())
  const unknown = names.filter((entry) => !known.has(entry))
  if (unknown.length > 0) {
    refuse(
      `\`--members\` names ${unknown.map((entry) => `\`${entry}\``).join(', ')}, which the ` +
        'vocabulary does not have as a member or an exception primitive',
    )
  }
  return { chosen, members: names }
}

/* -------------------------------------------------------------------------- */
/* Results                                                                    */
/* -------------------------------------------------------------------------- */

const sum = (values) => values.reduce((total, value) => total + value, 0)

/** A count summed over the runs that report it, or null when none does: Codex reports no retry. */
const reportedSum = (records, field) => {
  const values = records.map((record) => record[field]).filter((value) => value !== null)
  return values.length === 0 && records.length > 0 ? null : sum(values)
}
const mean = (values) => sum(values) / values.length
const rounded = (value, places) => Math.round(value * 10 ** places) / 10 ** places

/**
 * The figures over a set of runs. A harness fault is the harness's failure,
 * so it is counted in `endings` and the retry totals and left out of every
 * rate and mean. A run that ended lawful without a lawful `validate` call has
 * no call count, so it is counted on its own, never in `meanIterations`.
 *
 * Each rate is followed by its 95% interval over the measured runs, so a
 * reader of the file sees how far the sample fixes it.
 */
function summarise(records, endings) {
  const measured = records.filter((record) => record.ended !== 'harness')
  const lawful = measured.filter((record) => record.lawful)
  const validated = lawful.filter((record) => record.iterations !== null)
  const share = (count) => (measured.length === 0 ? null : rounded(count / measured.length, 4))
  const bounds = (count) => {
    const found = interval(count, measured.length)
    return found === null ? null : { low: rounded(found.low, 4), high: rounded(found.high, 4) }
  }
  const tally = (test) => measured.filter(test).length
  // A count a harness did not report is null, and is left out of its mean.
  const average = (field) => {
    const values = measured.map((record) => record[field]).filter((value) => value !== null)
    return values.length === 0 ? null : Math.round(mean(values))
  }
  const failed = new Map()
  for (const record of measured) {
    for (const id of record.failedRequirements) {
      const key = `${record.brief}/${id}`
      failed.set(key, (failed.get(key) ?? 0) + 1)
    }
  }
  const [firstShot, meets, both] = [
    tally((record) => record.firstShotLawful),
    tally((record) => record.meetsBrief),
    tally((record) => record.lawful && record.meetsBrief),
  ]
  return {
    runs: records.length,
    measured: measured.length,
    endings: Object.fromEntries(
      endings.map((ending) => [ending, records.filter((record) => record.ended === ending).length]),
    ),
    firstShotRate: share(firstShot),
    firstShotInterval: bounds(firstShot),
    lawfulRate: share(lawful.length),
    lawfulInterval: bounds(lawful.length),
    meetsBriefRate: share(meets),
    meetsBriefInterval: bounds(meets),
    lawfulAndMeetsBriefRate: share(both),
    lawfulAndMeetsBriefInterval: bounds(both),
    failedRequirements: Object.fromEntries([...failed].sort(([a], [b]) => a.localeCompare(b))),
    meanIterations:
      validated.length === 0
        ? null
        : rounded(mean(validated.map((record) => record.iterations)), 2),
    lawfulWithoutValidate: lawful.length - validated.length,
    meanInputTokens: average('inputTokens'),
    meanOutputTokens: average('outputTokens'),
    meanWallMs: average('wallMs'),
    retries: reportedSum(records, 'retries'),
    backoffMs: reportedSum(records, 'backoffMs'),
    discardedTokens: reportedSum(records, 'discardedTokens'),
  }
}

/**
 * The figures over a set of `runtime` runs, kept as `summarise` keeps them:
 * a harness fault is left out of every rate and mean, and each rate has its
 * 95% interval. There is one request and no `validate` call, so there is no
 * first-shot rate apart from the lawful rate and no call count. Each time has
 * its mean and its fastest and slowest run; the time to the first token is
 * over the runs that measured one.
 */
function summariseRuntime(records, endings) {
  const measured = records.filter((record) => record.ended !== 'harness')
  const share = (count) => (measured.length === 0 ? null : rounded(count / measured.length, 4))
  const bounds = (count) => {
    const found = interval(count, measured.length)
    return found === null ? null : { low: rounded(found.low, 4), high: rounded(found.high, 4) }
  }
  const tally = (test) => measured.filter(test).length
  const average = (values) => (values.length === 0 ? null : Math.round(mean(values)))
  // A count a harness did not report is null, and is left out of its mean.
  const meanOf = (field) =>
    average(measured.map((record) => record[field]).filter((value) => value !== null))
  const timed = (field) => measured.map((record) => record[field]).filter((ms) => ms !== null)
  const range = (field) => {
    const values = timed(field)
    return values.length === 0 ? null : { low: Math.min(...values), high: Math.max(...values) }
  }
  const failed = new Map()
  for (const record of measured) {
    for (const id of record.failedRequirements) {
      const key = `${record.brief}/${id}`
      failed.set(key, (failed.get(key) ?? 0) + 1)
    }
  }
  const [lawful, meets, both] = [
    tally((record) => record.lawful),
    tally((record) => record.meetsBrief),
    tally((record) => record.lawful && record.meetsBrief),
  ]
  return {
    runs: records.length,
    measured: measured.length,
    endings: Object.fromEntries(
      endings.map((ending) => [ending, records.filter((record) => record.ended === ending).length]),
    ),
    lawfulRate: share(lawful),
    lawfulInterval: bounds(lawful),
    meetsBriefRate: share(meets),
    meetsBriefInterval: bounds(meets),
    lawfulAndMeetsBriefRate: share(both),
    lawfulAndMeetsBriefInterval: bounds(both),
    failedRequirements: Object.fromEntries([...failed].sort(([a], [b]) => a.localeCompare(b))),
    unreadable: tally((record) => record.ended === 'answered' && record.fatal !== null),
    meanInputTokens: meanOf('inputTokens'),
    meanUncachedInputTokens: meanOf('uncachedInputTokens'),
    meanCacheWriteTokens: meanOf('cacheWriteTokens'),
    meanCacheReadTokens: meanOf('cacheReadTokens'),
    meanOutputTokens: meanOf('outputTokens'),
    meanFirstTokenMs: average(timed('firstTokenMs')),
    firstTokenRangeMs: range('firstTokenMs'),
    meanWallMs: meanOf('wallMs'),
    wallRangeMs: range('wallMs'),
    retries: reportedSum(records, 'retries'),
    backoffMs: reportedSum(records, 'backoffMs'),
    discardedTokens: reportedSum(records, 'discardedTokens'),
  }
}

/**
 * Throws when a finished run's tokens are unknown: a harness that reports its
 * tokens only when it finishes (Codex, or Claude Code before its first
 * response) was stopped before it did. What that run spent cannot be added to
 * the total, so the total ceiling can no longer be held, and no further run
 * starts. A run that is the eval's last stops nothing.
 */
function holdsTotalCeiling(records) {
  const unknown = records.find((record) => record.inputTokens === null)
  if (unknown === undefined) return
  throw new CeilingError(
    'tokens-total',
    `${unknown.brief} #${unknown.run} ended before its harness reported its tokens, so the total ` +
      `token ceiling (${settings.maxTokensTotal}) can no longer be held`,
  )
}

/**
 * The per-run ceiling the runs are held to. Codex reports its tokens only
 * when its turn completes, so no ceiling stops a Codex run part-way, and the
 * results record none.
 */
const perRunCeiling = () => (settings.runner === 'codex' ? Infinity : settings.maxTokensPerRun)

/** What a finished run spent, as the ceilings count it. A count its harness did not report adds nothing. */
const recordTokens = (record) =>
  (record.inputTokens ?? 0) + (record.outputTokens ?? 0) + (record.discardedTokens ?? 0)

function commit() {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim()
  } catch {
    return null
  }
}

/**
 * `<date>-<model>-<mode>`, `-cli` or `-codex` after it for the runners that
 * start a harness, and a counter when that name is taken.
 */
function freeStem(out, at, model, mode, runner) {
  const base =
    `${at.slice(0, 10)}-${model.replace(/[^A-Za-z0-9.-]/g, '-')}-${mode}` +
    (runner === 'api' ? '' : `-${runner}`)
  let stem = base
  for (let next = 2; existsSync(resolve(out, `${stem}.json`)); next += 1) stem = `${base}-${next}`
  return stem
}

/** Written as `prettier --check` expects, because the committed results are checked by it. */
async function writeFormatted(file, value) {
  const config = (await prettier.resolveConfig(file)) ?? {}
  writeFileSync(file, await prettier.format(JSON.stringify(value), { ...config, filepath: file }))
}

/**
 * A spec is stored as the object it is, so the outputs file reads as JSON
 * rather than as an escaped string. The document a harness fault was raised
 * on is kept as the text that was submitted, so the fault can be replayed
 * exactly.
 */
function storedDocument(document, mode, ended) {
  if (document === null || mode !== 'spec' || ended === 'harness') return document
  try {
    return JSON.parse(document)
  } catch {
    return document
  }
}

/** A path under the working directory as a relative one, any other in full. */
const shown = (path) =>
  path.startsWith(`${process.cwd()}${sep}`) ? relative(process.cwd(), path) : path

/* -------------------------------------------------------------------------- */
/* Main                                                                       */
/* -------------------------------------------------------------------------- */

const settings = options(process.argv.slice(2))

/**
 * The scratch directories the eval makes: removed when it ends, when it
 * stops early, and when a signal stops it (`onInterrupt`, which also stops
 * every harness still running).
 */
const scratches = new Set()
const scratchDirectory = (prefix) => {
  const directory = mkdtempSync(resolve(tmpdir(), prefix))
  scratches.add(directory)
  return directory
}
onInterrupt(() => {
  for (const directory of scratches) rmSync(directory, { recursive: true, force: true })
})

const apiKey = process.env.ANTHROPIC_API_KEY
if (settings.runner === 'api' && !settings.fake && !apiKey) {
  refuse(
    'ANTHROPIC_API_KEY is not set. The eval calls the Messages API and needs a key; ' +
      '`--runner cli` runs Claude Code as you are signed in to it, `--runner codex` runs ' +
      'Codex the same way, and `--fake` runs the scripted model instead.',
  )
}

/**
 * The harness the `cli` or `codex` runner starts for each run: the owner's,
 * or the scripted stand-in for it. Null for the `api` runner.
 */
const launcher =
  settings.runner === 'api'
    ? null
    : settings.fake
      ? { command: process.execPath, prefix: [settings.runner === 'cli' ? FAKE_CLI : FAKE_CODEX] }
      : { command: settings.runner === 'cli' ? settings.claude : settings.codex, prefix: [] }
const cliVersion =
  launcher === null
    ? null
    : settings.runner === 'cli'
      ? versionOf(launcher, claudeEnvironment(), 'Claude Code CLI', refuse)
      : versionOf(launcher, process.env, 'Codex CLI', refuse)

const briefs = globSync(settings.briefs, { cwd: ROOT })
  .map((path) => resolve(ROOT, path))
  .filter((path) => path.endsWith('.md'))
  .sort((a, b) => a.localeCompare(b))
if (briefs.length === 0) refuse(`no brief matches ${settings.briefs}`)

const name = (path) => basename(path, '.md')

/**
 * The turns the scripted model plays for a run of a brief:
 * `<brief>.<mode>.<run>.json` where that run has a script of its own, and
 * `<brief>.<mode>.json` for every other run. A brief whose runs differ is what
 * exercises the rates and their intervals.
 */
const scriptFor = (brief, run) => {
  const own = resolve(FAKES, `${name(brief)}.${settings.mode}.${run}.json`)
  return run !== undefined && existsSync(own)
    ? own
    : resolve(FAKES, `${name(brief)}.${settings.mode}.json`)
}
if (settings.fake) {
  const missing = briefs.filter((brief) => !existsSync(scriptFor(brief)))
  if (missing.length > 0) {
    refuse(
      `the scripted model has no script for ${missing.map(name).join(', ')} in ${settings.mode} ` +
        `mode (eval/fake/<brief>.${settings.mode}.json)`,
    )
  }
}

/** The whole brief set as it stands now. A run over all of it can be the number. */
const everyBrief = readdirSync(BRIEFS)
  .filter((file) => file.endsWith('.md'))
  .map((file) => basename(file, '.md'))
  .sort((a, b) => a.localeCompare(b))

/**
 * The run-time card every `runtime` run sends, made once, so every run sends
 * the same card: `null` in the other modes.
 */
const card = settings.mode === RUNTIME ? await cardFor(settings) : null

const out =
  settings.out ?? (settings.fake ? mkdtempSync(resolve(tmpdir(), 'polymorph-eval-')) : RESULTS)
const at = new Date().toISOString()
const toolbox = await loadToolbox()
const project = settings.mode === PROJECT
const tools = card === null && !project ? toolbox.tools(settings.mode) : []

/**
 * What each brief requires of its screen. The eval stops before any run when
 * a requirement names a member the vocabulary does not have, or a chosen
 * brief has none: either would record a rate that measures nothing.
 */
let required
try {
  required = loadRequirements({ registry: toolbox.registry, shapes: toolbox.requirementShapes })
} catch (error) {
  refuse(messageOf(error))
}
const unjudged = briefs.filter((brief) => !required.has(name(brief)))
if (unjudged.length > 0) {
  refuse(
    `no requirements for ${unjudged.map(name).join(', ')} ` +
      '(eval/requirements/<brief>.json): a brief without them cannot be judged',
  )
}

/**
 * What every `cli` or `codex` run's MCP server reads, written once: the tool
 * definitions, and the registry the eval judges with, as JSON. Each run adds
 * a directory of its own beside them, and the whole is removed when the eval
 * ends. A `runtime` run starts no server, so it writes neither. The project
 * lane sets its app up instead (`lane`).
 */
let cli = null
if (launcher !== null && !project) {
  const scratch = scratchDirectory(`polymorph-eval-${settings.runner}-`)
  cli = {
    ...launcher,
    scratch,
    tools: resolve(scratch, 'tools.json'),
    registry: resolve(scratch, 'registry.json'),
    names: tools.map((tool) => tool.name),
    scriptFor: (brief, run) => scriptFor(resolve(BRIEFS, `${brief}.md`), run),
  }
  if (card === null) {
    writeFileSync(cli.tools, JSON.stringify(mcpTools(tools)))
    writeFileSync(cli.registry, JSON.stringify(toolbox.registry))
  }
}

/**
 * The project lane's setup, made once: the tools, the template every run
 * copies (`makeTemplate`, `eval/project.mjs`) and the harness that runs in
 * each copy. The tools failing to set the app up stops the eval before its
 * first run. Null in the other modes.
 */
let lane = null
if (project) {
  const scratch = scratchDirectory('polymorph-eval-project-')
  try {
    const projectTools = resolveTools(settings.tools, { scratch })
    console.error(
      `eval: setting a ${settings.framework ?? 'react'} app up with ${projectTools.path}` +
        (settings.install ? ', installed once for every run' : ', not installed'),
    )
    const template = makeTemplate({
      tools: projectTools,
      framework: settings.framework ?? 'react',
      harness: settings.runner,
      scratch,
      install: settings.install,
    })
    lane = {
      scratch,
      tools: projectTools,
      template,
      harness: settings.runner,
      launcher,
      scriptFor: (brief, run) => scriptFor(resolve(BRIEFS, `${brief}.md`), run),
    }
  } catch (error) {
    rmSync(scratch, { recursive: true, force: true })
    if (error instanceof SetupError) refuse(error.message)
    throw error
  }
}

const removeScratch = () => {
  if (cli !== null) rmSync(cli.scratch, { recursive: true, force: true })
  if (lane !== null) rmSync(lane.scratch, { recursive: true, force: true })
}

mkdirSync(out, { recursive: true })
const stem = freeStem(out, at, settings.model, settings.mode, settings.runner)
const resultsFile = resolve(out, `${stem}.json`)
const readme = out === RESULTS ? resolve(EVAL, 'README.md') : resolve(out, 'README.md')
const polymorph = { version: toolbox.registry.version, commit: commit() }

const records = []
const outputs = []

/** The settings a results file records, by mode. */
const recordedSettings = () =>
  project
    ? {
        briefs: settings.briefs,
        runs: settings.runs,
        framework: settings.framework ?? 'react',
        maxTurns: settings.maxTurns,
        maxMinutes: settings.maxMinutes,
        effort: settings.effort,
        maxTokensPerRun: settings.runner === 'codex' ? null : settings.maxTokensPerRun,
        maxTokensTotal: settings.maxTokensTotal,
      }
    : card === null
      ? {
          briefs: settings.briefs,
          runs: settings.runs,
          maxIterations: settings.maxIterations,
          maxTurns: MAX_TURNS,
          maxTokens: MAX_TOKENS,
          effort: settings.effort,
          maxTokensPerRun: settings.runner === 'codex' ? null : settings.maxTokensPerRun,
          maxTokensTotal: settings.maxTokensTotal,
        }
      : {
          briefs: settings.briefs,
          runs: settings.runs,
          maxTokens: MAX_TOKENS,
          effort: settings.effort,
          thinking: settings.runner === 'api' ? settings.thinking : null,
          maxTokensPerRun: settings.runner === 'codex' ? null : settings.maxTokensPerRun,
          maxTokensTotal: settings.maxTokensTotal,
        }

/**
 * Writes the results and the outputs as they stand, and re-renders the page.
 * Called after every run with `partial` set, and once more at the end
 * without it, so an eval that stops keeps every run it finished.
 */
async function save({ partial, stopped }) {
  const [summariseRuns, endings] = project
    ? [summariseProject, toolbox.projectEndings]
    : card === null
      ? [summarise, toolbox.endings]
      : [summariseRuntime, toolbox.runtimeEndings]
  const results = {
    schema: 'polymorph-eval/1',
    at,
    model: settings.model,
    mode: settings.mode,
    runner: settings.runner,
    cliVersion,
    fake: settings.fake,
    partial,
    stopped,
    polymorph,
    briefs: everyBrief,
    settings: recordedSettings(),
    ...(card === null ? {} : { card: card.record }),
    ...(lane === null
      ? {}
      : {
          project: {
            tools: {
              from: lane.tools.from,
              path: lane.tools.path,
              version: lane.tools.version,
            },
            installed: lane.template.installed,
            agents: lane.template.agents,
            mcpServers: lane.template.mcpServers,
          },
        }),
    outputs: `${stem}.outputs.json`,
    requirements: briefs.map((brief) => ({
      brief: name(brief),
      digest: required.get(name(brief)).digest,
      requirements: required.get(name(brief)).requirements.map(({ id, says }) => ({ id, says })),
    })),
    summary: {
      overall: summariseRuns(records, endings),
      briefs: briefs.map((brief) => ({
        brief: name(brief),
        ...summariseRuns(
          records.filter((record) => record.brief === name(brief)),
          endings,
        ),
      })),
    },
    records,
  }

  const faults = toolbox.validateResults(results)
  if (faults.length > 0) {
    throw new Error(`eval: the results do not match their schema:\n${faults.join('\n')}`)
  }
  await writeFormatted(resultsFile, results)
  await writeFormatted(resolve(out, results.outputs), { outputs })
  writeReport({ results: out, readme })
  return results
}

/** A token count as a run's line prints it: a number, or what was not reported. */
const counted = (value) => (value === null ? 'unreported' : `${value}`)

/** What a project run did, as the line it prints when it finishes. */
function projectLine(record) {
  const builds = record.builds === null ? 'not built' : record.builds ? 'builds' : 'does not build'
  const brief =
    record.meetsBrief === null
      ? 'its screen not judged'
      : record.meetsBrief
        ? 'meets its brief'
        : `does not meet its brief (${record.failedRequirements.join(', ')})`
  const verbs = Object.keys(record.verbs)
  const tools = Object.keys(record.mcpCalls)
  return (
    `eval: ${record.brief} #${record.run} — ${record.lawful ? 'lawful' : 'not lawful'} ` +
    `(${record.ended}), ${builds}, ${brief}, ` +
    `${record.written.length} file${record.written.length === 1 ? '' : 's'} written, ` +
    `MCP tools ${tools.length === 0 ? 'none' : tools.join(', ')}, ` +
    `verbs ${verbs.length === 0 ? 'none' : verbs.join(', ')}, ` +
    `${counted(record.inputTokens)} in / ${counted(record.outputTokens)} out, ` +
    `${(record.wallMs / 1000).toFixed(1)}s` +
    (record.harnessFault === null ? '' : `\neval: harness fault: ${record.harnessFault}`)
  )
}

/** What a run did, as the line it prints when it finishes. */
function runLine(record, cost) {
  if (project) return projectLine(record)
  const ending = `(${record.ended}${CUT_OFF.has(record.ended) ? ', never counted lawful' : ''}), `
  const brief = record.meetsBrief
    ? 'meets its brief, '
    : record.failedRequirements.length > 0
      ? `does not meet its brief (${record.failedRequirements.join(', ')}), `
      : 'never counted as meeting its brief, '
  const lines =
    card === null
      ? `first shot ${record.firstShotLawful ? 'lawful' : 'not lawful'}, ` +
        brief +
        (record.iterations === null
          ? `no validate call lawful (${record.toolCalls.validate} made), `
          : `lawful at validate call ${record.iterations}, `) +
        `${counted(record.inputTokens)} in / ${counted(record.outputTokens)} out, ` +
        `${(record.wallMs / 1000).toFixed(1)}s`
      : brief +
        `${counted(record.inputTokens)} in (${counted(record.cacheReadTokens)} read from the ` +
        `cache, ${counted(record.cacheWriteTokens)} written to it) / ` +
        `${counted(record.outputTokens)} out, ` +
        (record.firstTokenMs === null
          ? ''
          : `first token at ${(record.firstTokenMs / 1000).toFixed(2)}s, `) +
        `${(record.wallMs / 1000).toFixed(2)}s` +
        (record.fatal === null ? '' : `; ${record.fatal}`)
  return (
    `eval: ${record.brief} #${record.run} — ${record.lawful ? 'lawful' : 'not lawful'} ` +
    ending +
    lines +
    (record.retries > 0 ? `, ${record.retries} retried` : '') +
    (typeof cost === 'number' ? `, $${cost.toFixed(2)} by the CLI's count` : '') +
    (record.harnessFault === null ? '' : `\neval: harness fault: ${record.harnessFault}`)
  )
}

for (const brief of briefs) {
  const text = readFileSync(brief, 'utf8')
  // The `runtime` mode's system prompt is the card alone, and its message is the brief.
  // The `project` mode sends neither: the harness has its own prompt, and the brief is its request.
  const [system, opening] = project
    ? [null, null]
    : card === null
      ? [systemPrompt(settings.mode, text, toolbox), OPENING]
      : [card.text, runtimeOpening(text)]
  for (let run = 1; run <= settings.runs; run += 1) {
    const meter = newMeter()
    const limits = {
      perRun: perRunCeiling(),
      total: settings.maxTokensTotal,
      before: sum(records.map(recordTokens)),
    }
    let measured
    try {
      holdsTotalCeiling(records)
      if (lane !== null) {
        checkCeilings(meter, limits)
        measured = await runOnceProject({
          brief: name(brief),
          run,
          text,
          lane,
          settings,
          toolbox,
          requirements: required.get(name(brief)).requirements,
          meter,
          ceilings: () => checkCeilings(meter, limits),
        })
        rmSync(measured.directory, { recursive: true, force: true })
      } else if (cli !== null && settings.runner === 'codex') {
        measured = await runOnceCodex({
          brief: name(brief),
          run,
          mode: settings.mode,
          system,
          opening,
          card,
          settings,
          toolbox,
          requirements: required.get(name(brief)).requirements,
          codex: cli,
          meter,
          limits,
        })
      } else if (cli !== null) {
        measured = await runOnceCli({
          brief: name(brief),
          run,
          mode: settings.mode,
          system,
          opening,
          card,
          settings,
          toolbox,
          requirements: required.get(name(brief)).requirements,
          cli,
          meter,
          limits,
        })
      } else {
        const fixed =
          card === null
            ? loopRequest({ model: settings.model, system, tools, effort: settings.effort })
            : runtimeRequest({
                model: settings.model,
                card: system,
                effort: settings.effort,
                thinking: settings.thinking,
              })
        const model = settings.fake
          ? fakeModel(scriptFor(brief, run))
          : apiModel({ apiKey, meter, fixed })
        measured = await runOnce({
          brief: name(brief),
          run,
          mode: settings.mode,
          model,
          opening,
          card,
          toolbox,
          requirements: required.get(name(brief)).requirements,
          maxIterations: settings.maxIterations,
          meter,
          limits,
        })
      }
    } catch (error) {
      // The API or a harness failing, or a ceiling, stops the eval. The runs that
      // finished are kept, marked partial, so the report lists them and never
      // takes its number from them; the unfinished run is named, with what it
      // spent.
      removeScratch()
      if (!(
        error instanceof ApiError ||
        error instanceof CliError ||
        error instanceof CeilingError
      )) {
        throw error
      }
      const stopped = {
        reason: error.reason,
        brief: name(brief),
        run,
        message: error.message,
        tokens: spent(meter),
      }
      await save({ partial: true, stopped })
      console.error(
        `eval: ${name(brief)} #${run}: ${error.message}\n` +
          `eval: stopped; ${shown(resultsFile)} holds the ${records.length} finished ` +
          `run${records.length === 1 ? '' : 's'}, marked partial`,
      )
      process.exit(1)
    }
    const { record, document, cost } = measured
    records.push(record)
    outputs.push({
      brief: record.brief,
      run,
      document: storedDocument(document, settings.mode, record.ended),
    })
    console.error(runLine(record, cost))
    await save({ partial: true, stopped: null })
  }
}

removeScratch()
const results = await save({ partial: false, stopped: null })

const { overall } = results.summary
const percent = (rate) => (rate === null ? '—' : `${Math.round(rate * 100)}%`)
console.error(
  `eval: ${shown(resultsFile)} — lawful ${percent(overall.lawfulRate)}, ` +
    (project
      ? `builds ${percent(overall.buildsRate)}, ` +
        `meets its brief ${percent(overall.meetsBriefRate)}, ` +
        `all three ${percent(overall.allThreeRate)}, `
      : (card === null ? `first shot ${percent(overall.firstShotRate)}, ` : '') +
        `meets its brief ${percent(overall.meetsBriefRate)}, ` +
        `both ${percent(overall.lawfulAndMeetsBriefRate)}, `) +
    `over ${overall.measured} run${overall.measured === 1 ? '' : 's'}; ${shown(readme)} rendered`,
)
