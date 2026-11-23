# The agent eval

<!-- Rendered by `pnpm eval:report` from the results files. Edit `eval/report.mjs`, not this page. -->

How an agent given a screen brief and the system’s own tools gets on: how often its first
`validate` call is lawful, how many calls it takes to get there, how often it ends lawful, how
often the screen it hands back has every part its brief requires, and what that costs. The
model is reached through the Messages API or through the Claude Code CLI, measured the same
way. [docs/verification.md](../docs/verification.md) says what each number measures, how to run
the eval with either runner and what a run costs.

A rate from a few runs is known only loosely, so each one is printed with its 95% interval: the
rates that many runs are consistent with. Each results file’s section says which rates a
second eval of the same size could measure without the two being told apart.

**The number:** `claude-sonnet-5-5`, spec mode, high effort, through the Messages API, 1.0.15 (fa7c0a9) — 98% lawful on the first `validate` call (87% to 100%), 100% lawful at the end (91% to 100%), 98% meeting their brief (87% to 100%), 98% lawful and meeting their brief (87% to 100%), 1.0 `validate` calls to lawful, 215,265 input and 6,515 output tokens and 42.3 s per run ([2026-11-17-claude-sonnet-5-5-spec-3.json](results/2026-11-17-claude-sonnet-5-5-spec-3.json)). Each range is the 95% interval its 40 runs support.

**The number:** `claude-sonnet-5-5`, spec mode, high effort, through Claude Code 2.1.308, 1.0.1 (ebb2206) — 75% lawful on the first `validate` call (41% to 93%), 100% lawful at the end (68% to 100%), 1.3 `validate` calls to lawful, 174,950 input and 6,150 output tokens and 40.9 s per run ([2026-10-24-claude-sonnet-5-5-spec-cli.json](results/2026-10-24-claude-sonnet-5-5-spec-cli.json)). Each range is the 95% interval its 8 runs support. Its screens were not judged against their briefs.

## claude-sonnet-5-5 · spec

| Results | Version | Runner | Effort | Briefs × runs | First shot lawful | Lawful | Meets brief | Lawful and meets brief | Calls to lawful | Lawful without validate | Input tokens | Output tokens | Wall time | Retries | Endings |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| [2026-11-17-claude-sonnet-5-5-spec-3.json](results/2026-11-17-claude-sonnet-5-5-spec-3.json) | 1.0.15 (fa7c0a9) | API | high | 8 × 5 | 98% (87–100%) | 100% (91–100%) | 98% (87–100%) | 98% (87–100%) | 1.0 | 0 | 215,265 | 6,515 | 42.3 s | 0 | 40 answered |
| [2026-11-17-claude-sonnet-5-5-spec-2.json](results/2026-11-17-claude-sonnet-5-5-spec-2.json) | 1.0.15 (c205254) | API | high | 8 × 5 | 88% (74–95%) | 100% (91–100%) | 98% (87–100%) | 98% (87–100%) | 1.1 | 0 | 208,167 | 6,047 | 40.9 s | 0 | 40 answered |
| [2026-11-17-claude-sonnet-5-5-spec.json](results/2026-11-17-claude-sonnet-5-5-spec.json) | 1.0.15 (fca1d1c) | API | high | 8 × 5 | 73% (57–84%) | 100% (91–100%) | 95% (83–99%) | 95% (83–99%) | 1.3 | 0 | 225,498 | 6,333 | 42.8 s | 0 | 40 answered |
| [2026-11-16-claude-sonnet-5-5-spec-2.json](results/2026-11-16-claude-sonnet-5-5-spec-2.json) | 1.0.14 (57db696) | API | high | 8 × 1 | 63% (31–86%) | 100% (68–100%) | 100% (68–100%) | 100% (68–100%) | 1.4 | 0 | 245,829 | 6,642 | 44.9 s | 0 | 8 answered |
| [2026-11-16-claude-sonnet-5-5-spec.json](results/2026-11-16-claude-sonnet-5-5-spec.json) | 1.0.14 (7c3703a) | API | high | 8 × 1 | 63% (31–86%) | 100% (68–100%) | 75% (41–93%) | 75% (41–93%) | 1.4 | 0 | 221,215 | 6,348 | 42.7 s | 0 | 8 answered |
| [2026-10-24-claude-sonnet-5-5-spec-cli.json](results/2026-10-24-claude-sonnet-5-5-spec-cli.json) | 1.0.1 (ebb2206) | CLI 2.1.308 | high | 8 × 1 | 75% (41–93%) | 100% (68–100%) | — | — | 1.3 | 0 | 174,950 | 6,150 | 40.9 s | 0 | 8 answered |

### 2026-11-17-claude-sonnet-5-5-spec-3.json

40 runs cannot tell this eval from a second one of the same size that measures:

- first shot lawful: anything from 85% to 100% (98% here)
- lawful: anything from 90% to 100% (100% here)
- meets brief: anything from 85% to 100% (98% here)
- lawful and meets brief: anything from 85% to 100% (98% here)

Against the run before it ([2026-11-17-claude-sonnet-5-5-spec-2.json](results/2026-11-17-claude-sonnet-5-5-spec-2.json)), with 40 runs and 40 runs:

- first shot lawful: 98% against 88%, not told apart
- lawful: 100% against 100%, not told apart
- meets brief: 98% against 98%, not told apart
- lawful and meets brief: 98% against 98%, not told apart

| Brief | Runs | First shot lawful | Lawful | Meets brief | Lawful and meets brief | Requirements not met |
| --- | --- | --- | --- | --- | --- | --- |
| auth-sign-in-up | 5 | 5 of 5 (57–100%) | 5 of 5 (57–100%) | 5 of 5 (57–100%) | 5 of 5 (57–100%) | — |
| chat-assistant | 5 | 5 of 5 (57–100%) | 5 of 5 (57–100%) | 5 of 5 (57–100%) | 5 of 5 (57–100%) | — |
| dashboard-usage | 5 | 5 of 5 (57–100%) | 5 of 5 (57–100%) | 5 of 5 (57–100%) | 5 of 5 (57–100%) | — |
| detail-order | 5 | 5 of 5 (57–100%) | 5 of 5 (57–100%) | 5 of 5 (57–100%) | 5 of 5 (57–100%) | — |
| form-booking | 5 | 5 of 5 (57–100%) | 5 of 5 (57–100%) | 5 of 5 (57–100%) | 5 of 5 (57–100%) | — |
| list-incidents | 5 | 5 of 5 (57–100%) | 5 of 5 (57–100%) | 5 of 5 (57–100%) | 5 of 5 (57–100%) | — |
| onboarding-steps | 5 | 4 of 5 (38–96%) | 5 of 5 (57–100%) | 5 of 5 (57–100%) | 5 of 5 (57–100%) | — |
| settings-workspace | 5 | 5 of 5 (57–100%) | 5 of 5 (57–100%) | 4 of 5 (38–96%) | 4 of 5 (38–96%) | `name-field` 1 |

With 5 runs a brief, two briefs are told apart only when their counts differ by 3 runs or more.

Requirements a screen did not meet, most often missed first:

- `settings-workspace/name-field`, 1 of 5 runs: The workspace name can be edited.

First-shot misses in 2026-11-17-claude-sonnet-5-5-spec-3.json, in the validator’s words:

- `onboarding-steps` #3: `cardFooter` is not in the schema — the fields here are `component`, `props`, `children` and `exception`

### 2026-11-17-claude-sonnet-5-5-spec-2.json

40 runs cannot tell this eval from a second one of the same size that measures:

- first shot lawful: anything from 70% to 98% (88% here)
- lawful: anything from 90% to 100% (100% here)
- meets brief: anything from 85% to 100% (98% here)
- lawful and meets brief: anything from 85% to 100% (98% here)

Against the run before it ([2026-11-17-claude-sonnet-5-5-spec.json](results/2026-11-17-claude-sonnet-5-5-spec.json)), with 40 runs and 40 runs:

- first shot lawful: 88% against 73%, not told apart
- lawful: 100% against 100%, not told apart
- meets brief: 98% against 95%, not told apart
- lawful and meets brief: 98% against 95%, not told apart

| Brief | Runs | First shot lawful | Lawful | Meets brief | Lawful and meets brief | Requirements not met |
| --- | --- | --- | --- | --- | --- | --- |
| auth-sign-in-up | 5 | 5 of 5 (57–100%) | 5 of 5 (57–100%) | 5 of 5 (57–100%) | 5 of 5 (57–100%) | — |
| chat-assistant | 5 | 5 of 5 (57–100%) | 5 of 5 (57–100%) | 5 of 5 (57–100%) | 5 of 5 (57–100%) | — |
| dashboard-usage | 5 | 5 of 5 (57–100%) | 5 of 5 (57–100%) | 5 of 5 (57–100%) | 5 of 5 (57–100%) | — |
| detail-order | 5 | 5 of 5 (57–100%) | 5 of 5 (57–100%) | 5 of 5 (57–100%) | 5 of 5 (57–100%) | — |
| form-booking | 5 | 5 of 5 (57–100%) | 5 of 5 (57–100%) | 5 of 5 (57–100%) | 5 of 5 (57–100%) | — |
| list-incidents | 5 | 2 of 5 (12–77%) | 5 of 5 (57–100%) | 5 of 5 (57–100%) | 5 of 5 (57–100%) | — |
| onboarding-steps | 5 | 3 of 5 (23–88%) | 5 of 5 (57–100%) | 5 of 5 (57–100%) | 5 of 5 (57–100%) | — |
| settings-workspace | 5 | 5 of 5 (57–100%) | 5 of 5 (57–100%) | 4 of 5 (38–96%) | 4 of 5 (38–96%) | `name-field` 1 |

With 5 runs a brief, two briefs are told apart only when their counts differ by 3 runs or more.

Requirements a screen did not meet, most often missed first:

- `settings-workspace/name-field`, 1 of 5 runs: The workspace name can be edited.

First-shot misses in 2026-11-17-claude-sonnet-5-5-spec-2.json, in the validator’s words:

- `list-incidents` #2: `getRowId` binds to "getRowId", which the screen does not declare as an input
- `list-incidents` #4: `getRowId` binds to "getRowId", which the screen does not declare as an input
- `list-incidents` #5: `getIncidentId` binds to "getIncidentId", which the screen does not declare as an input
- `onboarding-steps` #3: not in the schema
- `onboarding-steps` #4: `default as React` is not a type name — an import names identifiers

### 2026-11-17-claude-sonnet-5-5-spec.json

40 runs cannot tell this eval from a second one of the same size that measures:

- first shot lawful: anything from 53% to 88% (73% here)
- lawful: anything from 90% to 100% (100% here)
- meets brief: anything from 83% to 100% (95% here)
- lawful and meets brief: anything from 83% to 100% (95% here)

Against the run before it ([2026-11-16-claude-sonnet-5-5-spec-2.json](results/2026-11-16-claude-sonnet-5-5-spec-2.json)), with 40 runs and 8 runs:

- first shot lawful: 73% against 63%, not told apart
- lawful: 100% against 100%, not told apart
- meets brief: 95% against 100%, not told apart
- lawful and meets brief: 95% against 100%, not told apart

| Brief | Runs | First shot lawful | Lawful | Meets brief | Lawful and meets brief | Requirements not met |
| --- | --- | --- | --- | --- | --- | --- |
| auth-sign-in-up | 5 | 5 of 5 (57–100%) | 5 of 5 (57–100%) | 5 of 5 (57–100%) | 5 of 5 (57–100%) | — |
| chat-assistant | 5 | 5 of 5 (57–100%) | 5 of 5 (57–100%) | 5 of 5 (57–100%) | 5 of 5 (57–100%) | — |
| dashboard-usage | 5 | 0 of 5 (0–43%) | 5 of 5 (57–100%) | 5 of 5 (57–100%) | 5 of 5 (57–100%) | — |
| detail-order | 5 | 4 of 5 (38–96%) | 5 of 5 (57–100%) | 5 of 5 (57–100%) | 5 of 5 (57–100%) | — |
| form-booking | 5 | 5 of 5 (57–100%) | 5 of 5 (57–100%) | 5 of 5 (57–100%) | 5 of 5 (57–100%) | — |
| list-incidents | 5 | 3 of 5 (23–88%) | 5 of 5 (57–100%) | 4 of 5 (38–96%) | 4 of 5 (38–96%) | `two-empty-states` 1 |
| onboarding-steps | 5 | 3 of 5 (23–88%) | 5 of 5 (57–100%) | 5 of 5 (57–100%) | 5 of 5 (57–100%) | — |
| settings-workspace | 5 | 4 of 5 (38–96%) | 5 of 5 (57–100%) | 4 of 5 (38–96%) | 4 of 5 (38–96%) | `name-field` 1 |

With 5 runs a brief, two briefs are told apart only when their counts differ by 3 runs or more.

Requirements a screen did not meet, most often missed first:

- `list-incidents/two-empty-states`, 1 of 5 runs: No incidents at all and no incident matching the filters are two different messages.
- `settings-workspace/name-field`, 1 of 5 runs: The workspace name can be edited.

First-shot misses in 2026-11-17-claude-sonnet-5-5-spec.json, in the validator’s words:

- `dashboard-usage` #1: no component called `Dashboard.Panel` — did you mean `Dashboard`?
- `dashboard-usage` #2: no component called `Dashboard.Panel` — did you mean `Dashboard`?
- `dashboard-usage` #3: no component called `Dashboard.Panel` — did you mean `Dashboard`?
- `dashboard-usage` #4: the spec is not JSON: Expected ',' or '}' after property value in JSON at position 2080 (line 1 column 2081)
- `dashboard-usage` #5: no component called `Dashboard.Panel` — did you mean `Dashboard`?
- `detail-order` #1: the spec is not JSON: Expected ',' or '}' after property value in JSON at position 3245 (line 1 column 3246)
- `list-incidents` #3: `getRowId` binds to "getRowId", which the screen does not declare as an input
- `list-incidents` #5: `getIncidentId` binds to "getIncidentId", which the screen does not declare as an input
- `onboarding-steps` #1: not in the schema
- `onboarding-steps` #4: not in the schema
- `settings-workspace` #2: the spec is not JSON: Expected ',' or '}' after property value in JSON at position 6037 (line 1 column 6038)

### 2026-11-16-claude-sonnet-5-5-spec-2.json

8 runs cannot tell this eval from a second one of the same size that measures:

- first shot lawful: anything from 25% to 100% (63% here)
- lawful: anything from 63% to 100% (100% here)
- meets brief: anything from 63% to 100% (100% here)
- lawful and meets brief: anything from 63% to 100% (100% here)

Against the run before it ([2026-11-16-claude-sonnet-5-5-spec.json](results/2026-11-16-claude-sonnet-5-5-spec.json)), with 8 runs and 8 runs:

- first shot lawful: 63% against 63%, not told apart
- lawful: 100% against 100%, not told apart
- meets brief: not compared, because the two were judged by different requirements
- lawful and meets brief: not compared, because the two were judged by different requirements

| Brief | Runs | First shot lawful | Lawful | Meets brief | Lawful and meets brief | Requirements not met |
| --- | --- | --- | --- | --- | --- | --- |
| auth-sign-in-up | 1 | 1 of 1 (21–100%) | 1 of 1 (21–100%) | 1 of 1 (21–100%) | 1 of 1 (21–100%) | — |
| chat-assistant | 1 | 1 of 1 (21–100%) | 1 of 1 (21–100%) | 1 of 1 (21–100%) | 1 of 1 (21–100%) | — |
| dashboard-usage | 1 | 0 of 1 (0–79%) | 1 of 1 (21–100%) | 1 of 1 (21–100%) | 1 of 1 (21–100%) | — |
| detail-order | 1 | 0 of 1 (0–79%) | 1 of 1 (21–100%) | 1 of 1 (21–100%) | 1 of 1 (21–100%) | — |
| form-booking | 1 | 0 of 1 (0–79%) | 1 of 1 (21–100%) | 1 of 1 (21–100%) | 1 of 1 (21–100%) | — |
| list-incidents | 1 | 1 of 1 (21–100%) | 1 of 1 (21–100%) | 1 of 1 (21–100%) | 1 of 1 (21–100%) | — |
| onboarding-steps | 1 | 1 of 1 (21–100%) | 1 of 1 (21–100%) | 1 of 1 (21–100%) | 1 of 1 (21–100%) | — |
| settings-workspace | 1 | 1 of 1 (21–100%) | 1 of 1 (21–100%) | 1 of 1 (21–100%) | 1 of 1 (21–100%) | — |

With 1 run a brief, no two briefs can be told apart.

First-shot misses in 2026-11-16-claude-sonnet-5-5-spec-2.json, in the validator’s words:

- `dashboard-usage` #1: no component called `Dashboard.Panel` — did you mean `Dashboard`?
- `detail-order` #1: `ConfirmDialog` takes no children
- `form-booking` #1: the spec is not JSON: Unexpected token '\', ..."},{"name":\"onNoteCh"... is not valid JSON

### 2026-11-16-claude-sonnet-5-5-spec.json

8 runs cannot tell this eval from a second one of the same size that measures:

- first shot lawful: anything from 25% to 100% (63% here)
- lawful: anything from 63% to 100% (100% here)
- meets brief: anything from 38% to 100% (75% here)
- lawful and meets brief: anything from 38% to 100% (75% here)

| Brief | Runs | First shot lawful | Lawful | Meets brief | Lawful and meets brief | Requirements not met |
| --- | --- | --- | --- | --- | --- | --- |
| auth-sign-in-up | 1 | 1 of 1 (21–100%) | 1 of 1 (21–100%) | 0 of 1 (0–79%) | 0 of 1 (0–79%) | `error-message` 1 |
| chat-assistant | 1 | 1 of 1 (21–100%) | 1 of 1 (21–100%) | 1 of 1 (21–100%) | 1 of 1 (21–100%) | — |
| dashboard-usage | 1 | 0 of 1 (0–79%) | 1 of 1 (21–100%) | 1 of 1 (21–100%) | 1 of 1 (21–100%) | — |
| detail-order | 1 | 0 of 1 (0–79%) | 1 of 1 (21–100%) | 0 of 1 (0–79%) | 0 of 1 (0–79%) | `history-and-comments` 1 |
| form-booking | 1 | 1 of 1 (21–100%) | 1 of 1 (21–100%) | 1 of 1 (21–100%) | 1 of 1 (21–100%) | — |
| list-incidents | 1 | 1 of 1 (21–100%) | 1 of 1 (21–100%) | 1 of 1 (21–100%) | 1 of 1 (21–100%) | — |
| onboarding-steps | 1 | 1 of 1 (21–100%) | 1 of 1 (21–100%) | 1 of 1 (21–100%) | 1 of 1 (21–100%) | — |
| settings-workspace | 1 | 0 of 1 (0–79%) | 1 of 1 (21–100%) | 1 of 1 (21–100%) | 1 of 1 (21–100%) | — |

With 1 run a brief, no two briefs can be told apart.

Requirements a screen did not meet, most often missed first:

- `auth-sign-in-up/error-message`, 1 of 1 run: A wrong email address or password is reported in one message for the whole form.
- `detail-order/history-and-comments`, 1 of 1 run: What happened to the order and the team's comments are two lists.

First-shot misses in 2026-11-16-claude-sonnet-5-5-spec.json, in the validator’s words:

- `dashboard-usage` #1: no component called `Dashboard.Panel` — did you mean `Dashboard`?
- `detail-order` #1: the spec is not JSON: Expected ',' or '}' after property value in JSON at position 3619 (line 1 column 3620)
- `settings-workspace` #1: `digestDisabled` binds to "digestDisabled", which the screen does not declare as an input; `onTransferCancel` binds to "onTransferCancel", which the screen does not declare as an input; `transferBlocked` binds to "transferBlocked", which the screen does not declare as an input

### 2026-10-24-claude-sonnet-5-5-spec-cli.json

8 runs cannot tell this eval from a second one of the same size that measures:

- first shot lawful: anything from 38% to 100% (75% here)
- lawful: anything from 63% to 100% (100% here)

| Brief | Runs | First shot lawful | Lawful | Meets brief | Lawful and meets brief | Requirements not met |
| --- | --- | --- | --- | --- | --- | --- |
| auth-sign-in-up | 1 | 1 of 1 (21–100%) | 1 of 1 (21–100%) | — | — | — |
| chat-assistant | 1 | 1 of 1 (21–100%) | 1 of 1 (21–100%) | — | — | — |
| dashboard-usage | 1 | 1 of 1 (21–100%) | 1 of 1 (21–100%) | — | — | — |
| detail-order | 1 | 1 of 1 (21–100%) | 1 of 1 (21–100%) | — | — | — |
| form-booking | 1 | 0 of 1 (0–79%) | 1 of 1 (21–100%) | — | — | — |
| list-incidents | 1 | 1 of 1 (21–100%) | 1 of 1 (21–100%) | — | — | — |
| onboarding-steps | 1 | 1 of 1 (21–100%) | 1 of 1 (21–100%) | — | — | — |
| settings-workspace | 1 | 0 of 1 (0–79%) | 1 of 1 (21–100%) | — | — | — |

With 1 run a brief, no two briefs can be told apart.

## The run-time lane

How a model given only the run-time card and a brief gets on in one request with no tools: how
often the screen it writes is lawful, how often that screen has every part its brief requires,
and what it costs in tokens and time. The card is `runtimeCard` from `@polymorph/screen` for the
framework and members a run names, and the screen is judged with `checkScreen` for the same
ones. One request is its own first shot, so the lawful rate is printed once. Each time is
printed with the fastest and the slowest run beside its mean.

**The run-time number:** `claude-haiku-5-5`, the CLI’s own thinking, the CLI’s default effort, through Claude Code 2.1.330, 1.0.16 (dd39eba), the react card of every member it draws (144 members, 60,235 characters) — 60% lawful (45% to 74%), 93% meeting their brief (80% to 97%), 60% lawful and meeting their brief (45% to 74%), 25,087 input tokens a run (23,962 read from the cache, 1,122 written to it and 2 uncached) and 7,742 output tokens, 33.03 s (22.25 s to 53.79 s) to the end of the answer, with no time to the first token ([2026-11-23-claude-haiku-5-5-runtime-cli.json](results/2026-11-23-claude-haiku-5-5-runtime-cli.json)). Each rate’s range is the 95% interval its 40 runs support, and each time’s runs from the fastest run to the slowest.

### claude-haiku-5-5

| Results | Version | Runner | Thinking | Effort | Card | Briefs × runs | Lawful | Meets brief | Lawful and meets brief | Input tokens | Cache read | Cache written | Uncached | Output tokens | First token | Wall time | Retries | Endings |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| [2026-11-23-claude-haiku-5-5-runtime-cli.json](results/2026-11-23-claude-haiku-5-5-runtime-cli.json) | 1.0.16 (dd39eba) | CLI 2.1.330 | the CLI’s | default | react, default (144 members, 60,235 characters) | 8 × 5 | 60% (45–74%) | 93% (80–97%) | 60% (45–74%) | 25,087 | 23,962 | 1,122 | 2 | 7,742 | — | 33.03 s (22.25–53.79 s) | 0 | 40 answered |

#### 2026-11-23-claude-haiku-5-5-runtime-cli.json

40 runs cannot tell this eval from a second one of the same size that measures:

- lawful: anything from 40% to 80% (60% here)
- meets brief: anything from 78% to 100% (93% here)
- lawful and meets brief: anything from 40% to 80% (60% here)

| Brief | Runs | Lawful | Meets brief | Lawful and meets brief | Requirements not met |
| --- | --- | --- | --- | --- | --- |
| auth-sign-in-up | 5 | 0 of 5 (0–43%) | 5 of 5 (57–100%) | 0 of 5 (0–43%) | — |
| chat-assistant | 5 | 5 of 5 (57–100%) | 5 of 5 (57–100%) | 5 of 5 (57–100%) | — |
| dashboard-usage | 5 | 5 of 5 (57–100%) | 5 of 5 (57–100%) | 5 of 5 (57–100%) | — |
| detail-order | 5 | 3 of 5 (23–88%) | 4 of 5 (38–96%) | 3 of 5 (23–88%) | `confirmation-states-the-amount` 1, `refund-asks-first` 1, `refund-from-the-top` 1, `status` 1 |
| form-booking | 5 | 2 of 5 (12–77%) | 4 of 5 (38–96%) | 2 of 5 (12–77%) | `date-not-in-the-past` 1, `invitees` 1, `note` 1, `room-and-length` 1, `start-time` 1 |
| list-incidents | 5 | 3 of 5 (23–88%) | 4 of 5 (38–96%) | 3 of 5 (23–88%) | `two-empty-states` 1 |
| onboarding-steps | 5 | 4 of 5 (38–96%) | 5 of 5 (57–100%) | 4 of 5 (38–96%) | — |
| settings-workspace | 5 | 2 of 5 (12–77%) | 5 of 5 (57–100%) | 2 of 5 (12–77%) | — |

With 5 runs a brief, two briefs are told apart only when their counts differ by 3 runs or more.

Requirements a screen did not meet, most often missed first:

- `detail-order/confirmation-states-the-amount`, 1 of 5 runs: The confirmation states the amount being refunded, so its words come from the order.
- `detail-order/refund-asks-first`, 1 of 5 runs: Refunding asks for confirmation first.
- `detail-order/refund-from-the-top`, 1 of 5 runs: The refund is offered from the top of the page.
- `detail-order/status`, 1 of 5 runs: The order's standing is shown beside its name.
- `form-booking/date-not-in-the-past`, 1 of 5 runs: A date is asked for, and a past one cannot be chosen.
- `form-booking/invitees`, 1 of 5 runs: The email addresses of the people invited can be entered.
- `form-booking/note`, 1 of 5 runs: A note for the invitation can be written.
- `form-booking/room-and-length`, 1 of 5 runs: The room and the length are each chosen from a fixed list.
- `form-booking/start-time`, 1 of 5 runs: A start time is asked for.
- `list-incidents/two-empty-states`, 1 of 5 runs: No incidents at all and no incident matching the filters are two different messages.

Answers that were not lawful in 2026-11-23-claude-haiku-5-5-runtime-cli.json, in the check’s words:

- `auth-sign-in-up` #1: $.root.children[0].children[1].children[0].children[2].children[2].children[0].props.name: the control at `$.root.children[0].children[0].children[0].children[2].children[1].children[0]` is named `email` too; `values` holds the last of them, this one; $.root.children[0].children[1].children[0].children[2].children[3].children[0].props.name: the control at `$.root.children[0].children[0].children[0].children[2].children[2].children[0]` is named `password` too; `values` holds the last of them, this one
- `auth-sign-in-up` #2: $.root.children[1].children[0].children[0].children[4].props.labelEnd.props.children: `Link` prop `children` wants `string`, got ["Forgot password?"]; $.root.children[1].children[1].children[0].children[4].children[0].props.name: the control at `$.root.children[1].children[0].children[0].children[3].children[0]` is named `email` too; `values` holds the last of them, this one; $.root.children[1].children[1].children[0].children[5].children[0].props.name: the control at `$.root.children[1].children[0].children[0].children[4].children[0]` is named `password` too; `values` holds the last of them, this one
- `auth-sign-in-up` #3: $.root.children[0].children[4].children[1].children[0].children[1].children[0].props.name: the control at `$.root.children[0].children[4].children[0].children[0].children[0].children[0]` is named `email` too; `values` holds the last of them, this one; $.root.children[0].children[4].children[1].children[0].children[2].children[0].props.name: the control at `$.root.children[0].children[4].children[0].children[0].children[1].children[0]` is named `password` too; `values` holds the last of them, this one
- `auth-sign-in-up` #4: $.root.children[0].children[2].children[1].children[0].children[2].children[0].props.name: the control at `$.root.children[0].children[2].children[0].children[0].children[1].children[0]` is named `email` too; `values` holds the last of them, this one; $.root.children[0].children[2].children[1].children[0].children[3].children[0].props.name: the control at `$.root.children[0].children[2].children[0].children[0].children[2].children[0]` is named `password` too; `values` holds the last of them, this one
- `auth-sign-in-up` #5: $.root.children[0].children[1].children[0].children[2].children[1].children[0].props.name: the control at `$.root.children[0].children[0].children[0].children[2].children[1].children[0]` is named `email` too; `values` holds the last of them, this one; $.root.children[0].children[1].children[0].children[2].children[2].children[0].props.name: the control at `$.root.children[0].children[0].children[0].children[2].children[2].children[0]` is named `password` too; `values` holds the last of them, this one
- `detail-order` #1: $.root.children[0].children[0].children[1].props.items[0]: an object here has `$`, `component` or `$object`, and this one has `term` and `detail` — a binding is `{ "$": "anInput" }`, an element is `{ "component": … }`, and a plain object, such as a column or an option, is written `{ "$object": { … } }`; $.root.children[0].children[0].children[1].props.items[1]: an object here has `$`, `component` or `$object`, and this one has `term` and `detail` — a binding is `{ "$": "anInput" }`, an element is `{ "component": … }`, and a plain object, such as a column or an option, is written `{ "$object": { … } }`; $.root.children[0].children[0].children[1].props.items[2]: an object here has `$`, `component` or `$object`, and this one has `term` and `detail` — a binding is `{ "$": "anInput" }`, an element is `{ "component": … }`, and a plain object, such as a column or an option, is written `{ "$object": { … } }` (and 2 more)
- `detail-order` #5: $.root.meta: `meta` is a prop of `DetailPage`, written here as a field of the element — a prop goes inside `props`: `{ "component": "DetailPage", "props": { "meta": … } }`; $.root.actions: `actions` is a prop of `DetailPage`, written here as a field of the element — a prop goes inside `props`: `{ "component": "DetailPage", "props": { "actions": … } }`
- `form-booking` #1: $.root.children[0].children[1].children[0].children[0].props.aria: an object here has `$`, `component` or `$object`, and this one has `aria-required` — a binding is `{ "$": "anInput" }`, an element is `{ "component": … }`, and a plain object, such as a column or an option, is written `{ "$object": { … } }`; $.root.children[0].children[1].children[1].children[0].props.aria: an object here has `$`, `component` or `$object`, and this one has `aria-required` — a binding is `{ "$": "anInput" }`, an element is `{ "component": … }`, and a plain object, such as a column or an option, is written `{ "$object": { … } }`; $.root.children[0].children[1].children[2].children[0].props.aria: an object here has `$`, `component` or `$object`, and this one has `aria-required` — a binding is `{ "$": "anInput" }`, an element is `{ "component": … }`, and a plain object, such as a column or an option, is written `{ "$object": { … } }` (and 2 more)
- `form-booking` #4: $.root.children[1].children[0].props.children: `children` takes one element, which its member reads, and this is not one; it is left out; $.root.children[1].children[1].props.children: `children` takes one element, which its member reads, and this is not one; it is left out; $.root.children[1].children[2].children[0].props.children: `children` takes one element, which its member reads, and this is not one; it is left out (and 3 more)
- `form-booking` #5: $.root.children[0].children[1].children[0].children: expected an array, got an object; $.root.children[0].children[1].children[1].children: expected an array, got an object; $.root.children[0].children[1].children[2].children: expected an array, got an object (and 3 more)
- `list-incidents` #1: $.root.props.filters.children[0].props.aria: `Select` has no prop `aria` — did you mean `aria-describedby`?
- `list-incidents` #3: $.root.children[1].children[0].props.aria: an object here has `$`, `component` or `$object`, and this one has `aria-label` — a binding is `{ "$": "anInput" }`, an element is `{ "component": … }`, and a plain object, such as a column or an option, is written `{ "$object": { … } }`; $.root.children[1].children[1].props.aria: an object here has `$`, `component` or `$object`, and this one has `aria-label` — a binding is `{ "$": "anInput" }`, an element is `{ "component": … }`, and a plain object, such as a column or an option, is written `{ "$object": { … } }`
- `onboarding-steps` #5: $.root.children[1].children[0].children[0].props.aria: an object here has `$`, `component` or `$object`, and this one has `aria-required` — a binding is `{ "$": "anInput" }`, an element is `{ "component": … }`, and a plain object, such as a column or an option, is written `{ "$object": { … } }`; $.root.children[1].children[1].children[0].props.aria: an object here has `$`, `component` or `$object`, and this one has `aria-required` — a binding is `{ "$": "anInput" }`, an element is `{ "component": … }`, and a plain object, such as a column or an option, is written `{ "$object": { … } }`
- `settings-workspace` #3: $.root.children[0].children[1].children[1].props.control.props.name: `SegmentedControl` has no prop `name`
- `settings-workspace` #4: $.root.children[0].children[0].props.control.props.aria: an object here has `$`, `component` or `$object`, and this one has `aria-label` — a binding is `{ "$": "anInput" }`, an element is `{ "component": … }`, and a plain object, such as a column or an option, is written `{ "$object": { … } }`; $.root.children[0].children[1].props.control.props.aria: an object here has `$`, `component` or `$object`, and this one has `aria-label` — a binding is `{ "$": "anInput" }`, an element is `{ "component": … }`, and a plain object, such as a column or an option, is written `{ "$object": { … } }`; $.root.children[1].children[0].props.control.props.aria: an object here has `$`, `component` or `$object`, and this one has `aria-label` — a binding is `{ "$": "anInput" }`, an element is `{ "component": … }`, and a plain object, such as a column or an option, is written `{ "$object": { … } }` (and 3 more)
- `settings-workspace` #5: $.root.children[0].children[0].props.control.props.aria: an object here has `$`, `component` or `$object`, and this one has `aria-label` — a binding is `{ "$": "anInput" }`, an element is `{ "component": … }`, and a plain object, such as a column or an option, is written `{ "$object": { … } }`; $.root.children[0].children[1].props.control.props.aria: an object here has `$`, `component` or `$object`, and this one has `aria-label` — a binding is `{ "$": "anInput" }`, an element is `{ "component": … }`, and a plain object, such as a column or an option, is written `{ "$object": { … } }`; $.root.children[4].children[1].props.control.children[0].props.aria: an object here has `$`, `component` or `$object`, and this one has `aria-label` — a binding is `{ "$": "anInput" }`, an element is `{ "component": … }`, and a plain object, such as a column or an option, is written `{ "$object": { … } }`
