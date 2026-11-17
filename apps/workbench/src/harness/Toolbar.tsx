import {
  DENSITIES,
  MODE_PREFERENCES,
  MOTION_TEMPERAMENTS,
  setDensityDefault,
  setMode,
  setMotionTemperament,
  useMode,
  type Density,
  type ModePreference,
  type MotionTemperament,
} from '@polymorph/react'
import { useSyncExternalStore, type ReactNode } from 'react'

import { DRAFT_PALETTE, DRAFT_SYSTEM, getDraftRuntime, subscribeDraft } from '../draft-boot'
import { PALETTES, selectPalette, selectSystem, SYSTEMS } from '../themes'
import { navigate, useRoute } from './router'
import styles from './Toolbar.module.css'
import { useThemeAttributes } from './useThemeAttributes'

/**
 * The persistent scope switcher: system x palette x mode x density x motion temperament. The
 * theme runtime persists each to localStorage. Every control writes an attribute on `<html>` and
 * nothing else.
 *
 * There are two theme selects because a pairing is two decisions. The palette list shows every
 * palette, not only this system's, because cross-pairings are supported and the law suite
 * resolves the whole product. `selectSystem` in `../themes` decides which palette a system change
 * selects.
 */

/**
 * The nav follows the designer's workflow: the studio first, then the composer, components, pages
 * and mood board. Pages that show information rather than make decisions, the token gallery and
 * the overview, keep their URLs and are linked from the studio instead of the nav. Every item
 * here is an existing route, so no nav item leads to a 404.
 */
const ROUTES = [
  { path: '/', label: 'Studio' },
  { path: '/composer', label: 'Composer' },
  { path: '/components', label: 'Components' },
  { path: '/pages', label: 'Pages' },
  { path: '/moodboard', label: 'Mood board' },
]

/** Both `/` and `/studio` mark the Studio item as current. */
function isCurrent(path: string, route: string): boolean {
  if (path === '/') return route === '/' || route === '/studio'
  return route === path
}

const hasDraft = () => getDraftRuntime() !== null

export function Toolbar() {
  const attributes = useThemeAttributes()
  // The mode preference (which may be `system`) is not an attribute, so the toolbar reads it from
  // the runtime, which also reports a choice made in a ModeSwitch or a Relay menu. The resolved
  // mode comes from the attribute subscription.
  const { preference: modePreference } = useMode()
  const route = useRoute()
  // The draft is a pairing while one is installed. Boot restores it and the studio's edits keep it
  // current. This subscription makes the entry appear as soon as either happens.
  const draftInstalled = useSyncExternalStore(subscribeDraft, hasDraft, hasDraft)
  const wearingDraft = attributes.system === DRAFT_SYSTEM

  return (
    <header className={styles.toolbar}>
      <nav className={styles.nav} aria-label="Workbench sections">
        {ROUTES.map(({ path, label }) => (
          <button
            key={path}
            type="button"
            className={styles.navLink}
            aria-current={isCurrent(path, route) ? 'page' : undefined}
            onClick={() => navigate(path)}
          >
            {label}
          </button>
        ))}
      </nav>

      <div className={styles.controls}>
        <Field label="System">
          <select
            className={styles.select}
            value={attributes.system}
            onChange={(event) => selectSystem(event.target.value)}
          >
            {(draftInstalled || wearingDraft) && (
              <option value={DRAFT_SYSTEM}>draft (unsaved)</option>
            )}
            {SYSTEMS.map((system) => (
              <option key={system.name} value={system.name}>
                {system.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Palette">
          {/* A draft's palette belongs to the draft. While the draft is active no cross-pairing
              exists, so the control is disabled. */}
          <select
            className={styles.select}
            value={wearingDraft ? DRAFT_PALETTE : attributes.palette}
            disabled={wearingDraft}
            onChange={(event) => selectPalette(attributes.system, event.target.value)}
          >
            {wearingDraft ? (
              <option value={DRAFT_PALETTE}>draft&rsquo;s own</option>
            ) : (
              PALETTES.map((palette) => (
                <option key={palette.name} value={palette.name}>
                  {palette.name}
                </option>
              ))
            )}
          </select>
        </Field>

        <Field label="Mode">
          <select
            className={styles.select}
            value={modePreference}
            onChange={(event) => setMode(event.target.value as ModePreference)}
          >
            {MODE_PREFERENCES.map((preference) => (
              <option key={preference} value={preference}>
                {preference === 'system' ? `system (${attributes.mode})` : preference}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Density">
          <select
            className={styles.select}
            value={attributes.density ?? ''}
            onChange={(event) => setDensityDefault((event.target.value || null) as Density | null)}
          >
            <option value="">theme default</option>
            {DENSITIES.map((density) => (
              <option key={density} value={density}>
                {density}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Motion">
          <select
            className={styles.select}
            value={attributes.motion ?? ''}
            onChange={(event) =>
              setMotionTemperament((event.target.value || null) as MotionTemperament | null)
            }
          >
            <option value="">theme default</option>
            {MOTION_TEMPERAMENTS.map((temperament) => (
              <option key={temperament} value={temperament}>
                {temperament}
              </option>
            ))}
          </select>
        </Field>
      </div>
    </header>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className={styles.field}>
      <span className={styles.fieldLabel}>{label}</span>
      {children}
    </label>
  )
}
