import { gallerySlug, type ComponentStates } from '@polymorph/react-ui'

/**
 * The gallery registry.
 *
 * A states fixture is all a component needs for a gallery. Once registered, `/gallery/<slug>`
 * renders every state it declares under the theme, mode, density and temperament the toolbar has
 * selected. There is no per-component page for an author to write.
 */

const registry = new Map<string, ComponentStates>()

export function registerGallery(states: ComponentStates): void {
  registry.set(gallerySlug(states.component), states)
}

export interface GalleryRoute {
  slug: string
  path: string
  component: string
  entryCount: number
}

export function galleryRoutes(): GalleryRoute[] {
  return [...registry.entries()].map(([slug, states]) => ({
    slug,
    path: `/gallery/${slug}`,
    component: states.component,
    entryCount: states.entries.length,
  }))
}

export function findGallery(slug: string): ComponentStates | undefined {
  return registry.get(slug)
}

/** `/gallery/form-field` -> `form-field`; anything else -> `undefined`. */
export function gallerySlugFromPath(pathname: string): string | undefined {
  const match = /^\/gallery\/([a-z0-9-]+)\/?$/.exec(pathname)
  return match?.[1]
}

/** `/components/form-field` -> `form-field`; `/components` itself -> `undefined`. */
export function componentSlugFromPath(pathname: string): string | undefined {
  const match = /^\/components\/([a-z0-9-]+)\/?$/.exec(pathname)
  return match?.[1]
}
