import { lazy, Suspense } from 'react'

import { ChunkBoundary } from './ChunkBoundary'
import { componentSlugFromPath, gallerySlugFromPath, Toolbar, useRoute } from './harness'
import { isExemplarRoute, PAGES_ROOT } from './pages/routes'
import { isRelayRoute } from './relay/routes'

/*
 * Route-level code splitting. The boot bundle holds the toolbar, the router and the theme engine
 * that `themes.ts` runs at startup. Every route is a chunk that loads on first visit. The
 * galleries hold the whole vocabulary and its fixtures, the studio a page of controls, and Relay
 * a product. `isRelayRoute` is imported from `relay/routes.ts` rather than the barrel, so the
 * route check does not download Relay.
 *
 * The Suspense fallbacks are `null`, not a styled placeholder. A fallback is a style decision,
 * and the red rules give application code nowhere to make one. The toolbar stays mounted, so a
 * loading route shows a brief empty content region on an already themed page.
 */
const ComponentDetailPage = lazy(() =>
  import('./harness/galleries').then((module) => ({ default: module.ComponentDetailPage })),
)
const ComponentsPage = lazy(() =>
  import('./harness/galleries').then((module) => ({ default: module.ComponentsPage })),
)
const GalleryPage = lazy(() =>
  import('./harness/galleries').then((module) => ({ default: module.GalleryPage })),
)
const HomePage = lazy(() =>
  import('./harness/HomePage').then((module) => ({ default: module.HomePage })),
)
const TokensPage = lazy(() =>
  import('./harness/TokensPage').then((module) => ({ default: module.TokensPage })),
)
const StudioPage = lazy(() => import('./studio').then((module) => ({ default: module.StudioPage })))
const RelayApp = lazy(() => import('./relay').then((module) => ({ default: module.RelayApp })))
const PagesApp = lazy(() => import('./pages').then((module) => ({ default: module.PagesApp })))
const PagesIndex = lazy(() => import('./pages').then((module) => ({ default: module.PagesIndex })))
const MoodboardPage = lazy(() =>
  import('./harness/MoodboardPage').then((module) => ({ default: module.MoodboardPage })),
)
const ComposerPage = lazy(() =>
  import('./composer').then((module) => ({ default: module.ComposerPage })),
)
const HostedPage = lazy(() => import('./hosted').then((module) => ({ default: module.HostedPage })))

export function App() {
  const route = useRoute()
  const gallerySlug = gallerySlugFromPath(route)
  const componentSlug = componentSlugFromPath(route)

  /*
   * Relay, the demo product, replaces the harness instead of rendering inside it, for two
   * reasons. `AppShell` is `100vh`, so the toolbar would push it off-screen. It also renders its
   * own `<main>`, and nesting it in the workbench's `<main>` would give the page two of a landmark
   * that must be unique. The demo is also meant to be seen without the workbench chrome. Relay
   * has its own theme switchers on its settings screen.
   */
  if (isRelayRoute(route)) {
    return (
      <ChunkBoundary>
        <Suspense fallback={null}>
          <RelayApp route={route} />
        </Suspense>
      </ChunkBoundary>
    )
  }

  // The page exemplars replace the shell for the same reasons as Relay. `/pages` itself stays
  // inside the chrome because the index is part of the workbench.
  if (isExemplarRoute(route)) {
    return (
      <ChunkBoundary>
        <Suspense fallback={null}>
          <PagesApp route={route} />
        </Suspense>
      </ChunkBoundary>
    )
  }

  /*
   * The studio is the default route. `/` and `/studio` render it, and so does any unknown path.
   * The overview (a page built only from vocabulary primitives) is at `/overview` and the token
   * gallery at `/tokens`. Neither has a nav entry. The studio links to both. `/hosted` shows two
   * components from other libraries inside their declared boundaries. `/gallery/<slug>`
   * must keep its shape because the proof harness screenshots those routes by name.
   */
  return (
    <>
      <Toolbar />
      <main>
        <ChunkBoundary>
          <Suspense fallback={null}>
            {gallerySlug ? (
              <GalleryPage slug={gallerySlug} />
            ) : componentSlug ? (
              <ComponentDetailPage slug={componentSlug} />
            ) : route === '/tokens' ? (
              <TokensPage />
            ) : route === '/components' ? (
              <ComponentsPage />
            ) : route === PAGES_ROOT ? (
              <PagesIndex />
            ) : route === '/composer' ? (
              <ComposerPage />
            ) : route === '/moodboard' ? (
              <MoodboardPage />
            ) : route === '/hosted' ? (
              <HostedPage />
            ) : route === '/overview' ? (
              <HomePage />
            ) : (
              <StudioPage />
            )}
          </Suspense>
        </ChunkBoundary>
      </main>
    </>
  )
}
