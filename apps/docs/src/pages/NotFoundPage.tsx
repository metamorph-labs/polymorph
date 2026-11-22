import { EmptyState, Link } from '@polymorph/react-ui'

/** Any address the site has no page for. */
export function NotFoundPage() {
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
