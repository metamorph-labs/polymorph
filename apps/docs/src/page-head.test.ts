import { describe, expect, it } from 'vitest'

import { pageTitle, structuredData, structuredDataText, type HeadSite } from './page-head'

/**
 * A page's title and structured data, stated without a document. `meta.ts`
 * writes what these functions return into the head.
 */

const SITE: HeadSite = {
  name: 'Polymorph',
  tagline: 'one design system, any look you want',
  description: 'One set of components.',
  repository: 'https://github.com/metamorph-labs/polymorph',
  license: 'MIT',
}
const URL = 'https://site.test'
const GUIDES = [{ name: 'Guides', path: '/guides' }]

describe('pageTitle', () => {
  it('is the site’s name and tagline on the landing page', () => {
    expect(pageTitle({ trail: [] }, SITE)).toBe('Polymorph: one design system, any look you want')
  })

  it('names the page, then the site', () => {
    expect(pageTitle({ title: 'Motion', trail: [] }, SITE)).toBe('Motion · Polymorph')
  })

  it('names the pages above between them, so a guide and a page of one name differ', () => {
    expect(pageTitle({ title: 'Motion', trail: GUIDES }, SITE)).toBe('Motion · Guides · Polymorph')
    const trail = [...GUIDES, { name: 'Design', path: '/guides/design' }]
    expect(pageTitle({ title: 'Motion', trail }, SITE)).toBe('Motion · Design · Guides · Polymorph')
  })
})

describe('structuredData', () => {
  it('says what the site and the project are on the landing page', () => {
    const data = structuredData(
      { description: SITE.description, path: '/', trail: [], article: false },
      SITE,
      URL,
    )
    expect(data.map((each) => each['@type'])).toEqual(['WebSite', 'SoftwareSourceCode'])
    expect(data[0]).toMatchObject({ name: 'Polymorph', url: URL })
    expect(data[1]).toMatchObject({
      codeRepository: SITE.repository,
      license: 'https://spdx.org/licenses/MIT',
    })
  })

  it('lists a page’s breadcrumbs from the landing page down to itself', () => {
    const [crumbs, ...rest] = structuredData(
      {
        title: 'Button',
        description: 'x',
        path: '/components/button',
        trail: [{ name: 'Components', path: '/components' }],
        article: false,
      },
      SITE,
      URL,
    )
    expect(rest).toEqual([])
    expect(crumbs).toMatchObject({
      '@type': 'BreadcrumbList',
      itemListElement: [
        { position: 1, name: 'Polymorph', item: URL },
        { position: 2, name: 'Components', item: `${URL}/components` },
        { position: 3, name: 'Button', item: `${URL}/components/button` },
      ],
    })
  })

  it('says a guide is an article, at the guide’s own address', () => {
    const data = structuredData(
      {
        title: 'Motion',
        description: 'How it moves.',
        path: '/guides/motion',
        trail: GUIDES,
        article: true,
      },
      SITE,
      URL,
    )
    expect(data.map((each) => each['@type'])).toEqual(['BreadcrumbList', 'TechArticle'])
    expect(data[1]).toMatchObject({
      headline: 'Motion',
      description: 'How it moves.',
      url: `${URL}/guides/motion`,
    })
  })

  it('writes every address in full', () => {
    const guide = { title: 'Motion', description: 'x', path: '/guides/motion', trail: GUIDES }
    const landing = { description: 'x', path: '/', trail: [], article: false }
    const text = JSON.stringify([
      ...structuredData({ ...guide, article: true }, SITE, URL),
      ...structuredData(landing, SITE, URL),
    ])
    const addresses = [
      ...text.matchAll(/"(?:url|item|mainEntityOfPage|codeRepository|license)":"([^"]*)"/g),
    ].map((match) => match[1])
    // Three breadcrumbs, the article's two and its site's, then the landing page's four.
    expect(addresses).toHaveLength(10)
    for (const address of addresses) expect(address).toMatch(/^https:\/\//)
  })
})

describe('structuredDataText', () => {
  it('cannot close the script element that holds it', () => {
    const text = structuredDataText({ name: '</script><b>' })
    expect(text).not.toContain('<')
    expect(JSON.parse(text)).toEqual({ name: '</script><b>' })
  })
})
