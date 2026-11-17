# AttachmentChip

AttachmentChip shows a file attached to a prompt: in the composer, where it can
still be removed, and in the sent message, where it cannot. It has no substrate: a
span, an Icon or Spinner, and Button for the remove control.

AttachmentChip is FileUpload's row at TagInput's scale. FileUpload's row is a line
in a list with a progress bar and a retry. A chip is a compact object in a row of
chips under a prompt, where a progress bar would be wider than the name. It is
*not* a Badge: a badge is a read-only category, and a chip is something the reader
added, with a name, a size and, in the composer, a way to remove it. It is *not*
TagInput's chip: a tag is a word the reader typed, an attachment is a file they
chose, and the two are removed by different gestures.

**The app owns the network** (FileUpload's rule). The chip draws `status` and
`message` as given and requests removal through `onRemove`. It never uploads and
never writes its own failure text.

## Anatomy

```
[chip <span>]
  [mark — Icon (icon | error) | Spinner sm while uploading]
  [body: [name | Link name] [meta: size?] [message? — error only]]
  [remove? — Button ghost/neutral/sm iconOnly "close"]
```

## API

```ts
interface AttachmentChipProps {
  name: string // the file's name, ellipsed when narrow
  size?: number // bytes — FileUpload's formatBytes, so sizes read the same in both places
  status?: 'uploading' | 'done' | 'error' // done is the rest state
  message?: string // the app's copy for a failure
  href?: string // the file, openable: the name becomes a Link (external)
  onRemove?: () => void // supplied ⇒ the remove control draws
  removeLabel?: string // the remove control's name; default `Remove {name}`, apps localize by passing
  uploadingLabel?: string // what a reader hears while the file uploads; default `{name}: uploading`, apps localize by passing
  icon?: IconRole // the leading mark; default document
}
```

Attributes: `data-status="uploading|done|error"`, FileUpload's grammar. Every
status is named, including the rest state, because the fixture asserts it.

## Recipes (exact tokens)

| Part | Tokens |
| --- | --- |
| chip | inline-flex · gap `--pm-space-2` · `min-block-size --pm-control-height-sm` (the target floor) · padding `--pm-space-1` `--pm-space-2` `--pm-space-1` `--pm-space-3` (`--pm-space-3` on both ends when there is no remove control) · bg `--pm-bg-surface` · border `1px solid --pm-border-subtle` · radius `--pm-radius-control` · `stateFeedback` |
| mark | `sm` glyph · `--pm-text-muted` |
| name | `text.sm` quartet · `--pm-text-primary` · ellipsis |
| meta | `text.xs` · `--pm-text-muted` |
| message | `text.xs` · `--pm-danger-text` (FileUpload's message cell) |
| remove | Button `ghost/neutral/sm iconOnly icon="close" label={removeLabel}` |
| uploading | Spinner `sm` in the mark, named `uploadingLabel` (default `"{name}: uploading"`) · name `--pm-text-secondary` |
| error | border `--pm-danger-border` · mark `error` in `--pm-danger-text` · the message takes the size's place |

**On Android**: the chip reserves the 48dp touch target's height around its surface, so the
linked name's touch area, the touch target tall on the chip's middle, is the chip's own. A row
of chips is 48dp tall, and the surface keeps its drawn height in its middle. The remove control
keeps its drawn size inside the surface, so a removable chip is the recipe's height too. Its
touch area, the touch target centred on it, reaches past the surface's top and bottom into that
room and past the surface's end, and the chip keeps the reach past its end after the surface, as
TagInput's chips do: in PromptInput, removable chips stand 8dp apart at the standard density, not
`--pm-space-2`.

## States

| Entry | Render | Expect |
| --- | --- | --- |
| removable | `onRemove`, name and size | `data-status="done"` |
| sent | no `onRemove` | `data-status="done"` |
| openable | `href` | the name is a link |
| uploading | `status="uploading"` | `data-status="uploading"` |
| error | `status="error" message` | `data-status="error"` |
| a long name | 70 characters, `icon="table"` | ellipsed, the control reachable |

`requiredSelectors`: `[data-status="error"]`, `[data-status="uploading"]`. These
are the two statuses the stylesheet keys beyond the shared block. Hover and focus
belong to Button and Link.

## Motion

The chip's colours run on `stateFeedback`. Entering and leaving a row is
PromptInput's reflow, not the chip's, because a chip knows nothing about its
neighbours (the same split as TagInput).

## Icons

`document` by default, or any object role via `icon` (decorative, because the name
says what it is); `error` in the error state (decorative, because the message
explains); `close` on the remove control (labelled); `loading` through Spinner.

## A11y

The name is text, or a Link when `href` is given (new tab, `rel="noreferrer"`).
The remove control is a real Button named `Remove {name}`, so a row of six chips
gives a screen reader six distinct buttons. Uploading is announced once, in words,
by the Spinner's own `role="status"`, named with the file. The error message is
the app's text in reading order after the name. The danger colour is never the
only signal.

## Agent

An agent reads the file's name and its status (`uploading`, `done` or `error`), and removes the
chip through `onRemove`, as its remove control does. A chip with no `onRemove` is the record of
a sent file and draws no remove control, so it refuses `remove` and the step fails. The chip
withholds its own parts: its remove Button and the Link its name becomes are not members an
agent lists, finds or runs, so an agent sees one chip where a person sees one. Inside a
PromptInput the chips are the composer's parts, and the composer withholds them in turn.

```agent
state name text
state status text as root data-status
action remove calls onRemove
withholds contents
```
