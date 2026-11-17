#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

/**
 * The last step of `pnpm gate:ios`: the iOS half of `platforms/ios`.
 *
 * `swift build` and `swift test` run on macOS, so code behind `#if os(iOS)` or
 * `canImport(UIKit)` never compiles there. This script
 *
 * 1. type-checks every target `xcodebuild test` builds against the iOS
 *    Simulator SDK with `swiftc`: `PolymorphTokens`, `PolymorphUI`, the Relay
 *    example (`RelayExample`) and the three test targets. It needs Xcode, not
 *    a simulator runtime, so it runs on every Mac;
 * 2. when `xcrun simctl list runtimes` lists an iOS runtime, runs
 *    `PolymorphUITests` with `xcodebuild test` on an iPhone simulator, which
 *    it creates for the run and deletes afterwards. The simulator is the
 *    device type and runtime the threshold was measured on, where they are
 *    installed, and otherwise the newest runtime and an iPhone it supports,
 *    and the script says so, because UIKit sizes its own controls by
 *    release and device, so the count can differ with no change here:
 *    `AccessibilityAuditTests`, the audit that exists only on iOS, and the
 *    contract tests (the render and identity tests are macOS's, run by
 *    `swift test`). It reads the result bundle and prints every failure and
 *    runtime warning the run recorded. A failure of `AccessibilityAuditTests`
 *    that names an entry is a finding of the audit, and its wording says
 *    which of two kinds it is. A system control is a control UIKit hosts that
 *    takes its own taps over the area UIKit hit-tests to it (a compact date
 *    picker, a menu's button, a navigation bar's button); one whose area is
 *    under the 44-point hit region is recorded as "… is UIKit's control at
 *    UIKit's size, hit-tested over 34 points of height". Every other finding
 *    is a defect. The script prints each list, and the step fails when there
 *    are more defects than
 *    `scripts/native-audits/thresholds.json` allows (`ios.count`), more
 *    system controls than it records (`ios.system`), or any other failure.
 *    `PM_MEMBERS=Input,Toast` audits only the members it names, and then
 *    fails on any defect and prints the system controls without failing on
 *    them;
 * 3. otherwise prints why the audit was skipped and exits 0.
 *
 * `docs/verification.md` ("The iOS gate") describes the whole gate.
 */

const ROOT = resolve(import.meta.dirname, '..')
const PACKAGE = resolve(ROOT, 'platforms/ios')
const SCHEME = 'PolymorphTokens-Package'
/** The deployment target `Package.swift` declares for iOS. */
const IOS_TARGET = '17.0'
/** How long the simulator run may take, building included, before it is stopped. */
const TEST_TIMEOUT_MS = 30 * 60 * 1000
/**
 * The most defects the audit may report (`count`, zero), the system controls
 * it records under the hit region (`system`), and the device type and the
 * runtime both were measured on (`device`, `runtime`). `system` rises only
 * for a new fixture state that hosts such a control, and falls when UIKit
 * takes one's taps over 44 points (`docs/verification.md`, "The audit
 * thresholds").
 */
const THRESHOLD = JSON.parse(
  readFileSync(resolve(ROOT, 'scripts/native-audits/thresholds.json'), 'utf8'),
).ios
/** The audit's own suite, and the shape of its findings: `Member — entry (size): what it found`. */
const AUDIT = 'AccessibilityAuditTests'
const FINDING = /^.+ — .+ \(UICTContentSizeCategory\w+\): .+/s
/** A system control the audit records: `… is UIKit's control at UIKit's size, hit-tested over 34 points of height`. */
const SYSTEM =
  /: .+ is UIKit's control at UIKit's size, hit-tested over [\d.]+ points of (?:height|width)$/s

const say = (line) => console.error(`ios-audit: ${line}`)

/** Runs a command to completion; its output is returned, or shown when `show` is set. */
function run(command, args, { show = false, cwd = ROOT, timeout } = {}) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    stdio: show ? 'inherit' : 'pipe',
    maxBuffer: 256 * 1024 * 1024,
    timeout,
  })
  return {
    ok: result.status === 0,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    error: result.error,
  }
}

const swiftFiles = (dir) =>
  readdirSync(resolve(PACKAGE, dir), { recursive: true })
    .filter((file) => String(file).endsWith('.swift'))
    .map((file) => resolve(PACKAGE, dir, String(file)))
    .sort()

/* -------------------------------------------------------------------------- */

if (process.platform !== 'darwin' || !run('xcrun', ['--find', 'swiftc']).ok) {
  say(
    'skipped — there is no Xcode here (`xcrun swiftc` is not found), so nothing iOS can be built or run',
  )
  process.exit(0)
}

// 1. The iOS type check.
const sdk = run('xcrun', ['--sdk', 'iphonesimulator', '--show-sdk-path'])
if (!sdk.ok) {
  say('failed — Xcode has no iOS Simulator SDK (`xcrun --sdk iphonesimulator --show-sdk-path`)')
  process.exit(1)
}
const platformPath = run('xcrun', [
  '--sdk',
  'iphonesimulator',
  '--show-sdk-platform-path',
]).stdout.trim()
const arch = process.arch === 'arm64' ? 'arm64' : 'x86_64'
const target = `${arch}-apple-ios${IOS_TARGET}-simulator`
const modules = mkdtempSync(join(tmpdir(), 'polymorph-ios-'))
const swiftc = (args) =>
  run('xcrun', [
    '--sdk',
    'iphonesimulator',
    'swiftc',
    '-target',
    target,
    '-sdk',
    sdk.stdout.trim(),
    ...args,
  ])

// `@testable import` needs a module built for testing, as Xcode's Debug builds are.
const steps = [
  [
    'PolymorphTokens',
    [
      '-emit-module',
      '-parse-as-library',
      '-enable-testing',
      '-module-name',
      'PolymorphTokens',
      '-emit-module-path',
      join(modules, 'PolymorphTokens.swiftmodule'),
      ...swiftFiles('Sources/PolymorphTokens'),
    ],
  ],
  [
    'PolymorphUI',
    [
      '-emit-module',
      '-parse-as-library',
      '-enable-testing',
      '-module-name',
      'PolymorphUI',
      '-I',
      modules,
      '-emit-module-path',
      join(modules, 'PolymorphUI.swiftmodule'),
      ...swiftFiles('Sources/PolymorphUI'),
    ],
  ],
  [
    'RelayExample',
    [
      '-emit-module',
      '-parse-as-library',
      '-enable-testing',
      '-module-name',
      'RelayExample',
      '-I',
      modules,
      '-emit-module-path',
      join(modules, 'RelayExample.swiftmodule'),
      ...swiftFiles('Examples/Relay/Sources/RelayExample'),
    ],
  ],
  ...[
    ['PolymorphTokensTests', 'Tests/PolymorphTokensTests'],
    ['PolymorphUITests', 'Tests/PolymorphUITests'],
    ['RelayExampleTests', 'Examples/Relay/Tests/RelayExampleTests'],
  ].map(([name, dir]) => [
    name,
    [
      '-typecheck',
      '-parse-as-library',
      '-module-name',
      name,
      '-I',
      modules,
      '-F',
      join(platformPath, 'Developer/Library/Frameworks'),
      '-I',
      join(platformPath, 'Developer/usr/lib'),
      ...swiftFiles(dir),
    ],
  ]),
]
try {
  for (const [name, args] of steps) {
    const result = swiftc(args)
    if (!result.ok) {
      process.stderr.write(result.stdout + result.stderr)
      say(`failed — ${name} does not compile for the iOS Simulator (${target})`)
      process.exit(1)
    }
  }
} finally {
  rmSync(modules, { recursive: true, force: true })
}
say(
  `PolymorphTokens, PolymorphUI, RelayExample and the three test targets type-check for ${target}`,
)

// 2. The simulator audit, when there is a simulator to run it on.
const runtimes = JSON.parse(
  run('xcrun', ['simctl', 'list', 'runtimes', '--json']).stdout || '{"runtimes":[]}',
)
  .runtimes.filter(
    (runtime) =>
      runtime.isAvailable !== false &&
      (runtime.platform === 'iOS' || /iOS/.test(runtime.identifier ?? '')),
  )
  .sort((a, b) => String(b.version).localeCompare(String(a.version), 'en', { numeric: true }))

if (runtimes.length === 0) {
  say(
    'accessibility audit skipped — no iOS simulator runtime is installed (`xcrun simctl list runtimes` ' +
      'lists none). Install one with `xcodebuild -downloadPlatform iOS`, and this step runs ' +
      'AccessibilityAuditTests on an iPhone simulator.',
  )
  process.exit(0)
}

// The runtime the threshold was measured on, else the newest.
const runtime = runtimes.find((candidate) => candidate.name === THRESHOLD.runtime) ?? runtimes[0]
// The run gets a simulator of its own, deleted when the script exits: a second
// `xcodebuild test` on the same device, from another run on this Mac, would
// stop this one's test process. Its type is the one the threshold was measured
// on, else the first iPhone of the runtime that already has a device, else the
// first iPhone the runtime supports.
const devices =
  JSON.parse(run('xcrun', ['simctl', 'list', 'devices', 'available', '--json']).stdout).devices[
    runtime.identifier
  ] ?? []
const types = runtime.supportedDeviceTypes ?? []
const type =
  types.find((candidate) => candidate.name === THRESHOLD.device) ??
  types.find(
    (candidate) =>
      candidate.identifier ===
      devices.find((device) => device.name.startsWith('iPhone'))?.deviceTypeIdentifier,
  ) ??
  types.find((candidate) => candidate.productFamily === 'iPhone')
if (!type) {
  say(`failed — ${runtime.name} supports no iPhone device type to run the audit on`)
  process.exit(1)
}
const created = run('xcrun', [
  'simctl',
  'create',
  `Polymorph Audit ${process.pid}`,
  type.identifier,
  runtime.identifier,
])
if (!created.ok) {
  process.stderr.write(created.stderr)
  say(`failed — could not create an ${type.name} simulator on ${runtime.name}`)
  process.exit(1)
}
const device = { name: type.name, udid: created.stdout.trim() }
// Xcode's test services can hold the device for a few seconds after the run,
// so the deletion is tried again, a second apart, before the script gives up
// and says how to delete it by hand.
process.on('exit', () => {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    run('xcrun', ['simctl', 'shutdown', device.udid])
    if (run('xcrun', ['simctl', 'delete', device.udid]).ok) return
    spawnSync('sleep', ['1'])
  }
  say(`the simulator it created remains: xcrun simctl delete ${device.udid}`)
})
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => process.exit(1))

const on = `${device.name} (${runtime.name})`
const measured = `${THRESHOLD.device} (${THRESHOLD.runtime})`
/** Whether this run is on the device type and runtime the threshold was measured on. */
const comparable = device.name === THRESHOLD.device && runtime.name === THRESHOLD.runtime
if (!comparable) {
  say(
    `the threshold was measured on ${measured}, which this Mac does not have; this run is on ` +
      `${on}, where UIKit can size its own controls differently, so the count can differ ` +
      'with no change to the members',
  )
}
// `xcodebuild` hands the test runner each variable named `TEST_RUNNER_<name>` as `<name>`.
const only = process.env.PM_MEMBERS?.trim() || undefined
if (only) process.env.TEST_RUNNER_PM_MEMBERS = only
say(`running PolymorphUITests, the accessibility audit among them, on a new ${on} simulator`)
const results = mkdtempSync(join(tmpdir(), 'polymorph-ios-audit-'))
// `process.exit` skips `finally`, so the bundle is removed on exit instead.
process.on('exit', () => rmSync(results, { recursive: true, force: true }))
const bundle = join(results, 'PolymorphUITests.xcresult')
const test = run(
  'xcodebuild',
  [
    'test',
    '-quiet',
    '-scheme',
    SCHEME,
    '-destination',
    `platform=iOS Simulator,id=${device.udid}`,
    '-only-testing:PolymorphUITests',
    '-resultBundlePath',
    bundle,
  ],
  { cwd: PACKAGE, timeout: TEST_TIMEOUT_MS },
)
if (test.error?.code === 'ETIMEDOUT') {
  say(`failed — PolymorphUITests did not finish on ${on} in ${TEST_TIMEOUT_MS / 60000} minutes`)
  process.exit(1)
}
const report = readResults(bundle)
if (report === undefined) {
  // No test ran: the build failed, or the simulator did not start.
  process.stderr.write(test.stdout + test.stderr)
  say(`failed — PolymorphUITests did not run on ${on}`)
  process.exit(1)
}
for (const warning of report.warnings) say(`runtime warning: ${warning}`)
const findings = report.failures.filter(
  (failure) => failure.suite === AUDIT && FINDING.test(failure.message),
)
const system = findings.filter((failure) => SYSTEM.test(failure.message))
const defects = findings.filter((failure) => !system.includes(failure))
const others = report.failures.filter((failure) => !findings.includes(failure))
if (system.length > 0) say(`system controls at UIKit's size, recorded (${system.length}):`)
for (const failure of system) say(`  ${failure.message}`)
if (defects.length > 0) say(`defects (${defects.length}):`)
for (const failure of defects) say(`  ${failure.message}`)
for (const failure of others) say(`  ${failure.suite}.${failure.test}: ${failure.message}`)
const ran = `${report.cases} test cases (${report.suites.join(', ')}) on ${on}`
if (others.length > 0 || (!test.ok && report.failures.length === 0)) {
  if (report.failures.length === 0) process.stderr.write(test.stdout + test.stderr)
  say(`failed — ${ran}: a test failed other than by an audit finding, listed above`)
  process.exit(1)
}
const listed = (list) => `${list.length > 0 ? ', listed above' : ''}`
if (only) {
  say(
    `PolymorphUITests ran ${ran}, auditing only ${only}: ${defects.length} defects` +
      `${listed(defects)}, and ${system.length} system controls recorded${listed(system)}; ` +
      'the thresholds apply to a whole run',
  )
  process.exit(defects.length > 0 ? 1 : 0)
}
const counted =
  `the accessibility audit found ${defects.length} defects${listed(defects)} and recorded ` +
  `${system.length} system controls${listed(system)}; scripts/native-audits/thresholds.json ` +
  `allows ${THRESHOLD.count} defects and records ${THRESHOLD.system} system controls, ` +
  `measured on ${measured}`
if (defects.length > THRESHOLD.count || system.length > THRESHOLD.system) {
  say(`failed — ${ran}: ${counted}`)
  process.exit(1)
}
say(`PolymorphUITests ran ${ran}: ${counted}`)
for (const [key, found, number] of [
  ['ios.count', defects.length, THRESHOLD.count],
  ['ios.system', system.length, THRESHOLD.system],
]) {
  if (found >= number) continue
  say(
    comparable
      ? `lower "${key}" in scripts/native-audits/thresholds.json to ${found}`
      : `fewer findings than "${key}" on ${on}; lower it from a run on ${measured}, ` +
          "or record this run's numbers with its device and runtime",
  )
}

/**
 * The test cases, failures and runtime warnings a result bundle records, or
 * undefined when it records no test. A failure is the assertion's own message,
 * after XCTest's description of the comparison, with its suite and test case.
 */
function readResults(path) {
  const read = run('xcrun', ['xcresulttool', 'get', 'test-results', 'tests', '--path', path])
  if (!read.ok) return undefined
  const report = { suites: [], cases: 0, failures: [], warnings: [] }
  const visit = (node, suite, test) => {
    if (node.nodeType === 'Test Suite') {
      report.suites.push(node.name)
      suite = node.name
    }
    if (node.nodeType === 'Test Case') {
      report.cases += 1
      test = node.name
    }
    if (node.nodeType === 'Failure Message') {
      const message = node.name.replace(/^[^:]+:\d+: /, '')
      const dash = message.indexOf(' - ')
      report.failures.push({
        suite,
        test,
        message: dash === -1 ? message : message.slice(dash + 3),
      })
    }
    if (node.nodeType === 'Runtime Warning') report.warnings.push(node.name)
    for (const child of node.children ?? []) visit(child, suite, test)
  }
  for (const node of JSON.parse(read.stdout).testNodes ?? []) visit(node)
  return report.cases === 0 ? undefined : report
}
