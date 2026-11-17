'use client'

import { useId, useRef, type ReactNode } from 'react'

import { Icon, memberAttr, useAgentMember } from '@polymorph/react'

import { Button } from '../controls/Button'
import styles from '@polymorph/recipes/ai/approval-card.module.css'

/**
 * An in-thread request to allow an agent action
 * (`design/components/approval-card.md`). The agent wants to do something the
 * person must allow first.
 *
 * ApprovalCard asks the same question as ConfirmDialog, without the modal. A
 * dialog blocks the page for one answer. An approval sits in the thread beside
 * the turn that asked, so the reader can keep reading, scroll back, or answer a
 * different one first. It is not an Alert, because an alert informs and this
 * asks, with two buttons. It is not a ToolCall. A ToolCall shows what ran, this
 * shows what wants to run, and it often contains a ToolCall.
 *
 * The card has two states. While undecided it shows the question and the two
 * actions. Once `decision` is set, the outcome replaces the actions, so the
 * thread keeps a record of what was allowed instead of two inactive buttons.
 * `pending` names the decision in flight, so the pressed button is the one
 * that shows it.
 *
 * The app owns the decision. The card reports through `onApprove` and `onDeny`
 * and renders `decision` as given. It never stores an answer itself, because an
 * approval the app did not record does not count.
 */

export type ApprovalTone = 'warning' | 'danger'
export type ApprovalDecision = 'approved' | 'denied'

export interface ApprovalCardProps {
  /** The action, phrased as a question the reader can answer, such as "Run `rm -rf dist`?" */
  title: string
  description?: string
  /** `warning` for a normal request, `danger` for an action that cannot be undone. */
  tone?: ApprovalTone
  /** The details, such as a ToolCall, a CodeBlock or a DescriptionList. */
  children?: ReactNode
  onApprove: () => void
  onDeny: () => void
  /** The recorded decision, which replaces the actions with the outcome. */
  decision?: ApprovalDecision
  /** The decision being sent, which puts that button in its loading state and disables the other. */
  pending?: ApprovalDecision
  /** The approve button's text (generic default `Allow`), which localized hosts replace. */
  approveLabel?: string
  /** The deny button's text (generic default `Deny`). */
  denyLabel?: string
  /** The outcome text for each decision (generic defaults `Allowed` / `Denied`). */
  messages?: { approved: string; denied: string }
}

export function ApprovalCard({
  title,
  description,
  tone = 'warning',
  children,
  onApprove,
  onDeny,
  decision,
  pending,
  approveLabel = 'Allow',
  denyLabel = 'Deny',
  messages = { approved: 'Allowed', denied: 'Denied' },
}: ApprovalCardProps) {
  const titleId = useId()

  // An agent reads what is asked and whether it is decided or being sent, and runs nothing: a
  // person approves what an agent asks to do, so the card withholds its Buttons and everything
  // else it holds.
  const cardRef = useRef<HTMLElement>(null)
  useAgentMember({
    member: 'ApprovalCard',
    element: () => cardRef.current,
    state: () => ({ title, decision: decision ?? '', pending: pending ?? '' }),
    actions: {},
    withholds: () => cardRef.current,
  })

  return (
    <section
      ref={cardRef}
      className={styles.card}
      aria-labelledby={titleId}
      data-tone={tone}
      data-decision={decision}
      // At rest the card has no `data-state`. It is set only while a decision is pending.
      data-state={pending === undefined ? undefined : 'loading'}
      aria-busy={pending === undefined ? undefined : true}
      {...memberAttr('ApprovalCard')}
    >
      <div className={styles.head}>
        {/* Decorative. The title and the tone wash already state the request,
            so a named glyph would repeat it. */}
        <span className={styles.glyph}>
          <Icon name={tone === 'danger' ? 'error' : 'warning'} />
        </span>
        <div className={styles.copy}>
          <p id={titleId} className={styles.title}>
            {title}
          </p>
          {description === undefined ? null : <p className={styles.description}>{description}</p>}
        </div>
      </div>

      {children === undefined ? null : <div className={styles.details}>{children}</div>}

      {decision === undefined ? (
        <div className={styles.actions}>
          {/* The approve button is the page's only solid button. It takes the
              card's tone, so approving an irreversible action looks dangerous.
              Deny is outline because declining is never dangerous. */}
          <Button
            variant="solid"
            tone={tone === 'danger' ? 'danger' : 'accent'}
            size="sm"
            label={approveLabel}
            loading={pending === 'approved'}
            disabled={pending === 'denied'}
            onClick={onApprove}
          />
          <Button
            variant="outline"
            tone="neutral"
            size="sm"
            label={denyLabel}
            loading={pending === 'denied'}
            disabled={pending === 'approved'}
            onClick={onDeny}
          />
        </div>
      ) : (
        // The outcome record. It is text, not only a colour, and the glyph matches it.
        <p className={styles.outcome}>
          <span className={styles.outcomeGlyph}>
            <Icon name={decision === 'approved' ? 'confirm' : 'denied'} size="sm" />
          </span>
          {decision === 'approved' ? messages.approved : messages.denied}
        </p>
      )}
    </section>
  )
}
