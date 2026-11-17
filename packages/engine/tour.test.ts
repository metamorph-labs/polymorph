import { describe, expect, it } from 'vitest'

import { tourPlacement, type TourRect } from './src/conventions/tour'

/**
 * Where a Tour step's panel goes (`design/components/tour.md`, Placement). It
 * lives at the package root, not in `src/`, because `src/**` is the engine's
 * browser project and this function reads no document.
 */

const WINDOW = { width: 1000, height: 800 }
const BOX = { width: 300, height: 200 }

/** A target of 100 × 40 with its top-left corner here. */
const at = (x: number, y: number): TourRect => ({ x, y, width: 100, height: 40 })

/** Whether a placed box lies inside the window. */
const inside = (place: { x: number; y: number }, box = BOX, window = WINDOW) =>
  place.x >= 0 &&
  place.y >= 0 &&
  place.x + box.width <= window.width &&
  place.y + box.height <= window.height

describe('tourPlacement', () => {
  it('opens below the target by default, centred on it', () => {
    expect(tourPlacement(at(450, 100), BOX, WINDOW)).toEqual({
      x: 350,
      y: 140,
      placement: 'bottom',
    })
  })

  it('opens on the side the step names when the box fits there', () => {
    expect(tourPlacement(at(450, 400), BOX, WINDOW, 'top')).toEqual({
      x: 350,
      y: 200,
      placement: 'top',
    })
    expect(tourPlacement(at(100, 380), BOX, WINDOW, 'right')).toEqual({
      x: 200,
      y: 300,
      placement: 'right',
    })
    expect(tourPlacement(at(600, 380), BOX, WINDOW, 'left')).toEqual({
      x: 300,
      y: 300,
      placement: 'left',
    })
  })

  it('takes the opposite side when the named one has no room', () => {
    expect(tourPlacement(at(450, 700), BOX, WINDOW).placement).toBe('top')
    expect(tourPlacement(at(450, 50), BOX, WINDOW, 'top').placement).toBe('bottom')
  })

  it('takes a side across when neither the named side nor its opposite has room', () => {
    const tall: TourRect = { x: 100, y: 100, width: 100, height: 650 }
    expect(tourPlacement(tall, BOX, WINDOW).placement).toBe('right')
  })

  it('moves the box back inside the window along the side', () => {
    const nearEdge = tourPlacement(at(950, 100), BOX, WINDOW)
    expect(nearEdge).toEqual({ x: 700, y: 140, placement: 'bottom' })
    expect(tourPlacement(at(-20, 100), BOX, WINDOW).x).toBe(0)
  })

  it('centres the box in the window for a step with no target', () => {
    expect(tourPlacement(null, BOX, WINDOW)).toEqual({ x: 350, y: 300, placement: 'center' })
  })

  it('centres the box for a target that leaves no room on any side', () => {
    const whole: TourRect = { x: 0, y: 0, width: 1000, height: 800 }
    expect(tourPlacement(whole, BOX, WINDOW)).toEqual({ x: 350, y: 300, placement: 'center' })
  })

  it('centres the box for a target scrolled out of the window', () => {
    expect(tourPlacement(at(450, -400), BOX, WINDOW).placement).toBe('center')
    expect(tourPlacement(at(450, 1200), BOX, WINDOW).placement).toBe('center')
  })

  it('keeps the box inside a phone-width window, whatever the target', () => {
    const phone = { width: 375, height: 700 }
    const box = { width: 343, height: 220 }
    const targets: (TourRect | null)[] = [
      null,
      at(10, 10),
      at(300, 600),
      { x: -200, y: 100, width: 800, height: 60 },
      { x: 0, y: 0, width: 375, height: 700 },
    ]
    for (const target of targets) {
      for (const side of ['top', 'right', 'bottom', 'left'] as const) {
        expect(inside(tourPlacement(target, box, phone, side), box, phone)).toBe(true)
      }
    }
  })

  it('pins a box larger than the window to its top-left corner', () => {
    expect(tourPlacement(null, { width: 1200, height: 900 }, WINDOW)).toEqual({
      x: 0,
      y: 0,
      placement: 'center',
    })
  })
})
