import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { buildRegistry } from './build'
import { namedFiles } from './files'

/**
 * The files a registry names: what an install can copy from the tree, and
 * what the published tools ship beside their registry.
 */

const ROOT = resolve(import.meta.dirname, '../../..')
const registry = buildRegistry(ROOT)
const files = namedFiles(registry)

describe('the files a registry names', () => {
  it('are each in this tree, once, in order', () => {
    expect(files.filter((path) => !existsSync(resolve(ROOT, path)))).toEqual([])
    expect(new Set(files).size).toBe(files.length)
    expect([...files].sort((a, b) => a.localeCompare(b))).toEqual(files)
  })

  it('hold every member’s files, in React and in each framework that ships it', () => {
    const button = registry.components.find((component) => component.name === 'Button')
    expect(files).toContain(button?.files.source)
    expect(files).toContain(button?.files.styles)
    expect(files).toContain(button?.files.states)
    for (const entry of Object.values(button?.frameworks ?? {})) {
      for (const source of entry.shell?.sources ?? []) expect(files).toContain(source)
    }
    for (const primitive of registry.exceptions.primitives) {
      expect(files).toContain(primitive.files.source)
    }
  })

  it('hold the support files, the base layer and every theme document', () => {
    expect(files).toContain(registry.vendor.base)
    for (const support of registry.vendor.support) expect(files).toContain(support)
    for (const framework of Object.values(registry.vendor.frameworks)) {
      for (const support of framework.support) expect(files).toContain(support)
    }
    for (const document of [...registry.theme.systems, ...registry.theme.palettes]) {
      expect(files).toContain(document.file)
    }
  })

  it('leave out the build output, which the registry names by its directory', () => {
    const noBuild = registry.vendor.frameworks.elements.noBuild?.dir ?? ''
    expect(noBuild).not.toBe('')
    expect(files.filter((path) => path.startsWith(`${noBuild}/`))).toEqual([])
  })
})
