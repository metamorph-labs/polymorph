'use client'

import { useEffect, useId, useRef, useState } from 'react'

import {
  clockTime,
  Icon,
  memberAttr,
  pauseOtherPlayers,
  spokenDuration,
  useAgentMember,
} from '@polymorph/react'
import styles from '@polymorph/recipes/structure/audio-player.module.css'

import { Button } from '../controls/Button'
import { Slider } from '../controls/Slider'

/**
 * Plays one recording (`design/components/audio-player.md`). It is for a
 * voice message in a conversation and a recorded call in a ticket.
 *
 * The first sentence is the member's line on the system card, which has a
 * budget, so it stays this short.
 *
 * It is a play Button, a Slider that moves through the recording and the
 * elapsed and total time, over a native `<audio>` element that draws nothing.
 * The browser's own `<audio controls>` is drawn by the browser and takes no
 * token. It has no volume, speed, download or waveform. It does not record:
 * RecordButton starts and stops a recording the application makes.
 *
 * Starting one player pauses every other AudioPlayer on the page, because two
 * recordings that play over each other cannot be followed.
 */

/**
 * The words the member writes itself, localized by passing them (WCAG 3.1.2).
 * Pass every key, so one player never mixes two languages. The lengths are
 * `Intl`'s words in `locale` already.
 */
export interface AudioPlayerMessages {
  /** The Button's name while the recording is not playing: "Play". */
  play: string
  /** The Button's name while it plays: "Pause". */
  pause: string
  /** The scrubber's name: "Playback position". */
  scrubber: string
  /** The scrubber's spoken value, from the elapsed and the total length: "5 seconds of 18 seconds". */
  position: (elapsed: string, total: string) => string
  /** Said in place of the scrubber when the file cannot be loaded. */
  failed: string
}

const DEFAULT_MESSAGES: AudioPlayerMessages = {
  play: 'Play',
  pause: 'Pause',
  scrubber: 'Playback position',
  position: (elapsed, total) => `${elapsed} of ${total}`,
  failed: 'The recording could not be loaded',
}

export interface AudioPlayerProps {
  /** The recording's URL. An empty string is the failed state: there is nothing to load. */
  src: string
  /** Names the player, as a group: "Voice message from Ada". */
  label: string
  /**
   * The recording's length in seconds, shown before the file gives its own. A
   * file's finite length replaces it. A file that gives none, as a recording a
   * browser's `MediaRecorder` wrote, keeps it.
   */
  duration?: number
  /** The locale the clock and the spoken lengths are written in; the page's own when absent. */
  locale?: string
  /** Omit for the generic English defaults; localized hosts pass their own. */
  messages?: AudioPlayerMessages
  /** The recording started playing, from a press on its Button. */
  onPlay?: () => void
  /** The recording played to its end. */
  onEnded?: () => void
}

/** A length the file or the app gave, or `null` for none: not finite, or not above zero. */
const lengthOf = (seconds: number | undefined): number | null =>
  seconds !== undefined && Number.isFinite(seconds) && seconds > 0 ? seconds : null

export function AudioPlayer({
  src,
  label,
  duration,
  locale,
  messages = DEFAULT_MESSAGES,
  onPlay,
  onEnded,
}: AudioPlayerProps) {
  const audio = useRef<HTMLAudioElement>(null)
  const failureId = useId()

  const [playing, setPlaying] = useState(false)
  const [ended, setEnded] = useState(false)
  // Whole seconds, as the clock and the scrubber show them.
  const [elapsed, setElapsed] = useState(0)
  // The file's own length, once it gives one.
  const [length, setLength] = useState<number | null>(null)
  // The `src` that failed, so a new `src` starts unfailed.
  const [failed, setFailed] = useState<string | null>(null)
  // The second the reader is dragging the scrubber to, until they let go.
  const [scrub, setScrub] = useState<number | null>(null)

  // A new recording starts from nothing. State is adjusted while rendering, not
  // in an effect, so no frame is drawn from the last recording's position.
  const [asked, setAsked] = useState(src)
  if (asked !== src) {
    setAsked(src)
    setPlaying(false)
    setEnded(false)
    setElapsed(0)
    setLength(null)
    setFailed(null)
    setScrub(null)
  }

  const known = length ?? lengthOf(duration)
  // Whole seconds. A recording under a second has nothing to move through.
  const total = known === null ? 0 : Math.floor(known)
  const failing = src === '' || failed === src
  const seekable = !failing && total >= 1
  const position = ended ? total : Math.min(scrub ?? elapsed, total)
  const state = failing ? 'failed' : playing ? 'playing' : ended ? 'ended' : undefined

  const learn = (element: HTMLAudioElement) => setLength(lengthOf(element.duration))

  // The file can settle before React listens: its metadata, or its failure,
  // arrived while the server's markup waited for its script. The element says
  // which, so it is read once it is in the document.
  useEffect(() => {
    const element = audio.current
    if (element === null) return
    if (element.error !== null) setFailed(src)
    else if (element.readyState >= HTMLMediaElement.HAVE_METADATA) {
      setLength(lengthOf(element.duration))
    }
  }, [src])

  function toggle() {
    const element = audio.current
    if (element === null) return
    if (!element.paused) {
      element.pause()
      return
    }
    // A press on a failed player asks for the file again, because a failure is
    // about one request.
    if (failing) {
      setFailed(null)
      element.load()
    }
    // The element's events say what happened. A refused or interrupted start
    // leaves it paused, which is what the player then shows.
    element.play().catch(() => {})
  }

  function seek(second: number) {
    setScrub(null)
    setElapsed(second)
    setEnded(false)
    if (audio.current !== null) audio.current.currentTime = second
  }

  // The spec's `agent` fence. A recording plays from a person's press, so an agent reads the
  // player and runs nothing, and the Button and the scrubber, the player's own parts, are withheld.
  const root = useRef<HTMLDivElement>(null)
  useAgentMember({
    member: 'AudioPlayer',
    element: () => root.current,
    state: () => ({ playing, failed: failing, position, duration: total }),
    actions: {},
    withholds: () => root.current,
  })

  const spoken = (second: number) =>
    known === null
      ? spokenDuration(second, locale)
      : messages.position(spokenDuration(second, locale), spokenDuration(total, locale))

  return (
    <div
      ref={root}
      role="group"
      aria-label={label}
      className={styles.root}
      data-state={state}
      {...memberAttr('AudioPlayer')}
    >
      {src === '' ? null : (
        // No `controls`: the browser draws nothing, and the parts below are the player.
        <audio
          ref={audio}
          preload="metadata"
          src={src}
          onLoadedMetadata={(event) => learn(event.currentTarget)}
          onDurationChange={(event) => learn(event.currentTarget)}
          onTimeUpdate={(event) => setElapsed(Math.floor(event.currentTarget.currentTime))}
          onPlay={(event) => {
            setPlaying(true)
            setEnded(false)
            pauseOtherPlayers(event.currentTarget)
            onPlay?.()
          }}
          onPause={() => setPlaying(false)}
          onEnded={() => {
            setPlaying(false)
            setEnded(true)
            onEnded?.()
          }}
          onError={() => {
            setFailed(src)
            setPlaying(false)
          }}
        />
      )}

      {/* The name says what a press does, so it changes with the state: a press
          on "Pause" pauses. It is not a toggle with one name, because the two
          presses are different acts. */}
      <Button
        variant="soft"
        tone="accent"
        iconOnly
        icon={playing ? 'pause' : 'run'}
        label={playing ? messages.pause : messages.play}
        disabled={src === ''}
        aria-describedby={failing ? failureId : undefined}
        onClick={toggle}
      />

      {failing ? (
        <span id={failureId} className={styles.failure} data-audio-player-part="failure">
          <span className={styles.failureGlyph} aria-hidden="true">
            <Icon name="error" size="sm" />
          </span>
          <span>{messages.failed}</span>
        </span>
      ) : (
        <>
          <span className={styles.scrubber}>
            <Slider
              aria-label={messages.scrubber}
              min={0}
              max={seekable ? total : 1}
              step={1}
              value={seekable ? position : 0}
              disabled={!seekable}
              formatValue={spoken}
              onChange={setScrub}
              onCommit={seek}
            />
          </span>
          {/* Hidden, because the scrubber says the same. Not live, because a
              clock read out every second interrupts every other announcement. */}
          <span className={styles.time} data-audio-player-part="time" aria-hidden="true">
            <span>{clockTime(position, locale)}</span>
            {known === null ? null : (
              <>
                <span className={styles.divider}>/</span>
                <span>{clockTime(total, locale)}</span>
              </>
            )}
          </span>
        </>
      )}
    </div>
  )
}
