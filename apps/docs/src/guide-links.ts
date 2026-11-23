import { guidePath } from './guide-catalogue'

/**
 * What the site does to a guide's markdown before a reader gets it: the
 * comments it drops and the links it rewrites.
 *
 * The module imports only the catalogue, so the build's own scripts run it as
 * the application does: `llms.ts` writes each guide's markdown file with it
 * (`vite.config.ts`). `guides.ts` exports everything here again.
 */

const FENCE_OPEN = /^\s*(`{3,}|~{3,})/
const FENCE_CLOSE = /^\s*(`{3,}|~{3,})\s*$/
const COMMENT_OPEN = /^ {0,3}<!--/

/**
 * Walks a source's lines and reports each one with whether it is inside a
 * fenced code block. A fence opened inside a list item is indented, so any
 * indentation opens one. A fence closes on a line of the same character, at
 * least as long, with nothing after it.
 */
export function* linesWithFences(source: string): Generator<{ line: string; fenced: boolean }> {
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
  /**
   * The address a link to a guide gets. The guide's page when omitted. A
   * guide's markdown file links the other guides' markdown files with it.
   */
  guideHref?: (slug: string) => string
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
    const href = (links.guideHref ?? guidePath)(guide)
    if (guide === links.guide) return fragment === '' ? href : fragment
    return `${href}${fragment}`
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
