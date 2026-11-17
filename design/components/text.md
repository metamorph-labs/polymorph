# Text

A paragraph of body text. Application code uses it for every paragraph.

It is a member for the same reason Heading is: the workbench and the docs site both need
it, and without a member each would implement its own. A bare `<p>` in an app renders
unstyled by design, because recipes have no element selectors.

## Anatomy & API

```
<p> — one paragraph. Inline emphasis comes from children (<strong>, Code).
```

```ts
interface TextProps {
  size?: 'sm' | 'md' // default 'md'
  tone?: 'primary' | 'secondary' // default 'primary'
  lines?: number // the most lines it draws, the last ending with an ellipsis; default: every line
  children: ReactNode
}
```

**`lines`** keeps the paragraph to that many lines: `1` for a name or an address in a row,
`2` or `3` for a description under a title. The last line ends with an ellipsis. A word
longer than the line breaks, so a long id, hash or address is cut at the last line and never
widens what holds it. A value that is not a whole number reads as the whole number below it,
and below 1 nothing is cut. Without `lines` the paragraph draws every line, as before.

Attributes: `data-size`, `data-tone`, and `data-lines` with the count while `lines` cuts.

**Only the drawing is cut.** The whole text stays in the document, so a screen reader reads
all of it, a search in the page finds it, and a selection copies it. The rule for a sighted
reader: a Text with `lines` holds text whose whole is reachable another way, without a hover.
The page or the detail view the row opens shows it in full, as a Breadcrumbs crumb leaves a
long title to the page it names (`breadcrumbs.md`), or a CopyButton beside an id copies it. A
text that has nowhere else to be read in full is not cut. The member opens no tooltip and
writes no `title`: a native tooltip cannot be reached by touch or keyboard
(`relative-time.md`), and a Tooltip is never the only carrier of essential information
(`README.md`, "A11y baseline").

**Heading and Code do not take `lines`.** A heading names the section under it, and a name
cut short names nothing; a long title wraps, and the members whose titles are cut
(ArtifactPane, a Breadcrumbs crumb) cut them in their own anatomy. Code is inline, so it takes
its lines from the Text around it: `<Text lines={1}><Code>{id}</Code></Text>` cuts an id at
one line, because Code's long strings already break where they overflow (`code.md`).

## Recipe (exact tokens)

| Part | Tokens |
| --- | --- |
| base | `text.{size}` quartet · `--pm-text-{tone}` · margin 0 |
| `strong` within | `--pm-text-xl-weight` · `--pm-text-primary`; emphasis uses a heavier weight and the primary colour, whatever the paragraph's tone (as in the docs app's Prose) |
| `lines` | `display: -webkit-box` · `-webkit-box-orient: vertical` · `-webkit-line-clamp` from `--pm-text-clamp`, which the member sets from the prop on the element, because a count is data and not a design value · `overflow: hidden` · `overflow-wrap: anywhere` |

There is no measure (line-length cap), on purpose. A cap needs a `--pm-measure` token,
which is an engine capability, not a recipe literal. A `65ch` literal here would make
that decision without the token.

## States

| Entry | Render | Expect |
| --- | --- | --- |
| body | `<Text>…</Text>` | text.md size, primary color |
| secondary sm | `<Text size="sm" tone="secondary">…</Text>` | text.sm size, secondary color |
| with emphasis | `<Text>… <strong>kept</strong> …</Text>` | strong at xl weight, primary |
| with inline code in it | `<Text>Set <Code>…</Code> …</Text>` | — |
| one line | `lines={1}`, a sentence longer than the line | `data-lines="1"`; one line, an ellipsis at its end |
| three lines | `lines={3}`, a paragraph longer than three lines | `data-lines="3"`; three lines, an ellipsis at the end of the third |
| an id on one line | `lines={1}`, a 64-character hash in a Code | the hash cut at one line; nothing scrolls sideways |

`requiredSelectors`: —.

## Motion — none. Icons — none. A11y — a real `<p>`; tone never drops below
secondary (muted prose is a caption, and captions belong to the components that
own them). A paragraph cut by `lines` is read whole (see `lines` above).

## On iOS and Android

SwiftUI sets `lines` as the line limit of the text the app passes, with the tail truncated, and
a screen reader still reads the whole text. Compose's `Text` takes its line limit as an
argument and no composition local carries one, so a member cannot set it on the text an app
passes: the Compose Text does not draw `lines`, and an app that cuts a paragraph there passes
`maxLines` and `TextOverflow.Ellipsis` to its own `Text`.
