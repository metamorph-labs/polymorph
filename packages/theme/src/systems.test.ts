import { describe, expect, it } from 'vitest'

import { TYPE_PERSONALITIES } from './axes'
import {
  EXAMPLE_PALETTES,
  EXAMPLE_SYSTEMS,
  exampleQuietSystem,
  exampleStarkSystem,
  exampleVioletPalette,
} from './examples'
import { seedsSchema } from './seeds'
import {
  composeTheme,
  pairId,
  paletteSchema,
  parsePalette,
  parseSystem,
  systemSchema,
} from './systems'

describe('system schema', () => {
  it('validates the example systems', () => {
    for (const system of EXAMPLE_SYSTEMS) {
      expect(systemSchema.safeParse(system).success, system.name).toBe(true)
    }
  })

  it('survives a JSON round-trip, because systems ship as JSON files', () => {
    for (const system of EXAMPLE_SYSTEMS) {
      expect(parseSystem(JSON.parse(JSON.stringify(system)))).toEqual(system)
    }
  })

  it('requires kebab-case names, since they become [data-system] values', () => {
    const named = (name: string) => systemSchema.safeParse({ ...exampleQuietSystem, name }).success
    expect(named('Example Quiet')).toBe(false)
    expect(named('example_quiet')).toBe(false)
    expect(named('1quiet')).toBe(false)
    expect(named('example-quiet-2')).toBe(true)
  })

  it('accepts system as a default mode', () => {
    expect(systemSchema.safeParse({ ...exampleQuietSystem, defaultMode: 'system' }).success).toBe(
      true,
    )
    expect(systemSchema.safeParse({ ...exampleQuietSystem, defaultMode: 'auto' }).success).toBe(
      false,
    )
  })

  it('rejects extra keys, because the colour seeds belong in a palette', () => {
    expect(systemSchema.safeParse({ ...exampleQuietSystem, accentHue: 200 }).success).toBe(false)
    expect(systemSchema.safeParse({ ...exampleQuietSystem, chromaBudget: 'high' }).success).toBe(
      false,
    )
  })

  it('holds a system to the divergence law unless it declares itself a tenant', () => {
    const { kind: _dropped, ...silent } = exampleQuietSystem
    expect(parseSystem(silent).kind).toBe('designed')
  })

  // Overrides change values, never names, and the scale's laws still apply to
  // the merged ladder.
  it('accepts a radius override, whole or partial', () => {
    const whole = { ...exampleQuietSystem, overrides: { radius: { sm: 2, md: 10, lg: 18 } } }
    const partial = { ...exampleQuietSystem, overrides: { radius: { md: 10 } } }
    expect(systemSchema.safeParse(whole).success).toBe(true)
    expect(parseSystem(partial).overrides?.radius?.md).toBe(10)
  })

  it('refuses a merged radius ladder that is not monotone', () => {
    // exampleQuietSystem's geometry supplies the other steps, so the only
    // failure is an `sm` larger than the derived `md`.
    const result = systemSchema.safeParse({
      ...exampleQuietSystem,
      overrides: { radius: { sm: 40 } },
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain('monotone')
    }
  })

  it('refuses an override on a scale that takes none', () => {
    const result = systemSchema.safeParse({
      ...exampleQuietSystem,
      overrides: { glow: { focus: 'none' } },
    })
    expect(result.success).toBe(false)
    // Shadow accepts only a throw, never per-step values.
    expect(
      systemSchema.safeParse({
        ...exampleQuietSystem,
        overrides: { shadow: { raised: 'none' } },
      }).success,
    ).toBe(false)
  })

  it('accepts space and control-height overrides, and holds their ladders', () => {
    expect(
      systemSchema.safeParse({
        ...exampleQuietSystem,
        overrides: { space: { 4: 14 }, controlHeight: { md: 40, lg: 44 } },
      }).success,
    ).toBe(true)

    // Step 0 is a meaning, not a size, so it cannot be overridden.
    expect(
      systemSchema.safeParse({ ...exampleQuietSystem, overrides: { space: { 0: 2 } } }).success,
    ).toBe(false)

    // A step set below the previous step breaks the ladder's order.
    const sunk = systemSchema.safeParse({
      ...exampleQuietSystem,
      overrides: { space: { 5: 6 } },
    })
    expect(sunk.success).toBe(false)
    if (!sunk.success) expect(sunk.error.issues[0]?.message).toContain('non-decreasing')
  })

  it('accepts an assignment override, and only onto real steps', () => {
    expect(
      systemSchema.safeParse({
        ...exampleQuietSystem,
        overrides: { assign: { radius: { control: 'pill' } } },
      }).success,
    ).toBe(true)
    // An assignment names a step, never a raw value; values belong to the
    // scale override.
    expect(
      systemSchema.safeParse({
        ...exampleQuietSystem,
        overrides: { assign: { radius: { control: 10 } } },
      }).success,
    ).toBe(false)
  })

  it('accepts shadow and inset assignments under the same discipline', () => {
    expect(
      systemSchema.safeParse({
        ...exampleQuietSystem,
        overrides: { assign: { shadow: { resting: 'overlay' }, inset: { surface: 4 } } },
      }).success,
    ).toBe(true)
    // A shadow assignment names a step of its own family, never another's.
    expect(
      systemSchema.safeParse({
        ...exampleQuietSystem,
        overrides: { assign: { shadow: { seat: 'lg' } } },
      }).success,
    ).toBe(false)
    // An inset names a step of the ladder. There are eleven.
    expect(
      systemSchema.safeParse({
        ...exampleQuietSystem,
        overrides: { assign: { inset: { list: 11 } } },
      }).success,
    ).toBe(false)
  })

  // Component exceptions: one class token, one named member, one step, with a
  // `because`. A rung of the exception ladder (`docs/rules.md`), as data, not
  // arbitrary per-component tokens.
  it('accepts a declared exception with one member, family, class, step and because', () => {
    const result = systemSchema.safeParse({
      ...exampleQuietSystem,
      overrides: {
        exceptions: [
          {
            component: 'button',
            family: 'radius',
            class: 'control',
            step: 'pill',
            because: 'the launch brand is capsule buttons; inputs stay on the class.',
          },
        ],
      },
    })
    expect(result.success).toBe(true)
  })

  it('refuses an exception without a because', () => {
    const silent = systemSchema.safeParse({
      ...exampleQuietSystem,
      overrides: {
        exceptions: [
          { component: 'button', family: 'radius', class: 'control', step: 'pill', because: ' ' },
        ],
      },
    })
    expect(silent.success).toBe(false)
    if (!silent.success) {
      expect(JSON.stringify(silent.error.issues)).toContain('because')
    }
  })

  it("refuses a step from another family, such as 'raised' for a radius", () => {
    expect(
      systemSchema.safeParse({
        ...exampleQuietSystem,
        overrides: {
          exceptions: [
            { component: 'card', family: 'radius', class: 'surface', step: 'raised', because: 'x' },
          ],
        },
      }).success,
    ).toBe(false)
    // `surface` is in two families, and the family decides: an inset `surface`
    // takes space steps, not radius names.
    expect(
      systemSchema.safeParse({
        ...exampleQuietSystem,
        overrides: {
          exceptions: [
            { component: 'card', family: 'inset', class: 'surface', step: 'lg', because: 'x' },
          ],
        },
      }).success,
    ).toBe(false)
    expect(
      systemSchema.safeParse({
        ...exampleQuietSystem,
        overrides: {
          exceptions: [
            { component: 'card', family: 'inset', class: 'surface', step: 7, because: 'roomier' },
          ],
        },
      }).success,
    ).toBe(true)
  })

  it('refuses two exceptions for the same member, family and class', () => {
    const twice = systemSchema.safeParse({
      ...exampleQuietSystem,
      overrides: {
        exceptions: [
          { component: 'button', family: 'radius', class: 'control', step: 'pill', because: 'a' },
          { component: 'button', family: 'radius', class: 'control', step: 'none', because: 'b' },
        ],
      },
    })
    expect(twice.success).toBe(false)
    if (!twice.success) {
      expect(twice.error.issues[0]?.message).toContain('button/radius/control')
    }
  })

  it('reports a duplicated decision once, whatever the count', () => {
    const exception = (step: string) => ({
      component: 'button',
      family: 'radius' as const,
      class: 'control' as const,
      step,
      because: step,
    })
    const thrice = systemSchema.safeParse({
      ...exampleQuietSystem,
      overrides: { exceptions: [exception('pill'), exception('none'), exception('sm')] },
    })

    expect(thrice.success).toBe(false)
    if (!thrice.success) {
      const duplicates = thrice.error.issues.filter((issue) =>
        issue.message.includes('one step per decision'),
      )
      // One duplicated decision, one issue, and no count in the message to get
      // wrong.
      expect(duplicates).toHaveLength(1)
      expect(duplicates[0]?.message).not.toContain('twice')
    }
  })

  it('refuses a component that is not a member slug', () => {
    expect(
      systemSchema.safeParse({
        ...exampleQuietSystem,
        overrides: {
          exceptions: [
            { component: 'Button', family: 'radius', class: 'control', step: 'pill', because: 'x' },
          ],
        },
      }).success,
    ).toBe(false)
  })

  // Three more overrides, each a single narrow setting.
  it('accepts the shadow throw, focus mark and type ratio overrides', () => {
    expect(
      systemSchema.safeParse({
        ...exampleQuietSystem,
        overrides: {
          shadow: { throw: 1.4 },
          focus: { width: 4, offset: 1 },
          type: { ratio: 1.3 },
        },
      }).success,
    ).toBe(true)
  })

  it('limits the shadow throw to 0.5–1.75', () => {
    const far = systemSchema.safeParse({
      ...exampleQuietSystem,
      overrides: { shadow: { throw: 2 } },
    })
    expect(far.success).toBe(false)
    expect(
      systemSchema.safeParse({ ...exampleQuietSystem, overrides: { shadow: { throw: 0.4 } } })
        .success,
    ).toBe(false)
  })

  it('holds the focus mark to the 2px floor of the softest temperament', () => {
    const thin = systemSchema.safeParse({
      ...exampleQuietSystem,
      overrides: { focus: { width: 1 } },
    })
    expect(thin.success).toBe(false)
    if (!thin.success) expect(JSON.stringify(thin.error.issues)).toContain('2px')
    expect(
      systemSchema.safeParse({ ...exampleQuietSystem, overrides: { focus: { offset: 5 } } })
        .success,
    ).toBe(false)
  })

  it('places the focus mark inside the edge at minus its width, or outside it at 0–4px', () => {
    const lawful = (focus: Record<string, number>, contrastTemperament = 'standard') =>
      systemSchema.safeParse({
        ...exampleQuietSystem,
        axes: { ...exampleQuietSystem.axes, contrastTemperament },
        overrides: { focus },
      }).success
    // The derived default stated in the file, at the temperament's width or the file's own.
    expect(lawful({ offset: -2 })).toBe(true)
    expect(lawful({ offset: -3 }, 'stark')).toBe(true)
    expect(lawful({ width: 4, offset: -4 })).toBe(true)
    // The mark moved back outside the control.
    for (const offset of [0, 1, 4]) expect(lawful({ offset }), String(offset)).toBe(true)
    expect(lawful({ width: 6, offset: 0 })).toBe(true)
    // Further in than the width: the mark floats inside the control with a gap.
    expect(lawful({ offset: -3 })).toBe(false)
    expect(lawful({ width: 3, offset: -4 })).toBe(false)
    // Between minus the width and 0: the mark lies across the edge, over the border a state
    // draws. The width judged is the merged one, so stark's -2px is refused where standard's
    // is the default.
    expect(lawful({ offset: -1 })).toBe(false)
    expect(lawful({ offset: -2 }, 'stark')).toBe(false)
    expect(lawful({ width: 4, offset: -2 })).toBe(false)
    // An offset alone is judged; a width alone always derives its own offset.
    expect(lawful({ width: 5 })).toBe(true)
  })

  /*
   * These messages appear in the studio's law panel next to the control that
   * caused them, in the style of `shadow.throw`'s "beyond that the layers stop
   * being one light" and `type.ratio`'s "steeper breaks the ladder's rhythm".
   * The three tests below pin the rest, keeping out zod's default
   * "Too big: expected number to be <=6", which means little to a designer.
   */
  const messageOf = (overrides: Record<string, unknown>): string => {
    const result = systemSchema.safeParse({ ...exampleQuietSystem, overrides })
    expect(result.success, JSON.stringify(overrides)).toBe(false)
    return result.success ? '' : (result.error.issues[0]?.message ?? '')
  }

  it('explains the focus mark width ceiling in plain words', () => {
    expect(messageOf({ focus: { width: 7 } })).toBe(
      'the focus mark stops at 6px — past that the mark outweighs the control it marks',
    )
  })

  it('explains the focus offset range in plain words', () => {
    expect(messageOf({ focus: { offset: 5 } })).toBe(
      'the focus mark stays within 4px outside the control — further out it stops reading as this control’s',
    )
    expect(messageOf({ focus: { offset: -7 } })).toBe(
      'the focus mark goes no further inside than its own width — 6px at the widest',
    )
  })

  it('explains an offset that does not fit the mark’s width, with the width it was judged at', () => {
    expect(messageOf({ focus: { offset: -1 } })).toBe(
      'focus offset -1px lays the 2px mark across the control’s edge — the mark sits inside ' +
        'the edge at -2px, minus its width, or outside it at 0–4px',
    )
    expect(messageOf({ focus: { width: 3, offset: -5 } })).toBe(
      'focus offset -5px floats the 3px mark inside the control, with a gap to its edge — the ' +
        'mark sits inside the edge at -3px, minus its width, or outside it at 0–4px',
    )
  })

  it('gives the same padding-step message wherever a space step is named', () => {
    expect(messageOf({ assign: { inset: { list: 11 } } })).toBe(
      'padding names a rung of the spacing ladder — the ladder ends at step 10',
    )
    expect(messageOf({ assign: { inset: { list: -1 } } })).toBe(
      'padding names a rung of the spacing ladder — the ladder starts at step 0',
    )
    // Exceptions use the same step schema, so they share the message.
    expect(
      messageOf({
        exceptions: [
          { component: 'card', family: 'inset', class: 'surface', step: 11, because: 'x' },
        ],
      }),
    ).toBe('padding names a rung of the spacing ladder — the ladder ends at step 10')
  })

  it('accepts the two type steps under the base, on the half-pixel grid', () => {
    expect(
      systemSchema.safeParse({ ...exampleQuietSystem, overrides: { type: { sm: 13, xs: 12 } } })
        .success,
    ).toBe(true)
    expect(
      systemSchema.safeParse({ ...exampleQuietSystem, overrides: { type: { sm: 13.25 } } }).success,
    ).toBe(false)
  })

  it('limits a type step to the 10px floor and the base', () => {
    expect(
      systemSchema.safeParse({ ...exampleQuietSystem, overrides: { type: { xs: 9.5 } } }).success,
    ).toBe(false)
    // Above the base: refused by the ladder's law, not the step's range.
    expect(
      systemSchema.safeParse({ ...exampleQuietSystem, overrides: { type: { sm: 16.5 } } }).success,
    ).toBe(false)
    // Equal to the base is lawful: controls and paragraphs may share a size.
    expect(
      systemSchema.safeParse({ ...exampleQuietSystem, overrides: { type: { sm: 16 } } }).success,
    ).toBe(true)
  })

  it('keeps the steps under the base in order, judging an unset step by the ratio', () => {
    // sm 11 sits under the xs the standard ratio derives (12.5).
    const inverted = systemSchema.safeParse({
      ...exampleQuietSystem,
      overrides: { type: { sm: 11 } },
    })
    expect(inverted.success).toBe(false)
    expect(inverted.error?.issues[0]?.message).toContain('monotone')
    // The same sm is lawful once xs is set under it.
    expect(
      systemSchema.safeParse({ ...exampleQuietSystem, overrides: { type: { sm: 11, xs: 10 } } })
        .success,
    ).toBe(true)
    // Equal steps are lawful, as on the space ladder.
    expect(
      systemSchema.safeParse({ ...exampleQuietSystem, overrides: { type: { sm: 12, xs: 12 } } })
        .success,
    ).toBe(true)
  })

  it('limits the type ratio to 1.125–1.4', () => {
    expect(
      systemSchema.safeParse({ ...exampleQuietSystem, overrides: { type: { ratio: 1.05 } } })
        .success,
    ).toBe(false)
    expect(
      systemSchema.safeParse({ ...exampleQuietSystem, overrides: { type: { ratio: 1.5 } } })
        .success,
    ).toBe(false)
  })

  it('holds controlHeight.sm to the WCAG 2.5.8 floor at compact density', () => {
    // A 26px base becomes 22px at the 0.85 compact multiplier after 2px
    // rounding: valid as a number, too small as a target.
    const result = systemSchema.safeParse({
      ...exampleQuietSystem,
      overrides: { controlHeight: { sm: 26, md: 36, lg: 40 } },
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain('WCAG 2.5.8')
    }
  })

  it('names the offending path when it throws', () => {
    expect(() => parseSystem({ ...exampleQuietSystem, defaultPalette: 'Not A Slug' })).toThrowError(
      /defaultPalette/,
    )
  })
})

describe('palette schema', () => {
  it('validates the example palettes', () => {
    for (const palette of EXAMPLE_PALETTES) {
      expect(paletteSchema.safeParse(palette).success, palette.name).toBe(true)
    }
  })

  it('survives a JSON round-trip', () => {
    for (const palette of EXAMPLE_PALETTES) {
      expect(parsePalette(JSON.parse(JSON.stringify(palette)))).toEqual(palette)
    }
  })

  it('requires kebab-case names, since they become [data-palette] values', () => {
    expect(paletteSchema.safeParse({ ...exampleVioletPalette, name: 'Violet' }).success).toBe(false)
  })

  it('rejects fonts and axes, because they belong to the system', () => {
    expect(
      paletteSchema.safeParse({ ...exampleVioletPalette, fonts: exampleQuietSystem.fonts }).success,
    ).toBe(false)
    expect(
      paletteSchema.safeParse({ ...exampleVioletPalette, axes: exampleQuietSystem.axes }).success,
    ).toBe(false)
  })

  it('enforces the hue range and the neutral tint cap, like the seeds schema', () => {
    expect(paletteSchema.safeParse({ ...exampleVioletPalette, accentHue: 361 }).success).toBe(false)
    expect(paletteSchema.safeParse({ ...exampleVioletPalette, neutralTint: 0.5 }).success).toBe(
      false,
    )
  })

  it('names the offending path when it throws', () => {
    expect(() => parsePalette({ ...exampleVioletPalette, accentHue: 400 })).toThrowError(
      /accentHue/,
    )
  })

  /**
   * The drift law. `Seeds` is the palette plus the system's fonts, so a seed in
   * one schema but not the other would leave the derivation without a value.
   */
  it('carries exactly the seeds that are not fonts', () => {
    // `composeTheme` removes `name`, `$schema` (tooling), `chartCaps`
    // (measured record) and `moreContrast` (another palette's name), and no
    // derivation of this palette reads them, so they are not seeds.
    const notSeeds = ['name', '$schema', 'chartCaps', 'moreContrast']
    const paletteFields = Object.keys(paletteSchema.shape).filter((key) => !notSeeds.includes(key))
    const seedFields = Object.keys(seedsSchema.shape).filter((key) => key !== 'fonts')
    expect(paletteFields.sort()).toEqual(seedFields.sort())
  })
})

describe('composeTheme', () => {
  const theme = composeTheme(exampleQuietSystem, exampleVioletPalette)

  it('names the pairing, and the pair id is the two names', () => {
    expect(theme.name).toBe('example-quiet/example-violet')
    expect(theme.name).toBe(pairId(exampleQuietSystem.name, exampleVioletPalette.name))
    expect(theme.system).toBe('example-quiet')
    expect(theme.palette).toBe('example-violet')
  })

  it('takes structure from the system and colour from the palette', () => {
    expect(theme.axes).toEqual(exampleQuietSystem.axes)
    expect(theme.seeds.fonts).toEqual(exampleQuietSystem.fonts)
    expect(theme.seeds.accentHue).toBe(exampleVioletPalette.accentHue)
    expect(theme.seeds.neutralTint).toBe(exampleVioletPalette.neutralTint)
    expect(theme.seeds.chromaBudget).toBe(exampleVioletPalette.chromaBudget)
    expect(theme.defaultMode).toBe(exampleQuietSystem.defaultMode)
    expect(theme.kind).toBe(exampleQuietSystem.kind)
  })

  it('produces seeds the engine’s own schema accepts', () => {
    // The composed seeds must be valid `resolveTheme` input. Only this test
    // asserts it.
    expect(seedsSchema.safeParse(theme.seeds).success).toBe(true)
  })

  it('leaves an unseeded optional absent rather than undefined', () => {
    // `composeTheme` copies only the keys the palette declares, so a seed the
    // palette never wrote does not appear in the theme. This pins the shape, not
    // the resolution: `hasGradient` tests `gradientHue !== undefined` (under any
    // budget but `none`), so an `undefined` key would still resolve as solid.
    expect('gradientHue' in theme.seeds).toBe(false)
    expect('neutralHue' in theme.seeds).toBe(false)
  })

  it('pairs any palette with any system', () => {
    const crossed = composeTheme(exampleStarkSystem, exampleVioletPalette)
    expect(crossed.name).toBe('example-stark/example-violet')
    expect(crossed.axes).toEqual(exampleStarkSystem.axes)
    expect(crossed.seeds.accentHue).toBe(exampleVioletPalette.accentHue)
    expect(crossed.defaultMode).toBe('dark')
  })
})

describe('the system choices, and the base', () => {
  it('accepts the field focus style and the unfilled hover choice, and no other value', () => {
    const chosen = parseSystem({
      ...exampleQuietSystem,
      overrides: { focus: { field: 'border' }, hover: { unfilled: 'none' } },
    })
    expect(chosen.overrides?.focus?.field).toBe('border')
    expect(chosen.overrides?.hover?.unfilled).toBe('none')
    for (const overrides of [{ focus: { field: 'glow' } }, { hover: { unfilled: 'fade' } }]) {
      expect(systemSchema.safeParse({ ...exampleQuietSystem, overrides }).success).toBe(false)
    }
  })

  it('accepts a base between 12 and 20px on the half-pixel grid', () => {
    expect(
      systemSchema.safeParse({ ...exampleQuietSystem, overrides: { type: { base: 13 } } }).success,
    ).toBe(true)
    for (const base of [11.5, 20.5, 13.25]) {
      expect(
        systemSchema.safeParse({ ...exampleQuietSystem, overrides: { type: { base } } }).success,
        String(base),
      ).toBe(false)
    }
  })

  it('judges the steps a small base derives, so a 12px base asks for type.xs', () => {
    const bare = systemSchema.safeParse({
      ...exampleQuietSystem,
      overrides: { type: { base: 12 } },
    })
    expect(bare.success).toBe(false)
    expect(bare.error?.issues[0]?.message).toContain('type.xs')
    expect(
      systemSchema.safeParse({
        ...exampleQuietSystem,
        overrides: { type: { base: 12, sm: 11, xs: 10 } },
      }).success,
    ).toBe(true)
  })

  it('keeps every step inside the control that draws it at compact density', () => {
    // xs 20 draws a 30px line box in the sm control, 28px at compact density.
    const tall = systemSchema.safeParse({
      ...exampleQuietSystem,
      overrides: { type: { base: 20, sm: 20, xs: 20 } },
    })
    expect(tall.success).toBe(false)
    expect(tall.error?.issues[0]?.message).toContain('line box')
    // A smaller xs fits, and so does a taller sm control.
    expect(
      systemSchema.safeParse({
        ...exampleQuietSystem,
        overrides: { type: { base: 20, sm: 20, xs: 18.5 } },
      }).success,
    ).toBe(true)
    expect(
      systemSchema.safeParse({
        ...exampleQuietSystem,
        overrides: { type: { base: 20, sm: 20, xs: 20 }, controlHeight: { sm: 36 } },
      }).success,
    ).toBe(true)
  })

  it('lets controls and paragraphs share one size under a small base', () => {
    expect(
      systemSchema.safeParse({
        ...exampleQuietSystem,
        overrides: { type: { base: 13, sm: 13, xs: 12 } },
      }).success,
    ).toBe(true)
  })
})

describe('the heading weights', () => {
  // A guest system that sets both: the quiet example is at standard density,
  // so `text.2xl` is 25px, over the 24px weight 300 needs at Lc 75.
  const light = {
    ...exampleQuietSystem,
    name: 'light-headings',
    overrides: { type: { titleWeight: 300, displayWeight: 300 } },
  }

  it('accepts a title and a display weight from 300 to 700 in hundreds', () => {
    const parsed = parseSystem(light)
    expect(parsed.overrides?.type?.titleWeight).toBe(300)
    expect(parsed.overrides?.type?.displayWeight).toBe(300)
    for (const weight of [400, 500, 600, 700]) {
      const type = { titleWeight: weight, displayWeight: weight }
      expect(
        systemSchema.safeParse({ ...exampleQuietSystem, overrides: { type } }).success,
        String(weight),
      ).toBe(true)
    }
  })

  it('refuses a weight off the hundreds, under 300 or over 700, for either key', () => {
    const cases: [number, string][] = [
      [350, 'a heading weight is a hundred'],
      [200, 'stays at or above 300'],
      [800, 'stays at or under 700'],
    ]
    for (const key of ['titleWeight', 'displayWeight'] as const) {
      for (const [weight, message] of cases) {
        const result = systemSchema.safeParse({
          ...exampleQuietSystem,
          overrides: { type: { [key]: weight } },
        })
        expect(result.success, `${key} ${weight}`).toBe(false)
        expect(result.error?.issues[0]?.path).toEqual(['overrides', 'type', key])
        expect(result.error?.issues[0]?.message).toContain(message)
      }
    }
  })

  it('refuses a title weight the smallest title step is too small to read at', () => {
    // A 12px base at the standard ratio puts `text.2xl` at 23.5px, and weight
    // 300 reads at Lc 75 only from 24px.
    const small = { base: 12, sm: 11, xs: 10 }
    const refused = systemSchema.safeParse({
      ...exampleQuietSystem,
      overrides: { type: { ...small, titleWeight: 300 } },
    })
    expect(refused.success).toBe(false)
    expect(refused.error?.issues[0]?.path).toEqual(['overrides', 'type', 'titleWeight'])
    expect(refused.error?.issues[0]?.message).toBe(
      'text.2xl is 23.5px at weight 300, and at Lc 75, the floor text.primary is held to, ' +
        'weight 300 reads from 24px — set a heavier titleWeight, or raise type.base or type.ratio',
    )
    // A steeper ratio or a larger base gives the step its 24px, and 400 needs only 18px.
    for (const type of [
      { ...small, titleWeight: 300, ratio: 1.3 },
      { base: 13, titleWeight: 300 },
      { ...small, titleWeight: 400 },
    ]) {
      expect(
        systemSchema.safeParse({ ...exampleQuietSystem, overrides: { type } }).success,
        JSON.stringify(type),
      ).toBe(true)
    }
    // At the default base every density's `text.2xl` is past 24px, so 300 is lawful there.
    expect(
      systemSchema.safeParse({ ...exampleStarkSystem, overrides: { type: { titleWeight: 300 } } })
        .success,
    ).toBe(true)
  })

  it('judges the title weight on the merged ladder, base and ratio included', () => {
    // A 12px base at the flattest ratio puts `text.2xl` at 17px: under the
    // 18px weight 400 needs, over the 16px weight 500 needs.
    const small = { base: 12, ratio: 1.125, sm: 11, xs: 10 }
    expect(
      systemSchema.safeParse({
        ...exampleQuietSystem,
        overrides: { type: { ...small, titleWeight: 400 } },
      }).success,
    ).toBe(false)
    expect(
      systemSchema.safeParse({
        ...exampleQuietSystem,
        overrides: { type: { ...small, titleWeight: 500 } },
      }).success,
    ).toBe(true)
  })

  it('leaves every personality lawful at the smallest ladder the schema allows', () => {
    const small = { base: 12, ratio: 1.125, sm: 11, xs: 10 }
    for (const typePersonality of TYPE_PERSONALITIES) {
      const system = {
        ...exampleQuietSystem,
        axes: { ...exampleQuietSystem.axes, typePersonality, density: 'compact' as const },
        overrides: { type: small },
      }
      expect(systemSchema.safeParse(system).success, typePersonality).toBe(true)
    }
  })
})

describe('palette pins and the more-contrast partner', () => {
  const pinned = {
    ...exampleVioletPalette,
    pins: {
      light: { 'accent.bg': '#1A73E8', 'accent.contrast': '#ffffff' },
      dark: { 'border.focus': 'rgb(138 180 248 / 0.5)', 'border.focusSolid': '#8ab4f8' },
    },
  }

  it('accepts exact colours per mode for the pinnable roles', () => {
    expect(paletteSchema.safeParse(pinned).success).toBe(true)
  })

  it('refuses a translucent fill, an unknown role and a ring alpha past two decimals', () => {
    const refused = [
      { light: { 'accent.bg': 'rgb(26 115 232 / 0.5)' } },
      { light: { 'accent.subtle': '#e8f0fe' } },
      { light: { 'accent.bg': 'blue' } },
      { dark: { 'border.focus': 'rgb(138 180 248 / 0.505)' } },
      { dark: { 'border.focus': 'rgb(300 180 248 / 0.5)' } },
      { sepia: { 'accent.bg': '#1a73e8' } },
    ]
    for (const pins of refused) {
      expect(
        paletteSchema.safeParse({ ...exampleVioletPalette, pins }).success,
        JSON.stringify(pins),
      ).toBe(false)
    }
  })

  it('carries the pins into the seeds, and leaves the partner’s name out of them', () => {
    const theme = composeTheme(exampleQuietSystem, {
      ...pinned,
      moreContrast: 'example-violet-strong',
    })
    expect(theme.seeds.pins).toEqual(pinned.pins)
    expect('moreContrast' in theme.seeds).toBe(false)
    expect(seedsSchema.safeParse(theme.seeds).success).toBe(true)
  })

  it('refuses a palette that names itself as its more-contrast partner', () => {
    const result = paletteSchema.safeParse({
      ...exampleVioletPalette,
      moreContrast: 'example-violet',
    })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.path).toEqual(['moreContrast'])
  })
})
