import { describe, expect, it } from 'vitest'

import {
  clampCenter,
  coverScale,
  exportGeometry,
  initialCenter,
  turnedSize,
} from './image-editor.geometry'

/**
 * The law of the frame (`design/components/image-editor.md`), tested on plain numbers. The crop
 * can never extend past the image, quarter turns swap the axes everywhere at once, and the export
 * is the natural image re-projected, never the screen's pixels.
 */

const LANDSCAPE = { width: 640, height: 480 }
const VIEWPORT = { width: 320, height: 320 }

describe('cover, the minimum zoom', () => {
  it('is the larger of the two axis ratios', () => {
    // 320/640 = 0.5 and 320/480 = 0.666…, so the height is the limiting axis.
    expect(coverScale(LANDSCAPE, VIEWPORT, 0)).toBeCloseTo(320 / 480)
  })

  it('swaps the limiting axis on an odd turn', () => {
    // Turned, 480 is the width and 640 the height: max(320/480, 320/640). The width is now the
    // limiting axis instead of the height.
    expect(coverScale(LANDSCAPE, VIEWPORT, 1)).toBeCloseTo(320 / 480)
  })

  it('resolves degenerate boxes to 1 rather than dividing by zero', () => {
    expect(coverScale({ width: 0, height: 0 }, VIEWPORT, 0)).toBe(1)
    expect(coverScale(LANDSCAPE, { width: 0, height: 0 }, 0)).toBe(1)
  })
})

describe('the clamp keeps image edges out of the crop', () => {
  it('clamps the centre wherever the image would leave a gap', () => {
    // At minimum zoom the displayed height equals the viewport exactly, so the vertical centre has
    // one lawful value. The width overhangs and can pan.
    const centre = clampCenter({ x: -10_000, y: 10_000 }, LANDSCAPE, VIEWPORT, 1, 0)
    const scale = coverScale(LANDSCAPE, VIEWPORT, 0)
    const displayedWidth = LANDSCAPE.width * scale
    expect(centre.y).toBe(VIEWPORT.height / 2)
    expect(centre.x).toBe(VIEWPORT.width - displayedWidth / 2)
  })

  it('leaves a lawful centre untouched', () => {
    const centre = initialCenter(VIEWPORT)
    expect(clampCenter(centre, LANDSCAPE, VIEWPORT, 2, 0)).toEqual(centre)
  })

  it('re-clamps after a turn, using the swapped axes', () => {
    const centre = clampCenter({ x: 0, y: 0 }, LANDSCAPE, VIEWPORT, 1, 1)
    const scale = coverScale(LANDSCAPE, VIEWPORT, 1)
    // Turned, the displayed box is 480×640 at scale, so the width fits exactly.
    expect(centre.x).toBe(VIEWPORT.width / 2)
    expect(centre.y).toBe(VIEWPORT.height - (LANDSCAPE.width * scale) / 2)
  })
})

describe('turnedSize', () => {
  it('swaps on odd turns only', () => {
    expect(turnedSize(LANDSCAPE, 0)).toEqual(LANDSCAPE)
    expect(turnedSize(LANDSCAPE, 1)).toEqual({ width: 480, height: 640 })
    expect(turnedSize(LANDSCAPE, 2)).toEqual(LANDSCAPE)
  })
})

describe('export re-projects the natural image', () => {
  it('sizes the canvas by the longest edge and keeps the crop aspect', () => {
    const wide = exportGeometry(
      LANDSCAPE,
      { width: 400, height: 225 },
      { x: 200, y: 112.5 },
      1,
      0,
      512,
    )
    expect(wide.canvasWidth).toBe(512)
    expect(wide.canvasHeight).toBe(288) // 512 / (16/9)

    const tall = exportGeometry(
      LANDSCAPE,
      { width: 225, height: 400 },
      { x: 112.5, y: 200 },
      1,
      0,
      512,
    )
    expect(tall.canvasHeight).toBe(512)
    expect(tall.canvasWidth).toBe(288)
  })

  it('scales image pixels by cover × zoom × the resolution factor', () => {
    const geometry = exportGeometry(LANDSCAPE, VIEWPORT, initialCenter(VIEWPORT), 2, 0, 640)
    const factor = 640 / VIEWPORT.width
    expect(geometry.scaleX).toBeCloseTo(coverScale(LANDSCAPE, VIEWPORT, 0) * 2 * factor)
    expect(geometry.scaleY).toBeCloseTo(geometry.scaleX)
    // The centre uses the same factor, and the image is drawn anchored at its centre.
    expect(geometry.translateX).toBeCloseTo(initialCenter(VIEWPORT).x * factor)
    expect(geometry.drawX).toBe(-LANDSCAPE.width / 2)
  })

  it('the mirror negates only x, in image space', () => {
    const straight = exportGeometry(LANDSCAPE, VIEWPORT, initialCenter(VIEWPORT), 1, 1, 512)
    const mirrored = exportGeometry(LANDSCAPE, VIEWPORT, initialCenter(VIEWPORT), 1, 1, 512, true)
    expect(mirrored.scaleX).toBeCloseTo(-straight.scaleX)
    expect(mirrored.scaleY).toBeCloseTo(straight.scaleY)
    expect(mirrored.rotationRadians).toBe(straight.rotationRadians)
  })

  it('reports quarter turns in radians', () => {
    expect(
      exportGeometry(LANDSCAPE, VIEWPORT, { x: 0, y: 0 }, 1, 3, 512).rotationRadians,
    ).toBeCloseTo((3 * Math.PI) / 2)
  })
})
