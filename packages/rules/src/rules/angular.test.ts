import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

import templateParser from '@angular-eslint/template-parser'
import { RuleTester, type Linter } from 'eslint'
import { describe, expect, it } from 'vitest'

import { allRules } from '../index'
import { fixCode, verifyCode } from '../verify'
import { angularSelector, angularSyntax } from './angular'
import { noAppCss } from './no-app-css'
import { noExternalIcons } from './no-external-icons'
import { noExternalMotion } from './no-external-motion'
import { noRawInteractive } from './no-raw-interactive'
import { noRawStyles } from './no-raw-styles'
import { oneOpener } from './one-opener'
import { TEST_VALUES } from './rule-tester'
import { scopedTokenOwners } from './scoped-token-owners'

/**
 * The red rules, reading an Angular component.
 *
 * An Angular component is the same application code as a `.tsx` screen, so
 * the rules say the same things about it: `class` and `style` on a member are
 * removed or reported, a raw control or a clickable `<div>` names its member,
 * a component's `styles` are a stylesheet, a trigger or an enter animation
 * names the member that animates it, a glyph or chart import names its role or
 * member, and two openers are one too many. The answers are written in
 * template syntax (`<pm-inline [gap]="4">`). The fixtures in
 * `fixtures/angular/` are linted through `verify`, the path the MCP server and
 * the screen emitter take, which extracts each inline template as an Angular
 * app's config does; the cases below run each rule alone over a template.
 */

const FIXTURES = resolve(process.cwd(), 'packages/rules/fixtures/angular')
const read = (name: string) => readFileSync(join(FIXTURES, name), 'utf8')

const OWNERS = { '--pm-shell-': ['packages/recipes/src/archetypes/app-shell.module.css'] }

function lintApp(fixture: string, rules: Linter.RulesRecord): string[] {
  const result = verifyCode(read(fixture), {
    filename: `apps/relay/src/${fixture}`,
    framework: 'angular',
    rules,
  })
  expect(result.fatal, `${fixture}: ${result.fatal}`).toBeNull()
  return [...new Set(result.diagnostics.map((diagnostic) => diagnostic.rule))].sort()
}

describe('the Angular fixtures', () => {
  const withOwners: Linter.RulesRecord = {
    ...allRules,
    'polymorph/scoped-token-owners': ['error', { owners: OWNERS }],
  }

  it('fire every application rule', () => {
    expect(lintApp('app-violations.component.ts', withOwners)).toEqual(Object.keys(allRules).sort())
  })

  it('pass the lawful screen', () => {
    expect(lintApp('app-clean.component.ts', allRules)).toEqual([])
  })

  it('pass a declared <pm-bespoke> zone, because rung 4 is lawful', () => {
    expect(lintApp('app-bespoke.component.ts', allRules)).toEqual([])
  })

  it('pass a declared <pm-third-party> boundary around another library’s component', () => {
    expect(lintApp('app-third-party.component.ts', allRules)).toEqual([])
  })
})

RuleTester.describe = describe as unknown as typeof RuleTester.describe
RuleTester.it = it as unknown as typeof RuleTester.it

const tester = new RuleTester({ languageOptions: { parser: templateParser } })

/** An external template, which an inline one reads as once the processor extracts it. */
const FILE = 'apps/relay/src/inbox.component.html'

tester.run('no-raw-styles in an Angular template', noRawStyles, {
  valid: [
    { filename: FILE, code: '<pm-button label="Go" (click)="go()" />' },
    { filename: FILE, code: '<pm-stack [gap]="4"><pm-text>Hi</pm-text></pm-stack>' },
    {
      filename: FILE,
      code: '<pm-bespoke reason="a one-off"><div style="padding: 12px" class="promo" [style.color]="\'#fff\'"></div></pm-bespoke>',
    },
    // Another library's component reads its own `class`.
    { filename: FILE, code: '<mat-card class="primary"></mat-card>' },
  ],
  invalid: [
    {
      // A member strips its host's static attributes, so removing one changes nothing.
      filename: FILE,
      code: '<pm-button class="wide" label="Go" />',
      output: '<pm-button label="Go" />',
      errors: [{ messageId: 'deadProp', data: { prop: 'class', component: 'pm-button' } }],
    },
    {
      filename: FILE,
      code: '<pm-card style="padding: 4px"></pm-card>',
      output: '<pm-card></pm-card>',
      errors: [{ messageId: 'deadProp', data: { prop: 'style', component: 'pm-card' } }],
    },
    {
      // A bound class or style can still reach the host, so it is reported and left.
      filename: FILE,
      code: '<pm-button [class.wide]="wide" [ngStyle]="extra" label="Go" />',
      errors: [
        { messageId: 'memberClass', data: { prop: '[class.wide]', component: 'pm-button' } },
        { messageId: 'memberProp', data: { prop: '[ngStyle]', component: 'pm-button' } },
      ],
    },
    {
      // A part drawn as its own element keeps its attributes.
      filename: FILE,
      code: '<tr pmTableRow class="striped"></tr>',
      errors: [{ messageId: 'memberClass', data: { prop: 'class', component: 'tr' } }],
    },
    {
      filename: FILE,
      code: '<p class="text-sm text-gray-500"></p>',
      errors: [
        {
          message:
            'Unexpected `class` on <p>. `text-sm text-gray-500` reads as `<pm-text size="sm" tone="secondary">` (rung 1).',
        },
      ],
    },
    {
      filename: FILE,
      code: '<div [class.hidden]="closed" [ngClass]="{ \'flex gap-2\': on }"></div>',
      errors: [{ messageId: 'classDirective' }, { messageId: 'classDirective' }],
    },
    {
      filename: FILE,
      code: '<div style="display: flex; gap: 12px"></div>',
      options: [{ values: TEST_VALUES }],
      errors: [
        {
          message:
            'Unexpected `style` on <div>. `display` and `gap` are `<pm-inline [gap]="4">` (rung 1).',
        },
      ],
    },
    {
      filename: FILE,
      code: '<div [style.padding.px]="16"></div>',
      options: [{ values: TEST_VALUES }],
      errors: [
        {
          message:
            'Unexpected `[style.padding.px]` on <div>. `padding` is `<pm-stack [p]="5">` (rung 1).',
        },
      ],
    },
    {
      filename: FILE,
      code: "<div [ngStyle]=\"{ 'padding-top': '12px' }\"></div>",
      options: [{ values: TEST_VALUES }],
      errors: [{ messageId: 'styleProp' }],
    },
    {
      filename: FILE,
      code: '<pm-stack gap="12px" />',
      options: [{ values: TEST_VALUES }],
      errors: [
        {
          message:
            'Unexpected length `12px`. It is space step 4 (`--pm-space-4`): write `[gap]="4"` on `<pm-stack>`, `<pm-inline>` or `<pm-grid>`.',
        },
      ],
    },
    {
      filename: FILE,
      code: '<pm-stack [gap]="\'12px\'" tone="#4087de" />',
      errors: [{ messageId: 'rawLength' }, { messageId: 'rawColor' }],
    },
  ],
})

tester.run('no-raw-interactive in an Angular template', noRawInteractive, {
  valid: [
    { filename: FILE, code: '<pm-button label="Go" (click)="go()" />' },
    // A listener on the window is not the element's.
    { filename: FILE, code: '<div (window:keydown)="close()"></div>' },
    {
      filename: FILE,
      code: '<pm-bespoke reason="a one-off"><button (click)="go()">Go</button></pm-bespoke>',
    },
  ],
  invalid: [
    {
      filename: FILE,
      code: '<button type="button" (click)="save()">Save</button>',
      errors: [
        {
          message:
            'Unexpected <button>. Use `<pm-button label="Save" />` (rung 1): it carries every state, its keyboard path and its motion.',
        },
      ],
    },
    {
      filename: FILE,
      code: '<button><pm-icon name="close" /></button>',
      errors: [
        {
          message:
            'Unexpected <button>. Use `<pm-button [iconOnly]="true" icon="close" label="…" />` (rung 1): it carries every state, its keyboard path and its motion.',
        },
      ],
    },
    {
      filename: FILE,
      code: '<input type="email" [(ngModel)]="email" />',
      errors: [{ messageId: 'rawInput' }],
    },
    {
      // A list written by `@for` is not counted.
      filename: FILE,
      code: '<select>@for (o of options; track o) {<option>{{ o }}</option>}</select>',
      errors: [{ messageId: 'rawSelect' }, { messageId: 'rawOption' }],
    },
    {
      filename: FILE,
      code: '<div (keydown.enter)="open()"></div>',
      errors: [
        {
          message:
            'Unexpected `(keydown.enter)` on <div>. A clickable <div> has no control\'s states or keyboard path: use `<pm-button variant="ghost" label="…">` (rung 1), or a `<pm-bespoke reason="…">` zone.',
        },
      ],
    },
    {
      filename: FILE,
      code: '<a routerLink="/inbox" (click)="track()">Inbox</a>',
      errors: [{ messageId: 'handledElement' }],
    },
    {
      // A `pm…` attribute makes a part only on an element a part is drawn on.
      filename: FILE,
      code: '<button type="button" pmTableRow (click)="save()">Save</button>',
      errors: [{ messageId: 'rawButton' }],
    },
  ],
})

tester.run('no-app-css in an Angular template', noAppCss, {
  valid: [{ filename: FILE, code: '<pm-stack [gap]="4"></pm-stack>' }],
  invalid: [
    {
      filename: FILE,
      code: '<!-- <style> --><p>Inbox</p><style>.inbox { gap: 12px }</style>',
      options: [{ values: TEST_VALUES }],
      errors: [{ messageId: 'styleBlock' }],
    },
  ],
})

tester.run('no-external-icons in an Angular template', noExternalIcons, {
  valid: [
    { filename: FILE, code: '<pm-icon name="delete" />' },
    { filename: FILE, code: '<pm-bespoke reason="art"><svg viewBox="0 0 4 4"></svg></pm-bespoke>' },
  ],
  invalid: [
    {
      filename: FILE,
      code: '<svg aria-label="Delete" viewBox="0 0 16 16"></svg>',
      errors: [{ messageId: 'inlineSvg' }],
    },
  ],
})

tester.run('no-external-motion in an Angular template', noExternalMotion, {
  valid: [{ filename: FILE, code: '<pm-dialog [open]="open" title="Edit"></pm-dialog>' }],
  invalid: [
    {
      filename: FILE,
      code: '<div [@expand]="state" (@expand.done)="settled()"></div>',
      errors: [
        {
          message:
            'Unexpected `[@expand]` on <div>. It is a section opening and closing: `<pm-collapsible>` and `<pm-accordion>` animate their own (rung 1). A one-off goes in a `<pm-bespoke reason="…">` zone.',
        },
      ],
    },
    {
      filename: FILE,
      code: '<p animate.enter="fade-in" (animate.leave)="leave($event)"></p>',
      errors: [{ messageId: 'motionDirective' }, { messageId: 'motionDirective' }],
    },
    {
      filename: FILE,
      code: '<p [@wobble]="on"></p>',
      errors: [
        {
          message:
            'Unexpected `[@wobble]` on <p>. No member makes it: motion binds to a member\'s states, so a one-off goes in a `<pm-bespoke reason="…">` zone (rung 4).',
        },
      ],
    },
  ],
})

tester.run('one-opener in an Angular template', oneOpener, {
  valid: [{ filename: FILE, code: '<pm-page-header title="Inbox" />' }],
  invalid: [
    {
      filename: FILE,
      code: '<pm-hero title="Hi" /><pm-page-header title="Inbox" />',
      errors: [
        {
          message:
            "Unexpected <pm-page-header> beside <pm-hero>: each renders the page's <h1>. Keep `<pm-page-header>` on a working screen or `<pm-hero>` on an opening page (rung 1).",
        },
      ],
    },
  ],
})

tester.run('scoped-token-owners in an Angular template', scopedTokenOwners, {
  valid: [
    { filename: FILE, code: '<div title="--pm-space-4"></div>', options: [{ owners: OWNERS }] },
  ],
  invalid: [
    {
      filename: FILE,
      code: '<pm-bespoke reason="r"><div style="height: var(--pm-shell-topbar-height)"></div></pm-bespoke>',
      options: [{ owners: OWNERS }],
      errors: [{ messageId: 'outOfScope' }],
    },
  ],
})

/** A component module whose inline template is `template`. */
const component = (template: string, extra = '') =>
  `import { Component } from '@angular/core'\n${extra}\n@Component({\n  selector: 'app-inbox',\n  template: \`${template}\`,\n})\nexport class Inbox {}\n`

const COMPONENT = 'apps/relay/src/inbox.component.ts'
const messagesOf = (code: string, rule: string): string[] =>
  verifyCode(code, { filename: COMPONENT, framework: 'angular' })
    .diagnostics.filter((diagnostic) => diagnostic.rule === `polymorph/${rule}`)
    .map((diagnostic) => diagnostic.message)

describe('an Angular component through verify', () => {
  it('reads its inline template where it is written, and fixes it in place', () => {
    const code = component('\n    <pm-button class="wide" label="Go" />\n  ')
    const result = verifyCode(code, { filename: COMPONENT, framework: 'angular' })
    expect(result.diagnostics.map(({ rule, line, column }) => ({ rule, line, column }))).toEqual([
      { rule: 'polymorph/no-raw-styles', line: 6, column: 16 },
    ])
    expect(fixCode(code, { filename: COMPONENT, framework: 'angular' }).output).toBe(
      component('\n    <pm-button label="Go" />\n  '),
    )
  })

  it('leaves the template string to the template parser, so a raw value is reported once', () => {
    expect(messagesOf(component('<pm-stack gap="12px" />'), 'no-raw-styles')).toHaveLength(1)
  })

  it('reads a component’s styles, its stylesheet files and its animations', () => {
    const code = `import { Component } from '@angular/core'
import { trigger, transition, style, animate } from '@angular/animations'

@Component({
  selector: 'app-inbox',
  styles: \`.inbox { display: flex; gap: 12px }\`,
  styleUrls: ['./inbox.component.scss'],
  animations: [trigger('open', [transition(':enter', [style({ height: 0 }), animate(200)])])],
  template: '<p>Inbox</p>',
})
export class Inbox {}
`
    expect(messagesOf(code, 'no-app-css')).toEqual([
      expect.stringMatching(
        /^Unexpected component `styles`\. Its rules are `<pm-inline \[gap\]="\d">`/,
      ),
      expect.stringMatching(/^Unexpected stylesheet import `\.\/inbox\.component\.scss`\./),
    ])
    expect(messagesOf(code, 'no-external-motion')).toEqual([
      expect.stringContaining('`style()` animating height is a section opening and closing'),
      expect.stringContaining('`style()` animating height is a section opening and closing'),
    ])
  })

  it('exempts a component that imports Bespoke from the import bans', () => {
    const code = component(
      '<pm-bespoke reason="a chart no member draws"><div></div></pm-bespoke>',
      "import { scaleLinear } from 'd3-scale'\nimport { Bespoke } from '@polymorph/angular-ui'\nvoid scaleLinear\n",
    ).replace("selector: 'app-inbox',", "selector: 'app-inbox',\n  imports: [Bespoke],")
    expect(messagesOf(code, 'no-external-dataviz')).toEqual([])
  })

  it('reads a module as Angular by its imports or the config’s settings, and writes answers so', () => {
    const plain = "const brand = '#4087de'\n"
    const answer = (code: string, framework?: 'angular') =>
      verifyCode(code, { filename: COMPONENT, ...(framework ? { framework } : {}) }).diagnostics[0]
        ?.message
    expect(answer(plain)).toContain('`tone="…"`')
    expect(answer(plain, 'angular')).toContain('inside `<pm-bespoke>`')
    expect(answer(`import { signal } from '@angular/core'\nvoid signal\n${plain}`)).toContain(
      'inside `<pm-bespoke>`',
    )
  })
})

describe('answers in template syntax', () => {
  it('writes a member by its selector and its props as bindings', () => {
    expect(angularSelector('DataTable')).toBe('pm-data-table')
    expect(angularSelector('Tabs.Content')).toBe('pm-tabs-content')
    expect(
      angularSyntax(
        'Use `<Inline gap={4} align="center">`, `<Button iconOnly icon="x" label="…" />`, `onClick={save}` or `patch={{ radius: \'md\' }}`.',
      ),
    ).toBe(
      'Use `<pm-inline [gap]="4" align="center">`, `<pm-button [iconOnly]="true" icon="x" label="…" />`, `(click)="save()"` or `[patch]="{ radius: \'md\' }"`.',
    )
  })

  it('leaves what was found and text alone', () => {
    expect(angularSyntax('Unexpected `className` on <div>. Read `--pm-space-4`.')).toBe(
      'Unexpected `className` on <div>. Read `--pm-space-4`.',
    )
  })
})
