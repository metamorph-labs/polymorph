import {
  GUIDES,
  guidePath,
  loadGuideText,
  parseGuide,
  type Guide,
  type GuideHeading,
} from './guides'

/**
 * The site search's index: every page of the site, guide, guide section and
 * member, as entries the `Command` palette lists.
 *
 * The boot bundle holds only what this module imports: the guide catalogue and
 * the pages below. The members come from the registry, and the sections from
 * the guides' texts. Both load the first time the palette opens
 * (`loadMembers`, `loadSections`), so a reader who never searches downloads
 * neither.
 */

export interface SitePage {
  path: string
  label: string
  /** Words that find the page without being shown. */
  keywords?: readonly string[]
}

/** The site's top-level pages, in the order the palette lists them. */
export const SITE_PAGES: readonly SitePage[] = [
  { path: '/', label: 'Home', keywords: ['overview', 'start'] },
  { path: '/install', label: 'Get started', keywords: ['install', 'setup', 'quickstart'] },
  { path: '/guides', label: 'Guides', keywords: ['docs', 'documentation'] },
  { path: '/components', label: 'Components', keywords: ['members', 'vocabulary'] },
  { path: '/systems', label: 'Systems', keywords: ['themes', 'pairings'] },
  { path: '/tokens', label: 'Tokens', keywords: ['colours', 'colors', 'type', 'spacing'] },
  { path: '/motion', label: 'Motion', keywords: ['animation', 'temperament'] },
  { path: '/principles', label: 'Principles', keywords: ['laws', 'exceptions', 'ladder'] },
]

/** The palette's group names, in the order the groups are listed. */
export const SEARCH_GROUPS = {
  pages: 'Pages',
  guides: 'Guides',
  members: 'Components',
} as const

export interface SearchEntry {
  /** Unique across the index. */
  id: string
  label: string
  /** A site path, with a fragment for a guide's section. */
  href: string
  group: string
  keywords: string[]
}

/** What the index needs of a registry member. */
export interface SearchMember {
  name: string
  slug: string
  purpose: string
  tier: string
}

export function pageEntries(pages: readonly SitePage[]): SearchEntry[] {
  return pages.map((page) => ({
    id: `page:${page.path}`,
    label: page.label,
    href: page.path,
    group: SEARCH_GROUPS.pages,
    keywords: [...(page.keywords ?? [])],
  }))
}

export function guideEntries(guides: readonly Guide[] = GUIDES): SearchEntry[] {
  return guides.map((guide) => ({
    id: `guide:${guide.slug}`,
    label: guide.title,
    href: guidePath(guide.slug),
    group: SEARCH_GROUPS.guides,
    keywords: [guide.slug, guide.description],
  }))
}

export function memberEntries(members: readonly SearchMember[]): SearchEntry[] {
  return members.map((member) => ({
    id: `member:${member.name}`,
    label: member.name,
    href: `/components/${member.slug}`,
    group: SEARCH_GROUPS.members,
    keywords: [member.purpose, member.tier],
  }))
}

/**
 * A guide's `##` sections. They are grouped under the guide's title, so a
 * section's label needs no prefix to say which guide it is in. Deeper headings
 * are left out: they are reached from their section's table of contents.
 */
export function sectionEntries(guide: Guide, headings: readonly GuideHeading[]): SearchEntry[] {
  return headings
    .filter((heading) => heading.level === 2)
    .map((heading) => ({
      id: `section:${guide.slug}#${heading.id}`,
      label: heading.text,
      href: `${guidePath(guide.slug)}#${heading.id}`,
      group: guide.title,
      keywords: [],
    }))
}

/**
 * The whole index, in the palette's order: pages, guides, members, then each
 * guide's sections. `Command` filters by label and keywords and keeps this
 * order, so a page or a guide is listed before a member or a section that
 * also matches.
 */
export function searchIndex({
  pages = SITE_PAGES,
  members = [],
  sections = [],
}: {
  pages?: readonly SitePage[]
  members?: readonly SearchMember[]
  sections?: readonly SearchEntry[]
}): SearchEntry[] {
  return [...pageEntries(pages), ...guideEntries(), ...memberEntries(members), ...sections]
}

/** Every member in the registry. The registry is a chunk of its own, loaded here on first use. */
export async function loadMembers(): Promise<SearchMember[]> {
  const { REGISTRY, componentSlug } = await import('./registry')
  return REGISTRY.components.map((component) => ({
    name: component.name,
    slug: componentSlug(component.name),
    purpose: component.purpose,
    tier: component.tier,
  }))
}

/** Every guide's sections, read from the guides' texts in reading order. */
export async function loadSections(): Promise<SearchEntry[]> {
  const sections = await Promise.all(
    GUIDES.map(async (guide) =>
      sectionEntries(guide, parseGuide(await loadGuideText(guide.slug)).headings),
    ),
  )
  return sections.flat()
}
