import { DATA_ATTRS } from '@polymorph/theme'
import { useEffect, useRef, useState } from 'react'

/**
 * The page side of the fixture frame: the `<iframe>` a contained gallery entry
 * renders in, pointed at the `frame.html` entry. `frame.tsx` explains why the
 * frame is a separate document rather than a portal.
 *
 * The work is split:
 *
 *  - **This side** owns the element and the theme relay. The frame boots from
 *    the same localStorage as the page, so it starts with the same theme. After
 *    that, every toolbar change is mirrored by copying the page's `<html>` data
 *    attributes onto the frame's. These attributes carry the whole theme state
 *    between page and frame, so mirroring them is sufficient.
 *  - **The frame side** owns its height. It measures its content (portals
 *    included) and writes the `height` presentation attribute on this element
 *    through `window.frameElement`. React never updates the height, so
 *    reconciliation never resets the frame.
 *
 * `width` is the legacy dimension attribute and `frameBorder` the legacy border
 * switch. They are attributes rather than styles because an app file may not
 * express a style (a red rule), and the element must be full-width with no UA
 * border to look like part of the page.
 *
 * Frames boot one or two at a time, and only near the visible part of the
 * page. Each frame boots the whole vocabulary. The dev server serves it as
 * about a thousand modules per document, and a page that booted a dozen frames
 * at once ran out of browser resources and left frames empty. A frame that
 * finishes loading lets the next one start, and the modules it fetched are
 * then cached for the rest.
 */

const MIRRORED = Object.values(DATA_ATTRS)

/** How many frames may be loading at once. */
const MAX_LOADING = 2
/** How long a frame may hold a loading slot, in case its `load` never arrives. */
const SLOT_TIMEOUT_MS = 15000
/** How far outside the visible part of the page a frame starts to load: one screen. */
const NEAR = '100%'

let loading = 0
const waiting: (() => void)[] = []

/**
 * Takes a loading slot, now or when one frees up, and calls `start` then. The
 * returned function gives the slot back, or leaves the queue if `start` has
 * not run yet. Calling it twice does nothing.
 */
function takeSlot(start: () => void): () => void {
  let started = false
  let done = false
  const begin = () => {
    started = true
    loading++
    start()
  }
  if (loading < MAX_LOADING) begin()
  else waiting.push(begin)
  return () => {
    if (done) return
    done = true
    if (!started) {
      const index = waiting.indexOf(begin)
      if (index >= 0) waiting.splice(index, 1)
      return
    }
    loading--
    waiting.shift()?.()
  }
}

export function FixtureFrame({
  component,
  index,
  name,
}: {
  /** The gallery's component name, e.g. `Select`, used as the fixture lookup key. */
  component: string
  /** Position of the entry in the fixture's `entries`, stable per build. */
  index: number
  /** The entry's name, used as the frame's accessible name so AT announces the state. */
  name: string
}) {
  const ref = useRef<HTMLIFrameElement>(null)
  const url = `/frame.html?component=${encodeURIComponent(component)}&entry=${index}`
  // No `src` until the frame is near the visible part of the page and has a
  // loading slot. An iframe without one holds an empty document.
  const [src, setSrc] = useState<string | null>(null)

  useEffect(() => {
    const frame = ref.current
    if (!frame) return
    let release: (() => void) | null = null
    let timer = 0
    const loaded = () => {
      if (frame.contentWindow?.location.pathname === '/frame.html') release?.()
    }
    const observer = new IntersectionObserver(
      (records) => {
        if (!records.some((record) => record.isIntersecting)) return
        observer.disconnect()
        release = takeSlot(() => {
          setSrc(url)
          timer = window.setTimeout(() => release?.(), SLOT_TIMEOUT_MS)
        })
      },
      // The shell's content region scrolls, not the viewport, and a margin only
      // widens the root it is given. With the viewport as the root, the region
      // would clip a frame until it was on screen.
      { root: document.getElementById('content'), rootMargin: NEAR },
    )
    observer.observe(frame)
    frame.addEventListener('load', loaded)
    return () => {
      observer.disconnect()
      frame.removeEventListener('load', loaded)
      window.clearTimeout(timer)
      release?.()
    }
  }, [url])

  useEffect(() => {
    const frame = ref.current
    if (!frame) return

    const mirror = () => {
      const target = frame.contentDocument?.documentElement
      if (!target) return
      for (const attr of MIRRORED) {
        const value = document.documentElement.getAttribute(attr)
        if (value === null) target.removeAttribute(attr)
        else target.setAttribute(attr, value)
      }
    }

    // Mirror on load, because a lazy frame's document does not exist before it.
    // Mirror again whenever the toolbar (or anything else) writes an attribute
    // on the page's html.
    frame.addEventListener('load', mirror)
    const observer = new MutationObserver(mirror)
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: MIRRORED,
    })
    mirror()

    return () => {
      frame.removeEventListener('load', mirror)
      observer.disconnect()
    }
  }, [])

  // `height` here is the initial viewport, not a size decision. A
  // popper-positioned Select sizes its panel against the viewport it opens into.
  // The element's 150px default would force the panel into internal scroll
  // before the frame has measured anything. React writes a constant prop once at
  // mount and never re-reads the DOM, so the frame's own measured heights
  // (frame.tsx) apply from the first measurement onward.
  return (
    <iframe
      ref={ref}
      src={src ?? undefined}
      title={name}
      width="100%"
      height={240}
      frameBorder="0"
    />
  )
}
