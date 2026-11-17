import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { installTestTheme } from '@polymorph/engine/testing'

/**
 * The law for which section a TableOfContents marks and what a click on one of
 * its links does (`design/components/table-of-contents.md`, Behaviour), which
 * every web shell's TableOfContents test calls with a mount of its own. A
 * contract statement reads one part in a fixture entry and moves no scroll
 * position (`docs/conformance.md`). This law builds the page the list follows,
 * scrolls it, clicks the list's links and unmounts the list.
 *
 * The page is plain DOM, the same in every shell: a 400px box that scrolls,
 * holding sections of known heights, before the list in the document. The
 * browser reports a scroll and an intersection asynchronously, and the three
 * engines report them at different moments, so the law sets a scroll position
 * and waits for the mark. It never waits for a time.
 *
 * The law clicks a link from a script and reads `document.activeElement`,
 * because Tab does not stop on links in WebKit.
 */

/** An item as the law passes it, in the shape of the member's `TableOfContentsItem`. */
export interface TableOfContentsLawItem {
  id: string
  label: string
  level?: 1 | 2
}

export interface TableOfContentsLawMount {
  readonly items: TableOfContentsLawItem[]
  readonly onCurrentChange: (id: string | null) => void
}

export interface MountedTableOfContents {
  /** Sets the items, as the list's parent's state would. */
  set(items: TableOfContentsLawItem[]): void | Promise<void>
  unmount(): void
}

export interface TableOfContentsLaw {
  /** The shell's name as the law's titles say it: `Vue`. */
  readonly shell: string
  /** Mounts a TableOfContents labelled `On this page` with the items and the handler given. */
  mount(options: TableOfContentsLawMount): Promise<MountedTableOfContents>
}

/** The height of the page's box, and where the line is in it. */
const PAGE = 400
const LINE = PAGE / 4

/** A box that scrolls, holding one section of each height, with ids `s-1`, `s-2`, …. */
function page(heights: number[], { intro = 0 }: { intro?: number } = {}): HTMLElement {
  const box = document.createElement('div')
  box.dataset['lawPage'] = ''
  box.style.cssText = `height: ${PAGE}px; overflow-y: auto; margin: 0; padding: 0`
  if (intro > 0) {
    const before = document.createElement('p')
    before.style.cssText = `height: ${intro}px; margin: 0`
    before.textContent = 'Before the first section.'
    box.append(before)
  }
  heights.forEach((height, at) => {
    const section = document.createElement('section')
    section.id = `s-${at + 1}`
    section.style.cssText = `height: ${height}px; margin: 0`
    const heading = document.createElement('h2')
    heading.textContent = `Section ${at + 1}`
    section.append(heading)
    box.append(section)
  })
  document.body.prepend(box)
  return box
}

/** One item for each section, labelled as its heading is. */
const itemsFor = (count: number): TableOfContentsLawItem[] =>
  Array.from({ length: count }, (_, at) => ({ id: `s-${at + 1}`, label: `Section ${at + 1}` }))

const nav = (): HTMLElement => {
  const element = document.querySelector<HTMLElement>('[data-member="table-of-contents"]')
  if (element === null) throw new Error('the TableOfContents rendered nothing')
  return element
}

const link = (label: string): HTMLAnchorElement => {
  const found = [...nav().querySelectorAll('a')].find((a) => a.textContent?.trim() === label)
  if (found === undefined) throw new Error(`no link "${label}"`)
  return found
}

/** The labels of the links that carry `aria-current`, with its value. */
const marked = (): string[] =>
  [...nav().querySelectorAll('[aria-current]')].map(
    (a) => `${a.textContent?.trim()}=${a.getAttribute('aria-current')}`,
  )

const scroll = (box: HTMLElement, top: number) => {
  box.scrollTop = top
}

/**
 * Clicks a link and resolves once the browser has followed it: the fragment
 * changed, and its `hashchange` has been delivered. Gecko follows a link a
 * task after the click, and every engine delivers `hashchange` a task after
 * the change, so a test that went on without waiting would meet the event in
 * a later step, or in the next test.
 */
function follow(label: string): Promise<void> {
  const followed = new Promise<void>((settle) => {
    window.addEventListener('hashchange', () => settle(), { once: true })
  })
  link(label).click()
  return followed
}

export function tableOfContentsLaw({ shell, mount }: TableOfContentsLaw): void {
  describe(`${shell} TableOfContents — the list`, () => {
    beforeAll(installTestTheme)

    afterEach(() => {
      for (const box of document.querySelectorAll('[data-law-page]')) box.remove()
      history.replaceState(null, '', location.pathname + location.search)
      vi.unstubAllGlobals()
    })

    it('is a navigation landmark named by its label, around a list of links to the sections', async () => {
      page([300, 300, 300])
      await mount({ items: itemsFor(3), onCurrentChange: () => {} })

      const landmark = nav()
      expect(landmark.tagName).toBe('NAV')
      const labelledBy = landmark.getAttribute('aria-labelledby') ?? ''
      expect(document.getElementById(labelledBy)?.textContent?.trim()).toBe('On this page')
      expect(landmark.querySelectorAll(':scope > ul > li > a')).toHaveLength(3)
      expect(link('Section 2').getAttribute('href')).toBe('#s-2')
    })

    it('draws a subsection in a list inside its section’s item', async () => {
      page([300, 300, 300, 300])
      await mount({
        items: [
          { id: 's-1', label: 'Section 1' },
          { id: 's-2', label: 'Section 2', level: 2 },
          { id: 's-3', label: 'Section 3', level: 2 },
          { id: 's-4', label: 'Section 4' },
        ],
        onCurrentChange: () => {},
      })

      const top = nav().querySelectorAll(':scope > ul > li')
      expect(top).toHaveLength(2)
      expect(
        [...(top[0] as Element).querySelectorAll(':scope > ul > li > a')].map((a) => a.textContent),
      ).toEqual(['Section 2', 'Section 3'])
      expect((top[1] as Element).querySelector('ul')).toBeNull()
    })
  })

  describe(`${shell} TableOfContents — the current section`, () => {
    beforeAll(installTestTheme)

    afterEach(() => {
      for (const box of document.querySelectorAll('[data-law-page]')) box.remove()
      history.replaceState(null, '', location.pathname + location.search)
    })

    it('marks the section that has reached the line, down the page and back up', async () => {
      const box = page([300, 300, 300, 300, 300])
      const onCurrentChange = vi.fn()
      await mount({ items: itemsFor(5), onCurrentChange })

      await vi.waitFor(() => expect(marked()).toEqual(['Section 1=location']))
      // Section 2 starts at 300: at 250 its top is 50px down the page, above the line.
      scroll(box, 250)
      await vi.waitFor(() => expect(marked()).toEqual(['Section 2=location']))
      // Sections 3 and 4 are in view at 650, and only the third has reached the line.
      scroll(box, 650)
      await vi.waitFor(() => expect(marked()).toEqual(['Section 3=location']))
      scroll(box, 0)
      await vi.waitFor(() => expect(marked()).toEqual(['Section 1=location']))
      expect(onCurrentChange.mock.calls.map(([id]) => id)).toEqual(['s-1', 's-2', 's-3', 's-1'])
    })

    it('marks no section while the first is below the line', async () => {
      const box = page([300, 300, 300], { intro: LINE + 50 })
      const onCurrentChange = vi.fn()
      await mount({ items: itemsFor(3), onCurrentChange })

      expect(marked()).toEqual([])
      scroll(box, 100)
      await vi.waitFor(() => expect(marked()).toEqual(['Section 1=location']))
      scroll(box, 0)
      await vi.waitFor(() => expect(marked()).toEqual([]))
      expect(onCurrentChange.mock.calls.map(([id]) => id)).toEqual(['s-1', null])
    })

    it('marks the last section at the end of the page, though its top never reaches the line', async () => {
      const box = page([600, 600, 60, 60])
      await mount({ items: itemsFor(4), onCurrentChange: () => {} })

      scroll(box, box.scrollHeight - box.clientHeight - 60)
      await vi.waitFor(() => expect(marked()).toEqual(['Section 2=location']))
      scroll(box, box.scrollHeight)
      await vi.waitFor(() => expect(marked()).toEqual(['Section 4=location']))
    })

    it('draws a link for a section that is not in the document, and never marks it', async () => {
      const box = page([300, 300, 300])
      await mount({
        items: [
          ...itemsFor(2),
          { id: 'missing', label: 'Missing' },
          { id: 's-3', label: 'Section 3' },
        ],
        onCurrentChange: () => {},
      })

      expect(link('Missing').getAttribute('href')).toBe('#missing')
      // The page ends at 500, where the last section in the document is current.
      for (const [top, label] of [
        [250, 'Section 2'],
        [500, 'Section 3'],
        [0, 'Section 1'],
        [500, 'Section 3'],
      ] as const) {
        scroll(box, top)
        await vi.waitFor(() => expect(marked()).toEqual([`${label}=location`]))
      }
      // Its click is the browser's: the mark and focus stay where they were.
      const followed = follow('Missing')
      expect(marked()).toEqual(['Section 3=location'])
      await followed
      expect(location.hash).toBe('#missing')
      expect(marked()).toEqual(['Section 3=location'])
      expect(document.activeElement).not.toBe(document.getElementById('s-3'))
    })

    it('follows the items it is given after it mounts', async () => {
      const box = page([300, 300, 300, 300])
      const mounted = await mount({ items: itemsFor(2), onCurrentChange: () => {} })

      scroll(box, 650)
      await vi.waitFor(() => expect(marked()).toEqual(['Section 2=location']))
      await mounted.set(itemsFor(4))
      // The scroll the reader made stays, and the new items are decided at once.
      await vi.waitFor(() => expect(marked()).toEqual(['Section 3=location']))
      scroll(box, 950)
      await vi.waitFor(() => expect(marked()).toEqual(['Section 4=location']))
    })
  })

  describe(`${shell} TableOfContents — a click`, () => {
    beforeAll(installTestTheme)

    afterEach(() => {
      for (const box of document.querySelectorAll('[data-law-page]')) box.remove()
      history.replaceState(null, '', location.pathname + location.search)
    })

    it('marks its section at once and moves focus to it', async () => {
      // The third section is short: at its top the fourth has reached the line too.
      const box = page([300, 300, 60, 300, 300])
      const onCurrentChange = vi.fn()
      await mount({ items: itemsFor(5), onCurrentChange })
      await vi.waitFor(() => expect(marked()).toEqual(['Section 1=location']))

      const followed = follow('Section 3')
      await vi.waitFor(() => expect(marked()).toEqual(['Section 3=location']))
      const section = document.getElementById('s-3') as HTMLElement
      expect(document.activeElement).toBe(section)
      expect(section.getAttribute('tabindex')).toBe('-1')
      expect(onCurrentChange).toHaveBeenLastCalledWith('s-3')
      // The browser follows the link: the address names the section, the page is at it, and the
      // mark and focus are still the click's.
      await followed
      expect(location.hash).toBe('#s-3')
      expect(box.scrollTop).toBeGreaterThan(0)
      expect(marked()).toEqual(['Section 3=location'])
      expect(document.activeElement).toBe(section)

      // Focus leaves: the section is not a tab stop of the page.
      link('Section 1').focus()
      expect(section.hasAttribute('tabindex')).toBe(false)
    })

    it('holds the mark while the page moves, until the reader scrolls', async () => {
      const box = page([300, 300, 60, 300, 300])
      await mount({ items: itemsFor(5), onCurrentChange: () => {} })
      await vi.waitFor(() => expect(marked()).toEqual(['Section 1=location']))

      await follow('Section 3')
      await vi.waitFor(() => expect(marked()).toEqual(['Section 3=location']))
      // A scroll the reader did not make leaves the mark where the click put it.
      scroll(box, 610)
      box.dispatchEvent(new Event('scroll'))
      expect(marked()).toEqual(['Section 3=location'])

      box.dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaY: 10 }))
      scroll(box, 620)
      await vi.waitFor(() => expect(marked()).toEqual(['Section 4=location']))
    })

    it('leaves a click with a modifier key to the browser', async () => {
      page([300, 300, 300])
      const onCurrentChange = vi.fn()
      await mount({ items: itemsFor(3), onCurrentChange })
      await vi.waitFor(() => expect(marked()).toEqual(['Section 1=location']))

      const modified = new MouseEvent('click', { bubbles: true, cancelable: true, metaKey: true })
      // Cancelled from the document, so the browser opens no tab the test cannot close.
      const cancel = (event: Event) => event.preventDefault()
      document.addEventListener('click', cancel)
      link('Section 3').dispatchEvent(modified)
      document.removeEventListener('click', cancel)

      expect(marked()).toEqual(['Section 1=location'])
      expect(document.activeElement).not.toBe(document.getElementById('s-3'))
      expect(onCurrentChange).toHaveBeenCalledTimes(1)
    })
  })

  describe(`${shell} TableOfContents — unmounting`, () => {
    beforeAll(installTestTheme)

    afterEach(() => {
      for (const box of document.querySelectorAll('[data-law-page]')) box.remove()
      vi.unstubAllGlobals()
      vi.restoreAllMocks()
    })

    it('leaves no observer and no listener behind', async () => {
      const Native = window.IntersectionObserver
      const created: IntersectionObserver[] = []
      const disconnected = new Set<IntersectionObserver>()
      vi.stubGlobal(
        'IntersectionObserver',
        class extends Native {
          constructor(...args: ConstructorParameters<typeof Native>) {
            super(...args)
            created.push(this)
          }

          override disconnect() {
            disconnected.add(this)
            super.disconnect()
          }
        },
      )
      const box = page([300, 300, 300])
      const onCurrentChange = vi.fn()
      const mounted = await mount({ items: itemsFor(3), onCurrentChange })
      await vi.waitFor(() => expect(onCurrentChange).toHaveBeenCalledWith('s-1'))
      expect(created.length).toBeGreaterThan(0)

      mounted.unmount()
      expect(created.every((observer) => disconnected.has(observer))).toBe(true)
      scroll(box, 650)
      box.dispatchEvent(new Event('scroll'))
      box.dispatchEvent(new WheelEvent('wheel', { bubbles: true }))
      expect(onCurrentChange).toHaveBeenCalledTimes(1)
    })
  })
}
