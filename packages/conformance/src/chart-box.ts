import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { installTestTheme } from '@polymorph/engine/testing'

import type { Mounted, MountAdapter } from './run'

/**
 * The law for a chart's box (`docs/charts.md`, the frame), which every web
 * shell's test of a chart member calls with its own adapter and the member's
 * states fixture. It draws every entry of the fixture at a wide and at a phone
 * width, in a left-to-right and in a right-to-left document, and holds that no
 * part of the chart is drawn past the inline edges of the chart's own element.
 * The part that would cross them is an x-axis label at an end of the plot,
 * which centred on its tick lies half outside, so the engine anchors it at
 * that end (`anchorAtEnds` in the chart engine's `cartesian.ts`).
 *
 * The law sets the width of the page's body and the document's direction, and
 * puts both back after each test. A chart lays its plot out after it measures
 * it, so the law waits until each framed chart with rows has drawn its marks
 * and its entrance has ended. A part is measured where it is painted: a box an
 * ancestor clips is cut to that ancestor, and text drawn for assistive
 * technology only is not painted at all.
 */

export interface ChartBoxLaw {
  /** The shell's name as the law's titles say it: `Vue`. */
  readonly shell: string
  /** The chart member, as the shell's galleries name it: `BarChart`. */
  readonly member: string
  /** The member's states fixture entries. The law draws every one. */
  readonly entries: readonly { readonly name: string }[]
  /** The shell's mount adapter. */
  readonly adapter: MountAdapter
}

/** A wide panel, and a 375px phone less its 16px gutters. */
const WIDTHS = [942, 343] as const

const DIRECTIONS = [
  ['ltr', 'left to right'],
  ['rtl', 'right to left'],
] as const

/** A box edge may sit this far past the chart's: the plot is measured in whole pixels. */
const TOLERANCE_PX = 1

/** `BarChart` → `bar-chart`, the value of the member's `data-member`. */
const slugOf = (member: string) => member.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()

/** Text for assistive technology only: clipped to nothing, so nothing of it is painted. */
function unpainted(element: Element): boolean {
  const style = getComputedStyle(element)
  return (style.clip !== '' && style.clip !== 'auto') || style.clipPath === 'inset(50%)'
}

/**
 * The span an element paints along the inline axis, inside the chart: its box,
 * cut by every ancestor that clips its overflow. `null` for an element that
 * paints nothing.
 */
function paintedSpan(element: Element, chart: Element): { left: number; right: number } | null {
  /*
   * An SVG shape, and a group of them, is measured by the svg it is drawn in.
   * The engine lays every mark out inside the svg's width, and an svg clips
   * what is drawn past it unless it lets its overflow show. Firefox reports a
   * shape's box with the widest extent its stroke could take, which is wider
   * than what it paints. SVG text is measured as text.
   */
  if (element instanceof SVGGeometryElement || element instanceof SVGGElement) return null
  const rect = element.getBoundingClientRect()
  if (rect.width === 0 && rect.height === 0) return null
  if (unpainted(element)) return null
  let left = rect.left
  let right = rect.right
  for (let node = element.parentElement; node !== null; node = node.parentElement) {
    if (unpainted(node)) return null
    if (node === chart) break
    if (getComputedStyle(node).overflowX !== 'visible') {
      const clip = node.getBoundingClientRect()
      left = Math.max(left, clip.left)
      right = Math.min(right, clip.right)
    }
  }
  return right - left > 0 ? { left, right } : null
}

/** What an element is, for a failure message: `span "100"`. */
function named(element: Element): string {
  const text = (element.textContent ?? '').trim().slice(0, 24)
  return text === '' ? element.tagName.toLowerCase() : `${element.tagName.toLowerCase()} "${text}"`
}

/** Every part of `chart` painted past its inline edges, as one line each. */
function crossings(entry: string, chart: Element): string[] {
  const box = chart.getBoundingClientRect()
  const found: string[] = []
  for (const element of chart.querySelectorAll('*')) {
    const span = paintedSpan(element, chart)
    if (span === null) continue
    const before = box.left - span.left
    const after = span.right - box.right
    if (before > TOLERANCE_PX) {
      found.push(`${entry}: ${named(element)} ${before.toFixed(1)}px past the left edge`)
    }
    if (after > TOLERANCE_PX) {
      found.push(`${entry}: ${named(element)} ${after.toFixed(1)}px past the right edge`)
    }
  }
  return found
}

/** A motion that ends. A motion that repeats for ever has no end to wait for. */
const ends = (motion: Animation) => motion.effect?.getTiming().iterations !== Infinity

/**
 * Waits until every framed chart that has rows has drawn its marks at the
 * width of the plot they are drawn in, the entrances have ended, and a frame
 * has been laid out after them.
 *
 * A chart measures its plot twice. The first measurement is taken before the
 * axes are drawn, so the y gutter is empty and the plot is as wide as the
 * frame. The axes then take their gutter, the plot narrows, and the chart
 * measures again. Firefox and WebKit deliver that second measurement some
 * frames later, so the law waits for the marks' width to match the plot's.
 */
async function drawn(charts: readonly Element[]): Promise<void> {
  await vi.waitFor(
    () => {
      for (const chart of charts) {
        if (chart.tagName !== 'FIGURE' || chart.getAttribute('data-state') === 'empty') continue
        const name = chart.getAttribute('aria-label')
        const marks = chart.querySelector('svg[width]')
        expect(marks, `${name} drew no marks`).not.toBeNull()
        const plot = marks?.closest('[class*="plot"]')
        expect(Number(marks?.getAttribute('width')), `${name} drew at another width`).toBe(
          plot?.clientWidth,
        )
      }
    },
    { timeout: 10_000 },
  )
  await Promise.all(
    charts.flatMap((chart) =>
      chart
        .getAnimations({ subtree: true })
        .filter(ends)
        .map((motion) => motion.finished),
    ),
  )
  await new Promise<void>((settle) => requestAnimationFrame(() => settle()))
}

export function chartBoxLaw({ shell, member, entries, adapter }: ChartBoxLaw): void {
  const slug = slugOf(member)

  describe(`${member} in the ${shell} shell — its box`, () => {
    beforeAll(installTestTheme)

    let mounted: Mounted[] = []

    afterEach(() => {
      for (const mount of mounted) mount.unmount()
      mounted = []
      document.documentElement.removeAttribute('dir')
      document.body.style.removeProperty('inline-size')
    })

    for (const width of WIDTHS) {
      for (const [dir, direction] of DIRECTIONS) {
        it(`draws no part of any state past its inline edges at ${width}px, ${direction}`, async () => {
          document.documentElement.setAttribute('dir', dir)
          document.body.style.setProperty('inline-size', `${width}px`)
          const drawnEntries: { name: string; chart: Element }[] = []
          for (const entry of entries) {
            const mount = await adapter.mount(member, { state: entry.name })
            mounted.push(mount)
            const chart = mount.root.querySelector(`[data-member="${slug}"]`)
            // An entry may draw nothing at all, as a Sparkline with one point does.
            if (chart !== null) drawnEntries.push({ name: entry.name, chart })
          }
          expect(drawnEntries.length, `no entry drew a ${member}`).toBeGreaterThan(0)
          await drawn(drawnEntries.map((entry) => entry.chart))

          for (const { name, chart } of drawnEntries) {
            // A framed chart fills the page's width, so the law reads it at the width it set.
            if (chart.tagName !== 'FIGURE') continue
            expect(Math.round(chart.getBoundingClientRect().width), name).toBe(width)
          }
          expect(drawnEntries.flatMap(({ name, chart }) => crossings(name, chart))).toEqual([])
        })
      }
    }
  })
}
