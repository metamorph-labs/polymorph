import { createElement, lazy, type ComponentType } from 'react'

/**
 * Route-level code splitting, with one addition: a page can be loaded before
 * the first render.
 *
 * Each page is a chunk that loads when its route is visited. `lazy` alone
 * suspends on first use even when the chunk is already in memory, so a document
 * that arrives with its page already drawn (the prerendered HTML,
 * `scripts/site.mjs`) would blank for a frame while React mounts. `preload` loads
 * the chunk first and the page then renders in the first commit, over markup
 * that already matches it. A route visited later goes through `lazy` as usual.
 */
export interface PreloadablePage<Props extends object> {
  (props: Props): ReturnType<typeof createElement>
  /** Loads the page's chunk. After it resolves, the page renders without suspending. */
  preload: () => Promise<void>
}

function page<Props extends object>(
  load: () => Promise<ComponentType<Props>>,
): PreloadablePage<Props> {
  let loaded: ComponentType<Props> | undefined
  const Lazy = lazy(() => load().then((component) => ({ default: component })))

  function Page(props: Props) {
    return createElement(loaded ?? (Lazy as ComponentType<Props>), props)
  }

  return Object.assign(Page, {
    preload: async () => {
      loaded = await load()
    },
  })
}

export const HomePage = page(() => import('./pages/HomePage').then((module) => module.HomePage))
export const ComponentsPage = page(() =>
  import('./pages/ComponentsPage').then((module) => module.ComponentsPage),
)
export const ComponentDetailPage = page(() =>
  import('./pages/ComponentDetailPage').then((module) => module.ComponentDetailPage),
)
export const GuidesPage = page(() =>
  import('./pages/GuidesPage').then((module) => module.GuidesPage),
)
export const GuidePage = page(() => import('./pages/GuidePage').then((module) => module.GuidePage))
export const TokensPage = page(() =>
  import('./pages/TokensPage').then((module) => module.TokensPage),
)
export const SystemsPage = page(() =>
  import('./pages/SystemsPage').then((module) => module.SystemsPage),
)
export const MotionPage = page(() =>
  import('./pages/MotionPage').then((module) => module.MotionPage),
)
export const PrinciplesPage = page(() =>
  import('./pages/PrinciplesPage').then((module) => module.PrinciplesPage),
)
export const InstallPage = page(() =>
  import('./pages/InstallPage').then((module) => module.InstallPage),
)
export const NotFoundPage = page(() =>
  import('./pages/NotFoundPage').then((module) => module.NotFoundPage),
)

/** The page a path draws, for loading it before the first render. */
export function pageFor(path: string): { preload: () => Promise<void> } {
  if (path === '/') return HomePage
  if (path === '/components') return ComponentsPage
  if (path.startsWith('/components/')) return ComponentDetailPage
  if (path === '/guides') return GuidesPage
  if (path.startsWith('/guides/')) {
    // A guide's text is a chunk apart from its page, so both are loaded.
    return {
      preload: async () => {
        const [module] = await Promise.all([import('./pages/GuidePage'), GuidePage.preload()])
        await module.preloadGuide(path.slice('/guides/'.length))
      },
    }
  }
  if (path === '/tokens') return TokensPage
  if (path === '/systems') return SystemsPage
  if (path === '/motion') return MotionPage
  if (path === '/principles') return PrinciplesPage
  if (path === '/install') return InstallPage
  return NotFoundPage
}
