import styles from './mark.module.css'

/**
 * The site's mark: one square with four different corners, sharp, slight, soft
 * and round. The corner radius is the first thing a system's geometry axis
 * changes, so the mark shows four systems' answers on one shape.
 *
 * It is decorative. The name beside it is the link's text, so the drawing is
 * hidden from assistive technology.
 */
export function Mark() {
  return (
    <svg className={styles.mark} viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path d="M10 0H20V14A6 6 0 0 1 14 20H3A3 3 0 0 1 0 17V10A10 10 0 0 1 10 0Z" />
    </svg>
  )
}
