import { afterEach, describe, expect, it, vi } from 'vitest'

import { jumpToSection, SECTION_LINE, watchSections } from './sections'

/**
 * `watchSections` and `jumpToSection`, which every framework's TableOfContents
 * follows a page with. The page here is plain DOM: a box that scrolls, holding
 * sections of known heights, and an element that stands for the list.
 *
 * The browser reports a scroll and an intersection asynchronously, and the
 * three engines report them at different moments, so a test sets a scroll
 * position and waits for the outcome. It never waits for a time.
 */

afterEach(() => {
  document.body.replaceChildren()
  history.replaceState(null, '', location.pathname + location.search)
})

const PAGE = 400
const LINE = PAGE * SECTION_LINE

/** A 400px box that scrolls, holding sections of these heights, and the list's element. */
function page(heights: number[], { scrolls = true }: { scrolls?: boolean } = {}) {
  const owner = document.createElement('nav')
  const box = document.createElement('div')
  box.style.cssText = scrolls
    ? `height: ${PAGE}px; overflow-y: auto; margin: 0; padding: 0`
    : 'margin: 0; padding: 0'
  const sections = heights.map((height, at) => {
    const section = document.createElement('section')
    section.id = `section-${at + 1}`
    section.style.cssText = `height: ${height}px; margin: 0`
    section.textContent = `Section ${at + 1}`
    return section
  })
  box.append(...sections)
  document.body.append(owner, box)
  return { owner, box, sections, ids: sections.map((section) => section.id) }
}

/** The ids `watchSections` reported, in order. */
function watched(owner: Element, ids: string[]) {
  const reports: (string | null)[] = []
  const stop = watchSections(owner, ids, (id) => reports.push(id))
  return { reports, stop, last: () => reports.at(-1) }
}

const click = (init: MouseEventInit = {}) =>
  new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, ...init })

describe('watchSections', () => {
  it('reports once at once: the section at the top of the page', () => {
    const { owner, ids } = page([300, 300, 300])
    const { reports, stop } = watched(owner, ids)
    expect(reports).toEqual(['section-1'])
    stop()
  })

  it('reports no section while the first one is below the line', () => {
    const { owner, box, ids } = page([300, 300, 300])
    const intro = document.createElement('p')
    intro.style.cssText = `height: ${LINE + 50}px; margin: 0`
    box.prepend(intro)
    const { reports, stop } = watched(owner, ids)
    expect(reports).toEqual([null])
    stop()
  })

  it('moves the mark to the section that reached the line, down the page and back up', async () => {
    const { owner, box, ids } = page([300, 300, 300, 300, 300])
    const { last, stop } = watched(owner, ids)
    // Section 2 starts at 300: at 250 its top is 50px down, above the line.
    box.scrollTop = 250
    await vi.waitFor(() => expect(last()).toBe('section-2'))
    // Several sections are in view at 650: the third, whose top has passed the line, is current.
    box.scrollTop = 650
    await vi.waitFor(() => expect(last()).toBe('section-3'))
    box.scrollTop = 0
    await vi.waitFor(() => expect(last()).toBe('section-1'))
    stop()
  })

  it('follows a jump across several sections in one step', async () => {
    const { owner, box, ids } = page([300, 300, 300, 300, 300, 300])
    const { last, stop } = watched(owner, ids)
    box.scrollTop = 1250
    await vi.waitFor(() => expect(last()).toBe('section-5'))
    stop()
  })

  it('marks the last section at the end of the page, though it never reaches the line', async () => {
    const { owner, box, ids } = page([600, 600, 60, 60])
    const { last, stop } = watched(owner, ids)
    box.scrollTop = box.scrollHeight - box.clientHeight - 60
    await vi.waitFor(() => expect(last()).toBe('section-2'))
    box.scrollTop = box.scrollHeight
    await vi.waitFor(() => expect(last()).toBe('section-4'))
    stop()
  })

  it('decides again when content above a section moves it across the line', async () => {
    const { owner, box, sections, ids } = page([300, 300, 300])
    box.scrollTop = 250
    const { last, stop } = watched(owner, ids)
    await vi.waitFor(() => expect(last()).toBe('section-2'))
    // The first section grows: the second moves below the line without a scroll.
    ;(sections[0] as HTMLElement).style.height = '600px'
    await vi.waitFor(() => expect(last()).toBe('section-1'))
    stop()
  })

  it('never marks a section that is not in the document, and follows one that mounts later', async () => {
    const { owner, box, sections, ids } = page([300, 300, 300])
    const late = sections[1] as HTMLElement
    late.remove()
    const { last, stop } = watched(owner, ids)
    box.scrollTop = 350
    await vi.waitFor(() => expect(last()).toBe('section-3'))
    box.scrollTop = 0
    await vi.waitFor(() => expect(last()).toBe('section-1'))
    ;(sections[0] as HTMLElement).after(late)
    box.scrollTop = 350
    await vi.waitFor(() => expect(last()).toBe('section-2'))
    stop()
  })

  it('marks a section that mounts after the list, without a scroll', async () => {
    const { owner, box, sections, ids } = page([300, 300, 300])
    box.replaceChildren()
    const { reports, last, stop } = watched(owner, ids)
    expect(reports).toEqual([null])
    // The page's sections are drawn after the list, as a renderer that draws in document order does.
    box.append(...sections)
    await vi.waitFor(() => expect(last()).toBe('section-1'))
    stop()
  })

  it('marks a section whose element takes its id after the list is drawn', async () => {
    const { owner, sections, ids } = page([300, 300, 300])
    const first = sections[0] as HTMLElement
    first.removeAttribute('id')
    const { reports, last, stop } = watched(owner, ids)
    expect(reports).toEqual([null])
    first.id = 'section-1'
    await vi.waitFor(() => expect(last()).toBe('section-1'))
    stop()
  })

  it('waits for a missing section only while one is missing, and not once it is stopped', async () => {
    const observe = vi.spyOn(MutationObserver.prototype, 'observe')
    const disconnect = vi.spyOn(MutationObserver.prototype, 'disconnect')
    const { owner, box, sections, ids } = page([300, 300, 300])
    const whole = watched(owner, ids)
    expect(observe).not.toHaveBeenCalled()
    whole.stop()

    const late = sections[2] as HTMLElement
    late.remove()
    const { reports, last, stop } = watched(owner, ids)
    expect(observe).toHaveBeenCalledTimes(1)
    box.append(late)
    box.scrollTop = box.scrollHeight
    await vi.waitFor(() => expect(last()).toBe('section-3'))
    expect(disconnect).toHaveBeenCalledTimes(1)

    late.remove()
    box.scrollTop = 0
    await vi.waitFor(() => expect(last()).toBe('section-1'))
    expect(observe).toHaveBeenCalledTimes(2)
    stop()
    expect(disconnect).toHaveBeenCalledTimes(2)
    const count = reports.length
    box.append(late)
    await new Promise((settle) => requestAnimationFrame(() => settle(null)))
    expect(reports).toHaveLength(count)
    observe.mockRestore()
    disconnect.mockRestore()
  })

  it('follows the document when no ancestor of the sections scrolls', async () => {
    const { owner, ids } = page([innerHeight, innerHeight, innerHeight], { scrolls: false })
    const { last, stop } = watched(owner, ids)
    expect(last()).toBe('section-1')
    scrollTo(0, innerHeight + 10)
    await vi.waitFor(() => expect(last()).toBe('section-2'))
    scrollTo(0, 0)
    await vi.waitFor(() => expect(last()).toBe('section-1'))
    stop()
  })

  it('reports nothing once it is stopped, and leaves no observer behind', async () => {
    const created: IntersectionObserver[] = []
    const Native = window.IntersectionObserver
    const disconnect = vi.spyOn(Native.prototype, 'disconnect')
    vi.stubGlobal(
      'IntersectionObserver',
      class extends Native {
        constructor(...args: ConstructorParameters<typeof Native>) {
          super(...args)
          created.push(this)
        }
      },
    )
    const { owner, box, ids } = page([300, 300, 300])
    const { reports, stop } = watched(owner, ids)
    expect(created).toHaveLength(1)
    stop()
    expect(disconnect).toHaveBeenCalledTimes(1)
    box.scrollTop = 350
    box.dispatchEvent(new Event('scroll'))
    expect(reports).toEqual(['section-1'])
    vi.unstubAllGlobals()
    disconnect.mockRestore()
  })

  it('does nothing without an owner', () => {
    const report = vi.fn()
    expect(() => watchSections(null, ['section-1'], report)()).not.toThrow()
    expect(report).not.toHaveBeenCalled()
  })
})

describe('jumpToSection', () => {
  it('marks the section at once and holds the mark while the page scrolls', async () => {
    const { owner, box, ids } = page([300, 300, 60, 300, 300])
    const { last, stop } = watched(owner, ids)
    jumpToSection(owner, 'section-3', click())
    expect(last()).toBe('section-3')
    // At the third section's top the fourth is above the line too, and the mark stays.
    box.scrollTop = 600
    box.dispatchEvent(new Event('scroll'))
    expect(last()).toBe('section-3')
    // The reader scrolls: the mark follows the page again.
    box.dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaY: 10 }))
    box.scrollTop = 610
    await vi.waitFor(() => expect(last()).toBe('section-4'))
    stop()
  })

  it('moves focus to a section that cannot take it, and takes the tabindex away when focus leaves', () => {
    const { owner, sections, ids } = page([300, 300])
    const section = sections[1] as HTMLElement
    const { stop } = watched(owner, ids)
    jumpToSection(owner, 'section-2', click())
    expect(document.activeElement).toBe(section)
    expect(section.getAttribute('tabindex')).toBe('-1')
    section.blur()
    expect(section.hasAttribute('tabindex')).toBe(false)
    stop()
  })

  it('leaves a tabindex the page wrote', () => {
    const { owner, sections, ids } = page([300, 300])
    const section = sections[1] as HTMLElement
    section.tabIndex = -1
    const { stop } = watched(owner, ids)
    jumpToSection(owner, 'section-2', click())
    expect(document.activeElement).toBe(section)
    section.blur()
    expect(section.getAttribute('tabindex')).toBe('-1')
    stop()
  })

  it('leaves a click with a modifier, another button or a taken click to the browser', () => {
    const { owner, ids } = page([300, 300])
    const { reports, stop } = watched(owner, ids)
    const taken = click()
    taken.preventDefault()
    for (const event of [
      click({ metaKey: true }),
      click({ ctrlKey: true }),
      click({ shiftKey: true }),
      click({ altKey: true }),
      click({ button: 1 }),
      taken,
    ]) {
      jumpToSection(owner, 'section-2', event)
    }
    expect(reports).toEqual(['section-1'])
    expect(document.activeElement).toBe(document.body)
    stop()
  })

  it('does nothing for a section that is not in the document', () => {
    const { owner, ids } = page([300, 300])
    const { reports, stop } = watched(owner, [...ids, 'missing'])
    jumpToSection(owner, 'missing', click())
    expect(reports).toEqual(['section-1'])
    expect(document.activeElement).toBe(document.body)
    stop()
  })
})

describe('the address fragment', () => {
  it('holds the section a new fragment names, and lets go for one that names none', async () => {
    const { owner, box, ids } = page([300, 300, 300, 300, 300])
    const { last, stop } = watched(owner, ids)
    location.hash = 'section-3'
    await vi.waitFor(() => expect(last()).toBe('section-3'))
    // A scroll the reader did not make keeps the mark.
    box.scrollTop = 0
    box.dispatchEvent(new Event('scroll'))
    expect(last()).toBe('section-3')
    location.hash = 'elsewhere'
    await vi.waitFor(() => expect(last()).toBe('section-1'))
    stop()
  })
})
