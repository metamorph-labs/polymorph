# Toast

Notifications, raised imperatively, that report the outcome of an action.
Confirmation questions belong in Dialog.

The viewport, its timers, the swipe and the announcements are the vocabulary's own, and every
web framework draws them alike. No card is a dismissable layer of the page, so a toast raised
while a Dialog is open never takes Escape from the dialog. The stacking choreography is the
motion engine's (`MotionPresence` / `MotionSurface`, `@polymorph/react/motion`). An application that reports its errors
through the viewport uses the state-owned notices below instead of inline error
surfaces.

Application native dialogs may mount `ToastViewportTarget` inside their top-layer focus boundary.
`ToastHost` moves its single viewport into the most recently mounted target and restores the previous
location when it unmounts. Put the target outside disabled fieldsets so pending/uncertain recovery
actions stay usable. This changes placement only; retained notices, callbacks, dismissal policy and
operation identities remain owned by their existing controller.

## Notices a screen owns

Mount `ToastHost` outside page/form transitions with catalog-provided dismissal,
announcement and viewport labels. Nested hosts share the existing viewport. Mount it
outside any error boundary as well, so that a boundary's fallback renders inside it.
Render `ToastNotice` for an outcome the screen's state holds: a current failure, a
validation or retry state, or a success or info the screen reports. Its content belongs
to the viewport, and its lifecycle belongs to the screen: resolution or unmount removes
it; incidental renders update current callbacks without undoing a dismissal. Supply
`eventKey` for repeated attempts that produce the same error without an intervening reset.

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `title` | `string` | — | required; a new title announces the notice again |
| `description` | `string` | — | the message in words, under the title |
| `children` | `ReactNode` | — | content of any kind, such as a retry Button |
| `tone` | `ToastTone` | `'danger'` | sets how long the notice stays (below) |
| `eventKey` | `string \| number` | — | a new key announces the same notice again |
| `dismissible` | `boolean` | `true` | `false`: no timeout, close button, Escape or swipe |
| `onDismiss` | `() => void` | — | it left by dismissal, timeout or eviction |

The tone sets how long a notice stays, by the store's rule for every toast
([Lifetime](#lifetime)). A `danger` or `warning` notice is retained and pinned: it remains
until it is resolved or dismissed, and no other notification evicts it. A `success`,
`info` or `neutral` notice is transient: it leaves after the store's default duration
(`TOAST_DEFAULT_DURATION_MS`), because the reader has nothing to do about it once it is
read. `onDismiss` tells the screen that the
notice left without the screen's doing: the reader dismissed it, its time ran out, or
newer toasts evicted a transient one. The screen can then clear the state that renders
it. Unmounting the notice removes it without calling `onDismiss`, because the screen did
that itself.

If the toast holds the only recovery action, set `dismissible={false}`: no timeout,
close button, Escape or swipe can remove the action. These controls retain the
controller's existing action gates and exact request identity. Never duplicate an
error/retry pair inside a form. Retained notices are exempt from transient eviction; the
viewport scrolls if they exceed its height. A record's durable status, such as a ticket
that is closed, stays on the page with the record, because a notice leaves and the
status does not.

A `ToastNotice` rendered while no viewport is mounted raises a toast that nothing draws.
In development it logs a warning that names the notice. The usual cause is an error
boundary whose fallback renders outside `ToastHost`. A declared `Toast` in Vue, Svelte,
Solid and Angular warns the same way when no viewport is in the document once it has
mounted ([shells.md](../../docs/shells.md#toast)).

## Anatomy

```
[viewport — fixed, bottom-right]
  [toast]*
    [tone icon]  [title + description?]  [action?]  [close: iconOnly ghost "close"]
```

## API — imperative (the design deliverable)

```ts
toast(options: {
  title: string
  description?: string
  tone?: 'neutral' | 'success' | 'danger' | 'warning' | 'info'   // default 'neutral'
  action?: { label: string; onClick: () => void }                 // at most one; pins the toast (Lifetime)
  durationMs?: number                                             // default by tone (Lifetime); Infinity pins
  content?: ReactNode                                             // host-supplied body — recovery controls included (see Notices a screen owns)
  dismissible?: boolean                                           // default true; false ⇒ no timeout, close, Escape or swipe can remove it
  retained?: boolean                                              // state-owned: removed by its owner, never evicted by another notification; default by tone (Lifetime)
  id?: string                                                     // a live toast's id updates it in place (below)
  onDismiss?: () => void                                          // once, when it leaves by dismissal, timeout or eviction; not when removed
}): string                       // toast id

toast.success(title, options?)   // sugar per tone: success | danger | warning | info
toast.promise(promise, spec)     // the async outcome as one card (below)
toast.dismiss(id?)               // omit id ⇒ dismiss all
```

### Lifetime

A toast's tone sets how long it stays when the call sets neither `retained` nor
`durationMs`. A `danger` or `warning` toast is retained and pinned: it remains until it
is dismissed or its owner removes it, and no newer toast evicts it, because it reports
an outcome the reader may have to act on. A `success`, `info` or `neutral` toast leaves
after `TOAST_DEFAULT_DURATION_MS` (5000) and may be evicted, because the reader has
nothing to do about it once it is read. A toast with an `action` gives the reader something
to do, so it is pinned until it is dismissed, whatever its tone. A reader who works by
keyboard or with a screen reader hears the toast, then reaches its action with F8 and Tab, and
a timer that ends first takes the action away (WCAG 2.2.1, timing adjustable). Its tone still
decides whether newer toasts may evict it. A call that sets either one takes what it sets,
with 5000 and no retention for the one it leaves out. The rule is the store's, so a
raised toast, React's `ToastNotice` and a declared `Toast` in every other web framework
follow it. The SwiftUI and Compose Toast apply the tone rule to their props, and do not pin a
toast for its action.

**`toast.promise(promise, { loading, success, error })`** raises the `loading` face
immediately: a neutral surface, the `loading` glyph (`spin` ambient) in the tone-icon
slot, and a pinned duration, because a wait must not time out. When the promise settles,
the card becomes the `success` / `error` face **in place**, with tone `success` /
`danger`, and its tone's lifetime: the success face's timer starts then, and the error
face stays until it is dismissed. Each field takes what `toast.success` takes, as one
value: a title string, or an options object without `tone` (the phase sets the tone). It
returns the toast `id` used for the whole lifecycle. A phase is a value, never a function
of the settled result, because that would be a second signature rather than an overload.

Update in place, the general contract: `toast({ id, … })` with a live toast's `id`
replaces that record. The card and its position stay the same, the content changes and
the timer restarts. An unknown id raises a new toast as normal. `toast.promise` uses this
contract and is not a special path.

`<ToastHost>` mounts the viewport once at the application root. The store keys records
by `id`, so an update is one publish rather than a remove and an add. Toast attributes:
`data-tone`, `data-state="open|closed"`, `data-swipe="move|cancel|end"` and
`data-swipe-direction="right"`.

## Dimensions & stacking

Viewport: bottom-right, inset `--pm-space-6`, width `calc(var(--pm-space-10) * 4)`
(384), max 4 visible (oldest auto-collapses), stack gap `--pm-space-3`, newest at the
bottom. Toast padding `--pm-space-5`; icon–text gap `--pm-space-3`; text–action gap
`--pm-space-4`.

**The phone register, below `30rem`**: a fixed-width card at `bottom-end` with
`space-6` insets collides with thumbs and the home indicator (`docs/layout.md`). So the
viewport becomes full width: `inset-inline: 0` with `padding-inline: var(--pm-space-4)`,
and `inset-block-end` adds the safe area:
`calc(var(--pm-space-6) + env(safe-area-inset-bottom, 0px))`, which is zero on devices
without a notch. Cards run full width, and the width cap above stops applying. Max
visible, stack gap, ordering, timers and swipe-to-dismiss (x-axis) do not change.
`@media` is lawful here for the same reason as for other overlays (`dialog.md`): the
viewport is portalled and `fixed`, so it is shell-class, and it uses the family's single
`30rem` breakpoint.

## Recipe (exact tokens)

Every tone uses one neutral surface. The tone shows through the icon and title colour,
not a tinted card, because a stack of tinted toasts looks like an alarm panel (the quiet
strategy):

| Part | Tokens |
| --- | --- |
| toast | bg `--pm-bg-raised` · border `1px solid --pm-border-default` · radius `--pm-radius-lg` · shadow `--pm-shadow-overlay` |
| title | `text.sm` quartet · `--pm-text-primary` |
| description | `text.sm` · `--pm-text-secondary` · top gap `--pm-space-1` |
| tone icon | size `md`, top-aligned to title line: `success→--pm-success-text` · `danger→--pm-danger-text` · `warning→--pm-warning-text` · `info→--pm-info-text` · neutral: no icon |
| action | Tertiary Button `ghost/accent/sm` (`ghost/danger/sm` when `tone="danger"`) |
| close | Button `ghost/neutral/sm iconOnly icon="close" label="Dismiss"` |

Every button inside a toast is tertiary: transparent background, no border and no
fill shadow, including on hover, press and while disabled. This applies to nested
`ToastNotice` content, native buttons and links styled as buttons as well as the
imperative action and dismiss control. The toast container enforces this over a
caller's variant. Tone and disabled text use design tokens; keyboard focus outlines,
hit areas, callbacks and recovery gates remain intact.

## States

| Entry | Render | Expect |
| --- | --- | --- |
| each tone | `toast({ tone })` | `data-tone` |
| title only | minimal | — |
| with description | — | — |
| with action | `action` | button present |
| pinned | `durationMs: Infinity` | persists |
| stack of 3 | three calls | order + gap |
| promise | `toast.promise(p, { loading, success, error })` | loading face pinned, then the settled face, same card |
| updated in place | second `toast` with the first's `id` | one card, new content |

`requiredSelectors`: `[data-state="open"]`, `[data-state="closed"]`,
`[data-swipe="move"]`, `:hover` (pause affordance), `:focus-visible`.

## Motion (the craft moment)

- Enter: `slide-fade` from the bottom edge (nearest viewport edge), spring `default`;
  the stack above **re-flows via spring** instead of jumping.
- Exit (timeout or dismiss): `fade` + height `collapse` at `-surface-exit` × `-exit`;
  the remaining toasts move into the gap (the list re-flow animates).
- Swipe: swipe-to-dismiss (right). Releasing past the threshold exits; otherwise
  the toast springs back. While it is dragged the card is drawn at the finger's offset, which
  outranks the enter and the exit: the recipe marks that offset important, because the engine
  leaves its own `translate` inline on the card.
- Timer pauses while the viewport is hovered or any toast focused; resumes on leave.
- An in-place update (`id` reuse, `toast.promise` settling) never re-enters. The card
  keeps its position and the content swaps without animation, because the springs are
  for cards arriving and leaving, and an update does neither.
- At `none`: instant add/remove, no re-flow animation; timers unchanged.

## Icons

Tone icons (`success`/`error`/`warning`/`info` roles; the `danger` tone uses the `error`
glyph role), `close`; `loading` for the promise's waiting face (`spin` ambient,
decorative; the title says what is being waited on). Tone icons are decorative
(`aria-hidden`). Urgency reaches assistive tech through the live-region politeness
below, and the title carries the message in words. The icon only marks the tone
visually.

## A11y

The viewport holds two live regions: a polite one (`role="status"`) says the newest neutral,
success or info toast, and an assertive one (`role="alert"`) the newest danger or warning toast.
The cards are not live regions, because a region that appears with its words already in it is
not reliably read. F8 focuses the notifications from anywhere on the page: the list, inside a
labelled `region`. Escape on a focused toast dismisses it when it is dismissible. With focus
anywhere else Escape is the page's, so a toast never takes it from a field or an open Dialog.

When a toast that holds focus leaves, by its close control, its action, Escape or a call to
`toast.dismiss`, focus moves to the next toast, else the previous one, so a reader working down
the stack stays in it. With no toast left, focus goes back to the element it came from as it
entered the notifications, by F8 or by Tab, while that element is in the document, and
otherwise to the list. The rule is the engine's (`focusAfterToast`,
`packages/engine/src/toast/focus.ts`), and the shared law in
`packages/conformance/src/toast-focus.ts` holds it in every web framework.

Imperative transient actions are accelerators. An application's sole recovery action instead
uses the retained, non-dismissible `ToastNotice` described above. The live announcement is
separate from the visible card; browser assertions should target the card for visible content.

```contract
role viewport region when the viewport
announces live:polite when the viewport
key F8 focuses viewport when the viewport
```

## Agent

An agent reads the notices on screen and answers them. A notice is a record of the store that
every framework's viewport draws, so the viewport registers one Toast, named by its region
("Notifications (F8)"), and reads the store. `notices` lists each notice on screen, oldest first,
as a choice whose id is the notice's id in the store and whose label is its title. `details`
holds what each one says, by the same id: its title, its description when it has one, its tone,
its action's label when it has an action, and whether it can be dismissed. A notice that is
leaving is not listed.

`dismiss` removes a notice as its close control does, and `act` runs its action as its action
Button does, which also dismisses it. Both go through the store's own `toast.dismiss`, so the
notice's `onDismiss` and its action's `onClick` run as for a person. A notice that cannot be
dismissed refuses `dismiss`, as it draws no close control, and a notice with no action refuses
`act`. The viewport withholds each card's own Buttons, its action and its close control, so they
are not listed beside the notices. A `ToastNotice`'s content, such as a retry Button, is the
screen's: each member in it registers as itself, and is listed within the Toast.

A `danger` tone colours what a notice reports, an outcome that went wrong, and not what an
agent's answer does: dismissing removes the message, and the action is a shortcut the
application offers beside the outcome, which is never the only way to do what it does. So
neither asks a person. A `danger` notice's action Button is drawn in the danger tone to match
the notice, not because its action is one a person must mean.

The viewport is in the document while it is mounted, with or without a notice, so a page with
the viewport and no notice on screen lists a Toast with empty `notices`.

```agent
state notices choices
state details list
action dismiss id calls onDismiss
action act id calls onClick
destructive never
withholds contents
```
