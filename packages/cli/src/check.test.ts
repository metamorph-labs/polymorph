import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'

import { buildRegistry, type Registry } from '@polymorph/registry'
import { RULE_CLIMB } from '@polymorph/rules/ladder'
import { verify } from '@polymorph/rules/verify'
import { afterAll, describe, expect, it } from 'vitest'

import { check, CheckError, checkLines, type CheckReport } from './check'
import { main, run } from './cli'
import { EscapingDirError } from './plan'
import { UnknownFrameworkError } from './vue'

/**
 * `polymorph check`: the red rules over a consumer's directory, with no
 * config. Each app here is written to a temporary directory and checked
 * through the real `verify`, so a report is what `validate` would return.
 */

const ROOT = resolve(import.meta.dirname, '../../..')
const registry: Registry = buildRegistry(ROOT)

const temporaries: string[] = []
afterAll(() => {
  for (const path of temporaries) rmSync(path, { recursive: true, force: true })
})

/** A consumer repository holding `files`, each path relative to its root. */
function app(files: Record<string, string>): string {
  const root = mkdtempSync(resolve(tmpdir(), 'polymorph-check-'))
  temporaries.push(root)
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(resolve(root, path)), { recursive: true })
    writeFileSync(resolve(root, path), text)
  }
  return root
}

const REACT = JSON.stringify({ name: 'shop', dependencies: { '@polymorph/react-ui': '1.0.5' } })

/** The register stylesheet the review found: it re-makes four of the theme's decisions. */
const REGISTER =
  ':root {\n  font-size: 81.25%;\n}\n' +
  "[data-palette='petrol'][data-mode='dark'] {\n  --pm-accent-bg: #0b7a75;\n}\n" +
  "[data-member='button'][data-variant='ghost']:hover {\n  background: none;\n}\n"

const LAWFUL_SCREEN =
  "import { Stack, Text } from '@polymorph/react-ui'\n\n" +
  'export const Home = () => (\n  <Stack gap={4}>\n    <Text>Welcome</Text>\n  </Stack>\n)\n'

/** A row with its destructive Button first, which a usage rule reports as a warning. */
const DANGER_FIRST =
  "import { Button, Inline } from '@polymorph/react-ui'\n\n" +
  'export const Row = () => (\n  <Inline>\n    <Button tone="danger" label="Delete" />\n' +
  '    <Button variant="outline" tone="neutral" label="Keep" />\n  </Inline>\n)\n'

const rulesIn = (report: CheckReport, path: string): string[] => [
  ...new Set(report.files.find((file) => file.path === path)?.violations.map((v) => v.rule)),
]

describe('what check reads', () => {
  it('reports application CSS that re-makes the theme’s decisions, with each rule’s rungs', async () => {
    const root = app({ 'package.json': REACT, 'src/register.css': REGISTER })
    const report = await check(root, registry, verify)

    expect(report.ok).toBe(false)
    expect(report.checked).toBe(1)
    expect(rulesIn(report, 'src/register.css').sort()).toEqual([
      'polymorph/no-app-member-selectors',
      'polymorph/no-app-theme-selectors',
      'polymorph/no-root-font-size',
      'polymorph/no-token-declarations',
    ])
    for (const violation of report.files[0]?.violations ?? []) {
      expect(violation.rungs, violation.rule).toEqual(RULE_CLIMB[violation.rule])
      expect(violation.rungs.length, violation.rule).toBeGreaterThan(0)
    }
  })

  it('reads TSX, TypeScript, Vue and Svelte as application code, and passes a lawful screen', async () => {
    const root = app({
      'package.json': REACT,
      'src/Home.tsx': LAWFUL_SCREEN,
      'src/Row.tsx': 'export const Row = () => <div style={{ padding: 12 }} />\n',
      'src/brand.ts': "export const brand = '#4087de'\n",
      'src/Card.vue': '<template>\n  <div class="card" style="padding: 12px" />\n</template>\n',
      'src/Badge.svelte': '<div style="padding: 12px"></div>\n',
    })
    const report = await check(root, registry, verify)

    expect(report.checked).toBe(5)
    expect(report.files.map((file) => [file.path, file.framework])).toEqual([
      ['src/Badge.svelte', 'svelte'],
      ['src/Card.vue', 'vue'],
      ['src/Row.tsx', 'react'],
      ['src/brand.ts', 'react'],
    ])
    for (const file of report.files) {
      expect(file.fatal, file.path).toBeNull()
      expect(rulesIn(report, file.path), file.path).toEqual(['polymorph/no-raw-styles'])
    }
  })

  it('leaves out the vendored directory, dot-directories and build output', async () => {
    const root = app({
      'package.json': REACT,
      'polymorph.json': JSON.stringify({ version: '1.0.5', dir: 'src/polymorph', files: {} }),
      // The compiled theme declares every token under pairing selectors.
      'src/polymorph/themes/theme.css': "[data-system='plain'] {\n  --pm-accent-bg: #0b7a75;\n}\n",
      'node_modules/x/index.css': REGISTER,
      'dist/app.css': REGISTER,
      '.cache/app.css': REGISTER,
      'src/Home.tsx': LAWFUL_SCREEN,
    })
    const report = await check(root, registry, verify)

    expect(report).toEqual({
      ok: true,
      dir: '.',
      checked: 1,
      files: [],
      notes: ['src/polymorph is the vendored vocabulary and is not read as application code'],
    })
  })

  it('reads nothing inside the vendored directory, and says why', async () => {
    const root = app({
      'polymorph.json': JSON.stringify({ version: '1.0.5', dir: 'src/polymorph', files: {} }),
      'src/polymorph/themes/theme.css': "[data-system='plain'] {\n  --pm-accent-bg: red;\n}\n",
    })
    const report = await check(root, registry, verify, { dir: 'src/polymorph/themes' })
    expect(report.ok).toBe(true)
    expect(report.checked).toBe(0)
    expect(report.notes[0]).toContain('the vendored vocabulary')
  })

  it('checks one file when the argument names one', async () => {
    const root = app({ 'src/register.css': REGISTER, 'src/other.css': REGISTER })
    const report = await check(root, registry, verify, { dir: 'src/register.css' })
    expect(report.checked).toBe(1)
    expect(report.files.map((file) => file.path)).toEqual(['src/register.css'])
  })

  it('lists a file it cannot parse, which fails the check', async () => {
    const root = app({ 'src/Broken.tsx': 'export const A = () => <div>\n' })
    const report = await check(root, registry, verify)
    expect(report.ok).toBe(false)
    expect(report.files[0]?.fatal).toMatch(/line \d/)
    expect(checkLines(registry, report).join('\n')).toContain('1 file not read.')
  })
})

describe('which framework a file is read in', () => {
  it('reads TSX as Solid in a package that uses the Solid vocabulary and not React’s', async () => {
    const root = app({
      'package.json': JSON.stringify({ dependencies: { '@polymorph/solid-ui': '1.0.5' } }),
      'src/Row.tsx': 'export const Row = () => <div class="flex gap-2" />\n',
    })
    const report = await check(root, registry, verify)
    expect(report.files[0]?.framework).toBe('solid')
    // `class` is a style only in Solid; React would read it as an unknown prop.
    expect(rulesIn(report, 'src/Row.tsx')).toEqual(['polymorph/no-raw-styles'])
  })

  it('reads a module as an Angular component, and its templates, where the package uses Angular', async () => {
    const component =
      "import { Component } from '@angular/core'\n\n" +
      '@Component({\n  selector: \'app-row\',\n  template: `<div style="padding: 12px"></div>`,\n})\n' +
      'export class Row {}\n'
    const root = app({
      'package.json': JSON.stringify({ dependencies: { '@polymorph/angular-ui': '1.0.5' } }),
      'src/row.component.ts': component,
      'src/inbox.component.html': '<button (click)="open()">Open</button>\n',
    })
    const report = await check(root, registry, verify)
    expect(report.checked).toBe(2)
    expect(report.files.map((file) => [file.path, file.framework])).toEqual([
      ['src/inbox.component.html', 'angular'],
      ['src/row.component.ts', 'angular'],
    ])
    expect(rulesIn(report, 'src/row.component.ts')).toEqual(['polymorph/no-raw-styles'])
    expect(rulesIn(report, 'src/inbox.component.html')).toEqual(['polymorph/no-raw-interactive'])
  })

  it('leaves an entry document unread outside Angular, and reads it when asked', async () => {
    const root = app({
      'package.json': REACT,
      'index.html':
        '<!doctype html>\n<html>\n  <body>\n    <button>Go</button>\n  </body>\n</html>\n',
    })
    const inferred = await check(root, registry, verify)
    expect(inferred.checked).toBe(0)
    expect(inferred.notes).toEqual([
      '1 .html file was not read: the rules read .html as an Angular template, and this ' +
        'project does not use the Angular vocabulary (--framework angular reads them)',
    ])

    const forced = await check(root, registry, verify, { framework: 'angular' })
    expect(forced.checked).toBe(1)
    expect(rulesIn(forced, 'index.html')).toEqual(['polymorph/no-raw-interactive'])
  })

  it('leaves an elements page unread, from the manifest of a page with no package.json', async () => {
    // A page with no build has no `package.json`; its manifest says it uses the elements. Its
    // pages are HTML, which no red rule reads, and its `.css` is application CSS as anywhere.
    const page = '<!doctype html>\n<html>\n  <body>\n    <button>Go</button>\n  </body>\n</html>\n'
    const root = app({
      'polymorph.json': JSON.stringify({
        version: '1.0.12',
        dir: 'public/polymorph',
        framework: 'elements',
        files: {},
      }),
      'public/index.html': page,
      'public/about.html': page,
      'public/polymorph/polymorph.css': '.x {\n  color: red;\n}\n',
      'public/site.css': REGISTER,
    })
    const report = await check(root, registry, verify)
    expect(report.checked).toBe(1)
    expect(report.files.map((file) => file.path)).toEqual(['public/site.css'])
    expect(report.notes).toContain(
      '2 .html files were not read: they are elements pages, and the red rules do not read HTML',
    )
    // The framework a caller names still wins: asked for Angular, the page is a template.
    const forced = await check(root, registry, verify, { framework: 'angular', dir: 'public' })
    expect(rulesIn(forced, 'public/index.html')).toEqual(['polymorph/no-raw-interactive'])
  })

  it('takes the framework the manifest records, and imports `Button` only from a dependency', async () => {
    const button = 'export const Row = () => <button type="button" onClick={go}>Go</button>\n'
    const vendoring = app({
      'package.json': JSON.stringify({ name: 'vendors' }),
      'polymorph.json': JSON.stringify({
        version: '1.0.5',
        dir: 'src/ui',
        framework: 'solid',
        files: {},
      }),
      'src/Row.tsx': button,
    })
    const vendored = await check(vendoring, registry, verify)
    expect(vendored.files[0]?.framework).toBe('solid')
    // A vendoring project has no package to import `Button` from, so the
    // report carries no rewrite.
    expect(vendored.files[0]?.violations[0]?.fix).toBeNull()

    const installing = app({
      'package.json': JSON.stringify({ dependencies: { '@polymorph/solid-ui': '1.0.5' } }),
      'src/Row.tsx': button,
    })
    const installed = await check(installing, registry, verify)
    expect(installed.files[0]?.violations[0]?.fix?.text).toContain('@polymorph/solid-ui')
  })
})

describe('what check refuses', () => {
  const root = app({ 'src/a.css': '.a {\n  color: var(--pm-text-primary);\n}\n', 'README.md': '' })

  it('refuses a directory outside the repository', async () => {
    await expect(check(root, registry, verify, { dir: '../elsewhere' })).rejects.toThrow(
      EscapingDirError,
    )
  })

  it('refuses a directory that does not exist, and a file the rules do not read', async () => {
    await expect(check(root, registry, verify, { dir: 'lib' })).rejects.toThrow(CheckError)
    await expect(check(root, registry, verify, { dir: 'README.md' })).rejects.toThrow(
      'they read .ts, .tsx, .vue, .svelte, .html and .css files',
    )
  })

  it('refuses a framework it does not know', async () => {
    await expect(check(root, registry, verify, { framework: 'ember' })).rejects.toThrow(
      UnknownFrameworkError,
    )
  })

  it('reads an absolute path inside the repository as the relative one', async () => {
    const report = await check(root, registry, verify, { dir: resolve(root, 'src') })
    expect(report).toMatchObject({ ok: true, dir: 'src', checked: 1 })
  })

  it('refuses a manifest it cannot read, because the vendored directory is then unknown', async () => {
    const broken = app({ 'polymorph.json': '{ "dir": 3 }', 'src/a.css': '' })
    await expect(check(broken, registry, verify)).rejects.toThrow(
      'polymorph.json cannot be read, so the vendored directory is unknown',
    )
  })
})

describe('the command', () => {
  const polymorph = async (root: string, argv: string[]) => {
    const lines: string[] = []
    const { code } = await main({ root, source: ROOT, registry, out: (line) => lines.push(line) }, [
      'check',
      ...argv,
    ])
    return { code, text: lines.join('\n') }
  }

  it('prints each file, each rule with the rungs that answer it, and each report; exits 1', async () => {
    const root = app({ 'package.json': REACT, 'src/register.css': REGISTER })
    const { code, text } = await polymorph(root, ['src'])

    expect(code).toBe(1)
    expect(text).toContain('polymorph check src — 1 file read')
    expect(text).toContain(
      '\nsrc/register.css\n  polymorph/no-root-font-size — rung 2 contextual re-assignment\n    2:3     ',
    )
    expect(text).toContain(
      'polymorph/no-token-declarations — rung 1 variant selection · rung 2 contextual ' +
        're-assignment · rung 3 instance patch',
    )
    expect(text.endsWith('4 violations in 1 file.')).toBe(true)
  })

  it('exits 0 on a lawful app', async () => {
    const root = app({ 'package.json': REACT, 'src/Home.tsx': LAWFUL_SCREEN })
    const { code, text } = await polymorph(root, [])
    expect(code).toBe(0)
    expect(text.endsWith('No violations.')).toBe(true)
  })

  it('prints a warning marked as one, and exits 0 when the reports are warnings alone', async () => {
    const root = app({ 'package.json': REACT, 'src/Row.tsx': DANGER_FIRST })
    const { code, text } = await polymorph(root, [])
    expect(code).toBe(0)
    expect(text).toContain(
      '\nsrc/Row.tsx\n  polymorph/danger-last (warning) — rung 1 variant selection',
    )
    expect(text.endsWith('No violations. 1 warning in 1 file.')).toBe(true)
    const report = await check(root, registry, verify)
    expect(report.ok).toBe(true)
    expect(report.files[0]?.violations).toEqual([])
    expect(report.files[0]?.warnings.map((warning) => warning.rule)).toEqual([
      'polymorph/danger-last',
    ])
  })

  it('counts errors and warnings apart, and exits 1 on the errors', async () => {
    const root = app({
      'package.json': REACT,
      'src/register.css': REGISTER,
      'src/Row.tsx': DANGER_FIRST,
    })
    const { code, text } = await polymorph(root, [])
    expect(code).toBe(1)
    expect(text.endsWith('4 violations in 1 file. 1 warning in 1 file.')).toBe(true)
  })

  it('prints the report as JSON with --json', async () => {
    const root = app({ 'package.json': REACT, 'src/register.css': REGISTER })
    const { code, text } = await polymorph(root, ['--json'])
    expect(code).toBe(1)
    const report = JSON.parse(text) as CheckReport
    expect(report).toEqual(await check(root, registry, verify))
    expect(report.files[0]?.violations[0]).toMatchObject({
      rule: 'polymorph/no-root-font-size',
      line: 2,
      column: 3,
      rungs: [2],
      alternatives: [{ member: 'DensityScope', prop: 'value', rung: 2 }],
    })
  })

  it('names a usage error and exits 1', async () => {
    const root = app({ 'src/a.css': '' })
    expect(await polymorph(root, ['../up'])).toMatchObject({ code: 1 })
    expect((await polymorph(root, ['nowhere'])).text).toBe(
      `polymorph check: there is no "nowhere" in ${root}`,
    )
    expect((await polymorph(root, ['--framework', 'ember'])).text).toContain(
      'there is no framework called "ember"',
    )
    expect((await polymorph(root, ['a', 'b'])).text).toContain('name one directory or file')
  })

  it('answers every other command through `run`, which says check needs `main`', async () => {
    const root = app({})
    const lines: string[] = []
    const cli = { root, source: ROOT, registry, out: (line: string) => lines.push(line) }
    expect((await main(cli, ['help'])).code).toBe(0)
    expect(lines.join('\n')).toContain('polymorph check [dir]')
    expect(run(cli, ['check']).code).toBe(1)
  })
})
