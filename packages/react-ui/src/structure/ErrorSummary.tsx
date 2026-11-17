'use client'

import { useRef, type MouseEvent } from 'react'

import { chooseListItem, Icon, listItems, memberAttr, useAgentMember } from '@polymorph/react'
import styles from '@polymorph/recipes/structure/error-summary.module.css'

/**
 * Page-level list of form errors after a failed submit (`design/components/error-summary.md`).
 * One danger-toned region names every error (WCAG 3.3.1), and each line links to
 * its field. No substrate: static semantics and real anchors.
 *
 * It complements FormField's per-field error: the field error is read when the
 * reader reaches the field, and the summary is how they get there. It is not an
 * Alert with links. Alert states a status and can be dismissed, while this is
 * **navigation** with no dismiss; it goes when the app re-renders without
 * errors. Its body is a counted list, and it borrows Alert's danger recipe for
 * the tone, not the job.
 *
 * The app places it, usually above the form and under the PageHeader.
 */

export interface ErrorSummaryError {
  /** The message, worded exactly as the field's own error, so both places say the same thing. */
  label: string
  /**
   * The control's id. FormField's `id` prop **is** the control's id ("leaves the
   * control reachable as `#priority`"), so the link needs no extra wiring.
   */
  fieldId: string
}

export interface ErrorSummaryProps {
  /** Text from the app ("The ticket can't be raised yet"); the vocabulary writes no error copy. */
  title: string
  /** Errors in form order, the navigation order (Stat's rule); an empty list renders nothing. */
  errors: ErrorSummaryError[]
}

export function ErrorSummary({ title, errors }: ErrorSummaryProps) {
  // The spec's `agent` fence. The summary reads its errors from its own list in
  // the document, by the class of the links, as List reads its items, and
  // `choose` presses an error's link, so focus moves to the field as for a
  // person's press. It registers before the early return, so the hook runs on
  // every render; an empty summary draws no root and is not listed.
  const root = useRef<HTMLDivElement>(null)
  const list = useRef<HTMLUListElement>(null)
  useAgentMember({
    member: 'ErrorSummary',
    element: () => root.current,
    state: () => ({ items: listItems(list.current, styles.link) }),
    actions: {
      choose: { argument: 'id', run: (id) => chooseListItem(list.current, styles.link, id) },
    },
  })

  // No errors renders nothing, not an empty box.
  if (errors.length === 0) return null

  /**
   * A fragment link scrolls but does not move focus, and the point is to put
   * the reader in the field, where FormField's `aria-describedby` error is
   * announced with the input. The anchor stays real (copyable, middle-clickable,
   * no JavaScript needed). Navigation is prevented only when the control exists.
   */
  function follow(event: MouseEvent<HTMLAnchorElement>, fieldId: string) {
    const control = document.getElementById(fieldId)
    if (control === null) return
    event.preventDefault()
    control.focus()
    control.scrollIntoView({ block: 'nearest' })
  }

  return (
    // `role="alert"`: announced at once without moving focus, because a failed
    // submit interrupted the task and this system never moves the reading
    // position. A second failure updates the list in place and is re-announced.
    <div ref={root} className={styles.root} role="alert" {...memberAttr('ErrorSummary')}>
      <span className={styles.glyph}>
        {/* Decorative. The role and the title carry the announcement. */}
        <Icon name="error" size="md" />
      </span>

      <div className={styles.body}>
        {/* Styled text, not a heading element, because heading levels are page
            structure the app owns (as in Alert). */}
        <p className={styles.title}>{title}</p>

        {/* A real <ul>, so screen readers announce the count first. */}
        <ul ref={list} className={styles.list}>
          {errors.map((error) => (
            <li key={error.fieldId}>
              <a
                className={styles.link}
                href={`#${error.fieldId}`}
                onClick={(event) => follow(event, error.fieldId)}
              >
                {error.label}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
