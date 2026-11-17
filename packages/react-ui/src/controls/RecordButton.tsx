'use client'

import { useRef, type CSSProperties } from 'react'

import { agentPress, clockTime, memberAttr, useAgentMember } from '@polymorph/react'
import styles from '@polymorph/recipes/controls/record-button.module.css'

import { Button, type ButtonAppearance } from './Button'

/**
 * A Button preset that starts and stops recording (`design/components/record-button.md`).
 * It is for voice input in a composer, as in PromptInput's `trailing` slot.
 *
 * The first sentence is the member's line on the system card, which has a
 * budget, so it stays this short.
 *
 * The application owns the microphone. It calls `getUserMedia` and
 * `MediaRecorder` itself, as it owns an upload behind FileUpload, and passes
 * what it has: whether it is recording, for how long, and how loud the input
 * is. The member draws that and reports each press. It never asks for a device.
 *
 * The Button's name says what a press does, so it changes: `label` while not
 * recording, `stopLabel` while recording. It is not a toggle with one name and
 * `aria-pressed`, because starting and stopping are different acts, and
 * "Record, pressed" says neither that a recording runs nor what a press does
 * next. AudioPlayer's Play and Pause make the same choice.
 */

export interface RecordButtonProps {
  /** The Button's name while not recording: "Record a voice message". */
  label: string
  /** The Button's name while recording: "Stop recording". */
  stopLabel: string
  /** The application is recording. The member draws it and never sets it. */
  recording?: boolean
  /**
   * The seconds the application has recorded, drawn as m:ss beside the mark
   * while recording. It is not announced, because a time read out every second
   * interrupts everything else.
   */
  elapsed?: number
  /**
   * The input level from 0 to 1, drawn as the size of the mark's halo while
   * recording. It is never the only sign of recording: the glyph, the frame,
   * the name and the time say it too.
   */
  level?: number
  /** The locale the time's numerals are written in; the page's own when absent. */
  locale?: string
  /** A press while not recording: the application starts recording. */
  onStart?: () => void
  /** A press while recording: the application stops. */
  onStop?: () => void
  disabled?: boolean
  /** Button's sizes without `lg`. A record control sits beside a field, not as a page's main action. */
  size?: 'sm' | 'md'
}

/** At rest the control is a quiet glyph, as PromptInput's attach control is. */
const REST: ButtonAppearance = { variant: 'ghost', tone: 'neutral' }
/** While recording it gains a frame, as PromptInput's stop face has one. */
const LIVE: ButtonAppearance = { variant: 'outline', tone: 'neutral' }

/** The level as a share from 0 to 1. A value that is not a number is no level. */
const share = (level: number | undefined): number =>
  level !== undefined && Number.isFinite(level) ? Math.min(1, Math.max(0, level)) : 0

export function RecordButton({
  label,
  stopLabel,
  recording = false,
  elapsed,
  level,
  locale,
  onStart,
  onStop,
  disabled = false,
  size = 'md',
}: RecordButtonProps) {
  // An agent reads whether the application records and stops a recording; it never starts one,
  // because a recording captures the room around the person, which only the person chooses. The
  // Button is this member's own part: the member registers in its place and withholds it. A stop
  // is the Button's own click (`agentPress`), so it reaches `onStop` as a person's press does.
  const rootRef = useRef<HTMLSpanElement>(null)
  useAgentMember({
    member: 'RecordButton',
    element: () => rootRef.current?.querySelector('button'),
    state: () => ({ recording, disabled }),
    actions: {
      stop: () => {
        if (!recording) throw new Error('Nothing is recording.')
        agentPress(rootRef.current?.querySelector('button'))
      },
    },
    withholds: () => rootRef.current,
  })

  return (
    <span
      ref={rootRef}
      className={styles.root}
      data-state={recording ? 'recording' : undefined}
      data-size={size}
      {...memberAttr('RecordButton')}
    >
      {/* Before the Button, so in a toolbar aligned to its end, as PromptInput's is,
          the Button stays where the reader pressed it while the meter appears. */}
      {recording ? (
        <span className={styles.meter} data-record-button-part="meter">
          {/* Data, not a decision: the level is the application's measurement. */}
          <span
            className={styles.mark}
            aria-hidden="true"
            style={{ '--pm-record-button-level': share(level) } as CSSProperties}
          />
          {elapsed === undefined ? null : (
            <span className={styles.elapsed}>{clockTime(elapsed, locale)}</span>
          )}
        </span>
      ) : null}
      <Button
        {...(recording ? LIVE : REST)}
        size={size}
        iconOnly
        icon={recording ? 'stop' : 'record'}
        label={recording ? stopLabel : label}
        disabled={disabled}
        onClick={() => (recording ? onStop?.() : onStart?.())}
      />
    </span>
  )
}
