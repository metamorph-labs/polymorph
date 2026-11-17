/**
 * The studio's parse error format.
 *
 * Designers read refusals, so the studio formats them the same way everywhere: `path: message`,
 * one line per issue, using the schema's message. Zod 4's `error.message` is the issue array as
 * JSON, a multi-line dump with brackets, codes and `expected`/`received` keys, and must not reach
 * the paste box. These tests pin the format for the two ways a document arrives: a paste, and a
 * stored draft the current schema refuses.
 */

import { describe, expect, it } from 'vitest'

import { SYSTEMS, PALETTES } from '../themes'
import { importDraft, refusalFaults, serializeDraft } from './draft'

const system = SYSTEMS[0]!
const palette =
  PALETTES.find((candidate) => candidate.name === system.defaultPalette) ?? PALETTES[0]!

const pair = (patch: { system?: unknown; palette?: unknown } = {}) =>
  JSON.stringify({ system, palette, ...patch }, null, 2)

describe('the paste box', () => {
  it('accepts a pair the schemas accept', () => {
    const result = importDraft(serializeDraft({ system, palette }))
    expect(result.error).toBeNull()
    expect(result.draft?.system.name).toBe(system.name)
  })

  it('says `path: message` rather than printing a ZodError', () => {
    const result = importDraft(
      pair({ system: { ...system, axes: { ...system.axes, geometry: 'wobbly' } } }),
    )

    expect(result.draft).toBeNull()
    const error = result.error ?? ''
    expect(error.startsWith('['), `a raw issue dump leaked: ${error}`).toBe(false)
    expect(error).toMatch(/^system\.axes\.geometry: \S/)
  })

  it('names the half, system or palette, that a fault came from', () => {
    const result = importDraft(pair({ palette: { ...palette, accentHue: 400 } }))

    expect(result.error).toMatch(/^palette\.accentHue: \S/)
  })

  it('reports a missing system half at the `system` path', () => {
    const result = importDraft(JSON.stringify({ palette }))

    expect(result.error).toMatch(/^system: \S/)
  })
})

describe('a stored draft this schema refuses', () => {
  it('returns the issues that refused it', () => {
    const faults = refusalFaults(pair({ system: { ...system, vibe: 'loud' } }))

    expect(faults).toHaveLength(1)
    // An unrecognised key is reported against the object that refused it, so the path is the
    // half's name: `system: Unrecognized key: "vibe"`.
    expect(faults[0]).toMatch(/^system: \S/)
    expect(faults[0]).toContain('vibe')
  })

  it('reports a document that is not JSON with the parser message', () => {
    const faults = refusalFaults('{"system":')

    expect(faults).toHaveLength(1)
    expect(faults[0]?.startsWith('[')).toBe(false)
    expect(faults[0]?.length).toBeGreaterThan(0)
  })
})
