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
import { createInterface } from 'node:readline'
import { setTimeout as sleep } from 'node:timers/promises'
import { TextDecoder } from 'node:util'

import * as prettier from 'prettier'

import { scriptedTurns } from './fake/script.mjs'
import { writeReport } from './report.mjs'
import { loadRequirements, unmet } from './requirements.mjs'
import { interval } from './spread.mjs'
import { callTool, loadToolbox, messageOf, ROOT } from './toolbox.mjs'

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
 * There are two runners. The `api` runner, the default, reaches the model
 * over the Messages API with `fetch`, streamed, because a long turn with
 * thinking can outlast the time Node's `fetch` waits for response headers. It
 * needs `ANTHROPIC_API_KEY`. The `cli` runner runs each brief through
 * `claude -p`, the owner's own Claude Code, with the same tools served over
 * MCP (`eval/mcp.mjs`), and needs no key (see "The Claude Code CLI" below).
 * Both feed the same measurements, so their numbers compare.
 *
 * `--fake` swaps the model for a scripted one (`eval/fake/`) that replays
 * turns, so the harness itself is testable without a key: in place of the
 * Messages API for the `api` runner, and in place of the CLI
 * (`eval/fake/cli.mjs`) for the `cli` runner. Everything downstream of the
 * model, the tools included, runs for real either way.
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

/**
 * `ANTHROPIC_BASE_URL` points the eval at another host, as it does the SDKs; the
 * test uses a local one. A trailing slash is dropped, as the SDKs drop it.
 */
const API_URL = `${(process.env.ANTHROPIC_BASE_URL ?? 'https://api.anthropic.com').replace(/\/+$/, '')}/v1/messages`
const API_VERSION = '2023-06-01'

/** `--effort` values besides `default`, which sends none and leaves the model's own default. */
const EFFORT_LEVELS = ['low', 'medium', 'high', 'xhigh', 'max']

/** How the model is reached: the Messages API, or the Claude Code CLI. */
const RUNNERS = ['api', 'cli']

const DEFAULTS = {
  runner: 'api',
  model: 'claude-sonnet-5-5',
  mode: 'spec',
  briefs: 'eval/briefs/*.md',
  runs: 1,
  maxIterations: 5,
  effort: 'default',
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
  'usage: pnpm eval [--runner api|cli] [--claude <path>] [--model <id>] [--mode spec|tsx] ' +
  '[--briefs <glob>] [--runs <n>] [--max-iterations <n>] ' +
  '[--effort default|low|medium|high|xhigh|max] [--max-tokens-per-run <n>] ' +
  '[--max-tokens-total <n>] [--fake] [--out <dir>]'

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
  '--model',
  '--mode',
  '--briefs',
  '--runs',
  '--max-iterations',
  '--effort',
  '--max-tokens-per-run',
  '--max-tokens-total',
  '--out',
])

/** Strict, so a mistyped flag stops the eval instead of silently measuring something else. */
function options(argv) {
  const chosen = { ...DEFAULTS, fake: false, claude: 'claude', out: undefined, given: new Set() }
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index]
    if (flag === '--fake') {
      chosen.fake = true
      continue
    }
    if (!VALUED.has(flag)) refuse(`unknown argument "${flag}"`)
    const value = argv[index + 1]
    if (value === undefined || value.startsWith('--')) refuse(`\`${flag}\` needs a value`)
    index += 1
    chosen.given.add(flag)
    if (flag === '--runner') {
      if (!RUNNERS.includes(value)) refuse('`--runner` is `api` or `cli`')
      chosen.runner = value
    } else if (flag === '--claude') chosen.claude = value
    else if (flag === '--model') chosen.model = value
    else if (flag === '--mode') {
      if (value !== 'spec' && value !== 'tsx') refuse('`--mode` is `spec` or `tsx`')
      chosen.mode = value
    } else if (flag === '--briefs') chosen.briefs = value
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
  for (const flag of ['--model', '--effort', '--claude']) {
    if (chosen.fake && chosen.given.has(flag)) {
      refuse(`\`--fake\` runs the scripted model, so \`${flag}\` does not apply`)
    }
  }
  if (chosen.given.has('--claude') && chosen.runner !== 'cli') {
    refuse('`--claude` names the CLI the `cli` runner runs: add `--runner cli`')
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
 * before them and the tokens of attempts that broke off.
 */
function apiModel({ apiKey, model, system, tools, effort, meter }) {
  return (messages) =>
    request(
      apiKey,
      {
        model,
        max_tokens: MAX_TOKENS,
        stream: true,
        thinking: { type: 'adaptive' },
        ...(effort === 'default' ? {} : { output_config: { effort } }),
        // Each turn resends the conversation, so the prefix is cached.
        cache_control: { type: 'ephemeral' },
        system,
        tools,
        messages,
      },
      meter,
    )
}

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
      if (response.ok) return await readStream(response.body)
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
 * A tool input that is not JSON stays the raw text the model wrote, so the
 * assistant turn goes back exactly as it came, and its id is listed in
 * `unparsed`; the run answers that call with an `INVALID_JSON` error. A
 * failure carries the `usage` reported so far, so the tokens of an attempt
 * that broke off are still counted.
 */
async function readStream(body) {
  const message = { content: [], stop_reason: null, usage: {}, unparsed: new Set() }
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
        if (delta.type === 'text_delta') block.text += delta.text
        else if (delta.type === 'thinking_delta') block.thinking += delta.thinking
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
          try {
            block.input = raw === '' ? {} : JSON.parse(raw)
          } catch {
            block.input = raw
            message.unparsed.add(block.id)
          }
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

/** What one run has spent and waited for, kept outside it so a stopped run's spend is still known. */
function newMeter() {
  return {
    input: 0,
    cacheRead: 0,
    cacheWrite: 0,
    output: 0,
    discardedTokens: 0,
    retries: 0,
    backoffMs: 0,
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
 * the ceilings' check.
 */
async function runOnce({
  brief,
  run,
  mode,
  model,
  toolbox,
  requirements,
  maxIterations,
  meter,
  limits,
}) {
  const started = Date.now()
  const messages = [{ role: 'user', content: OPENING }]
  const tally = newTally()
  const memo = new Map()

  let turns = 0
  let ended = null
  let answer = null
  let harnessFault = null

  while (ended === null) {
    if (turns >= MAX_TURNS) {
      ended = 'turns'
      break
    }
    checkCeilings(meter, limits)

    const reply = await model(messages)
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
    toolbox,
    requirements,
    tally,
    meter,
    started,
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
async function conclude({ brief, run, mode, toolbox, tally, meter, started, turns, ...end }) {
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
 * The answer to one tool call. Whatever a tool throws goes back to the model
 * as an error result with the message, and the run goes on; only `validate`
 * failing inside its check ends the run, as a harness fault. An input that was
 * not JSON is never run: it goes back as the raw text, under `INVALID_JSON`.
 */
async function answerCall(toolbox, mode, block, unparsed, memo, brief, run) {
  if (unparsed?.has(block.id)) {
    return { content: JSON.stringify({ INVALID_JSON: block.input }), isError: true }
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
 */

/** How the CLI names the eval's MCP tools: the server's key in the config, then the tool. */
const CLI_PREFIX = 'mcp__polymorph__'

/** Generous, so the CLI hands every tool answer back whole, as the API runner does. */
const MCP_OUTPUT_TOKENS = 200_000

/** How the CLI words a usage or rate limit on the account it is signed in to. */
const LIMIT_WORDS = /hit your (?:\w+ )?limit|usage limit|rate limit/i

/** The CLI failed, or reported an error of its own. The eval stops, with the runs it finished written. */
class CliError extends Error {
  constructor(reason, message) {
    super(message)
    this.reason = reason
  }
}

/**
 * The `CLAUDE*` variables kept for the CLI: the ones that choose how it signs
 * in and where it keeps its configuration.
 */
const SIGN_IN = new Set([
  'CLAUDE_CODE_OAUTH_TOKEN',
  'CLAUDE_CODE_USE_BEDROCK',
  'CLAUDE_CODE_USE_VERTEX',
  'CLAUDE_CODE_USE_FOUNDRY',
  'CLAUDE_CONFIG_DIR',
])

/**
 * The environment the CLI runs in: the eval's own, without the other `CLAUDE*`
 * variables. A Claude Code session sets those for the processes it starts,
 * among them the session's effort and a switch that drops the `mcp__` prefix
 * from tool names, and an eval started from inside one would otherwise run the
 * CLI as part of that session. Output is capped at the API runner's
 * `max_tokens`.
 */
function cliEnvironment() {
  const kept = Object.entries(process.env).filter(
    ([name]) => !name.startsWith('CLAUDE') || SIGN_IN.has(name),
  )
  return {
    ...Object.fromEntries(kept),
    CLAUDE_CODE_MAX_OUTPUT_TOKENS: String(MAX_TOKENS),
    MAX_MCP_OUTPUT_TOKENS: String(MCP_OUTPUT_TOKENS),
  }
}

/** The CLI's version, as `--version` prints it. A CLI that does not run stops the eval before it starts. */
function versionOf(launcher) {
  try {
    const printed = execFileSync(launcher.command, [...launcher.prefix, '--version'], {
      encoding: 'utf8',
      env: cliEnvironment(),
      timeout: 60_000,
    })
    return printed.trim().split(/\s+/)[0] ?? 'unknown'
  } catch (error) {
    refuse(
      `the Claude Code CLI did not run (\`${launcher.command} --version\`): ${messageOf(error)}`,
    )
  }
}

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
    // No built-in tool, so the four MCP tools are all the model is offered.
    '--tools',
    '',
    '--allowedTools',
    names.map((name) => `${CLI_PREFIX}${name}`).join(','),
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

/** The end of what the CLI wrote to stderr, for a failure's message. */
const tail = (text) => (text.trim() === '' ? '' : `: ${text.trim().slice(-2000)}`)

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
  settings,
  toolbox,
  requirements,
  cli,
  meter,
  limits,
}) {
  checkCeilings(meter, limits)

  const directory = resolve(cli.scratch, `${brief}-${run}`)
  const app = resolve(directory, 'app')
  mkdirSync(app, { recursive: true })
  const journal = resolve(directory, 'journal.jsonl')
  writeFileSync(journal, '')
  const config = resolve(directory, 'mcp.json')
  writeFileSync(
    config,
    JSON.stringify({
      mcpServers: {
        polymorph: {
          type: 'stdio',
          command: process.execPath,
          args: [
            MCP_SERVER,
            ...['--mode', mode, '--tools', cli.tools, '--registry', cli.registry],
            ...['--journal', journal],
          ],
        },
      },
    }),
  )

  const child = spawn(
    cli.command,
    [
      ...cli.prefix,
      ...(settings.fake ? ['--script', cli.scriptFor(brief, run)] : []),
      ...cliArguments({ settings, system, config, names: cli.names }),
    ],
    { cwd: app, env: cliEnvironment(), stdio: ['pipe', 'pipe', 'pipe'] },
  )
  const exited = new Promise((done) => {
    child.on('close', (code, signal) => done({ code, signal }))
    child.on('error', (error) => done({ code: null, signal: null, error }))
  })
  child.stdin.on('error', () => {})
  child.stdin.end(OPENING)
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
  /** How much of the journal has been read: every line up to the last one read whole. */
  let read = 0
  /** The tool results the CLI has reported, and the calls whose journal lines are read. */
  let answeredCalls = 0
  let readCalls = 0
  /** Whether the server had listed its tools, and what the CLI said of it at the start. */
  let listed = false
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

  /**
   * The verdicts the server wrote since the last read, in the order it
   * answered. Only a line that ends in a newline is read. The server may still
   * be appending one while the CLI reports another call's result, and that
   * line is read whole at a later read.
   *
   * A call's line is read once the CLI has reported that call's result, and
   * not before. The server writes the line when it answers, and the CLI may
   * be a turn ahead of the line of its output the runner is reading. A
   * verdict read that early would count against the turn before it, and the
   * iteration cap would end the run without the turn that made the call.
   */
  const readJournal = () => {
    const text = readFileSync(journal, 'utf8')
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
        listed = cli.names.every((name) => entry.listed.includes(name))
        read = next
        continue
      }
      if (readCalls >= answeredCalls) return
      readCalls += 1
      read = next
      if (entry.failed !== undefined) {
        console.error(`eval: ${brief} #${run}: \`${entry.tool}\` failed: ${entry.failed}`)
      }
      if (entry.fault !== undefined) {
        // The harness failed, so the run measures nothing more about the model.
        harnessFault = entry.fault
        tally.lastSubmitted = entry.submitted ?? tally.lastSubmitted
        halt({ ended: 'harness' })
        return
      }
      if (entry.verdict !== undefined) countVerdict(tally, entry.verdict, entry.submitted)
    }
  }

  const streamed = (event) => {
    switch (event.type) {
      case 'message_start':
        if (turns === 0 && !listed) {
          readJournal()
          if (!listed) {
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
        if (last.stopReason === 'tool_use') {
          for (const call of calls.get(last.id) ?? []) {
            countCall(tally, call.name)
            pending.add(call.id)
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
          if (connection !== 'connected' && connection !== 'pending') {
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
          } else calls.set(message.id, [...(calls.get(message.id) ?? []), { id: block.id, name }])
        }
        break
      }
      case 'user': {
        const content = Array.isArray(event.message?.content) ? event.message.content : []
        const answered = content.filter((block) => block.type === 'tool_result')
        if (answered.length === 0) break
        for (const block of answered) pending.delete(block.tool_use_id)
        answeredCalls += answered.length
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
    if (CUT_OFF.has(ended)) answer = (texts.get(last.id) ?? []).join('\n')
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
    toolbox,
    requirements,
    tally,
    meter,
    started,
    turns,
    ended,
    answer,
    harnessFault,
  })
  return { ...measured, cost: stop === null ? (result?.total_cost_usd ?? null) : null }
}

/* -------------------------------------------------------------------------- */
/* Results                                                                    */
/* -------------------------------------------------------------------------- */

const sum = (values) => values.reduce((total, value) => total + value, 0)
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
  const average = (field) =>
    measured.length === 0 ? null : Math.round(mean(measured.map((record) => record[field])))
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
    retries: sum(records.map((record) => record.retries)),
    backoffMs: sum(records.map((record) => record.backoffMs)),
    discardedTokens: sum(records.map((record) => record.discardedTokens)),
  }
}

/** What a finished run spent, as the ceilings count it. */
const recordTokens = (record) => record.inputTokens + record.outputTokens + record.discardedTokens

function commit() {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim()
  } catch {
    return null
  }
}

/** `<date>-<model>-<mode>`, `-cli` after it for the CLI runner, and a counter when that name is taken. */
function freeStem(out, at, model, mode, runner) {
  const base =
    `${at.slice(0, 10)}-${model.replace(/[^A-Za-z0-9.-]/g, '-')}-${mode}` +
    (runner === 'cli' ? '-cli' : '')
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

const apiKey = process.env.ANTHROPIC_API_KEY
if (settings.runner === 'api' && !settings.fake && !apiKey) {
  refuse(
    'ANTHROPIC_API_KEY is not set. The eval calls the Messages API and needs a key; ' +
      '`--runner cli` runs Claude Code as you are signed in to it, and `--fake` runs the ' +
      'scripted model instead.',
  )
}

/** The CLI the `cli` runner starts for each run: the owner's, or the scripted stand-in for it. */
const launcher =
  settings.runner !== 'cli'
    ? null
    : settings.fake
      ? { command: process.execPath, prefix: [FAKE_CLI] }
      : { command: settings.claude, prefix: [] }
const cliVersion = launcher === null ? null : versionOf(launcher)

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

const out =
  settings.out ?? (settings.fake ? mkdtempSync(resolve(tmpdir(), 'polymorph-eval-')) : RESULTS)
const at = new Date().toISOString()
const toolbox = await loadToolbox()
const tools = toolbox.tools(settings.mode)

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
 * What every CLI run's MCP server reads, written once: the tool definitions,
 * and the registry the eval judges with, as JSON. Each run adds a directory
 * of its own beside them, and the whole is removed when the eval ends.
 */
let cli = null
if (launcher !== null) {
  const scratch = mkdtempSync(resolve(tmpdir(), 'polymorph-eval-cli-'))
  cli = {
    ...launcher,
    scratch,
    tools: resolve(scratch, 'tools.json'),
    registry: resolve(scratch, 'registry.json'),
    names: tools.map((tool) => tool.name),
    scriptFor: (brief, run) => scriptFor(resolve(BRIEFS, `${brief}.md`), run),
  }
  writeFileSync(cli.tools, JSON.stringify(mcpTools(tools)))
  writeFileSync(cli.registry, JSON.stringify(toolbox.registry))
}
const removeScratch = () => {
  if (cli !== null) rmSync(cli.scratch, { recursive: true, force: true })
}

mkdirSync(out, { recursive: true })
const stem = freeStem(out, at, settings.model, settings.mode, settings.runner)
const resultsFile = resolve(out, `${stem}.json`)
const readme = out === RESULTS ? resolve(EVAL, 'README.md') : resolve(out, 'README.md')
const polymorph = { version: toolbox.registry.version, commit: commit() }

const records = []
const outputs = []

/**
 * Writes the results and the outputs as they stand, and re-renders the page.
 * Called after every run with `partial` set, and once more at the end
 * without it, so an eval that stops keeps every run it finished.
 */
async function save({ partial, stopped }) {
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
    settings: {
      briefs: settings.briefs,
      runs: settings.runs,
      maxIterations: settings.maxIterations,
      maxTurns: MAX_TURNS,
      maxTokens: MAX_TOKENS,
      effort: settings.effort,
      maxTokensPerRun: settings.maxTokensPerRun,
      maxTokensTotal: settings.maxTokensTotal,
    },
    outputs: `${stem}.outputs.json`,
    requirements: briefs.map((brief) => ({
      brief: name(brief),
      digest: required.get(name(brief)).digest,
      requirements: required.get(name(brief)).requirements.map(({ id, says }) => ({ id, says })),
    })),
    summary: {
      overall: summarise(records, toolbox.endings),
      briefs: briefs.map((brief) => ({
        brief: name(brief),
        ...summarise(
          records.filter((record) => record.brief === name(brief)),
          toolbox.endings,
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

for (const brief of briefs) {
  const text = readFileSync(brief, 'utf8')
  const system = systemPrompt(settings.mode, text, toolbox)
  for (let run = 1; run <= settings.runs; run += 1) {
    const meter = newMeter()
    const limits = {
      perRun: settings.maxTokensPerRun,
      total: settings.maxTokensTotal,
      before: sum(records.map(recordTokens)),
    }
    let measured
    try {
      if (cli !== null) {
        measured = await runOnceCli({
          brief: name(brief),
          run,
          mode: settings.mode,
          system,
          settings,
          toolbox,
          requirements: required.get(name(brief)).requirements,
          cli,
          meter,
          limits,
        })
      } else {
        const model = settings.fake
          ? fakeModel(scriptFor(brief, run))
          : apiModel({
              apiKey,
              model: settings.model,
              system,
              tools,
              effort: settings.effort,
              meter,
            })
        measured = await runOnce({
          brief: name(brief),
          run,
          mode: settings.mode,
          model,
          toolbox,
          requirements: required.get(name(brief)).requirements,
          maxIterations: settings.maxIterations,
          meter,
          limits,
        })
      }
    } catch (error) {
      // The API or the CLI failing, or a ceiling, stops the eval. The runs that
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
    console.error(
      `eval: ${record.brief} #${run} — ${record.lawful ? 'lawful' : 'not lawful'} ` +
        `(${record.ended}${CUT_OFF.has(record.ended) ? ', never counted lawful' : ''}), ` +
        `first shot ${record.firstShotLawful ? 'lawful' : 'not lawful'}, ` +
        (record.meetsBrief
          ? 'meets its brief, '
          : record.failedRequirements.length > 0
            ? `does not meet its brief (${record.failedRequirements.join(', ')}), `
            : 'never counted as meeting its brief, ') +
        (record.iterations === null
          ? `no validate call lawful (${record.toolCalls.validate} made), `
          : `lawful at validate call ${record.iterations}, `) +
        `${record.inputTokens} in / ${record.outputTokens} out, ${(record.wallMs / 1000).toFixed(1)}s` +
        (record.retries > 0 ? `, ${record.retries} retried` : '') +
        (typeof cost === 'number' ? `, $${cost.toFixed(2)} by the CLI's count` : '') +
        (record.harnessFault === null ? '' : `\neval: harness fault: ${record.harnessFault}`),
    )
    await save({ partial: true, stopped: null })
  }
}

removeScratch()
const results = await save({ partial: false, stopped: null })

const { overall } = results.summary
const percent = (rate) => (rate === null ? '—' : `${Math.round(rate * 100)}%`)
console.error(
  `eval: ${shown(resultsFile)} — lawful ${percent(overall.lawfulRate)}, ` +
    `first shot ${percent(overall.firstShotRate)}, ` +
    `meets its brief ${percent(overall.meetsBriefRate)}, ` +
    `both ${percent(overall.lawfulAndMeetsBriefRate)}, ` +
    `over ${overall.measured} run${overall.measured === 1 ? '' : 's'}; ${shown(readme)} rendered`,
)
