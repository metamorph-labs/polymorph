import { useEffect } from 'react'

import { SITE } from './site'

/**
 * A page's entry in the document head: its title, its description and what a
 * link preview shows.
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

export function useMeta({
  title,
  description = SITE.description,
  noindex = false,
}: PageMeta): void {
  useEffect(() => {
    const full = title === undefined ? `${SITE.name}: ${SITE.tagline}` : `${title} · ${SITE.name}`
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
  }, [title, description, noindex])
}
