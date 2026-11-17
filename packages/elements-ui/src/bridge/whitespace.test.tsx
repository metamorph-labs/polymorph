import { render } from 'solid-js/web'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { installTestTheme } from '@polymorph/engine/testing'
import { CodeBlock, Highlight, Markdown, StreamingText } from '@polymorph/solid-ui'

import '../ai/Markdown'
import '../ai/StreamingText'
import '../layout/Stack'
import '../structure/Badge'
import '../structure/CodeBlock'
import '../structure/Highlight'
import { mount } from '../mount'

/**
 * The whitespace rule against the members that read their text exactly. A
 * page's text inside an element is the member's text as it is: indentation,
 * line breaks, runs of spaces and a trailing newline. The one thing the
 * element drops is text that is only whitespace and holds a line break, which
 * is how a JSX author lays out children and what JSX drops. So each member
 * draws a page's text as the Solid member draws the same string.
 */

beforeAll(installTestTheme)

const CODE = 'function retry(attempt) {\n  return 2 ** attempt\n}\n\n  // two spaces in\n'
const STREAM = 'First line\n\nSecond line,  with two spaces.\n'
const MARKDOWN = '## Steps\n\n1. Install\n2. Run `pnpm gate`\n\n    indented code\n'

const escape = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** What a member drew, as text and markup with its instance ids left out. */
async function drawn(root: Element): Promise<{ text: string; markup: string }> {
  const member = await vi.waitFor(() => {
    const found = root.querySelector('[data-member]')
    if (found === null) throw new Error('nothing rendered')
    return found
  })
  return {
    text: member.textContent ?? '',
    markup: member.outerHTML.replace(/\bcl-\d+\b/g, 'id').replace(/<!---->/g, ''),
  }
}

/** The Solid member's drawing of the same text. */
async function solid(view: () => unknown): Promise<{ text: string; markup: string }> {
  const host = document.createElement('div')
  document.body.append(host)
  const dispose = render(view as () => Element, host)
  const read = await drawn(host)
  dispose()
  host.remove()
  return read
}

describe('a member that reads its text exactly draws the page’s text as it is', () => {
  it('CodeBlock keeps indentation, blank lines and a trailing newline', async () => {
    const expected = await solid(() => <CodeBlock>{CODE}</CodeBlock>)
    const { host } = await mount({
      name: 'code',
      html: `<poly-code-block>${escape(CODE)}</poly-code-block>`,
    })
    const actual = await drawn(host)
    expect(actual.text).toBe(expected.text)
    expect(actual.markup).toBe(expected.markup)
  })

  it('StreamingText keeps line breaks and runs of spaces', async () => {
    const expected = await solid(() => <StreamingText>{STREAM}</StreamingText>)
    const { host } = await mount({
      name: 'stream',
      html: `<poly-streaming-text>${escape(STREAM)}</poly-streaming-text>`,
    })
    expect((await drawn(host)).markup).toBe(expected.markup)
  })

  it('Markdown reads the page’s source with its blank lines and indentation', async () => {
    const expected = await solid(() => <Markdown>{MARKDOWN}</Markdown>)
    const { host } = await mount({
      name: 'markdown',
      html: `<poly-markdown>${escape(MARKDOWN)}</poly-markdown>`,
    })
    expect((await drawn(host)).markup).toBe(expected.markup)
  })

  it('Highlight reads its text attribute as it is, spaces and all', async () => {
    const text = '  Ada  Okonkwo  '
    const expected = await solid(() => <Highlight text={text} query="ada" />)
    const { host } = await mount({
      name: 'highlight',
      html: `<poly-highlight text="${text}" query="ada"></poly-highlight>`,
    })
    const actual = await drawn(host)
    expect(actual.text).toBe(text)
    expect(actual.markup).toBe(expected.markup)
  })
})

describe('the text the element drops', () => {
  it('drops whitespace with a line break between elements, as JSX does', async () => {
    const { host } = await mount({
      name: 'layout',
      html: '<poly-stack gap="2">\n  <poly-badge>One</poly-badge>\n  <poly-badge>Two</poly-badge>\n</poly-stack>',
    })
    const stack = await drawn(host)
    expect(stack.text).toBe('OneTwo')
  })

  it('keeps whitespace with no line break, and text that holds a line break among other characters', async () => {
    const { host } = await mount({
      name: 'kept',
      html: '<poly-code-block> </poly-code-block><poly-code-block>\nx\n</poly-code-block>',
    })
    const blocks = await vi.waitFor(() => {
      const found = [...host.querySelectorAll('[data-member="code-block"]')]
      if (found.length < 2) throw new Error('not rendered')
      return found
    })
    expect(blocks.map((block) => block.querySelector('code')?.textContent)).toEqual([' ', '\nx\n'])
  })
})
