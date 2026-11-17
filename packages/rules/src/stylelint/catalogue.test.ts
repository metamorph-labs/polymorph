import { resolve } from 'node:path'

import stylelint from 'stylelint'
import { describe, expect, it } from 'vitest'

import { TEST_VALUES } from '../rules/rule-tester'
import {
  colorDistance,
  lengthFamily,
  lengthPx,
  nearestColor,
  nearestDuration,
  nearestLength,
  parseColor,
} from './catalogue.js'
import { tokenValues } from './emitted'
import plugins, { RULE_NAMES } from './index.js'

/**
 * The nearest token to a raw value, which the reports of `token-values-only`
 * and `no-raw-styles` name. The rule-level tests use synthetic values, so a
 * palette change does not fail them; the catalogue the engine builds is
 * checked here for its shape.
 */

describe('reading a colour', () => {
  it('reads every notation a recipe or a screen writes', () => {
    const white = parseColor('#fff')
    for (const same of [
      '#ffffff',
      '#FFFF',
      'rgb(255 255 255)',
      'rgba(255,255,255,1)',
      'hsl(0 0% 100%)',
      'oklch(1 0 0)',
    ]) {
      const parsed = parseColor(same)
      expect(parsed, same).not.toBeNull()
      expect(colorDistance(white!, parsed!), same).toBeLessThan(0.001)
    }
  })

  it('keeps alpha, so a translucent black is not the text colour', () => {
    expect(parseColor('rgb(0 0 0 / 0.4)')?.alpha).toBeCloseTo(0.4)
    expect(parseColor('#00000066')?.alpha).toBeCloseTo(0.4, 2)
  })

  it('reads nothing it cannot compare', () => {
    for (const unread of [
      'darkgray',
      'color-mix(in oklch, red, blue)',
      'rgb(var(--x) 0 0)',
      'lab(50 0 0)',
    ]) {
      expect(parseColor(unread), unread).toBeNull()
    }
  })
})

describe('the nearest colour role', () => {
  it('is the role whose value is nearest in OKLab', () => {
    expect(nearestColor('#4087de', TEST_VALUES.color)?.names).toEqual(['--pm-accent-bg'])
    expect(nearestColor('rgba(0, 0, 0, 0.4)', TEST_VALUES.color)?.names).toEqual(['--pm-bg-scrim'])
  })

  it('is chosen among the roles the property paints', () => {
    expect(nearestColor('#fff', TEST_VALUES.color, 'color')?.names).toEqual([
      '--pm-accent-contrast',
      '--pm-text-inverse',
    ])
    expect(nearestColor('#fff', TEST_VALUES.color, 'background-color')?.names).toEqual([
      '--pm-bg-app',
      '--pm-bg-surface',
    ])
    expect(nearestColor('#ccc', TEST_VALUES.color, 'border-color')?.names).toEqual([
      '--pm-border-strong',
    ])
  })

  it('never names a border role for a light grey background', () => {
    // `--pm-border-subtle` ends like a wash (`--pm-accent-subtle`), and is
    // nearer this grey than any background, but it paints a border.
    for (const grey of ['#ebebeb', '#eeeeee', '#e9ebee']) {
      const near = nearestColor(grey, TEST_VALUES.color, 'background-color')
      expect(near?.names, grey).toEqual(['--pm-bg-subtle'])
    }
  })

  it('reads the accent underline as a text role', () => {
    const roles = { ...TEST_VALUES.color, '--pm-accent-underline': 'rgb(17 118 199 / 0.5)' }
    expect(nearestColor('rgb(17 118 199 / 0.5)', roles, 'text-decoration-color')?.names).toEqual([
      '--pm-accent-underline',
    ])
  })

  it('names nothing for a colour no role is near, rather than guess', () => {
    expect(nearestColor('#ff00ff', TEST_VALUES.color)).toBeNull()
    // A purple is a different colour from the blue accent, not a variant of it.
    expect(nearestColor('#7c3aed', TEST_VALUES.color)).toBeNull()
    expect(nearestColor('#4087de', undefined)).toBeNull()
  })
})

describe('the nearest length and duration', () => {
  it('reads px, rem and a style object number', () => {
    expect(lengthPx('12px')).toBe(12)
    expect(lengthPx('0.75rem')).toBe(12)
    expect(lengthPx(24)).toBe(24)
    expect(lengthPx('50%')).toBeNull()
  })

  it('draws from the family the property belongs to', () => {
    expect(lengthFamily('padding-inline')).toBe('space')
    expect(lengthFamily('border-top-left-radius')).toBe('radius')
    expect(lengthFamily('font-size')).toBe('text')
    expect(lengthFamily('font')).toBe('text')
    expect(lengthFamily('min-height')).toBe('size')
    expect(nearestLength('12px', TEST_VALUES, 'gap')).toEqual({
      name: '--pm-space-4',
      value: '12px',
      exact: true,
    })
    expect(nearestLength('6px', TEST_VALUES, 'border-radius')?.name).toBe('--pm-radius-sm')
    expect(nearestLength('16px', TEST_VALUES, 'font-size')?.name).toBe('--pm-text-md-size')
    expect(nearestLength('36px', TEST_VALUES, 'height')?.name).toBe('--pm-control-height-md')
  })

  it('names nothing when the nearest step is far, rather than guess', () => {
    expect(nearestLength('320px', TEST_VALUES, 'width')).toBeNull()
    expect(nearestLength('13px', TEST_VALUES)?.exact).toBe(false)
  })

  it('reads a negative length by its size', () => {
    expect(nearestLength('-12px', TEST_VALUES, 'margin')).toEqual({
      name: '--pm-space-4',
      value: '12px',
      exact: true,
      negative: true,
    })
  })

  it('names both steps when two are equally near', () => {
    expect(nearestLength('10px', TEST_VALUES, 'gap')).toEqual({
      name: '--pm-space-3',
      value: '8px',
      exact: false,
      also: { name: '--pm-space-4', value: '12px' },
    })
  })

  it('finds the nearest duration', () => {
    expect(nearestDuration('120ms', TEST_VALUES)?.name).toBe('--pm-motion-duration-control')
    expect(nearestDuration('0.25s', TEST_VALUES)?.name).toBe('--pm-motion-duration-overlay')
  })
})

describe('the values the engine emits', () => {
  const values = tokenValues(process.cwd())

  it('has every family, read from the emitted sheet', () => {
    expect(Object.keys(values.color ?? {}).length).toBeGreaterThan(40)
    expect(Object.keys(values.space ?? {})).toContain('--pm-space-10')
    expect(Object.keys(values.radius ?? {})).toContain('--pm-radius-md')
    expect(Object.keys(values.text ?? {})).toContain('--pm-text-md-size')
    expect(Object.keys(values.size ?? {})).toContain('--pm-control-height-md')
    expect(Object.keys(values.duration ?? {})).toContain('--pm-motion-duration-control')
  })

  it('names the missing directory for a root that is not this repository', () => {
    // A consumer's values come from the fragments `polymorph add` writes.
    const root = resolve(process.cwd(), 'packages/rules/fixtures')
    expect(() => tokenValues(root)).toThrow(
      `${resolve(root, 'design/systems')} does not exist. The reference pairing is read from`,
    )
  })

  it('offers only the colour roles, never a chart slot or a reference', () => {
    for (const [name, value] of Object.entries(values.color ?? {})) {
      expect(name, name).not.toMatch(/^--pm-(chart|material|shell)-|-gradient/)
      expect(parseColor(value), `${name}: ${value}`).not.toBeNull()
    }
  })
})

/** Lint a fragment of a recipe under one rule. */
async function lint(css: string, rule: string, options: unknown = true) {
  const result = await stylelint.lint({
    code: css,
    codeFilename: 'packages/react-ui/src/probe/probe.module.css',
    config: { plugins, rules: { [rule]: options } },
  })
  return (result.results[0]?.warnings ?? []).map((warning) =>
    warning.text.replace(/\s*\(polymorph\/[a-z-]+\)$/, ''),
  )
}

describe('what the Stylelint reports name', () => {
  it('names the nearest token for a raw value, with the theme’s values', async () => {
    const warnings = await lint(
      '.a {\n  padding: 12px;\n  color: #fff;\n  transition: color 120ms;\n}\n',
      RULE_NAMES.tokenValuesOnly,
      [true, { values: TEST_VALUES }],
    )
    expect(warnings).toEqual([
      'Unexpected raw value "12px" in "padding". It is `var(--pm-space-4)` (12px). Lawful ' +
        'literals: 0, 1px, 2px, 100%, auto, viewport units and 9999px.',
      'Unexpected raw value "#fff" in "color". Its nearest role is `var(--pm-accent-contrast)` or ' +
        '`var(--pm-text-inverse)` (#ffffff).',
      'Unexpected raw value "120ms" in "transition". Nearest is ' +
        '`var(--pm-motion-duration-control)` (140ms).',
    ])
  })

  it('names both steps on a tie, the negation of a negative length, and a font size', async () => {
    const warnings = await lint(
      '.a {\n  padding: 10px;\n  margin: -12px;\n  font: 16px/1.5 serif;\n}\n',
      RULE_NAMES.tokenValuesOnly,
      [true, { values: TEST_VALUES }],
    )
    const literals = 'Lawful literals: 0, 1px, 2px, 100%, auto, viewport units and 9999px.'
    expect(warnings).toEqual([
      'Unexpected raw value "10px" in "padding". It is between `var(--pm-space-3)` (8px) and ' +
        `\`var(--pm-space-4)\` (12px). ${literals}`,
      'Unexpected raw value "-12px" in "margin". It is `var(--pm-space-4)` (12px), negated: ' +
        `\`calc(-1 * var(--pm-space-4))\`. ${literals}`,
      `Unexpected raw value "16px" in "font". It is \`var(--pm-text-md-size)\` (1rem). ${literals}`,
    ])
  })

  it('names the family without them', async () => {
    expect(await lint('.a {\n  border-radius: 6px;\n}\n', RULE_NAMES.tokenValuesOnly)).toEqual([
      'Unexpected raw value "6px" in "border-radius". Read a `var(--pm-radius-*)` step. Lawful ' +
        'literals: 0, 1px, 2px, 100%, auto, viewport units and 9999px.',
    ])
  })

  it('names the member whose state an application stylesheet animates', async () => {
    const [warning] = await lint(
      '[data-member="dialog"][data-state="open"] {\n  animation: pop 200ms;\n}\n',
      RULE_NAMES.noMotionOutsideVocabulary,
    )
    expect(warning).toBe(
      'Unexpected "animation" on the dialog member\'s open state. `<Dialog>` already animates it ' +
        '(`dialog.scrim`, `dialog.panel`), so drop this (rung 1).',
    )
  })

  it('sends one-off motion to a `style` in a zone, because a zone lifts nothing in CSS', async () => {
    const warnings = await lint(
      '.hero {\n  transition: opacity 200ms;\n}\n@keyframes pop {\n  to {\n    opacity: 1;\n  }\n}\n',
      RULE_NAMES.noMotionOutsideVocabulary,
    )
    expect(warnings).toEqual([
      'Unexpected "transition" outside the vocabulary. Compose the member that moves (rung 1), or ' +
        'move it to `style` inside a `<Bespoke reason="…">` zone in the TSX (rung 4).',
      'Unexpected @keyframes outside the vocabulary. Compose the member that moves (rung 1), or ' +
        'animate it in the TSX inside a `<Bespoke reason="…">` zone (rung 4).',
    ])
  })

  it('reads a member name that is not its slug capitalised', async () => {
    const [warning] = await lint(
      '.a [data-member="otp-input"]:hover {\n  transition: color 1s;\n}\n',
      RULE_NAMES.noMotionOutsideVocabulary,
    )
    expect(warning).toContain('`<OTPInput>`')
    expect(warning).toContain('hover state')
  })

  it('keeps the nearest real name for a long ghost, inside the limit', async () => {
    const [warning] = await lint(
      '.a {\n  color: var(--pm-motion-duration-surface-exti);\n}\n',
      RULE_NAMES.noGhostTokens,
      [true, { tokens: ['--pm-motion-duration-surface-exit', '--pm-motion-duration-surface'] }],
    )
    expect(warning).toBe(
      'Unexpected var(--pm-motion-duration-surface-exti): nothing emits or declares it, so the ' +
        'browser is dropping the whole declaration. Did you mean ' +
        '`--pm-motion-duration-surface-exit`?',
    )
  })

  it('quotes a long selector by its start, so the answer still fits', async () => {
    const [warning] = await lint(
      '[data-system="terminal"] .card .header .title .subtitle .meta {\n  color: var(--pm-text-primary);\n}\n',
      RULE_NAMES.noThemeSelectors,
    )
    expect(warning?.length).toBeLessThan(200)
    expect(warning).toContain('`--pm-axis-depth`')
  })
})
