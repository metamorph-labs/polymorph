import { inlineText, parseInlines } from '@polymorph/engine/markdown'

/**
 * The guides: the repository's `docs/*.md` files, published as `/guides` and
 * `/guides/<slug>`.
 *
 * This module holds two things. The catalogue lists each guide with the group
 * the index shows it in and the line the index describes it with. The text
 * pipeline turns a guide's source into what the page draws: its title, its
 * sections with heading ids, and its prose with links rewritten for the site.
 *
 * A guide's text is not in this module. Each file is imported on demand
 * (`loadGuideText`), so it is its own chunk and the boot bundle carries none
 * of them.
 */

export type GuideGroupId = 'start' | 'design' | 'agents' | 'internals'

export interface GuideGroup {
  id: GuideGroupId
  title: string
  description: string
}

export interface Guide {
  /** The file's name without `.md`, which is also its path under `/guides`. */
  slug: string
  /** The guide's own `#` heading. `guides.test.ts` holds it to the file. */
  title: string
  group: GuideGroupId
  /** The index's line for the guide, written for a reader of the site. */
  description: string
}

/** The index's groups, in the order a newcomer reads them. */
export const GUIDE_GROUPS: readonly GuideGroup[] = [
  {
    id: 'start',
    title: 'Start here',
    description:
      'New to Polymorph? Begin with these and you’ll go from the big idea to a working app.',
  },
  {
    id: 'design',
    title: 'Designing with it',
    description:
      'How themes, layout, motion, charts and chat screens work, so your screens look right without any styling of your own.',
  },
  {
    id: 'agents',
    title: 'Agents and tools',
    description:
      'The tools that help you and your AI agents build, and the lint rules that keep every screen consistent.',
  },
  {
    id: 'internals',
    title: 'Under the hood',
    description:
      'How the repository is put together, generated and tested. Handy when you want to contribute.',
  },
]

/** Every guide, in reading order: by group, then by the order within it. */
export const GUIDES: readonly Guide[] = [
  {
    slug: 'concepts',
    title: 'Concepts',
    group: 'start',
    description: 'The idea behind Polymorph, plus the handful of words every other guide uses.',
  },
  {
    slug: 'consuming',
    title: 'Using polymorph from another repository',
    group: 'start',
    description:
      'Get Polymorph into your app, whether it’s React, Vue, Svelte, Solid, Angular, a plain HTML page, iOS or Android.',
  },
  {
    slug: 'frameworks',
    title: 'Frameworks',
    group: 'start',
    description:
      'Not on React? See how each prop reads in Vue, Svelte, Solid, Angular and custom elements, and which components you get.',
  },
  {
    slug: 'theming',
    title: 'Theming',
    group: 'design',
    description: 'How a theme is put together, and how to make your own.',
  },
  {
    slug: 'layout',
    title: 'Layout, responsiveness and performance',
    group: 'design',
    description:
      'How components fit the space they’re given, what changes on a phone, and the size budgets every build has to fit.',
  },
  {
    slug: 'motion',
    title: 'Motion',
    group: 'design',
    description:
      'How animation is taken care of for you, and why your app code never needs to animate anything.',
  },
  {
    slug: 'charts',
    title: 'Charts',
    group: 'design',
    description:
      'Draw your data with the chart components, in colours that stay readable in every theme.',
  },
  {
    slug: 'conversation',
    title: 'The conversation tier',
    group: 'design',
    description:
      'Build an AI chat screen from ready-made parts: the thread, its messages, the composer and the pane beside it.',
  },
  {
    slug: 'agents',
    title: 'Agents',
    group: 'agents',
    description:
      'Let an AI agent read and use the components on a live page, and decide exactly what it’s allowed to do.',
  },
  {
    slug: 'tooling',
    title: 'Tooling',
    group: 'agents',
    description:
      'Meet the CLI, the MCP server, the screen format, the workbench and this site, and what each one is for.',
  },
  {
    slug: 'rules',
    title: 'Rules',
    group: 'agents',
    description:
      'The lint rules that keep styling out of your app code, and the way out when you really do need an exception.',
  },
  {
    slug: 'architecture',
    title: 'Architecture',
    group: 'internals',
    description:
      'Find your way around the repository, and follow a design decision from a JSON file to the screen.',
  },
  {
    slug: 'shells',
    title: 'Shells',
    group: 'internals',
    description:
      'How the Vue, Svelte, Solid and Angular components, and the custom elements, are generated from one shared description.',
  },
  {
    slug: 'native',
    title: 'Native rendering',
    group: 'internals',
    description:
      'How the same components are drawn with SwiftUI on iOS and Jetpack Compose on Android.',
  },
  {
    slug: 'conformance',
    title: 'Behaviour conformance',
    group: 'internals',
    description:
      'How each component’s written behaviour is checked against every framework that draws it.',
  },
  {
    slug: 'verification',
    title: 'Verification',
    group: 'internals',
    description:
      'Every check the repository runs, what each one proves, and how to run it yourself.',
  },
]

export function guideBySlug(slug: string): Guide | undefined {
  return GUIDES.find((guide) => guide.slug === slug)
}

export function guidesInGroup(group: GuideGroupId): Guide[] {
  return GUIDES.filter((guide) => guide.group === group)
}

export function groupOf(guide: Guide): GuideGroup {
  return GUIDE_GROUPS.find((group) => group.id === guide.group) as GuideGroup
}

export function guidePath(slug: string): string {
  return `/guides/${slug}`
}

/** The guides before and after this one in reading order, across groups. */
export function neighbours(slug: string): { previous?: Guide; next?: Guide } {
  const at = GUIDES.findIndex((guide) => guide.slug === slug)
  if (at === -1) return {}
  const previous = GUIDES[at - 1]
  const next = GUIDES[at + 1]
  return {
    ...(previous === undefined ? {} : { previous }),
    ...(next === undefined ? {} : { next }),
  }
}

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

const FENCE_OPEN = /^\s*(`{3,}|~{3,})/
const FENCE_CLOSE = /^\s*(`{3,}|~{3,})\s*$/
const HEADING = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/
const COMMENT_OPEN = /^ {0,3}<!--/

/**
 * Walks a source's lines and reports each one with whether it is inside a
 * fenced code block. A fence opened inside a list item is indented, so any
 * indentation opens one. A fence closes on a line of the same character, at
 * least as long, with nothing after it.
 */
function* linesWithFences(source: string): Generator<{ line: string; fenced: boolean }> {
  let fence: string | null = null
  for (const line of source.replace(/\r\n?/g, '\n').split('\n')) {
    if (fence !== null) {
      const close = FENCE_CLOSE.exec(line)?.[1]
      if (close !== undefined && close[0] === fence[0] && close.length >= fence.length) {
        fence = null
      }
      yield { line, fenced: true }
      continue
    }
    const open = FENCE_OPEN.exec(line)?.[1]
    if (open !== undefined) {
      fence = open
      yield { line, fenced: true }
      continue
    }
    yield { line, fenced: false }
  }
}

/**
 * Removes the HTML comments that open a line outside a code fence. Markdown
 * draws raw HTML as its text, and a comment is a note to the file's editors
 * that GitHub does not show either. `docs/rules.md` holds one above the ladder.
 */
export function stripComments(source: string): string {
  const kept: string[] = []
  let inComment = false
  for (const { line, fenced } of linesWithFences(source)) {
    if (inComment) {
      if (line.includes('-->')) inComment = false
      continue
    }
    if (!fenced && COMMENT_OPEN.test(line)) {
      inComment = !line.includes('-->')
      continue
    }
    kept.push(line)
  }
  return kept.join('\n')
}

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

/* -------------------------------------------------------------------------- */
/* Links                                                                      */
/* -------------------------------------------------------------------------- */

export interface LinkContext {
  /** The slug of the guide the link is in. */
  guide: string
  /** Every guide's slug. */
  guides: ReadonlySet<string>
  /** The site slug of the member whose spec is at this repository path, if there is one. */
  memberForSpec: (path: string) => string | undefined
  /** The repository's URL, where any other repository file is linked. */
  repository: string
}

/**
 * Resolves `path` against the directory `base`, both relative to the
 * repository's root. Returns `null` for a path that climbs above the root.
 */
function resolvePath(base: string, path: string): string | null {
  const parts = base === '' ? [] : base.split('/')
  for (const part of path.split('/')) {
    if (part === '' || part === '.') continue
    if (part === '..') {
      if (parts.length === 0) return null
      parts.pop()
    } else {
      parts.push(part)
    }
  }
  return parts.join('/')
}

/** The site's page for a repository path, or `null` when the site has none. */
function sitePage(path: string, fragment: string, links: LinkContext): string | null {
  const guide = /^docs\/([^/]+)\.md$/.exec(path)?.[1]
  if (guide !== undefined && links.guides.has(guide)) {
    if (guide === links.guide) return fragment === '' ? guidePath(guide) : fragment
    return `${guidePath(guide)}${fragment}`
  }
  // A member's page draws the registry's facts and not the spec's sections, so
  // the spec's fragment would name nothing there and is dropped.
  const member = links.memberForSpec(path)
  return member === undefined ? null : `/components/${member}`
}

/**
 * Where a link in a guide goes on the site.
 *
 * A guide's links are written for GitHub, relative to `docs/`. A link to
 * another guide goes to its page, and a link to a section of the same guide
 * stays a fragment, which the browser follows without the router. A link to a
 * member's spec goes to the member's page. Any other repository path goes to
 * the file on GitHub: a path that ends in `/` names a directory, which GitHub
 * shows under `tree`. A path written from the repository's root
 * (`docs/rules.md`) is read that way when the path relative to `docs/` names
 * no page. A fragment, an absolute URL or a path above the root is unchanged.
 */
export function rewriteHref(href: string, links: LinkContext): string {
  if (href === '' || href.startsWith('#') || href.startsWith('//')) return href
  if (/^[a-z][a-z0-9+.-]*:/i.test(href)) return href

  const hashAt = href.indexOf('#')
  const path = hashAt === -1 ? href : href.slice(0, hashAt)
  const fragment = hashAt === -1 ? '' : href.slice(hashAt)
  const rooted = path.startsWith('/')
  const fromGuide = resolvePath(rooted ? '' : 'docs', path)
  const fromRoot = rooted || path.startsWith('.') ? null : resolvePath('', path)

  for (const candidate of [fromGuide, fromRoot]) {
    if (candidate === null) continue
    const page = sitePage(candidate, fragment, links)
    if (page !== null) return page
  }
  if (fromGuide === null) return href
  const kind = path.endsWith('/') ? 'tree' : 'blob'
  return `${links.repository}/${kind}/main/${fromGuide}${fragment}`
}

/**
 * A code span, which is left alone, or a link's `](` and its target. Matching
 * both in one pass keeps a `](x)` inside backticks from being read as a link.
 */
const CODE_OR_TARGET = /(`+)[\s\S]*?\1|(\]\(\s*)([^\s()]+)/g

/**
 * Rewrites every link target in a markdown source with `rewriteHref`. Code
 * fences and code spans are left as they are. A code span cannot cross a blank
 * line, so each paragraph is matched on its own.
 */
export function rewriteLinks(source: string, links: LinkContext): string {
  const out: string[] = []
  let prose: string[] = []

  const flush = () => {
    if (prose.length === 0) return
    const rewritten = prose
      .join('\n')
      .split(/(\n[ \t]*\n)/)
      .map((part, index) =>
        index % 2 === 1
          ? part
          : part.replace(
              CODE_OR_TARGET,
              (match, code: string | undefined, open: string, target: string) =>
                code !== undefined ? match : `${open}${rewriteHref(target, links)}`,
            ),
      )
      .join('')
    out.push(rewritten)
    prose = []
  }

  for (const { line, fenced } of linesWithFences(source)) {
    if (fenced) {
      flush()
      out.push(line)
    } else {
      prose.push(line)
    }
  }
  flush()
  return out.join('\n')
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
