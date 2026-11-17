import { type ComponentStates } from '@polymorph/react'
import { Markdown } from './Markdown'
import { SOURCES } from './source-list.states'

/** States fixture, from `design/components/markdown.md`'s States table. */

export const PROSE = `The retry schedule is **exponential** with a cap at five attempts. The first retry fires after two seconds and each one after that *doubles* the wait, so the fifth lands about a minute after the first.

Every attempt carries the original \`Idempotency-Key\` header — see [the delivery guide](https://docs.example.org/webhooks/retries) for the exact timings.`

export const STRUCTURE = `## What changed

1. Retries now carry the original idempotency key.
2. The backoff cap moved from three attempts to five.
   - The first retry still fires after two seconds.
   - Each later one doubles the wait.
3. A \`429\` from the receiver is retried; a \`410\` is not.

### Why it matters

A duplicate delivery is refused rather than applied twice, which is what the ~~old~~ previous behaviour could not promise.`

export const FENCE = `Add the header to every request:

\`\`\`ts
const response = await fetch(url, {
  method: 'POST',
  headers: { 'Idempotency-Key': key },
  body,
})
\`\`\`

The key is honoured for 24 hours.`

export const TABLE = `| Attempt | Wait | Cumulative |
| --- | ---: | ---: |
| 1 | 2s | 2s |
| 2 | 4s | 6s |
| 3 | 8s | 14s |
| 4 | 16s | 30s |
| 5 | 32s | 62s |`

export const QUOTE = `> Deliveries are retried with exponential backoff, up to five attempts, with the original idempotency key on every attempt.

---

That line is the whole contract.`

export const CITED = `Retries carry the original idempotency key, so a duplicate delivery is refused rather than applied twice [1]. The key is honoured for a day after the first request that carried it [2].`

export const states: ComponentStates = {
  component: 'Markdown',

  entries: [
    {
      name: 'prose — paragraphs with emphasis, inline code and a link',
      render: () => <Markdown>{PROSE}</Markdown>,
      expect: { 'data-size': 'md', 'data-state': null },
    },
    {
      name: 'structure — headings and a nested list',
      render: () => <Markdown>{STRUCTURE}</Markdown>,
    },
    {
      name: 'a fence — CodeBlock, copyable once closed',
      render: () => <Markdown>{FENCE}</Markdown>,
    },
    {
      name: 'a table — Table, numeric columns right-aligned',
      render: () => <Markdown>{TABLE}</Markdown>,
    },
    {
      name: 'a quote and a rule',
      render: () => <Markdown>{QUOTE}</Markdown>,
    },
    {
      name: 'citations — [n] becomes a Citation when the reply has sources',
      render: () => <Markdown sources={SOURCES}>{CITED}</Markdown>,
    },
    {
      name: 'sm — the secondary step, for reasoning and asides',
      render: () => <Markdown size="sm">{PROSE}</Markdown>,
      expect: { 'data-size': 'sm' },
    },
    {
      name: 'streaming — an open fence and an unclosed emphasis, drawn as they are',
      render: () => (
        <Markdown
          streaming
        >{`Here is the **fix\n\n\`\`\`ts\nconst key = request.headers.get('Idemp`}</Markdown>
      ),
      expect: { 'data-state': 'streaming', 'aria-busy': 'true' },
    },
    {
      name: 'streaming prose — the caret at the end of the last paragraph',
      render: () => <Markdown streaming>{PROSE.slice(0, 90)}</Markdown>,
      expect: { 'data-state': 'streaming' },
    },
    {
      name: 'pending — nothing has landed',
      render: () => <Markdown streaming>{''}</Markdown>,
      expect: { 'data-state': 'streaming', 'data-pending': '' },
    },
  ],

  /*
   * Every state is a prop. Hover and focus belong to Link for links, to
   * CodeBlock and Button for the copy button, and to Citation for citation
   * marks. Each is tested in its own fixture.
   */
  requiredSelectors: [],
}
