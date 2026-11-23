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
   * Other files of the same picture, in the element's `srcset` form: each a URL
   * with a width (`640w`) or a density (`2x`). The browser picks one for the
   * screen, and one that does not read the set requests `src`. For a set that
   * gives widths the member writes the element's `sizes` from the frame's box,
   * so no caller writes a length.
   */
  srcSet?: string
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
  /**
   * How the browser ranks this fetch among the page's others. `high` is for the
   * one picture that is the first view's largest content, with `loading="eager"`.
   * Absent, the browser decides.
   */
  fetchPriority?: 'high' | 'low' | 'auto'
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
  srcSet,
  alt,
  width,
  height,
  aspectRatio,
  fit = 'contain',
  loading = 'lazy',
  fetchPriority,
  crossOrigin,
  referrerPolicy,
}: ImageProps) {
  // What the element is asked to fetch: the `src`, and the set it may pick from
  // instead. A new set is a new request, as a new `src` is.
  const request = srcSet === undefined ? src : `${src} ${srcSet}`

  // Each holds the request it is about, so a new one starts as loading. An
  // empty `src` is failed without a request, because there is nothing to ask for.
  const [loaded, setLoaded] = useState('')
  const [failed, setFailed] = useState('')
  const image = useRef<HTMLImageElement>(null)

  // A failure is about one request. When the request moves on, the failure is
  // forgotten, so a caller that comes back to the same URL asks for it again,
  // as a bare element would. State is adjusted while rendering, not in an
  // effect, so no frame is drawn from the stale failure.
  const [asked, setAsked] = useState(request)
  if (asked !== request) {
    setAsked(request)
    setFailed('')
  }

  const state =
    src === '' || failed === request ? 'failed' : loaded === request ? 'loaded' : 'loading'
  const boxed = width !== undefined && height !== undefined && width > 0 && height > 0
  const ratio =
    aspectRatio !== undefined && aspectRatio > 0 && Number.isFinite(aspectRatio)
      ? aspectRatio
      : boxed
        ? width / height
        : undefined
  const sized = ratio !== undefined
  const decorative = alt === ''

  // The element's `sizes`, for a set that gives widths: how wide the frame can
  // be, which the browser needs to pick a file. A boxed frame is `width`
  // pixels and never wider than its container, which is never wider than the
  // viewport. Any other frame is at most the viewport's width, which is what
  // the element assumes with no `sizes`. A lazy picture in a sized frame is
  // laid out before it is requested, so `auto` asks for the frame's own width
  // where the browser reads it, and the rest is for a browser that does not.
  const widths = srcSet !== undefined && /\d+w\s*(?:,|$)/.test(srcSet)
  const lazy = loading === 'lazy'
  const sizes = !widths
    ? undefined
    : boxed
      ? `${lazy ? 'auto, ' : ''}(max-width: ${width}px) 100vw, ${width}px`
      : sized && lazy
        ? 'auto, 100vw'
        : undefined

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
    if (element.naturalWidth > 0) setLoaded(request)
    else element.src = src
  }, [request, src])

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
        // Everything that steers the fetch is on the element before `src`,
        // because the browser reads it when the request starts. React writes an
        // image's `srcSet` and `src` after its other attributes, in that order.
        <img
          ref={image}
          className={styles.image}
          loading={loading}
          fetchPriority={fetchPriority}
          crossOrigin={crossOrigin}
          referrerPolicy={referrerPolicy}
          sizes={sizes}
          srcSet={srcSet}
          src={src}
          alt={alt}
          onLoad={() => setLoaded(request)}
          onError={() => setFailed(request)}
        />
      )}
    </span>
  )
}
