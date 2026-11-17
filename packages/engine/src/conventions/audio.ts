import { timeDigits, timeWords } from './time-text'

/**
 * A recording's times and the rule that one recording plays at a time
 * (`design/components/audio-player.md`). AudioPlayer writes its clock and its
 * spoken position with these in every framework, and RecordButton writes its
 * clock with the same function, so a time reads the same wherever it is drawn.
 * The text is `time-text.ts`'s, which Countdown writes its time with too.
 */

/** Whole seconds, never negative. A value that is not a finite number is zero. */
function wholeSeconds(seconds: number): number {
  return Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0
}

/**
 * `65` -> `1:05`, `3725` -> `1:02:05`: minutes and two-digit seconds, with the
 * hours in front from an hour on. The digits are the locale's own numerals.
 * The colon is the media clock's separator in every locale. Fractions are
 * dropped, so the clock moves once a second and a recording's elapsed time
 * equals its length when it ends.
 */
export function clockTime(seconds: number, locale?: string): string {
  return timeDigits(wholeSeconds(seconds), locale)
}

/**
 * `65` -> `1 minute, 5 seconds`: a length in the locale's words, from `Intl`'s
 * unit names joined as a list of units, so no word comes from the vocabulary.
 * A unit that is zero is left out, and no length at all is `0 seconds`.
 * Fractions are dropped, as in `clockTime`.
 */
export function spokenDuration(seconds: number, locale?: string): string {
  return timeWords(wholeSeconds(seconds), locale)
}

/** Every AudioPlayer's recording, in any framework, by the identity each one writes. */
const PLAYERS = '[data-member="audio-player"] audio'

/**
 * Pauses every other AudioPlayer's recording in the document. Two recordings
 * that play over each other cannot be followed, and the browser plays every
 * media element it is asked to. Media the application plays itself is not an
 * AudioPlayer's, and is left alone.
 */
export function pauseOtherPlayers(audio: HTMLMediaElement): void {
  audio.ownerDocument.querySelectorAll<HTMLMediaElement>(PLAYERS).forEach((other) => {
    if (other !== audio && !other.paused) other.pause()
  })
}
