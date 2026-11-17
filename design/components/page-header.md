# PageHeader

The header at the top of every page: a title, an optional description and optional actions. Its
actions slot is where the one-primary-action law shows in the page's structure (the hierarchy
guarantee, `docs/concepts.md`). With `titleEdit`, the reader renames the page's subject in its
title (§A title edited in place).

## Anatomy

```
[root <header>]
  [text column: [title <h1>] [description?]]
  [actions slot? — Inline, right-aligned]
```

With `titleEdit`, the text column holds a title row in the title's place:

```
  [text column: [title row: [title <h1>] [titleEdit — the app's InlineEdit]] [description?]]
```

## API

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `title` | `string` | required | the page's `<h1>`; exactly one per page |
| `titleEdit` | `ReactNode` | — | an InlineEdit of the title, drawn beside the `<h1>` (§A title edited in place) |
| `description` | `string` | — | |
| `actions` | `ReactNode` | — | vocabulary controls only |

No size, variant or tone, because the law keeps page headers uniform. Attributes: none beyond the
element structure.

## A title edited in place

`titleEdit` takes an InlineEdit that the app writes (`design/components/inline-edit.md`):

- its `value` is `title`, so the field opens with the title's text and the edit control is
  described by it;
- its `size` is `lg`, the control step nearest the title's line, on every page;
- its `label`, its handlers and, for a save that waits for a server, its `editing`, `pending`
  and `error` are the app's, as on any InlineEdit.

PageHeader draws it beside the `<h1>` and hands it `valueHidden`, over the app's own props,
because the `<h1>` draws the title. The InlineEdit then draws its edit control in the reading
state and its field while it is open. It is the one prop the header hands. A prop handed
through a slot is read from its slot by every Svelte member that has a prop of that name, and
only InlineEdit has `valueHidden`, where `value` and `size` are the props of most controls.

**The heading.** The page has one `<h1>`, and its text is `title`, in the reading state and
while the field is open. The edit control, the field and its two buttons are beside the heading
and never inside it, because a control inside an `<h1>` joins the heading's name ("Billing Edit
project name"). While the field is open, the `<h1>` stays in the document with the saved title
and is visually hidden, and the field is drawn in its place. A screen-reader user who lists the
headings while the field is open still finds the page's title under its saved name. The text
being typed is not the title until the app saves it and passes the new `title`.

Everything the reader does with the title is InlineEdit's: the edit control opens the field
with the title selected, Enter and the save control report the new text once, Escape and the
cancel control close it, leaving the field neither saves nor cancels, and focus returns to the
edit control when the field closes. PageHeader adds no handler, so every framework carries the
save in the InlineEdit's own events.

DetailPage takes `titleEdit` for an entity's name, and Dashboard passes it to its PageHeader for
the overview of one thing the reader names. ListPage, FormPage, SettingsPage and
ConversationPage do not take it, because no application renames the title of one: a list's and
a form's title names a collection or a task, a settings page's names a section, and an app that
renames its conversations does it in the list that holds them.

Without `titleEdit` there is no title row: the `<h1>` is the text column's first child and has no
attribute but its class.

The native renderings take `titleEdit` and draw nothing for it (`packages/native/src/undrawn.ts`):
the heading would have to hide while the InlineEdit's field is open, and neither rendering reads
that state from the view the app passes.

## Recipe (exact tokens)

| Part | Tokens |
| --- | --- |
| root | row · `justify: between` · `align: start` · column-gap `--pm-space-5` · padding-bottom `--pm-space-6` · **no border** (the page body's own structure separates it, and a rule here would double up with Table headers) |
| title | `text.2xl` quartet (gets titleWeight through derivation) · `--pm-text-primary` |
| description | `text.md` · `--pm-text-secondary` · top gap `--pm-space-2` · max-width `calc(var(--pm-space-10) * 6)` (576, which keeps the line length ≤ ~75ch) |
| actions | `<Inline gap={3}>`; wraps under title at narrow widths (root wraps, row-gap `--pm-space-4`) |
| text column, with `titleEdit` | grows from a basis of `calc(var(--pm-space-10) * 3)`, DetailPage's identity column's *(the column's width does not follow its content, so the field that opens in it takes the width the column already has, and the actions keep their place)* |
| title row | flex row · `align-items: flex-start` · gap `--pm-space-2` · `position: relative` |
| title, in the title row | padding-block half of `max(--pm-control-height-lg, the title's line)` less the title's line, so its first line is centred on the edit control |
| titleEdit | grid · `align-items: center` · min-block-size `max(--pm-control-height-lg, the title's line)`, so the InlineEdit fills its width; while the field is open it takes the row (`flex: 1 1 0`) and the field fills it |
| title, while the field is open | visually hidden (Conventions' `visuallyHidden` clip): it stays in the accessibility tree and leaves the layout |

**The two forms keep the header's height.** The reading row is one title line or one `lg`
control height, whichever is taller, and so is the open row, at any size the InlineEdit has. So a title that fits one line does
not move the description, the actions or the page below it when the field opens or closes. A
failed save's error is drawn under the field, as InlineEdit draws it, and adds its line to the
header while it shows.

The field draws at `lg`'s step, `text.md`, because Input has no step above `lg`. A field at the
title's `text.2xl` would be an Input size of its own.

**Hierarchy law (enforced by review, structural where possible):** at most one
`solid` Button inside `actions`; secondary actions are `outline`/`ghost`. Destructive
page-level actions do not go here. They belong behind the overflow or on the entity's own
surface, so dangerous actions stay separate.

## States

| Entry | Render | Expect |
| --- | --- | --- |
| title only | — | `<h1>` present |
| with description | — | — |
| with actions | primary + ghost | — |
| full | all props | — |
| long title + actions | overflow behaviour | title wraps, actions keep their place |
| a title edited in place | `titleEdit` · description · actions | the edit control beside the `<h1>`, outside it |
| renaming | `titleEdit` with `defaultEditing` · description · actions | the field in the title's place, the `<h1>` visually hidden |

`requiredSelectors`: —.

## Motion / Icons

None / none (buttons inside bring their own). InlineEdit's field replaces the title in one frame.

## A11y

Title renders the page `<h1>` (archetypes rely on it, because AppShell contains no h1).
`<header>` landmark scoped to `<main>`. With `titleEdit`, the `<h1>`'s name is the title in both
forms, and the edit control and the field are outside it (§A title edited in place).
