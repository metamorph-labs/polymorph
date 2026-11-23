# RichTextInput

A field that holds formatted text: a comment, an issue's description, a note, a review. The
person formats the text with a toolbar, the keys or typed shortcuts, mentions people and things
the app suggests, and the field gives back a rich-text document: the portable JSON of
`@polymorph/engine/rich-text` (`docs/rich-text.md`), which the app stores and RichTextContent
draws.

Its substrate is the engine's editor (`@polymorph/engine/rich-text-editor`), a controller over
ProseMirror that edits a document inside an element the member renders
(`README-substrates.md` §10). The editor owns the caret, the keys, the history, the typed
shortcuts and the paste inside that element, and writes the document's DOM there with this
member's recipe classes. The member owns everything a person reads: the toolbar, the link form,
the suggestion list, the selection bar, the count, the footer and every announcement. The editor
is mounted in an effect, so a server renders the frame, the toolbar and an empty surface.

RichTextInput is *not* Textarea. A Textarea holds plain text; this field holds a document whose
words carry formats, links, entities and annotations, and it gives back JSON, not a string. It is
*not* PromptInput either: a prompt stays plain text, because a model and the app read it as text,
and a composer's Enter sends. Here Enter starts a new paragraph and Mod+Enter submits. It is
*not* RichTextContent, which shows a stored document and loads no editor, and *not* Markdown,
which parses a source string. The document a field writes is drawn by RichTextContent with the
same classes, so it looks the same while it is written and after it is saved.

## Anatomy

```
[root — data-min-rows data-max-rows; data-empty? data-disabled? data-readonly? data-invalid?]
  [frame — border, seat, the composite-field focus ring]
    [toolbar role="toolbar" aria-label={messages.toolbar} aria-controls={surface id} — one tab stop, arrows, Home, End]
      [controls — the field's own, in groups divided by a vertical Separator]
        [marks: Button ghost/neutral/sm iconOnly pressed × (bold, italic, strike, code) · link Button → Popover (link form)]
        [text style: Menu (Paragraph, Heading 1, Heading 2, Heading 3) — only when `heading` is allowed]
        [blocks: Button × (bulleted list, numbered list, quote, code block)]
        [history: Button × (undo, redo)]
      [slot? — the app's `toolbar`]
    [viewport — scrolls past maxRows]
      [surface <div role="textbox" aria-multiline="true"> — the editor's element: contenteditable, data-placeholder on the first block, data-focused]
    [selection bar? role="toolbar" — fixed at the selection: the app's `selectionActions`, a Separator, the format controls]
    [footer? — [count?] … [cancel?] [submit]  |  [count?] the app's `footer`]
  [count? — under the frame when there is no footer and maxLength is set]
  [suggestions? — the panel fixed at the token: listbox of options | loading rows | empty row | error row]
  [status role="status" aria-live="polite" — every announcement]
  [<input type="hidden" name>?]
```

The link form is a Popover from the link control: a FormField with an Input for the address,
Apply, and Remove while the selection is in a link. Drawn content of the surface: paragraphs,
headings (`h2`–`h4`), lists (`ul`/`ol`/`li`), quotes, code blocks (`pre > code`), hard breaks,
`strong`, `em`, `s`, inline `code`, links (`a[href]`), entities
(`span[data-entity-kind][data-entity-id][contenteditable=false]`), annotations (a
`mark[data-annotation-id]` around each fragment, inside the format elements and around an entity,
one per id where they overlap, the active one's with `data-active`) and the nodes of a later
version, each as one unit, which a keystroke never replaces: typing while one is selected writes a
new paragraph after it, and the caret a document opens with, or `autoFocus` puts at its end, is
the nearest text position, never such a node.

## API

```ts
interface RichTextInputProps {
  value?: RichTextDocument // controlled: the document the app holds
  defaultValue?: RichTextDocument // uncontrolled: the first document
  onChange?: (value: RichTextDocument) => void // the person or a command changed the document; never for a value the app set
  formats?: RichTextFormat[] // what the field allows. Default: all ten
  entities?: RichTextEntitySource[] // the kinds of entity it suggests, each with its trigger
  placeholder?: string
  minRows?: 1 | 3 | 6 | 12 // the surface's minimum height, in body lines. Default 3
  maxRows?: 6 | 12 | 24 | 'none' // how tall the text grows before it scrolls. Default 12
  maxLength?: number // a soft limit in code points (richTextLength): draws the count, invalid past it
  invalid?: boolean
  disabled?: boolean
  readOnly?: boolean
  autoFocus?: boolean // focus at mount, caret at the end. Default false
  onSubmit?: (value: RichTextDocument, editor: RichTextInputEditor) => void // Mod+Enter, and the submit control
  submitLabel?: string // draws the default footer's submit Button; needs onSubmit
  onCancel?: () => void
  cancelLabel?: string // draws the default footer's cancel Button; needs onCancel
  pending?: boolean // the app is saving: submit shows loading, the field is read-only, a submit is refused
  toolbar?: (editor: RichTextInputEditor) => ReactNode // the app's own controls at the toolbar's end: attach, emoji
  toolbarPlacement?: 'fixed' | 'selection' // the format controls over the text, or in a bar at the selection. Default 'fixed'
  selectionActions?: (editor: RichTextInputEditor) => ReactNode // the app's controls for the selected text, first in the selection bar
  footer?: (editor: RichTextInputEditor) => ReactNode // the app's own footer, in place of the default
  onFiles?: (files: File[]) => void // files pasted or dropped; the field inserts nothing
  annotations?: string[] // the annotations drawn. Default: every one the document holds
  activeAnnotation?: string // the drawn annotation that is active: the thread the app shows
  onAnnotationSelect?: (id: string) => void // the caret entered a drawn annotation, or a press landed on one
  onFocus?: () => void // focus entered the field (its text, toolbars, link form or menu) from outside it
  onBlur?: () => void // focus left the field as a whole, for validation on leaving
  controlRef?: Ref<HTMLDivElement> // the editable element
  messages?: RichTextInputMessages // every label and announcement; English defaults
  id?: string // the surface's id
  name?: string // adds a hidden input holding serializeRichText(value)
}
```

The four ARIA props a FormField wires (`aria-label`, `aria-labelledby`, `aria-describedby`,
`aria-required`) go on the surface. A field with no visible label takes `aria-label`.

```ts
interface RichTextEntitySource {
  kind: string // the app's stable name for the kind: 'user', 'issue'
  trigger: string // one character: '@', '#'
  label: string // the list's accessible name: 'People'
  options: RichTextEntityOption[]
  filter?: 'contains' | 'startsWith' | false // Combobox's; false: the app filters (async)
  loading?: boolean // skeleton rows under the options
  error?: string // the app could not load: the list's one row and the status say this
  onQueryChange?: (query: string) => void // the typed query, when the list opens and on each change
}

interface RichTextEntityOption {
  id: string
  label: string
  description?: string // a second line under the label
  icon?: IconRole // decorative, before the label
  leading?: ReactNode // the app's decorative drawing before the label, such as an Avatar
  entityLabel?: string // the words the entity reads as. Default: trigger + label, '@Ada Lovelace'
}

interface RichTextInputEditor {
  focus(): void // the text, with the caret where it was
  clear(): void // empties the document as the person's act: onChange is called, undo restores it
  insertText(text: string): void // at the selection: an emoji picker's pick
  insertEntity(entity: { kind: string; id: string; label: string }): void
  annotate(id: string): boolean // anchors the annotation to the selection; false for a caret
  removeAnnotation(id: string): boolean // false when the document holds none
  readonly value: RichTextDocument
  readonly empty: boolean
  readonly length: number
  readonly overLimit: boolean
  readonly disabled: boolean // disabled, readOnly or pending: the app's controls follow it
  readonly selection: { empty: boolean; text: string; range: RichTextRange }
}
```

The handle's values are the field as it was drawn, and its methods act on the field as it is
now. A pick of an option inserts `{ type: 'entity', kind, id, label: option.entityLabel ??
trigger + option.label }`.

`RichTextInputMessages` holds every word the member writes. Each key is optional, and one the app
leaves out keeps its English default: the controls' names (`bold` "Bold", `italic`, `strike`
"Strikethrough", `code`, `link`, `textStyle` "Text style", `paragraph`, `heading(level)` "Heading
1", `bulletList` "Bulleted list", `orderedList` "Numbered list", `blockquote` "Quote",
`codeBlock` "Code block", `undo`, `redo`), the two toolbars' names (`toolbar` "Formatting",
`selectionBar` "Selection"), the link form's (`linkForm` "Link", `linkAddress` "Address",
`linkApply` "Apply", `linkRemove` "Remove link", `linkInvalid`), the count (`count(length, max)`
"12 / 280", `overLimit(n)` "3 characters over the limit") and every announcement below
(`formatOn(name)` "Bold on", `formatOff(name)`, `linkAdded`, `linkRemoved`, `inserted(label)`,
`undone`, `redone`, `withinLimit`, `submitEmpty`, `submitOverLimit(n)`, `submitPending`,
`selectionBarReady`, `suggestions(count)` "1 suggestion", "3 suggestions", `loadingSuggestions`,
`noSuggestions`).

Attributes: root `data-min-rows`, `data-max-rows`; `data-empty` while `isRichTextEmpty` holds;
`data-disabled`; `data-readonly` while `readOnly` or `pending` (and not disabled); `data-invalid`
while `invalid` or over the limit. The rest state is none of the flags. The surface carries the
editor's `data-focused`, the placeholder's block `data-placeholder`, a selected entity or unknown
node `data-selected`, and an annotation's fragments `data-annotation-id` and, for the active one,
`data-active`. Focus is not a root attribute: the ring is `:focus-visible` on the surface.

## Behaviour

**The document.** The field takes a document and gives one back, in the model's normal form, on
each change the person or a command makes (`onChange`). A field that stops being controlled
(`value` becomes `undefined`) keeps the document the text shows, so the count, `data-empty`, the
form value and the submit control read it. A form's reset puts the first document
(`defaultValue`) back, as the person's act: `onChange` is called with it, as Checkbox's reset
does. A controlled `value` is the document: the
editor compares it with its own and replaces only a document that differs, with no `onChange` and
no undo step, so passing the value back on every render keeps the caret and the history. A
document holding a format the field does not allow is restricted to the allowed ones as it enters
(`restrictRichText`). `formats` and `entities` may be new arrays on each render; the field keys
them by content, because a changed schema rebuilds the editor's state and clears its history.

**Keys**, each only for a format the field allows. `Mod` is ⌘ on Apple platforms and Ctrl
elsewhere.

| Key | Effect |
| --- | --- |
| Mod+B, Mod+I, Mod+Shift+X, Mod+E | bold, italic, strikethrough, inline code |
| Mod+K | the link form |
| Mod+Shift+8, Mod+Shift+7, Mod+Shift+9 | bulleted list, numbered list, quote |
| Mod+Alt+0, Mod+Alt+1–3 | paragraph, heading 1–3 |
| Mod+Alt+C | code block |
| Mod+Z; Mod+Shift+Z, Mod+Y | undo; redo |
| Enter | splits the block or the list item; in an empty item, lifts it out of the list; on an empty last line of a code block, leaves the block |
| Shift+Enter | a line break; a new line in a code block |
| Tab, Shift+Tab | sink or lift a list item; anywhere else focus moves, so the field never traps Tab |
| Backspace at a block's start | lifts or joins the block |
| Mod+Enter | submits, when the app gave `onSubmit` |
| Alt+F10 | focus to the selection bar while it is drawn, else to the toolbar |
| Escape | closes the suggestion list; else hides the selection bar for that selection |

**Typed shortcuts**, each only for an allowed format: `# `, `## `, `### `, `- ` or `* `, `1. `,
`> ` and ```` ``` ```` at a block's start; `**bold**`, `*italic*` or `_italic_`, `~~strike~~` and
`` `code` `` inline. Undo straight after one gives back the typed characters.

**Paste and drop** read rich HTML through the field's formats, so only what the field allows
survives: no script, style, class, id or image. A pasted link whose target is not safe keeps its
text and loses the link. A single URL pasted over a selection links it. Files in a paste or a drop
go to `onFiles`, and the field inserts nothing for them.

**The toolbar** draws one control per allowed format, in the order the model lists them, then
undo and redo, then the app's `toolbar`. With marks only, no block control is drawn; without
`heading`, no text style Menu. A format control is pressed while its format is on at the
selection, and disabled where it would do nothing (bold inside a code block). Undo and redo are
disabled when there is nothing to undo or redo. The toolbar wraps onto more rows in a narrow
container; nothing in it is clipped or scrolled away.

- **One tab stop.** Tab reaches the toolbar once, on the control it last left from, the first one
  before that; Right and Left (mirrored in a right-to-left document) move between its enabled
  controls, wrapping at the ends, and Home and End go to the first and the last. The toolbar is
  before the surface, so Shift+Tab from the text reaches it. A control that is disabled while it
  has focus (Undo with nothing left) hands focus to the next enabled control.
- **The selection stays.** A pointer press on a control does not take focus from the text, so the
  selection it acts on stays, and the text has focus after the command. From the keys, focus
  stays on the control after a command. Escape in the toolbar returns focus to the text with the
  selection as it was; inside a Dialog, that Escape is the toolbar's and the dialog stays open.
- **The text style Menu** lists Paragraph and Heading 1 to 3, the current one checked. A choice
  closes it. Opened with the pointer, it returns focus to the text when it closes; opened from
  the keys, to its control.

**The link form.** Mod+K or the link control opens a Popover holding the address of the link at
the selection, or nothing. The address is read as typed (`richTextHref(raw, { typed: true })`), so
`example.com` becomes `https://example.com` and an email address a `mailto:` link. Apply with an
empty or unsafe address shows `messages.linkInvalid` as the field's error and changes nothing.
Apply links the selection; with a caret outside a link it inserts the address as linked text.
Remove, drawn while the selection is in a link, unlinks it. Closing the form, by Apply, Remove or
Escape, returns focus to the text with the selection as it was. With `toolbarPlacement="selection"`
the link control is in the selection bar, so Mod+K opens the form only while a selection is
drawn.

**Entities.** A token is a trigger character at the start of a word (a block's start or after
whitespace) followed by the text up to the caret with no whitespace. While the caret is in one and
the field has focus and is editable, the list for that trigger's source is open. It does not open
for a token in code or in a link's text.

- **The member filters**, as Combobox does: each option whose label contains the query, or starts
  with it under `filter: 'startsWith'`, by the locale's collation at base sensitivity. An app that
  loads options per query sets `filter: false`, hears the query through `onQueryChange` when the
  list opens and each time the query changes, and sets `loading` while it fetches: Combobox's
  three skeleton rows. `error` is the list's one row and what the status says.
- **Keys, with the list open.** Focus stays in the text. ArrowDown and ArrowUp move the active
  option and stop at the first and the last. Enter and Tab pick the active option. While the
  source loads and shows no option, Enter does nothing, because the options are about to arrive;
  with no match, or the error row, Enter is the editor's own. Escape closes the list and keeps the
  text; the list stays closed while the caret is in that token. Inside a Dialog the first Escape
  is the list's and the dialog stays open.
- **A pick** replaces the token with the entity and one space, and says so ("@Ada Lovelace
  inserted"). Leaving the token inserts nothing: it is text until a pick. A press on an option
  picks it and keeps focus in the text; the pointer moves the active option.
- **An entity is one unit**: an arrow steps over it, Backspace after it removes it whole, and the
  caret never lands inside.
- **The panel is at the token**: under the token's line, or above it when there is less room below
  in the part of the window a person sees (the visual viewport, which a virtual keyboard makes
  shorter); its inline start at the token's start, kept inside the field and the window, and no
  taller than the room on its side. It is `position: fixed`, placed from the token's box, so a
  scrolling ancestor (a Dialog's body) does not clip it, and it follows the token as the page
  scrolls. Below `30rem` it is as wide as the field.
- **An input method.** A phone's keyboard composes every word, so the list opens while an input
  method composes, with the query as composed so far. Its keys are never taken from a composing
  input method (a key marked as composing, or one the browser reports as processed by one, such as
  Safari's Enter that confirms Japanese text), so the Enter that confirms a composition never
  picks. A pick made while one composes waits for the composition to end, which the field brings
  about, and then replaces the token.

**The limit.** With `maxLength`, the count shows `{length} / {maxLength}` in code points, the units
a server counts (`richTextLength`). Past the limit the count says how many over in words
(`messages.overLimit`), the root is `data-invalid` and the surface `aria-invalid`, and the status
says so once as the text crosses the limit, and once as it comes back within it. The limit is
soft: the text past it is kept, and a submit is refused until it is shortened. The surface's
`aria-describedby` names the count.

**Submitting.** Mod+Enter and the submit control call `onSubmit(value, editor)`. A submit is
refused, and the status says why, while the field is empty, over the limit or pending; a disabled
field does not submit. Nothing is cleared after a submit: the app calls `editor.clear()` when its
save succeeded, or sets `value`.

**Three footers.** `submitLabel` with `onSubmit` (and `cancelLabel` with `onCancel`) draws the
default footer: the count at its start, Cancel and Submit at its end. The submit control is
disabled while the document is empty or over the limit and `loading` while `pending`. `footer`
draws the app's footer in its place, after the count. Neither draws no footer, for a field in a
form, and the count sits under the frame. `onSubmit` without a label still answers Mod+Enter.

**Disabled, read-only, pending.** `disabled`: the text is not editable and not focusable
(`aria-disabled`), and every control is disabled. `readOnly` and `pending`: the text is
focusable, with a caret the keys move and select with (Shift and the arrows, Shift+Home and
Shift+End, Mod+A, a double press), and copy works; nothing the person does changes it (typing,
Enter, Backspace, paste, cut, drop, a typed shortcut, a format key, undo, an input method's text),
and it is `aria-readonly`. The browser draws the caret because the surface stays
`contenteditable`; it carries `inputmode="none"`, so a touch device opens no keyboard, and
`spellcheck="false"`. Mod+Enter answers as a submit does. The format controls are disabled;
`editor.disabled` is true in all three, so the app's controls follow it.

**A document of a later format** (`isRichTextNewer`: one a later version of the model wrote) is
drawn as far as this version reads it and never written over. The field is read-only as above
(and `data-readonly`) whatever `readOnly` says, unless it is disabled; `onChange` is never called;
the handle's `annotate`, `removeAnnotation`, `insertText`, `insertEntity` and `clear` change
nothing; an agent's `fill` and `clear` are refused. The form value is the document as it was
stored, and a submit hands `onSubmit` the document as it was given, so saving the field again
keeps what the later version wrote.

**The selection bar.** With `toolbarPlacement="selection"` the format controls are drawn in a bar
at the selected text instead of in the fixed toolbar; undo and redo are keys there, and the fixed
toolbar is drawn only for the app's `toolbar`, holding it alone. `selectionActions` gives the bar
the app's controls for the selected text (Comment, React), drawn first and divided from the
format controls by a Separator; with `toolbarPlacement="fixed"` they are the bar's only content.
The bar is drawn while the selection is not a caret, the text or the bar has focus (or a popup
one of its controls opened: the link form, the text style menu), and the bar has something to
hold. A read-only or pending field holds `selectionActions` only, so a reviewer comments on text
they may not edit; a disabled one draws no bar.

- **Placement.** Centred over the selection's box and above it; under it when there is no room
  above; on a coarse pointer under it, where the system's own copy and paste callout is not, and
  above it when there is no room under it. When neither side has room (a selection taller than
  the window) it sits at the selection's visible edge: its top, or its bottom on a coarse pointer.
  It is kept inside the part of the window a person sees (the visual viewport, which a virtual
  keyboard or a pinch zoom makes smaller) on both axes, follows the selection as the page scrolls,
  the window resizes and that viewport moves, and wraps onto more rows at the width that part
  allows, a scroll bar not counted. It is placed at the part of the selection the field's own
  scrolling box shows, and hidden while none of it is in view there or in the window, so it never
  sits over the page outside the field. It is `position: fixed`, placed from the editor's `selectionRect()`.
- **When.** It appears when a pointer selection ends, not while it is dragged, and at once for a
  selection made with the keys. Escape in the text hides it for that selection; the next selection
  brings it back. It leaves when the selection collapses or leaves the field.
- **Keys.** The bar is a toolbar with the toolbar's keys and one tab stop. It follows the surface
  in the document, so Tab from the text reaches it while it is drawn, and Alt+F10 moves focus to
  it. Escape in it returns focus to the text with the selection as it was. When it leaves with
  focus in it (an app's control in it replaced the selection), focus goes back to the text. The
  first time a bar appears after focus entered the field from outside it, the status says the
  controls are there (`messages.selectionBarReady`), once: focus coming back to the text from the
  field's own toolbars, link form or menu is not entering, and the words are not said over an
  announcement made in the same turn. A pointer press on its controls keeps the selection. The
  app's `selectionActions` are drawn, and asked for, only while the bar is.

**Annotations** are anchors an app keeps something against, such as a comment thread: an
`annotation` mark with the app's id on the words, which moves with them through every edit
(`docs/rich-text.md`). The field draws the annotations `annotations` names, every one when it is
`undefined`, and `activeAnnotation` as the active one. The caret entering a drawn annotation, or a
press on one, calls `onAnnotationSelect` with its id, once per entry or press; the innermost one
wins where they overlap. The app adds one with `editor.annotate(id)` on the person's selection,
from a control in its `toolbar` or `selectionActions`, and removes one with
`editor.removeAnnotation(id)`; both are edits the person can undo. A paste carries no annotation.

**Announcements** (the status region, polite): a format turned on or off by a key, a typed
shortcut or a control ("Bold on"), a text style ("Heading 2"), a link added or removed, an
inserted entity, undo and redo, the limit crossed each way, a refused submit, the suggestion
list's count, loading, no results or error, and the selection bar's first appearance. Each is
said once, as it happens.

```contract
key ArrowDown moves-focus-next on surface when suggesting
key ArrowUp moves-focus-previous on surface when suggesting
key Escape closes on surface when suggesting
dismiss both when suggesting
key Enter nothing on surface when suggestions loading
key ArrowRight moves-focus-next on control
key ArrowLeft moves-focus-previous on control
key Home moves-focus-first on control
key End moves-focus-last on control
```

## Recipes (exact tokens)

| Part | Tokens |
| --- | --- |
| root | column · gap `--pm-space-2` · `position: relative` |
| frame | column · gap `--pm-space-2` · padding `--pm-space-3` · bg `--pm-bg-surface` · border `1px solid --pm-border-field` · radius `--pm-radius-control` · shadow `--pm-shadow-seat` · `stateFeedback` |
| frame, text focused | the composite-field focus convention (conventions §4) via `:has(.surface:focus-visible)`: outline `--pm-focus-width` `--pm-border-focus` at `--pm-focus-offset`, `--pm-glow-focus`, border `--pm-border-focus-solid` except while invalid; under `--pm-focus-field: border` the outline moves inside the edge in `--pm-border-focus-solid` and the seat stays |
| frame hover | border `--pm-border-strong`, not while disabled, read-only or invalid |
| frame invalid | border `--pm-danger-border` |
| frame disabled | bg `--pm-bg-subtle` · border `--pm-border-subtle` · no seat · `cursor: not-allowed` |
| toolbar | wrapping row · gap `--pm-space-1` `--pm-space-2` · padding-block-end `--pm-space-2` · border-block-end `1px solid --pm-border-subtle` |
| controls, group | wrapping row of groups, gap `--pm-space-1` `--pm-space-2`; a group is one row, gap `--pm-space-1`; a vertical Separator between groups |
| a control | `Button ghost/neutral/sm iconOnly`, named by `messages`; `pressed` for a format |
| slot | wrapping row · gap `--pm-space-1` · at the inline end |
| viewport | `overflow-y: auto` · max-block-size `maxRows` × the body line (`--pm-text-md-size` × `--pm-text-md-line-height`) + 2 × `--pm-space-1`, one rule per lawful value; `none`: no maximum |
| surface | RichTextContent's root, composed (column · gap `--pm-space-4`) · padding `--pm-space-1` `--pm-space-2` · `text.md` quartet · `--pm-text-primary` · `white-space: break-spaces`, so a space at a line's end wraps with its word · `overflow-wrap: break-word` · `font-variant-ligatures: none` · no outline · min-block-size `minRows` body lines + 2 × `--pm-space-1`, one rule per lawful value. Below `30rem` it takes the text-entry floor's size and line-height (conventions §13, metrics only), and the row rules are restated with them |
| surface read-only | `--pm-text-secondary` |
| surface disabled | `--pm-text-disabled` · `cursor: not-allowed` |
| placeholder | `content: attr(data-placeholder)` · `--pm-text-muted` · over the block (absolute, `inset-inline: 0`) · no pointer events |
| paragraph | Text's base, composed; the body step comes from the surface |
| heading, levels 1/2/3 | Heading's base, composed, and the steps Heading draws at levels 2, 3 and 4: `text.xl`; `text.lg`; `text.md` at `text.xl`'s weight |
| list, list item, quote, entity | RichTextContent's classes, composed |
| code block | CodeBlock's block, composed |
| inline code | Code, composed |
| link | Link, composed, with the inline variant's underline · `cursor: text` |
| selected entity or unknown node | `--pm-selection-text` on `--pm-selection-bg` (one label, `README.md` §11) |
| annotation (`mark`), active, annotated entity | RichTextContent's annotation, composed (`rich-text-content.md`, Recipes): the warning wash, a rule under the words in `--pm-warning-border`, the active one's pressed wash and frame, and an annotated entity's ring |
| footer | wrapping row · gap `--pm-space-2`; the default controls at the inline end: cancel `Button ghost/neutral/sm`, submit `Button solid/accent/sm` |
| count | `text.xs` quartet · `--pm-text-muted` · tabular numerals; over the limit `--pm-danger-text`; under the frame, padding-inline `--pm-space-3` |
| suggestions | PromptInput's panel, composed · `position: fixed` at the corner the member measures · `--pm-z-overlay` · inline-size `min(` the field's width `, --pm-space-10 × 4)` (Popover's width) · max-block-size PromptInput's, and no more than the room on its side · inline start at the token, clamped inside the field and the visible viewport · `--pm-space-1` under the token's line (`data-placement="below"`) or above its top (`"above"`) · below `30rem`, the field's width |
| option, glyph, text, label, description, loading rows, empty row | PromptInput's, composed; `leading` the app's drawing in the glyph's place |
| error row | PromptInput's empty row, composed, in `--pm-danger-text` |
| status | the conventions' `visuallyHidden` |
| link form | column · gap `--pm-space-3`; its controls a wrapping row · gap `--pm-space-2` · at the end |
| selection bar | `selection-bar.module.css`: fixed · `--pm-z-overlay` · wrapping row · gap `--pm-space-1` · padding `--pm-space-1` · bg `--pm-bg-overlay` · border `1px solid --pm-border-subtle` · radius `--pm-radius-surface` · shadow `--pm-shadow-transient` · `--pm-space-2` from the visible viewport's edges · max-inline-size the visible width the member measures, less those edges · hidden (`visibility`) while the selection is scrolled out of the field's box · glass as Popover's panel; its controls as the toolbar's |

**Forced colours** have no rule of their own, as Input's and PromptInput's: the focus ring is an
outline, which forced colours keep. The annotation's transparent outline and its rule are drawn in
forced colours, where its wash is not, and the active one's outline is thicker; they also mark an
annotated entity, whose ring is a shadow that forced colours remove.

## States

| Entry | Render | Expect |
| --- | --- | --- |
| empty | `aria-label`, a placeholder, every format | `data-empty`, `data-min-rows="3"`, `data-max-rows="12"` |
| with content | marks, a link, a list and a mention | no `data-empty` |
| a comment composer | marks-only `formats`, people, an attach Button in `toolbar`, the default footer, `minRows={1}` `maxRows={6}` | `data-min-rows="1"`, `data-max-rows="6"` |
| a description editor | `minRows={6}` `maxRows={24}`, every format, `maxLength` under it | `data-min-rows="6"`, `data-max-rows="24"`, no `data-invalid` |
| suggesting | `Thanks @`, `autoFocus`, people | the list under the token, its first option active |
| suggestions loading | `Ask @gr`, `autoFocus`, a source with `filter: false` and `loading` | three skeleton rows; the status says it loads |
| one suggestion | `Thanks @gr`, `autoFocus`, people | one option; the status says "1 suggestion" |
| the app's footer | `footer` with two Buttons, the count | — |
| over the limit | 51 code points, `maxLength={40}` | `data-invalid`, the count in danger text |
| invalid | in a FormField with an error, required | the FormField's `data-invalid`; the surface `aria-invalid` and `aria-required` |
| disabled | `disabled`, with content | `data-disabled` |
| read-only | `readOnly`, with content | `data-readonly` |
| pending | `pending`, the default footer | `data-readonly`, the submit loading |
| later format | a document of format `polymorph-rich-text/2`, `name`, the default footer | `data-readonly`; the form value is the document as stored |
| annotated | two annotations, the second active | — |
| the selection bar | `toolbarPlacement="selection"`, `selectionActions`, words selected on mount | the bar at the selection |

`requiredSelectors`: `:hover`, `:focus-visible`, `[data-placeholder]`, `[data-selected]`: the
frame's pointer and keyboard states, and the placeholder and a selected unit the editor draws. The
list's side of its token is the member's placement, which no rule restates.

## Motion

The frame's colours and seat use `stateFeedback`, and the controls are Buttons with their own. The
suggestion list appears and leaves by re-render, as PromptInput's does: it follows each
keystroke. The selection bar fades in over `--pm-motion-duration-surface` with
`--pm-motion-easing-enter` and out over `--pm-motion-duration-surface-exit` with
`--pm-motion-easing-exit`, the tokens Popover's panel reads; it fades and does not scale, because
the member places it by its measured box. Under reduced motion nothing in the field moves: the bar
appears and leaves at once, and the rest is `stateFeedback`'s colour change.

## Icons

The toolbar's controls, each an icon-only Button named by `messages`: `bold`, `italic`,
`strikethrough`, `code`, `link`, `heading` (the text style Menu's trigger), `list-bulleted`,
`list-numbered`, `quote`, `code-block`, `undo`, `redo`. The text style Menu's checked row brings
`confirm`. Each option's `icon` is decorative, because its label carries the meaning; the link
form's FormField brings `error`.

## A11y

The surface is the field: `role="textbox"` with `aria-multiline="true"`, named by `aria-label` or
by the FormField's label through `aria-labelledby` (`controlKind = 'group'`, because a label's
`for` reaches no `div`), described by the FormField's message and the count. A press on that label
focuses the text, as a native label's press focuses its control: on the click, not when the press
ends a drag that selected the label's own words, and not for a link or a control inside the label. It carries
`aria-invalid` while invalid or over the limit, `aria-required`, `aria-readonly` while read-only or
pending and `aria-disabled` while disabled, and it is a tab stop unless disabled. Headings,
lists, quotes, code and links inside it are their own elements, so a screen reader reads the
document's structure as it is written.

The toolbar and the selection bar are `role="toolbar"`, named by `messages.toolbar` and
`messages.selectionBar`; the toolbar names the surface with `aria-controls`. Every control is a
Button named by `messages`; a format control is a toggle (`aria-pressed`), and the text style
Menu's choices are checkbox items. The Separators are decorative.

With `entities`, the surface follows the ARIA combobox pattern as a textbox can: it carries
`aria-autocomplete="list"` and `aria-haspopup="listbox"`; while the list shows options,
`aria-controls` names the listbox and `aria-activedescendant` the active option, which has
`aria-selected="true"`. The listbox is named by the source's `label`. The loading, empty and error
rows are hidden from assistive technology, because the status region says them once. Entities
are text with no role, read as their label. An annotation is a `mark`, which a screen reader may
call highlighted; what is anchored there is the app's to name, in its own thread.

```contract
role surface textbox
name surface from aria-label
attr surface aria-multiline=true when empty
role toolbar toolbar
role list listbox when suggesting
attr surface aria-autocomplete=list when suggesting
attr surface aria-haspopup=listbox when suggesting
announces live:polite "3 suggestions" when suggesting
announces live:polite "Loading suggestions" when suggestions loading
attr surface aria-invalid=true when over the limit
attr root data-invalid when over the limit
attr surface aria-invalid=true when invalid
attr surface aria-required=true when invalid
attr surface aria-disabled=true when disabled
attr root data-disabled when disabled
attr surface aria-readonly=true when read-only
attr surface tabindex=0 when read-only
attr surface spellcheck=false when read-only
attr surface spellcheck=false when later format
key Enter nothing on surface when read-only
key Backspace nothing on surface when read-only
attr surface aria-readonly=true when later format
attr root data-readonly when later format
key Enter nothing on surface when later format
announces live:polite "1 suggestion" when one suggestion
announces busy when pending
```

## Agent

An agent reads the document as its plain text, whether it is empty, and whether the field is
disabled, invalid (by the app or over the limit) or read-only (also while pending). It fills the
field with text, which replaces the document with paragraphs of that text (`richTextFromText`),
and clears it; both are changes the field reports through `onChange`, whether or not the caller
controls the value. It submits as Mod+Enter does: `submit` calls `onSubmit`, and is refused while
the field is empty, over the limit or pending. A read-only or pending field refuses `fill` and
`clear`, and a disabled one lists no action.

The field withholds its own controls: the toolbar's format, link, text style and history
controls, the link form, the selection bar and the default footer are not members an agent lists,
finds or runs, so an agent sees one field where a person sees one. An agent formats nothing,
because formatting is a person's act on a selection; it writes text, and an app that wants
formatted content from an agent sets `value`. The app's `toolbar` slot and its `footer` hold the
app's controls, which stay an agent's. An agent reaches annotations through the app, as the
selection bar's controls are withheld with the bar.

```agent
state value text
state disabled boolean as root data-disabled
state invalid boolean as surface aria-invalid
state readonly boolean as root data-readonly
state empty boolean as root data-empty
action fill text sets value calls onChange
action clear sets value calls onChange
action submit calls onSubmit when with content
withholds contents
```
