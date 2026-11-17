import { memberAttr } from '@polymorph/react'
import styles from '@polymorph/recipes/structure/kbd.module.css'

/**
 * A single keyboard key, drawn as a keycap (`design/components/kbd.md`).
 *
 * Display only: it never binds a shortcut. One key per element, so a combination
 * is `<Kbd>⌘</Kbd> + <Kbd>K</Kbd>` with the separator as plain text, and
 * "⌘ then K" stays distinct from "⌘ and K".
 */

export interface KbdProps {
  /** One key; `⌘` and `K` are two keys. */
  children: string
}

export function Kbd({ children }: KbdProps) {
  return (
    <kbd className={styles.kbd} {...memberAttr('Kbd')}>
      {children}
    </kbd>
  )
}
