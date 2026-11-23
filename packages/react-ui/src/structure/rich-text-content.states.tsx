import { type ComponentStates, RICH_TEXT_FORMAT, type RichTextDocument } from '@polymorph/react'
import { Link } from '../controls/Link'
import { RichTextContent } from './RichTextContent'

/** States fixture, from `design/components/rich-text-content.md`'s States table. */

export const PROSE: RichTextDocument = {
  format: RICH_TEXT_FORMAT,
  blocks: [
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'Retries are now ' },
        { type: 'text', text: 'exponential', marks: [{ type: 'bold' }] },
        { type: 'text', text: ', capped at five attempts, and each one ' },
        { type: 'text', text: 'doubles', marks: [{ type: 'italic' }] },
        { type: 'text', text: ' the wait. The ' },
        { type: 'text', text: 'three-attempt', marks: [{ type: 'strike' }] },
        { type: 'text', text: ' cap is gone.' },
      ],
    },
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'Every attempt carries the original ' },
        { type: 'text', text: 'Idempotency-Key', marks: [{ type: 'code' }] },
        { type: 'text', text: ' header.' },
        { type: 'break' },
        { type: 'text', text: 'The timings are in ' },
        {
          type: 'text',
          text: 'the delivery guide',
          marks: [{ type: 'link', href: 'https://docs.example.org/webhooks/retries' }],
        },
        { type: 'text', text: '.' },
      ],
    },
  ],
}

export const STRUCTURE: RichTextDocument = {
  format: RICH_TEXT_FORMAT,
  blocks: [
    { type: 'heading', level: 1, content: [{ type: 'text', text: 'Webhook retries' }] },
    {
      type: 'paragraph',
      content: [{ type: 'text', text: 'A failed delivery is retried on a schedule.' }],
    },
    { type: 'heading', level: 2, content: [{ type: 'text', text: 'What changed' }] },
    {
      type: 'list',
      ordered: false,
      items: [
        {
          type: 'listItem',
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: 'Retries carry the original idempotency key.' }],
            },
          ],
        },
        {
          type: 'listItem',
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: 'The backoff cap moved to five attempts.' }],
            },
            {
              type: 'list',
              ordered: false,
              items: [
                {
                  type: 'listItem',
                  content: [
                    {
                      type: 'paragraph',
                      content: [{ type: 'text', text: 'The first retry fires after two seconds.' }],
                    },
                  ],
                },
                {
                  type: 'listItem',
                  content: [
                    {
                      type: 'paragraph',
                      content: [{ type: 'text', text: 'Each later one doubles the wait.' }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
    { type: 'heading', level: 3, content: [{ type: 'text', text: 'Rollout' }] },
    {
      type: 'paragraph',
      content: [{ type: 'text', text: 'Steps 1 and 2 shipped last week.' }],
    },
    {
      type: 'list',
      ordered: true,
      start: 3,
      items: [
        {
          type: 'listItem',
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: 'Turn the schedule on for internal endpoints.' }],
            },
          ],
        },
        {
          type: 'listItem',
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: 'Watch the duplicate rate for a day.' }],
            },
          ],
        },
      ],
    },
  ],
}

export const QUOTE: RichTextDocument = {
  format: RICH_TEXT_FORMAT,
  blocks: [
    {
      type: 'blockquote',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Deliveries are retried up to five times.' }],
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Every attempt carries the original key.' }],
        },
      ],
    },
    {
      type: 'paragraph',
      content: [{ type: 'text', text: 'That is the whole contract, and the tests hold it.' }],
    },
  ],
}

export const CODE: RichTextDocument = {
  format: RICH_TEXT_FORMAT,
  blocks: [
    { type: 'paragraph', content: [{ type: 'text', text: 'Add the header to every request:' }] },
    {
      type: 'codeBlock',
      language: 'ts',
      text: "const response = await fetch(url, {\n  method: 'POST',\n  headers: { 'Idempotency-Key': key },\n  body,\n})",
    },
    { type: 'paragraph', content: [{ type: 'text', text: 'The key is honoured for 24 hours.' }] },
  ],
}

export const ENTITIES: RichTextDocument = {
  format: RICH_TEXT_FORMAT,
  blocks: [
    {
      type: 'paragraph',
      content: [
        { type: 'entity', kind: 'user', id: 'u_ada', label: '@Ada Lovelace' },
        { type: 'text', text: ' can you review the fix for ' },
        { type: 'entity', kind: 'issue', id: 'i_142', label: '#142' },
        { type: 'text', text: ' before Friday?' },
      ],
    },
  ],
}

/**
 * Two nodes of types this version does not know, as a later version may write
 * them: a block holding text, and an inline with a label. Typed through
 * `unknown`, because the type names only what this version writes.
 */
export const LATER = {
  format: RICH_TEXT_FORMAT,
  blocks: [
    {
      type: 'callout',
      tone: 'warning',
      content: [{ type: 'text', text: 'Deliveries pause while the migration runs.' }],
    },
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'The migration starts on ' },
        { type: 'date', value: '2026-12-04', label: 'Friday 4 December' },
        { type: 'text', text: '.' },
      ],
    },
  ],
} as unknown as RichTextDocument

export const EMPTY: RichTextDocument = { format: RICH_TEXT_FORMAT, blocks: [] }

export const states: ComponentStates = {
  component: 'RichTextContent',

  entries: [
    {
      name: 'prose — every mark, a hard break and a link',
      render: () => <RichTextContent value={PROSE} />,
      expect: { 'data-size': 'md', 'data-empty': null },
    },
    {
      name: 'structure — headings at three levels, a nested list and a list from 3',
      render: () => <RichTextContent value={STRUCTURE} />,
    },
    {
      name: 'a quote',
      render: () => <RichTextContent value={QUOTE} />,
    },
    {
      name: 'a code block — CodeBlock, copyable, named by its language',
      render: () => <RichTextContent value={CODE} />,
    },
    {
      name: 'entities — the entity token',
      render: () => <RichTextContent value={ENTITIES} />,
    },
    {
      name: 'entities drawn by the app — a person as a Link, an issue left to the token',
      render: () => (
        <RichTextContent
          value={ENTITIES}
          entity={(entity) =>
            entity.kind === 'user' ? (
              <Link href={`/people/${entity.id}`}>{entity.label}</Link>
            ) : undefined
          }
        />
      ),
    },
    {
      name: 'sm — the secondary step, for a note beside its subject',
      render: () => <RichTextContent value={PROSE} size="sm" />,
      expect: { 'data-size': 'sm' },
    },
    {
      name: 'a later version — an unknown block and inline, drawn as their text',
      render: () => <RichTextContent value={LATER} />,
      expect: { 'data-empty': null },
    },
    {
      name: 'empty — the root and nothing in it',
      render: () => <RichTextContent value={EMPTY} />,
      expect: { 'data-empty': '' },
    },
  ],

  /*
   * Every state is a prop. Hover and focus belong to Link for links and to
   * CodeBlock and Button for the copy control, and each is tested in its own
   * fixture.
   */
  requiredSelectors: [],
}
