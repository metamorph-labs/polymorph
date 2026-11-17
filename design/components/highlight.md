# Highlight

The parts of a text that match a search, marked: a result's title with the words the reader
typed in it, or a row whose text the search engine matched. It is phrasing content. It sits
inside a Text, a table cell or a description's detail and takes the font, the size and the
colour of the text around it. Use it wherever an app would otherwise print the matches it
received as data, or draw none.

Highlight marks and does nothing else. It finds nothing: the app passes the query the reader
typed, or the ranges its search engine returned, and the member marks them. It is not Diff,
which marks what changed between two values, and not Text's `strong`, which is emphasis the
writer chose. It has no substrate: it is a span and `<mark>` elements, and one function. That
function is the engine's `highlightRuns`, which every framework's Highlight calls, so the same
text and the same query mark the same characters everywhere.

## Anatomy

```
[root — <span>]
  the text, cut into runs:  [plain text] [mark — <mark>] [plain text] …
```

## API

```ts
interface HighlightProps {
  text: string // the text, drawn whole
  query?: string | string[] // terms marked wherever they occur, as written, never as a pattern
  ranges?: [number, number][] // [start, end] offsets a search engine returned, end exclusive
  locale?: string // the locale that folds case for `query`; omitted, the runtime's
}
```

Attributes: none. The root and the marks are what they are by their elements.

**A query** is one term or several. Each is matched as written: `a.b` matches the three
characters `a.b` and nothing else, because a reader who types a dot means a dot. Each term is
trimmed, and an empty term marks nothing, so a field that holds only spaces marks nothing. A
term with a space in it is matched with the space, as one phrase. The member does not cut a
query into words: which words a search matched is the search's decision, so an app that
searches by word passes the words (`query.split(/\s+/)`).

**Case** is folded on both sides, one character at a time, in `locale`: each character's upper
case, lowered. The round trip folds the forms lower case alone keeps apart (Greek's final `ς`
and `σ`; `ß` and `ss`), and the locale decides the letters that differ by language: in
Turkish, `I` folds to the dotless `ı`, so `ıstanbul` matches `ISTANBUL` and `istanbul` does
not. A locale the runtime cannot read folds as the root locale does. A mark always covers
whole characters of the text, even where folding changes a length. Accents are not folded and
Unicode forms are not normalised: a search that ignores them returns `ranges`.

**Ranges** are offsets into `text` as JavaScript counts a string (UTF-16 code units), from 0,
with the end exclusive. An engine that counts bytes or code points converts first. With
`ranges`, `query` is not used, because the engine said where its matches are: it may have
matched a stem or a misspelling that the literal query would miss, or skipped a word the query
would mark. An empty list of ranges is an engine saying nothing matched, and marks nothing.
A range is read as safely as it can be drawn:

- ends that are not whole read as the whole number below them;
- a range that starts before 0 starts at 0, and one that runs past the end is cut at the end;
- an empty range, a reversed one, and one whose ends are not numbers are dropped;
- an end inside a character that takes two code units moves out to the whole character.

**Marks that overlap or touch are one mark**, whether they come from ranges or from several
terms: `abc` and `bcd` in `abcdef` mark `abcd`. Two marks side by side would draw as one, and
a screen reader is told nothing about either.

An empty `text` renders nothing. A text with no match is the text as it is.

## Where it is placed

A Highlight goes wherever a member takes content: in a `Text`, in a `Table.Cell`, in a
DataTable column's `cell`, in a DescriptionList item's `detail`, in an Alert's body. A prop
typed `string` does not take it: List.Item's `title` and `description`, a Combobox option's
`label`, a Command item's `label`, and Code's `children`. Those props are strings because the
member reads them as text: List.Item's title is the name of its link or button, and a Combobox
option's label is what its filter reads.

## Recipes (exact tokens)

The root sets no font, size or colour and draws no box, so it takes the text it sits in. A
mark brings its own fill and its own text colour. Its pair, `warning.text` on
`warning.subtle`, is one the contrast law measures in every pairing and in both modes, so a
mark is readable on any surface it lands on: a page, a raised panel, a selected row. The
accent wash means "chosen" and the selection fills mean "selected" (`README.md`, "Selection
treatment"), so neither may mean "matched". The warning wash is the highlighter's colour.

| Part | Tokens |
| --- | --- |
| root | inherits the surrounding family, step and colour · wraps as the text around it wraps · `unicode-bidi: isolate`, as Diff's inline form is: the text is data in any script, and its direction must not reorder the words around it |
| mark | `--pm-warning-text` on `--pm-warning-subtle` · weight `--pm-text-xl-weight`, Text's emphasis weight · radius `--pm-radius-sm` · `box-decoration-break: clone`, so a mark that wraps keeps its ends on every line · no padding, so marking a word moves no other word · not an isolate, because a mark may cut a word and the word keeps its order across it |

**Colour is not the only mark.** A mark is set at the emphasis weight as well as on its wash.
The weight stays where the fill matches the surface under it, as in a warning Alert's body,
and in forced colours, where the browser replaces the page's colours with the system's.

## States

| Entry | Render | Expect |
| --- | --- | --- |
| a query | `text="Invoice 2026-118 replaces the draft invoice" query="invoice"` | both occurrences marked, whatever their case |
| several terms | `query={['north', '2026']}` | each term marked |
| ranges from a search engine | `ranges={[[0, 7], [12, 19]]}` | the two ranges marked |
| no match | `query` that does not occur | the text as it is, no mark |
| case folded in the page's locale | `text="İSTANBUL OFİSİ" query="istanbul" locale="tr"` | `İSTANBUL` marked |
| in a sentence | inside a secondary `Text` | the sentence's family, step and colour |
| in a Table cell | three rows of ticket subjects, each a Highlight | — |
| in an Alert | inside a warning Alert's body | the weight marks it on the same wash |

`requiredSelectors`: none. A Highlight has no interactive state.

## Motion

None. A mark appears with its text, as the reader types, and a transition on every keystroke
would delay the result the reader asked for.

## Icons

None.

## A11y

A screen reader reads the text once, whole, as it is. A mark has `role="presentation"`, so it
is not announced: browsers expose `<mark>` as a role of its own, and a screen reader that reads
it says "highlighted" before each match and "out of highlighted" after it, which in a list of
results is noise. The reader typed the query and knows what was searched for, and the result's
own text is what they came to hear. The member writes no words of its own, so it takes no
`messages`. The element stays `<mark>`, the element for text marked for reference, so a reader
that styles a page itself still finds the marks.

The marks do not change the text: a copy takes the text as it is, and a search in the page
finds it.

```contract
role mark presentation when a query — every occurrence marked, whatever its case
```

A native renderer has no `<mark>`: it draws the same runs as attributed text, the marks on
the same wash and at the same weight, and its accessibility label is the text as it is. A
run's background has no corner radius in SwiftUI's `Text` or Compose's `AnnotatedString`, so
a native mark's wash is square, as Markdown's code spans are there.
