# Avatar

Avatar shows a person or workspace as a mark: the image, else initials, else the
`user` glyph. Its main use is the assignee cell (Avatar + name), with the glyph for an
unassigned item.

## Anatomy

```
[root circle] — [image] | [initials] | [Icon "user"]
```

## API

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `name` | `string` | required | initials + `title`/label source; "Ada Lovelace" → "AL", single word → first two letters |
| `src` | `string` | — | image URL; on load error, falls back to initials |
| `size` | `'sm' \| 'md' \| 'lg'` | `'md'` | |
| `label` | `string` | — | when the avatar stands alone (no adjacent name text): `role="img"` + `aria-label`; otherwise `aria-hidden`, because the visible name carries the meaning |

Attributes: `data-size`, `data-fallback="initials|icon"?`.

## Dimensions & recipe (exact tokens)

Always a circle, `--pm-radius-pill`. Identity marks are round at every geometry, the
same choice Switch makes for its pill (`switch.md`).

| Size | Diameter | Initials step |
| --- | --- | --- |
| `sm` | `--pm-space-6` (24) | `text.xs` |
| `md` | `--pm-space-7` (32) | `text.sm` |
| `lg` | `--pm-space-8` (48) | `text.lg` |

| Part | Tokens |
| --- | --- |
| image | cover-fit · border `1px solid --pm-border-subtle` (photos need containment on every surface) |
| initials fallback | bg `--pm-accent-subtle` · text `--pm-accent-text` · uppercase · step per size table |
| icon fallback (only when `name` is empty — the unassigned/unknown edge) | bg `--pm-bg-subtle` · `Icon "user"` at the size-matched icon token (sm→sm, md→md, lg→lg) in `--pm-text-muted` |

There are no per-user hues, on purpose. A hash-to-hue scheme is a new colour decision
outside the role system. If one is wanted, it enters through the theme engine, not
through this component.

## Avatar.Group

Avatar.Group shows a set as one mark, such as the assignees on a row or the members of
a space. It is a row of overlapping Avatars in the order the app ranks them, with a
"+N" chip when `max` cuts the set.

```
[group <div role="group" aria-label={label}>]
  [Avatar]* — overlapping, each ringed in the surface
  [surplus chip "+N"?]
```

```ts
interface AvatarGroupProps {
  /** Avatars, in the order the app ranks them. One `size` across the set. */
  children: ReactNode
  /** Draw at most this many; the rest fold into "+N". Absent draws all. */
  max?: number
  /** The set's accessible name — "Assignees", not "Avatars". */
  label: string
}
```

| Part | Tokens |
| --- | --- |
| ring | `2px` of `--pm-bg-surface` around every mark. This is the charts' 2px-surface-gap rule applied to a circle: touching marks are separated by the surface showing through, never by a stroke |
| overlap | each mark after the first overlaps the previous one by **a quarter of its own diameter** (`margin-inline-start: calc(size-token / -4)`). It is a ratio, not a length, so every size stacks the same way. The 2px surface ring keeps each mark legible where it is overlapped. A quarter is enough to read as one group and small enough that every face stays recognisable |
| surplus chip | Avatar's own geometry (size table, circle) with the icon fallback's bg `--pm-bg-subtle`. The count uses the size's initials step in `--pm-text-secondary`, one step stronger than the fallback glyph's muted, because a count is read as text |

Members share one `size`. A mix triggers a dev-warning, because the overlap arithmetic
assumes one diameter and a set reads as one unit. The group is `role="group"`, named
by `label`. Every member renders as a standalone mark, under the standalone case of
the `label` rule, because a group has no adjacent name text. The surplus chip is real
text and never `aria-hidden`. Initials are hidden because they are a picture of a
name, but "+3" *is* the information, and exposing it is the text alternative the
overflow needs.

## States

Entries: image, initials ("Ada Lovelace" → AL), single-word name, icon edge, three
sizes, standalone with `label`; a group of five with `max={3}` (three marks +
"+2"), a group under `max` (no chip). `requiredSelectors`:
`[data-fallback="initials"]`.

## Motion

The image fades in on load (`fade`, `control` class) over the initials already
rendered, so nothing pops in. At `none`: instant swap.

## Icons

`user` (fallback only).

## A11y

Per the `label` rule above. Initials are always `aria-hidden`, because they are a
picture of the name, not the name.
