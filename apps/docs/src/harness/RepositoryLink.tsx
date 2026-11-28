import { BrandMark } from '@polymorph/react-ui'
import styles from '@polymorph/recipes/controls/link.module.css'

import { SITE } from '../site'

/**
 * The top bar's link to the repository, drawn as GitHub's mark alone.
 *
 * Link takes words, and Button's icon-only form takes an icon role, which a provider's mark is
 * not. So this is harness code: a real `<a>` that sets Button's own attributes, as Link's button
 * form does, so Button's recipe draws the same square box as the icon-only buttons beside it.
 * The mark is decorative and the link carries the name.
 */
export function RepositoryLink() {
  return (
    <a
      className={styles.costume}
      href={SITE.repository}
      target="_blank"
      rel="noreferrer"
      aria-label="GitHub"
      data-variant="ghost"
      data-tone="neutral"
      data-size="md"
      data-icon-only=""
    >
      <span className={styles.costumeGlyph}>
        <BrandMark name="github" />
      </span>
    </a>
  )
}
