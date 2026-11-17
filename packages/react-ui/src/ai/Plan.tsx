import { Icon, type IconRole, memberAttr } from '@polymorph/react'

import styles from '@polymorph/recipes/ai/plan.module.css'

/**
 * An agent run's steps, each with its status (`design/components/plan.md`).
 * It shows what the agent intends to do and how far it has got, and the app
 * passes the whole list again on every change.
 *
 * Plan is not Stepper, which is the reader's own flow, and not Timeline, whose
 * events are over. It is not ToolCall: a ToolCall is one invocation, and a
 * step is a line of intent that may make several calls or none. Nothing in it
 * is pressed or opened, and nothing calls a hook, so it carries no client
 * directive.
 *
 * The status is never the glyph alone. Each step's status words sit visually
 * hidden after its title, and one hidden status line names the step at the
 * front of the run, so a reader hears the run move once for each step and not
 * on every change the app makes.
 */

export type PlanStatus = 'pending' | 'running' | 'done' | 'error' | 'skipped'

export interface PlanStep {
  /** Unique in the plan. The step keeps its row while its status changes. */
  id: string
  /** What the step does, in the product's words. */
  title: string
  /** One line under the title: what the step found, or why it failed. */
  description?: string
  status: PlanStatus
}

/**
 * The words the member writes itself, localized by passing them (WCAG 3.1.2).
 * Pass every status, so one Plan never mixes two languages.
 */
export interface PlanMessages {
  /** The words for each status, read after a step's title. */
  status: Record<PlanStatus, string>
}

export interface PlanProps {
  /** The list's accessible name, such as "Plan for this run" rather than "Plan". */
  label: string
  /** The steps in reading order. Plan never sorts them, and an empty list renders nothing. */
  steps: PlanStep[]
  /** Omit for the generic English defaults; localized hosts pass their own. */
  messages?: PlanMessages
}

const DEFAULT_MESSAGES: PlanMessages = {
  status: {
    pending: 'Pending',
    running: 'Running',
    done: 'Done',
    error: 'Failed',
    skipped: 'Skipped',
  },
}

/** The glyph for each status, ToolCall's where the two share a status. */
const STATUS_ICON: Record<PlanStatus, IconRole> = {
  pending: 'time',
  running: 'loading',
  done: 'success',
  error: 'error',
  skipped: 'remove',
}

const isRunning = (step: PlanStep) => step.status === 'running'

/**
 * The step at the front of the run: the first running step; with none
 * running, the first failed one; with neither, the last one done or skipped.
 * None while every step is pending.
 */
function frontOf(steps: readonly PlanStep[]): PlanStep | undefined {
  return (
    steps.find(isRunning) ??
    steps.find((step) => step.status === 'error') ??
    [...steps].reverse().find((step) => step.status === 'done' || step.status === 'skipped')
  )
}

export function Plan({ label, steps, messages = DEFAULT_MESSAGES }: PlanProps) {
  // The empty case belongs to the page, as in Timeline: a plan not yet made is
  // the app's Skeleton or text, not an empty list.
  if (steps.length === 0) return null

  // Only the first running step is current, because a list has one current item.
  const current = steps.find(isRunning)
  const front = frontOf(steps)

  return (
    <div className={styles.root} {...memberAttr('Plan')}>
      {/* The role is written out, because a list without markers loses it in WebKit. */}
      <ol className={styles.list} role="list" aria-label={label}>
        {steps.map((step) => (
          <li
            key={step.id}
            className={styles.step}
            data-status={step.status}
            aria-current={step === current ? 'step' : undefined}
            aria-busy={isRunning(step) ? true : undefined}
          >
            {/* Decorative: the status words below say the status. */}
            <span className={styles.mark} aria-hidden="true">
              {/* Keyed by status, so the glyph mounts again and fades in when it changes. */}
              <span
                key={step.status}
                className={isRunning(step) ? `${styles.glyph} ${styles.spinning}` : styles.glyph}
              >
                <Icon name={STATUS_ICON[step.status]} size="sm" />
              </span>
            </span>
            <span className={styles.copy}>
              <span className={styles.title}>{step.title}</span>
              <span className={styles.reader}>{`, ${messages.status[step.status]}`}</span>
              {step.description === undefined ? null : (
                <span className={styles.description}>{step.description}</span>
              )}
            </span>
          </li>
        ))}
      </ol>
      {/* The status line. It holds no description, so a description that
          changes while a step runs is never announced. */}
      <p className={styles.line} role="status">
        {front === undefined ? '' : `${front.title}, ${messages.status[front.status]}`}
      </p>
    </div>
  )
}
