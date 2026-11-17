import { DATA_ATTRS, FONT_ROLES } from '@polymorph/engine'

import { DRAFT_SYSTEM, draftFontFamilies } from './draft-boot'
import { DEFAULT_SYSTEM, SYSTEMS } from './themes'

/**
 * Per-system webfont loading.
 *
 * Apps load fonts and the library never bundles them. The font packages are this app's
 * dependencies and this file is application code. This module decides when to load. A family's
 * `@font-face` rules load when a system that names it becomes active. The alternative, declaring
 * every registered system's families in the entry stylesheet, costs about 1.5 MB of woff2 for
 * systems the session may never use.
 *
 * Loaders are keyed by family, not by system, because systems share families (four of them name
 * `JetBrains Mono Variable`) and the system files declare families. A system's families are read
 * from the same parsed `SYSTEMS` the theme registry uses, and the loader map is generated from
 * the same catalogue. So a new system needs no edit here, and a new face needs only its packages
 * (`pnpm add` in each app).
 *
 * Loading is triggered by the `data-system` attribute rather than by the pickers, because every
 * system change sets that attribute. The toolbar, the studio, Relay's settings screen and the
 * proof harness all set it. The proof harness sets attributes directly on purpose
 * (`proof/shoot.mjs`). fontsource ships `font-display: swap` and every slot has a fallback stack,
 * so text stays visible while a family loads.
 */
/*
 * `pnpm registry` generates the map from the catalogue (fonts-gen.ts). It is re-exported here
 * for the coverage law in `fonts.test.ts`. Because the map is generated, a new system that names
 * an uninstalled family fails generation with the `pnpm add` command to run. Otherwise it would
 * parse and then render fallback fonts everywhere without any error.
 */
export { FAMILY_LOADERS } from './fonts.gen'
import { FAMILY_LOADERS } from './fonts.gen'

const started = new Set<string>()

/**
 * Starts loading the named families. Exported for the one caller that is not a system: the
 * studio previews a draft, whose slots may name any family in the catalogue before any system
 * declares that combination.
 *
 * A family that fails to load is handled by `font-display: swap` and the fallback stacks. The
 * page stays legible and the failed request is still in the network log, so the rejection is not
 * rethrown. An unmapped family is treated the same way.
 */
export function loadFontFamilies(families: readonly string[]): void {
  for (const family of families) {
    if (started.has(family)) continue
    started.add(family)
    FAMILY_LOADERS[family]?.().catch(() => {})
  }
}

function loadSystemFonts(name: string): void {
  // The draft is not in `SYSTEMS`, so its families come from the runtime slot. Otherwise a reload
  // into an ambient draft would render fallback faces without any error.
  if (name === DRAFT_SYSTEM) {
    const families = draftFontFamilies()
    if (families !== null) loadFontFamilies(families)
    return
  }

  const system = SYSTEMS.find((candidate) => candidate.name === name)
  if (!system) return
  loadFontFamilies(FONT_ROLES.map((role) => system.fonts[role].family))
}

/**
 * Called once from `main.tsx`, after `installThemes()`. Hydration has already written
 * `data-system`, so the first load is for the system on screen, not the catalogue default that a
 * stored selection overrides.
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
