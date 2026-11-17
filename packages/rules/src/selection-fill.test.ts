import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * The selection-fill law: a rule that fills with the selection fill sets the
 * selection text.
 *
 * `selection.text` is the one text colour the contrast law holds on
 * `selection.bg` (`packages/theme/src/pairings.ts`). An achromatic system draws
 * that fill as its ink, the colour of primary text, so a rule that fills with
 * it and leaves the text colour alone draws primary text that cannot be read.
 * A selected part that holds content of its own fills with
 * `selection.surface`, which every text role is held on, and needs no colour.
 *
 * The contrast law cannot see this. It measures pairs of roles, and which pair
 * a recipe draws is in the recipe.
 *
 * Only a background is read. A shape's `fill` holds no text of its own.
 */

const ROOT = process.cwd()

/** The vocabulary's stylesheets, walked on disk so a new recipe is read before it is committed. */
const CORPUS = ['packages/recipes/src', 'packages/react-ui/src', 'packages/react/src']

const FILL = '--pm-selection-bg'
const FILL_HOVER = '--pm-selection-bg-hover'
const TEXT = '--pm-selection-text'

function stylesheets(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(resolve(ROOT, dir), { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue
    const path = `${dir}/${entry.name}`
    if (entry.isDirectory()) out.push(...stylesheets(path))
    else if (entry.name.endsWith('.css')) out.push(path)
  }
  return out
}

interface Rule {
  selector: string
  line: number
  declarations: Map<string, string>
}

/**
 * The declaration blocks of a stylesheet. A block is the innermost pair of
 * braces, so a rule inside `@media` or `@container` is read and the at-rule
 * around it is not. Comments are blanked first: text about a token is not a
 * use of it.
 */
function rulesIn(source: string): Rule[] {
  const css = source.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ' '))
  return [...css.matchAll(/([^{};]*)\{([^{}]*)\}/g)].map((match) => {
    const declarations = new Map<string, string>()
    for (const declaration of (match[2] ?? '').split(';')) {
      const colon = declaration.indexOf(':')
      if (colon === -1) continue
      declarations.set(declaration.slice(0, colon).trim(), declaration.slice(colon + 1).trim())
    }
    const selector = (match[1] ?? '').trim().replace(/\s+/g, ' ')
    const start = (match.index ?? 0) + (match[1] ?? '').search(/\S/)
    return { selector, line: css.slice(0, start).split('\n').length, declarations }
  })
}

const reads = (value: string | undefined, token: string): boolean =>
  value !== undefined && new RegExp(`var\\(\\s*${token}\\s*[,)]`).test(value)

const background = (rule: Rule): string | undefined =>
  rule.declarations.get('background') ?? rule.declarations.get('background-color')

/** What is wrong with a stylesheet's use of the selection fill, one line per rule. */
function violationsIn(file: string, source: string): string[] {
  const rules = rulesIn(source)
  const labelled = rules.filter(
    (rule) => reads(background(rule), FILL) && reads(rule.declarations.get('color'), TEXT),
  )
  return rules.flatMap((rule) => {
    const fill = background(rule)
    if (reads(fill, FILL) && !reads(rule.declarations.get('color'), TEXT)) {
      return [`${file}:${rule.line} ${rule.selector} fills with ${FILL} and does not set ${TEXT}`]
    }
    // The hover fill restyles a part its rest rule has already given the
    // selection text, so the sheet must have that rest rule.
    if (reads(fill, FILL_HOVER) && labelled.length === 0) {
      return [
        `${file}:${rule.line} ${rule.selector} fills with ${FILL_HOVER}, ` +
          `and no rule of the sheet fills with ${FILL} and sets ${TEXT}`,
      ]
    }
    return []
  })
}

describe('a rule that fills with the selection fill sets the selection text', () => {
  it('holds in every recipe', () => {
    const files = CORPUS.flatMap(stylesheets)
    // This prevents the law from passing over an empty walk.
    expect(files.length).toBeGreaterThan(50)

    const violations = files.flatMap((file) =>
      violationsIn(file, readFileSync(resolve(ROOT, file), 'utf8')),
    )
    expect(violations).toEqual([])
  })

  it('reads at least one recipe that uses the fill, so the walk reaches what it checks', () => {
    const using = CORPUS.flatMap(stylesheets).filter((file) =>
      rulesIn(readFileSync(resolve(ROOT, file), 'utf8')).some((rule) =>
        reads(background(rule), FILL),
      ),
    )
    expect(using.length).toBeGreaterThan(0)
  })

  it('reports a rule that fills and leaves the text colour alone', () => {
    const sheet = '.row[data-selected] .cell {\n  background: var(--pm-selection-bg);\n}\n'
    expect(violationsIn('table.module.css', sheet)).toEqual([
      'table.module.css:1 .row[data-selected] .cell fills with --pm-selection-bg ' +
        'and does not set --pm-selection-text',
    ])
  })

  it('reports a rule that sets another text colour on the fill', () => {
    const sheet =
      '.bar {\n  color: var(--pm-text-primary);\n  background: var(--pm-selection-bg);\n}'
    expect(violationsIn('bar.module.css', sheet)).toHaveLength(1)
  })

  it('accepts a rule that sets both, inside an at-rule too', () => {
    const rule =
      '.day[data-selected] { color: var(--pm-selection-text); background: var(--pm-selection-bg); }'
    expect(violationsIn('calendar.module.css', rule)).toEqual([])
    expect(violationsIn('calendar.module.css', `@media (hover: hover) { ${rule} }`)).toEqual([])
  })

  it('accepts the hover fill only in a sheet whose rest rule sets the selection text', () => {
    const rest =
      '.day[data-selected] { color: var(--pm-selection-text); background: var(--pm-selection-bg); }'
    const hover = '.day[data-selected]:hover { background: var(--pm-selection-bg-hover); }'
    expect(violationsIn('calendar.module.css', `${rest}\n${hover}`)).toEqual([])
    expect(violationsIn('table.module.css', hover)).toHaveLength(1)
  })

  it('leaves the selected surface alone, which every text role is held on', () => {
    const sheet = '.row[data-selected] .cell { background: var(--pm-selection-surface); }'
    expect(violationsIn('table.module.css', sheet)).toEqual([])
  })

  it('does not read a comment as a rule', () => {
    const sheet = '/* .a { background: var(--pm-selection-bg); } */\n.b { color: red; }'
    expect(violationsIn('a.module.css', sheet)).toEqual([])
  })
})
