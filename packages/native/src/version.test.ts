import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { NATIVE_MANIFESTS, nativeVersions, releaseVersion, stampNativeVersion } from './version'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')

describe('the native packages version', () => {
  // A release is one number. The npm packages carry it and the tag is `v` and
  // that number, so a native artifact built from the tag names it too.
  // `pnpm version-packages` writes it (`pnpm native:version`).
  it('is the release version in every native manifest that declares one', () => {
    const release = releaseVersion(ROOT)
    const versions = nativeVersions(ROOT)
    expect(Object.keys(versions)).toEqual(NATIVE_MANIFESTS.map(({ path }) => path))
    for (const [path, version] of Object.entries(versions)) expect(version, path).toBe(release)
  })

  it('is written on the declaring line alone, and only where it differs', () => {
    const copy = mkdtempSync(resolve(tmpdir(), 'native-version-'))
    try {
      for (const { path } of NATIVE_MANIFESTS)
        cpSync(resolve(ROOT, path), resolve(copy, path), { recursive: true })
      const release = releaseVersion(ROOT)

      expect(stampNativeVersion(copy, release)).toEqual([])
      expect(stampNativeVersion(copy, '9.8.7')).toEqual(NATIVE_MANIFESTS.map(({ path }) => path))
      for (const version of Object.values(nativeVersions(copy))) expect(version).toBe('9.8.7')

      for (const { path } of NATIVE_MANIFESTS) {
        const before = readFileSync(resolve(ROOT, path), 'utf8').split('\n')
        const after = readFileSync(resolve(copy, path), 'utf8').split('\n')
        const differing = after.filter((line, index) => line !== before[index])
        expect(differing, path).toHaveLength(1)
        expect(differing[0], path).toContain('9.8.7')
      }
    } finally {
      rmSync(copy, { recursive: true, force: true })
    }
  })
})
