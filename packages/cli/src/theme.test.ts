import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { buildRegistry, type Registry } from '@polymorph/registry'
import { generateRamp, toHex } from '@polymorph/theme'
import { beforeAll, describe, expect, it } from 'vitest'

import { run } from './cli'
import type { HueReading } from './theme'

/**
 * `polymorph theme` for guest pairings, run the way a consumer runs it. A temp
 * directory stands in for their repository and holds two JSON documents they
 * wrote, and the test calls the CLI's own `run`. Nothing here names a
 * catalogue item. The registry is present only because `run` takes one, and
 * it is consulted only for the name-collision note.
 */

const ROOT = resolve(import.meta.dirname, '../../..')
let registry: Registry
let consumer: string

const GUEST_SYSTEM = {
  name: 'meridian-desk',
  axes: {
    geometry: 'soft',
    depth: 'elevated',
    density: 'comfortable',
    contrastTemperament: 'soft',
    typePersonality: 'humanist',
    colorStrategy: 'tinted',
    motionTemperament: 'standard',
    ornament: 'minimal',
  },
  fonts: {
    body: { family: 'Public Sans Variable' },
    display: { family: 'Fraunces Variable' },
    mono: { family: 'IBM Plex Mono' },
  },
  defaultPalette: 'meridian-moss',
  defaultMode: 'light',
}

const GUEST_PALETTE = {
  name: 'meridian-moss',
  accentHue: 142,
  neutralTint: 0.012,
  chromaBudget: 'medium',
}

// A full ts-morph registry build takes seconds alone, but exceeds the 10s
// default hook timeout when the whole suite's workers saturate the machine.
// `member-slug.test.ts` allows for the same contention. The timeout is sized for
// the contention, not for the work.
beforeAll(() => {
  registry = buildRegistry(ROOT)
  consumer = mkdtempSync(join(tmpdir(), 'polymorph-guest-'))
  writeFileSync(join(consumer, 'system.json'), JSON.stringify(GUEST_SYSTEM))
  writeFileSync(join(consumer, 'palette.json'), JSON.stringify(GUEST_PALETTE))
  writeFileSync(join(consumer, 'broken.json'), JSON.stringify({ ...GUEST_PALETTE, neutralTint: 9 }))
  writeFileSync(join(consumer, 'not-json.json'), '{ definitely not')
}, 60_000)

function themed(args: string[]): { code: number; lines: string[] } {
  const lines: string[] = []
  const { code } = run(
    { root: consumer, source: ROOT, registry, out: (line) => lines.push(line) },
    ['theme', ...args],
  )
  return { code, lines }
}

describe('validate', () => {
  it('reports a lawful pairing with its install list and its exemptions', () => {
    const { code, lines } = themed(['validate', 'system.json', 'palette.json'])
    expect(code).toBe(0)
    const text = lines.join('\n')
    expect(text).toContain('lawful — meridian-desk/meridian-moss')
    expect(text).toContain('install @fontsource-variable/public-sans')
    expect(text).toContain('install @fontsource/ibm-plex-mono')
    expect(text).toContain('chart cap')
    expect(text).toContain('catalogue law')
  })

  it('reports an unlawful pairing with the law named, and exits 1', () => {
    const { code, lines } = themed(['validate', 'system.json', 'broken.json'])
    expect(code).toBe(1)
    expect(lines[0]).toContain('unlawful')
    expect(lines.join('\n')).toContain('[schema] palette.neutralTint')
  })

  it('reports a name collision with the shipped catalogue as a note, not a fault', () => {
    writeFileSync(
      join(consumer, 'shadowing.json'),
      JSON.stringify({ ...GUEST_SYSTEM, name: 'plain', defaultPalette: 'meridian-moss' }),
    )
    const { code, lines } = themed(['validate', 'shadowing.json', 'palette.json'])
    expect(code).toBe(0)
    expect(lines.join('\n')).toContain('"plain" is also a shipped system')
  })

  it('reports a missing or unparseable file as a line, not a stack trace', () => {
    expect(themed(['validate', 'absent.json', 'palette.json']).code).toBe(1)
    const { code, lines } = themed(['validate', 'not-json.json', 'palette.json'])
    expect(code).toBe(1)
    expect(lines[0]).toContain('not-json.json is not JSON')
  })
})

describe('emit', () => {
  it('writes the sheet with a banner saying it is not an install path', () => {
    const { code, lines } = themed(['emit', 'system.json', 'palette.json', '--out', 'guest.css'])
    expect(code).toBe(0)
    expect(lines[0]).toContain('wrote guest.css')
    const css = readFileSync(join(consumer, 'guest.css'), 'utf8')
    expect(css).toContain('never an install path')
    expect(css).toContain('[data-system="meridian-desk"][data-palette="meridian-moss"]')
  })

  it('refuses to emit an unlawful pairing and points at validate', () => {
    const { code, lines } = themed(['emit', 'system.json', 'broken.json'])
    expect(code).toBe(1)
    expect(lines[0]).toContain('`validate` has the report')
  })
})

describe('a palette’s more-contrast partner', () => {
  const STRONG = { ...GUEST_PALETTE, name: 'meridian-moss-strong', chromaBudget: 'high' }
  const NAMING = { ...GUEST_PALETTE, moreContrast: 'meridian-moss-strong' }
  const QUERY = '@media (prefers-contrast: more), (forced-colors: active)'

  beforeAll(() => {
    for (const dir of ['beside', 'alone']) mkdirSync(join(consumer, dir), { recursive: true })
    writeFileSync(join(consumer, 'beside/naming.json'), JSON.stringify(NAMING))
    writeFileSync(join(consumer, 'beside/meridian-moss-strong.json'), JSON.stringify(STRONG))
    writeFileSync(join(consumer, 'alone/naming.json'), JSON.stringify(NAMING))
    writeFileSync(join(consumer, 'strong.json'), JSON.stringify(STRONG))
  })

  it('reads the partner from the file named for it beside the palette', () => {
    const { code, lines } = themed(['validate', 'system.json', 'beside/naming.json'])
    expect(code).toBe(0)
    expect(lines.join('\n')).toContain('meridian-moss-strong under prefers-contrast: more')
    const emitted = themed(['emit', 'system.json', 'beside/naming.json', '--out', 'beside.css'])
    expect(emitted.code).toBe(0)
    expect(readFileSync(join(consumer, 'beside.css'), 'utf8')).toContain(QUERY)
  })

  it('reads the partner from a third path', () => {
    const emitted = themed([
      'emit',
      'system.json',
      'alone/naming.json',
      'strong.json',
      '--out',
      'third.css',
    ])
    expect(emitted.code).toBe(0)
    expect(readFileSync(join(consumer, 'third.css'), 'utf8')).toContain(QUERY)
  })

  it('refuses a palette whose partner it cannot find, and says where it looks', () => {
    for (const verb of ['validate', 'emit']) {
      const { code, lines } = themed([verb, 'system.json', 'alone/naming.json'])
      expect(code, verb).toBe(1)
      const text = lines.join('\n')
      expect(text, verb).toContain(
        '[schema] moreContrast: "meridian-moss" names "meridian-moss-strong"',
      )
      expect(text, verb).toContain('pass meridian-moss-strong.json as a third path')
    }
  })
})

describe('schema', () => {
  it('writes an editor-ready JSON Schema for each document', () => {
    for (const which of ['system', 'palette'] as const) {
      const { code } = themed(['schema', which, '--out', `${which}.schema.json`])
      expect(code).toBe(0)
      const parsed = JSON.parse(readFileSync(join(consumer, `${which}.schema.json`), 'utf8')) as {
        properties: Record<string, unknown>
      }
      expect(Object.keys(parsed.properties)).toContain('name')
    }
  })

  it('asks which document when neither is named', () => {
    const { code, lines } = themed(['schema'])
    expect(code).toBe(1)
    expect(lines[0]).toContain('`system` or `palette`')
  })
})

describe('hue', () => {
  const reading = (colour: string): HueReading => {
    const { code, lines } = themed(['hue', colour, '--json'])
    expect(code, colour).toBe(0)
    return JSON.parse(lines.join('\n')) as HueReading
  }

  it('prints a colour in OKLCH, and the accentHue a palette takes from it', () => {
    const { code, lines } = themed(['hue', '#1F4FD8'])
    expect(code).toBe(0)
    expect(lines).toEqual([
      '#1F4FD8 is oklch(0.491 0.216 264.5): lightness 0.491, chroma 0.216, hue 264.5°.',
      'A palette takes the hue as "accentHue": 265, in whole degrees.',
    ])
    expect(reading('#1F4FD8')).toEqual({
      color: '#1F4FD8',
      l: 0.491,
      c: 0.216,
      h: 264.5,
      accentHue: 265,
    })
    // CSS Color 4's own example: red is oklch(62.8% 0.2577 29.23).
    expect(reading('#ff0000')).toMatchObject({ l: 0.628, c: 0.258, h: 29.2, accentHue: 29 })
  })

  it('reads back the hue of every colour the engine derives, to the degree', () => {
    // The engine writes a ramp step as hex (`toHex`); the reading of that hex
    // is the step's hue, within what 8-bit channels can tell apart.
    for (const seed of [0, 45, 142, 264.5, 330]) {
      for (const step of [9, 10, 11] as const) {
        const color = generateRamp(seed, 0.15, 'light')[step]
        const answer = reading(toHex(color))
        expect(Math.abs((((answer.h ?? 0) - color.h + 540) % 360) - 180), `${seed}`).toBeLessThan(1)
        expect(Math.abs(answer.l - color.l)).toBeLessThan(0.005)
      }
    }
  })

  it('gives a grey no hue, and says what a palette with no hue does', () => {
    // Equal channels have no chroma, and OKLCH leaves the hue of no chroma
    // undefined: any number here would be noise, not a hue a palette could seed.
    expect(reading('#808080')).toEqual({ color: '#808080', l: 0.6, c: 0, h: null, accentHue: null })
    const { code, lines } = themed(['hue', '#808080'])
    expect(code).toBe(0)
    expect(lines.join('\n')).toContain('no hue')
    expect(lines.join('\n')).toContain('"chromaBudget" is "none"')
  })

  it('refuses text that is not a colour as a palette writes one, and names the forms', () => {
    for (const colour of ['#123', '#12345g', 'blue', 'rgb(31, 79, 216)']) {
      const { code, lines } = themed(['hue', colour])
      expect(code, colour).toBe(1)
      expect(lines[0], colour).toContain('`#rrggbb`')
    }
    const json = themed(['hue', 'blue', '--json'])
    expect(json.code).toBe(1)
    expect(JSON.parse(json.lines.join('\n'))).toEqual({ error: expect.stringContaining('blue') })
    expect(themed(['hue']).code).toBe(1)
    expect(themed(['hue', '#1F4FD8', '#808080']).code).toBe(1)
  })
})
