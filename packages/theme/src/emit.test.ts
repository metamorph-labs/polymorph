import { describe, expect, it } from 'vitest'

import { DENSITIES, MOTION_TEMPERAMENTS } from './axes'
import { cssVarName } from './css-vars'
import { emitThemeCSS, emitThemesCSS } from './emit'
import {
  exampleInkPalette,
  exampleJadePalette,
  exampleQuietSystem,
  exampleQuietTheme,
  exampleStarkTheme,
  exampleVioletPalette,
} from './examples'
import { moreContrastOf, resolveTheme } from './resolve-theme'
import { COLOR_ROLES } from './roles'
import { composeTheme } from './systems'
import { MODES, type ResolvedTheme } from './theme'
import { SPACE_STEPS, TEXT_STEPS } from './tokens'

const quiet = resolveTheme(exampleQuietTheme)
const stark = resolveTheme(exampleStarkTheme)
const css = emitThemeCSS(quiet)

/** The selector a block is scoped to: both halves of the pairing. */
const pair = (theme: ResolvedTheme) =>
  `[data-system="${theme.system}"][data-palette="${theme.palette}"]`

describe('emitThemeCSS', () => {
  it('is deterministic: the same theme gives the same bytes', () => {
    expect(emitThemeCSS(resolveTheme(exampleQuietTheme))).toBe(css)
  })

  it('scopes everything on the pairing and never emits data-theme', () => {
    for (const line of css.split('\n')) {
      if (!line.includes('{')) continue
      expect(line.includes(pair(quiet)) || line.trim() === '', line).toBe(true)
    }
    expect(css).not.toContain(':root')
    // A single `data-theme` would be a second way to say the same thing.
    expect(css).not.toContain('data-theme')
  })

  it('emits every colour role in both modes', () => {
    for (const mode of MODES) {
      const modeBlock = section(css, `${pair(quiet)}[data-mode="${mode}"],`)
      for (const role of COLOR_ROLES) {
        expect(modeBlock, `${mode} ${role}`).toContain(`${cssVarName(role)}:`)
      }
    }
  })

  it('emits all three density variants, whatever the theme axis says', () => {
    expect(exampleQuietTheme.axes.density).toBe('standard')
    for (const density of DENSITIES) {
      expect(css).toContain(`${pair(quiet)}[data-density="${density}"]`)
      expect(css).toContain(`:where(${pair(quiet)}) [data-density="${density}"]`)
    }
  })

  it('emits all four motion temperaments', () => {
    for (const temperament of MOTION_TEMPERAMENTS) {
      expect(css).toContain(`${pair(quiet)}[data-motion="${temperament}"]`)
    }
  })

  it('gives every scope a descendant selector, so nested scopes work', () => {
    // Without the descendant form, `<div data-density="compact">` inside
    // `<html data-system data-palette>` would match nothing. The prefix is in
    // `:where()` (one attribute of specificity), so a nested pairing beats the
    // scope it is inside instead of tying on source order.
    for (const attr of ['data-density', 'data-motion', 'data-mode']) {
      expect(css).toContain(`:where(${pair(quiet)}) [${attr}=`)
    }
  })

  it('puts space and control dimensions in density scopes and type outside them', () => {
    const compact = section(css, `${pair(quiet)}[data-density="compact"],`)
    for (const step of SPACE_STEPS) {
      expect(compact).toContain(`${cssVarName(`space.${step}`)}:`)
    }
    expect(compact).toContain('--pm-control-height-md:')
    // Contextual density must never reflow typography.
    for (const step of TEXT_STEPS) {
      expect(compact, `text.${step} leaked into a density scope`).not.toContain(
        `${cssVarName(`text.${step}.size`)}:`,
      )
    }
  })

  it('declares a reference again in every scope that changes what it reads', () => {
    // A `var()` in a custom property is resolved where the property is
    // declared. An inset declared only on the pairing would keep the pairing's
    // spacing inside a DensityScope, and a halo the outer mode's colour inside
    // a nested `[data-mode]`.
    const header = `${pair(quiet)},\n:where(${pair(quiet)}) :is([data-density], [data-mode]) {`
    expect(css).toContain(header)
    const references = section(css, header)
    expect(references).toContain(`--pm-inset-surface: ${quiet.tokens.insetAssign.surface};`)
    expect(references).toContain('--pm-inset-list:')
    expect(references).toContain(`--pm-glow-focus: ${quiet.tokens.glow.focus};`)
    expect(references).toContain(`--pm-shell-topbar-bg: ${quiet.tokens.shell.topbarBg};`)
    expect(references).toContain('--pm-shell-rail-border:')
    // Declared once for the pairing, so the bare block does not repeat them.
    expect(section(css, `${pair(quiet)} {`)).not.toContain('--pm-inset-surface:')
  })

  it('declares the page texture in a mode scope only when the modes differ', () => {
    // A value the same in both modes is inherited from the bare block; the
    // texture, a data URI, is the longest value in the sheet.
    for (const theme of [quiet, stark]) {
      const differs = theme.tokens.texture.page.light !== theme.tokens.texture.page.dark
      expect(section(emitThemeCSS(theme), `${pair(theme)} {`)).toContain('--pm-texture-page:')
      for (const mode of MODES) {
        const scope = section(emitThemeCSS(theme), `${pair(theme)}[data-mode="${mode}"],`)
        expect(scope.includes('--pm-texture-page:'), `${theme.system} ${mode}`).toBe(differs)
      }
    }
  })

  it('carries the theme default in the bare block so a page without attributes still renders', () => {
    const base = section(css, `${pair(quiet)} {`)
    expect(base).toContain('--pm-bg-app:')
    expect(base).toContain('--pm-text-md-size:')
    expect(base).toContain('--pm-text-entry-size:')
    expect(base).toContain('--pm-space-4:')
    expect(base).toContain('--pm-motion-duration-control:')
    expect(base).toContain('--pm-font-body:')
  })

  it('uses the theme default mode for that fallback', () => {
    const base = section(css, `${pair(quiet)} {`)
    expect(base).toContain(`--pm-bg-app: ${quiet.color.light['bg.app']};`)
    const darkFirst = section(emitThemeCSS(stark), `${pair(stark)} {`)
    expect(stark.defaultMode).toBe('dark')
    expect(darkFirst).toContain(`--pm-bg-app: ${stark.color.dark['bg.app']};`)
  })

  it('points type family tokens at the font role, not a repeated stack', () => {
    expect(css).toContain('--pm-text-md-family: var(--pm-font-body);')
    expect(css).toContain('--pm-display-md-family: var(--pm-font-display);')
  })

  it('borrows the opposite mode for inverse tone, and only where it differs', () => {
    const inverse = section(css, `${pair(quiet)}[data-mode="light"] [data-tone="inverse"],`)
    expect(inverse).toContain(`--pm-bg-app: ${quiet.color.dark['bg.app']};`)
    expect(inverse).toContain(`--pm-text-primary: ${quiet.color.dark['text.primary']};`)
    // Solid brand fills are mode-invariant, so they are not re-declared.
    expect(quiet.color.light['accent.bg']).toBe(quiet.color.dark['accent.bg'])
    expect(inverse).not.toContain('--pm-accent-bg:')
  })

  it('names every custom property in the lint-legal form', () => {
    for (const match of css.matchAll(/(--[a-zA-Z0-9-]+):/g)) {
      expect(match[1], match[0]).toMatch(/^--pm-[a-z0-9-]+$/)
    }
  })

  it('emits no raw colour outside a declaration value', () => {
    // Every hex in the sheet must be the value of a --pm-* property.
    for (const line of css.split('\n')) {
      if (!line.includes('#')) continue
      expect(line.trim(), line).toMatch(/^--pm-[a-z0-9-]+: #[0-9a-f]{6};$/)
    }
  })

  it('matches its snapshot', () => {
    expect(css).toMatchSnapshot()
  })
})

describe('the exceptions seam', () => {
  const excepted = resolveTheme(
    composeTheme(
      {
        ...exampleQuietSystem,
        overrides: {
          exceptions: [
            {
              component: 'button',
              family: 'radius',
              class: 'control',
              step: 'pill',
              because: 'capsule buttons are the launch brand; inputs stay on the class.',
            },
            {
              component: 'button',
              family: 'shadow',
              class: 'seat',
              step: 'overlay',
              because: 'the hero CTA floats.',
            },
            {
              component: 'menu',
              family: 'inset',
              class: 'list',
              step: 4,
              because: 'denser menus in this product.',
            },
          ],
        },
      },
      exampleVioletPalette,
    ),
  )
  const sheet = emitThemeCSS(excepted)

  it('emits a donut scope that covers this pairing but not a nested one', () => {
    // Without the lower boundary, a page-pairing exception would also change
    // members in the studio preview, which would then show the draft wrongly.
    expect(sheet).toContain(`@scope (${pair(excepted)}) to ([data-system][data-palette]) {`)
  })

  it('redirects the class token on the member to a step reference', () => {
    expect(sheet).toContain('[data-member="button"]')
    expect(sheet).toContain('--pm-radius-control: var(--pm-radius-pill);')
    expect(sheet).toContain('--pm-shadow-seat: var(--pm-shadow-overlay);')
    expect(sheet).toContain('[data-member="menu"]')
    // An inset names a space step, so the reference still changes with density.
    expect(sheet).toContain('--pm-inset-list: var(--pm-space-4);')
  })

  it('groups one rule per member, not one per exception', () => {
    expect(sheet.match(/\[data-member="button"\]/g)).toHaveLength(1)
  })

  it('adds no property names, so the identical-set law still holds', () => {
    const names = (text: string) =>
      new Set([...text.matchAll(/(--pm-[a-z0-9-]+):/g)].map((match) => match[1]))
    expect(names(sheet)).toEqual(names(css))
  })

  it('a system with no exceptions emits nothing new, byte for byte', () => {
    expect(css).not.toContain('@scope')
    expect(css).not.toContain('data-member')
  })

  it('matches its snapshot', () => {
    const start = sheet.indexOf('@scope')
    expect(sheet.slice(start)).toMatchSnapshot()
  })
})

describe('emitThemesCSS', () => {
  it('concatenates themes without their scopes colliding', () => {
    const sheet = emitThemesCSS([quiet, stark])
    expect(sheet).toContain(pair(quiet))
    expect(sheet).toContain(pair(stark))
    expect(sheet.length).toBeGreaterThan(css.length)
  })

  it('separates two pairings that share a system, because the palette is in the selector', () => {
    // Lazy pairing depends on this: an appended cross-pairing must not
    // overwrite its system's block.
    const crossed = resolveTheme(composeTheme(exampleQuietSystem, exampleJadePalette))
    const sheet = emitThemesCSS([quiet, crossed])

    expect(crossed.system).toBe(quiet.system)
    expect(pair(crossed)).not.toBe(pair(quiet))
    expect(sheet).toContain(
      `[data-system="example-quiet"][data-palette="${exampleJadePalette.name}"]`,
    )
    expect(sheet).toContain(
      `[data-system="example-quiet"][data-palette="${exampleVioletPalette.name}"]`,
    )
  })
})

describe('the system choices', () => {
  it('writes the field focus style and the unfilled hover choice as flags, defaults first', () => {
    expect(css).toContain('--pm-focus-field: ring;')
    expect(css).toContain('--pm-hover-unfilled: wash;')
    const chosen = emitThemeCSS(
      resolveTheme(
        composeTheme(
          {
            ...exampleQuietSystem,
            overrides: { focus: { field: 'border' }, hover: { unfilled: 'none' } },
          },
          exampleVioletPalette,
        ),
      ),
    )
    expect(section(chosen, `${pair(quiet)} {`)).toContain('--pm-focus-field: border;')
    expect(section(chosen, `${pair(quiet)} {`)).toContain('--pm-hover-unfilled: none;')
  })
})

describe('the more-contrast block', () => {
  const partner = resolveTheme(composeTheme(exampleQuietSystem, exampleJadePalette))
  const sheet = emitThemeCSS(quiet, { moreContrast: partner })
  const query = '@media (prefers-contrast: more), (forced-colors: active) {'
  const inside = sheet.slice(sheet.indexOf(query))

  it('adds one media block after the pairing’s own blocks, and changes nothing before it', () => {
    expect(sheet.startsWith(css.replace(/\n$/, ''))).toBe(true)
    expect(sheet.split(query)).toHaveLength(2)
  })

  it('declares the partner’s colours under this pairing’s selectors, in every mode', () => {
    expect(inside).not.toContain(`data-palette="${exampleJadePalette.name}"`)
    for (const mode of MODES) {
      const block = section(inside.replace(/\n {2}/g, '\n'), `${pair(quiet)}[data-mode="${mode}"],`)
      expect(block).toContain(`--pm-accent-bg: ${partner.color[mode]['accent.bg']};`)
      expect(block).toContain(`--pm-material-surface: ${partner.materialSurface[mode]};`)
    }
    // Colour only: the system's other tokens are the pairing's own.
    expect(inside).not.toContain('--pm-space-')
    expect(inside).not.toContain('--pm-radius-')
  })

  it('borrows in an inverse region every role either palette borrows', () => {
    // An ink palette's fills invert with the mode and a hued palette's do not. With an ink pairing
    // and a hued partner, the pairing borrows `accent.bg` and the partner would not, so the
    // partner's block must restate it, or the ink fill would show through its colours.
    const ink = resolveTheme(composeTheme(exampleQuietSystem, exampleInkPalette))
    const hued = emitThemeCSS(ink, { moreContrast: quiet })
    const under = hued.slice(hued.indexOf(query)).replace(/\n {2}/g, '\n')
    const inverse = section(under, `${pair(ink)}[data-mode="light"] [data-tone="inverse"],`)
    expect(ink.color.light['accent.bg']).not.toBe(ink.color.dark['accent.bg'])
    expect(quiet.color.light['accent.bg']).toBe(quiet.color.dark['accent.bg'])
    expect(inverse).toContain(`--pm-accent-bg: ${quiet.color.dark['accent.bg']};`)
  })

  it('refuses a partner on another system, because a partner changes the palette only', () => {
    expect(() => emitThemeCSS(quiet, { moreContrast: stark })).toThrow(/another system/)
  })

  it('is found in a catalogue by the name the palette gives, for an emitter of its own catalogue', () => {
    const naming = { ...exampleVioletPalette, moreContrast: exampleJadePalette.name }
    const catalogue = [naming, exampleJadePalette]
    expect(emitThemeCSS(quiet, moreContrastOf(exampleQuietSystem, naming, catalogue))).toBe(sheet)
    expect(moreContrastOf(exampleQuietSystem, exampleVioletPalette, catalogue)).toEqual({})
    expect(() => moreContrastOf(exampleQuietSystem, naming, [naming])).toThrow(
      `${naming.name} names the more-contrast palette "${exampleJadePalette.name}"`,
    )
  })
})

/** The text of the block whose selector list starts with `header`. */
function section(sheet: string, header: string): string {
  const start = sheet.startsWith(header) ? 0 : sheet.indexOf(`\n${header}`)
  if (start === -1) throw new Error(`no block starting ${header}`)
  const open = sheet.indexOf('{', start)
  const close = sheet.indexOf('}', open)
  return sheet.slice(open, close)
}
