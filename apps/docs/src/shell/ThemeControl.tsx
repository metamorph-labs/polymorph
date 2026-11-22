import type { ModePreference } from '@polymorph/theme'
import { Button, FormField, ModeSwitch, Popover, Select, Stack } from '@polymorph/react-ui'

import { PALETTES, SYSTEMS } from '../themes'

const SYSTEM_OPTIONS = SYSTEMS.map((system) => ({ value: system.name, label: system.name }))
const PALETTE_OPTIONS = PALETTES.map((palette) => ({ value: palette.name, label: palette.name }))

interface ThemeControlProps {
  system: string
  palette: string
  onSystemChange: (name: string) => void
  onPaletteChange: (name: string) => void
  onModeChange: (mode: ModePreference) => void
}

/**
 * The site's pairing and mode, behind one button in the top bar.
 *
 * A pairing is two decisions and the mode is a third, so the panel holds three
 * controls. They sit in a Popover because three triggers in the bar leave a
 * phone no room for anything else, and a reader changes the pairing far less
 * often than they follow a link. The palette list holds every palette, not only
 * the system's own, so a cross-pairing can be chosen.
 */
export function ThemeControl({
  system,
  palette,
  onSystemChange,
  onPaletteChange,
  onModeChange,
}: ThemeControlProps) {
  return (
    <Popover
      label="Theme"
      align="end"
      trigger={<Button variant="ghost" tone="neutral" icon="droplet" iconOnly label="Theme" />}
    >
      <Stack gap={4}>
        <FormField label="System">
          <Select
            options={SYSTEM_OPTIONS}
            value={system}
            onChange={(next) => {
              if (next !== null) onSystemChange(next)
            }}
          />
        </FormField>
        <FormField label="Palette">
          <Select
            options={PALETTE_OPTIONS}
            value={palette}
            onChange={(next) => {
              if (next !== null) onPaletteChange(next)
            }}
          />
        </FormField>
        {/* Uncontrolled: it shows the document's stored preference and sets it,
            so the panel never holds a second answer to which mode the page
            wears. */}
        <ModeSwitch label="Appearance" onChange={onModeChange} />
      </Stack>
    </Popover>
  )
}
