import type { ReactNode } from 'react'

import styles from '@polymorph/recipes/exceptions/third-party.module.css'

/**
 * Rung 4 of the exception ladder (`docs/rules.md`): the declared boundary
 * around another library's component, such as a map, a rich-text editor or a
 * data grid.
 *
 * `library` names the package the component comes from and `reason` says why
 * the vocabulary was not enough. Both are required. The inventory prints
 * them, so an application's hosted components are a list anyone can read.
 *
 * It lifts less than `<Bespoke>`. Inside it a `style` or a class may be
 * written on a plain element and on the library's component, to size it and
 * to point the library's own custom properties at `--pm-*` tokens. In a file
 * that declares it, the named library may be imported where a rule bans its
 * kind, and so may the library's own stylesheet. A raw control, an inline
 * `<svg>` and a raw colour stay red: the controls around the component are
 * members, and its colours are the theme's.
 *
 * The theme reaches the component in two ways. CSS inherits: the boundary
 * draws nothing, so every `--pm-*` token cascades in. A component that takes
 * its colours and sizes through a JavaScript API reads them from the
 * foundation's `useThemeValues` hook (`@polymorph/react`), which gives a new
 * reading when the pairing, the mode or the density changes.
 *
 * Accessibility is not suspended. The hosted component names itself and is
 * reachable by keyboard, or the screen offers the same task another way.
 */

export interface ThirdPartyProps {
  /** The package the hosted component comes from, as it is imported: `leaflet`, `@tiptap/react`. */
  library: string
  /** Why the vocabulary was not enough, for a reviewer reading the inventory. */
  reason: string
  children?: ReactNode
}

export function ThirdParty({ library, reason, children }: ThirdPartyProps) {
  return (
    <div className={styles.thirdParty} data-third-party={library} data-reason={reason}>
      {children}
    </div>
  )
}
