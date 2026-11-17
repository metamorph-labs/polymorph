/**
 * @vitest-environment jsdom
 *
 * One of the few `logic` files that requests a DOM. The runtime writes data
 * attributes on `documentElement`, uses `localStorage`, and appends to `head`,
 * so its `typeof document === 'undefined'` guards only matter with a document.
 * In `node` this file would pass silently through all six guards and test
 * nothing, which is worse than failing.
 */

import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  appendThemeCSS,
  getMode,
  getModePreference,
  getPalette,
  getSystem,
  hasPairingCSS,
  hydrateTheme,
  installThemeCSS,
  PREPAINT_SCRIPT,
  readMode,
  SERVER_MODE,
  setDensityDefault,
  setMode,
  setMotionTemperament,
  setPalette,
  setSystem,
  STORAGE_KEYS,
  teardownTheme,
  watchMode,
  type InstalledCatalogue,
} from './runtime'

const html = () => document.documentElement

/** The legacy single key, written out instead of imported because nothing writes it. */
const LEGACY_KEY = 'pm-theme'

const ATTRS = ['data-system', 'data-palette', 'data-mode', 'data-density', 'data-motion']

/** What the page has CSS for, which hydration validates stored names against. */
const INSTALLED: InstalledCatalogue = {
  systems: { pastel: 'amethyst', terminal: 'petrol' },
  palettes: ['amethyst', 'petrol', 'orchid'],
}

beforeEach(() => {
  // The logic project shares modules between files, so a preference another file applied is
  // forgotten here as well as after each test.
  teardownTheme()
  localStorage.clear()
  for (const attr of ATTRS) html().removeAttribute(attr)
  document.head.replaceChildren()
})

afterEach(() => {
  teardownTheme()
  vi.unstubAllGlobals()
})

describe('setSystem / setPalette', () => {
  it('sets each attribute and persists each choice', () => {
    setSystem('terminal')
    setPalette('orchid')

    expect(html().getAttribute('data-system')).toBe('terminal')
    expect(html().getAttribute('data-palette')).toBe('orchid')
    expect(localStorage.getItem(STORAGE_KEYS.system)).toBe('terminal')
    expect(localStorage.getItem(STORAGE_KEYS.palette)).toBe('orchid')
    expect(getSystem()).toBe('terminal')
    expect(getPalette()).toBe('orchid')
  })

  it('changes one half without changing the other, so a cross-pairing is two calls', () => {
    setSystem('pastel')
    setPalette('petrol')
    setSystem('terminal')

    expect(html().getAttribute('data-palette')).toBe('petrol')
    expect(localStorage.getItem(STORAGE_KEYS.palette)).toBe('petrol')
  })
})

describe('setMode', () => {
  it('applies an explicit mode directly', () => {
    setMode('dark')
    expect(html().getAttribute('data-mode')).toBe('dark')
    expect(getMode()).toBe('dark')
    expect(getModePreference()).toBe('dark')
  })

  it('stores `system` as a preference but paints a concrete mode', () => {
    stubMatchMedia(true)
    setMode('system')
    expect(getModePreference()).toBe('system')
    expect(html().getAttribute('data-mode')).toBe('dark')
  })

  it('follows the OS when the preference is system', () => {
    const media = stubMatchMedia(false)
    setMode('system')
    expect(html().getAttribute('data-mode')).toBe('light')

    media.matches = true
    media.emit()
    expect(html().getAttribute('data-mode')).toBe('dark')
  })

  it('stops following the OS once an explicit mode is chosen', () => {
    const media = stubMatchMedia(false)
    setMode('system')
    setMode('light')

    media.matches = true
    media.emit()
    expect(html().getAttribute('data-mode')).toBe('light')
  })

  it('defaults to system when nothing is stored', () => {
    expect(getModePreference()).toBe('system')
  })

  it('reads the stored preference before any call, as the pre-paint script applied it', () => {
    localStorage.setItem(STORAGE_KEYS.mode, 'dark')
    expect(getModePreference()).toBe('dark')
  })

  it('keeps the preference it applied when storage refuses the write', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('The quota has been exceeded.', 'QuotaExceededError')
    })
    try {
      setMode('dark')
      expect(getModePreference()).toBe('dark')
      expect(localStorage.getItem(STORAGE_KEYS.mode)).toBeNull()
    } finally {
      vi.restoreAllMocks()
    }
  })

  it('keeps the preference this document wears when another tab stores another', () => {
    setMode('light')
    localStorage.setItem(STORAGE_KEYS.mode, 'dark')
    expect(getModePreference()).toBe('light')
    expect(getMode()).toBe('light')
  })
})

describe('readMode / watchMode', () => {
  it('reads the preference and the applied mode together', () => {
    const media = stubMatchMedia(true)
    setMode('system')
    expect(readMode()).toEqual({ preference: 'system', mode: 'dark' })

    media.matches = false
    media.emit()
    expect(readMode()).toEqual({ preference: 'system', mode: 'light' })
  })

  it('returns the same reading until the preference or the mode changes', () => {
    setMode('dark')
    const first = readMode()
    expect(readMode()).toBe(first)
    setMode('dark')
    expect(readMode()).toBe(first)
    setMode('light')
    expect(readMode()).not.toBe(first)
  })

  it('reads system and light where nothing is stored or applied', () => {
    expect(readMode()).toEqual(SERVER_MODE)
    expect(SERVER_MODE).toEqual({ preference: 'system', mode: 'light' })
  })

  it('calls a listener after each setMode, with the reading already new', () => {
    const seen: string[] = []
    const release = watchMode(() => seen.push(`${readMode().preference}/${readMode().mode}`))
    try {
      setMode('dark')
      setMode('light')
      expect(seen).toEqual(['dark/dark', 'light/light'])
    } finally {
      release()
    }
  })

  it('calls a listener when the OS changes while system is applied, and not after', () => {
    const media = stubMatchMedia(false)
    setMode('system')
    const listener = vi.fn()
    const release = watchMode(listener)
    try {
      media.matches = true
      media.emit()
      expect(listener).toHaveBeenCalledTimes(1)
      expect(readMode()).toEqual({ preference: 'system', mode: 'dark' })

      setMode('light')
      listener.mockClear()
      media.emit()
      expect(listener).not.toHaveBeenCalled()
    } finally {
      release()
    }
  })

  it('stops calling a listener once it is released', () => {
    const listener = vi.fn()
    watchMode(listener)()
    setMode('dark')
    expect(listener).not.toHaveBeenCalled()
  })

  it('hears the mode hydration applies', () => {
    localStorage.setItem(STORAGE_KEYS.mode, 'dark')
    const listener = vi.fn()
    const release = watchMode(listener)
    try {
      hydrateTheme('pastel', INSTALLED)
      expect(listener).toHaveBeenCalled()
      expect(readMode()).toEqual({ preference: 'dark', mode: 'dark' })
    } finally {
      release()
    }
  })
})

describe('scope overrides', () => {
  it('sets and clears the density default', () => {
    setDensityDefault('compact')
    expect(html().getAttribute('data-density')).toBe('compact')
    setDensityDefault(null)
    expect(html().hasAttribute('data-density')).toBe(false)
    expect(localStorage.getItem(STORAGE_KEYS.density)).toBeNull()
  })

  it('sets and clears the motion temperament', () => {
    setMotionTemperament('none')
    expect(html().getAttribute('data-motion')).toBe('none')
    setMotionTemperament(null)
    expect(html().hasAttribute('data-motion')).toBe(false)
  })
})

describe('appendThemeCSS', () => {
  const BLOCK = '[data-system="pastel"][data-palette="petrol"] { --pm-bg-app: #fff; }'

  it('installs a pairing block once per pair id', () => {
    expect(hasPairingCSS('pastel/petrol')).toBe(false)

    appendThemeCSS(BLOCK, 'pastel/petrol')
    appendThemeCSS(BLOCK, 'pastel/petrol')

    expect(hasPairingCSS('pastel/petrol')).toBe(true)
    expect(document.querySelectorAll('style[data-pm-pairing]')).toHaveLength(1)
  })

  it('keeps pairings apart by id', () => {
    appendThemeCSS(BLOCK, 'pastel/petrol')
    appendThemeCSS(BLOCK, 'terminal/amethyst')

    expect(document.querySelectorAll('style[data-pm-pairing]')).toHaveLength(2)
    expect(hasPairingCSS('terminal/amethyst')).toBe(true)
    expect(hasPairingCSS('terminal/orchid')).toBe(false)
  })

  it('inserts next to the eager sheet, not after the application’s styles', () => {
    // The eager sheet is prepended so app CSS overrides it. Appended at the end
    // of <head>, a lazy pairing would override app CSS instead.
    const appStyles = document.createElement('link')
    appStyles.rel = 'stylesheet'
    document.head.append(appStyles)

    installThemeCSS('[data-system="pastel"][data-palette="amethyst"] { --pm-bg-app: #eee; }')
    appendThemeCSS(BLOCK, 'pastel/petrol')

    const base = document.getElementById('pm-themes')
    expect(base?.nextSibling).toBe(document.querySelector('style[data-pm-pairing]'))
    expect(document.head.lastChild).toBe(appStyles)
  })
})

describe('hydrateTheme', () => {
  it('re-applies the stored pairing and re-attaches the OS listener', () => {
    const media = stubMatchMedia(false)
    localStorage.setItem(STORAGE_KEYS.system, 'terminal')
    localStorage.setItem(STORAGE_KEYS.palette, 'orchid')
    localStorage.setItem(STORAGE_KEYS.density, 'comfortable')
    localStorage.setItem(STORAGE_KEYS.motion, 'expressive')

    hydrateTheme('pastel', INSTALLED)

    expect(html().getAttribute('data-system')).toBe('terminal')
    expect(html().getAttribute('data-palette')).toBe('orchid')
    expect(html().getAttribute('data-density')).toBe('comfortable')
    expect(html().getAttribute('data-motion')).toBe('expressive')

    // The pre-paint script cannot subscribe, so hydration does.
    media.matches = true
    media.emit()
    expect(html().getAttribute('data-mode')).toBe('dark')
  })

  it('falls back to the given system, with that system’s default palette', () => {
    stubMatchMedia(false)
    hydrateTheme('terminal', INSTALLED)

    expect(html().getAttribute('data-system')).toBe('terminal')
    expect(html().getAttribute('data-palette')).toBe('petrol')
    // A fallback is not a preference, so a later default change reaches them.
    expect(localStorage.getItem(STORAGE_KEYS.system)).toBeNull()
    expect(localStorage.getItem(STORAGE_KEYS.palette)).toBeNull()
  })

  it('gives a stored system without a stored palette that system’s default', () => {
    stubMatchMedia(false)
    localStorage.setItem(STORAGE_KEYS.system, 'terminal')

    hydrateTheme('pastel', INSTALLED)

    expect(html().getAttribute('data-system')).toBe('terminal')
    expect(html().getAttribute('data-palette')).toBe('petrol')
  })

  it('falls back completely and clears the pairing when the stored system is missing', () => {
    stubMatchMedia(false)
    localStorage.setItem(STORAGE_KEYS.system, 'ghost')
    localStorage.setItem(STORAGE_KEYS.palette, 'petrol')

    hydrateTheme('pastel', INSTALLED)

    expect(html().getAttribute('data-system')).toBe('pastel')
    // Not `petrol`, which was chosen for a pairing that no longer exists.
    expect(html().getAttribute('data-palette')).toBe('amethyst')
    // Cleared, or the pre-paint script would reapply it on every load.
    expect(localStorage.getItem(STORAGE_KEYS.system)).toBeNull()
    expect(localStorage.getItem(STORAGE_KEYS.palette)).toBeNull()
  })

  it('replaces a stale palette with the current system’s default and keeps the system', () => {
    stubMatchMedia(false)
    localStorage.setItem(STORAGE_KEYS.system, 'terminal')
    localStorage.setItem(STORAGE_KEYS.palette, 'ghost')

    hydrateTheme('pastel', INSTALLED)

    expect(html().getAttribute('data-system')).toBe('terminal')
    expect(html().getAttribute('data-palette')).toBe('petrol')
    expect(localStorage.getItem(STORAGE_KEYS.system)).toBe('terminal')
    expect(localStorage.getItem(STORAGE_KEYS.palette)).toBeNull()
  })

  it('keeps a stored cross-pairing that is installed', () => {
    stubMatchMedia(false)
    localStorage.setItem(STORAGE_KEYS.system, 'terminal')
    localStorage.setItem(STORAGE_KEYS.palette, 'amethyst')

    hydrateTheme('pastel', INSTALLED)

    expect(html().getAttribute('data-system')).toBe('terminal')
    expect(html().getAttribute('data-palette')).toBe('amethyst')
    expect(localStorage.getItem(STORAGE_KEYS.palette)).toBe('amethyst')
  })

  it('drops both attributes when a stale name has no fallback to take its place', () => {
    stubMatchMedia(false)
    html().setAttribute('data-system', 'ghost')
    html().setAttribute('data-palette', 'petrol')
    localStorage.setItem(STORAGE_KEYS.system, 'ghost')

    hydrateTheme(undefined, INSTALLED)

    expect(html().hasAttribute('data-system')).toBe(false)
    expect(html().hasAttribute('data-palette')).toBe(false)
  })

  it('validates nothing when the installed catalogue is withheld', () => {
    stubMatchMedia(false)
    localStorage.setItem(STORAGE_KEYS.system, 'ghost')
    localStorage.setItem(STORAGE_KEYS.palette, 'phantom')

    hydrateTheme('pastel')

    expect(html().getAttribute('data-system')).toBe('ghost')
    expect(html().getAttribute('data-palette')).toBe('phantom')
    expect(localStorage.getItem(STORAGE_KEYS.system)).toBe('ghost')
  })
})

/**
 * The legacy key holds one name; a pairing stores two. Hydration migrates it
 * once, because the pre-paint script has no room. A legacy visitor sees the
 * fallback on the first reload and their choice after that.
 */
describe('hydrateTheme: the pm-theme migration', () => {
  it('reads the old name as a system and takes that system’s default palette', () => {
    stubMatchMedia(false)
    localStorage.setItem(LEGACY_KEY, 'terminal')

    hydrateTheme('pastel', INSTALLED)

    expect(html().getAttribute('data-system')).toBe('terminal')
    expect(html().getAttribute('data-palette')).toBe('petrol')
    expect(localStorage.getItem(STORAGE_KEYS.system)).toBe('terminal')
    expect(localStorage.getItem(STORAGE_KEYS.palette)).toBe('petrol')
    // Removed, or the migration runs on every load.
    expect(localStorage.getItem(LEGACY_KEY)).toBeNull()
  })

  it('leaves an already-migrated choice alone', () => {
    stubMatchMedia(false)
    localStorage.setItem(STORAGE_KEYS.system, 'terminal')
    localStorage.setItem(STORAGE_KEYS.palette, 'amethyst')
    localStorage.setItem(LEGACY_KEY, 'pastel')

    hydrateTheme('pastel', INSTALLED)

    expect(html().getAttribute('data-system')).toBe('terminal')
    expect(html().getAttribute('data-palette')).toBe('amethyst')
  })

  it('treats a legacy name that no longer exists as stale, not as a migration', () => {
    stubMatchMedia(false)
    localStorage.setItem(LEGACY_KEY, 'ghost')

    hydrateTheme('pastel', INSTALLED)

    expect(html().getAttribute('data-system')).toBe('pastel')
    expect(html().getAttribute('data-palette')).toBe('amethyst')
    expect(localStorage.getItem(STORAGE_KEYS.system)).toBeNull()
    expect(localStorage.getItem(LEGACY_KEY)).toBeNull()
  })

  it('keeps the legacy key when there is no catalogue to migrate against', () => {
    // Without the catalogue the migration cannot finish, so the key must stay.
    stubMatchMedia(false)
    localStorage.setItem(LEGACY_KEY, 'terminal')

    hydrateTheme('pastel')

    expect(localStorage.getItem(LEGACY_KEY)).toBe('terminal')
    expect(localStorage.getItem(STORAGE_KEYS.system)).toBeNull()
  })
})

describe('PREPAINT_SCRIPT', () => {
  it('stays under the 500-byte budget, because it blocks parsing', () => {
    expect(PREPAINT_SCRIPT.length).toBeLessThanOrEqual(500)
  })

  it('is built from the same keys and attributes the module writes', () => {
    for (const key of Object.values(STORAGE_KEYS)) {
      expect(PREPAINT_SCRIPT).toContain(key)
    }
    for (const attr of ATTRS) {
      expect(PREPAINT_SCRIPT).toContain(attr)
    }
  })

  it('resolves the pairing and mode before paint, and never throws', () => {
    stubMatchMedia(true)
    localStorage.setItem(STORAGE_KEYS.system, 'terminal')
    localStorage.setItem(STORAGE_KEYS.palette, 'orchid')
    localStorage.setItem(STORAGE_KEYS.mode, 'system')

    new Function(PREPAINT_SCRIPT)()

    expect(html().getAttribute('data-system')).toBe('terminal')
    expect(html().getAttribute('data-palette')).toBe('orchid')
    expect(html().getAttribute('data-mode')).toBe('dark')
  })

  it('ignores the legacy key, because hydration does the migration', () => {
    stubMatchMedia(false)
    localStorage.setItem(LEGACY_KEY, 'terminal')

    new Function(PREPAINT_SCRIPT)()

    expect(html().hasAttribute('data-system')).toBe(false)
    expect(PREPAINT_SCRIPT).not.toContain(LEGACY_KEY)
  })

  it('survives storage being unavailable', () => {
    stubMatchMedia(false)
    vi.stubGlobal('localStorage', {
      getItem() {
        throw new Error('SecurityError')
      },
    })
    expect(() => new Function(PREPAINT_SCRIPT)()).not.toThrow()
  })
})

describe('environment containment', () => {
  it('keeps every other module in the package free of DOM and node globals', () => {
    // The engine must run anywhere (build step, server, worker). Only
    // `runtime.ts` may use the DOM and only tests may use node. The tsconfig
    // allows both, so this test enforces it. `import.meta.url` is an http URL
    // under the Vite transform, so the walk starts from the workspace root.
    const dir = resolve(process.cwd(), 'packages/theme/src')
    const files = readdirSync(dir, { recursive: true, encoding: 'utf8' }).filter(
      (file) => file.endsWith('.ts') && !file.endsWith('.d.ts') && !file.includes('.test.'),
    )
    expect(files, 'source tree not found — did the vitest root move?').toContain('runtime.ts')

    const stripComments = (source: string) =>
      source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

    const domOffenders: string[] = []
    const nodeOffenders: string[] = []
    for (const file of files) {
      const source = stripComments(readFileSync(join(dir, file), 'utf8'))
      if (file !== 'runtime.ts' && /\b(document|window|localStorage|matchMedia)\b/.test(source)) {
        domOffenders.push(file)
      }
      if (/from ['"]node:/.test(source)) nodeOffenders.push(file)
    }
    expect(domOffenders, 'only runtime.ts may touch the DOM').toEqual([])
    expect(nodeOffenders, 'the engine must not depend on node').toEqual([])
  })
})

interface StubMedia {
  matches: boolean
  emit: () => void
}

function stubMatchMedia(matches: boolean): StubMedia {
  const listeners = new Set<() => void>()
  const media: StubMedia = {
    matches,
    emit: () => listeners.forEach((listener) => listener()),
  }
  vi.stubGlobal('matchMedia', () => ({
    get matches() {
      return media.matches
    },
    addEventListener: (_: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
  }))
  return media
}
