'use client'

import * as CollapsiblePrimitive from '@radix-ui/react-collapsible'
import { useRef, useState, type ReactNode } from 'react'

import { Icon, type IconRole, memberAttr, useAgentMember } from '@polymorph/react'

import { CodeBlock } from '../structure/CodeBlock'
import { JsonTree } from '../structure/JsonTree'
import styles from '@polymorph/recipes/ai/tool-call.module.css'

/**
 * A tool invocation shown as one expandable row (`design/components/tool-call.md`).
 * It shows what the model asked a tool to do, whether the tool has done it,
 * and what came back.
 *
 * ToolCall is a Timeline event that is still in progress. It has a status,
 * the status changes, and the reader may want to see the details. It is not an
 * Alert, because it is a record of work and not a message to the reader. It
 * is not ApprovalCard. ApprovalCard asks before the work, and this shows the
 * work. When the work is waiting on an answer, the status says so (`approval`)
 * and the ApprovalCard sits beside it. `@radix-ui/react-collapsible` supplies
 * the disclosure, as it does for Collapsible.
 *
 * The app supplies the text and the vocabulary supplies the components.
 * `input` renders as JsonTree when it is a value and as CodeBlock when it is a
 * string. `output` is whatever the app composes (a CodeBlock, a JsonTree, a
 * Markdown). The status text comes from `messages` in the app's language, with
 * a matching glyph. The glyph is never the only signal, because a reader who
 * cannot see the spinner must still hear "running".
 */

export type ToolCallStatus = 'pending' | 'running' | 'done' | 'error' | 'denied' | 'approval'

export interface ToolCallMessages {
  /** The heading over the call's arguments. */
  input: string
  /** The heading over what came back. */
  output: string
  /** The text for each status, as announced to the reader. */
  status: Record<ToolCallStatus, string>
}

export interface ToolCallProps {
  /** The tool's name as the model called it, such as `read_file` or `search_web`. */
  name: string
  /** One line describing the call, such as the file read or the query run. */
  summary?: string
  status: ToolCallStatus
  /** The arguments, rendered as JsonTree for a value or as CodeBlock for a string. */
  input?: unknown
  /** The result, such as a CodeBlock, a JsonTree or a Markdown. */
  output?: ReactNode
  /** The app's text for a failure or a refusal. */
  message?: string
  /** The tool's mark, `tool` by default, or `terminal`, `network` or `document` when the app knows the kind. */
  icon?: IconRole
  /** The duration, preformatted by the app, such as "1.2s". */
  duration?: string
  defaultOpen?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
  /** All of the card's text (generic English defaults), which localized hosts replace. */
  messages?: ToolCallMessages
}

const DEFAULT_MESSAGES: ToolCallMessages = {
  input: 'Input',
  output: 'Output',
  status: {
    pending: 'Pending',
    running: 'Running',
    done: 'Done',
    error: 'Failed',
    denied: 'Denied',
    approval: 'Awaiting approval',
  },
}

/** The glyph for each status, matching the status text beside it. */
const STATUS_ICON: Record<ToolCallStatus, IconRole> = {
  pending: 'time',
  running: 'loading',
  done: 'success',
  error: 'error',
  denied: 'denied',
  approval: 'help',
}

export function ToolCall({
  name,
  summary,
  status,
  input,
  output,
  message,
  icon = 'tool',
  duration,
  defaultOpen = false,
  open,
  onOpenChange,
  messages = DEFAULT_MESSAGES,
}: ToolCallProps) {
  const hasBody = input !== undefined || output !== undefined || message !== undefined

  // The member holds the open state, so an agent's expand reaches Radix in both forms: Radix is
  // always controlled, by the caller's `open` when given and by the member's own state otherwise.
  const [shown, setShown] = useState(defaultOpen)
  const current = open ?? shown
  function change(next: boolean) {
    setShown(next)
    onOpenChange?.(next)
  }

  // A call with nothing inside refuses `expand`, as its trigger is disabled then.
  const triggerRef = useRef<HTMLButtonElement>(null)
  useAgentMember({
    member: 'ToolCall',
    element: () => triggerRef.current,
    state: () => ({ status, expanded: current }),
    actions: {
      expand: () => {
        if (!hasBody) throw new Error('The call has nothing to show.')
        if (!current) change(true)
      },
      collapse: () => {
        if (current) change(false)
      },
    },
  })

  return (
    <CollapsiblePrimitive.Root
      className={styles.card}
      open={current}
      onOpenChange={change}
      data-status={status}
      aria-busy={status === 'running' ? true : undefined}
      {...memberAttr('ToolCall')}
    >
      <CollapsiblePrimitive.Trigger ref={triggerRef} className={styles.trigger} disabled={!hasBody}>
        <span className={styles.mark}>
          <Icon name={icon} size="sm" />
        </span>
        <span className={styles.name}>{name}</span>
        {summary === undefined ? null : <span className={styles.summary}>{summary}</span>}
        <span className={styles.trailing}>
          {duration === undefined ? null : <span className={styles.duration}>{duration}</span>}
          {/* The status appears twice: the glyph for sighted readers and the
              text for screen readers. The text is visually hidden inside the
              trigger, so the button's name is "read_file, Running" and not
              only the tool name. */}
          <span
            className={status === 'running' ? `${styles.status} ${styles.spinning}` : styles.status}
          >
            <Icon name={STATUS_ICON[status]} size="sm" />
          </span>
          <span className={styles.reader}>{messages.status[status]}</span>
          {hasBody ? (
            <span className={styles.chevron}>
              <Icon name="down" size="sm" />
            </span>
          ) : null}
        </span>
      </CollapsiblePrimitive.Trigger>

      {hasBody ? (
        <CollapsiblePrimitive.Content className={styles.content}>
          <div className={styles.inner}>
            {input === undefined ? null : (
              <div className={styles.section}>
                <span className={styles.heading}>{messages.input}</span>
                {typeof input === 'string' ? (
                  <CodeBlock label={messages.input}>{input}</CodeBlock>
                ) : (
                  <JsonTree data={input} label={messages.input} defaultDepth={1} />
                )}
              </div>
            )}
            {output === undefined ? null : (
              <div className={styles.section}>
                <span className={styles.heading}>{messages.output}</span>
                {output}
              </div>
            )}
            {message === undefined ? null : <p className={styles.message}>{message}</p>}
          </div>
        </CollapsiblePrimitive.Content>
      ) : null}
    </CollapsiblePrimitive.Root>
  )
}
