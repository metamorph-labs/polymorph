import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * The native manifests that declare a version, and the line in each that
 * declares it. Each native package ships at the release tag, and each of these
 * manifests carries the release's version, so an artifact built from the tag
 * names the same number as the npm packages released with it.
 *
 * The Swift package declares no version: SwiftPM reads it from the tag.
 */
export const NATIVE_MANIFESTS = [
  { path: 'platforms/android/tokens/build.gradle.kts', line: /^version = "([^"]*)"$/m },
  { path: 'platforms/android/ui/build.gradle.kts', line: /^version = "([^"]*)"$/m },
  { path: 'platforms/dart/pubspec.yaml', line: /^version: (\S+)$/m },
] as const

/**
 * The release's version. Changesets moves every workspace package to it, and
 * `@polymorph/native` is one of them, so its manifest is where the native side
 * reads it.
 */
export function releaseVersion(root: string): string {
  const manifest = JSON.parse(
    readFileSync(resolve(root, 'packages/native/package.json'), 'utf8'),
  ) as { version: string }
  return manifest.version
}

/** The version each native manifest declares, by path. */
export function nativeVersions(root: string): Record<string, string> {
  const versions: Record<string, string> = {}
  for (const { path, line } of NATIVE_MANIFESTS) {
    const match = line.exec(readFileSync(resolve(root, path), 'utf8'))
    if (!match) throw new Error(`${path} declares no version`)
    versions[path] = match[1] as string
  }
  return versions
}

/**
 * Writes `version` into each native manifest, and returns the paths whose
 * version changed.
 */
export function stampNativeVersion(root: string, version: string): string[] {
  const changed: string[] = []
  for (const { path, line } of NATIVE_MANIFESTS) {
    const file = resolve(root, path)
    const source = readFileSync(file, 'utf8')
    const match = line.exec(source)
    if (!match) throw new Error(`${path} declares no version`)
    if (match[1] === version) continue
    const stamped = match[0].replace(match[1] as string, version)
    const end = match.index + match[0].length
    writeFileSync(file, source.slice(0, match.index) + stamped + source.slice(end))
    changed.push(path)
  }
  return changed
}
