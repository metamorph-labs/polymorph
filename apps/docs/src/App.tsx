import { getPalette, getSystem, type ModePreference } from '@polymorph/theme'
import { AppShell, Button, Inline, Link } from '@polymorph/react-ui'
import { Suspense, useEffect, useState, type ReactNode } from 'react'

import { ChunkBoundary } from './ChunkBoundary'
import { Mark } from './harness/Mark'
import {
  ComponentDetailPage,
  ComponentsPage,
  GuidePage,
  GuidesPage,
  HomePage,
  InstallPage,
  MotionPage,
  NotFoundPage,
  PrinciplesPage,
  SystemsPage,
  TokensPage,
} from './pages'
import { useRoute } from './router'
import { SiteFooter } from './shell/SiteFooter'
import { ThemeControl } from './shell/ThemeControl'
import { SITE } from './site'
import { SiteSearch } from './SiteSearch'
import { DEFAULT_SYSTEM, findSystem, selectPalette, selectSystem } from './themes'

/** The first-level sections, in the order the top bar draws them. */
const SECTIONS = [
  { path: '/install', label: 'Get started' },
  { path: '/guides', label: 'Guides' },
  { path: '/components', label: 'Components' },
  { path: '/systems', label: 'Systems' },
  { path: '/tokens', label: 'Tokens' },
  { path: '/motion', label: 'Motion' },
  { path: '/principles', label: 'Principles' },
] as const

/**
 * What a route draws and which content layout the shell gives it. `'page'` is
 * the shell's bounded reading surface, for a page composed from members with no
 * archetype around it. `'full'` gives the region to a page archetype, which
 * brings its own measure and padding.
 */
interface Route {
  layout: 'page' | 'full'
  page: ReactNode
}

function initialSystem(): string {
  return getSystem() ?? DEFAULT_SYSTEM
}

function initialPalette(): string {
  return getPalette() ?? findSystem(initialSystem()).defaultPalette
}

export function App() {
  const path = useRoute()
  // A pairing is two decisions, held here because two pages read the system
  // (its axes on the tokens page, its temperament on the motion page).
  // `selectSystem` decides which palette a system change moves to.
  const [system, setSystemState] = useState(initialSystem)
  const [palette, setPaletteState] = useState(initialPalette)
  // The theme panel's ModeSwitch reads the document's preference itself. The
  // shell keeps no copy of the mode.
  const onModeChange = (_mode: ModePreference) => {}

  const [searching, setSearching] = useState(false)

  // The shell's content region is the page's scroll container, and it keeps
  // its offset when the route changes, because the region is not remounted. A
  // new page starts at its top. An address with a fragment is left alone: the
  // page that owns the section scrolls to it.
  useEffect(() => {
    if (window.location.hash === '') document.getElementById('content')?.scrollTo(0, 0)
  }, [path])

  const route = ((): Route => {
    if (path === '/') return { layout: 'page', page: <HomePage /> }
    if (path === '/components') return { layout: 'page', page: <ComponentsPage /> }
    if (path.startsWith('/components/')) {
      return {
        layout: 'page',
        page: <ComponentDetailPage slug={path.slice('/components/'.length)} />,
      }
    }
    if (path === '/guides') return { layout: 'page', page: <GuidesPage /> }
    if (path.startsWith('/guides/')) {
      return { layout: 'full', page: <GuidePage slug={path.slice('/guides/'.length)} /> }
    }
    if (path === '/tokens') return { layout: 'page', page: <TokensPage system={system} /> }
    if (path === '/systems') return { layout: 'page', page: <SystemsPage /> }
    if (path === '/motion') return { layout: 'page', page: <MotionPage system={system} /> }
    if (path === '/principles') return { layout: 'page', page: <PrinciplesPage /> }
    if (path === '/install') return { layout: 'page', page: <InstallPage /> }
    return { layout: 'page', page: <NotFoundPage /> }
  })()

  return (
    <AppShell
      navigation="top"
      contentLayout={route.layout}
      transitionKey={path}
      brand={
        <Inline gap={2} align="center">
          <Mark />
          <Link variant="standalone" href="/">
            {SITE.name}
          </Link>
        </Inline>
      }
      sidebar={
        <>
          {/* `href`, not `onSelect`. With an `href`, NavItem renders an `<a>`
              (link.md), so a row can be middle-clicked, cmd-clicked and copied
              like any other link. A plain click stays on the page because
              `interceptLinks` routes it. */}
          {SECTIONS.map((item) => (
            <AppShell.NavItem
              key={item.path}
              label={item.label}
              current={path === item.path || path.startsWith(`${item.path}/`)}
              href={item.path}
            />
          ))}
        </>
      }
      topbar={{
        trailing: (
          <>
            <Button
              variant="ghost"
              tone="neutral"
              icon="search"
              iconOnly
              label="Search"
              onClick={() => {
                setSearching(true)
              }}
            />
            <ThemeControl
              system={system}
              palette={palette}
              onSystemChange={(next) => {
                setSystemState(next)
                setPaletteState(selectSystem(next))
              }}
              onPaletteChange={(next) => {
                setPaletteState(next)
                selectPalette(system, next)
              }}
              onModeChange={onModeChange}
            />
            <Link
              variant="button"
              buttonVariant="ghost"
              tone="neutral"
              href={SITE.repository}
              external
            >
              GitHub
            </Link>
          </>
        ),
      }}
    >
      <SiteSearch open={searching} onOpenChange={setSearching} />
      <ChunkBoundary>
        <Suspense fallback={null}>
          {route.page}
          <SiteFooter inset={route.layout === 'full'} />
        </Suspense>
      </ChunkBoundary>
    </AppShell>
  )
}
