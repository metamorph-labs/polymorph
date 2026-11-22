import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

/**
 * How a component page draws its states fixture: live in the page, or each
 * entry in its own document (`FixtureFrame`), and in a grid or one per row.
 * Both are decided by rendering the entries and looking at the result, because
 * the registry records neither modality nor size.
 */

/**
 * How long after mount the page keeps looking. An overlay can arrive a chunk
 * late (the DatePicker pattern). The cost of the window is that a reader who
 * opens a modal by hand inside it also switches the page to frames. That is
 * rare, a new session detects again, and the framed page still works fully.
 */
const DETECT_WINDOW_MS = 1500

const VERDICT_PREFIX = 'pm-docs:contained:'

function readVerdict(name: string): boolean {
  try {
    return window.sessionStorage.getItem(VERDICT_PREFIX + name) === '1'
  } catch {
    // Storage denied: detection simply re-runs on the next visit.
    return false
  }
}

function writeVerdict(name: string): void {
  try {
    window.sessionStorage.setItem(VERDICT_PREFIX + name, '1')
  } catch {
    // Same degradation as above.
  }
}

/**
 * Whether live entries have taken over the page. Any one of three marks counts:
 *
 *  - `#root` is hidden from assistive technology: Radix's `aria-hidden`
 *    marking, in both of its forms, or `inert`.
 *  - `<body>` has `pointer-events: none`, which a modal layer writes so that
 *    nothing outside it takes a press.
 *  - An open surface is drawn outside `#root`: a portalled popper, or a body
 *    child holding an element whose `data-state` is `open`. A non-modal panel
 *    takes no page over, but it floats over the entries beside it, and in its
 *    own document the frame grows to fit it instead.
 *
 * Other body children, such as a script, a focus guard or a live region with
 * nothing open in it, do not count. `drawsFixed` is the fourth mark, checked
 * on a timer because it reads computed styles.
 */
export function pageIsTaken(root: HTMLElement): boolean {
  if (
    root.getAttribute('aria-hidden') === 'true' ||
    root.hasAttribute('data-aria-hidden') ||
    root.hasAttribute('inert')
  ) {
    return true
  }
  if (document.body.style.pointerEvents === 'none') return true
  for (const child of document.body.children) {
    if (child === root) continue
    if (child.hasAttribute('data-radix-popper-content-wrapper')) return true
    if (child.matches('[data-state="open"]') || child.querySelector('[data-state="open"]')) {
      return true
    }
  }
  return false
}

/**
 * Whether anything in the page's content region is `position: fixed`: a toast
 * viewport, a sheet drawn in place. It is drawn against the window, over the
 * rest of the page, so it belongs in a frame. The shell's content region is
 * `#content`, and nothing the site itself draws inside it is fixed.
 */
export function drawsFixed(): boolean {
  const content = document.getElementById('content')
  if (!content) return false
  for (const element of content.querySelectorAll('*')) {
    if (getComputedStyle(element).position === 'fixed') return true
  }
  return false
}

/**
 * Whether the page draws every entry in its own document.
 *
 * An entry whose overlay opens on mount (a `defaultOpen` Select or Menu, an
 * open Drawer) either makes the docs page inert while the gallery is on screen
 * or floats a panel over its neighbours. The page keeps those entries, because
 * an overlay fixture must include its open state, and moves every entry into a
 * `FixtureFrame`, so the overlay belongs to a frame instead of the page. A
 * contained page frames every entry, not only the open ones, so the gallery is
 * consistent within a page.
 *
 * Framing every entry on every page is too heavy: each frame is an extra
 * document boot and a document boundary for a screen reader. So entries render
 * live first, and the page switches when `pageIsTaken` finds a mark. The
 * verdict is cached per session, so a return visit uses frames from the first
 * paint. The caller remounts this per member (a `key`), so a verdict for Select
 * never reaches the next page visited.
 */
export function useContainment(name: string, live: boolean): boolean {
  const [contained, setContained] = useState(() => readVerdict(name))

  useEffect(() => {
    if (contained || !live) return
    const root = document.getElementById('root')
    if (!root) return

    const flip = () => {
      writeVerdict(name)
      setContained(true)
    }
    if (pageIsTaken(root)) {
      flip()
      return
    }

    const observer = new MutationObserver(() => {
      if (pageIsTaken(root)) {
        observer.disconnect()
        flip()
      }
    })
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['aria-hidden', 'data-aria-hidden', 'inert', 'style', 'data-state'],
    })
    const timer = window.setTimeout(() => observer.disconnect(), DETECT_WINDOW_MS)
    // Reading computed styles is too slow for every mutation, so the fixed
    // check runs a few times through the window instead.
    const looks = [0, 300, DETECT_WINDOW_MS].map((delay) =>
      window.setTimeout(() => {
        if (drawsFixed()) {
          observer.disconnect()
          flip()
        }
      }, delay),
    )

    return () => {
      window.clearTimeout(timer)
      for (const look of looks) window.clearTimeout(look)
      observer.disconnect()
    }
  }, [name, contained, live])

  return contained
}

/**
 * Whether every live entry fits a grid cell. `cell` is the ref callback for
 * the box each entry renders in. An entry wider than its cell (three Selects
 * side by side, a month grid) would draw past the cell's edge, so the first
 * one found sends the whole gallery to one entry per row, where every entry
 * has the column's width. It is checked before paint, and again through the
 * detection window for an entry whose content arrives late.
 */
export function useFitsGrid(active: boolean): {
  fits: boolean
  cell: (node: HTMLElement | null) => void
} {
  const cells = useRef(new Set<HTMLElement>())
  const [fits, setFits] = useState(true)

  const cell = useCallback((node: HTMLElement | null) => {
    if (node !== null) cells.current.add(node)
  }, [])

  const overflows = useCallback(() => {
    for (const node of cells.current) {
      if (node.isConnected && node.scrollWidth > node.clientWidth + 1) return true
    }
    return false
  }, [])

  useLayoutEffect(() => {
    if (!active || !fits) return
    const check = () => {
      if (overflows()) setFits(false)
    }
    // Before paint, so a gallery that does not fit is never drawn as a grid.
    check()
    const frame = requestAnimationFrame(check)
    const timers = [300, DETECT_WINDOW_MS].map((delay) => window.setTimeout(check, delay))
    return () => {
      cancelAnimationFrame(frame)
      for (const timer of timers) window.clearTimeout(timer)
    }
  }, [active, fits, overflows])

  return { fits, cell }
}
