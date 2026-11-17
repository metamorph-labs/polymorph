import { DATA_ATTRS, FONT_ROLES } from '@polymorph/theme'

import { DEFAULT_SYSTEM, SYSTEMS } from './themes'

/**
 * Per-system webfont loading. This is the workbench's module with the docs
 * site's imports. It is duplicated rather than shared for the same reason as
 * `themes.ts`: apps load fonts and the library never bundles them, so the
 * mechanism lives in each app that has one.
 *
 * Loaders are keyed by **family**, because systems share families and the
 * system files declare them. The families a system needs are read from the
 * parsed `SYSTEMS`, and the loader map is generated from the same catalogue. A
 * new system therefore needs no edit here. A new *face* needs only its packages
 * (`pnpm add` in each app). The trigger is the `data-system` attribute rather
 * than the top bar's select, because every system change goes through that
 * attribute. fontsource ships `font-display: swap` and every slot has a fallback
 * stack, so text stays visible while a family loads.
 */
/*
 * `pnpm registry` generates the map from the catalogue (fonts-gen.ts). It is
 * re-exported here for the coverage law in `fonts.test.ts`. Because the map is
 * generated, a new system that names an uninstalled family fails generation
 * with the `pnpm add` command to run. Otherwise it would parse and silently
 * render the fallback everywhere.
 */
export { FAMILY_LOADERS } from './fonts.gen'
import { FAMILY_LOADERS } from './fonts.gen'

const started = new Set<string>()

/**
 * A rejected load is not rethrown. `font-display: swap` and the fallback stacks
 * cover a family that fails to load: the page stays legible, and the failed
 * request still shows in the network log.
 */
function loadFontFamilies(families: readonly string[]): void {
  for (const family of families) {
    if (started.has(family)) continue
    started.add(family)
    FAMILY_LOADERS[family]?.().catch(() => {})
  }
}

function loadSystemFonts(name: string): void {
  const system = SYSTEMS.find((candidate) => candidate.name === name)
  if (!system) return
  loadFontFamilies(FONT_ROLES.map((role) => system.fonts[role].family))
}

/**
 * Called once from `main.tsx`, after `installThemes()`. Hydration has already
 * written `data-system` by then, so the first load is for the system on screen.
 */
export function installFonts(): void {
  loadSystemFonts(document.documentElement.getAttribute(DATA_ATTRS.system) ?? DEFAULT_SYSTEM)

  const observer = new MutationObserver(() => {
    const system = document.documentElement.getAttribute(DATA_ATTRS.system)
    if (system !== null) loadSystemFonts(system)
  })
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: [DATA_ATTRS.system],
  })
}
