/**
 * Types for `apca-w3`, which ships none. Only the two functions the contrast law
 * needs are declared. This is deliberate: an upgrade that changes anything else
 * becomes a compile error instead of a silent change in behaviour.
 *
 * `contrast.ts` loads this file with a triple-slash reference instead of this
 * package's `include`. That way it goes with the source into `@polymorph/react-ui`
 * and `apps/workbench`, which compile the theme files inside their own programs.
 */
declare module 'apca-w3' {
  /** Relative luminance of an sRGB colour given as 0-255 channels. */
  export function sRGBtoY(rgb: readonly [number, number, number]): number

  /**
   * APCA lightness contrast. Signed: positive for dark-on-light, negative for
   * light-on-dark. Returns a number when `places` is left at its default.
   */
  export function APCAcontrast(txtY: number, bgY: number): number
}
