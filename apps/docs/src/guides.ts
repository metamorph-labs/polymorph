import { inlineText, parseInlines } from '@polymorph/engine/markdown'

import { linesWithFences, rewriteLinks, stripComments, type LinkContext } from './guide-links'

/**
 * The guides: the repository's `docs/*.md` files, published as `/guides` and
 * `/guides/<slug>`.
 *
 * This module holds the text pipeline, which turns a guide's source into what
 * the page draws: its title, its sections with heading ids, and its prose with
 * links rewritten for the site. The catalogue (`guide-catalogue.ts`) and the
 * link rewriting (`guide-links.ts`) are modules of their own, which the build
 * reads too, and are exported again from here.
 *
 * A guide's text is not in this module. Each file is imported on demand
 * (`loadGuideText`), so it is its own chunk and the boot bundle carries none
 * of them.
 */

export * from './guide-catalogue'
export * from './guide-links'

/* -------------------------------------------------------------------------- */
/* Loading                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * One loader per file, keyed by the path as written in the pattern. A lazy
 * glob makes each file a chunk of its own, so a guide's text loads only when
 * its page or the search palette asks for it.
 */
const SOURCES = import.meta.glob<string>('../../../docs/*.md', {
  query: '?raw',
  import: 'default',
})

const texts = new Map<string, Promise<string>>()

/** The guide's markdown source, cached so each file is fetched once. */
export function loadGuideText(slug: string): Promise<string> {
  const cached = texts.get(slug)
  if (cached !== undefined) return cached
  const load = SOURCES[`../../../docs/${slug}.md`]
  const text = load === undefined ? Promise.reject(new Error(`No guide named ${slug}`)) : load()
  texts.set(slug, text)
  return text
}

/** The slugs of the files the glob found, for the law that every file is catalogued. */
export function guideFiles(): string[] {
  return Object.keys(SOURCES)
    .map((path) => /([^/]+)\.md$/.exec(path)?.[1] ?? path)
    .sort()
}

/* -------------------------------------------------------------------------- */
/* The text pipeline                                                          */
/* -------------------------------------------------------------------------- */

export interface GuideHeading {
  /** GitHub's anchor for the heading, so the guides' own `#fragment` links resolve. */
  id: string
  /** The heading's plain text: inline code, emphasis and link labels as their characters. */
  text: string
  /** `##` is 2, `###` is 3, and every deeper heading is 4, Heading's floor. */
  level: 2 | 3 | 4
}

export interface GuideSection {
  heading: GuideHeading
  /** The markdown between this heading and the next. It holds no heading. */
  body: string
  /** The sections one level deeper, in order. */
  children: GuideSection[]
}

export interface ParsedGuide {
  /** The text of the guide's first `#` heading. The page draws it as its one `<h1>`. */
  title: string
  /** The markdown between the title and the first section. */
  intro: string
  sections: GuideSection[]
  /** Every heading below the title, in document order. */
  headings: GuideHeading[]
}

const HEADING = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/

/**
 * GitHub's heading anchors: the text in lower case, with every character that
 * is not a letter, a mark, a digit, a connector, a hyphen or a space removed,
 * and each space made a hyphen. A repeated anchor takes `-1`, `-2` and so on.
 * The guides link to each other's headings by these anchors.
 */
export function createSlugger(): (text: string) => string {
  const seen = new Map<string, number>()
  return (text) => {
    const base = text
      .toLowerCase()
      .replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, '')
      .replace(/ /g, '-')
    let slug = base
    while (seen.has(slug)) {
      const count = (seen.get(base) ?? 0) + 1
      seen.set(base, count)
      slug = `${base}-${count}`
    }
    seen.set(slug, 0)
    return slug
  }
}

/**
 * Splits a guide into its title and its sections.
 *
 * The page draws every heading itself, with Heading and an id, and gives
 * Markdown only the prose between headings. Markdown gives its headings no id,
 * so a TableOfContents or a link to `#fragment` could not reach them. Markdown
 * also places a source's shallowest heading at level 2, so a section's `###`
 * would be drawn as an h2 if the section were rendered on its own.
 */
export function parseGuide(source: string): ParsedGuide {
  const slug = createSlugger()
  const headings: GuideHeading[] = []
  const sections: GuideSection[] = []
  const open: GuideSection[] = []
  let title: string | null = null
  let intro = ''
  let body: string[] = []

  const flush = () => {
    const text = body.join('\n').trim()
    body = []
    const current = open[open.length - 1]
    if (current === undefined) intro = intro === '' ? text : `${intro}\n\n${text}`
    else current.body = current.body === '' ? text : `${current.body}\n\n${text}`
  }

  for (const { line, fenced } of linesWithFences(stripComments(source))) {
    const match = fenced ? null : HEADING.exec(line)
    if (match === null) {
      body.push(line)
      continue
    }
    flush()
    const depth = (match[1] as string).length
    const text = inlineText(parseInlines(match[2] ?? '')).trim()
    const id = slug(text)
    if (depth === 1 && title === null) {
      title = text
      continue
    }
    const heading: GuideHeading = { id, text, level: depth <= 2 ? 2 : depth === 3 ? 3 : 4 }
    headings.push(heading)
    const section: GuideSection = { heading, body: '', children: [] }
    while (
      open.length > 0 &&
      (open[open.length - 1] as GuideSection).heading.level >= heading.level
    ) {
      open.pop()
    }
    const parent = open[open.length - 1]
    if (parent === undefined) sections.push(section)
    else parent.children.push(section)
    open.push(section)
  }
  flush()

  return { title: title ?? '', intro, sections, headings }
}

/** A parsed guide with the links in its intro and in every section rewritten for the site. */
export function rewriteGuide(guide: ParsedGuide, links: LinkContext): ParsedGuide {
  const section = (each: GuideSection): GuideSection => ({
    heading: each.heading,
    body: rewriteLinks(each.body, links),
    children: each.children.map(section),
  })
  return {
    ...guide,
    intro: rewriteLinks(guide.intro, links),
    sections: guide.sections.map(section),
  }
}
