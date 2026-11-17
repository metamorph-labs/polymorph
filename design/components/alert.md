# Alert

Alert is an inline status callout in page content, beside what it is about, such as a
validation summary, a notice about one section's data or an empty-quota warning. It has no
substrate: static semantics and one dismiss button.

Toast appears in the corner and leaves. Alert stays in the page. A transient event
belongs in a Toast. A notice about the whole application, such as degraded service, belongs
in a Banner, which is drawn once in the AppShell's frame and is the same on every page. Content that needs a title bar, or more than two actions, belongs in a
Card with status content. Alert covers the single-surface case between the two, including a
review the reader answers in place: apply or discard.

An Alert given no title and no content renders nothing, as an ErrorSummary with no errors does.
A screen can therefore draw an Alert always and bind its `title` to a message that is empty
while there is nothing to say. `action`, `secondaryAction` and `onDismiss` are not content: an
Alert with only those renders nothing too.

## Anatomy

```
[root] — [tone icon] [body: [title?] [children?] [actions?: [action?] [secondaryAction?]]] [dismiss: iconOnly ghost "close"?]
```

## API

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `tone` | `'info' \| 'success' \| 'warning' \| 'danger'` | `'info'` | |
| `title` | `string` | — | the first line; `''` is no title |
| `children` | `ReactNode` | — | body copy; bare strings take the body recipe. With no title and no content the Alert renders nothing |
| `action` | `ReactNode` | — | the first action: one `ghost`/`soft` `sm` Button, such as Apply |
| `secondaryAction` | `ReactNode` | — | the second action: one `ghost` `sm` Button after `action`, such as Discard. Two actions are the most an Alert takes, because a third makes the callout a toolbar; content that needs more is a Card |
| `onDismiss` | `() => void` | — | renders the close button; the app handles the unmount |
| `dismissLabel` | `string` | `'Dismiss'` | the close button's accessible name (the localization seam), and the member's only built-in string. Localized apps pass their catalog value; omitting it keeps the generic English default |
| `icon` | `false` | — | suppresses the tone icon, for dense stacks where the wash already shows the tone |

Attributes: `data-tone`. There are no variants and no sizes. As with Toast, the tone
shows through the icon and title colour, and here also through the wash. A solid Alert
would compete with Toast.

What counts as content is what each renderer can know:

| Renderer | No content |
| --- | --- |
| React | `children` is `undefined`, `null`, `true`, `false` or `''`: a value React draws nothing for |
| Vue, Svelte, Solid, Angular, elements | the default slot is empty: between the tags there is only content for `action` or `secondaryAction`, line breaks and indentation |
| SwiftUI, Compose | `children` is `nil` or `null` |

An Alert with a title and no content draws the title alone, with no body under it.

## Recipes (exact tokens)

| Part | Tokens |
| --- | --- |
| root | bg `--pm-{tone}-subtle` · border `1px solid --pm-{tone}-border` · radius `--pm-radius-lg` · padding `--pm-space-4` · gap `--pm-space-3` · icon top-aligned to title line |
| tone icon | role per tone (`info/success/warning/error`) · size `md` · `--pm-{tone}-text` |
| title | `text.sm` quartet · `--pm-text-primary` (same as Toast: hierarchy comes from colour, never from an added weight) |
| body | `text.sm` · `--pm-text-secondary` · top gap `--pm-space-1` when a title is present |
| actions row | top gap `--pm-space-2` · a row that wraps, gap `--pm-space-2` · `action` first, then `secondaryAction`; Button `ghost`/`soft` `sm` only, matching tone or neutral |
| dismiss | Button `ghost/neutral/sm iconOnly icon="close" label="Dismiss"` · top-right · `--pm-text-secondary` |

On the wash, the icon uses the law-checked `{tone}.text`-on-`{tone}.subtle` pairing.
Title and body use `text.primary/secondary`, which pass on every `bg.*`. The wash is a
`subtle` step, so it is inside the checked set.

## States

| Entry | Render | Expect |
| --- | --- | --- |
| each tone | ×4 | `data-tone` |
| title + body | both | — |
| body only | no title | — |
| title only | `title`, no content | the title, with no body under it |
| with action | `action` | — |
| with two actions | `action` + `secondaryAction` | both in one row, `action` first |
| dismissible | `onDismiss` | close button present |
| icon suppressed | `icon={false}` | — |
| nothing to say | `title=""`, no content, `onDismiss` | renders nothing |

`requiredSelectors`: `[data-tone="danger"]` (the entries assert all four tones; danger
is the one tone the CSS must key beyond the shared block).

## Motion

No enter motion, because an Alert is page content, not an arrival (restraint,
`docs/concepts.md`: a view gets at most one hero transition, and this is never it).
Dismiss: `alert.dismiss` binding, `collapse`, **exit** mode, `surface` class. The
content fades over the first half, then the row's height closes. This applies the toast
stack's gap-close to page flow. At `none` / reduced motion: per `collapse`'s
projections.

## Icons

`info` / `success` / `warning` / `error` by tone (decorative, because the role attribute
announces the tone); `close` on dismiss (labelled).

## A11y

`role="status"` for info/success, `role="alert"` for warning/danger. A static Alert is
in the tree from the start. Apps that mount Alerts in response to events get the correct
politeness automatically. An Alert that renders nothing until its title arrives is one of
these: its root carries the role from the first render that draws it, with the title already
in it. Dismiss is a real labelled button, and Enter on it dismisses.
Focus does not move on dismiss, so the reading position is kept; nothing was modal. The
document order is the reading and focus order: `action`, then `secondaryAction`, then
dismiss, so Tab reaches the answers before the button that sets the question aside.

```contract
role root status when info
announces live:polite "Sandbox mode" when info
role root status when success
role root alert when warning
role root alert when danger
announces live:assertive "Two fields need attention" when danger
announces live:assertive "The changes could not be saved" when title only
role dismiss button when dismissible
name dismiss from dismissLabel when dismissible
key Enter activates on dismiss when dismissible
```

## Agent

An agent reads the tone, the title (empty when there is none) and whether the Alert can be
dismissed, and dismisses it as the ✕ does: the Alert plays its departure, and the step ends
once `onDismiss` has run, so the application can unmount it. An Alert with no `onDismiss` has
no ✕, so a dismiss fails. The ✕ is the Alert's own part, so it is withheld and the Alert's
`dismiss` stands in its place. The `action` and `secondaryAction` the application passes are its
own controls: they stay an agent's, listed within the Alert. The `danger` tone colours the
message, and a dismiss only sets it aside, so no action needs a person. The Alert has no name of
its own: an agent finds it by the text it shows. An Alert with no title and no content renders
nothing and is not listed.

```agent
state tone text as root data-tone
state title text
state dismissible boolean as dismiss present
action dismiss calls onDismiss
destructive never
withholds contents when dismissible
```
