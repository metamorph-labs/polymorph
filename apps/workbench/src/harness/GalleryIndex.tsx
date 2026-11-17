import { Grid, Icon, Inline } from '@polymorph/react-ui'

import { galleryRoutes } from './gallery'
import { HarnessLink } from './HarnessLink'

/**
 * The gallery index on the overview page. It is a separate module because it reads the
 * registered fixtures. It loads through the gallery chunk's entry (`galleries.ts`), which
 * registers the fixtures before this renders. The home page's text renders without waiting for
 * it.
 */
export function GalleryIndex() {
  return (
    <Grid columns={4} gap={4}>
      {galleryRoutes().map((gallery) => (
        <HarnessLink key={gallery.slug} to={gallery.path}>
          <Inline gap={2}>
            <Icon name="document" />
            {`${gallery.component} · ${gallery.entryCount}`}
          </Inline>
        </HarnessLink>
      ))}
    </Grid>
  )
}
