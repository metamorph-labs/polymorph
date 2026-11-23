# RichTextContent

Draws a stored rich-text document, such as a comment, an issue's description or a note, with the
vocabulary's members under the screen's theme. A heading becomes Heading, a paragraph Text, a
code block CodeBlock, inline code Code and a link Link, with no second stylesheet. It is the
read-only half of rich text: RichTextInput writes the document, and this member shows it.

It has no substrate. It reads the document through the model's tolerant reader
(`parseRichText`, `@polymorph/engine/rich-text`, `docs/rich-text.md`) and passes each node to a
member. It loads no editor, so a page that only shows documents does not ship one.

RichTextContent is *not* Markdown. Markdown parses a source string, usually a model's reply, on
every render, tolerates a reply that is still arriving, and draws tables, rules, images and
citations. RichTextContent reads a JSON document a person wrote and an app stored. It parses no
markup, nothing in it is ever partial, and it draws only the nodes the document model has. Both
draw a reply or a document inside a page, never the page: neither produces an `<h1>`. It is
*not* Text either. A Text is one paragraph whose content the app composes, and a
RichTextContent is a whole document of blocks, drawn from data. It is *not* CodeBlock: a code
block is one of the blocks it draws. Syntax highlighting is a non-goal for CodeBlock, so it is a
non-goal here too.

**Readable across versions.** The reader accepts any JSON. A node whose type this version does
not know is drawn as the text found in it: a block as a paragraph of that text, and nothing when
there is none, and an inline as that text in the line. A mark this version does not know draws
nothing, and its text keeps its other marks. A document written by a later version therefore
still reads, and a value that is not a document draws the empty document.

**Safe by construction.** The document holds no markup, so nothing in it becomes an element the
model does not name. A link whose target fails `richTextHref` (only `http`, `https`, `mailto`,
`tel` and a relative path pass) loses its mark in the reader and is drawn as its text.

**A client component.** The member carries `'use client'`, because it hands `onNavigate` to each
Link and a server component can pass no function to a client one. In a React Server Components
application it is therefore rendered from a client component when it takes `entity` or
`onNavigate`.

## Anatomy

```
[root <div> — data-size; data-empty while the document has nothing to read]
  [block]* — each one of:
    Text (paragraph) · Heading (level 1 → headingLevel, deeper adds one, floor 4) ·
    CodeBlock (copyable, named by its language) · <ul>/<ol start?> of <li> (nested) ·
    <blockquote> (quote) · Text (a block of a later version: the text found in it)
```

Inline, inside a paragraph: `strong`, `em`, `s`, Code (inline code), Link, `<br>` (a hard break),
and the entity token or what `entity` returns.

## API

```ts
interface RichTextContentProps {
  value: RichTextDocument // the stored document; any JSON is read as far as it can be
  size?: 'sm' | 'md' // Text's two steps for the prose; headings keep their own scale. Default md
  headingLevel?: 2 | 3 | 4 // the page level of the document's level 1; each deeper level adds one, floor 4. Default 2
  entity?: (entity: RichTextEntity) => ReactNode // the app's rendering of an entity (a Link, a HoverCard); undefined draws the token
  onNavigate?: (href: string) => void // the app's router, handed to every Link the document draws (`link.md`)
}
```

Attributes: `data-size`; `data-empty` while `isRichTextEmpty(value)` holds, when the root draws
nothing inside it. The rest state has no `data-empty`.

## The document

Each node is drawn by one member, as Markdown draws each construct:

| Node | Drawn as |
| --- | --- |
| `paragraph` | Text at `size` |
| `heading` | Heading. The document's level 1 is drawn at `headingLevel`, and each deeper level adds one, floor 4. Heading takes a string, so the content is drawn as its text: an entity as its label, a break as a space, a link and inline code as their text. A heading with no text draws nothing, because a heading names the section under it and one with no name names nothing |
| `list` | `<ul>`, or `<ol>` when `ordered`, of `<li>`, each item its own blocks; a nested list is a later block of its item. A numbered list whose first number is not 1 carries it as `start` |
| `blockquote` | `<blockquote>` of its blocks |
| `codeBlock` | CodeBlock, `copyable`, as Markdown's closed fence is, because a stored block is never partial. Its `label` is the block's `language`, the writer's own word for what the block holds, and the scroll region keeps CodeBlock's default name when there is none. A block with no text has nothing to copy and draws no copy control. The copy control keeps CodeBlock's default name, as in Markdown |
| `text` | its text inside `<strong>`, `<em>` and `<s>` for `bold`, `italic` and `strike`, outermost first, around Code for `code` |
| `text` with `link` | Link, `external` when the target has a scheme (`https:`, `mailto:`, `tel:`), with `onNavigate`. Neighbouring runs with the same target are one Link, so one link is one tab stop and one name. Link takes a string, so the marks every run of the link shares are drawn around it, and the others, and `code`, are dropped, as Markdown drops emphasis inside a link's label |
| `break` | `<br>` |
| `entity` | what `entity(node)` returns; the entity token when it returns `undefined` or when there is no `entity` |
| a block of a later version | Text at `size` of the text found in it; nothing when there is none |
| an inline of a later version | the text found in it |
| a mark of a later version | nothing; its text keeps its other marks |

**Headings keep the document's levels.** Markdown draws a reply's shallowest heading at level 2,
because a model writes `##` as its top heading as often as `#`. A rich-text document's levels are
the writer's choice from the editor's menu, and the editor draws them at the same page levels
(`rich-text-input.md`), so a document reads the same while it is written and after it is saved.

**The entity token** is the default drawing of a reference to something the app owns: a person,
a team, an issue. It is the entity's `label` (`@Ada Lovelace`, `#142`) on the accent wash, as an
inline `<span data-entity-kind data-entity-id>`, the element the editor draws for it. It is
never colour alone: the label carries the trigger character that says what it is. An app that
links a mention to the person's page, or opens their card on hover, passes `entity` and returns
a Link or a HoverCard. It returns `undefined` for a kind it leaves to the token, so an app can
draw people itself and leave issues as tokens.

**On Android**: the entity token is a run of the paragraph's text, so a long label wraps as the
words around it do. A run's background has no corner radius, so the token's wash is square, and a
narrow no-break space either side stands for its padding, as Markdown's code spans are drawn.
`entity` is a composable, which draws rather than returns, so the token stands where it draws
nothing. What the app draws is measured and set in the line in a place of that size, centred on
the text: a Link keeps its 48dp touch area in the line, and that line grows to hold it. The size
reaches the line on the frame after the drawing is first measured, and the token stands in until
then.

## Recipes (exact tokens)

| Part | Tokens |
| --- | --- |
| root | Markdown's root, composed: column · gap `--pm-space-4` · `min-inline-size: 0` |
| list | Markdown's list, composed: column · gap `--pm-space-2` · `padding-inline-start --pm-space-6` · markers restored (`list-style: revert`), in `--pm-text-secondary` |
| list item's own blocks | Markdown's item, composed: `margin-block-start --pm-space-2` between them |
| quote | Markdown's quote, composed: column · gap `--pm-space-3` · `padding-inline-start --pm-space-4` · `border-inline-start 2px solid --pm-border-strong` |
| entity token | inline · `--pm-accent-text` on `--pm-accent-subtle` (a lawful pairing, `packages/theme/src/pairings.ts`) · radius `--pm-radius-sm` · `padding-inline --pm-space-1` · the surrounding text's step and weight, as Code keeps its weight · `overflow-wrap: anywhere` · `box-decoration-break: clone` (Code's long-string cell, so a long label breaks inside the token and never widens the column) |
| everything else | the member it is: Text, Heading, Code, CodeBlock, Link |

The list, the list item, the quote and the entity token are one class each, with no selector
that reaches through the root, so RichTextInput's editable surface composes the same classes and
a document looks the same while it is written. The rules are Markdown's, composed and not
restated, so a list in a reply and a list in a comment are one decision.

## States

| Entry | Render | Expect |
| --- | --- | --- |
| prose | paragraphs with bold, italic, strike, inline code, a hard break and a link | `data-size="md"`, no `data-empty` |
| structure | headings at the document's three levels, a nested bulleted list and a numbered list from 3 | levels 2, 3 and 4; `start="3"` |
| a quote | a quote of two paragraphs | — |
| a code block | a `ts` code block | CodeBlock with Copy |
| entities | two entities in a paragraph, drawn as tokens | — |
| entities drawn by the app | `entity` returns a Link for a person and `undefined` for an issue | one Link, one token |
| sm | `size="sm"` | `data-size="sm"` |
| a later version | an unknown block and an unknown inline | the text found in each |
| empty | the empty document | `data-empty` |

`requiredSelectors`: none. Every state is a prop, and the states of the links, the copy control
and the marks belong to those members.

## Motion

None of its own. CodeBlock's copy swap and Link's underline move as their own recipes define.

## Icons

None of its own. CodeBlock brings `copy`/`confirm`; Link brings `open-external`.

## A11y

Headings are real headings, one level below the page's by default, so a document's outline nests
under the page's title. Lists are `<ul>`/`<ol>` with the writer's first number, quotes are
`<blockquote>`, code blocks are CodeBlock's `<pre><code>`, and links are real `<a href>`. The
entity token is text with no role: its label, with its trigger character, is what a screen
reader reads, and an entity the app draws brings its own member's semantics. The empty document
draws nothing, so it is read as nothing. The member announces nothing: a stored document does not
arrive while it is read.

## Agent

An agent gets nothing from a RichTextContent itself. The document's words are on the page, which
an agent reads there, and a person operates nothing in the document. Its links are Links, which
an agent reads and presses as it does any other (`link.md`), its copy controls are CodeBlock's
Buttons, and an entity the app draws is the app's member, which registers as that member does.
