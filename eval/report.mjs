#!/usr/bin/env node
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { apart, interval, resolution, smallestGap } from './spread.mjs'

/**
 * `pnpm eval:report` renders `eval/README.md` from every results file in
 * `eval/results/`. `pnpm eval` runs it after each run, so the page and the
 * files never disagree for long, and `eval.test.ts` holds the committed page
 * equal to what this renders.
 *
 * One table per model and mode, latest run first, and above them the number:
 * for each model, mode and runner, its latest run that can be one. The two
 * runners measure the same way, and each number names the runner it came
 * from, so they can be set side by side. Only a complete
 * run of the real model over every brief that existed when it ran can: a run
 * of the scripted model (`--fake`) measures the harness, a smoke run over a
 * subset of the briefs measures that subset, and a partial file (a checkpoint,
 * or an eval that stopped early) measures the runs that happened to finish.
 * All three are listed, marked for what they are, and are never the number.
 *
 * Every rate is printed with its 95% interval, and under each table every
 * results file gets a section: which rates a second eval of its size could
 * measure without being told apart from it, how it compares with the run before it,
 * its rates brief by brief, and the requirements its screens did not meet. The
 * intervals are computed here from each file's counts (`eval/spread.mjs`), so
 * one method covers every file on the page, whenever it was written.
 *
 * The page carries no dates of its own. A results file's name starts with the
 * day it ran, and its `at` field orders the rows.
 *
 * The run-time lane (`--mode runtime`) prints after the loop modes, as a
 * section of its own with its own number: one request with no tools has no
 * first shot apart from its answer and no `validate` call, and it is
 * measured by what a host pays, the card's tokens cached and uncached apart,
 * and by how soon the answer starts and ends.
 *
 * The project lane (`--mode project`) prints last, with its own number: a
 * harness in an app has no `validate` call of the eval's to count, so it is
 * measured by what its project holds at the end (lawful, builds, meets its
 * brief, and all three) and by what the harness called on the way.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const RESULTS = resolve(ROOT, 'eval/results')
const README = resolve(ROOT, 'eval/README.md')
const VERIFICATION = resolve(ROOT, 'docs/verification.md')

/** Every results file in `directory`, latest first. The outputs files beside them are skipped. */
export function readResults(directory) {
  let names
  try {
    names = readdirSync(directory)
  } catch {
    return []
  }
  return names
    .filter((name) => name.endsWith('.json') && !name.endsWith('.outputs.json'))
    .map((name) => ({
      file: resolve(directory, name),
      results: JSON.parse(readFileSync(resolve(directory, name), 'utf8')),
    }))
    .sort((a, b) => b.results.at.localeCompare(a.results.at) || a.file.localeCompare(b.file))
}

/** Whether every brief that existed when the eval ran was chosen for it. */
const coversEveryBrief = (results) => {
  const chosen = new Set(results.summary.briefs.map(({ brief }) => brief))
  return results.briefs.length > 0 && results.briefs.every((brief) => chosen.has(brief))
}

/** Whether a results file may be the number: real, complete, and over the full brief set. */
export const canBeTheNumber = (results) =>
  !results.fake && !results.partial && coversEveryBrief(results)

const percent = (rate) => (rate === null ? '—' : `${Math.round(rate * 100)}%`)
const fileName = (file) => file.split(/[\\/]/).at(-1)

/**
 * The four rates a summary holds, in the order the page prints them. The two
 * marked `judged` depend on the briefs' requirements, and are absent from a
 * results file written before requirements were judged.
 */
const RATES = [
  {
    key: 'firstShotRate',
    name: 'first shot lawful',
    title: 'First shot lawful',
    phrase: 'lawful on the first `validate` call',
  },
  { key: 'lawfulRate', name: 'lawful', title: 'Lawful', phrase: 'lawful at the end' },
  {
    key: 'meetsBriefRate',
    name: 'meets brief',
    title: 'Meets brief',
    phrase: 'meeting their brief',
    judged: true,
  },
  {
    key: 'lawfulAndMeetsBriefRate',
    name: 'lawful and meets brief',
    title: 'Lawful and meets brief',
    phrase: 'lawful and meeting their brief',
    judged: true,
  },
]

/** The mode of the run-time lane. */
const RUNTIME = 'runtime'

/** The mode of the project lane. */
const PROJECT = 'project'

/**
 * The three rates of the run-time lane. Its one request is its first shot,
 * so the lawful rate is the first-shot rate as well, and is printed once.
 */
const RUNTIME_RATES = [
  { key: 'lawfulRate', name: 'lawful', title: 'Lawful', phrase: 'lawful' },
  ...RATES.filter(({ judged }) => judged === true),
]

/** The runs a summary's rates are over: every run that was not a harness fault. */
const measuredOf = (summary) => summary.measured ?? summary.runs - summary.endings.harness

/**
 * A rate as successes out of the runs it is over, or `null` where the summary
 * has no such rate. A rate of the project lane names its own number of runs
 * (`buildsMeasured` beside `buildsRate`); every other rate is over the
 * measured runs.
 */
function countOf(summary, key) {
  const own = summary[key.replace(/Rate$/, 'Measured')]
  const [rate, total] = [summary[key], typeof own === 'number' ? own : measuredOf(summary)]
  if (rate === null || rate === undefined || total === 0) return null
  return { successes: Math.round(rate * total), total }
}

/** A count's 95% interval, as `41–93%` or, in a sentence, `41% to 93%`. */
function range(count, between = '–') {
  const { low, high } = interval(count.successes, count.total)
  return between === '–'
    ? `${Math.round(low * 100)}–${percent(high)}`
    : `${percent(low)} to ${percent(high)}`
}

/** A rate and its interval, as a table cell: `75% (41–93%)`. */
const rateCell = (summary, key) => {
  const count = countOf(summary, key)
  return count === null ? '—' : `${percent(count.successes / count.total)} (${range(count)})`
}

/** The same for one brief, whose few runs read better as a count: `2 of 3 (21–94%)`. */
const countCell = (summary, key) => {
  const count = countOf(summary, key)
  return count === null ? '—' : `${count.successes} of ${count.total} (${range(count)})`
}
const thousands = (value) => (value === null ? '—' : value.toLocaleString('en-US'))
const seconds = (ms) => (ms === null ? '—' : `${(ms / 1000).toFixed(1)} s`)
const iterations = (value) => (value === null ? '—' : value.toFixed(1))
const runs = (count) => `${count} run${count === 1 ? '' : 's'}`

/** The effort the run asked for; `default` asked for none, which a harness fills with its own. */
const effort = ({ runner, settings }) =>
  settings.effort === 'default' && runner === 'cli'
    ? 'the CLI’s default effort'
    : settings.effort === 'default' && runner === 'codex'
      ? 'Codex’s default effort'
      : `${settings.effort} effort`

/** How the model was reached, as the number says it. */
const through = ({ runner, cliVersion }) =>
  runner === 'cli'
    ? `through Claude Code ${cliVersion}`
    : runner === 'codex'
      ? `through Codex ${cliVersion}`
      : 'through the Messages API'

/** How the model was reached, as a table cell says it. */
const runnerCell = ({ runner, cliVersion }) =>
  runner === 'cli' ? `CLI ${cliVersion}` : runner === 'codex' ? `Codex ${cliVersion}` : 'API'

/** Why a partial file's eval stopped, as its row says. */
const STOPPED = {
  api: 'the API failed',
  cli: 'the harness failed',
  'usage-limit': 'stopped at a usage limit',
  'tokens-per-run': 'stopped at the per-run token ceiling',
  'tokens-total': 'stopped at the total token ceiling',
  'tokens-unknown': 'stopped when a run’s tokens went unreported under a total ceiling given',
}

function version({ polymorph }) {
  return polymorph.commit === null
    ? polymorph.version
    : `${polymorph.version} (${polymorph.commit.slice(0, 7)})`
}

/** What the rates leave out or count against the model, as a sentence; empty when nothing. */
function caveats({ runs: total, endings, lawfulWithoutValidate }) {
  const parts = [
    lawfulWithoutValidate > 0 &&
      `${lawfulWithoutValidate} ended lawful without a lawful \`validate\` call`,
    endings.refusal > 0 && `${endings.refusal} ended in a refusal`,
    endings.max_tokens > 0 &&
      `${endings.max_tokens} ${endings.max_tokens === 1 ? 'was' : 'were'} cut off at \`max_tokens\``,
    endings.harness > 0 && `${endings.harness} ended in a harness fault, left out of the figures`,
  ].filter(Boolean)
  return parts.length === 0 ? '' : ` Of ${runs(total)}, ${parts.join(', ')}.`
}

function theNumber(entries, link) {
  const latest = new Map()
  for (const entry of entries) {
    const key = `${entry.results.model} · ${entry.results.mode} · ${entry.results.runner}`
    if (canBeTheNumber(entry.results) && !latest.has(key)) latest.set(key, entry)
  }
  if (latest.size === 0) {
    return [
      'No number is recorded: `eval/results/` holds no real run over every brief. The ' +
        'number is the owner’s to produce, before a release, with `pnpm eval` and ' +
        '`ANTHROPIC_API_KEY` set, or with `pnpm eval --runner cli` and Claude Code signed in.',
    ]
  }
  return [...latest.values()].flatMap(({ file, results }, index) => {
    const { overall } = results.summary
    const rates = RATES.flatMap(({ key, phrase }) => {
      const count = countOf(overall, key)
      return count === null
        ? []
        : [`${percent(count.successes / count.total)} ${phrase} (${range(count, ' to ')})`]
    })
    const judged = countOf(overall, 'meetsBriefRate') !== null
    return [
      ...(index === 0 ? [] : ['']),
      `**The number:** \`${results.model}\`, ${results.mode} mode, ${effort(results)}, ` +
        `${through(results)}, ${version(results)} — ${rates.join(', ')}, ` +
        `${iterations(overall.meanIterations)} \`validate\` calls to lawful, ` +
        `${thousands(overall.meanInputTokens)} input and ${thousands(overall.meanOutputTokens)} ` +
        `output tokens and ${seconds(overall.meanWallMs)} per run ` +
        `([${link(file).split('/').at(-1)}](${link(file)})). Each range is the 95% interval ` +
        `its ${runs(measuredOf(overall))} support.` +
        (judged ? '' : ' Its screens were not judged against their briefs.') +
        caveats(overall),
    ]
  })
}

/**
 * What a results file's runs cannot tell apart, as lines. A second eval of
 * the same size is the comparison a reader makes after changing something, so
 * the page gives, for each rate, the range that eval could measure while the
 * difference is still no more than the samples produce by chance.
 */
function resolutionLines({ summary }, rates = RATES) {
  const total = measuredOf(summary.overall)
  const ranges = rates.flatMap(({ key, name }) => {
    const count = countOf(summary.overall, key)
    if (count === null) return []
    const { below, above } = resolution(count.successes, count.total)
    const from = percent((below === null ? 0 : below + 1) / count.total)
    const to = percent((above === null ? count.total : above - 1) / count.total)
    const here = percent(count.successes / count.total)
    return [
      `- ${name}: ${from === to ? `only ${from}` : `anything from ${from} to ${to}`} (${here} here)`,
    ]
  })
  if (ranges.length === 0) return []
  if (smallestGap(total) === null) return [`${runs(total)} cannot tell any two rates apart.`]
  return [
    `${runs(total)} cannot tell this eval from a second one of the same size that measures:`,
    '',
    ...ranges,
  ]
}

/** What the per-brief samples can tell apart, as one sentence; empty when the briefs' samples differ in size. */
function briefResolution({ summary }) {
  const sizes = new Set(summary.briefs.map(measuredOf).filter((size) => size > 0))
  if (sizes.size !== 1) return []
  const [size] = sizes
  const gap = smallestGap(size)
  return [
    gap === null
      ? `With ${runs(size)} a brief, no two briefs can be told apart.`
      : `With ${runs(size)} a brief, two briefs are told apart only when their counts differ ` +
        `by ${runs(gap)} or more.`,
  ]
}

/** Whether two results files chose the same briefs and judged each by the same requirements. */
function sameRequirements(one, other) {
  const digests = (results) =>
    JSON.stringify((results.requirements ?? []).map(({ brief, digest }) => [brief, digest]))
  return one.requirements !== undefined && digests(one) === digests(other)
}

/** Whether two `spec` or `tsx` results files ran under the same condition: the same runner and effort. */
const sameLoopCondition = (one, other) =>
  one.runner === other.runner && one.settings.effort === other.settings.effort

/**
 * The run a results file is compared with: the next older complete file of
 * the same model, mode, runner and effort over the same briefs. `same` says
 * what else has to match, and the run-time lane adds its own.
 */
function previousOf(entry, group, same = sameLoopCondition) {
  const chosen = (results) => results.summary.briefs.map(({ brief }) => brief).join(',')
  const { results } = entry
  if (results.partial) return undefined
  return group
    .slice(group.indexOf(entry) + 1)
    .find(
      ({ results: other }) =>
        !other.partial &&
        other.fake === results.fake &&
        same(other, results) &&
        chosen(other) === chosen(results),
    )
}

/** Each rate of a results file against the run before it, and whether the two samples tell them apart. */
function comparisonLines(entry, previous, link, rates = RATES) {
  const [now, before] = [entry.results.summary.overall, previous.results.summary.overall]
  const lines = rates.flatMap(({ key, name, judged }) => {
    const [one, other] = [countOf(now, key), countOf(before, key)]
    if (one === null || other === null) return []
    if (judged === true && !sameRequirements(entry.results, previous.results)) {
      return [`- ${name}: not compared, because the two were judged by different requirements`]
    }
    const rate = (count) => percent(count.successes / count.total)
    return [
      `- ${name}: ${rate(one)} against ${rate(other)}, ` +
        (apart(one, other) ? 'told apart' : 'not told apart'),
    ]
  })
  if (lines.length === 0) return []
  return [
    `Against the run before it ([${fileName(previous.file)}](${link(previous.file)})), with ` +
      `${runs(measuredOf(now))} and ${runs(measuredOf(before))}:`,
    '',
    ...lines,
  ]
}

/** One row per brief: its runs, its rates as counts with their intervals, and what was not met. */
function briefRows({ summary }, rates = RATES) {
  const columns = ['Brief', 'Runs', ...rates.map(({ title }) => title), 'Requirements not met']
  return [
    `| ${columns.join(' | ')} |`,
    `| ${columns.map(() => '---').join(' | ')} |`,
    ...summary.briefs.map((brief) => {
      const failed = Object.entries(brief.failedRequirements ?? {}).map(
        ([key, count]) => `\`${key.slice(brief.brief.length + 1)}\` ${count}`,
      )
      return (
        `| ${brief.brief} | ${measuredOf(brief)} | ` +
        `${rates.map(({ key }) => countCell(brief, key)).join(' | ')} | ` +
        `${failed.length === 0 ? '—' : failed.join(', ')} |`
      )
    }),
  ]
}

/** Every requirement a run did not meet, with what it asks for, most often missed first. */
function unmetLines({ summary, requirements }) {
  const says = new Map(
    (requirements ?? []).flatMap(({ brief, requirements: list }) =>
      list.map((requirement) => [`${brief}/${requirement.id}`, requirement.says]),
    ),
  )
  const sizes = new Map(summary.briefs.map((brief) => [brief.brief, measuredOf(brief)]))
  return Object.entries(summary.overall.failedRequirements ?? {})
    .sort(([a, one], [b, other]) => other - one || a.localeCompare(b))
    .map(
      ([key, count]) =>
        `- \`${key}\`, ${count} of ${runs(sizes.get(key.split('/')[0]))}: ${says.get(key) ?? ''}`,
    )
}

/** The `spec` and `tsx` modes: their rates, their condition, and what their misses say. */
const LOOP_LANE = {
  rates: RATES,
  same: sameLoopCondition,
  heading: '###',
  misses: (entry) => {
    const misses = firstShotMisses(entry.results)
    return misses.length === 0
      ? []
      : [
          `First-shot misses in ${fileName(entry.file)}, in the validator’s words:`,
          '',
          ...misses.map((miss) => `- ${miss}`),
        ]
  },
}

/**
 * A results file's own section: what its sample can tell apart, how it
 * compares with the run before it, its briefs, the requirements its screens
 * did not meet and its misses. A file with no finished run has none.
 */
function detail(entry, group, link, lane = LOOP_LANE) {
  const { results } = entry
  if (measuredOf(results.summary.overall) === 0) return []
  const previous = previousOf(entry, group, lane.same)
  const paragraphs = [
    resolutionLines(results, lane.rates),
    previous === undefined ? [] : comparisonLines(entry, previous, link, lane.rates),
    [...briefRows(results, lane.rates), ...briefResolution(results).flatMap((line) => ['', line])],
  ]
  const failed = unmetLines(results)
  if (failed.length > 0) {
    paragraphs.push(['Requirements a screen did not meet, most often missed first:', '', ...failed])
  }
  paragraphs.push(lane.misses(entry))
  return [
    '',
    `${lane.heading} ${fileName(entry.file)}`,
    ...paragraphs.filter((lines) => lines.length > 0).flatMap((lines) => ['', ...lines]),
  ]
}

/** The results file's name, linked, and what it is when it is partial. */
function resultsCell({ file, results }, link) {
  const name = `[${link(file).split('/').at(-1)}](${link(file)})`
  if (!results.partial) return name
  return results.stopped === null
    ? `${name} (partial)`
    : `${name} (partial: ${STOPPED[results.stopped.reason]})`
}

function briefsCell(results) {
  const chosen = results.summary.briefs.length
  const of = coversEveryBrief(results) ? `${chosen}` : `${chosen} of ${results.briefs.length}`
  return `${of} × ${results.settings.runs}`
}

function retriesCell({ retries, backoffMs, discardedTokens }) {
  // Codex reports no retry, so its runs have no count.
  if (retries === null) return 'not reported'
  if (retries === 0) return '0'
  return `${retries} (${seconds(backoffMs)} waiting, ${thousands(discardedTokens)} tokens discarded)`
}

function endingsCell({ endings }) {
  return Object.entries(endings)
    .filter(([, count]) => count > 0)
    .map(([ending, count]) => `${count} ${ending}`)
    .join(', ')
}

/** The page, as a string. `readme` is where it will live, so its links resolve from there. */
export function renderReport(all, readme) {
  const link = (file) => relative(dirname(readme), file).split('\\').join('/')
  const entries = all.filter(({ results }) => results.mode !== RUNTIME && results.mode !== PROJECT)
  const lines = [
    '# The agent eval',
    '',
    '<!-- Rendered by `pnpm eval:report` from the results files. Edit `eval/report.mjs`, not this page. -->',
    '',
    'How an agent given a screen brief and the system’s own tools gets on: how often its first',
    '`validate` call is lawful, how many calls it takes to get there, how often it ends lawful, how',
    'often the screen it hands back has every part its brief requires, and what that costs. The',
    'model is reached through the Messages API, through the Claude Code CLI or through the Codex',
    'CLI, measured the same way apart from what Codex does not report.',
    `[docs/verification.md](${link(VERIFICATION)}) says what each number measures, how to run the`,
    'eval with each runner and what a run costs.',
    '',
    'A rate from a few runs is known only loosely, so each one is printed with its 95% interval: the',
    'rates that many runs are consistent with. Each results file’s section says which rates a',
    'second eval of the same size could measure without the two being told apart.',
    '',
    ...theNumber(entries, link),
  ]

  const groups = new Map()
  for (const entry of entries) {
    const { model, mode, fake } = entry.results
    const key = `${model} · ${mode}${fake ? ' (scripted model: measures the harness, not a model)' : ''}`
    groups.set(key, [...(groups.get(key) ?? []), entry])
  }

  for (const [title, group] of groups) {
    lines.push(
      '',
      `## ${title}`,
      '',
      '| Results | Version | Runner | Effort | Briefs × runs | First shot lawful | Lawful | Meets brief | Lawful and meets brief | Calls to lawful | Lawful without validate | Input tokens | Output tokens | Wall time | Retries | Endings |',
      '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    )
    for (const entry of group) {
      const { results } = entry
      const { overall } = results.summary
      lines.push(
        `| ${resultsCell(entry, link)} | ${version(results)} | ${runnerCell(results)} | ` +
          `${results.settings.effort} | ` +
          `${briefsCell(results)} | ` +
          `${RATES.map(({ key }) => rateCell(overall, key)).join(' | ')} | ` +
          `${iterations(overall.meanIterations)} | ` +
          `${overall.lawfulWithoutValidate} | ${thousands(overall.meanInputTokens)} | ` +
          `${thousands(overall.meanOutputTokens)} | ${seconds(overall.meanWallMs)} | ` +
          `${retriesCell(overall)} | ${endingsCell(overall)} |`,
      )
    }
    for (const entry of group) lines.push(...detail(entry, group, link))
  }

  lines.push(
    ...runtimeSection(
      all.filter(({ results }) => results.mode === RUNTIME),
      link,
    ),
    ...projectSection(
      all.filter(({ results }) => results.mode === PROJECT),
      link,
    ),
  )
  return `${lines.join('\n')}\n`
}

/* -------------------------------------------------------------------------- */
/* The run-time lane                                                          */
/* -------------------------------------------------------------------------- */

/** A time in seconds to two places, as `0.82 s`. */
const precise = (ms) => `${(ms / 1000).toFixed(2)} s`

/** A time's mean and its fastest and slowest run, as a table cell: `0.82 s (0.45–1.20 s)`. */
const timeCell = (mean, span) =>
  mean === null || span === null
    ? '—'
    : `${precise(mean)} (${(span.low / 1000).toFixed(2)}–${precise(span.high)})`

/** The same in a sentence: `0.82 s (0.45 s to 1.20 s)`. */
const timePhrase = (mean, span) =>
  `${precise(mean)} (${precise(span.low)} to ${precise(span.high)})`

/** What the run's request sent as `thinking`, in words. */
const THINKING_WORDS = {
  adaptive: 'adaptive thinking',
  disabled: 'thinking disabled',
  between_tools: 'thinking only between tools',
}

const thinkingPhrase = ({ settings }) =>
  settings.thinking === null ? 'the CLI’s own thinking' : THINKING_WORDS[settings.thinking]

/** The card's framework, how its members were chosen, how many and how long it is. */
function cardPhrase({ card }) {
  const which =
    card.chosen === 'default'
      ? 'of every member it draws'
      : card.chosen === 'list'
        ? 'of a list of members'
        : `of the \`${card.chosen}\` subset`
  return (
    `the ${card.framework} card ${which} (${card.members.length} members, ` +
    `${thousands(card.characters)} characters)`
  )
}

const cardCell = ({ card }) =>
  `${card.framework}, ${card.chosen} (${card.members.length} members, ` +
  `${thousands(card.characters)} characters)`

/** Whether two run-time results files ran under the same condition: runner, effort, thinking and card. */
const sameRuntimeCondition = (one, other) =>
  sameLoopCondition(one, other) &&
  one.settings.thinking === other.settings.thinking &&
  one.card.framework === other.card.framework &&
  one.card.members.join(',') === other.card.members.join(',')

/** What the rates leave out or count against the model, as a sentence; empty when nothing. */
function runtimeCaveats({ runs: total, endings, unreadable }) {
  const parts = [
    endings.refusal > 0 && `${endings.refusal} ended in a refusal`,
    endings.max_tokens > 0 &&
      `${endings.max_tokens} ${endings.max_tokens === 1 ? 'was' : 'were'} cut off at \`max_tokens\``,
    unreadable > 0 && `${unreadable} answered with no whole document`,
    endings.harness > 0 && `${endings.harness} ended in a harness fault, left out of the figures`,
  ].filter(Boolean)
  return parts.length === 0 ? '' : ` Of ${runs(total)}, ${parts.join(', ')}.`
}

/**
 * The run-time lane's number: for each model, runner, thinking, effort and
 * card, its latest run that can be one, by the same rule as the other modes.
 */
function runtimeNumbers(entries, link) {
  const latest = new Map()
  for (const entry of entries) {
    const { model, runner, settings, card } = entry.results
    const key = [
      model,
      runner,
      settings.thinking,
      settings.effort,
      card.framework,
      card.members.join(','),
    ].join(' · ')
    if (canBeTheNumber(entry.results) && !latest.has(key)) latest.set(key, entry)
  }
  if (latest.size === 0) {
    return [
      'No run-time number is recorded: `eval/results/` holds no real run of the run-time lane over ' +
        'every brief. It is measured with `pnpm eval --mode runtime`, with `ANTHROPIC_API_KEY` set ' +
        'or with `--runner cli` and Claude Code signed in.',
    ]
  }
  return [...latest.values()].flatMap(({ file, results }, index) => {
    const { overall } = results.summary
    const rates = RUNTIME_RATES.flatMap(({ key, phrase }) => {
      const count = countOf(overall, key)
      return count === null
        ? []
        : [`${percent(count.successes / count.total)} ${phrase} (${range(count, ' to ')})`]
    })
    const tokens =
      `${thousands(overall.meanInputTokens)} input tokens a run ` +
      `(${thousands(overall.meanCacheReadTokens)} read from the cache, ` +
      `${thousands(overall.meanCacheWriteTokens)} written to it and ` +
      `${thousands(overall.meanUncachedInputTokens)} uncached) and ` +
      `${thousands(overall.meanOutputTokens)} output tokens`
    const end = `${timePhrase(overall.meanWallMs, overall.wallRangeMs)} to the end of the answer`
    const times =
      overall.meanFirstTokenMs === null
        ? `${end}, with no time to the first token`
        : `${timePhrase(overall.meanFirstTokenMs, overall.firstTokenRangeMs)} to the first ` +
          `token and ${end}`
    return [
      ...(index === 0 ? [] : ['']),
      `**The run-time number:** \`${results.model}\`, ${thinkingPhrase(results)}, ` +
        `${effort(results)}, ${through(results)}, ${version(results)}, ${cardPhrase(results)} — ` +
        `${rates.join(', ')}, ${tokens}, ${times} ` +
        `([${fileName(file)}](${link(file)})). Each rate’s range is the 95% interval its ` +
        `${runs(measuredOf(overall))} support, and each time’s runs from the fastest run to ` +
        `the slowest.` +
        runtimeCaveats(overall),
    ]
  })
}

/**
 * What the check said of each answer that was not lawful, one line per run:
 * why there was no whole document, or the first of `checkScreen`'s faults.
 */
function checkMisses(results) {
  return results.records.flatMap((record) => {
    if (record.lawful || record.ended !== 'answered') return []
    const reasons = record.fatal === null ? record.faults : [record.fatal]
    const shown = reasons.slice(0, 3).join('; ')
    const more = reasons.length > 3 ? ` (and ${reasons.length - 3} more)` : ''
    return [`\`${record.brief}\` #${record.run}: ${shown}${more}`]
  })
}

/** The run-time lane: its rates, its condition, and what its misses say. */
const RUNTIME_LANE = {
  rates: RUNTIME_RATES,
  same: sameRuntimeCondition,
  heading: '####',
  misses: (entry) => {
    const misses = checkMisses(entry.results)
    return misses.length === 0
      ? []
      : [
          `Answers that were not lawful in ${fileName(entry.file)}, in the check’s words:`,
          '',
          ...misses.map((miss) => `- ${miss}`),
        ]
  },
}

/**
 * The run-time lane's section: what it measures, its number, and one table
 * per model, latest run first, each results file with a section of its own.
 */
function runtimeSection(entries, link) {
  const lines = [
    '',
    '## The run-time lane',
    '',
    'How a model given only the run-time card and a brief gets on in one request with no tools: how',
    'often the screen it writes is lawful, how often that screen has every part its brief requires,',
    'and what it costs in tokens and time. The card is `runtimeCard` from `@polymorph/screen` for the',
    'framework and members a run names, and the screen is judged with `checkScreen` for the same',
    'ones. One request is its own first shot, so the lawful rate is printed once. Each time is',
    'printed with the fastest and the slowest run beside its mean.',
    '',
    ...runtimeNumbers(entries, link),
  ]
  const groups = new Map()
  for (const entry of entries) {
    const { model, fake } = entry.results
    const key = `${model}${fake ? ' (scripted model: measures the harness, not a model)' : ''}`
    groups.set(key, [...(groups.get(key) ?? []), entry])
  }
  for (const [title, group] of groups) {
    lines.push(
      '',
      `### ${title}`,
      '',
      '| Results | Version | Runner | Thinking | Effort | Card | Briefs × runs | Lawful | Meets brief | Lawful and meets brief | Input tokens | Cache read | Cache written | Uncached | Output tokens | First token | Wall time | Retries | Endings |',
      '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    )
    for (const entry of group) {
      const { results } = entry
      const { overall } = results.summary
      lines.push(
        `| ${resultsCell(entry, link)} | ${version(results)} | ${runnerCell(results)} | ` +
          `${results.settings.thinking ?? 'the CLI’s'} | ${results.settings.effort} | ` +
          `${cardCell(results)} | ${briefsCell(results)} | ` +
          `${RUNTIME_RATES.map(({ key }) => rateCell(overall, key)).join(' | ')} | ` +
          `${thousands(overall.meanInputTokens)} | ${thousands(overall.meanCacheReadTokens)} | ` +
          `${thousands(overall.meanCacheWriteTokens)} | ` +
          `${thousands(overall.meanUncachedInputTokens)} | ` +
          `${thousands(overall.meanOutputTokens)} | ` +
          `${timeCell(overall.meanFirstTokenMs, overall.firstTokenRangeMs)} | ` +
          `${timeCell(overall.meanWallMs, overall.wallRangeMs)} | ` +
          `${retriesCell(overall)} | ${endingsCell(overall)} |`,
      )
    }
    for (const entry of group) lines.push(...detail(entry, group, link, RUNTIME_LANE))
  }
  return lines
}

/* -------------------------------------------------------------------------- */
/* The project lane                                                           */
/* -------------------------------------------------------------------------- */

/**
 * The four rates of the project lane. Each is over the runs judged for it:
 * the builds over the runs whose app was installed, the brief over the runs
 * whose screen could be read.
 */
const PROJECT_RATES = [
  { key: 'lawfulRate', name: 'lawful', title: 'Lawful', phrase: 'end lawful' },
  { key: 'buildsRate', name: 'builds', title: 'Builds', phrase: 'build' },
  {
    key: 'meetsBriefRate',
    name: 'meets brief',
    title: 'Meets brief',
    phrase: 'meet their brief',
    judged: true,
  },
  {
    key: 'allThreeRate',
    name: 'all three',
    title: 'All three',
    phrase: 'do all three',
    judged: true,
  },
]

/** Whether two project results files ran under the same condition: runner, effort and framework. */
const sameProjectCondition = (one, other) =>
  sameLoopCondition(one, other) && one.settings.framework === other.settings.framework

/** The tools a project eval set its app up with, as a phrase. */
const toolsPhrase = ({ project }) =>
  `the tools ${project.tools.version ?? 'of no version'} from ` +
  (project.tools.from === 'checkout' ? 'a checkout' : `a ${project.tools.from}`)

/** Counts summed over a summary, as `name 3, other 1`, most first; `—` when there are none. */
const tallyCell = (counts) => {
  const entries = Object.entries(counts ?? {}).sort(
    ([a, one], [b, other]) => other - one || a.localeCompare(b),
  )
  return entries.length === 0 ? '—' : entries.map(([key, count]) => `${key} ${count}`).join(', ')
}

/** What the rates leave out, as a sentence; empty when nothing. */
function projectCaveats({ runs: total, endings, buildsMeasured, meetsBriefMeasured, measured }) {
  const parts = [
    endings.turns > 0 && `${endings.turns} stopped at the turn budget`,
    endings.time > 0 && `${endings.time} stopped at the time budget`,
    buildsMeasured < measured && `${measured - buildsMeasured} were not built`,
    meetsBriefMeasured < measured &&
      `${measured - meetsBriefMeasured} wrote a screen the requirements cannot read`,
    endings.harness > 0 && `${endings.harness} ended in a harness fault, left out of the figures`,
  ].filter(Boolean)
  return parts.length === 0 ? '' : ` Of ${runs(total)}, ${parts.join(', ')}.`
}

/**
 * The project lane's number: for each model, runner, effort and framework,
 * its latest run that can be one, by the same rule as the other modes.
 */
function projectNumbers(entries, link) {
  const latest = new Map()
  for (const entry of entries) {
    const { model, runner, settings } = entry.results
    const key = [model, runner, settings.effort, settings.framework].join(' · ')
    if (canBeTheNumber(entry.results) && !latest.has(key)) latest.set(key, entry)
  }
  if (latest.size === 0) {
    return [
      'No project number is recorded: `eval/results/` holds no real run of the project lane over ' +
        'every brief. It is measured with `pnpm eval --mode project --runner cli`, with Claude Code ' +
        'signed in, or `--runner codex`, with Codex signed in.',
    ]
  }
  return [...latest.values()].flatMap(({ file, results }, index) => {
    const { overall } = results.summary
    const rates = PROJECT_RATES.flatMap(({ key, phrase }) => {
      const count = countOf(overall, key)
      return count === null
        ? []
        : [
            `${percent(count.successes / count.total)} ${phrase} (${range(count, ' to ')}, ` +
              `${runs(count.total)})`,
          ]
    })
    return [
      ...(index === 0 ? [] : ['']),
      `**The project number:** \`${results.model}\`, ${effort(results)}, ${through(results)}, ` +
        `a ${results.settings.framework} app set up by ${toolsPhrase(results)}, ` +
        `${version(results)} — ${rates.join(', ')}; ` +
        `${thousands(overall.meanInputTokens)} input and ${thousands(overall.meanOutputTokens)} ` +
        `output tokens and ${seconds(overall.meanWallMs)} per run ` +
        `([${fileName(file)}](${link(file)})). Each range is the 95% interval its runs support.` +
        projectCaveats(overall),
    ]
  })
}

/**
 * What made each run's project unlawful, one line per run, in the words of
 * the check that reported it.
 */
function projectMisses(results) {
  return results.records.flatMap((record) => {
    if (record.lawful || record.ended === 'harness' || record.violations.length === 0) return []
    const shown = record.violations.slice(0, 3).join('; ')
    const more = record.violations.length > 3 ? ` (and ${record.violations.length - 3} more)` : ''
    return [`\`${record.brief}\` #${record.run}: ${shown}${more}`]
  })
}

/** The project lane: its rates, its condition, and what made its projects unlawful. */
const PROJECT_LANE = {
  rates: PROJECT_RATES,
  same: sameProjectCondition,
  heading: '####',
  misses: (entry) => {
    const { overall } = entry.results.summary
    const misses = projectMisses(entry.results)
    const skills = Object.keys(overall.skills ?? {})
    return [
      `What the harnesses called in ${fileName(entry.file)}: MCP tools ${tallyCell(overall.mcpCalls)}; ` +
        `\`polymorph\` verbs ${tallyCell(overall.verbs)}; ${overall.shellCommands} shell ` +
        `command${overall.shellCommands === 1 ? '' : 's'}; ` +
        (skills.length === 0 ? 'no skill loaded' : `skills ${tallyCell(overall.skills)}`) +
        (overall.denied === null
          ? '; refused calls not reported.'
          : overall.denied === 0
            ? '.'
            : `; ${overall.denied} tool calls refused.`),
      ...(misses.length === 0
        ? []
        : [
            '',
            'Projects that did not end lawful, in the words of the check:',
            '',
            ...misses.map((miss) => `- ${miss}`),
          ]),
    ]
  },
}

/**
 * The project lane's section: what it measures, its number, and one table
 * per model, latest run first, each results file with a section of its own.
 */
function projectSection(entries, link) {
  const lines = [
    '',
    '## The project lane',
    '',
    'How a harness gets on in a real app with only what the tools wrote there: Claude Code or Codex',
    'is started in an app `polymorph init` set up, given the brief as an ordinary request and nothing',
    'else from the eval, and judged on the project it leaves. How often the project ends lawful, how',
    'often it builds, how often its screen meets the brief, and all three; which MCP tools and',
    '`polymorph` verbs the harness called; and what it cost. A run its budget stopped is judged on',
    'what it left. Each rate is over the runs judged for it.',
    '',
    ...projectNumbers(entries, link),
  ]
  const groups = new Map()
  for (const entry of entries) {
    const { model, fake } = entry.results
    const key = `${model}${fake ? ' (scripted model: measures the harness, not a model)' : ''}`
    groups.set(key, [...(groups.get(key) ?? []), entry])
  }
  for (const [title, group] of groups) {
    lines.push(
      '',
      `### ${title}`,
      '',
      '| Results | Version | Runner | Effort | App | Tools | Agents | Briefs × runs | Lawful | Builds | Meets brief | All three | Input tokens | Output tokens | Wall time | Endings |',
      '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    )
    for (const entry of group) {
      const { results } = entry
      const { overall } = results.summary
      const { project } = results
      lines.push(
        `| ${resultsCell(entry, link)} | ${version(results)} | ${runnerCell(results)} | ` +
          `${results.settings.effort} | ${results.settings.framework}` +
          `${project.installed ? '' : ', not installed'} | ` +
          `${project.tools.version ?? '—'} (${project.tools.from}) | ` +
          `${project.agents.ran ? 'ran' : 'none'} | ${briefsCell(results)} | ` +
          `${PROJECT_RATES.map(({ key }) => rateCell(overall, key)).join(' | ')} | ` +
          `${thousands(overall.meanInputTokens)} | ${thousands(overall.meanOutputTokens)} | ` +
          `${seconds(overall.meanWallMs)} | ${endingsCell(overall)} |`,
      )
    }
    for (const entry of group) lines.push(...detail(entry, group, link, PROJECT_LANE))
  }
  return lines
}

/**
 * What each run's first `validate` call reported when it was not lawful, one
 * line per run, so the page says what to fix and not only how often. A
 * results file that kept no words, only counts, lists nothing here.
 */
function firstShotMisses(results) {
  return results.records.flatMap((record) => {
    const first = (record.misses ?? []).find((miss) => miss.call === 1)
    if (first === undefined) return []
    const reasons = [
      ...(first.fatal === null ? [] : [first.fatal]),
      ...first.faults,
      ...first.violations,
      ...first.contract,
    ]
    const shown = reasons.slice(0, 3).join('; ')
    const more = reasons.length > 3 ? ` (and ${reasons.length - 3} more)` : ''
    return [`\`${record.brief}\` #${record.run}: ${shown}${more}`]
  })
}

export function writeReport({ results = RESULTS, readme = README } = {}) {
  writeFileSync(readme, renderReport(readResults(results), readme))
}

function main(argv) {
  const usage = 'usage: pnpm eval:report [--results <dir>] [--out <file>]'
  const chosen = {}
  for (let index = 0; index < argv.length; index += 2) {
    const [flag, value] = [argv[index], argv[index + 1]]
    if (value === undefined || (flag !== '--results' && flag !== '--out')) {
      console.error(`eval:report: unexpected "${flag}"\n${usage}`)
      process.exit(1)
    }
    chosen[flag === '--results' ? 'results' : 'readme'] = resolve(process.cwd(), value)
  }
  writeReport(chosen)
  console.error(`eval:report: ${relative(process.cwd(), chosen.readme ?? README)} rendered`)
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2))
}
