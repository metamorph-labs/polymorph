---
'@polymorph/engine': patch
'@polymorph/recipes': patch
'@polymorph/react-ui': patch
'@polymorph/vue-ui': patch
'@polymorph/svelte-ui': patch
'@polymorph/solid': patch
'@polymorph/solid-ui': patch
'@polymorph/angular-ui': patch
'@polymorph/elements-ui': patch
---

Keyboard and focus fixes for overlays and for members that leave the page.

- **Toast.** In React the viewport no longer uses `@radix-ui/react-toast`: it draws the same
  region, list, cards and live regions as every other framework, so `@polymorph/react-ui`
  drops that dependency. What a reader notices:
  - Tab moves through the toasts in document order, oldest first, as in every other
    framework. Radix moved newest first.
  - A toast with an `action` whose call sets neither `durationMs` nor `retained` stays until it
    is dismissed, whatever its tone, so a reader has the time to reach the action. Set
    `durationMs` to keep a timer. The SwiftUI and Compose Toast follow the same rule.
  - When a toast that holds focus leaves, by any route (its close control, its action,
    Escape, `toast.dismiss`, its owner removing it, or a newer toast evicting it), focus moves
    to the next toast, else the previous one, else back to the element focus came from as it
    entered the notifications (F8 or Tab), else to the list.
  - Escape reaches a toast only while focus is in it, so a toast raised while a Dialog is open
    no longer takes Escape from the dialog. An Escape that closed a Select, Menu or Tooltip in
    a toast's content, or that an input method was handling, leaves the toast open.
  - The live regions say a toast when it is raised, and again when an update in place changes
    its words, and say nothing when one leaves. Only a danger toast interrupts a screen reader
    (the assertive region); a warning toast now waits its turn in the polite region, as the
    SwiftUI and Compose Toast and Banner already did. They read the content's text and the action's
    label too, and two toasts with the same words in a row are each said.
  - The timers wait while the window is in the background (its page is hidden, or another
    window or application has focus), as well as while the reader is on the notifications.
    Focus in a frame on the page does not hold them. When the hold ends, a toast resumes with
    the time that was left in every framework, as React's did; Vue, Svelte, Solid, Angular and
    the elements started a whole new window.
  - A toast raised again under the id of one whose card is still playing its exit stays: the
    card takes out its own record only (`removeToast(id, raised)`).
- **Focus return when the trigger is gone.** Dialog, ConfirmDialog, Drawer, Lightbox, Command
  and Tour return focus to the focusable element nearest where their trigger was when the
  trigger has left the page while they were open (a confirm that deletes its row), instead of
  dropping it to the body. The rule is the engine's `focusReturnTarget`.
- **Alert, Banner and ArtifactPane.** When one of them leaves the page while it holds focus,
  after its own close control for one, focus moves to the focusable element nearest where it
  was (`focusAfterRemoval`), also when the framework removes it only after a leave animation
  (Vue's `Transition`, Angular's animations).
- **The phone-width sheet inside a Dialog (React).** Select, Menu and the other members that
  draw the bottom sheet below `30rem` keep focus in the sheet when they open inside a Dialog
  or a Drawer, and Escape and a press on the sheet's scrim close the sheet and leave the Dialog
  open. An Escape that closes a Tooltip or a Menu inside the sheet leaves the sheet open. While
  a sheet that holds focus is open, the rest of the page is hidden from assistive software.
  `@polymorph/react-ui` adds `@radix-ui/react-focus-scope` and
  `@radix-ui/react-dismissable-layer` as dependencies; both already came with
  `@radix-ui/react-dialog`.
- **Solid's `watchEffect`.** It reads the watched value as the member is set up, as Vue's
  `watch` does, so a change made between setup and the mount runs the effect again after the
  mount, once Solid has drawn it. With it, the Solid and elements Toast viewport says a toast
  raised in the same render as the viewport.
- The engine exports `focusPlace`, `nearestFocusable`, `focusReturnTarget`, `returnFocusTo`,
  `focusAfterRemoval`, `focusAfterToast`, `followToastFocus`, `holdToastTimers`,
  `toastClock`, `toastTimeLeft`, `announceToasts` and `TOAST_QUIET`, and a toast record carries `raised`, which a toast raised
  again under the same id renews.
