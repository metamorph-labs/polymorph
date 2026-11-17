'use client'

import { useEffect, useRef, useState } from 'react'

import { Icon, memberAttr, useDevWarning } from '@polymorph/react'
import styles from '@polymorph/recipes/structure/image.module.css'

/**
 * A read-only picture (`design/components/image.md`). It draws a photograph, a
 * brand mark, artwork or a preview of a file from a URL.
 *
 * The first sentence is the member's line on the system card, which has a
 * budget, so it stays this short.
 *
 * It is not Avatar, a round identity mark that falls back to initials. It is
 * not ImageEditor, which crops a picture and returns a file. It is not Icon,
 * which draws a role from the system's set and takes no URL.
 *
 * The frame holds the box, not the element. A broken `<img>` is laid out
 * differently in each browser, so the frame takes the ratio and the width from
 * the props, and the placeholder, the picture and the fallback all fill it.
 *
 * The picture is never hidden while it loads. It is drawn over the placeholder
 * as the browser decodes it, so a page whose script has not run still shows it.
 *
 * In a module that imports this member, `Image` is the member and the DOM's
 * constructor of the same name is `window.Image`.
 */

export interface ImageProps {
  /** The picture's URL. An empty string is the failed state: there is nothing to request. */
  src: string
  /**
   * The accessible name. An empty string declares the picture decorative and
   * hides it from assistive technology. Required, because only the caller knows
   * which of the two a picture is.
   */
  alt: string
  /**
   * The picture's width in CSS pixels, given together with `height`. The two
   * reserve the box before the picture loads and are its natural size; the
   * frame is never wider than its container.
   */
  width?: number
  /** The picture's height in CSS pixels, given together with `width`. */
  height?: number
  /**
   * Width over height of a frame the picture sits in, for a source whose size
   * is unknown or is not the shape wanted. Alone, the frame is as wide as its
   * container. With `width` and `height`, it replaces their ratio.
   */
  aspectRatio?: number
  /**
   * How the picture sits in a frame whose ratio is not its own: `contain` shows
   * all of it, `cover` fills the frame and crops. Defaults to `contain`,
   * because cropping removes content.
   */
  fit?: 'contain' | 'cover'
  /**
   * When the browser fetches the picture: `lazy` as the reader nears it,
   * `eager` at once. Defaults to `lazy`.
   */
  loading?: 'lazy' | 'eager'
  /** The element's CORS mode. Absent, the request is made without CORS. */
  crossOrigin?: 'anonymous' | 'use-credentials'
  /** The element's referrer policy. Absent, the page's own policy applies. */
  referrerPolicy?:
    | 'no-referrer'
    | 'no-referrer-when-downgrade'
    | 'origin'
    | 'origin-when-cross-origin'
    | 'same-origin'
    | 'strict-origin'
    | 'strict-origin-when-cross-origin'
    | 'unsafe-url'
}

export function Image({
  src,
  alt,
  width,
  height,
  aspectRatio,
  fit = 'contain',
  loading = 'lazy',
  crossOrigin,
  referrerPolicy,
}: ImageProps) {
  // Each holds the `src` it is about, so a new `src` starts as loading. An
  // empty `src` is failed without a request, because there is nothing to ask for.
  const [loaded, setLoaded] = useState('')
  const [failed, setFailed] = useState('')
  const image = useRef<HTMLImageElement>(null)

  // A failure is about one request. When the `src` moves on, the failure is
  // forgotten, so a caller that comes back to the same URL asks for it again,
  // as a bare element would. State is adjusted while rendering, not in an
  // effect, so no frame is drawn from the stale failure.
  const [asked, setAsked] = useState(src)
  if (asked !== src) {
    setAsked(src)
    setFailed('')
  }

  const state = src === '' || failed === src ? 'failed' : loaded === src ? 'loaded' : 'loading'
  const boxed = width !== undefined && height !== undefined && width > 0 && height > 0
  const ratio =
    aspectRatio !== undefined && aspectRatio > 0 && Number.isFinite(aspectRatio)
      ? aspectRatio
      : boxed
        ? width / height
        : undefined
  const sized = ratio !== undefined
  const decorative = alt === ''

  useDevWarning(
    (width === undefined) !== (height === undefined),
    'Image: `width` and `height` are given together. One alone gives no ratio and is ignored.',
  )

  // A picture can settle before its listeners exist: the browser had it cached,
  // or the markup came from a server and loaded before this ran. `complete`
  // with a natural width is a decoded picture. `complete` without one is either
  // a broken picture or one with no size of its own (an SVG without
  // dimensions), and nothing on the element tells them apart, so the request is
  // made again and its event is heard this time.
  useEffect(() => {
    const element = image.current
    if (element === null || !element.complete) return
    if (element.naturalWidth > 0) setLoaded(src)
    else element.src = src
  }, [src])

  return (
    <span
      className={styles.frame}
      data-state={state === 'loaded' ? undefined : state}
      data-fit={fit}
      data-sized={sized ? '' : undefined}
      // Data, not a decision: the ratio and the pixel width are the picture's own.
      style={sized ? { aspectRatio: ratio, inlineSize: boxed ? width : undefined } : undefined}
      {...memberAttr('Image')}
    >
      {state === 'loading' ? <span className={styles.placeholder} aria-hidden="true" /> : null}

      {state === 'failed' ? (
        // The element is removed, not hidden, so the browser's broken-image
        // glyph is never drawn. The fallback keeps the picture's name.
        <span
          className={styles.fallback}
          data-image-part="fallback"
          role={decorative ? undefined : 'img'}
          aria-label={decorative ? undefined : alt}
          aria-hidden={decorative ? true : undefined}
        >
          <Icon name="error" />
        </span>
      ) : (
        // `loading` and `crossOrigin` come before `src`: the browser reads them
        // when the request starts, and React sets attributes in this order.
        <img
          ref={image}
          className={styles.image}
          loading={loading}
          crossOrigin={crossOrigin}
          referrerPolicy={referrerPolicy}
          src={src}
          alt={alt}
          onLoad={() => setLoaded(src)}
          onError={() => setFailed(src)}
        />
      )}
    </span>
  )
}
