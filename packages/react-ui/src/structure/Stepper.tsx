'use client'

import { useRef } from 'react'

import { Icon, memberAttr, useAgentMember } from '@polymorph/react'
import styles from '@polymorph/recipes/structure/stepper.module.css'

/**
 * Progress through an ordered flow (`design/components/stepper.md`).
 *
 * A Stepper *reports* progress; it is not Tabs. Free navigation would mean the
 * flow is not ordered, so completed steps may be revisitable, but upcoming
 * steps never are and are never focusable.
 *
 * The number and the check carry no semantics: each step states its position
 * and state in words, in a visually hidden span.
 */

export interface Step {
  label: string
  description?: string
  /**
   * A step whose data failed. It replaces the walk state in `data-state`, while
   * `aria-current`, the connector fill and revisiting still follow `activeIndex`.
   */
  error?: boolean
}

export type StepperOrientation = 'horizontal' | 'vertical'

/** `completed` before the active index, `upcoming` after it. */
type WalkState = 'completed' | 'active' | 'upcoming'

type StepState = WalkState | 'error'

export interface StepperProps {
  /** Two to five; the spec says a flow with six steps needs a redesign. */
  steps: Step[]
  /** 0-based. Everything before it is completed, everything after it upcoming. */
  activeIndex: number
  /** Renders completed steps as buttons. Active and upcoming stay static. */
  onStepSelect?: (index: number) => void
  orientation?: StepperOrientation
  /** Omit for the generic English sentence; localized hosts pass their own. */
  spoken?: StepperSpoken
}

function stateOf(index: number, activeIndex: number): WalkState {
  if (index < activeIndex) return 'completed'
  return index === activeIndex ? 'active' : 'upcoming'
}

/** The step states that are announced; the keys a catalog translates. */
export type StepperSpokenState = StepState

/**
 * How a step's position and state are announced, localized by passing a
 * function (WCAG 3.1.2). A function, not four words, because word order is
 * grammar and belongs to the catalog. The glyph never carries this.
 */
export type StepperSpoken = (step: {
  /** 1-based. */
  position: number
  count: number
  state: StepperSpokenState
}) => string

const SPOKEN_STATE: Record<StepState, string> = {
  completed: 'completed',
  active: 'current',
  upcoming: 'not started',
  error: 'error',
}

const DEFAULT_SPOKEN: StepperSpoken = ({ position, count, state }) =>
  `step ${position} of ${count}, ${SPOKEN_STATE[state]}`

export function Stepper({
  steps,
  activeIndex,
  onStepSelect,
  orientation = 'horizontal',
  spoken = DEFAULT_SPOKEN,
}: StepperProps) {
  // The spec's `agent` fence. An agent revisits a completed step by its index, as a press on that
  // step does; the flow is the caller's, so the active step moves when it passes `activeIndex`.
  const root = useRef<HTMLOListElement>(null)
  useAgentMember({
    member: 'Stepper',
    element: () => root.current,
    state: () => ({
      'active-index': activeIndex,
      steps: steps.map((step, index) => ({
        label: step.label,
        state: step.error === true ? 'error' : stateOf(index, activeIndex),
      })),
    }),
    actions: {
      set: {
        argument: 'number',
        run: (index) => {
          if (onStepSelect === undefined) throw new Error('These steps are not revisitable.')
          if (!Number.isInteger(index) || index < 0 || index >= activeIndex) {
            throw new Error(`Step ${index} is not a completed step, so it cannot be revisited.`)
          }
          onStepSelect(index)
        },
      },
    },
  })

  return (
    <ol
      ref={root}
      className={styles.root}
      data-orientation={orientation}
      {...memberAttr('Stepper')}
    >
      {steps.map((step, index) => {
        const walk = stateOf(index, activeIndex)
        // The error flag sets how the step looks now, and the walk state sets
        // where it is. Each keeps its own responsibilities.
        const state: StepState = step.error === true ? 'error' : walk
        const interactive = walk === 'completed' && onStepSelect !== undefined

        const content = (
          <>
            {/* Hidden from screen readers, because the spoken suffix below
                already says "step 3 of 4" in words. */}
            <span className={styles.indicator} aria-hidden="true">
              {state === 'error' ? (
                // Like the completed check, in the danger family, and
                // decorative: "error" is announced below.
                <Icon name="error" size="sm" />
              ) : state === 'completed' ? (
                // Decorative: the state is in `data-state` and the spoken suffix.
                // The pop animates this wrapper, so the check pops in and the
                // circle does not.
                <span className={styles.check}>
                  <Icon name="confirm" size="sm" />
                </span>
              ) : (
                index + 1
              )}
            </span>

            <span className={styles.copy}>
              <span className={styles.label}>{step.label}</span>
              {step.description === undefined ? null : (
                <span className={styles.description}>{step.description}</span>
              )}
              <span className={styles.spoken}>
                {`, ${spoken({ position: index + 1, count: steps.length, state })}`}
              </span>
            </span>
          </>
        )

        return (
          <li
            key={step.label}
            className={styles.step}
            data-state={state}
            data-interactive={interactive ? '' : undefined}
            // Set by position, not by the error flag, so the active step stays
            // marked even when it shows an error.
            aria-current={walk === 'active' ? 'step' : undefined}
          >
            {interactive ? (
              <button
                type="button"
                className={styles.control}
                onClick={() => onStepSelect?.(index)}
              >
                {content}
              </button>
            ) : (
              <span className={styles.control}>{content}</span>
            )}

            {/* The connector after a completed step is accent. It is marked on
                the connector itself, so the fill follows `activeIndex` even for an
                errored step. */}
            {index === steps.length - 1 ? null : (
              <span
                className={styles.connector}
                data-filled={walk === 'completed' ? '' : undefined}
              />
            )}
          </li>
        )
      })}
    </ol>
  )
}
