#!/usr/bin/env node
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { createJiti } from 'jiti'

/**
 * `pnpm native:version [--check]` writes the release's version into the native
 * manifests that declare one: the Android builds' `build.gradle.kts` files and
 * the Dart package's `pubspec.yaml`. The release's version is the one
 * changesets gives every workspace package, read from `@polymorph/native`.
 * `pnpm version-packages` runs it after `changeset version`, so the release
 * commit carries the new number on every platform.
 *
 * `--check` writes nothing and exits non-zero when a manifest declares another
 * version; the law in `packages/native/src/version.test.ts` runs the same
 * comparison inside the suite.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')

const args = process.argv.slice(2)
const check = args.includes('--check')
if (args.some((arg) => arg !== '--check')) {
  console.error('usage: pnpm native:version [--check]')
  process.exit(1)
}

const jiti = createJiti(import.meta.url)
const { nativeVersions, releaseVersion, stampNativeVersion } = await jiti.import(
  resolve(ROOT, 'packages/native/src/version.ts'),
)

const release = releaseVersion(ROOT)
if (check) {
  const stale = Object.entries(nativeVersions(ROOT)).filter(([, version]) => version !== release)
  if (stale.length > 0) {
    const listed = stale.map(([path, version]) => `${path} ${version}`).join('\n  ')
    console.error(`native-version: not ${release}, run \`pnpm native:version\`:\n  ${listed}`)
    process.exit(1)
  }
  console.error(`native-version: every native manifest declares ${release}`)
} else {
  const changed = stampNativeVersion(ROOT, release)
  console.error(
    changed.length > 0
      ? `native-version: ${release} written to ${changed.join(', ')}`
      : `native-version: every native manifest already declares ${release}`,
  )
}
