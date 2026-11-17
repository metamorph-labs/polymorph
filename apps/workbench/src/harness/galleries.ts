import { GALLERIES } from '@polymorph/react-ui/galleries'

import { registerGallery } from './gallery'

/**
 * The entry module of the gallery chunk.
 *
 * Every component that ships a states fixture gets a route. Registering here rather than in
 * `main.tsx` keeps the whole vocabulary out of the boot bundle. `App` and `HomePage` load
 * `GalleryPage` and `GalleryIndex` only through `import('./galleries')`. The registration below
 * runs when this module evaluates, in the same chunk and tick. So every fixture is registered
 * before either binding resolves, and nothing is downloaded until a gallery page needs it. The
 * fixtures are a static import rather than a nested dynamic one, because a nested dynamic import
 * adds a second network request that the preloader cannot see.
 */
for (const states of GALLERIES) registerGallery(states)

export { ComponentDetailPage } from './ComponentDetailPage'
export { ComponentsPage } from './ComponentsPage'
export { GalleryIndex } from './GalleryIndex'
export { GalleryPage } from './GalleryPage'
