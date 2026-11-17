# Badge

Badge is a read-only micro-label for status and category, and is never clickable;
TagInput owns removable chips. It uses the system's overline style: uppercase `text.xs`,
with emphasis from case and tracking, never an invented weight (conventions §6).

Badge has two more forms, each in the text's place. A **count** is a number, such as the
unread items in an inbox or behind a bell. A **dot** is a mark with no number, for
"something is new". Neither is a new member: each is a Badge with the same tones, read in
the same places (a NavItem's `end`, a List item's `trailing`, a Table cell), and Button
draws a count on its corner through `count` (`button.md`).

## Anatomy

```
[root <span>]  [icon?]  [text]
count:  [root <span data-count>]  [the number, or "99+"]
dot:    [root <span data-dot>]  [spoken text?]
```

## API

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `variant` | `'soft' \| 'solid' \| 'outline'` | `'soft'` | |
| `tone` | `'neutral' \| 'accent' \| 'danger' \| 'warning' \| 'success' \| 'info'` | `'neutral'` | every cell of the grid is allowed (3 × 6) |
| `icon` | `IconRole` | — | leading, `sm`… see Dimensions |
| `children` | `string` | — | short text, no wrapping; text long enough to ellipsize (past ~2 words) is a caller bug. Required unless `count` is given. A dot does not draw it: it is the dot's name for assistive technology |
| `count` | `number` | — | the count form: the number in the text's place. Above `max` it draws as `max` followed by `+` ("99+"). Zero or less, or `NaN`, draws nothing. With `count`, `children` and `icon` are not drawn |
| `max` | `number` | `99` | the largest count drawn as it is |
| `dot` | `boolean` | `false` | the dot form: a round mark with no text. `icon` is not drawn |

Attributes: `data-variant`, `data-tone`; `data-count` on a count and `data-dot` on a dot.

**Zero draws nothing.** No unread items is the absence of the mark, and a "0" beside every
read inbox would be a mark that means nothing. A view that must say "none" says it in text.
Tabs' `count` is not this form: a tab's count says how many rows the view holds, so a tab
writes `0`.

**The count draws digits as JavaScript writes them** (`String(count)`), as Tabs' count does,
with no grouping and no locale: a count is capped at `max`, which is two digits by default.
The plus sign is a symbol, not a word.

**The dot's words.** A dot has no visible text, so `children` is what a screen reader hears
in its place ("New"), drawn visually hidden. Read inside a NavItem or a List item, the words
join the row's name ("Changelog New"). A dot with no `children` is hidden from assistive
technology, which is lawful only where the control it sits on already says the same thing in
its own name. A Badge is never the only carrier of its meaning, in this form or any other.

## Dimensions

Inline-flex; padding `--pm-space-1` `--pm-space-3` (2×8); radius `--pm-radius-sm` (a
sharp theme gives a square tag, which is intended); text `text.xs` quartet +
`text-transform: uppercase`; icon `--pm-icon-size-sm` (14), icon–text gap
`--pm-space-1`. Border, where present, `1px solid`.

| Form | Box |
| --- | --- |
| count | `text.xs`, in a box as tall as the step's size plus `--pm-space-2`, not a whole line, so it fits the corner of an icon-only Button; figures and a plus sign have no descenders, so the shorter box clips nothing · padding-inline `--pm-space-1` · centred · never narrower than it is tall, so one figure is a square · `font-variant-numeric: --pm-font-numeric` (tabular figures in every system), so a count that changes keeps its width · the variant × tone cell's colours, unchanged |
| dot | `--pm-space-3` square · no padding, no border · radius `--pm-radius-pill` in every geometry, because a dot with corners reads as a checkbox or a stop · fill: the tone's solid colour (below) whatever the variant, because a soft or outline fill is too faint to be seen as a mark of its own |

## Recipes (exact tokens)

### variant="soft" (default)

| Tone | bg | text |
| --- | --- | --- |
| neutral | `--pm-bg-subtle` | `--pm-text-secondary` |
| accent | `--pm-accent-subtle` | `--pm-accent-text` |
| danger | `--pm-danger-subtle` | `--pm-danger-text` |
| warning | `--pm-warning-subtle` | `--pm-warning-text` |
| success | `--pm-success-subtle` | `--pm-success-text` |
| info | `--pm-info-subtle` | `--pm-info-text` |

### variant="solid"

| Tone | bg | text |
| --- | --- | --- |
| neutral | `--pm-bg-inverse` | `--pm-text-inverse` |
| accent | `--pm-accent-bg` | `--pm-accent-contrast` |
| danger | `--pm-danger-solid` | `--pm-danger-contrast` |
| warning | `--pm-warning-solid` | `--pm-warning-contrast` |
| success | `--pm-success-solid` | `--pm-success-contrast` |
| info | `--pm-info-solid` | `--pm-info-contrast` |

### variant="outline"

Transparent bg; border + text:

| Tone | border | text |
| --- | --- | --- |
| neutral | `--pm-border-default` | `--pm-text-secondary` |
| accent | `--pm-accent-bg` | `--pm-accent-text` |
| danger | `--pm-danger-border` | `--pm-danger-text` |
| warning | `--pm-warning-border` | `--pm-warning-text` |
| success | `--pm-success-border` | `--pm-success-text` |
| info | `--pm-info-border` | `--pm-info-text` |

### dot

| Tone | fill |
| --- | --- |
| neutral | `--pm-bg-inverse` |
| accent | `--pm-accent-bg` |
| danger | `--pm-danger-solid` |
| warning | `--pm-warning-solid` |
| success | `--pm-success-solid` |
| info | `--pm-info-solid` |

## States

| Entry | Render | Expect |
| --- | --- | --- |
| all 18 variant×tone cells | text "Active" | `data-variant`, `data-tone` |
| with icon | `icon="time"` soft/neutral | — |
| a count | `count={3}` solid/accent | `data-count`, text "3" |
| a count past its cap | `count={128}` solid/accent | text "99+" |
| a dot | `dot` accent, `children="New"` | `data-dot`; the words visually hidden |
| a dot in every tone | the six tones in an Inline | — |
| a count in every variant | `count={12}` soft, solid, outline | — |

`requiredSelectors`: — (static; no interactive states).

## Motion / Icons / A11y

No motion. Icon per prop, decorative. Plain text semantics. A Badge's meaning must also
be available in accessible context: its text is real text, and colour is never the only
signal, because the label carries the meaning. A count is its digits, read as text. A dot
is read as its `children`, or not at all when it has none (see the API).
