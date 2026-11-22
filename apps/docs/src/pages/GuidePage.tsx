import {
  Badge,
  Card,
  DetailPage,
  EmptyState,
  Grid,
  Heading,
  Link,
  Markdown,
  SectionNav,
  Separator,
  Skeleton,
  Stack,
  TableOfContents,
  Text,
  type TableOfContentsItem,
} from '@polymorph/react-ui'
import { useEffect, useState } from 'react'

import {
  GUIDES,
  groupOf,
  guideBySlug,
  guidePath,
  guidesInGroup,
  loadGuideText,
  neighbours,
  parseGuide,
  rewriteGuide,
  type Guide,
  type GuideSection,
  type LinkContext,
  type ParsedGuide,
} from '../guides'
import { useMeta } from '../meta'
import { componentSlug, REGISTRY } from '../registry'
import { navigate } from '../router'
import { SITE } from '../site'

/**
 * One guide: `docs/<slug>.md` drawn through the vocabulary.
 *
 * The page is a DetailPage. Its title is the guide's `#` heading, the page's
 * one `<h1>`, and the guide's body starts after it. The aside holds a
 * TableOfContents of the guide's `##` and `###` headings and stays in view
 * while the guide scrolls. A SectionNav above the body links the guides of the
 * same group, and two linked Cards at the foot go to the guides before and
 * after this one.
 *
 * The page draws each heading with Heading and an id, and hands Markdown the
 * prose between headings (`parseGuide` in `guides.ts` says why).
 *
 * The text is a chunk of its own. The header, the back button and the group's
 * links draw at once, and the body and the contents draw when the text has
 * loaded. The text is held in state rather than read through Suspense, because
 * React holds a Suspense boundary's fallback for at least 300ms, which kept a
 * guide that loads in a few milliseconds off the screen for that long.
 */

/** Each member's spec path, so a guide's link to a spec goes to the member's page. */
const MEMBER_FOR_SPEC = new Map(
  REGISTRY.components.map((component) => [component.spec, componentSlug(component.name)]),
)

const SLUGS: ReadonlySet<string> = new Set(GUIDES.map((guide) => guide.slug))

function linksFor(slug: string): LinkContext {
  return {
    guide: slug,
    guides: SLUGS,
    memberForSpec: (path) => MEMBER_FOR_SPEC.get(path),
    repository: SITE.repository,
  }
}

/** Each guide once it has loaded, parsed and with its links rewritten. */
const parsed = new Map<string, ParsedGuide>()

/**
 * The guide, or `null` while its text loads. A guide read before is returned
 * on the first render. A text that fails to load is thrown while rendering, so
 * the app's error boundary reports it as it reports a page chunk that failed.
 */
function useGuide(slug: string): ParsedGuide | null {
  const [guide, setGuide] = useState(() => parsed.get(slug) ?? null)
  const [failure, setFailure] = useState<unknown>(null)
  useEffect(() => {
    if (guide !== null) return
    let current = true
    loadGuideText(slug).then(
      (text) => {
        const next = parsed.get(slug) ?? rewriteGuide(parseGuide(text), linksFor(slug))
        parsed.set(slug, next)
        if (current) setGuide(next)
      },
      (error: unknown) => {
        if (current) setFailure(error ?? new Error(`The guide ${slug} failed to load`))
      },
    )
    return () => {
      current = false
    }
  }, [slug, guide])
  if (failure !== null) throw failure
  return guide
}

/**
 * Loads and parses a guide ahead of its page, so the page's first render
 * already has the text. The site's entry calls it for the address it opens at
 * (`pages.ts`): a document that arrives with the guide already drawn would
 * otherwise show the loading placeholder over it for a moment. An unknown slug
 * and a text that fails to load are left for the page to report.
 */
export async function preloadGuide(slug: string): Promise<void> {
  if (guideBySlug(slug) === undefined || parsed.has(slug)) return
  const text = await loadGuideText(slug)
  parsed.set(slug, rewriteGuide(parseGuide(text), linksFor(slug)))
}

export function GuidePage({ slug }: { slug: string }) {
  const guide = guideBySlug(slug)
  if (guide === undefined) return <MissingGuide />
  // Keyed, so each guide mounts fresh and its effects run for it.
  return <GuideView key={guide.slug} guide={guide} />
}

function GuideView({ guide }: { guide: Guide }) {
  useMeta({ title: guide.title, description: guide.description })
  const text = useGuide(guide.slug)
  const group = groupOf(guide)
  const { previous, next } = neighbours(guide.slug)

  return (
    <DetailPage
      backLabel="All guides"
      onBack={() => navigate('/guides')}
      title={guide.title}
      meta={<Badge>{group.title}</Badge>}
      actions={
        <Link
          variant="button"
          buttonVariant="ghost"
          size="sm"
          external
          href={`${SITE.repository}/blob/main/docs/${guide.slug}.md`}
        >
          View on GitHub
        </Link>
      }
      // Always an element, so the page has its two columns while the text loads.
      aside={<GuideContents guide={text} />}
      stickyAside
    >
      <Stack gap={8}>
        <SectionNav
          label={`${group.title} guides`}
          current={guidePath(guide.slug)}
          items={guidesInGroup(group.id).map((sibling) => ({
            label: sibling.title,
            href: guidePath(sibling.slug),
          }))}
        />
        {text === null ? <GuideSkeleton /> : <GuideBody guide={text} />}
        <Stack gap={6}>
          <Separator />
          <Grid columns={2} gap={4}>
            {previous === undefined ? null : (
              <NeighbourCard guide={previous} direction="Previous" />
            )}
            {next === undefined ? null : <NeighbourCard guide={next} direction="Up next" />}
          </Grid>
        </Stack>
      </Stack>
    </DetailPage>
  )
}

function GuideContents({ guide }: { guide: ParsedGuide | null }) {
  if (guide === null) return null
  const items: TableOfContentsItem[] = guide.headings
    .filter((heading) => heading.level <= 3)
    .map((heading) => ({
      id: heading.id,
      label: heading.text,
      level: heading.level === 2 ? 1 : 2,
    }))
  if (items.length === 0) return null
  return <TableOfContents label="On this page" items={items} />
}

function GuideBody({ guide }: { guide: ParsedGuide }) {
  // A link from another page can name a section (`/guides/rules#the-inventory`).
  // The router changes the address without a load, and the section did not
  // exist when the browser read the fragment, so the page scrolls to it once
  // the guide is drawn.
  useEffect(() => {
    const fragment = window.location.hash.slice(1)
    if (fragment === '') return
    let id = fragment
    try {
      id = decodeURIComponent(fragment)
    } catch {
      // A fragment that is not valid percent-encoding is looked up as written.
    }
    document.getElementById(id)?.scrollIntoView()
  }, [])

  return (
    <Stack gap={8}>
      {guide.intro === '' ? null : <Markdown>{guide.intro}</Markdown>}
      {guide.sections.map((section) => (
        <SectionView key={section.heading.id} section={section} />
      ))}
    </Stack>
  )
}

/**
 * A heading, its prose and its subsections. A heading sits closer to its own
 * text than to the section before it, and a subsection is set apart from its
 * siblings by less space than a section is.
 */
function SectionView({ section }: { section: GuideSection }) {
  return (
    <Stack gap={section.heading.level === 2 ? 7 : 6}>
      <Stack gap={3}>
        <Heading level={section.heading.level} id={section.heading.id}>
          {section.heading.text}
        </Heading>
        {section.body === '' ? null : <Markdown>{section.body}</Markdown>}
      </Stack>
      {section.children.map((child) => (
        <SectionView key={child.heading.id} section={child} />
      ))}
    </Stack>
  )
}

function GuideSkeleton() {
  return (
    <Stack gap={3}>
      <Skeleton label="Loading the guide" />
      <Skeleton />
      <Skeleton width={10} />
    </Stack>
  )
}

function NeighbourCard({ guide, direction }: { guide: Guide; direction: string }) {
  return (
    <Card href={guidePath(guide.slug)} label={`${direction}: ${guide.title}`}>
      <Stack gap={1}>
        <Text size="sm" tone="secondary">
          {direction}
        </Text>
        <Text>
          <strong>{guide.title}</strong>
        </Text>
      </Stack>
    </Card>
  )
}

function MissingGuide() {
  useMeta({ title: 'Guide not found', noindex: true })
  return (
    <DetailPage
      backLabel="All guides"
      onBack={() => navigate('/guides')}
      title="We can’t find that guide"
    >
      <EmptyState
        icon="document"
        title="This guide doesn’t exist, or it has moved"
        description="Every guide we have is listed on the guides page."
        action={
          <Link variant="button" href="/guides">
            See all guides
          </Link>
        }
      />
    </DetailPage>
  )
}
