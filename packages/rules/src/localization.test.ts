import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

import ts from 'typescript'
import { describe, expect, it } from 'vitest'

/**
 * Localization: no member renders text its host cannot replace.
 *
 * The vocabulary "writes no prose". A label, a title and an accessible name
 * belong to the app, in the app's language. A member that needs words takes
 * them as props: required where no default makes sense (`PasswordInput`,
 * `CopyButton`, `ErrorSummary`), or with a generic English default where one
 * does ("Previous page", "Select all", "3 selected", "Dismiss", "Clear
 * filters"). A literal at a JSX site that no prop can replace is a string a
 * product with a translation catalog cannot translate, and its key checks
 * cannot see it.
 *
 * This law enforces that. A string literal passed directly to a naming
 * attribute, or written among an element's children as JSX text or as an
 * expression (a literal or a template between braces), cannot be replaced, and
 * fails. A default in a destructuring pattern or in a module-level function is
 * allowed, because that is how a prop supplies replaceable text.
 *
 * Runs in node, not a browser, because it reads source text.
 */

const ROOT = resolve(import.meta.dirname, '../../..')
const UI = resolve(ROOT, 'packages/react-ui/src')

/**
 * The tiers the law reads: every tier that ships a member.
 *
 * The chart tier is a special case. Its members compose whole summary
 * sentences ("…, 4 segments. The same data is available as a table."), which
 * need a designed contract instead of one prop per string. That contract is
 * `ChartMessages` (`packages/engine/src/charts/types.ts`), one catalog for the
 * tier, with its English text in the engine's `charts/messages.ts`.
 *
 * The chart tier also shows this law's limit. Most of a chart's text is never
 * written at a JSX site (the summary is composed in a `.ts` helper, and so is
 * the gap word in the readout), so a source scan finds only some sentences.
 * This law stays limited to source text. The complementary check is
 * `packages/react-ui/src/charts/chart-messages.test.tsx`, which renders every
 * member for a French host and checks for any word of the English defaults.
 */
const TIERS = [
  'archetypes',
  'charts',
  'controls',
  'conventions',
  'exceptions',
  'layout',
  'overlays',
  'structure',
]

/** Attributes whose value a person reads or hears. Any name ending in `Label` also counts. */
const NAMING_ATTRIBUTES = new Set([
  'aria-label',
  'aria-roledescription',
  'aria-valuetext',
  'aria-description',
  'aria-placeholder',
  'label',
  'title',
  'placeholder',
  'alt',
  'description',
  'emptyMessage',
])

/** Three letters in a row count as a word. `…`, `·`, `×` and `⌘K` do not. */
const WORD = /\p{L}{3,}/u

function shipped(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return name === '__screenshots__' ? [] : shipped(path)
    // Fixtures and tests use English on purpose, because they act as the app.
    if (!name.endsWith('.tsx') || /\.(test|states)\.tsx$/.test(name)) return []
    // The gallery's own frame, part of the harness and never rendered by a product.
    if (name === 'FixtureBox.tsx') return []
    return [path]
  })
}

/**
 * The fixed text an expression can evaluate to, including inside branches.
 *
 * A literal, or a template whose fixed parts contain a word. The same applies
 * inside a ternary's branches, behind a `??` or `||` fallback and inside a
 * template's substitutions, because `open ? `Hide the table for ${label}` :
 * `Show …``, `y?.label ?? 'Count'` and `${positive ? 'positive' : 'negative'}`
 * are each a word no prop can replace. An identifier, a call or a member access
 * is a value from a prop.
 */
function literals(value: ts.Expression | undefined): string[] {
  if (value === undefined) return []
  if (ts.isParenthesizedExpression(value)) return literals(value.expression)
  if (ts.isStringLiteral(value) || ts.isNoSubstitutionTemplateLiteral(value)) return [value.text]
  if (ts.isTemplateExpression(value)) {
    return [
      [value.head.text, ...value.templateSpans.map((span) => span.literal.text)].join(' '),
      ...value.templateSpans.flatMap((span) => literals(span.expression)),
    ]
  }
  if (ts.isConditionalExpression(value)) {
    return [...literals(value.whenTrue), ...literals(value.whenFalse)]
  }
  if (
    ts.isBinaryExpression(value) &&
    (value.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken ||
      value.operatorToken.kind === ts.SyntaxKind.BarBarToken)
  ) {
    return [...literals(value.left), ...literals(value.right)]
  }
  return []
}

/** Whether a node is inside a JSX expression: `prop={…}` or `{…}` among children. */
function atJsxSite(node: ts.Node): boolean {
  for (let parent = node.parent; parent !== undefined; parent = parent.parent) {
    if (ts.isJsxExpression(parent)) return true
  }
  return false
}

/**
 * Every hard-coded sentence in `code`, as `where — what`. `where` is only a
 * label. Nothing is read from disk.
 */
function bakedProse(code: string, where: string): string[] {
  const source = ts.createSourceFile(`${where}.tsx`, code, ts.ScriptTarget.ESNext, true)
  const findings: string[] = []
  const at = (node: ts.Node) =>
    `${where}:${source.getLineAndCharacterOfPosition(node.getStart()).line + 1}`

  const visit = (node: ts.Node): void => {
    if (ts.isJsxAttribute(node) && node.initializer !== undefined) {
      const name = node.name.getText()
      if (NAMING_ATTRIBUTES.has(name) || name.endsWith('Label')) {
        const value = ts.isJsxExpression(node.initializer)
          ? node.initializer.expression
          : node.initializer
        for (const text of literals(value)) {
          if (WORD.test(text)) findings.push(`${at(node)} — ${name}="${text}"`)
        }
      }
    }

    // The same sentence one level down: `columns={[{ label: 'Segment' }]}` names
    // a column just as `label="Segment"` names a control. Only at a JSX site,
    // because a module-level defaults object is the replaceable default, not a
    // violation. So the same array moved to a constant and passed by name is not
    // read: source text can tell a literal from a default, but not a constant
    // from a catalog. A tier that hard-codes text that way needs a render test.
    if (ts.isPropertyAssignment(node) && atJsxSite(node)) {
      const name = node.name.getText().replace(/['"]/g, '')
      if (NAMING_ATTRIBUTES.has(name) || name.endsWith('Label')) {
        for (const text of literals(node.initializer)) {
          if (WORD.test(text)) findings.push(`${at(node)} — ${name}: "${text}"`)
        }
      }
    }

    if (ts.isJsxText(node) && WORD.test(node.text)) {
      findings.push(`${at(node)} — text "${node.text.trim()}"`)
    }

    // The same text written as an expression among the children, a literal or a
    // template between braces. A person reads it, or a screen reader hears it
    // from a visually hidden span, as JSX text is read and heard.
    if (
      ts.isJsxExpression(node) &&
      (ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent))
    ) {
      for (const text of literals(node.expression)) {
        if (WORD.test(text)) findings.push(`${at(node)} — text {"${text}"}`)
      }
    }

    ts.forEachChild(node, visit)
  }

  visit(source)
  return findings
}

/**
 * Words members write among their children that no prop replaces yet, as
 * `file — what`. Each is a defect: a host cannot translate them. They are
 * named here so that the law holds every other member, and the law fails on an
 * entry it no longer finds, so a member given its seam leaves the list.
 */
const UNSEAMED: readonly string[] = [
  'packages/react-ui/src/overlays/Command.tsx — text {"Loading commands…"}',
  'packages/react-ui/src/overlays/Command.tsx — text {"  commands"}',
  'packages/react-ui/src/structure/CodeBlock.tsx — text {"Copied"}',
]

/** A finding without its line number, as `UNSEAMED` names it. */
const unplaced = (finding: string) => finding.replace(/:\d+ — /, ' — ')

describe('no member renders text its host cannot replace', () => {
  const files = TIERS.flatMap((tier) => shipped(resolve(UI, tier)))
  const findings = files.flatMap((file) =>
    bakedProse(readFileSync(file, 'utf8'), relative(ROOT, file)),
  )

  it('reads the whole vocabulary, the chart tier included', () => {
    // A law that matched no files would always pass.
    expect(files.length).toBeGreaterThan(100)
    expect(files.some((file) => file.endsWith('structure/DataTable.tsx'))).toBe(true)
    expect(files.some((file) => file.endsWith('charts/DonutChart.tsx'))).toBe(true)
    expect(files.some((file) => file.endsWith('charts/frame/ChartTwin.tsx'))).toBe(true)
  })

  it('finds no literal passed to a naming attribute, and no text among the children', () => {
    expect(findings.filter((finding) => !UNSEAMED.includes(unplaced(finding)))).toEqual([])
  })

  it('still finds each sentence it lists as having no seam', () => {
    const found = new Set(findings.map(unplaced))
    expect(UNSEAMED.filter((entry) => !found.has(entry))).toEqual([])
  })
})

describe('the law detects violations', () => {
  const found = (code: string) => bakedProse(code, 'fixture').map((line) => line.split(' — ')[1])

  it('catches the basic cases', () => {
    expect(found('const a = <Button label="Previous page" />')).toEqual(['label="Previous page"'])
    expect(found('const a = <span>3 selected</span>')).toEqual(['text "3 selected"'])
    expect(found('const a = <Checkbox aria-label="Select all" />')).toEqual([
      'aria-label="Select all"',
    ])
  })

  it('catches a sentence in a template, and any prop whose name ends in Label', () => {
    expect(found('const a = <button aria-label={`Remove ${tag}`} />')).toEqual([
      'aria-label="Remove  "',
    ])
    expect(found('const a = <Dialog closeLabel="Close" />')).toEqual(['closeLabel="Close"'])
  })

  it('catches a sentence in a ternary, behind a fallback, and one level down', () => {
    // Three forms the chart tier has used, which a simpler scan would miss.
    expect(
      found(
        'const a = <Button label={open ? `Hide the data table for ${label}` : `Show the data table for ${label}`} />',
      ),
    ).toEqual(['label="Hide the data table for  "', 'label="Show the data table for  "'])
    expect(found("const a = <Header label={y?.label ?? 'Count'} />")).toEqual(['label="Count"'])
    expect(found("const a = <Twin columns={[{ key: 'share', label: 'Share' }]} />")).toEqual([
      'label: "Share"',
    ])
  })

  it('catches text written as an expression among the children, and a word inside a substitution', () => {
    expect(found('const a = <span>{`${count} selected`}</span>')).toEqual(['text {"  selected"}'])
    expect(found("const a = <>{loading ? 'Loading' : label}</>")).toEqual(['text {"Loading"}'])
    // A delta's sentence written in place: no fixed part of the template holds
    // a word, and the judgement is a ternary inside a substitution.
    expect(
      found(
        "const a = <span>{`${delta.direction} ${delta.value} — ${positive ? 'positive' : 'negative'}`}</span>",
      ),
    ).toEqual(['text {"positive"}', 'text {"negative"}'])
    expect(found("const a = <Glyph aria-label={`${count} ${one ? 'item' : 'items'}`} />")).toEqual([
      'aria-label="item"',
      'aria-label="items"',
    ])
  })

  it('allows a call, a prop and a template of values among the children', () => {
    expect(found('const a = <span>{deltaLabel({ value, direction, positive })}</span>')).toEqual([])
    expect(found('const a = <span>{children}</span>')).toEqual([])
    expect(found('const a = <span>{`${count} — ${total}`}</span>')).toEqual([])
  })

  it('allows a defaults object and a catalog read', () => {
    expect(found("const DEFAULTS = { title: 'Add an image', alt: 'Image being framed' }")).toEqual(
      [],
    )
    expect(
      found('const a = <Twin columns={[{ key: "share", label: messages.shareColumn }]} />'),
    ).toEqual([])
    expect(
      found('const a = <Button label={open ? messages.hide(label) : messages.show(label)} />'),
    ).toEqual([])
  })

  it('allows a prop, a call and a glyph', () => {
    expect(found('const a = <Button label={messages.previous} />')).toEqual([])
    expect(found('const a = <button aria-label={removeLabel(tag)} />')).toEqual([])
    expect(found('const a = <span aria-hidden="true">…</span>')).toEqual([])
    expect(found('const a = <Kbd>⌘K</Kbd>')).toEqual([])
  })
})
