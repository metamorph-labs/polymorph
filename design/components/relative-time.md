# RelativeTime

Shows a moment as a real `<time>`, with the exact moment in `dateTime`: by default the distance
from now such as "2h ago", from `Intl.RelativeTimeFormat`; with `mode`, the moment itself, from
`Intl.DateTimeFormat`, or both. The words follow the locale rail. Use it for timestamps in lists,
tables and running text.

It has no substrate. Its style comes from Relay's ticket queue (the hand-written `relativeTime`
ladder in `apps/workbench/src/relay/tickets.ts`), which is why the rules below are as they are.

RelativeTime is inline text, not a widget: it draws no decoration, has no type step and fully
inherits the surrounding text. It is also not Timeline's `time`. That prop stays an
app-formatted string, by Timeline's own decision (Timeline displays a time but does not decide
its format). RelativeTime is for the app's own JSX, where the app does decide and wants the
decision made once, localized by `Intl` instead of by an English suffix hard-coded in a fixture.
It takes no formatter callback either (as with charts' `ValueFormat`: closed descriptors on
components, never callbacks). Its words are the engine's `relativeTimePhrase`, which an app calls
only for a string prop that takes app-formatted text ([Its words in a string](#its-words-in-a-string)).

The absolute form is a mode of this member, not a member of its own. Both forms read one `value`
by the same rules, write it in one `<time>`, take the same `locale` and `format`, and never
refresh, so a second member would repeat every one of those decisions.

## Anatomy

```
[<time dateTime={value}>] — the formatted phrase
```

## API

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `value` | `string` | required | ISO-8601. The chart tier's calendar-date rules apply unchanged (`docs/charts.md`): a date-only string is a **calendar date**, parsed without timezone shifting, so "2026-08-04" is the 4th in every timezone. A full timestamp respects its offset |
| `locale` | `string` | — | the locale rail: locale is a prop, `Intl` formats; absent, the runtime's resolved locale, not the document's `lang` |
| `numeric` | `'auto' \| 'always'` | `'always'` | `Intl.RelativeTimeFormat`'s own option, read by the relative words only. The default suits the member's main use: people scan queue metadata, and a uniform "1 day ago" column is easy to scan. Prose surfaces pass `'auto'` and get "yesterday" |
| `format` | `'long' \| 'narrow'` | `'narrow'` | Intl's `style` option, without `'short'` (a third option that looks the same as narrow adds API with no purpose). It is named `format`, not `style`, because `style` cannot be used in governed code: the governed-props law and the app-side `no-raw-styles` rule both treat a prop named `style` as raw CSS, and the laws stay simple instead of learning typed exceptions. `format` is also NumberInput's name for this kind of option. Narrow is Relay's own style ("2h ago") and the default, for the same scanning reason; long ("2 hours ago") is for sentences. In the absolute form it is the date's length: narrow is Intl's `medium` date ("Aug 4, 2026"), long its `long` date ("August 4, 2026") |
| `mode` | `'relative' \| 'absolute' \| 'both'` | `'relative'` | what it says: the distance from now, the moment itself ([The absolute form](#the-absolute-form)), or both, joined by `messages.both`: "Aug 4, 2026, 2:05 PM (2h ago)" in English. Named `mode`, ChoiceCard's and BarChart's word for the prop that picks a member's form. Which moments show as dates is the app's editorial decision, so the app picks it per use |
| `messages` | `{ both: (moment: string, distance: string) => string }` | English | the localization seam: `both` joins the moment and the distance in `mode="both"`, so a locale orders and punctuates them. The English default writes the moment, then the distance in parentheses |

Attributes: none. It has no state, no size and no tone.

## Rendering rules (the ladder)

Whole units only, because people scan a support queue, and "2h" is faster to scan than
"2h 11m".

- **Under a minute:** Intl's own "now" (unit `second`, value `0`, `numeric: 'auto'` for this
  step regardless of the prop). In a component that never updates, a count of seconds is out of
  date before anyone reads it, so "now" is the only accurate word. It is Intl's word, localized,
  not text from the vocabulary.
- **Then the largest unit with a count of at least one**: minutes to an hour,
  hours to a day, days to a week, weeks to a month, months to a year, then
  years. The count is the **nearest** whole unit (90 minutes is "2 hours ago", Relay's own
  rounding). A count that reaches the next unit's threshold moves up to that unit: 59 minutes 40
  seconds is "1 hour ago", never "60 minutes ago".
- **Date-only values use days and larger units only**, because a calendar date has no time of
  day to measure hours from. A date with no distance is Intl's own "today" (`numeric: 'auto'`
  for this step, as for "now"). Distance is measured between calendar dates in the reader's timezone
  (with `@internationalized/date`, as in charts).
- **The future is allowed**: the sign passes through Intl unchanged, so a due date reads "in 2
  days".
- **An unparseable value renders nothing**, with a dev warning, because a moment that cannot be
  parsed has no correct phrase. Timeline does the same: an empty item renders nothing, not a
  placeholder.

**No refresh at all.** A page of self-updating timestamps is ambient motion that nobody asked
for. The motion rules reserve ambient loops for loading indicators, and a wall of timestamps
changing from "2m ago" to "3m ago" is motion the user did not ask for. The phrase is as
current as the render that produced it, and an app that needs fresher values re-renders on its
own schedule. There is no `refresh` prop, so the option is visibly absent, not just off by
default.

## The absolute form

`mode="absolute"` writes the moment with `Intl.DateTimeFormat` in `locale`. The date and time
styles are a fixed pair, not props, so the decision is made once (charts' `ValueFormat` rule):

- **An instant is a date and a time.** The date is Intl's `medium` style under `format="narrow"`
  ("Aug 4, 2026, 2:05 PM") and its `long` style under `format="long"` ("August 4, 2026 at 2:05
  PM"). Medium names the month, so a day and a month are never confused across locales as the
  numeric `short` style confuses them ("4/8"). The time is Intl's `short` style: no seconds, for
  the ladder's reason (people scan whole units). There is no `full` style, because a weekday
  makes a scanned column longer and says nothing the date does not.
- **The renderer's time zone.** An instant is written in the zone of the runtime that renders
  the member, Intl's default, as the relative form measures from that runtime's now. In a
  browser that is the reader's zone. Under server rendering, and in a React server component,
  it is the server's, so an app that renders on a server and must show the reader's zone renders
  the absolute and `both` forms only in the browser: from a client component once it has mounted
  (React), or after mount in the other frameworks, with the relative form or nothing until then.
  The offset the value carried stays in `dateTime` either way. A calendar date has no zone, so it
  reads the same wherever it renders.
- **A calendar date is the date alone**, with no time of day and no zone shift: "2026-08-04" is
  "Aug 4, 2026" everywhere.

`mode="both"` writes the moment and the relative phrase, joined by `messages.both`. The English
default writes the moment, then the phrase in parentheses: "Aug 4, 2026, 2:05 PM (2h ago)". The
moment comes first, because `both` is for a place where the exact moment matters, and the phrase
is the reading aid. Parentheses read as an aside, and a screen reader pauses at them; a separator
glyph is read aloud by some screen readers. A locale whose order or punctuation differs passes
`messages` from its catalog, as every member that writes words takes them. `numeric` applies to
the phrase.

An unparseable value renders nothing in every mode.

## Its words in a string

`relativeTimePhrase(value, { locale, numeric, format, mode, messages })`, from `@polymorph/engine` and
re-exported by every web foundation, returns the text RelativeTime renders for those props, or
`null` for a value that is not a moment. Every web renderer's RelativeTime calls it, so the words
are the member's. An application calls it only where a member takes app-formatted text, such as
Timeline's `time`, so a timestamp there reads as RelativeTime reads elsewhere. In the app's own
JSX it renders the member, which also writes the `dateTime` a string cannot carry.

```ts
import { relativeTimePhrase } from '@polymorph/engine'

const time = relativeTimePhrase(event.at, { mode: 'absolute' }) ?? ''
```

## Recipe

| Part | Tokens |
| --- | --- |
| root | inherits the surrounding step and colour entirely; no tokens of its own |

That is the whole recipe, and it is deliberate. Timeline sets its `time` in muted `text.xs`
because Timeline owns that column. A RelativeTime in a table cell takes the cell's `text.sm`, and
in a Text block it takes the block's step. It always matches the text around it.

## States

| Entry | Render | Expect |
| --- | --- | --- |
| minutes | 5 minutes back (fixture computes from a pinned now) | "5m ago" · `dateTime` = the ISO value |
| hours | 2 hours back | "2h ago" |
| days, long | 3 days back, `format="long"` | "3 days ago" |
| auto | 1 day back, `numeric="auto"` `format="long"` | "yesterday" |
| calendar date | `value="2026-08-04"` | day-unit phrase; never hours |
| due date | 2 days forward | "in 2 days" |
| just now | 20 seconds back | Intl's "now" |
| absolute | 2 hours back, `mode="absolute"` | the medium date and the short time |
| absolute calendar date | `value="2026-08-04"` `mode="absolute"` | "Aug 4, 2026" · no time |
| both | 2 hours back, `mode="both"` | the date and time, then "(2h ago)" |
| invalid | `value="not-a-date"` | renders nothing |

`requiredSelectors`: —.

Fixtures pin "now" with fake timers, because a fixture that changes with the clock makes its
screenshots go stale.

## Motion

None, and this is a deliberate rule: the only motion a timestamp could have is ticking, and this
member does not tick.

## Icons

None. The `time` icon role exists for surfaces that need a glyph; a timestamp
inside running text does not.

## A11y

`<time dateTime>` gives assistive tech and machines the absolute moment while everyone reads the
same words. There is no `title` tooltip with the exact date, because a native tooltip cannot be
reached by touch or keyboard, and Tooltips must never be the only place essential information
appears. When the absolute moment matters, the app passes `mode="absolute"` or `"both"`, which
write it as text, because which moments matter is an editorial decision.

## On Android

The Compose member reaches no time zone and no locale's time format: its module's common source
set imports neither. An app provides its words through `LocalPMRelativeTimeWords`, from the
platform's formatter in the reader's zone. Unprovided, the absolute form writes Material 3's
medium date whatever `format` says, because Material's formatter writes no long date without a
weekday, and an instant adds a 24-hour time in UTC, said as UTC: "Aug 4, 2026, 14:05 UTC".
