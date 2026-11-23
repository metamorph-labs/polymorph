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
 * A results file is one of two shapes. The `spec` and `tsx` modes run a loop
 * of tool calls, and record what the loop did. The `runtime` mode sends one
 * request with no tools, so it records no `validate` call and no first shot
 * apart from the answer, and records the card it sent and the time to the
 * first token instead.
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
 * own default applies, or the CLI's for the CLI runner.
 */
export const EFFORTS = ['default', 'low', 'medium', 'high', 'xhigh', 'max'] as const

/** How the model was reached: the Messages API, or the Claude Code CLI. */
export const RUNNERS = ['api', 'cli'] as const

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
  meanInputTokens: nullable(count('Mean input tokens per run, cached and uncached together.')),
  meanOutputTokens: nullable(count('Mean output tokens per run, thinking included.')),
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
        '`validate` call unlawful. `turns`: the request limit was reached. `max_tokens`: a ' +
        'response was cut off. `refusal`: the model declined. `harness`: the harness itself ' +
        'failed, so the run measures nothing about the model.',
    }),
    harnessFault: nullable(
      str({ description: 'What failed when the run ended `harness`; null for every other run.' }),
    ),
    inputTokens: count(
      'Every input token the model read across the run: uncached, cache writes and cache reads.',
    ),
    cacheReadTokens: count('The part of `inputTokens` read from the prompt cache.'),
    cacheWriteTokens: count('The part of `inputTokens` written to the prompt cache.'),
    outputTokens: count('Every output token across the run, thinking included.'),
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
    turns: count('Messages API requests the run made, retries not counted, through either runner.'),
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

const CLI_VERSION = nullable(
  str({
    description:
      'The Claude Code version the CLI runner ran, as `claude --version` prints it; ' +
      '`scripted` for its stand-in. Null for the API runner.',
  }),
)

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
          '`api`: the Messages API refused, or kept failing. `cli`: the CLI failed, or ' +
          'reported an error, such as one from the API. `usage-limit`: the CLI reported a ' +
          'usage or rate limit on the account it is signed in to. `tokens-per-run`, ' +
          '`tokens-total`: a token ceiling was reached.',
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
    'The effort sent as `output_config.effort`, or passed to the CLI as `--effort`; ' +
    '`default` sends none, so the model’s own default applies, or the CLI’s.',
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
        'through `claude -p`, with the same tools served over MCP. Both are measured the same ' +
        'way.',
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
        'have one. Null when none has: the CLI runner measures none.',
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
  inputTokens: count(
    'Every input token the request read: uncached, cache writes and cache reads together.',
  ),
  uncachedInputTokens: count('The part of `inputTokens` the API reported as `input_tokens`.'),
  cacheWriteTokens: count(
    'The part of `inputTokens` written to the prompt cache (`cache_creation_input_tokens`).',
  ),
  cacheReadTokens: count(
    'The part of `inputTokens` read from the prompt cache (`cache_read_input_tokens`).',
  ),
  outputTokens: count('Every output token of the answer, thinking included.'),
  discardedTokens: count(
    'Tokens of attempts that broke off mid-stream and were sent again, as far as their usage ' +
      'was reported. Billed, but in neither `inputTokens` nor `outputTokens`.',
  ),
  firstTokenMs: nullable(
    count(
      'Milliseconds from sending the request that was answered to the first text of its ' +
        'answer. Thinking is not text, so time spent thinking is inside it. Null when the answer ' +
        'has no text, and for the CLI runner, which does not report when it sends a request.',
    ),
  ),
  wallMs: count(
    'Milliseconds from the first request to the end of the answer, retry waits (`backoffMs`) ' +
      'left out; for the CLI runner, from the CLI’s start-up report.',
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
        '`claude -p` with no tool and no MCP server, stopped after its first response.',
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
            'What the API runner sent as `thinking.type`. Null for the CLI runner, which ' +
            'chooses its own.',
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

export const RESULTS_SHAPE: Shape = union([LOOP_RESULTS, RUNTIME_RESULTS], {
  description:
    'A results file of the agent eval: a run of the `spec` or `tsx` mode, or of the run-time ' +
    'lane (`runtime`).',
})
