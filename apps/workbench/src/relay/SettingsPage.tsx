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
import {
  Checkbox,
  Select,
  SettingsPage as SettingsArchetype,
  SettingsRow,
  Switch,
  toast,
} from '@polymorph/react-ui'
import { useState } from 'react'

import { DRAFT_PALETTE, DRAFT_SYSTEM } from '../draft-boot'
import { useThemeAttributes } from '../harness'
import { PALETTES, selectPalette, selectSystem, SYSTEMS } from '../themes'

/**
 * Settings: Relay's re-theming demonstration.
 *
 * The five selects at the top demonstrate the system's main claim. A product built only from the
 * vocabulary changes its typeface, palette, spacing and motion when an attribute on `<html>`
 * changes. No screen below the toggle re-renders, nothing re-mounts, and no component in Relay
 * is notified. Switching to `terminal` while a toast is visible changes the toast too.
 *
 * System and palette are two rows because they are two decisions: the structure a product is
 * built on, and its colours. Any palette is valid on any system, so the first list never
 * filters the second. `selectSystem` in `../themes` decides which palette a system change
 * selects.
 *
 * The groups are `SettingsRow.Group`s rather than `Card`s without headings around a `Grid` of
 * `FormField`s. Each group has a real `h2`, so the page has an outline instead of two unlabelled
 * boxes.
 *
 * `useThemeAttributes` comes from the harness and is the only thing Relay imports from it. It
 * reads only `<html>`'s attributes. A product with a theme switcher must read the current theme
 * from somewhere, and duplicating a `MutationObserver` to avoid the import would be worse.
 */

const SYSTEM_OPTIONS = SYSTEMS.map((system) => ({ value: system.name, label: system.name }))
const PALETTE_OPTIONS = PALETTES.map((palette) => ({ value: palette.name, label: palette.name }))

/**
 * What these two rows show while the studio's unsaved draft is applied, using the toolbar's
 * wording (`harness/Toolbar.tsx`).
 *
 * No file defines the draft pairing, so neither list contains it. The value would match no
 * option, the trigger would show an empty field, and every choice would be blocked by
 * `selectPalette`'s guard, giving a control that responds but does nothing. A settings screen
 * must not have such a control. Leaving the draft is done in the workbench toolbar that selected
 * it, so this only shows what is applied.
 */
const DRAFT_SYSTEM_OPTIONS = [{ value: DRAFT_SYSTEM, label: 'draft (unsaved)' }]
const DRAFT_PALETTE_OPTIONS = [{ value: DRAFT_PALETTE, label: 'draft’s own' }]
const MODE_OPTIONS = MODE_PREFERENCES.map((value) => ({ value, label: value }))
const MOTION_OPTIONS = MOTION_TEMPERAMENTS.map((value) => ({ value, label: value }))

/** "Whatever the theme chose" is `emptyOption`, an explicit choice, not an absent value. */
const DENSITY_OPTIONS = DENSITIES.map((value) => ({ value, label: value }))

export function SettingsPage() {
  const attributes = useThemeAttributes()
  // The mode preference can be `system`, which is not an attribute. Only the resolved mode is. So
  // the page reads it from the runtime, which also reports a choice made in Relay's menu.
  const { preference: modePreference } = useMode()
  const [digest, setDigest] = useState(true)
  const [signature, setSignature] = useState(false)
  const wearingDraft = attributes.system === DRAFT_SYSTEM

  return (
    <SettingsArchetype
      title="Settings"
      description="Appearance applies to every screen in Relay the moment it changes."
    >
      <SettingsRow.Group title="Appearance">
        <SettingsRow
          label="System"
          description="Type, shape and spacing — how the product is built."
          control={
            <Select
              options={wearingDraft ? DRAFT_SYSTEM_OPTIONS : SYSTEM_OPTIONS}
              value={attributes.system}
              disabled={wearingDraft}
              onChange={(value) => selectSystem(value ?? attributes.system)}
            />
          }
        />
        <SettingsRow
          label="Palette"
          description="The colour it is painted with. Any palette, any system."
          control={
            <Select
              options={wearingDraft ? DRAFT_PALETTE_OPTIONS : PALETTE_OPTIONS}
              value={wearingDraft ? DRAFT_PALETTE : attributes.palette}
              disabled={wearingDraft}
              onChange={(value) => selectPalette(attributes.system, value ?? attributes.palette)}
            />
          }
        />
        <SettingsRow
          label="Mode"
          description="Follow the operating system, or pin one."
          control={
            <Select
              options={MODE_OPTIONS}
              value={modePreference}
              onChange={(value) => {
                // No `emptyOption` here, because `system` already is the "let something else
                // decide" choice, and two such choices would be redundant.
                setMode((value ?? 'system') as ModePreference)
              }}
            />
          }
        />
        <SettingsRow
          label="Density"
          description="Space and control sizes. Never the type scale."
          control={
            <Select
              options={DENSITY_OPTIONS}
              emptyOption="theme default"
              value={attributes.density}
              onChange={(value) => setDensityDefault(value as Density | null)}
            />
          }
        />
        <SettingsRow
          label="Motion"
          description="How much the interface moves. None is a full stop, not a slower version."
          control={
            <Select
              options={MOTION_OPTIONS}
              value={attributes.motion ?? 'standard'}
              onChange={(value) => setMotionTemperament((value ?? 'standard') as MotionTemperament)}
            />
          }
        />
      </SettingsRow.Group>

      <SettingsRow.Group title="Notifications">
        <SettingsRow
          label="Daily digest"
          description="One summary each morning instead of a notification per reply."
          control={
            <Switch
              checked={digest}
              onCheckedChange={(next) => {
                setDigest(next)
                // Settings apply immediately and report failure by toast. That law distinguishes a
                // settings screen from a form without a save button.
                toast.success(next ? 'Daily digest on' : 'Daily digest off')
              }}
            />
          }
        />
        <SettingsRow
          label="Append my signature"
          description="Added to the end of every reply you send."
          control={
            <Checkbox checked={signature} onCheckedChange={(next) => setSignature(next === true)} />
          }
        />
      </SettingsRow.Group>
    </SettingsArchetype>
  )
}
