#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * The last step of `pnpm gate:android`: the Android target of `platforms/android/ui`.
 *
 * The gate's earlier steps build and test the JVM target of the member module
 * (`:tokens:build :ui:jvmTest :examples:relay:jvmTest`), which needs no
 * Android SDK. The Android target is declared in the same module
 * (`ui/build.gradle.kts`), and its tasks need an SDK. This script
 *
 * 1. looks for one: `ANDROID_HOME`, `ANDROID_SDK_ROOT`, or `sdk.dir` in
 *    `platforms/android/local.properties`;
 * 2. with one, runs two Gradle tasks through the project's wrapper:
 *    - `:ui:assembleAndroidMain`, the Android library: the check that every
 *      Android library it depends on accepts the module's `compileSdk`, the
 *      Kotlin compile of every member for Android with warnings as errors, and
 *      the AAR;
 *    - `:ui:testAndroidHostTest`, the Android target's host tests: the
 *      Back test of AppShell's drawer (`AppShellBackTest`), the Back test of
 *      MasterDetailPage's detail (`MasterDetailPageBackTest`), the keyboard
 *      test of a page's scroll region (`PageKeyboardTest`), the keyboard
 *      test of MultiSelect's search field (`MultiSelectKeyboardTest`), and
 *      the accessibility audit
 *      (`ui/src/androidHostTest/kotlin/…/AccessibilityAuditTest.kt`): every
 *      states fixture entry composed by Android's Compose runtime under
 *      Robolectric, on the JVM, held to the JVM harness's semantics rules and
 *      to the Accessibility Test Framework's error-level rules over the nodes
 *      Android publishes, with the audit's own test of how it hears a control
 *      (`theAuditHearsWhatTalkBackHears`). It needs no device or emulator;
 *    and prints what the audit covered and each defect it found. The step
 *    fails when the audit finds more defects than
 *    `scripts/native-audits/thresholds.json` allows (`android`), and when a
 *    host test fails in any other way. `PM_MEMBERS=TimeInput,Carousel` audits only
 *    the members it names, and then fails on any defect;
 * 3. without one, says that neither ran, and exits 0.
 *
 * `docs/verification.md` ("The Android gate") describes the whole gate.
 */

const ROOT = resolve(import.meta.dirname, '..')
const PROJECT = resolve(ROOT, 'platforms/android')
const GRADLE = resolve(PROJECT, 'gradlew')
const RESULTS = resolve(PROJECT, 'ui/build/test-results/testAndroidHostTest')

/** The most defects the audit may report: a number that only comes down. */
const THRESHOLD = JSON.parse(
  readFileSync(resolve(ROOT, 'scripts/native-audits/thresholds.json'), 'utf8'),
).android
/** The shape of a defect the audit reports: `Member — entry: what is wrong`. */
const DEFECT = /^.+ — .+: .+/

const say = (line) => console.error(`android-audit: ${line}`)

/** The SDK's directory, from the environment or `local.properties`, when one exists. */
function sdkDirectory() {
  for (const name of ['ANDROID_HOME', 'ANDROID_SDK_ROOT']) {
    const value = process.env[name]
    if (value && existsSync(value)) return value
  }
  const properties = resolve(PROJECT, 'local.properties')
  if (existsSync(properties)) {
    const line = readFileSync(properties, 'utf8')
      .split('\n')
      .find((entry) => entry.trim().startsWith('sdk.dir='))
    const value = line?.trim().slice('sdk.dir='.length)
    if (value && existsSync(value)) return value
  }
  return undefined
}

/** The members `PM_MEMBERS` names, comma-separated, when the audit is to cover only those. */
const ONLY = process.env.PM_MEMBERS?.trim() || undefined

/** Runs a Gradle task through the wrapper; its output is printed only when it fails. */
function gradle(task) {
  const only = ONLY ? [`-Ppm.members=${ONLY}`] : []
  const result = spawnSync(GRADLE, ['-p', PROJECT, '--console=plain', task, ...only], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  })
  return { ok: result.status === 0, output: (result.stdout ?? '') + (result.stderr ?? '') }
}

/** XML's five escapes, undone. */
const unescape = (text) =>
  text
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#10;', '\n')
    .replaceAll('&apos;', "'")
    .replaceAll('&amp;', '&')

/** The test that audits every fixture entry, in `AccessibilityAuditTest`. */
const AUDIT = 'everyEntryPassesTheAudit'

/**
 * What the host tests' JUnit reports say: the line the audit prints with what
 * it covered, its failure, one line per defect, and every other test's
 * failures (the audit's own test of how it reads a node among them), or
 * undefined when the audit left no report. A failure of the audit that is not
 * its assertion (an exception) is kept whole as `error`.
 */
function readAudit() {
  if (!existsSync(RESULTS)) return undefined
  const files = readdirSync(RESULTS).filter((name) => name.endsWith('.xml'))
  const file = files.find((name) => name.includes('AccessibilityAuditTest'))
  if (file === undefined) return undefined
  const failures = files.flatMap((name) => {
    const xml = readFileSync(resolve(RESULTS, name), 'utf8')
    return [
      ...xml.matchAll(
        /<testcase name="([^"]*)" classname="([^"]*)"[^>]*>\s*<(?:failure|error) message="([^"]*)" type="([^"]*)"/g,
      ),
    ].map(([, test, suite, message, type]) => ({ test, suite, message: unescape(message), type }))
  })
  const isAudit = (failure) =>
    failure.test === AUDIT && failure.suite.endsWith('.AccessibilityAuditTest')
  const others = failures
    .filter((failure) => !isAudit(failure))
    .map((failure) => `${failure.suite.split('.').at(-1)}.${failure.test}: ${failure.message}`)
  const xml = readFileSync(resolve(RESULTS, file), 'utf8')
  const covered = /AccessibilityAuditTest: audited ([^\n<]*)/.exec(xml)?.[1]
  const failure = failures.find(isAudit)
  if (failure === undefined) return { covered, defects: [], others }
  const lines = failure.message
    .replace(/^java\.lang\.AssertionError: /, '')
    .split('\n')
    .filter((line) => line.trim() !== '')
  if (failure.type !== 'java.lang.AssertionError' || !lines.every((line) => DEFECT.test(line))) {
    return { covered, defects: [], others, error: failure.message }
  }
  return { covered, defects: lines, others }
}

const sdk = sdkDirectory()
if (sdk === undefined) {
  say(
    'skipped — no Android SDK is installed (ANDROID_HOME, ANDROID_SDK_ROOT and ' +
      'platforms/android/local.properties name none), so the Android library is not built and ' +
      'the accessibility audit does not run; the JVM target was built and tested above',
  )
  process.exit(0)
}
if (!existsSync(GRADLE)) {
  say('failed — platforms/android/gradlew, the Gradle wrapper the gate runs, is missing')
  process.exit(1)
}

say(`building the Android library (:ui:assembleAndroidMain) with the SDK at ${sdk}`)
const library = gradle(':ui:assembleAndroidMain')
if (!library.ok) {
  process.stderr.write(library.output)
  say('failed — the Android library does not build (:ui:assembleAndroidMain)')
  process.exit(1)
}
say(
  'the Android library builds: its dependencies accept its compileSdk, every member compiles ' +
    'for Android with warnings as errors, and the AAR is assembled',
)

say(
  'running the host tests, the accessibility audit among them, under Robolectric (:ui:testAndroidHostTest)',
)
// The last run's report goes first, so a run that fails to start leaves none to
// be read; Gradle reruns a task whose outputs are missing.
rmSync(RESULTS, { recursive: true, force: true })
const audit = gradle(':ui:testAndroidHostTest')
const report = readAudit()
if (report === undefined || report.covered === undefined) {
  process.stderr.write(audit.output)
  say('failed — the accessibility audit did not run (:ui:testAndroidHostTest)')
  process.exit(1)
}
if (report.error !== undefined) {
  process.stderr.write(`${report.error}\n`)
  say('failed — the accessibility audit stopped on an error, above, not on a defect')
  process.exit(1)
}
if (report.others.length > 0) {
  for (const failure of report.others) say(`  ${failure}`)
  say('failed — a host test other than the accessibility audit failed, listed above')
  process.exit(1)
}
for (const defect of report.defects) say(`  ${defect}`)
if (ONLY) {
  say(
    `the accessibility audit covered ${report.covered}, only ${ONLY}, and found ` +
      `${report.defects.length} defects${report.defects.length > 0 ? ', listed above' : ''}; ` +
      'the threshold applies to a whole run',
  )
  process.exit(report.defects.length > 0 ? 1 : 0)
}
const counted =
  `the accessibility audit covered ${report.covered} and found ${report.defects.length} defects` +
  `${report.defects.length > 0 ? ', listed above' : ''}; ` +
  `scripts/native-audits/thresholds.json allows ${THRESHOLD}`
if (report.defects.length > THRESHOLD) {
  say(`failed — ${counted}`)
  process.exit(1)
}
say(counted)
if (report.defects.length < THRESHOLD) {
  say(`lower "android" in scripts/native-audits/thresholds.json to ${report.defects.length}`)
}
