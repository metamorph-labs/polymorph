/**
 * APCA lightness contrast (Lc), written out here from its published formula
 * with the 0.0.98G-4g constants, the version the WCAG 3 working draft cites.
 *
 * The theme holds the formula itself and depends on no package for it. The
 * formula is forty lines, every pairing's floor is stated in its numbers, and a
 * package that changed a constant would move every theme. `apca.test.ts` pins
 * each value to a table computed with the reference implementation, so a slip
 * in a constant fails there.
 */

/** The exponent that turns an 8-bit sRGB channel into screen light. */
const CHANNEL_EXPONENT = 2.4

/** How much of the screen's light each channel carries. */
const RED = 0.2126729
const GREEN = 0.7151522
const BLUE = 0.072175

/** Below this luminance a display's black is lifted, so the formula lifts it too. */
const BLACK_THRESHOLD = 0.022
const BLACK_CLAMP = 1.414

/** Two luminances closer than this have no contrast. */
const MIN_DELTA_Y = 0.0005

/** The power curves: dark text on a light background, then light text on a dark one. */
const DARK_ON_LIGHT_BACKGROUND = 0.56
const DARK_ON_LIGHT_TEXT = 0.57
const LIGHT_ON_DARK_BACKGROUND = 0.65
const LIGHT_ON_DARK_TEXT = 0.62

const SCALE = 1.14
/** A contrast below the clip is reported as none. */
const LOW_CLIP = 0.1
const LOW_OFFSET = 0.027

/** The luminance of an sRGB colour given as 0-255 channels, as a screen shows it. */
export function screenLuminance([r, g, b]: readonly [number, number, number]): number {
  const light = (channel: number) => (channel / 255) ** CHANNEL_EXPONENT
  return RED * light(r) + GREEN * light(g) + BLUE * light(b)
}

const lifted = (y: number) => (y > BLACK_THRESHOLD ? y : y + (BLACK_THRESHOLD - y) ** BLACK_CLAMP)

/**
 * Lc of text on a background, each given as a screen luminance. Signed:
 * positive for dark text on a light background, negative for light text on a
 * dark one. A luminance outside what a screen shows has no contrast.
 */
export function lightnessContrast(textY: number, backgroundY: number): number {
  const shown = (y: number) => !Number.isNaN(y) && y >= 0 && y <= 1.1
  if (!shown(textY) || !shown(backgroundY)) return 0

  const text = lifted(textY)
  const background = lifted(backgroundY)
  if (Math.abs(background - text) < MIN_DELTA_Y) return 0

  if (background > text) {
    const raw = (background ** DARK_ON_LIGHT_BACKGROUND - text ** DARK_ON_LIGHT_TEXT) * SCALE
    return raw < LOW_CLIP ? 0 : (raw - LOW_OFFSET) * 100
  }
  const raw = (background ** LIGHT_ON_DARK_BACKGROUND - text ** LIGHT_ON_DARK_TEXT) * SCALE
  return raw > -LOW_CLIP ? 0 : (raw + LOW_OFFSET) * 100
}
