---
'@polymorph/engine': patch
'@polymorph/recipes': patch
'@polymorph/react-ui': patch
'@polymorph/vue-ui': patch
'@polymorph/svelte-ui': patch
'@polymorph/solid-ui': patch
'@polymorph/angular-ui': patch
'@polymorph/elements-ui': patch
---

Keyboard and focus fixes for overlays and for members that leave the page.

- **Toast.** When a toast that holds focus leaves, by its close control, its action, Escape or
  `toast.dismiss`, focus moves to the next toast, else the previous one, else back to the
  element focus came from as it entered the notifications (F8 or Tab), else to the list. Escape
  reaches a toast only while focus is in it, so a toast raised while a Dialog is open no longer
  takes Escape from the dialog. In React the viewport no longer uses `@radix-ui/react-toast`:
  it draws the same region, list, cards and live regions as every other framework, so
  `@polymorph/react-ui` drops that dependency. A toast with an `action` whose call sets neither
  `durationMs` nor `retained` now stays until it is dismissed, so a reader has the time to
  reach the action; set `durationMs` to keep a timer.
- **Focus return when the trigger is gone.** Dialog, ConfirmDialog, Drawer, Lightbox, Command
  and Tour return focus to the focusable element nearest where their trigger was when the
  trigger has left the page while they were open (a confirm that deletes its row), instead of
  dropping it to the body. The rule is the engine's `focusReturnTarget`.
- **Alert, Banner and ArtifactPane.** When one of them leaves the page while it holds focus,
  after its own close control for one, focus moves to the focusable element nearest where it
  was (`focusAfterRemoval`).
- **The phone-width sheet inside a Dialog (React).** Select, Menu and the other members that
  draw the bottom sheet below `30rem` keep focus in the sheet when they open inside a Dialog
  or a Drawer, and Escape and a press on the sheet's scrim close the sheet and leave the Dialog
  open. While a sheet that holds focus is open, the rest of the page is hidden from assistive
  software. `@polymorph/react-ui` adds `@radix-ui/react-focus-scope` and
  `@radix-ui/react-dismissable-layer` as dependencies; both already came with
  `@radix-ui/react-dialog`.
- The engine exports `focusPlace`, `nearestFocusable`, `focusReturnTarget`, `returnFocusTo`,
  `focusAfterRemoval`, `focusAfterToast` and `noteToastEntry`.
