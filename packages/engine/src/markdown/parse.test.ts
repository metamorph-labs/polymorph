import { describe, expect, it } from 'vitest'

import { parseInlines, parseMarkdown, safeHref } from './parse'

/**
 * The parser every framework's Markdown renders from. The members' tests
 * check which member draws each kind; these check the tree.
 */

/** The React fixture's `structure` and `table` entries' sources. */
const STRUCTURE = `## What changed

1. Retries now carry the original idempotency key.
2. The backoff cap moved from three attempts to five.
   - The first retry still fires after two seconds.
   - Each later one doubles the wait.
3. A \`429\` from the receiver is retried; a \`410\` is not.

### Why it matters

A duplicate delivery is refused rather than applied twice, which is what the ~~old~~ previous behaviour could not promise.`

const TABLE = `| Attempt | Wait | Cumulative |
| --- | ---: | ---: |
| 1 | 2s | 2s |
| 2 | 4s | 6s |
| 3 | 8s | 14s |
| 4 | 16s | 30s |
| 5 | 32s | 62s |`

describe('the parser', () => {
  it('parses the block syntax a model writes', () => {
    const blocks = parseMarkdown(STRUCTURE)
    expect(blocks.map((block) => block.kind)).toEqual(['heading', 'list', 'heading', 'paragraph'])
    const list = blocks[1]
    expect(list?.kind === 'list' && list.ordered).toBe(true)
    expect(list?.kind === 'list' && list.items).toHaveLength(3)
    const second = list?.kind === 'list' ? list.items[1] : []
    expect(second?.map((block) => block.kind)).toEqual(['paragraph', 'list'])
  })

  it('parses a pipe table with its alignments', () => {
    const [table] = parseMarkdown(TABLE)
    expect(table?.kind).toBe('table')
    if (table?.kind !== 'table') return
    expect(table.align).toEqual([null, 'end', 'end'])
    expect(table.rows).toHaveLength(5)
  })

  it('keeps an open fence as the code received so far, and closes it at the closing fence', () => {
    const [open] = parseMarkdown('```ts\nconst a = 1')
    expect(open).toEqual({ kind: 'code', lang: 'ts', text: 'const a = 1', closed: false })
    const [closed] = parseMarkdown('```ts\nconst a = 1\n```')
    expect(closed?.kind === 'code' && closed.closed).toBe(true)
  })

  it('parses an unfinished emphasis as literal text', () => {
    expect(parseInlines('a **bold')).toEqual([{ kind: 'text', text: 'a **bold' }])
    expect(parseInlines('a **bold** word')).toEqual([
      { kind: 'text', text: 'a ' },
      { kind: 'strong', children: [{ kind: 'text', text: 'bold' }] },
      { kind: 'text', text: ' word' },
    ])
    // snake_case is three words, not an emphasis.
    expect(parseInlines('use snake_case_names here')).toEqual([
      { kind: 'text', text: 'use snake_case_names here' },
    ])
  })

  it('parses a citation only when the reply has that many sources', () => {
    expect(parseInlines('as shown [2].', { citations: 3 })).toEqual([
      { kind: 'text', text: 'as shown ' },
      { kind: 'citation', index: 2 },
      { kind: 'text', text: '.' },
    ])
    expect(parseInlines('as shown [2].', { citations: 1 })).toEqual([
      { kind: 'text', text: 'as shown [2].' },
    ])
    // A bracket that opens a link is a link, however many sources there are.
    expect(parseInlines('[1](https://a.example)', { citations: 3 })[0]?.kind).toBe('link')
  })

  it('rejects unsafe link targets', () => {
    expect(safeHref('https://a.example/x')).toBe('https://a.example/x')
    expect(safeHref('/relative')).toBe('/relative')
    expect(safeHref('mailto:a@example.org')).toBe('mailto:a@example.org')
    expect(safeHref('javascript:alert(1)')).toBeNull()
    expect(safeHref('JAVA\u0000SCRIPT:alert(1)')).toBeNull()
    expect(safeHref('data:text/html,hi')).toBeNull()
  })
})
