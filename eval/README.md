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

**The number:** `claude-sonnet-5-5`, spec mode, high effort, through the Messages API, 1.0.15 (fca1d1c) — 73% lawful on the first `validate` call (57% to 84%), 100% lawful at the end (91% to 100%), 95% meeting their brief (83% to 99%), 95% lawful and meeting their brief (83% to 99%), 1.3 `validate` calls to lawful, 225,498 input and 6,333 output tokens and 42.8 s per run ([2026-11-17-claude-sonnet-5-5-spec.json](results/2026-11-17-claude-sonnet-5-5-spec.json)). Each range is the 95% interval its 40 runs support.

**The number:** `claude-sonnet-5-5`, spec mode, high effort, through Claude Code 2.1.308, 1.0.1 (ebb2206) — 75% lawful on the first `validate` call (41% to 93%), 100% lawful at the end (68% to 100%), 1.3 `validate` calls to lawful, 174,950 input and 6,150 output tokens and 40.9 s per run ([2026-10-24-claude-sonnet-5-5-spec-cli.json](results/2026-10-24-claude-sonnet-5-5-spec-cli.json)). Each range is the 95% interval its 8 runs support. Its screens were not judged against their briefs.

## claude-sonnet-5-5 · spec

| Results | Version | Runner | Effort | Briefs × runs | First shot lawful | Lawful | Meets brief | Lawful and meets brief | Calls to lawful | Lawful without validate | Input tokens | Output tokens | Wall time | Retries | Endings |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| [2026-11-17-claude-sonnet-5-5-spec.json](results/2026-11-17-claude-sonnet-5-5-spec.json) | 1.0.15 (fca1d1c) | API | high | 8 × 5 | 73% (57–84%) | 100% (91–100%) | 95% (83–99%) | 95% (83–99%) | 1.3 | 0 | 225,498 | 6,333 | 42.8 s | 0 | 40 answered |
| [2026-11-16-claude-sonnet-5-5-spec-2.json](results/2026-11-16-claude-sonnet-5-5-spec-2.json) | 1.0.14 (57db696) | API | high | 8 × 1 | 63% (31–86%) | 100% (68–100%) | 100% (68–100%) | 100% (68–100%) | 1.4 | 0 | 245,829 | 6,642 | 44.9 s | 0 | 8 answered |
| [2026-11-16-claude-sonnet-5-5-spec.json](results/2026-11-16-claude-sonnet-5-5-spec.json) | 1.0.14 (7c3703a) | API | high | 8 × 1 | 63% (31–86%) | 100% (68–100%) | 75% (41–93%) | 75% (41–93%) | 1.4 | 0 | 221,215 | 6,348 | 42.7 s | 0 | 8 answered |
| [2026-10-24-claude-sonnet-5-5-spec-cli.json](results/2026-10-24-claude-sonnet-5-5-spec-cli.json) | 1.0.1 (ebb2206) | CLI 2.1.308 | high | 8 × 1 | 75% (41–93%) | 100% (68–100%) | — | — | 1.3 | 0 | 174,950 | 6,150 | 40.9 s | 0 | 8 answered |

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
