import { describe, expect, it } from 'vitest'

import { lightnessContrast, screenLuminance } from './apca'
import { APCA_REFERENCE } from './apca.reference'

describe('lightnessContrast', () => {
  it('reports the reference Lc for every pair in the table', () => {
    const differing = APCA_REFERENCE.filter(
      ([text, background, lc]) =>
        Math.abs(lightnessContrast(screenLuminance(text), screenLuminance(background)) - lc) > 1e-9,
    )
    expect(differing).toEqual([])
  })

  it('is positive for dark text on light and negative for light text on dark', () => {
    const black = screenLuminance([0, 0, 0])
    const white = screenLuminance([255, 255, 255])
    expect(lightnessContrast(black, white)).toBeCloseTo(106.04067321268862, 9)
    expect(lightnessContrast(white, black)).toBeCloseTo(-107.88473318309848, 9)
  })

  it('reports no contrast below the low clip and for one colour on itself', () => {
    const grey = screenLuminance([128, 128, 128])
    expect(lightnessContrast(grey, grey)).toBe(0)
    expect(lightnessContrast(screenLuminance([120, 120, 120]), grey)).toBe(0)
  })

  it('reports no contrast for a luminance a screen cannot show', () => {
    expect(lightnessContrast(-0.1, 0.5)).toBe(0)
    expect(lightnessContrast(0.5, 1.2)).toBe(0)
    expect(lightnessContrast(Number.NaN, 0.5)).toBe(0)
  })
})
