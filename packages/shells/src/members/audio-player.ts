import {
  cond,
  describeMember,
  el,
  identity,
  js,
  lit,
  member,
  run,
  text,
  type FixtureValue,
} from '../dsl'

/**
 * A silent recording of this many seconds, as a `data:` URL the fixture writes
 * when it renders: 8-bit mono samples at 8 kHz, which every engine decodes, so
 * no sound file is kept in the repository. The URL is the same string each
 * time it is written, so a framework that writes a binding again does not
 * load the recording again.
 *
 * The 44 bytes of the header and one silent sample are 45 bytes, a whole
 * number of base64 groups, so the rest of the silence is appended as `gICA`,
 * three samples at 128, an 8-bit sample's silence.
 */
const recording = (seconds: number): FixtureValue => {
  // One sample, then whole groups of three: at least `seconds` at 8 kHz.
  const samples = 1 + 3 * Math.ceil((seconds * 8000) / 3)
  const header = new Uint8Array(45)
  const view = new DataView(header.buffer)
  const ascii = (at: number, value: string) => {
    for (let index = 0; index < value.length; index += 1)
      header[at + index] = value.charCodeAt(index)
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
  const head = btoa(String.fromCharCode(...header))
  return js(`'data:audio/wav;base64,${head}' + 'gICA'.repeat(${(samples - 1) / 3})`)
}

const GERMAN = js(
  "{ play: 'Abspielen', pause: 'Pause', scrubber: 'Wiedergabeposition', position: (elapsed: string, total: string) => `${elapsed} von ${total}`, failed: 'Die Aufnahme konnte nicht geladen werden' }",
)

/** The media element, typed: the ref is typed as an element. */
const AUDIO = 'audio as HTMLAudioElement | null | undefined'

/**
 * AudioPlayer (`design/components/audio-player.md`): plays one recording, a
 * voice message or a recorded call, through a native `<audio>` element
 * without `controls`. The player is a Button, a Slider and the time, composed.
 * The engine writes the clock and the spoken lengths, and pauses every other
 * player when one starts, so a React player and a player of this shell on one
 * page keep to one at a time.
 *
 * The clock and the scrubber work in whole seconds, so the thumb moves once a
 * second in every renderer: Zag snaps a controlled value to its step, and the
 * step is a second. The scrubber's commit seeks to the second its last change
 * reported, because a controlled Zag slider reports the value it was given at
 * its commit, which the change has not yet replaced.
 */
export default describeMember({
  member: 'AudioPlayer',
  dir: 'structure',
  recipe: 'structure/audio-player',
  types: {
    // The words the member writes itself, localized by passing every key or none, so one
    // player never mixes two languages. The lengths are `Intl`'s words in `locale` already.
    AudioPlayerMessages: `{
      /** The Button's name while the recording is not playing: "Play". */
      play: string
      /** The Button's name while it plays: "Pause". */
      pause: string
      /** The scrubber's name: "Playback position". */
      scrubber: string
      /** The scrubber's spoken value, from the elapsed and the total length. */
      position: (elapsed: string, total: string) => string
      /** Said in place of the scrubber when the file cannot be loaded. */
      failed: string
    }`,
  },
  defaults: {
    messages:
      "() => ({ play: 'Play', pause: 'Pause', scrubber: 'Playback position', position: (elapsed: string, total: string) => `${elapsed} of ${total}`, failed: 'The recording could not be loaded' })",
  },
  state: {
    playing: 'false',
    finished: 'false',
    // Whole seconds, as the clock and the scrubber show them.
    elapsed: '0',
    // The file's own length, once it gives one.
    fileLength: 'null as number | null',
    // The `src` that failed, so a new `src` starts unfailed.
    failed: 'null as string | null',
    // The second the reader is dragging the scrubber to, until they let go.
    scrub: 'null as number | null',
  },
  derived: {
    known:
      'fileLength ?? (duration !== undefined && Number.isFinite(duration) && duration > 0 ? duration : null)',
    // Whole seconds. A recording under a second has nothing to move through.
    total: 'known === null ? 0 : Math.floor(known)',
    failing: "src === '' || failed === src",
    seekable: '!failing && total >= 1',
    position: 'finished ? total : Math.min(scrub ?? elapsed, total)',
    status: "failing ? 'failed' : playing ? 'playing' : finished ? 'ended' : undefined",
    failureId: '`${uid}-failure`',
    spoken:
      '(second: number): string => known === null ? spokenDuration(second, locale) : messages.position(spokenDuration(second, locale), spokenDuration(total, locale))',
    learn: `(): void => { const element = ${AUDIO}; if (element == null) return; const seconds = element.duration; fileLength = Number.isFinite(seconds) && seconds > 0 ? seconds : null }`,
    // A new recording starts from nothing, and a file that settled before the member listened
    // (its metadata, or its failure, under server rendering) is read from the element.
    settle: `(): void => { playing = false; finished = false; elapsed = 0; fileLength = null; scrub = null; if (failed !== src) failed = null; const element = ${AUDIO}; if (element == null) return; if (element.error !== null) failed = src; else if (element.readyState >= 1) learn() }`,
    // A press on a failed player asks for the file again, because a failure is about one
    // request. A refused or interrupted start leaves the element paused, which the player shows.
    toggle: `(): void => { const element = ${AUDIO}; if (element == null) return; if (!element.paused) { element.pause(); return } if (failing) { failed = null; element.load() } element.play().catch(() => {}) }`,
    secondOf:
      "(value: number | [number, number]): number => (typeof value === 'number' ? value : value[0])",
    seek: `(second: number): void => { scrub = null; elapsed = second; finished = false; const element = ${AUDIO}; if (element != null) element.currentTime = second }`,
    started: `(): void => { playing = true; finished = false; const element = ${AUDIO}; if (element != null) pauseOtherPlayers(element); emit('play') }`,
    stopped: "(): void => { playing = false; finished = true; emit('ended') }",
    ticked: `(): void => { const element = ${AUDIO}; if (element != null) elapsed = Math.floor(element.currentTime) }`,
  },
  effects: [{ watch: 'src', run: 'settle()' }],
  // The spec's `agent` fence. A recording plays from a person's press, so an agent reads the
  // player and runs nothing, and the Button and the scrubber, the player's own parts, are withheld.
  agent: {
    on: 'root',
    state: { playing: 'playing', failed: 'failing', position: 'position', duration: 'total' },
    actions: {},
    withholds: 'root',
  },
  template: el(
    'div',
    {
      part: 'root',
      ref: 'root',
      class: ['root'],
      attrs: {
        role: lit('group'),
        'aria-label': 'label',
        'data-state': 'status',
        ...identity('AudioPlayer'),
      },
    },
    [
      // No `controls`: the browser draws nothing, and the parts below are the player.
      cond("src !== ''", [
        el('audio', {
          part: 'audio',
          ref: 'audio',
          attrs: { preload: lit('metadata'), src: 'src' },
          on: {
            loadedmetadata: run('learn()'),
            durationchange: run('learn()'),
            timeupdate: run('ticked()'),
            play: run('started()'),
            pause: run('playing = false'),
            ended: run('stopped()'),
            error: run('(failed = src, playing = false)'),
          },
        }),
      ]),
      // The name says what a press does, so it changes with the state.
      member(
        'Button',
        {
          variant: lit('soft'),
          tone: lit('accent'),
          iconOnly: 'true',
          icon: "playing ? 'pause' : 'run'",
          label: 'playing ? messages.pause : messages.play',
          disabled: "src === ''",
          'aria-describedby': 'failing ? failureId : undefined',
        },
        { on: { click: run('toggle()') } },
      ),
      cond(
        'failing',
        [
          el(
            'span',
            {
              part: 'failure',
              class: ['failure'],
              attrs: { id: 'failureId', 'data-audio-player-part': lit('failure') },
            },
            [
              el('span', { class: ['failureGlyph'], attrs: { 'aria-hidden': lit('true') } }, [
                member('Icon', { name: lit('error'), size: lit('sm') }),
              ]),
              el('span', {}, [text('messages.failed')]),
            ],
          ),
        ],
        [
          el('span', { part: 'scrubber', class: ['scrubber'] }, [
            member(
              'Slider',
              {
                'aria-label': 'messages.scrubber',
                min: '0',
                max: 'seekable ? total : 1',
                step: '1',
                value: 'seekable ? position : 0',
                disabled: '!seekable',
                formatValue: 'spoken',
              },
              {
                // Slider reports a pair under `range`, which this scrubber never sets, so its
                // handlers take either and read the one value.
                on: {
                  change: run('(value: number | [number, number]) => { scrub = secondOf(value) }'),
                  commit: run(
                    '(value: number | [number, number]) => seek(scrub ?? secondOf(value))',
                  ),
                },
              },
            ),
          ]),
          // Hidden, because the scrubber says the same. Not live, because a clock read out
          // every second interrupts every other announcement.
          el(
            'span',
            {
              part: 'time',
              class: ['time'],
              attrs: { 'data-audio-player-part': lit('time'), 'aria-hidden': lit('true') },
            },
            [
              el('span', {}, [text('clockTime(position, locale)')]),
              cond('known !== null', [
                el('span', { class: ['divider'] }, [text(lit('/'))]),
                el('span', {}, [text('clockTime(total, locale)')]),
              ]),
            ],
          ),
        ],
      ),
    ],
  ),
  states: [
    {
      name: 'rest — a voice message whose length the app knows',
      props: { src: recording(18), duration: 18, label: 'Voice message from Ada' },
      expect: { 'data-state': null, 'aria-label': 'Voice message from Ada' },
    },
    {
      name: 'the file’s own length — no duration passed',
      props: { src: recording(18), label: 'Recorded call, ticket 4182' },
      expect: { 'data-state': null },
    },
    {
      name: 'localized — the clock and the spoken position in German',
      props: {
        src: recording(18),
        duration: 18,
        label: 'Sprachnachricht von Ada',
        locale: 'de-DE',
        messages: GERMAN,
      },
    },
    {
      name: 'two players — starting one pauses the other',
      many: {
        within: { member: 'Stack', props: { gap: 4 } },
        each: [
          { props: { src: recording(18), duration: 18, label: 'Voice message from Ada' } },
          { props: { src: recording(7), duration: 7, label: 'Voice message from Grace' } },
        ],
      },
    },
    {
      name: 'failed — no file to load',
      props: { src: '', duration: 18, label: 'Voice message from Ada' },
      expect: { 'data-state': 'failed' },
    },
  ],
})
