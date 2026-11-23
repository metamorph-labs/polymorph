import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { renderToString } from 'react-dom/server'
import { userEvent } from 'vitest/browser'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import {
  annotateRichText,
  assertGoverned,
  RICH_TEXT_FORMAT,
  type RichTextDocument,
  type RichTextRange,
  richTextAnnotations,
  richTextRangeText,
} from '@polymorph/react'
import { createAgentBridge } from '@polymorph/engine/agent'
import { agentRegistrations, installTestTheme } from '@polymorph/engine/testing'
import { Button } from '../controls/Button'
import { Link } from '../controls/Link'
import { RichTextInput } from '../controls/RichTextInput'
import { tokenColor } from '../controls/token-probe'
import {
  RichTextContent,
  type RichTextContentProps,
  type RichTextContentSelection,
} from './RichTextContent'
import {
  ANNOTATED,
  ANNOTATED_ENTITY,
  CODE,
  EMPTY,
  ENTITIES,
  LATER,
  OVERLAPPING,
  PROSE,
  QUOTE,
  STRUCTURE,
} from './rich-text-content.states'

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
 *
 * The rest hold annotations and the reader's selection: highlights drawn and
 * nested as the editor draws them, with the field's look; a press and the
 * keys on a highlight; the selection mapped to the document's plain text,
 * checked by anchoring an annotation on it with `annotateRichText` and drawing
 * the result; the selection bar; and a document with neither prop, which
 * listens to nothing.
 */

beforeAll(installTestTheme)

afterEach(() => {
  document.getSelection()?.removeAllRanges()
})

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

/* -------------------------------------------------------------------------- */
/* Annotations                                                                */
/* -------------------------------------------------------------------------- */

const doc = (...blocks: unknown[]): RichTextDocument =>
  ({ format: RICH_TEXT_FORMAT, blocks }) as RichTextDocument
const p = (...content: unknown[]) => ({ type: 'paragraph', content })
const t = (text: string, ...marks: unknown[]) =>
  marks.length === 0 ? { type: 'text', text } : { type: 'text', text, marks }
const note = (id: string) => ({ type: 'annotation', id })
const bold = { type: 'bold' }
const ada = (...marks: unknown[]) => ({
  type: 'entity',
  kind: 'user',
  id: 'u_ada',
  label: '@Ada Lovelace',
  ...(marks.length === 0 ? {} : { marks }),
})

/** The drawn fragments of an annotation. */
const marks = (id: string, within: Element = root()) =>
  Array.from(within.querySelectorAll<HTMLElement>(`[data-annotation-id="${id}"]`))

/** Every text node in `element`, with the annotations around it, innermost first. */
function nestingOf(element: Element): [string, string[]][] {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
  const out: [string, string[]][] = []
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    const ids: string[] = []
    for (let at = node.parentElement; at !== null && at !== element; at = at.parentElement) {
      const id = at.getAttribute('data-annotation-id')
      if (id !== null) ids.push(id)
    }
    out.push([(node as Text).data, ids])
  }
  return out
}

describe('annotations', () => {
  it('draws the annotations it is given as marks, the active one on every fragment', () => {
    render(
      <RichTextContent
        value={doc(
          p(
            t('Retries '),
            t('wait ', note('one')),
            t('longer', bold, note('one')),
            t(' each time', note('two')),
          ),
        )}
        annotations={['one']}
        activeAnnotation="one"
      />,
    )
    const one = marks('one')
    expect(one.map((mark) => mark.tagName)).toEqual(['MARK', 'MARK'])
    expect(one.map((mark) => mark.textContent)).toEqual(['wait ', 'longer'])
    expect(one.every((mark) => mark.hasAttribute('data-active'))).toBe(true)
    // An annotation that is not drawn leaves nothing a stylesheet or a script could find.
    expect(marks('two')).toHaveLength(0)
    expect(root().querySelectorAll('mark')).toHaveLength(2)
    expect(root().innerHTML).not.toContain('two')
  })

  it('draws every annotation without `annotations`, and none for an empty list', () => {
    const value = doc(p(t('wait', note('one')), t(' and '), t('longer', note('two'))))
    const { rerender } = render(<RichTextContent value={value} />)
    expect(marks('one')).toHaveLength(1)
    expect(marks('two')).toHaveLength(1)
    expect(root().querySelector('[data-active]')).toBeNull()
    rerender(<RichTextContent value={value} annotations={[]} />)
    expect(root().querySelectorAll('mark')).toHaveLength(0)
  })

  it('nests overlapping annotations exactly as the field’s editor does', async () => {
    const value = doc(
      p(
        t('a', note('x')),
        t('b', note('x'), note('y')),
        t('c', note('y')),
        t('d', bold, note('x'), note('y'), note('z')),
        { type: 'break' },
        t('e', note('z')),
        t(' f'),
        t('g', note('x')),
      ),
      p(t('same words', note('m'), note('n'))),
      p(t('one ', note('p')), t('two', note('p'), note('q')), t(' three', note('q'))),
    )
    render(
      <>
        <div data-testid="reader">
          <RichTextContent value={value} />
        </div>
        <RichTextInput aria-label="Comment" defaultValue={value} />
      </>,
    )
    const field = screen.getByRole('textbox', { name: 'Comment' })
    await vi.waitFor(() => expect(field.querySelector('[data-annotation-id]')).not.toBeNull())
    const ours = nestingOf(screen.getByTestId('reader'))
    expect(ours).toContainEqual(['b', ['y', 'x']])
    expect(ours).toContainEqual(['same words', ['m', 'n']])
    expect(ours).toEqual(nestingOf(field))
  })

  it('wraps an entity in its annotations, the token or the app’s drawing alike', () => {
    const { rerender } = render(<RichTextContent value={ANNOTATED_ENTITY} />)
    const token = root().querySelector('[data-entity-kind]') as HTMLElement
    expect(token.parentElement?.getAttribute('data-annotation-id')).toBe('thread-3')
    expect(marks('thread-3').map((mark) => mark.textContent)).toEqual([
      '@Ada Lovelace',
      ' to review the fix',
    ])
    rerender(
      <RichTextContent
        value={ANNOTATED_ENTITY}
        entity={(entity) => <Link href={`/people/${entity.id}`}>{entity.label}</Link>}
      />,
    )
    const link = screen.getByRole('link', { name: '@Ada Lovelace' })
    expect(link.parentElement?.getAttribute('data-annotation-id')).toBe('thread-3')
  })

  it('draws an annotation on any run of a Link around the whole Link, and one on inline code around Code', () => {
    render(
      <RichTextContent
        value={doc(
          p(
            t('Read '),
            t('the ', { type: 'link', href: '/guide' }),
            t('delivery', { type: 'link', href: '/guide' }, note('one')),
            t(' guide', { type: 'link', href: '/guide' }),
            t(' and '),
            t('retry()', { type: 'code' }, note('two')),
          ),
        )}
      />,
    )
    const link = screen.getByRole('link', { name: 'the delivery guide' })
    expect(link.parentElement).toBe(marks('one')[0])
    const code = root().querySelector('[data-member="code"]') as HTMLElement
    expect(code.parentElement).toBe(marks('two')[0])
  })

  it('draws the field’s highlight: the same wash, rule, frame and text colour', async () => {
    render(
      <>
        <div data-testid="reader">
          <RichTextContent value={ANNOTATED_ENTITY} activeAnnotation="thread-3" />
          <RichTextContent value={ANNOTATED} />
        </div>
        <RichTextInput
          aria-label="Active"
          defaultValue={ANNOTATED_ENTITY}
          activeAnnotation="thread-3"
        />
        <RichTextInput aria-label="Resting" defaultValue={ANNOTATED} />
      </>,
    )
    const reader = screen.getByTestId('reader')
    const active = screen.getByRole('textbox', { name: 'Active' })
    const resting = screen.getByRole('textbox', { name: 'Resting' })
    await vi.waitFor(() => expect(resting.querySelector('mark')).not.toBeNull())
    await vi.waitFor(() => expect(active.querySelector('mark')).not.toBeNull())
    const properties = [
      'color',
      'backgroundColor',
      'borderBottomWidth',
      'borderBottomStyle',
      'borderBottomColor',
      'outlineWidth',
      'outlineStyle',
      'outlineColor',
      'boxDecorationBreak',
    ] as const
    const pairs: [Element, Element][] = [
      [marks('thread-1', reader)[0] as Element, marks('thread-1', resting)[0] as Element],
      [marks('thread-3', reader)[1] as Element, marks('thread-3', active)[1] as Element],
      [
        reader.querySelector('mark [data-entity-kind]') as Element,
        active.querySelector('mark [data-entity-kind]') as Element,
      ],
    ]
    for (const [ours, theirs] of pairs) {
      const left = getComputedStyle(ours)
      const right = getComputedStyle(theirs)
      for (const property of properties) expect(left[property], property).toBe(right[property])
      expect(left.boxShadow).toBe(right.boxShadow)
    }
    const rest = getComputedStyle(marks('thread-1', reader)[0] as Element)
    expect(rest.backgroundColor).toBe(tokenColor('--pm-warning-subtle'))
    expect(rest.borderBottomColor).toBe(tokenColor('--pm-warning-border'))
    expect(rest.borderBottomWidth).toBe('1px')
    expect(rest.color).toBe(
      getComputedStyle(marks('thread-1', reader)[0]?.parentElement as Element).color,
    )
    const on = getComputedStyle(marks('thread-3', reader)[1] as Element)
    expect(on.backgroundColor).toBe(tokenColor('--pm-warning-subtle-active'))
    expect(on.outlineColor).toBe(tokenColor('--pm-warning-border'))
    expect(on.outlineWidth).toBe('2px')
  })
})

describe('a press on a highlight', () => {
  it('is nothing without onAnnotationSelect: no stop, no role', () => {
    render(<RichTextContent value={ANNOTATED} activeAnnotation="thread-2" />)
    for (const mark of root().querySelectorAll('mark')) {
      expect(mark.hasAttribute('tabindex')).toBe(false)
      expect(mark.hasAttribute('role')).toBe(false)
      expect(mark.hasAttribute('aria-current')).toBe(false)
    }
  })

  it('reports the innermost annotation under a press', async () => {
    const onAnnotationSelect = vi.fn()
    render(<RichTextContent value={OVERLAPPING} onAnnotationSelect={onAnnotationSelect} />)
    await userEvent.click(screen.getByText('as long'))
    expect(onAnnotationSelect).toHaveBeenLastCalledWith('thread-2')
    await userEvent.click(screen.getByText('as the last one'))
    expect(onAnnotationSelect).toHaveBeenLastCalledWith('thread-1')
    await userEvent.click(screen.getByText(/up to five times/))
    expect(onAnnotationSelect).toHaveBeenCalledTimes(2)
  })

  it('makes each annotation’s first fragment a button named by its words, which Enter and Space press', async () => {
    const onAnnotationSelect = vi.fn()
    render(
      <RichTextContent
        value={ANNOTATED}
        activeAnnotation="thread-2"
        onAnnotationSelect={onAnnotationSelect}
      />,
    )
    const stops = screen.getAllByRole('button')
    expect(stops.map((stop) => stop.getAttribute('data-annotation-id'))).toEqual([
      'thread-1',
      'thread-2',
    ])
    expect(screen.getByRole('button', { name: 'doubles the wait' })).toBe(stops[0])
    expect(stops.map((stop) => stop.tabIndex)).toEqual([0, 0])
    expect(stops[0]?.hasAttribute('aria-current')).toBe(false)
    expect(stops[1]?.getAttribute('aria-current')).toBe('true')
    stops[0]?.focus()
    await userEvent.keyboard('{Enter}')
    expect(onAnnotationSelect).toHaveBeenLastCalledWith('thread-1')
    await userEvent.keyboard('{Tab}')
    expect(document.activeElement).toBe(stops[1])
    await userEvent.keyboard(' ')
    expect(onAnnotationSelect).toHaveBeenLastCalledWith('thread-2')
    expect(onAnnotationSelect).toHaveBeenCalledTimes(2)
  })

  it('puts one stop on each annotation, where it is innermost and holds no control', () => {
    render(
      <RichTextContent
        value={doc(
          p(
            t('twice ', note('outer')),
            t('as long', note('outer'), note('inner')),
            t(' again', note('outer')),
          ),
          // Two threads on the same words: the inner one takes every press, as in the field.
          p(t('same words', note('b'), note('a'))),
          // A thread only on a link: the link takes the press.
          p(t('the guide', { type: 'link', href: '/guide' }, note('linked'))),
          // A thread on white space and words: the stop is on the words.
          p(t('lead '), t(' ', note('spaced')), t('words', bold, note('spaced'))),
        )}
        onAnnotationSelect={() => {}}
      />,
    )
    expect(
      screen
        .getAllByRole('button')
        .map((stop) => [stop.getAttribute('data-annotation-id'), stop.textContent]),
    ).toEqual([
      ['outer', 'twice '],
      ['inner', 'as long'],
      ['a', 'same words'],
      ['spaced', 'words'],
    ])
  })

  it('leaves a press on a Link inside an annotation to the Link', async () => {
    const onAnnotationSelect = vi.fn()
    const onNavigate = vi.fn()
    render(
      <RichTextContent
        value={doc(
          p(
            t('Read '),
            t('the guide', { type: 'link', href: '/guide' }, note('one')),
            t(' now', note('one')),
          ),
        )}
        onAnnotationSelect={onAnnotationSelect}
        onNavigate={onNavigate}
      />,
    )
    await userEvent.click(screen.getByRole('link', { name: 'the guide' }))
    expect(onNavigate).toHaveBeenCalledExactlyOnceWith('/guide')
    expect(onAnnotationSelect).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'now' }))
    expect(onAnnotationSelect).toHaveBeenCalledExactlyOnceWith('one')
  })

  it('opens nothing on a press that ends a selection', () => {
    const onAnnotationSelect = vi.fn()
    render(<RichTextContent value={ANNOTATED} onAnnotationSelect={onAnnotationSelect} />)
    const mark = marks('thread-1')[0] as HTMLElement
    const text = mark.firstChild as Text
    document.getSelection()?.setBaseAndExtent(text, 0, text, 7)
    fireEvent.click(mark, { detail: 1 })
    expect(onAnnotationSelect).not.toHaveBeenCalled()
    document.getSelection()?.collapse(text, 3)
    fireEvent.click(mark, { detail: 1 })
    expect(onAnnotationSelect).toHaveBeenCalledExactlyOnceWith('thread-1')
  })
})

/* -------------------------------------------------------------------------- */
/* The reader's selection                                                     */
/* -------------------------------------------------------------------------- */

/** The member's drawn text, outside the selection bar and the status region, by text node. */
function drawnText(element: HTMLElement): { nodes: { node: Text; start: number }[]; text: string } {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
  const nodes: { node: Text; start: number }[] = []
  let start = 0
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    if (node.parentElement?.closest('[role="toolbar"], [role="status"]') !== null) continue
    nodes.push({ node: node as Text, start })
    start += (node as Text).data.length
  }
  return { nodes, text: nodes.map((entry) => entry.node.data).join('') }
}

function pointAt(element: HTMLElement, at: number): [Text, number] {
  const hit = [...drawnText(element).nodes].reverse().find((entry) => entry.start <= at)
  if (hit === undefined) throw new Error('no text')
  return [hit.node, at - hit.start]
}

/** Selects from the start of `from` to the end of `to`, each where it first appears in the drawn text (`to` after `from`). */
function selectDrawn(from: string, to = from) {
  const element = root()
  const { text } = drawnText(element)
  const start = text.indexOf(from)
  const end = text.indexOf(to, start) + to.length
  if (start < 0 || end < to.length) throw new Error(`no text ${from} … ${to}`)
  const [startNode, startOffset] = pointAt(element, start)
  const [endNode, endOffset] = pointAt(element, end)
  document.getSelection()?.setBaseAndExtent(startNode, startOffset, endNode, endOffset)
}

const findBar = () => screen.findByRole('toolbar', { name: 'Selection' })
const noBar = () => expect(screen.queryByRole('toolbar', { name: 'Selection' })).toBeNull()

/** A reader with `selectionActions`, and the selection its actions were last drawn for. */
function reading(value: RichTextDocument, props: Partial<RichTextContentProps> = {}) {
  const seen: { selection: RichTextContentSelection | null; pressed: RichTextContentSelection[] } =
    {
      selection: null,
      pressed: [],
    }
  const actions = (selection: RichTextContentSelection) => {
    seen.selection = selection
    return (
      <Button
        variant="ghost"
        tone="neutral"
        size="sm"
        icon="comment"
        label="Comment"
        onClick={() => seen.pressed.push(selection)}
      />
    )
  }
  const view = render(<RichTextContent value={value} selectionActions={actions} {...props} />)
  const redraw = (next: RichTextDocument) =>
    view.rerender(<RichTextContent value={next} selectionActions={actions} {...props} />)
  return { seen, redraw, ...view }
}

/**
 * Makes a selection, waits for the bar, anchors an annotation on the range the
 * bar was given, and draws the result: what the reader selected, the range,
 * and the words the new annotation highlights.
 */
async function anchor(
  value: RichTextDocument,
  select: () => void | Promise<void>,
  props: Partial<RichTextContentProps> = {},
) {
  const { seen, redraw } = reading(value, props)
  await select()
  await findBar()
  const selection = seen.selection as RichTextContentSelection
  const next = annotateRichText(value, selection.range, 'x')
  redraw(next)
  return {
    selection,
    next,
    highlighted: marks('x').map((mark) => mark.textContent ?? ''),
  }
}

describe('the selection, in the document’s plain text', () => {
  it('maps words in a run, and anchors an annotation on exactly them', async () => {
    const value = doc(p(t('The retry policy doubles the wait.')))
    const { selection, highlighted } = await anchor(value, () => selectDrawn('doubles the wait'))
    expect(selection).toEqual({ range: { start: 17, end: 33 }, text: 'doubles the wait' })
    expect(highlighted).toEqual(['doubles the wait'])
  })

  it('maps a selection across marks', async () => {
    const value = doc(
      p(t('Retries are '), t('now', bold), t(' exponential', { type: 'italic' }), t(' for good')),
    )
    const { selection, highlighted } = await anchor(value, () => selectDrawn('are', 'expo'))
    expect(selection.text).toBe('are now expo')
    expect(highlighted.join('')).toBe('are now expo')
  })

  it('maps a selection inside a link, which draws its highlight around the whole Link', async () => {
    const link = { type: 'link', href: '/guide' }
    const value = doc(p(t('Read '), t('the delivery guide', link), t(' first.')))
    const { selection, next, highlighted } = await anchor(value, () => selectDrawn('delivery'))
    expect(selection).toEqual({ range: { start: 9, end: 17 }, text: 'delivery' })
    expect(richTextAnnotations(next)).toEqual([
      { id: 'x', text: 'delivery', range: { start: 9, end: 17 } },
    ])
    expect(highlighted).toEqual(['the delivery guide'])
  })

  it('maps a selection across a hard break, which is one line break and carries nothing', async () => {
    const value = doc(p(t('line one'), { type: 'break' }, t('line two')))
    const { selection, highlighted } = await anchor(value, () => selectDrawn('one', 'line'))
    expect(selection).toEqual({ range: { start: 5, end: 13 }, text: 'one\nline' })
    expect(highlighted).toEqual(['one', 'line'])
  })

  it('covers the whole entity when a selection ends inside its label', async () => {
    const value = doc(p(t('Ask '), ada(), t(' to review it.')))
    const ends = await anchor(value, () => selectDrawn('Ask', '@Ada'))
    expect(ends.selection).toEqual({ range: { start: 0, end: 17 }, text: 'Ask @Ada Lovelace' })
    expect(ends.highlighted).toEqual(['Ask ', '@Ada Lovelace'])
  })

  it('covers the whole entity when a selection starts inside its label', async () => {
    const value = doc(p(t('Ask '), ada(), t(' to review it.')))
    const starts = await anchor(value, () => selectDrawn('Lovelace', 'review'))
    expect(starts.selection.text).toBe('@Ada Lovelace to review')
    expect(starts.highlighted).toEqual(['@Ada Lovelace', ' to review'])
  })

  it('counts an entity the app draws as its label, whatever the app drew', async () => {
    const value = doc(p(t('Ask '), ada(), t(' to review it.')))
    const { selection, highlighted } = await anchor(value, () => selectDrawn('Ask', 'Ada L'), {
      entity: (entity) => <Link href={`/people/${entity.id}`}>{`Profile of ${entity.label}`}</Link>,
    })
    expect(selection).toEqual({ range: { start: 0, end: 17 }, text: 'Ask @Ada Lovelace' })
    expect(highlighted).toEqual(['Ask ', 'Profile of @Ada Lovelace'])
  })

  it('maps a selection across list items, with nothing between them', async () => {
    const item = (text: string) => ({ type: 'listItem', content: [p(t(text))] })
    const value = doc({
      type: 'list',
      ordered: true,
      start: 3,
      items: [item('first step'), item('second step')],
    })
    const { selection, highlighted } = await anchor(value, () => selectDrawn('step', 'second'))
    expect(selection).toEqual({ range: { start: 6, end: 16 }, text: 'stepsecond' })
    expect(highlighted).toEqual(['step', 'second'])
  })

  it('maps a selection in a quote', async () => {
    const { selection, highlighted } = await anchor(QUOTE, () => selectDrawn('retried up to'))
    expect(selection.text).toBe('retried up to')
    expect(highlighted).toEqual(['retried up to'])
  })

  it('maps a selection in a heading, which Heading draws without the highlight', async () => {
    const { selection, next, highlighted } = await anchor(STRUCTURE, () => selectDrawn('retries'))
    expect(selection).toEqual({ range: { start: 8, end: 15 }, text: 'retries' })
    expect(richTextAnnotations(next).map((annotation) => annotation.text)).toEqual(['retries'])
    expect(highlighted).toEqual([])
  })

  it('maps a selection in a heading past an entity, which it covers whole', async () => {
    const value = doc(
      { type: 'heading', level: 1, content: [t('Review by '), ada(), t(' today')] },
      p(t('Body.')),
    )
    const { selection } = await anchor(value, () => selectDrawn('Ada', 'today'))
    expect(selection).toEqual({ range: { start: 10, end: 29 }, text: '@Ada Lovelace today' })
  })

  it('maps a selection in a code block by its stored text, and anchors nothing there', async () => {
    const { selection, next } = await anchor(CODE, () => selectDrawn('request:', 'fetch'))
    expect(selection.text).toBe('request:const response = await fetch')
    expect(richTextAnnotations(next)).toEqual([
      { id: 'x', text: 'request:', range: { start: 24, end: 32 } },
    ])
    document.getSelection()?.removeAllRanges()
  })

  it('covers the code block when a selection ends in its own control', async () => {
    const value = doc(p(t('Run this:')), { type: 'codeBlock', text: 'retry --now' })
    const { seen } = reading(value)
    const [start] = pointAt(root(), 0)
    const control = root().querySelector('[data-member="code-block"]')?.parentElement
      ?.lastElementChild as Element
    document.getSelection()?.setBaseAndExtent(start, 0, control, 0)
    await findBar()
    expect(seen.selection).toEqual({ range: { start: 0, end: 20 }, text: 'Run this:retry --now' })
  })

  it('counts code points, so a character outside the basic plane is one', async () => {
    const value = doc(p(t('Retry 🔁 twice, then 𝒻ail')))
    const { selection, highlighted } = await anchor(value, () => selectDrawn('🔁 twice', '𝒻'))
    expect(selection).toEqual({ range: { start: 6, end: 21 }, text: '🔁 twice, then 𝒻' })
    expect(highlighted).toEqual(['🔁 twice, then 𝒻'])
  })

  it('maps a selection across blocks, with nothing between them', async () => {
    const value = doc(p(t('First paragraph ends here.')), p(t('Second one starts.')))
    const { selection, highlighted } = await anchor(value, () => selectDrawn('ends', 'Second'))
    expect(selection).toEqual({ range: { start: 16, end: 32 }, text: 'ends here.Second' })
    expect(highlighted).toEqual(['ends here.', 'Second'])
  })

  it('maps a word a double press selects', async () => {
    const value = doc(p(t('Every retry waits '), t('longer', bold), t(' than the last.')))
    const word = await anchor(value, () => userEvent.dblClick(screen.getByText('longer')))
    expect(word.selection).toEqual({ range: { start: 18, end: 24 }, text: 'longer' })
    expect(word.highlighted).toEqual(['longer'])
  })

  it('maps the paragraph a triple press selects, up to the next block', async () => {
    const value = doc(p(t('Every retry waits '), t('longer', bold), t(' than the last.')))
    const paragraph = await anchor(value, () =>
      userEvent.tripleClick(screen.getByText(/Every retry waits/)),
    )
    expect(paragraph.selection).toEqual({
      range: { start: 0, end: 39 },
      text: 'Every retry waits longer than the last.',
    })
    expect(paragraph.highlighted.join('')).toBe('Every retry waits longer than the last.')
  })

  it('draws no bar for a selection that starts or ends outside the member', async () => {
    render(
      <>
        <p>Outside the document.</p>
        <RichTextContent value={ANNOTATED} selectionActions={() => <span>never</span>} />
      </>,
    )
    const outside = screen.getByText('Outside the document.').firstChild as Text
    const [inside, offset] = pointAt(root(), 10)
    document.getSelection()?.setBaseAndExtent(outside, 3, inside, offset)
    await new Promise((resolve) => setTimeout(resolve, 60))
    noBar()
  })
})

describe('the selection bar', () => {
  it('appears when a pointer selection ends, not while it is made', async () => {
    reading(ANNOTATED)
    const [node] = pointAt(root(), 0)
    fireEvent.pointerDown(node.parentElement as Element)
    selectDrawn('retry policy')
    await new Promise((resolve) => setTimeout(resolve, 60))
    noBar()
    fireEvent.pointerUp(document.body)
    const bar = await findBar()
    expect(getComputedStyle(bar).position).toBe('fixed')
  })

  it('appears at once for a selection made without the pointer, above it and inside the window, and is said once', async () => {
    const actions = () => <span>Comment</span>
    render(
      <div style={{ paddingBlockStart: 160 }}>
        <RichTextContent value={ANNOTATED} selectionActions={actions} />
      </div>,
    )
    selectDrawn('retry policy')
    const bar = await findBar()
    const status = screen.getByRole('status')
    await vi.waitFor(() =>
      expect(status.textContent).toBe('Controls for the selection are available: Alt+F10'),
    )
    const range = document.getSelection()?.getRangeAt(0) as Range
    await vi.waitFor(() =>
      expect(bar.getBoundingClientRect().bottom).toBeLessThanOrEqual(
        range.getBoundingClientRect().top + 1,
      ),
    )
    expect(bar.getBoundingClientRect().left).toBeGreaterThanOrEqual(0)
    expect(bar.getBoundingClientRect().right).toBeLessThanOrEqual(
      document.documentElement.clientWidth,
    )
    // It follows the content, so Tab from the content reaches it.
    expect(root().contains(bar)).toBe(true)
    const last = drawnText(root()).nodes.at(-1)?.node as Text
    expect(last.compareDocumentPosition(bar) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    // A second selection draws the bar again and says nothing more.
    document.getSelection()?.removeAllRanges()
    await vi.waitFor(noBar)
    selectDrawn('after each')
    await findBar()
    expect(status.querySelectorAll('span')).toHaveLength(1)
  })

  it('names the bar and says it in the app’s words', async () => {
    reading(ANNOTATED, {
      messages: { selectionBar: 'Auswahl', selectionBarReady: 'Aktionen: Alt+F10' },
    })
    selectDrawn('retry policy')
    expect(await screen.findByRole('toolbar', { name: 'Auswahl' })).toBeTruthy()
    await vi.waitFor(() => expect(screen.getByRole('status').textContent).toBe('Aktionen: Alt+F10'))
  })

  it('hides for the selection on Escape, and comes back with the next one', async () => {
    reading(ANNOTATED)
    selectDrawn('retry policy')
    await findBar()
    await userEvent.keyboard('{Escape}')
    await vi.waitFor(noBar)
    expect(document.getSelection()?.toString()).toBe('retry policy')
    selectDrawn('after each')
    await findBar()
  })

  it('leaves when the selection collapses or leaves the member', async () => {
    render(
      <>
        <p>Elsewhere on the page.</p>
        <RichTextContent value={ANNOTATED} selectionActions={() => <span>Comment</span>} />
      </>,
    )
    selectDrawn('retry policy')
    await findBar()
    document.getSelection()?.collapseToEnd()
    await vi.waitFor(noBar)
    selectDrawn('retry policy')
    await findBar()
    const elsewhere = screen.getByText('Elsewhere on the page.').firstChild as Text
    document.getSelection()?.setBaseAndExtent(elsewhere, 0, elsewhere, 9)
    await vi.waitFor(noBar)
  })

  it('takes focus on Alt+F10 and by Tab from the content, stays while focus is in it, and gives focus back on Escape', async () => {
    const value = doc(
      p(t('See '), t('the guide', { type: 'link', href: '/guide' }), t(' and review these words.')),
    )
    reading(value)
    selectDrawn('these words')
    await findBar()
    await userEvent.keyboard('{Alt>}{F10}{/Alt}')
    expect(document.activeElement?.textContent).toBe('Comment')
    // The selection collapsing while focus is in the bar does not take the bar away.
    document.getSelection()?.removeAllRanges()
    await new Promise((resolve) => setTimeout(resolve, 60))
    expect(screen.getByRole('toolbar', { name: 'Selection' })).toBeTruthy()
    await userEvent.keyboard('{Escape}')
    await vi.waitFor(noBar)
    expect(document.getSelection()?.toString()).toBe('these words')
    // From the link, the next stop is the bar, which follows the content. The link takes focus
    // before the words are selected, because some engines drop a selection when focus moves.
    document.getSelection()?.removeAllRanges()
    await vi.waitFor(noBar)
    screen.getByRole('link', { name: 'the guide' }).focus()
    selectDrawn('review')
    await findBar()
    await userEvent.keyboard('{Tab}')
    expect(document.activeElement?.textContent).toBe('Comment')
    await userEvent.keyboard('{Escape}')
    await vi.waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('link', { name: 'the guide' })),
    )
  })

  it('keeps the selection under a pointer press on its control, and hands the control the range', async () => {
    const { seen } = reading(ANNOTATED)
    selectDrawn('doubles the wait')
    await findBar()
    await userEvent.click(screen.getByRole('button', { name: 'Comment' }))
    expect(seen.pressed).toEqual([{ range: { start: 17, end: 33 }, text: 'doubles the wait' }])
    expect(document.getSelection()?.toString()).toBe('doubles the wait')
  })

  it('collapses the selection and leaves when the app anchors an annotation and draws the new document', async () => {
    const value = doc(p(t('Anchor these words here.')))
    function Page() {
      const [body, setBody] = useState(value)
      return (
        <RichTextContent
          value={body}
          selectionActions={({ range }) => (
            <Button
              variant="ghost"
              tone="neutral"
              size="sm"
              icon="comment"
              label="Comment"
              onClick={() => setBody(annotateRichText(body, range, 'thread-9'))}
            />
          )}
        />
      )
    }
    render(<Page />)
    selectDrawn('these words')
    await findBar()
    await userEvent.keyboard('{Alt>}{F10}{/Alt}')
    await userEvent.keyboard('{Enter}')
    await vi.waitFor(() =>
      expect(marks('thread-9').map((mark) => mark.textContent)).toEqual(['these words']),
    )
    await vi.waitFor(noBar)
    expect(document.getSelection()?.isCollapsed).toBe(true)
    expect(screen.queryByRole('button', { name: 'Comment' })).toBeNull()
    expect(document.activeElement).toBe(document.body)
  })
})

describe('a document the reader only reads', () => {
  it('adds no listener to the page and registers nothing for an agent', () => {
    const onDocument = vi.spyOn(document, 'addEventListener')
    const onWindow = vi.spyOn(window, 'addEventListener')
    try {
      render(<RichTextContent value={ANNOTATED} activeAnnotation="thread-1" />)
      expect(onDocument).not.toHaveBeenCalled()
      expect(onWindow).not.toHaveBeenCalled()
      expect(agentRegistrations().filter(({ member }) => member === 'RichTextContent')).toEqual([])
    } finally {
      onDocument.mockRestore()
      onWindow.mockRestore()
    }
  })

  it('renders on a server what the client first draws', () => {
    const props: RichTextContentProps[] = [
      { value: ANNOTATED, activeAnnotation: 'thread-2' },
      { value: OVERLAPPING, onAnnotationSelect: () => {} },
      { value: CODE, selectionActions: () => null, onAnnotationSelect: () => {} },
      { value: ANNOTATED_ENTITY, selectionActions: () => null },
    ]
    for (const each of props) {
      // Read by the browser, so the server's escaping is the page's.
      const server = document.createElement('template')
      server.innerHTML = renderToString(<RichTextContent {...each} />)
      const { container, unmount } = render(<RichTextContent {...each} />)
      expect(container.innerHTML).toBe(server.innerHTML)
      unmount()
    }
  })
})

describe('an agent', () => {
  it('reads the highlights and opens one as a press does, and refuses one with no press', async () => {
    const onAnnotationSelect = vi.fn()
    render(
      <RichTextContent
        value={doc(
          p(t('The retry policy '), t('doubles the wait', note('thread-1')), t('.')),
          p(t('same words', note('b'), note('a'))),
        )}
        activeAnnotation="thread-1"
        onAnnotationSelect={onAnnotationSelect}
      />,
    )
    const bridge = createAgentBridge()
    try {
      const member = bridge.snapshot().members.find((entry) => entry.member === 'RichTextContent')
      expect(member?.state).toEqual({
        annotations: [
          { id: 'thread-1', label: 'doubles the wait' },
          { id: 'a', label: 'same words' },
          { id: 'b', label: 'same words', disabled: true },
        ],
        active: 'thread-1',
      })
      const opened = await bridge.act([{ id: member?.id, action: 'select', value: 'a' }])
      expect(opened.results[0]).toMatchObject({ ok: true })
      expect(onAnnotationSelect).toHaveBeenCalledExactlyOnceWith('a')
      const refused = await bridge.act([{ id: member?.id, action: 'select', value: 'b' }])
      expect(refused.results[0]).toMatchObject({ ok: false })
      expect(onAnnotationSelect).toHaveBeenCalledTimes(1)
    } finally {
      bridge.dispose()
    }
  })

  it('is not listed without onAnnotationSelect', async () => {
    render(<RichTextContent value={ANNOTATED} selectionActions={() => null} />)
    const bridge = createAgentBridge()
    try {
      expect(bridge.snapshot().members.map((entry) => entry.member)).not.toContain(
        'RichTextContent',
      )
    } finally {
      bridge.dispose()
    }
  })
})

/** The range the member writes for each drawn piece agrees with the model's walk. */
describe('the positions the member writes', () => {
  it('give the model’s text for every piece', () => {
    const value = doc(
      { type: 'heading', level: 1, content: [t('Title '), ada()] },
      p(
        t('Plain '),
        t('bold', bold),
        { type: 'break' },
        ada(),
        t(' and '),
        t('a link', { type: 'link', href: '/x' }),
      ),
      { type: 'list', ordered: false, items: [{ type: 'listItem', content: [p(t('item 𝒻'))] }] },
      { type: 'blockquote', content: [p(t('quoted'))] },
      { type: 'codeBlock', text: 'code();' },
      { type: 'callout', content: [t('later')] },
      p(t('end')),
    )
    render(<RichTextContent value={value} selectionActions={() => null} />)
    const pieces = Array.from(root().querySelectorAll('[data-rich-text-start]')).map((element) => {
      const range: RichTextRange = {
        start: Number(element.getAttribute('data-rich-text-start')),
        end: Number(element.getAttribute('data-rich-text-end')),
      }
      return [element.textContent, richTextRangeText(value, range)]
    })
    expect(pieces).toEqual([
      ['Title @Ada Lovelace', 'Title @Ada Lovelace'],
      ['Plain ', 'Plain '],
      ['bold', 'bold'],
      ['', '\n'],
      ['@Ada Lovelace', '@Ada Lovelace'],
      [' and ', ' and '],
      ['a link', 'a link'],
      ['item 𝒻', 'item 𝒻'],
      ['quoted', 'quoted'],
      ['code();', 'code();'],
      ['later', 'later'],
      ['end', 'end'],
    ])
  })
})
