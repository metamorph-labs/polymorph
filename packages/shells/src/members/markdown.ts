import {
  cond,
  describeMember,
  each,
  el,
  flag,
  identity,
  lit,
  member,
  text,
  type Node,
} from '../dsl'
import { SOURCES } from './source-list'

/** The React fixture's sources, one per entry. */
export const PROSE =
  'The retry schedule is **exponential** with a cap at five attempts. The first retry fires after two seconds and each one after that *doubles* the wait, so the fifth lands about a minute after the first.\n\nEvery attempt carries the original `Idempotency-Key` header — see [the delivery guide](https://docs.example.org/webhooks/retries) for the exact timings.'

const STRUCTURE =
  '## What changed\n\n1. Retries now carry the original idempotency key.\n2. The backoff cap moved from three attempts to five.\n   - The first retry still fires after two seconds.\n   - Each later one doubles the wait.\n3. A `429` from the receiver is retried; a `410` is not.\n\n### Why it matters\n\nA duplicate delivery is refused rather than applied twice, which is what the ~~old~~ previous behaviour could not promise.'

const FENCE =
  "Add the header to every request:\n\n```ts\nconst response = await fetch(url, {\n  method: 'POST',\n  headers: { 'Idempotency-Key': key },\n  body,\n})\n```\n\nThe key is honoured for 24 hours."

const TABLE =
  '| Attempt | Wait | Cumulative |\n| --- | ---: | ---: |\n| 1 | 2s | 2s |\n| 2 | 4s | 6s |\n| 3 | 8s | 14s |\n| 4 | 16s | 30s |\n| 5 | 32s | 62s |'

const QUOTE =
  '> Deliveries are retried with exponential backoff, up to five attempts, with the original idempotency key on every attempt.\n\n---\n\nThat line is the whole contract.'

const CITED =
  'Retries carry the original idempotency key, so a duplicate delivery is refused rather than applied twice [1]. The key is honoured for a day after the first request that carried it [2].'

/** The streaming caret: decorative, at the end of the latest content. */
const caret: Node = el('span', {
  part: 'caret',
  class: ['caret'],
  attrs: { 'aria-hidden': lit('true') },
})

/** The props every recursive part passes down. */
const passed = { size: 'size', sources: 'sources', shallowest: 'shallowest' }

/** A cell's content, or a paragraph's: the inline nodes, through the inline part. */
const inlines = (nodes: string): Node => member('MarkdownInlines', { nodes, sources: 'sources' })

/** A table's cell, right-aligned when its column is (`---:`). */
const cell = (part: 'TableHeader' | 'TableCell', of: string): Node =>
  member(part, { numeric: "block.align[column] === 'end'" }, { slots: { default: [inlines(of)] } })

/**
 * The block part: each block of a reply, as the vocabulary member that draws
 * its kind. A quote and a list item hold blocks of their own, which it renders
 * through itself. The caret goes in the last block that can hold inline
 * content, so it is passed down to the last block only.
 */
const blocks = {
  name: 'Blocks',
  public: false,
  purpose: 'a reply’s blocks, each as the member that draws its kind',
  props: {
    blocks: { type: 'MarkdownBlock[]' },
    size: { type: "'sm' | 'md'" },
    sources: { type: 'CitationSource[]' },
    shallowest: {
      type: 'number',
      doc: 'The shallowest heading depth in the reply, which is level 2.',
    },
    caret: { type: 'boolean', doc: 'Whether the caret ends the last block.' },
  },
  template: each(
    'blocks',
    'block',
    'index',
    [
      cond(
        "block.kind === 'paragraph'",
        [
          member(
            'Text',
            { size: 'size' },
            {
              slots: {
                default: [
                  inlines('block.children'),
                  cond('caret && index === blocks.length - 1', [caret]),
                ],
              },
            },
          ),
        ],
        "block.kind === 'heading'",
        [
          // Levels are relative: the reply's shallowest heading is level 2, never the page's 1.
          member(
            'Heading',
            { level: 'markdownHeadingLevel(block.depth, shallowest)' },
            { slots: { default: [text('inlineText(block.children)')] } },
          ),
        ],
        "block.kind === 'code'",
        [
          // A partial command is not worth copying, so the copy control waits for the closing fence.
          member(
            'CodeBlock',
            { copyable: 'block.closed' },
            { slots: { default: [text('block.text')] } },
          ),
        ],
        "block.kind === 'quote'",
        [
          el('blockquote', { part: 'quote', class: ['quote'] }, [
            member('MarkdownBlocks', {
              blocks: 'block.children',
              ...passed,
              caret: 'caret && index === blocks.length - 1',
            }),
          ]),
        ],
        "block.kind === 'list'",
        [
          el(
            { expr: "block.ordered ? 'ol' : 'ul'" },
            {
              part: 'list',
              class: ['list'],
              attrs: { start: 'block.ordered && block.start !== 1 ? block.start : undefined' },
            },
            [
              each(
                'block.items',
                'item',
                'position',
                [
                  el('li', { part: 'item', class: ['item'] }, [
                    member('MarkdownBlocks', {
                      blocks: 'item',
                      ...passed,
                      caret:
                        'caret && index === blocks.length - 1 && position === block.items.length - 1',
                    }),
                  ]),
                ],
                'position',
              ),
            ],
          ),
        ],
        "block.kind === 'table'",
        [
          member(
            'Table',
            {},
            {
              slots: {
                default: [
                  member(
                    'TableHead',
                    {},
                    {
                      slots: {
                        default: [
                          member(
                            'TableRow',
                            {},
                            {
                              slots: {
                                default: [
                                  each(
                                    'block.header',
                                    'head',
                                    'column',
                                    [cell('TableHeader', 'head')],
                                    'column',
                                  ),
                                ],
                              },
                            },
                          ),
                        ],
                      },
                    },
                  ),
                  member(
                    'TableBody',
                    {},
                    {
                      slots: {
                        default: [
                          each(
                            'block.rows',
                            'row',
                            'line',
                            [
                              member(
                                'TableRow',
                                {},
                                {
                                  slots: {
                                    default: [
                                      each(
                                        'row',
                                        'value',
                                        'column',
                                        [cell('TableCell', 'value')],
                                        'column',
                                      ),
                                    ],
                                  },
                                },
                              ),
                            ],
                            'line',
                          ),
                        ],
                      },
                    },
                  ),
                ],
              },
            },
          ),
        ],
        "block.kind === 'rule'",
        [member('Separator')],
      ),
    ],
    'index',
  ),
}

/**
 * The inline part: each inline node of a block, as the member or element that
 * draws its kind. Emphasis holds inline nodes of its own, which it renders
 * through itself. Raw HTML is already text, and an unsafe link target already
 * a label, by the parser.
 */
const inline = {
  name: 'Inlines',
  public: false,
  purpose: 'a block’s inline nodes, each as the member or element that draws its kind',
  props: {
    nodes: { type: 'MarkdownInline[]' },
    sources: { type: 'CitationSource[]' },
  },
  template: each(
    'nodes',
    'node',
    'index',
    [
      cond(
        "node.kind === 'text'",
        [text('node.text')],
        "node.kind === 'code'",
        [member('Code', {}, { slots: { default: [text('node.text')] } })],
        "node.kind === 'strong'",
        [el('strong', {}, [inlines('node.children')])],
        "node.kind === 'em'",
        [el('em', {}, [inlines('node.children')])],
        "node.kind === 'strike'",
        [el('s', {}, [inlines('node.children')])],
        "node.kind === 'break'",
        [el('br')],
        "node.kind === 'link'",
        [
          // A link's label is its text: emphasis inside it is flattened, and the link stays a link.
          member(
            'Link',
            { href: 'node.href', external: '/^(https?:|mailto:|\\/\\/)/i.test(node.href)' },
            { slots: { default: [text('inlineText(node.children)')] } },
          ),
        ],
        "node.kind === 'image'",
        [
          // A model's image is content: the alt is its own description, and an empty alt is decoration.
          el('img', {
            part: 'image',
            class: ['image'],
            attrs: {
              src: 'node.src',
              alt: 'node.alt',
              loading: lit('lazy'),
              draggable: lit('false'),
            },
          }),
        ],
        "node.kind === 'citation' && sources[node.index - 1] !== undefined",
        [member('Citation', { index: 'node.index', source: 'sources[node.index - 1]!' })],
        "node.kind === 'citation'",
        [text('`[${node.index}]`')],
      ),
    ],
    'index',
  ),
}

/**
 * The body: the parsed reply, and the caret after its last block when that
 * block holds no prose. A part of its own, so the parse follows the source as
 * a prop and runs once per change.
 */
const body = {
  name: 'Body',
  public: false,
  purpose: 'the parsed reply and its caret',
  props: {
    source: { type: 'string', doc: 'The markdown received so far.' },
    size: { type: "'sm' | 'md'" },
    sources: { type: 'CitationSource[]' },
    streaming: { type: 'boolean' },
  },
  derived: {
    blocks: 'parseMarkdown(source, { citations: sources.length })',
    shallowest: 'markdownShallowestHeading(blocks)',
  },
  template: [
    member('MarkdownBlocks', { blocks: 'blocks', ...passed, caret: 'streaming' }),
    cond('streaming && !markdownEndsInProse(blocks)', [
      member('Text', { size: 'size' }, { slots: { default: [caret] } }),
    ]),
  ],
}

/** The source the caller wrote, read from the default slot's text. */
const SOURCE = 'slotText(slots.default)'
const PENDING = `streaming && ${SOURCE}.trim() === ''`

/**
 * Markdown (`design/components/markdown.md`): a model's markdown, rendered
 * through the vocabulary, so a `##` is a Heading, a fence a CodeBlock,
 * backticks a Code, pipes a Table and brackets a Link, under the same theme.
 * The parser and the decisions it renders by (a heading's level, where the
 * caret goes) are the engine's (`@polymorph/engine/markdown`), which the React
 * member renders by too. It tolerates streaming: an open fence is a code block
 * of what has arrived, an unclosed `**` is two asterisks, and the caret sits at
 * the end of the latest content; nothing at all yet is a text Skeleton.
 */
export default describeMember({
  member: 'Markdown',
  dir: 'ai',
  recipe: 'ai/markdown',
  types: {
    MarkdownSize: "NonNullable<MarkdownProps['size']>",
  },
  uses: ['CitationSource'],
  defaults: { streaming: 'false', size: lit('md'), sources: '() => []' },
  template: el(
    'div',
    {
      part: 'root',
      class: ['root'],
      attrs: {
        'data-size': 'size',
        'data-state': "streaming ? 'streaming' : undefined",
        'data-pending': flag(PENDING),
        'aria-busy': 'streaming ? true : undefined',
        ...identity('Markdown'),
      },
    },
    [
      cond(
        PENDING,
        [member('Skeleton', { shape: lit('text'), textStep: 'size', width: '9' })],
        [
          member('MarkdownBody', {
            source: SOURCE,
            size: 'size',
            sources: 'sources',
            streaming: 'streaming',
          }),
        ],
      ),
    ],
  ),
  parts: [body, blocks, inline],
  states: [
    {
      name: 'prose — paragraphs with emphasis, inline code and a link',
      slots: { default: [PROSE] },
      expect: { 'data-size': 'md', 'data-state': null },
    },
    { name: 'structure — headings and a nested list', slots: { default: [STRUCTURE] } },
    { name: 'a fence — CodeBlock, copyable once closed', slots: { default: [FENCE] } },
    { name: 'a table — Table, numeric columns right-aligned', slots: { default: [TABLE] } },
    { name: 'a quote and a rule', slots: { default: [QUOTE] } },
    {
      name: 'citations — [n] becomes a Citation when the reply has sources',
      props: { sources: SOURCES },
      slots: { default: [CITED] },
    },
    {
      name: 'sm — the secondary step, for reasoning and asides',
      props: { size: 'sm' },
      slots: { default: [PROSE] },
      expect: { 'data-size': 'sm' },
    },
    {
      name: 'streaming — an open fence and an unclosed emphasis, drawn as they are',
      props: { streaming: true },
      slots: { default: ["Here is the **fix\n\n```ts\nconst key = request.headers.get('Idemp"] },
      expect: { 'data-state': 'streaming', 'aria-busy': 'true' },
    },
    {
      name: 'streaming prose — the caret at the end of the last paragraph',
      props: { streaming: true },
      slots: { default: [PROSE.slice(0, 90)] },
      expect: { 'data-state': 'streaming' },
    },
    {
      name: 'pending — nothing has landed',
      props: { streaming: true },
      slots: { default: [''] },
      expect: { 'data-state': 'streaming', 'data-pending': '' },
    },
  ],
})
