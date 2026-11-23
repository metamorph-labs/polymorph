/**
 * What a page's head says, computed from the page's facts with no document:
 * its title, and its structured data.
 *
 * `meta.ts` writes both into the head. They are here, apart from the hook, so
 * a test states them without a browser.
 */

/** A page above another one: the name a reader sees for it and its path on the site. */
export interface Crumb {
  name: string
  path: string
}

export interface HeadPage {
  /** The page's own name. The landing page has none. */
  title?: string
  description: string
  /** The page's path, with no trailing slash. `/` is the landing page. */
  path: string
  /** The pages above this one, outermost first. The landing page is not listed. */
  trail: readonly Crumb[]
  /** Whether the page is a piece of writing, which a guide is. */
  article: boolean
}

export interface HeadSite {
  name: string
  tagline: string
  description: string
  repository: string
  /** The licence's SPDX identifier. */
  license: string
}

/**
 * The document's title: the page's name, then each page above it from the
 * nearest outwards, then the site's name. The pages above are named because
 * two pages may share a name: the Motion page and the Motion guide.
 */
export function pageTitle(page: Pick<HeadPage, 'title' | 'trail'>, site: HeadSite): string {
  if (page.title === undefined) return `${site.name}: ${site.tagline}`
  const above = page.trail.map((crumb) => crumb.name).reverse()
  return [page.title, ...above, site.name].join(' · ')
}

const CONTEXT = 'https://schema.org'

/**
 * The page's schema.org facts, one object for each `application/ld+json` block.
 *
 * Every address in them is absolute, so they are built only for a site whose
 * address is known (`url`, with no trailing slash).
 *
 * - The landing page says what the site is (`WebSite`, which a search engine
 *   takes the site's name from) and what the project is (`SoftwareSourceCode`,
 *   with its repository and licence).
 * - Every other page says where it sits (`BreadcrumbList`), from the landing
 *   page down to itself.
 * - A guide also says it is an article (`TechArticle`).
 */
export function structuredData(
  page: HeadPage,
  site: HeadSite,
  url: string,
): Record<string, unknown>[] {
  const address = (path: string) => `${url}${path === '/' ? '' : path}`
  const website = { '@type': 'WebSite', name: site.name, url }

  if (page.title === undefined) {
    return [
      { '@context': CONTEXT, ...website, description: site.description },
      {
        '@context': CONTEXT,
        '@type': 'SoftwareSourceCode',
        name: site.name,
        description: site.description,
        url,
        codeRepository: site.repository,
        license: `https://spdx.org/licenses/${site.license}`,
        programmingLanguage: ['TypeScript', 'Swift', 'Kotlin'],
      },
    ]
  }

  const crumbs: Crumb[] = [
    { name: site.name, path: '/' },
    ...page.trail,
    { name: page.title, path: page.path },
  ]
  const data: Record<string, unknown>[] = [
    {
      '@context': CONTEXT,
      '@type': 'BreadcrumbList',
      itemListElement: crumbs.map((crumb, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: crumb.name,
        item: address(crumb.path),
      })),
    },
  ]
  if (page.article) {
    data.push({
      '@context': CONTEXT,
      '@type': 'TechArticle',
      headline: page.title,
      description: page.description,
      url: address(page.path),
      mainEntityOfPage: address(page.path),
      inLanguage: 'en',
      isPartOf: website,
    })
  }
  return data
}

/**
 * The text of an `application/ld+json` block. `<` is written as its escape, so
 * no value can close the script element that holds the block.
 */
export function structuredDataText(data: Record<string, unknown>): string {
  return JSON.stringify(data).replace(/</g, '\\u003c')
}
