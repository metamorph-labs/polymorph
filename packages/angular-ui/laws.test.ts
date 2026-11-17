import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

import ts from 'typescript'
import { describe, expect, it } from 'vitest'

import { buildRegistry, type Registry } from '@polymorph/registry'
import { vueBinding } from '@polymorph/registry/frameworks'
import { verifyCode } from '@polymorph/rules/verify'
import {
  angularComponentPath,
  angularPartPath,
  angularStatesPath,
  describedMembers,
  gridEntries,
  isPrimitive,
  partProps,
  registryMember,
  type MemberShell,
} from '@polymorph/shells'

/**
 * The Angular vocabulary's laws that read files and the registry, in node.
 *
 *  - **Completeness.** Every entry the React fixture names (the spec's States
 *    rows) and every cell of the lawful grid has an entry of the same name in
 *    the member's Angular fixture. The browser law (`src/laws.test.ts`)
 *    renders each one.
 *  - **Spec staleness.** Each generated component's inputs, outputs and slots
 *    are the registry's props, by the mapping in `docs/frameworks.md`: a value
 *    prop and a render prop are inputs of their React names, an `onFoo` prop is
 *    the output `foo`, and `children` and each node prop are the default slot
 *    and a named slot (`<ng-content select="[slot=footer]">`). Its props
 *    interface names its inputs. A prop the registry lists under a compound
 *    part's name (`Group.title` under SettingsRow) is the part's component's,
 *    and every such part is described.
 *  - **The framework map.** A member is `native` in `design/frameworks/angular.json`
 *    exactly when it has a description, and so a generated shell.
 *  - **Token-only.** A shell imports only Angular's core, its machine, the
 *    foundation, its recipes and other shells; its template writes no `class`
 *    or `style` of its own; every class it binds is read from a recipe and
 *    names no class as a string; a style it binds holds no colour or length;
 *    and the file passes `no-raw-styles`. The foundation's generated `Icon.ts`
 *    is held to the same law, with the gateway, its conventions and the
 *    engine's types as its imports.
 */

const ROOT = resolve(import.meta.dirname, '../..')
const SRC = resolve(import.meta.dirname, 'src')
/** The foundation's one generated component, `Icon.ts`, which ships beside the gateway it draws through. */
const ICON = resolve(ROOT, 'packages/angular/src/icon/Icon.ts')

const registry: Registry = buildRegistry(ROOT)
const MEMBERS: MemberShell[] = await describedMembers(registry)

const parse = (path: string, text = readFileSync(path, 'utf8')) =>
  ts.createSourceFile(path, text, ts.ScriptTarget.ESNext, true)

/** What a generated component declares: its inputs and outputs by public name, its slots, its props interface's keys. */
interface Declared {
  inputs: string[]
  outputs: string[]
  slots: string[]
  props: string[]
  template: string
  host: string[]
  methods: Map<string, string>
}

function declared(path: string, component: string): Declared {
  const source = parse(resolve(ROOT, path))
  const out: Declared = {
    inputs: [],
    outputs: [],
    slots: [],
    props: [],
    template: '',
    host: [],
    methods: new Map(),
  }
  for (const statement of source.statements) {
    // A component that takes only content declares its props as a type with no key.
    if (ts.isInterfaceDeclaration(statement) && statement.name.text === `${component}Props`) {
      out.props = statement.members.map(
        (entry) => entry.name?.getText(source).replace(/^'|'$/g, '') ?? '',
      )
    }
    if (!ts.isClassDeclaration(statement) || statement.name?.text !== component) continue
    for (const decorator of ts.getDecorators(statement) ?? []) {
      const call = decorator.expression
      if (!ts.isCallExpression(call)) continue
      const options = call.arguments[0]
      if (options === undefined || !ts.isObjectLiteralExpression(options)) continue
      for (const property of options.properties) {
        if (!ts.isPropertyAssignment(property)) continue
        const name = property.name.getText(source)
        if (name === 'template' && ts.isNoSubstitutionTemplateLiteral(property.initializer))
          out.template = property.initializer.text
        if (name === 'host' && ts.isObjectLiteralExpression(property.initializer)) {
          out.host = property.initializer.properties.map((entry) => entry.getText(source))
        }
      }
    }
    for (const member of statement.members) {
      if (ts.isMethodDeclaration(member) && member.body !== undefined)
        out.methods.set(member.name.getText(source), member.body.getText(source))
      if (!ts.isPropertyDeclaration(member) || member.initializer === undefined) continue
      const init = member.initializer
      if (!ts.isCallExpression(init)) continue
      const callee = init.expression.getText(source)
      const field = member.name.getText(source)
      const alias = init.arguments
        .flatMap((argument) =>
          ts.isObjectLiteralExpression(argument)
            ? argument.properties.filter(
                (entry): entry is ts.PropertyAssignment =>
                  ts.isPropertyAssignment(entry) && entry.name.getText(source) === 'alias',
              )
            : [],
        )
        .map((entry) => (entry.initializer as ts.StringLiteral).text)[0]
      if (callee === 'input' || callee === 'input.required') out.inputs.push(alias ?? field)
      if (callee === 'output') out.outputs.push(alias ?? field)
    }
  }
  for (const match of out.template.matchAll(/<ng-content(?: select="\[slot=(\w+)\]")? \/>/g))
    out.slots.push(match[1] ?? 'default')
  return out
}

/** The registry's props as an Angular component takes them: inputs, outputs and slots. */
function expected(props: readonly { name: string; type: string }[]): {
  inputs: string[]
  outputs: string[]
  slots: string[]
} {
  const out = { inputs: [] as string[], outputs: [] as string[], slots: [] as string[] }
  for (const prop of props) {
    const binding = vueBinding(prop)
    if (binding.kind === 'event') out.outputs.push(binding.name)
    else if (binding.kind === 'slot') out.slots.push(binding.name)
    else out.inputs.push(prop.name)
  }
  return out
}

const sorted = (list: readonly string[]) => [...new Set(list)].sort()

describe('completeness — every spec States row and lawful grid cell has an Angular entry', () => {
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
      expect(missing, `${shell.member}: React fixture entries with no Angular entry`).toEqual([])
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

describe('spec staleness — a shell’s inputs, outputs and slots are the registry’s props', () => {
  /** A component's slots: the ones it renders or reads; a slot it never renders has no `ng-content`. */
  const check = (path: string, name: string, props: readonly { name: string; type: string }[]) => {
    const found = declared(path, name)
    const want = expected(props)
    expect(sorted(found.inputs), `${name}: inputs`).toEqual(sorted(want.inputs))
    expect(sorted(found.outputs), `${name}: outputs`).toEqual(sorted(want.outputs))
    expect(
      found.slots.filter((slot) => !want.slots.includes(slot)),
      `${name}: slots it has no node prop for`,
    ).toEqual([])
    expect(sorted(found.props), `${name}: props interface`).toEqual(
      sorted([...want.inputs, ...found.props.filter((prop) => want.slots.includes(prop))]),
    )
  }

  for (const shell of MEMBERS) {
    it(shell.member, () => {
      const component = registryMember(registry, shell.member)
      check(
        angularComponentPath(shell),
        shell.member,
        component.props.filter((prop) => !prop.name.includes('.')),
      )
      for (const part of shell.parts ?? []) {
        const listed = partProps(component, part.name)
        if (listed.length === 0) continue
        check(angularPartPath(shell, part.name), `${shell.member}${part.name}`, listed)
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

  it('reads the inputs, outputs and slots a generated component declares', () => {
    const dialog = MEMBERS.find((shell) => shell.member === 'Dialog') as MemberShell
    const found = declared(angularComponentPath(dialog), 'Dialog')
    expect(found.inputs).toContain('title')
    expect(found.outputs).toContain('openChange')
    expect(found.slots).toEqual(expect.arrayContaining(['default', 'footer', 'trigger']))
    expect(expected([{ name: 'onOpenChange', type: '(open: boolean) => void' }])).toEqual({
      inputs: [],
      outputs: ['openChange'],
      slots: [],
    })
  })
})

describe('the framework map — native in angular.json exactly where a shell is generated', () => {
  it('marks every described member native, and nothing else', () => {
    const map = JSON.parse(
      readFileSync(resolve(ROOT, 'design/frameworks/angular.json'), 'utf8'),
    ) as { framework: string; members: Record<string, { status: string; reason?: string }> }
    expect(map.framework).toBe('angular')
    const native = Object.entries(map.members)
      .filter(([, entry]) => entry.status === 'native')
      .map(([name]) => name)
      .sort()
    expect(native).toEqual(MEMBERS.map((shell) => shell.member).sort())
  })

  it('generates a component for every description, and a states fixture for every member', () => {
    for (const shell of MEMBERS) {
      expect(() => statSync(resolve(ROOT, angularComponentPath(shell))), shell.member).not.toThrow()
      if (isPrimitive(registry, shell.member)) continue
      expect(() => statSync(resolve(ROOT, angularStatesPath(shell))), shell.member).not.toThrow()
    }
  })
})

/** Every generated component under the vocabulary's source: its `.ts` files but the fixtures, tests and support. */
function components(dir: string = SRC): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return name === 'conformance' ? [] : components(path)
    return /^[A-Z]\w+\.ts$/.test(name) ? [path] : []
  })
}

const LAWFUL_IMPORT =
  /^(@angular\/core|@zag-js\/[a-z-]+|@polymorph\/angular|@polymorph\/angular\/motion|@polymorph\/recipes\/([a-z0-9-]+\/)+[a-z0-9-]+\.module\.css|\.{1,2}\/([a-z-]+\/)?[A-Z][A-Za-z]+)$/

/**
 * Inside the foundation, `Icon.ts` cannot import the foundation's index,
 * which imports it back: it reads the gateway and its stylesheet beside it,
 * the conventions it is generated against, and the engine's types.
 */
const LAWFUL_IN_FOUNDATION =
  /^(@angular\/core|\.\/Glyph|\.\/icon\.module\.css|\.\.\/conventions\/[a-z-]+|\.\.\/zag\/[a-z-]+|@polymorph\/engine)$/

function importsOf(source: ts.SourceFile): string[] {
  return source.statements.flatMap((statement) =>
    (ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement)) &&
    statement.moduleSpecifier !== undefined &&
    ts.isStringLiteral(statement.moduleSpecifier)
      ? [statement.moduleSpecifier.text]
      : [],
  )
}

/** The methods a template or a host binds to a class or a style: `[attr.class]="e3(tab)"`. */
function boundMethods(text: string, binding: RegExp): string[] {
  return [...text.matchAll(binding)].map((match) => match[1] as string)
}

/** The value a method returns: what follows its last `return`, up to the method's end. */
const returned = (body: string) => {
  const at = body.lastIndexOf('return ')
  return at === -1 ? body : body.slice(at + 'return '.length).replace(/\s*\}\s*$/, '')
}

const LITERAL = /#[0-9a-f]{3,8}\b|\d(px|rem|em|vh|vw|ch)\b|\b(rgba?|hsla?|oklch|oklab|color-mix)\(/i

describe('token-only — a shell expresses design values only through its recipe', () => {
  it('finds the generated components: one per member, and one per compound part', () => {
    const expectedCount = MEMBERS.filter((shell) => shell.home !== 'foundation').reduce(
      (count, shell) => count + 1 + (shell.parts?.length ?? 0),
      0,
    )
    expect(components().length).toBe(expectedCount)
  })

  it('reads the classes and styles a template and a host bind, and what their methods return', () => {
    const bindings = `<div\n[attr.class]="e1(tab)"\n[style.inline-size]="e2()"\n>\n'[attr.class]': 'e3()'`
    expect(boundMethods(bindings, /\[attr\.class\]['"]?:? ?['"]?=?"?'?(\w+)\(/g)).toEqual([
      'e1',
      'e3',
    ])
    expect(boundMethods(bindings, /\[style\.[\w-]+\]['"]?:? ?['"]?=?"?'?(\w+)\(/g)).toEqual(['e2'])
    expect(returned('{\n if (!(a)) return undefined as never\n return styles.box\n}')).toBe(
      'styles.box',
    )
  })

  for (const file of [...components(), ICON]) {
    const name = relative(file === ICON ? ROOT : SRC, file)
    it(name, () => {
      const text = readFileSync(file, 'utf8')
      const source = parse(file, text)
      const lawful = file === ICON ? LAWFUL_IN_FOUNDATION : LAWFUL_IMPORT
      expect(importsOf(source).filter((specifier) => !lawful.test(specifier))).toEqual([])

      const component = /export class (\w+)/.exec(text)?.[1] as string
      const found = declared(relative(ROOT, file), component)
      const recipes = source.statements.flatMap((statement) =>
        ts.isImportDeclaration(statement) &&
        ts.isStringLiteral(statement.moduleSpecifier) &&
        statement.moduleSpecifier.text.endsWith('.module.css') &&
        statement.importClause?.name !== undefined
          ? [statement.importClause.name.text]
          : [],
      )

      // The template writes no class or style of its own: each is bound, from the recipe.
      expect(found.template, `${name}: a static class`).not.toMatch(/\sclass="/)
      expect(found.template, `${name}: a static style`).not.toMatch(/\sstyle="/)
      const bindings = `${found.template}\n${found.host.join('\n')}`
      for (const method of boundMethods(bindings, /\[attr\.class\]['"]?:? ?['"]?=?"?'?(\w+)\(/g)) {
        const value = returned(found.methods.get(method) ?? '')
        // A slot's name in a condition (`this.$.filled('backAction')`) is not a class.
        const classText = value.replace(/this\.\$\.\w+\('\w+'\)/g, '')
        expect(classText, `${name}: class from ${method} names no string`).not.toMatch(/['`"]/)
        expect(
          recipes.some((recipe) => new RegExp(`\\b${recipe}[.[]`).test(value)),
          `${name}: class from ${method} reads a recipe: ${value}`,
        ).toBe(true)
      }
      // A bound style carries data a member computes (a ratio, a position), never a decision.
      for (const method of boundMethods(
        bindings,
        /\[style\.[\w-]+\]['"]?:? ?['"]?=?"?'?(\w+)\(/g,
      )) {
        expect(found.methods.get(method) ?? '', `${name}: style from ${method}`).not.toMatch(
          LITERAL,
        )
      }
      // The class and style a machine's getters are merged with: a recipe's class, and data.
      for (const [method, body] of found.methods) {
        if (!body.includes('mergeParts(')) continue
        for (const match of body.matchAll(/\bclass: ([^,}]+)/g)) {
          expect(match[1], `${name}: ${method}'s class`).not.toMatch(/['`"]/)
        }
        for (const match of body.matchAll(/\bstyle: (\{[^}]*\})/g)) {
          expect(match[1], `${name}: ${method}'s style`).not.toMatch(LITERAL)
        }
      }

      // The member's own host draws no box: the one style a host takes, written by the renderer.
      const rest = text.replace("host: { style: 'display: contents' },", '')
      const result = verifyCode(rest, {
        filename: file === ICON ? name : `packages/angular-ui/src/${name}`,
        rules: { 'polymorph/no-raw-styles': 'error' },
      })
      expect(result.fatal).toBeNull()
      expect(
        result.diagnostics.map((diagnostic) => `${diagnostic.line}: ${diagnostic.message}`),
      ).toEqual([])
    })
  }
})
