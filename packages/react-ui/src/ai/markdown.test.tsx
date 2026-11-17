import { render, screen } from '@testing-library/react'
import { beforeAll, describe, expect, it } from 'vitest'

import { assertGoverned } from '@polymorph/react'
import { installTestTheme } from '@polymorph/engine/testing'
import { Markdown, type MarkdownProps } from './Markdown'
import { CITED, FENCE, STRUCTURE, TABLE } from './markdown.states'
import { SOURCES } from './source-list.states'

/**
 * Markdown, in a real browser.
 *
 * The parser's tree is tested beside it, in the engine
 * (`packages/engine/src/markdown/parse.test.ts`). These tests check two things.
 * The member renders each kind as a vocabulary member (a `##` is a Heading, a
 * fence is a CodeBlock, pipes are a Table), so nothing on the page has a
 * second type scale, including while the text is partly received. The model
 * cannot inject markup: no tag becomes an element, and no `javascript:` target
 * becomes a link.
 */

beforeAll(installTestTheme)

const root = () => document.querySelector('[data-member="markdown"]') as HTMLElement

describe('the closed surface', () => {
  it('has no style escape hatch', () => {
    assertGoverned<MarkdownProps>(true)
  })
})

describe('each kind renders as a vocabulary member', () => {
  it('renders a heading as Heading, relative to the shallowest, never at level 1', () => {
    render(<Markdown>{STRUCTURE}</Markdown>)
    // `##` is the reply's top heading, so it is level 2 and `###` is level 3.
    expect(screen.getByRole('heading', { level: 2, name: 'What changed' })).toBeTruthy()
    expect(screen.getByRole('heading', { level: 3, name: 'Why it matters' })).toBeTruthy()
    expect(screen.queryAllByRole('heading', { level: 1 })).toHaveLength(0)
  })

  it('maps `#` to level 2 and caps the depth at 4', () => {
    render(<Markdown>{'# Top\n\n## Second\n\n### Third\n\n#### Fourth'}</Markdown>)
    expect(screen.getByRole('heading', { level: 2, name: 'Top' })).toBeTruthy()
    expect(screen.getByRole('heading', { level: 3, name: 'Second' })).toBeTruthy()
    expect(screen.getByRole('heading', { level: 4, name: 'Third' })).toBeTruthy()
    expect(screen.getByRole('heading', { level: 4, name: 'Fourth' })).toBeTruthy()
  })

  it('renders a closed fence as a copyable CodeBlock', () => {
    render(<Markdown>{FENCE}</Markdown>)
    expect(root().querySelector('[data-member="code-block"]')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Copy' })).toBeTruthy()
  })

  it('omits the copy button on an open fence', () => {
    render(<Markdown streaming>{'```ts\nconst a = 1'}</Markdown>)
    expect(root().querySelector('[data-member="code-block"]')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Copy' })).toBeNull()
  })

  it('draws pipes as a Table with numeric columns right-aligned', () => {
    render(<Markdown>{TABLE}</Markdown>)
    expect(screen.getByRole('table')).toBeTruthy()
    expect(screen.getAllByRole('columnheader')).toHaveLength(3)
    const [, wait] = screen.getAllByRole('columnheader')
    expect(wait?.hasAttribute('data-numeric')).toBe(true)
    expect(screen.getAllByRole('row')).toHaveLength(6)
  })

  it('draws a [n] as a Citation to the nth source', () => {
    render(<Markdown sources={SOURCES}>{CITED}</Markdown>)
    const marks = root().querySelectorAll('[data-member="citation"]')
    expect(marks).toHaveLength(2)
    expect(marks[1]?.getAttribute('href')).toBe(SOURCES[1]?.href)
  })

  it('renders an HTML tag as literal text', () => {
    render(<Markdown>{'A <script>alert(1)</script> and an <img src=x onerror=alert(1)>'}</Markdown>)
    expect(root().querySelector('script')).toBeNull()
    expect(root().querySelector('img')).toBeNull()
    expect(root().textContent).toContain('<script>')
  })

  it('renders an unsafe link as its label text', () => {
    render(<Markdown>{'[click](javascript:alert(1)) and [fine](https://a.example)'}</Markdown>)
    const links = screen.getAllByRole('link')
    expect(links).toHaveLength(1)
    expect(links[0]?.getAttribute('href')).toBe('https://a.example')
    expect(root().textContent).toContain('click')
  })
})

describe('streaming', () => {
  it('puts the caret at the end of the last paragraph, once', () => {
    render(<Markdown streaming>{'First.\n\nSecond, still arriving'}</Markdown>)
    const carets = root().querySelectorAll('[aria-hidden="true"]')
    expect(carets).toHaveLength(1)
    const paragraphs = root().querySelectorAll('p')
    expect(paragraphs[paragraphs.length - 1]?.contains(carets[0] as Node)).toBe(true)
    expect(root().getAttribute('aria-busy')).toBe('true')
  })

  it('draws the caret on its own line after a block that cannot hold it', () => {
    render(<Markdown streaming>{'```ts\nconst a = 1'}</Markdown>)
    expect(root().querySelectorAll('[aria-hidden="true"]')).toHaveLength(1)
  })

  it('shows a one-line skeleton while nothing has arrived', () => {
    render(<Markdown streaming>{''}</Markdown>)
    expect(root().hasAttribute('data-pending')).toBe(true)
    expect(root().querySelector('[data-member="skeleton"]')).toBeTruthy()
  })
})
