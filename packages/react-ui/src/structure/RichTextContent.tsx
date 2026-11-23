'use client'

import {
  isRichTextEmpty,
  memberAttr,
  parseRichText,
  type RichTextBlock,
  type RichTextDocument,
  type RichTextEntity,
  type RichTextInline,
  type RichTextText,
  richTextNodeText,
} from '@polymorph/react'
import { Fragment, type ReactNode } from 'react'

import { Link } from '../controls/Link'
import { Code } from './Code'
import { CodeBlock } from './CodeBlock'
import { Heading, type HeadingLevel } from './Heading'
import { Text } from './Text'
import styles from '@polymorph/recipes/structure/rich-text-content.module.css'

/**
 * A stored rich-text document drawn through the vocabulary (`design/components/rich-text-content.md`).
 *
 * A comment, an issue's description or a note is stored as the document model's
 * JSON (`@polymorph/engine/rich-text`), and this member shows it with the same
 * members as the rest of the screen: a heading is `Heading`, a paragraph
 * `Text`, a code block `CodeBlock`, inline code `Code` and a link `Link`, under
 * the same theme, with no second stylesheet. The model's reader decides what a
 * document holds. This file decides which member draws each node, and that is
 * its whole job.
 *
 * It is not Markdown, which parses a source string that may still be
 * arriving. A document is data a person wrote and an app stored, and it is
 * never partial. It is not RichTextInput either: it loads no editor.
 *
 * The reader accepts any JSON, so a document written by a later version still
 * reads: a node of a type this version does not know is drawn as the text found
 * in it, and a link whose target is not safe has lost its mark and draws as its
 * text.
 *
 * The directive is there because the member hands `onNavigate` to each Link,
 * and a server component cannot pass a function to a client component.
 */

export type RichTextContentSize = 'sm' | 'md'

export interface RichTextContentProps {
  /** The stored document. Any JSON is read as far as it can be; what is not a document draws nothing. */
  value: RichTextDocument
  /** The body text step (Text's `sm` or `md`), which does not change the heading scale. */
  size?: RichTextContentSize
  /**
   * The page level the document's level 1 heading is drawn at. Each deeper
   * level adds one, up to 4. Default 2, one level under the page's title.
   */
  headingLevel?: HeadingLevel
  /**
   * The app's rendering of an entity: a Link to the person's page, a HoverCard
   * with their card. `undefined` draws the entity token, so an app can draw one
   * kind itself and leave the others as tokens.
   */
  entity?: (entity: RichTextEntity) => ReactNode
  /** The app's router, handed to every Link the document draws (`link.md`). */
  onNavigate?: (href: string) => void
}

interface RenderContext {
  size: RichTextContentSize
  headingLevel: HeadingLevel
  entity: ((entity: RichTextEntity) => ReactNode) | undefined
  onNavigate: ((href: string) => void) | undefined
}

/** A target with a scheme (`https:`, `mailto:`, `tel:`) leaves the app. The reader passes no other kind. */
const ABSOLUTE = /^[a-z][a-z\d+.-]*:/i

/**
 * The page level a document heading is drawn at: the document's level 1 at
 * `top`, each deeper level one more, never past 4. The editor draws the same
 * levels, so a document reads the same while it is written and after.
 */
function pageLevel(level: number, top: HeadingLevel): HeadingLevel {
  const drawn = top + Math.max(0, Math.floor(level) - 1)
  return drawn >= 4 ? 4 : drawn === 3 ? 3 : 2
}

/** The target of a text run's link mark, or `undefined` for anything else. */
function linkOf(node: RichTextInline | undefined): string | undefined {
  if (node?.type !== 'text') return undefined
  for (const mark of node.marks ?? []) if (mark.type === 'link') return mark.href
  return undefined
}

const has = (node: RichTextText, type: string) =>
  (node.marks ?? []).some((mark) => mark.type === type)

/**
 * Draws `content` inside the emphasis elements of `marks`, bold outermost. A
 * mark of a type this version does not know draws nothing.
 */
function emphasised(content: ReactNode, marks: (type: string) => boolean, key: number): ReactNode {
  let drawn = content
  if (marks('strike')) drawn = <s>{drawn}</s>
  if (marks('italic')) drawn = <em>{drawn}</em>
  if (marks('bold')) drawn = <strong>{drawn}</strong>
  return <Fragment key={key}>{drawn}</Fragment>
}

/**
 * One Link for neighbouring runs with the same target, so a link whose words
 * carry different marks is still one tab stop and one name. Link's children
 * are a string, so the marks every run shares are drawn around it and the
 * others, and `code`, are dropped, as Markdown drops emphasis in a label.
 */
function drawLink(
  runs: readonly RichTextText[],
  href: string,
  key: number,
  context: RenderContext,
): ReactNode {
  const link = (
    <Link href={href} external={ABSOLUTE.test(href)} onNavigate={context.onNavigate}>
      {runs.map((run) => run.text).join('')}
    </Link>
  )
  return emphasised(link, (type) => runs.every((run) => has(run, type)), key)
}

function drawEntity(node: RichTextEntity, key: number, context: RenderContext): ReactNode {
  const drawn = context.entity?.(node)
  if (drawn !== undefined) return <Fragment key={key}>{drawn}</Fragment>
  // The element and attributes the editor draws for an entity, so the one
  // recipe class looks the same in both.
  return (
    <span key={key} className={styles.entity} data-entity-kind={node.kind} data-entity-id={node.id}>
      {node.label}
    </span>
  )
}

function renderInlines(nodes: readonly RichTextInline[], context: RenderContext): ReactNode[] {
  const drawn: ReactNode[] = []
  let index = 0
  while (index < nodes.length) {
    const node = nodes[index] as RichTextInline
    const href = linkOf(node)
    if (href !== undefined) {
      const runs: RichTextText[] = []
      let end = index
      while (end < nodes.length && linkOf(nodes[end]) === href) {
        runs.push(nodes[end] as RichTextText)
        end += 1
      }
      drawn.push(drawLink(runs, href, index, context))
      index = end
      continue
    }
    switch (node.type) {
      case 'text': {
        const text = has(node, 'code') ? <Code>{node.text}</Code> : node.text
        drawn.push(emphasised(text, (type) => has(node, type), index))
        break
      }
      case 'break':
        drawn.push(<br key={index} />)
        break
      case 'entity':
        drawn.push(drawEntity(node, index, context))
        break
      default:
        // An inline of a later version: the text found in it, in the line.
        drawn.push(richTextNodeText(node))
    }
    index += 1
  }
  return drawn
}

/**
 * A heading's content as one string, because Heading takes a string: an
 * entity reads as its label, a break as a space, and a link and inline code as
 * their text.
 */
function headingText(nodes: readonly RichTextInline[]): string {
  return nodes
    .map((node) => {
      switch (node.type) {
        case 'text':
          return node.text
        case 'break':
          return ' '
        case 'entity':
          return node.label
        default:
          return richTextNodeText(node)
      }
    })
    .join('')
}

function renderBlocks(blocks: readonly RichTextBlock[], context: RenderContext): ReactNode[] {
  return blocks.map((block, index) => {
    switch (block.type) {
      case 'paragraph':
        return (
          <Text key={index} size={context.size}>
            {renderInlines(block.content, context)}
          </Text>
        )
      case 'heading': {
        // A heading names the section under it, so one with no name is not drawn.
        const text = headingText(block.content)
        if (text.trim() === '') return null
        return (
          <Heading key={index} level={pageLevel(block.level, context.headingLevel)}>
            {text}
          </Heading>
        )
      }
      case 'list': {
        const ListElement = block.ordered ? 'ol' : 'ul'
        return (
          <ListElement
            key={index}
            className={styles.list}
            start={block.ordered && block.start !== undefined ? block.start : undefined}
          >
            {block.items.map((item, position) => (
              <li key={position} className={styles.item}>
                {renderBlocks(item.content, context)}
              </li>
            ))}
          </ListElement>
        )
      }
      case 'blockquote':
        return (
          <blockquote key={index} className={styles.quote}>
            {renderBlocks(block.content, context)}
          </blockquote>
        )
      case 'codeBlock':
        // A stored block is never partial, so it is copyable, unless it holds
        // nothing to copy. The language is the writer's word for what the
        // scroll region holds, and CodeBlock keeps its own name without one.
        return (
          <CodeBlock key={index} copyable={block.text !== ''} label={block.language}>
            {block.text}
          </CodeBlock>
        )
      default: {
        // A block of a later version: a paragraph of the text found in it.
        const text = richTextNodeText(block)
        return text === '' ? null : (
          <Text key={index} size={context.size}>
            {text}
          </Text>
        )
      }
    }
  })
}

export function RichTextContent({
  value,
  size = 'md',
  headingLevel = 2,
  entity,
  onNavigate,
}: RichTextContentProps) {
  const read = parseRichText(value).value
  const empty = isRichTextEmpty(read)
  const context: RenderContext = { size, headingLevel, entity, onNavigate }

  return (
    <div
      className={styles.root}
      data-size={size}
      data-empty={empty ? '' : undefined}
      {...memberAttr('RichTextContent')}
    >
      {empty ? null : renderBlocks(read.blocks, context)}
    </div>
  )
}
