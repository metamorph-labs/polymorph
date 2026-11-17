import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

import { parse } from 'svelte/compiler'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

import { buildRegistry, type Registry } from '@polymorph/registry'
import { vueBinding } from '@polymorph/registry/frameworks'
import { verifyCode } from '@polymorph/rules/verify'
import {
  describedMembers,
  GENERATED_MARKER,
  gridEntries,
  isPrimitive,
  partProps,
  registryMember,
  svelteComponentPath,
  sveltePartPath,
  svelteStatesPath,
  type MemberShell,
} from '@polymorph/shells'

/**
 * The Svelte vocabulary's laws that read files and the registry, in node.
 *
 *  - **Completeness.** Every entry the React fixture names (the spec's States
 *    rows) and every cell of the lawful grid has an entry of the same name in
 *    the member's Svelte fixture. The browser law (`src/laws.test.ts`) renders
 *    each one.
 *  - **Spec staleness.** Each generated component's props interface declares
 *    exactly the registry's props, by their React names: in Svelte a value, a
 *    callback (`onFoo`) and a snippet (`children`, a node prop) are all props.
 *    Each prop is of the kind `vueBinding` reads it as: an event is a
 *    function, a render prop a snippet with its argument (`Snippet<[Row]>`),
 *    and a node prop a `Snippet`. A prop the registry lists under a compound
 *    part's name (`Group.title` under SettingsRow) is the part's component's,
 *    not the member's, and every such part is described.
 *  - **The framework map.** A member is `native` in
 *    `design/frameworks/svelte.json` exactly when it has a description, and so
 *    a generated shell.
 *  - **Token-only.** A shell imports only Svelte, its machine, the foundation,
 *    its recipe and other shells, writes no `style` attribute or block, takes
 *    every class from a recipe, holds no colour or length in its markup, and
 *    its scripts pass `no-raw-styles`. The foundation's generated `Icon.svelte`
 *    is held to the same law, with the gateway, the slot convention and the
 *    engine's types as its imports.
 *  - **No whitespace between nodes.** Svelte keeps one space for whitespace
 *    between two nodes, where React and Vue drop it, so a generated component
 *    or fixture puts none there: every line break sits inside a tag. Read with
 *    Svelte's own parser.
 */

const ROOT = resolve(import.meta.dirname, '../..')
const SRC = resolve(import.meta.dirname, 'src')
/** The foundation's one generated component, `Icon.svelte`, which ships beside the gateway it draws through. */
const ICON = resolve(ROOT, 'packages/svelte/src/icon/Icon.svelte')

const registry: Registry = buildRegistry(ROOT)
const MEMBERS: MemberShell[] = await describedMembers(registry)

const SCRIPT = /<script\b([^>]*)>([\s\S]*?)<\/script>/g

/** A component's scripts: the module script and the instance script. */
function scripts(text: string): { module: string; instance: string } {
  let module = ''
  let instance = ''
  for (const match of text.matchAll(SCRIPT)) {
    if (/\bmodule\b/.test(match[1] as string)) module += match[2] as string
    else instance += match[2] as string
  }
  return { module, instance }
}

/** A component's markup: everything outside its scripts. */
const markupOf = (text: string) => text.replace(SCRIPT, '')

/** Each key of the `<Name>Props` interface a generated component declares, with its type's text. */
function declaredTypes(path: string, name: string): Map<string, string> {
  const text = readFileSync(resolve(ROOT, path), 'utf8')
  const source = ts.createSourceFile(path, scripts(text).module, ts.ScriptTarget.ESNext, true)
  const face = source.statements.find(
    (statement): statement is ts.InterfaceDeclaration =>
      ts.isInterfaceDeclaration(statement) && statement.name.text === `${name}Props`,
  )
  if (face === undefined) throw new Error(`${path} declares no ${name}Props`)
  return new Map(
    face.members.map((member) => [
      member.name?.getText(source).replace(/^'|'$/g, '') ?? '',
      ts.isPropertySignature(member) ? (member.type?.getText(source) ?? '') : '',
    ]),
  )
}

/** The prop names a generated component declares: the keys of its `<Name>Props` interface. */
const declared = (path: string, name: string): string[] =>
  [...declaredTypes(path, name).keys()].sort()

/**
 * The props of a generated component whose type is not of the kind
 * `vueBinding` reads the registry's prop as: an event (`onFoo`) is a function,
 * a render prop a snippet with its argument, and a node prop a `Snippet`.
 */
function misbound(
  path: string,
  name: string,
  props: readonly { name: string; type: string }[],
): string[] {
  const types = declaredTypes(path, name)
  return props.flatMap((prop) => {
    const kind = vueBinding(prop).kind
    const type = (types.get(prop.name) ?? '').replace(/\s+/g, ' ')
    const lawful =
      kind === 'event'
        ? type.includes('=>')
        : kind === 'scoped-slot'
          ? type.startsWith('Snippet<[')
          : kind === 'slot'
            ? type === 'Snippet'
            : true
    return lawful ? [] : [`${prop.name} (${kind}): ${type}`]
  })
}

describe('completeness — every spec States row and lawful grid cell has a Svelte entry', () => {
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
      expect(missing, `${shell.member}: React fixture entries with no Svelte entry`).toEqual([])
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
      const path = svelteComponentPath(shell)
      expect(declared(path, shell.member)).toEqual(own.map((prop) => prop.name).sort())
      expect(misbound(path, shell.member, own), 'each prop of its kind').toEqual([])
      for (const part of shell.parts ?? []) {
        const listed = partProps(component, part.name)
        if (listed.length === 0) continue
        const partFile = sveltePartPath(shell, part.name)
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
    const probe = svelteComponentPath(
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
    expect(
      misbound(probe, 'Checkbox', [{ name: 'aria-label', type: '(row: Row) => ReactNode' }]),
    ).toEqual(['aria-label (scoped-slot): string'])
  })
})

describe('the framework map — native in svelte.json exactly where a shell is generated', () => {
  it('marks every described member native, and nothing else', () => {
    const map = JSON.parse(
      readFileSync(resolve(ROOT, 'design/frameworks/svelte.json'), 'utf8'),
    ) as {
      framework: string
      members: Record<string, { status: string; reason?: string }>
    }
    expect(map.framework).toBe('svelte')
    const native = Object.entries(map.members)
      .filter(([, entry]) => entry.status === 'native')
      .map(([name]) => name)
      .sort()
    expect(native).toEqual(MEMBERS.map((shell) => shell.member).sort())
    for (const [name, entry] of Object.entries(map.members)) {
      if (entry.status === 'absent') {
        expect(entry.reason?.trim() ?? '', `${name} says why it is absent`).not.toBe('')
      }
    }
  })

  it('generates a component for every description, and a states fixture for every member', () => {
    for (const shell of MEMBERS) {
      expect(() => statSync(resolve(ROOT, svelteComponentPath(shell))), shell.member).not.toThrow()
      if (isPrimitive(registry, shell.member)) continue
      expect(() => statSync(resolve(ROOT, svelteStatesPath(shell))), shell.member).not.toThrow()
    }
  })
})

/** Every generated member component under the vocabulary's source: not the fixtures. */
function components(dir: string = SRC): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return components(path)
    return name.endsWith('.svelte') &&
      !name.endsWith('.states.svelte') &&
      readFileSync(path, 'utf8').includes(GENERATED_MARKER)
      ? [path]
      : []
  })
}

const LAWFUL_IMPORT =
  /^(svelte|@zag-js\/[a-z-]+|@polymorph\/svelte|@polymorph\/svelte\/motion|@polymorph\/recipes\/([a-z0-9-]+\/)+[a-z0-9-]+\.module\.css|\.{1,2}\/([a-z-]+\/)?[A-Z][A-Za-z]+\.svelte)$/

/**
 * Inside the foundation, `Icon.svelte` cannot import the foundation's index,
 * which imports it back: it reads the gateway and its stylesheet beside it,
 * the slot convention, and the engine's types.
 */
const LAWFUL_IN_FOUNDATION =
  /^(svelte|\.\/Glyph\.svelte|\.\/icon\.module\.css|\.\.\/conventions\/slotted\.svelte|@polymorph\/engine)$/

/** Every module a component's scripts import, read as TypeScript. */
function importsOf(text: string, file: string): string[] {
  const { module, instance } = scripts(text)
  const source = ts.createSourceFile(file, `${module}\n${instance}`, ts.ScriptTarget.ESNext, true)
  return source.statements.flatMap((statement) =>
    (ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement)) &&
    statement.moduleSpecifier !== undefined &&
    ts.isStringLiteral(statement.moduleSpecifier)
      ? [statement.moduleSpecifier.text]
      : [],
  )
}

/** A colour or a length written as a literal. */
const RAW_VALUE =
  /#[0-9a-f]{3,8}\b|\d(px|rem|em|vh|vw|ch)\b|\b(rgba?|hsla?|oklch|oklab|color-mix)\(/i

/** The expression of every `<name>={…}` attribute in markup, braces balanced. */
function attributeValues(markup: string, name: RegExp): { attribute: string; value: string }[] {
  const found: { attribute: string; value: string }[] = []
  const pattern = new RegExp(`(?<=\\s)(${name.source})=\\{`, 'g')
  for (const match of markup.matchAll(pattern)) {
    let depth = 1
    let at = (match.index ?? 0) + match[0].length
    const start = at
    while (at < markup.length && depth > 0) {
      const char = markup[at]
      if (char === '{') depth += 1
      else if (char === '}') depth -= 1
      at += 1
    }
    found.push({ attribute: match[1] as string, value: markup.slice(start, at - 1) })
  }
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

  it('reads an import written over several lines', () => {
    const text = [
      '<script module lang="ts">',
      'import {',
      '  onDestroy,',
      '  untrack,',
      "} from 'react'",
      "import styles from '@polymorph/recipes/controls/button.module.css'",
      '</script>',
    ].join('\n')
    expect(importsOf(text, 'Probe.svelte')).toEqual([
      'react',
      '@polymorph/recipes/controls/button.module.css',
    ])
  })

  it('finds a colour in a style directive', () => {
    expect(attributeValues('<div style:color={on ? "#fff" : x}></div>', /style:[\w-]+/)).toEqual([
      { attribute: 'style:color', value: 'on ? "#fff" : x' },
    ])
  })

  for (const file of [...components(), ICON]) {
    const name = relative(file === ICON ? ROOT : SRC, file)
    it(name, () => {
      const text = readFileSync(file, 'utf8')
      const lawful = file === ICON ? LAWFUL_IN_FOUNDATION : LAWFUL_IMPORT
      expect(text, `${name}: a script to read`).toMatch(/<script lang="ts"(?: generics="[^"]*")?>/)
      expect(importsOf(text, file).filter((specifier) => !lawful.test(specifier))).toEqual([])
      const markup = markupOf(text)
      expect(markup, `${name}: a style attribute or a style block`).not.toMatch(/\sstyle=|<style\b/)

      // A style directive carries data a member computes (a ratio, a position), never
      // a decision: it holds no literal colour or length.
      for (const { attribute, value } of attributeValues(markup, /style:[\w-]+/)) {
        expect(value, `${name}: ${attribute}={${value}}`).not.toMatch(RAW_VALUE)
      }

      // A class comes only from a recipe: every `class` reads a module the file
      // imports from `.module.css`, and names no class as a string.
      const recipes = [...text.matchAll(/^import (\w+) from '[^']+\.module\.css'$/gm)].map(
        (match) => match[1] as string,
      )
      for (const { value } of attributeValues(markup, /class/)) {
        expect(value, `${name}: a class names no string`).not.toMatch(/['"`]/)
        expect(
          recipes.some((recipe) => new RegExp(`\\b${recipe}[.[]`).test(value)),
          `${name}: class={${value}} reads a recipe`,
        ).toBe(true)
      }
      expect(markup, `${name}: a class as a string`).not.toMatch(/\sclass="/)

      // With the class and style bindings set aside, the markup holds no literal colour or length,
      // and the scripts are held to `no-raw-styles` as application code is.
      const rest = markup.replace(/\s(class|style:[\w-]+)=\{[^}]*\}/g, '')
      expect(rest.match(RAW_VALUE), `${name}: a colour or a length in the markup`).toBeNull()
      const { module, instance } = scripts(text)
      for (const [part, source] of [
        ['module', module],
        ['instance', instance],
      ] as const) {
        const result = verifyCode(source, {
          filename: `packages/svelte-ui/src/${name}.${part}.ts`,
          rules: { 'polymorph/no-raw-styles': 'error' },
        })
        expect(result.fatal, `${name}: the ${part} script parses`).toBeNull()
        expect(
          result.diagnostics.map(
            (diagnostic) => `${part} ${diagnostic.line}: ${diagnostic.message}`,
          ),
        ).toEqual([])
      }
    })
  }
})

/** Every whitespace-only text node in a parsed fragment's descendants, by the text around it. */
function whitespace(node: unknown, source: string, out: string[] = []): string[] {
  if (Array.isArray(node)) {
    for (const child of node) whitespace(child, source, out)
    return out
  }
  if (node === null || typeof node !== 'object') return out
  const record = node as { type?: string; nodes?: unknown[]; start?: number; end?: number }
  if (record.type === 'Fragment' && Array.isArray(record.nodes)) {
    const blank = (child: unknown) => {
      const text = child as { type?: string; data?: string }
      return text.type === 'Text' && /^\s+$/.test(text.data ?? '')
    }
    // Svelte drops the whitespace that starts and ends a fragment: a tag's content, a block's,
    // and the markup beside a component's scripts.
    const first = record.nodes.findIndex((child) => !blank(child))
    const last = record.nodes.findLastIndex((child) => !blank(child))
    for (const [at, child] of record.nodes.entries()) {
      const text = child as { type?: string; data?: string; start?: number; end?: number }
      if (at > first && at < last && blank(child)) {
        const at = text.start ?? 0
        out.push(JSON.stringify(source.slice(Math.max(0, at - 30), (text.end ?? at) + 30)))
      }
      whitespace(child, source, out)
    }
    return out
  }
  for (const [name, value] of Object.entries(record)) {
    if (name === 'metadata' || name === 'loc') continue
    whitespace(value, source, out)
  }
  return out
}

describe('no whitespace between nodes — every line break sits inside a tag', () => {
  it('finds whitespace between two nodes', () => {
    const source = '<div>\n  <span>a</span>\n  <b></b>\n</div>'
    expect(whitespace(parse(source, { modern: true }).fragment, source)).toHaveLength(1)
    const laid = '<div\n  ><span>a</span\n  ><b></b\n></div>'
    expect(whitespace(parse(laid, { modern: true }).fragment, laid)).toEqual([])
  })

  const generated = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const path = join(dir, name)
      if (statSync(path).isDirectory()) return generated(path)
      return name.endsWith('.svelte') && readFileSync(path, 'utf8').includes(GENERATED_MARKER)
        ? [path]
        : []
    })

  for (const file of [...generated(SRC), ICON]) {
    const name = relative(file === ICON ? ROOT : SRC, file)
    it(name, () => {
      const source = readFileSync(file, 'utf8')
      const fragment = parse(source, { modern: true }).fragment
      // A fixture's top level holds only its snippets' declarations, which render nothing there.
      if (file.endsWith('.states.svelte')) {
        for (const child of fragment.nodes) expect(whitespace(child, source)).toEqual([])
        return
      }
      expect(whitespace(fragment, source)).toEqual([])
    })
  }
})
