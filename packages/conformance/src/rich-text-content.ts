import { userEvent } from 'vitest/browser'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { installTestTheme } from '@polymorph/engine/testing'

import { harness } from './harness'
import type { MountAdapter, Mounted, Override } from './run'

/**
 * The law for what RichTextContent draws for a document
 * (`design/components/rich-text-content.md`), which every web shell's
 * `rich-text-content.test` calls with its adapter, and the React member's test
 * too. The contract grammar states the highlights' role, name, keys and press,
 * and the selection bar's announcement; this law holds what it cannot state:
 * the member each node is drawn as, the levels and numbers, the app's entity
 * where it draws one and the token where it does not, highlights nested as
 * the editor nests them, and the selection bar at selected words with the
 * positions it maps them by.
 *
 * Each test mounts a states fixture entry through the shell's adapter, so the
 * law reads every shell through the same entries.
 */

export interface RichTextContentLaw {
  /** The shell's name as the law's titles say it: `Vue`. */
  readonly shell: string
  /** The shell's mount adapter. */
  readonly adapter: MountAdapter
}

const WAIT = 3000

const ENTRY = {
  prose: 'prose — every mark, a hard break and a link',
  structure: 'structure — headings at three levels, a nested list and a list from 3',
  code: 'a code block — CodeBlock, copyable, named by its language',
  entities: 'entities — the entity token',
  appEntities: 'entities drawn by the app — a person as a Link, an issue left to the token',
  later: 'a later version — an unknown block and inline, drawn as their text',
  empty: 'empty — the root and nothing in it',
  annotated: 'annotated — two comment threads, one active',
  overlapping: 'overlapping annotations — a thread inside another, nested as the editor nests them',
  annotatedEntity: 'an annotated entity — a mention inside a thread, ringed with its wash',
  annotatedHeading:
    'an annotated heading — a thread on a heading’s words, drawn as Heading draws it',
  bar: 'the selection bar — a comment at the selected words',
} as const

const rootOf = (mounted: HTMLElement) =>
  mounted.querySelector<HTMLElement>('[data-member="rich-text-content"]') as HTMLElement

/** The ids of the highlights an element is in, itself included, outermost first. */
function marksAround(element: Element, root: Element): string[] {
  const out: string[] = []
  for (let at: Element | null = element; at !== null && at !== root; at = at.parentElement) {
    const id = at.getAttribute('data-annotation-id')
    if (at.localName === 'mark' && id !== null) out.unshift(id)
  }
  return out
}

/**
 * The innermost element whose text is exactly `words`. A shell may keep empty
 * text nodes beside what it draws, so the innermost is the last in document
 * order whose text is the words.
 */
function holding(root: Element, words: string): Element {
  const found = [...root.querySelectorAll('*')].filter((element) => element.textContent === words)
  const innermost = found.at(-1)
  if (innermost === undefined) throw new Error(`nothing holds "${words}"`)
  return innermost
}

export function richTextContentLaw({ shell, adapter }: RichTextContentLaw): void {
  describe(`RichTextContent — the ${shell} shell`, () => {
    beforeAll(installTestTheme)

    let mounted: Mounted | null = null
    afterEach(() => {
      mounted?.unmount()
      mounted = null
      document.getSelection()?.removeAllRanges()
    })

    async function open(
      state: string,
      overrides: Readonly<Record<string, Override>> = {},
    ): Promise<HTMLElement> {
      mounted = await adapter.mount('RichTextContent', { state, overrides })
      const host = mounted.root
      return vi.waitFor(
        () => {
          const root = rootOf(host)
          expect(root).not.toBeNull()
          return root
        },
        { timeout: WAIT },
      )
    }

    it('draws each node as its member: Text, the marks, Code, Link and a hard break', async () => {
      const root = await open(ENTRY.prose)
      expect(root.querySelectorAll('[data-member="text"]')).toHaveLength(2)
      expect(root.querySelector('strong')?.textContent).toBe('exponential')
      expect(root.querySelector('em')?.textContent).toBe('doubles')
      expect(root.querySelector('s')?.textContent).toBe('three-attempt')
      expect(root.querySelector('[data-member="code"]')?.textContent).toBe('Idempotency-Key')
      expect(root.querySelectorAll('br')).toHaveLength(1)
      const link = root.querySelector<HTMLAnchorElement>('a[data-member="link"]')
      expect(link?.getAttribute('href')).toBe('https://docs.example.org/webhooks/retries')
      expect(link?.hasAttribute('data-external')).toBe(true)
    })

    it('draws headings one level under the page, a nested list, and a list from its start', async () => {
      const root = await open(ENTRY.structure)
      expect([...root.querySelectorAll('h1, h2, h3, h4')].map((h) => h.localName)).toEqual([
        'h2',
        'h3',
        'h4',
      ])
      expect(root.querySelectorAll('ul ul')).toHaveLength(1)
      expect(root.querySelector('ol')?.getAttribute('start')).toBe('3')
      expect(root.querySelector('ul')?.hasAttribute('start')).toBe(false)
    })

    it('draws a code block as a copyable CodeBlock named by its language', async () => {
      const root = await open(ENTRY.code)
      const block = root.querySelector('[data-member="code-block"]') as HTMLElement
      expect(block).not.toBeNull()
      expect(block.textContent).toContain('Idempotency-Key')
      expect(block.hasAttribute('data-copyable')).toBe(true)
    })

    it('draws the token for an entity, and the app’s drawing where it draws one', async () => {
      const tokens = await open(ENTRY.entities)
      expect(
        [...tokens.querySelectorAll('[data-entity-kind]')].map((token) => token.textContent),
      ).toEqual(['@Ada Lovelace', '#142'])
      mounted?.unmount()
      const drawn = await open(ENTRY.appEntities)
      await vi.waitFor(
        () =>
          expect(drawn.querySelector('a[href="/people/u_ada"]')?.textContent).toBe('@Ada Lovelace'),
        { timeout: WAIT },
      )
      expect(
        [...drawn.querySelectorAll('[data-entity-kind]')].map((token) => token.textContent),
      ).toEqual(['#142'])
    })

    it('draws a document of a later version as the text found in it, and the empty one as nothing', async () => {
      const later = await open(ENTRY.later)
      expect(later.textContent).toContain('Deliveries pause while the migration runs.')
      expect(later.textContent).toContain('Friday 4 December')
      mounted?.unmount()
      const empty = await open(ENTRY.empty)
      expect(empty.hasAttribute('data-empty')).toBe(true)
      expect(empty.textContent).toBe('')
    })

    it('draws highlights with one stop each, and reports a press and Enter on one', async () => {
      const onAnnotationSelect = vi.fn()
      const root = await open(ENTRY.annotated, { onAnnotationSelect })
      const stops = [...root.querySelectorAll<HTMLElement>('mark[role="button"]')]
      expect(stops.map((stop) => stop.getAttribute('data-annotation-id'))).toEqual([
        'thread-1',
        'thread-2',
      ])
      expect(stops.map((stop) => harness.nameOf(stop))).toEqual([
        'doubles the wait',
        'up to five times',
      ])
      expect(stops[1]?.getAttribute('aria-current')).toBe('true')
      expect(stops[0]?.hasAttribute('data-active')).toBe(false)
      await userEvent.click(stops[0] as HTMLElement)
      await vi.waitFor(() => expect(onAnnotationSelect).toHaveBeenLastCalledWith('thread-1'), {
        timeout: WAIT,
      })
      ;(stops[1] as HTMLElement).focus()
      await userEvent.keyboard('{Enter}')
      await vi.waitFor(() => expect(onAnnotationSelect).toHaveBeenLastCalledWith('thread-2'), {
        timeout: WAIT,
      })
      expect(onAnnotationSelect).toHaveBeenCalledTimes(2)
    })

    it('nests overlapping highlights as the editor does, the inner one in the emphasis', async () => {
      const root = await open(ENTRY.overlapping)
      expect(marksAround(holding(root, 'as long'), root)).toEqual(['thread-1', 'thread-2'])
      expect(holding(root, 'as long').closest('strong')).not.toBeNull()
      expect(marksAround(holding(root, 'twice '), root)).toEqual(['thread-1'])
      expect(
        root.querySelector('mark[data-annotation-id="thread-2"][role="button"]'),
      ).not.toBeNull()
    })

    it('rings an entity inside a highlight, and draws a heading with a highlight as its own', async () => {
      const entity = await open(ENTRY.annotatedEntity)
      const token = entity.querySelector('[data-entity-kind]') as Element
      expect(marksAround(token, entity)).toEqual(['thread-3'])
      mounted?.unmount()
      const heading = await open(ENTRY.annotatedHeading)
      const h2 = heading.querySelector('h2') as HTMLElement
      expect(h2.textContent).toBe('Webhook retries')
      expect(h2.querySelector('mark[data-annotation-id="thread-4"]')?.textContent).toBe('retries')
      expect(h2.getAttribute('data-level')).toBe('2')
    })

    it('draws the selection bar at selected words, with the app’s control and the words’ positions', async () => {
      const root = await open(ENTRY.bar)
      const bar = await vi.waitFor(
        () => {
          const found = document.querySelector<HTMLElement>(
            '[role="toolbar"][aria-label="Selection"]',
          )
          expect(found).not.toBeNull()
          expect(found?.getAttribute('data-state')).toBeNull()
          return found as HTMLElement
        },
        { timeout: WAIT },
      )
      expect([...bar.querySelectorAll('button')].map((button) => harness.nameOf(button))).toEqual([
        'Comment',
      ])
      const status = root.querySelector('[role="status"]') as HTMLElement
      await vi.waitFor(
        () => expect(status.textContent).toBe('Controls for the selection are available: Alt+F10'),
        { timeout: WAIT },
      )
      const piece = holding(root, 'doubles the wait').closest('[data-rich-text-start]')
      expect(piece?.getAttribute('data-rich-text-start')).toBe('17')
      expect(piece?.getAttribute('data-rich-text-end')).toBe('33')
      const box = bar.getBoundingClientRect()
      expect(box.left).toBeGreaterThanOrEqual(0)
      expect(box.right).toBeLessThanOrEqual(document.documentElement.clientWidth)
      // Escape hides the bar for this selection.
      await userEvent.keyboard('{Escape}')
      await vi.waitFor(
        () => expect(document.querySelector('[role="toolbar"][aria-label="Selection"]')).toBeNull(),
        { timeout: WAIT },
      )
      expect(document.getSelection()?.toString()).toBe('doubles the wait')
    })
  })
}
