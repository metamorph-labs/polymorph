'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'

import { memberAttr, useAgentMember } from '@polymorph/react'
import { Button } from '../controls/Button'
import styles from '@polymorph/recipes/structure/carousel.module.css'

/**
 * Slides shown one at a time, paged by the reader (`design/components/carousel.md`).
 * The substrate is a snap-scrolling viewport, so swipe, trackpad, momentum and
 * RTL work natively, and the buttons and dot rail share its position.
 *
 * A Carousel is a sequence with a position. Tabs are peer views chosen by name.
 * **No autoplay**: no motion temperament allows motion the reader did not ask
 * for. The reader pages with the buttons, the rail or a swipe.
 *
 * One scroll writer: buttons, dots and a controlled parent only change the
 * index. The effect below is the only code that scrolls, and the scroll
 * listener is the only code that reads a swipe back.
 */

export interface CarouselSlide {
  id: string
  /** Names the slide and its dot, such as "Dashboard" rather than "Slide 2". */
  label: string
  content: ReactNode
}

export interface CarouselProps {
  /** Slides in reading order; an empty list renders nothing, and the page handles it. */
  slides: CarouselSlide[]
  /** Names the carousel, such as "Product tour" rather than "Carousel". */
  label: string
  /** Accessible names for the previous and next buttons, in the app's language, with no default. */
  previousLabel: string
  nextLabel: string
  /**
   * Spoken role names for the region and each slide (default `carousel` and
   * `slide`, the APG's terms); localized hosts pass both or neither.
   */
  roleDescriptions?: { carousel: string; slide: string }
  /** The current slide, controlled as in Slider; swiping also calls `onIndexChange`. */
  index?: number
  defaultIndex?: number
  onIndexChange?: (index: number) => void
  /** Wraps from the first slide to the last and back; when off, the end buttons are disabled. */
  loop?: boolean
}

const clampIndex = (value: number, count: number) =>
  Math.min(Math.max(count - 1, 0), Math.max(0, value))

const DEFAULT_ROLE_DESCRIPTIONS = { carousel: 'carousel', slide: 'slide' }

export function Carousel({
  slides,
  label,
  previousLabel,
  nextLabel,
  roleDescriptions = DEFAULT_ROLE_DESCRIPTIONS,
  index: controlled,
  defaultIndex = 0,
  onIndexChange,
  loop = false,
}: CarouselProps) {
  const viewportRef = useRef<HTMLDivElement>(null)

  // Mirrored, not owned, as in Slider.
  const [mirror, setMirror] = useState(() => clampIndex(defaultIndex, slides.length))
  const index = clampIndex(controlled ?? mirror, slides.length)

  /** The index the viewport is already at, so the effect scrolls only on real changes. */
  const settled = useRef<number | null>(null)

  /**
   * A programmatic scroll in progress. A smooth scroll passes every slide in
   * between, and holding the destination stops the listener reading those as
   * swipes.
   */
  const destination = useRef<number | null>(null)

  function travel(next: number) {
    if (next === index) return
    setMirror(next)
    onIndexChange?.(next)
  }

  // The spec's `agent` fence. The travel Buttons and the dots are the Carousel's own parts, so it
  // withholds them, and an agent moves to a slide as a dot's press does. The slides' content is
  // the application's and stays an agent's.
  const rootRef = useRef<HTMLElement>(null)
  const controlsRef = useRef<HTMLDivElement>(null)
  useAgentMember({
    member: 'Carousel',
    element: () => rootRef.current,
    state: () => ({
      index,
      slides: slides.map((slide) => ({ id: slide.id, label: slide.label })),
    }),
    actions: {
      set: {
        argument: 'number',
        run: (next) => {
          if (!Number.isInteger(next) || next < 0 || next >= slides.length) {
            throw new Error(
              `There is no slide ${next}; the slides run from 0 to ${slides.length - 1}.`,
            )
          }
          travel(next)
        },
      },
    },
    withholds: () => controlsRef.current,
  })

  /**
   * The only scroll writer. First positioning is instant. Later moves are smooth
   * only while the surface duration token is non-zero, so `none` and reduced
   * motion are instant.
   *
   * `scrollTo` on the viewport, never `scrollIntoView`, which scrolls every
   * ancestor and would drag the page to a carousel below the fold.
   */
  useEffect(() => {
    const viewport = viewportRef.current
    if (viewport === null) return

    /**
     * Scrolls to the index unless it is already there. The guard also protects
     * the latch: a no-op `scrollTo` fires no scroll event, so a destination set
     * for it would block the listener forever.
     */
    const position = (behavior: ScrollBehavior) => {
      if (viewport.clientWidth === 0) return
      const styles = getComputedStyle(viewport)
      const target = (styles.direction === 'rtl' ? -1 : 1) * index * viewport.clientWidth
      if (Math.abs(viewport.scrollLeft - target) < 1) return
      destination.current = index
      viewport.scrollTo({ left: target, behavior })
    }

    if (settled.current !== index) {
      const arriving = settled.current === null
      settled.current = index
      const duration = parseFloat(
        getComputedStyle(viewport).getPropertyValue('--pm-motion-duration-surface'),
      )
      position(arriving || Number.isNaN(duration) || duration <= 0 ? 'auto' : 'smooth')
    }

    // A resize is layout, so it repositions instantly. That includes the first
    // layout after a zero-width mount, when the code above had nothing to
    // measure. The size guard skips the observer's initial callback, so it never
    // interrupts a swipe.
    let size = viewport.clientWidth
    const observer = new ResizeObserver(() => {
      if (viewport.clientWidth === size) return
      size = viewport.clientWidth
      position('auto')
    })
    observer.observe(viewport)
    return () => observer.disconnect()
  }, [index, slides.length])

  /** Reads the snap position after a user scroll back into the index. */
  function onScroll() {
    const viewport = viewportRef.current
    if (viewport === null || viewport.clientWidth === 0) return
    const nearest = clampIndex(
      Math.round(Math.abs(viewport.scrollLeft) / viewport.clientWidth),
      slides.length,
    )
    if (destination.current !== null) {
      if (nearest === destination.current) destination.current = null
      return
    }
    if (nearest === index) return
    // The viewport is already there, so the effect must not scroll it again
    // during the reader's momentum.
    settled.current = nearest
    setMirror(nearest)
    onIndexChange?.(nearest)
  }

  if (slides.length === 0) return null

  const first = index === 0
  const last = index === slides.length - 1

  return (
    /* `role="group"`, not the section's implicit region: the viewport is already
       a labelled region, and two landmarks with one name fail axe's
       landmark-unique rule. The WAI carousel pattern allows group, and the
       roledescription still says "carousel". */
    <section
      ref={rootRef}
      role="group"
      aria-roledescription={roleDescriptions.carousel}
      aria-label={label}
      {...memberAttr('Carousel')}
    >
      {/* A tab stop, as in ScrollArea (`tabindex`, `role="region"`, label), so
          a keyboard can page with the native scroll keys, which snap like swipe. */}
      <div
        ref={viewportRef}
        className={styles.viewport}
        onScroll={onScroll}
        tabIndex={0}
        role="region"
        aria-label={label}
      >
        {slides.map((slide) => (
          <div
            key={slide.id}
            className={styles.slide}
            role="group"
            aria-roledescription={roleDescriptions.slide}
            aria-label={slide.label}
          >
            {slide.content}
          </div>
        ))}
      </div>

      <div ref={controlsRef} className={styles.controls}>
        <Button
          variant="ghost"
          tone="neutral"
          size="sm"
          iconOnly
          icon="previous"
          label={previousLabel}
          disabled={!loop && first}
          onClick={() => travel(first ? slides.length - 1 : index - 1)}
        />
        <span className={styles.rail}>
          {slides.map((slide, at) => (
            <button
              key={slide.id}
              type="button"
              className={styles.dot}
              // The part hook the conformance runner locates a dot by, so
              // `aria-current` is checked on it rather than used to find it.
              data-carousel-part="dot"
              aria-label={slide.label}
              aria-current={at === index ? true : undefined}
              onClick={() => travel(at)}
            />
          ))}
        </span>
        <Button
          variant="ghost"
          tone="neutral"
          size="sm"
          iconOnly
          icon="next"
          label={nextLabel}
          disabled={!loop && last}
          onClick={() => travel(last ? 0 : index + 1)}
        />
      </div>
    </section>
  )
}
