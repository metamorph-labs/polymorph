import { cssVarName } from '@polymorph/theme'
import type { CSSProperties } from 'react'

import styles from './swatches.module.css'

/**
 * How a role is painted, by what the role is for. A fill is a surface, so it is painted whole and
 * holds the text role it is checked with. Ink is a text colour, so it is drawn as letters on the
 * surface it sits on. A line is an edge, so it is drawn as one. A veil is translucent, so it is
 * drawn over letters on the page's background. A role shown as a plain fill would vanish into the
 * page in a quiet palette, which is why each kind is drawn the way it is used.
 */
export type SwatchKind = 'fill' | 'ink' | 'line' | 'veil'

/**
 * One colour role, painted with the live pairing's own custom property, so the theme control
 * repaints it. Harness CSS: no member paints an arbitrary role, because members name their roles
 * in their recipes and take no colour from a prop. The name and caption beside the swatch are
 * members, composed by the page.
 */
export function Swatch({
  role,
  kind,
  ink,
  on,
}: {
  role: string
  kind: SwatchKind
  /** For a fill: the text role checked on it, drawn as letters. */
  ink?: string
  /** For ink and lines: the surface under them. Defaults to `bg.surface`. */
  on?: string
}) {
  const paint = `var(${cssVarName(role)})`
  const surface = `var(${cssVarName(on ?? 'bg.surface')})`
  const vars: Record<string, string> =
    kind === 'fill'
      ? {
          '--pm-swatch-bg': paint,
          '--pm-swatch-ink': ink === undefined ? 'transparent' : `var(${cssVarName(ink)})`,
        }
      : kind === 'ink'
        ? { '--pm-swatch-bg': surface, '--pm-swatch-ink': paint }
        : kind === 'line'
          ? { '--pm-swatch-bg': surface, '--pm-swatch-line': paint }
          : { '--pm-swatch-bg': 'var(--pm-bg-app)', '--pm-swatch-veil': paint }

  return (
    <div
      className={styles.swatch}
      data-kind={kind}
      style={vars as CSSProperties}
      aria-hidden="true"
    >
      {kind === 'line' ? null : 'Aa'}
    </div>
  )
}

/**
 * A run of roles as one strip, for the chart colours, which are read as a set: the eight
 * categories, a ramp, or two arms around a midpoint. Each cell carries its short label under it.
 */
export function Ramp({ roles, labels }: { roles: readonly string[]; labels: readonly string[] }) {
  return (
    <div className={styles.ramp} aria-hidden="true">
      {roles.map((role, index) => (
        <div key={role} className={styles.cell}>
          <div
            className={styles.block}
            style={{ ['--pm-swatch-bg' as string]: `var(${cssVarName(role)})` }}
          />
          <span className={styles.label}>{labels[index]}</span>
        </div>
      ))}
    </div>
  )
}
