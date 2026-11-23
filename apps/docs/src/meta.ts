import { useEffect } from 'react'

import { pageTitle, structuredData, structuredDataText, type Crumb } from './page-head'
import { SITE } from './site'

/**
 * A page's entry in the document head: its title, its description, what a
 * link preview shows and its structured data (`page-head.ts`).
 *
 * Each page calls `useMeta` once. The head is written from an effect, because
 * the site has one HTML document and the page changes inside it. The
 * site step (`scripts/site.mjs`) saves the document after this has run, so
 * a crawler and a link preview read the same head a visitor's tab shows.
 */
export interface PageMeta {
  /** The page's own name. The site's name is added after it. Omit it on the landing page. */
  title?: string
  /** One or two sentences for a search result. The site's description when omitted. */
  description?: string
  /** A page a search engine should not list, such as the one for an unknown address. */
  noindex?: boolean
  /**
   * The pages above this one, outermost first, without the landing page: the
   * guides' index for a guide. The title names them after the page's own name,
   * and the structured data lists them as the page's breadcrumbs.
   */
  trail?: readonly Crumb[]
  /** A page that is a piece of writing, which a guide is. */
  article?: boolean
  /** The path of the file that holds the page's text as markdown, when the site serves one. */
  markdown?: string
}

/** Sets `<meta>`'s content, creating the element when the document has none. */
function setMeta(key: 'name' | 'property', id: string, content: string | null): void {
  let element = document.head.querySelector<HTMLMetaElement>(`meta[${key}="${id}"]`)
  if (content === null) {
    element?.remove()
    return
  }
  if (!element) {
    element = document.createElement('meta')
    element.setAttribute(key, id)
    document.head.append(element)
  }
  element.content = content
}

function setCanonical(href: string | null): void {
  let element = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')
  if (href === null) {
    element?.remove()
    return
  }
  if (!element) {
    element = document.createElement('link')
    element.rel = 'canonical'
    document.head.append(element)
  }
  element.href = href
}

/** Sets the link to the page's markdown file, which a reader that wants no page follows. */
function setMarkdown(href: string | null): void {
  let element = document.head.querySelector<HTMLLinkElement>(
    'link[rel="alternate"][type="text/markdown"]',
  )
  if (href === null) {
    element?.remove()
    return
  }
  if (!element) {
    element = document.createElement('link')
    element.rel = 'alternate'
    element.type = 'text/markdown'
    document.head.append(element)
  }
  element.href = href
}

const STRUCTURED = 'script[type="application/ld+json"]'

/**
 * Writes one `application/ld+json` block for each object, and removes the
 * blocks of the page before. A saved page arrives with its blocks already in
 * the head, and they are replaced with the same text.
 */
function setStructuredData(data: readonly Record<string, unknown>[]): void {
  for (const element of document.head.querySelectorAll(STRUCTURED)) element.remove()
  for (const each of data) {
    const element = document.createElement('script')
    element.type = 'application/ld+json'
    element.textContent = structuredDataText(each)
    document.head.append(element)
  }
}

export function useMeta({
  title,
  description = SITE.description,
  noindex = false,
  trail,
  article = false,
  markdown,
}: PageMeta): void {
  // The trail is a new array on every render, so the effect is keyed on its text.
  const trailText = JSON.stringify(trail ?? [])
  useEffect(() => {
    const crumbs = JSON.parse(trailText) as Crumb[]
    const full = pageTitle({ ...(title === undefined ? {} : { title }), trail: crumbs }, SITE)
    document.title = full
    setMeta('name', 'description', description)
    setMeta('name', 'robots', noindex ? 'noindex' : null)
    setMeta('property', 'og:type', 'website')
    setMeta('property', 'og:site_name', SITE.name)
    setMeta('property', 'og:title', full)
    setMeta('property', 'og:description', description)
    setMeta('name', 'twitter:card', 'summary_large_image')

    // An address-dependent tag is written only when the build knows the
    // address. A relative canonical or image URL is worse than none.
    const path = window.location.pathname.replace(/(.)\/$/, '$1')
    setCanonical(SITE.url === null || noindex ? null : `${SITE.url}${path === '/' ? '' : path}`)
    setMeta(
      'property',
      'og:url',
      SITE.url === null ? null : `${SITE.url}${path === '/' ? '' : path}`,
    )
    setMeta('property', 'og:image', SITE.url === null ? null : `${SITE.url}/og.png`)
    setStructuredData(
      SITE.url === null || noindex
        ? []
        : structuredData(
            {
              ...(title === undefined ? {} : { title }),
              description,
              path,
              trail: crumbs,
              article,
            },
            SITE,
            SITE.url,
          ),
    )

    // A relative address resolves against the page's own, so the link is
    // written whether or not the build knows the site's.
    setMarkdown(markdown === undefined || noindex ? null : `${SITE.url ?? ''}${markdown}`)
  }, [title, description, noindex, trailText, article, markdown])
}
