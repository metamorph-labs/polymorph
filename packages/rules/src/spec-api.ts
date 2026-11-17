import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

import ts from 'typescript'

/**
 * The spec-staleness law: every shipped prop is declared by some spec.
 *
 * The specs are authoritative. `design/components/*.md` is where a member's API
 * is decided, what its implementation is built from, and what the next change
 * reads to check whether something already exists. When the code gains a prop
 * the spec does not name, the spec becomes wrong and nothing in the repo
 * notices. Finding such props by hand is unreliable.
 *
 * This file compares the two in both directions:
 *
 *  - **code-only**: a prop ships and no spec declares it. The system has a
 *    decision nobody wrote down.
 *  - **spec-only**: a spec declares a prop the code does not have. The spec
 *    promises an API that does not exist.
 *
 * Neither is forbidden, but both must be declared. A kept divergence goes in
 * `SPEC_API_EXEMPTIONS` with a reason, in the same shape as the contrast ledger
 * in `packages/theme/src/pairings.ts`. That ledger lists the places where a spec
 * and its code intentionally disagree, each with its reason.
 *
 * Both API formats in use are parsed: a markdown prop table (`dialog.md`) and a
 * fenced `ts` block (`data-table.md`, `toast.md`). A spec with both (`menu.md`
 * has a prop table and a fence for `MenuEntry`) is read from its table, because
 * the fence there documents a supporting type, not the component's props.
 */

/** One comparable pair: an exported prop type and the spec rows that describe it. */
export interface SpecApiSubject {
  /** `Table`, or `Table.Row` for a part of a compound component. */
  label: string
  /**
   * The prop type read: the exported type's name for a component (`TableProps`),
   * and for a part the type of its function's first parameter, as written
   * (`RowProps`, or `{ children?: ReactNode; }` for an inline one).
   */
  type: string
  /** The spec file, repo-relative. */
  spec: string
}

export interface SpecApiFinding {
  subject: string
  spec: string
  prop: string
  /** `code-only`: shipped but undeclared. `spec-only`: declared but not shipped. */
  direction: 'code-only' | 'spec-only'
}

/** A divergence the system keeps, and the reason for keeping it. */
export interface SpecApiExemption {
  subject: string
  prop: string
  reason: string
}

export interface SpecApiReport {
  subjects: SpecApiSubject[]
  findings: SpecApiFinding[]
  /**
   * Components the audit could not compare at all: no spec, no `## API`
   * section, no exported prop type, or a spec naming a part nothing declares.
   * These are reported so the law never silently skips a component.
   */
  unresolved: string[]
}

/**
 * Props the conventions own, so no component spec repeats them.
 *
 * `children` belongs to React, not to the vocabulary. `FormField` and
 * `SettingsRow` set the four ARIA props from outside. A control that can be
 * named by a label elsewhere on the page needs them, and repeating that in every
 * spec would add the same four rows each time.
 *
 * This is an exact list, not an `aria-*` prefix, because a fifth ARIA prop is a
 * design decision and must be written down.
 */
export const PROP_ALLOWLIST: readonly string[] = [
  'children',
  'aria-label',
  'aria-labelledby',
  'aria-describedby',
  'aria-required',
]

/**
 * Spec files whose name is not the component's.
 *
 * `radio.md` specifies the group. The component that ships is `RadioGroup`,
 * because a single radio is not a control. This is one override, not a mapping
 * table. Everything else matches by name.
 */
export const SPEC_FILE_OVERRIDES: Readonly<Record<string, string>> = { RadioGroup: 'radio' }

/**
 * Prop types whose name is not `<Component>Props`.
 *
 * `Toast` is a gallery entry with no component behind it. The API is
 * `toast(options)` and a `<ToastHost>` mounted once, so the props under test are
 * the options object.
 */
export const PROP_TYPE_OVERRIDES: Readonly<Record<string, string>> = { Toast: 'ToastOptions' }

/**
 * The ledger: every divergence that ships, and why it is allowed.
 *
 * These are the known gaps between the specs and the code, not a list of bugs.
 * Each entry is a real prop in real code that a real spec does not name, and
 * each needs a design decision: amend the spec, or remove the prop. The person
 * building cannot make that decision (a spec's API table is a design decision),
 * so the gap is declared here, and an undeclared gap fails the law. An entry is
 * removed when the spec and the code agree, as its reason requires. A spec
 * written before its implementation may list its props here until they ship.
 */
export const SPEC_API_EXEMPTIONS: readonly SpecApiExemption[] = [
  {
    subject: 'Grid',
    prop: 'align',
    reason:
      'Cross-axis alignment shipped with the primitive; grid.md stops at columns, spacing and `as`, ' +
      'and its only note about what Grid does not do is about areas and spans.',
  },
  {
    subject: 'Select',
    prop: 'defaultOpen',
    reason:
      'Opens on mount so a gallery cell and a browser test can show the open state. No screen sets ' +
      'it and no spec names it — the same affordance as Menu and Tooltip, spec-less in all three.',
  },
  {
    subject: 'Menu',
    prop: 'defaultOpen',
    reason:
      'Opens on mount so a gallery cell and a browser test can show the open state. No screen sets ' +
      'it and no spec names it — the same affordance as Select and Tooltip, spec-less in all three.',
  },
  {
    subject: 'Tooltip',
    prop: 'defaultOpen',
    reason:
      'Opens on mount so a gallery cell and a browser test can show the open state. No screen sets ' +
      'it and no spec names it — the same affordance as Select and Menu, spec-less in all three.',
  },
  {
    subject: 'Breadcrumbs',
    prop: 'defaultOpen',
    reason:
      "Opens the overflow Menu on mount, which breadcrumbs.md's own States table asks for — the " +
      '"overflow open" entry is specified as `defaultOpen` on the menu, and the API table it would ' +
      'be declared in stops at `items` and `maxItems`. Same affordance as Select, Menu and Tooltip.',
  },
  {
    subject: 'Combobox',
    prop: 'defaultOpen',
    reason:
      'Opens on mount so a gallery cell and a browser test can show the open state. No screen sets ' +
      'it and no spec names it — the same affordance as Select, Menu and Tooltip, spec-less in all four.',
  },
  {
    subject: 'DatePicker',
    prop: 'defaultOpen',
    reason:
      'Opens on mount so a gallery cell and a browser test can show the calendar. No screen sets it ' +
      'and no spec names it — the same affordance as Select, Menu, Tooltip and Combobox.',
  },
  {
    subject: 'DatePicker',
    prop: 'placeholder-less',
    reason:
      "date-picker.md's size row reads ``size` / `placeholder-less`` — the second half is prose about " +
      'the field having no free-text placeholder (its empty segments show their own patterns), not a ' +
      'prop. The parser cannot tell an identifier in a prop column from a sentence in one.',
  },
  {
    subject: 'SearchInput',
    prop: 'defaultValue',
    reason:
      'search-input.md writes its inherited surface as `value / onChange / placeholder / size / disabled` ' +
      '— five props "as Input". The uncontrolled half of that pair ships anyway.',
  },
  {
    subject: 'SearchInput',
    prop: 'id',
    reason:
      'Form plumbing inherited from Input, which does name it. search-input.md enumerates the five ' +
      'props it borrows and stops there, so the borrowing is narrower on paper than in code.',
  },
  {
    subject: 'SearchInput',
    prop: 'name',
    reason:
      'Form plumbing inherited from Input, which does name it. search-input.md enumerates the five ' +
      'props it borrows and stops there, so the borrowing is narrower on paper than in code.',
  },
  {
    subject: 'Textarea',
    prop: 'defaultValue',
    reason:
      'textarea.md lists nine props "as Input" and `defaultValue` is not among them, though Input ' +
      'ships the controlled/uncontrolled pair together and so does this.',
  },
  {
    subject: 'Textarea',
    prop: 'autosize',
    reason:
      'A field that grows under the caret moves everything below it — a real decision, argued in the ' +
      "prop's own doc comment, and absent from textarea.md's table entirely.",
  },
  {
    subject: 'Table',
    prop: 'grid',
    reason:
      'The grid keyboard model is specified in data-table.md, which consumes it. table.md owns the ' +
      'prop and does not specify it, so that spec still calls itself "not a data grid".',
  },
  {
    subject: 'Table',
    prop: 'multiselectable',
    reason:
      'Part of the same grid model, specified in data-table.md and not in table.md, which is the ' +
      'spec that owns the prop it lives on.',
  },
  {
    subject: 'Table',
    prop: 'label',
    reason:
      'Names the scroll region for a keyboard reader. Part of the grid model; table.md lists ' +
      'only `stickyHeader` on the root and has no row for it.',
  },
  {
    subject: 'Table.Row',
    prop: 'onClick',
    reason:
      'data-table.md specifies `onRowClick` on the assembly; the row-level handler it ' +
      'delegates to is on Table.Row, and table.md still lists only `interactive` and `selected`.',
  },
  {
    subject: 'TagInput',
    prop: 'allowDuplicates',
    reason:
      'tag-input.md tables it with the type `false` and the default "fixed" — a row documenting ' +
      'a *settled behaviour* (duplicates re-flash the existing chip) rather than a prop. Shipping it ' +
      'would offer a choice the same row denies, so the behaviour ships and the prop does not.',
  },
  {
    subject: 'FileUpload',
    prop: 'name',
    reason:
      'file-upload.md asks for it in prose — "the hidden `<input type="file">` carries `name` ' +
      'for native form posts" — and never adds the row to its API table. The prop ships, because a ' +
      'field that cannot post is a field with a hole in it; the table is what needs the amendment.',
  },
  {
    subject: 'DateRangePicker',
    prop: 'defaultOpen',
    reason:
      "Opens on mount so a gallery cell and a browser test can show the open grid — the spec's own " +
      'States table renders three entries with it, and the API table it would be declared in stops ' +
      'at the field surface. Same affordance as Select, Menu, Tooltip, Combobox and DatePicker.',
  },
  {
    subject: 'MultiSelect',
    prop: 'defaultOpen',
    reason:
      "Opens on mount so a gallery cell and a browser test can show the open states the spec's own " +
      'States table renders, and the API table it would be declared in stops at the field surface. ' +
      'Same affordance as Select, Menu, Tooltip, Combobox, DatePicker and DateRangePicker.',
  },
  {
    subject: 'SplitButton',
    prop: 'defaultOpen',
    reason:
      "Opens on mount so a gallery cell and a browser test can show the open panel — the spec's own " +
      'States table renders two entries with it, and the API table it would be declared in stops at ' +
      'the control surface. Same affordance as Select, Menu, Tooltip, Combobox and the pickers.',
  },
  {
    subject: 'HoverCard',
    prop: 'defaultOpen',
    reason:
      "Opens on mount so a gallery cell and a browser test can show the preview — the spec's own " +
      'prose names the mechanism ("fixtures reach the open state via Radix `defaultOpen`, exactly ' +
      'as Tooltip\'s do") and its API table stops at children/content/side/align.',
  },
]

const EXEMPT = new Set(SPEC_API_EXEMPTIONS.map((entry) => `${entry.subject}.${entry.prop}`))

export function isExemptFromSpecApi(subject: string, prop: string): boolean {
  return EXEMPT.has(`${subject}.${prop}`)
}

/** `Table.grid`: the identifier form both the failure message and the ledger use. */
export function findingId(finding: SpecApiFinding): string {
  return `${finding.subject}.${finding.prop}`
}

/** Where the specs live, in the order a component's name is looked up. */
const SPEC_DIRS = ['design/components', 'design/archetypes']

/** The registry the subject list is read from: the index of every states fixture. */
const REGISTRY = 'GALLERIES'

// --- the specs ------------------------------------------------------------

/**
 * The lines of the `## API` section, or `null` when a spec has none.
 *
 * Matched on the word, not the exact heading, because the archetypes use
 * `## Anatomy & API`: for a page, the structure and the props are one topic.
 */
export function apiSection(markdown: string): string[] | null {
  const lines = markdown.split('\n')
  const start = lines.findIndex((line) => /^##\s.*\bAPI\b/.test(line))
  if (start === -1) return null
  const rest = lines.slice(start + 1)
  const end = rest.findIndex((line) => /^##\s/.test(line))
  return end === -1 ? rest : rest.slice(0, end)
}

/** A heading that names a part of `component`: `## AppShell.NavItem` gives `AppShell.NavItem`. */
function partHeading(line: string, component: string): string | null {
  const match = /^#{2,6}\s+`?([A-Za-z]\w*\.[A-Z]\w*)`?\s*$/.exec(line)
  return match?.[1]?.startsWith(`${component}.`) ? match[1] : null
}

/**
 * The lines under each heading that names a part of `component`
 * (`## AppShell.NavItem`), up to the next heading of any level. A part with a
 * long specification gets its own section, and its props table or its fence
 * is there instead of in `## API`.
 */
function partSections(markdown: string, component: string): Map<string, string[]> {
  const sections = new Map<string, string[]>()
  let current: string[] | null = null
  for (const line of markdown.split('\n')) {
    if (/^#{1,6}\s/.test(line)) {
      const label = partHeading(line, component)
      current = null
      if (label !== null) sections.set(label, (current = []))
      continue
    }
    current?.push(line)
  }
  return sections
}

/** `onChange(value)` and `value: string` both name one prop. */
function propName(cell: string): string {
  return cell.replace(/[(:?].*$/, '').trim()
}

export interface ParsedSpecApi {
  /** Component label (the root, or `Table.Row`) → the props its rows declare. */
  byLabel: Map<string, Set<string>>
  /** Every fenced code block in the section, in order. */
  fences: string[]
}

/**
 * Reads an API section's prop tables and code fences.
 *
 * A table row belongs to the component named in its `Component` column, which
 * is filled in only when it changes. `table.md` lists four components in one
 * table and leaves the cell empty for continuation rows. Without a `Component`
 * column, every row belongs to the spec's own component.
 */
export function parseSpecApi(lines: string[], rootLabel: string): ParsedSpecApi {
  const byLabel = new Map<string, Set<string>>()
  const fences: string[] = []
  let fence: string[] | null = null
  let header: string[] | null = null
  let label = rootLabel

  for (const line of lines) {
    if (/^\s*```/.test(line)) {
      if (fence === null) fence = []
      else {
        fences.push(fence.join('\n'))
        fence = null
      }
      continue
    }
    if (fence !== null) {
      fence.push(line)
      continue
    }
    if (!/^\s*\|/.test(line)) {
      // A blank line or prose ends the table, so the next one gets its own header.
      header = null
      continue
    }

    // Escaped pipes are type unions inside a cell (`'asc' \| 'desc'`), not columns.
    const cells = line
      .split(/(?<!\\)\|/)
      .slice(1, -1)
      .map((cell) => cell.trim())
    if (cells.every((cell) => /^-+$/.test(cell))) continue
    if (header === null) {
      header = cells
      label = rootLabel
      continue
    }

    const propAt = header.findIndex((cell) => /^prop$/i.test(cell))
    if (propAt === -1) continue
    const componentAt = header.findIndex((cell) => /^component$/i.test(cell))
    if (componentAt !== -1) {
      const named = (cells[componentAt] ?? '').replace(/`/g, '').trim()
      if (named) label = named
    }

    for (const match of (cells[propAt] ?? '').matchAll(/`([^`]+)`/g)) {
      const name = propName(match[1] ?? '')
      // The prop column sometimes holds an inline type. A prop is an identifier.
      if (!/^[A-Za-z_$][\w$-]*$/.test(name)) continue
      let props = byLabel.get(label)
      if (!props) byLabel.set(label, (props = new Set()))
      props.add(name)
    }
  }

  return { byLabel, fences }
}

function collectMembers(members: ts.NodeArray<ts.TypeElement>, into: Set<string>): void {
  for (const member of members) {
    if (!ts.isPropertySignature(member) && !ts.isMethodSignature(member)) continue
    if (member.name) into.add(member.name.getText().replace(/['"]/g, ''))
  }
}

/**
 * The props a section's `ts` fences declare, split by how certain they are.
 *
 * `named` comes from the block that names its type (`interface DataTableProps`),
 * which is unambiguous. `loose` is every other shape in the fences. That is how
 * `toast.md` is read: its API is a call signature, `toast(options: { … })`, and
 * the options object is the only shape in it.
 *
 * Shapes are read outermost-first and their members are not descended into, so
 * `action?: { label, onClick }` contributes `action` and not `label`.
 */
export function fenceProps(
  fences: string[],
  typeName: string,
): { named: Set<string>; loose: Set<string> } {
  const named = new Set<string>()
  const loose = new Set<string>()

  for (const code of fences) {
    const source = ts.createSourceFile(
      'spec.ts',
      code,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    )
    const walk = (node: ts.Node): void => {
      if (ts.isInterfaceDeclaration(node)) {
        collectMembers(node.members, node.name.text === typeName ? named : loose)
        return
      }
      if (ts.isTypeLiteralNode(node)) {
        collectMembers(node.members, loose)
        return
      }
      if (ts.isObjectLiteralExpression(node)) {
        // A fence that is a signature, not a declaration, does not parse as types.
        // TypeScript recovers the options object as an object literal.
        for (const property of node.properties) {
          if (property.name) loose.add(property.name.getText().replace(/['"]/g, ''))
        }
        return
      }
      ts.forEachChild(node, walk)
    }
    walk(source)
  }

  return { named, loose }
}

/**
 * The spec file for a component, matched on name ignoring separators and case:
 * `DataTable` finds `data-table.md`. It intentionally does not reuse
 * `gallerySlug`'s rule. That function owns the route, and copying its rule here
 * would define the kebab-case convention in a second place.
 */
function findSpec(root: string, component: string): string | null {
  const wanted = component.replace(/[^a-z0-9]/gi, '').toLowerCase()
  for (const dir of SPEC_DIRS) {
    const full = resolve(root, dir)
    if (!existsSync(full)) continue
    for (const file of readdirSync(full).sort()) {
      if (!file.endsWith('.md')) continue
      const base = file.slice(0, -3)
      if (base.replace(/[^a-z0-9]/gi, '').toLowerCase() === wanted) return `${dir}/${file}`
    }
  }
  return null
}

// --- the code -------------------------------------------------------------

function compilerOptions(uiDir: string): ts.CompilerOptions {
  const { config } = ts.readConfigFile(resolve(uiDir, 'tsconfig.json'), ts.sys.readFile)
  return { ...ts.parseJsonConfigFileContent(config, ts.sys, uiDir).options, noEmit: true }
}

function unwrap(node: ts.Expression | undefined): ts.Expression | undefined {
  let current = node
  while (
    current &&
    (ts.isAsExpression(current) ||
      ts.isSatisfiesExpression(current) ||
      ts.isParenthesizedExpression(current))
  ) {
    current = current.expression
  }
  return current
}

function resolveAlias(checker: ts.TypeChecker, symbol: ts.Symbol): ts.Symbol {
  return symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol
}

/** The type of a value, or `null` for a symbol that declares no value. */
function valueOf(checker: ts.TypeChecker, symbol: ts.Symbol): ts.Type | null {
  const resolved = resolveAlias(checker, symbol)
  const declaration = resolved.valueDeclaration
  return declaration ? checker.getTypeOfSymbolAtLocation(resolved, declaration) : null
}

/** A compound member's part, as its export carries it. */
export interface CompoundPart {
  /** The property of the member's export that holds it: `Row` for `Table.Row`. */
  name: string
  /** The type of the part's first parameter, its props. `null` for a part that takes none. */
  props: ts.Type | null
}

/**
 * A member's compound parts, read from its export. `Object.assign(Root, { Row })`
 * and `AppShell.NavItem = NavItem` both give the exported value a property that
 * is a component. A part is a callable property named in PascalCase, as a
 * component is, so a wrapper's own callables are not parts: `React.memo` gives
 * its result a `type`. The registry's `parts` and this law's subjects both come
 * from here, so the two cannot list different parts.
 */
export function compoundParts(checker: ts.TypeChecker, symbol: ts.Symbol): CompoundPart[] {
  const value = valueOf(checker, symbol)
  if (value === null) return []
  return checker.getPropertiesOfType(value).flatMap((property) => {
    if (!/^[A-Z][A-Za-z0-9]*$/.test(property.name)) return []
    const type = valueOf(checker, property)
    const [signature] =
      type === null ? [] : checker.getSignaturesOfType(type, ts.SignatureKind.Call)
    if (signature === undefined) return []
    const [parameter] = signature.parameters
    return [{ name: property.name, props: parameter ? checker.getTypeOfSymbol(parameter) : null }]
  })
}

/** The `component` name a states fixture declares, read from the fixture's source. */
function fixtureComponent(checker: ts.TypeChecker, element: ts.Expression): string | null {
  const symbol = checker.getSymbolAtLocation(element)
  if (!symbol) return null
  const declaration = resolveAlias(checker, symbol).valueDeclaration
  if (!declaration || !ts.isVariableDeclaration(declaration)) return null
  const object = unwrap(declaration.initializer)
  if (!object || !ts.isObjectLiteralExpression(object)) return null
  for (const property of object.properties) {
    if (!ts.isPropertyAssignment(property)) continue
    if (property.name.getText() !== 'component') continue
    if (ts.isStringLiteral(property.initializer)) return property.initializer.text
  }
  return null
}

/**
 * The subject list, read from `GALLERIES` instead of written out here.
 *
 * It is read statically through the checker. Importing the registry would load
 * React, Radix and every stylesheet into a node test to get forty-four strings.
 * A component added to the vocabulary is covered by this law in the same commit,
 * which a hand-maintained list cannot guarantee.
 */
function galleryComponents(program: ts.Program, checker: ts.TypeChecker, file: string): string[] {
  const source = program.getSourceFile(file)
  if (!source) return []
  const found: string[] = []
  for (const statement of source.statements) {
    if (!ts.isVariableStatement(statement)) continue
    for (const declaration of statement.declarationList.declarations) {
      if (declaration.name.getText() !== REGISTRY) continue
      const array = unwrap(declaration.initializer)
      if (!array || !ts.isArrayLiteralExpression(array)) continue
      for (const element of array.elements) {
        const name = fixtureComponent(checker, element)
        if (name) found.push(name)
      }
    }
  }
  return found
}

/**
 * Every public prop of a prop type.
 *
 * Unions are walked and merged, not intersected. `SkeletonProps` is a union with
 * one member per shape, and `textStep` is public although only the text member
 * has it. The checker's own view of a union reports only the two props every
 * member shares, which would look like a spec declaring three props that do not
 * exist.
 */
function publicProps(checker: ts.TypeChecker, type: ts.Type): Set<string> {
  const names = new Set<string>()
  const visit = (each: ts.Type): void => {
    if (each.isUnion()) {
      for (const part of each.types) visit(part)
      return
    }
    for (const property of checker.getPropertiesOfType(each)) names.add(property.name)
  }
  visit(type)
  return names
}

// --- the audit ------------------------------------------------------------

/**
 * Diffs every gallery component's prop type against its spec's API section.
 *
 * Exemptions are not applied here. The audit reports the facts and the law
 * decides what is allowed, so a ledger entry that stops matching anything is
 * visible instead of silently unused.
 */
export function auditSpecApi(root: string): SpecApiReport {
  const uiDir = resolve(root, 'packages/react-ui')
  const indexFile = resolve(uiDir, 'src/index.ts')
  const galleriesFile = resolve(uiDir, 'src/galleries.ts')

  const program = ts.createProgram({
    rootNames: [indexFile, galleriesFile],
    options: compilerOptions(uiDir),
  })
  const checker = program.getTypeChecker()

  const index = program.getSourceFile(indexFile)
  const indexSymbol = index && checker.getSymbolAtLocation(index)
  const exported = new Map<string, ts.Symbol>(
    indexSymbol
      ? checker.getExportsOfModule(indexSymbol).map((symbol) => [symbol.name, symbol])
      : [],
  )

  const allowed = new Set(PROP_ALLOWLIST)
  const subjects: SpecApiSubject[] = []
  const findings: SpecApiFinding[] = []
  const unresolved: string[] = []

  for (const component of galleryComponents(program, checker, galleriesFile)) {
    const base = SPEC_FILE_OVERRIDES[component] ?? component
    const spec = findSpec(root, base)
    if (!spec) {
      unresolved.push(`${component}: no spec file under ${SPEC_DIRS.join(' or ')}`)
      continue
    }

    const markdown = readFileSync(join(root, spec), 'utf8')
    const lines = apiSection(markdown)
    if (!lines) {
      unresolved.push(`${component}: ${spec} has no API section`)
      continue
    }

    const { byLabel, fences } = parseSpecApi(lines, component)
    const typeName = PROP_TYPE_OVERRIDES[component] ?? `${component}Props`
    const rootType = exported.get(typeName)
    // Each comparison: the subject, the props its code has, and the fences that
    // may declare them, with the type name a fence would declare.
    const comparisons: {
      subject: SpecApiSubject
      code: Set<string>
      fences: string[]
      named: string
    }[] = []
    if (rootType) {
      comparisons.push({
        subject: { label: component, type: typeName, spec },
        code: publicProps(
          checker,
          checker.getDeclaredTypeOfSymbol(resolveAlias(checker, rootType)),
        ),
        fences,
        named: typeName,
      })
    } else {
      unresolved.push(
        `${component}: \`${typeName}\` is not exported by the vocabulary's entry point`,
      )
    }

    // A part's rows are in `## API` under a `Component` column, or in a section
    // headed with the part's name.
    const sections = partSections(markdown, component)
    const value = exported.get(component)
    const parts = value ? compoundParts(checker, value) : []
    for (const part of parts) {
      const label = `${component}.${part.name}`
      const section = parseSpecApi(sections.get(label) ?? [], label)
      for (const [described, props] of section.byLabel) {
        byLabel.set(described, new Set([...(byLabel.get(described) ?? []), ...props]))
      }
      comparisons.push({
        subject: {
          label,
          type: part.props === null ? 'no parameter' : checker.typeToString(part.props),
          spec,
        },
        code: part.props === null ? new Set() : publicProps(checker, part.props),
        fences: section.fences,
        named: part.props?.aliasSymbol?.name ?? part.props?.getSymbol()?.name ?? '',
      })
    }

    const known = new Set([component, ...parts.map((part) => `${component}.${part.name}`)])
    for (const label of new Set([...byLabel.keys(), ...sections.keys()])) {
      if (!known.has(label)) unresolved.push(`${component}: ${spec} describes an unknown ${label}`)
    }

    for (const comparison of comparisons) {
      const { label } = comparison.subject
      const { code } = comparison
      subjects.push(comparison.subject)

      // A fence naming the type takes precedence. Otherwise fences define the
      // props only when there is no table, as in `toast.md`.
      const declared = new Set(byLabel.get(label) ?? [])
      const { named, loose } = fenceProps(comparison.fences, comparison.named)
      for (const prop of named.size > 0 ? named : declared.size > 0 ? [] : loose) {
        declared.add(prop)
      }

      for (const prop of code) {
        if (!declared.has(prop) && !allowed.has(prop)) {
          findings.push({ subject: label, spec, prop, direction: 'code-only' })
        }
      }
      for (const prop of declared) {
        if (!code.has(prop) && !allowed.has(prop)) {
          findings.push({ subject: label, spec, prop, direction: 'spec-only' })
        }
      }
    }
  }

  return { subjects, findings, unresolved }
}
