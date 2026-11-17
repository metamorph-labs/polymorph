import { describe, expect, it } from 'vitest'

import {
  DIFF_LINES_LIMIT,
  diffLines,
  diffRuns,
  type DiffRow,
  type DiffRun,
} from './src/conventions/diff'

/**
 * Diff's rows: which lines a comparison calls unchanged, added and removed,
 * and which unchanged lines a Diff draws closed. It lives at the package root,
 * not in `src/`, because `src/**` is the engine's browser project and these
 * functions read no document.
 */

/** A row as one string: its mark, its line numbers and its text. */
const spell = (row: DiffRow): string => {
  const mark = row.kind === 'added' ? '+' : row.kind === 'removed' ? '-' : ' '
  return `${mark}${row.beforeLine ?? '·'}/${row.afterLine ?? '·'} ${row.text}`
}

const diff = (before: string | null | undefined, after: string | null | undefined): string[] =>
  diffLines(before, after).map(spell)

/** The old text and the new text, rebuilt from the rows. */
const sides = (rows: readonly DiffRow[]) => ({
  before: rows.filter((row) => row.kind !== 'added').map((row) => row.text),
  after: rows.filter((row) => row.kind !== 'removed').map((row) => row.text),
})

describe('diffLines', () => {
  it('has no rows when neither side has a line', () => {
    expect(diffLines(null, null)).toEqual([])
    expect(diffLines(undefined, '')).toEqual([])
    expect(diffLines('', '')).toEqual([])
  })

  it('reads equal sides as unchanged lines, numbered on both sides', () => {
    expect(diff('a\nb', 'a\nb')).toEqual([' 1/1 a', ' 2/2 b'])
  })

  it('reads a missing or empty old side as every line added', () => {
    expect(diff(null, 'a\nb')).toEqual(['+·/1 a', '+·/2 b'])
    expect(diff(undefined, 'a')).toEqual(['+·/1 a'])
    expect(diff('', 'a')).toEqual(['+·/1 a'])
  })

  it('reads a missing or empty new side as every line removed', () => {
    expect(diff('a\nb', null)).toEqual(['-1/· a', '-2/· b'])
    expect(diff('a', '')).toEqual(['-1/· a'])
  })

  it('finds a change in the middle, the removed line before the added one', () => {
    expect(diff('a\nb\nc', 'a\nB\nc')).toEqual([' 1/1 a', '-2/· b', '+·/2 B', ' 3/3 c'])
  })

  it('finds a line added and a line removed, and renumbers the rest', () => {
    expect(diff('a\nc', 'a\nb\nc')).toEqual([' 1/1 a', '+·/2 b', ' 2/3 c'])
    expect(diff('a\nb\nc', 'a\nc')).toEqual([' 1/1 a', '-2/· b', ' 3/2 c'])
  })

  it('writes the removed lines of one change before its added lines', () => {
    expect(diff('a\nb\nc\nz', 'x\ny\nz')).toEqual([
      '-1/· a',
      '-2/· b',
      '-3/· c',
      '+·/1 x',
      '+·/2 y',
      ' 4/3 z',
    ])
    // A change the comparison walks as removed, added, removed is still written in that order.
    expect(diff('k\na\nb\nm\nn', 'k\nb\nc\nd\nn').filter((row) => !row.startsWith(' '))).toEqual([
      '-2/· a',
      '-4/· m',
      '+·/3 c',
      '+·/4 d',
    ])
  })

  it('reads a final line ending as the end of the last line, not as an empty line', () => {
    expect(diff('a\nb', 'a\nb\n')).toEqual([' 1/1 a', ' 2/2 b'])
    expect(diff('a\n', 'a')).toEqual([' 1/1 a'])
    // A second line ending is an empty line.
    expect(diff('a\n', 'a\n\n')).toEqual([' 1/1 a', '+·/2 '])
    expect(diff('\n', null)).toEqual(['-1/· '])
  })

  it('reads \\r\\n as \\n', () => {
    expect(diff('a\r\nb\r\n', 'a\nb')).toEqual([' 1/1 a', ' 2/2 b'])
    expect(diff('a\r\nb', 'a\r\nc')).toEqual([' 1/1 a', '-2/· b', '+·/2 c'])
  })

  it('keeps the most lines it can among repeated ones', () => {
    const rows = diffLines('}\n}\n}', '}\n}')
    expect(rows.filter((row) => row.kind === 'same')).toHaveLength(2)
    expect(rows.filter((row) => row.kind === 'removed')).toHaveLength(1)

    const braces = diffLines('{\n  a\n}\n{\n  b\n}', '{\n  a\n}\n{\n  c\n}\n{\n  b\n}')
    expect(braces.filter((row) => row.kind === 'removed')).toHaveLength(0)
    expect(braces.filter((row) => row.kind === 'added').map((row) => row.text)).toHaveLength(3)
    expect(sides(braces).after.join('\n')).toBe('{\n  a\n}\n{\n  c\n}\n{\n  b\n}')
  })

  it('returns rows that rebuild both texts, in order', () => {
    const before = 'one\ntwo\nthree\nfour\nfive\nsix'
    const after = 'zero\none\nthree\nfour\n4.5\nsix\nseven'
    const rows = diffLines(before, after)
    expect(sides(rows).before.join('\n')).toBe(before)
    expect(sides(rows).after.join('\n')).toBe(after)
    expect(rows.filter((row) => row.kind === 'same').map((row) => row.text)).toEqual([
      'one',
      'three',
      'four',
      'six',
    ])
  })

  it('returns the same rows for the same texts', () => {
    const before = 'a\nb\na\nb\na'
    const after = 'b\na\nb\na\nb'
    expect(diffLines(before, after)).toEqual(diffLines(before, after))
  })

  it('past the limit, removes every old line between the common ends and adds every new one', () => {
    const side = Math.ceil(Math.sqrt(DIFF_LINES_LIMIT)) + 1
    // Every other line between is shared, so a comparison would keep them.
    const between = (name: string) =>
      Array.from({ length: side }, (_, index) =>
        index % 2 === 1 && index < side - 1 ? 'shared' : `${name} ${index}`,
      )
    const old = between('old')
    const next = between('new')
    const rows = diffLines(
      ['first', ...old, 'last'].join('\n'),
      ['first', ...next, 'last'].join('\n'),
    )

    expect(spell(rows[0] as DiffRow)).toBe(' 1/1 first')
    expect(spell(rows[rows.length - 1] as DiffRow)).toBe(` ${side + 2}/${side + 2} last`)
    const changed = rows.slice(1, -1)
    expect(changed).toHaveLength(2 * side)
    expect(changed.slice(0, side).every((row) => row.kind === 'removed')).toBe(true)
    expect(changed.slice(side).every((row) => row.kind === 'added')).toBe(true)
    expect(sides(rows)).toEqual({
      before: ['first', ...old, 'last'],
      after: ['first', ...next, 'last'],
    })
  })

  it('compares two texts at the limit', () => {
    const side = Math.floor(Math.sqrt(DIFF_LINES_LIMIT))
    const old = Array.from({ length: side }, (_, index) =>
      index % 2 === 0 ? 'shared' : `old ${index}`,
    )
    const next = Array.from({ length: side }, (_, index) =>
      index % 2 === 1 ? 'shared' : `new ${index}`,
    )
    const rows = diffLines(old.join('\n'), next.join('\n'))
    expect(rows.filter((row) => row.kind === 'same').length).toBeGreaterThan(side / 2 - 2)
  })
})

/** The runs as strings: a drawn run's row marks, or a collapsed run's count. */
const shape = (runs: readonly DiffRun[]): string[] =>
  runs.map((run) =>
    run.collapsed
      ? `(${run.rows.length})`
      : run.rows
          .map((row) => (row.kind === 'same' ? '=' : row.kind === 'added' ? '+' : '-'))
          .join(''),
  )

/** `count` unchanged lines named by `name`. */
const lines = (name: string, count: number): string[] =>
  Array.from({ length: count }, (_, index) => `${name} ${index}`)

describe('diffRuns', () => {
  const rows = diffLines(
    [...lines('head', 10), 'old', ...lines('middle', 10), 'gone', ...lines('tail', 10)].join('\n'),
    [...lines('head', 10), 'new', ...lines('middle', 10), ...lines('tail', 10)].join('\n'),
  )

  it('keeps three unchanged lines beside each change and collapses the rest', () => {
    expect(shape(diffRuns(rows))).toEqual(['(7)', '===-+===', '(4)', '===-===', '(7)'])
  })

  it('gives every run the index of its first row, and every row to one run', () => {
    const runs = diffRuns(rows)
    expect(runs.map((run) => run.key)).toEqual([0, 7, 15, 19, 26])
    expect(runs.flatMap((run) => run.rows)).toEqual(rows)
    expect(
      runs
        .filter((run) => run.collapsed)
        .every((run) => run.rows.every((row) => row.kind === 'same')),
    ).toBe(true)
  })

  it('draws a stretch between two changes that context covers', () => {
    expect(shape(diffRuns(rows, 5))).toEqual(['(5)', '=====-+==========-=====', '(5)'])
  })

  it('draws a stretch that would hide one line', () => {
    const near = diffLines(
      ['a', ...lines('same', 7), 'b'].join('\n'),
      ['A', ...lines('same', 7), 'B'].join('\n'),
    )
    expect(shape(diffRuns(near))).toEqual(['-+=======-+'])
    const far = diffLines(
      ['a', ...lines('same', 8), 'b'].join('\n'),
      ['A', ...lines('same', 8), 'B'].join('\n'),
    )
    expect(shape(diffRuns(far))).toEqual(['-+===', '(2)', '===-+'])
  })

  it('collapses every unchanged line with no context', () => {
    expect(shape(diffRuns(rows, 0))).toEqual(['(10)', '-+', '(10)', '-', '(10)'])
  })

  it('collapses nothing with infinite context', () => {
    const runs = diffRuns(rows, Infinity)
    expect(runs).toHaveLength(1)
    expect(runs[0]?.collapsed).toBe(false)
    expect(runs[0]?.rows).toEqual(rows)
  })

  it('reads a context that is not a count as the count below it, and never below none', () => {
    expect(shape(diffRuns(rows, 3.9))).toEqual(shape(diffRuns(rows, 3)))
    expect(shape(diffRuns(rows, -2))).toEqual(shape(diffRuns(rows, 0)))
    expect(shape(diffRuns(rows, Number.NaN))).toEqual(shape(diffRuns(rows, 0)))
  })

  it('draws a text with no change as one collapsed run', () => {
    expect(shape(diffRuns(diffLines('a\nb\nc', 'a\nb\nc')))).toEqual(['(3)'])
    expect(shape(diffRuns(diffLines('a', 'a')))).toEqual(['='])
  })

  it('draws a text whose every line changed as one run', () => {
    expect(shape(diffRuns(diffLines('a\nb', 'c\nd')))).toEqual(['--++'])
  })

  it('has no runs for no rows', () => {
    expect(diffRuns([])).toEqual([])
  })
})
