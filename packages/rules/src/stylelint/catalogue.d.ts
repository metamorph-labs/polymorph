/**
 * The emitted custom properties a raw value is compared with, by family: name
 * -> value in a pairing's base block (its default mode, density and motion
 * temperament). In this repository `tokenValues` in `emitted.ts` builds it
 * from the reference pairing; in a consumer `polymorph add` writes it into the
 * lint fragments from the consumer's compiled theme.
 */
export interface TokenValues {
  /** Colour roles, in the theme's role order. */
  color?: Record<string, string>
  /** `--pm-space-N` at the pairing's default density. */
  space?: Record<string, string>
  /** `--pm-radius-*` steps. */
  radius?: Record<string, string>
  /** `--pm-text-*-size` and `--pm-display-*-size`. */
  text?: Record<string, string>
  /** Control heights and icon sizes. */
  size?: Record<string, string>
  /** `--pm-motion-duration-*`. */
  duration?: Record<string, string>
}

export interface Oklab {
  L: number
  a: number
  b: number
  alpha: number
}

export interface NearestAmount {
  name: string
  value: string
  /** The raw value equals the token's. */
  exact: boolean
  /** The raw value was negative, and the token is its size: `-12px` is step 4 negated. */
  negative?: true
  /** A second token exactly as near, with a different value: `10px` is between 8px and 12px. */
  also?: { name: string; value: string }
}

export declare function parseColor(text: string): Oklab | null
export declare function colorDistance(x: Oklab, y: Oklab): number
export declare function cssProperty(key: string): string
export declare function nearestColor(
  text: string,
  roles: Record<string, string> | undefined,
  property?: string,
): { names: string[]; value: string } | null
export declare function lengthPx(value: string | number): number | null
export declare function durationMs(value: string): number | null
export declare function nearestAmount(
  amount: number,
  family: Record<string, string> | undefined,
  read: (value: string) => number | null,
): NearestAmount | null
export declare function lengthFamily(
  property: string | undefined,
): 'radius' | 'text' | 'size' | 'space'
export declare function nearestLength(
  raw: string | number,
  values: TokenValues | undefined,
  property?: string,
): NearestAmount | null
export declare function nearestDuration(
  raw: string,
  values: TokenValues | undefined,
): NearestAmount | null
export declare function spaceStep(name: string): number | null
