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
    phrase: 'lawful on the first `validate` call',
  },
  { key: 'lawfulRate', name: 'lawful', phrase: 'lawful at the end' },
  { key: 'meetsBriefRate', name: 'meets brief', phrase: 'meeting their brief', judged: true },
  {
    key: 'lawfulAndMeetsBriefRate',
    name: 'lawful and meets brief',
    phrase: 'lawful and meeting their brief',
    judged: true,
  },
]

/** The runs a summary's rates are over: every run that was not a harness fault. */
const measuredOf = (summary) => summary.measured ?? summary.runs - summary.endings.harness

/** A rate as successes out of the measured runs, or `null` where the summary has no such rate. */
function countOf(summary, key) {
  const [rate, total] = [summary[key], measuredOf(summary)]
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

/** The effort the run asked for; `default` asked for none, which the CLI fills with its own. */
const effort = ({ runner, settings }) =>
  settings.effort === 'default' && runner === 'cli'
    ? 'the CLI’s default effort'
    : `${settings.effort} effort`

/** How the model was reached, as the number says it. */
const through = ({ runner, cliVersion }) =>
  runner === 'cli' ? `through Claude Code ${cliVersion}` : 'through the Messages API'

/** How the model was reached, as a table cell says it. */
const runnerCell = ({ runner, cliVersion }) => (runner === 'cli' ? `CLI ${cliVersion}` : 'API')

/** Why a partial file's eval stopped, as its row says. */
const STOPPED = {
  api: 'the API failed',
  cli: 'the CLI failed',
  'usage-limit': 'stopped at a usage limit',
  'tokens-per-run': 'stopped at the per-run token ceiling',
  'tokens-total': 'stopped at the total token ceiling',
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
function resolutionLines({ summary }) {
  const total = measuredOf(summary.overall)
  const ranges = RATES.flatMap(({ key, name }) => {
    const count = countOf(summary.overall, key)
    if (count === null) return []
    const { below, above } = resolution(count.successes, count.total)
    const from = percent((below === null ? 0 : below + 1) / total)
    const to = percent((above === null ? total : above - 1) / total)
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

/**
 * The run a results file is compared with: the next older complete file of
 * the same model, mode, runner and effort over the same briefs.
 */
function previousOf(entry, group) {
  const chosen = (results) => results.summary.briefs.map(({ brief }) => brief).join(',')
  const { results } = entry
  if (results.partial) return undefined
  return group
    .slice(group.indexOf(entry) + 1)
    .find(
      ({ results: other }) =>
        !other.partial &&
        other.fake === results.fake &&
        other.runner === results.runner &&
        other.settings.effort === results.settings.effort &&
        chosen(other) === chosen(results),
    )
}

/** Each rate of a results file against the run before it, and whether the two samples tell them apart. */
function comparisonLines(entry, previous, link) {
  const [now, before] = [entry.results.summary.overall, previous.results.summary.overall]
  const lines = RATES.flatMap(({ key, name, judged }) => {
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

/** One row per brief: its runs, its four rates as counts with their intervals, and what was not met. */
function briefRows({ summary }) {
  return [
    '| Brief | Runs | First shot lawful | Lawful | Meets brief | Lawful and meets brief | Requirements not met |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    ...summary.briefs.map((brief) => {
      const failed = Object.entries(brief.failedRequirements ?? {}).map(
        ([key, count]) => `\`${key.slice(brief.brief.length + 1)}\` ${count}`,
      )
      return (
        `| ${brief.brief} | ${measuredOf(brief)} | ` +
        `${RATES.map(({ key }) => countCell(brief, key)).join(' | ')} | ` +
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

/**
 * A results file's own section: what its sample can tell apart, how it
 * compares with the run before it, its briefs, the requirements its screens
 * did not meet and its first-shot misses. A file with no finished run has
 * none.
 */
function detail(entry, group, link) {
  const { results } = entry
  if (measuredOf(results.summary.overall) === 0) return []
  const previous = previousOf(entry, group)
  const paragraphs = [
    resolutionLines(results),
    previous === undefined ? [] : comparisonLines(entry, previous, link),
    [...briefRows(results), ...briefResolution(results).flatMap((line) => ['', line])],
  ]
  const failed = unmetLines(results)
  if (failed.length > 0) {
    paragraphs.push(['Requirements a screen did not meet, most often missed first:', '', ...failed])
  }
  const misses = firstShotMisses(results)
  if (misses.length > 0) {
    paragraphs.push([
      `First-shot misses in ${fileName(entry.file)}, in the validator’s words:`,
      '',
      ...misses.map((miss) => `- ${miss}`),
    ])
  }
  return [
    '',
    `### ${fileName(entry.file)}`,
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
export function renderReport(entries, readme) {
  const link = (file) => relative(dirname(readme), file).split('\\').join('/')
  const lines = [
    '# The agent eval',
    '',
    '<!-- Rendered by `pnpm eval:report` from the results files. Edit `eval/report.mjs`, not this page. -->',
    '',
    'How an agent given a screen brief and the system’s own tools gets on: how often its first',
    '`validate` call is lawful, how many calls it takes to get there, how often it ends lawful, how',
    'often the screen it hands back has every part its brief requires, and what that costs. The',
    'model is reached through the Messages API or through the Claude Code CLI, measured the same',
    `way. [docs/verification.md](${link(VERIFICATION)}) says what each number measures, how to run`,
    'the eval with either runner and what a run costs.',
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

  return `${lines.join('\n')}\n`
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
