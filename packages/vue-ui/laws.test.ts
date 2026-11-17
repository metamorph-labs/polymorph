import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

import { compileScript, parse } from '@vue/compiler-sfc'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

import { buildRegistry, frameworkFile, type Registry } from '@polymorph/registry'
import { vueBinding } from '@polymorph/registry/frameworks'
import { verifyCode } from '@polymorph/rules/verify'
import {
  componentPath,
  describedMembers,
  gridEntries,
  isPrimitive,
  partPath,
  partProps,
  registryMember,
  statesPath,
  type MemberShell,
} from '@polymorph/shells'

/**
 * The Vue vocabulary's laws that read files and the registry, in node.
 *
 *  - **Completeness.** Every entry the React fixture names (the spec's States
 *    rows) and every cell of the lawful grid has an entry of the same name in
 *    the member's Vue fixture. The browser law (`src/laws.test.ts`) renders
 *    each one.
 *  - **Spec staleness.** Each generated component's props, emits and slots are
 *    the registry's props, function props and node props, read the way
 *    `vueBinding` reads them, compiled by Vue's own compiler. A prop the
 *    registry lists under a compound part's name (`Group.title` under
 *    SettingsRow) is the part's component's, not the member's.
 *  - **The framework map.** A member is `native` in `design/frameworks/vue.json`
 *    exactly when it has a description, and so a generated shell.
 *  - **Token-only.** A shell imports only Vue, its machine, the foundation, its
 *    recipe and other shells, writes no `style`, and passes `no-raw-styles`, so
 *    a colour or a length cannot be written into one. The foundation's
 *    generated `Icon.vue` is held to the same law, with the gateway and the
 *    engine's types as its imports.
 */

const ROOT = resolve(import.meta.dirname, '../..')
const SRC = resolve(import.meta.dirname, 'src')
/** The foundation's one generated component, `Icon.vue`, which ships beside the gateway it draws through. */
const ICON = resolve(ROOT, 'packages/vue/src/icon/Icon.vue')

const registry: Registry = buildRegistry(ROOT)
const MEMBERS: MemberShell[] = await describedMembers(registry)

const camel = (name: string) =>
  name.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase())

/** The props Vue's compiler declares, the events and the slots, read from a generated component. */
function declared(path: string): { props: string[]; emits: string[]; slots: string[] } {
  const file = resolve(ROOT, path)
  const { descriptor } = parse(readFileSync(file, 'utf8'), { filename: file })
  const compiled = compileScript(descriptor, {
    id: path,
    fs: { fileExists: () => false, readFile: () => undefined },
  })
  const props = Object.entries(compiled.bindings ?? {})
    .filter(([, kind]) => kind === 'props')
    .map(([name]) => name)
  const script = ts.createSourceFile(
    'script.ts',
    descriptor.scriptSetup?.content ?? '',
    ts.ScriptTarget.ESNext,
    true,
  )
  const typeKeys = (callee: string): string[] => {
    const keys: string[] = []
    const visit = (node: ts.Node) => {
      if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === callee &&
        node.typeArguments?.[0] !== undefined &&
        ts.isTypeLiteralNode(node.typeArguments[0])
      ) {
        for (const member of node.typeArguments[0].members) {
          if (member.name !== undefined)
            keys.push(member.name.getText(script).replace(/^'|'$/g, ''))
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(script)
    return keys
  }
  return {
    props: props.sort(),
    emits: typeKeys('defineEmits').sort(),
    slots: typeKeys('defineSlots').sort(),
  }
}

describe('completeness — every spec States row and lawful grid cell has a Vue entry', () => {
  for (const shell of MEMBERS) {
    it(shell.member, () => {
      const component = registry.components.find((candidate) => candidate.name === shell.member)
      const names = new Set([
        ...gridEntries(shell, registryMember(registry, shell.member)).map((entry) => entry.name),
        ...shell.states.map((entry) => entry.name),
      ])
      expect([...names].length, 'entry names are unique').toBe(
        gridEntries(shell, registryMember(registry, shell.member)).length + shell.states.length,
      )
      const missing = (component?.states ?? []).filter((name) => !names.has(name))
      expect(missing, `${shell.member}: React fixture entries with no Vue entry`).toEqual([])
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

/** The props, events and slots a list of registry props binds to in Vue. */
function bound(props: readonly { name: string; type: string }[]): {
  props: string[]
  emits: string[]
  slots: string[]
} {
  const out = { props: [] as string[], emits: [] as string[], slots: [] as string[] }
  for (const prop of props) {
    const binding = vueBinding(prop)
    if (binding.kind === 'prop') out.props.push(camel(binding.name))
    else if (binding.kind === 'event') out.emits.push(binding.name)
    else out.slots.push(binding.name)
  }
  return { props: out.props.sort(), emits: out.emits.sort(), slots: out.slots.sort() }
}

describe('spec staleness — a shell’s props, emits and slots are the registry’s', () => {
  for (const shell of MEMBERS) {
    it(shell.member, () => {
      const component = registryMember(registry, shell.member)
      expect(declared(componentPath(shell))).toEqual(
        bound(component.props.filter((prop) => !prop.name.includes('.'))),
      )
      for (const part of shell.parts ?? []) {
        const listed = partProps(component, part.name)
        if (listed.length === 0) continue
        expect(declared(partPath(shell, part.name)), `${shell.member}.${part.name}`).toEqual(
          bound(listed),
        )
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
})

describe('the framework map — native in vue.json exactly where a shell is generated', () => {
  it('marks every described member native, and nothing else', () => {
    const map = JSON.parse(readFileSync(resolve(ROOT, frameworkFile('vue')), 'utf8')) as {
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
      expect(() => statSync(resolve(ROOT, componentPath(shell))), shell.member).not.toThrow()
      if (isPrimitive(registry, shell.member)) continue
      expect(() => statSync(resolve(ROOT, statesPath(shell))), shell.member).not.toThrow()
    }
  })
})

/** Every `.vue` file under the vocabulary's source. */
function components(dir: string = SRC): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return components(path)
    return name.endsWith('.vue') ? [path] : []
  })
}

const LAWFUL_IMPORT =
  /^(vue|@zag-js\/[a-z-]+|@polymorph\/vue|@polymorph\/vue\/motion|@polymorph\/recipes\/([a-z0-9-]+\/)+[a-z0-9-]+\.module\.css|\.{1,2}\/([a-z-]+\/)?[A-Z][A-Za-z]+\.vue)$/

/**
 * Inside the foundation, `Icon.vue` cannot import the foundation's index,
 * which imports it back: it reads the gateway and its stylesheet beside it, and
 * the engine's types.
 */
const LAWFUL_IN_FOUNDATION = /^(vue|\.\/Glyph|\.\/icon\.module\.css|@polymorph\/engine)$/

/**
 * Every module a component's `<script setup>` imports, read as TypeScript, so
 * an import written over several lines is read like any other.
 */
function importsOf(text: string, file: string): string[] {
  const script =
    /<script setup lang="ts"(?: generic="[^"]*")?>([\s\S]*?)<\/script>/.exec(text)?.[1] ?? ''
  const source = ts.createSourceFile(file, script, ts.ScriptTarget.ESNext, true)
  return source.statements.flatMap((statement) =>
    (ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement)) &&
    statement.moduleSpecifier !== undefined &&
    ts.isStringLiteral(statement.moduleSpecifier)
      ? [statement.moduleSpecifier.text]
      : [],
  )
}

describe('token-only — a shell expresses design values only through its recipe', () => {
  it('finds the generated components: one per member, and one per compound part', () => {
    const expected = MEMBERS.filter((shell) => shell.home !== 'foundation').reduce(
      (count, shell) => count + 1 + (shell.parts?.length ?? 0),
      0,
    )
    expect(components().length).toBe(expected)
  })

  it('reads an import written over several lines', () => {
    const text = [
      '<script setup lang="ts">',
      'import {',
      '  computed,',
      '  ref,',
      "} from 'react'",
      "import styles from '@polymorph/recipes/controls/button.module.css'",
      '</script>',
    ].join('\n')
    expect(importsOf(text, 'Probe.vue')).toEqual([
      'react',
      '@polymorph/recipes/controls/button.module.css',
    ])
  })

  for (const file of [...components(), ICON]) {
    const name = relative(file === ICON ? ROOT : SRC, file)
    it(name, () => {
      const text = readFileSync(file, 'utf8')
      const lawful = file === ICON ? LAWFUL_IN_FOUNDATION : LAWFUL_IMPORT
      expect(text, `${name}: a script to read`).toMatch(
        /<script setup lang="ts"(?: generic="[^"]*")?>/,
      )
      expect(importsOf(text, file).filter((specifier) => !lawful.test(specifier))).toEqual([])
      expect(text, `${name}: a static style or a style block`).not.toMatch(/\sstyle=|<style\b/)

      // A bound style carries data a member computes (a ratio, a position), never
      // a decision: it holds no literal colour or length.
      const styles = [...text.matchAll(/(?<=\s):style="([^"]*)"/g)].map(
        (match) => match[1] as string,
      )
      for (const binding of styles) {
        expect(binding, `${name}: :style="${binding}"`).not.toMatch(
          /#[0-9a-f]{3,8}\b|\d(px|rem|em|vh|vw|ch)\b|\b(rgba?|hsla?|oklch|oklab|color-mix)\(/i,
        )
      }

      // A class comes only from a recipe: every `:class` reads a module the file
      // imports from `.module.css`, and names no class as a string. With those
      // bindings set aside, the rest of the file is held to `no-raw-styles` as
      // application code is, so no colour or length can be written into it.
      const recipes = [...text.matchAll(/^import (\w+) from '[^']+\.module\.css'$/gm)].map(
        (match) => match[1] as string,
      )
      const classes = [...text.matchAll(/(?<=\s):class="([^"]*)"/g)].map(
        (match) => match[1] as string,
      )
      for (const binding of classes) {
        expect(binding, `${name}: a class names no string`).not.toMatch(/['`]/)
        expect(
          recipes.some((recipe) => new RegExp(`\\b${recipe}[.[]`).test(binding)),
          `${name}: :class="${binding}" reads a recipe`,
        ).toBe(true)
      }
      const result = verifyCode(text.replace(/(?<=\s):(class|style)="[^"]*"/g, ''), {
        filename: file === ICON ? name : `packages/vue-ui/src/${name}`,
        rules: { 'polymorph/no-raw-styles': 'error' },
      })
      expect(result.fatal).toBeNull()
      expect(
        result.diagnostics.map((diagnostic) => `${diagnostic.line}: ${diagnostic.message}`),
      ).toEqual([])
    })
  }
})
