import {
  arr,
  bool,
  nullable,
  num,
  obj,
  rec,
  str,
  union,
  type Shape,
} from '@polymorph/registry/shape'

/**
 * A results file of the agent eval (`eval/results/*.json`), described once.
 *
 * The same object serves two jobs, as the registry's own schema does.
 * `eval/run.mjs` validates every results file against it before writing one,
 * and `eval/results.schema.json` is its projection to JSON Schema, which
 * `eval.test.ts` holds equal to `jsonSchema(RESULTS_SHAPE)`. A reader who
 * checks a results file with their own validator and the harness that wrote
 * it reach the same verdict.
 *
 * Every field is a measurement or the setting that produced it. The documents
 * the agent handed back are not here: they live in the file `outputs` names,
 * beside this one, so a results file stays small enough to read and compare.
 *
 * A results file is one of three shapes. The `spec` and `tsx` modes run a
 * loop of tool calls, and record what the loop did. The `runtime` mode sends
 * one request with no tools, so it records no `validate` call and no first
 * shot apart from the answer, and records the card it sent and the time to
 * the first token instead. The `project` mode starts a harness in an app the
 * tools set up and judges the project it leaves, so it records what the
 * project holds at the end and what the harness called on the way.
 *
 * A count a harness does not report is recorded as null, never as zero:
 * Codex reports its tokens once, when it finishes on its own, and reports no
 * request.
 */

export const RESULTS_ID = 'polymorph-eval/1'

/**
 * How a run ended. Only `answered` means the model stopped on its own.
 * `harness` is the harness's own failure, not the model's, and is left out of
 * every rate and mean.
 */
export const ENDINGS = ['answered', 'cap', 'turns', 'max_tokens', 'refusal', 'harness'] as const

/** The mode that sends the run-time card and a brief in one request, with no tools. */
export const RUNTIME_MODE = 'runtime'

/**
 * How a run of the `runtime` mode ended. It makes one request and has no
 * loop, so it cannot reach the iteration cap or the request limit.
 */
export const RUNTIME_ENDINGS = ['answered', 'max_tokens', 'refusal', 'harness'] as const

/**
 * What the `runtime` mode sends as `thinking.type`. `adaptive` lets the model
 * think; `disabled` and `between_tools` stop it thinking before its answer,
 * and which of the two a model accepts is the model's.
 */
export const THINKING = ['adaptive', 'disabled', 'between_tools'] as const

/**
 * The effort levels `--effort` accepts. `default` sends none, so the model's
 * own default applies, or the harness's own for the `cli` and `codex` runners.
 */
export const EFFORTS = ['default', 'low', 'medium', 'high', 'xhigh', 'max'] as const

/** How the model was reached: the Messages API, the Claude Code CLI, or the Codex CLI. */
export const RUNNERS = ['api', 'cli', 'codex'] as const

/** The mode that starts a harness in an app the tools set up, and judges the project it leaves. */
export const PROJECT_MODE = 'project'

/** The runners that start a harness, which the `project` mode needs. */
export const HARNESS_RUNNERS = ['cli', 'codex'] as const

/**
 * How a run of the `project` mode ended. `answered`: the harness finished on
 * its own. `turns` and `time`: the run's budget stopped it. `harness`: the
 * eval itself failed, so the run measures nothing about the model. The
 * project is judged however the harness ended, except after `harness`.
 */
export const PROJECT_ENDINGS = ['answered', 'turns', 'time', 'harness'] as const

/** Why an eval stopped before every run finished. */
export const STOPS = ['api', 'cli', 'usage-limit', 'tokens-per-run', 'tokens-total'] as const

/** The four tools every run is offered, in the order the request lists them. */
export const TOOL_NAMES = ['get_system_card', 'search_components', 'get_component', 'validate']

const count = (description: string): Shape => num({ integer: true, description })

/** A rate's 95% interval (`eval/spread.mjs`); null where the rate is null. */
const interval = (rate: string): Shape =>
  nullable(
    obj(
      { low: num(), high: num() },
      {
        description:
          `The 95% Wilson interval of \`${rate}\`, from 0 to 1: the rates the measured runs ` +
          'are consistent with.',
      },
    ),
  )

const SUMMARY_FIELDS = {
  runs: count('How many runs this summary covers, harness faults included.'),
  measured: count(
    'How many of them the rates and means are over: every run that did not end in a harness ' +
      'fault. The size of the sample each interval is computed from.',
  ),
  endings: obj(
    Object.fromEntries(ENDINGS.map((ending) => [ending, count(`Runs that ended \`${ending}\`.`)])),
    {
      description:
        'How the runs ended. A `harness` run is left out of every figure below except the ' +
        'retry totals; a `refusal` or `max_tokens` run is counted, and never as lawful.',
    },
  ),
  firstShotRate: nullable(
    num({
      description:
        'The share of runs, from 0 to 1, whose first `validate` call came back lawful. Null ' +
        'when every run was a harness fault.',
    }),
  ),
  firstShotInterval: interval('firstShotRate'),
  lawfulRate: nullable(
    num({
      description:
        'The share of runs, from 0 to 1, whose final document is lawful. Null when every run ' +
        'was a harness fault.',
    }),
  ),
  lawfulInterval: interval('lawfulRate'),
  meetsBriefRate: nullable(
    num({
      description:
        'The share of runs, from 0 to 1, whose final document meets every requirement of its ' +
        'brief. Null when every run was a harness fault.',
    }),
  ),
  meetsBriefInterval: interval('meetsBriefRate'),
  lawfulAndMeetsBriefRate: nullable(
    num({
      description:
        'The share of runs, from 0 to 1, whose final document is lawful and meets its brief: ' +
        'the screens that may be written and do what was asked. Null when every run was a ' +
        'harness fault.',
    }),
  ),
  lawfulAndMeetsBriefInterval: interval('lawfulAndMeetsBriefRate'),
  failedRequirements: rec(count('How many runs did not meet it.'), {
    description:
      'Every requirement a measured run did not meet, as `<brief>/<id>`, counted over the runs.',
  }),
  meanIterations: nullable(
    num({
      description:
        'Over the runs that ended lawful after a lawful `validate` call, the mean number of ' +
        '`validate` calls it took. Null when there is no such run.',
    }),
  ),
  lawfulWithoutValidate: count(
    'Runs that ended lawful although no `validate` call came back lawful: the model answered ' +
      'without validating what it handed back. Never part of `meanIterations`.',
  ),
  meanInputTokens: nullable(
    count(
      'Mean input tokens per run, cached and uncached together, over the runs that report ' +
        'them. Null when none does.',
    ),
  ),
  meanOutputTokens: nullable(
    count('Mean output tokens per run, thinking included, over the runs that report them.'),
  ),
  meanWallMs: nullable(
    count('Mean wall-clock time per run, in milliseconds, retry waits left out.'),
  ),
  retries: count('Requests sent again after a transient failure, summed over every run.'),
  backoffMs: count('Time spent waiting to send a request again, summed over every run.'),
  discardedTokens: count(
    'Tokens of attempts that broke off and were retried, summed over every run.',
  ),
} satisfies Record<string, Shape>

/**
 * The summary fields a results file lacks when it was written before the eval
 * judged requirements and recorded intervals.
 */
const SUMMARY_ADDED = [
  'measured',
  'firstShotInterval',
  'lawfulInterval',
  'meetsBriefRate',
  'meetsBriefInterval',
  'lawfulAndMeetsBriefRate',
  'lawfulAndMeetsBriefInterval',
  'failedRequirements',
]

const RECORD = obj(
  {
    brief: str({ description: 'The brief’s file name in `eval/briefs/`, without `.md`.' }),
    run: count('Which run of this brief, from 1.'),
    firstShotLawful: bool({
      description:
        'Whether the first `validate` call reported no faults, no violations and nothing fatal. ' +
        'False when the run never called `validate`.',
    }),
    iterations: nullable(
      count(
        '`validate` calls up to and including the first lawful one. Null when no call came back ' +
          'lawful, whether or not the final document is lawful.',
      ),
    ),
    lawful: bool({
      description:
        'Whether the final document passes the same check `validate` runs. The harness checks it ' +
        'itself, so a run that answers without validating is still judged. Always false for a ' +
        'run that ended in `refusal`, `max_tokens` or `harness`.',
    }),
    meetsBrief: bool({
      description:
        'Whether the final document meets every requirement of its brief ' +
        '(`eval/requirements/<brief>.json`). The harness checks the document itself. Always ' +
        'false for a run that ended in `refusal`, `max_tokens` or `harness`. Absent in a ' +
        'results file written before requirements were judged.',
    }),
    failedRequirements: arr(str(), {
      description:
        'The requirements the final document does not meet, by id, in the brief’s order: every ' +
        'one when there is no document or it cannot be read. Empty for a run that ended ' +
        '`harness`, which is not judged.',
    }),
    ended: str({
      enum: ENDINGS,
      description:
        '`answered`: the model stopped. `cap`: the iteration cap was reached with the last ' +
        '`validate` call unlawful. `turns`: the request limit was reached; Codex reports no ' +
        'request, so for the `codex` runner it is counted in tool calls. `max_tokens`: a ' +
        'response was cut off. `refusal`: the model declined. `harness`: the harness itself ' +
        'failed, so the run measures nothing about the model.',
    }),
    harnessFault: nullable(
      str({ description: 'What failed when the run ended `harness`; null for every other run.' }),
    ),
    inputTokens: nullable(
      count(
        'Every input token the model read across the run: uncached, cache writes and cache ' +
          'reads. Null when the harness did not report it: Codex reports its tokens only when it ' +
          'finishes on its own.',
      ),
    ),
    cacheReadTokens: nullable(count('The part of `inputTokens` read from the prompt cache.')),
    cacheWriteTokens: nullable(
      count(
        'The part of `inputTokens` written to the prompt cache. Null where the harness reports ' +
          'no such part.',
      ),
    ),
    outputTokens: nullable(count('Every output token across the run, thinking included.')),
    discardedTokens: count(
      'Tokens of attempts that broke off mid-stream and were sent again, as far as their usage ' +
        'was reported. Billed, but in neither `inputTokens` nor `outputTokens`.',
    ),
    wallMs: count(
      'Wall-clock time from the first request to the end of the run, tools included and retry ' +
        'waits (`backoffMs`) left out.',
    ),
    retries: count('Requests sent again after a transient failure.'),
    backoffMs: count('Time spent waiting before those requests, in milliseconds.'),
    turns: nullable(
      count(
        'Messages API requests the run made, retries not counted, through the `api` or the ' +
          '`cli` runner. Null for the `codex` runner, because Codex reports no request.',
      ),
    ),
    toolCalls: obj(
      Object.fromEntries(TOOL_NAMES.map((name) => [name, count(`Calls to \`${name}\`.`)])),
      { description: 'How often the model called each tool.' },
    ),
    violationsSeen: rec(count('How many times it was reported.'), {
      description:
        'Everything the `validate` calls reported, counted. Red-rule violations by rule name; ' +
        'spec faults as `spec: <message>` with names and values elided, so the same mistake ' +
        'counts once per kind; `fatal` for a document that could not be read; `contract` for a ' +
        'module that imports nothing from the vocabulary.',
    }),
    misses: arr(
      obj({
        call: count('Which `validate` call this was, from 1.'),
        fatal: nullable(str({ description: 'What made the document unreadable, or null.' })),
        faults: arr(str(), { description: 'Every spec fault, in the validator’s words.' }),
        violations: arr(str(), { description: 'Every red-rule violation, as `rule: message`.' }),
        contract: arr(str(), { description: 'Every contract message.' }),
      }),
      {
        description:
          'Each `validate` call that came back unlawful, in the words the model was shown, so a ' +
          'miss can be acted on where `violationsSeen` only counts it. Absent in a results file ' +
          'written before this field was kept.',
      },
    ),
  },
  { optional: ['misses', 'meetsBrief', 'failedRequirements'] },
)

/* -------------------------------------------------------------------------- */
/* The fields both shapes share                                               */
/* -------------------------------------------------------------------------- */

const SCHEMA = str({
  enum: [RESULTS_ID],
  description: 'Identifies the shape. Bumped only by a breaking change.',
})

const AT = str({
  pattern: '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d+)?Z$',
  description: 'When the run started, as an ISO timestamp in UTC.',
})

const MODEL = str({ description: 'The model id, or `fake` for the scripted model.' })

const CLI_VERSION_TEXT =
  'The version of the harness the runner ran, as its `--version` prints it: Claude Code for ' +
  'the `cli` runner, Codex for the `codex` runner; `scripted` for their stand-ins.'

const CLI_VERSION = nullable(str({ description: `${CLI_VERSION_TEXT} Null for the API runner.` }))

const FAKE = bool({ description: 'True for the scripted model. A fake run measures the harness.' })

const PARTIAL = bool({
  description:
    'True for a checkpoint, written after every run while the eval is under way, and for ' +
    'an eval that stopped before every run finished. A partial file is never the number.',
})

const STOPPED = nullable(
  obj(
    {
      reason: str({
        enum: STOPS,
        description:
          '`api`: the Messages API refused, or kept failing. `cli`: the harness the runner ' +
          'started (Claude Code or Codex) failed, or reported an error, such as one from the ' +
          'API. `usage-limit`: the harness reported a usage or rate limit on the account it is ' +
          'signed in to. `tokens-per-run`, `tokens-total`: a token ceiling was reached.',
      }),
      brief: str({ description: 'The brief whose run was under way.' }),
      run: count('Which run of that brief.'),
      message: str({ description: 'What stopped it.' }),
      tokens: count(
        'Tokens the unfinished run had spent, discarded attempts included. It has no record.',
      ),
    },
    { description: 'Why the eval stopped early; null when it did not.' },
  ),
)

const POLYMORPH = obj({
  version: str({ description: 'The registry’s version: the release that was measured.' }),
  commit: nullable(str({ description: 'The commit the eval ran on, when there is one.' })),
})

const BRIEFS = arr(str(), {
  description:
    'Every brief in `eval/briefs/` when the eval ran, by name. Only a run over all of them ' +
    'can be the number; one over fewer is a smoke run.',
})

const EFFORT = str({
  enum: EFFORTS,
  description:
    'The effort sent as `output_config.effort`, passed to Claude Code as `--effort`, or to ' +
    'Codex as `model_reasoning_effort`; `default` sends none, so the model’s own default ' +
    'applies, or the harness’s own.',
})

const CEILINGS = {
  maxTokensPerRun: count(
    'The token ceiling per run, counted as `inputTokens`, `outputTokens` and ' +
      '`discardedTokens` together. No request starts once a run has reached it.',
  ),
  maxTokensTotal: count('The same ceiling over the whole eval.'),
}

const OUTPUTS = str({
  description: 'The file beside this one that holds every run’s final document.',
})

const REQUIREMENTS = arr(
  obj({
    brief: str({ description: 'The brief these requirements belong to.' }),
    digest: str({
      description:
        'A digest of the requirements as they were checked. Two results files whose digests ' +
        'differ for a brief judged it by different requirements, so their `meetsBrief` ' +
        'rates do not compare.',
    }),
    requirements: arr(
      obj({
        id: str({ description: 'The id a record’s `failedRequirements` names.' }),
        says: str({ description: 'What the requirement asks for, in words.' }),
      }),
    ),
  }),
  {
    description:
      'What each chosen brief required when the eval ran, in brief order. Absent in a ' +
      'results file written before requirements were judged.',
  },
)

/* -------------------------------------------------------------------------- */
/* The `spec` and `tsx` modes                                                 */
/* -------------------------------------------------------------------------- */

const LOOP_RESULTS: Shape = obj(
  {
    schema: SCHEMA,
    at: AT,
    model: MODEL,
    mode: str({
      enum: ['spec', 'tsx'],
      description: 'What the agent hands back: a `polymorph-screen/1` document or a TSX module.',
    }),
    runner: str({
      enum: RUNNERS,
      description:
        '`api`: the harness sent each request to the Messages API. `cli`: each run went ' +
        'through `claude -p`, and `codex`: through `codex exec`, with the same tools served ' +
        'over MCP. All three are measured the same way, apart from what Codex does not report.',
    }),
    cliVersion: CLI_VERSION,
    fake: FAKE,
    partial: PARTIAL,
    stopped: STOPPED,
    polymorph: POLYMORPH,
    briefs: BRIEFS,
    settings: obj({
      briefs: str({ description: 'The glob the briefs were chosen by.' }),
      runs: count('Runs per brief.'),
      maxIterations: count('The iteration cap: `validate` calls before a run is stopped.'),
      maxTurns: count('The request limit per run.'),
      maxTokens: count('`max_tokens` on every request.'),
      effort: EFFORT,
      ...CEILINGS,
    }),
    outputs: OUTPUTS,
    requirements: REQUIREMENTS,
    summary: obj({
      overall: obj(SUMMARY_FIELDS, { optional: SUMMARY_ADDED }),
      briefs: arr(obj({ brief: str(), ...SUMMARY_FIELDS }, { optional: SUMMARY_ADDED }), {
        description: 'One summary per brief chosen, in brief order, including briefs not yet run.',
      }),
    }),
    records: arr(RECORD, { description: 'One record per finished run, by brief and then by run.' }),
  },
  {
    optional: ['requirements'],
    description:
      'One run of the agent eval: per-run measurements and their summary, per brief and overall.',
  },
)

/* -------------------------------------------------------------------------- */
/* The `runtime` mode                                                         */
/* -------------------------------------------------------------------------- */

/** A time's fastest and slowest run, in milliseconds; null where no run measured it. */
const timeRange = (field: string): Shape =>
  nullable(
    obj(
      { low: count('The fastest run.'), high: count('The slowest run.') },
      {
        description: `The fastest and the slowest of the measured runs’ \`${field}\`, in milliseconds.`,
      },
    ),
  )

const RUNTIME_SUMMARY_FIELDS: Record<string, Shape> = {
  runs: SUMMARY_FIELDS.runs,
  measured: SUMMARY_FIELDS.measured,
  endings: obj(
    Object.fromEntries(
      RUNTIME_ENDINGS.map((ending) => [ending, count(`Runs that ended \`${ending}\`.`)]),
    ),
    {
      description:
        'How the runs ended. A `harness` run is left out of every figure below except the ' +
        'retry totals; a `refusal` or `max_tokens` run is counted, and never as lawful.',
    },
  ),
  lawfulRate: nullable(
    num({
      description:
        'The share of runs, from 0 to 1, whose answer holds a whole document that ' +
        '`checkScreen` passes. With one request and no tools, this is the first shot as well. ' +
        'Null when every run was a harness fault.',
    }),
  ),
  lawfulInterval: interval('lawfulRate'),
  meetsBriefRate: SUMMARY_FIELDS.meetsBriefRate,
  meetsBriefInterval: interval('meetsBriefRate'),
  lawfulAndMeetsBriefRate: SUMMARY_FIELDS.lawfulAndMeetsBriefRate,
  lawfulAndMeetsBriefInterval: interval('lawfulAndMeetsBriefRate'),
  failedRequirements: SUMMARY_FIELDS.failedRequirements,
  unreadable: count(
    'Runs that answered on their own with no whole document in the answer: none at all, or one ' +
      'cut short. Counted as neither lawful nor meeting their brief.',
  ),
  meanInputTokens: nullable(count('Mean input tokens per run: uncached, cache writes and reads.')),
  meanUncachedInputTokens: nullable(
    count('Mean input tokens per run that the cache did not hold.'),
  ),
  meanCacheWriteTokens: nullable(count('Mean input tokens per run written to the prompt cache.')),
  meanCacheReadTokens: nullable(count('Mean input tokens per run read from the prompt cache.')),
  meanOutputTokens: nullable(count('Mean output tokens per run, thinking included.')),
  meanFirstTokenMs: nullable(
    count(
      'Mean time to the first text of the answer, in milliseconds, over the measured runs that ' +
        'have one. Null when none has: the `cli` and `codex` runners measure none.',
    ),
  ),
  firstTokenRangeMs: timeRange('firstTokenMs'),
  meanWallMs: SUMMARY_FIELDS.meanWallMs,
  wallRangeMs: timeRange('wallMs'),
  retries: SUMMARY_FIELDS.retries,
  backoffMs: SUMMARY_FIELDS.backoffMs,
  discardedTokens: SUMMARY_FIELDS.discardedTokens,
}

const RUNTIME_RECORD = obj({
  brief: str({ description: 'The brief’s file name in `eval/briefs/`, without `.md`.' }),
  run: count('Which run of this brief, from 1.'),
  lawful: bool({
    description:
      'Whether the answer holds a whole document and `checkScreen` (`@polymorph/screen`) passes ' +
      'it with the card’s framework and members. Always false for a run that ended in ' +
      '`refusal`, `max_tokens` or `harness`.',
  }),
  meetsBrief: bool({
    description:
      'Whether the document meets every requirement of its brief ' +
      '(`eval/requirements/<brief>.json`), read as the `spec` mode reads one. Always false for ' +
      'a run that ended in `refusal`, `max_tokens` or `harness`.',
  }),
  failedRequirements: arr(str(), {
    description:
      'The requirements the document does not meet, by id, in the brief’s order: every one ' +
      'when the answer holds no whole document. Empty for a run that ended in `refusal`, ' +
      '`max_tokens` or `harness`, which is not judged.',
  }),
  ended: str({
    enum: RUNTIME_ENDINGS,
    description:
      '`answered`: the model stopped. `max_tokens`: the response was cut off. `refusal`: the ' +
      'model declined. `harness`: the harness itself failed, so the run measures nothing about ' +
      'the model.',
  }),
  harnessFault: nullable(
    str({ description: 'What failed when the run ended `harness`; null for every other run.' }),
  ),
  fatal: nullable(
    str({
      description:
        'Why the answer holds no document `checkScreen` can read: there is none, or it is cut ' +
        'short. Null when the document is whole, and for a run that was not judged.',
    }),
  ),
  faults: arr(str(), {
    description: 'Every fault `checkScreen` reported, as `path: message`, in its words.',
  }),
  inputTokens: nullable(
    count(
      'Every input token the request read: uncached, cache writes and cache reads together. ' +
        'Null when the harness did not report it.',
    ),
  ),
  uncachedInputTokens: nullable(
    count(
      'The part of `inputTokens` the API reported as `input_tokens`; for Codex, its input less ' +
        'what it reported as cached.',
    ),
  ),
  cacheWriteTokens: nullable(
    count(
      'The part of `inputTokens` written to the prompt cache (`cache_creation_input_tokens`). ' +
        'Null where the harness reports no such part.',
    ),
  ),
  cacheReadTokens: nullable(
    count('The part of `inputTokens` read from the prompt cache (`cache_read_input_tokens`).'),
  ),
  outputTokens: nullable(count('Every output token of the answer, thinking included.')),
  discardedTokens: count(
    'Tokens of attempts that broke off mid-stream and were sent again, as far as their usage ' +
      'was reported. Billed, but in neither `inputTokens` nor `outputTokens`.',
  ),
  firstTokenMs: nullable(
    count(
      'Milliseconds from sending the request that was answered to the first text of its ' +
        'answer. Thinking is not text, so time spent thinking is inside it. Null when the answer ' +
        'has no text, and for the `cli` and `codex` runners, which do not report when they send a ' +
        'request.',
    ),
  ),
  wallMs: count(
    'Milliseconds from the first request to the end of the answer, retry waits (`backoffMs`) ' +
      'left out; for the `cli` and `codex` runners, from the harness’s start-up report.',
  ),
  retries: count('Requests sent again after a transient failure.'),
  backoffMs: count('Time spent waiting before those requests, in milliseconds.'),
})

const RUNTIME_RESULTS: Shape = obj(
  {
    schema: SCHEMA,
    at: AT,
    model: MODEL,
    mode: str({
      enum: [RUNTIME_MODE],
      description:
        'The run-time lane: one request with no tools, the run-time card as the system prompt ' +
        'and the brief as the message, answered with a `polymorph-screen/1` document.',
    }),
    runner: str({
      enum: RUNNERS,
      description:
        '`api`: the harness sent the request to the Messages API. `cli`: each run went through ' +
        '`claude -p` with no tool and no MCP server, stopped after its first response. `codex`: ' +
        'each run went through `codex exec` with no MCP server and its own tools turned off.',
    }),
    cliVersion: CLI_VERSION,
    fake: FAKE,
    partial: PARTIAL,
    stopped: STOPPED,
    polymorph: POLYMORPH,
    briefs: BRIEFS,
    settings: obj({
      briefs: str({ description: 'The glob the briefs were chosen by.' }),
      runs: count('Runs per brief.'),
      maxTokens: count('`max_tokens` on the request.'),
      effort: EFFORT,
      thinking: nullable(
        str({
          enum: THINKING,
          description:
            'What the API runner sent as `thinking.type`. Null for the `cli` and `codex` ' +
            'runners, whose harness chooses its own.',
        }),
      ),
      ...CEILINGS,
    }),
    card: obj(
      {
        framework: str({ description: 'The framework the card and the check were for.' }),
        chosen: str({
          description:
            'How the members were chosen: `default` for every member the framework draws, a ' +
            'subset’s name from `eval/members/`, or `list` for names given to `--members`.',
        }),
        members: arr(str(), {
          description:
            'Every member and exception primitive the card lists and the check allows, by name.',
        }),
        characters: count('The length of the card, the whole system prompt, in characters.'),
      },
      {
        description:
          'The run-time card the system prompt held: `runtimeCard` from `@polymorph/screen`, ' +
          'with the output contract at its end.',
      },
    ),
    outputs: OUTPUTS,
    requirements: REQUIREMENTS,
    summary: obj({
      overall: obj(RUNTIME_SUMMARY_FIELDS),
      briefs: arr(obj({ brief: str(), ...RUNTIME_SUMMARY_FIELDS }), {
        description: 'One summary per brief chosen, in brief order, including briefs not yet run.',
      }),
    }),
    records: arr(RUNTIME_RECORD, {
      description: 'One record per finished run, by brief and then by run.',
    }),
  },
  {
    description:
      'One run of the agent eval’s run-time lane: per-run measurements and their summary, per ' +
      'brief and overall.',
  },
)

/* -------------------------------------------------------------------------- */
/* The `project` mode                                                         */
/* -------------------------------------------------------------------------- */

/** A rate of the `project` mode, its interval, and how many runs it is over. */
const projectRate = (name: string, rate: string, measured: string) => ({
  [`${name}Rate`]: nullable(
    num({
      description: `The share of runs, from 0 to 1, ${rate}. Null when no run was judged for it.`,
    }),
  ),
  [`${name}Interval`]: interval(`${name}Rate`),
  [`${name}Measured`]: count(`How many runs \`${name}Rate\` is over: ${measured}.`),
})

const PROJECT_SUMMARY_FIELDS: Record<string, Shape> = {
  runs: SUMMARY_FIELDS.runs,
  measured: SUMMARY_FIELDS.measured,
  endings: obj(
    Object.fromEntries(
      PROJECT_ENDINGS.map((ending) => [ending, count(`Runs that ended \`${ending}\`.`)]),
    ),
    {
      description:
        'How the runs ended. A `harness` run is left out of every figure below; a run its ' +
        'budget stopped is judged on the project it left.',
    },
  ),
  ...projectRate('lawful', 'whose project ends lawful', 'every measured run'),
  ...projectRate(
    'builds',
    'whose project typechecks and builds',
    'the measured runs whose project was installed, so its typecheck and build ran',
  ),
  ...projectRate(
    'meetsBrief',
    'whose screen meets every requirement of its brief',
    'the measured runs whose screen could be read: a spec, a React module, or no screen at all',
  ),
  ...projectRate(
    'allThree',
    'whose project ends lawful, builds and has a screen that meets its brief',
    'the measured runs judged for all three',
  ),
  failedRequirements: SUMMARY_FIELDS.failedRequirements,
  meanInputTokens: SUMMARY_FIELDS.meanInputTokens,
  meanOutputTokens: SUMMARY_FIELDS.meanOutputTokens,
  meanWallMs: SUMMARY_FIELDS.meanWallMs,
  mcpCalls: rec(count('Calls to it, summed over the runs.'), {
    description: 'Every MCP tool the harnesses called, by tool name, summed over the runs.',
  }),
  verbs: rec(count('Shell commands that ran it, summed over the runs.'), {
    description: 'Every `polymorph` verb the harnesses ran in a shell command, summed.',
  }),
  shellCommands: count('Shell commands the harnesses ran, summed over the runs.'),
  skills: rec(count('Runs that loaded it.'), {
    description: 'Every skill a harness loaded, by name, with the runs that loaded it.',
  }),
  denied: count('Tool calls the harnesses refused, summed over the runs.'),
  retries: SUMMARY_FIELDS.retries,
}

const PROJECT_RECORD = obj({
  brief: str({ description: 'The brief’s file name in `eval/briefs/`, without `.md`.' }),
  run: count('Which run of this brief, from 1.'),
  lawful: bool({
    description:
      'Whether the project ends lawful: `polymorph check` reads every file and reports no ' +
      'violation, and every spec the harness wrote under `src/screens/` passes the spec check ' +
      '`validate` runs. False for a run that ended `harness`.',
  }),
  violations: arr(str(), {
    description:
      'What made the project unlawful, as `path: rule: message`, in the words of the check ' +
      'that reported it, at most twenty.',
  }),
  builds: nullable(
    bool({
      description:
        'Whether the app’s `typecheck` and `build` scripts both pass at the end. Null when the ' +
        'app was not installed, so neither ran.',
    }),
  ),
  buildFault: nullable(
    str({ description: 'The script that failed and the end of what it printed; null otherwise.' }),
  ),
  meetsBrief: nullable(
    bool({
      description:
        'Whether the screen the harness wrote meets every requirement of its brief ' +
        '(`eval/requirements/<brief>.json`). False when it wrote none. Null when it wrote one ' +
        'the requirements cannot read: a single-file component, or an Angular or Solid module.',
    }),
  ),
  failedRequirements: arr(str(), {
    description:
      'The requirements the screen does not meet, by id, in the brief’s order: every one when ' +
      'the harness wrote no screen. Empty when the screen was not judged.',
  }),
  screen: nullable(
    obj(
      {
        kind: str({
          enum: ['spec', 'tsx', 'unread'],
          description:
            '`spec`: specs the harness wrote under `src/screens/`, judged as a spec. `tsx`: ' +
            'React modules it wrote under `src/`, judged together as one module. `unread`: ' +
            'files the requirements cannot read.',
        }),
        files: arr(str(), { description: 'The files judged, relative to the project.' }),
      },
      { description: 'What was judged against the brief; null when the harness wrote no screen.' },
    ),
  ),
  written: arr(str(), {
    description:
      'Every file the harness added or changed, relative to the project, outside ' +
      '`node_modules` and the build’s output.',
  }),
  ended: str({
    enum: PROJECT_ENDINGS,
    description:
      '`answered`: the harness finished on its own. `turns`: the turn budget stopped it ' +
      '(responses for Claude Code; tool calls for Codex, which reports no response). `time`: ' +
      'the time budget stopped it. `harness`: the eval failed, so the run measures nothing ' +
      'about the model.',
  }),
  harnessFault: nullable(
    str({ description: 'What failed when the run ended `harness`; null for every other run.' }),
  ),
  inputTokens: nullable(
    count(
      'Every input token the harness reported, cached and uncached. Null when it reported ' +
        'none: Codex reports its tokens only when it finishes on its own.',
    ),
  ),
  cacheReadTokens: nullable(count('The part of `inputTokens` read from the prompt cache.')),
  cacheWriteTokens: nullable(count('The part of `inputTokens` written to the prompt cache.')),
  outputTokens: nullable(count('Every output token the harness reported, thinking included.')),
  wallMs: count('Milliseconds from the harness’s start-up report to its end.'),
  turns: nullable(count('Responses the harness reported. Null for Codex, which reports none.')),
  mcpCalls: rec(count('Calls to it.'), {
    description: 'The MCP tools the harness called, by tool name.',
  }),
  verbs: rec(count('Shell commands that ran it.'), {
    description:
      'The `polymorph` verbs the harness ran in shell commands, by verb: through `npx`, ' +
      '`pnpm`, the bin by its path, or `polymorph` on the `PATH`.',
  }),
  shellCommands: count('Shell commands the harness ran.'),
  skills: arr(str(), {
    description:
      'The skills the harness loaded, by name: a Claude Code `Skill` call, or a `SKILL.md` ' +
      'the harness read.',
  }),
  denied: count(
    'Tool calls the harness refused: a permission Claude Code denied, a command Codex ' +
      'declined, or an MCP call it denied.',
  ),
  retries: count('Requests the harness reported sending again after a transient failure.'),
})

const PROJECT_RESULTS: Shape = obj(
  {
    schema: SCHEMA,
    at: AT,
    model: MODEL,
    mode: str({
      enum: [PROJECT_MODE],
      description:
        'The project lane: a harness started in an app the tools set up, given the brief as a ' +
        'request and nothing else from the eval, and judged on the project it leaves.',
    }),
    runner: str({
      enum: HARNESS_RUNNERS,
      description: '`cli`: Claude Code, through `claude -p`. `codex`: Codex, through `codex exec`.',
    }),
    cliVersion: str({ description: CLI_VERSION_TEXT }),
    fake: FAKE,
    partial: PARTIAL,
    stopped: STOPPED,
    polymorph: POLYMORPH,
    briefs: BRIEFS,
    settings: obj({
      briefs: str({ description: 'The glob the briefs were chosen by.' }),
      runs: count('Runs per brief.'),
      framework: str({ description: 'The framework `polymorph init` wrote the app in.' }),
      maxTurns: count(
        'The turn budget: responses for Claude Code, tool calls for Codex. The run is stopped ' +
          'at it and judged.',
      ),
      maxMinutes: num({ description: 'The time budget per run, in minutes.' }),
      effort: EFFORT,
      ...CEILINGS,
    }),
    project: obj(
      {
        tools: obj(
          {
            from: str({
              enum: ['checkout', 'directory', 'tarball'],
              description:
                'Where the tools came from: this checkout’s bins, a directory holding a bin, ' +
                'or a packed tarball of the tools package, installed for the eval.',
            }),
            path: str({ description: 'The bin the lane ran, or the tarball it installed.' }),
            version: nullable(str({ description: 'The version their `package.json` names.' })),
          },
          { description: 'The tools that set the app up and judged it.' },
        ),
        installed: bool({
          description:
            'Whether the app’s packages were installed, so its typecheck and build could run. ' +
            'A scripted harness and `--no-install` install nothing.',
        }),
        agents: obj(
          {
            ran: bool({
              description:
                'Whether `polymorph agents --harness <harness>` ran and succeeded. False when ' +
                'the tools have no such verb: the harness then has what `init` wrote.',
            }),
            said: str({ description: 'The end of what the verb printed.' }),
          },
          { description: 'What the tools wrote for the harness besides `init`.' },
        ),
        mcpServers: arr(str(), {
          description: 'The MCP servers the project configures for the harness, by name.',
        }),
      },
      {
        description:
          'How the app was set up, once per eval, in a template every run copies: ' +
          '`polymorph init`, the install, and `polymorph agents`.',
      },
    ),
    outputs: OUTPUTS,
    requirements: REQUIREMENTS,
    summary: obj({
      overall: obj(PROJECT_SUMMARY_FIELDS),
      briefs: arr(obj({ brief: str(), ...PROJECT_SUMMARY_FIELDS }), {
        description: 'One summary per brief chosen, in brief order, including briefs not yet run.',
      }),
    }),
    records: arr(PROJECT_RECORD, {
      description: 'One record per finished run, by brief and then by run.',
    }),
  },
  {
    description:
      'One run of the agent eval’s project lane: per-run measurements and their summary, per ' +
      'brief and overall.',
  },
)

export const RESULTS_SHAPE: Shape = union([LOOP_RESULTS, RUNTIME_RESULTS, PROJECT_RESULTS], {
  description:
    'A results file of the agent eval: a run of the `spec` or `tsx` mode, of the run-time ' +
    'lane (`runtime`), or of the project lane (`project`).',
})
