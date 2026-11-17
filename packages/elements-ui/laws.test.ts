import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

import ts from 'typescript'
import { describe, expect, it } from 'vitest'

import { buildRegistry, type Registry } from '@polymorph/registry'
import { vueBinding } from '@polymorph/registry/frameworks'
import {
  describedMembers,
  elementsComponentPath,
  elementsMembers,
  elementsPartPath,
  elementsStatesPath,
  gridEntries,
  isPrimitive,
  partProps,
  registryMember,
  type MemberShell,
} from '@polymorph/shells'

import { DEFINITIONS } from './src/definitions'

/**
 * The elements vocabulary's laws that read files and the registry, in node.
 *
 *  - **Completeness.** Every entry the React fixture names (the spec's States
 *    rows) and every cell of the lawful grid has an entry of the same name in
 *    the member's element-form fixture. The browser law (`src/laws.test.ts`)
 *    mounts each one.
 *  - **Spec staleness.** Each element's definition reads the registry's props:
 *    a value prop is an attribute and a property, an event prop a `poly-*`
 *    event, a node prop a slot, a render prop a property, as `vueBinding`
 *    reads each one; a prop the registry lists under a public part's name
 *    (`Row.interactive` under Table) is the part's element's.
 *  - **The framework map.** A member is `native` in `design/frameworks/elements.json`
 *    exactly when it has a description, and so a generated element.
 *  - **Imports.** A definition module imports only the foundation
 *    (`@polymorph/elements`, and its temporal codecs for a member that reads a
 *    date or a time) and the Solid member it renders, by its module
 *    in the Solid vocabulary (`@polymorph/solid-ui/controls/Button`): the
 *    elements' design values are the Solid members', whose token law is the
 *    Solid shell's, and an element loads its member and what that member
 *    composes, never the vocabulary's index, which attaches every compound's
 *    parts.
 */

const ROOT = resolve(import.meta.dirname, '../..')
const SRC = resolve(import.meta.dirname, 'src')
/** The foundation's one generated module, `poly-icon`'s, which ships beside the base class. */
const ICON = resolve(ROOT, 'packages/elements/src/icon/Icon.ts')

const registry: Registry = buildRegistry(ROOT)
const DESCRIBED: MemberShell[] = await describedMembers(registry)
const MEMBERS: MemberShell[] = elementsMembers(ROOT, DESCRIBED)

const parse = (path: string) =>
  ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.ESNext, true)

/** The entry names an element-form fixture declares, read from its source. */
function entryNames(path: string): string[] {
  const source = parse(resolve(ROOT, path))
  const names: string[] = []
  const visit = (node: ts.Node) => {
    if (
      ts.isPropertyAssignment(node) &&
      node.name.getText(source) === 'name' &&
      ts.isStringLiteral(node.initializer)
    ) {
      names.push(node.initializer.text)
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return names
}

/** What an element reads each prop as, by the prop's React name. */
function reading(tag: string): Map<string, 'prop' | 'event' | 'slot'> {
  const definition = DEFINITIONS[tag]
  if (definition === undefined) throw new Error(`no definition for ${tag}`)
  return new Map([
    ...Object.keys(definition.props).map((name) => [name, 'prop'] as const),
    ...Object.keys(definition.events).map((name) => [name, 'event'] as const),
    ...definition.slots.map((name) => [name, 'slot'] as const),
  ])
}

/** The reading `vueBinding` gives each registry prop, as an element reads it. */
const expected = (props: readonly { name: string; type: string }[]) =>
  new Map(
    props.map((prop) => {
      const kind = vueBinding(prop).kind
      return [prop.name, kind === 'event' ? 'event' : kind === 'slot' ? 'slot' : 'prop'] as const
    }),
  )

const sorted = (map: Map<string, string>) => [...map].sort(([a], [b]) => a.localeCompare(b))

const tagOf = (component: string) =>
  `poly-${component
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
    .toLowerCase()}`

describe('completeness — every spec States row and lawful grid cell has an element entry', () => {
  for (const shell of MEMBERS) {
    if (isPrimitive(registry, shell.member)) continue
    it(shell.member, () => {
      const component = registry.components.find((candidate) => candidate.name === shell.member)
      const names = entryNames(elementsStatesPath(shell))
      expect(new Set(names).size, 'entry names are unique').toBe(names.length)
      const all = new Set(names)
      const missing = (component?.states ?? []).filter((name) => !all.has(name))
      expect(missing, `${shell.member}: React fixture entries with no element entry`).toEqual([])
      const cells = gridEntries(shell, registryMember(registry, shell.member)).map(
        (entry) => entry.name,
      )
      expect(
        cells.filter((cell) => !all.has(cell)),
        `${shell.member}: lawful cells`,
      ).toEqual([])
    })
  }

  it('reads the entry names a fixture declares', () => {
    const button = MEMBERS.find((shell) => shell.member === 'Button') as MemberShell
    expect(entryNames(elementsStatesPath(button))).toContain('solid / accent')
  })
})

describe('spec staleness — an element reads the registry’s props', () => {
  for (const shell of MEMBERS) {
    it(shell.member, () => {
      const component = registryMember(registry, shell.member)
      const own = component.props.filter((prop) => !prop.name.includes('.'))
      expect(sorted(reading(tagOf(shell.member)))).toEqual(sorted(expected(own)))
      for (const part of (shell.parts ?? []).filter((candidate) => candidate.public)) {
        const listed = partProps(component, part.name)
        const declared = Object.entries(part.props ?? {}).map(([name, entry]) => ({
          name,
          type: entry.type,
        }))
        expect(
          sorted(reading(tagOf(`${shell.member}${part.name}`))),
          `${shell.member}.${part.name}`,
        ).toEqual(sorted(expected(listed.length > 0 ? listed : declared)))
      }
    })
  }

  it('reads every part the registry lists under a member as a public part with an element', () => {
    for (const shell of MEMBERS) {
      const names = new Set(
        registryMember(registry, shell.member)
          .props.filter((prop) => prop.name.includes('.'))
          .map((prop) => prop.name.split('.')[0] as string),
      )
      const elements = new Set(
        (shell.parts ?? []).filter((part) => part.public).map((part) => part.name),
      )
      expect(
        [...names].filter((name) => !elements.has(name)),
        shell.member,
      ).toEqual([])
    }
  })

  it('finds a prop read as the wrong kind', () => {
    const button = expected(registryMember(registry, 'Button').props)
    expect(sorted(reading('poly-button'))).toEqual(sorted(button))
    button.set('label', 'slot')
    expect(sorted(reading('poly-button'))).not.toEqual(sorted(button))
  })
})

describe('the framework map — native in elements.json exactly where an element is generated', () => {
  it('marks every described member native, and nothing else', () => {
    const map = JSON.parse(
      readFileSync(resolve(ROOT, 'design/frameworks/elements.json'), 'utf8'),
    ) as { members: Record<string, { status: string; reason?: string }> }
    const native = Object.entries(map.members)
      .filter(([, entry]) => entry.status === 'native')
      .map(([name]) => name)
      .sort()
    expect(native).toEqual(DESCRIBED.map((shell) => shell.member).sort())
  })

  it('generates a definition module for every native member and part, and a states fixture for every member', () => {
    for (const shell of MEMBERS) {
      expect(
        () => statSync(resolve(ROOT, elementsComponentPath(shell))),
        shell.member,
      ).not.toThrow()
      for (const part of (shell.parts ?? []).filter((candidate) => candidate.public)) {
        expect(
          () => statSync(resolve(ROOT, elementsPartPath(shell, part.name))),
          `${shell.member}.${part.name}`,
        ).not.toThrow()
      }
      if (isPrimitive(registry, shell.member)) continue
      expect(() => statSync(resolve(ROOT, elementsStatesPath(shell))), shell.member).not.toThrow()
    }
  })
})

/** Every generated definition module under the vocabulary's source. */
function definitionModules(dir: string = SRC): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) {
      return name === 'conformance' || name === 'bridge' ? [] : definitionModules(path)
    }
    return /^[A-Z][A-Za-z]+\.ts$/.test(name) ? [path] : []
  })
}

/**
 * What a definition module at `src/<dir>/<Name>.ts` may import: the foundation, the foundation's
 * temporal codecs (for a member that reads a date or a time, which `packaging.test.ts` holds), and
 * its own Solid member.
 */
const lawfulImport = (file: string) => {
  const own = relative(SRC, file).replace(/\.ts$/, '')
  return (specifier: string) =>
    specifier === '@polymorph/elements' ||
    specifier === '@polymorph/elements/temporal' ||
    specifier === `@polymorph/solid-ui/${own}`
}

/** Inside the foundation, `poly-icon`'s module reads the Solid foundation's Icon and the base class beside it. */
const LAWFUL_IN_FOUNDATION = /^(@polymorph\/solid|\.\.\/element|\.\.\/definition)$/

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

describe('imports — a definition module reaches only the foundation and its own Solid member', () => {
  it('finds the definition modules: one per member, and one per public part', () => {
    const expectedCount = MEMBERS.filter((shell) => shell.home !== 'foundation').reduce(
      (count, shell) => count + 1 + (shell.parts ?? []).filter((part) => part.public).length,
      0,
    )
    expect(definitionModules().length).toBe(expectedCount)
  })

  for (const file of [...definitionModules(), ICON]) {
    const name = relative(file === ICON ? ROOT : SRC, file)
    it(name, () => {
      const lawful =
        file === ICON
          ? (specifier: string) => LAWFUL_IN_FOUNDATION.test(specifier)
          : lawfulImport(file)
      const imports = importsOf(parse(file))
      expect(imports.filter((specifier) => !lawful(specifier))).toEqual([])
      if (file !== ICON)
        expect(imports, name).toContain(`@polymorph/solid-ui/${name.replace(/\.ts$/, '')}`)
    })
  }
})
