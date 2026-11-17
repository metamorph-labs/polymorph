import { spawnSync } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { stripVTControlCharacters } from 'node:util'

import { buildRegistry, type Registry } from '@polymorph/registry'
import ts from 'typescript'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { EMITTED_MARKER, emitScreen } from './emit'
import {
  ANGULAR_HOST_PARTS,
  ANGULAR_IMPORT_SOURCE,
  angularClassName,
  angularMemberSelector,
} from './emit-angular'
import { MissingRegistryError } from './emit-vue'
import { emitCheckedScreen, validateSpec } from './lawful'
import { SPEC_ID, type ScreenSpec } from './schema'

/**
 * The same spec, emitted for Angular.
 *
 * The framework is an option of the emitter and the validator, never a field
 * of the spec. These tests hold the Angular output to what the other outputs
 * are held to: it compiles (here, with Angular's own compiler, `ngc`, its
 * templates type-checked with `strictTemplates`, against the Angular
 * vocabulary's source), it passes every red rule as an Angular module, its
 * inline template included, it is formatted the way the repository formats
 * code, and it is the same bytes every time.
 */

const ROOT = resolve(import.meta.dirname, '../../..')
const registry: Registry = buildRegistry(ROOT)
const VOCABULARY = resolve(ROOT, 'packages/angular-ui')

const SCREENS = ['inbox', 'new-ticket', 'settings']

const screen = (name: string): ScreenSpec =>
  JSON.parse(readFileSync(resolve(ROOT, `design/screens/${name}.json`), 'utf8')) as ScreenSpec

/** Where an emitted Angular screen would live in this repository, for its Prettier config. */
const angularPath = (name: string) => resolve(ROOT, `apps/workbench/src/relay/${name}.view.ts`)

const emitAngular = (spec: ScreenSpec, name = 'probe', using: Registry = registry) =>
  emitScreen(spec, { framework: 'angular', registry: using, filepath: angularPath(name) })

const temporaries: string[] = []
afterAll(() => {
  for (const path of temporaries) rmSync(path, { recursive: true, force: true })
})

/**
 * Every error Angular's compiler reports in the emitted modules, by module.
 *
 * The modules are written to a temporary project beside a `tickets` module
 * that declares the Relay ticket, and `ngc` checks them with the options the
 * vocabulary is checked with (`strictTemplates`). `@polymorph/angular-ui`
 * resolves to the vocabulary's source and every other package to the
 * vocabulary's own install, which holds Angular and the TypeScript it needs.
 */
function angularErrors(files: Record<string, string>): Record<string, string[]> {
  const project = mkdtempSync(resolve(tmpdir(), 'polymorph-emit-angular-'))
  temporaries.push(project)
  writeFileSync(
    resolve(project, 'tickets.ts'),
    'export interface Ticket {\n  id: string\n  subject: string\n}\n',
  )
  for (const [name, code] of Object.entries(files)) {
    writeFileSync(resolve(project, `${name}.view.ts`), code)
  }
  writeFileSync(
    resolve(project, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        target: 'ES2022',
        lib: ['ES2023', 'DOM', 'DOM.Iterable'],
        module: 'ESNext',
        moduleResolution: 'bundler',
        strict: true,
        noEmit: true,
        skipLibCheck: true,
        isolatedModules: true,
        verbatimModuleSyntax: true,
        types: [],
        paths: {
          [ANGULAR_IMPORT_SOURCE]: [resolve(VOCABULARY, 'src/index.ts')],
          '*': [resolve(VOCABULARY, 'node_modules/*')],
        },
      },
      angularCompilerOptions: {
        strictTemplates: true,
        strictInjectionParameters: true,
        strictInputAccessModifiers: true,
      },
      files: [
        ...Object.keys(files).map((name) => `${name}.view.ts`),
        resolve(VOCABULARY, 'src/css-modules.d.ts'),
      ],
    }),
  )
  const result = spawnSync(
    resolve(VOCABULARY, 'node_modules/.bin/ngc'),
    ['-p', resolve(project, 'tsconfig.json')],
    { cwd: project, encoding: 'utf8' },
  )
  const errors: Record<string, string[]> = Object.fromEntries(
    Object.keys(files).map((name) => [name, []]),
  )
  // The compiler colours its report whether or not it writes to a terminal.
  const output = stripVTControlCharacters(`${result.stdout}${result.stderr}`)
  for (const match of output.matchAll(
    /^(?:.*[/\\])?([\w-]+)\.view\.ts:(\d+):\d+ - error ((?:TS|NG)-?\d+): (.*)$/gm,
  )) {
    const [, name = '', line, code, message] = match
    ;(errors[name] ??= []).push(`${line}: ${code} ${message}`)
  }
  // A failure the pattern did not read is still a failure.
  if (result.status !== 0 && Object.values(errors).every((list) => list.length === 0)) {
    throw new Error(`ngc failed without a diagnostic this test reads:\n${output}`)
  }
  return errors
}

/** The text a module's inline `template` holds, read as TypeScript reads the literal. */
function templateOf(code: string): string {
  const file = ts.createSourceFile('screen.ts', code, ts.ScriptTarget.Latest, true)
  let found: string | null = null
  const visit = (node: ts.Node): void => {
    if (
      ts.isPropertyAssignment(node) &&
      node.name.getText(file) === 'template' &&
      ts.isNoSubstitutionTemplateLiteral(node.initializer)
    ) {
      found = node.initializer.text
    }
    ts.forEachChild(node, visit)
  }
  visit(file)
  if (found === null) throw new Error('the module has no inline template')
  return found
}

describe('the Relay screens, emitted for Angular', () => {
  const emitted: Record<string, string> = {}
  let errors: Record<string, string[]> = {}
  beforeAll(async () => {
    for (const name of SCREENS) emitted[name] = await emitAngular(screen(name), name)
    errors = angularErrors(emitted)
  }, 120_000)

  for (const name of SCREENS) {
    it(`${name} compiles with Angular's compiler, its template type-checked`, () => {
      expect(errors[name]).toEqual([])
    })

    it(`${name} passes every red rule as an Angular module`, async () => {
      const result = await emitCheckedScreen(screen(name), {
        framework: 'angular',
        registry,
        filepath: angularPath(name),
      })
      expect(result.fatal, name).toBeNull()
      expect(result.violations, name).toEqual([])
    })

    it(`${name} is the same bytes as its snapshot`, async () => {
      await expect(emitted[name]).toMatchFileSnapshot(
        `./__snapshots__/${name}.view.angular.ts.snap`,
      )
    })
  }

  it('reports what the template type check refuses, so a pass is meaningful', () => {
    const broken = (emitted['settings'] ?? '').replace('title="Settings"', '[title]="4"')
    expect(angularErrors({ broken })['broken']?.join('\n')).toContain(
      "Type 'number' is not assignable to type 'string'",
    )
  }, 120_000)

  it('is formatted the way this repository formats code', async () => {
    const { format, resolveConfig } = await import('prettier')
    for (const name of SCREENS) {
      const local = await resolveConfig(angularPath(name))
      expect(
        await format(emitted[name] ?? '', { ...local, filepath: angularPath(name) }),
        name,
      ).toBe(emitted[name])
    }
  })

  it('carries the emitted marker and the spec name in its header', () => {
    const code = emitted['inbox'] ?? ''
    expect(code.startsWith('/**\n')).toBe(true)
    expect(code).toContain(`${EMITTED_MARKER} (\`${SPEC_ID}\`)`)
  })

  it('declares every input as a signal input, typed by the exported props interface', () => {
    const spec = screen('inbox')
    const code = emitted['inbox'] ?? ''
    expect(code).toContain('export interface InboxViewProps {')
    expect(code).toContain("import { Component, input } from '@angular/core'")
    expect(code).toContain("selector: 'app-inbox-view',")
    expect(code).toContain('export class InboxView {')
    for (const input of spec.inputs) {
      expect(code).toContain(
        `  readonly ${input.name} = input.required<InboxViewProps['${input.name}']>()`,
      )
    }
  })

  it('imports members and the vocabulary’s types from the Angular vocabulary, once', () => {
    const code = emitted['inbox'] ?? ''
    expect(code.match(new RegExp(`from '${ANGULAR_IMPORT_SOURCE}'`, 'g'))).toHaveLength(1)
    expect(code).toContain('type DataTableColumn')
    expect(code).not.toContain('@polymorph/react-ui')
    expect(code).toContain("import type { Ticket } from './tickets'")
    expect(code).toMatch(/imports: \[\s*Button,\s*Card,\s*DataTable,/)
  })

  it('reads inputs by calling them, and calls a callback from an output’s handler', () => {
    const inbox = templateOf(emitted['inbox'] ?? '')
    expect(inbox).toContain('[data]="tickets()"')
    expect(inbox).toContain('[label]="summary().open.label"')
    // A callback of no parameters is called with none; one that takes the payload gets it.
    expect(inbox).toContain('(click)="onNewTicket()()"')
    expect(inbox).toContain('(clear)="onClearFilters()()"')
    expect(inbox).toContain('(sortChange)="onSortChange()($event)"')
    expect(inbox).toContain('(rowClick)="onRowClick()($event)"')
    expect(inbox).toContain('(change)="onQueryChange()($event)"')
    // A boolean is bound, because a bare attribute sets an input to ''.
    expect(inbox).toContain('[stickyHeader]="true"')
    expect(inbox).toContain('[columns]="4"')
    expect(inbox).toContain('aria-label="Search tickets"')
  })

  it('projects node props into named slots and children into the content', () => {
    const inbox = templateOf(emitted['inbox'] ?? '')
    expect(inbox).toContain('<ng-container ngProjectAs="[slot=actions]">')
    expect(inbox).toContain('<ng-container ngProjectAs="[slot=search]">')
    const ticket = templateOf(emitted['new-ticket'] ?? '')
    expect(ticket).toContain('<ng-container ngProjectAs="[slot=trigger]">')
    expect(ticket).toContain('(submit)="onSubmit()()"')
    // A compound part is a component of its own.
    const settings = emitted['settings'] ?? ''
    expect(settings).toContain('<pm-settings-row-group title="Appearance">')
    expect(settings).toMatch(/imports: \[[^\]]*SettingsRowGroup/)
  })

  it('writes an element inside a value as a template declared at the top', () => {
    const inbox = templateOf(emitted['inbox'] ?? '')
    expect(inbox.trimStart().startsWith('<ng-template #secondaryActionTemplate>')).toBe(true)
    expect(inbox).toContain('secondaryAction: secondaryActionTemplate,')
    expect(inbox).toContain('(click)="onClearFilters()()"')
  })

  it('carries the declared reason into the template as a comment', () => {
    const inbox = templateOf(emitted['inbox'] ?? '')
    expect(inbox).toMatch(
      /<!-- Rung 2, declared: A queue is scanned rather than read[^\n]*-->\n\s*<pm-density-scope value="compact" as="section">/,
    )
  })
})

/**
 * A table drawn from its parts, which no Relay screen composes: a table's
 * sections, rows and cells are the elements the table needs, each with its
 * part's attribute (`<tr pmTableRow>`), never a custom element between the
 * `<table>` and its rows.
 */
const TABLE: ScreenSpec = {
  spec: SPEC_ID,
  name: 'QueueTable',
  purpose: 'A probe: a table drawn from its parts.',
  inputs: [
    { name: 'subject', type: 'string' },
    { name: 'onOpen', type: '() => void' },
  ],
  root: {
    component: 'Table',
    props: { label: 'Tickets' },
    children: [
      {
        component: 'Table.Head',
        children: [
          {
            component: 'Table.Row',
            children: [
              { component: 'Table.Header', children: ['Ticket'] },
              { component: 'Table.Header', props: { numeric: true }, children: ['Replies'] },
            ],
          },
        ],
      },
      {
        component: 'Table.Body',
        children: [
          {
            component: 'Table.Row',
            props: { interactive: true, onClick: { $: 'onOpen' } },
            children: [
              { component: 'Table.Cell', children: [{ $: 'subject' }] },
              { component: 'Table.Cell', props: { numeric: true }, children: ['4'] },
            ],
          },
        ],
      },
    ],
  },
}

describe('a table, emitted for Angular from its parts', () => {
  let code = ''
  beforeAll(async () => {
    code = await emitAngular(TABLE, 'queue-table')
  })

  it("compiles with Angular's compiler, its template type-checked", () => {
    expect(angularErrors({ 'queue-table': code })['queue-table']).toEqual([])
  }, 120_000)

  it('passes every red rule as an Angular module', async () => {
    const result = await emitCheckedScreen(TABLE, {
      framework: 'angular',
      registry,
      filepath: angularPath('queue-table'),
    })
    expect(result.fatal).toBeNull()
    expect(result.violations).toEqual([])
  })

  it('is the same bytes as its snapshot', async () => {
    await expect(code).toMatchFileSnapshot('./__snapshots__/queue-table.view.angular.ts.snap')
  })

  it('writes each section, row and cell as the element the table needs, with its part', () => {
    const template = templateOf(code)
    expect(template).toContain('<thead pmTableHead>')
    expect(template).toContain('<tbody pmTableBody>')
    expect(template).toMatch(/<tr pmTableRow \[interactive\]="true" \(click\)="onOpen\(\)\(\)">/)
    expect(template).toContain('<td pmTableCell>{{ subject() }}</td>')
    expect(template).toContain('<th pmTableHeader [numeric]="true">Replies</th>')
    expect(template).not.toMatch(/<pm-table-(head|body|row|header|cell)\b/)
    expect(code).toMatch(/imports: \[[^\]]*TableRow/)
  })
})

/**
 * A list drawn from its items. An item is its `<li>`, and a part whose element
 * is its host keeps every attribute but its selector, so a prop written as a
 * static attribute would also stay on the element: `title` would be the
 * `<li>`'s tooltip and a second description, and `href` an attribute an `<li>`
 * does not have.
 */
const PEOPLE: ScreenSpec = {
  spec: SPEC_ID,
  name: 'PeopleList',
  purpose: 'A probe: a list drawn from its items.',
  inputs: [],
  root: {
    component: 'List',
    props: { label: 'People' },
    children: [
      {
        component: 'List.Item',
        props: { title: 'Ada Okafor', description: 'Owner', meta: '2m', href: '/people/ada' },
      },
      { component: 'List.Item', props: { title: "Bao's team", current: true, href: '/teams/bao' } },
    ],
  },
}

describe('a list, emitted for Angular from its items', () => {
  let code = ''
  beforeAll(async () => {
    code = await emitAngular(PEOPLE, 'people-list')
  })

  it("compiles with Angular's compiler, its template type-checked", () => {
    expect(angularErrors({ 'people-list': code })['people-list']).toEqual([])
  }, 120_000)

  it('passes every red rule as an Angular module', async () => {
    // The second title has an apostrophe. The rules read the inline template
    // as the module's source spells it, so the literal must hold no `\\'`.
    const result = await emitCheckedScreen(PEOPLE, {
      framework: 'angular',
      registry,
      filepath: angularPath('people-list'),
    })
    expect(result.fatal).toBeNull()
    expect(result.violations).toEqual([])
  })

  it('binds every prop of an item, so none stays on the `<li>` as an attribute', () => {
    const template = templateOf(code)
    const items = [...template.matchAll(/<li\s+pmListItem[^>]*>/g)].map(([tag]) => tag)
    expect(items).toHaveLength(2)
    expect(items[0]).toContain(`[title]="'Ada Okafor'"`)
    expect(items[0]).toContain(`[href]="'/people/ada'"`)
    expect(items[0]).toContain(`[description]="'Owner'"`)
    expect(items[0]).toContain(`[meta]="'2m'"`)
    expect(items[1]).toContain('[current]="true"')
    expect(items[1]).toMatch(/\[title\]="'Bao\\+u0027s team'"/)
    // No attribute but the part's selector is written without a binding.
    for (const item of items) expect(item.replace(/<li\s+pmListItem/, '')).not.toMatch(/\s[a-z]+="/)
    // The list itself is a custom element, which removes its own attributes.
    expect(template).toContain('<pm-list label="People">')
  })
})

describe('a render prop given an element', () => {
  // No member of the vocabulary takes a render prop (`vueBinding` reads none as a scoped
  // slot), so a member is given one here, and the markup is checked without the compiler,
  // which reads the vocabulary's real inputs.
  const rendering: Registry = {
    ...registry,
    components: registry.components.map((component) =>
      component.name === 'Card'
        ? {
            ...component,
            props: [
              ...component.props,
              { name: 'renderBadge', type: '(count: number) => ReactNode', optional: true },
            ],
          }
        : component,
    ),
  }
  const spec: ScreenSpec = {
    spec: SPEC_ID,
    name: 'Probe',
    purpose: 'A probe.',
    inputs: [],
    root: {
      component: 'Card',
      props: { renderBadge: { component: 'Badge', children: ['New'] } },
      children: [{ component: 'Text', children: ['Body'] }],
    },
  }

  it('is a template declared at the top of the markup, bound by its name', async () => {
    const template = templateOf(await emitAngular(spec, 'probe', rendering))
    expect(template.trimStart().startsWith('<ng-template #renderBadgeTemplate>')).toBe(true)
    expect(template).toContain('<pm-badge>New</pm-badge>')
    expect(template).toContain('<pm-card [renderBadge]="renderBadgeTemplate">')
  })
})

describe('text, written so it reads back as typed', () => {
  const textSpec = (text: string, prop: string): ScreenSpec => ({
    spec: SPEC_ID,
    name: 'Probe',
    purpose: 'A probe.',
    inputs: [{ name: 'count', type: 'number' }],
    root: {
      component: 'Stack',
      props: { gap: 4 },
      children: [
        { component: 'Text', children: [text] },
        { component: 'Text', children: ['Total:', { $: 'count' }] },
        { component: 'Button', props: { label: prop } },
      ],
    },
  })

  it('writes plain words as text and a plain label as a static attribute', async () => {
    const template = templateOf(await emitAngular(textSpec('Plain words', 'Save')))
    expect(template).toContain('<pm-text>Plain words</pm-text>')
    expect(template).toContain('label="Save"')
    // Nothing between a text and the binding after it: Angular would keep a break as a space.
    expect(template).toContain('<pm-text>Total:{{ count() }}</pm-text>')
  })

  it('escapes what the template, an attribute or the template literal would read specially', async () => {
    const tricky = 'a "quote" & <b> {x} it\'s @home `tick` ${x} back\\slash'
    const code = await emitAngular(textSpec(tricky, tricky))
    const template = templateOf(code)

    // The interpolation and the bound attribute each hold a string literal
    // that evaluates to exactly what the spec says, and neither holds a
    // character the template would read specially.
    const text = /<pm-text>\{\{\s*(['"].+?['"])\s*\}\}<\/pm-text>/.exec(template)?.[1] ?? ''
    const attribute = /\[label\]="('[^']*(?:\\'[^']*)*')"/.exec(template)?.[1] ?? ''
    for (const literal of [text, attribute]) {
      expect(literal).not.toMatch(/[&<>{}@`$]/)
      expect(new Function(`return ${literal}`)()).toBe(tricky)
    }
    expect(angularErrors({ probe: code })['probe']).toEqual([])
  }, 120_000)

  it('cannot close the comment a declared reason is written into', async () => {
    const spec: ScreenSpec = {
      ...textSpec('x', 'y'),
      root: {
        component: 'DensityScope',
        props: { value: 'compact' },
        exception: { rung: 2, because: 'a reason that tries --> to end the comment early' },
        children: [{ component: 'Text', children: ['x'] }],
      },
    }
    const template = templateOf(await emitAngular(spec))
    expect(template).toContain('tries --\\> to end')
  })

  it('writes a string given to a node prop as the slot’s text', async () => {
    const spec: ScreenSpec = {
      ...textSpec('x', 'y'),
      inputs: [],
      root: {
        component: 'ListPage',
        props: { title: 'Probe', emptyState: { $object: { title: 'None' } }, actions: 'Later' },
      },
    }
    const code = await emitAngular(spec)
    expect(templateOf(code)).toContain(
      '<ng-container ngProjectAs="[slot=actions]">Later</ng-container>',
    )
    // No inputs: nothing to declare, and nothing imported to declare it with.
    expect(code).toContain("import { Component } from '@angular/core'")
    expect(code).toContain('export class Probe {}')
  })
})

describe('the vocabulary’s selectors', () => {
  /** Every class the Angular vocabulary's source declares, with its selector. */
  const selectors = new Map<string, string>()
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = resolve(dir, entry.name)
      if (entry.isDirectory()) walk(path)
      else if (/^[A-Z]\w*\.ts$/.test(entry.name)) {
        const text = readFileSync(path, 'utf8')
        const selector = /selector: '([^']+)'/.exec(text)?.[1]
        const name = /export class (\w+)/.exec(text)?.[1]
        if (selector !== undefined && name !== undefined) selectors.set(name, selector)
      }
    }
  }
  walk(resolve(VOCABULARY, 'src'))
  const exported = readFileSync(resolve(VOCABULARY, 'src/index.ts'), 'utf8')

  it('names every member and primitive the Angular vocabulary ships by its selector', () => {
    const natives = [...registry.components, ...registry.exceptions.primitives].filter(
      (member) => member.frameworks.angular.status === 'native' && member.name !== 'Icon',
    )
    expect(natives.length).toBeGreaterThan(60)
    for (const member of natives) {
      expect(selectors.get(member.name), member.name).toBe(angularMemberSelector(member.name))
    }
  })

  it('knows every exported part whose element is its host', () => {
    const hosted = [...selectors]
      .filter(([name, selector]) => selector.includes('[') && exported.includes(`{ ${name} }`))
      .map(([name, selector]) => [name, selector])
    expect(Object.fromEntries(hosted)).toEqual(
      Object.fromEntries(
        Object.entries(ANGULAR_HOST_PARTS).map(([part, tag]) => [
          angularClassName(part),
          `${tag}[pm${angularClassName(part)}]`,
        ]),
      ),
    )
  })
})

describe('the framework, checked before anything is emitted', () => {
  it('refuses a member the Angular map marks absent, with the map’s reason', () => {
    const missing: Registry = {
      ...registry,
      components: registry.components.map((component) =>
        component.name === 'Button'
          ? {
              ...component,
              frameworks: {
                ...component.frameworks,
                angular: { status: 'absent', reason: 'no Angular shell yet' },
              },
            }
          : component,
      ),
    }
    const { ok, faults } = validateSpec(missing, screen('new-ticket'), { framework: 'angular' })
    expect(ok).toBe(false)
    expect(faults).toContainEqual({
      path: '$.root.props.actions[1]',
      message: '`Button` is absent in angular — no Angular shell yet',
    })
    expect(validateSpec(missing, screen('new-ticket')).ok).toBe(true)
  })

  it('refuses ImageEditor, which the Angular vocabulary does not ship', () => {
    const spec: ScreenSpec = {
      spec: SPEC_ID,
      name: 'Probe',
      purpose: 'A probe.',
      inputs: [],
      root: { component: 'ImageEditor', props: { src: 'a.png', alt: 'A' } },
    }
    const { ok, faults } = validateSpec(registry, spec, { framework: 'angular' })
    expect(ok).toBe(false)
    expect(faults.map((fault) => fault.message).join('\n')).toContain(
      '`ImageEditor` is absent in angular',
    )
  })

  it('refuses a screen named as a class the Angular module already imports', () => {
    // An Angular screen imports `Component` and `input` from Angular and each
    // member and part by its class. A screen of the same name is a duplicate
    // identifier, and the module does not compile; the other emitters import
    // the part's owner, and accept the name.
    const named = (name: string, component: string): ScreenSpec => ({
      spec: SPEC_ID,
      name,
      purpose: 'A probe.',
      inputs: [],
      root: { component, props: { title: 'Appearance' }, children: [] },
    })
    const part = named('SettingsRowGroup', 'SettingsRow.Group')
    expect(validateSpec(registry, part).faults).toEqual([])
    expect(validateSpec(registry, part, { framework: 'angular' }).faults).toEqual([
      {
        path: '$.name',
        message:
          'the emitted file would both declare `SettingsRowGroup` and import it as a member or ' +
          'part this screen composes — the declaration shadows the import, so name the screen ' +
          'something the file does not already hold',
      },
    ])
    const core: ScreenSpec = { ...part, name: 'Component', root: { component: 'Stack' } }
    expect(validateSpec(registry, core).faults).toEqual([])
    expect(validateSpec(registry, core, { framework: 'angular' }).faults[0]?.message).toContain(
      'declare `Component` and import it as a name from `@angular/core`',
    )
  })

  it('refuses an Angular screen for a phone platform', () => {
    const spec = { ...screen('settings'), platform: 'ios' } as ScreenSpec
    const { faults } = validateSpec(registry, spec, { framework: 'angular' })
    expect(faults[0]).toEqual({
      path: '$.platform',
      message:
        'an angular screen runs on the web, and this one names ios — remove `platform`, or validate it without a framework',
    })
  })

  it('needs the registry to emit for Angular, and says so as a refusal', async () => {
    await expect(emitScreen(screen('settings'), { framework: 'angular' })).rejects.toThrow(
      MissingRegistryError,
    )
    const result = await emitCheckedScreen(screen('settings'), { framework: 'angular' })
    expect(result).toMatchObject({ code: '', violations: [] })
    expect(result.fatal).toContain('pass `registry` with `framework: "angular"`')
  })
})

describe('pnpm emit, for Angular', () => {
  const scratch = mkdtempSync(resolve(tmpdir(), 'polymorph-emit-angular-bin-'))
  temporaries.push(scratch)

  const BIN = resolve(ROOT, 'packages/spec/bin/emit.js')
  const run = (args: string[]) =>
    spawnSync(process.execPath, [BIN, ...args], { cwd: ROOT, encoding: 'utf8' })

  it('emits for Angular when the output is a .ts module', () => {
    const input = resolve(scratch, 'settings.json')
    writeFileSync(input, JSON.stringify(screen('settings')))
    const output = resolve(scratch, 'settings.view.ts')
    const result = run([input, output])
    expect(result.status, result.stderr).toBe(0)
    const code = readFileSync(output, 'utf8')
    expect(code).toMatch(new RegExp(`from ['"]${ANGULAR_IMPORT_SOURCE}['"]`))
    expect(code).toContain('export class SettingsView {')
    // Each run builds the registry, which takes seconds under the suite's load.
  }, 120_000)

  it('refuses a --framework the output’s extension contradicts, and writes nothing', () => {
    const input = resolve(scratch, 'inbox.json')
    writeFileSync(input, JSON.stringify(screen('inbox')))
    for (const [output, framework] of [
      ['Inbox.tsx', 'angular'],
      ['Inbox.ts', 'react'],
      ['Inbox.ts', 'solid'],
    ] as const) {
      const result = run([input, resolve(scratch, output), '--framework', framework])
      expect(result.status, output).toBe(1)
      expect(result.stderr).toContain(`--framework ${framework} writes a`)
      expect(result.stderr).toContain('usage: pnpm emit')
      expect(() => readFileSync(resolve(scratch, output))).toThrow()
    }
    // Each run loads the emitter's modules, which takes seconds under the suite's load.
  }, 120_000)
})
