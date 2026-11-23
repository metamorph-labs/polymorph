import { render, screen } from '@testing-library/react'
import { userEvent } from 'vitest/browser'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { assertGoverned, RICH_TEXT_FORMAT, type RichTextDocument } from '@polymorph/react'
import { installTestTheme } from '@polymorph/engine/testing'
import { Link } from '../controls/Link'
import { RichTextContent, type RichTextContentProps } from './RichTextContent'
import { CODE, EMPTY, ENTITIES, LATER, PROSE, QUOTE, STRUCTURE } from './rich-text-content.states'

/**
 * RichTextContent, in a real browser.
 *
 * The document model's reader is tested beside it, in the engine
 * (`packages/engine/src/rich-text/`). These tests check three things. Each node
 * is drawn by a vocabulary member, so nothing in a document has a second type
 * scale. A document of a later version, or a value that is not a document,
 * still draws what can be read of it. Nothing in a document becomes a link the
 * reader refused, and the app's router and entity drawing reach every node
 * they are for.
 */

beforeAll(installTestTheme)

const root = () => document.querySelector('[data-member="rich-text-content"]') as HTMLElement

/** A document of one paragraph holding `content`. */
const paragraph = (content: unknown[]): RichTextDocument =>
  ({ format: RICH_TEXT_FORMAT, blocks: [{ type: 'paragraph', content }] }) as RichTextDocument

const headings = (levels: number[]): RichTextDocument => ({
  format: RICH_TEXT_FORMAT,
  blocks: levels.map((level) => ({
    type: 'heading' as const,
    level: level as 1 | 2 | 3,
    content: [{ type: 'text' as const, text: `Level ${level}` }],
  })),
})

describe('the closed surface', () => {
  it('has no style escape hatch', () => {
    assertGoverned<RichTextContentProps>(true)
  })
})

describe('each node is drawn by a vocabulary member', () => {
  it('draws paragraphs as Text at the size, and the marks as their elements', () => {
    render(<RichTextContent value={PROSE} size="sm" />)
    const paragraphs = root().querySelectorAll(':scope > [data-member="text"]')
    expect(paragraphs).toHaveLength(2)
    for (const node of paragraphs) expect(node.getAttribute('data-size')).toBe('sm')
    expect(root().querySelector('strong')?.textContent).toBe('exponential')
    expect(root().querySelector('em')?.textContent).toBe('doubles')
    expect(root().querySelector('s')?.textContent).toBe('three-attempt')
    expect(root().querySelector('[data-member="code"]')?.textContent).toBe('Idempotency-Key')
    expect(root().querySelectorAll('br')).toHaveLength(1)
  })

  it('draws a link as Link, external when its target has a scheme', () => {
    render(<RichTextContent value={PROSE} />)
    const link = screen.getByRole('link', { name: 'the delivery guide' })
    expect(link.getAttribute('data-member')).toBe('link')
    expect(link.getAttribute('href')).toBe('https://docs.example.org/webhooks/retries')
    expect(link.hasAttribute('data-external')).toBe(true)
  })

  it('draws a relative link in this tab', () => {
    render(
      <RichTextContent
        value={paragraph([
          { type: 'text', text: 'the runbook', marks: [{ type: 'link', href: '/runbooks/42' }] },
        ])}
      />,
    )
    const link = screen.getByRole('link', { name: 'the runbook' })
    expect(link.hasAttribute('data-external')).toBe(false)
    expect(link.hasAttribute('target')).toBe(false)
  })

  it('draws neighbouring runs with one target as one Link, with the marks they share around it', () => {
    render(
      <RichTextContent
        value={paragraph([
          {
            type: 'text',
            text: 'the ',
            marks: [{ type: 'link', href: '/guide' }, { type: 'bold' }],
          },
          {
            type: 'text',
            text: 'delivery',
            marks: [{ type: 'link', href: '/guide' }, { type: 'bold' }, { type: 'italic' }],
          },
          {
            type: 'text',
            text: ' guide',
            marks: [{ type: 'link', href: '/guide' }, { type: 'bold' }],
          },
        ])}
      />,
    )
    const links = screen.getAllByRole('link')
    expect(links).toHaveLength(1)
    expect(links[0]?.textContent).toBe('the delivery guide')
    expect(links[0]?.parentElement?.tagName).toBe('STRONG')
    expect(root().querySelector('em')).toBeNull()
  })

  it('draws a code block as a copyable CodeBlock named by its language', async () => {
    render(
      <div style={{ inlineSize: 240 }}>
        <RichTextContent
          value={{
            format: RICH_TEXT_FORMAT,
            blocks: [
              {
                type: 'codeBlock',
                language: 'sh',
                text: 'curl -X POST https://api.example.org/v1/webhooks/deliveries/retry --header "Idempotency-Key: 7d3f"',
              },
            ],
          }}
        />
      </div>,
    )
    expect(root().querySelector('[data-member="code-block"]')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Copy' })).toBeTruthy()
    // The block overflows the narrow column, so it is a named scroll region
    // once CodeBlock has measured it.
    expect(await screen.findByRole('region', { name: 'sh' })).toBeTruthy()
  })

  it('draws a code block with no text without a copy control', () => {
    render(
      <RichTextContent
        value={{
          format: RICH_TEXT_FORMAT,
          blocks: [
            { type: 'paragraph', content: [{ type: 'text', text: 'Nothing to run yet:' }] },
            { type: 'codeBlock', text: '' },
          ],
        }}
      />,
    )
    expect(root().querySelector('[data-member="code-block"]')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Copy' })).toBeNull()
  })

  it('draws a quote as a blockquote of its blocks', () => {
    render(<RichTextContent value={QUOTE} />)
    const quote = root().querySelector('blockquote') as HTMLElement
    expect(quote.querySelectorAll('[data-member="text"]')).toHaveLength(2)
  })

  it('draws the fixture’s code block with Copy', () => {
    render(<RichTextContent value={CODE} />)
    expect(screen.getByRole('button', { name: 'Copy' })).toBeTruthy()
  })
})

describe('headings', () => {
  it('draws the document’s level 1 at level 2, each deeper level one more, never at 1', () => {
    render(<RichTextContent value={STRUCTURE} />)
    expect(screen.getByRole('heading', { level: 2, name: 'Webhook retries' })).toBeTruthy()
    expect(screen.getByRole('heading', { level: 3, name: 'What changed' })).toBeTruthy()
    expect(screen.getByRole('heading', { level: 4, name: 'Rollout' })).toBeTruthy()
    expect(screen.queryAllByRole('heading', { level: 1 })).toHaveLength(0)
    for (const heading of screen.getAllByRole('heading')) {
      expect(heading.getAttribute('data-member')).toBe('heading')
    }
  })

  it('offsets every level by headingLevel and stops at 4', () => {
    render(<RichTextContent value={headings([1, 2, 3])} headingLevel={3} />)
    expect(screen.getByRole('heading', { level: 3, name: 'Level 1' })).toBeTruthy()
    expect(screen.getByRole('heading', { level: 4, name: 'Level 2' })).toBeTruthy()
    expect(screen.getByRole('heading', { level: 4, name: 'Level 3' })).toBeTruthy()
  })

  it('draws a heading’s content as its text: an entity as its label, a link as its text', () => {
    render(
      <RichTextContent
        value={{
          format: RICH_TEXT_FORMAT,
          blocks: [
            {
              type: 'heading',
              level: 1,
              content: [
                { type: 'text', text: 'Review by ' },
                { type: 'entity', kind: 'user', id: 'u_ada', label: '@Ada' },
                { type: 'text', text: ' of ' },
                { type: 'text', text: 'the guide', marks: [{ type: 'link', href: '/guide' }] },
              ],
            },
          ],
        }}
      />,
    )
    expect(
      screen.getByRole('heading', { level: 2, name: 'Review by @Ada of the guide' }),
    ).toBeTruthy()
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('draws nothing for a heading with no text', () => {
    render(
      <RichTextContent
        value={{
          format: RICH_TEXT_FORMAT,
          blocks: [
            { type: 'heading', level: 1, content: [] },
            { type: 'paragraph', content: [{ type: 'text', text: 'Body.' }] },
          ],
        }}
      />,
    )
    expect(screen.queryAllByRole('heading')).toHaveLength(0)
    expect(root().textContent).toBe('Body.')
  })
})

describe('lists', () => {
  it('nests a list inside its item and numbers an ordered list from its start', () => {
    render(<RichTextContent value={STRUCTURE} />)
    const bulleted = root().querySelector(':scope > ul') as HTMLElement
    expect(bulleted.querySelectorAll(':scope > li')).toHaveLength(2)
    const nested = bulleted.querySelector(':scope > li > ul') as HTMLElement
    expect(nested.querySelectorAll(':scope > li')).toHaveLength(2)
    const numbered = root().querySelector(':scope > ol') as HTMLOListElement
    expect(numbered.start).toBe(3)
    expect(numbered.getAttribute('start')).toBe('3')
  })

  it('writes no start on a list that counts from 1', () => {
    render(
      <RichTextContent
        value={{
          format: RICH_TEXT_FORMAT,
          blocks: [
            {
              type: 'list',
              ordered: true,
              items: [
                {
                  type: 'listItem',
                  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'One' }] }],
                },
              ],
            },
          ],
        }}
      />,
    )
    expect(root().querySelector('ol')?.hasAttribute('start')).toBe(false)
  })
})

describe('entities', () => {
  it('draws an entity as the token: its label, its kind and id, inline', () => {
    render(<RichTextContent value={ENTITIES} />)
    const tokens = root().querySelectorAll('[data-entity-kind]')
    expect(tokens).toHaveLength(2)
    const [person, issue] = tokens
    expect(person?.textContent).toBe('@Ada Lovelace')
    expect(person?.getAttribute('data-entity-kind')).toBe('user')
    expect(person?.getAttribute('data-entity-id')).toBe('u_ada')
    expect(issue?.textContent).toBe('#142')
    expect(getComputedStyle(person as Element).display).toBe('inline')
  })

  it('draws what `entity` returns, and the token where it returns undefined', () => {
    const entity = vi.fn((node: { kind: string; id: string; label: string }) =>
      node.kind === 'user' ? <Link href={`/people/${node.id}`}>{node.label}</Link> : undefined,
    )
    render(<RichTextContent value={ENTITIES} entity={entity} />)
    expect(entity).toHaveBeenCalledWith({
      type: 'entity',
      kind: 'user',
      id: 'u_ada',
      label: '@Ada Lovelace',
    })
    expect(screen.getByRole('link', { name: '@Ada Lovelace' }).getAttribute('href')).toBe(
      '/people/u_ada',
    )
    const tokens = root().querySelectorAll('[data-entity-kind]')
    expect(tokens).toHaveLength(1)
    expect(tokens[0]?.textContent).toBe('#142')
  })
})

describe('the app’s router', () => {
  it('reaches every Link the document draws, and not an external one', async () => {
    const onNavigate = vi.fn()
    const watch = (event: MouseEvent) => event.preventDefault()
    document.addEventListener('click', watch)
    render(
      <RichTextContent
        onNavigate={onNavigate}
        value={paragraph([
          { type: 'text', text: 'Read ' },
          { type: 'text', text: 'the runbook', marks: [{ type: 'link', href: '/runbooks/42' }] },
          { type: 'text', text: ' or ' },
          {
            type: 'text',
            text: 'the guide',
            marks: [{ type: 'link', href: 'https://docs.example.org/guide' }],
          },
        ])}
      />,
    )
    await userEvent.click(screen.getByRole('link', { name: 'the runbook' }))
    await userEvent.click(screen.getByRole('link', { name: 'the guide' }))
    document.removeEventListener('click', watch)
    expect(onNavigate).toHaveBeenCalledExactlyOnceWith('/runbooks/42')
  })
})

describe('what the reader cannot use', () => {
  it('draws an unsafe link as its text', () => {
    render(
      <RichTextContent
        value={paragraph([
          { type: 'text', text: 'click', marks: [{ type: 'link', href: 'javascript:alert(1)' }] },
          { type: 'text', text: ' and ' },
          { type: 'text', text: 'away', marks: [{ type: 'link', href: '//evil.example' }] },
          { type: 'text', text: ' and ' },
          { type: 'text', text: 'fine', marks: [{ type: 'link', href: 'https://a.example' }] },
        ])}
      />,
    )
    const links = screen.getAllByRole('link')
    expect(links).toHaveLength(1)
    expect(links[0]?.getAttribute('href')).toBe('https://a.example')
    expect(root().textContent).toBe('click and away and fine')
  })

  it('draws an unknown block as a paragraph of its text, and an unknown inline in the line', () => {
    render(<RichTextContent value={LATER} />)
    const paragraphs = root().querySelectorAll(':scope > [data-member="text"]')
    expect(paragraphs).toHaveLength(2)
    expect(paragraphs[0]?.textContent).toBe('Deliveries pause while the migration runs.')
    expect(paragraphs[1]?.textContent).toBe('The migration starts on Friday 4 December.')
  })

  it('draws nothing for an unknown block with no text, and keeps an unknown mark’s text', () => {
    render(
      <RichTextContent
        value={
          {
            format: RICH_TEXT_FORMAT,
            blocks: [
              { type: 'divider' },
              {
                type: 'paragraph',
                content: [
                  {
                    type: 'text',
                    text: 'kept',
                    marks: [{ type: 'highlight', colour: 'yellow' }, { type: 'bold' }],
                  },
                ],
              },
            ],
          } as unknown as RichTextDocument
        }
      />,
    )
    expect(root().children).toHaveLength(1)
    expect(root().querySelector('strong')?.textContent).toBe('kept')
  })

  it('draws the root and nothing in it for the empty document', () => {
    render(<RichTextContent value={EMPTY} />)
    expect(root().hasAttribute('data-empty')).toBe(true)
    expect(root().childElementCount).toBe(0)
  })

  it('reads a document of only whitespace as empty', () => {
    render(<RichTextContent value={paragraph([{ type: 'text', text: '   ' }])} />)
    expect(root().hasAttribute('data-empty')).toBe(true)
    expect(root().childElementCount).toBe(0)
  })

  it('draws a value that is not a document as the empty document', () => {
    for (const value of [null, 'Retries are exponential.', { blocks: 'none' }, 42]) {
      const { unmount } = render(<RichTextContent value={value as unknown as RichTextDocument} />)
      expect(root().hasAttribute('data-empty')).toBe(true)
      expect(root().childElementCount).toBe(0)
      unmount()
    }
  })
})
