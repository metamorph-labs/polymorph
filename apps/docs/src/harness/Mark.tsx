import styles from './mark.module.css'
import { MARK_PATH } from './mark-path'

/**
 * The site's mark: a flower of five folded petals, drawn in line. One sheet folds into many
 * forms, as one vocabulary takes many looks.
 *
 * The path is the brand's drawing, whose lines are too thin to read at the size a top bar draws
 * it. A stroke in the fill's colour thickens every line by the same amount, and the view box is
 * the drawing's bounds plus half that stroke on each side.
 *
 * It is decorative. The name beside it is the link's text, so the drawing is
 * hidden from assistive technology.
 */
export function Mark() {
  return (
    <svg
      className={styles.mark}
      viewBox="133.25 -8 580.75 536"
      aria-hidden="true"
      focusable="false"
    >
      <path d={MARK_PATH} fillRule="evenodd" strokeWidth="16" strokeLinejoin="round" />
    </svg>
  )
}
