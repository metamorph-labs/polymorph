# Diff

A value that changed, shown as what it was and what it is. It has two forms. The `inline`
form is a short value, such as a name, a status or a version, inside a sentence or a cell:
the old value struck through, an arrow, the new value. The `lines` form compares two texts
of several lines, such as a configuration or a message body, line by line. Use it wherever
an app would otherwise write `old → new` as text, or show only the new side of a change.

It has no substrate: the inline form is `del`, `ins` and hidden words, and the lines form
is a list, a Button and one function. That function is the engine's `diffLines`, which every
framework's Diff calls, so the same two texts give the same rows everywhere.

Diff compares and does nothing else. It has no columns side by side, because two columns
need twice the width and a phone has none to give. It marks no words inside a line and
colours no syntax, because each is a second comparison or a grammar with a colour system of
its own. Nothing in it is edited, merged or accepted, and it compares two sides, never
three. It does not compare JSON as a tree: the app passes formatted text, one key per line.
It is not CodeBlock, which shows one text to read and copy, and not JsonTree, which browses
one value.

## Anatomy

```
inline:
[root — <span>]
  [spoken "from"] [before — <del>] [arrow →] [spoken "to"] [after — <ins>]     a changed value
  [spoken "added"] [sign +] [after — <ins>]                                    an addition
  [spoken "removed"] [before — <del>]                                          a removal
  the value, as text                                                           no change

lines:
[root — <section>, labelled]
  [rows — <ol>]
    [row <li>]*      [marker: + | − | empty] [spoken "added" | "removed"] [text]
    [run <li>]*      [toggle — Button, aria-expanded]
                     [lines <ol>]   (when open: the run's rows)
```

## API

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `before` | `string \| null` | — | the old value. Missing, `null` or empty means there was none, so with an `after` the change is an addition. An empty string reads as missing because it draws nothing a reader can see |
| `after` | `string \| null` | — | the new value. Missing, `null` or empty means there is none, so with a `before` the change is a removal. Equal sides are no change. With neither side the member renders nothing |
| `display` | `'inline' \| 'lines'` | `'inline'` | the form: a short value in running text, or two texts compared line by line. Named `display` because the member has no modes of behaviour, only two ways to draw one comparison |
| `label` | `string` | — | names the `lines` form, which is a region: "Workspace configuration", not "Diff". The `lines` form needs it, and a development warning says so when it is missing. The `inline` form does not use it, because it is text inside text that already has a name. The type stays one flat interface, because the description language states props by name and cannot make one depend on another |
| `context` | `number` | `3` | in `lines`, the unchanged lines kept beside each change. The unchanged lines past them are one row that shows them when pressed. `Infinity` keeps every line. A value that is not a count reads as the count below it, and never below none |
| `messages` | `DiffMessages` | English | the localization seam: every word the member writes itself |

```ts
interface DiffMessages {
  from: string // read before the old value of a changed value; default "from"
  to: string // read between the old value and the new one; default "to"
  added: string // read before a value or a line only the new side has; default "added"
  removed: string // read before a value or a line only the old side has; default "removed"
  unchanged: (count: number) => string // a collapsed run's Button; default "{n} unchanged lines"
}
```

**Localization.** The member has five strings of its own: the four hidden words and the
collapsed run's text. They are in `messages`, so an app can localize them, and an app
passes every key or none, so one Diff never mixes two languages. The run's text is a
function, because "12 unchanged lines" needs a plural rule and plural rules belong to the
app's catalog. `label` and both values are the app's.

Attributes: a row of the lines form carries `data-kind="added" | "removed"`, and an
unchanged row carries none, which is the rest state. A run's toggle carries `aria-expanded`
and, while its lines show, `aria-controls` naming them. The inline form carries no
attribute, because its elements say what it is.

## The line diff

`diffLines(before, after)`, from `@polymorph/engine` and re-exported by every web
foundation, returns one row for every line of both texts, in reading order:
`{ kind: 'same' | 'added' | 'removed', text, beforeLine?, afterLine? }`, with line numbers
from 1. Every renderer's Diff calls it, and an app may call it to count the changes it is
about to show.

- **Lines.** A text is split at `\n`, and `\r\n` reads as `\n`. A final line ending closes
  the last line and starts no empty one, so two texts that differ only in it have the same
  lines and show no change. A missing or empty text has no lines.
- **The comparison.** The lines the two texts start with in common and end with in common
  are unchanged without a comparison. The lines between are compared by their longest
  common subsequence, so the diff keeps as many lines as can be kept. Within one change the
  removed lines come before the added ones. The same two texts always give the same rows.
- **The bound.** The comparison fills one cell for every pair of an old line and a new line
  between the common start and the common end. Past 1,000,000 cells (`DIFF_LINES_LIMIT`),
  which is a thousand changed lines against a thousand, it is not computed: every old line
  between is removed and every new line between is added. That is a true diff and not the
  shortest one. The bound limits the time a comparison takes, whatever the input.

`diffRuns(rows, context)` groups the rows as the member draws them: runs of rows drawn as
they are, and collapsed runs of unchanged lines. A stretch of unchanged lines collapses
past `2 × context` lines between two changes, and past `context` lines before the first
change or after the last. A stretch that would hide one line is drawn instead, because the
row that stands for it would take the same space (Pagination's rule for a gap of one page).
Two texts with no change are one collapsed run.

**A list of ids** is compared by passing one id on each line: `ids.join('\n')` for each
side. Sort both sides the same way first, because the diff compares order as well as
membership.

## Recipes (exact tokens)

The inline form sets no font, size or colour. It sits on fills the contrast law holds only
for the text around it, such as an Alert's wash or a selected row, so it takes that text's
colour, and the strike is the mark. A status colour on those fills is a pair the law does
not measure.

The inline form and each of its values are bidi isolates, so the old value, the arrow and
the new value follow the direction of the line they sit in, whatever script the values are
written in. Without that, two Latin values on a right-to-left page would stay left to right
around an arrow that had been mirrored to point the other way.

The lines form is a code surface with CodeBlock's tokens. Its status wash stops at the
marker cell. The contrast law holds `{tone}.text` on `{tone}.subtle`, which is the marker's
glyph on its cell, and holds `text.primary` on no status wash, so a row's text stays on the
surface's own background.

| Part | Tokens |
| --- | --- |
| inline root | inherits the surrounding family, step and colour; wraps as the text around it wraps; draws no box · `unicode-bidi: isolate` |
| before | `text-decoration: line-through` · `unicode-bidi: isolate` |
| after | `text-decoration: none`, because a browser underlines `ins` and an underline in running text reads as a link · `unicode-bidi: isolate` |
| sign | the glyph `+` before an addition · margin-inline-end `--pm-space-1` *(the new value is not struck through and takes no colour, so the sign is the only mark a sighted reader has that the value is new)* |
| arrow | the glyph `→` · margin-inline `--pm-space-2` · mirrored (`scaleX(-1)`) under `[dir="rtl"]` |
| spoken | the visually hidden convention (`conventions/a11y`) |
| lines root | family `--pm-font-mono` · `text.sm` size and line-height · `--pm-text-primary` · bg `--pm-bg-subtle` · border `1px solid --pm-border-subtle` · radius `--pm-radius-md` · clipped to the radius |
| row | a grid: the marker's column `--pm-space-6`, then the text's, `minmax(0, 1fr)` |
| marker | centred · one line tall at least, so an empty line is still a row · not selectable, so copied lines carry no marks |
| marker, added | `+` · `--pm-success-text` on `--pm-success-subtle` |
| marker, removed | `−` · `--pm-danger-text` on `--pm-danger-subtle` |
| text | padding-inline `--pm-space-3` · `white-space: pre-wrap` · `overflow-wrap: anywhere`, so a long line wraps and the member never widens its container · `--pm-text-secondary` on an unchanged row, `--pm-text-primary` on a changed one |
| run | the toggle's bar: padding `--pm-space-1` `--pm-space-2` · rules `1px solid --pm-border-subtle` above and below, except at the list's own edges |
| toggle | Button `ghost/neutral/sm`, icon `expand` while closed and `collapse` while open, label from `messages.unchanged` |

Lines wrap where CodeBlock's scroll. A diff is read down its rows, and a row that scrolled
sideways would hide the change at its end.

**On Android**: a collapsed run's Button reserves the 48dp hit target in the layout, so the
run's bar is 48dp tall and its `--pm-space-1` padding, not `--pm-control-height-sm`. iOS keeps
the bar's height and extends the Button's hit region past it.

## States

| Entry | Render | Expect |
| --- | --- | --- |
| a changed value | `before="Draft" after="Active"` | `del`, the arrow, `ins`; read as "from Draft to Active" |
| an addition | `after` only | `+` and `ins`; read as "added …" |
| a removal | `before` only | `del` alone; read as "removed …" |
| no change | equal sides | the value as plain text |
| in a sentence | inside a Text | the text's family, step and colour |
| in an Alert | inside a warning Alert's body | the body's colour on the wash |
| in a Table cell | inside a Table.Cell, a changed row and an unchanged one | — |
| lines, one change in a long text | a configuration of several dozen lines with one value changed | two collapsed runs around the change and its context · `aria-label="Workspace configuration"` |
| lines, a list of ids | one id on each line | — |
| lines, every line changed | three lines against three | every removed line, then every added line |
| lines, every line kept | `context={Infinity}` | no collapsed run |
| lines, a new text | `after` only | every line added |
| lines, long lines | lines with no break, in a narrow box | the lines wrap; the box does not scroll sideways |

`requiredSelectors`: `[dir="rtl"]`.

## Motion

None. A collapsed run's lines appear at once, as JsonTree's children do. A run may hold
hundreds of lines, and a transition over that many rows delays the reader who asked for them.

## Icons

`expand` and `collapse`, decorative, on a collapsed run's toggle. The toggle's name is its
label, and the icon shows the state `aria-expanded` already exposes. The inline form's
arrow and the lines form's `+` and `−` are text glyphs, not icons, so they take the size of
the text they sit in.

## A11y

Colour is never the only mark. The inline form strikes the old value through, writes `+`
before a value that is new, and sets no colour. The lines form writes `+` or `−` beside each changed line.

Browsers do not announce `del` and `ins` reliably, so the member writes the words itself,
visually hidden: a changed value reads "from Draft to Active", an addition "added Active",
a removal "removed Draft". The arrow, the sign and the `+` and `−` markers are hidden from assistive
technology, because the words beside them say the same. An unchanged value is plain text,
because nothing about it needs saying.

The lines form is a `<section>` named by `label`, holding one `<ol role="list">`. It is a
list and not a table. A row is one statement, "added" and the line, and a list reads it in
one stop and says how many rows there are. A table would make the reader cross two cells
for each line and would want a header for a column that holds one glyph. The role is
written out because a list without markers loses its role in WebKit. Line numbers are not
drawn or read: a list of ids has none worth saying, and the rows' order is the text's.

A collapsed run is a list item holding a Button with `aria-expanded` and, while its lines
show, `aria-controls` naming the nested list that holds them. Pressing it shows or hides
the lines. The Button stays in place either way, so focus stays on it and never falls to
the page. Which runs are open is the reader's state, not the app's, so no prop holds it.

A native renderer has no `del`, `ins` or `aria-expanded`: it says the same words in the
element's accessibility label, and a run's toggle says "expanded" or "collapsed".

```contract
role root region when lines — one change in a long text
name root from label when lines — one change in a long text
role toggle button when lines — one change in a long text
name toggle from children when lines — one change in a long text
attr toggle aria-expanded=false when lines — one change in a long text
key Enter opens on toggle when lines — one change in a long text
key Space opens on toggle when lines — one change in a long text
```
