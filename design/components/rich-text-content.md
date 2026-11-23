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

**Comments on its words.** The member draws a document's annotations, the anchors an app keeps
comment threads against, as highlights, one of them active, and calls `onAnnotationSelect` when
the reader presses one. With `selectionActions` it draws the app's controls (a "Comment" Button)
in a bar at the words the reader selects, and hands them the selection as a range of the
document's plain text, which `annotateRichText` takes.

**A client component.** The member carries `'use client'`, because it hands `onNavigate` to each
Link and a server component can pass no function to a client one, and because it holds the
reader's selection. In a React Server Components application it is therefore rendered from a
client component when it takes a function. A document with neither `onAnnotationSelect` nor
`selectionActions` is drawn with no hook, no listener and no effect.

## Anatomy

```
[root <div> — data-size; data-empty while the document has nothing to read]
  [block]* — each one of:
    Text (paragraph) · Heading (level 1 → headingLevel, deeper adds one, floor 4) ·
    CodeBlock (copyable, named by its language) · <ul>/<ol start?> of <li> (nested) ·
    <blockquote> (quote) · Text (a block of a later version: the text found in it)
  [selection bar? role="toolbar" — fixed at the selection: the app's `selectionActions`]
  [status? role="status" aria-live="polite" — with `selectionActions`]
```

Inline, inside a paragraph: `strong`, `em`, `s`, Code (inline code), Link, `<br>` (a hard break),
the entity token or what `entity` returns, and highlights: a `mark[data-annotation-id]` around
each fragment of a drawn annotation, inside the emphasis elements and around Code, a Link or an
entity, one per id where annotations overlap, the active one's with `data-active`. With
`onAnnotationSelect`, each annotation's tab stop is one of its fragments, `role="button"`.

## API

```ts
interface RichTextContentProps {
  value: RichTextDocument // the stored document; any JSON is read as far as it can be
  size?: 'sm' | 'md' // Text's two steps for the prose; headings keep their own scale. Default md
  headingLevel?: 2 | 3 | 4 // the page level of the document's level 1; each deeper level adds one, floor 4. Default 2
  entity?: (entity: RichTextEntity) => ReactNode // the app's rendering of an entity (a Link, a HoverCard); undefined draws the token
  onNavigate?: (href: string) => void // the app's router, handed to every Link the document draws (`link.md`)
  annotations?: string[] // the annotations drawn. Default: every one the document holds
  activeAnnotation?: string // the drawn annotation that is active: the thread the app shows
  onAnnotationSelect?: (id: string) => void // a press on a drawn annotation; without it highlights take no press and no focus
  selectionActions?: (selection: { range: RichTextRange; text: string }) => ReactNode // the app's controls for the selected words, in a bar at them
  messages?: RichTextContentMessages // the selection bar's words; English defaults
}
```

`RichTextContentMessages` holds every word the member writes, each key optional with an English
default: the bar's name (`selectionBar`, "Selection") and what the status says when a bar first
appears (`selectionBarReady`, "Controls for the selection are available: Alt+F10"). The
selection's type is exported as `RichTextContentSelection`.

Attributes: `data-size`; `data-empty` while `isRichTextEmpty(value)` holds, when the root draws
nothing inside it. The rest state has no `data-empty`. A highlight carries `data-annotation-id`,
and the active annotation's fragments `data-active`. With `selectionActions`, each drawn piece of
the document carries where it is in the plain text (`data-rich-text-start`, `data-rich-text-end`,
and `data-rich-text-atom`, `-segments` or `-code` where its drawing is not its text), which the
member reads to map a selection; no recipe reads them.

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

## Behaviour

**Annotations** are anchors an app keeps something against, such as a comment thread: an
`annotation` mark with the app's id on the words (`docs/rich-text.md`). The member draws the ones
`annotations` names, every one when it is `undefined`, and `activeAnnotation` as the active one;
one not drawn leaves no element and no attribute. Each fragment is a `mark`, nested where
annotations overlap exactly as the editor nests them, so the two draw one document alike: per
paragraph, the innermost is the one whose stretch starts last, then the one that ends first, then
by id. A `mark` cannot go inside Link, Code or Heading, which take a string, so an annotation on
any run of a link is drawn around the whole Link, one on inline code around the Code, and one in a
heading is not drawn: Heading draws its words as text, as it draws a link's.

**A press on a highlight.** With `onAnnotationSelect`, a press anywhere on a drawn annotation calls
it with the innermost id under the press. A press that ends a selection drag selects text and calls
nothing. A press on a Link, or on a control the app's `entity` drew, inside an annotation is that
control's: the link is followed and no annotation is selected, because a press with a destination
must not also change what the app shows beside the document. Each annotation's tab stop is its
first fragment on which it is the innermost and that holds no such control; Enter on it calls
`onAnnotationSelect` as it is pressed and Space as it is released, as on a button. An annotation
that has no such fragment (one only on a link, or one under another everywhere it is) has no stop,
as it has no press: the app reaches it through its own list of threads. Without
`onAnnotationSelect`, the highlights take no press and no focus.

**The selection bar.** With `selectionActions`, while the reader's selection is not collapsed and
both its ends are in the member's content, the member draws RichTextInput's selection bar with the
app's controls (`rich-text-input.md`, The selection bar). The controls are given the selection:
its `range` in code points of the plain text with nothing between blocks, the units of
`annotateRichText`, and its `text` (`richTextRangeText`). A selection end in the middle of an
entity, a hard break, a node of a later version, a code block's own control or an entity the app
drew covers that unit whole, because the document counts it as one unit whatever is drawn; one in
a code block's code ends where it is, because the code is the stored text. A selection end after
the content with only white space before it (a triple press on the last paragraph) is the
content's end, and one anywhere else outside the content draws no bar.

- **When.** The bar appears when a pointer selection ends, not while it is dragged, and at once
  for a selection made without the pointer (caret browsing). Escape hides it for that selection; the
  next selection brings it back. It leaves when the selection collapses or leaves the member, and
  stays while focus is in it.
- **Where.** Centred over the selection's box and above it, under it when there is less room above
  and always on a coarse pointer, inside the window's inline edges, following the selection on
  scroll and resize: the bar's own placement.
- **Keys.** The bar is a toolbar with one tab stop. It follows the content in the document, so Tab
  from the content reaches it, and Alt+F10, with focus in the member or on no element, moves focus
  to it. Escape in it hides it for that selection and returns focus where it came from, with the
  selection as it was. The first time a bar appears, the status says the controls are there
  (`messages.selectionBarReady`). A pointer press on a control keeps the selection.
- **After the app anchors.** When `value` changes, the old positions name other words, so the
  member collapses a selection in it and the bar leaves; focus in the bar goes back where it came
  from.

## Recipes (exact tokens)

| Part | Tokens |
| --- | --- |
| root | Markdown's root, composed: column · gap `--pm-space-4` · `min-inline-size: 0` |
| list | Markdown's list, composed: column · gap `--pm-space-2` · `padding-inline-start --pm-space-6` · markers restored (`list-style: revert`), in `--pm-text-secondary` |
| list item's own blocks | Markdown's item, composed: `margin-block-start --pm-space-2` between them |
| quote | Markdown's quote, composed: column · gap `--pm-space-3` · `padding-inline-start --pm-space-4` · `border-inline-start 2px solid --pm-border-strong` |
| entity token | inline · `--pm-accent-text` on `--pm-accent-subtle` (a lawful pairing, `packages/theme/src/pairings.ts`) · radius `--pm-radius-sm` · `padding-inline --pm-space-1` · the surrounding text's step and weight, as Code keeps its weight · `overflow-wrap: anywhere` · `box-decoration-break: clone` (Code's long-string cell, so a long label breaks inside the token and never widens the column) |
| annotation (`mark`) | bg `--pm-warning-subtle`, opaque, so overlapping ones read the same · `color: inherit`, so a link or code keeps its look · `border-block-end 1px solid --pm-warning-border`, a rule under the words, because the wash alone is faint on a dark surface (a border, which moves no line and is drawn on each line, not a text decoration, which a link inside draws) · outline `1px solid transparent` · `box-decoration-break: clone` |
| annotation active | bg `--pm-warning-subtle-active` · outline `2px solid --pm-warning-border`, at the base rule's specificity, so the focus ring wins on a focused stop |
| annotated entity | a `2px` ring of the annotation's wash (`box-shadow`), `--pm-warning-subtle`, or `--pm-warning-subtle-active` in the active one, because the entity's own wash covers the highlight; the rule under it, `border-block-end 1px solid --pm-warning-border` |
| pressable highlight | the focus convention (`focusRing`) · `cursor: pointer` |
| selection bar | RichTextInput's: `selection-bar.module.css` |
| actions | `display: contents`: the app's controls are the bar's own row |
| status | the conventions' `visuallyHidden` |
| everything else | the member it is: Text, Heading, Code, CodeBlock, Link |

The list, the list item, the quote, the entity token and the annotation are one class each, with
no selector that reaches through the root, so RichTextInput's editable surface composes the same
classes and a document looks the same while it is written. The rules are Markdown's, composed and
not restated, so a list in a reply and a list in a comment are one decision.

**Forced colours** have no rule of their own. The annotation's transparent outline and its rule
are drawn in forced colours, where its wash is not, and the active one's outline is thicker; they
also mark an annotated entity, whose ring is a shadow that forced colours remove. A focused stop's
ring is an outline, which forced colours keep.

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
| annotated | two annotations, the second active, with `onAnnotationSelect` | — |
| overlapping annotations | an annotation inside another, the inner one active, with `onAnnotationSelect` | — |
| an annotated entity | a mention and the words after it in one annotation | — |
| the selection bar | `selectionActions`, words selected once drawn | the bar at the selection |

`requiredSelectors`: `:focus-visible`, a highlight's ring, which the keyboard brings. Every other
state is a prop, and the states of the links, the copy control and the marks belong to those
members.

## Motion

None of its own. CodeBlock's copy swap and Link's underline move as their own recipes define, and
the selection bar fades as its recipe defines (`rich-text-input.md`, Motion), not at all under
reduced motion.

## Icons

None of its own. CodeBlock brings `copy`/`confirm`; Link brings `open-external`; the app's
`selectionActions` bring their own.

## A11y

Headings are real headings, one level below the page's by default, so a document's outline nests
under the page's title. Lists are `<ul>`/`<ol>` with the writer's first number, quotes are
`<blockquote>`, code blocks are CodeBlock's `<pre><code>`, and links are real `<a href>`. The
entity token is text with no role: its label, with its trigger character, is what a screen
reader reads, and an entity the app draws brings its own member's semantics. The empty document
draws nothing, so it is read as nothing. The member announces nothing about the document: a stored
document does not arrive while it is read.

A highlight is a `mark`, which some screen readers voice as highlighted and others not at all. The
member adds no word to it: what is anchored there is the app's to name, in its own thread. With
`onAnnotationSelect`, an annotation's tab stop is `role="button"`, named by its own words (the
fragment's text), with `aria-current="true"` while it is the active one, so a screen reader says
"doubles the wait, button, current" and Tab moves from one annotation to the next. The stop holds
no link or control of its own, so no control is nested in another. A reader who selects words
with caret browsing hears, once, that the controls for the selection are available, and reaches
them with Alt+F10 or with Tab after the content: the bar is a `toolbar` named by
`messages.selectionBar`, holding the app's controls.

```contract
role highlight button when annotated
name highlight from children when annotated
attr highlight tabindex=0 when annotated
attr current aria-current=true when annotated
key Enter activates on highlight when annotated
key Space activates on highlight when annotated
click activates on highlight when annotated
announces live:polite when the selection bar
```

## Agent

A RichTextContent registers for an agent while it takes `onAnnotationSelect`, because then a person
operates something in it: the highlights. An agent reads the drawn annotations, each by its id and
labelled with the words it covers, and which one is active, and selects one as a person's press
does, on its tab stop, which calls `onAnnotationSelect`. An annotation a person cannot press (one
only on a link, or one under another everywhere it is) is listed as disabled, and the bridge
refuses it. Without `onAnnotationSelect` an agent gets nothing from the member itself. The
document's words are on the page, which an agent reads there. Its links are Links, which an agent
reads and presses as it does any other (`link.md`), its copy controls are CodeBlock's Buttons, an
entity the app draws is the app's member, and the controls in the selection bar are the app's,
which register as themselves; an agent makes no selection, so it meets the bar only while a person
has one. The member has no name of its own: an agent finds it by the text it shows.

```agent
state annotations choices when annotated
state active id when annotated
action select id calls onAnnotationSelect when annotated
```
