import { execFile, spawnSync } from 'node:child_process'
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'

import { afterAll, describe, expect, it } from 'vitest'

import { emitSwift } from './emit-swift'
import { exampleProbeTheme } from './examples'
import { resolveTheme } from './resolve-theme'

/**
 * The Swift package compiles and its token tests pass, on a machine with the
 * Swift toolchain (`xcrun swift`). Elsewhere each check is skipped and its
 * title says why. The freshness law (`native.test.ts`) proves the files on
 * disk are what the emitter writes; these prove Swift accepts them.
 *
 * - `swift build` in `platforms/ios`: the generated statics against the
 *   hand-written `PMTheme.swift`.
 * - `swift test --filter PolymorphTokensTests`: the catalogue's checks and the
 *   loader's (`PMTheme(tokenDocument:)` decoding the engine's documents to
 *   the emitter's statics, through `Tests/fixtures/token-documents.mjs`).
 *   `PolymorphUI`'s harness is `pnpm gate:ios`'s.
 * - `swiftc -typecheck` over `PolymorphTokens`' sources and the probe's
 *   static (`emitSwift` of the engine's probe, with one `PMException` of each
 *   kind, which no catalogue pairing declares), written into a scratch
 *   directory as the Kotlin and Dart checks write theirs. Once for macOS, and
 *   once for the iOS Simulator SDK when Xcode has one, so the
 *   `#if canImport(UIKit)` branches `swift build` on a Mac never sees compile
 *   too.
 *
 * Builds are incremental. On an Apple-silicon Mac, `swift test` takes about
 * 25 seconds from a clean build and 2 after one, and the four together about
 * 15 once the package is built: the two type checks start from nothing each
 * time. The Swift emitter's test builds the same package's Relay example
 * (`packages/spec/src/emit-swift.test.ts`); SwiftPM serialises the two builds
 * through its own lock on the package's `.build`, so neither test takes one.
 */

const PACKAGE = resolve(process.cwd(), 'platforms/ios')
const SOURCES = resolve(PACKAGE, 'Sources/PolymorphTokens')
const succeeds = (command: string, args: string[]) =>
  spawnSync(command, args, { stdio: 'ignore' }).status === 0
const hasSwift = succeeds('xcrun', ['--find', 'swift'])
const simulatorSdk = hasSwift
  ? spawnSync('xcrun', ['--sdk', 'iphonesimulator', '--show-sdk-path'], {
      encoding: 'utf8',
    }).stdout?.trim() || null
  : null
/** The deployment targets `Package.swift` declares. */
const ARCH = process.arch === 'arm64' ? 'arm64' : 'x86_64'
const MACOS_TARGET = `${ARCH}-apple-macos14.0`
const IOS_SIMULATOR_TARGET = `${ARCH}-apple-ios17.0-simulator`
const TIMEOUT = 5 * 60_000

const skipped = (title: string, available: boolean, reason: string) =>
  available ? title : `${title} (skipped: ${reason})`

/** Runs `xcrun` with `args`; the output when it fails, or '' when it succeeds. */
async function xcrun(args: string[]): Promise<string> {
  const result = await promisify(execFile)('xcrun', args, {
    timeout: TIMEOUT,
    maxBuffer: 64 * 1024 * 1024,
  }).catch((error: { stdout?: string; stderr?: string; message: string }) => error)
  return 'message' in result
    ? `${result.stdout ?? ''}\n${result.stderr ?? ''}\n${result.message}`
    : ''
}

/** `PolymorphTokens`' sources and the probe's static, in a scratch directory. */
function probeSources(): string[] {
  const dir = mkdtempSync(join(tmpdir(), 'pm-swift-'))
  scratch.push(dir)
  writeFileSync(join(dir, 'Probe.swift'), emitSwift(resolveTheme(exampleProbeTheme)))
  const sources = readdirSync(SOURCES, { recursive: true, encoding: 'utf8' })
    .filter((file) => file.endsWith('.swift'))
    .map((file) => join(SOURCES, file))
    .sort()
  return [...sources, join(dir, 'Probe.swift')]
}

const scratch: string[] = []
afterAll(() => scratch.forEach((dir) => rmSync(dir, { recursive: true, force: true })))

const typecheck = ['-typecheck', '-parse-as-library', '-module-name', 'PolymorphTokens']

describe('platforms/ios', () => {
  it.skipIf(!hasSwift)(
    skipped('compiles with swift build', hasSwift, 'no `xcrun swift` here'),
    async () => {
      expect(await xcrun(['swift', 'build', '--package-path', PACKAGE])).toBe('')
    },
    TIMEOUT,
  )

  it.skipIf(!hasSwift)(
    skipped(
      'passes its token tests with swift test --filter PolymorphTokensTests',
      hasSwift,
      'no `xcrun swift` here',
    ),
    async () => {
      expect(
        await xcrun([
          'swift',
          'test',
          '--package-path',
          PACKAGE,
          '--filter',
          'PolymorphTokensTests',
        ]),
      ).toBe('')
    },
    TIMEOUT,
  )

  it.skipIf(!hasSwift)(
    skipped(
      'type-checks the probe with PolymorphTokens for macOS',
      hasSwift,
      'no `xcrun swift` here',
    ),
    async () => {
      expect(
        await xcrun(['swiftc', ...typecheck, '-target', MACOS_TARGET, ...probeSources()]),
      ).toBe('')
    },
    TIMEOUT,
  )

  it.skipIf(!simulatorSdk)(
    skipped(
      'type-checks the probe with PolymorphTokens for the iOS Simulator',
      simulatorSdk !== null,
      'no iOS Simulator SDK (`xcrun --sdk iphonesimulator --show-sdk-path`)',
    ),
    async () => {
      expect(
        await xcrun([
          '--sdk',
          'iphonesimulator',
          'swiftc',
          ...typecheck,
          '-target',
          IOS_SIMULATOR_TARGET,
          '-sdk',
          simulatorSdk!,
          ...probeSources(),
        ]),
      ).toBe('')
    },
    TIMEOUT,
  )
})
