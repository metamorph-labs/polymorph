# FileUpload

A dropzone and a list of files with their upload states. It has no substrate: a labelled button
over a hidden `<input type="file">`, drag events, and composition (Progress, Icon).

**The app owns the network.** This component renders the `files` and statuses it receives and
requests actions (`onFilesAdd`, `onRetry`). It never uploads. This is the same split as
Combobox's async loading: uploading, error and done are states of the *surface*, not fetch
logic hidden in the vocabulary.

## Anatomy

```
[root]
  [dropzone <button>] — [Icon "upload"] [title line] [hint line] [+ hidden <input type="file">]
  [file list <ul>]
    [row]* — [Icon "document"] [name + meta] [trailing: Progress | Icon "success" | retry]
             [remove: iconOnly ghost "close"]
```

## Localization

Hosts can supply `messages` with `retry`, `remove(name)`, `progress(name)`, `announcement(file)` and
`formatSize(bytes)`. Localized applications must supply the complete set, including accessible
announcements. File names and upload state remain data; the host owns translated wording and units.

## API

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `files` | `{ id: string; name: string; size?: number; status: 'uploading' \| 'done' \| 'error'; progress?: number; message?: string }[]` | `[]` | controlled, always |
| `onFilesAdd` | `(files: File[]) => void` | required | from picker or drop, **only the files that passed the validation gate** |
| `onReject` | `(rejections: { file: File; reason: 'type' \| 'size' \| 'count' }[]) => void` | required | the files the gate refused, and why. The app turns each into an `error` row in its own words. A rejection is a *visible row*, never a silent drop, and a row can only exist in `files` *(required, because an optional handler would make that guarantee optional. A field with a `maxSize` and no `onReject` would silently drop an oversize file, with no row, message or event, and the user would see a chosen file fail to appear. The component cannot add the row itself and must not hide the refusal, so the handler is required)* |
| `onRemove` | `(id: string) => void` | required | |
| `onRetry` | `(id: string) => void` | — | renders retry on `error` rows |
| `accept` / `multiple` | native grammar, enforced here | — / `true` | `accept` also informs the hint line text the app passes. Both apply to a **drop** as well as to the picker. `.ext`, `type/subtype` and `type/*` all match, and `multiple={false}` keeps the first file that passes and rejects the rest as `'count'` |
| `maxSize` | `number` (bytes) | — | enforced here: an oversize file never reaches `onFilesAdd`; it reaches `onReject` as `'size'` *(the gate is one function in front of both the picker and drop, which apply `accept`, `multiple` and `maxSize` alike, so a single-file PDF field never passes the app three oversize PNGs. The row still belongs to the app, which is what `onReject` is for.)* |
| `title` / `hint` | `string` | "Drop files or click to browse" / — | dropzone copy; apps localize by passing |
| `messages` | `{ retry: string; remove: (name: string) => string; progress: (name: string) => string; announcement: (file: FileUploadItem) => string; formatSize: (bytes: number) => string }` | English | every string the rows use: the retry and remove controls' names, a row's progress-bar name, the polite announcement when a file finishes or fails, and the size formatter. All keys or none; omitting it keeps the generic English defaults |
| `disabled` / `invalid` | `boolean` | `false` | |

Attributes: dropzone `data-state="idle|dragover"`, `data-disabled?`,
`data-invalid?`; rows `data-status="uploading|done|error"`.

## Recipes (exact tokens)

| Part | Tokens |
| --- | --- |
| dropzone | border `1px dashed --pm-border-strong` (the only dashed border in the system; it means "not yet content") · radius `--pm-radius-lg` · bg `--pm-bg-subtle` · padding `--pm-space-6` · centered Stack gap `--pm-space-2` · full width |
| dropzone hover | bg `--pm-bg-surface` · border `--pm-accent-bg` |
| dropzone dragover | bg `--pm-accent-subtle` · border `1px dashed --pm-accent-bg` · shadow `var(--pm-glow-focus)` (a pending drop is as active as focus. Ornament `none` derives no glow, and the border alone shows the state) |
| dropzone icon | `upload` `lg` · `--pm-text-muted`; dragover `--pm-accent-text` |
| title line | `text.sm` quartet · `--pm-text-primary` |
| hint line | `text.xs` · `--pm-text-muted` |
| file row | padding `--pm-space-2` `--pm-space-3` · gap `--pm-space-3` · radius `--pm-radius-md` · border `1px solid --pm-border-subtle` · rows stack gap `--pm-space-2` · top gap to zone `--pm-space-3` |
| row icon | `document` `md` `--pm-text-muted` |
| name | `text.sm` `--pm-text-primary` · ellipsis · meta (formatted size) `text.xs` `--pm-text-muted` |
| uploading | trailing Progress `sm` (its own spec, gradient fill included) + percent `text.xs` `--pm-text-muted` `var(--pm-font-numeric)` |
| done | Icon `success` `md` `--pm-success-text` |
| error | row border `--pm-danger-border` · `message` `text.xs` `--pm-danger-text` under the name · retry Button `ghost/neutral/sm iconOnly icon="refresh" label="Retry"` |
| remove | Button `ghost/neutral/sm iconOnly icon="close" label="Remove {name}"` on every status (cancelling during upload is `onRemove`) |
| disabled | zone text/icon `--pm-text-disabled` · border `--pm-border-subtle` · no hover/drop |
| invalid | zone border `1px dashed --pm-danger-border` (FormField's error carries the message) |

## FormField integration

As for Input: the dropzone button takes the field label (`aria-labelledby`), description and
error go through `aria-describedby`, and `invalid` comes from context. The hidden
`<input type="file">` carries `name` for native form posts.

## States

| Entry | Render | Expect |
| --- | --- | --- |
| idle | empty | zone `data-state="idle"` |
| dragover | simulated | `data-state="dragover"` |
| uploading | one row 40% | row `data-status="uploading"` |
| mixed list | uploading + done + error | three `data-status` values |
| error with retry | `onRetry` | retry present |
| disabled / invalid | each | `data-disabled` / `data-invalid` |

`requiredSelectors`: `:hover`, `:focus-visible`, `[data-state="dragover"]`,
`[data-status="error"]`, `[data-disabled]`.

## Motion

Rows enter with `slide-fade` `sm` from the top edge, `control` class, because they arrive
*from* the zone. Removals `fade` at `control-exit`, then the list reflows on the layout spring
(TagInput's precedent). The zone's hover and dragover are `stateFeedback` colour transitions.
Progress animates per its own spec. At `none` or under reduced motion, each pattern's
projection applies, and dragover stays clear through colour and border.

## Icons

`upload` (zone, decorative), `document` (row, decorative), `success` (done, decorative,
because status is in `data-status` and the row text), `refresh` (retry, labelled), `close`
(remove, labelled).

## A11y

The dropzone is a real `<button>` (Enter/Space open the picker). Drag-and-drop is an
*enhancement*, never the only path, and it follows the same `accept`, `multiple` and `maxSize`
rules the picker enforces natively. Status changes are announced through a single
`aria-live="polite"` region ("{name} uploaded" / "{name} failed: {message}"). An uploading
row's Progress has `aria-label="{name} upload progress"`. The error `message` prop is the
app's text; the vocabulary never writes error text.

```contract
role dropzone button
key Enter activates on dropzone when idle
announces live:polite when idle
```

## Agent

An agent reads the files the application lists, each with its status, and whether the field
is disabled or invalid. It removes a file or retries a failed one by the file's id, which asks
the application through `onRemove` or `onRetry`, as the row's Buttons do; the application owns
the list and the network, so the files change when the application changes them. A retry is
refused while the field offers none (no `onRetry`) and for a file that has not failed, as no
retry Button is drawn for it. An agent adds no file: a file is on a person's disk, and the zone
opens the person's own picker. The remove and retry Buttons are the member's own parts, so the
member withholds them and the bridge lists the FileUpload in their place. `files` holds each
file as the application passed it, and `rows` names each file by its id with its name as the
label, which are the ids the two actions take. A disabled field lists no action.

```agent
state files list
state rows choices
state disabled boolean as dropzone data-disabled
state invalid boolean as dropzone data-invalid
action remove id calls onRemove
action retry id calls onRetry when error with retry
withholds contents
```
