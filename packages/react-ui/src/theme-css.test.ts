import {
  composeTheme,
  DATA_ATTRS,
  emitThemesCSS,
  exampleJadePalette,
  exampleQuietSystem,
  exampleQuietTheme,
  exampleStarkTheme,
  installThemeCSS,
  resolveTheme,
  type ResolvedTheme,
} from '@polymorph/react'
import { afterEach, beforeAll, describe, expect, test } from 'vitest'

/**
 * The CSS contract, tested in a real browser. All of `@polymorph/react-ui` depends on
 * these custom properties resolving, cascading and re-scoping as the emitter
 * intends. jsdom does not resolve custom properties accurately enough to test
 * this.
 */

const quiet = resolveTheme(exampleQuietTheme)
const stark = resolveTheme(exampleStarkTheme)
/** A cross-pairing: quiet's geometry, stark's colours. The system/palette split, as CSS. */
const crossed = resolveTheme(composeTheme(exampleQuietSystem, exampleJadePalette))
const html = document.documentElement

beforeAll(() => {
  installThemeCSS(emitThemesCSS([quiet, stark, crossed]))
})

afterEach(() => {
  for (const attr of Object.values(DATA_ATTRS)) html.removeAttribute(attr)
  document.body.replaceChildren()
})

function varOn(element: Element, name: string): string {
  return getComputedStyle(element).getPropertyValue(name).trim()
}

/** Both names, always together; a document with only one of the two matches no block. */
function wear(theme: ResolvedTheme): void {
  html.setAttribute(DATA_ATTRS.system, theme.system)
  html.setAttribute(DATA_ATTRS.palette, theme.palette)
}

function nest(...attributes: [string, string][]): HTMLElement {
  let parent: HTMLElement = document.body
  for (const [attr, value] of attributes) {
    const child = document.createElement('div')
    child.setAttribute(attr, value)
    parent.append(child)
    parent = child
  }
  return parent
}

describe('pairing scope', () => {
  test('a bare pairing renders with no mode attribute, not a blank page', () => {
    wear(quiet)
    expect(varOn(html, '--pm-bg-app')).toBe(quiet.color.light['bg.app'])
    expect(varOn(html, '--pm-text-md-size')).toBe(quiet.tokens.text.md.size)
  })

  test('half a pairing is not a theme: one attribute matches no block', () => {
    // The emitter fails visibly on purpose: a document with a system and no
    // palette paints nothing, rather than silently using another palette's colours.
    html.setAttribute(DATA_ATTRS.system, quiet.system)
    expect(varOn(html, '--pm-bg-app')).toBe('')

    html.setAttribute(DATA_ATTRS.palette, quiet.palette)
    expect(varOn(html, '--pm-bg-app')).toBe(quiet.color.light['bg.app'])
  })

  test('switching system is an attribute swap, not a re-render', () => {
    wear(quiet)
    const before = varOn(html, '--pm-radius-md')
    wear(stark)
    expect(varOn(html, '--pm-radius-md')).not.toBe(before)
    expect(varOn(html, '--pm-radius-md')).toBe(stark.tokens.radius.md)
  })

  test('a cross-pairing changes colour without changing geometry', () => {
    // The split, tested where it must hold: the palette owns colour, and the
    // system owns shape. Same system, other palette: the accent changes and the
    // geometry does not.
    wear(quiet)
    const radius = varOn(html, '--pm-radius-md')
    const accent = varOn(html, '--pm-accent-bg')

    wear(crossed)
    expect(varOn(html, '--pm-radius-md')).toBe(radius)
    expect(varOn(html, '--pm-accent-bg')).not.toBe(accent)
    expect(varOn(html, '--pm-accent-bg')).toBe(crossed.color.light['accent.bg'])
  })

  test('a nested pairing paints itself, whichever way the sheet was ordered', () => {
    // The descendant form is wrapped in `:where()`. Without it, an ancestor
    // pairing's descendant rules tie with a nested pairing's own compound at
    // equal specificity, the stylesheet's source order picks the colours, and a
    // specimen shows the root's colours. The scope set on an element must beat
    // the scope it sits inside, in both directions.
    for (const [root, nested] of [
      [quiet, stark],
      [stark, quiet],
    ] as const) {
      wear(root)
      const specimen = document.createElement('div')
      specimen.setAttribute(DATA_ATTRS.system, nested.system)
      specimen.setAttribute(DATA_ATTRS.palette, nested.palette)
      specimen.setAttribute(DATA_ATTRS.mode, nested.defaultMode === 'dark' ? 'dark' : 'light')
      document.body.append(specimen)
      const mode = nested.defaultMode === 'dark' ? 'dark' : 'light'
      expect(varOn(specimen, '--pm-accent-bg'), nested.name).toBe(nested.color[mode]['accent.bg'])
      expect(varOn(specimen, '--pm-radius-md'), nested.name).toBe(nested.tokens.radius.md)
      specimen.remove()
    }
  })

  test('mode swaps colour and leaves the scale alone', () => {
    wear(quiet)
    html.setAttribute(DATA_ATTRS.mode, 'dark')
    expect(varOn(html, '--pm-bg-app')).toBe(quiet.color.dark['bg.app'])
    expect(varOn(html, '--pm-text-md-size')).toBe(quiet.tokens.text.md.size)

    html.setAttribute(DATA_ATTRS.mode, 'light')
    expect(varOn(html, '--pm-bg-app')).toBe(quiet.color.light['bg.app'])
  })
})

describe('contextual scopes', () => {
  test('a nested density scope re-declares space by attribute alone', () => {
    wear(quiet)
    html.setAttribute(DATA_ATTRS.mode, 'light')
    const region = nest([DATA_ATTRS.density, 'compact'])

    expect(varOn(region, '--pm-space-5')).toBe(quiet.tokens.density.compact.space[5])
    expect(varOn(html, '--pm-space-5')).toBe(quiet.tokens.density.standard.space[5])
  })

  test('contextual density never reflows typography', () => {
    wear(quiet)
    const region = nest([DATA_ATTRS.density, 'comfortable'])
    expect(varOn(region, '--pm-text-md-size')).toBe(varOn(html, '--pm-text-md-size'))
    expect(varOn(region, '--pm-text-3xl-size')).toBe(varOn(html, '--pm-text-3xl-size'))
  })

  test('inverse tone borrows the opposite mode, not a new palette', () => {
    wear(quiet)
    html.setAttribute(DATA_ATTRS.mode, 'light')
    const panel = nest([DATA_ATTRS.tone, 'inverse'])

    expect(varOn(panel, '--pm-bg-surface')).toBe(quiet.color.dark['bg.surface'])
    expect(varOn(panel, '--pm-text-primary')).toBe(quiet.color.dark['text.primary'])
    // The brand fill is mode-invariant, so inverting must not disturb it.
    expect(varOn(panel, '--pm-accent-bg')).toBe(quiet.color.light['accent.bg'])
  })

  test('inverse inside dark mode borrows the light values', () => {
    wear(quiet)
    html.setAttribute(DATA_ATTRS.mode, 'dark')
    const panel = nest([DATA_ATTRS.tone, 'inverse'])
    expect(varOn(panel, '--pm-bg-surface')).toBe(quiet.color.light['bg.surface'])
  })

  test('motion temperament rescales durations by attribute', () => {
    wear(quiet)
    const still = nest([DATA_ATTRS.motion, 'none'])
    const loud = nest([DATA_ATTRS.motion, 'expressive'])

    expect(varOn(still, '--pm-motion-duration-overlay')).toBe('0ms')
    expect(parseFloat(varOn(loud, '--pm-motion-duration-overlay'))).toBeGreaterThan(
      parseFloat(varOn(html, '--pm-motion-duration-overlay')),
    )
  })

  test('scopes nest and the innermost wins', () => {
    wear(quiet)
    html.setAttribute(DATA_ATTRS.density, 'comfortable')
    const inner = nest([DATA_ATTRS.density, 'compact'], ['data-noop', 'x'])

    expect(varOn(inner, '--pm-space-5')).toBe(quiet.tokens.density.compact.space[5])
  })
})

describe('token application', () => {
  test('the tokens apply to rendered elements', () => {
    wear(quiet)
    html.setAttribute(DATA_ATTRS.mode, 'light')

    const box = document.createElement('div')
    box.style.background = 'var(--pm-bg-surface)'
    box.style.borderRadius = 'var(--pm-radius-md)'
    box.style.padding = 'var(--pm-space-5)'
    document.body.append(box)

    const computed = getComputedStyle(box)
    expect(computed.borderRadius).toBe(quiet.tokens.radius.md)
    expect(computed.paddingTop).toBe(quiet.tokens.density.standard.space[5])
    // Browsers normalise colours to rgb(); just assert it resolved to something.
    expect(computed.backgroundColor).toMatch(/^rgb/)
  })
})

describe('the exceptions donut', () => {
  /**
   * The seam's browser behaviour, measured. An exception changes a class token
   * for one member inside its pairing, and a nested pairing (the studio
   * preview's shape) is outside the donut scope and unaffected. A plain
   * descendant selector fails the second half because of element proximity,
   * which is why the emitter writes `@scope … to …` and why this test exists.
   */
  const excepted = resolveTheme(
    composeTheme(
      {
        ...exampleQuietSystem,
        name: 'example-excepted',
        overrides: {
          exceptions: [
            {
              component: 'button',
              family: 'radius',
              class: 'control',
              step: 'pill',
              because: 'capsule launch brand',
            },
          ],
        },
      },
      exampleJadePalette,
    ),
  )

  test('inside the pairing the member gets the exception; a nested pairing is unaffected', () => {
    installThemeCSS(emitThemesCSS([excepted, quiet, stark, crossed]))
    html.setAttribute(DATA_ATTRS.system, excepted.system)
    html.setAttribute(DATA_ATTRS.palette, excepted.palette)

    // A member on the page pairing: the exception applies.
    const worn = document.createElement('div')
    worn.setAttribute('data-member', 'button')
    document.body.append(worn)
    expect(varOn(worn, '--pm-radius-control')).toBe(excepted.tokens.radius.pill)

    // The same member inside a nested pairing (the preview's shape, with both
    // halves on one element): the nested pairing's own class assignment wins,
    // so the donut scope works.
    const preview = document.createElement('div')
    preview.setAttribute(DATA_ATTRS.system, quiet.system)
    preview.setAttribute(DATA_ATTRS.palette, quiet.palette)
    document.body.append(preview)
    const nested = document.createElement('div')
    nested.setAttribute('data-member', 'button')
    preview.append(nested)
    expect(varOn(nested, '--pm-radius-control')).toBe(quiet.tokens.radius.md)
    expect(varOn(nested, '--pm-radius-control')).not.toBe(excepted.tokens.radius.pill)

    // A member other than the named one never changes.
    const other = document.createElement('div')
    other.setAttribute('data-member', 'card')
    document.body.append(other)
    expect(varOn(other, '--pm-radius-control')).toBe(excepted.tokens.radius.md)

    // Restore the shared sheet for whatever runs after this file.
    installThemeCSS(emitThemesCSS([quiet, stark, crossed]))
  })
})
