import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

import {
  check,
  EscapingDirError,
  MANIFEST_FILE,
  readManifest,
  UnknownItemError,
} from '@polymorph/cli'
import { verify } from '@polymorph/rules/verify'
import {
  buildRegistry,
  codeFrameworkOf,
  FRAMEWORK_VOCABULARY,
  type Framework,
  type Registry,
} from '@polymorph/registry'
import { EMITTED_MARKER } from '@polymorph/spec'
import { parsePalette, parseSystem } from '@polymorph/theme'
import { afterAll, describe, expect, it } from 'vitest'

import {
  emitScreen,
  fix,
  fixFile,
  getInstallPlan,
  install,
  proposeTheme,
  RefusedWriteError,
  saveTheme,
  UnfinishedInstallError,
  validate,
  type ToolContext,
} from './tools'
import { codeFrameworkIn } from './write'

/**
 * The four tools that write, tested without a protocol.
 *
 * Each one writes what a read tool answered, so each is tested for two things.
 * What arrives on disk must be what the machinery it fronts produces (the
 * emitter's bytes, the installer's plan, the documents the engine admitted). A
 * refusal must leave the project exactly as it was. Most of this file tests
 * refusals, because a write tool is judged by what it declines to do.
 *
 * Every project here is a temporary directory outside the workspace. The
 * vocabulary is read from this checkout, as a server reads it, and nothing in
 * this checkout is written.
 */

const ROOT = resolve(import.meta.dirname, '../../..')
const registry: Registry = buildRegistry(ROOT)

const temporaries: string[] = []

afterAll(() => {
  for (const path of temporaries) rmSync(path, { recursive: true, force: true })
})

/** A repository to write into: a directory with a manifest, and nothing else. */
function project(): ToolContext & { project: string } {
  const path = mkdtempSync(resolve(tmpdir(), 'polymorph-mcp-'))
  temporaries.push(path)
  writeFileSync(
    resolve(path, 'package.json'),
    `${JSON.stringify({ name: 'scratch', private: true, dependencies: {} }, null, 2)}\n`,
  )
  return { registry, root: ROOT, project: path }
}

/** Every file under a project, as relative paths, for "wrote nothing" checks. */
function tree(root: string): string[] {
  return (readdirSync(root, { recursive: true }) as string[]).sort()
}

const read = (context: { project: string }, path: string) =>
  readFileSync(resolve(context.project, path), 'utf8')

/* -------------------------------------------------------------------------- */
/* emit_screen                                                                */
/* -------------------------------------------------------------------------- */

const SPEC = {
  spec: 'polymorph-screen/1',
  name: 'SaveBar',
  purpose: 'One action, bound to the container.',
  inputs: [{ name: 'onSave', type: '() => void' }],
  root: {
    component: 'Stack',
    props: { gap: 4 },
    children: [
      {
        component: 'Button',
        props: { variant: 'solid', tone: 'accent', label: 'Save', onClick: { $: 'onSave' } },
      },
    ],
  },
}

const spec = (change: Record<string, unknown> = {}) => JSON.stringify({ ...SPEC, ...change })

describe('emit_screen', () => {
  it('writes a lawful spec as a screen that passes every red rule', async () => {
    const context = project()
    const answer = await emitScreen(context, { spec: spec(), path: 'src/screens/SaveBar.tsx' })

    expect(answer).toMatchObject({
      ok: true,
      faults: [],
      path: 'src/screens/SaveBar.tsx',
      component: 'SaveBar',
      outcome: 'written',
    })
    expect(answer.next).toContain('onSave')
    // A bare project has installed nothing, and the file imports from the
    // package. The tool reports this now, instead of leaving it to the first build.
    expect(answer.notes?.join(' ')).toContain('@polymorph/react-ui is not a dependency')
    // The `install` tool does not supply the package either, because it vendors source.
    expect(answer.notes?.join(' ')).toContain('with your package manager')

    const code = read(context, 'src/screens/SaveBar.tsx')
    expect(code).toContain(EMITTED_MARKER)
    expect(code).toContain('export function SaveBar({ onSave }: SaveBarProps)')
    // The reason to emit instead of type: the written file is lawful by
    // construction, and the same lint an agent would have had to satisfy by
    // hand agrees.
    expect((await verify(code)).diagnostics).toEqual([])
  })

  it('writes nothing for an unlawful spec, and gives `validate`’s faults', async () => {
    const context = project()
    const unlawful = spec({
      root: { component: 'Button', props: { label: 'Save', className: 'wide' } },
    })
    const before = tree(context.project)

    const answer = await emitScreen(context, { spec: unlawful, path: 'src/SaveBar.tsx' })

    expect(answer.ok).toBe(false)
    expect(answer.faults.length).toBeGreaterThan(0)
    // Both tools use one check. An agent that validated first learns nothing new
    // here, and one that did not is told exactly what `validate` would have said.
    expect(answer.faults).toEqual((await validate(context, { spec: unlawful })).faults)
    expect(tree(context.project)).toEqual(before)
  })

  it('refuses a binding that is an expression, as `validate` does', async () => {
    const context = project()
    // A raw element, written in the one field the emitter prints as code. The
    // head is a declared input, but the rest is not a path.
    const smuggled = JSON.stringify({
      ...SPEC,
      inputs: [{ name: 'items', type: '{ go: () => void }[]' }],
      root: {
        component: 'Stack',
        props: { gap: 4 },
        children: [{ $: 'items.map((item) => <button onClick={item.go}>Go</button>)' }],
      },
    })

    const answer = await emitScreen(context, { spec: smuggled, path: 'src/SaveBar.tsx' })

    expect(answer.ok).toBe(false)
    expect(answer.faults).toEqual((await validate(context, { spec: smuggled })).faults)
    expect(answer.faults[0]?.message).toContain('is not a binding')
    expect(tree(context.project)).toEqual(['package.json'])
  })

  it('holds what it emitted to the red rules before it writes it', async () => {
    const context = project()
    // A spec can be lawful and still emit something a red rule refuses: the
    // rules read values, and the format only knows that a label is a string.
    // This one is a colour, which application code may not write down.
    const coloured = JSON.stringify({
      ...SPEC,
      root: {
        component: 'Button',
        props: { label: '#7c3aed', onClick: { $: 'onSave' } },
      },
    })
    expect((await validate(context, { spec: coloured })).ok).toBe(true)

    const answer = await emitScreen(context, { spec: coloured, path: 'src/SaveBar.tsx' })

    // Lawful as a document, unlawful as code. The check on the output decides,
    // and nothing is written.
    expect(answer.ok).toBe(false)
    expect(answer.violations?.map((violation) => violation.rule)).toEqual([
      'polymorph/no-raw-styles',
    ])
    expect(answer.fatal).toContain('was not written')
    expect(tree(context.project)).toEqual(['package.json'])
  })

  it('says a spec that is not JSON is not JSON', async () => {
    const context = project()
    const answer = await emitScreen(context, { spec: '{ name: SaveBar', path: 'src/SaveBar.tsx' })
    expect(answer.ok).toBe(false)
    expect(answer.fatal).toContain('not JSON')
    expect(existsSync(resolve(context.project, 'src'))).toBe(false)
  })

  it('regenerates its own output, and reports which of the three outcomes happened', async () => {
    const context = project()
    const path = 'src/SaveBar.tsx'

    expect((await emitScreen(context, { spec: spec(), path })).outcome).toBe('written')
    expect((await emitScreen(context, { spec: spec(), path })).outcome).toBe('unchanged')

    const revised = spec({ purpose: 'One action, and it is the only one.' })
    expect((await emitScreen(context, { spec: revised, path })).outcome).toBe('replaced')
    expect(read(context, path)).toContain('and it is the only one')
  })

  it('refuses to replace a file it did not emit', async () => {
    const context = project()
    const mine = 'export const answer = 42\n'
    writeFileSync(resolve(context.project, 'Container.tsx'), mine)

    await expect(emitScreen(context, { spec: spec(), path: 'Container.tsx' })).rejects.toThrow(
      RefusedWriteError,
    )
    // Somebody's hand-written source, on a path an agent got wrong.
    expect(read(context, 'Container.tsx')).toBe(mine)
  })

  it('stays inside the project, and writes React only to a .tsx', async () => {
    const context = project()
    for (const path of ['../SaveBar.tsx', '/tmp/SaveBar.tsx', '']) {
      await expect(emitScreen(context, { spec: spec(), path })).rejects.toThrow(EscapingDirError)
    }
    await expect(emitScreen(context, { spec: spec(), path: 'src/SaveBar.js' })).rejects.toThrow(
      '.tsx',
    )
    // A `.ts` module names Angular, so React at that path is refused.
    await expect(
      emitScreen(context, { spec: spec(), path: 'src/SaveBar.ts', framework: 'react' }),
    ).rejects.toThrow('.tsx')
    expect(tree(context.project)).toEqual(['package.json'])
  })

  it('does not follow a link inside the project to a path outside it', async () => {
    // A path that reads as inside and resolves elsewhere: a workspace's
    // `node_modules` is made of these.
    const context = project()
    const elsewhere = mkdtempSync(resolve(tmpdir(), 'polymorph-mcp-elsewhere-'))
    temporaries.push(elsewhere)
    symlinkSync(elsewhere, resolve(context.project, 'linked'))

    await expect(emitScreen(context, { spec: spec(), path: 'linked/SaveBar.tsx' })).rejects.toThrow(
      EscapingDirError,
    )
    const { system, palette } = proposal()
    expect(() => saveTheme(context, { system, palette, dir: 'linked' })).toThrow(EscapingDirError)
    expect(() => install(context, { items: ['button'], dir: 'linked/ui' })).toThrow(
      EscapingDirError,
    )
    expect(tree(elsewhere)).toEqual([])
  })

  it('reads the manifest of the package the file is written to, not the project’s', async () => {
    // A workspace: the root declares nothing, and the app the screen is written
    // to does.
    const context = project()
    const app = resolve(context.project, 'apps/web')
    mkdirSync(app, { recursive: true })
    writeFileSync(
      resolve(app, 'package.json'),
      JSON.stringify({ name: 'web', dependencies: { '@polymorph/react-ui': '^1.0.0' } }),
    )

    const inside = await emitScreen(context, { spec: spec(), path: 'apps/web/src/SaveBar.tsx' })
    expect(inside.notes).toEqual([])

    const outside = await emitScreen(context, { spec: spec(), path: 'src/SaveBar.tsx' })
    expect(outside.notes).toHaveLength(1)
  })

  it('formats with the project’s Prettier config, not this repository’s', async () => {
    const context = project()
    writeFileSync(resolve(context.project, '.prettierrc'), '{ "semi": true, "singleQuote": false }')

    await emitScreen(context, { spec: spec(), path: 'src/SaveBar.tsx' })

    // Emitted code that fails the local `prettier --check` cannot be committed,
    // so the file follows the style of the repository it is written to.
    expect(read(context, 'src/SaveBar.tsx')).toContain('from "@polymorph/react-ui";')
  })
})

/** A screen for iOS: a settings page whose one row toggles a preference. */
const IOS_SPEC = {
  spec: 'polymorph-screen/1',
  name: 'AlertsScreen',
  purpose: 'Whether the app may send alerts.',
  platform: 'ios',
  inputs: [
    { name: 'enabled', type: 'boolean', doc: 'The stored preference.' },
    { name: 'onEnabledChange', type: '(next: boolean) => void' },
  ],
  root: {
    component: 'SettingsPage',
    props: { title: 'Alerts' },
    children: [
      {
        component: 'SettingsRow',
        props: {
          label: 'Send alerts',
          control: {
            component: 'Switch',
            props: { checked: { $: 'enabled' }, onCheckedChange: { $: 'onEnabledChange' } },
          },
        },
      },
    ],
  },
}

describe('emit_screen, for iOS', () => {
  it('writes the SwiftUI view, its model and its actions, and says the language', async () => {
    const context = project()
    const answer = await emitScreen(context, {
      spec: JSON.stringify(IOS_SPEC),
      path: 'App/Alerts/AlertsView.swift',
    })
    expect(answer).toMatchObject({
      ok: true,
      outcome: 'written',
      language: 'swift',
      component: 'AlertsView',
      notes: [],
    })
    expect(answer.next).toContain('AlertsView(model:actions:)')
    expect(answer.next).toContain('AlertsActions.inert')
    const code = read(context, 'App/Alerts/AlertsView.swift')
    expect(code).toContain(EMITTED_MARKER)
    expect(code).toContain('struct AlertsModel {')
    expect(code).toContain('  let onEnabledChange: @MainActor (Bool) -> Void')
    expect(code).toContain('checked: model.enabled')

    const again = await emitScreen(context, {
      spec: JSON.stringify(IOS_SPEC),
      path: 'App/Alerts/AlertsView.swift',
    })
    expect(again.outcome).toBe('unchanged')
  })

  it('wants a .swift path for an iOS spec, and an iOS spec for a .swift path', async () => {
    const context = project()
    await expect(
      emitScreen(context, { spec: JSON.stringify(IOS_SPEC), path: 'src/Alerts.tsx' }),
    ).rejects.toThrow(/SwiftUI screen is a \.swift file, and "src\/Alerts\.tsx" is not one/)
    await expect(emitScreen(context, { spec: spec(), path: 'SaveBar.swift' })).rejects.toThrow(
      /React screen is a \.tsx file.*a \.swift file is emitted from a spec for `ios`/,
    )
    expect(tree(context.project)).toEqual(['package.json'])
  })

  it('checks the spec against the native screen contract, and writes nothing when it fails', async () => {
    const context = project()
    const loose = { ...IOS_SPEC, root: IOS_SPEC.root.children[0] }
    const answer = await emitScreen(context, {
      spec: JSON.stringify(loose),
      path: 'AlertsView.swift',
    })
    expect(answer.ok).toBe(false)
    expect(answer.faults.map((fault) => fault.path)).toEqual(['$.root'])
    expect(answer.faults[0]?.message).toContain('page archetype')
    expect(tree(context.project)).toEqual(['package.json'])
  })
})

/** A screen for Android: a settings page whose one switch toggles a preference. */
const ANDROID_SPEC = {
  ...IOS_SPEC,
  platform: 'android',
  root: {
    component: 'SettingsPage',
    props: { title: 'Alerts' },
    children: [
      {
        component: 'Switch',
        props: {
          label: 'Send alerts',
          checked: { $: 'enabled' },
          onCheckedChange: { $: 'onEnabledChange' },
        },
      },
    ],
  },
}

describe('emit_screen, for Android', () => {
  it('writes the Compose screen, its model and its actions, in the package its directory names', async () => {
    const context = project()
    const answer = await emitScreen(context, {
      spec: JSON.stringify(ANDROID_SPEC),
      path: 'app/src/main/kotlin/dev/acme/alerts/AlertsScreen.kt',
    })
    expect(answer).toMatchObject({
      ok: true,
      outcome: 'written',
      language: 'kotlin',
      component: 'AlertsScreen',
      notes: [],
    })
    expect(answer.next).toContain('AlertsScreen(model, actions)')
    expect(answer.next).toContain('`AlertsInert`')
    const code = read(context, 'app/src/main/kotlin/dev/acme/alerts/AlertsScreen.kt')
    expect(code).toContain(EMITTED_MARKER)
    expect(code).toContain('\npackage dev.acme.alerts\n')
    expect(code).toContain('data class AlertsModel(')
    expect(code).toContain('    fun onEnabledChange(next: Boolean)\n')
    expect(code).toContain('checked = model.enabled')

    const again = await emitScreen(context, {
      spec: JSON.stringify(ANDROID_SPEC),
      path: 'app/src/main/kotlin/dev/acme/alerts/AlertsScreen.kt',
    })
    expect(again.outcome).toBe('unchanged')
  })

  it('wants a .kt path for an Android spec, an Android spec for a .kt path, and no framework', async () => {
    const context = project()
    await expect(
      emitScreen(context, { spec: JSON.stringify(ANDROID_SPEC), path: 'AlertsScreen.swift' }),
    ).rejects.toThrow(/Jetpack Compose screen is a \.kt file, and "AlertsScreen\.swift" is not one/)
    await expect(emitScreen(context, { spec: spec(), path: 'SaveBar.kt' })).rejects.toThrow(
      /React screen is a \.tsx file.*a \.kt file is emitted from a spec for `android`/,
    )
    await expect(
      emitScreen(context, {
        spec: JSON.stringify(ANDROID_SPEC),
        path: 'AlertsScreen.kt',
        framework: 'vue',
      }),
    ).rejects.toThrow(/a screen for android is written in Jetpack Compose, and `framework` names/)
    expect(tree(context.project)).toEqual(['package.json'])
  })

  // Compose draws every member, so the tool has no member to refuse for a missing rendering.
  // `packages/spec/src/emit-kotlin.test.ts` holds that refusal against a package with a member
  // taken out.
  it('checks the spec against the native screen contract, and writes nothing when it fails', async () => {
    const context = project()
    const loose = { ...ANDROID_SPEC, root: ANDROID_SPEC.root.children[0] }
    const answer = await emitScreen(context, {
      spec: JSON.stringify(loose),
      path: 'AlertsScreen.kt',
    })
    expect(answer.ok).toBe(false)
    expect(answer.faults.map((fault) => fault.path)).toEqual(['$.root'])
    expect(answer.faults[0]?.message).toContain('page archetype')
    expect(tree(context.project)).toEqual(['package.json'])
  })
})

/* -------------------------------------------------------------------------- */
/* install                                                                    */
/* -------------------------------------------------------------------------- */

describe('install', () => {
  it('applies the plan `get_install_plan` returns', () => {
    const context = project()
    const plan = getInstallPlan(context, { items: ['button', 'bespoke'] })
    const answer = install(context, { items: ['button', 'bespoke'] })

    expect(answer.requested).toEqual(plan.requested)
    expect(answer.dir).toBe(plan.dir)
    expect(answer.packages).toEqual(plan.packages)
    // Every file the plan named is on disk, under the path the plan gave it.
    for (const file of plan.files) {
      expect(answer.written, file.to).toContain(file.to)
      expect(existsSync(resolve(context.project, file.to)), file.to).toBe(true)
    }

    // The second half of an install, which makes it more than a copy. The
    // manifest records what was written, and the rules are installed.
    expect(readManifest(context.project)?.components).toEqual([...plan.requested].sort())
    expect(answer.extended).toEqual(
      expect.arrayContaining(['package.json', 'eslint.config.js', 'stylelint.config.js']),
    )
    const manifest = JSON.parse(read(context, 'package.json')) as {
      dependencies: Record<string, string>
    }
    expect(manifest.dependencies).toMatchObject(plan.packages)
    expect(answer.next).toContain('package manager')
  })

  it('names the members pulled in, so the closure is never a surprise', () => {
    const context = project()
    const answer = install(context, { items: ['dialog'] })
    expect(answer.requested).toEqual(['Dialog'])
    expect(answer.cameAlong).toContain('Button')
    expect(answer.cameAlong).not.toContain('Dialog')
  })

  it('keeps a vendored file the project has edited', () => {
    const context = project()
    install(context, { items: ['button'] })

    const path = 'src/polymorph/controls/Button.tsx'
    const edited = `${read(context, path)}\n// ours now\n`
    writeFileSync(resolve(context.project, path), edited)

    const again = install(context, { items: ['button'] })

    // There is no `force` on this tool. Vendored source is the consumer's code,
    // and an agent must not discard their edit as a side effect.
    expect(again.kept).toEqual([path])
    expect(again.written).not.toContain(path)
    expect(read(context, path)).toBe(edited)
  })

  it('vendors nothing for a member that ships inside the React foundation, and says so', () => {
    const context = project()
    const answer = install(context, { items: ['icon'] })

    expect(answer.written).toEqual([])
    expect(answer.notes.join(' ')).toContain('@polymorph/react')
    expect(answer.next).toContain('Nothing was vendored')
    expect(existsSync(resolve(context.project, MANIFEST_FILE))).toBe(false)
  })

  it('passes a wrong name’s correction through, and writes nothing', () => {
    const context = project()
    expect(() => install(context, { items: ['button', 'pastel'] })).toThrow(UnknownItemError)
    expect(() => install(context, { items: ['button', 'pastel'] })).toThrow('"theme:pastel"')
    expect(() => install(context, { items: ['button'], dir: '../elsewhere' })).toThrow(
      EscapingDirError,
    )
    expect(tree(context.project)).toEqual(['package.json'])
  })

  it('keeps a file that was at an install path before the install', () => {
    // An agent picks the directory, and the natural choice is the one where the
    // project already keeps its components. The installer must not replace
    // their `Button.tsx`.
    const context = project()
    const theirs = 'export const Button = () => null\n'
    mkdirSync(resolve(context.project, 'src/components/controls'), { recursive: true })
    writeFileSync(resolve(context.project, 'src/components/controls/Button.tsx'), theirs)

    const answer = install(context, { items: ['button'], dir: 'src/components' })

    expect(answer.kept).toEqual(['src/components/controls/Button.tsx'])
    expect(read(context, 'src/components/controls/Button.tsx')).toBe(theirs)
  })

  it('reports what it wrote when it stops at a config it cannot edit, and finishes on a retry', () => {
    const context = project()
    // No `export default` to splice into, so the lint config cannot be linked.
    writeFileSync(resolve(context.project, 'eslint.config.js'), 'module.exports = []\n')

    let message = ''
    try {
      install(context, { items: ['button'] })
    } catch (error) {
      expect(error).toBeInstanceOf(UnfinishedInstallError)
      message = (error as Error).message
    }

    // The installer copies and records before it edits the project's config, so
    // this is not a refusal and must not read as one: the source is on disk.
    expect(message).toContain('cannot edit eslint.config.js automatically')
    expect(message).toContain('is on disk and recorded in polymorph.json')
    expect(message).toContain('call `install` again')
    expect(existsSync(resolve(context.project, 'src/polymorph/controls/Button.tsx'))).toBe(true)

    writeFileSync(resolve(context.project, 'eslint.config.js'), 'export default []\n')
    const finished = install(context, { items: ['button'] })
    expect(finished.extended).toContain('eslint.config.js')
    expect(read(context, 'eslint.config.js')).toContain('polymorph.eslint.js')
  })

  it('refuses to vendor the vocabulary into a checkout of itself', () => {
    // The checkout the server reads from (what `pnpm mcp` gives a server started
    // in this repository), and a package inside it. Nothing may be written, so
    // the test checks only the refusal.
    for (const inside of [ROOT, resolve(ROOT, 'apps/workbench')]) {
      expect(() =>
        install({ registry, root: ROOT, project: inside }, { items: ['button'] }),
      ).toThrow('a checkout of polymorph itself')
      expect(existsSync(resolve(inside, MANIFEST_FILE))).toBe(false)
    }

    // Another copy (a second clone, a worktree) is recognised by its contents:
    // the base layer, at the path the registry copies it from.
    const clone = project()
    mkdirSync(resolve(clone.project, registry.vendor.base, '..'), { recursive: true })
    writeFileSync(resolve(clone.project, registry.vendor.base), '')
    expect(() => install(clone, { items: ['button'] })).toThrow('a checkout of polymorph itself')
    expect(existsSync(resolve(clone.project, MANIFEST_FILE))).toBe(false)
  })

  it('refuses a directory inside another copy, as `polymorph init` does', () => {
    // `apps/workbench` in a second clone: the base layer is two levels up.
    const clone = project()
    mkdirSync(resolve(clone.project, registry.vendor.base, '..'), { recursive: true })
    writeFileSync(resolve(clone.project, registry.vendor.base), '')
    const nested = resolve(clone.project, 'apps/workbench')
    mkdirSync(nested, { recursive: true })
    writeFileSync(resolve(nested, 'package.json'), '{}\n')
    expect(() => install({ ...clone, project: nested }, { items: ['button'] })).toThrow(
      'a checkout of polymorph itself',
    )
    expect(tree(nested)).toEqual(['package.json'])
  })
})

/* -------------------------------------------------------------------------- */
/* save_theme                                                                 */
/* -------------------------------------------------------------------------- */

/** A proposal as `propose_theme` returns it: the documents an agent holds. */
function proposal() {
  const answer = proposeTheme(
    { registry },
    { intent: 'calmer, more editorial', basedOn: { system: 'pop', palette: 'orchid' } },
  )
  expect(answer.lawful).toBe(true)
  return answer as typeof answer & {
    system: { name: string; axes: Record<string, string> }
    palette: { name: string; accentHue: number }
  }
}

const shipped = (half: 'systems' | 'palettes', name: string): Record<string, unknown> =>
  JSON.parse(readFileSync(resolve(ROOT, `design/${half}/${name}.json`), 'utf8')) as Record<
    string,
    unknown
  >

describe('save_theme', () => {
  it('writes the pair `propose_theme` returned, as two documents the engine loads', () => {
    const context = project()
    const { system, palette } = proposal()

    const answer = saveTheme(context, { system, palette })

    const files = [`design/systems/${system.name}.json`, `design/palettes/${palette.name}.json`]
    expect(answer).toMatchObject({ saved: true, lawful: true, faults: [], written: files })
    // Read back through the parsers that load every shipped file, so what is on
    // disk is a real system and palette, not a JSON dump that resembles one.
    expect(parseSystem(JSON.parse(read(context, files[0] as string))).name).toBe(system.name)
    expect(parsePalette(JSON.parse(read(context, files[1] as string))).accentHue).toBe(
      palette.accentHue,
    )
    expect(read(context, files[0] as string).endsWith('}\n')).toBe(true)

    // What the documents alone do not say: the type to install, the laws that
    // did not run, and the line the build needs.
    expect(answer.fonts.map((font) => font.package).every((name) => name.startsWith('@font'))).toBe(
      true,
    )
    expect(answer.fonts.length).toBeGreaterThan(0)
    expect(answer.exemptions.length).toBeGreaterThan(0)
    expect(answer.next).toContain('polymorphTheme')
    expect(answer.notes).toEqual([])
  })

  it('checks the verdict again instead of trusting the proposal', () => {
    const context = project()
    const { system, palette } = proposal()
    // Edited after it was proposed, which is the case the second verdict is for.
    const edited = { ...system, axes: { ...system.axes, geometry: 'hexagonal' } }

    const answer = saveTheme(context, { system: edited, palette })

    expect(answer).toMatchObject({ saved: false, lawful: false, written: [] })
    expect(answer.faults.join(' ')).toContain('system.axes.geometry')
    expect(tree(context.project)).toEqual(['package.json'])
  })

  it('holds a member exception to the catalogue, as the studio’s save does', () => {
    const context = project()
    const { system, palette } = proposal()
    const exception = {
      family: 'radius',
      class: 'control',
      step: 'pill',
      because: 'the launch brand is capsule buttons.',
    }
    const withException = (component: string) => ({
      ...system,
      overrides: { exceptions: [{ component, ...exception }] },
    })

    // The schema can only judge an exception's shape. Whether the member it
    // names exists is the registry's part, and an exception that names no member
    // would emit CSS that changes nothing.
    const stray = saveTheme(context, { system: withException('button-ish'), palette })
    expect(stray.saved).toBe(false)
    expect(stray.faults.join(' ')).toContain("no member called 'button-ish'")
    expect(tree(context.project)).toEqual(['package.json'])

    expect(saveTheme(context, { system: withException('button'), palette }).saved).toBe(true)
  })

  it('names a file that is already there instead of replacing it', () => {
    const context = project()
    const { system, palette } = proposal()
    saveTheme(context, { system, palette })

    const again = saveTheme(context, { system, palette })
    expect(again).toMatchObject({ saved: true, written: [], existing: [] })
    expect(again.unchanged).toHaveLength(2)

    // The same name, a different decision. Both files are checked before either
    // is written, so the palette that did not change is not half of a save.
    const moved = { ...palette, accentHue: (palette.accentHue + 40) % 360 }
    const path = `design/palettes/${palette.name}.json`
    const before = read(context, path)

    const refused = saveTheme(context, { system, palette: moved })
    expect(refused).toMatchObject({ saved: false, lawful: true, written: [], existing: [path] })
    expect(read(context, path)).toBe(before)

    const replaced = saveTheme(context, { system, palette: moved, overwrite: true })
    expect(replaced).toMatchObject({ saved: true, written: [path] })
    expect(parsePalette(JSON.parse(read(context, path))).accentHue).toBe(moved.accentHue)
  })

  it('writes where it is told, and nowhere outside the project', () => {
    const context = project()
    const { system, palette } = proposal()

    expect(saveTheme(context, { system, palette, dir: 'src/theme' }).written).toEqual([
      `src/theme/systems/${system.name}.json`,
      `src/theme/palettes/${palette.name}.json`,
    ])
    expect(() => saveTheme(context, { system, palette, dir: '../theme' })).toThrow(EscapingDirError)
  })

  it('notes what `admitTheme` cannot check about where the pair is saved', () => {
    const context = project()

    // A guest with shipped names. Two stylesheets would match one attribute once
    // the catalogue's own pastel is installed beside it.
    const guest = saveTheme(context, {
      system: shipped('systems', 'pastel'),
      palette: shipped('palettes', 'amethyst'),
    })
    expect(guest.saved).toBe(true)
    expect(guest.notes.join(' ')).toContain('"pastel" is also a shipped system')
    expect(guest.notes.join(' ')).toContain('"amethyst" is also a shipped palette')

    // A system saved beside a palette it does not declare, with the declared
    // one nowhere in the directory.
    const other = project()
    const apart = saveTheme(other, {
      system: shipped('systems', 'pastel'),
      palette: shipped('palettes', 'orchid'),
    })
    expect(apart.saved).toBe(true)
    expect(apart.notes.join(' ')).toContain('declares the palette "amethyst"')
  })

  it('admits a palette with the more-contrast partner already saved beside it', () => {
    const context = project()
    const { system, palette } = proposal()
    const strong = { ...palette, name: `${palette.name}-strong` }
    const naming = { ...palette, moreContrast: strong.name }

    // The partner is not saved yet, so the pair is refused and nothing is written.
    const early = saveTheme(context, { system, palette: naming })
    expect(early).toMatchObject({ saved: false, lawful: false, written: [] })
    expect(early.faults.join(' ')).toContain(
      `moreContrast: "${palette.name}" names "${strong.name}" as its more-contrast palette`,
    )
    expect(early.next).toContain('Save the more-contrast palette first')
    expect(tree(context.project)).toEqual(['package.json'])

    expect(saveTheme(context, { system, palette: strong }).saved).toBe(true)
    const answer = saveTheme(context, { system, palette: naming })
    expect(answer).toMatchObject({ saved: true, lawful: true, faults: [] })
    expect(answer.written).toEqual([`design/palettes/${palette.name}.json`])
  })

  it('joins the catalogue when the project is the checkout the vocabulary lives in', () => {
    // A stand-in for this repository: one directory that is both roots. Saving
    // into its `design/` is the same as the studio's Save, and the next step is
    // the catalogue's own tooling, not a build to configure.
    const source = project()
    const context = { registry, root: source.project, project: source.project }
    const { system, palette } = proposal()

    const answer = saveTheme(context, { system, palette })

    expect(answer.saved).toBe(true)
    expect(answer.next).toContain('pnpm registry')
    expect(answer.next).not.toContain('polymorphTheme')
  })
})

/* -------------------------------------------------------------------------- */
/* fix_file                                                                   */
/* -------------------------------------------------------------------------- */

describe('fix_file', () => {
  const SCREEN =
    "import { Card } from '@polymorph/react-ui'\n" +
    "import { Trash2 } from 'lucide-react'\n\n" +
    'export const Row = ({ onDelete }) => (\n' +
    '  <Card className="p-4">\n' +
    "    <div style={{ display: 'flex' }}>\n" +
    '      <Trash2 />\n' +
    '      <button type="button" onClick={onDelete}>Delete</button>\n' +
    '    </div>\n' +
    '  </Card>\n' +
    ')\n'

  /** A project that installs the vocabulary's package, with one file in it. */
  function withFile(path: string, contents: string, dependencies: Record<string, string> = UI) {
    const context = project()
    writeFileSync(
      resolve(context.project, 'package.json'),
      JSON.stringify({ name: 'scratch', dependencies }),
    )
    mkdirSync(resolve(context.project, path, '..'), { recursive: true })
    writeFileSync(resolve(context.project, path), contents)
    return context
  }
  const UI = { '@polymorph/react-ui': '^1.0.0' }

  it('rewrites the file in place, with exactly what `fix` returns for its contents', async () => {
    const context = withFile('src/Row.tsx', SCREEN)

    const answer = await fixFile(context, { path: 'src/Row.tsx' })

    expect(answer).toMatchObject({ path: 'src/Row.tsx', changed: true, ok: false, fatal: null })
    expect(answer.fixed).toEqual({
      'polymorph/no-external-icons': 1,
      'polymorph/no-raw-interactive': 1,
      'polymorph/no-raw-styles': 1,
    })
    // One path, two tools: the file now holds what the read-only tool would have
    // returned, and the answer did not have to carry it.
    expect(read(context, 'src/Row.tsx')).toBe((await fix(context, { code: SCREEN })).code)
    expect(JSON.stringify(answer)).not.toContain('Icon name')
    // What is left is the decision, with its ladder rungs.
    expect(answer.violations.map((violation) => violation.rule)).toEqual([
      'polymorph/no-raw-styles',
    ])
    expect(answer.violations[0]?.climb.length).toBeGreaterThan(0)
  })

  it('has nothing to write the second time', async () => {
    const context = withFile('src/Row.tsx', SCREEN)
    await fixFile(context, { path: 'src/Row.tsx' })
    const fixed = read(context, 'src/Row.tsx')

    const again = await fixFile(context, { path: 'src/Row.tsx' })
    expect(again).toMatchObject({ changed: false, fixed: {} })
    expect(read(context, 'src/Row.tsx')).toBe(fixed)
  })

  it('changes only what a fix changes', async () => {
    // Somebody's formatting and somebody's comment. Neither is a violation, so
    // this tool must not change either.
    const theirs =
      "import {Stack} from '@polymorph/react-ui'\n\n\n" +
      '// keep this\n' +
      'export const A = ()=> <Stack   gap={4}  className="x"><p>hi</p></Stack>\n'
    const context = withFile('src/A.tsx', theirs)

    await fixFile(context, { path: 'src/A.tsx' })

    expect(read(context, 'src/A.tsx')).toBe(theirs.replace('  className="x"', ''))
  })

  it('asks the project which module `Button` comes from, instead of assuming', async () => {
    // A project that vendors its members imports them by path, so there is no
    // single module a rewritten `<button>` could name. The icon gateway ships in
    // `@polymorph/react` either way, so the icon is still fixed.
    const context = withFile('src/Row.tsx', SCREEN, { '@polymorph/react': '^1.0.0' })

    const answer = await fixFile(context, { path: 'src/Row.tsx' })

    const landed = read(context, 'src/Row.tsx')
    expect(landed).toContain('<button type="button" onClick={onDelete}>Delete</button>')
    expect(landed).toContain('<Icon name="delete" />')
    expect(answer.fixed['polymorph/no-raw-interactive']).toBeUndefined()
    expect(answer.notes).toEqual([
      '1 raw `<button>` could be rewritten as `Button` and was left reported: @polymorph/react-ui is ' +
        'not a dependency of the package this file is in, so there is no module known to import ' +
        '`Button` from',
    ])
  })

  it('says nothing about a missing module that made no difference', async () => {
    // This `<button>` could never have been rewritten: it has a class and its
    // content is not text. Blaming the project's dependencies would be false.
    const context = withFile(
      'src/A.tsx',
      'export const A = () => <button className="x" onClick={a}><b>Go</b></button>\n',
      { '@polymorph/react': '^1.0.0' },
    )
    const answer = await fixFile(context, { path: 'src/A.tsx' })
    expect(answer.violations.map((violation) => violation.rule)).toContain(
      'polymorph/no-raw-interactive',
    )
    expect(answer.notes).toEqual([])
  })

  it('does not guess when it cannot read the manifest of the package the file is in', async () => {
    const context = withFile('src/Row.tsx', SCREEN)
    writeFileSync(resolve(context.project, 'src/package.json'), '{ not json')

    const answer = await fixFile(context, { path: 'src/Row.tsx' })

    // An unknown answer is not a yes, so there is no import of a package it
    // could not confirm. The note says it could not tell, not that the answer
    // was no.
    expect(read(context, 'src/Row.tsx')).not.toContain('Button')
    expect(answer.notes.join(' ')).toContain('could not be read')
  })

  it('reports a stylesheet and leaves it byte for byte', async () => {
    // No CSS rule has a fix, so the file is not written, and its byte-order
    // mark, which a linter would drop, is preserved.
    const css = '\uFEFF.zone {\n  color: var(--pm-accent-fg);\n}\n'
    const context = withFile('src/zone.css', css)

    const answer = await fixFile(context, { path: 'src/zone.css' })

    expect(answer).toMatchObject({ ok: false, changed: false, fixed: {} })
    expect(answer.violations.map((violation) => violation.rule)).toEqual([
      'polymorph/no-ghost-tokens',
    ])
    expect(read(context, 'src/zone.css')).toBe(css)
  })

  it('reads a `.ts` file as TypeScript, not as TSX', async () => {
    // A generic arrow function is a syntax error in a `.tsx` file and ordinary
    // in a `.ts` one. Parsed by its own extension, it is simply lawful.
    for (const path of ['src/util.ts', 'src/util.mts']) {
      const context = withFile(path, 'export const id = <T>(x: T) => x\n')
      expect(await fixFile(context, { path }), path).toMatchObject({
        ok: true,
        changed: false,
        fatal: null,
      })
    }
  })

  it('does not touch a file it cannot parse', async () => {
    const broken = 'export const A = () => <button onClick={send}>Send</button'
    const context = withFile('src/A.tsx', broken)

    const answer = await fixFile(context, { path: 'src/A.tsx' })

    expect(answer.fatal).not.toBeNull()
    expect(answer.changed).toBe(false)
    expect(read(context, 'src/A.tsx')).toBe(broken)
  })

  it('refuses a file that is not there, not source, or not in the project', async () => {
    const context = withFile('src/Row.tsx', SCREEN)
    const before = tree(context.project)

    await expect(fixFile(context, { path: 'src/Missing.tsx' })).rejects.toThrow('does not exist')
    await expect(fixFile(context, { path: 'package.json' })).rejects.toThrow(RefusedWriteError)
    await expect(fixFile(context, { path: '../Row.tsx' })).rejects.toThrow(EscapingDirError)
    expect(tree(context.project)).toEqual(before)
    expect(read(context, 'src/Row.tsx')).toBe(SCREEN)
  })
})

/* -------------------------------------------------------------------------- */
/* Where a write may land                                                     */
/* -------------------------------------------------------------------------- */

describe('a write tool with nowhere to write', () => {
  const { system, palette } = proposeTheme({ registry }, { intent: 'calmer' })

  it('refuses when the server has no project', async () => {
    const context: ToolContext = { registry, root: ROOT }
    await expect(emitScreen(context, { spec: spec(), path: 'A.tsx' })).rejects.toThrow('read-only')
    expect(() => install(context, { items: ['button'] })).toThrow(RefusedWriteError)
    expect(() => saveTheme(context, { system, palette })).toThrow(RefusedWriteError)
    await expect(fixFile(context, { path: 'A.tsx' })).rejects.toThrow(RefusedWriteError)
  })

  it('refuses a directory that is not a repository', async () => {
    // A client does not always start a server where the work is. Vendored
    // source in a home directory is stray files, not an install.
    const path = mkdtempSync(resolve(tmpdir(), 'polymorph-mcp-bare-'))
    temporaries.push(path)
    const context: ToolContext = { registry, root: ROOT, project: path }

    await expect(emitScreen(context, { spec: spec(), path: 'A.tsx' })).rejects.toThrow(
      'no package.json',
    )
    expect(() => install(context, { items: ['button'] })).toThrow('--project')
    expect(() => saveTheme(context, { system, palette })).toThrow('no package.json')
    expect(tree(path)).toEqual([])
  })
})

/* -------------------------------------------------------------------------- */
/* The framework a file is read in                                            */
/* -------------------------------------------------------------------------- */

describe('the framework a file is read in', () => {
  it('is the registry’s answer, for the MCP tools and for `polymorph check` alike', async () => {
    // One project per vocabulary its package depends on, and one with none. `check` is given a
    // `verify` that records the framework it was asked to read each file in.
    const files = [
      'src/screen.tsx',
      'src/screen.component.ts',
      'src/types.d.ts',
      'src/view.vue',
      'src/view.svelte',
      'src/page.html',
    ]
    const answers: Record<string, Record<string, Framework | undefined>> = {}
    for (const vocabulary of [
      'none',
      '@polymorph/react-ui',
      '@polymorph/solid-ui',
      '@polymorph/angular-ui',
    ]) {
      const context = project()
      const dependencies = vocabulary === 'none' ? {} : { [vocabulary]: '^1.0.0' }
      writeFileSync(
        resolve(context.project, 'package.json'),
        JSON.stringify({ name: 'scratch', dependencies }),
      )
      mkdirSync(resolve(context.project, 'src'))
      for (const file of files) writeFileSync(resolve(context.project, file), '')

      const read: Record<string, Framework | undefined> = {}
      await check(context.project, registry, async (_source, options) => {
        read[options.filename as string] = options.framework
        return { fatal: null, diagnostics: [] }
      })
      const uses = (framework: Framework) => FRAMEWORK_VOCABULARY[framework] === vocabulary
      for (const [path, framework] of Object.entries(read)) {
        expect(framework, `${vocabulary}: ${path}`).toBe(codeFrameworkOf(undefined, path, uses))
        expect(codeFrameworkIn(context, undefined, path), `${vocabulary}: ${path}`).toBe(framework)
      }
      answers[vocabulary] = read
    }

    expect(answers['none']).toMatchObject({
      'src/screen.tsx': 'react',
      'src/screen.component.ts': 'react',
      'src/view.vue': 'vue',
      'src/view.svelte': 'svelte',
    })
    expect(answers['@polymorph/solid-ui']?.['src/screen.tsx']).toBe('solid')
    expect(answers['@polymorph/angular-ui']).toMatchObject({
      'src/screen.component.ts': 'angular',
      'src/types.d.ts': 'react',
      'src/page.html': 'angular',
    })
    // A `.html` file outside an Angular project is an entry document, which `check` does not read.
    expect(answers['none']?.['src/page.html']).toBeUndefined()
  })
})
