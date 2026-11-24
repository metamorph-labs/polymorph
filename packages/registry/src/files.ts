import type { Registry } from './build'

/**
 * Every file of the source tree a registry names, repository-relative, sorted
 * and once each: the files an install can copy from it.
 *
 * That is each member's and each ladder primitive's source, stylesheet and
 * states fixture, and every file of its closure, in React and in each
 * framework that ships it (its shell's sources, states fixture and closure);
 * the support files and the base layer; and every system and palette
 * document. `add`, `init`, `update`, `diff` and `get_component` read nothing
 * else from the tree, apart from the files a page with no build loads, which
 * the registry names by their directory (`vendor.frameworks.elements.noBuild`)
 * because they are a build output.
 *
 * The published tools ship exactly these files beside their registry, so a
 * file a front reads and this list leaves out is a fault here, not in the
 * tools' build.
 */
export function namedFiles(registry: Registry): string[] {
  const files = new Set<string>()
  const add = (path: string | null | undefined): void => {
    if (typeof path === 'string') files.add(path)
  }

  for (const member of [...registry.components, ...registry.exceptions.primitives]) {
    add(member.files.source)
    add(member.files.styles)
    add('states' in member.files ? member.files.states : null)
    member.dependencies.files.forEach(add)
    for (const entry of Object.values(member.frameworks)) {
      if (entry.shell === undefined) continue
      entry.shell.sources.forEach(add)
      add(entry.shell.states)
      entry.shell.dependencies.files.forEach(add)
    }
  }

  registry.vendor.support.forEach(add)
  add(registry.vendor.base)
  for (const framework of Object.values(registry.vendor.frameworks)) framework.support.forEach(add)

  for (const document of [...registry.theme.systems, ...registry.theme.palettes]) add(document.file)

  return [...files].sort((a, b) => a.localeCompare(b))
}
