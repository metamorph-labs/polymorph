import { execFile } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { createServer, type IncomingHttpHeaders, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { promisify } from 'node:util'

import { buildRegistry } from '@polymorph/registry'
import { jsonSchema, validate } from '@polymorph/registry/shape'
import { emitScreen } from '@polymorph/spec'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { readResults, renderReport } from './report.mjs'
import { elementsOf, loadRequirements, resolveRequirements, unmet } from './requirements.mjs'
import { KINDS_SHAPE, REQUIREMENTS_SHAPE } from './requirements-shape'
import { RESULTS_SHAPE, TOOL_NAMES } from './results-shape'
import { apart, interval, resolution, smallestGap } from './spread.mjs'

/**
 * The agent eval's harness, tested without a model (`docs/verification.md`,
 * "The agent eval").
 *
 * The eval itself needs a key or a signed-in Claude Code, and costs money, so
 * it runs by hand before a release. What runs here is everything around the
 * model: the briefs, the tools (which are the repository's own validator,
 * emitter and red rules, run for real), the measurements, the results file
 * and its schema, and the report. The scripted model in `eval/fake/` plays
 * the turns. Two evals go over HTTP to a local server that speaks the
 * Messages API's streaming protocol, so the path a real model takes is
 * exercised too, failures included. The CLI runner plays the same scripts
 * through a stand-in for `claude -p` and the eval's real MCP server, and one
 * eval starts that stand-in as it would start the owner's CLI.
 *
 * The briefs' requirements, the two readers that check a document against
 * them and the intervals beside every rate are tested here as well, against
 * the scripted model's own answers.
 */

const ROOT = resolve(import.meta.dirname, '..')
const SCRATCH = mkdtempSync(resolve(tmpdir(), 'polymorph-eval-test-'))
const RESULTS = resolve(ROOT, 'eval/results')
const FAKE_CLI = resolve(ROOT, 'eval/fake/cli.mjs')

const execute = promisify(execFile)

interface RunRecord {
  brief: string
  run: number
  firstShotLawful: boolean
  iterations: number | null
  lawful: boolean
  meetsBrief?: boolean
  failedRequirements?: string[]
  ended: string
  harnessFault: string | null
  inputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  outputTokens: number
  discardedTokens: number
  wallMs: number
  retries: number
  backoffMs: number
  turns: number
  toolCalls: Record<string, number>
  violationsSeen: Record<string, number>
  misses?: {
    call: number
    fatal: string | null
    faults: string[]
    violations: string[]
    contract: string[]
  }[]
}

interface Bounds {
  low: number
  high: number
}

interface Summary {
  runs: number
  measured?: number
  endings: Record<string, number>
  firstShotRate: number | null
  firstShotInterval?: Bounds | null
  lawfulRate: number | null
  lawfulInterval?: Bounds | null
  meetsBriefRate?: number | null
  meetsBriefInterval?: Bounds | null
  lawfulAndMeetsBriefRate?: number | null
  lawfulAndMeetsBriefInterval?: Bounds | null
  failedRequirements?: Record<string, number>
  meanIterations: number | null
  lawfulWithoutValidate: number
  meanInputTokens: number | null
  meanOutputTokens: number | null
  retries: number
  backoffMs: number
  discardedTokens: number
}

interface Results {
  at: string
  model: string
  mode: string
  runner: string
  cliVersion: string | null
  fake: boolean
  partial: boolean
  stopped: { reason: string; brief: string; run: number; message: string; tokens: number } | null
  briefs: string[]
  settings: Record<string, unknown>
  outputs: string
  requirements?: { brief: string; digest: string; requirements: { id: string; says: string }[] }[]
  summary: { overall: Summary; briefs: (Summary & { brief: string })[] }
  records: RunRecord[]
}

interface Evaluation {
  directory: string
  code: number
  stderr: string
  text: string
  results: Results
  outputs: { outputs: { brief: string; run: number; document: unknown }[] }
  readme: string
}

/** `eval/run.mjs` into `directory`: its exit code and what it wrote to stderr. */
const runEval = (directory: string, args: string[], env: NodeJS.ProcessEnv) =>
  execute('node', ['eval/run.mjs', ...args, '--out', directory], {
    cwd: ROOT,
    env: { ...process.env, ...env },
  }).then(
    ({ stderr }) => ({ code: 0, stderr }),
    (error: { code: number; stderr: string }) => ({ code: error.code, stderr: error.stderr }),
  )

/** The results file an eval wrote into `directory`, if it wrote one. */
const resultsFileIn = (directory: string) =>
  existsSync(directory)
    ? readdirSync(directory).find(
        (entry) => entry.endsWith('.json') && !entry.endsWith('.outputs.json'),
      )
    : undefined

/** One `eval/run.mjs` run into its own scratch directory. An eval that stops early is kept too. */
async function evaluate(name: string, args: string[], env: NodeJS.ProcessEnv = {}) {
  const directory = resolve(SCRATCH, name)
  const { code, stderr } = await runEval(directory, args, env)
  const file = resultsFileIn(directory)
  const text = readFileSync(resolve(directory, file ?? 'missing.json'), 'utf8')
  const results = JSON.parse(text) as Results
  return {
    directory,
    code,
    stderr,
    text,
    results,
    outputs: JSON.parse(readFileSync(resolve(directory, results.outputs), 'utf8')),
    readme: readFileSync(resolve(directory, 'README.md'), 'utf8'),
  } as Evaluation
}

/** An eval that may stop before it writes a results file, and the results when it wrote them. */
async function attempt(name: string, args: string[], env: NodeJS.ProcessEnv = {}) {
  const directory = resolve(SCRATCH, name)
  const outcome = await runEval(directory, args, env)
  const file = resultsFileIn(directory)
  const results =
    file === undefined
      ? null
      : (JSON.parse(readFileSync(resolve(directory, file), 'utf8')) as Results)
  return { ...outcome, results }
}

const record = (evaluation: Evaluation, brief: string, run = 1) =>
  evaluation.results.records.find(
    (entry) => entry.brief === brief && entry.run === run,
  ) as RunRecord

const fixture = (path: string) => readFileSync(resolve(ROOT, 'eval/fake', path), 'utf8')

const ALL_BRIEFS = readdirSync(resolve(ROOT, 'eval/briefs'))
  .filter((name) => name.endsWith('.md'))
  .map((name) => name.slice(0, -'.md'.length))
  .sort()

// The registry is built while the file is collected, as the other laws build it. The build
// reads the whole vocabulary, which under the full suite's load takes longer than a test's
// time limit.
const REGISTRY = buildRegistry(ROOT)

/* -------------------------------------------------------------------------- */
/* The requirements, loaded as the harness loads them                         */
/* -------------------------------------------------------------------------- */

interface Pattern {
  component: string[]
  props?: Record<string, unknown>
  anyProp?: Record<string, unknown>
  has?: Pattern
}

interface Check {
  element?: Pattern
  count?: Pattern | Pattern[]
  min?: number
  any?: Check[]
  all?: Check[]
}

interface Requirement {
  id: string
  says: string
  check: Check
}

const SHAPES = {
  requirements: (document: unknown) => validate(REQUIREMENTS_SHAPE, document),
  kinds: (document: unknown) => validate(KINDS_SHAPE, document),
}

const REQUIRED = loadRequirements({ registry: REGISTRY, shapes: SHAPES }) as Map<
  string,
  { requirements: Requirement[]; digest: string }
>

const requirementsOf = (brief: string) => REQUIRED.get(brief)?.requirements ?? []

/** The document a brief's scripted model hands back: the file its last turn quotes. */
function scriptedAnswer(brief: string) {
  const script = JSON.parse(fixture(`${brief}.spec.json`)) as {
    turns: { content: { text?: unknown }[] }[]
  }
  const quoted = (script.turns.at(-1)?.content ?? [])
    .flatMap((block) => (Array.isArray(block.text) ? (block.text as unknown[]) : []))
    .find((part) => typeof part === 'object') as { $file: string }
  return fixture(quoted.$file)
}

/** Requirements written as a requirements file writes them, resolved as the harness resolves them. */
function resolved(checks: Record<string, object>) {
  const document = {
    requirements: Object.entries(checks).map(([id, check]) => ({ id, says: '', check })),
  }
  expect(validate(REQUIREMENTS_SHAPE, document)).toEqual([])
  expect(resolveRequirements(document, {}, REGISTRY)).toEqual([])
  return document.requirements
}

/* -------------------------------------------------------------------------- */
/* A local Messages API                                                       */
/* -------------------------------------------------------------------------- */

interface Captured {
  url: string | undefined
  headers: IncomingHttpHeaders
  body: {
    model: string
    stream: boolean
    system: string
    output_config?: { effort: string }
    tools: { name: string }[]
    messages: { role: string; content: unknown }[]
  }
}

/** One content block's events, given the block's index in the message. */
type Block = (index: number) => object[]

/** Events framed the way the API frames them. */
const frame = (events: object[]) =>
  events
    .map(
      (event) => `event: ${(event as { type: string }).type}\ndata: ${JSON.stringify(event)}\n\n`,
    )
    .join('')

const start = (input: number) => ({
  type: 'message_start',
  message: {
    id: 'msg_local',
    type: 'message',
    role: 'assistant',
    content: [],
    usage: {
      input_tokens: input,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
      output_tokens: 1,
    },
  },
})

/** The server-sent events of one response. */
function stream(blocks: Block[], stopReason: string, usage: { input: number; output: number }) {
  const events: object[] = [start(usage.input)]
  blocks.forEach((block, index) => events.push(...block(index)))
  events.push(
    { type: 'ping' },
    {
      type: 'message_delta',
      delta: { stop_reason: stopReason },
      usage: { output_tokens: usage.output },
    },
    { type: 'message_stop' },
  )
  return frame(events)
}

/** A response that breaks off with an error event after it has started, as an overload or a rate limit can. */
const brokenOff = (kind: string, input: number) =>
  frame([
    start(input),
    { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Reading' } },
    { type: 'error', error: { type: kind, message: 'slow down' } },
  ])

const thinking =
  (signature: string): Block =>
  (index) => [
    {
      type: 'content_block_start',
      index,
      content_block: { type: 'thinking', thinking: '', signature: '' },
    },
    { type: 'content_block_delta', index, delta: { type: 'signature_delta', signature } },
    { type: 'content_block_stop', index },
  ]

/** A tool call whose input arrives in pieces, as a streamed input does, whether or not it is JSON. */
const rawToolUse =
  (id: string, name: string, json: string): Block =>
  (index) => {
    const third = Math.ceil(json.length / 3)
    return [
      {
        type: 'content_block_start',
        index,
        content_block: { type: 'tool_use', id, name, input: {} },
      },
      ...[0, 1, 2].map((part) => ({
        type: 'content_block_delta',
        index,
        delta: {
          type: 'input_json_delta',
          partial_json: json.slice(part * third, (part + 1) * third),
        },
      })),
      { type: 'content_block_stop', index },
    ]
  }

const toolUse = (id: string, name: string, input: object): Block =>
  rawToolUse(id, name, JSON.stringify(input))

const text =
  (body: string): Block =>
  (index) => [
    { type: 'content_block_start', index, content_block: { type: 'text', text: '' } },
    ...[body.slice(0, 20), body.slice(20)].map((piece) => ({
      type: 'content_block_delta',
      index,
      delta: { type: 'text_delta', text: piece },
    })),
    { type: 'content_block_stop', index },
  ]

/** A refusal as an HTTP status, or a streamed body. */
type Reply = string | { status: number; error: string; retryAfter: string }

/** Answers each request with the next reply, and keeps every request it was sent. */
function localApi(replies: Reply[], captured: Captured[]): Server {
  return createServer((request, response) => {
    let raw = ''
    request.on('data', (chunk: Buffer) => (raw += chunk.toString()))
    request.on('end', () => {
      captured.push({
        url: request.url,
        headers: request.headers,
        body: JSON.parse(raw) as Captured['body'],
      })
      // The Messages API refuses an assistant turn whose call has an input that is not an object.
      const body = captured.at(-1)?.body
      const refused = (body?.messages ?? []).findIndex(
        (message) =>
          Array.isArray(message.content) &&
          (message.content as { type: string; input?: unknown }[]).some(
            (block) =>
              block.type === 'tool_use' &&
              (typeof block.input !== 'object' || block.input === null),
          ),
      )
      if (refused !== -1) {
        response.writeHead(400, { 'content-type': 'application/json' })
        response.end(
          JSON.stringify({
            type: 'error',
            error: {
              type: 'invalid_request_error',
              message: `messages.${refused}: tool_use.input: Input should be an object`,
            },
          }),
        )
        return
      }
      const reply = replies[captured.length - 1] ?? ''
      if (typeof reply !== 'string') {
        response.writeHead(reply.status, {
          'content-type': 'application/json',
          'retry-after': reply.retryAfter,
        })
        response.end(
          JSON.stringify({ type: 'error', error: { type: reply.error, message: 'busy' } }),
        )
        return
      }
      response.writeHead(200, { 'content-type': 'text/event-stream' })
      // In uneven slices, so an event regularly straddles two chunks.
      for (let at = 0; at < reply.length; at += 97) response.write(reply.slice(at, at + 97))
      response.end()
    })
  })
}

const LAWFUL = fixture('settings-workspace/answer.json')
const ANSWER = `Lawful.\n\n\`\`\`json\n${LAWFUL}\`\`\`\n`
const UNPARSEABLE = '{"name": "Settings'
/** An answer the token limit cut off before the document's fence closed. */
const CUT_SHORT = ANSWER.slice(0, ANSWER.length / 2)

/**
 * Four turns: read the card; look a member up with an input that is not JSON
 * and read the card again; validate a lawful document; answer with it. The
 * first request is refused as overloaded and the third breaks off with a rate
 * limit mid-stream, so both retries are exercised.
 */
const API_REPLIES: Reply[] = [
  { status: 529, error: 'overloaded_error', retryAfter: '0.01' },
  stream(
    [thinking('sig-card'), toolUse('toolu_card', 'get_system_card', { platform: 'web' })],
    'tool_use',
    { input: 2000, output: 40 },
  ),
  brokenOff('rate_limit_error', 3000),
  stream(
    [
      rawToolUse('toolu_bad', 'get_component', UNPARSEABLE),
      toolUse('toolu_card_again', 'get_system_card', { platform: 'web' }),
    ],
    'tool_use',
    { input: 5000, output: 60 },
  ),
  stream([toolUse('toolu_check', 'validate', { spec: LAWFUL })], 'tool_use', {
    input: 9000,
    output: 2500,
  }),
  stream([text(ANSWER)], 'end_turn', { input: 12000, output: 2400 }),
]

/**
 * A spec nested two thousand levels deep, which the spec validator cannot
 * finish: it overflows the stack. A document the system cannot check is the
 * system's failure, not the model's.
 */
const UNCHECKABLE = JSON.stringify({ ...JSON.parse(LAWFUL), root: '<root>' }).replace(
  '"<root>"',
  `${'{"component":"Stack","children":['.repeat(2000)}{"component":"Stack","children":[]}${']}'.repeat(2000)}`,
)

/**
 * Four runs of one brief, each ending a way that must not count for the
 * model: the harness failing on `validate`; a refusal after a lawful call; a
 * lawful answer with no `validate` call at all; a response cut off at
 * `max_tokens` halfway through its document.
 */
const FAULT_REPLIES: Reply[] = [
  stream([toolUse('toolu_deep', 'validate', { spec: UNCHECKABLE })], 'tool_use', {
    input: 1000,
    output: 100,
  }),
  stream([toolUse('toolu_check', 'validate', { spec: LAWFUL })], 'tool_use', {
    input: 1000,
    output: 100,
  }),
  stream([text(ANSWER)], 'refusal', { input: 1000, output: 100 }),
  stream([text(ANSWER)], 'end_turn', { input: 1000, output: 100 }),
  stream([text(CUT_SHORT)], 'max_tokens', { input: 1000, output: 100 }),
]

/**
 * One run whose first `validate` call has an input that is not JSON, as a
 * document written as the call's input is when the model slips in it. The
 * second call is lawful.
 */
const UNPARSED_REPLIES: Reply[] = [
  stream(
    [rawToolUse('toolu_slip', 'validate', '{"spec": {"spec": "polymorph-screen/1",')],
    'tool_use',
    {
      input: 1000,
      output: 100,
    },
  ),
  stream([toolUse('toolu_check', 'validate', { spec: LAWFUL })], 'tool_use', {
    input: 1000,
    output: 100,
  }),
  stream([text(ANSWER)], 'end_turn', { input: 1000, output: 100 }),
]

/* -------------------------------------------------------------------------- */
/* A stand-in for the Claude Code CLI                                         */
/* -------------------------------------------------------------------------- */

const STAND_IN = resolve(SCRATCH, 'stand-in')

/**
 * What `--claude` starts in place of the owner's CLI: a shell script that
 * keeps the arguments it was given, the names of the variables in its
 * environment and its process id, then hands over to `eval/fake/cli.mjs`
 * with the next of `scripts`. The stand-in plays them through the eval's real
 * MCP server. Each stand-in keeps its records in its own `directory`.
 */
function standIn(scripts: object[], directory = STAND_IN) {
  mkdirSync(directory, { recursive: true })
  scripts.forEach((script, index) =>
    writeFileSync(resolve(directory, `run-${index + 1}.json`), JSON.stringify(script)),
  )
  const node = process.execPath
  const file = resolve(directory, 'claude')
  const lines = [
    '#!/bin/sh',
    `if [ "$1" = "--version" ]; then exec '${node}' '${FAKE_CLI}' --version; fi`,
    `count=$(cat '${directory}/count' 2>/dev/null || echo 0)`,
    'count=$((count + 1))',
    `echo "$count" > '${directory}/count'`,
    `printf '%s\\0' "$@" > '${directory}/args-'"$count"`,
    `env | cut -d= -f1 > '${directory}/env-'"$count"`,
    `printenv CLAUDE_CODE_MAX_OUTPUT_TOKENS > '${directory}/max-'"$count"`,
    // `exec` keeps the process, so this is the id of the stand-in itself.
    `echo $$ > '${directory}/pid-'"$count"`,
    `exec '${node}' '${FAKE_CLI}' --script '${directory}/run-'"$count"'.json' "$@"`,
  ]
  writeFileSync(file, `${lines.join('\n')}\n`, { mode: 0o755 })
  return file
}

const standInRecord = (name: string, run = 1, directory = STAND_IN) =>
  readFileSync(resolve(directory, `${name}-${run}`), 'utf8')

/** Whether a process is still running. */
const running = (pid: number) => {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

const scriptedText = (stop: string) => ({
  content: [{ type: 'text', text: ANSWER }],
  stop_reason: stop,
  usage: { input_tokens: 1000, output_tokens: 100 },
})

const scriptedCheck = (spec: string) => ({
  content: [{ type: 'tool_use', name: 'validate', input: { spec } }],
  usage: { input_tokens: 1000, output_tokens: 100 },
})

/**
 * Five runs of one brief through the stand-in: the four endings that must not
 * count for the model, as `FAULT_REPLIES` plays them to the API runner, and a
 * fifth that the CLI ends with a usage limit.
 */
const STAND_IN_RUNS = [
  { turns: [scriptedCheck(UNCHECKABLE), scriptedText('end_turn')] },
  { turns: [scriptedCheck(LAWFUL), scriptedText('refusal')] },
  { turns: [scriptedText('end_turn')] },
  { turns: [scriptedText('max_tokens')] },
  { turns: [{ cli: { error: 'rate_limit', result: 'You’ve hit your limit · resets 5pm' } }] },
]

/**
 * A run in which the CLI reports a call's result while the server is still
 * writing another line, which it never finishes. The line before it is whole.
 */
const HALF_LINE = resolve(SCRATCH, 'stand-in-half-line')
const HALF_LINE_RUNS = [
  {
    turns: [
      { ...scriptedCheck(LAWFUL), journal: '{"tool":"validate","verdict":{"ok":false' },
      scriptedText('end_turn'),
    ],
  },
]

/**
 * A run whose journal gets a line that is not JSON, so reading the stream
 * throws, after which the model would take a minute to answer.
 */
const UNREADABLE = resolve(SCRATCH, 'stand-in-unreadable')
const UNREADABLE_RUNS = [
  {
    turns: [
      { ...scriptedCheck(LAWFUL), journal: 'not a journal entry\n' },
      { ...scriptedText('end_turn'), delay: 60_000 },
    ],
  },
]

/**
 * A run in which the CLI is a turn ahead of the line of its output the runner
 * is reading: the server has answered `validate`, and written its verdict,
 * before the CLI reports the results of the turn before it. One `validate`
 * call is allowed, so the verdict ends the run.
 */
const AHEAD = resolve(SCRATCH, 'stand-in-ahead')
const UNLAWFUL = JSON.stringify({ ...JSON.parse(LAWFUL), root: { component: 'Modal' } })
const AHEAD_RUNS = [
  {
    turns: [
      {
        content: [{ type: 'tool_use', name: 'get_system_card', input: {} }],
        usage: { input_tokens: 1000, output_tokens: 100 },
        ahead: true,
      },
      scriptedCheck(UNLAWFUL),
      scriptedText('end_turn'),
    ],
  },
]

/**
 * The same run with a first call the CLI denies, so the server writes no line
 * for it. The denied call's result is reported while `validate`'s line is in
 * the journal and `validate`'s own result is not.
 */
const AHEAD_DENIED = resolve(SCRATCH, 'stand-in-ahead-denied')
const AHEAD_DENIED_RUNS = [
  {
    turns: [
      {
        content: [{ type: 'tool_use', name: 'write_file', input: {} }],
        usage: { input_tokens: 1000, output_tokens: 100 },
        ahead: true,
      },
      scriptedCheck(UNLAWFUL),
      scriptedText('end_turn'),
    ],
  },
]

/* -------------------------------------------------------------------------- */
/* The runs                                                                   */
/* -------------------------------------------------------------------------- */

const captured: Captured[] = []
const server = localApi(API_REPLIES, captured)
const faultsCaptured: Captured[] = []
const faultsServer = localApi(FAULT_REPLIES, faultsCaptured)
const unparsedCaptured: Captured[] = []
const unparsedServer = localApi(UNPARSED_REPLIES, unparsedCaptured)
const runs: Record<string, Evaluation> = {}
const attempts: Record<string, Awaited<ReturnType<typeof attempt>>> = {}
let resultsBefore: string[] = []

const listing = () => (existsSync(RESULTS) ? readdirSync(RESULTS).sort() : [])

const listen = async (target: Server) => {
  await new Promise<void>((done) => target.listen(0, '127.0.0.1', done))
  return `http://127.0.0.1:${(target.address() as AddressInfo).port}`
}

beforeAll(async () => {
  resultsBefore = listing()
  const [base, faultsBase, unparsedBase] = await Promise.all([
    listen(server),
    listen(faultsServer),
    listen(unparsedServer),
  ])
  const local = { ANTHROPIC_API_KEY: 'local-key' }

  /** One run of the settings brief through a stand-in. */
  const throughStandIn = (
    name: string,
    scripts: object[],
    directory: string,
    more: string[] = [],
  ) =>
    attempt(name, [
      ...['--runner', 'cli', '--claude', standIn(scripts, directory), '--model', 'local-model'],
      ...['--runs', '1', '--briefs', 'eval/briefs/settings-workspace.md'],
      ...more,
    ])
  const attempted = Promise.all([
    throughStandIn('cli-half-line', HALF_LINE_RUNS, HALF_LINE),
    throughStandIn('cli-unreadable', UNREADABLE_RUNS, UNREADABLE),
    throughStandIn('cli-ahead', AHEAD_RUNS, AHEAD, ['--max-iterations', '1']),
    throughStandIn('cli-ahead-denied', AHEAD_DENIED_RUNS, AHEAD_DENIED, ['--max-iterations', '1']),
  ])

  const [
    two,
    cap,
    tsx,
    api,
    faults,
    unparsed,
    runCeiling,
    totalCeiling,
    cliTwo,
    cliCap,
    cliStandIn,
    every,
    cliRuns,
  ] = await Promise.all([
    evaluate('two', ['--fake', '--briefs', 'eval/briefs/{list-incidents,settings-workspace}.md']),
    evaluate('cap', [
      '--fake',
      '--max-iterations',
      '1',
      '--briefs',
      'eval/briefs/list-incidents.md',
    ]),
    evaluate('tsx', ['--fake', '--mode', 'tsx', '--briefs', 'eval/briefs/list-incidents.md']),
    evaluate(
      'api',
      [
        '--model',
        'local-model',
        '--effort',
        'high',
        '--briefs',
        'eval/briefs/settings-workspace.md',
      ],
      // The trailing slash is dropped, as the SDKs drop it.
      { ...local, ANTHROPIC_BASE_URL: `${base}/` },
    ),
    evaluate(
      'faults',
      ['--model', 'local-model', '--runs', '4', '--briefs', 'eval/briefs/settings-workspace.md'],
      { ...local, ANTHROPIC_BASE_URL: faultsBase },
    ),
    evaluate(
      'unparsed',
      ['--model', 'local-model', '--briefs', 'eval/briefs/settings-workspace.md'],
      {
        ...local,
        ANTHROPIC_BASE_URL: unparsedBase,
      },
    ),
    evaluate('run-ceiling', [
      '--fake',
      '--max-tokens-per-run',
      '20000',
      '--briefs',
      'eval/briefs/list-incidents.md',
    ]),
    evaluate('total-ceiling', [
      '--fake',
      '--max-tokens-total',
      '70000',
      '--briefs',
      'eval/briefs/{list-incidents,settings-workspace}.md',
    ]),
    evaluate('cli-two', [
      '--fake',
      '--runner',
      'cli',
      '--briefs',
      'eval/briefs/{list-incidents,settings-workspace}.md',
    ]),
    evaluate('cli-cap', [
      '--fake',
      '--runner',
      'cli',
      '--max-iterations',
      '1',
      '--briefs',
      'eval/briefs/list-incidents.md',
    ]),
    evaluate(
      'cli-stand-in',
      [
        '--runner',
        'cli',
        '--claude',
        standIn(STAND_IN_RUNS),
        '--model',
        'local-model',
        '--effort',
        'high',
        '--runs',
        '5',
        '--briefs',
        'eval/briefs/settings-workspace.md',
      ],
      // No key, and the variables a Claude Code session sets for what it starts.
      {
        ANTHROPIC_API_KEY: '',
        CLAUDECODE: '1',
        CLAUDE_EFFORT: 'xhigh',
        CLAUDE_AGENT_SDK_MCP_NO_PREFIX: '1',
        CLAUDE_CODE_OAUTH_TOKEN: 'local-token',
      },
    ),
    // Every brief, three runs each. The second run of one brief plays a script of its own.
    evaluate('every', ['--fake', '--runs', '3']),
    evaluate('cli-runs', [
      '--fake',
      '--runner',
      'cli',
      '--runs',
      '2',
      '--briefs',
      'eval/briefs/dashboard-usage.md',
    ]),
  ])
  const [halfLine, unreadable, ahead, aheadDenied] = await attempted
  Object.assign(attempts, { halfLine, unreadable, ahead, aheadDenied })
  Object.assign(runs, {
    two,
    cap,
    tsx,
    api,
    faults,
    unparsed,
    runCeiling,
    totalCeiling,
    cliTwo,
    cliCap,
    cliStandIn,
    every,
    cliRuns,
  })
}, 120_000)

afterAll(() => {
  server.close()
  faultsServer.close()
  unparsedServer.close()
  // A stand-in the runner failed to stop would otherwise outlive the suite.
  for (const directory of [HALF_LINE, UNREADABLE]) {
    const file = resolve(directory, 'pid-1')
    const pid = existsSync(file) ? Number(readFileSync(file, 'utf8')) : 0
    if (pid > 0 && running(pid)) process.kill(pid, 'SIGKILL')
  }
  rmSync(SCRATCH, { recursive: true, force: true })
})

/* -------------------------------------------------------------------------- */
/* The briefs                                                                 */
/* -------------------------------------------------------------------------- */

describe('the briefs', () => {
  const directory = resolve(ROOT, 'eval/briefs')
  const briefs = readdirSync(directory)
    .filter((name) => name.endsWith('.md'))
    .map((name) => ({ name, text: readFileSync(resolve(directory, name), 'utf8') }))
  const members = REGISTRY.components.map((entry) => entry.name)

  it('are at least eight, each in the shape of the agent-loop brief', () => {
    expect(briefs.length).toBeGreaterThanOrEqual(8)
    for (const { name, text } of briefs) {
      expect(text, name).toMatch(/^# Screen brief — /)
      expect(text, name).toContain('**Audience.**')
      expect(text, name).toContain('**What it has to do.**')
      expect(text, name).toContain('**What it must not do.**')
    }
  })

  it('describe the job without naming a member', () => {
    // The agent-loop test's check: a brief that named `ListPage` would measure
    // transcription, not whether an agent can find its way to the member.
    for (const { name, text } of briefs) {
      for (const component of members) {
        expect(text, `${name} names ${component}`).not.toContain(component)
      }
    }
  })

  it('are recorded in every results file as the full set, whichever were chosen', () => {
    for (const evaluation of Object.values(runs)) {
      expect(evaluation.results.briefs).toEqual(ALL_BRIEFS)
    }
  })
})

/* -------------------------------------------------------------------------- */
/* The measurements                                                           */
/* -------------------------------------------------------------------------- */

describe('a scripted run over two briefs', () => {
  it('measures a first shot that fails and is corrected on the second call', () => {
    expect(record(runs.two as Evaluation, 'list-incidents')).toMatchObject({
      run: 1,
      firstShotLawful: false,
      iterations: 2,
      lawful: true,
      meetsBrief: true,
      failedRequirements: [],
      ended: 'answered',
      harnessFault: null,
      turns: 5,
      toolCalls: { get_system_card: 1, search_components: 1, get_component: 2, validate: 2 },
      // The four mistakes of the first attempt, each counted once by kind.
      violationsSeen: {
        'spec: `…` has no `…` × `…` cell': 1,
        'spec: `…` has no prop `…`': 1,
        'spec: `…` is not an icon role': 1,
        'spec: no component called `…`': 1,
      },
      // The first attempt's four mistakes, in the validator's words, so the miss can be acted on.
      misses: [
        {
          call: 1,
          fatal: null,
          faults: expect.arrayContaining([
            expect.stringContaining('no component called'),
            expect.stringContaining('has no prop'),
            expect.stringContaining('is not an icon role'),
            expect.stringContaining('cell'),
          ]),
          violations: [],
          contract: [],
        },
      ],
      // The scripted usage, summed: every input token, cached or not.
      inputTokens: 58_760,
      cacheReadTokens: 41_900,
      cacheWriteTokens: 14_100,
      outputTokens: 6_950,
      discardedTokens: 0,
      retries: 0,
      backoffMs: 0,
    })
  })

  it('measures a first shot that is lawful', () => {
    expect(record(runs.two as Evaluation, 'settings-workspace')).toMatchObject({
      firstShotLawful: true,
      iterations: 1,
      lawful: true,
      ended: 'answered',
      turns: 4,
      toolCalls: { get_system_card: 1, search_components: 0, get_component: 1, validate: 1 },
      violationsSeen: {},
      misses: [],
      inputTokens: 37_690,
      outputTokens: 5_230,
    })
  })

  it('summarises per brief and overall', () => {
    const { summary } = (runs.two as Evaluation).results
    expect(summary.overall).toMatchObject({
      runs: 2,
      measured: 2,
      endings: { answered: 2, cap: 0, turns: 0, max_tokens: 0, refusal: 0, harness: 0 },
      firstShotRate: 0.5,
      lawfulRate: 1,
      meetsBriefRate: 1,
      lawfulAndMeetsBriefRate: 1,
      failedRequirements: {},
      meanIterations: 1.5,
      lawfulWithoutValidate: 0,
      meanInputTokens: 48_225,
      meanOutputTokens: 6_090,
      retries: 0,
      discardedTokens: 0,
    })
    expect(summary.briefs.map((entry) => entry.brief)).toEqual([
      'list-incidents',
      'settings-workspace',
    ])
  })

  it('records a complete eval, its settings and the effort it sent', () => {
    expect((runs.two as Evaluation).results).toMatchObject({
      partial: false,
      stopped: null,
      settings: {
        effort: 'default',
        maxTokensPerRun: 1_000_000,
        maxTokensTotal: 10_000_000,
      },
    })
  })

  it('keeps the final documents beside the results, not in them', () => {
    const { outputs, text } = runs.two as Evaluation
    expect(outputs.outputs.map(({ brief, run }) => `${brief}#${run}`)).toEqual([
      'list-incidents#1',
      'settings-workspace#1',
    ])
    expect(outputs.outputs[0]?.document).toEqual(
      JSON.parse(fixture('list-incidents/attempt-2.json')),
    )
    expect(text).not.toContain('"root"')
  })

  it('writes into its own directory and never into eval/results', () => {
    expect(listing()).toEqual(resultsBefore)
  })
})

describe('the iteration cap', () => {
  it('stops a run whose calls are all unlawful, and judges what it last submitted', () => {
    const { results } = runs.cap as Evaluation
    expect(record(runs.cap as Evaluation, 'list-incidents')).toMatchObject({
      firstShotLawful: false,
      iterations: null,
      lawful: false,
      // The first attempt reaches for a dialog the vocabulary does not have, so nothing asks first.
      meetsBrief: false,
      failedRequirements: ['delete-asks-first', 'confirmation-names-the-incident'],
      ended: 'cap',
      turns: 3,
      toolCalls: { validate: 1 },
    })
    expect(results.summary.overall).toMatchObject({
      lawfulRate: 0,
      meetsBriefRate: 0,
      lawfulAndMeetsBriefRate: 0,
      failedRequirements: {
        'list-incidents/confirmation-names-the-incident': 1,
        'list-incidents/delete-asks-first': 1,
      },
      meanIterations: null,
    })
  })
})

describe('tsx mode', () => {
  it('validates a module against the red rules and counts violations by rule', () => {
    expect(record(runs.tsx as Evaluation, 'list-incidents')).toMatchObject({
      firstShotLawful: false,
      iterations: 2,
      lawful: true,
      // The module is read through the TypeScript parser and held to the same requirements.
      meetsBrief: true,
      failedRequirements: [],
      violationsSeen: { 'polymorph/no-raw-interactive': 1, 'polymorph/no-raw-styles': 1 },
    })
  })
})

describe('the Messages API path, against a local server', () => {
  it('sends the key, the version, the model, the effort, the tools and the brief', () => {
    // Six requests for four turns: two of them were sent again.
    expect(captured).toHaveLength(6)
    for (const { url, headers, body } of captured) {
      expect(url).toBe('/v1/messages')
      expect(headers['x-api-key']).toBe('local-key')
      expect(headers['anthropic-version']).toBe('2023-06-01')
      expect(body.model).toBe('local-model')
      expect(body.stream).toBe(true)
      expect(body.output_config).toEqual({ effort: 'high' })
      expect(body.tools.map((tool) => tool.name)).toEqual(TOOL_NAMES)
      expect(body.system).toContain('# Screen brief — Workspace settings')
      expect(body.system).toContain('"polymorph-screen/1"')
      expect(body.system).toContain('Call `validate` before you answer.')
    }
    expect((runs.api as Evaluation).results.settings).toMatchObject({ effort: 'high' })
  })

  it('never shows the model the requirements its screen is judged by', () => {
    const requirements = requirementsOf('settings-workspace')
    expect(requirements.length).toBeGreaterThan(0)
    for (const { body } of captured) {
      const sent = JSON.stringify(body)
      for (const { id, says } of requirements) {
        expect(sent).not.toContain(says)
        expect(sent).not.toContain(`"${id}"`)
      }
    }
  })

  it('sends no effort when none was chosen, so the model’s default applies', () => {
    for (const { body } of faultsCaptured) expect(body.output_config).toBeUndefined()
    expect((runs.faults as Evaluation).results.settings).toMatchObject({ effort: 'default' })
  })

  it('returns the assembled turn unchanged, and answers every tool call', () => {
    const [opening, assistant, results] = captured[2]?.body.messages ?? []
    expect(opening).toEqual({ role: 'user', content: 'Build the screen the brief describes.' })
    // The thinking block keeps its signature, and the streamed input is whole again.
    expect(assistant).toEqual({
      role: 'assistant',
      content: [
        { type: 'thinking', thinking: '', signature: 'sig-card' },
        { type: 'tool_use', id: 'toolu_card', name: 'get_system_card', input: { platform: 'web' } },
      ],
    })
    const [result] = (results?.content ?? []) as { tool_use_id: string; content: string }[]
    expect(result?.tool_use_id).toBe('toolu_card')
    expect(result?.content).toContain('# Polymorph — system card')
  })

  it('sends a request that broke off mid-stream again, unchanged', () => {
    expect(captured[3]?.body).toEqual(captured[2]?.body)
  })

  it('sends an input that is not JSON back as an empty object, and answers it as INVALID_JSON', () => {
    // The API refuses an assistant turn whose call has an input that is not an object, and the
    // local one does too, so a run that sent the text back would have stopped here.
    const messages = captured[4]?.body.messages ?? []
    const card = ((messages[2]?.content ?? []) as { content: string }[])[0]?.content
    expect(messages[3]).toEqual({
      role: 'assistant',
      content: [
        { type: 'tool_use', id: 'toolu_bad', name: 'get_component', input: {} },
        {
          type: 'tool_use',
          id: 'toolu_card_again',
          name: 'get_system_card',
          input: { platform: 'web' },
        },
      ],
    })
    expect(messages[4]).toEqual({
      role: 'user',
      content: [
        {
          type: 'tool_result',
          tool_use_id: 'toolu_bad',
          content: expect.stringMatching(
            /^\{"INVALID_JSON":"\{\\"name\\": \\"Settings","why":".+"\}$/,
          ),
          is_error: true,
        },
        // A repeated card call is answered from the run's own copy, and still counted.
        { type: 'tool_result', tool_use_id: 'toolu_card_again', content: card },
      ],
    })
  })

  it('measures what the API reported, retries and discarded attempts apart', () => {
    expect(record(runs.api as Evaluation, 'settings-workspace')).toMatchObject({
      firstShotLawful: true,
      iterations: 1,
      lawful: true,
      ended: 'answered',
      turns: 4,
      toolCalls: { get_system_card: 2, search_components: 0, get_component: 1, validate: 1 },
      inputTokens: 28_000,
      outputTokens: 5_000,
      // The broken-off attempt's reported usage: 3,000 in and 1 out.
      discardedTokens: 3_001,
      retries: 2,
      // The 529's `retry-after` of 0.01 s, then two seconds for the first retry of the stream.
      backoffMs: 2_010,
    })
    expect((runs.api as Evaluation).results).toMatchObject({ model: 'local-model', fake: false })
  })
})

describe('runs that must not count for the model', () => {
  const faults = () => runs.faults as Evaluation

  it('records an exception inside `validate` as a harness fault, with the document', () => {
    expect(record(faults(), 'settings-workspace', 1)).toMatchObject({
      ended: 'harness',
      lawful: false,
      // A run the harness failed on is not judged against its brief either.
      meetsBrief: false,
      failedRequirements: [],
      iterations: null,
      turns: 1,
      toolCalls: { validate: 1 },
    })
    expect(record(faults(), 'settings-workspace', 1).harnessFault).toContain('`validate` failed')
    expect(faults().outputs.outputs[0]?.document).toBe(UNCHECKABLE)
  })

  it('counts a `validate` call whose input is not JSON as a submission that is not lawful', () => {
    // Written as text, a document that is not JSON is a first shot that missed. Written as the
    // call's input, the same slip leaves the whole input unreadable, and it counts the same.
    expect(record(runs.unparsed as Evaluation, 'settings-workspace', 1)).toMatchObject({
      ended: 'answered',
      firstShotLawful: false,
      iterations: 2,
      lawful: true,
      toolCalls: { validate: 2 },
      misses: [
        {
          call: 1,
          // The parser's own words follow, with where the text stopped being JSON.
          fatal: expect.stringMatching(
            /^the input of the `validate` call is not a JSON object: .+, in 39 characters$/,
          ),
          faults: [],
          violations: [],
        },
      ],
    })
    expect(unparsedCaptured[1]?.body.messages[1]).toEqual({
      role: 'assistant',
      content: [{ type: 'tool_use', id: 'toolu_slip', name: 'validate', input: {} }],
    })
  })

  it('never counts a refused or cut-off response as lawful, whatever it carried', () => {
    // The refused one carried a document that meets every requirement, and the cut-off one half
    // a document. Neither is judged: neither meets its brief, and neither names a requirement.
    expect(record(faults(), 'settings-workspace', 2)).toMatchObject({
      ended: 'refusal',
      firstShotLawful: true,
      iterations: 1,
      lawful: false,
      meetsBrief: false,
      failedRequirements: [],
    })
    expect(record(faults(), 'settings-workspace', 4)).toMatchObject({
      ended: 'max_tokens',
      lawful: false,
      meetsBrief: false,
      failedRequirements: [],
    })
  })

  it('counts a lawful answer that was never validated apart from the call count', () => {
    expect(record(faults(), 'settings-workspace', 3)).toMatchObject({
      ended: 'answered',
      lawful: true,
      meetsBrief: true,
      iterations: null,
      toolCalls: { validate: 0 },
    })
  })

  it('leaves the harness fault out of the rates, and counts every ending', () => {
    expect(faults().results.summary.overall).toMatchObject({
      runs: 4,
      // The three runs the rates and their intervals are over.
      measured: 3,
      endings: { answered: 1, cap: 0, turns: 0, max_tokens: 1, refusal: 1, harness: 1 },
      firstShotRate: 0.3333,
      lawfulRate: 0.3333,
      lawfulInterval: { low: 0.0615, high: 0.7923 },
      meetsBriefRate: 0.3333,
      lawfulAndMeetsBriefRate: 0.3333,
      // The cut-off run's half document is not read, so it counts against no requirement.
      failedRequirements: {},
      meanIterations: null,
      lawfulWithoutValidate: 1,
    })
  })
})

describe('the token ceilings', () => {
  it('stop the eval before a run’s next request, keeping nothing of the unfinished run', () => {
    const { code, stderr, results, readme } = runs.runCeiling as Evaluation
    expect(code).toBe(1)
    expect(stderr).toContain('per-run token ceiling')
    expect(results).toMatchObject({
      partial: true,
      // Three turns of the scripted run spent 28,380 tokens; the fourth never started.
      stopped: { reason: 'tokens-per-run', brief: 'list-incidents', run: 1, tokens: 28_380 },
      records: [],
      summary: { overall: { runs: 0, lawfulRate: null, meanInputTokens: null } },
    })
    expect(readme).toContain('(partial: stopped at the per-run token ceiling)')
  })

  it('stop the eval over all its runs, keeping the runs that finished', () => {
    const { code, results } = runs.totalCeiling as Evaluation
    expect(code).toBe(1)
    expect(results).toMatchObject({
      partial: true,
      stopped: { reason: 'tokens-total', brief: 'settings-workspace', run: 1, tokens: 12_460 },
    })
    expect(results.records.map(({ brief }) => brief)).toEqual(['list-incidents'])
    expect(results.summary.briefs.map(({ brief, runs: count }) => `${brief}:${count}`)).toEqual([
      'list-incidents:1',
      'settings-workspace:0',
    ])
  })
})

describe('the CLI runner', () => {
  const standInRun = () => runs.cliStandIn as Evaluation
  const withoutWallTime = (evaluation: Evaluation) =>
    evaluation.results.records.map(({ wallMs: _wallMs, ...rest }) => rest)

  it('measures the scripted model exactly as the API runner does', () => {
    expect(withoutWallTime(runs.cliTwo as Evaluation)).toEqual(
      withoutWallTime(runs.two as Evaluation),
    )
    expect((runs.cliTwo as Evaluation).outputs).toEqual((runs.two as Evaluation).outputs)
    expect(withoutWallTime(runs.cliCap as Evaluation)).toEqual(
      withoutWallTime(runs.cap as Evaluation),
    )
  })

  it('records which runner and which CLI ran, and names the file for the runner', () => {
    expect((runs.cliTwo as Evaluation).results).toMatchObject({
      runner: 'cli',
      cliVersion: 'scripted',
      fake: true,
    })
    expect((runs.two as Evaluation).results).toMatchObject({ runner: 'api', cliVersion: null })
    expect(readdirSync((runs.cliTwo as Evaluation).directory)).toContain(
      `${(runs.cliTwo as Evaluation).results.at.slice(0, 10)}-fake-spec-cli.json`,
    )
  })

  it('needs no key, and passes the CLI the model, the effort, the brief and the four tools', () => {
    const args = standInRecord('args').split('\0')
    const after = (flag: string) => args[args.indexOf(flag) + 1]
    expect(after('--model')).toBe('local-model')
    expect(after('--effort')).toBe('high')
    expect(after('--tools')).toBe('')
    expect(after('--allowedTools')).toBe(
      TOOL_NAMES.map((name) => `mcp__polymorph__${name}`).join(','),
    )
    expect(after('--system-prompt')).toContain('# Screen brief — Workspace settings')
    expect(after('--system-prompt')).toContain('Call `validate` before you answer.')
    expect(standInRun().results).toMatchObject({ runner: 'cli', cliVersion: 'scripted' })
    expect(standInRun().results.settings).toMatchObject({ effort: 'high' })
  })

  it('runs the CLI without the variables a Claude Code session sets, but with how it signs in', () => {
    const names = standInRecord('env').split('\n')
    expect(names).toContain('CLAUDE_CODE_OAUTH_TOKEN')
    for (const name of ['CLAUDECODE', 'CLAUDE_EFFORT', 'CLAUDE_AGENT_SDK_MCP_NO_PREFIX']) {
      expect(names).not.toContain(name)
    }
    // The API runner's `max_tokens`.
    expect(standInRecord('max').trim()).toBe('64000')
  })

  it('records the runs that must not count for the model as the API runner does', () => {
    const [harness, refusal, unvalidated, cutOff] = standInRun().results.records
    expect(harness).toMatchObject({ ended: 'harness', lawful: false, iterations: null })
    expect(harness?.harnessFault).toContain('`validate` failed')
    expect(standInRun().outputs.outputs[0]?.document).toBe(UNCHECKABLE)
    expect(refusal).toMatchObject({ ended: 'refusal', firstShotLawful: true, lawful: false })
    expect(unvalidated).toMatchObject({ ended: 'answered', lawful: true, iterations: null })
    expect(cutOff).toMatchObject({ ended: 'max_tokens', lawful: false })
    expect(standInRun().results.summary.overall).toMatchObject({
      endings: { answered: 1, cap: 0, turns: 0, max_tokens: 1, refusal: 1, harness: 1 },
      firstShotRate: 0.3333,
      lawfulRate: 0.3333,
      lawfulWithoutValidate: 1,
    })
  })

  it('reads a journal line only once it is whole', () => {
    // The half-written line is not JSON yet. The whole line before it is the
    // verdict on the lawful document, and it is counted.
    const { code, stderr, results } = attempts.halfLine as Awaited<ReturnType<typeof attempt>>
    expect({ code, stderr: code === 0 ? '' : stderr }).toEqual({ code: 0, stderr: '' })
    expect(results?.records[0]).toMatchObject({
      ended: 'answered',
      lawful: true,
      firstShotLawful: true,
      iterations: 1,
    })
  })

  it('reads a call’s verdict only once the CLI has reported that call’s result', () => {
    // The verdict is in the journal while the runner reads the turn before the
    // call. Counted then, it would end the run at the cap one turn early, with
    // the turn that called `validate` and its tokens left out of the record.
    const { code, stderr, results } = attempts.ahead as Awaited<ReturnType<typeof attempt>>
    expect({ code, stderr: code === 0 ? '' : stderr }).toEqual({ code: 0, stderr: '' })
    expect(results?.records[0]).toMatchObject({
      ended: 'cap',
      turns: 2,
      inputTokens: 2000,
      outputTokens: 200,
      toolCalls: { get_system_card: 1, validate: 1 },
    })
  })

  it('lets a result the server wrote no line for release no other call’s verdict', () => {
    // A denied call has a result and no journal line. Matched by count alone,
    // its result would let `validate`'s line through a turn early.
    const { code, stderr, results } = attempts.aheadDenied as Awaited<ReturnType<typeof attempt>>
    expect({ code, stderr: code === 0 ? '' : stderr }).toEqual({ code: 0, stderr: '' })
    expect(results?.records[0]).toMatchObject({
      ended: 'cap',
      turns: 2,
      inputTokens: 2000,
      outputTokens: 200,
      toolCalls: { validate: 1 },
    })
  })

  it('stops the CLI when reading its stream throws, and then stops the eval', () => {
    // Without the stop, the stand-in would wait out its minute while the eval exits.
    const { code, stderr, results } = attempts.unreadable as Awaited<ReturnType<typeof attempt>>
    expect(code).toBe(1)
    expect(stderr).toContain('SyntaxError')
    expect(results).toBeNull()
    const pid = Number(standInRecord('pid', 1, UNREADABLE))
    expect(pid).toBeGreaterThan(0)
    expect(running(pid)).toBe(false)
  })

  it('stops at a usage limit, keeping the runs that finished, marked partial', () => {
    const { code, stderr, results, readme } = standInRun()
    expect(code).toBe(1)
    expect(stderr).toContain('hit your limit')
    expect(results).toMatchObject({
      partial: true,
      stopped: { reason: 'usage-limit', brief: 'settings-workspace', run: 5 },
    })
    expect(results.records).toHaveLength(4)
    expect(readme).toContain('(partial: stopped at a usage limit)')
    expect(readme).toContain('No number is recorded')
  })
})

describe('refusing to start', () => {
  const refusal = (args: string[], env: NodeJS.ProcessEnv = process.env) =>
    execute('node', ['eval/run.mjs', ...args], { cwd: ROOT, env }).then(
      () => null,
      (error: { code: number; stderr: string }) => error,
    )

  it('without a key, and says why', async () => {
    const environment = { ...process.env }
    delete environment.ANTHROPIC_API_KEY
    const failure = await refusal([], environment)
    expect(failure?.code).toBe(1)
    expect(failure?.stderr).toContain('ANTHROPIC_API_KEY is not set')
  })

  it('a scripted run into eval/results, or anywhere inside it, through either runner', async () => {
    const existed = existsSync(RESULTS)
    for (const runner of ['api', 'cli']) {
      for (const out of ['eval/results', 'eval/results/smoke', resolve(RESULTS, '..', 'results')]) {
        const failure = await refusal([
          '--fake',
          '--runner',
          runner,
          '--briefs',
          'eval/briefs/list*.md',
          '--out',
          out,
        ])
        expect(failure?.code, `${runner} ${out}`).toBe(1)
        expect(failure?.stderr, `${runner} ${out}`).toContain(
          '`--fake` never writes into eval/results',
        )
      }
    }
    expect(existsSync(RESULTS)).toBe(existed)
    expect(listing()).toEqual(resultsBefore)
  })

  it('a CLI that does not run, and a CLI named without the CLI runner', async () => {
    const missing = resolve(SCRATCH, 'no-such-claude')
    expect((await refusal(['--runner', 'cli', '--claude', missing]))?.stderr).toContain(
      'the Claude Code CLI did not run',
    )
    expect((await refusal(['--claude', missing]))?.stderr).toContain('add `--runner cli`')
    expect((await refusal(['--fake', '--runner', 'cli', '--claude', missing]))?.stderr).toContain(
      '`--claude` does not apply',
    )
  })

  it('an effort the API does not have, or one the scripted model would ignore', async () => {
    expect((await refusal(['--effort', 'extreme']))?.stderr).toContain('`--effort` is `default`')
    expect((await refusal(['--fake', '--effort', 'high']))?.stderr).toContain(
      '`--effort` does not apply',
    )
  })
})

/* -------------------------------------------------------------------------- */
/* Whether a screen meets its brief                                           */
/* -------------------------------------------------------------------------- */

/** Every member a check names, in its patterns and in what they must have inside. */
function membersNamed(check: Check): string[] {
  const inPattern = (pattern: Pattern): string[] => [
    ...pattern.component,
    ...(pattern.has === undefined ? [] : inPattern(pattern.has)),
  ]
  return [
    ...(check.any ?? check.all ?? []).flatMap(membersNamed),
    ...(check.element === undefined ? [] : inPattern(check.element)),
    ...(check.count === undefined ? [] : [check.count].flat().flatMap(inPattern)),
  ]
}

const REMOVED = Symbol('removed')

/** A spec without any element of the named members. An element goes with everything inside it. */
function without(document: string, members: string[]) {
  const prune = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(prune).filter((item) => item !== REMOVED)
    if (typeof value !== 'object' || value === null) return value
    const node = value as Record<string, unknown>
    if (typeof node.component === 'string' && members.includes(node.component)) return REMOVED
    return Object.fromEntries(
      Object.entries(node)
        .map(([key, item]) => [key, prune(item)] as const)
        .filter(([, item]) => item !== REMOVED),
    )
  }
  const spec = JSON.parse(document) as { root: unknown }
  const root = prune(spec.root)
  return { ...spec, root: root === REMOVED ? { component: 'Stack' } : root }
}

describe('the requirements', () => {
  const members = REGISTRY.components.map((entry) => entry.name)

  it('exist for every brief, and for nothing else', () => {
    expect([...REQUIRED.keys()]).toEqual(ALL_BRIEFS)
    for (const brief of ALL_BRIEFS) expect(requirementsOf(brief).length, brief).toBeGreaterThan(0)
  })

  it('say what they ask for without naming a member, as the briefs do', () => {
    // The report prints these sentences, and a stack with no such vocabulary can be held to them.
    for (const brief of ALL_BRIEFS) {
      for (const { id, says } of requirementsOf(brief)) {
        for (const component of members) {
          expect(says, `${brief}/${id} names ${component}`).not.toContain(component)
        }
      }
    }
  })

  it('are refused when they name a member, a prop or a kind the vocabulary does not have', () => {
    const faults = (check: object, kinds = { choice: ['Select'] }) =>
      resolveRequirements({ requirements: [{ id: 'asks', says: '', check }] }, kinds, REGISTRY)
    expect(faults({ element: { component: 'Modal' } })).toEqual(['asks: no member called `Modal`'])
    expect(faults({ element: { component: 'Button', props: { colour: 'given' } } })).toEqual([
      'asks: `Button` has no prop `colour`',
    ])
    expect(
      faults({ element: { component: 'Tabs.Content', has: { component: 'Tabs.Panel' } } }),
    ).toEqual(['asks: no member called `Tabs.Panel`'])
    expect(faults({ count: { kind: 'chooser' }, min: 1 })).toEqual([
      'asks: no kind called `chooser`',
    ])
    // A kind's members are held to the prop as well.
    expect(faults({ element: { kind: 'choice', anyProp: { onSort: 'given' } } })).toEqual([
      'asks: `Select` has no prop `onSort`',
    ])
    const one = 'asks: a pattern names `component` or `kind`, and not both'
    expect(faults({ element: { kind: 'choice', component: 'Select' } })).toEqual([one])
    expect(faults({ element: {} })).toEqual([one])
    expect(faults({ count: { component: 'Button' }, min: 0 })).toEqual([
      'asks: `min` is at least 1',
    ])
    expect(
      faults({ element: { component: 'Button', props: { label: { matches: '(' } } } }),
    ).toEqual(['asks: `label` is matched by a pattern that does not compile'])
    expect(
      resolveRequirements(
        {
          requirements: [
            { id: 'asks', says: '', check: { element: { component: 'Button' } } },
            { id: 'asks', says: '', check: { element: { component: 'Link' } } },
          ],
        },
        {},
        REGISTRY,
      ),
    ).toEqual(['asks: the id is used twice'])
    // A brief that requires nothing would be met by every screen.
    expect(resolveRequirements({ requirements: [] }, {}, REGISTRY)).toEqual([
      'there is no requirement',
    ])
  })

  it('digest the checks and not the sentences, so rewording one compares as before', () => {
    const write = (name: string, says: string, component: string) => {
      const directory = resolve(SCRATCH, name)
      mkdirSync(directory)
      writeFileSync(resolve(directory, 'kinds.json'), '{}')
      writeFileSync(
        resolve(directory, 'a-brief.json'),
        JSON.stringify({ requirements: [{ id: 'asks', says, check: { element: { component } } }] }),
      )
      return loadRequirements({ registry: REGISTRY, shapes: SHAPES, directory }).get('a-brief')
        ?.digest
    }
    const digest = write('digest-one', 'A control deletes it.', 'Button')
    expect(digest).toMatch(/^[0-9a-f]{12}$/)
    expect(write('digest-reworded', 'One control deletes it.', 'Button')).toBe(digest)
    expect(write('digest-rechecked', 'A control deletes it.', 'Link')).not.toBe(digest)
  })

  it('are refused when a file is not in the shape, with every fault listed', () => {
    const directory = resolve(SCRATCH, 'requirements')
    mkdirSync(directory)
    writeFileSync(resolve(directory, 'kinds.json'), JSON.stringify({ choice: ['Chooser'] }))
    writeFileSync(
      resolve(directory, 'a-brief.json'),
      JSON.stringify({
        requirements: [{ id: 'Asks First', says: '', check: { exists: { component: 'Button' } } }],
      }),
    )
    writeFileSync(
      resolve(directory, 'b-brief.json'),
      JSON.stringify({
        requirements: [{ id: 'asks', says: '', check: { element: { component: 'Modal' } } }],
      }),
    )
    let message = ''
    try {
      loadRequirements({ registry: REGISTRY, shapes: SHAPES, directory })
    } catch (error) {
      message = (error as Error).message
    }
    expect(message).toContain('kinds.json: choice: no member called `Chooser`')
    expect(message).toContain('a-brief.json: $.requirements[0].id: "Asks First" does not match')
    expect(message).toContain('a-brief.json: $.requirements[0].check')
    expect(message).toContain('b-brief.json: asks: no member called `Modal`')
  })

  it('are each met by the answer the scripted model gives', () => {
    for (const brief of ALL_BRIEFS) {
      expect(unmet(requirementsOf(brief), 'spec', scriptedAnswer(brief)), brief).toEqual([])
    }
  })

  it('are each failed once the members they name are taken out of that answer', () => {
    // A check that still held would hold for any screen, and would measure nothing.
    for (const brief of ALL_BRIEFS) {
      for (const requirement of requirementsOf(brief)) {
        const stripped = without(scriptedAnswer(brief), membersNamed(requirement.check))
        expect(unmet([requirement], 'spec', stripped), `${brief}/${requirement.id}`).toEqual([
          requirement.id,
        ])
      }
    }
  })

  it('are met by no other brief’s answer, and by no screen that composes nothing', () => {
    const nothing = { spec: 'polymorph-screen/1', root: { component: 'Stack' } }
    for (const brief of ALL_BRIEFS) {
      const requirements = requirementsOf(brief)
      expect(unmet(requirements, 'spec', nothing), brief).toEqual(requirements.map(({ id }) => id))
      for (const other of ALL_BRIEFS.filter((name) => name !== brief)) {
        expect(
          unmet(requirements, 'spec', scriptedAnswer(other)).length,
          `${other} answers ${brief}`,
        ).toBeGreaterThan(0)
      }
    }
  })

  it('read a spec and the TSX it emits as the same elements, and judge them alike', async () => {
    for (const brief of ALL_BRIEFS) {
      const answer = scriptedAnswer(brief)
      const code = await emitScreen(JSON.parse(answer) as Parameters<typeof emitScreen>[0])
      const members = (mode: string, document: string) =>
        (elementsOf(mode, document) as { component: string }[]).map(({ component }) => component)
      expect(members('tsx', code), brief).toEqual(members('spec', answer))
      expect(unmet(requirementsOf(brief), 'tsx', code), brief).toEqual([])
      // And alike when the screen falls short: the same stripped spec, emitted.
      for (const requirement of requirementsOf(brief).slice(0, 2)) {
        const stripped = without(answer, membersNamed(requirement.check))
        const emitted = await emitScreen(stripped as Parameters<typeof emitScreen>[0])
        expect(unmet(requirementsOf(brief), 'tsx', emitted), `${brief}/${requirement.id}`).toEqual(
          unmet(requirementsOf(brief), 'spec', stripped),
        )
      }
    }
  })

  it('meet nothing in a document that cannot be read', () => {
    const requirements = requirementsOf('settings-workspace')
    const all = requirements.map(({ id }) => id)
    expect(unmet(requirements, 'spec', UNPARSEABLE)).toEqual(all)
    expect(unmet(requirements, 'spec', null)).toEqual(all)
    expect(unmet(requirements, 'spec', '{"spec": "polymorph-screen/1"}')).toEqual(all)
    expect(
      unmet(requirements, 'tsx', 'export function Screen() { return <SettingsPage> }'),
    ).toEqual(all)
    expect(unmet(requirements, 'tsx', null)).toEqual(all)
  })
})

describe('reading a TSX module', () => {
  // A module a model could write by hand: a helper component, a loop, a condition, a fragment,
  // a computed title and a spread.
  const MODULE = `
    import { Button, ChatMessage, ChatThread, ConfirmDialog, EmptyState, ToolCall } from '@polymorph/react-ui'

    function Calls({ calls }: { calls: Call[] }) {
      return <>{calls.map((call) => <ToolCall key={call.id} name={call.name} status={call.status} />)}</>
    }

    export function Screen({ turns, open, order, onRefund, ...rest }: Props) {
      return (
        <ChatThread label="Conversation" empty={<EmptyState title="Ask about the order" />} streaming>
          {turns.length === 0
            ? null
            : turns.map((turn) => (
                <ChatMessage key={turn.id} author={turn.author} role={turn.role}>
                  {turn.text}
                  <Calls calls={turn.calls} />
                </ChatMessage>
              ))}
          <ConfirmDialog
            open={open!}
            title={\`Refund \${order.total}?\`}
            description="This cannot be undone."
            confirmLabel={'Refund'}
            onConfirm={onRefund}
            trigger={<Button label="Refund order" disabled={false} {...rest} />}
          />
        </ChatThread>
      )
    }
  `

  it('finds every element, in a helper, a loop, a condition and a prop', () => {
    const found = elementsOf('tsx', MODULE) as { component: string }[]
    expect(found.map(({ component }) => component)).toEqual([
      'ToolCall',
      'ChatThread',
      'EmptyState',
      'ChatMessage',
      'Calls',
      'ConfirmDialog',
      'Button',
    ])
  })

  it('tells a fixed value from one that comes from the data', () => {
    const requirements = resolved({
      'computed-title': {
        element: { component: 'ConfirmDialog', props: { title: 'dynamic', open: 'dynamic' } },
      },
      'fixed-description': {
        element: { component: 'ConfirmDialog', props: { description: 'dynamic' } },
      },
      'literal-label': {
        element: { component: 'ConfirmDialog', props: { confirmLabel: { is: 'Refund' } } },
      },
      'matched-label': {
        element: { component: 'Button', props: { label: { matches: '^refund\\b' } } },
      },
      'bare-attribute': { element: { component: 'ChatThread', props: { streaming: 'given' } } },
      'bare-attribute-is-fixed': {
        element: { component: 'ChatThread', props: { streaming: 'dynamic' } },
      },
      'false-is-not-given': { element: { component: 'Button', props: { disabled: 'given' } } },
      // The dialog writes no `tone`, and nothing is spread into it.
      'absent-is-not-given': { element: { component: 'ConfirmDialog', props: { tone: 'given' } } },
      // The button is given props by a spread, which may carry `loading`.
      'unwritten-beside-a-spread-is-bound': {
        element: { component: 'Button', props: { loading: 'dynamic' } },
      },
      'a-spread-fixes-no-value': {
        element: { component: 'Button', props: { variant: { is: 'solid' } } },
      },
      'one-of-two-props': {
        element: { component: 'Button', anyProp: { loading: 'given', label: 'given' } },
      },
      'inside-a-loop': { element: { component: 'ChatThread', has: { component: 'ChatMessage' } } },
      'inside-a-prop': { element: { component: 'ConfirmDialog', has: { component: 'Button' } } },
      'not-inside': { element: { component: 'ConfirmDialog', has: { component: 'ToolCall' } } },
      'counted-across-patterns': {
        count: [{ component: 'ToolCall' }, { component: ['ChatMessage', 'EmptyState'] }],
        min: 3,
      },
      // One message is written, inside a loop over the turns: it stands for as many as there are.
      'a-loop-stands-for-many': { count: { component: 'ChatMessage' }, min: 5 },
      'too-few': { count: { component: 'EmptyState' }, min: 2 },
      either: { any: [{ element: { component: 'Dialog' } }, { element: { component: 'Button' } }] },
      both: { all: [{ element: { component: 'Dialog' } }, { element: { component: 'Button' } }] },
    })
    expect(unmet(requirements, 'tsx', MODULE)).toEqual([
      'fixed-description',
      'bare-attribute-is-fixed',
      'false-is-not-given',
      'absent-is-not-given',
      'a-spread-fixes-no-value',
      'not-inside',
      'too-few',
      'both',
    ])
  })
})

describe('reading a TSX module’s constants', () => {
  it('reads a prop given a module constant as the fixed value the constant holds', () => {
    const code = `
      import { ConfirmDialog, EmptyState } from '@polymorph/react-ui'

      const TITLE = 'Delete this incident?'
      const WORDS = { confirm: 'Delete', cancel: \`Keep\` } as const
      const NOTHING = <EmptyState title="No incidents" />
      const loaded = load()

      export function Screen({ open, incident }: Props) {
        return (
          <ConfirmDialog
            open={open}
            title={TITLE}
            description={incident.title}
            confirmLabel={WORDS.confirm}
            cancelLabel={WORDS.other}
            trigger={NOTHING}
            confirmWith={loaded}
          />
        )
      }
    `
    const requirements = resolved({
      'constant-is-fixed': { element: { component: 'ConfirmDialog', props: { title: 'dynamic' } } },
      'constant-is-its-value': {
        element: { component: 'ConfirmDialog', props: { title: { matches: '^delete' } } },
      },
      'field-of-a-constant': {
        element: { component: 'ConfirmDialog', props: { confirmLabel: { is: 'Delete' } } },
      },
      'an-input-is-not-a-constant': {
        element: { component: 'ConfirmDialog', props: { description: 'dynamic' } },
      },
      // A path the constant does not hold, a constant that is computed, and one that holds an
      // element all stay names.
      'unknown-field': {
        element: { component: 'ConfirmDialog', props: { cancelLabel: 'dynamic' } },
      },
      computed: { element: { component: 'ConfirmDialog', props: { confirmWith: 'dynamic' } } },
      'element-constant': {
        element: { component: 'ConfirmDialog', props: { trigger: 'dynamic' } },
      },
      // The element a constant holds is read once, where the module declares it.
      'counted-once': { count: { component: 'EmptyState' }, min: 2 },
    })
    expect(unmet(requirements, 'tsx', code)).toEqual(['constant-is-fixed', 'counted-once'])
  })
})

describe('reading what a TSX module writes indirectly', () => {
  it('resolves a name in the scopes around it', () => {
    const code = `
      import { ConfirmDialog } from '@polymorph/react-ui'

      const title = 'Delete this incident?'

      function Fixed() {
        const description = 'Every project is deleted too.'
        return <ConfirmDialog title={title} description={description} />
      }

      // The parameter is not the module's constant of the same name.
      function Named({ title }: Props) {
        return <ConfirmDialog title={title} confirmLabel="Delete" />
      }

      function Each({ rows }: Props) {
        for (const title of rows) return <ConfirmDialog title={title} cancelLabel="Keep" />
        return null
      }
    `
    const count = (props: object, min: number) => ({
      count: { component: 'ConfirmDialog', props },
      min,
    })
    const requirements = resolved({
      'two-dynamic-titles': count({ title: 'dynamic' }, 2),
      'three-dynamic-titles': count({ title: 'dynamic' }, 3),
      'local-constant-is-fixed': count({ description: 'dynamic' }, 1),
      'local-constant-is-its-value': count({ description: { matches: 'deleted too' } }, 1),
    })
    expect(unmet(requirements, 'tsx', code)).toEqual([
      'three-dynamic-titles',
      'local-constant-is-fixed',
    ])
  })

  it('reads a member under the name its import gives it', () => {
    const code = `
      import { ChatThread as Thread, Tabs as Sections } from '@polymorph/react-ui'
      import * as UI from '@polymorph/react-ui'

      export function Screen({ value }: Props) {
        return (
          <Thread label="Conversation">
            <Sections value={value} tabs={[]}>
              <Sections.Content value="one">
                <UI.Button label="Send" />
                <UI.Tabs.Content value="two" />
              </Sections.Content>
            </Sections>
          </Thread>
        )
      }
    `
    expect(
      (elementsOf('tsx', code) as { component: string }[]).map(({ component }) => component),
    ).toEqual(['ChatThread', 'Tabs', 'Tabs.Content', 'Button', 'Tabs.Content'])
  })

  it('finds an element in an object’s method, and reads the words between two tags', () => {
    const code = `
      import { Button, DataTable, Link, Text } from '@polymorph/react-ui'

      export function Screen({ rows, total, ...rest }: Props) {
        const columns = [
          { key: 'title', header: 'Title' },
          { key: 'actions', cell(row: Row) { return <Button label="Delete" tone="danger" /> } },
          { ...rest },
        ]
        return (
          <DataTable columns={columns} data={rows} __proto__="x">
            <Link href="/reset">Forgot your password?</Link>
            <Text>{total} is returned to the customer.</Text>
            <Text>Refunds cannot be undone.</Text>
          </DataTable>
        )
      }
    `
    const requirements = resolved({
      'in-a-method': { element: { component: 'Button', props: { tone: { is: 'danger' } } } },
      // A list that holds a method or a spread is computed, not fixed.
      'computed-columns': { element: { component: 'DataTable', props: { columns: 'dynamic' } } },
      'fixed-words': {
        element: { component: 'Link', props: { children: { matches: 'forgot' } } },
      },
      'words-around-a-value': { element: { component: 'Text', props: { children: 'dynamic' } } },
      'words-around-a-value-are-not-fixed': {
        count: { component: 'Text', props: { children: { matches: 'returned' } } },
        min: 1,
      },
      'two-texts-change': { count: { component: 'Text', props: { children: 'dynamic' } }, min: 2 },
    })
    expect(unmet(requirements, 'tsx', code)).toEqual([
      'words-around-a-value-are-not-fixed',
      'two-texts-change',
    ])
  })
})

describe('reading the items of a list', () => {
  const stats = (value: unknown) => ({
    spec: 'polymorph-screen/1',
    root: { component: 'Dashboard', props: { title: 'Usage', stats: value } },
  })
  const stat = (fields: object) => ({
    $object: { label: 'Requests', value: { $: 'requests' }, ...fields },
  })
  const requirements = resolved({
    four: { element: { component: 'Dashboard', props: { stats: { items: { min: 4 } } } } },
    'each-moves': {
      element: {
        component: 'Dashboard',
        props: {
          stats: { items: { min: 2, anyField: { delta: 'given', trend: 'given' } } },
        },
      },
    },
    'each-labelled': {
      element: {
        component: 'Dashboard',
        props: { stats: { items: { fields: { label: { matches: '^req' } } } } },
      },
    },
  })

  it('passes a list handed to the data whole, whose items cannot be read', () => {
    expect(unmet(requirements, 'spec', stats({ $: 'stats' }))).toEqual([])
  })

  it('holds a list written out to its count and to each item’s fields', () => {
    const moving = stat({ delta: { $: 'delta' } })
    expect(
      unmet(requirements, 'spec', stats([moving, moving, stat({ trend: 'up' }), moving])),
    ).toEqual([])
    expect(unmet(requirements, 'spec', stats([moving, stat({})]))).toEqual(['four', 'each-moves'])
    expect(unmet(requirements, 'spec', stats([moving, { $: 'last' }]))).toEqual(['four'])
    expect(unmet(requirements, 'spec', stats('none'))).toEqual([
      'four',
      'each-moves',
      'each-labelled',
    ])
  })

  it('is refused with a field pattern that does not compile, or a `min` below 1', () => {
    const faults = (items: object) =>
      resolveRequirements(
        {
          requirements: [
            {
              id: 'asks',
              says: '',
              check: { element: { component: 'Dashboard', props: { stats: { items } } } },
            },
          ],
        },
        {},
        REGISTRY,
      )
    expect(faults({ fields: { label: { matches: '(' } } })).toEqual([
      'asks: `label` is matched by a pattern that does not compile',
    ])
    expect(faults({ min: 0 })).toEqual(['asks: `min` is at least 1'])
  })
})

/** The requirement ids of a brief that a document does not meet, among those named. */
function missed(brief: string, mode: string, document: unknown, among: string[]) {
  return unmet(requirementsOf(brief), mode, document).filter((id: string) => among.includes(id))
}

describe('a screen that leaves out part of its brief', () => {
  const screen = (root: object) => ({ spec: 'polymorph-screen/1', root })
  const field = (label: string, control: object) => ({
    component: 'FormField',
    props: { label, error: { $: 'error' } },
    children: [control],
  })

  it('does not pass headline numbers that say nothing of how they moved', () => {
    const stat = { $object: { label: 'Requests', value: { $: 'requests' } } }
    const dashboard = (stats: unknown) =>
      screen({ component: 'Dashboard', props: { title: 'Usage', stats } })
    const both = ['headline-numbers', 'direction-of-change']
    expect(missed('dashboard-usage', 'spec', dashboard([stat, stat, stat, stat]), both)).toEqual([
      'direction-of-change',
    ])
    expect(missed('dashboard-usage', 'spec', dashboard([stat, stat]), both)).toEqual(both)
  })

  it('does not take any button on a dashboard for the download', () => {
    const dashboard = (label: string) =>
      screen({
        component: 'Dashboard',
        props: { title: 'Usage', actions: { component: 'Button', props: { label } } },
      })
    expect(missed('dashboard-usage', 'spec', dashboard('Refresh'), ['download'])).toEqual([
      'download',
    ])
    expect(missed('dashboard-usage', 'spec', dashboard('Export as CSV'), ['download'])).toEqual([])
  })

  it('does not count the invitees as the start time, or as the length', () => {
    const form = screen({
      component: 'FormPage',
      props: { title: 'Book a room' },
      children: [
        field('Room', { component: 'Select', props: { options: { $: 'rooms' } } }),
        field('Date', { component: 'DatePicker', props: { granularity: 'day' } }),
        field('Length', { component: 'NumberInput' }),
        field('Invitees', { component: 'MultiSelect', props: { options: { $: 'people' } } }),
      ],
    })
    expect(missed('form-booking', 'spec', form, ['room-and-length', 'start-time'])).toEqual([
      'room-and-length',
      'start-time',
    ])
  })

  it('does not take two forms of an email address and a password for a name', () => {
    const form = {
      component: 'Stack',
      children: [
        field('Email', { component: 'Input', props: { type: 'email' } }),
        field('Password', { component: 'Input', props: { type: 'password' } }),
      ],
    }
    const auth = screen({
      component: 'AuthPage',
      props: { title: 'Welcome' },
      children: [form, form],
    })
    expect(missed('auth-sign-in-up', 'spec', auth, ['name-on-sign-up'])).toEqual([
      'name-on-sign-up',
    ])
  })

  it('does not take a link to somewhere else for a way to reset the password', () => {
    const auth = (words: string) =>
      screen({
        component: 'AuthPage',
        props: {
          title: 'Welcome',
          cardFooter: { component: 'Link', props: { href: '/sign-up' }, children: [words] },
        },
      })
    expect(
      missed('auth-sign-in-up', 'spec', auth('Create an account'), ['reset-password']),
    ).toEqual(['reset-password'])
    expect(
      missed('auth-sign-in-up', 'spec', auth('Forgot your password?'), ['reset-password']),
    ).toEqual([])
  })

  it('does not count the table of facts as the list of comments', () => {
    const order = screen({
      component: 'DetailPage',
      props: { title: { $: 'order.title' } },
      children: [
        { component: 'Table', props: { label: 'Order details' } },
        { component: 'Timeline', props: { label: 'History', events: { $: 'events' } } },
      ],
    })
    expect(missed('detail-order', 'spec', order, ['history-and-comments'])).toEqual([
      'history-and-comments',
    ])
  })
})

describe('a screen that meets its brief another way', () => {
  it('may confirm in a dialog of its own, with the amount in its body', () => {
    const code = `
      import { Button, Dialog, PageHeader, Text } from '@polymorph/react-ui'

      export function Screen({ order, onRefund }: Props) {
        return (
          <PageHeader
            title={order.title}
            actions={
              <Dialog
                title="Refund this order?"
                trigger={<Button label="Refund" tone="danger" variant="outline" />}
                footer={<Button label="Refund" tone="danger" variant="solid" onClick={onRefund} />}
              >
                <Text>{order.total} is returned to the customer.</Text>
              </Dialog>
            }
          />
        )
      }
    `
    expect(
      missed('detail-order', 'tsx', code, [
        'refund-from-the-top',
        'refund-asks-first',
        'confirmation-states-the-amount',
      ]),
    ).toEqual([])
  })

  it('may write its numbers and its comments in a loop', () => {
    const dashboard = `
      import { Grid, Stat } from '@polymorph/react-ui'
      export function Screen({ stats }: Props) {
        return <Grid columns={4}>{stats.map((stat) => <Stat key={stat.label} {...stat} />)}</Grid>
      }
    `
    expect(
      missed('dashboard-usage', 'tsx', dashboard, ['headline-numbers', 'direction-of-change']),
    ).toEqual([])

    const order = `
      import { Avatar, Card, RelativeTime, Text, Timeline } from '@polymorph/react-ui'
      export function Screen({ events, comments }: Props) {
        return (
          <>
            <Timeline label="History" events={events} />
            {comments.map((comment) => (
              <Card key={comment.id}>
                <Avatar name={comment.author} />
                <RelativeTime value={comment.at} />
                <Text>{comment.text}</Text>
              </Card>
            ))}
          </>
        )
      }
    `
    expect(missed('detail-order', 'tsx', order, ['history-and-comments'])).toEqual([])
  })

  it('may show the empty conversation in place of the thread', () => {
    const code = `
      import { ChatThread, ConversationPage, EmptyState } from '@polymorph/react-ui'
      export function Screen({ turns }: Props) {
        return (
          <ConversationPage
            title="Assistant"
            thread={
              turns.length === 0 ? (
                <EmptyState title="Ask about your deployment" />
              ) : (
                <ChatThread label="Conversation" messages={turns} />
              )
            }
          />
        )
      }
    `
    expect(missed('chat-assistant', 'tsx', code, ['thread', 'empty-conversation'])).toEqual([])
  })

  it('may leave Back out of the first step, and book with a primary action', () => {
    const onboarding = {
      spec: 'polymorph-screen/1',
      root: {
        component: 'FormPage',
        props: {
          title: 'Set up',
          actions: [
            { component: 'Button', props: { label: 'Finish later', variant: 'ghost' } },
            { component: 'Button', props: { label: 'Continue', disabled: { $: 'blocked' } } },
          ],
        },
      },
    }
    expect(
      missed('onboarding-steps', 'spec', onboarding, ['continue-gated', 'finish-later']),
    ).toEqual([])
    const booking = {
      spec: 'polymorph-screen/1',
      root: {
        component: 'FormPage',
        props: {
          title: 'Book a room',
          actions: [
            { component: 'Button', props: { label: 'Cancel', variant: 'ghost' } },
            {
              component: 'Button',
              props: { label: 'Book', variant: 'solid', onClick: { $: 'onBook' } },
            },
          ],
        },
      },
    }
    expect(missed('form-booking', 'spec', booking, ['book-and-cancel'])).toEqual([])
  })
})

describe('reading a spec', () => {
  it('finds elements in props, lists and structured objects, and tells bindings from literals', () => {
    const spec = {
      spec: 'polymorph-screen/1',
      root: {
        component: 'ListPage',
        props: {
          title: 'Incidents',
          empty: { $: 'isEmpty' },
          emptyState: {
            $object: {
              title: 'No incidents',
              action: { component: 'Button', props: { label: { $: 'labels.raise' } } },
            },
          },
          summary: { $object: { title: 'No incident matches' } },
          filters: [{ component: 'Select', props: { options: [{ $object: { value: 'open' } }] } }],
        },
        children: [{ component: 'DataTable', props: { loading: false, data: { $: 'rows' } } }],
      },
    }
    expect(
      (elementsOf('spec', spec) as { component: string }[]).map(({ component }) => component),
    ).toEqual(['ListPage', 'Button', 'Select', 'DataTable'])
    const requirements = resolved({
      bound: { element: { component: 'ListPage', props: { empty: 'dynamic' } } },
      'fixed-title': { element: { component: 'ListPage', props: { title: 'dynamic' } } },
      // The object's action is an element with a bound label, so the object changes with the data.
      'bound-inside-an-object': {
        element: { component: 'ListPage', props: { emptyState: 'dynamic' } },
      },
      'fixed-object': {
        element: { component: 'ListPage', props: { summary: 'dynamic' } },
      },
      'fixed-list': { element: { component: 'Select', props: { options: 'dynamic' } } },
      'false-is-not-given': { element: { component: 'DataTable', props: { loading: 'given' } } },
      'inside-an-object': { element: { component: 'ListPage', has: { component: 'Button' } } },
    })
    expect(unmet(requirements, 'spec', spec)).toEqual([
      'fixed-title',
      'fixed-object',
      'fixed-list',
      'false-is-not-given',
    ])
    // The same document as the text a model hands back.
    expect(unmet(requirements, 'spec', JSON.stringify(spec))).toEqual(
      unmet(requirements, 'spec', spec),
    )
  })
})

/* -------------------------------------------------------------------------- */
/* Spread                                                                     */
/* -------------------------------------------------------------------------- */

/** An interval as a summary records it. */
function bounds(successes: number, total: number) {
  const found = interval(successes, total) as { low: number; high: number }
  return { low: Math.round(found.low * 1e4) / 1e4, high: Math.round(found.high * 1e4) / 1e4 }
}

describe('the interval beside a rate', () => {
  it('is the Wilson interval, which stays wide at 0% and 100%', () => {
    // Six lawful runs out of eight are what a 60% model and a 90% model both often produce.
    expect(bounds(6, 8)).toEqual({ low: 0.4093, high: 0.9285 })
    expect(bounds(8, 8)).toEqual({ low: 0.6756, high: 1 })
    expect(bounds(0, 8)).toEqual({ low: 0, high: 0.3244 })
    expect(bounds(1, 1)).toEqual({ low: 0.2065, high: 1 })
    expect(interval(0, 0)).toBeNull()
    // More runs narrow it: the same 75% over eighty runs.
    expect(bounds(60, 80)).toEqual({ low: 0.6452, high: 0.8319 })
  })

  it('tells two rates apart only when the samples support it', () => {
    const of = (successes: number, total: number) => ({ successes, total })
    // Eight runs each: 75% is not told apart from 63%, 88% or 100%, and is from 25%.
    expect(apart(of(6, 8), of(5, 8))).toBe(false)
    expect(apart(of(6, 8), of(7, 8))).toBe(false)
    expect(apart(of(6, 8), of(8, 8))).toBe(false)
    expect(apart(of(6, 8), of(3, 8))).toBe(false)
    expect(apart(of(6, 8), of(2, 8))).toBe(true)
    expect(apart(of(2, 8), of(6, 8))).toBe(true)
    // Eighty runs each tell 75% from 60% and from 90%.
    expect(apart(of(60, 80), of(48, 80))).toBe(true)
    expect(apart(of(60, 80), of(72, 80))).toBe(true)
    expect(apart(of(6, 8), of(0, 0))).toBe(false)
  })

  it('says what a second sample of the same size would have to measure', () => {
    expect(resolution(6, 8)).toEqual({ below: 2, above: null })
    expect(resolution(8, 8)).toEqual({ below: 4, above: null })
    expect(resolution(4, 8)).toEqual({ below: 0, above: 8 })
    expect(resolution(60, 80)).toEqual({ below: 48, above: 70 })
    expect(resolution(1, 1)).toEqual({ below: null, above: null })
    expect(resolution(1, 2)).toEqual({ below: null, above: null })
  })

  it('says how far two briefs’ counts must differ before any are told apart', () => {
    expect(smallestGap(1)).toBeNull()
    expect(smallestGap(2)).toBe(2)
    expect(smallestGap(3)).toBe(3)
    expect(smallestGap(5)).toBe(3)
    expect(smallestGap(10)).toBe(4)
  })
})

describe('a scripted run of every brief, three times', () => {
  const every = () => runs.every as Evaluation

  it('ends lawful and meets its brief wherever the scripted answer does', () => {
    // The brief can be met lawfully: its requirements ask for nothing the vocabulary lacks.
    for (const brief of ALL_BRIEFS) {
      expect(record(every(), brief), brief).toMatchObject({
        lawful: true,
        meetsBrief: true,
        failedRequirements: [],
      })
    }
  })

  it('records a lawful screen that leaves out part of its brief', () => {
    // The second run of this brief plays a script of its own: the same screen with no download.
    expect(record(every(), 'dashboard-usage', 2)).toMatchObject({
      firstShotLawful: true,
      lawful: true,
      meetsBrief: false,
      failedRequirements: ['download'],
      ended: 'answered',
    })
    expect(record(every(), 'dashboard-usage', 3)).toMatchObject({ lawful: true, meetsBrief: true })
  })

  it('plays a run’s own script through the CLI runner as well', () => {
    const [first, second] = (runs.cliRuns as Evaluation).results.records
    expect(first).toMatchObject({ lawful: true, meetsBrief: true, failedRequirements: [] })
    expect(second).toMatchObject({
      lawful: true,
      meetsBrief: false,
      failedRequirements: ['download'],
    })
  })

  it('summarises each brief with the interval three runs support', () => {
    const dashboard = every().results.summary.briefs.find(
      ({ brief }) => brief === 'dashboard-usage',
    )
    expect(dashboard).toMatchObject({
      runs: 3,
      measured: 3,
      lawfulRate: 1,
      lawfulInterval: bounds(3, 3),
      meetsBriefRate: 0.6667,
      meetsBriefInterval: bounds(2, 3),
      lawfulAndMeetsBriefRate: 0.6667,
      lawfulAndMeetsBriefInterval: { low: 0.2077, high: 0.9385 },
      failedRequirements: { 'dashboard-usage/download': 1 },
    })
    const incidents = every().results.summary.briefs.find(({ brief }) => brief === 'list-incidents')
    expect(incidents).toMatchObject({ firstShotRate: 0, firstShotInterval: bounds(0, 3) })
  })

  it('summarises all of them with the interval twenty-four runs support', () => {
    expect(every().results.summary.overall).toMatchObject({
      runs: 24,
      measured: 24,
      firstShotRate: 0.875,
      firstShotInterval: bounds(21, 24),
      lawfulRate: 1,
      lawfulInterval: bounds(24, 24),
      meetsBriefRate: 0.9583,
      meetsBriefInterval: bounds(23, 24),
      lawfulAndMeetsBriefRate: 0.9583,
      lawfulAndMeetsBriefInterval: bounds(23, 24),
      failedRequirements: { 'dashboard-usage/download': 1 },
    })
  })

  it('records what each brief required, with a digest of how it was checked', () => {
    const { requirements } = every().results
    expect(requirements?.map(({ brief }) => brief)).toEqual(ALL_BRIEFS)
    for (const { brief, digest, requirements: listed } of requirements ?? []) {
      expect(digest, brief).toBe(REQUIRED.get(brief)?.digest)
      expect(listed, brief).toEqual(requirementsOf(brief).map(({ id, says }) => ({ id, says })))
    }
    // The checks themselves stay in the repository: a results file names no member.
    expect(JSON.stringify(requirements)).not.toContain('"component"')
  })

  it('reports each rate with its interval, and what the sample can tell apart', () => {
    const { readme } = every()
    expect(readme).toContain(
      '| 8 × 3 | 88% (69–96%) | 100% (86–100%) | 96% (80–99%) | 96% (80–99%) |',
    )
    expect(readme).toContain(
      '24 runs cannot tell this eval from a second one of the same size that measures:',
    )
    expect(readme).toContain('- first shot lawful: anything from 67% to 100% (88% here)')
    expect(readme).toContain('- lawful: anything from 83% to 100% (100% here)')
    expect(readme).toContain('- meets brief: anything from 79% to 100% (96% here)')
    expect(readme).toContain(
      '| dashboard-usage | 3 | 3 of 3 (44–100%) | 3 of 3 (44–100%) | 2 of 3 (21–94%) | 2 of 3 (21–94%) | `download` 1 |',
    )
    expect(readme).toContain(
      'With 3 runs a brief, two briefs are told apart only when their counts differ by 3 runs or more.',
    )
    expect(readme).toContain(
      "- `dashboard-usage/download`, 1 of 3 runs: A control downloads the period's usage as a file.",
    )
  })

  it('says how little two runs can tell apart', () => {
    // Two briefs, one run each: only 0% and 100% are told apart.
    const { readme } = runs.two as Evaluation
    expect(readme).toContain('| 2 of 8 × 1 | 50% (9–91%) | 100% (34–100%) |')
    expect(readme).toContain(
      '2 runs cannot tell this eval from a second one of the same size that measures:',
    )
    expect(readme).toContain('- first shot lawful: anything from 0% to 100% (50% here)')
    expect(readme).toContain('- lawful: anything from 50% to 100% (100% here)')
    expect(readme).toContain('With 1 run a brief, no two briefs can be told apart.')
  })

  it('says so when a sample cannot tell any two rates apart', () => {
    // One brief, one run.
    const { readme } = runs.tsx as Evaluation
    expect(readme).toContain('| 1 of 8 × 1 | 0% (0–79%) | 100% (21–100%) |')
    expect(readme).toContain('1 run cannot tell any two rates apart.')
  })
})

/* -------------------------------------------------------------------------- */
/* The schema and the report                                                  */
/* -------------------------------------------------------------------------- */

describe('the results schema', () => {
  it('is RESULTS_SHAPE, projected to JSON Schema', () => {
    const published = JSON.parse(readFileSync(resolve(ROOT, 'eval/results.schema.json'), 'utf8'))
    expect(published).toEqual({
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      ...jsonSchema(RESULTS_SHAPE),
    })
  })

  it('accepts every results file a run writes, complete or partial', () => {
    for (const evaluation of Object.values(runs)) {
      expect(validate(RESULTS_SHAPE, evaluation.results)).toEqual([])
    }
  })

  it('accepts the committed results files, whichever fields they were written with', () => {
    const committed = readResults(RESULTS) as { file: string; results: Results }[]
    expect(committed.length).toBeGreaterThan(0)
    for (const { file, results } of committed) {
      expect(validate(RESULTS_SHAPE, results), file).toEqual([])
    }
  })

  it('rejects a record with a field it does not describe', () => {
    const results = structuredClone((runs.two as Evaluation).results)
    Object.assign(results.records[0] as object, { mood: 'confident' })
    expect(validate(RESULTS_SHAPE, results)).toEqual([
      expect.stringContaining(
        '$.records[0].mood: `mood` is not in the schema — the fields here are `brief`, `run`, ',
      ),
    ])
  })
})

describe('the report', () => {
  /** Real results files, written from a scripted run's, into a fresh directory. */
  function directoryOf(name: string, files: Record<string, Partial<Results>>) {
    const directory = resolve(SCRATCH, name)
    mkdirSync(directory)
    const base = (runs.two as Evaluation).results
    for (const [file, changes] of Object.entries(files)) {
      writeFileSync(
        resolve(directory, file),
        JSON.stringify({
          ...base,
          fake: false,
          model: 'claude-sonnet-5-5',
          // The two briefs the scripted run chose were, here, the whole set.
          briefs: ['list-incidents', 'settings-workspace'],
          ...changes,
        }),
      )
    }
    return renderReport(readResults(directory), resolve(directory, 'README.md'))
  }

  it('shows a scripted run for what it is, and names no number from it', () => {
    const { readme } = runs.two as Evaluation
    expect(readme).toContain('## fake · spec (scripted model')
    expect(readme).toContain('No number is recorded')
  })

  it('lists each run’s first-shot miss in the validator’s words, under the table', () => {
    const { readme } = runs.two as Evaluation
    expect(readme).toContain('First-shot misses in ')
    expect(readme).toMatch(/- `list-incidents` #1: .*has no prop.*\(and 1 more\)/)
    expect(readme).not.toContain('`settings-workspace` #1:')
  })

  it('lists no misses for a results file written before they were kept', () => {
    const base = (runs.two as Evaluation).results
    const page = directoryOf('older', {
      '2026-01-01-claude-sonnet-5-5-spec.json': {
        at: '2026-01-01T09:00:00.000Z',
        records: base.records.map(({ misses: _kept, ...record }) => record) as typeof base.records,
      },
    })
    expect(page).not.toContain('First-shot misses')
  })

  it('names the latest full real run as the number, and lists runs latest first', () => {
    const page = directoryOf('real', {
      '2026-01-01-claude-sonnet-5-5-spec.json': { at: '2026-01-01T09:00:00.000Z' },
      '2026-02-01-claude-sonnet-5-5-spec.json': { at: '2026-02-01T09:00:00.000Z' },
    })
    expect(page).toMatch(
      /\*\*The number:\*\* `claude-sonnet-5-5`, spec mode, default effort, .* 50% lawful on the first/,
    )
    expect(page).toContain('(2026-02-01-claude-sonnet-5-5-spec.json)).')
    expect(page.indexOf('2026-02-01')).toBeLessThan(page.indexOf('2026-01-01'))
  })

  it('never takes the number from a smoke run or a partial file, though it lists both', () => {
    const page = directoryOf('smoke', {
      '2026-01-01-claude-sonnet-5-5-spec.json': { at: '2026-01-01T09:00:00.000Z' },
      '2026-02-01-claude-sonnet-5-5-spec.json': {
        at: '2026-02-01T09:00:00.000Z',
        briefs: [...ALL_BRIEFS],
      },
      '2026-03-01-claude-sonnet-5-5-spec.json': {
        at: '2026-03-01T09:00:00.000Z',
        partial: true,
        stopped: { reason: 'api', brief: 'settings-workspace', run: 1, message: '', tokens: 0 },
      },
    })
    expect(page).toContain('(2026-01-01-claude-sonnet-5-5-spec.json)).')
    expect(page.match(/\*\*The number:\*\*/g)).toHaveLength(1)
    expect(page).toContain(`| 2 of ${ALL_BRIEFS.length} × 1 |`)
    expect(page).toContain(
      '[2026-03-01-claude-sonnet-5-5-spec.json](2026-03-01-claude-sonnet-5-5-spec.json) (partial: the API failed)',
    )
  })

  it('names one number per model and mode, the most recent first', () => {
    const page = directoryOf('models', {
      '2026-01-01-claude-opus-5-5-tsx.json': {
        at: '2026-01-01T09:00:00.000Z',
        model: 'claude-opus-5-5',
        mode: 'tsx',
      },
      '2026-02-01-claude-sonnet-5-5-spec.json': { at: '2026-02-01T09:00:00.000Z' },
      '2026-03-01-claude-sonnet-5-5-spec.json': { at: '2026-03-01T09:00:00.000Z' },
    })
    const numbers = page.match(/\*\*The number:\*\* `[^`]+`, \w+ mode/g)
    expect(numbers).toEqual([
      '**The number:** `claude-sonnet-5-5`, spec mode',
      '**The number:** `claude-opus-5-5`, tsx mode',
    ])
    expect(page).toContain('(2026-03-01-claude-sonnet-5-5-spec.json)).')
    expect(page).not.toContain('(2026-02-01-claude-sonnet-5-5-spec.json)).')
  })

  it('names one number per runner, each saying how the model was reached', () => {
    const page = directoryOf('runners', {
      '2026-02-01-claude-sonnet-5-5-spec.json': { at: '2026-02-01T09:00:00.000Z' },
      '2026-03-01-claude-sonnet-5-5-spec-cli.json': {
        at: '2026-03-01T09:00:00.000Z',
        runner: 'cli',
        cliVersion: '2.1.299',
      },
    })
    expect(page.match(/\*\*The number:\*\*/g)).toHaveLength(2)
    expect(page).toMatch(
      /\*\*The number:\*\* `claude-sonnet-5-5`, spec mode, the CLI’s default effort, through Claude Code 2\.1\.299, /,
    )
    expect(page).toMatch(
      /\*\*The number:\*\* `claude-sonnet-5-5`, spec mode, default effort, through the Messages API, /,
    )
    expect(page).toContain('| CLI 2.1.299 |')
  })

  it('prints each rate of the number with its interval, and how many runs it is over', () => {
    const page = directoryOf('intervals', {
      '2026-01-01-claude-sonnet-5-5-spec.json': { at: '2026-01-01T09:00:00.000Z' },
    })
    expect(page).toContain(
      '50% lawful on the first `validate` call (9% to 91%), 100% lawful at the end (34% to 100%), ' +
        '100% meeting their brief (34% to 100%), 100% lawful and meeting their brief (34% to 100%), ',
    )
    expect(page).toContain('Each range is the 95% interval its 2 runs support.')
    expect(page).not.toContain('were not judged against their briefs')
  })

  /** A scripted run's results with other rates over forty runs, as a results file's changes. */
  function fortyRuns(at: string, rates: Partial<Summary>): Partial<Results> {
    const base = (runs.two as Evaluation).results
    return {
      at,
      summary: {
        ...base.summary,
        overall: { ...base.summary.overall, runs: 40, measured: 40, ...rates },
      },
    }
  }

  it('compares a run with the one before it, and says which rates the samples tell apart', () => {
    const page = directoryOf('compared', {
      '2026-01-01-claude-sonnet-5-5-spec.json': fortyRuns('2026-01-01T09:00:00.000Z', {
        firstShotRate: 0.5,
        lawfulRate: 0.9,
        meetsBriefRate: 0.6,
        lawfulAndMeetsBriefRate: 0.55,
      }),
      '2026-02-01-claude-sonnet-5-5-spec.json': fortyRuns('2026-02-01T09:00:00.000Z', {
        firstShotRate: 0.9,
        lawfulRate: 1,
        meetsBriefRate: 0.75,
        lawfulAndMeetsBriefRate: 0.75,
      }),
      // Another effort is another condition, so it is not the run before either.
      '2026-03-01-claude-sonnet-5-5-spec.json': {
        ...fortyRuns('2026-03-01T09:00:00.000Z', {}),
        settings: { ...(runs.two as Evaluation).results.settings, effort: 'high' },
      },
    })
    expect(page).toContain(
      'Against the run before it ([2026-01-01-claude-sonnet-5-5-spec.json](2026-01-01-claude-sonnet-5-5-spec.json)), with 40 runs and 40 runs:',
    )
    expect(page).toContain('- first shot lawful: 90% against 50%, told apart')
    expect(page).toContain('- lawful: 100% against 90%, not told apart')
    expect(page).toContain('- meets brief: 75% against 60%, not told apart')
    expect(page.match(/Against the run before it/g)).toHaveLength(1)
  })

  it('does not compare rates judged by different requirements', () => {
    const base = (runs.two as Evaluation).results
    const [first, ...rest] = base.requirements ?? []
    const page = directoryOf('rejudged', {
      '2026-01-01-claude-sonnet-5-5-spec.json': {
        at: '2026-01-01T09:00:00.000Z',
        requirements: [
          { ...(first as NonNullable<typeof first>), digest: 'an-older-one' },
          ...rest,
        ],
      },
      '2026-02-01-claude-sonnet-5-5-spec.json': { at: '2026-02-01T09:00:00.000Z' },
    })
    expect(page).toContain('- first shot lawful: 50% against 50%, not told apart')
    expect(page).toContain(
      '- meets brief: not compared, because the two were judged by different requirements',
    )
    expect(page).toContain(
      '- lawful and meets brief: not compared, because the two were judged by different requirements',
    )
  })

  it('renders a results file written before requirements were judged, and says it was not', () => {
    const base = (runs.two as Evaluation).results
    const older = ({
      measured: _measured,
      firstShotInterval: _firstShot,
      lawfulInterval: _lawful,
      meetsBriefRate: _meets,
      meetsBriefInterval: _meetsInterval,
      lawfulAndMeetsBriefRate: _both,
      lawfulAndMeetsBriefInterval: _bothInterval,
      failedRequirements: _failed,
      ...summary
    }: Summary & { brief?: string }) => summary
    const page = directoryOf('unjudged', {
      '2026-01-01-claude-sonnet-5-5-spec.json': {
        at: '2026-01-01T09:00:00.000Z',
        requirements: undefined,
        summary: {
          overall: older(base.summary.overall),
          briefs: base.summary.briefs.map(older) as typeof base.summary.briefs,
        },
        records: base.records.map(
          ({ meetsBrief: _met, failedRequirements: _unmet, ...record }) => record,
        ),
      },
    })
    expect(page).toContain('Its screens were not judged against their briefs.')
    // The intervals come from the counts, so a file that recorded none still shows them.
    expect(page).toContain('| 2 × 1 | 50% (9–91%) | 100% (34–100%) | — | — |')
    expect(page).toContain('| list-incidents | 1 | 0 of 1 (0–79%) | 1 of 1 (21–100%) | — | — | — |')
  })

  it('is the committed eval/README.md, rendered from eval/results', () => {
    const readme = resolve(ROOT, 'eval/README.md')
    expect(readFileSync(readme, 'utf8')).toBe(renderReport(readResults(RESULTS), readme))
  })
})
