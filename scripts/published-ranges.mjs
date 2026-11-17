/**
 * The ranges a package publishes on the other published packages, from the
 * ones `pnpm pack` leaves in its manifest. `scripts/publish-packages.mjs`
 * writes them into the packed manifest, and `packages/registry/src/install.test.ts`
 * holds the two forms.
 *
 * Inside this repository the packages keep their `@polymorph/*` names. On the
 * registry each has another name (`PUBLISHED_NAMES`), and a consumer installs
 * it under its `@polymorph/*` alias, so no import changes.
 *
 * - A **dependency** is published as an `npm:` alias:
 *   `"@polymorph/engine": "npm:@metamorph-labs/polymorph-engine@^<version>"`.
 *   The package manager installs the dependency itself, so the range has to
 *   say where the package is.
 * - A **peer dependency** is published as a range under the workspace name:
 *   `"@polymorph/engine": "^<version>"`. The consumer installs a peer, under
 *   its alias, and the package manager only checks the installed version
 *   against the range. pnpm compares the range as written, so an alias there
 *   is reported as an unmet peer whatever is installed.
 */

/**
 * The registry spelling of a range on another published package. `pnpm pack`
 * has already turned `workspace:*` into the exact version and `workspace:^`
 * into a caret range, and the published range is a caret range either way.
 */
const caret = (range) => `^${range.replace(/^\^/, '')}`

/**
 * `dependencies` and `peerDependencies` as the package publishes them.
 * `published` maps each workspace name to its registry name, and `bundled`
 * names the dependencies the package's build has compiled in.
 */
export function publishedRanges(manifest, published, bundled = []) {
  const dependencies = { ...manifest.dependencies }
  for (const dependency of bundled) delete dependencies[dependency]
  const peerDependencies = { ...manifest.peerDependencies }
  for (const [workspaceName, registryName] of Object.entries(published)) {
    if (dependencies[workspaceName]) {
      dependencies[workspaceName] = `npm:${registryName}@${caret(dependencies[workspaceName])}`
    }
    if (peerDependencies[workspaceName]) {
      peerDependencies[workspaceName] = caret(peerDependencies[workspaceName])
    }
  }
  return {
    dependencies,
    ...(manifest.peerDependencies === undefined ? {} : { peerDependencies }),
  }
}

/** What a consumer's resolver would reject in a published manifest's ranges, as sentences. */
export function rangeFaults(manifest) {
  const faults = []
  if (JSON.stringify(manifest).includes('workspace:')) {
    faults.push(`${manifest.name} still has a workspace: range`)
  }
  for (const [dependency, range] of Object.entries(manifest.dependencies ?? {})) {
    if (dependency.startsWith('@polymorph/') && !range.startsWith('npm:')) {
      faults.push(`${manifest.name} depends on unpublished ${dependency}`)
    }
  }
  for (const [dependency, range] of Object.entries(manifest.peerDependencies ?? {})) {
    if (dependency.startsWith('@polymorph/') && !/^\^\d+\.\d+\.\d+/.test(range)) {
      faults.push(
        `${manifest.name} has the peer ${dependency} at "${range}", which is not a version range`,
      )
    }
  }
  return faults
}
