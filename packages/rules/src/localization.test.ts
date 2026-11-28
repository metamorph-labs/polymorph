import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import ts from 'typescript'
import { describe, expect, it } from 'vitest'

import {
  cond,
  each,
  el,
  lit,
  member,
  portal,
  slot,
  text,
  words,
  type MemberShell,
  type Node as DescribedNode,
} from '../../shells/src/dsl'

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
 * allowed, because that is how a prop supplies replaceable text, and so is a
 * fallback after a prop that carries words (AttachmentChip's `uploadingLabel
 * ?? …`), which is that prop's default. The descriptions every other web
 * renderer is generated from are read the same way, below.
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
  'ai',
  'archetypes',
  'charts',
  'controls',
  'conventions',
  'exceptions',
  'layout',
  'overlays',
  'structure',
]

/** The directories of `packages/react-ui/src` that ship no member: the conformance runner's adapter. */
const NOT_TIERS = ['conformance']

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

/** Whether an attribute or a prop carries words a person reads or hears. */
const naming = (name: string): boolean => NAMING_ATTRIBUTES.has(name) || name.endsWith('Label')

/**
 * Whether an expression reads a prop that carries words: one named as words
 * are (`removeLabel`, `label`), or the member's `messages`, which a
 * description also reads through the `say` it merges them into.
 */
function readsWords(expression: ts.Expression): boolean {
  let root = expression
  while (
    ts.isPropertyAccessExpression(root) ||
    ts.isElementAccessExpression(root) ||
    ts.isParenthesizedExpression(root)
  ) {
    root = root.expression
  }
  return ts.isIdentifier(root) && (naming(root.text) || ['messages', 'say'].includes(root.text))
}

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
 *
 * `defaults` names the fallbacks that are a prop's default, which both readings
 * pass as `readsWords`: the right side of a `??` or `||` whose left side it
 * accepts is not read.
 */
function literals(
  value: ts.Expression | undefined,
  defaults?: (left: ts.Expression) => boolean,
): string[] {
  if (value === undefined) return []
  const read = (inner: ts.Expression | undefined) => literals(inner, defaults)
  if (ts.isParenthesizedExpression(value)) return read(value.expression)
  if (ts.isStringLiteral(value) || ts.isNoSubstitutionTemplateLiteral(value)) return [value.text]
  if (ts.isTemplateExpression(value)) {
    return [
      [value.head.text, ...value.templateSpans.map((span) => span.literal.text)].join(' '),
      ...value.templateSpans.flatMap((span) => read(span.expression)),
    ]
  }
  if (ts.isConditionalExpression(value)) {
    return [...read(value.whenTrue), ...read(value.whenFalse)]
  }
  if (
    ts.isBinaryExpression(value) &&
    (value.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken ||
      value.operatorToken.kind === ts.SyntaxKind.BarBarToken)
  ) {
    if (defaults?.(value.left) === true) return read(value.left)
    return [...read(value.left), ...read(value.right)]
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
        for (const text of literals(value, readsWords)) {
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
        for (const text of literals(node.initializer, readsWords)) {
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
      for (const text of literals(node.expression, readsWords)) {
        if (WORD.test(text)) findings.push(`${at(node)} — text {"${text}"}`)
      }
    }

    ts.forEachChild(node, visit)
  }

  visit(source)
  return findings
}

describe('no member renders text its host cannot replace', () => {
  const files = TIERS.flatMap((tier) => shipped(resolve(UI, tier)))
  const findings = files.flatMap((file) =>
    bakedProse(readFileSync(file, 'utf8'), relative(ROOT, file)),
  )

  it('reads the whole vocabulary, the chart and AI tiers included', () => {
    // A law that matched no files would always pass.
    expect(files.length).toBeGreaterThan(100)
    expect(files.some((file) => file.endsWith('structure/DataTable.tsx'))).toBe(true)
    expect(files.some((file) => file.endsWith('charts/DonutChart.tsx'))).toBe(true)
    expect(files.some((file) => file.endsWith('charts/frame/ChartTwin.tsx'))).toBe(true)
    expect(files.some((file) => file.endsWith('ai/ArtifactPane.tsx'))).toBe(true)
  })

  it('reads every tier, so a new tier is read from its first member', () => {
    const directories = readdirSync(UI).filter(
      (name) => name !== '__screenshots__' && statSync(join(UI, name)).isDirectory(),
    )
    expect(
      directories.filter((name) => !TIERS.includes(name) && !NOT_TIERS.includes(name)),
    ).toEqual([])
    expect(NOT_TIERS.filter((name) => !directories.includes(name))).toEqual([])
  })

  it('finds no literal passed to a naming attribute, and no text among the children', () => {
    expect(findings).toEqual([])
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

  it('allows a fallback that is the default of a prop that carries words', () => {
    expect(found('const a = <Spinner label={uploadingLabel ?? `${name}: uploading`} />')).toEqual(
      [],
    )
    expect(found("const a = <span>{messages.loading ?? 'Loading'}</span>")).toEqual([])
    expect(found("const a = <Header label={y?.label ?? 'Count'} />")).toEqual(['label="Count"'])
  })

  it('allows a prop, a call and a glyph', () => {
    expect(found('const a = <Button label={messages.previous} />')).toEqual([])
    expect(found('const a = <button aria-label={removeLabel(tag)} />')).toEqual([])
    expect(found('const a = <span aria-hidden="true">…</span>')).toEqual([])
    expect(found('const a = <Kbd>⌘K</Kbd>')).toEqual([])
  })
})

/* -------------------------------------------------------------------------- */
/* The descriptions                                                           */
/* -------------------------------------------------------------------------- */

/**
 * The descriptions the Vue, Svelte, Solid and Angular members and the elements
 * are generated from (`docs/shells.md`). A description writes its own
 * attributes and text, so a word the React member takes from a library that
 * translates it (React Aria's "Suggestions") can be English in every generated
 * member, where the reading of the React source above cannot see it.
 *
 * This reading walks each description's anatomy as `pnpm shells` reads it, so
 * the helpers and constants a description builds it from are read too: an
 * element's attributes, a composed member's props, the props a slot passes,
 * a machine's context and every text node. Each value is an expression, which
 * the reading parses and reads as the React reading reads a JSX expression. A
 * description's `defaults` and `derived` values are not read, because a prop's
 * default is how a member supplies replaceable text. A fallback after a prop
 * that carries words (`removeLabel ?? \`Remove ${name}\``,
 * `say.skipToContent ?? 'Skip to content'`) is that prop's default too.
 */
const DESCRIPTIONS = resolve(ROOT, 'packages/shells/src/members')

/** One of a description's expressions, parsed. */
function parsed(source: string): ts.Expression {
  const file = ts.createSourceFile('expression.ts', `(${source})`, ts.ScriptTarget.ESNext, true)
  const [statement] = file.statements
  if (statement === undefined || !ts.isExpressionStatement(statement)) {
    throw new Error(`not an expression: ${source}`)
  }
  return statement.expression
}

/**
 * The fixed words a value written to `name` holds, and those of a property
 * named as words inside it, one level down: `columns: "[{ label: 'Share' }]"`
 * names a column as `label` names a control.
 */
function fixedWords(name: string, source: string): { name: string; text: string }[] {
  const value = parsed(source)
  const found = naming(name) ? literals(value, readsWords).map((text) => ({ name, text })) : []
  const visit = (node: ts.Node): void => {
    if (ts.isPropertyAssignment(node)) {
      const inner = node.name.getText().replace(/['"]/g, '')
      if (naming(inner)) {
        found.push(...literals(node.initializer, readsWords).map((text) => ({ name: inner, text })))
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(value)
  return found.filter(({ text }) => WORD.test(text))
}

/** What the reading walks: a description's anatomy, its parts' and its machines'. */
type Described = Pick<MemberShell, 'template' | 'machine' | 'parts'>

/**
 * Every fixed word a description writes where a person reads or hears it, as
 * `where — what`, each once. `where` is only a label. Nothing is read from disk.
 */
function describedProse(shell: Described, where: string): string[] {
  const findings = new Set<string>()
  const note = (what: string, values: Readonly<Record<string, string>> | undefined) => {
    for (const [name, source] of Object.entries(values ?? {})) {
      for (const word of fixedWords(name, source)) {
        findings.add(`${where} — ${what} ${word.name}: "${word.text}"`)
      }
    }
  }
  const walk = (nodes: DescribedNode | readonly DescribedNode[] | undefined): void => {
    for (const node of ([] as DescribedNode[]).concat(nodes ?? [])) {
      switch (node.kind) {
        case 'element':
          note(`<${typeof node.tag === 'string' ? node.tag : 'element'}>`, node.attrs)
          walk(node.children)
          break
        case 'member':
          note(node.name, node.props)
          for (const content of Object.values(node.slots ?? {})) walk(content)
          break
        case 'slot':
          note(`slot ${node.name}`, node.pass)
          walk(node.fallback)
          break
        case 'text':
          if (node.value !== undefined && WORD.test(node.value)) {
            findings.add(`${where} — words "${node.value}"`)
          }
          if (node.expr !== undefined) {
            for (const text of literals(parsed(node.expr), readsWords)) {
              if (WORD.test(text)) findings.add(`${where} — text "${text}"`)
            }
          }
          break
        case 'if':
          for (const branch of node.branches) walk(branch.then)
          walk(node.otherwise)
          break
        case 'each':
        case 'portal':
          walk(node.children)
          break
        case 'render':
          // A node the caller passed, drawn as it is.
          break
      }
    }
  }
  walk(shell.template)
  note('machine', shell.machine?.context)
  for (const part of shell.parts ?? []) {
    walk(part.template)
    note('machine', part.machine?.context)
  }
  return [...findings]
}

/** Every description, by its file, as `pnpm shells` finds them (`loadMembers`). */
async function readDescriptions(): Promise<{ file: string; shell: MemberShell }[]> {
  const files = readdirSync(DESCRIPTIONS)
    .filter((name) => name.endsWith('.ts') && name !== 'index.ts' && !name.endsWith('.test.ts'))
    .sort()
  return Promise.all(
    files.map(async (name) => {
      const path = join(DESCRIPTIONS, name)
      const module = (await import(pathToFileURL(path).href)) as { default: MemberShell }
      return { file: relative(ROOT, path), shell: module.default }
    }),
  )
}

/**
 * Words descriptions write that no prop replaces yet, as `file — what`. Each
 * is a defect: a host cannot translate them in the generated members. They are
 * named here so that the law holds every other description, and the law fails
 * on an entry it no longer finds, so a member given its seam leaves the list.
 */
const UNSEAMED_IN_DESCRIPTIONS: readonly string[] = [
  // An empty segment's value, and a range's two halves, which React Aria says in the locale's words.
  'packages/shells/src/members/date-picker.ts — <div> aria-valuetext: "Empty"',
  'packages/shells/src/members/date-range-picker.ts — <div> aria-label: "Start date"',
  'packages/shells/src/members/date-range-picker.ts — <div> aria-valuetext: "Empty"',
  'packages/shells/src/members/date-range-picker.ts — <div> aria-label: "End date"',
  'packages/shells/src/members/time-input.ts — <div> aria-valuetext: "Empty"',
]

describe('no description renders text its host cannot replace', async () => {
  const described = await readDescriptions()
  const findings = described.flatMap(({ file, shell }) => describedProse(shell, file))

  it('reads every description', () => {
    // A law that matched no files would always pass.
    expect(described.length).toBeGreaterThan(100)
    for (const file of ['combobox.ts', 'command.ts', 'color-input.ts', 'date-range-picker.ts']) {
      expect(described.some((entry) => entry.file.endsWith(`members/${file}`))).toBe(true)
    }
  })

  it('finds no fixed word in a naming attribute or prop, and none in a text node', () => {
    expect(findings.filter((finding) => !UNSEAMED_IN_DESCRIPTIONS.includes(finding))).toEqual([])
  })

  it('still finds each word it lists as having no seam', () => {
    expect(UNSEAMED_IN_DESCRIPTIONS.filter((entry) => !findings.includes(entry))).toEqual([])
  })
})

describe('the reading of the descriptions detects violations', () => {
  const found = (shell: Described) =>
    describedProse(shell, 'fixture').map((line) => line.split(' — ')[1])
  /** What an anatomy alone writes. */
  const drawn = (template: DescribedNode | readonly DescribedNode[]) => found({ template })

  it('catches a fixed name and a fixed role description on an element', () => {
    expect(drawn(el('ul', { attrs: { 'aria-label': lit('Suggestions') } }))).toEqual([
      '<ul> aria-label: "Suggestions"',
    ])
    expect(drawn(el('input', { attrs: { 'aria-roledescription': lit('2d slider') } }))).toEqual([
      '<input> aria-roledescription: "2d slider"',
    ])
    expect(drawn(el('span', { attrs: { title: '`${count} hidden`' } }))).toEqual([
      '<span> title: "  hidden"',
    ])
  })

  it('catches a word in text, written as it is or in an expression', () => {
    expect(drawn(words('Skip to content'))).toEqual(['words "Skip to content"'])
    expect(drawn(text("loading ? 'Loading commands…' : label"))).toEqual([
      'text "Loading commands…"',
    ])
    expect(drawn(text('`${count} commands`'))).toEqual(['text "  commands"'])
  })

  it('catches a composed member’s naming prop, a slot’s passed prop and a machine’s name', () => {
    expect(drawn(member('Spinner', { label: '`${title}: still being written`' }))).toEqual([
      'Spinner label: " : still being written"',
    ])
    expect(drawn(slot('default', { pass: { label: lit('Subject') } }))).toEqual([
      'slot default label: "Subject"',
    ])
    expect(
      found({ template: [], machine: { of: 'dialog', context: { 'aria-label': lit('Palette') } } }),
    ).toEqual(['machine aria-label: "Palette"'])
    expect(drawn(member('Twin', { columns: "[{ key: 'share', label: 'Share' }]" }))).toEqual([
      'Twin label: "Share"',
    ])
  })

  it('reads inside a condition, a loop, a portal, a member’s slot and a part', () => {
    expect(
      drawn(
        portal(
          cond('open', [el('p', {}, [words('Nothing here')])], [text("'Closed'")]),
          each('rows', 'row', 'row.id', [member('Badge', { label: lit('New') })]),
          member('Kbd', {}, { slots: { default: [words('Escape')] } }),
        ),
      ),
    ).toEqual(['words "Nothing here"', 'text "Closed"', 'Badge label: "New"', 'words "Escape"'])
    const parts: Described['parts'] = [
      {
        name: 'Panel',
        public: false,
        purpose: 'a part',
        template: el('ul', { attrs: { 'aria-label': lit('Suggestions') } }),
      },
    ]
    expect(found({ template: [], parts })).toEqual(['<ul> aria-label: "Suggestions"'])
  })

  it('catches a fallback after a value that is not words', () => {
    expect(drawn(text("option.label ?? 'Untitled'"))).toEqual(['text "Untitled"'])
  })

  it('allows a prop, a derived value, a call, a prop’s default and an attribute no one reads', () => {
    expect(
      drawn(el('ul', { attrs: { 'aria-label': 'label', 'aria-labelledby': 'ariaLabelledby' } })),
    ).toEqual([])
    expect(drawn(text('announcement'))).toEqual([])
    expect(drawn(text('say.options(count)'))).toEqual([])
    expect(drawn(text("say.skipToContent ?? 'Skip to content'"))).toEqual([])
    expect(drawn(member('Button', { label: 'removeLabel ?? `Remove ${name}`' }))).toEqual([])
    expect(drawn(el('div', { attrs: { 'data-state': "api.open ? 'open' : 'closed'" } }))).toEqual(
      [],
    )
    expect(drawn([words(' *'), text('`${count} — ${total}`')])).toEqual([])
  })
})
