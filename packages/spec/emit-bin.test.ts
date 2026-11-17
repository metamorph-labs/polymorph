import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

import { afterAll, describe, expect, it } from 'vitest'

import { emitScreen } from './src/emit'
import { readNativePackage } from './src/emit-native'
import type { ScreenSpec } from './src/schema'

/**
 * `pnpm emit`, run as a command.
 *
 * `spec.test.ts` checks the functions. This file runs the bin as a terminal
 * would, because its three guarantees concern what happens to a *file*. An
 * unlawful spec writes no file. A lawful spec whose output a red rule rejects
 * writes no file. A lawful spec writes exactly what the emitter produced. Each
 * refusal exits non-zero and explains why on stderr, so a script that chains
 * `emit` with a commit stops at the right point.
 */

const ROOT = resolve(import.meta.dirname, '../..')
const BIN = resolve(ROOT, 'packages/spec/bin/emit.js')
const scratch = mkdtempSync(resolve(tmpdir(), 'polymorph-emit-'))

afterAll(() => {
  rmSync(scratch, { recursive: true, force: true })
})

const SPEC = {
  spec: 'polymorph-screen/1',
  name: 'Probe',
  purpose: 'A probe.',
  inputs: [{ name: 'onSave', type: '() => void' }],
  root: {
    component: 'Stack',
    props: { gap: 4 },
    children: [{ component: 'Button', props: { label: 'Save', onClick: { $: 'onSave' } } }],
  },
}

/** Run the command on a spec, asking for the output at a path in the scratch directory. */
function emit(
  name: string,
  spec: unknown,
  toFile = true,
  extension = '.tsx',
  flags: string[] = [],
) {
  const input = resolve(scratch, `${name}.json`)
  const output = resolve(scratch, `${name}${extension}`)
  writeFileSync(input, JSON.stringify(spec))
  const files = toFile ? [input, output] : [input]
  const result = spawnSync(process.execPath, [BIN, ...files, ...flags], {
    cwd: ROOT,
    encoding: 'utf8',
  })
  return { status: result.status, stdout: result.stdout, stderr: result.stderr, output }
}

describe('pnpm emit', () => {
  it('writes a lawful screen, byte for byte what the emitter produces', async () => {
    const { status, output } = emit('lawful', SPEC)
    expect(status).toBe(0)
    expect(readFileSync(output, 'utf8')).toBe(
      await emitScreen(SPEC as ScreenSpec, { filepath: output }),
    )
  }, 60_000)

  it('prints it instead when no output is named, and nothing else on stdout', async () => {
    const { status, stdout, output } = emit('printed', SPEC, false)
    expect(status).toBe(0)
    expect(stdout).toBe(await emitScreen(SPEC as ScreenSpec))
    expect(existsSync(output)).toBe(false)
  }, 60_000)

  it('prints nothing for a type that is not a type, and says where', () => {
    const { status, stdout, stderr } = emit(
      'type',
      {
        ...SPEC,
        inputs: [
          { name: 'onSave', type: 'void }\nexport const smuggled = 1\ninterface Rest { a: string' },
        ],
      },
      false,
    )
    expect(status).toBe(1)
    expect(stdout).toBe('')
    expect(stderr).toContain('$.inputs[0].type')
  }, 60_000)

  it('writes nothing for a binding that is an expression, and says where', () => {
    const { status, stderr, output } = emit('expression', {
      ...SPEC,
      root: {
        component: 'Stack',
        props: { gap: 4 },
        children: [{ $: 'onSave() || <button>Save</button>' }],
      },
    })
    expect(status).toBe(1)
    expect(stderr).toContain('$.root.children[0]')
    expect(stderr).toContain('is not a binding')
    expect(existsSync(output)).toBe(false)
  }, 60_000)

  it('writes nothing for a lawful spec whose output a red rule refuses', () => {
    const { status, stderr, output } = emit('coloured', {
      ...SPEC,
      root: { component: 'Button', props: { label: '#7c3aed', onClick: { $: 'onSave' } } },
    })
    expect(status).toBe(1)
    expect(stderr).toContain('the red rules refuse')
    expect(stderr).toContain('polymorph/no-raw-styles')
    expect(existsSync(output)).toBe(false)
  }, 60_000)
})

describe('pnpm emit, for iOS', () => {
  /** The probe as a screen for iOS: its root a page archetype, as the native contract wants. */
  const IOS = {
    ...SPEC,
    name: 'ProbeView',
    platform: 'ios',
    root: {
      component: 'SettingsPage',
      props: { title: 'Probe' },
      children: [SPEC.root.children[0]],
    },
  }

  it('writes SwiftUI to a .swift file, byte for byte what the emitter produces', async () => {
    const { status, stderr, output } = emit('ios', IOS, true, '.swift')
    expect(status, stderr).toBe(0)
    expect(readFileSync(output, 'utf8')).toBe(
      await emitScreen(IOS as ScreenSpec, { native: readNativePackage(ROOT, 'ios') }),
    )
    expect(readFileSync(output, 'utf8')).toContain('struct ProbeView: View {')
  }, 60_000)

  it('refuses another extension for an iOS spec, and a .swift file for any other', () => {
    const swiftForWeb = emit('web-as-swift', SPEC, true, '.swift')
    expect(swiftForWeb.status).toBe(1)
    expect(swiftForWeb.stderr).toContain(
      'a .swift file is emitted from a spec whose platform is ios',
    )
    expect(existsSync(swiftForWeb.output)).toBe(false)

    const tsxForIos = emit('ios-as-tsx', IOS)
    expect(tsxForIos.status).toBe(1)
    expect(tsxForIos.stderr).toContain('is a screen for ios, which emits SwiftUI')
    expect(existsSync(tsxForIos.output)).toBe(false)
  }, 60_000)

  it('writes nothing for a spec the native contract refuses, and says where', () => {
    const { status, stderr, output } = emit(
      'ios-loose',
      { ...IOS, root: SPEC.root },
      true,
      '.swift',
    )
    expect(status).toBe(1)
    expect(stderr).toContain('$.root')
    expect(stderr).toContain('page archetype')
    expect(existsSync(output)).toBe(false)
  }, 60_000)

  it('refuses a web framework for an iOS spec', () => {
    const { status, stderr, output } = emit('ios-as-vue', IOS, true, '.swift', [
      '--framework',
      'vue',
    ])
    expect(status).toBe(1)
    expect(stderr).toContain('is a screen for ios, which emits SwiftUI, and --framework names')
    expect(existsSync(output)).toBe(false)
  }, 60_000)
})

describe('pnpm emit, for Android', () => {
  /** The probe as a screen for Android: its root a page archetype, as the native contract wants. */
  const ANDROID = {
    ...SPEC,
    name: 'ProbeScreen',
    platform: 'android',
    root: {
      component: 'SettingsPage',
      props: { title: 'Probe' },
      children: [SPEC.root.children[0]],
    },
  }

  it('writes Compose to a .kt file, byte for byte what the emitter produces', async () => {
    const { status, stderr, output } = emit('android', ANDROID, true, '.kt')
    expect(status, stderr).toBe(0)
    expect(readFileSync(output, 'utf8')).toBe(
      await emitScreen(ANDROID as ScreenSpec, {
        native: readNativePackage(ROOT, 'android'),
        filepath: output,
      }),
    )
    expect(readFileSync(output, 'utf8')).toContain(
      'fun ProbeScreen(model: ProbeModel, actions: ProbeActions) {',
    )
  }, 60_000)

  it('refuses another extension for an Android spec, a .kt file for any other, and a framework', () => {
    const ktForWeb = emit('web-as-kt', SPEC, true, '.kt')
    expect(ktForWeb.status).toBe(1)
    expect(ktForWeb.stderr).toContain('a .kt file is emitted from a spec whose platform is android')
    expect(existsSync(ktForWeb.output)).toBe(false)

    const swiftForAndroid = emit('android-as-swift', ANDROID, true, '.swift')
    expect(swiftForAndroid.status).toBe(1)
    expect(swiftForAndroid.stderr).toContain(
      'is a screen for android, which emits Jetpack Compose, and',
    )
    expect(existsSync(swiftForAndroid.output)).toBe(false)

    const solid = emit('android-as-solid', ANDROID, false, '.kt', ['--framework', 'solid'])
    expect(solid.status).toBe(1)
    expect(solid.stdout).toBe('')
    expect(solid.stderr).toContain('--framework names a web framework')
  }, 60_000)

  // Compose draws every member, so the binary has no member to refuse for a missing rendering.
  // `emit-kotlin.test.ts` holds that refusal against a package with a member taken out.
  it('writes nothing for a spec the native contract refuses, and says where', () => {
    const { status, stderr, output } = emit(
      'android-loose',
      { ...ANDROID, root: SPEC.root },
      true,
      '.kt',
    )
    expect(status).toBe(1)
    expect(stderr).toContain('$.root')
    expect(stderr).toContain('page archetype')
    expect(existsSync(output)).toBe(false)
  }, 60_000)
})
