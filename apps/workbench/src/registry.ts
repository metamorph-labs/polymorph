import { gallerySlug } from '@polymorph/engine'
import type { Registry, RegistryComponent } from '@polymorph/registry'

import registryJson from '../../../registry/registry.json'

/**
 * The registry, as the workbench reads it. `predev`/`prebuild` generate it from this tree, the
 * same way the docs app does, and it is never committed. The JSON import is structurally typed.
 * The cast narrows it to the `Registry` interface, which the generator validates against its
 * schema before writing.
 *
 * The workbench and the docs read the same registry but serve different purposes. The docs are
 * the published catalogue: specs, install and composition. The workbench renders everything
 * under the pairing the toolbar (or an ambient draft) applies, so browsing here is a preview, not
 * a reference.
 *
 * Slugs come from `gallerySlug` (kebab-case), so `/components/<slug>` and `/gallery/<slug>` use
 * the same name for every member.
 */
export const REGISTRY = registryJson as unknown as Registry

export function componentBySlug(slug: string): RegistryComponent | undefined {
  return REGISTRY.components.find((component) => gallerySlug(component.name) === slug)
}

/** Tier order for the browse filter, from concrete to meta. */
export const TIERS = [
  'controls',
  'overlays',
  'structure',
  'layout',
  'charts',
  'ai',
  'archetypes',
  'icon',
] as const
