# Citation

Citation is an inline source mark: the `[1]` after a sentence in a model's
reply, as a real link to the page the sentence is based on, with a preview of
that page on hover. Substrate: HoverCard's (`@radix-ui/react-hover-card`), used
by composition.

Citation is a sibling of Link at a smaller scale. A Link is a word *of* the
sentence. A Citation is a mark *after* it, numbered so it can be found again in
the SourceList below the reply. It is *not* a footnote: nothing jumps within the
page, and the destination is the source itself. It is *not* a Badge: a badge is
read-only, and a source the reader cannot open is an assertion, not a citation.
The number is the SourceList's. `index` is one-based, and the app keeps the two
in step, usually by giving Markdown the same `sources`.

## Anatomy

```
[HoverCard]
  [mark <a href> — the number; the trigger]
  [preview — HoverCard's panel]
    [title] [domain?] [snippet?]
```

## API

```ts
interface CitationProps {
  index: number // its number in the reply's SourceList — one-based
  source: CitationSource // { title, href, domain?, snippet? } — the page the mark rests on
}
```

```ts
interface CitationSource {
  title: string // the page's own title, or the app's name for it
  href: string // where the reader goes — required: a source nobody can open is not one
  domain?: string // the host, already shortened by the app
  snippet?: string // the passage that answered, as the preview's body
}
```

Attributes: none of its own. The mark is a link, and its states are
pseudo-classes. The preview carries HoverCard's `data-state` and `data-side`.

## Recipes (exact tokens)

| Part | Tokens |
| --- | --- |
| mark | inline-flex, centred · `min-inline-size` the `text.xs` line box (`calc(--pm-text-xs-size * --pm-text-xs-line-height)`) so `1` and `12` get the same square shape · padding-inline `--pm-space-1` · `margin-inline-start --pm-space-1` off the sentence · `text.xs` quartet · `--pm-accent-text` on `--pm-accent-subtle` (Badge's soft/accent cell, as a link) · radius `--pm-radius-detail` · no underline, because the wash signals the link · `vertical-align: top` |
| mark hover | bg `--pm-accent-subtle-hover`, one step up, as in Button's soft cell |
| mark focus | the shared focus ring (conventions §4) |
| preview | HoverCard's panel verbatim; inside it a column at gap `--pm-space-1`. Title: `text.sm` at `--pm-text-xl-weight` · `--pm-text-primary`. Domain: `text.xs` · `--pm-text-muted`. Snippet: `text.sm` · `--pm-text-secondary`, `--pm-space-1` above |

**On Android**: a mark's touch area is the 48dp hit target centred on it. Set in a paragraph,
it reaches above the line the mark heads, below the line it ends and past either side of the
mark, so a paragraph that holds marks keeps that room above its first line, below its last and
after its lines' end, a mark that begins a line stands that room in from the line's start, and
two marks set one after another stand far enough apart that their touch areas meet. In a table,
every cell of a row that holds a mark keeps the room above and below, so the row's cells stay in
line (`markdown.md`).

## States

| Entry | Render | Expect |
| --- | --- | --- |
| in a sentence | a Text ending in one mark | the mark after the claim |
| two marks | two citations in one sentence | numbered 1 and 2 |
| two digits | `index={11}` | the same square, wider |

`requiredSelectors`: `:hover`, `:focus-visible`. These are the link's own
states, which no prop can set. The open preview is HoverCard's state and is
tested in its fixture.

## Motion

The mark's hover uses `stateFeedback`. The preview uses `popover.panel` through
HoverCard (`scale-fade`, anchored, `surface` class), by reference, exactly as
HoverCard does. Nothing is declared here.

## Icons

None. The number is the mark.

## A11y

A real `<a href>` with `target="_blank"` and `rel="noreferrer"` (Link's
`external` rule: a source is another site, and the reply must still be there
when the reader returns). The visible text is the number. The accessible name is
`"{index}. {title}"`, so a screen reader announces which source, not just an
integer. The preview is HoverCard's and follows its rules. It is never
essential, because the title, domain and passage are all on the destination, and
it must contain nothing interactive, which it does not. Keyboard focus on the
mark opens the preview. Touch users get the link and miss only the preview.

## Agent

An agent gets nothing from a Citation. Its mark opens the source in a new tab, which a browser
opens only during a person's own gesture and blocks as a popup otherwise, so an agent's press
would be refused, as Link refuses a press on an `external` link. The number and the source's
title, which name the mark, are words on the page, which an agent reads there, and the `href` is
not read, for Link's reason. The preview is HoverCard's, which gives an agent nothing
(`hover-card.md`). Registering would also make this member a client component in a React Server
Components application, which an application that uses no agent bridge would pay for.
