import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')

/**
 * Splits the text inside a call's or a list's brackets at its top-level commas,
 * so a nested call, list or string stays whole. Whitespace is collapsed and a
 * trailing comma dropped, so two manifests compare by what they declare rather
 * than by how they are laid out.
 */
function split(inner: string): string[] {
  const parts: string[] = []
  let depth = 0
  let quoted = false
  let part = ''
  for (const char of inner) {
    if (char === '"') quoted = !quoted
    if (!quoted && '([{'.includes(char)) depth += 1
    if (!quoted && ')]}'.includes(char)) depth -= 1
    if (!quoted && depth === 0 && char === ',') {
      parts.push(part)
      part = ''
    } else part += char
  }
  parts.push(part)
  return parts
    .map((each) =>
      each
        .replace(/\s+/g, ' ')
        .replace(/([([]) /g, '$1')
        .replace(/ ([)\]])/g, '$1')
        .trim(),
    )
    .filter((each) => each !== '')
}

/** The text between the bracket that opens at `start` and the one that closes it. */
function inside(text: string, start: number): string {
  let depth = 0
  let quoted = false
  for (let index = start; index < text.length; index += 1) {
    const char = text[index] as string
    if (char === '"') quoted = !quoted
    if (quoted) continue
    if ('([{'.includes(char)) depth += 1
    if (')]}'.includes(char)) depth -= 1
    if (depth === 0) return text.slice(start + 1, index)
  }
  throw new Error('an unclosed bracket')
}

/** A call's labelled arguments, by label, from `name: value, …`. */
function labelled(inner: string): Record<string, string> {
  return Object.fromEntries(
    split(inner).map((argument) => {
      const colon = argument.indexOf(':')
      return [argument.slice(0, colon).trim(), argument.slice(colon + 1).trim()]
    }),
  )
}

/**
 * The parts of a `Package.swift` an app sees: the tools version (which sets the
 * Swift language mode), the platforms, the package's own dependencies, the
 * libraries, and each library target's declaration with its sources' path
 * resolved. Read from the text, so the law runs on a machine with no Swift
 * toolchain.
 */
function shape(path: string) {
  const manifest = readFileSync(resolve(ROOT, path), 'utf8')
  const tools = manifest.split('\n')[0]
  const call = manifest.indexOf('Package(')
  const package_ = labelled(inside(manifest, call + 'Package'.length))
  const products = split(inside(package_.products ?? '[]', 0))
  const declared = split(inside(package_.targets ?? '[]', 0)).map((target) => {
    const kind = target.slice(0, target.indexOf('('))
    const fields = labelled(inside(target, kind.length))
    const name = JSON.parse(fields.name ?? '""') as string
    const sources = fields.path
      ? (JSON.parse(fields.path) as string)
      : `${kind === '.testTarget' ? 'Tests' : 'Sources'}/${name}`
    delete fields.path
    return {
      kind,
      name,
      fields,
      sources: resolve(ROOT, dirname(path), sources),
    }
  })
  const libraries = products.map((product) => {
    const name = /name: "(\w+)"/.exec(product)?.[1]
    const target = declared.find((each) => each.name === name)
    if (!target) throw new Error(`${path} declares no target for the library ${name}`)
    return target
  })
  return {
    tools,
    platforms: package_.platforms,
    dependencies: package_.dependencies,
    products,
    libraries,
    targets: declared.map(({ kind, name }) => `${kind} ${name}`),
  }
}

describe('the Swift package an app adds by URL', () => {
  // SwiftPM reads a package added by URL from the repository's root, so the
  // root `Package.swift` exists for apps alone. `platforms/ios/Package.swift`
  // stays the one the gate builds and tests, and an app that depends on it by
  // path must get what an app that adds the URL gets.
  const root = shape('Package.swift')
  const ios = shape('platforms/ios/Package.swift')

  it('offers the libraries `platforms/ios` offers, over the same sources', () => {
    expect(root.products).toEqual([
      '.library(name: "PolymorphTokens", targets: ["PolymorphTokens"])',
      '.library(name: "PolymorphUI", targets: ["PolymorphUI"])',
    ])
    expect(root.products).toEqual(ios.products)
    expect(root.libraries).toEqual(ios.libraries)
    for (const { name, sources } of root.libraries)
      expect(sources).toBe(resolve(ROOT, 'platforms/ios/Sources', name))
  })

  it('builds them with the same tools version, platforms and dependencies', () => {
    expect(root.tools).toMatch(/^\/\/ swift-tools-version: /)
    expect(root.tools).toBe(ios.tools)
    expect(root.platforms).toBe(ios.platforms)
    expect(root.dependencies).toBe(ios.dependencies)
  })

  it('declares no target beyond the libraries', () => {
    expect(root.targets).toEqual(['.target PolymorphTokens', '.target PolymorphUI'])
  })
})
