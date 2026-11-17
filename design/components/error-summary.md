# ErrorSummary

A danger-toned region that lists every error after a failed submit, each entry linking to its
field (WCAG 3.3.1). Without this member, every form would invent the pattern or skip it.

It has no substrate: static semantics and real anchors.

ErrorSummary is *not* a larger version of FormField's per-field error. `form-field.md` keeps
per-field messages as `aria-describedby` text, because form-level announcements belong to the
screen and per-field alerts stack unusably. This member is that screen-level announcement. The
two are designed together: the field's error is read when the user reaches the field, and the
summary is how they reach it. It is also not an Alert with links added. Alert states a status
and may be dismissed. ErrorSummary is **navigation** and has no dismiss. It disappears when
the errors are fixed and the app stops rendering it. Its body is a list with a count, not
prose. It uses Alert's danger recipe because the tone is the same, but its job is different.

The app decides placement, usually above the form and under the PageHeader. The member renders
where it is mounted and makes no assumptions about the page.

## Anatomy

```
[root — role="alert"]
  [icon: "error"] [title]
  [list <ul>]
    [<li><a href="#fieldId">label</a></li>]*
```

## API

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `title` | `string` | required | app text, such as "The ticket can't be raised yet". The vocabulary writes no error copy |
| `errors` | `{ label: string; fieldId: string }[]` | required | `label`: the message, in the same words as the field's own error, so the two never differ. `fieldId`: the governed control's id. FormField's `id` prop **is** the control's id (`form-field.md`), so the link target, such as `#priority`, already exists. Empty renders nothing, not an empty box |

Attributes: none. There are no variants, sizes or tone prop, because the content is always
errors and so always danger.

## Behavior

- Mounts with `role="alert"`, so it is announced assertively **on arrival, without moving
  focus**. Assertive, because a failed submit interrupted the task and the user needs the
  reason now. Focus does not move on arrival, so the reading position is kept (Alert's
  dismiss rule, applied to arrival). This is the standard pattern; it is not downgraded to
  `status`.
- Each entry is a real `<a href="#fieldId">`: copyable, middle-clickable and meaningful
  without JavaScript. Activation **also moves focus to the control**, because a fragment jump
  alone scrolls without moving the caret. With focus on the field, a screen reader reads
  FormField's `aria-describedby` error together with the input it describes.
- A second failed submit updates the list in place, and `role="alert"` announces the new
  content. The member never sorts `errors`. The app passes them in form order, which is the
  tab order (Stat's rule).

## Recipe (exact tokens)

Alert's danger recipe, row for row (`alert.md`), plus the list:

| Part | Tokens |
| --- | --- |
| root | bg `--pm-danger-subtle` · border `1px solid --pm-danger-border` · radius `--pm-radius-lg` · padding `--pm-space-4` · gap `--pm-space-3` · icon top-aligned to the title line |
| icon | `error` · `md` · `--pm-danger-text` |
| title | `text.sm` quartet · `--pm-text-primary` (Alert's rule: hierarchy comes from colour, not extra weight) |
| list | top gap `--pm-space-2` · column · gap `--pm-space-2` · markers suppressed, because the links are the rows and a bullet before each adds nothing |
| link | `text.sm` quartet · `--pm-danger-text` · underline `1px`, offset `2px` (Link's inline metrics, `link.md`). It uses the danger text role, not accent, because an accent link inside a danger wash would mix two tones. Always underlined, because colour is never the only signal (Link's law). `danger.text` on `danger.subtle` is the checked pairing Alert already uses |
| link hover | `text-decoration-thickness: 2px`: weight, not colour (Link's exact rule; there is deliberately no danger text-hover role) |
| focus | the shared focus ring (conventions §4) on each anchor |

## States

| Entry | Render | Expect |
| --- | --- | --- |
| two errors | title "The ticket can't be raised yet"; Subject is required → `#subject`, Pick a priority → `#priority` | `role="alert"` · `<ul>` of 2 · anchors `href="#subject"`, `href="#priority"` |
| one error | a single entry | list semantics kept, because the count is content |
| long labels | a wrapping message | underline continues across the wrap |
| empty | `errors={[]}` | renders nothing |

`requiredSelectors`: `:hover`, `:focus-visible`.

## Motion

None on enter, per Alert's rule: page content does not animate in. Also, `role="alert"`
already announces the arrival to the users an entrance animation cannot reach. A failure is
the wrong place to spend the view's one transition. No exit animation either: it unmounts with
the app's render when the errors are gone.

## Icons

`error` (decorative, because the role and the title carry the announcement).

## A11y

`role="alert"` on the root, per Behavior. The list is a real `<ul>`, so a screen reader
announces the count first. Anchors are real anchors with visible focus per conventions §4, and
their row meets the target-size floor. The title is styled text, not a heading element,
because heading levels are page structure the app owns (Alert's precedent). A form that wants
the summary in its outline adds its own Heading. Every label uses the same words as the
field's own error, so the summary, the field and the fix read consistently.

```contract
role root alert when two errors
announces live:assertive "Subject is required" when two errors
role list list when two errors
role entry link when two errors
key Enter activates on entry when two errors
```

## Agent

An agent reads the errors and follows one to its field, as a person does. The summary reads
them from its own list in the document, in order, as List reads its items: each error is a
choice whose id is its link's `href`, `#` and the field's id, and whose label is its message.
Two errors that would share an id are each a choice, because each is a link a person presses:
the second takes ` (2)` after the id. `choose` presses the error's link with its own click, so
focus moves to the field, where the field's own error is read with it, and an agent fills the
field through the field's own member. With no element of that id, the browser follows the
fragment, as for a person. The summary has no name of its own: an agent finds it by the text it
shows, the title first. An empty summary renders nothing and is not listed.

```agent
state items choices
action choose id presses entry
```
