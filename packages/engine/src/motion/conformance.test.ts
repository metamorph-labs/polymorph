import {
  composeTheme,
  MOTION_TEMPERAMENTS,
  parsePalette,
  parseSystem,
  resolveTheme,
} from '@polymorph/theme'
import { describe, expect, it } from 'vitest'

import amethyst from '../../../../design/palettes/amethyst.json' with { type: 'json' }
import petrol from '../../../../design/palettes/petrol.json' with { type: 'json' }
import pastel from '../../../../design/systems/pastel.json' with { type: 'json' }
import terminal from '../../../../design/systems/terminal.json' with { type: 'json' }
import { MOTION_VALUES, type SpringRole } from './values'

/**
 * Checks that the two halves of the motion system agree.
 *
 * `@polymorph/theme` derives the motion **tokens** and does not read
 * `design/motion/motion.json`. It has no design-directory imports, so the
 * engine can run in a build step. The motion engine reads the JSON for its
 * engine-side data. These tests keep the two sources on one set of numbers.
 *
 * The spec says which side is wrong in a disagreement: "if they ever disagree,
 * the JSON is wrong: fix it to match this doc's tables". A failure here is
 * fixed in the JSON, not in the tokens.
 */

/** Each system with its own default palette. Motion is an axis, so the palette is irrelevant. */
const motionOf = (system: unknown, palette: unknown) =>
  resolveTheme(composeTheme(parseSystem(system), parsePalette(palette))).tokens.motion

const THEMES = [
  { name: 'pastel', tokens: motionOf(pastel, amethyst) },
  { name: 'terminal', tokens: motionOf(terminal, petrol) },
]

const ms = (value: string) => Number.parseFloat(value)

describe('emitted tokens match motion.json', () => {
  it('scales every duration by the temperament the JSON names', () => {
    for (const { name, tokens } of THEMES) {
      for (const temperament of MOTION_TEMPERAMENTS) {
        const scale = MOTION_VALUES.temperaments[temperament].durationScale
        for (const [durationClass, base] of Object.entries(MOTION_VALUES.durationsMs)) {
          const label = `${name}/${temperament}/${durationClass}`
          expect(ms(tokens[temperament].duration[durationClass as 'control']), label).toBe(
            Math.round(base * scale),
          )
          expect(ms(tokens[temperament].duration[`${durationClass as 'control'}Exit`]), label).toBe(
            Math.round(base * MOTION_VALUES.exitRatio * scale),
          )
        }
      }
    }
  })

  it('emits the easing curves the JSON stores as beziers', () => {
    for (const { name, tokens } of THEMES) {
      for (const [role, points] of Object.entries(MOTION_VALUES.easings)) {
        expect(tokens.standard.easing[role as 'enter'], `${name}/${role}`).toBe(
          `cubic-bezier(${points.join(', ')})`,
        )
      }
    }
  })

  it('emits the per-temperament spring sets', () => {
    for (const { name, tokens } of THEMES) {
      for (const temperament of MOTION_TEMPERAMENTS) {
        const expected = MOTION_VALUES.springs[temperament]
        for (const role of Object.keys(expected) as SpringRole[]) {
          expect(tokens[temperament].spring[role], `${name}/${temperament}/${role}`).toEqual(
            expected[role],
          )
        }
      }
    }
  })

  it('emits the press scale, `1` at none', () => {
    for (const { name, tokens } of THEMES) {
      for (const temperament of MOTION_TEMPERAMENTS) {
        expect(Number(tokens[temperament].pressScale), `${name}/${temperament}`).toBe(
          MOTION_VALUES.temperaments[temperament].pressScale,
        )
      }
    }
  })

  it('emits ambient periods that scale inversely, and 0s at none', () => {
    for (const { name, tokens } of THEMES) {
      for (const temperament of MOTION_TEMPERAMENTS) {
        const scale = MOTION_VALUES.temperaments[temperament].durationScale
        for (const [role, base] of Object.entries(MOTION_VALUES.ambientPeriodsMs)) {
          const emitted = tokens[temperament].ambient[role as 'spin']
          const label = `${name}/${temperament}/${role}`
          if (scale === 0) expect(emitted, label).toBe('0s')
          else expect(ms(emitted), label).toBe(Math.round(base / scale))
        }
      }
    }
  })

  it('derives the same motion tokens for both presets, because motion is an axis', () => {
    // The presets differ, but the derivation must not. The same temperament
    // gives the same motion in any theme, because no motion value comes from
    // the seeds.
    const [first, second] = THEMES
    for (const temperament of MOTION_TEMPERAMENTS) {
      expect(first?.tokens[temperament], temperament).toEqual(second?.tokens[temperament])
    }
  })
})
