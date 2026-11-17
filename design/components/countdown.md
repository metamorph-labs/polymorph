# Countdown

The time left until a moment, ticking each second: a code that expires, a session that ends, a
retry or a resend that unlocks. It writes `4:59`, then `1:02:05` from an hour, in tabular
figures, until `0:00`, and it tells the application once when the moment is reached. It has no
substrate. The time comes from the engine's page clock (`followCountdown`), which every
Countdown on a page shares.

It is not RelativeTime. RelativeTime writes a moment as words relative to now ("in 5 minutes")
and never refreshes, by its own rule, because a wall of timestamps that change is motion nobody
asked for. A countdown is the case where the reader is waiting for the time to pass: its digits
change every second, it ends, and the application acts on the end. A `mode` on RelativeTime
would give RelativeTime a timer, a second format, an end and an event, and would remove its "no
refresh" rule, so the countdown is a member of its own.

It is not Progress either. Progress shows how much of a task is done, and a countdown shows how
long until a moment. It holds no Button: the control that waits for the end (a resend, a retry)
is the application's, and `onEnd` tells it when to enable it.

It is admitted on recurrence. The consumer applications count to a moment in several places,
each with its own one-second timer: a resend control disabled until a cooldown ends, a sign-in
retried after the server's "retry after" seconds, and a request whose approval expires.

## Anatomy

```
[root <span data-ended?>]
  [timer <time role="timer" aria-label={label} dateTime="PT299S">]
    [digits, aria-hidden]   4:59
    [words, hidden]         4 minutes, 59 seconds
  [status role="status", hidden]?   with `announce`
```

## API

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `until` | `string` | required | the moment it counts to, as an ISO-8601 instant, read as RelativeTime reads its `value`: a full timestamp keeps its offset, and one without an offset is read by the platform's parser. A date-only string is a calendar date with no time of day, so it names no moment, and the member renders nothing with a dev warning |
| `label` | `string` | required | what it counts to, as the timer's accessible name: "Time until you can send a new code". Required, because an unnamed timer says a time and not what it is for |
| `onEnd` | `() => void` | — | called once when the moment is reached. A moment already past at mount is reported once after mount, so an application that keeps the moment across a reload or a remount learns that it has passed. Never called on a server |
| `announce` | `boolean` | `false` | says the time left in a polite line at one minute and at ten seconds ([A11y](#a11y)). Off, nothing is said |
| `locale` | `string` | — | the locale rail: `Intl` writes the digits and the words; the page's own when absent |
| `messages` | `{ mark: (label: string, time: string) => string }` | English | the localization seam: `mark` joins the label and the time left in words for the announced line. The English default writes "label: time", "Time until the code expires: 1 minute" |

Attributes: `data-ended` on the root once the time left is zero. The rest state carries none.

`until` is a moment and not a number of seconds. A number of seconds starts again on every
render and on every remount, and a timer that counts down by subtraction drifts behind a
throttled background tab. A server that answers "retry after 30" gives a number of seconds; the
application turns it into a moment once, where it receives the answer
(`new Date(Date.now() + seconds * 1000).toISOString()`), and keeps that moment. There is no
`seconds` prop for that reason.

There is no `endLabel` and no children. At the end the member draws `0:00`, which is true. The
application holds the ended state that `onEnd` gives it, to enable its control, and in the same
render it removes the countdown or replaces the sentence around it, as the applications that
count to a moment do: their "Try again in 30 seconds" line goes once the button is enabled.

## Time and rounding

The time left is whole seconds, rounded up: `0:01` through the last second, `0:00` exactly at
the moment. It is read from the clock (`Date.now()`) at every change and never counted down by
subtraction, so a late timer, a throttled tab or a changed system clock cannot make it drift.

- **Under an hour:** `m:ss`, minutes without padding, seconds in two digits (`4:59`, `0:09`).
- **From an hour:** `h:mm:ss` (`1:02:05`). Hours are not grouped (`1000:00:00`).
- **Numerals** are the locale's, from `Intl.NumberFormat` (`٤:٥٩` in `ar-EG`). The separator is
  the colon in every locale.

The engine's `countdownClock` writes the digits and `countdownSpoken` the words, so every
framework's Countdown writes the same text.

**On iOS and Android** the time left is read from the clock at each whole second of the time
left, as the page clock reads it, and the end is reported once. SwiftUI writes the locale's
numerals and the platform's duration words. The Compose member module reaches no locale-aware
formatter, so on Android the digits are Western and the words are `PMStrings`' English, which an
app translates, and an instant written without an offset is read in UTC, as RelativeTime reads
it.

## Ticking

One clock per page, not one per Countdown. It holds one timer, and the timer wakes when a
Countdown's time left reaches its next whole second, so a Countdown changes on the second of its
own time left and not on a second counted from when it mounted. Two Countdowns that count to one
moment change at the same wake. A Countdown that has ended sets no timer.

While the document is hidden, the browser throttles timers and nobody sees the seconds. The
clock then waits only for the nearest end, so `onEnd` is still called, as late as the browser
lets the timer run. When the document is shown again, every Countdown reads the clock at once,
before its next second, and the seconds resume.

A server render writes the time left at the moment it renders. The browser follows the clock
from mount, and its time left differs from the server's by the time between the two, so each
renderer lets the time differ while it hydrates and draws the browser's before the first tick:

- **React** keeps the server's markup while it hydrates (`suppressHydrationWarning` on the
  elements whose text or attributes hold the time) and then replaces its own element with the
  browser's, so React reports no mismatch.
- **Vue** writes the browser's text and attributes while it hydrates. The root and the timer
  carry `data-allow-mismatch`, Vue's own attribute, so it reports no mismatch. The other
  frameworks ignore the attribute.
- **Svelte** and **Angular** write the browser's text and attributes while they hydrate.
- **Solid** keeps the server's text while it hydrates and writes the browser's at the clock's
  first reading after mount: each reading is a new value, which the template reads directly.

## Recipe

| Part | Tokens |
| --- | --- |
| root | inherits the surrounding step and colour; `position: relative`, so the hidden text is clipped inside it |
| digits | `--pm-font-numeric` (the theme's tabular figures), so the text keeps its width as the digits change |
| words, status | the visually hidden convention (`conventions/a11y.module.css`) |

Like RelativeTime, it takes the step and colour of the text around it: in a `Text` it is the
paragraph's size, in a table cell the cell's.

## States

| Entry | Render | Expect |
| --- | --- | --- |
| minutes | 299 seconds ahead (computed at render) | "4:59" · no `data-ended` |
| hours | 3725 seconds ahead | "1:02:05" |
| ended | 5 seconds back | "0:00" · `data-ended` |
| locale | 299 seconds ahead, `locale="ar-EG"` | "٤:٥٩" and Arabic words |
| announced | 65 seconds ahead, `announce` | an empty `role="status"` region from mount |
| beside a Button | a Text "Send a new code in 0:30", and a Button the application enables at `onEnd` | the composition |
| invalid | `until="not-a-moment"` | renders nothing |

`requiredSelectors`: none. Every state comes from `until`, and nothing in the member can be
pressed or focused.

Each moment is computed at render a fixed distance ahead of now, as RelativeTime's fixture
computes its values, so a gallery cell and a screenshot start from the same time left. The cells
then tick.

## Motion

None. The digits change every second, which is the member's content, and nothing animates
between them. Reduced motion has nothing to remove.

## Icons

None. A countdown sits in a sentence or beside a control, which says what it counts to.

## A11y

The timer is `role="timer"`, named by `label`. Its live setting is `off` by role, so a screen
reader does not hear every second. The time is written for assistive technology in words, from
`Intl`'s unit names ("4 minutes, 59 seconds"), because digits with a colon are read as "4 colon
59" or as a time of day. The digits are hidden from assistive technology. A reader who moves to
the timer hears its name and the time left in words.

**Nothing is announced by default.** A resend that unlocks in thirty seconds needs no voice:
the reader waits, and the application announces what the end means (a Button that becomes
enabled, a Toast). With `announce`, a visually hidden `role="status"` region, present from mount
so its first line is heard, says `messages.mark(label, time)` politely twice: when one minute is
left and when ten seconds are left. A count that starts below a mark does not announce it, and
the end is not a mark, because what the end means is the application's to say through `onEnd`.

The marks come from two criteria. WCAG 2.2.1 (Timing Adjustable) asks that a reader be warned
before a time limit expires and given at least 20 seconds to extend it. The one-minute line is
that warning, for an application that offers to extend the limit; the ten-second line is the
last notice. WCAG 4.1.3 (Status Messages) asks that such a message reach assistive technology
without moving focus, which a polite status region does. Announcing every second would fail
the reader in another way: each announcement interrupts what they are reading.

The member does not adjust, extend or stop a time limit. Those are the application's, through
its own controls, because the application owns the moment.

```contract
role timer timer
name timer from label
attr root data-ended when ended
announces live:polite when announced
```

What the grammar cannot state is the shared law every web shell runs
(`@polymorph/conformance/countdown`): the digits and the words drawn at a moment, the change on
the second of the time left, `onEnd` once at the moment and once after mount for a past moment,
the correction when a hidden document is shown, and no announcement at each second.
