'use client'

import { useRef, type FormEvent, type ReactNode } from 'react'

import { memberAttr } from '@polymorph/react'
import { Inline } from '../layout/Inline'
import { PageHeader } from '../structure/PageHeader'
import styles from '@polymorph/recipes/archetypes/form-page.module.css'

/**
 * The create/edit screen (`design/archetypes/form-page.md`).
 *
 * It is narrower than every other page archetype, because a form is a reading
 * column. Fields wider than the reading measure are hard to scan, and the eye
 * loses the left edge when returning from the right.
 *
 * `onSubmit` wraps the children in a real `<form>`, so Enter submits from any
 * field. The actions row is inside the form, so the submit button is the
 * form's own submit, not a separate click handler.
 */

export interface FormPageProps {
  title: string
  description?: string
  /** Cards of FormFields. */
  children: ReactNode
  /** The submit row, with exactly one `solid` Button and quieter variants for the rest. */
  actions: ReactNode
  /**
   * One action at the start of the actions row, apart from `actions`, which stay at its end:
   * a destructive tertiary action such as "Delete…", routed through ConfirmDialog.
   */
  leadingAction?: ReactNode
  onSubmit?: () => void
}

export function FormPage({
  title,
  description,
  children,
  actions,
  leadingAction,
  onSubmit,
}: FormPageProps) {
  const form = useRef<HTMLFormElement>(null)

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    /*
     * The archetype's own behaviour, defined in the spec so every form has it:
     * on a failed submit, focus the first invalid field. Otherwise the page
     * reports errors and the reader must find the first one, which on a long
     * form means scrolling to look for red.
     *
     * It reads from the DOM, not from the caller, because FormField already
     * sets `aria-invalid`. Asking the caller for the same fact would create a
     * second copy that could disagree.
     */
    const invalid = form.current?.querySelector<HTMLElement>('[aria-invalid="true"]')
    if (invalid) {
      invalid.focus()
      return
    }

    onSubmit?.()
  }

  /* Wrapping matters most for this row. It is `justify="end"`, so actions too
     wide for the column overflow to the left, past the reading edge, where they
     cannot be scrolled into view. Wrapped, the actions take a second line and
     stay aligned to the end. The row gap is the `gap` it already declares. */
  const row = (
    <Inline gap={3} justify="end" wrap>
      {actions}
    </Inline>
  )

  const body = (
    <>
      {children}
      {/* The submit row is anchored, not floating. A rule above it ties it to
          the card column it submits. The archetype decides this once for every
          form. */}
      <div className={styles.actions}>
        {/* A leading action is a group of its own at the row's start, and the
            actions stay at its end on whichever line they land. */}
        {leadingAction === undefined || leadingAction === null ? (
          row
        ) : (
          <div className={styles.split}>
            {leadingAction}
            <div className={styles.trailing}>{row}</div>
          </div>
        )}
      </div>
    </>
  )

  return (
    <div className={styles.page} {...memberAttr('FormPage')}>
      <PageHeader title={title} description={description} />

      {onSubmit === undefined ? (
        body
      ) : (
        <form className={styles.form} ref={form} onSubmit={submit} noValidate>
          {body}
        </form>
      )}
    </div>
  )
}
