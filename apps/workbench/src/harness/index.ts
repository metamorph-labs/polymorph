/**
 * The harness barrel. It does not export the pages.
 *
 * `GalleryPage`, `GalleryIndex`, `HomePage` and `TokensPage` are route-split. `App` and the home
 * page's index slot load them by dynamic import. Re-exporting them here would bundle the pages and
 * the members they use into every static importer of this barrel, including Relay, which imports
 * `navigate` and `useThemeAttributes` from it. The barrel exports only the toolbar, the router,
 * the attribute subscription and the gallery registry. The registry's fixtures, the heavy part,
 * are behind `galleries.ts`.
 */
export {
  componentSlugFromPath,
  findGallery,
  galleryRoutes,
  gallerySlugFromPath,
  registerGallery,
} from './gallery'
export type { GalleryRoute } from './gallery'
export { HarnessLink } from './HarnessLink'
export { navigate, useRoute } from './router'
export { Toolbar } from './Toolbar'
export { useThemeAttributes } from './useThemeAttributes'
