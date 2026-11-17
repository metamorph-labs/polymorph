import { Heading, Inline } from '@polymorph/react-ui'

import { findGallery, galleryRoutes } from './gallery'
import { HarnessLink } from './HarnessLink'
import { StatesGrid } from './StatesGrid'
import styles from './TokensPage.module.css'

/**
 * Renders one component's states fixture as a grid of named states. It shows every entry in
 * declaration order, so you can check each state visually under every theme × mode × density the
 * toolbar can produce.
 */
export function GalleryPage({ slug }: { slug: string }) {
  const states = findGallery(slug)

  if (!states) {
    return (
      <div className={styles.page}>
        <section className={styles.summary}>
          <h1 className={styles.title}>No gallery for “{slug}”</h1>
          <p className={styles.scope}>
            A gallery appears as soon as the component ships a states fixture.
          </p>
        </section>
      </div>
    )
  }

  return (
    <div className={styles.page}>
      <section className={styles.summary}>
        <h1 className={styles.title}>{states.component}</h1>
        <p className={styles.scope}>
          {states.entries.length} states
          {states.requiredSelectors.length > 0
            ? ` · ${states.requiredSelectors.length} selectors verified in source`
            : ' · no interactive selectors'}
        </p>
        <Inline gap={2} wrap>
          {galleryRoutes().map((gallery) => (
            <HarnessLink key={gallery.slug} to={gallery.path}>
              {gallery.component}
            </HarnessLink>
          ))}
        </Inline>
      </section>

      {states.requiredSelectors.length > 0 ? (
        <section className={styles.section}>
          <Heading>Required selectors</Heading>
          <p className={styles.sectionNote}>
            Unreachable from props — the required-selectors law source-asserts each against the
            component’s CSS.
          </p>
          <div className={styles.inlineValues}>
            {states.requiredSelectors.map((selector) => (
              <span key={selector} className={styles.tokenValue}>
                {selector}
              </span>
            ))}
          </div>
        </section>
      ) : null}

      <StatesGrid states={states} />
    </div>
  )
}
