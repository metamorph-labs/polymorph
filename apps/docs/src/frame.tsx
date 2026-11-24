import { DATA_ATTRS } from '@polymorph/theme'
import { Stack, Text } from '@polymorph/react-ui'
import { GALLERIES } from '@polymorph/react-ui/galleries'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { installFonts } from './fonts'
import { ensurePairing, installThemes } from './themes'

/**
 * The document inside the fixture frame.
 *
 * When a gallery entry has an open modal overlay, Radix marks everything outside
 * its portal `aria-hidden` and turns off `pointer-events` on `<body>`. That is
 * correct for a modal, but it disables a documentation page that renders seven
 * of them. So the entries stay open, and the docs page gives each entry its own
 * document, which contains the modality.
 *
 * That document is this one: a second Vite HTML entry, not a `createPortal` into
 * an iframe from the outer React tree. A portal is the obvious approach, but the
 * installed Radix rules it out. `@radix-ui/react-portal` resolves its container
 * as `containerProp || globalThis?.document?.body`, and the vocabulary's wrappers
 * pass no container. A same-realm subtree portalled into an iframe would
 * therefore portal every panel back into the outer body. The modality would not
 * be contained, and the panel would be positioned against the wrong viewport.
 * Only a separate browsing context changes `globalThis.document`, so the frame
 * boots its own module graph: its own React, its own Radix and its own portals,
 * all resolving to this document.
 *
 * Booting the app's own pipeline also brings the styling, without the style
 * mirroring a portal would need. The `@polymorph/react-ui` import carries `base.css`
 * and every component sheet (Vite injects them into this head in dev; the built
 * chunk graph links them in build). `installThemes` emits the theme CSS here as
 * `main.tsx` does for the page. The prepaint script in `frame.html` resolves
 * system and mode from the same localStorage before first paint. `installFonts`
 * loads the active system's families into this document. The parent only sets
 * the `src` URL and mirrors this document's `<html>` attributes
 * (FixtureFrame.tsx).
 */

installThemes()
installFonts()

/**
 * Emits cross-pairing CSS inside the frame. The parent mirrors
 * `data-system`/`data-palette` onto this `<html>` when the toolbar changes them,
 * but it sends only attributes. The CSS block for a cross-pairing must be
 * emitted in this document, from this document's own catalogue. It arrives one
 * microtask after the attribute write, which is not visible in a fixture
 * specimen.
 */
function watchPairing(): void {
  const html = document.documentElement
  const observer = new MutationObserver(() => {
    const system = html.getAttribute(DATA_ATTRS.system)
    const palette = html.getAttribute(DATA_ATTRS.palette)
    if (system !== null && palette !== null) ensurePairing(system, palette)
  })
  observer.observe(html, {
    attributes: true,
    attributeFilter: [DATA_ATTRS.system, DATA_ATTRS.palette],
  })
}

/**
 * Stops an embedded specimen from taking focus. A standalone frame keeps native
 * behaviour.
 *
 * Radix focus management assumes its document is the whole page. An overlay
 * focuses its content on open and closes when focus leaves. With twelve
 * specimen documents booting under one page, each open overlay takes top-level
 * focus from the previous one. The frame that lost focus sees focus-outside, so
 * its overlay dismisses, and its `onCloseAutoFocus` re-focuses the trigger and
 * takes focus back. This repeats until every open entry has dismissed itself,
 * and the user's focus ends up inside a frame. This was observed, not inferred.
 *
 * The fix is a boot rule, not a component change. While this document does not
 * hold focus, programmatic `.focus()` does nothing. When a user enters the frame
 * (click or Tab), the browser focuses the document first, `document.hasFocus()`
 * becomes true, and every Radix behaviour (focus into the panel, trap,
 * restore-to-trigger) runs unchanged. Patching a prototype is normally avoided,
 * but this is this realm's own prototype in this app's own boot file. The
 * alternative is forwarding focus props through the whole vocabulary for a
 * problem only the docs frame has.
 *
 * Separately, this always stops the two window events that Radix Select closes
 * on to mimic a native popup: `resize` and `blur` (react-select's content
 * effect). When embedded, neither means what Radix assumes. The frame resizes
 * itself to fit a panel that just opened, so close-on-resize would dismiss every
 * panel as it opens, including one the user just clicked open. `blur` fires
 * whenever focus moves anywhere else on the docs page, so one click on the page
 * would close every open specimen. Real dismissals (Escape, outside click,
 * choosing an item) happen inside the frame's document and still work.
 * Repositioning still works, but not through floating-ui's `autoUpdate`, which
 * listens on window `resize`. It works through the frame's re-measure hooks
 * (`data-state` changes and `animationend`) and the scrollbar-width reflows a
 * self-resize causes. Checked by hand: every shipped open panel converges to its
 * natural size. This entry runs before React renders anything, so these
 * listeners are registered first, which guarantees that
 * `stopImmediatePropagation` takes effect.
 */
function guardEmbeddedFocus(): void {
  if (window.frameElement === null) return

  // A trusted gesture inside this document allows programmatic focus for a
  // short time, even before `hasFocus()` becomes true. Radix opens a Select on
  // `pointerdown`, which runs before the browser's default focus action focuses
  // this document. Dropping that first focus call would leave the user's
  // keyboard outside the overlay they just opened. Boot-time focus calls have no
  // gesture before them, so they are still blocked.
  let lastGesture = -Infinity
  const noteGesture = () => {
    lastGesture = performance.now()
  }
  for (const type of ['pointerdown', 'mousedown', 'keydown', 'touchstart']) {
    window.addEventListener(type, noteGesture, true)
  }

  const nativeFocus = HTMLElement.prototype.focus
  HTMLElement.prototype.focus = function (options?: FocusOptions) {
    if (!document.hasFocus() && performance.now() - lastGesture > 1000) return
    nativeFocus.call(this, options)
  }

  const suppress = (event: Event) => {
    event.stopImmediatePropagation()
  }
  window.addEventListener('resize', suppress)
  window.addEventListener('blur', suppress)
}

/**
 * The frame sizes itself. It measures its content and writes the result as the
 * `height` presentation attribute on its own `<iframe>` element, through
 * `window.frameElement` (allowed because the origin is the same). The parent
 * never styles the frame and React never updates the height, so nothing else
 * writes it. No `style` prop is used, as the red rules require of an app.
 * Geometry is data, as with Progress; here it is measured geometry passed as an
 * attribute.
 *
 * The measurement must handle portals and the feedback loop they create.
 * `body.scrollHeight` covers in-flow content. A Radix panel is `position: fixed`
 * inside a portal wrapper and is not in scrollable overflow, so every element's
 * border-box bottom is measured too. That alone causes a loop. A floating panel
 * is clamped by the viewport it opens into: the popper sets its max-height to
 * `innerHeight` minus its offsets and recomputes on every resize. Sizing the
 * viewport by the clamped panel therefore shrinks both together. (Observed: a
 * four-option Select settled at an 85px listbox with its items squashed.) The
 * code tells three cases apart:
 *
 *  - **Floating panel** (open, floating, anchored below something, so its top is
 *    away from the viewport edge). A clamped panel always ends within the
 *    popper's collision margin of the bottom edge. Touching the edge therefore
 *    means it needs more room, and the frame grows by a large step. Once it no
 *    longer touches the edge it is at its natural size. `PANEL_HEADROOM` is kept
 *    below it so the shrink-to-fit never re-engages the clamp (headroom >
 *    collision margin + anchor gap).
 *  - **Sheet or scrim** (fixed at the viewport's top edge, or covering it).
 *    These are sized by the viewport and have no natural size to converge to
 *    (Drawer, Command's overlay), so the frame gets a minimum stage height.
 *  - Everything else: its border-box bottom.
 */
const STAGE_HEIGHT = 420 // px: floor for a viewport-anchored overlay. Geometry, not styling.
const SETTLE_TOLERANCE = 2 // px: skips sub-pixel changes so reposition/remeasure cannot oscillate
const EDGE = 12 // px: counts as "at the viewport edge"; includes the popper's 10px collision margin
const PANEL_HEADROOM = 24 // px: space under a settled panel so the popper's clamp does not apply
const GROW_STEP = 48 // px: growth per step while a panel is still clamped
const PANEL_CEILING = 800 // px: upper bound for the grow loop, in case content has no natural end

function measure(): number {
  const body = document.body
  let max = body.scrollHeight
  let stage = false
  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight

  for (const element of body.querySelectorAll('*')) {
    const rect = element.getBoundingClientRect()
    if (rect.width === 0 && rect.height === 0) continue

    let bottom = rect.bottom
    if (element.getAttribute('data-state') === 'open') {
      const covers =
        rect.width >= viewportWidth - SETTLE_TOLERANCE &&
        rect.height >= viewportHeight - SETTLE_TOLERANCE
      const fixed =
        element.closest('[data-radix-popper-content-wrapper]') !== null ||
        getComputedStyle(element).position === 'fixed' ||
        (element.parentElement !== null &&
          getComputedStyle(element.parentElement).position === 'fixed')

      if (fixed && (covers || rect.top <= EDGE)) {
        stage = true
      } else if (fixed && rect.top > EDGE) {
        bottom += PANEL_HEADROOM
        if (rect.bottom >= viewportHeight - EDGE) {
          bottom = Math.min(viewportHeight + GROW_STEP, PANEL_CEILING)
        }
      }
    }
    if (bottom > max) max = Math.ceil(bottom)
  }

  return stage ? Math.max(max, STAGE_HEIGHT) : max
}

function startAutosize(): void {
  // Opened standalone (debugging a specimen), there is no element to size.
  const frame = window.frameElement
  if (frame === null) return

  let applied = -1
  let scheduled = false

  const apply = () => {
    const next = measure()
    if (Math.abs(next - applied) <= SETTLE_TOLERANCE) return
    applied = next
    frame.setAttribute('height', String(next))
  }

  const schedule = () => {
    if (scheduled) return
    scheduled = true
    requestAnimationFrame(() => {
      scheduled = false
      apply()
    })
  }

  new ResizeObserver(schedule).observe(document.body)
  // Portals mount as body children after their own layout effects, and overlay
  // state changes arrive as `data-state` writes. Neither resizes `<body>`.
  new MutationObserver(schedule).observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['data-state', 'style', 'class'],
  })
  // Enter animations translate and scale, and rects include the transform, so
  // the final box is known only when the animation ends.
  document.addEventListener('animationend', schedule, true)
  document.addEventListener('transitionend', schedule, true)
  window.addEventListener('load', schedule)
  schedule()
}

const params = new URLSearchParams(window.location.search)
const componentName = params.get('component') ?? ''
const rawEntry = params.get('entry')
const entryIndex = rawEntry === null || rawEntry === '' ? -1 : Number(rawEntry)
const fixture = GALLERIES.find((states) => states.component === componentName)
const entry = Number.isInteger(entryIndex) ? fixture?.entries[entryIndex] : undefined

document.title =
  entry === undefined ? 'Fixture — Polymorph' : `${componentName} — ${entry.name} — Polymorph`

function FrameHost() {
  if (entry === undefined) {
    return (
      <Text size="sm" tone="secondary">
        No such fixture entry. The component page composes this URL from the gallery it renders, so
        a frame and a page from different builds is the usual reason.
      </Text>
    )
  }

  // The same immediate wrapper the live page gives an entry (a plain div inside
  // a Stack), plus the padding step the Card provides on the page. Without it, a
  // focus ring that a system draws outside a part's edge is clipped by the
  // document boundary.
  return (
    <Stack p={3}>
      <div>{entry.render()}</div>
    </Stack>
  )
}

guardEmbeddedFocus()
watchPairing()
startAutosize()

const root = document.getElementById('root')
if (!root) throw new Error('docs frame: #root missing from frame.html')

createRoot(root).render(
  <StrictMode>
    <FrameHost />
  </StrictMode>,
)
