import type { ReactNode } from 'react'

import { memberAttr } from '@polymorph/react'
import { PageHeader } from '../structure/PageHeader'
import styles from '@polymorph/recipes/archetypes/settings-page.module.css'

/**
 * The settings screen (`design/archetypes/settings-page.md`).
 *
 * It exists to declare spacing. The four `--pm-page-*` values in its
 * stylesheet set a settings page's proportions, and changing them is an edit
 * to that file that no screen needs to know about.
 *
 * There is no actions slot. Settings apply instantly (`SettingsRow`'s law),
 * and a screen that needs a save bar should be a FormPage. A save bar here
 * would let one page mix both patterns.
 */

export interface SettingsPageProps {
  title: string
  description?: string
  /** `SettingsRow.Group`s. */
  children: ReactNode
}

export function SettingsPage({ title, description, children }: SettingsPageProps) {
  return (
    <div className={styles.page} {...memberAttr('SettingsPage')}>
      <PageHeader title={title} description={description} />
      {children}
    </div>
  )
}
