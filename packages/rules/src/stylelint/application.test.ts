import { DATA_ATTRS } from '@polymorph/engine'
import stylelint from 'stylelint'
import { describe, expect, it } from 'vitest'

import { RULE_CLIMB } from '../ladder'
import { alternativesIn } from '../rules/alternatives'
import plugins, { applicationRules, RULE_NAMES } from './index.js'

/**
 * The application half of the CSS rules: a stylesheet in application code may
 * not re-declare a token, branch on the theme, restyle a member through its
 * identity attribute, or rescale the root. Each test lints one rule on its own,
 * at an application path, so a report from another rule cannot satisfy it.
 */

async function lint(css: string, rule: string) {
  const result = await stylelint.lint({
    code: css,
    codeFilename: 'src/register.css',
    config: { plugins, rules: { [rule]: true } },
  })
  return (result.results[0]?.warnings ?? []).map((warning) => ({
    line: warning.line,
    text: warning.text.replace(/\s*\(polymorph\/[a-z-]+\)$/, ''),
  }))
}

const texts = async (css: string, rule: string) =>
  (await lint(css, rule)).map((warning) => warning.text)

describe('no-token-declarations', () => {
  const rule = RULE_NAMES.noTokenDeclarations

  it('reports every `--pm-*` declared, wherever it sits', async () => {
    const css = [
      ':root {\n  --pm-accent-bg: #0b5;\n}',
      '[data-palette="petrol"][data-mode="dark"] {\n  --pm-border-focus: #0b5;\n}',
      '@media (min-width: 40em) {\n  .shell {\n    --pm-space-4: 10px;\n  }\n}',
    ].join('\n')
    const warnings = await lint(css, rule)
    expect(warnings.map((warning) => warning.line)).toEqual([2, 5, 9])
  })

  it('leaves a token read, and a property of the application’s own', async () => {
    const css =
      '.card {\n  --brand-gap: 4px;\n  padding: var(--pm-space-4);\n  gap: var(--brand-gap);\n}\n'
    expect(await lint(css, rule)).toEqual([])
  })

  it('answers each family with the decision that owns it and the rung for a local need', async () => {
    const [colour, text, space, radius, shadow] = await texts(
      '.a {\n  --pm-accent-bg: red;\n  --pm-text-primary: red;\n  --pm-space-4: 2px;\n' +
        '  --pm-radius-md: 0;\n  --pm-shadow-raised: none;\n}\n',
      rule,
    )
    expect(colour).toBe(
      'Unexpected declaration of "--pm-accent-bg" in application CSS: a colour is the ' +
        'palette\'s (docs/theming.md). Pick a member\'s `tone="…"` (rung 1) or ' +
        '`<ToneScope value="inverse">` (rung 2).',
    )
    expect(text).toContain("a colour is the palette's")
    expect(space).toContain('`<DensityScope value="compact">` on a subtree (rung 2)')
    expect(space).toContain('`<Stack patch={…}>` on one (rung 3)')
    expect(radius).toContain('`<Card patch={…}>` (rung 3)')
    expect(shadow).toContain("its value is the system's (docs/theming.md)")
  })

  it('reads a type step as the system’s, not as a text colour', async () => {
    const [size] = await texts('.a {\n  --pm-text-md-size: 13px;\n}\n', rule)
    expect(size).toContain("its value is the system's")
  })
})

describe('no-app-theme-selectors', () => {
  const rule = RULE_NAMES.noAppThemeSelectors

  it('reports a selector on each attribute the theme runtime writes, with a value or bare', async () => {
    // Read from `DATA_ATTRS`, so an attribute the runtime starts writing is covered.
    for (const attribute of Object.values(DATA_ATTRS)) {
      const css = `[${attribute}="x"] .a {\n  color: var(--pm-text-primary);\n}\n[${attribute}] .b {\n  color: var(--pm-text-primary);\n}\n`
      expect(await lint(css, rule), attribute).toHaveLength(2)
    }
  })

  it('reports each selector of a list on its own, and leaves the rest', async () => {
    const css =
      '.a,\n[data-mode="dark"] .a,\n.b[data-state="open"] {\n  color: var(--pm-text-primary);\n}\n'
    expect(await lint(css, rule)).toHaveLength(1)
  })

  it('answers with the theme document when a selector names the palette beside the mode', async () => {
    const [warning] = await texts(
      '[data-mode="dark"][data-palette="petrol"] {\n  color: red;\n}\n',
      rule,
    )
    expect(warning).toContain('in that theme (docs/theming.md)')
  })

  it('answers a branch on the mode or the density with the scope that sets it', async () => {
    const [mode, density, palette] = await texts(
      '[data-mode="dark"] .a {\n  color: red;\n}\n[data-density="compact"] .a {\n  gap: 0;\n}\n' +
        '[data-palette="petrol"] .a {\n  color: red;\n}\n',
      rule,
    )
    expect(mode).toContain('`<ToneScope value="inverse">` (rung 2)')
    expect(density).toContain('`<DensityScope value="compact">` (rung 2)')
    expect(palette).toContain('in that theme (docs/theming.md)')
  })
})

describe('no-app-member-selectors', () => {
  const rule = RULE_NAMES.noAppMemberSelectors

  it('reports the identity attribute, named and bare', async () => {
    const css =
      "[data-member='button'][data-variant='ghost']:hover {\n  background: none;\n}\n" +
      '.toolbar [data-member] {\n  margin: 0;\n}\n'
    const [named, bare] = await texts(css, rule)
    expect(named).toBe(
      "Unexpected \"[data-member='button'][data-variant='gh…\" in application CSS: it restyles a " +
        "member. Use `<Button>`'s props (rung 1), the system file's exceptions, or a new variant " +
        '(rung 5).',
    )
    expect(bare).toContain('`variant="…"` (rung 1)')
  })

  it('leaves a selector that does not name the attribute', async () => {
    expect(await lint('.member {\n  margin: 0;\n}\n', rule)).toEqual([])
  })
})

describe('no-root-font-size', () => {
  const rule = RULE_NAMES.noRootFontSize

  it('reports a font size on the root, however the root is selected', async () => {
    const css = [
      ':root {\n  font-size: 81.25%;\n}',
      'html {\n  font: 13px/1.5 system-ui;\n}',
      'html[data-system="plain"] {\n  font-size: 15px;\n}',
      ':root:has(dialog) {\n  font-size: 90%;\n}',
    ].join('\n')
    expect((await lint(css, rule)).map((warning) => warning.line)).toEqual([2, 5, 8, 11])
  })

  it('leaves a descendant of the root, a keyword and a token read', async () => {
    const css = [
      'html body {\n  font-size: 14px;\n}',
      ':root .a {\n  font-size: 14px;\n}',
      'html {\n  font: inherit;\n  font-size: inherit;\n}',
      'body {\n  font-size: var(--pm-text-md-size);\n}',
    ].join('\n')
    expect(await lint(css, rule)).toEqual([])
  })

  it('reads the subject inside `:is()` and `:where()`', async () => {
    const css = [
      ':where(html) {\n  font-size: 13px;\n}',
      ':is(body, :root) {\n  font: 600 13px/1.4 system-ui;\n}',
      ':where(html):has(dialog) {\n  font-size: 90%;\n}',
    ].join('\n')
    expect((await lint(css, rule)).map((warning) => warning.line)).toEqual([2, 5, 8])
    // A subject that is not the root stays lawful, however it is wrapped.
    const lawful = [
      ':where(html) body {\n  font-size: 14px;\n}',
      ':is(body, main) {\n  font-size: 14px;\n}',
      'body:not(html) {\n  font-size: 14px;\n}',
    ].join('\n')
    expect(await lint(lawful, rule)).toEqual([])
  })

  it('leaves a size that equals the initial one, as a reset sets it', async () => {
    const css = [
      'html,\nbody,\ndiv {\n  font-size: 100%;\n}',
      ':root {\n  font-size: 1rem;\n}',
      'html {\n  font-size: 16px;\n}',
      ':where(html) {\n  font-size: medium;\n}',
      'html {\n  font: 100%/1.5 system-ui;\n}',
      'html {\n  font: bold 16px system-ui;\n}',
    ].join('\n')
    expect(await lint(css, rule)).toEqual([])
  })

  it('names the system as the owner of type size, and the scope for density', async () => {
    const [warning] = await texts(':root {\n  font-size: 81.25%;\n}\n', rule)
    expect(warning).toBe(
      'Unexpected "font-size" on the root in application CSS: it rescales every rem token. Type ' +
        'size is the system\'s (docs/theming.md); density is `<DensityScope value="compact">` ' +
        '(rung 2).',
    )
  })
})

describe('the application set', () => {
  it('holds every rule that governs application CSS, and only those', () => {
    expect(Object.keys(applicationRules).sort()).toEqual(
      [
        RULE_NAMES.noMotionOutsideVocabulary,
        RULE_NAMES.noTokenDeclarations,
        RULE_NAMES.noAppThemeSelectors,
        RULE_NAMES.noAppMemberSelectors,
        RULE_NAMES.noRootFontSize,
      ].sort(),
    )
  })

  it('gives each new rule rungs, and every report names one of them', async () => {
    const css =
      ':root {\n  font-size: 81.25%;\n  --pm-accent-bg: red;\n  --pm-space-2: 1px;\n  --pm-radius-sm: 0;\n  --pm-z-overlay: 9;\n}\n' +
      '[data-palette="x"] .a,\n[data-mode="dark"] .a,\n[data-density="compact"] .a {\n  color: red;\n}\n' +
      '[data-member="dialog"] .a,\n[data-member] .b {\n  color: red;\n}\n'
    for (const name of [
      RULE_NAMES.noTokenDeclarations,
      RULE_NAMES.noAppThemeSelectors,
      RULE_NAMES.noAppMemberSelectors,
      RULE_NAMES.noRootFontSize,
    ]) {
      const climb = RULE_CLIMB[name] ?? []
      expect(climb.length, name).toBeGreaterThan(0)
      const warnings = await texts(css, name)
      expect(warnings.length, name).toBeGreaterThan(0)
      for (const text of warnings) {
        expect(text.length, text).toBeLessThan(200)
        const alternatives = alternativesIn(text, climb)
        expect(alternatives.length, text).toBeGreaterThan(0)
        for (const { rung } of alternatives) expect(climb, text).toContain(rung)
      }
    }
  })
})
