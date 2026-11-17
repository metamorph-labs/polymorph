# InlineEdit

A short value shown as text, with an edit control beside it, that becomes a field where it
stands. The reader saves with Enter or the save control and cancels with Escape or the
cancel control. Either way the field goes back to text and focus goes back to the edit
control. Use it for a value a person renames where they read it: a project's name in a
table cell, a team's name above its settings, a device's label in a settings row, and the
name of the page's subject in its title, through the `titleEdit` of PageHeader, DetailPage
and Dashboard.

It has no substrate. It composes Input and three Buttons and adds the decisions an
application cannot make with them: where focus goes when the field opens and closes, what
Enter and Escape do, what leaving the field does, what an unchanged value does, how a save
in flight looks, and where its error goes. An application that swaps a Text for an Input
itself cannot return focus to the edit Button, which takes no ref, cannot hear Escape in the
Input, which takes no key handler, and cannot tie an error to the Input without FormField,
whose label row adds a line above the field.

It is not a form. A change that needs a second field, an explanation of what it affects or
a confirmation goes in a Dialog or a FormPage. It edits one line of plain text, so it is not
a rich text editor and has no multi-line form. It edits one value at a time, so it is not a
table's edit mode, which the vocabulary does not have. It is not Input: a field that is
always a field belongs to a form with its own submit.

## Anatomy

```
[root <div>]
  reading:  [value <span>: the value, or the placeholder]  [edit — Button ghost · neutral · iconOnly · icon "edit"]
  editing:  [panel <div>]
              [row]  [field — Input]  [save — Button soft · accent · iconOnly · icon "confirm"]  [cancel — Button ghost · neutral · iconOnly · icon "close"]
              [polite live region]  [error <p>?]
```

## API

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `value` | `string` | required | the saved value, drawn as text. The app owns it, so after a save it passes the new value |
| `onCommit` | `(value: string) => void` | required | called with the field's text, as typed, when the reader saves a changed value. An uncontrolled field closes at once; a controlled one stays open until the app closes it |
| `label` | `string` | required | names the field ("Project name") and, through `messages.edit`, the edit control |
| `editing` | `boolean` | — | controlled: whether the field is open. An app whose save waits for a server holds it, and closes the field once the save succeeds |
| `defaultEditing` | `boolean` | `false` | uncontrolled: whether the field is open when the member mounts |
| `onEditingChange` | `(editing: boolean) => void` | — | the reader opened the field, cancelled it, or saved an unchanged text |
| `pending` | `boolean` | `false` | a save is in flight: the field is read-only, save is busy and cancel is disabled |
| `placeholder` | `string` | — | drawn, muted, in place of an empty value, and the empty field's placeholder |
| `error` | `string` | — | the app's message for a failed save, drawn under the field while it is open |
| `required` | `boolean` | `false` | a blank text cannot be saved: the save control is disabled and Enter does nothing |
| `maxLength` | `number` | — | the field's limit, Input's own |
| `disabled` | `boolean` | `false` | the edit control is disabled. The value stays as it is, because it is content the reader still reads |
| `size` | `'sm' \| 'md' \| 'lg'` | `'md'` | conventions §2, for the field, the three controls and the value's text step |
| `valueHidden` | `boolean` | `false` | another element beside the member draws the value (§A value drawn beside it). A page's `titleEdit` sets it |
| `messages` | `InlineEditMessages` | English | every word the member writes itself |

```ts
interface InlineEditMessages {
  edit: (label: string) => string // the edit control's accessible name; default "Edit {label}"
  save: string // the save control's accessible name; default "Save"
  cancel: string // the cancel control's accessible name; default "Cancel"
}
```

`aria-labelledby` and `aria-describedby` are the conventions' ARIA hooks, which SettingsRow
sets on its control. A label elsewhere names the field in place of `label`, and a
description describes the field and the edit control.

Attributes: `data-size`, `data-disabled`, and `data-editing` while the field is open. The
reading state carries no `data-editing`, which is the rest state. An open field is a boolean
this member alone has, so it is a flag of its own, as Button's `data-icon-only` is, and not a
`data-state` name. The value carries `data-placeholder` while it draws the placeholder.

## Behaviour

- **Opening.** The edit control opens the field, from a click, Enter or Space. The field
  holds the value, all of it selected, and focus is in it, so typing replaces the value
  and an arrow key keeps it. An app that opens the field (`editing` becomes true) gets the
  same. A member that mounts open takes no focus, because focus is never taken when a page
  loads (Input's `autoFocus` rule).
- **Saving.** Enter in the field and the save control save. An unchanged text reports
  nothing and closes the field. A blank text under `required` does nothing. Any other text
  is reported once through `onCommit`, as the reader typed it: the member trims nothing,
  because the value is the app's to normalise. An uncontrolled field then closes at once,
  which suits a save the app makes where it stands, such as a write to a local store.
- **A save that waits.** An app whose save waits for a server holds `editing`, so the field
  stays open after `onCommit` until the app closes it. While the save is in flight the app
  sets `pending`: the field is read-only and keeps its text and focus, the save control
  shows `loading`, the cancel control is disabled, and Enter and Escape do nothing. The app
  closes the field when the save succeeds. When it fails, the app clears `pending`, keeps
  the field open and passes `error`, and focus moves to the field if it was in the member,
  so the reader corrects the text beside the message and saves again. The member does not
  wait on a promise, because a handler cannot hand one back to an Angular member, and the
  member behaves the same in every framework.
- **The error.** `error` is drawn under the field as FormField draws an error, and only while
  the field is open. The app clears it when the reader saves again and when the field
  closes (`onEditingChange(false)`).
- **Cancelling.** Escape anywhere in the open row and the cancel control close the field
  and report nothing. The next opening starts from the value again.
- **Leaving the field does nothing.** Focus that moves out of the open row neither saves
  nor cancels. A save on leaving sends a request the reader did not ask for when they only
  clicked elsewhere, and its failure would be drawn in a field they have left. A cancel on
  leaving loses what they typed, which the vocabulary never does without a confirmation
  (ConfirmDialog's discard). The open field, its text and both controls stay until the
  reader saves or cancels.
- **Closing.** When the field closes and focus was in the member, focus moves to the edit
  control, including when the element that held it left with the field. Focus elsewhere
  on the page stays where it is.

## A value drawn beside it

A page's title is its `<h1>`, which the page archetype draws, and an InlineEdit cannot draw it:
Heading and InlineEdit render no `<h1>`, so a page has the one its opener gives it. PageHeader,
DetailPage and Dashboard take an InlineEdit in `titleEdit` and set `valueHidden` on it
(`page-header.md` §A title edited in place). The app gives that InlineEdit the page's `title`
as its `value` and the `lg` size. The value element stays in the document with the
`hidden` attribute, so it draws nothing, is not read where it stands, and still describes the
edit control. The reading state shows the edit control alone, beside the heading that draws the
value. The open state is unchanged. Everything else in Behaviour holds as written.

## Recipe (exact tokens)

| Part | Tokens |
| --- | --- |
| root | flex row · `align-items: flex-start` · gap `--pm-space-2` · `min-inline-size: 0` · `max-inline-size: 100%` |
| value | the size's text step (§2: `text.xs` at `sm`, `text.sm` at `md`, `text.md` at `lg`) · `--pm-text-primary` · padding-block half of the control height less one line, so its first line is centred on the edit control · `overflow-wrap: anywhere` · `min-inline-size: 0` |
| value, placeholder | `--pm-text-muted` |
| value, `valueHidden` | the `hidden` attribute, so no rule of the recipe draws it |
| edit | Button `ghost/neutral/iconOnly` at the member's size, icon `edit` |
| panel | flex column · `flex: 1 1 0` · `min-inline-size: 0` |
| row | flex row · `align-items: center` · gap `--pm-space-2` |
| field | a grid of one `minmax(0, 1fr)` track, `flex: 1 1 0`, so the Input fills the row and narrows to fit |
| save | Button `soft/accent/iconOnly`, icon `confirm` |
| cancel | Button `ghost/neutral/iconOnly`, icon `close` |
| error | FormField's error (`text.xs` · `--pm-danger-text` · the `error` icon in its glyph seat) · margin-block-start `--pm-space-2` |

**The two forms keep the row's height.** Each is one control height at its size: the value's
padding makes its line one control height, and the open row is the Input and two Buttons of
that size. So a value that fits one line does not move the content below it when the field
opens or closes. A value longer than its line wraps, as text does, and is taller than the
one-line field that replaces it. It wraps rather than truncating, because a truncated name
hides the part that tells it apart, and the reader could read the rest only by opening the
editor. The field scrolls its text and never widens its container.

The value starts at the root's inline start, as text in a table column does, so it lines up
with the column's header and its neighbours. The field's text starts one field inset further
in. Save is `soft`, not `solid`, because a page keeps one solid action, and a settings card
can show several open fields.

Below `30rem` the field's text takes the text-entry floor (conventions §13). The value keeps
its step, and the row keeps its height.

## States

| Entry | Render | Expect |
| --- | --- | --- |
| rest | `label="Project name" value="Acme billing"` | `data-size="md"` |
| empty | `value=""` · `placeholder` | the placeholder, muted |
| editing | `defaultEditing` | `data-editing` |
| pending | `defaultEditing` · `pending` | the field read-only, save busy, cancel disabled |
| failed | `defaultEditing` · `error` | the error under the field, tied to it |
| required, blank | `defaultEditing` · `required` · `value=""` | save disabled |
| disabled | `disabled` | `data-disabled` |
| size sm / size lg | `size` | `data-size` |
| long value | a value longer than its line | it wraps, and the field fills the width it is given |

`requiredSelectors`: none. Hover, focus and the busy state are the Buttons' and the Input's,
whose own fixtures assert them, and every state of this member's own parts is reachable from
a prop.

## Motion

Nothing moves. The field replaces the text in one frame, because the row keeps its height and
there is no distance to animate. The error enters as FormField's error does, and the Buttons
and the Input bring their own state feedback.

## Icons

`edit` on the edit control, `confirm` on save, `close` on cancel, and `error` before the
message. All four are decorative: each control is named by `messages`, and the message is
text.

## A11y

The value is text. The edit control is a button named `messages.edit(label)` ("Edit Project
name") and described by the value, so a reader who returns to it after a save hears the new
value with it. While the field is open it is named by `label` (or the label `aria-labelledby`
points to) and carries `aria-required` under `required`. The error is tied to the field by
`aria-describedby` and `aria-invalid`, as FormField ties one. It also sits in a polite live
region, which the open row renders empty, because the error arrives after a save the reader
started while focus stays in the field, where a description is never read again. There is no
"Saved" announcement: focus returns to the edit control with the new value beside it, and an
app that reports the outcome of a save already raises its own toast.

Every control is a Button at the size's control height, so the target floor holds (§2). The
edit control is always visible, never only on hover, because a hover-only control cannot be
found by touch or by a keyboard reader who has not reached it yet. While a save is in flight
the save control carries `aria-busy`, and Enter and Escape in the field do nothing, so a
second save is never sent and a save that is under way is never abandoned.

```contract
role trigger button
name field from label when editing
key Enter opens on trigger
key Space opens on trigger
focus on-open field
focus on-close trigger
dismiss escape when rest
key Escape closes on field when editing
attr field aria-invalid=true when failed
attr field aria-describedby when failed
attr field aria-required=true when required
announces live:polite when editing
announces live:polite "already exists" when failed
announces busy when pending
key Enter nothing on field when pending
key Escape nothing on field when pending
```

## Agent

A person sees one value with its edit control, or one open row, so an agent sees one member:
InlineEdit registers itself and withholds the Input and the Buttons it draws. Its element is the
edit control while it reads and the field while it is open, the control a person reaches. An
agent reads the saved value, whether the field is open, whether a save is in flight, the error
the application passed, and whether the member is disabled. It opens the field, saves a text and
cancels, as a person does with the three controls.

`edit` opens the field, and `onEditingChange` reports it. `save` writes the text into the open
field and saves it as Enter does: a changed text is reported once through `onCommit`, as given,
and an unchanged one closes the field and reports nothing. A field the application holds open
stays open until the application closes it, as after a person's save. `cancel` closes the field
and reports nothing to `onCommit`. `save` refuses a closed field, because a person saves from the
open row, and a blank text under `required`. While a save is in flight `save` and `cancel` both
refuse, as Enter and Escape do nothing then. Each refusal fails the step. A disabled member lists
no action.

```agent
state value text
state editing boolean as panel present
state pending boolean
state error text
state disabled boolean as root data-disabled
action edit sets editing calls onEditingChange
action save text calls onCommit when editing
action cancel sets editing calls onEditingChange
withholds contents
```
