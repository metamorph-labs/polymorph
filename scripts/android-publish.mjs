#!/usr/bin/env node
/**
 * `node scripts/android-publish.mjs` builds the Android library as JitPack builds
 * it (`jitpack.yml`) and checks what an app would resolve from it.
 *
 * JitPack runs the install command `jitpack.yml` names, with `JITPACK`, `GROUP`,
 * `ARTIFACT` and `VERSION` set, and serves what it finds in the local Maven
 * repository. This script runs the same Gradle tasks with the same variables
 * into a Maven repository of its own (`-Dmaven.repo.local`), so the machine's
 * `~/.m2` is left alone. It then checks that each module an app names is
 * there under JitPack's coordinates with a POM and Gradle module metadata: the
 * `tokens` module, and the `ui` module with its `jvm` and Android variants.
 * The metadata is what lets Gradle pick the Android variant for an app, so a
 * module published without it would resolve to nothing an Android build uses.
 * The `ui` module's dependency on `tokens` must name the same coordinates, or
 * an app would resolve `tokens` from a group JitPack does not serve.
 *
 * It needs the Android SDK the accessibility audit needs, and is skipped
 * without one, as the audit is. `pnpm gate:android` runs it.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const PROJECT = resolve(ROOT, 'platforms/android')
const GRADLE = resolve(PROJECT, 'gradlew')

/** What JitPack sets for this repository; the version stands for a tag or a commit. */
const JITPACK = { JITPACK: 'true', GROUP: 'com.github.metamorph-labs', ARTIFACT: 'polymorph' }
const VERSION = 'v0.0.0-check'
const GROUP_PATH = 'com/github/metamorph-labs/polymorph'
const COORDINATES = 'com.github.metamorph-labs.polymorph'

/** The modules an app names, and the variants Kotlin Multiplatform publishes for `ui`. */
const MODULES = ['tokens', 'ui', 'ui-jvm', 'ui-android']

const say = (line) => console.error(`android-publish: ${line}`)

/** The SDK's directory, from the environment or `local.properties`, as the audit finds it. */
function sdkDirectory() {
  for (const name of ['ANDROID_HOME', 'ANDROID_SDK_ROOT']) {
    const value = process.env[name]
    if (value && existsSync(value)) return value
  }
  const properties = resolve(PROJECT, 'local.properties')
  if (!existsSync(properties)) return undefined
  const line = readFileSync(properties, 'utf8')
    .split('\n')
    .find((entry) => entry.trim().startsWith('sdk.dir='))
  const value = line?.trim().slice('sdk.dir='.length)
  return value && existsSync(value) ? value : undefined
}

/** The Gradle tasks of `jitpack.yml`'s install command, so the two cannot drift apart. */
function installTasks() {
  const install = readFileSync(resolve(ROOT, 'jitpack.yml'), 'utf8')
    .split('\n')
    .find((line) => line.includes('./gradlew'))
  const tasks = install?.split(/\s+/).filter((word) => word.startsWith(':')) ?? []
  if (tasks.length === 0) throw new Error('jitpack.yml names no Gradle task to install')
  return tasks
}

if (sdkDirectory() === undefined) {
  say(
    'skipped — no Android SDK is installed (ANDROID_HOME, ANDROID_SDK_ROOT and ' +
      'platforms/android/local.properties name none), so the library is not built as JitPack builds it',
  )
  process.exit(0)
}

const repository = mkdtempSync(resolve(tmpdir(), 'android-publish-'))
let failed = false
try {
  const tasks = installTasks()
  say(`publishing ${tasks.join(' ')} as JitPack builds them, at ${VERSION}`)
  const result = spawnSync(
    GRADLE,
    ['-p', PROJECT, '--console=plain', `-Dmaven.repo.local=${repository}`, ...tasks],
    { env: { ...process.env, ...JITPACK, VERSION }, encoding: 'utf8' },
  )
  if (result.status !== 0) {
    process.stderr.write(`${result.stdout ?? ''}${result.stderr ?? ''}`)
    throw new Error(`\`gradlew ${tasks.join(' ')}\` failed`)
  }

  for (const module of MODULES) {
    const directory = resolve(repository, GROUP_PATH, module, VERSION)
    for (const extension of ['pom', 'module']) {
      const file = resolve(directory, `${module}-${VERSION}.${extension}`)
      if (!existsSync(file)) throw new Error(`${COORDINATES}:${module} has no .${extension}`)
    }
  }
  const metadata = readFileSync(
    resolve(repository, GROUP_PATH, 'ui', VERSION, `ui-${VERSION}.module`),
    'utf8',
  )
  for (const variant of ['ui-jvm', 'ui-android']) {
    if (!metadata.includes(`"module": "${variant}"`)) {
      throw new Error(`the ui module's metadata names no ${variant} variant`)
    }
  }
  const pom = readFileSync(
    resolve(repository, GROUP_PATH, 'ui-android', VERSION, `ui-android-${VERSION}.pom`),
    'utf8',
  )
  if (
    !pom.includes(`<groupId>${COORDINATES}</groupId>`) ||
    !pom.includes('<artifactId>tokens</artifactId>')
  ) {
    throw new Error(`ui-android does not depend on ${COORDINATES}:tokens`)
  }
  say(
    `JitPack's build publishes ${MODULES.map((module) => `${COORDINATES}:${module}`).join(', ')}, ` +
      'each with its POM and Gradle module metadata, and ui depends on tokens at those coordinates',
  )
} catch (error) {
  say(`failed — ${error.message}`)
  failed = true
} finally {
  rmSync(repository, { recursive: true, force: true })
}
process.exitCode = failed ? 1 : 0
