# Page transitions

`PageTransitions` mounts once per application. It shows one thin, fixed accent
ribbon at the top of the viewport while a foreground page load, navigation
departure or page arrival is active. The ribbon is decorative and does not
capture pointer input. Existing page loading status text remains the accessible
announcement.

`AppShell` and `AuthPage` accept `transitionKey` and `pending`. The key identifies
the displayed page or authentication step. Changing it restarts an opacity-only
arrival without keying the DOM, remounting forms, duplicating outgoing content,
moving focus or resetting scroll. `pending` reports foreground loading. Additional
page reads and Suspense fallbacks use `usePageTransitionPending`. Overlapping
reads keep the indicator active until each one settles or unmounts. Background
polls must not report pending only because a refresh request is in flight.

Native anchor navigation and imperative browser departures get an exit fade. The
observer does not prevent navigation, change history, delay a request, or alter
click behaviour. Modified clicks, downloads, hash links, cancelled clicks and
new-tab links do not start the departure indicator. A restored page clears
departure state. A bounded recovery also restores a cancelled browser departure.

The recipe is an opacity transition with a growing top bar. It uses the active
system's surface enter/exit durations, easing, ambient loop, accent colour and
smallest spacing step. Reduced motion removes the fade and the loop but keeps a
static indicator for pending work. `data-motion="none"` also disables animation.
No decorative page background is added.
