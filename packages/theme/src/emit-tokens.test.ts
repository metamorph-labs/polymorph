import { describe, expect, it } from 'vitest'

import { DENSITIES, MOTION_TEMPERAMENTS } from './axes'
import { emitThemeCSS } from './emit'
import {
  emitTokenDocument,
  emitTokenDocumentJSON,
  TOKEN_DOCUMENT_FORMAT,
  TOKEN_DOCUMENT_SCHEMA,
  tokenDocumentJsonSchema,
  type TokenColor,
  type TokenDocument,
} from './emit-tokens'
import {
  EXAMPLE_THEMES,
  exampleQuietSystem,
  exampleQuietTheme,
  exampleStarkTheme,
  exampleVioletPalette,
} from './examples'
import { PLATFORM_FLOORS, PLATFORMS } from './platforms'
import { resolveTheme } from './resolve-theme'
import { CHART_ROLES, COLOR_ROLES, GRADIENT_ROLES } from './roles'
import { composeTheme, type System } from './systems'
import { MODES } from './theme'
import {
  DURATION_ROLES,
  EASING_ROLES,
  GLOW_STEPS,
  SHADOW_STEPS,
  SPACE_STEPS,
  SPRING_ROLES,
  TEXT_STEPS,
} from './tokens'

const quiet = resolveTheme(exampleQuietTheme)
const stark = resolveTheme(exampleStarkTheme)
const examples = EXAMPLE_THEMES.map(resolveTheme)
const document = emitTokenDocument(quiet)

/** The CSS string a document colour stands for, in the engine's two forms. */
const css = ({ hex, alpha, r, g, b }: TokenColor) =>
  alpha === 1 ? hex : `rgb(${r} ${g} ${b} / ${alpha})`

/** A system with every kind of reference and value the document resolves. */
const probeSystem: System = {
  ...exampleQuietSystem,
  name: 'probe-document',
  axes: { ...exampleQuietSystem.axes, depth: 'glass', ornament: 'grid', typePersonality: 'mono' },
  fonts: {
    body: { family: 'Public Sans Variable' },
    display: { family: 'Fraunces Variable', fallback: 'serif', style: 'italic' },
    mono: { family: 'IBM Plex Mono' },
  },
  overrides: {
    shadow: { throw: 1.5 },
    assign: { radius: { control: 'pill' }, inset: { surface: 7 } },
    exceptions: [
      { component: 'button', family: 'radius', class: 'control', step: 'sm', because: 'probe.' },
      { component: 'card', family: 'shadow', class: 'resting', step: 'overlay', because: 'probe.' },
      { component: 'menu', family: 'inset', class: 'list', step: 4, because: 'probe.' },
    ],
  },
}
const probe = resolveTheme(composeTheme(probeSystem, { ...exampleVioletPalette, gradientHue: 200 }))

describe('emitTokenDocument', () => {
  it('is deterministic: the same theme gives the same bytes', () => {
    for (const platform of PLATFORMS) {
      expect(emitTokenDocumentJSON(resolveTheme(exampleQuietTheme), { platform })).toBe(
        emitTokenDocumentJSON(quiet, { platform }),
      )
    }
  })

  it('is plain JSON: it survives a round trip unchanged', () => {
    expect(JSON.parse(JSON.stringify(document))).toEqual(document)
  })

  it('names its format and platform, and defaults to the web', () => {
    expect(document.format).toBe(TOKEN_DOCUMENT_FORMAT)
    expect(document.platform).toBe('web')
    expect(emitTokenDocument(quiet, { platform: 'android' }).platform).toBe('android')
  })

  it('validates against its schema, for every example and every platform', () => {
    for (const theme of [...examples, probe]) {
      for (const platform of PLATFORMS) {
        const result = TOKEN_DOCUMENT_SCHEMA.safeParse(emitTokenDocument(theme, { platform }))
        expect(result.error?.issues ?? [], `${theme.name} on ${platform}`).toEqual([])
      }
    }
  })

  it('publishes a JSON Schema that names every invariant token', () => {
    const schema = tokenDocumentJsonSchema() as {
      properties: { invariant: { properties: Record<string, unknown> } }
    }
    expect(Object.keys(schema.properties.invariant.properties)).toEqual(
      Object.keys(document.invariant),
    )
  })

  it('emits every colour, gradient and chart role in both modes', () => {
    for (const mode of MODES) {
      expect(Object.keys(document.mode[mode].color)).toEqual([...COLOR_ROLES])
      expect(Object.keys(document.mode[mode].gradient)).toEqual([...GRADIENT_ROLES])
      expect(Object.keys(document.mode[mode].chart)).toEqual([...CHART_ROLES])
    }
  })

  it('writes each colour as exactly the value the stylesheet ships', () => {
    for (const theme of [...examples, probe]) {
      const doc = emitTokenDocument(theme)
      for (const mode of MODES) {
        for (const role of COLOR_ROLES) {
          expect(css(doc.mode[mode].color[role]), `${mode} ${role}`).toBe(theme.color[mode][role])
        }
        for (const role of CHART_ROLES) {
          expect(css(doc.mode[mode].chart[role]), `${mode} ${role}`).toBe(theme.chart[mode][role])
        }
        expect(css(doc.mode[mode].materialSurface)).toBe(theme.materialSurface[mode])
      }
    }
  })

  it('emits all three densities and all four temperaments, whatever the axes select', () => {
    expect(Object.keys(document.density)).toEqual([...DENSITIES])
    expect(Object.keys(document.motion)).toEqual([...MOTION_TEMPERAMENTS])
    for (const density of DENSITIES) {
      for (const step of SPACE_STEPS) {
        expect(document.density[density][`space.${step}`]).toEqual({
          value: parseFloat(quiet.tokens.density[density].space[step]),
          unit: 'px',
        })
      }
    }
    for (const temperament of MOTION_TEMPERAMENTS) {
      const set = document.motion[temperament]
      for (const role of DURATION_ROLES) {
        expect(`${set[`motion.duration.${role}`]}ms`).toBe(
          quiet.tokens.motion[temperament].duration[role],
        )
      }
      for (const role of EASING_ROLES) {
        const { x1, y1, x2, y2 } = set[`motion.easing.${role}`]
        expect(`cubic-bezier(${x1}, ${y1}, ${x2}, ${y2})`).toBe(
          quiet.tokens.motion[temperament].easing[role],
        )
      }
      for (const role of SPRING_ROLES) {
        const spring = set[`motion.spring.${role}`]
        // Exact, like every other number in the document: an emitter rounds as it prints.
        expect(spring.dampingRatio).toBe(
          spring.damping / (2 * Math.sqrt(spring.stiffness * spring.mass)),
        )
      }
    }
    // `none` zeroes every duration, the ambient loops and the stagger.
    expect(document.motion.none['motion.duration.overlay']).toBe(0)
    expect(document.motion.none['motion.ambient.shimmer']).toBe(0)
    expect(document.motion.none['motion.stagger.max']).toBe(0)
  })

  it('keeps type sizes in rem with their px beside them', () => {
    for (const step of TEXT_STEPS) {
      const size = document.invariant[`text.${step}.size`]
      expect(`${size.value}rem`).toBe(quiet.tokens.text[step].size)
      expect(size.px).toBe(size.value * 16)
    }
    expect(document.invariant['text.md.family']).toEqual({ ref: 'font.body', family: 'Inter' })
  })

  it('names the families without the Variable suffix, with their weights and fallback', () => {
    const doc = emitTokenDocument(probe)
    expect(doc.fonts.body).toMatchObject({ family: 'Public Sans', variable: true })
    expect(doc.fonts.display).toMatchObject({
      family: 'Fraunces',
      variable: true,
      fallback: 'serif',
      style: 'italic',
    })
    expect(doc.fonts.mono).toMatchObject({ family: 'IBM Plex Mono', variable: false })
    expect(doc.fonts.mono.fallback).toBe('mono')
    // Every weight a step sets, once, ascending.
    const textWeights = [...new Set(TEXT_STEPS.map((step) => probe.tokens.text[step].weight))]
    expect(doc.fonts.body.weights).toEqual(textWeights.sort((a, b) => a - b))
    expect(doc.fonts.display.opsz).toEqual(
      ['sm', 'md', 'lg'].map((step) => probe.tokens.display[step as 'sm'].opsz),
    )
    expect(doc.fonts.body.opsz).toBeUndefined()
    // Mono personality: tabular figures and a slashed zero.
    expect(doc.invariant['font.numeric']).toEqual({ features: ['tnum', 'zero'] })
  })
})

describe('structured values', () => {
  const doc = emitTokenDocument(probe)

  it('gives every shadow the layers its string is drawn from, and none as no layers', () => {
    for (const theme of [quiet, stark, probe]) {
      const shadows = emitTokenDocument(theme).invariant
      for (const step of SHADOW_STEPS) {
        expect(shadows[`shadow.${step}`].layers.length === 0, `${theme.name} ${step}`).toBe(
          theme.tokens.shadow[step] === 'none',
        )
        expect(shadows[`shadow.${step}`].layers).toHaveLength(
          theme.tokens.shadow[step] === 'none' ? 0 : theme.tokens.shadow[step].split(', ').length,
        )
      }
    }
    // The throw scales distance and blur and never darkness: 1.5 × elevated's
    // 6px / 16px first overlay layer.
    expect(doc.invariant['shadow.overlay'].layers[0]).toMatchObject({ y: 12, blur: 36 })
    expect(doc.invariant['shadow.overlay'].layers[0]?.color.alpha).toBe(0.1)
    // Flat has no top highlight; glass has a brighter one, drawn inset.
    expect(emitTokenDocument(stark).invariant['shadow.insetTop'].layers).toEqual([])
    expect(doc.invariant['shadow.insetTop'].layers[0]).toMatchObject({ inset: true, y: 1 })
  })

  it('resolves a glow in each mode and keeps the role it came from', () => {
    for (const mode of MODES) {
      const [focus] = doc.mode[mode].glow['glow.focus'].layers
      expect(focus).toMatchObject({ x: 0, y: 0, blur: 0, spread: 4 })
      expect(focus?.color).toMatchObject({ ref: 'accent.glow' })
      expect(css(focus!.color)).toBe(probe.color[mode]['accent.glow'])
    }
    // `ornament: none` has no halo at all.
    for (const step of GLOW_STEPS) {
      expect(emitTokenDocument(stark).mode.light.glow[`glow.${step}`].layers).toEqual([])
    }
  })

  it('resolves the assignment references and keeps their names', () => {
    expect(doc.invariant['radius.control']).toEqual({ ref: 'radius.pill', value: 9999, unit: 'px' })
    expect(doc.invariant['shadow.resting'].ref).toBe('shadow.raised')
    expect(doc.invariant['shadow.resting'].layers).toEqual(doc.invariant['shadow.raised'].layers)
    // An inset names a space step, so it resolves at each density.
    for (const density of DENSITIES) {
      expect(doc.density[density]['inset.surface']).toEqual({
        ref: 'space.7',
        ...doc.density[density]['space.7'],
      })
    }
    for (const mode of MODES) {
      const topbar = doc.mode[mode].shell['shell.topbar.bg']
      expect(topbar.ref).toBe('bg.surface')
      expect(css(topbar)).toBe(probe.color[mode]['bg.surface'])
    }
  })

  it('carries the numeric column alignment beside the figures, the end by default', () => {
    const quiet = emitTokenDocument(resolveTheme(exampleQuietTheme)).invariant
    expect(quiet['numeric.align']).toBe('end')
    const start = emitTokenDocument(
      resolveTheme(
        composeTheme(
          { ...exampleQuietSystem, overrides: { numeric: { align: 'start' } } },
          exampleVioletPalette,
        ),
      ),
    ).invariant
    expect(start['numeric.align']).toBe('start')
    expect(start['font.numeric']).toEqual(quiet['font.numeric'])
  })

  it('gives a gradient its angle and stops, and a solid two equal stops', () => {
    for (const mode of MODES) {
      const gradient = doc.mode[mode].gradient['accent.gradient']
      expect(gradient.solid).toBe(false)
      expect(gradient.angle).toBe(135)
      expect(gradient.stops.map((stop) => stop.at)).toEqual([0, 1])
      expect(probe.gradient[mode]['accent.gradient'].css).toBe(
        `linear-gradient(${gradient.angle}deg, ${css(gradient.from)}, ${css(gradient.to)})`,
      )
      const solid = document.mode[mode].gradient['accent.gradient']
      expect(solid.solid).toBe(true)
      expect(solid.stops[0]?.color).toEqual(solid.stops[1]?.color)
    }
  })

  it('describes the page texture as parameters, with the grid inked per mode', () => {
    expect(doc.mode.light.texture).toMatchObject({ kind: 'grid', tile: 24, strokeWidth: 1 })
    expect(doc.mode.light.texture).toMatchObject({ stroke: { hex: '#000000' } })
    expect(doc.mode.dark.texture).toMatchObject({ stroke: { hex: '#ffffff' } })
    expect(document.mode.light.texture).toEqual({ kind: 'none' })
    const grain = resolveTheme(
      composeTheme(
        { ...probeSystem, axes: { ...probeSystem.axes, ornament: 'grain' } },
        exampleVioletPalette,
      ),
    )
    expect(emitTokenDocument(grain).mode.dark.texture).toMatchObject({
      kind: 'grain',
      tile: 120,
      octaves: 1,
    })
  })

  it('borrows the opposite mode for inverse tone, as the stylesheet does', () => {
    const sheet = emitThemeCSS(quiet)
    for (const mode of MODES) {
      const header = `[data-system="${quiet.system}"][data-palette="${quiet.palette}"][data-mode="${mode}"] [data-tone="inverse"]`
      const start = sheet.indexOf(header)
      const block = sheet.slice(sheet.indexOf('{', start), sheet.indexOf('}', start))
      const declared = [...block.matchAll(/--pm-([a-z0-9-]+):/g)].length
      const inverse = document.inverse[mode]
      expect(Object.keys(inverse.color).length + Object.keys(inverse.chart).length).toBe(declared)
      const opposite = mode === 'light' ? 'dark' : 'light'
      for (const [role, color] of Object.entries(inverse.color)) {
        expect(css(color), role).toBe(quiet.color[opposite][role as 'bg.app'])
      }
    }
  })

  it('resolves each declared exception, in declared order', () => {
    expect(doc.exceptions).toEqual([
      {
        member: 'button',
        token: 'radius.control',
        value: { ref: 'radius.sm', ...doc.invariant['radius.sm'] },
      },
      {
        member: 'card',
        token: 'shadow.resting',
        value: { ref: 'shadow.overlay', layers: doc.invariant['shadow.overlay'].layers },
      },
      {
        member: 'menu',
        token: 'inset.list',
        value: {
          ref: 'space.4',
          density: Object.fromEntries(
            DENSITIES.map((density) => [density, doc.density[density]['space.4']]),
          ),
        },
      },
    ])
    expect(document.exceptions).toEqual([])
  })
})

describe('platform floors', () => {
  const heights = (doc: TokenDocument) =>
    DENSITIES.flatMap((density) =>
      (['sm', 'md', 'lg'] as const).map(
        (size) => doc.density[density][`controlHeight.${size}`].value,
      ),
    )

  it('raises nothing on the web, where the stylesheet already clears the floor', () => {
    for (const theme of examples) {
      const doc = emitTokenDocument(theme, { platform: 'web' })
      expect(doc.floor.raised).toEqual([])
      expect(doc.density.standard.hitTarget).toEqual({ value: 24, unit: 'px' })
      expect(`${doc.density.compact['controlHeight.sm'].value}px`).toBe(
        theme.tokens.density.compact.controlHeight.sm,
      )
    }
  })

  it('keeps every control height as derived on a native platform, so densities stay apart', () => {
    const web = heights(emitTokenDocument(quiet, { platform: 'web' }))
    for (const platform of ['ios', 'android', 'dart'] as const) {
      const doc = emitTokenDocument(quiet, { platform })
      expect(heights(doc), platform).toEqual(web)
      expect(Math.min(...heights(doc))).toBeGreaterThanOrEqual(
        PLATFORM_FLOORS[platform].controlHeight,
      )
      expect(doc.density.compact['controlHeight.md'].value).toBeLessThan(
        doc.density.comfortable['controlHeight.md'].value,
      )
    }
  })

  it('raises the hit target to the floor at every density on a native platform, and lists each', () => {
    for (const platform of ['ios', 'android', 'dart'] as const) {
      const doc = emitTokenDocument(quiet, { platform })
      const floor = PLATFORM_FLOORS[platform].hitTarget
      for (const density of DENSITIES) {
        expect(doc.density[density].hitTarget.value).toBe(floor)
      }
      expect(doc.floor).toEqual({
        controlHeight: 24,
        hitTarget: floor,
        raised: DENSITIES.map((density) => ({ density, token: 'hitTarget', from: 24, to: floor })),
      })
    }
  })

  it('cites 44 on iOS and 48 on Android for the hit target, and WCAG’s 24 for every height', () => {
    expect(PLATFORM_FLOORS.web).toEqual({ controlHeight: 24, hitTarget: 24 })
    expect(PLATFORM_FLOORS.ios).toEqual({ controlHeight: 24, hitTarget: 44 })
    expect(PLATFORM_FLOORS.android).toEqual({ controlHeight: 24, hitTarget: 48 })
    expect(PLATFORM_FLOORS.dart).toEqual({ controlHeight: 24, hitTarget: 48 })
  })
})

describe('what a platform cannot draw', () => {
  it('lists the page texture as unsupported on every native platform, and nothing on the web', () => {
    expect(emitTokenDocument(quiet, { platform: 'web' }).unsupported).toEqual([])
    for (const platform of ['ios', 'android', 'dart'] as const) {
      expect(emitTokenDocument(quiet, { platform }).unsupported).toEqual(['texture.page'])
    }
  })

  it('keeps an unsupported token in the document, so nothing is silently dropped', () => {
    const doc = emitTokenDocument(probe, { platform: 'ios' })
    expect(doc.mode.light.texture.kind).toBe('grid')
  })

  it('gives every platform the same keys, so an emitter can be written once', () => {
    const skeleton = (value: unknown): unknown =>
      Array.isArray(value)
        ? 'array'
        : value !== null && typeof value === 'object'
          ? Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, skeleton(inner)]))
          : typeof value
    const web = skeleton(emitTokenDocument(probe, { platform: 'web' }))
    for (const platform of PLATFORMS) {
      expect(skeleton(emitTokenDocument(probe, { platform })), platform).toEqual(web)
    }
  })
})

describe('the quiet example', () => {
  it('matches its snapshot', () => {
    expect(emitTokenDocumentJSON(quiet)).toMatchSnapshot()
  })
})
