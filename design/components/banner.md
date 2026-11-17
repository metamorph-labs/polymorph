# Banner

A Banner is the notice that belongs to the application frame and stays until its cause ends:
an outage, a trial that is running out, a member of staff acting inside a customer's
account, a page showing a stale snapshot. It is the same on every page, so it is drawn once,
across the full width, above everything else. It is not Alert, which is a callout inside one
page's content and is about that page. It is not Toast, which reports an event and leaves.
There is no substrate: static semantics and one dismiss button.

## Anatomy

```
[root] — [tone icon?] [content: [message] [action?]] [dismiss: iconOnly ghost "close"?]
```

## API

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `tone` | `'neutral' \| 'info' \| 'warning' \| 'danger'` | `'neutral'` | `neutral` states a fact about the session, such as whose account is open. There is no `success`: a recovery is an event, and an event is a Toast |
| `children` | `ReactNode` | required | the message, in a sentence or two. Bare strings take the message recipe |
| `action` | `ReactNode` | — | one `ghost` or `soft` `sm` Button, or one Link: the way out of the condition, such as Upgrade, Stop or Status page. One is the most a Banner takes |
| `onDismiss` | `() => void` | — | renders the close button; the app handles the unmount. A Banner whose cause is still true is not dismissible, so the app passes it only where hiding the notice is safe: a reminder, never an outage or an open customer account |
| `dismissLabel` | `string` | `'Dismiss'` | the close button's accessible name (the localization seam), and the member's only built-in string |

Attributes: `data-tone`. There are no variants and no sizes.

A Banner goes in AppShell's `banner` slot, or first in the document of an application without
an AppShell. A frame shows one Banner. When two conditions hold, the app shows the more severe
one, because a stack of bars pushes the page down and each added bar is read less.

## Recipes (exact tokens)

| Part | Tokens |
| --- | --- |
| root | a row, top-aligned · gap `--pm-space-3` · padding `--pm-space-2` `--pm-space-4` · rule `1px solid` at its foot · no radius, because it runs edge to edge |
| root, neutral | bg `--pm-bg-subtle` · rule `--pm-border-default` |
| root, toned | bg `--pm-{tone}-subtle` · rule `--pm-{tone}-border`, the pairing Alert uses |
| tone icon | role per tone (`info`, `warning`, `error`) · `--pm-{tone}-text` · none on `neutral` · one `--pm-control-height-sm` tall, so it sits on the centre line of the action and of the first line of the message |
| content | the message and the action, a row that wraps · gap `--pm-space-2` `--pm-space-3` · takes the free width between the icon and dismiss |
| message | `text.sm` quartet · `--pm-text-primary` · padded so one line is one `--pm-control-height-sm` tall · basis `calc(var(--pm-space-10) * 2)`, the narrowest column a sentence reads in: a short message keeps its action beside it on a phone, and the action wraps under the message before the message is squeezed further |
| action | never shrinks. On a narrow frame it moves under the message and starts where the message starts |
| dismiss | Button `ghost/neutral/sm iconOnly icon="close"` · stays at the end of the first line when the message wraps |

**On Android**: the action and the dismiss button reserve the 48dp hit target in the layout, so
the first line of a Banner with either is 48dp tall, not `--pm-control-height-sm`, and the glyph
and the message's first line are centred on it. Below its last line the message keeps the
recipe's padding. iOS reserves its 44-point hit target the same way.

## States

| Entry | Render | Expect |
| --- | --- | --- |
| neutral | a session fact with an action | `data-tone="neutral"`, no icon |
| info | — | `data-tone="info"` |
| warning | with an action | `data-tone="warning"` |
| danger | — | `data-tone="danger"` |
| dismissible | `onDismiss` | close button present |
| a long message | three sentences and an action | wraps, no sideways scroll |

`requiredSelectors`: `[data-tone="danger"]`.

## Motion

None. A Banner is part of the frame, and the frame does not animate. It appears and leaves at
once, and the page under it moves by its height in the same frame.

## Icons

`info`, `warning` and `error` by tone, decorative, because the role announces the tone.
`close` on dismiss, labelled.

## A11y

`role="status"` for neutral, info and warning, and `role="alert"` for danger. Only danger
interrupts: a warning Banner is on screen for days, and an assertive announcement on every
load teaches a reader to ignore it. A Banner mounted in response to an event is announced
with the politeness of its role. An application that loads a whole document for each page
announces a danger Banner on each of them. That is accepted: danger is for the notice a reader
must not miss, such as an outage, and an application whose notice can wait uses `warning`.

Dismiss is a real labelled button. Focus does not move when a Banner appears or leaves. When
the reader dismisses a Banner, the button they pressed leaves with it, and the member moves
focus nowhere, as Alert does not: the Banner is the first thing in the frame, and the next
Tab goes on from where it was. The document order is the reading and focus order: the message,
the action, then dismiss.

```contract
role root status when neutral
role root status when warning
role root alert when danger
announces live:assertive "Payments are unavailable" when danger
role dismiss button when dismissible
name dismiss from dismissLabel when dismissible
key Enter activates on dismiss when dismissible
```

## Agent

An agent reads the tone and whether the Banner can be dismissed, and dismisses it as the ✕
does, which calls `onDismiss` so the application can remove it. A Banner with no `onDismiss` has
no ✕, because its cause is still true, so a dismiss fails. The ✕ is the Banner's own part, so it
is withheld and the Banner's `dismiss` stands in its place. The `action` the application passes
is its own control: it stays an agent's, listed within the Banner. The `danger` tone colours the
notice, and a dismiss only hides a reminder, so no action needs a person. The Banner has no name
of its own: an agent finds it by the text it shows.

```agent
state tone text as root data-tone
state dismissible boolean as dismiss present
action dismiss calls onDismiss
destructive never
withholds contents when dismissible
```
