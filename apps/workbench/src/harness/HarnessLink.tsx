import type { ReactNode } from 'react'

import { navigate } from './router'
import styles from './Toolbar.module.css'

/**
 * A real anchor that also routes without a reload. It keeps anchor semantics, so middle-click
 * and copy-link work.
 *
 * It is harness chrome, styled by the toolbar's stylesheet so harness links match the nav.
 * Product screens use the vocabulary's `Link`, which renders the same real anchor.
 */
export function HarnessLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <a
      className={styles.navLink}
      href={to}
      onClick={(event) => {
        // Leave modified clicks to the browser: new tab, new window, download.
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
        event.preventDefault()
        navigate(to)
      }}
    >
      {children}
    </a>
  )
}
