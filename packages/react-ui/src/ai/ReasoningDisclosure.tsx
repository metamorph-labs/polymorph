'use client'

import * as CollapsiblePrimitive from '@radix-ui/react-collapsible'
import { useRef, useState, type ReactNode } from 'react'

import { Icon, memberAttr, useAgentMember } from '@polymorph/react'
import styles from '@polymorph/recipes/ai/reasoning-disclosure.module.css'

/**
 * A collapsible section showing the model's reasoning
 * (`design/components/reasoning-disclosure.md`). The trigger reads
 * "Thinking…" while the model reasons and "Thought for 12 seconds" once it has
 * finished, and the reasoning sits behind it. `@radix-ui/react-collapsible`
 * supplies the behaviour, as it does for Collapsible.
 *
 * ReasoningDisclosure is a Collapsible with a status. Collapsible discloses
 * static content ("Advanced options"). This discloses content that is still
 * being produced. It has a streaming state, a leading mark for the kind of
 * content, and a quieter style for what it reveals, because reasoning is the
 * working and the reply is the answer. It is not an Accordion (one
 * disclosure, no outline) and not a ToolCall (nothing ran, the model only
 * reasoned).
 *
 * The app writes the text. `label` is whatever the app says the model is
 * doing, in its language and with its own timing. The member never writes a
 * duration or a verb, because Timeline's rule for time applies to thinking
 * time too.
 */

export interface ReasoningDisclosureProps {
  /** The trigger's text in the app's words, such as "Thinking…" or "Thought for 12 seconds". */
  label: string
  /** Whether the model is still reasoning, which spins the mark and sets `aria-busy` on the root. */
  streaming?: boolean
  /** Whether it starts open, closed by default so the reasoning is available but out of the way. */
  defaultOpen?: boolean
  /** The controlled open state, paired with `onOpenChange` as in Radix. */
  open?: boolean
  onOpenChange?: (open: boolean) => void
  /** The reasoning, as a `Markdown size="sm"` or a `StreamingText size="sm"`. */
  children: ReactNode
}

export function ReasoningDisclosure({
  label,
  streaming = false,
  defaultOpen = false,
  open,
  onOpenChange,
  children,
}: ReasoningDisclosureProps) {
  // The member holds the open state, so an agent's expand reaches Radix in both forms: Radix is
  // always controlled, by the caller's `open` when given and by the member's own state otherwise.
  const [shown, setShown] = useState(defaultOpen)
  const current = open ?? shown
  function change(next: boolean) {
    setShown(next)
    onOpenChange?.(next)
  }

  const triggerRef = useRef<HTMLButtonElement>(null)
  useAgentMember({
    member: 'ReasoningDisclosure',
    element: () => triggerRef.current,
    state: () => ({ expanded: current, streaming }),
    actions: {
      expand: () => {
        if (!current) change(true)
      },
      collapse: () => {
        if (current) change(false)
      },
    },
  })

  return (
    <CollapsiblePrimitive.Root
      className={styles.root}
      open={current}
      onOpenChange={change}
      data-streaming={streaming ? '' : undefined}
      aria-busy={streaming ? true : undefined}
      {...memberAttr('ReasoningDisclosure')}
    >
      {/* Collapsible's trigger with a leading mark. No heading wraps it, for
          the same reason as in Collapsible: a disclosure inside a reply is not
          an outline entry. */}
      <CollapsiblePrimitive.Trigger ref={triggerRef} className={styles.trigger}>
        <span className={streaming ? `${styles.mark} ${styles.spinning}` : styles.mark}>
          {/* The glyph change shows "still thinking" visually. `label` says it
              in words, and the root sets `aria-busy`. The spinner composes
              Button's `button.spinner` binding. */}
          <Icon name={streaming ? 'loading' : 'reasoning'} size="sm" />
        </span>
        <span className={styles.label}>{label}</span>
        <span className={styles.chevron}>
          <Icon name="down" size="sm" />
        </span>
      </CollapsiblePrimitive.Trigger>

      {/* The same split as Collapsible, for the same reason: the padding sits
          inside the animated region so the gap collapses with the content. */}
      <CollapsiblePrimitive.Content className={styles.content}>
        <div className={styles.inner}>{children}</div>
      </CollapsiblePrimitive.Content>
    </CollapsiblePrimitive.Root>
  )
}
