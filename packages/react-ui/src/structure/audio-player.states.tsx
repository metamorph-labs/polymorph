import { type ComponentStates } from '@polymorph/react'
import { Stack } from '../layout/Stack'
import { AudioPlayer, type AudioPlayerMessages } from './AudioPlayer'

/** States fixture, from `design/components/audio-player.md`'s States table. */

/**
 * A silent recording of this many seconds, as a `data:` URL: 8-bit mono
 * samples at 8 kHz, which every engine decodes, so no sound file is kept in
 * the repository. The generated fixtures write the same URL, and a string
 * written twice is one recording.
 *
 * The 44 bytes of the header and one silent sample are 45 bytes, a whole
 * number of base64 groups, so the rest of the silence is appended as `gICA`,
 * three samples at 128, an 8-bit sample's silence.
 */
function recording(seconds: number): string {
  // One sample, then whole groups of three: at least `seconds` at 8 kHz.
  const samples = 1 + 3 * Math.ceil((seconds * 8000) / 3)
  const header = new Uint8Array(45)
  const view = new DataView(header.buffer)
  const ascii = (at: number, text: string) => {
    for (let index = 0; index < text.length; index += 1) header[at + index] = text.charCodeAt(index)
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
  header[44] = 128
  return `data:audio/wav;base64,${btoa(String.fromCharCode(...header))}${'gICA'.repeat((samples - 1) / 3)}`
}

const GERMAN: AudioPlayerMessages = {
  play: 'Abspielen',
  pause: 'Pause',
  scrubber: 'Wiedergabeposition',
  position: (elapsed, total) => `${elapsed} von ${total}`,
  failed: 'Die Aufnahme konnte nicht geladen werden',
}

export const states: ComponentStates = {
  component: 'AudioPlayer',

  entries: [
    {
      name: 'rest — a voice message whose length the app knows',
      render: () => (
        <AudioPlayer src={recording(18)} duration={18} label="Voice message from Ada" />
      ),
      expect: { 'data-state': null, 'aria-label': 'Voice message from Ada' },
    },
    {
      name: 'the file’s own length — no duration passed',
      render: () => <AudioPlayer src={recording(18)} label="Recorded call, ticket 4182" />,
      expect: { 'data-state': null },
    },
    {
      name: 'localized — the clock and the spoken position in German',
      render: () => (
        <AudioPlayer
          src={recording(18)}
          duration={18}
          label="Sprachnachricht von Ada"
          locale="de-DE"
          messages={GERMAN}
        />
      ),
    },
    {
      name: 'two players — starting one pauses the other',
      render: () => (
        <Stack gap={4}>
          <AudioPlayer src={recording(18)} duration={18} label="Voice message from Ada" />
          <AudioPlayer src={recording(7)} duration={7} label="Voice message from Grace" />
        </Stack>
      ),
    },
    {
      name: 'failed — no file to load',
      render: () => <AudioPlayer src="" duration={18} label="Voice message from Ada" />,
      expect: { 'data-state': 'failed' },
    },
  ],

  /*
   * None. Playing and ended follow a press and the file's own events, which no
   * prop reaches, and the recipe draws neither: the Button's glyph and name and
   * the scrubber show them. The Button and the Slider style their own hover,
   * focus and press. The member's tests play real recordings.
   */
  requiredSelectors: [],
}
