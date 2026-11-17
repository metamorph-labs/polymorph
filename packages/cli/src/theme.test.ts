import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { buildRegistry, type Registry } from '@polymorph/registry'
import { beforeAll, describe, expect, it } from 'vitest'

import { run } from './cli'

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
