import { cssVarName } from '@polymorph/theme'

import styles from './swatches.module.css'

/**
 * Paints a group of colour roles as chips. The painted value is
 * `var(--pm-<role>)` itself, so each swatch shows what the current theme and
 * mode resolve. The value is passed through the `--pm-swatch` custom property,
 * the measured-input pattern the harness already uses. Role names come from the
 * registry.
 */
export function Swatches({ roles }: { roles: string[] }) {
  return (
    <div className={styles.grid}>
      {roles.map((role) => (
        <div key={role} className={styles.swatch}>
          <div
            className={styles.chip}
            style={{ ['--pm-swatch' as string]: `var(${cssVarName(role)})` }}
          />
          <span className={styles.name}>{role}</span>
        </div>
      ))}
    </div>
  )
}
