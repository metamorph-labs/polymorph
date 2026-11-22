import { describe, expect, it } from 'vitest'

import { GUIDES, loadGuideText, parseGuide } from './guides'
import { REGISTRY } from './registry'
import {
  loadMembers,
  loadSections,
  SEARCH_GROUPS,
  searchIndex,
  sectionEntries,
  SITE_PAGES,
} from './search'

/**
 * The site search's index: what it lists, where each entry goes, and the
 * order the palette shows the groups in.
 */

describe('the search index', () => {
  it('lists the site’s top-level pages', () => {
    expect(SITE_PAGES.map((page) => page.path)).toEqual([
      '/',
      '/install',
      '/guides',
      '/components',
      '/systems',
      '/tokens',
      '/motion',
      '/principles',
    ])
  })

  it('lists every member, at its page, found by its purpose and tier', async () => {
    const members = await loadMembers()
    expect(members).toHaveLength(REGISTRY.components.length)
    const button = searchIndex({ members }).find((entry) => entry.id === 'member:Button')
    expect(button).toMatchObject({ label: 'Button', href: '/components/button' })
    const component = REGISTRY.components.find((each) => each.name === 'Button')!
    expect(button!.keywords).toEqual([component.purpose, component.tier])
  })

  it('lists every guide and each of its ## sections, with the section’s anchor', async () => {
    const sections = await loadSections()
    let expected = 0
    for (const guide of GUIDES) {
      const headings = parseGuide(await loadGuideText(guide.slug)).headings
      expected += headings.filter((heading) => heading.level === 2).length
    }
    expect(sections).toHaveLength(expected)

    const engine = sections.find((entry) => entry.href === '/guides/theming#the-colour-engine')
    expect(engine).toMatchObject({ label: 'The colour engine', group: 'Theming' })
    const guides = searchIndex({}).filter((entry) => entry.group === SEARCH_GROUPS.guides)
    expect(guides.map((entry) => entry.href)).toEqual(
      GUIDES.map((guide) => `/guides/${guide.slug}`),
    )
  })

  it('leaves ### and deeper headings out', () => {
    const guide = GUIDES[0]!
    const entries = sectionEntries(guide, [
      { id: 'a', text: 'A', level: 2 },
      { id: 'b', text: 'B', level: 3 },
      { id: 'c', text: 'C', level: 4 },
    ])
    expect(entries.map((entry) => entry.label)).toEqual(['A'])
  })

  it('orders pages, guides, members, then sections, with ids unique across all of them', async () => {
    const index = searchIndex({ members: await loadMembers(), sections: await loadSections() })
    const groups = [...new Set(index.map((entry) => entry.group))]
    expect(groups.slice(0, 3)).toEqual([
      SEARCH_GROUPS.pages,
      SEARCH_GROUPS.guides,
      SEARCH_GROUPS.members,
    ])
    expect(groups.slice(3)).toEqual(GUIDES.map((guide) => guide.title))
    const ids = index.map((entry) => entry.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
