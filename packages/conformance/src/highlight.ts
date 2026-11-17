import { beforeAll, describe, expect, it } from 'vitest'

import { installTestTheme } from '@polymorph/engine/testing'

/**
 * The law for what a Highlight marks and what a screen reader hears
 * (`design/components/highlight.md`), which every web shell's Highlight test
 * calls with a mount of its own. A contract statement reads one part's role,
 * name or attribute (`docs/conformance.md`). This law reads what the contract
 * grammar cannot state: which characters of the text are marked, that the text
 * is read once and whole, and that no mark is announced.
 */

/** The props the law mounts a Highlight with. */
export interface HighlightLawProps {
  text: string
  query?: string | string[]
  ranges?: [number, number][]
  locale?: string
}

export interface HighlightLaw {
  /** The shell's name as the law's titles say it: `Vue`. */
  readonly shell: string
  /** Mounts one Highlight with these props, and no other. A prop the law leaves out is not passed. */
  mount(props: HighlightLawProps): Promise<unknown>
}

/** The one Highlight on the page, or `null` when it renders nothing. */
const highlight = () => document.querySelector<HTMLElement>('[data-member="highlight"]')

const root = (): HTMLElement => {
  const element = highlight()
  if (element === null) throw new Error('the Highlight rendered nothing')
  return element
}

/**
 * The text with each mark in brackets, as the law spells what is marked. Only
 * text and elements count: a framework's comment anchors are not text.
 */
export function highlightSpelling(element: Element): string {
  let spelled = ''
  element.childNodes.forEach((node) => {
    if (node instanceof HTMLElement && node.tagName === 'MARK') spelled += `[${node.textContent}]`
    else if (node.nodeType === Node.TEXT_NODE || node instanceof Element)
      spelled += node.textContent ?? ''
  })
  return spelled
}

export function highlightLaw({ shell, mount }: HighlightLaw): void {
  describe(`${shell} Highlight — what it marks and what it says`, () => {
    beforeAll(installTestTheme)

    it('marks every occurrence of a query, whatever its case, with <mark>', async () => {
      await mount({ text: 'Invoice 2026, invoice 2025', query: 'invoice' })
      expect(highlightSpelling(root())).toBe('[Invoice] 2026, [invoice] 2025')
      expect(root().querySelectorAll('mark')).toHaveLength(2)
    })

    it('matches a query as written, never as a pattern', async () => {
      await mount({ text: 'a.b and axb', query: 'a.b' })
      expect(highlightSpelling(root())).toBe('[a.b] and axb')
    })

    it('marks each term of several, and joins marks that overlap', async () => {
      await mount({ text: 'abcdef', query: ['abc', 'bcd'] })
      expect(highlightSpelling(root())).toBe('[abcd]ef')
    })

    it('folds case in the locale it is given', async () => {
      await mount({ text: 'ISTANBUL', query: 'ıstanbul', locale: 'tr' })
      expect(highlightSpelling(root())).toBe('[ISTANBUL]')
    })

    it('marks the ranges a search engine returned, in place of a query', async () => {
      await mount({
        text: 'running runner',
        query: 'runner',
        ranges: [
          [0, 7],
          [5, 3],
        ],
      })
      expect(highlightSpelling(root())).toBe('[running] runner')
    })

    it('cuts a range at the end of the text', async () => {
      await mount({ text: 'abc', ranges: [[1, 99]] })
      expect(highlightSpelling(root())).toBe('a[bc]')
    })

    it('draws the text as it is when nothing matches', async () => {
      await mount({ text: 'Billing address updated', query: 'invoice' })
      expect(root().textContent).toBe('Billing address updated')
      expect(root().querySelector('mark')).toBeNull()
    })

    it('renders nothing for an empty text', async () => {
      await mount({ text: '', query: 'invoice' })
      expect(highlight()).toBeNull()
    })

    it('is read once and whole, and announces no mark', async () => {
      await mount({ text: 'Refund for invoice 2026-118', query: ['refund', 'invoice'] })
      // The text is in the document once, with no words of the member's own.
      expect(root().textContent).toBe('Refund for invoice 2026-118')
      expect(root().querySelector('[aria-hidden="true"]')).toBeNull()
      // A mark has no role, so a screen reader does not say "highlighted" at each match.
      for (const mark of root().querySelectorAll('mark')) {
        expect(mark.getAttribute('role')).toBe('presentation')
      }
    })

    it('takes the font and the size of the text around it, and marks by weight too', async () => {
      await mount({ text: 'Refund for invoice 2026-118', query: 'invoice' })
      const outer = getComputedStyle(root())
      const parent = getComputedStyle(root().parentElement as HTMLElement)
      expect(outer.fontFamily).toBe(parent.fontFamily)
      expect(outer.fontSize).toBe(parent.fontSize)
      expect(outer.color).toBe(parent.color)
      const mark = getComputedStyle(root().querySelector('mark') as HTMLElement)
      expect(mark.fontSize).toBe(parent.fontSize)
      expect(Number(mark.fontWeight)).toBeGreaterThan(Number(outer.fontWeight))
    })
  })
}
