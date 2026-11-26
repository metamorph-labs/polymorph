import { systemPrefersDark } from '@polymorph/theme'
import { Button, Inline, SegmentedControl, Select, Stack } from '@polymorph/react-ui'
import { useEffect, useState } from 'react'
import { DESIGNED_SYSTEMS } from 'virtual:polymorph-docs/counts'

import { loadSystemFonts } from '../fonts'
import { Stage } from '../harness/Stage'
import { ensurePairing, findSystem, PALETTES } from '../themes'
import { DemoScreen } from './DemoScreen'

type Mode = 'light' | 'dark'

/** The designed systems. A guest system is a product's own and is not offered here. */
const SYSTEMS = DESIGNED_SYSTEMS

const PALETTE_OPTIONS = PALETTES.map((palette) => ({ value: palette.name, label: palette.name }))

const MODES = [
  { value: 'light', label: 'Light', icon: 'mode-light' },
  { value: 'dark', label: 'Dark', icon: 'mode-dark' },
] as const

/** The system the stage opens in: a serif display face and a teal accent, far from the page's own. */
const FIRST = SYSTEMS.includes('dew') ? 'dew' : (SYSTEMS[0] as string)

/** The mode a system opens in for someone who has not chosen one: its own, or the device's. */
function homeMode(system: string): Mode {
  const mode = findSystem(system).defaultMode
  if (mode === 'system') return systemPrefersDark() ? 'dark' : 'light'
  return mode
}

/**
 * The stage and its three controls: a system, a palette and a mode.
 *
 * The stage is a nested pairing scope, so its pairing is this component's state
 * and never touches the document's. Two things a document-level change gets for
 * free are done here by hand, because no attribute on `<html>` announces a
 * nested scope: the pairing's CSS is ensured before the scope names it, and the
 * system's fonts are loaded.
 */
export function LookPicker() {
  const [system, setSystem] = useState(FIRST)
  const [palette, setPalette] = useState(() => findSystem(FIRST).defaultPalette)
  const [mode, setMode] = useState<Mode>(() => homeMode(FIRST))

  useEffect(() => {
    loadSystemFonts(system)
  }, [system])

  const show = (nextSystem: string, nextPalette: string) => {
    // Before the state changes, so the scope never names a pair no block matches.
    ensurePairing(nextSystem, nextPalette)
    setSystem(nextSystem)
    setPalette(nextPalette)
  }

  return (
    <Stack gap={5}>
      {/* A named group, so the row of buttons is announced as one choice. */}
      <div role="group" aria-label="Look">
        <Inline gap={2} wrap>
          {SYSTEMS.map((name) => {
            // A system brings its own palette and mode, as it does for a whole
            // product. The reader can change either afterwards.
            const choose = () => {
              show(name, findSystem(name).defaultPalette)
              setMode(homeMode(name))
            }
            // Two elements, not one with computed props: Button's variant and
            // tone are typed as lawful pairs, and a computed pair is not one.
            return name === system ? (
              <Button key={name} variant="soft" tone="accent" size="sm" label={name} pressed />
            ) : (
              <Button
                key={name}
                variant="ghost"
                tone="neutral"
                size="sm"
                label={name}
                pressed={false}
                onClick={choose}
              />
            )
          })}
        </Inline>
      </div>
      <Inline gap={3} wrap align="center">
        <Select
          aria-label="Palette"
          size="sm"
          options={PALETTE_OPTIONS}
          value={palette}
          onChange={(next) => {
            if (next !== null) show(system, next)
          }}
        />
        <SegmentedControl
          label="Light or dark"
          size="sm"
          options={[...MODES]}
          value={mode}
          onChange={(next) => {
            setMode(next as Mode)
          }}
        />
      </Inline>
      <Stage system={system} palette={palette} mode={mode}>
        <DemoScreen />
      </Stage>
    </Stack>
  )
}
