import { readdirSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  createSlugger,
  GUIDE_GROUPS,
  guideFiles,
  GUIDES,
  guidesInGroup,
  loadGuideText,
  neighbours,
  parseGuide,
  rewriteHref,
  rewriteLinks,
  stripComments,
  type GuideSection,
  type LinkContext,
  type ParsedGuide,
} from './guides'
import { componentSlug, REGISTRY } from './registry'

/**
 * The guides pages: the catalogue against `docs/`, the text pipeline, and the
 * link rewrite. The last block reads every guide, so a heading renamed in
 * `docs/` that another guide still links to fails here.
 */

const ROOT = resolve(import.meta.dirname, '../../..')
const REPOSITORY = 'https://github.com/example/polymorph'

const MEMBERS = new Map(
  REGISTRY.components.map((component) => [component.spec, componentSlug(component.name)]),
)

const links = (guide: string): LinkContext => ({
  guide,
  guides: new Set(GUIDES.map((each) => each.slug)),
  memberForSpec: (path) => MEMBERS.get(path),
  repository: REPOSITORY,
})

describe('the catalogue', () => {
  it('lists every file in docs/ once, and only those', () => {
    const onDisk = readdirSync(resolve(ROOT, 'docs'))
      .filter((name) => name.endsWith('.md'))
      .map((name) => name.slice(0, -'.md'.length))
      .sort()
    const listed = GUIDES.map((guide) => guide.slug)
    expect(new Set(listed).size).toBe(listed.length)
    expect([...listed].sort()).toEqual(onDisk)
    expect(guideFiles()).toEqual(onDisk)
  })

  it('names each guide by its own # heading', async () => {
    for (const guide of GUIDES) {
      const parsed = parseGuide(await loadGuideText(guide.slug))
      expect(parsed.title, guide.slug).toBe(guide.title)
    }
  })

  it('puts each guide in a group, and leaves no group empty', () => {
    const ids = new Set(GUIDE_GROUPS.map((group) => group.id))
    for (const guide of GUIDES) expect(ids.has(guide.group), guide.slug).toBe(true)
    for (const group of GUIDE_GROUPS) expect(guidesInGroup(group.id).length).toBeGreaterThan(0)
  })

  it('lists the guides group by group, so previous and next stay in reading order', () => {
    const order = GUIDES.map((guide) => GUIDE_GROUPS.findIndex((group) => group.id === guide.group))
    expect(order).toEqual([...order].sort((a, b) => a - b))
  })

  it('links each guide to the ones before and after it', () => {
    const first = GUIDES[0]!.slug
    const last = GUIDES[GUIDES.length - 1]!.slug
    expect(neighbours(first).previous).toBeUndefined()
    expect(neighbours(first).next).toBe(GUIDES[1])
    expect(neighbours(last).next).toBeUndefined()
    expect(neighbours('missing')).toEqual({})
  })

  it('refuses a slug that is not a guide', async () => {
    await expect(loadGuideText('missing')).rejects.toThrow('No guide named missing')
  })
})

describe('parseGuide', () => {
  const source = [
    '# The title',
    '',
    'An opening paragraph.',
    '',
    '## First',
    '',
    'Prose with `code`.',
    '',
    '```sh',
    '# a comment in a fence, not a heading',
    '```',
    '',
    '### Nested `code` heading',
    '',
    'Deeper.',
    '',
    '#### Deepest',
    '',
    '## Second',
    '',
    '## First',
  ].join('\n')

  const guide = parseGuide(source)

  it('takes the first # heading as the title and leaves it out of the body', () => {
    expect(guide.title).toBe('The title')
    expect(guide.intro).toBe('An opening paragraph.')
  })

  it('nests sections by level, and reads no heading inside a fence', () => {
    expect(guide.sections.map((section) => section.heading.text)).toEqual([
      'First',
      'Second',
      'First',
    ])
    const [first] = guide.sections
    expect(first!.body).toContain('# a comment in a fence, not a heading')
    expect(first!.children.map((child) => child.heading.text)).toEqual(['Nested code heading'])
    expect(first!.children[0]!.children[0]!.heading).toEqual({
      id: 'deepest',
      text: 'Deepest',
      level: 4,
    })
  })

  it('gives headings GitHub’s anchors, numbering a repeat', () => {
    expect(guide.headings.map((heading) => heading.id)).toEqual([
      'first',
      'nested-code-heading',
      'deepest',
      'second',
      'first-1',
    ])
  })

  it('drops an HTML comment, which Markdown would draw as text', () => {
    const parsed = parseGuide('# T\n\nBefore.\n\n<!-- a note\n   over two lines -->\n\nAfter.')
    expect(parsed.intro).toMatch(/^Before\.\n+After\.$/)
    expect(stripComments('```html\n<!-- kept in a fence -->\n```')).toContain('kept in a fence')
  })
})

describe('createSlugger', () => {
  it('keeps letters, digits, hyphens and underscores, and makes spaces hyphens', () => {
    const slug = createSlugger()
    expect(slug('Scale amendments (overrides)')).toBe('scale-amendments-overrides')
    expect(slug('A Vue app: polymorph init --framework vue')).toBe(
      'a-vue-app-polymorph-init---framework-vue',
    )
    expect(slug('1. Registry access')).toBe('1-registry-access')
    expect(slug('snake_case')).toBe('snake_case')
  })
})

describe('rewriteHref', () => {
  const inTheming = links('theming')

  it('sends a link to another guide to its page, with its fragment', () => {
    expect(rewriteHref('rules.md', inTheming)).toBe('/guides/rules')
    expect(rewriteHref('rules.md#the-inventory', inTheming)).toBe('/guides/rules#the-inventory')
    expect(rewriteHref('../docs/rules.md#the-inventory', inTheming)).toBe(
      '/guides/rules#the-inventory',
    )
    expect(rewriteHref('./rules.md', inTheming)).toBe('/guides/rules')
  })

  it('reads a path from the repository root when it names no page from docs/', () => {
    expect(rewriteHref('docs/rules.md#x', inTheming)).toBe('/guides/rules#x')
    expect(rewriteHref('design/components/button.md', inTheming)).toBe('/components/button')
  })

  it('keeps a link to a section of the same guide a fragment', () => {
    expect(rewriteHref('theming.md#ramps', inTheming)).toBe('#ramps')
    expect(rewriteHref('theming.md', inTheming)).toBe('/guides/theming')
    expect(rewriteHref('#ramps', inTheming)).toBe('#ramps')
  })

  it('gives a link to a guide the address the context names', () => {
    const markdown = { ...inTheming, guideHref: (slug: string) => `/guides/${slug}.md` }
    expect(rewriteHref('rules.md#the-inventory', markdown)).toBe('/guides/rules.md#the-inventory')
    expect(rewriteHref('theming.md', markdown)).toBe('/guides/theming.md')
    expect(rewriteHref('theming.md#ramps', markdown)).toBe('#ramps')
  })

  it('sends a link to a member’s spec to the member’s page', () => {
    expect(rewriteHref('../design/components/button.md', inTheming)).toBe('/components/button')
    // The spec's file name and the member's name differ here.
    expect(rewriteHref('../design/components/radio.md#a11y', inTheming)).toBe(
      '/components/radiogroup',
    )
    expect(rewriteHref('../design/archetypes/detail-page.md', inTheming)).toBe(
      '/components/detailpage',
    )
  })

  it('sends any other repository path to the file on GitHub', () => {
    expect(rewriteHref('../CONTRIBUTING.md#releasing', inTheming)).toBe(
      `${REPOSITORY}/blob/main/CONTRIBUTING.md#releasing`,
    )
    expect(rewriteHref('../design/components/README.md', inTheming)).toBe(
      `${REPOSITORY}/blob/main/design/components/README.md`,
    )
    expect(rewriteHref('../packages/engine/src/charts/', inTheming)).toBe(
      `${REPOSITORY}/tree/main/packages/engine/src/charts`,
    )
  })

  it('leaves an absolute URL, and a path above the repository, as written', () => {
    expect(rewriteHref('https://modelcontextprotocol.io', inTheming)).toBe(
      'https://modelcontextprotocol.io',
    )
    expect(rewriteHref('mailto:someone@example.com', inTheming)).toBe('mailto:someone@example.com')
    expect(rewriteHref('../../outside.md', inTheming)).toBe('../../outside.md')
  })
})

describe('rewriteLinks', () => {
  const inTheming = links('theming')

  it('rewrites every link target and keeps a title', () => {
    expect(rewriteLinks('See [rules](rules.md) and [ramps](#ramps "Ramps").', inTheming)).toBe(
      'See [rules](/guides/rules) and [ramps](#ramps "Ramps").',
    )
  })

  it('leaves code spans and fences as they are', () => {
    const source = [
      'Write `[label](rules.md)` for a link, or [this](rules.md).',
      '',
      '```md',
      '[label](rules.md)',
      '```',
    ].join('\n')
    expect(rewriteLinks(source, inTheming)).toBe(
      [
        'Write `[label](rules.md)` for a link, or [this](/guides/rules).',
        '',
        '```md',
        '[label](rules.md)',
        '```',
      ].join('\n'),
    )
  })

  it('reads a code span that wraps a line as one span', () => {
    expect(rewriteLinks('A `long\n[x](rules.md)` span and [y](rules.md).', inTheming)).toBe(
      'A `long\n[x](rules.md)` span and [y](/guides/rules).',
    )
  })
})

/** The intro and every section's body of a parsed guide, in document order. */
function bodiesOf(guide: ParsedGuide): string[] {
  const bodies = [guide.intro]
  const walk = (sections: readonly GuideSection[]) => {
    for (const section of sections) {
      bodies.push(section.body)
      walk(section.children)
    }
  }
  walk(guide.sections)
  return bodies
}

describe('every guide', () => {
  it('has headings with unique ids', async () => {
    for (const guide of GUIDES) {
      const ids = parseGuide(await loadGuideText(guide.slug)).headings.map((heading) => heading.id)
      expect(new Set(ids).size, guide.slug).toBe(ids.length)
    }
  })

  it('links to fragments that name a heading on the page they go to', async () => {
    const ids = new Map<string, Set<string>>()
    const pages = new Map<string, string>()
    for (const guide of GUIDES) {
      const parsed = parseGuide(await loadGuideText(guide.slug))
      ids.set(guide.slug, new Set(parsed.headings.map((heading) => heading.id)))
      pages.set(guide.slug, rewriteLinks(bodiesOf(parsed).join('\n\n'), links(guide.slug)))
    }

    const broken: string[] = []
    for (const [slug, text] of pages) {
      for (const match of text.matchAll(/\]\((\/guides\/([^)#\s]+))?#([^)\s]+)\)/g)) {
        const target = match[2] ?? slug
        if (!ids.get(target)?.has(match[3]!)) broken.push(`${slug} → ${target}#${match[3]}`)
      }
    }
    expect(broken).toEqual([])
  })

  it('leaves no relative link to a file in the repository', async () => {
    for (const guide of GUIDES) {
      const parsed = parseGuide(await loadGuideText(guide.slug))
      const text = rewriteLinks(bodiesOf(parsed).join('\n\n'), links(guide.slug))
      // A code span may show link syntax, so spans are removed before the check.
      const prose = text.replace(/(`+)[\s\S]*?\1/g, '')
      expect(prose, guide.slug).not.toMatch(/\]\((?!https?:|mailto:|#|\/)[^)\s]+\)/)
    }
  })
})
