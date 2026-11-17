# AudioPlayer

Plays one recording: a voice message in a conversation, a recorded call in a ticket. It is a
play Button, a scrubber and the elapsed and total time, in one row, over a native `<audio>`
element without `controls`, which draws nothing. The browser's own `<audio controls>` is drawn
by the browser, differs in every engine and takes no token, so a product that used it would
show a control no theme reaches.

It has no substrate of its own. The Button is Button and the scrubber is Slider, composed, so
their keys, names and recipes are theirs. The media element plays the file, and the engine's
`clockTime` and `spokenDuration` write its times, so every framework's player writes the same
clock and says the same words.

It plays and moves through one recording, and does nothing else. It has no volume, because
the reader's device has one. It has no playback speed, no download, no waveform and no
transcript: each is a decision with a surface of its own that no consumer has asked for. It
does not record: RecordButton starts and stops a recording the application makes, and the
application then passes the file to an AudioPlayer. It plays no video, and it is not a
playlist: the application lays out several players, and the players keep to one at a time
([Behaviour](#behaviour)).

## Anatomy

```
[root <div role="group">, named by label]
  [audio <audio preload="metadata">]          no controls; absent when src is empty
  [toggle — Button soft · accent · iconOnly]  run ⇄ pause
  [scrubber — Slider]                         absent when failed
  [time <span aria-hidden>]                   elapsed / total; absent when failed
  [failure <span>]                            Icon error + messages.failed; only when failed
```

## API

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `src` | `string` | required | the recording's URL. An empty string is the failed state, because there is nothing to load |
| `label` | `string` | required | names the player, which is a group: "Voice message from Ada", "Call with Grace, 3 May". Required, because a page with two players needs to tell them apart, and only the app knows what each recording is |
| `duration` | `number` | — | the recording's length in seconds, shown before the file gives its own. A file's finite length replaces it. A file that gives none keeps it: a recording that a browser's `MediaRecorder` wrote reports an infinite length until it has played through, and the app that recorded it knows how long it is |
| `locale` | `string` | — | the locale the clock's numerals and the spoken lengths are written in, through `Intl`; the page's own when absent |
| `messages` | `AudioPlayerMessages` | English | the localization seam: every word the member writes itself |
| `onPlay` | `() => void` | — | the recording started playing. A conversation marks a voice message heard with it, as a messaging app's receipt does |
| `onEnded` | `() => void` | — | the recording played to its end. An app that counts a message as heard only when it was heard through uses this one |

There is no `onPause`, because a pause changes nothing the application holds. There is no
`playing` prop and no way to start a player from code: a recording plays when the reader
presses its Button, and a browser may refuse to play without a press in any case.

```ts
interface AudioPlayerMessages {
  play: string // the Button's name while not playing; default "Play"
  pause: string // the Button's name while playing; default "Pause"
  scrubber: string // the scrubber's name; default "Playback position"
  position: (elapsed: string, total: string) => string // the scrubber's spoken value; default "{elapsed} of {total}"
  failed: string // said in place of the scrubber when the file cannot be loaded; default "The recording could not be loaded"
}
```

**Localization.** The member has five strings of its own, and an app passes every key or none,
so one player never mixes two languages. `position` joins two lengths that `Intl` has already
written in `locale` ("1 minute, 5 seconds"), so a locale's catalog decides only the word between
them and their order. `label` is the app's.

Attributes: root `data-state="playing" | "ended" | "failed"`. A player that is not playing,
whether its file has loaded or not, is the rest state and carries none. `failed` comes first:
a failed player is neither playing nor ended. The time carries
`data-audio-player-part="time"` and the failure words `data-audio-player-part="failure"`, so a
test finds them in every renderer.

## Behaviour

- **Loading.** The element asks for the file's metadata (`preload="metadata"`), so the length
  is known before the reader presses anything, and the rest of the file is fetched when it
  plays. A file that settled before the member listened, as one can under server rendering, is
  read from the element once the member is in the document.
- **The length.** The total is the file's length once the file gives a finite one, else
  `duration`, else unknown. The clock and the scrubber work in whole seconds, as the clock
  shows them, so the scrubber moves once a second in every renderer and stands at its end when
  the recording ends. While the total is unknown, the time shows the elapsed time alone and the
  scrubber is disabled, because there is no end to move towards. A recording under one second
  has nothing to move through and keeps the scrubber disabled too.
- **A press on the Button** plays the recording when it is paused and pauses it when it plays.
  After the end, a press plays it from the start, as the media element does. The Button's name
  says what the press will do, so it changes: "Play" while paused, "Pause" while playing. It is
  not a toggle with one name and `aria-pressed`, because the two presses are different acts, and
  "Play, pressed" says neither that the recording plays nor what a press does next. The glyph
  changes with the name.
- **The scrubber** is a Slider from zero to the total, with a step of one second, named
  `messages.scrubber`. Its spoken value is `messages.position` of the elapsed and the total
  lengths, so a screen reader hears "5 seconds of 18 seconds", not "5". While the reader drags
  it, the clock follows the thumb, and the recording moves when they let go: the Slider's
  commit, which a keyboard step makes at once. A seek after the end leaves the ended state.
- **One at a time.** When a player starts, every other AudioPlayer on the page pauses, in
  whatever framework it is drawn (`pauseOtherPlayers`, which finds them by their
  `data-member`). Two recordings that play over each other cannot be followed, and a browser
  plays every media element it is asked to. Media the application plays itself is not an
  AudioPlayer's, and is left alone.
- **A failure.** When the file cannot be loaded, the scrubber and the time are replaced by the
  error glyph and `messages.failed`, and the Button is described by those words. The Button
  stays, enabled: a press asks for the file again, because a failure is about one request, as
  it is in Image. With an empty `src` there is nothing to ask for, so the Button is disabled and
  the words are there from the first render.
- **A new `src`** starts from nothing: not playing, at zero, with the new file's length to come.
- **Leaving the page.** A player that unmounts while it plays stops, because a media element
  removed from the document pauses.

## On iOS and Android

SwiftUI plays the recording with AVFoundation's `AVPlayer`, made when the player appears, so the
length is known before a press. The failure's words are the Button's hint, where the web
describes the Button with them.

**On Android** the app provides the media player (`LocalPMAudioEngine`, over `MediaPlayer` or
Media3), as it provides its image loader, because the member module's common source set also
compiles for the JVM, where neither exists. Without one, every player is failed and its Button
disabled. TalkBack reads the failure's words after the Button, because Compose has no relation
that describes one node by another. The clock's digits are Western, and the spoken lengths are
the app's words (`LocalPMDurationWords`), else English: `{count} second`, `{count} seconds` and
their minute and hour forms, joined by commas.

## Recipes (exact tokens)

The Button and the Slider are drawn by their own recipes (`button.md`, `slider.md`). This
member's recipe lays out the row and draws the time and the failure.

| Part | Tokens |
| --- | --- |
| root | `display: flex` · gap `--pm-space-3` · centred on the cross axis · full width. No border, radius, fill or shadow of its own: a voice message sits in a ChatMessage's bubble, a recorded call in a Card |
| toggle | Button `soft` · `accent` · `iconOnly` · `md`. Soft, because a player's press is the action of its own row and not the page's primary action |
| scrubber | grows into the room left · basis `--pm-space-10`, so a player in a box that sizes to its content has a track a reader can aim at |
| time | `text.sm` · `--pm-text-secondary` · `font-variant-numeric: var(--pm-font-numeric)`, as Slider's readout, so the digits keep their width while the clock moves · gap `--pm-space-1` · never wraps |
| time divider | `--pm-text-muted` |
| failure | `text.sm` · `--pm-text-secondary` · gap `--pm-space-2` |
| failure glyph | `--pm-danger-text`, which the pairing checks hold on every `bg.*` surface |

## States

| Entry | Render | Expect |
| --- | --- | --- |
| rest | an 18-second recording with `duration={18}` | no `data-state` · the group named by `label` |
| the file's own length | the same recording, no `duration` | no `data-state` · the scrubber enabled once the file gives its length |
| localized | `locale="de-DE"` and German `messages` | the spoken position in German |
| two players | two players in a Stack | — |
| failed | `src=""` | `data-state="failed"` · the Button disabled · the failure words |

`requiredSelectors`: none. Playing and ended follow a press and the file's own events, which no
prop reaches, and the recipe draws neither: the Button's glyph and name and the scrubber's thumb
show them. The Button and the Slider style their own hover, focus and press. The member's tests
hold playing, pausing, the end, one at a time, the seek and a failure with real recordings.

## Motion

None of its own. The Button's press and the Slider's grab are theirs. The thumb and the clock
move once a second while the recording plays, which is the recording's position and not a
transition, so it is the same at `none` and under reduced motion. Nothing announces it.

## Icons

`run` (play) and `pause` on the toggle, and `error` beside the failure words. All three are
decorative: the Button is named by `messages`, and the failure by its words.

## A11y

The root is a group named by `label`, so a reader hears which recording a player is before its
controls. Inside it, in reading order: the Button, named `messages.play` or `messages.pause`,
and the scrubber, a slider named `messages.scrubber` whose `aria-valuetext` is the spoken
position. Keyboard and names follow Button's and Slider's contracts: Enter and Space press the
Button; the arrows, Page Up and Page Down, Home and End move the scrubber, one second for an
arrow.

The time is hidden from assistive technology, because the scrubber's value says the same, and
it is not a live region, because a clock read out every second interrupts every other
announcement. Nothing in the player is live. The Button's new name is what a reader hears when a
press changes it. The audio element has no `controls`, so it is not in the accessibility tree.

When the file fails, the words are text in the group and the Button's description, so a reader
who reaches the Button hears why nothing plays.

```contract
role root group
name root from label
role toggle button when rest
key Enter activates on toggle when rest
key Space activates on toggle when rest
role scrubber slider when rest
key ArrowRight increments on scrubber when rest
key PageUp increments on scrubber when rest
key End increments on scrubber when rest
attr root data-state=failed when failed
attr toggle data-disabled when failed
```

## Agent

An agent reads whether the recording is playing, whether it failed to load, the position and
the recording's length, both in whole seconds as the clock shows them (the length is 0 while
neither the file nor `duration` gives one). It does not play, pause or move through the
recording: a recording plays when a person presses its Button, as the API says, and a browser
may refuse a start that no press asked for. The Button and the scrubber are the player's own
parts, so the player withholds them, and an agent sees one AudioPlayer, named by its `label`,
where a person sees one player.

```agent
state playing boolean as root data-state=playing
state failed boolean as root data-state=failed
state position number
state duration number
withholds contents
```
