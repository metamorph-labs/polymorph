/**
 * ImageEditor's frame math (`design/components/image-editor.md`, "the law of the frame"). It is
 * pure on purpose: every clamp the component relies on is a function of plain numbers, testable
 * without a browser.
 *
 * The model: the image is placed by the position of its *centre* in viewport coordinates, then
 * rotated by quarter turns and scaled about that centre. Zoom is a multiple of the cover scale, so
 * `1` always means "exactly covers the crop", whatever the image or the rotation.
 */

export interface Size {
  width: number
  height: number
}

export interface Point {
  x: number
  y: number
}

/**
 * Zoom bounds, as multiples of cover. The frame law sets the minimum. The maximum is a design
 * choice.
 */
export const ZOOM_MIN = 1
export const ZOOM_MAX = 4

/** The image's effective size after a number of quarter turns. */
export function turnedSize(image: Size, turns: number): Size {
  return turns % 2 === 0
    ? { width: image.width, height: image.height }
    : { width: image.height, height: image.width }
}

/**
 * The smallest scale at which the turned image covers the viewport, which is zoom 1. Degenerate
 * inputs (a zero-sized viewport during mount) resolve to 1, so the component never divides by
 * zero.
 */
export function coverScale(image: Size, viewport: Size, turns: number): number {
  const turned = turnedSize(image, turns)
  if (turned.width <= 0 || turned.height <= 0 || viewport.width <= 0 || viewport.height <= 0)
    return 1
  return Math.max(viewport.width / turned.width, viewport.height / turned.height)
}

/**
 * The centre, clamped so no image edge enters the crop. At minimum zoom the displayed size is at
 * least the viewport size on both axes by construction, so the interval is never empty.
 */
export function clampCenter(
  center: Point,
  image: Size,
  viewport: Size,
  zoom: number,
  turns: number,
): Point {
  const scale = coverScale(image, viewport, turns) * zoom
  const turned = turnedSize(image, turns)
  const displayed = { width: turned.width * scale, height: turned.height * scale }

  const clamp = (value: number, view: number, span: number) => {
    const min = view - span / 2
    const max = span / 2
    return Math.min(max, Math.max(min, value))
  }

  return {
    x: clamp(center.x, viewport.width, displayed.width),
    y: clamp(center.y, viewport.height, displayed.height),
  }
}

/** Where a newly loaded image sits: centred, at minimum zoom. */
export function initialCenter(viewport: Size): Point {
  return { x: viewport.width / 2, y: viewport.height / 2 }
}

export interface ExportGeometry {
  canvasWidth: number
  canvasHeight: number
  /** Canvas-space translation to the image centre. */
  translateX: number
  translateY: number
  rotationRadians: number
  /** Natural-image pixels to canvas pixels; X carries the mirror's sign. */
  scaleX: number
  scaleY: number
  drawX: number
  drawY: number
}

/**
 * The crop, re-projected from the *natural* image onto a canvas whose longest edge is
 * `exportSize`. The screen's pixels are never the source (image-editor.md: a 4000px source framed
 * in a 320px viewport still exports sharp). The canvas is the viewport at a higher resolution. One
 * factor maps every viewport coordinate onto it, and the image transform uses the same factor.
 */
export function exportGeometry(
  image: Size,
  viewport: Size,
  center: Point,
  zoom: number,
  turns: number,
  exportSize: number,
  mirrored = false,
): ExportGeometry {
  const aspect = viewport.width / viewport.height
  const canvasWidth = Math.max(1, Math.round(aspect >= 1 ? exportSize : exportSize * aspect))
  const canvasHeight = Math.max(1, Math.round(aspect >= 1 ? exportSize / aspect : exportSize))

  const factor = canvasWidth / viewport.width
  const scale = coverScale(image, viewport, turns) * zoom * factor

  return {
    canvasWidth,
    canvasHeight,
    translateX: center.x * factor,
    translateY: center.y * factor,
    rotationRadians: (turns * Math.PI) / 2,
    // The mirror is image-local (image-editor.md): x is negated before the rotation, in the same
    // order as the stage's transform, so the export matches the screen.
    scaleX: mirrored ? -scale : scale,
    scaleY: scale,
    drawX: -image.width / 2,
    drawY: -image.height / 2,
  }
}
