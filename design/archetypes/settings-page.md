# SettingsPage (archetype)

The settings screen: PageHeader + SettingsRow.Groups in a single readable column.
Relay's Settings screen (in the workbench's demo product) is built on it.

## Anatomy & API

```
[root — inside AppShell content]
  [PageHeader — title/description from props]
  [children — SettingsRow.Group stack]
```

| Prop | Type | Notes |
| --- | --- | --- |
| `title` / `description` | as PageHeader | `title` required |
| `children` | SettingsRow.Groups | |

No actions slot, because settings apply instantly (SettingsRow's law). That includes a
setting the server stores under a revision (§Revisioned saves). A screen that needs a save
bar is a FormPage, not a SettingsPage.

## Revisioned saves

Some servers store settings under a revision: a save names the revision the page read, and
the server refuses a save made against an older one. A section of such settings is still a
`SettingsRow.Group` with no save bar. The group is the unit of revision.

- **One save at a time per group.** A row's control sends its change at once, with the
  group's revision. While that save is pending, the group's other controls are `disabled`,
  because a second save would name the revision the first one replaces. The control that
  sent keeps the value it sent and keeps focus. The server's answer brings the next
  revision.
- **The pending state is one toast.** The save runs as `toast.promise(save, { loading,
  success, error })`: the loading face stays while the save is in flight, and the same card
  becomes the outcome (`toast.md`). A row draws no spinner and no "Saving" label of its
  own, because SettingsRow has no status surface.
- **A refusal reloads.** When the server refuses a stale revision, the toast's error face
  says the change was not saved. The page reads the stored values and their revision, and
  each row shows the stored value, so the person chooses again from what is stored.
- **A typed or composed value** (a name, a set of regions) is not edited in its row. The
  row's control is a Button (`outline/neutral`) that opens a Dialog holding the field. The
  Dialog's footer holds the one solid Button, which is `loading` while the save is pending,
  and the cancel waits, as in ConfirmDialog. A field error belongs to the Dialog's
  FormField; the row still has no error surface.
- **A save whose outcome is unknown** (the answer was lost, so the server may have applied
  it) is a `warning` `ToastNotice`, which stays until it is resolved, with its retry and
  discard controls and `dismissible={false}`, because they are the only way to resolve it
  (`toast.md`). It is not a block of Buttons in the page. The group's other controls stay
  `disabled` until the person retries or discards. A retry sends the same operation against
  the same revision, so the server applies it at most once.
- **A change that revokes or removes something** (disabling a product) is confirmed in a
  ConfirmDialog before it is sent.
- The revision is the server's record, not a setting, so no row shows it.

## Pattern tokens (declared on root — `--pm-page-*` namespace, per-instance)

| Token | Value | (std/compact/comfortable) |
| --- | --- | --- |
| `--pm-page-padding-x` | `var(--pm-space-7)` | 32 / 28 / 36 |
| `--pm-page-padding-y` | `var(--pm-space-6)` | 24 / 20 / 28 |
| `--pm-page-max-width` | `calc(var(--pm-space-10) * 8)` | 768 / 656 / 880. Settings read as one column, and a 1248 settings page leaves too much empty space |
| `--pm-content-gutter` | `var(--pm-space-6)` | between header and groups, and group to group |

Container-first responsiveness (`docs/layout.md`): in a region narrower than `40rem`
the page steps `--pm-page-padding-x` to `var(--pm-space-6)` and `--pm-page-padding-y`
to `var(--pm-space-5)`. The root declares `container-type: inline-size` so the rows on
it measure the page rather than the window. The rule and its reasoning are stated once in
`list-page.md` §In a narrow region.

## Recipe

Root: max-width + margin-inline auto + padding from the tokens; column, row-gap
`--pm-content-gutter`; `container-type: inline-size`. Group titles render as `<h2>` (the
page outline: h1 = PageHeader, h2 = groups).

## States

Entries: two groups; header with description; single group minimal.
`requiredSelectors`: —.

## Motion / Icons / A11y — none of its own; composition carries everything. The
archetype is a rhythm declaration, and that is why it exists: changing the pattern means
editing these four lines, and no screen needs to change.
