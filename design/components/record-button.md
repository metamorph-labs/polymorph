# RecordButton

A Button preset that starts and stops a recording the application makes: voice input in a
composer, a voice note on a ticket. It relates to Button as CopyButton does: every record
control in the product uses it, so no screen re-decides how recording looks or what a reader
hears. Nothing else in the vocabulary says "recording".

The application owns the microphone. It calls `getUserMedia` and `MediaRecorder` itself, as it
owns an upload behind FileUpload, and passes what it has: whether it is recording, for how long,
and how loud the input is. RecordButton draws that and reports each press. It never asks for a
device, never records and never holds the file. When the application's request for the
microphone is refused, the application says so, in an Alert or a Toast, and leaves `recording`
off. The recorded file is the application's to send, and an AudioPlayer plays it back.

It has one press in each state: start, then stop. It has no pause, no discard, no send and no
device choice: each is another control of the application's (a Button, a Select), beside it.
It draws no waveform: the mark's halo is the input level, one number.

## Anatomy

```
[root <span>]
  [meter?]            while recording
    [mark <span aria-hidden>]   a dot, and a halo sized by level
    [elapsed <span>]            m:ss, when elapsed is passed
  [button — Button neutral · iconOnly]   ghost "record" at rest ⇄ outline "stop" while recording
```

## API

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `label` | `string` | required | the Button's name while not recording: "Record a voice message". Required, because naming is the caller's decision (Button's law) |
| `stopLabel` | `string` | required | the Button's name while recording: "Stop recording". Required for the same reason, and because the vocabulary writes no text of its own |
| `recording` | `boolean` | `false` | the application is recording. The member draws it and never sets it |
| `elapsed` | `number` | — | the seconds the application has recorded, drawn as m:ss beside the mark while recording |
| `level` | `number` | — | the input level from 0 to 1, drawn as the size of the mark's halo while recording. A value outside the range is clamped, and a value that is not a number is no level |
| `locale` | `string` | — | the locale the time's numerals are written in, through `Intl` (the engine's `clockTime`, which AudioPlayer's clock uses too); the page's own when absent |
| `onStart` | `() => void` | — | a press while not recording |
| `onStop` | `() => void` | — | a press while recording |
| `disabled` | `boolean` | `false` | Button passthrough |
| `size` | `'sm' \| 'md'` | `'md'` | Button's sizes without `lg`, as CopyButton's: a record control sits beside a field and is never a page's main action. A composer's toolbar takes `sm` |

`onStart` and `onStop` are optional, as Button's `onClick` is, so a document can draw each state
for review. Two handlers, not one with the state, because the application does different work
for each: it asks for the microphone on a start and stops its recorder on a stop.

Attributes: root `data-state="recording"`, absent at rest, and `data-size`. The Button carries
its own (`data-variant`, `data-tone`, `data-size`, `data-disabled`, `data-icon-only`). The meter
carries `data-record-button-part="meter"`, so a test finds it in every renderer.

## Behaviour

- **A press** calls `onStart` while `recording` is off and `onStop` while it is on, and changes
  nothing itself. Between a start and the application's `recording`, the browser may ask the
  reader for the microphone, and the Button keeps its rest face, because nothing is recorded
  yet. A second press then calls `onStart` again, and the application, whose request is in
  flight, ignores it.
- **The name says what a press does**, so it changes: `label` at rest, `stopLabel` while
  recording. It is not a toggle with one name and `aria-pressed`. Starting and stopping are
  different acts, and "Record a voice message, pressed" says neither that a recording runs nor
  what a press does next. Nothing in the member is live, so the focused Button's new name is the
  only announcement that the recording started or stopped. AudioPlayer's Play and Pause
  make the same choice, as a live huddle's "Mute microphone" and "Unmute microphone" do.
- **Recording is plain without colour.** The glyph changes from `record`, a microphone, to
  `stop`, a square. The Button gains a frame: ghost at rest, as PromptInput's attach control is,
  and outline while recording, as PromptInput's stop face is. The meter appears with the mark
  and the time. The mark's red is one sign among four.
- **The time** is the application's `elapsed`, written by `clockTime` as m:ss, or h:mm:ss from an
  hour on. It is text a reader can reach, before the Button in reading order, and not a live
  region, so it is not read out each second. Until the application passes `elapsed`, the meter
  is the mark alone.
- **The level** sizes the mark's halo, from the dot's own size at 0, hidden under it, to the
  whole mark at 1. The mark's box is the halo's full size, so the level moves nothing beside it. It
  is never the only sign of recording: at 0, a silent microphone, the dot, the glyph, the frame,
  the name and the time still say it.
- **Focus stays on the Button.** The meter is drawn before the Button, and the Button is the same
  element in both states, so the application's change of `recording` moves no focus. In a
  toolbar aligned to its end, as PromptInput's is, the Button also stays where it was pressed.

## On iOS and Android

The member requests no permission and holds no recorder: the app records with the platform's own
API and passes `recording`, `elapsed` and `level`, as on the web. VoiceOver and TalkBack read the
time as its length in words ("12 seconds"), AudioPlayer's spoken lengths, where a screen reader
would read the clock's digits as a time of day.

**On Android** the clock's digits are Western, and the words are the app's for `locale`
(`LocalPMDurationWords`), else English. The halo keeps its full size with the level as its
opacity at the `none` temperament; with the system's animations off it grows at once, because
Compose's common code reads no reduced-motion setting.

## Recipes (exact tokens)

The Button is drawn by its own recipe (`button.md`): `ghost`/`neutral` at rest and
`outline`/`neutral` while recording, `iconOnly`, at `size`.

| Part | Tokens |
| --- | --- |
| root | `inline-flex` · gap `--pm-space-2` · centred on the cross axis |
| meter | `inline-flex` · gap `--pm-space-2` · centred |
| mark | a `--pm-space-6` square box, so the halo moves nothing beside it · the dot in its middle, inset `--pm-space-3`, in `--pm-danger-text`, which the pairing checks hold on every `bg.*` surface, at `--pm-radius-pill`. Red, because a recording's mark is red by convention on every platform, not because recording is dangerous |
| halo | `--pm-danger-border`, which stands apart from the surface and from the dot in both modes, where `--pm-danger-subtle` does not in dark · `--pm-radius-pill` · the whole box at the full level and the dot's own size, a third of the box, at none: `transform: scale((1 + 2 × level) / 3)`, from the pattern token `--pm-record-button-level`, declared on the mark at 0 and set inline as data |
| elapsed | `text.sm` at `md` and `text.xs` at `sm` (the conventions' size system) · `--pm-text-secondary` · `font-variant-numeric: var(--pm-font-numeric)`, as AudioPlayer's clock · never wraps |

## States

| Entry | Render | Expect |
| --- | --- | --- |
| rest | `label`, `stopLabel` | no `data-state` · `data-size="md"` |
| recording | `recording elapsed={12} level={0.6}` | `data-state="recording"` |
| silent | `recording elapsed={47} level={0}` | `data-state="recording"` · no halo |
| starting | `recording`, no `elapsed` | `data-state="recording"` · the mark alone |
| sm | `size="sm" recording elapsed={75} level={0.3}` | `data-size="sm"` |
| disabled | `disabled` | the Button's `data-disabled` |

PromptInput's fixture shows the member in its `trailing` slot, at rest and recording
(`prompt-input.md`).

`requiredSelectors`: none. Recording is a prop, the halo's size is data set inline, and the
Button styles its own hover, focus and press.

## Motion

The halo's size follows the level with a transition on `transform` at
`--pm-motion-duration-control` × `--pm-motion-easing-standard`, so a level the application
updates many times a second moves smoothly. At `none` and under reduced motion the halo does not
grow: it stays at its full size and the level is its opacity, the `scale-fade` pattern's
projection to a fade, and the change is instant under reduced motion. The dot does not pulse,
because an ambient loop is for loading only. The Button's press is Button's. The meter appears
and leaves with the state, without a transition.

## Icons

`record` (rest) and `stop` (recording), both decorative: `label` and `stopLabel` name the
Button.

## A11y

In reading order: while recording, the time, then the Button. The mark is hidden from assistive
technology, because the level is not information a reader acts on. The Button is named `label`
or `stopLabel` and carries no `aria-pressed`. Nothing in the member is live: the Button's new
name is what a reader hears when a recording starts or stops, and the time is read when the
reader reaches it. Disabled uses the native attribute, as Button does. The hit area is Button's
at both sizes.

```contract
role button button
name button from label when rest
name button from stopLabel when recording
key Enter activates on button when rest
key Space activates on button when rest
key Enter activates on button when recording
attr root data-state=recording when recording
attr button data-disabled when disabled
```

## Agent

An agent reads whether the application is recording and whether the control is disabled, and
stops a recording. It does not start one. A recording captures the room around the person
through their microphone, and once the browser has granted the microphone, a start an agent asked
for would begin capturing with no act of the person's, so only a person's press starts it. A stop
ends a capture and records nothing new, so an agent may stop. It is the Button's own click, so it
reaches `onStop` as a person's press does, and it is refused while nothing is recording. The
Button is this member's own part: the bridge lists the RecordButton in its place, and the Button
is not a member an agent lists, finds or presses.

```agent
state recording boolean as root data-state=recording
state disabled boolean as button data-disabled
action stop calls onStop when recording
withholds contents
```
