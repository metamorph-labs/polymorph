import { getByRole, queryByRole } from '@testing-library/dom'
import { userEvent } from 'vitest/browser'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { installTestTheme } from '@polymorph/engine/testing'

/**
 * The law for what an AudioPlayer does with a real recording
 * (`design/components/audio-player.md`, Behaviour), which every web shell's
 * AudioPlayer test calls with a mount of its own. A contract statement reads
 * one part's role, name or attribute, or a key's effect on it
 * (`docs/conformance.md`). This law reads what the grammar cannot state: the
 * media element's own state after a press, a recording played to its end, a
 * second player paused by the first, a seek, and a file that fails.
 *
 * Every recording is silence the law makes as a WAV file, so no sound file is
 * kept in the repository. Each test presses the Button, because a browser may
 * refuse to play without a press. A Button is focused or clicked from a
 * script, because Tab passes over buttons in WebKit.
 */

/** The props the law mounts an AudioPlayer with. */
export interface AudioPlayerLawProps {
  src: string
  label: string
  duration?: number
  onPlay?: () => void
  onEnded?: () => void
}

export interface AudioPlayerLaw {
  /** The shell's name as the law's titles say it: `Vue`. */
  readonly shell: string
  /**
   * Mounts one AudioPlayer with these props. A test that mounts twice has two
   * players on the page. A prop the law leaves out is not passed.
   */
  mount(props: AudioPlayerLawProps): Promise<unknown>
}

/**
 * A WAV file of silence, `seconds` long: 8-bit mono samples at 8 kHz, which
 * every engine decodes. Each call is a new URL, so no test reads a file the
 * browser has already loaded for another.
 */
export function silentRecording(seconds: number): string {
  const samples = Math.round(seconds * 8000)
  const bytes = new Uint8Array(44 + samples)
  const view = new DataView(bytes.buffer)
  const ascii = (at: number, text: string) => {
    for (let index = 0; index < text.length; index += 1) bytes[at + index] = text.charCodeAt(index)
  }
  ascii(0, 'RIFF')
  view.setUint32(4, 36 + samples, true)
  ascii(8, 'WAVE')
  ascii(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, 8000, true)
  view.setUint32(28, 8000, true)
  view.setUint16(32, 1, true)
  view.setUint16(34, 8, true)
  ascii(36, 'data')
  view.setUint32(40, samples, true)
  // 128 is the silent level of an unsigned 8-bit sample.
  bytes.fill(128, 44)
  return URL.createObjectURL(new Blob([bytes], { type: 'audio/wav' }))
}

/** Bytes that are not a recording, so the element fails to load them. */
export function brokenRecording(): string {
  return URL.createObjectURL(new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'audio/wav' }))
}

/** The players on the page, in document order. */
const players = () => [...document.querySelectorAll<HTMLElement>('[data-member="audio-player"]')]

const only = (): HTMLElement => {
  const [player] = players()
  if (player === undefined) throw new Error('no AudioPlayer rendered')
  return player
}

const audioOf = (player: HTMLElement) => player.querySelector('audio') as HTMLAudioElement
const buttonOf = (player: HTMLElement) => player.querySelector('button') as HTMLButtonElement
const scrubberOf = (player: HTMLElement) => getByRole(player, 'slider')
const timeOf = (player: HTMLElement) =>
  player.querySelector<HTMLElement>('[data-audio-player-part="time"]')
/** The clock as it is drawn, with the spaces between its parts left out. */
const clockOf = (player: HTMLElement) => (timeOf(player)?.textContent ?? '').replace(/\s/g, '')

const failureOf = (player: HTMLElement) =>
  player.querySelector<HTMLElement>('[data-audio-player-part="failure"]')

/** Presses a player's Button, as a reader does, so the browser lets it play. */
const press = (player: HTMLElement) => userEvent.click(buttonOf(player))

const PLAYS = { timeout: 5000 }

export function audioPlayerLaw({ shell, mount }: AudioPlayerLaw): void {
  describe(`${shell} AudioPlayer — a real recording`, () => {
    beforeAll(installTestTheme)

    it('is a group named by its label, with a Button and a scrubber named for what they do', async () => {
      await mount({ src: silentRecording(3), duration: 3, label: 'Voice message from Ada' })
      const player = only()

      expect(getByRole(document.body, 'group', { name: 'Voice message from Ada' })).toBe(player)
      expect(getByRole(player, 'button', { name: 'Play' })).toBe(buttonOf(player))
      const scrubber = getByRole(player, 'slider', { name: 'Playback position' })
      expect(scrubber.getAttribute('aria-valuetext')).toBe('0 seconds of 3 seconds')
      expect(scrubber.getAttribute('aria-valuemax')).toBe('3')
    })

    it('draws the time hidden from assistive technology and in no live region', async () => {
      await mount({ src: silentRecording(3), duration: 3, label: 'Voice message from Ada' })
      const player = only()

      expect(clockOf(player)).toBe('0:00/0:03')
      expect(timeOf(player)?.getAttribute('aria-hidden')).toBe('true')
      expect(
        player.querySelector('[aria-live], [role="status"], [role="log"], [role="timer"]'),
      ).toBeNull()
    })

    it('takes the file’s own length once the file gives it', async () => {
      await mount({ src: silentRecording(2), duration: 65, label: 'Voice message from Ada' })
      const player = only()

      await vi.waitFor(() => expect(clockOf(player)).toBe('0:00/0:02'), PLAYS)
      expect(scrubberOf(player).getAttribute('aria-valuetext')).toBe('0 seconds of 2 seconds')
    })

    it('plays on a press, names the Button for a pause, and pauses on the next press', async () => {
      const played = vi.fn()
      await mount({
        src: silentRecording(3),
        duration: 3,
        label: 'Voice message from Ada',
        onPlay: played,
      })
      const player = only()

      await press(player)
      await vi.waitFor(() => expect(player.getAttribute('data-state')).toBe('playing'), PLAYS)
      expect(audioOf(player).paused).toBe(false)
      expect(buttonOf(player).getAttribute('aria-label')).toBe('Pause')
      expect(played).toHaveBeenCalledTimes(1)

      await press(player)
      await vi.waitFor(() => expect(player.hasAttribute('data-state')).toBe(false), PLAYS)
      expect(audioOf(player).paused).toBe(true)
      expect(buttonOf(player).getAttribute('aria-label')).toBe('Play')
      expect(played).toHaveBeenCalledTimes(1)
    })

    it('plays to the end, then says it ended and offers to play again', async () => {
      const ended = vi.fn()
      await mount({
        src: silentRecording(1),
        duration: 1,
        label: 'Voice message from Ada',
        onEnded: ended,
      })
      const player = only()

      await press(player)
      await vi.waitFor(() => expect(player.getAttribute('data-state')).toBe('ended'), PLAYS)
      expect(ended).toHaveBeenCalledTimes(1)
      expect(buttonOf(player).getAttribute('aria-label')).toBe('Play')
      expect(scrubberOf(player).getAttribute('aria-valuenow')).toBe('1')
      expect(clockOf(player)).toBe('0:01/0:01')
    })

    it('pauses the player that is playing when another starts', async () => {
      await mount({ src: silentRecording(4), duration: 4, label: 'Voice message from Ada' })
      await mount({ src: silentRecording(4), duration: 4, label: 'Voice message from Grace' })
      const [first, second] = players() as [HTMLElement, HTMLElement]

      await press(first)
      await vi.waitFor(() => expect(first.getAttribute('data-state')).toBe('playing'), PLAYS)

      await press(second)
      await vi.waitFor(() => expect(second.getAttribute('data-state')).toBe('playing'), PLAYS)
      await vi.waitFor(() => expect(first.hasAttribute('data-state')).toBe(false), PLAYS)
      expect(audioOf(first).paused).toBe(true)
      expect(buttonOf(first).getAttribute('aria-label')).toBe('Play')
    })

    it('moves the recording to the second the scrubber is set to', async () => {
      await mount({ src: silentRecording(5), duration: 5, label: 'Voice message from Ada' })
      const player = only()
      const scrubber = scrubberOf(player)

      scrubber.focus()
      expect(document.activeElement).toBe(scrubber)
      // One step at a time, as a reader presses: each step starts from the
      // second the player shows, which a framework draws after the last step.
      await userEvent.keyboard('{ArrowRight}')
      await vi.waitFor(() => expect(scrubber.getAttribute('aria-valuenow')).toBe('1'), PLAYS)
      await userEvent.keyboard('{ArrowRight}')

      await vi.waitFor(() => expect(audioOf(player).currentTime).toBeCloseTo(2, 1), PLAYS)
      expect(scrubber.getAttribute('aria-valuenow')).toBe('2')
      expect(scrubber.getAttribute('aria-valuetext')).toBe('2 seconds of 5 seconds')
      expect(clockOf(player)).toBe('0:02/0:05')
    })

    it('says when the file cannot be loaded, and keeps the Button to ask for it again', async () => {
      await mount({ src: brokenRecording(), duration: 3, label: 'Voice message from Ada' })
      const player = only()

      await vi.waitFor(() => expect(player.getAttribute('data-state')).toBe('failed'), PLAYS)
      expect(failureOf(player)?.textContent).toBe('The recording could not be loaded')
      expect(queryByRole(player, 'slider')).toBeNull()
      expect(timeOf(player)).toBeNull()

      const button = buttonOf(player)
      expect(button.disabled).toBe(false)
      const described = document.getElementById(button.getAttribute('aria-describedby') ?? '')
      expect(described?.textContent).toBe('The recording could not be loaded')
    })

    it('says at once that there is nothing to play when there is no file', async () => {
      await mount({ src: '', duration: 3, label: 'Voice message from Ada' })
      const player = only()

      expect(player.getAttribute('data-state')).toBe('failed')
      expect(player.querySelector('audio')).toBeNull()
      expect(buttonOf(player).disabled).toBe(true)
      expect(failureOf(player)?.textContent).toBe('The recording could not be loaded')
    })
  })
}
