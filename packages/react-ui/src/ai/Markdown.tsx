import {
  inlineText,
  type MarkdownBlock,
  markdownEndsInProse,
  markdownHeadingLevel,
  type MarkdownInline,
  markdownShallowestHeading,
  memberAttr,
  parseMarkdown,
} from '@polymorph/react'
import type { ReactNode } from 'react'

import { Link } from '../controls/Link'
import { Code } from '../structure/Code'
import { CodeBlock } from '../structure/CodeBlock'
import { Heading } from '../structure/Heading'
import { Separator } from '../structure/Separator'
import { Skeleton } from '../structure/Skeleton'
import { Table } from '../structure/Table'
import { Text } from '../structure/Text'
import { Citation } from './Citation'
import styles from '@polymorph/recipes/ai/markdown.module.css'
import type { CitationSource } from './sources'

/**
 * Markdown, rendered through the vocabulary (`design/components/markdown.md`).
 *
 * Models write markdown, and chat apps must render it. A generic renderer
 * brings a second type scale, a second code block and a second link style.
 * Markdown maps the model's `##` to this system's `Heading`, its fence to
 * `CodeBlock`, its backticks to `Code`, its pipes to `Table` and its brackets
 * to `Link`. These are the same members as the rest of the screen, under the
 * same theme, with no second stylesheet. The parser, the engine's
 * `parseMarkdown` (`@polymorph/engine/markdown`), names node kinds. This file
 * decides which member renders each kind, and that is its whole job.
 *
 * It tolerates streaming. An open fence renders as a code block of what has
 * arrived, an unclosed `**` renders as two asterisks, and the caret sits at
 * the end of the latest content. A reply that arrives in sixty pieces is
 * parsed sixty times. That is acceptable because the parser is linear in the
 * source and a reply is a few kilobytes.
 *
 * It refuses raw HTML (rendered as its literal text), `javascript:` and
 * `data:` targets (rendered as their label), and a heading at the page's own
 * level. The reply's shallowest heading is `Heading` level 2, because a reply
 * is content inside a page, never the page. Syntax highlighting is a non-goal
 * for CodeBlock and so also for Markdown.
 *
 * No `'use client'` directive, because the render is a pure function of its
 * props. CodeBlock, Citation and Link carry their own directives.
 */

export type MarkdownSize = 'sm' | 'md'

export interface MarkdownProps {
  /** The markdown source received so far. */
  children: string
  /** Whether more is coming, which renders unfinished constructs as text and shows a caret at the end. */
  streaming?: boolean
  /** The body text step (Text's `sm` or `md`), which does not change the heading scale. */
  size?: MarkdownSize
  /**
   * The reply's sources in numbered order, which turn each `[n]` in the prose
   * into a Citation to the nth source (without them, `[n]` stays text).
   */
  sources?: CitationSource[]
}

interface RenderContext {
  size: MarkdownSize
  sources: CitationSource[]
  /** The shallowest heading depth in the reply, which maps to level 2. */
  shallowest: number
}

function renderInlines(nodes: MarkdownInline[], context: RenderContext): ReactNode[] {
  return nodes.map((node, index) => {
    switch (node.kind) {
      case 'text':
        return node.text
      case 'code':
        return <Code key={index}>{node.text}</Code>
      case 'strong':
        return <strong key={index}>{renderInlines(node.children, context)}</strong>
      case 'em':
        return <em key={index}>{renderInlines(node.children, context)}</em>
      case 'strike':
        return <s key={index}>{renderInlines(node.children, context)}</s>
      case 'break':
        return <br key={index} />
      case 'link':
        // Link's children must be a string, so emphasis inside a link label is
        // flattened to plain text. A bold link still renders as a link.
        return (
          <Link key={index} href={node.href} external={/^(https?:|mailto:|\/\/)/i.test(node.href)}>
            {inlineText(node.children)}
          </Link>
        )
      case 'image':
        // A model's image is content, not decoration. The alt is the model's
        // own description, and an empty alt marks the image as decorative.
        return (
          <img
            key={index}
            className={styles.image}
            src={node.src}
            alt={node.alt}
            loading="lazy"
            draggable={false}
          />
        )
      case 'citation': {
        const source = context.sources[node.index - 1]
        return source === undefined ? (
          `[${node.index}]`
        ) : (
          <Citation key={index} index={node.index} source={source} />
        )
      }
    }
  })
}

function renderBlocks(
  blocks: MarkdownBlock[],
  context: RenderContext,
  caret: ReactNode,
): ReactNode[] {
  return blocks.map((block, index) => {
    // The caret goes in the last block that can hold inline content. For a
    // block that cannot (a rule, a table, a fence), it is drawn after the block.
    const last = index === blocks.length - 1
    const tail = last ? caret : null

    switch (block.kind) {
      case 'paragraph':
        return (
          <Text key={index} size={context.size}>
            {renderInlines(block.children, context)}
            {tail}
          </Text>
        )
      case 'heading':
        return (
          <Heading key={index} level={markdownHeadingLevel(block.depth, context.shallowest)}>
            {inlineText(block.children)}
          </Heading>
        )
      case 'code':
        // Copying a partial command is not useful, so the copy button appears
        // only once the fence closes.
        return (
          <CodeBlock key={index} copyable={block.closed}>
            {block.text}
          </CodeBlock>
        )
      case 'quote':
        return (
          <blockquote key={index} className={styles.quote}>
            {renderBlocks(block.children, context, tail)}
          </blockquote>
        )
      case 'list': {
        const ListElement = block.ordered ? 'ol' : 'ul'
        return (
          <ListElement
            key={index}
            className={styles.list}
            start={block.ordered && block.start !== 1 ? block.start : undefined}
          >
            {block.items.map((item, position) => (
              <li key={position} className={styles.item}>
                {renderBlocks(item, context, position === block.items.length - 1 ? tail : null)}
              </li>
            ))}
          </ListElement>
        )
      }
      case 'table':
        return (
          <Table key={index}>
            <Table.Head>
              <Table.Row>
                {block.header.map((cell, column) => (
                  <Table.Header key={column} numeric={block.align[column] === 'end'}>
                    {renderInlines(cell, context)}
                  </Table.Header>
                ))}
              </Table.Row>
            </Table.Head>
            <Table.Body>
              {block.rows.map((row, line) => (
                <Table.Row key={line}>
                  {row.map((cell, column) => (
                    <Table.Cell key={column} numeric={block.align[column] === 'end'}>
                      {renderInlines(cell, context)}
                    </Table.Cell>
                  ))}
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        )
      case 'rule':
        return <Separator key={index} />
    }
  })
}

export function Markdown({
  children,
  streaming = false,
  size = 'md',
  sources = [],
}: MarkdownProps) {
  const blocks = parseMarkdown(children, { citations: sources.length })
  const context: RenderContext = { size, sources, shallowest: markdownShallowestHeading(blocks) }
  const pending = streaming && children.trim() === ''
  const caret = streaming ? <span className={styles.caret} aria-hidden="true" /> : null

  return (
    <div
      className={styles.root}
      data-size={size}
      data-state={streaming ? 'streaming' : undefined}
      data-pending={pending ? '' : undefined}
      aria-busy={streaming ? true : undefined}
      {...memberAttr('Markdown')}
    >
      {pending ? (
        <Skeleton shape="text" textStep={size} width={9} />
      ) : (
        <>
          {renderBlocks(blocks, context, caret)}
          {streaming && !markdownEndsInProse(blocks) ? (
            <Text size={size}>
              {''}
              {caret}
            </Text>
          ) : null}
        </>
      )}
    </div>
  )
}
