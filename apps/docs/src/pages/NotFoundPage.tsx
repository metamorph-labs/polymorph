import { EmptyState, Link } from '@polymorph/react-ui'

import { useMeta } from '../meta'

/** Any address the site has no page for. */
export function NotFoundPage() {
  useMeta({ title: 'Page not found', noindex: true })
  return (
    <EmptyState
      icon="search"
      title="We couldn’t find that page"
      description="The link may be old, or the address may have a typo."
      action={
        <Link variant="button" buttonVariant="soft" href="/">
          Back to the start
        </Link>
      }
    />
  )
}
