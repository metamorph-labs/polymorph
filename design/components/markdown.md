# Markdown

Renders Markdown, usually a model's reply, with the vocabulary's members under the screen's
theme. A `##` becomes Heading, a fence CodeBlock, backticks Code, pipes Table and brackets Link,
with no second stylesheet.

It has no substrate: it uses its own small, tolerant parser
(`@polymorph/engine/markdown`, `packages/engine/src/markdown/parse.ts`) and passes each shape to a member.

Markdown is *not* a document renderer. It draws a reply *inside* a page, so the reply's
shallowest heading is Heading level 2, whether the model wrote `#` or `##`. It never produces the
page's own `<h1>`. It is *not* StreamingText either. StreamingText keeps whitespace and draws no
structure, for text the app knows is prose. Markdown draws structure and collapses whitespace,
for text that may contain a heading or a fence. Syntax highlighting is a non-goal for CodeBlock,
so it is a non-goal here too.

**Streaming-tolerant by construction.** An open fence renders as a code block of what has arrived
so far. An unclosed `**` renders as two asterisks, and an unfinished link renders as its
characters. The caret sits at the end of the last content. The source is re-parsed on every
render. The parser is linear in its input, and a reply is a few kilobytes.

**Safe by construction.** Raw HTML renders as text; no tag becomes an element. A link whose
target is not `http`, `https`, `mailto` or a relative path renders as its text. Images render,
because a model may point at a picture. They use the alt text the model wrote, and never a size
the model chose.

## Anatomy

```
[root <div>]
  [block]* — each one of:
    Text (paragraph) · Heading (relative: the shallowest → 2, then 3, floor 4) · CodeBlock (fence) ·
    <ul>/<ol> of <li> (lists, nested) · <blockquote> (quote) · Table (pipes) ·
    Separator (---) 
  [caret <span>? — in the last paragraph while streaming, aria-hidden]
  — or, while streaming with nothing landed —
  [Skeleton text — one line of the step]
```

Inline, inside any of them: `strong`, `em`, `s`, Code (span), Link (external when absolute or
protocol-relative, since both point to another origin), `<img>`, `<br>` (two trailing spaces or a
backslash), and Citation for `[n]` when `sources` has an nth entry.

## API

```ts
interface MarkdownProps {
  children: string // the markdown source, as far as it has arrived
  streaming?: boolean // more is coming: unfinished constructs draw as text, a caret marks the end
  size?: 'sm' | 'md' // Text's two steps for the prose; headings keep their own scale. Default md
  sources?: CitationSource[] // the reply's sources in order — with them, [n] is a Citation to the nth
}
```

Attributes: `data-size`; `data-state="streaming"` while arriving;
`data-pending` while streaming with nothing landed; `aria-busy="true"` while
streaming.

## The grammar

The parser reads the part of CommonMark that models actually write, and nothing else:

| Construct | Read as |
| --- | --- |
| `#`…`######` | Heading, *relative*: the reply's shallowest heading is level 2, each deeper level adds one, capped at level 4. Models write `##` as their top heading more often than `#`, and a top heading at level 3 under the page's h1 would skip a level in the page's outline |
| paragraph | Text at `size` |
| ` ``` `/`~~~` fence, with an info string | CodeBlock; `copyable` only once the fence has closed, so a reader cannot copy half a command |
| `>` | a quote: a column of blocks with a rule on the start edge |
| `-`/`*`/`+`, `1.`/`1)` | lists, nested by indentation; blank lines between items do not end the list |
| `\| a \| b \|` with a `---` row | Table: Head, Body, `numeric` where the delimiter ends in `:` |
| `---`, `***`, `___` | Separator; always a rule, never a setext heading. `===` under a line is the only setext form parsed |
| `` ` `` | Code |
| `**` `__` / `*` `_` / `~~` | strong / em / strike, with flanking rules; `_` never opens or closes inside a word |
| `[text](href "title")` | Link; the title is dropped (the vocabulary has no tooltip for it); emphasis in the label becomes plain text (Link's children are a string) |
| `![alt](src)` | `<img>` |
| `<https://…>`, bare `https://…` | Link |
| `[n]` | Citation when `1 ≤ n ≤ sources.length` and not followed by `(`; text otherwise |
| `&amp;` and the common entities | decoded |
| any `<tag>` | text |

## Recipes (exact tokens)

| Part | Tokens |
| --- | --- |
| root | column · gap `--pm-space-4` · `min-inline-size: 0` |
| list | column · gap `--pm-space-2` · `padding-inline-start --pm-space-6` · markers restored (`list-style: revert`), in `--pm-text-secondary` |
| list item's own blocks | `margin-block-start --pm-space-2` between them |
| quote | column · gap `--pm-space-3` · `padding-inline-start --pm-space-4` · `border-inline-start 2px solid --pm-border-strong` (ReasoningDisclosure's rule, so quoting and thinking share one quieter style) |
| image | block · `max-inline-size: 100%` · `block-size: auto` · radius `--pm-radius-md` |
| caret | the same as StreamingText's: `2px` × the step's size, `--pm-accent-bg`, radius `1px`, `margin-inline-start --pm-space-1` |
| everything else | the member it is: Text, Heading, Code, CodeBlock, Table, Separator, Link, Citation |

**On Android**: a run that holds Citation marks keeps room above and below its lines and after
their end for each mark's 48dp touch area (`citation.md`), and a mark that begins a line (the
run's first, or one after a hard break) stands that room in from the line's start. In a table,
every cell of a row that holds a mark keeps the room above and below, set in the cell's own step,
so the row's cells stay in line with one another. Two marks on neighbouring lines less than 48dp
apart along the line share part of their touch areas, because a line is shorter than the touch
target and keeping them apart would change the paragraph's line spacing.

## States

| Entry | Render | Expect |
| --- | --- | --- |
| prose | paragraphs, emphasis, inline code, a link | `data-size="md"`, no `data-state` |
| structure | `##` and `###` headings, a nested ordered list | levels 2 and 3 |
| a fence | a closed `ts` fence | CodeBlock with Copy |
| a table | three columns, two numeric | Table |
| a quote and a rule | `>` then `---` | — |
| citations | `[1]`, `[2]` with two sources | two Citation marks |
| sm | `size="sm"` | `data-size="sm"` |
| streaming | an open fence after an unclosed `**` | `data-state="streaming"`, `aria-busy` |
| streaming prose | a half paragraph | the caret in it |
| pending | `streaming` with `''` | `data-pending` |

`requiredSelectors`: none. Every state is a prop, and the states of the links, the copy control
and the marks belong to those members.

## Motion

None of its own. The caret does not blink, for the reason StreamingText gives. CodeBlock's copy
swap, Link's underline and Citation's background move as their own recipes define.

## Icons

None of its own. CodeBlock brings `copy`/`confirm`; Link brings
`open-external`.

## A11y

Headings are real headings one level below the page's, so a reply's outline nests under the
page's title instead of competing with it. Lists are `<ul>`/`<ol>`, tables are Table's `<table>`,
quotes are `<blockquote>`. The root has `aria-busy` while streaming; the caret is `aria-hidden`
and empty. ChatThread announces the reply, for the reason StreamingText gives. Images carry the
model's alt text. An empty alt makes the image decorative, because a picture nobody described has
nothing to announce.
