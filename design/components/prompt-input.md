# PromptInput

The chat composer, where a user writes a prompt, attaches files, and sends the prompt or stops
the reply. It has no substrate: a frame, a native `<textarea>` that grows, AttachmentChips and
Buttons.

PromptInput is a Textarea with a specific job. A Textarea is a field in a form, named by a FormField
and submitted with the rest. A composer is the page's only field. It always grows with its content,
Enter sends it, and it has a row of controls no form has: attach, the app's own slots (a model
picker, a tools menu) and send. Send becomes stop for exactly as long as a reply is arriving. It
is *not* FileUpload either. Files arrive through the attach control, a drop or a paste, and show
as chips in the frame, but the app owns the list and the upload (FileUpload's rule, unchanged;
`gateFiles` is FileUpload's gate, applied to every way a file can arrive).

**One button, two faces.** The control that sends the prompt is also the control that stops the
reply, in the same place, so a user can stop a reply that is going wrong without looking for
another control. Stop uses the quiet outline style, because stopping is never the dangerous
action.

## Anatomy

```
[root]
  [frame — paints: border, seat, ring, the drop wash]
    [attachments? — a wrapping row of AttachmentChip]
    [field <textarea rows=1> — transparent, grows]
    [toolbar: [attach? — Button ghost "attach"] [leading] … [end: [trailing] [send | stop]]]
    [picker — hidden <input type="file">, when attachable]
  [hint? <p>]
  [suggestions? — while a trigger's list is open, above or below the frame]
    [listbox [option — [Icon?] [label] [description?]]*] | [loading rows] | [empty row]
  [status — the list's live region, when triggers are given]
```

## API

```ts
interface PromptInputProps {
  value?: string
  defaultValue?: string
  onChange?: (value: string) => void
  onSubmit: (value: string) => void // Enter, or the send control. Required: a composer that sends nowhere is a Textarea
  onStop?: () => void // the stop face's handler, while streaming
  streaming?: boolean // a reply is arriving: send becomes stop, Enter does nothing
  disabled?: boolean
  placeholder?: string
  label: string // the field's accessible name — a composer has no visible label
  maxRows?: 4 | 6 | 8 | 12 // how tall the field may grow before it scrolls, in lines. Default 8
  attachments?: PromptAttachment[] // controlled, always: the chips in the frame as the app knows them
  onRemoveAttachment?: (id: string) => void
  triggers?: PromptTrigger[] // the characters that open a list of suggestions: @ for people, / for commands
  onAttach?: (files: File[]) => void // files that passed the gate — picker, drop or paste. Draws the attach control. Paired with onReject
  onReject?: (rejections: FileRejection[]) => void // files the gate refused, and why (FileUpload's ear). Required with onAttach
  accept?: string // the native grammar, applied to drops and pastes too
  multiple?: boolean // false ⇒ one at a time; the rest are refused as count
  maxSize?: number // bytes; a file over it never reaches onAttach
  leading?: ReactNode // the toolbar's start — a model Select, a tools Menu; vocabulary controls, sm
  trailing?: ReactNode // the toolbar's end, before the send control
  hint?: string // one line under the frame — the app's own words about what happens next
  messages?: PromptInputMessages // { send, stop, attach, remove(name), uploading(name), suggestions?(count), loadingSuggestions?, noSuggestions? } — generic English defaults; localized hosts pass their catalog's
  autoFocus?: boolean
  id?: string
  name?: string
}
```

`PromptAttachment` is `{ id, name, size?, status?, message? }`: AttachmentChip's props plus the
`id` passed to the remove handler. `onAttach` and `onReject` are required together at the type
level, because without a reject handler the gate could refuse a file silently (FileUpload's
argument).

```ts
interface PromptTrigger {
  char: string // the one character that opens the list: '@', '/'
  label: string // the list's accessible name: 'People', 'Commands'
  options: PromptTriggerOption[] // the current list; with `filter: false`, the app's results for the query
  at?: 'word' | 'start' // at the start of any word (default), or only as the prompt's first character
  filter?: 'contains' | 'startsWith' | false // Combobox's filter. Default 'contains'; false means the app filters
  loading?: boolean // the app is loading options: skeleton rows under the options
  onQueryChange?: (query: string) => void // the typed query, when the list opens and on each change
  onSelect?: (option: PromptTriggerOption) => void // the option a pick wrote, after the text changed
}

interface PromptTriggerOption {
  id: string // the app's id, handed back in the pick
  label: string
  description?: string // a second line under the label
  icon?: IconRole // decorative, before the label
  insert?: string // the text a pick writes. Default: `char` and `label`. '' writes nothing
}
```

The `messages` keys for the list are optional, so a catalog written before them still type-checks.
An omitted one keeps its English default: "{count} suggestions", "Loading suggestions…" and "No
results".

Attributes: root `data-state="streaming|dragover"` (absent at rest), `data-disabled?`,
`data-empty?` (no text and no chips; the send control is disabled exactly then),
`data-max-rows`.

## Behaviour

- **Enter sends; Shift+Enter is a new line.** During IME composition, Enter belongs to the IME
  and sending would post half a word, so a key marked `isComposing` sends nothing, and neither
  does the key code 229 Safari gives the Enter that confirms a composition after it has ended.
- **Empty cannot be sent.** Whitespace is empty; a chip is content.
- **A sent prompt is cleared from the field** when the composer is uncontrolled. A controlled
  `value` belongs to the app, which decides whether to clear or keep the text after taking it.
- **While `streaming`**, the send control is the stop control and Enter does
  nothing. The app decides what stopping means (`onStop`).
- **Files arrive three ways**: the attach control (the hidden picker), a drop on the frame, and
  a paste into the field. Each runs FileUpload's gate (`accept`, `multiple`, `maxSize`) with the
  same two handlers. A text paste keeps its default behaviour; only a paste of files is taken.
- **The field grows** from one line with the prompt, up to `maxRows` lines, then scrolls. This is
  Textarea's autosize, always on.
- **Focus after a chip's removal.** The app removes an attachment in its own time. Once the
  attachment of a chip whose remove control was pressed has left `attachments`, focus moves to
  the remove control of the chip in its place, else of the chip before it, else to the field,
  and never falls to the page. Focus the reader has moved since the press stays where it is.

**Mentions and commands.** A trigger is a character that opens a list of the app's suggestions:
`@` for people, `/` for commands. The prompt stays plain text. There are no chips in it and no
rich text, because the model and the app both read the prompt as text.

- **A token opens the list.** A token is a trigger's character, followed by the text up to the
  caret with no whitespace in between. The text after the character is the query. With
  `at: 'word'`, the default, the character opens the list at the start of the prompt or after
  whitespace, so the `@` in an email address opens nothing. With `at: 'start'` it opens only as
  the prompt's first character, which is where a command belongs. A space or a line break closes
  the list, so a query never holds a space. The list is open while the field has focus and the
  caret is in a token. The engine's `promptToken` is the rule, in every framework.
- **The member filters**, as Combobox does: each option whose label contains the query (or
  starts with it, with `filter: 'startsWith'`), compared by the locale's collation at base
  sensitivity. An app that loads options for the query sets `filter: false` and shows its own
  results. `onQueryChange` tells it the query when the list opens and each time it changes, and
  `loading` draws Combobox's three skeleton rows under the options while the results arrive.
- **A pick writes text.** Enter, Tab or a press on an option picks it. The token, from the
  character to the caret, is replaced by the option's `insert`, or by the character and the
  label (`@Ada Lovelace`), followed by one space, and the caret goes after the space. Then the
  trigger's `onSelect` is called with the option, so the app keeps the ids it needs, as a
  message's mentions. An `insert` of `''` removes the token and writes nothing, for a command the
  app runs at once (`/clear`). A command is otherwise text in the prompt, because the model reads
  the prompt and the command is part of what was asked. The engine's `promptPick` is the rule.
- **The app reads the final text.** The member reports picks only. It does not follow the text a
  pick wrote, because a reader may edit any character of a plain-text prompt. An app that sends
  mentions checks, when the prompt is sent, which of the picked options' text is still in it.
- **Keys, with the list open.** Focus stays in the field. ArrowDown and ArrowUp move the active
  option and stop at the first and the last. Enter picks the active option. While the trigger is
  `loading` and no option is shown, Enter does nothing, because the options are about to arrive
  and a sent prompt cannot be taken back. When nothing matches, Enter sends the prompt as it does
  with the list closed, because the empty row has already said that nothing will be picked: a
  reader who writes "mail me @home" sends it with Enter. Shift+Enter breaks the line in every
  case. Tab picks the active option, and moves focus on as usual when there is none. Escape
  closes the list and keeps the text. The list stays closed while the caret is in that token,
  and the next token opens it again. With the list closed, every key does what it does without
  triggers. During IME composition the keys are the input method's, and the caret is not read,
  so a composition opens nothing until it ends.
- **Escape inside a Dialog** closes the list first, and the dialog stays open; the next Escape
  closes the dialog. A dialog's layer hears Escape on the document before the field does, and
  closes unless the key's default is prevented. So while the list is open the composer prevents
  it on the window, which the key reaches first, and Combobox's popover layer keeps its own first
  Escape the same way.
- **A press on the list** keeps focus in the field: the list takes no focus, and a press on an
  option picks it. The pointer moves the active option, as it moves Command's.
- **The list is anchored to the composer, not to the caret.** It is drawn in the composer's root,
  not in a portal, and is as wide as the composer. It opens above the composer, or below it when
  the viewport has more room below, measured when the list opens. A composer at the foot of a
  ConversationPage opens it over the thread. Its container must not clip it.
- **At phone width the list stays anchored**, at the composer's width, which is the screen's. It
  does not become Combobox's sheet below `30rem`. The composer sits at the bottom of the screen,
  above the software keyboard, where a bottom sheet would cover the field being typed in.
- **On iOS and Android** the composer draws no list. SwiftUI's text field reports no caret
  position on iOS 17, which the package supports, so it cannot tell which token the caret is in,
  and the Compose rendering draws what the SwiftUI one draws. An `@` or a `/` stays text in the
  prompt, and a native app names a person or a command from a Select or a Menu in `leading`
  (`packages/native/src/undrawn.ts`).

```contract
key Enter commits on field when with a prompt
key Enter nothing on field when empty
key Enter nothing on field when streaming
key ArrowDown moves-focus-next on field when suggesting
key ArrowUp moves-focus-previous on field when suggesting
key Escape closes on field when suggesting
dismiss both when suggesting
```

## Recipes (exact tokens)

| Part | Tokens |
| --- | --- |
| frame | column · gap `--pm-space-2` · padding `--pm-space-3` · bg `--pm-bg-surface` · border `1px solid --pm-border-field` · radius `--pm-radius-surface` (the page's largest control uses a surface's corner radius) · shadow `--pm-shadow-seat` · `stateFeedback` |
| frame, field focused | the composite-field focus convention (conventions §4) via `:has(> textarea:focus-visible)`: border `--pm-border-focus-solid`, the ring, `--pm-glow-focus` |
| frame hover | border `--pm-border-strong` (as Input; not applied when disabled or during dragover) |
| frame dragover | FileUpload's zone: bg `--pm-accent-subtle` · border `--pm-accent-bg` · shadow `--pm-glow-focus` |
| frame disabled | bg `--pm-bg-subtle` · border `--pm-border-subtle` · no seat · `cursor: not-allowed` |
| field | transparent, borderless (Input's inner field) · `text.md` quartet · `--pm-text-primary` · padding `--pm-space-1` `--pm-space-2` · `min-block-size` one md line · `resize: none` · placeholder `--pm-text-muted` at opacity 1. Below `30rem` it steps to the text-entry floor's size and line-height (conventions §13's focus-zoom floor, metrics only) |
| field ceiling | `max-block-size` = `maxRows` lines at the field's size (md, or the text-entry floor below `30rem`) + `--pm-space-2`, one rule per lawful value |
| attachments | wrapping row · gap `--pm-space-2` · AttachmentChip with `removeLabel = messages.remove(name)` and `uploadingLabel = messages.uploading(name)` |
| toolbar | wrapping row · gap `--pm-space-2` · attach `Button ghost/neutral/sm iconOnly icon="attach"` · `leading` · `end` pushed to the inline end holding `trailing` and the primary control |
| send | `Button solid/accent sm iconOnly icon="send" label={messages.send}` · disabled while empty or disabled |
| stop | `Button outline/neutral sm iconOnly icon="stop" label={messages.stop}` |
| hint | `text.xs` · `--pm-text-muted` · padding-inline `--pm-space-3` |
| suggestions | Combobox's popup panel: `--pm-bg-overlay` · `1px --pm-border-subtle` · `--pm-radius-surface` · `--pm-shadow-transient` · padding `--pm-space-2` · absolute in the root, `inset-inline: 0` · `--pm-space-1` from the frame, above (`data-side="top"`) or below (`data-side="bottom"`) · `z-index --pm-z-raise` · max-height `min(40dvh, calc(--pm-space-10 × 4))`, the list scrolling inside · glass as Combobox's panel |
| option | Combobox's option without its check column: min-height `--pm-control-height-sm` · padding-inline `--pm-space-3` · gap `--pm-space-2` · `text.sm` `--pm-text-primary` · radius `--pm-radius-sm` · `description` `text.xs` `--pm-text-muted` under the label · `icon` Command's glyph, `sm` `--pm-text-muted` |
| option active | Command's highlight: bg `--pm-selection-bg` · text `--pm-selection-text`, the glyph and the description inheriting. The active row is the pending pick that Enter makes |
| loading rows | Combobox's: Skeleton text `sm` × 3 at option height |
| empty row | Combobox's: `messages.noSuggestions` · `text.sm` `--pm-text-muted` · centred · height `--pm-control-height-sm` |

**On Android**: the field is at least the 48dp touch target tall, its first line at the top, so
an empty composer is taller than one md line with its padding. The frame's padding is less than
half the touch target, so a single line's touch area would otherwise reach past the frame. Each
line of attachments is 48dp tall, the chips drawn at the recipe's height in its middle, and a
removable chip keeps its remove control's reach after its surface (`attachment-chip.md`).

## States

| Entry | Render | Expect |
| --- | --- | --- |
| empty | placeholder only | `data-empty`, no `data-state` |
| with a prompt | `defaultValue` | no `data-empty` |
| grown | five lines at `maxRows={4}` | `data-max-rows="4"`, the field scrolls |
| attachable | `onAttach`/`onReject`, two chips | the attach control and the chips |
| the app's slots | a `Select size="sm"` leading, a `hint` | — |
| suggesting | `defaultValue="Ask @"`, `autoFocus`, an `@` and a `/` trigger | the people's list above the composer, its first option active |
| streaming | `streaming onStop` | `data-state="streaming"`, the stop face |
| disabled | `disabled` | `data-disabled` |
| voice input | a `RecordButton size="sm"` trailing | — |
| recording a voice message | the same, `recording` with `elapsed` and `level` | — |

`requiredSelectors`: `:hover`, `:focus-visible`, `[data-state="dragover"]`,
`[data-disabled]`: the frame's pointer, keyboard and drop states, and the disabled row, which the
stylesheet styles beyond the base.

## Motion

The frame's colours and seat use `stateFeedback`. The send/stop swap is a re-render, not a
transition. The two faces are two Buttons, and a control the user is about to press must not be
halfway through a crossfade. Chips appear and disappear by re-render for the same reason, and
PromptInput does not animate the row. TagInput animates its chips because they are a field's
value; these chips are files being uploaded. The suggestion list appears and leaves by re-render
too. It follows each keystroke, and a panel that scaled in at every trigger character would move
under the reader's typing.

## Icons

`attach` (labelled by `messages.attach`), `send` / `stop` (labelled by
`messages.send` / `messages.stop`), `close` through AttachmentChip's remove
(labelled), `document` through the chips (decorative), and each option's `icon` (decorative,
because its label carries the meaning).

## A11y

The field is a real `<textarea>` named by `label`, because a composer has no visible label but
still needs a name. Every control is a real Button labelled with the app's text: `messages`, whose
English defaults name the controls "Send", "Stop" and "Attach". The hidden
picker is outside the tab order and the accessibility tree; the attach Button stands in for it in
both. The frame's ring is the focus convention drawn around the whole composer. The field's own
outline is suppressed so there is one ring, not two. `data-state="streaming"` is the only new
state on the root, and the stop control's name states it in words.

With `triggers`, the field follows the ARIA combobox pattern as a textbox can. It is still a
textbox, because a `<textarea>` takes no `combobox` role, and `aria-expanded` is not a textbox's.
It carries `aria-autocomplete="list"` and `aria-haspopup="listbox"`, so it says it offers a list.
While the list is open, `aria-controls` names the listbox and `aria-activedescendant` the active
option, which has `aria-selected="true"`. The listbox is named by the trigger's `label`. One
polite live region in the root says how many options there are ("3 suggestions"), that they are
loading, or that nothing matches. The empty row is hidden from assistive technology, so its words
are heard once.

```contract
role field textbox
name field from label when with a prompt
role list listbox when suggesting
attr field aria-autocomplete=list when suggesting
attr field aria-haspopup=listbox when suggesting
announces live:polite "3 suggestions" when suggesting
```

## Agent

An agent reads the prompt's text, the attachments as choices named by their file names, whether a
reply is arriving and whether the composer is disabled. It fills and clears the prompt through the
field, as typing does, so `onChange` is called whether or not the caller controls the value. It
sends the prompt and stops the reply, as the one control's two faces do: `submit` calls
`onSubmit` and clears an uncontrolled prompt, and `stop` calls `onStop`. A send is refused while
the prompt is empty or a reply is arriving, and a stop while no reply is arriving, because the
control shows the other face then. It removes an attachment by its id through
`onRemoveAttachment`. An attachment is a disabled choice while the app gives no
`onRemoveAttachment`, because its chip then has no remove control. A disabled composer lists no
action.

The composer withholds its own parts: the attach control, the send and stop control and the
attachment chips are not members an agent lists, finds or runs, so an agent sees one composer
where a person sees one. The `leading` and `trailing` slots hold the app's controls, which stay an
agent's and are listed within the composer. An agent attaches no file, because a file comes from
the person's own device through the picker, a drop or a paste. It writes a mention or a command
as text with `fill`, because a pick writes text, and the suggestion list is a person's aid while
typing. The app learns of no pick then, so an app that sends mentions reads them from the sent
text, as the member's own rule says.

```agent
state value text as field value
state attachments choices
state streaming boolean as root data-state=streaming
state disabled boolean as root data-disabled
action fill text sets value calls onChange
action clear sets value calls onChange
action submit calls onSubmit when with a prompt
action stop calls onStop when streaming
action remove id calls onRemoveAttachment when attachable
withholds contents
```
