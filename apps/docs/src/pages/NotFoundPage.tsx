import { Link, PageHeader } from '@polymorph/react-ui'

import { useMeta } from '../meta'

/**
 * Any address the site has no page for. A PageHeader, not an EmptyState: the
 * message is the page's title, so it is the page's first-level heading.
 */
export function NotFoundPage() {
  useMeta({ title: 'Page not found', noindex: true })
  return (
    <PageHeader
      title="We couldn’t find that page"
      description="The link may be old, or the address may have a typo."
      actions={
        <Link variant="button" buttonVariant="soft" href="/">
          Back to the start
        </Link>
      }
    />
  )
}
