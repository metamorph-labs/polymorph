# Timeline

A vertical list of dated past events, such as a ticket's history or an audit trail of who
did what and when. It has no substrate: it is a list, a marker column and a rule.

Timeline shows *what already happened*; Stepper shows where the reader is in a flow they
are still going through. Every entry is in the past. Nothing is active or upcoming, and
no entry is a control, because a past event cannot be acted on. A row that can be acted
on is not an event.

Timeline displays time but does not format it. An entry's `time` is a string the
application has already formatted, for example with Relay's `relativeTime`, an `Intl`
call, or "14 Mar". If the component chose a date format, it would be making a product
decision inside the vocabulary, and every product would need a way to override it.

## Anatomy

```
[root — <ol>]
  [event <li>]*
    [marker — mark: dot | Icon; rule ↓]   (aria-hidden)
    [copy: [title] [time] [detail?]]
```

## API

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `events` | `TimelineEvent[]` | required | in the order they should be read; Timeline draws the sequence it is handed and never sorts it. Empty renders nothing |
| `label` | `string` | required | names the list for a reader — "Ticket history", not "Timeline" |

```ts
interface TimelineEvent {
  title: string // what happened, in the product's words
  time: string // already formatted by the application
  detail?: string // the body — a reply's first line, the reason for a change
  icon?: IconRole // absent draws a plain dot
  tone?: 'neutral' | 'accent' | 'info' | 'success' | 'warning' | 'danger'
}
```

Attributes: each event carries `data-mark="dot|icon"`; a toned event also carries
`data-tone`. Neutral is the rest tone and sets no attribute.

## Recipes (exact tokens)

Tone adds emphasis and never carries meaning. The marker column is `aria-hidden`, so a
signal carried only by the mark would not reach screen-reader users. `title` says what
happened and the colour matches it. Stepper's number follows the same rule.

| Part | Tokens |
| --- | --- |
| marker column | `--pm-space-6` wide; mark and rule share its centre |
| mark, icon | `--pm-space-6` square · radius `--pm-radius-pill` · Icon `sm` |
| mark, dot | `--pm-space-3` square · radius `--pm-radius-pill` · offset `calc((--pm-space-6 - --pm-space-3) / 2)`, which centres both mark types on one axis at every density |
| mark neutral | icon: bg `--pm-bg-subtle`, `1px solid --pm-border-default`, glyph `--pm-text-secondary` · dot: `--pm-border-strong` |
| mark accent | icon: bg `--pm-accent-subtle`, border `--pm-accent-bg`, glyph `--pm-accent-text` · dot: `--pm-accent-bg` |
| mark status | icon: bg `<tone>.subtle`, border `<tone>.border`, glyph `<tone>.text` · dot: `<tone>.solid` — for `info`, `success`, `warning`, `danger` |
| rule | `1px` of `--pm-border-subtle`, `--pm-space-2` clear of the mark, absent on the last event |
| title | `text.sm` quartet · `--pm-text-primary` |
| time | `text.xs` quartet · `--pm-text-muted` · top gap `2px` |
| detail | `text.sm` quartet · `--pm-text-secondary` · top gap `--pm-space-2` |
| spacing | copy's bottom padding `--pm-space-5` on all but the last event; the rule spans it, so it reaches the next mark whatever the copy's height · marker ↔ copy `--pm-space-3` |

The copy is one column on purpose. A timestamp beside the title would be a second column
that must collapse at some width, and a history often ends up in a narrow aside. This
layout works at every width.

## States

| Entry | Render | Expect |
| --- | --- | --- |
| a history | 4 events, mixed marks and tones | `aria-label="Ticket history"` |
| dots only | no `icon` on any event | every event `data-mark="dot"`, no `data-tone` |
| every tone | one event per tone, icon marks | the six marks |
| detail | with and without `detail` | — |
| one event | a single entry | no rule drawn |
| empty | `events={[]}` | renders nothing |

`requiredSelectors`: `[data-mark="dot"]`, `[data-mark="icon"]`,
`[data-tone="accent"]`, `[data-tone="info"]`, `[data-tone="success"]`,
`[data-tone="warning"]`, `[data-tone="danger"]`.

There are no pseudo-classes, because nothing here can be hovered, focused or pressed.
The list covers the attributes instead. Each tone value is listed so that it is proved to
have a recipe and not only a type. `neutral` is the exception, on purpose: it is the rest
tone, sets no attribute, and its recipe is the base rule.

## Motion

None, on purpose. Nothing in a Timeline changes state, because past events do not change.
Entries arrive with the page that fetched them, so there is no entrance to animate.

## Icons

Any `IconRole`, always decorative: the marker is `aria-hidden` and the title carries the
text. Relay uses `comment` for a reply, `user` for an assignment, `edit` for a field
change and `confirm` for a resolution.

## A11y

`<ol>` named by `label`, one `<li>` per event, no interactive descendants. The marker
column (mark and rule) is `aria-hidden`: a coloured dot cannot be read out, and it holds
nothing a screen-reader user would miss. Reading order matches the visual order: what
happened, when it happened, then the detail a reader may skip.

An empty Timeline renders nothing rather than an empty list. Saying "nothing here" is
EmptyState's job and the page's decision, not this component's.
