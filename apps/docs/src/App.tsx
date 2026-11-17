import { DATA_ATTRS, getModePreference, setMode, type ModePreference } from '@polymorph/theme'
import { AppShell, Badge, Select } from '@polymorph/react-ui'
import { lazy, Suspense, useState } from 'react'

import { ChunkBoundary } from './ChunkBoundary'
import { useRoute } from './router'
import {
  DEFAULT_SYSTEM,
  findSystem,
  PALETTES,
  selectPalette,
  selectSystem,
  SYSTEMS,
} from './themes'

/*
 * Route-level code splitting. The boot bundle is the shell: `AppShell`, the
 * topbar selects, and the theme engine that `themes.ts` runs at startup. Each
 * page is a chunk that loads when its route is visited. The largest is the
 * component detail page. It renders the live states fixtures, so it imports
 * `@polymorph/react-ui/galleries` and through it every member of the vocabulary. The
 * other pages carry the registry JSON and the page archetypes they compose. The
 * Suspense fallback is `null`, not a styled placeholder, because a fallback is
 * a style decision and the red rules give application code nowhere to make one.
 * The shell stays mounted, so a loading page shows only a brief empty content
 * region, already themed by the `<html>` attributes.
 */
const ComponentDetailPage = lazy(() =>
  import('./pages/ComponentDetailPage').then((module) => ({ default: module.ComponentDetailPage })),
)
const ComponentsPage = lazy(() =>
  import('./pages/ComponentsPage').then((module) => ({ default: module.ComponentsPage })),
)
const HomePage = lazy(() =>
  import('./pages/HomePage').then((module) => ({ default: module.HomePage })),
)
const InstallPage = lazy(() =>
  import('./pages/InstallPage').then((module) => ({ default: module.InstallPage })),
)
const MotionPage = lazy(() =>
  import('./pages/MotionPage').then((module) => ({ default: module.MotionPage })),
)
const PrinciplesPage = lazy(() =>
  import('./pages/PrinciplesPage').then((module) => ({ default: module.PrinciplesPage })),
)
const SystemsPage = lazy(() =>
  import('./pages/SystemsPage').then((module) => ({ default: module.SystemsPage })),
)
const TokensPage = lazy(() =>
  import('./pages/TokensPage').then((module) => ({ default: module.TokensPage })),
)

const SECTIONS = [
  { path: '/', label: 'Overview', icon: 'home' },
  { path: '/components', label: 'Components', icon: 'folder' },
  { path: '/tokens', label: 'Tokens', icon: 'tag' },
  { path: '/systems', label: 'Systems', icon: 'mode-system' },
  // `refresh` is the replay glyph. The motion page is for replaying: every
  // pattern can be re-triggered by hand.
  { path: '/motion', label: 'Motion', icon: 'refresh' },
  { path: '/principles', label: 'Principles', icon: 'locked' },
  { path: '/install', label: 'Install', icon: 'download' },
] as const

const MODES = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
]

function initialSystem(): string {
  return document.documentElement.getAttribute(DATA_ATTRS.system) ?? DEFAULT_SYSTEM
}

function initialPalette(): string {
  return (
    document.documentElement.getAttribute(DATA_ATTRS.palette) ??
    findSystem(initialSystem()).defaultPalette
  )
}

export function App() {
  const route = useRoute()
  // A pairing is two decisions, so the topbar has a select for each. The palette
  // list holds every palette, not only this system's, so that cross-pairings
  // can be chosen. `selectSystem` decides which palette a system change moves to.
  const [system, setSystemState] = useState(initialSystem)
  const [palette, setPaletteState] = useState(initialPalette)
  // Seeded from storage, not from a literal, so the selector matches the page
  // after a reload. The mode preference can be `system`, which is never an
  // attribute value, so unlike the pairing above it cannot be read from
  // `<html>`.
  const [mode, setModeState] = useState<ModePreference>(getModePreference)
  const [collapsed, setCollapsed] = useState(false)

  const section =
    SECTIONS.find((candidate) => candidate.path !== '/' && route.startsWith(candidate.path))
      ?.path ?? '/'

  return (
    <AppShell
      collapsed={collapsed}
      onCollapsedChange={setCollapsed}
      brand={
        <Badge variant="solid" tone="accent">
          {collapsed ? 'P' : 'Polymorph'}
        </Badge>
      }
      sidebar={
        <>
          {/* `href`, not `onSelect`. With an `href`, NavItem renders an `<a>`
              (link.md), so a row can be middle-clicked, cmd-clicked and copied
              like any other link. A click handler cannot offer that. A plain
              click stays on the page because `interceptLinks` routes it.
              Passing `onSelect` as well would also route the current tab on a
              cmd-click, which is the behaviour the href exists to avoid. */}
          {SECTIONS.map((item) => (
            <AppShell.NavItem
              key={item.path}
              icon={item.icon}
              label={item.label}
              current={section === item.path}
              href={item.path}
            />
          ))}
        </>
      }
      topbar={{
        trailing: (
          /* Without labels, a screen reader would announce each of the three
             as "combobox", and they are the site's only controls. Each gets an
             `aria-label` rather than a visible label, which is what Select's
             API offers when no FormField wraps it. Visible labels reading
             "System Palette Mode" would spend the row's width on words the
             values already show (`pastel`, `harbor`, `Dark`), and the three
             triggers share a single row. */
          <>
            <Select
              aria-label="System"
              size="sm"
              options={SYSTEMS.map((candidate) => ({
                value: candidate.name,
                label: candidate.name,
              }))}
              value={system}
              onChange={(next) => {
                if (next === null) return
                setSystemState(next)
                setPaletteState(selectSystem(next))
              }}
            />
            <Select
              aria-label="Palette"
              size="sm"
              options={PALETTES.map((candidate) => ({
                value: candidate.name,
                label: candidate.name,
              }))}
              value={palette}
              onChange={(next) => {
                if (next === null) return
                setPaletteState(next)
                selectPalette(system, next)
              }}
            />
            <Select
              aria-label="Mode"
              size="sm"
              options={MODES}
              value={mode}
              onChange={(next) => {
                if (next === null) return
                setModeState(next as ModePreference)
                setMode(next as ModePreference)
              }}
            />
          </>
        ),
      }}
    >
      <ChunkBoundary>
        <Suspense fallback={null}>
          {route.startsWith('/components/') ? (
            <ComponentDetailPage slug={route.slice('/components/'.length)} />
          ) : route === '/components' ? (
            <ComponentsPage />
          ) : route === '/tokens' ? (
            <TokensPage system={system} />
          ) : route === '/systems' ? (
            <SystemsPage />
          ) : route === '/motion' ? (
            <MotionPage system={system} />
          ) : route === '/principles' ? (
            <PrinciplesPage />
          ) : route === '/install' ? (
            <InstallPage />
          ) : (
            <HomePage />
          )}
        </Suspense>
      </ChunkBoundary>
    </AppShell>
  )
}
