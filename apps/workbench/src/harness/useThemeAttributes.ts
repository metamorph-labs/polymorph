import { DATA_ATTRS, type Density, type Mode, type MotionTemperament } from '@polymorph/react'
import { useMemo, useSyncExternalStore } from 'react'

/**
 * Reads the scope attributes from `<html>`.
 *
 * This is a subscription, not context. Switching a pairing sets two attributes. Only components
 * that call this hook re-render. The callers are the harness pages that inspect the system
 * (toolbar, token gallery, component detail, mood board) and Relay's `RelayApp` and
 * `SettingsPage`. Members never call it.
 */

const WATCHED = [
  DATA_ATTRS.system,
  DATA_ATTRS.palette,
  DATA_ATTRS.mode,
  DATA_ATTRS.density,
  DATA_ATTRS.motion,
]

function subscribe(listener: () => void): () => void {
  const observer = new MutationObserver(listener)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: WATCHED })
  return () => observer.disconnect()
}

/** A string, so `useSyncExternalStore` sees a stable snapshot between renders. */
function snapshot(): string {
  const element = document.documentElement
  return WATCHED.map((attr) => element.getAttribute(attr) ?? '').join('|')
}

export interface ThemeAttributes {
  system: string
  palette: string
  mode: Mode
  density: Density | null
  motion: MotionTemperament | null
}

export function useThemeAttributes(): ThemeAttributes {
  const raw = useSyncExternalStore(subscribe, snapshot, () => '||||')

  return useMemo(() => {
    const [system = '', palette = '', mode = '', density = '', motion = ''] = raw.split('|')
    return {
      system,
      palette,
      mode: mode === 'dark' ? 'dark' : 'light',
      density: (density || null) as Density | null,
      motion: (motion || null) as MotionTemperament | null,
    }
  }, [raw])
}
