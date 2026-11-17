/**
 * Diff's rows (`design/components/diff.md`): two texts compared line by line,
 * as data. Every framework's Diff renders these rows, so which lines changed
 * and which unchanged lines are drawn closed are decided and tested once.
 */

/** What a line is to the comparison: in both texts, only in the new one, or only in the old one. */
export type DiffRowKind = 'same' | 'added' | 'removed'

/** One line of the comparison. */
export interface DiffRow {
  kind: DiffRowKind
  /** The line, without its line ending. */
  text: string
  /** Its place in the old text, from 1. An added line has none. */
  beforeLine?: number
  /** Its place in the new text, from 1. A removed line has none. */
  afterLine?: number
}

/**
 * A stretch of consecutive rows, drawn as they are or, when `collapsed`, as one
 * row that says how many unchanged lines it holds.
 */
export interface DiffRun {
  /** The index of the run's first row among all rows, which no other run shares. */
  key: number
  collapsed: boolean
  rows: DiffRow[]
}

/**
 * The most cells the comparison fills: the old text's line count times the new
 * text's, counted between the lines the two texts start with in common and the
 * lines they end with in common. A million cells take a few milliseconds and
 * two megabytes. Past it the comparison is not computed, so no input holds the
 * page.
 */
export const DIFF_LINES_LIMIT = 1_000_000

/**
 * A text's lines. `\r\n` reads as `\n`. A final line ending closes the last
 * line and starts no empty one, so a text with and without it has the same
 * lines. A missing or empty text has no lines.
 */
function linesOf(text: string | null | undefined): string[] {
  if (text === null || text === undefined || text === '') return []
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  if (lines[lines.length - 1] === '') lines.pop()
  return lines
}

/**
 * The line diff of `before` against `after`: every line of both texts, in
 * reading order, as unchanged, added or removed. Within one change the removed
 * lines come before the added ones.
 *
 * The lines the texts start and end with in common are unchanged without a
 * comparison. The lines between are compared by their longest common
 * subsequence, in time and memory proportional to the product of the two line
 * counts. Past `DIFF_LINES_LIMIT` they are not compared: every old line between
 * is removed and every new line between is added, which is a true diff and
 * not the shortest one.
 */
export function diffLines(
  before: string | null | undefined,
  after: string | null | undefined,
): DiffRow[] {
  const old = linesOf(before)
  const next = linesOf(after)

  let start = 0
  while (start < old.length && start < next.length && old[start] === next[start]) start += 1
  let oldEnd = old.length
  let nextEnd = next.length
  while (oldEnd > start && nextEnd > start && old[oldEnd - 1] === next[nextEnd - 1]) {
    oldEnd -= 1
    nextEnd -= 1
  }

  const rows: DiffRow[] = []
  const same = (i: number, j: number) =>
    rows.push({ kind: 'same', text: old[i] as string, beforeLine: i + 1, afterLine: j + 1 })
  const removed = (i: number) =>
    rows.push({ kind: 'removed', text: old[i] as string, beforeLine: i + 1 })
  const added = (j: number) =>
    rows.push({ kind: 'added', text: next[j] as string, afterLine: j + 1 })

  for (let i = 0; i < start; i += 1) same(i, i)

  const height = oldEnd - start
  const width = nextEnd - start
  if (height === 0 || width === 0 || height * width > DIFF_LINES_LIMIT) {
    for (let i = start; i < oldEnd; i += 1) removed(i)
    for (let j = start; j < nextEnd; j += 1) added(j)
  } else {
    // `lengths[i * stride + j]` is the longest common subsequence of the old
    // lines from `start + i` and the new lines from `start + j`. Sixteen bits
    // hold it: it is at most the shorter side, which the limit keeps under 65,536.
    const stride = width + 1
    const lengths = new Uint16Array((height + 1) * stride)
    for (let i = height - 1; i >= 0; i -= 1) {
      for (let j = width - 1; j >= 0; j -= 1) {
        lengths[i * stride + j] =
          old[start + i] === next[start + j]
            ? (lengths[(i + 1) * stride + j + 1] as number) + 1
            : Math.max(
                lengths[(i + 1) * stride + j] as number,
                lengths[i * stride + j + 1] as number,
              )
      }
    }

    // One change's added lines wait until its removed lines are written.
    let pending: number[] = []
    const flush = () => {
      for (const j of pending) added(j)
      pending = []
    }
    let i = 0
    let j = 0
    while (i < height || j < width) {
      if (i < height && j < width && old[start + i] === next[start + j]) {
        flush()
        same(start + i, start + j)
        i += 1
        j += 1
      } else if (
        j === width ||
        (i < height &&
          (lengths[(i + 1) * stride + j] as number) >= (lengths[i * stride + j + 1] as number))
      ) {
        removed(start + i)
        i += 1
      } else {
        pending.push(start + j)
        j += 1
      }
    }
    flush()
  }

  for (let i = oldEnd, j = nextEnd; i < old.length; i += 1, j += 1) same(i, j)
  return rows
}

/**
 * The rows in the runs a Diff draws. `context` unchanged lines stay beside
 * each change, and the unchanged lines past them are one collapsed run: more
 * than `2 × context` between two changes, or more than `context` before the
 * first change or after the last. A stretch that would hide one line is drawn
 * instead, because the row that stands for it would take the same space.
 * `Infinity` collapses nothing. A text with no change is one collapsed run.
 */
export function diffRuns(rows: readonly DiffRow[], context = 3): DiffRun[] {
  const keep = Number.isNaN(context) ? 0 : Math.max(0, Math.floor(context))
  const runs: DiffRun[] = []
  let open: DiffRun | undefined
  const draw = (from: number, to: number) => {
    if (to <= from) return
    if (open === undefined) {
      open = { key: from, collapsed: false, rows: [] }
      runs.push(open)
    }
    // One row at a time: a spread of a long slice can pass more arguments than an engine takes.
    for (let index = from; index < to; index += 1) open.rows.push(rows[index] as DiffRow)
  }

  let at = 0
  while (at < rows.length) {
    if (rows[at]?.kind !== 'same') {
      draw(at, at + 1)
      at += 1
      continue
    }
    let end = at
    while (end < rows.length && rows[end]?.kind === 'same') end += 1
    const head = at > 0 ? Math.min(keep, end - at) : 0
    const tail = end < rows.length ? Math.min(keep, end - at - head) : 0
    if (end - at - head - tail < 2) {
      draw(at, end)
    } else {
      draw(at, at + head)
      runs.push({ key: at + head, collapsed: true, rows: rows.slice(at + head, end - tail) })
      open = undefined
      draw(end - tail, end)
    }
    at = end
  }
  return runs
}
