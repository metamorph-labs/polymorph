'use client'

import { cloneElement, useId, type ReactElement, type ReactNode } from 'react'

import { Card } from './Card'
import { memberAttr, useSupplied } from '@polymorph/react'
import styles from '@polymorph/recipes/structure/settings-row.module.css'

/**
 * SettingsRow's row and its group. The row needs a browser's React: it makes
 * the ids that tie the control to its label. `SettingsRow.tsx` is the member:
 * it attaches the group to the row in a module a server can evaluate.
 */

export interface SettingsRowProps {
  label: string
  description?: string
  /** Exactly one governed control: Switch, Select, Checkbox or Button. */
  control: ReactElement<{ 'aria-labelledby'?: string; 'aria-describedby'?: string }>
}

export function Row({ label, description, control }: SettingsRowProps) {
  const id = useId()
  // A server component may have passed the control, and it is cloned below
  // (`useSupplied`).
  const supplied = useSupplied(control)
  const labelId = `${id}-label`
  const descriptionId = `${id}-description`

  return (
    <div className={styles.row} {...memberAttr('SettingsRow')}>
      <div className={styles.text}>
        {/* A span, not a `<label>`: a Switch or Select is not always
            labelable, so every row uses `aria-labelledby`, one mechanism. */}
        <span className={styles.label} id={labelId}>
          {label}
        </span>
        {description === undefined ? null : (
          <span className={styles.description} id={descriptionId}>
            {description}
          </span>
        )}
      </div>

      <div className={styles.control}>
        {cloneElement(supplied, {
          'aria-labelledby': labelId,
          ...(description === undefined ? {} : { 'aria-describedby': descriptionId }),
        })}
      </div>
    </div>
  )
}

export interface SettingsGroupProps {
  /** The section heading. */
  title: string
  children: ReactNode
}

export function Group({ title, children }: SettingsGroupProps) {
  return (
    <section className={styles.group}>
      {/*
       * A real heading at `h2`. The archetype sets the level for its own
       * outline, and `h2` is the level a settings page uses. A styled span
       * would leave the page with one heading and unlabelled boxes.
       */}
      <h2 className={styles.groupTitle}>{title}</h2>
      <Card>
        <div className={styles.rows}>{children}</div>
      </Card>
    </section>
  )
}
