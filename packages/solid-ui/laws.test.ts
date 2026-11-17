import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

import ts from 'typescript'
import { describe, expect, it } from 'vitest'

import { buildRegistry, type Registry } from '@polymorph/registry'
import { vueBinding } from '@polymorph/registry/frameworks'
import { verifyCode } from '@polymorph/rules/verify'
import {
  describedMembers,
  gridEntries,
  isPrimitive,
  partProps,
  registryMember,
  solidComponentPath,
  solidPartPath,
  solidStatesPath,
  type MemberShell,
} from '@polymorph/shells'

/**
 * The Solid vocabulary's laws that read files and the registry, in node.
 *
 *  - **Completeness.** Every entry the React fixture names (the spec's States
 *    rows) and every cell of the lawful grid has an entry of the same name in
 *    the member's Solid fixture. The browser law (`src/laws.test.ts`) renders
 *    each one.
 *  - **Spec staleness.** Each generated component's props interface names the
 *    registry's props, by their React names: a Solid member takes a callback
 *    and a node as props, as a React member does. Each prop is of the kind
 *    `vueBinding` reads it as: an event or a render prop is a function, and a
 *    node prop is a `JSX.Element`. A prop the registry lists under a compound
 *    part's name (`Group.title` under SettingsRow) is the part's component's,
 *    not the member's, and every such part is described.
 *  - **The framework map.** A member is `native` in `design/frameworks/solid.json`
 *    exactly when it has a description, and so a generated shell.
 *  - **Token-only.** A shell imports only Solid, its machine, the foundation,
 *    its recipe and other shells; every `class` reads a recipe and names no
 *    class as a string; a `style` holds no colour or length; and the rest of
 *    the file passes `no-raw-styles`, so a colour or a length cannot be written
 *    into one. The foundation's generated `Icon.tsx` is held to the same law,
 *    with the gateway, its conventions and the engine's types as its imports.
 */

const ROOT = resolve(import.meta.dirname, '../..')
const SRC = resolve(import.meta.dirname, 'src')
/** The foundation's one generated component, `Icon.tsx`, which ships beside the gateway it draws through. */
const ICON = resolve(ROOT, 'packages/solid/src/icon/Icon.tsx')

const registry: Registry = buildRegistry(ROOT)
const MEMBERS: MemberShell[] = await describedMembers(registry)

/** A source file, parsed as TSX. */
const parse = (path: string, text = readFileSync(path, 'utf8')) =>
  ts.createSourceFile(path, text, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TSX)

/** Each key of the props interface a generated component declares (`export interface XProps`), with its type's text. */
function declaredTypes(path: string, component: string): Map<string, string> {
  const source = parse(resolve(ROOT, path))
  for (const statement of source.statements) {
    if (ts.isInterfaceDeclaration(statement) && statement.name.text === `${component}Props`) {
      return new Map(
        statement.members.map((entry) => [
          entry.name?.getText(source).replace(/^'|'$/g, '') ?? '',
          ts.isPropertySignature(entry) ? (entry.type?.getText(source) ?? '') : '',
        ]),
      )
    }
  }
  throw new Error(`${path} declares no ${component}Props`)
}

/** The keys of the props interface a generated component declares. */
const declared = (path: string, component: string): string[] =>
  [...declaredTypes(path, component).keys()].sort()

/**
 * The props of a generated component whose type is not of the kind
 * `vueBinding` reads the registry's prop as: an event (`onFoo`) or a render
 * prop is a function, and a node prop is a `JSX.Element`.
 */
function misbound(
  path: string,
  component: string,
  props: readonly { name: string; type: string }[],
): string[] {
  const types = declaredTypes(path, component)
  return props.flatMap((prop) => {
    const kind = vueBinding(prop).kind
    const type = (types.get(prop.name) ?? '').replace(/\s+/g, ' ')
    const lawful =
      kind === 'event' || kind === 'scoped-slot'
        ? type.includes('=>')
        : kind === 'slot'
          ? type === 'JSX.Element'
          : true
    return lawful ? [] : [`${prop.name} (${kind}): ${type}`]
  })
}

describe('completeness — every spec States row and lawful grid cell has a Solid entry', () => {
  for (const shell of MEMBERS) {
    it(shell.member, () => {
      const component = registry.components.find((candidate) => candidate.name === shell.member)
      const grid = gridEntries(shell, registryMember(registry, shell.member))
      const names = new Set([
        ...grid.map((entry) => entry.name),
        ...shell.states.map((entry) => entry.name),
      ])
      expect(names.size, 'entry names are unique').toBe(grid.length + shell.states.length)
      const missing = (component?.states ?? []).filter((name) => !names.has(name))
      expect(missing, `${shell.member}: React fixture entries with no Solid entry`).toEqual([])
      const cells = Object.entries(component?.grid ?? {}).flatMap(([variant, tones]) =>
        tones.map((tone) => `${variant} / ${tone}`),
      )
      expect(
        cells.filter((cell) => !names.has(cell)),
        `${shell.member}: lawful cells`,
      ).toEqual([])
    })
  }
})

describe('spec staleness — a shell’s props are the registry’s, by their React names', () => {
  for (const shell of MEMBERS) {
    it(shell.member, () => {
      const component = registryMember(registry, shell.member)
      const own = component.props.filter((prop) => !prop.name.includes('.'))
      const path = solidComponentPath(shell)
      expect(declared(path, shell.member)).toEqual(own.map((prop) => prop.name).sort())
      expect(misbound(path, shell.member, own), 'each prop of its kind').toEqual([])
      for (const part of shell.parts ?? []) {
        const listed = partProps(component, part.name)
        if (listed.length === 0) continue
        const partFile = solidPartPath(shell, part.name)
        const name = `${shell.member}${part.name}`
        expect(declared(partFile, name), `${shell.member}.${part.name}`).toEqual(
          listed.map((prop) => prop.name).sort(),
        )
        expect(misbound(partFile, name, listed), `${shell.member}.${part.name}`).toEqual([])
      }
    })
  }

  it('reads every part the registry lists under a member as one of its described parts', () => {
    for (const shell of MEMBERS) {
      const names = new Set(
        registryMember(registry, shell.member)
          .props.filter((prop) => prop.name.includes('.'))
          .map((prop) => prop.name.split('.')[0] as string),
      )
      const described = new Set((shell.parts ?? []).map((part) => part.name))
      expect(
        [...names].filter((name) => !described.has(name)),
        shell.member,
      ).toEqual([])
    }
  })

  it('reads a prop of the wrong kind as misbound', () => {
    const probe = solidComponentPath(
      MEMBERS.find((shell) => shell.member === 'Checkbox') as MemberShell,
    )
    expect(
      misbound(probe, 'Checkbox', [
        { name: 'onCheckedChange', type: '(checked: boolean) => void' },
        { name: 'aria-label', type: 'string' },
      ]),
    ).toEqual([])
    expect(misbound(probe, 'Checkbox', [{ name: 'aria-label', type: 'ReactNode' }])).toEqual([
      'aria-label (slot): string',
    ])
  })

  it('reads a prop interface from a generated file', () => {
    const probe = resolve(
      ROOT,
      solidComponentPath(MEMBERS.find((shell) => shell.member === 'Checkbox') as MemberShell),
    )
    expect(declared(relative(ROOT, probe), 'Checkbox')).toContain('aria-label')
    expect(declared(relative(ROOT, probe), 'Checkbox')).toContain('onCheckedChange')
  })
})

describe('the framework map — native in solid.json exactly where a shell is generated', () => {
  it('marks every described member native, and nothing else', () => {
    const map = JSON.parse(readFileSync(resolve(ROOT, 'design/frameworks/solid.json'), 'utf8')) as {
      members: Record<string, { status: string; reason?: string }>
    }
    const native = Object.entries(map.members)
      .filter(([, entry]) => entry.status === 'native')
      .map(([name]) => name)
      .sort()
    expect(native).toEqual(MEMBERS.map((shell) => shell.member).sort())
  })

  it('generates a component for every description, and a states fixture for every member', () => {
    for (const shell of MEMBERS) {
      expect(() => statSync(resolve(ROOT, solidComponentPath(shell))), shell.member).not.toThrow()
      if (isPrimitive(registry, shell.member)) continue
      expect(() => statSync(resolve(ROOT, solidStatesPath(shell))), shell.member).not.toThrow()
    }
  })
})

/** Every generated component under the vocabulary's source: its `.tsx` files but the fixtures and tests. */
function components(dir: string = SRC): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return name === 'conformance' ? [] : components(path)
    return name.endsWith('.tsx') && !/\.(states|test)\.tsx$/.test(name) ? [path] : []
  })
}

const LAWFUL_IMPORT =
  /^(solid-js|solid-js\/web|@zag-js\/[a-z-]+|@polymorph\/solid|@polymorph\/solid\/motion|@polymorph\/recipes\/([a-z0-9-]+\/)+[a-z0-9-]+\.module\.css|\.{1,2}\/([a-z-]+\/)?[A-Z][A-Za-z]+)$/

/**
 * Inside the foundation, `Icon.tsx` cannot import the foundation's index,
 * which imports it back: it reads the gateway and its stylesheet beside it,
 * the conventions it is generated against, and the engine's types.
 */
const LAWFUL_IN_FOUNDATION =
  /^(solid-js|\.\/Glyph|\.\/icon\.module\.css|\.\.\/conventions\/[a-z-]+|@polymorph\/engine)$/

/** Every module a file imports, read as TypeScript, so an import written over several lines is read. */
function importsOf(source: ts.SourceFile): string[] {
  return source.statements.flatMap((statement) =>
    (ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement)) &&
    statement.moduleSpecifier !== undefined &&
    ts.isStringLiteral(statement.moduleSpecifier)
      ? [statement.moduleSpecifier.text]
      : [],
  )
}

/** A `class` or `style` a file writes, and what stands in its place when the rest is linted. */
interface Binding {
  kind: 'class' | 'style'
  text: string
  range: [number, number]
  /** An attribute is left out; a key of an object keeps its place with no value. */
  blank: string
}

/**
 * The class and style a file writes: every `class` and `style` attribute, and
 * every `class` and `style` key of an object a machine's getters merge with,
 * each as its expression's text and its range in the file.
 */
function bindings(source: ts.SourceFile): Binding[] {
  const found: Binding[] = []
  const visit = (node: ts.Node) => {
    if (ts.isJsxAttribute(node) && ['class', 'style'].includes(node.name.getText(source))) {
      const value = node.initializer
      found.push({
        kind: node.name.getText(source) as 'class' | 'style',
        text: value === undefined ? '' : value.getText(source),
        range: [node.getStart(source), node.getEnd()],
        blank: '',
      })
      return
    }
    if (
      ts.isPropertyAssignment(node) &&
      ['class', 'style'].includes(node.name.getText(source).replace(/^'|'$/g, ''))
    ) {
      found.push({
        kind: node.name.getText(source).replace(/^'|'$/g, '') as 'class' | 'style',
        text: node.initializer.getText(source),
        range: [node.initializer.getStart(source), node.initializer.getEnd()],
        blank: 'undefined',
      })
      return
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return found
}

describe('token-only — a shell expresses design values only through its recipe', () => {
  it('finds the generated components: one per member, and one per compound part', () => {
    const expected = MEMBERS.filter((shell) => shell.home !== 'foundation').reduce(
      (count, shell) => count + 1 + (shell.parts?.length ?? 0),
      0,
    )
    expect(components().length).toBe(expected)
  })

  it('reads the classes and styles a file writes, in attributes and in merged objects', () => {
    const source = parse(
      'Probe.tsx',
      "const a = <div class={styles.box} style={{ '--x': ratio }} {...mergeParts(api.value.getRootProps(), { class: styles.root })} />",
    )
    expect(bindings(source).map(({ kind, text }) => `${kind} ${text}`)).toEqual([
      'class {styles.box}',
      "style {{ '--x': ratio }}",
      'class styles.root',
    ])
  })

  for (const file of [...components(), ICON]) {
    const name = relative(file === ICON ? ROOT : SRC, file)
    it(name, () => {
      const text = readFileSync(file, 'utf8')
      const source = parse(file, text)
      const lawful = file === ICON ? LAWFUL_IN_FOUNDATION : LAWFUL_IMPORT
      expect(importsOf(source).filter((specifier) => !lawful.test(specifier))).toEqual([])

      // A style carries data a member computes (a ratio, a position), never a
      // decision: it holds no literal colour or length.
      const written = bindings(source)
      for (const binding of written.filter(({ kind }) => kind === 'style')) {
        expect(binding.text, `${name}: style ${binding.text}`).not.toMatch(
          /#[0-9a-f]{3,8}\b|\d(px|rem|em|vh|vw|ch)\b|\b(rgba?|hsla?|oklch|oklab|color-mix)\(/i,
        )
      }

      // A class comes only from a recipe: every `class` reads a module the file
      // imports from `.module.css`, and names no class as a string. With those
      // set aside, the rest of the file is held to `no-raw-styles` as
      // application code is, so no colour or length can be written into it.
      const recipes = source.statements.flatMap((statement) =>
        ts.isImportDeclaration(statement) &&
        ts.isStringLiteral(statement.moduleSpecifier) &&
        statement.moduleSpecifier.text.endsWith('.module.css') &&
        statement.importClause?.name !== undefined
          ? [statement.importClause.name.text]
          : [],
      )
      for (const binding of written.filter(({ kind }) => kind === 'class')) {
        expect(binding.text, `${name}: a class names no string`).not.toMatch(/['`"]/)
        expect(
          recipes.some((recipe) => new RegExp(`\\b${recipe}[.[]`).test(binding.text)),
          `${name}: class ${binding.text} reads a recipe`,
        ).toBe(true)
      }
      let rest = text
      for (const binding of [...written].sort((a, b) => b.range[0] - a.range[0])) {
        rest = rest.slice(0, binding.range[0]) + binding.blank + rest.slice(binding.range[1])
      }
      const result = verifyCode(rest, {
        filename: file === ICON ? name : `packages/solid-ui/src/${name}`,
        rules: { 'polymorph/no-raw-styles': 'error' },
      })
      expect(result.fatal).toBeNull()
      expect(
        result.diagnostics.map((diagnostic) => `${diagnostic.line}: ${diagnostic.message}`),
      ).toEqual([])
    })
  }
})
