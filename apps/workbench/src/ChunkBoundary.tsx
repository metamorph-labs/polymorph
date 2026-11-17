import { Button, EmptyState } from '@polymorph/react-ui'
import { Component, type ReactNode } from 'react'

/**
 * The only class in the app, because React error boundaries must be classes. A lazy route chunk
 * can fail to fetch, for example when a deploy replaced the hashed files or the network dropped.
 * Its `lazy()` then rejects, and with only `Suspense fallback={null}` the rejection unmounts the
 * root and leaves a blank document. The boundary keeps the chrome and explains the failure. It
 * offers a reload because a fresh document fetches the current manifest.
 */
export class ChunkBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false }

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true }
  }

  override render(): ReactNode {
    if (!this.state.failed) return this.props.children
    return (
      <EmptyState
        icon="error"
        title="This page failed to load"
        description="A newer build may have replaced this one while it was open."
        action={
          <Button
            variant="soft"
            tone="accent"
            label="Reload"
            onClick={() => {
              window.location.reload()
            }}
          />
        }
      />
    )
  }
}
