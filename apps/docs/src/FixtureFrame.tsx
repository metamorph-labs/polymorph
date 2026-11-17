import { DATA_ATTRS } from '@polymorph/theme'
import { useEffect, useRef } from 'react'

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
 * border to look like part of the page. `loading="lazy"` stops a long gallery
 * from booting every specimen document at once.
 */

const MIRRORED = Object.values(DATA_ATTRS)

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

  const src = `/frame.html?component=${encodeURIComponent(component)}&entry=${index}`
  // `height` here is the initial viewport, not a size decision. A
  // popper-positioned Select sizes its panel against the viewport it opens into.
  // The element's 150px default would force the panel into internal scroll
  // before the frame has measured anything. React writes a constant prop once at
  // mount and never re-reads the DOM, so the frame's own measured heights
  // (frame.tsx) apply from the first measurement onward.
  return (
    <iframe
      ref={ref}
      src={src}
      title={name}
      width="100%"
      height={240}
      frameBorder="0"
      loading="lazy"
    />
  )
}
