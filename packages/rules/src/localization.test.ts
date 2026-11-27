import { readdirSync, readFileSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, relative, resolve } from 'node:path'
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
  type MachineBinding,
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
 * allowed, because that is how a prop supplies replaceable text. The
 * descriptions every other web renderer is generated from are read the same
 * way, below.
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
 *
 * `defaults` names the fallbacks that are a prop's default, which the reading
 * of the descriptions passes: the right side of a `??` or `||` whose left side
 * it accepts is not read.
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
  // The React member writes it too, in the `ai` tier, which the React reading does not read.
  'packages/shells/src/members/artifact-pane.ts — Spinner label: " : still being written"',
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

/* -------------------------------------------------------------------------- */
/* The machines' own words                                                    */
/* -------------------------------------------------------------------------- */

/**
 * The words a Zag machine writes itself. A description spreads a machine's
 * prop getters on its elements (`api.getIncrementTriggerProps()`), and Zag's
 * getters write names and value texts in fixed English, through a default in
 * the machine's `translations` or as text in the getter. A machine's action
 * can speak too: Zag's combobox announces the highlighted option on Apple
 * platforms. The reading of the descriptions above sees only what a
 * description writes, so these words reached every generated member unread.
 *
 * This reading reads the installed Zag, the version the generated members are
 * built on. In each machine a description binds, it finds every prop getter's
 * naming attribute whose value holds a word or reads a translation the
 * machine has an English default for, and every action that passes a word to
 * a live region's `announce`. A description then replaces each word it
 * reaches: it sets the attribute on the element that spreads the getter, or
 * passes the translation in the machine's `translations`, built from the
 * member's words; it never copies the attribute from the getter onto another
 * element; and it names a speaking action in its binding's `without`.
 *
 * It cannot see a word the machine writes from a variable, because a variable
 * that holds a host's word and one that holds an English key read alike:
 * ColorInput's rails are named by their channel's key, `hue`. Those are listed
 * by hand (`KEYED_WORDS`), and the reading fails on an entry the installed
 * getter no longer writes. It reads spreads and attributes, not a getter
 * called inside a `derived` value or a member's prop.
 */
const VOCABULARY_PACKAGE = resolve(ROOT, 'packages/vue-ui/package.json')

/** A word a machine's prop getter writes: as text, or through a translation it has a default for. */
interface GetterWord {
  machine: string
  getter: string
  attribute: string
  /** The value's source, as the getter writes it. */
  source: string
  /** The key of the machine's `translations` the value reads, when it reads one. */
  translation?: string
}

/** An action of a machine's implementation that announces words of its own. */
interface SpokenAction {
  machine: string
  action: string
  /** What it announces, as the action writes it. */
  source: string
}

/** What one machine's installed sources write. */
interface MachineWords {
  getters: GetterWord[]
  actions: SpokenAction[]
  /** Every action the machine implements, by name. */
  implemented: string[]
}

/**
 * The words a machine writes from a variable, which the reading cannot tell
 * from a host's: a colour channel's key, an English word Zag uses as its
 * name. Each is checked against the installed getter.
 */
const KEYED_WORDS: readonly GetterWord[] = [
  {
    machine: 'color-picker',
    getter: 'getAreaThumbProps',
    attribute: 'aria-valuetext',
    source: '`${xChannel} ${xValue}, ${yChannel} ${yValue}`',
  },
  {
    machine: 'color-picker',
    getter: 'getChannelSliderThumbProps',
    attribute: 'aria-label',
    source: 'channel',
  },
  {
    machine: 'color-picker',
    getter: 'getChannelSliderThumbProps',
    attribute: 'aria-valuetext',
    source: '`${channel} ${channelValue}`',
  },
  {
    machine: 'color-picker',
    getter: 'getChannelInputProps',
    attribute: 'aria-label',
    source: 'channel',
  },
]

/**
 * When an action's words are said, where that is narrower than always, by
 * `machine.action`. Zag's combobox adds ", selected" after an option only
 * when the option is in the machine's value, so a machine whose value is
 * always empty (Command's panel) announces the option's label alone, which is
 * the host's word.
 */
const SPOKEN_WHEN: Readonly<Record<string, (binding: MachineBinding) => boolean>> = {
  'combobox.announceHighlightedItem': (binding) => binding.context.value?.trim() !== '[]',
}

/** Whether a node, or any string or template inside it, holds a word. */
function holdsWord(node: ts.Node): boolean {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return WORD.test(node.text)
  }
  if (ts.isTemplateExpression(node)) {
    const fixed = [node.head.text, ...node.templateSpans.map((span) => span.literal.text)]
    if (WORD.test(fixed.join(' '))) return true
  }
  return ts.forEachChild(node, (child) => (holdsWord(child) ? true : undefined)) === true
}

/** The name a property or a method is declared under. */
const declared = (node: ts.ObjectLiteralElementLike): string | undefined =>
  ts.isSpreadAssignment(node) ? undefined : node.name.getText().replace(/['"]/g, '')

/** The translation a value reads, `translations.triggerLabel` or `translations?.item?.(…)`. */
function translationRead(value: ts.Expression): string | undefined {
  let found: string | undefined
  const visit = (node: ts.Node): void => {
    if (
      ts.isPropertyAccessExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'translations'
    ) {
      found ??= node.name.text
    }
    ts.forEachChild(node, visit)
  }
  visit(value)
  return found
}

/**
 * What a machine's sources write, as `where — what` would name it: each
 * getter's naming attributes that hold a word or read a translation with an
 * English default, and each action that announces a word. `files` maps a
 * file's name to its text, as the installed `dist` holds them.
 */
function machineWords(machine: string, files: Readonly<Record<string, string>>): MachineWords {
  const parsed = Object.entries(files).map(([name, code]) =>
    ts.createSourceFile(name, code, ts.ScriptTarget.ESNext, true),
  )
  // The translations the machine has English defaults for.
  const defaults = new Set<string>()
  const implemented: string[] = []
  const getters: GetterWord[] = []
  const actions: SpokenAction[] = []
  for (const file of parsed) {
    const visit = (node: ts.Node): void => {
      if (
        ts.isVariableDeclaration(node) &&
        node.name.getText() === 'defaultTranslations' &&
        node.initializer !== undefined &&
        ts.isObjectLiteralExpression(node.initializer)
      ) {
        for (const property of node.initializer.properties) {
          const name = declared(property)
          if (name !== undefined && holdsWord(property)) defaults.add(name)
        }
      }
      if (
        ts.isPropertyAssignment(node) &&
        declared(node) === 'actions' &&
        ts.isObjectLiteralExpression(node.initializer) &&
        ts.isObjectLiteralExpression(node.parent) &&
        ts.isPropertyAssignment(node.parent.parent) &&
        declared(node.parent.parent) === 'implementations'
      ) {
        for (const action of node.initializer.properties) {
          const name = declared(action)
          if (name === undefined) continue
          implemented.push(name)
          const speak = (inner: ts.Node): void => {
            if (
              ts.isCallExpression(inner) &&
              ts.isPropertyAccessExpression(inner.expression) &&
              inner.expression.name.text === 'announce' &&
              inner.arguments[0] !== undefined &&
              holdsWord(inner.arguments[0])
            ) {
              actions.push({ machine, action: name, source: inner.arguments[0].getText() })
            }
            ts.forEachChild(inner, speak)
          }
          speak(action)
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(file)
  }
  for (const file of parsed) {
    const visit = (node: ts.Node, getter?: string): void => {
      const name = ts.isMethodDeclaration(node) ? node.name.getText() : undefined
      const within = name !== undefined && /^get\w+Props$/.test(name) ? name : getter
      if (ts.isPropertyAssignment(node) && within !== undefined) {
        const attribute = declared(node) ?? ''
        if (naming(attribute)) {
          const translation = translationRead(node.initializer)
          const word: GetterWord = {
            machine,
            getter: within,
            attribute,
            source: node.initializer.getText(),
          }
          if (translation !== undefined && defaults.has(translation)) {
            getters.push({ ...word, translation })
          } else if (
            translation === undefined &&
            literals(node.initializer).some((t) => WORD.test(t))
          ) {
            getters.push(word)
          }
        }
      }
      ts.forEachChild(node, (child) => visit(child, within))
    }
    visit(file)
  }
  return { getters, actions, implemented }
}

/** The installed machine's sources, from the Vue vocabulary's dependency on it. */
function installedMachine(machine: string): Record<string, string> {
  const require = createRequire(VOCABULARY_PACKAGE)
  const dist = dirname(require.resolve(`@zag-js/${machine}`))
  return Object.fromEntries(
    readdirSync(dist)
      .filter((name) => name.endsWith('.mjs'))
      .map((name) => [name, readFileSync(join(dist, name), 'utf8')]),
  )
}

/** Where a getter's call is spread: `api.getTriggerProps()`, or a part's `owner.api?.getItemProps(…)`. */
const GETTER_CALL = /\b(owner\.)?api\??\.(get\w+Props)\s*\(/g

/**
 * A getter's attribute copied onto another element:
 * `api.getAreaThumbProps()['aria-label']`.
 */
const COPIED =
  /\b(owner\.)?api\??\.(get\w+Props)\s*\((?:[^()]|\([^()]*\))*\)\s*(?:\[\s*['"]([\w-]+)['"]\s*\]|\??\.(\w+))/g

/**
 * Every word of a machine's that a description lets reach a person, as
 * `where — what`. `words` gives each machine's, by its name.
 */
function machineProse(
  shell: Described,
  where: string,
  words: (machine: string) => MachineWords,
): string[] {
  const findings = new Set<string>()
  // The member and each part: the machine `api` reads, the one `owner.api` reads, and the one
  // the unit binds itself, whose actions run.
  const units = [
    { name: '', api: shell.machine, own: shell.machine, template: shell.template },
    ...(shell.parts ?? []).map((part) => ({
      name: `${part.name} `,
      api: part.machine ?? shell.machine,
      own: part.machine,
      template: part.template,
    })),
  ]
  for (const unit of units) {
    const bindingOf = (owner: string | undefined) => (owner ? shell.machine : unit.api)
    const given = (binding: MachineBinding): Set<string> => {
      const source = binding.context.translations
      const keys = new Set<string>()
      if (source === undefined) return keys
      let value = parsed(source)
      while (ts.isParenthesizedExpression(value)) value = value.expression
      if (!ts.isObjectLiteralExpression(value)) return keys
      for (const property of value.properties) {
        if (ts.isPropertyAssignment(property) && readsWords(property.initializer)) {
          keys.add(declared(property) ?? '')
        }
      }
      return keys
    }
    const element = (node: Extract<DescribedNode, { kind: 'element' }>): void => {
      for (const spread of node.spread ?? []) {
        for (const [, owner, getter] of spread.matchAll(GETTER_CALL)) {
          const binding = bindingOf(owner)
          if (binding === undefined) continue
          for (const word of words(binding.of).getters) {
            if (word.getter !== getter) continue
            const set = node.attrs?.[word.attribute]
            if (set !== undefined && [...set.matchAll(COPIED)].length === 0) continue
            if (word.translation !== undefined && given(binding).has(word.translation)) continue
            findings.add(`${where} — ${unit.name}${binding.of} ${getter} ${word.attribute}`)
          }
        }
      }
      for (const [, value] of Object.entries(node.attrs ?? {})) {
        for (const [, owner, getter, bracket, dotted] of value.matchAll(COPIED)) {
          const binding = bindingOf(owner)
          const attribute = bracket ?? dotted
          if (binding === undefined) continue
          if (
            words(binding.of).getters.some(
              (word) => word.getter === getter && word.attribute === attribute,
            )
          ) {
            findings.add(`${where} — ${unit.name}${binding.of} ${getter} ${attribute}, copied`)
          }
        }
      }
    }
    const walk = (nodes: DescribedNode | readonly DescribedNode[] | undefined): void => {
      for (const node of ([] as DescribedNode[]).concat(nodes ?? [])) {
        switch (node.kind) {
          case 'element':
            element(node)
            walk(node.children)
            break
          case 'member':
            for (const content of Object.values(node.slots ?? {})) walk(content)
            break
          case 'slot':
            walk(node.fallback)
            break
          case 'if':
            for (const branch of node.branches) walk(branch.then)
            walk(node.otherwise)
            break
          case 'each':
          case 'portal':
            walk(node.children)
            break
          case 'text':
          case 'render':
            break
        }
      }
    }
    walk(unit.template)
    const binding = unit.own
    if (binding === undefined) continue
    const machine = words(binding.of)
    for (const action of machine.actions) {
      if (binding.without?.includes(action.action)) continue
      if (SPOKEN_WHEN[`${binding.of}.${action.action}`]?.(binding) === false) continue
      findings.add(`${where} — ${unit.name}${binding.of} ${action.action} speaks`)
    }
    for (const dropped of binding.without ?? []) {
      if (!machine.implemented.includes(dropped)) {
        findings.add(`${where} — ${unit.name}${binding.of} has no action ${dropped} to do without`)
      }
    }
  }
  return [...findings]
}

describe('no description lets a machine’s own words reach a person', async () => {
  const described = await readDescriptions()
  const bound = [
    ...new Set(
      described.flatMap(({ shell }) =>
        [shell.machine, ...(shell.parts ?? []).map((part) => part.machine)].flatMap((binding) =>
          binding === undefined ? [] : [binding.of],
        ),
      ),
    ),
  ].sort()
  const installed = new Map(bound.map((machine) => [machine, installedMachine(machine)]))
  const read = new Map(
    bound.map((machine) => {
      const found = machineWords(machine, installed.get(machine) ?? {})
      const keyed = KEYED_WORDS.filter((word) => word.machine === machine)
      return [machine, { ...found, getters: [...found.getters, ...keyed] }]
    }),
  )
  const words = (machine: string): MachineWords =>
    read.get(machine) ?? { getters: [], actions: [], implemented: [] }
  const findings = described.flatMap(({ file, shell }) => machineProse(shell, file, words))

  it('reads every machine a description binds, and the words each writes', () => {
    // A reading that found no words would always pass.
    expect(bound).toEqual(expect.arrayContaining(['color-picker', 'combobox', 'number-input']))
    expect(words('number-input').getters.map((word) => `${word.getter} ${word.attribute}`)).toEqual(
      [
        'getInputProps aria-roledescription',
        'getDecrementTriggerProps aria-label',
        'getIncrementTriggerProps aria-label',
      ],
    )
    expect(words('combobox').actions.map((action) => action.action)).toEqual([
      'announceHighlightedItem',
    ])
  })

  it('finds each word it lists by hand where the installed getter writes it', () => {
    const stale = KEYED_WORDS.filter((word) => {
      const files = installed.get(word.machine) ?? {}
      return !Object.values(files).some((code) =>
        machineWritten(code, word.getter, word.attribute, word.source),
      )
    })
    expect(stale).toEqual([])
  })

  it('finds no machine word a description leaves in place', () => {
    expect(findings).toEqual([])
  })
})

/** Whether `code` has `getter` write `attribute` with exactly `source`. */
function machineWritten(code: string, getter: string, attribute: string, source: string): boolean {
  const file = ts.createSourceFile('machine.mjs', code, ts.ScriptTarget.ESNext, true)
  let found = false
  const visit = (node: ts.Node, within?: string): void => {
    const name = ts.isMethodDeclaration(node) ? node.name.getText() : undefined
    const inside = name ?? within
    if (
      ts.isPropertyAssignment(node) &&
      inside === getter &&
      declared(node) === attribute &&
      node.initializer.getText() === source
    ) {
      found = true
    }
    ts.forEachChild(node, (child) => visit(child, inside))
  }
  visit(file)
  return found
}

describe('the reading of the machines’ words detects what reaches a person', () => {
  const CONNECT = `
    var defaultTranslations = { incrementLabel: "increment value", listLabel: undefined };
    function connect(service) {
      const translations = mergeWithDefault(defaultTranslations, prop("translations"));
      return {
        getInputProps() {
          return { "aria-roledescription": "numberfield", "aria-label": prop("aria-label") };
        },
        getIncrementTriggerProps() {
          return { "aria-label": translations.incrementLabel };
        },
        getListProps() {
          return { "aria-label": translations?.listLabel, title: channel };
        },
      };
    }`
  const MACHINE = `
    var machine = createMachine({
      implementations: {
        actions: {
          announceHighlightedItem({ refs }) {
            refs.get("liveRegion")?.announce(isSelected ? \`\${optionText}, selected\` : optionText);
          },
          announceValue({ refs }) {
            refs.get("liveRegion")?.announce(formatted);
          },
        },
      },
    });`
  const read = machineWords('probe', { 'probe.connect.mjs': CONNECT, 'probe.machine.mjs': MACHINE })
  const found = (shell: Described) =>
    machineProse(shell, 'fixture', () => read).map((line) => line.split(' — ')[1])
  const field = (
    attrs: Readonly<Record<string, string>> = {},
    spread = 'api.getInputProps()',
  ): DescribedNode => el('input', { spread: [spread], attrs })
  const bound = (
    template: DescribedNode | readonly DescribedNode[],
    machine: Partial<MachineBinding> = {},
  ): Described => ({ template, machine: { of: 'probe', context: {}, ...machine } })

  it('reads a word written as text and a translation with an English default, not a variable', () => {
    expect(read.getters.map((word) => `${word.getter} ${word.attribute}`)).toEqual([
      'getInputProps aria-roledescription',
      'getIncrementTriggerProps aria-label',
    ])
    expect(read.getters[1]?.translation).toBe('incrementLabel')
    expect(read.actions).toEqual([
      {
        machine: 'probe',
        action: 'announceHighlightedItem',
        source: 'isSelected ? `${optionText}, selected` : optionText',
      },
    ])
    expect(read.implemented).toEqual(['announceHighlightedItem', 'announceValue'])
  })

  it('catches a spread getter whose word the element leaves, and one copied onto another element', () => {
    const dropped = { without: ['announceHighlightedItem'] }
    expect(found(bound(field(), dropped))).toEqual(['probe getInputProps aria-roledescription'])
    expect(
      found(
        bound(
          el('input', { attrs: { 'aria-label': "api.getInputProps()['aria-roledescription']" } }),
          dropped,
        ),
      ),
    ).toEqual(['probe getInputProps aria-roledescription, copied'])
    expect(
      found(
        bound(
          field({ 'aria-roledescription': "api.getInputProps()['aria-roledescription']" }),
          dropped,
        ),
      ),
    ).toEqual([
      'probe getInputProps aria-roledescription',
      'probe getInputProps aria-roledescription, copied',
    ])
  })

  it('catches a translation the machine is not given, and an action the member keeps', () => {
    // The getters alone, so each finding below is the stepper's.
    const quiet = { ...read, actions: [] }
    const stepper = (machine: Partial<MachineBinding> = {}) =>
      machineProse(
        bound(field({}, 'api.getIncrementTriggerProps()'), machine),
        'fixture',
        () => quiet,
      ).map((line) => line.split(' — ')[1])
    expect(stepper()).toEqual(['probe getIncrementTriggerProps aria-label'])
    expect(stepper({ context: { translations: "{ incrementLabel: 'Up' }" } })).toEqual([
      'probe getIncrementTriggerProps aria-label',
    ])
    expect(found(bound([]))).toEqual(['probe announceHighlightedItem speaks'])
    expect(found(bound([], { without: ['announceItem'] }))).toEqual([
      'probe announceHighlightedItem speaks',
      'probe has no action announceItem to do without',
    ])
  })

  it('allows a word the element replaces, a translation from the member’s words and a dropped action', () => {
    const dropped = { without: ['announceHighlightedItem'] }
    expect(found(bound(field({ 'aria-roledescription': 'undefined' }), dropped))).toEqual([])
    expect(
      found(
        bound(field({}, 'api.getIncrementTriggerProps()'), {
          ...dropped,
          context: { translations: '{ incrementLabel: say.increment }' },
        }),
      ),
    ).toEqual([])
    // A combobox whose value is always empty says no option is selected, so its option's
    // label alone, which is the host's word.
    const combobox = machineWords('combobox', { 'combobox.machine.mjs': MACHINE })
    expect(
      machineProse(
        { template: [], machine: { of: 'combobox', context: { value: '[]' } } },
        'fixture',
        () => combobox,
      ),
    ).toEqual([])
  })

  it('reads a part’s own machine, and its owner’s through `owner.api`', () => {
    const parts: Described['parts'] = [
      {
        name: 'Panel',
        public: false,
        purpose: 'a part',
        template: [field({}, 'owner.api?.getInputProps() ?? {}')],
        machine: { of: 'other', context: {} },
      },
    ]
    expect(
      machineProse(
        { template: [], machine: { of: 'probe', context: {} }, parts },
        'fixture',
        (machine) =>
          machine === 'probe'
            ? { ...read, actions: [] }
            : { getters: [], actions: [], implemented: [] },
      ),
    ).toEqual(['fixture — Panel probe getInputProps aria-roledescription'])
  })
})
