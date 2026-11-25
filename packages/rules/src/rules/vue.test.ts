import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { RuleTester, type Linter } from 'eslint'
import tseslint from 'typescript-eslint'
import vueParser from 'vue-eslint-parser'
import { describe, expect, it } from 'vitest'

import { allRules } from '../index'
import { verifyCode } from '../verify'
import { noAppCss } from './no-app-css'
import { dangerLast } from './danger-last'
import { noExternalIcons } from './no-external-icons'
import { noExternalMotion } from './no-external-motion'
import { noRawInteractive } from './no-raw-interactive'
import { noRawStyles } from './no-raw-styles'
import { oneMainButton } from './one-main-button'
import { oneOpener } from './one-opener'
import { trailingIcon } from './trailing-icon'

/**
 * The red rules, reading a Vue single-file component.
 *
 * A `.vue` file is the same application code as a `.tsx` one, so the rules say
 * the same things about it: `class` and `style` on a member are removed, a raw
 * control or a clickable `<div>` names its member, a `<style>` block is a
 * stylesheet, a glyph or chart import names its role or member, and two
 * openers are one too many. The fixtures in `fixtures/vue/` are linted through
 * `verify`, the path the MCP server and the screen emitter take; the cases
 * below run each rule alone under the Vue parser.
 */

const FIXTURES = resolve(process.cwd(), 'packages/rules/fixtures/vue')
const read = (name: string) => readFileSync(join(FIXTURES, name), 'utf8')

const OWNERS = { '--pm-shell-': ['packages/recipes/src/archetypes/app-shell.module.css'] }

function lintApp(fixture: string, rules: Linter.RulesRecord): string[] {
  const result = verifyCode(read(fixture), { filename: `apps/relay/src/${fixture}`, rules })
  expect(result.fatal, `${fixture}: ${result.fatal}`).toBeNull()
  return [...new Set(result.diagnostics.map((diagnostic) => diagnostic.rule))].sort()
}

describe('the Vue fixtures', () => {
  const withOwners: Linter.RulesRecord = {
    ...allRules,
    'polymorph/scoped-token-owners': ['error', { owners: OWNERS }],
  }

  it('fire every application rule', () => {
    expect(lintApp('app-violations.vue', withOwners)).toEqual(Object.keys(allRules).sort())
  })

  it('pass the lawful screen', () => {
    expect(lintApp('app-clean.vue', allRules)).toEqual([])
  })

  it('pass a declared <Bespoke> zone, because rung 4 is lawful', () => {
    expect(lintApp('app-bespoke.vue', allRules)).toEqual([])
  })

  it('pass a declared <ThirdParty> boundary around another library’s component', () => {
    expect(lintApp('app-third-party.vue', allRules)).toEqual([])
  })
})

RuleTester.describe = describe as unknown as typeof RuleTester.describe
RuleTester.it = it as unknown as typeof RuleTester.it

const tester = new RuleTester({
  languageOptions: {
    parser: vueParser,
    parserOptions: { parser: tseslint.parser, extraFileExtensions: ['.vue'] },
    ecmaVersion: 2022,
    sourceType: 'module',
  },
})

const FILE = 'apps/relay/src/Inbox.vue'

/** A component with `script` in `<script setup lang="ts">` and `template` in its template. */
const sfc = (template: string, script = "import { Button, Card } from '@polymorph/vue-ui'") =>
  `<script setup lang="ts">\n${script}\n</script>\n\n<template>\n  ${template}\n</template>\n`

const messagesOf = (code: string, rule: string): string[] =>
  verifyCode(code, { filename: FILE })
    .diagnostics.filter((diagnostic) => diagnostic.rule === `polymorph/${rule}`)
    .map((diagnostic) => diagnostic.message)

tester.run('no-raw-styles in a Vue template', noRawStyles, {
  valid: [
    { filename: FILE, code: sfc('<Button label="Go" />') },
    { filename: FILE, code: sfc('<Card><Button label="Go" @click="go" /></Card>') },
    {
      filename: FILE,
      code: sfc(
        '<Bespoke reason="a one-off"><div style="padding: 12px" class="promo" /></Bespoke>',
        "import { Bespoke } from '@polymorph/vue-ui'",
      ),
    },
    // A compound part is left alone, as `<Table.Row className>` is in TSX.
    { filename: FILE, code: sfc('<SettingsRow.Group class="x" />') },
    // So is another library's component's `class`, which it reads itself.
    { filename: FILE, code: sfc('<el-button class="primary" />') },
    // A lowercase tag Vue resolves to the imported `Bespoke` opens the zone.
    {
      filename: FILE,
      code: sfc(
        '<bespoke reason="a one-off"><div style="padding: 12px" class="promo" /></bespoke>',
        "import { Bespoke } from '@polymorph/vue-ui'",
      ),
    },
  ],
  invalid: [
    {
      filename: FILE,
      code: sfc('<Button class="wide" label="Go" />'),
      output: sfc('<Button label="Go" />'),
      errors: [{ messageId: 'deadProp', data: { prop: 'class', component: 'Button' } }],
    },
    {
      filename: FILE,
      code: sfc('<Card\n    :class="{ wide }"\n  />'),
      output: sfc('<Card\n  />'),
      errors: [{ messageId: 'deadProp', data: { prop: 'class', component: 'Card' } }],
    },
    {
      // A kebab-case tag resolves to the member a `<script setup>` imports.
      filename: FILE,
      code: sfc('<data-table style="x" />', "import { DataTable } from '@polymorph/vue-ui'"),
      output: sfc('<data-table />', "import { DataTable } from '@polymorph/vue-ui'"),
      errors: [{ messageId: 'deadProp', data: { prop: 'style', component: 'DataTable' } }],
    },
    {
      // A lowercase tag resolves to the member a `<script setup>` imports, as
      // Vue's compiler resolves it.
      filename: FILE,
      code: sfc('<card class="wide" />'),
      output: sfc('<card />'),
      errors: [{ messageId: 'deadProp', data: { prop: 'class', component: 'Card' } }],
    },
    {
      // A `style` has an effect on anything that is not a member: another
      // library's component, static or bound, by either spelling.
      filename: FILE,
      code: sfc('<el-button style="color: #f00" />'),
      errors: [{ messageId: 'styleProp' }],
    },
    {
      filename: FILE,
      code: sfc(`<ElButton :style="{ color: '#f00' }" />`),
      errors: [{ messageId: 'styleProp' }, { messageId: 'rawColor' }],
    },
    {
      filename: FILE,
      code: sfc('<my-widget style="padding: 12px" />'),
      errors: [{ messageId: 'styleProp' }],
    },
    {
      // A `class` on a member stays red inside a zone, as in TSX.
      filename: FILE,
      code: sfc(
        '<Bespoke reason="a one-off"><Button class="x" label="Go" /></Bespoke>',
        "import { Bespoke, Button } from '@polymorph/vue-ui'",
      ),
      output: sfc(
        '<Bespoke reason="a one-off"><Button label="Go" /></Bespoke>',
        "import { Bespoke, Button } from '@polymorph/vue-ui'",
      ),
      errors: [{ messageId: 'deadProp' }],
    },
    {
      filename: FILE,
      code: sfc('<p class="text-sm text-gray-500" />'),
      errors: [{ messageId: 'classAttribute' }],
    },
    {
      filename: FILE,
      code: sfc(`<div :style="{ display: 'flex', gap: '12px' }" />`),
      errors: [{ messageId: 'styleProp' }, { messageId: 'rawLength' }],
    },
    {
      filename: FILE,
      code: sfc('<Stack gap="12px" />'),
      errors: [{ messageId: 'rawLength' }],
    },
  ],
})

describe('what no-raw-styles says in a Vue template', () => {
  it('reads utility classes and a static style as it reads them in TSX, in template syntax', () => {
    expect(messagesOf(sfc('<div class="flex gap-2 p-4" />'), 'no-raw-styles')).toEqual([
      'Unexpected `class` on <div>. `flex gap-2 p-4` reads as `<Inline :gap="3" :p="5">` (rung 1). One-off styling goes in a `<Bespoke reason="…">` zone.',
    ])
    expect(messagesOf(sfc('<div style="display: flex; gap: 12px" />'), 'no-raw-styles')).toEqual([
      'Unexpected `style` on <div>. `display` and `gap` are `<Inline :gap="4">` (rung 1).',
    ])
  })

  it('names the same alternatives in template syntax as in JSX', () => {
    const [vue] = verifyCode(sfc('<div class="flex gap-2 p-4" />'), { filename: FILE }).diagnostics
    const [tsx] = verifyCode('export const A = () => <div className="flex gap-2 p-4" />', {
      filename: 'apps/relay/src/Inbox.tsx',
    }).diagnostics
    expect(vue?.alternatives).toEqual(tsx?.alternatives)
    expect(vue?.alternatives).toContainEqual({ member: 'Inline', prop: 'gap', rung: 1 })
  })

  it('names the nearest token for a raw colour in a bound style and in the script', () => {
    const messages = messagesOf(
      sfc(`<Card :style="{ color: '#fff' }" />`, "const brand = '#0089ea'"),
      'no-raw-styles',
    )
    const about = (text: string) => messages.find((message) => message.includes(text)) ?? ''
    expect(about('`#0089ea`')).toContain('`--pm-accent-bg`')
    expect(about('`#fff`')).toContain('`--pm-accent-contrast`')
  })

  it('names a style on another library’s component as it is written', () => {
    expect(messagesOf(sfc('<my-widget style="padding: 12px" />'), 'no-raw-styles')).toEqual([
      'Unexpected `style` on <my-widget>. `padding` is `<Stack :p="4">` (rung 1).',
    ])
  })
})

tester.run('no-raw-interactive in a Vue template', noRawInteractive, {
  valid: [
    { filename: FILE, code: sfc('<Button label="Save" @click="save" />') },
    { filename: FILE, code: sfc('<div><p>text</p></div>') },
    {
      filename: FILE,
      code: sfc(
        '<Bespoke reason="a one-off"><button>Go</button></Bespoke>',
        "import { Bespoke } from '@polymorph/vue-ui'",
      ),
    },
  ],
  invalid: [
    {
      // `<button>` is the HTML element even where `Button` is imported.
      filename: FILE,
      code: sfc('<button>Save</button>', "import { Button } from '@polymorph/vue-ui'"),
      errors: [{ messageId: 'rawButton' }],
    },
    {
      filename: FILE,
      code: sfc('<button type="button" @click="save">Save</button>'),
      errors: [
        {
          message:
            'Unexpected <button>. Use `<Button label="Save" />` (rung 1): it carries every state, its keyboard path and its motion.',
        },
      ],
    },
    {
      filename: FILE,
      code: sfc('<input type="email" />'),
      errors: [
        {
          message:
            'Unexpected <input type="email">. Use `<Input type="email">` (rung 1): it carries the field\'s states, its label wiring and its keyboard path.',
        },
      ],
    },
    {
      filename: FILE,
      code: sfc(`<select multiple><option v-for="o in list">{{ o }}</option></select>`),
      errors: [{ messageId: 'rawSelect' }, { messageId: 'rawOption' }],
    },
    {
      filename: FILE,
      code: sfc('<textarea />'),
      errors: [{ messageId: 'rawTextarea' }],
    },
    {
      filename: FILE,
      code: sfc('<div @click.stop="open">Open</div>'),
      errors: [
        {
          message:
            'Unexpected `@click` on <div>. A clickable <div> has no control\'s states or keyboard path: use `<Button variant="ghost" label="…">` (rung 1), or a `<Bespoke reason="…">` zone.',
        },
      ],
    },
    {
      filename: FILE,
      code: sfc('<li v-on:keydown="move">One</li>'),
      errors: [{ messageId: 'handledElement' }],
    },
    {
      filename: FILE,
      code: sfc('<a href="/x" @click="track">x</a>'),
      errors: [
        {
          message:
            'Unexpected `@click` on <a>. A link that also runs code is still `<Link href="…">` (rung 1); work that changes data is a `<Button>`.',
        },
      ],
    },
  ],
})

tester.run('no-app-css in a Vue file', noAppCss, {
  valid: [{ filename: FILE, code: sfc('<Card />') }],
  invalid: [
    {
      filename: FILE,
      code: `${sfc('<Card />')}\n<style scoped>\n.row {\n  display: flex;\n  gap: 12px;\n}\n</style>\n`,
      errors: [{ messageId: 'styleBlock' }],
    },
    {
      filename: FILE,
      code: `${sfc('<Card />')}\n<style src="./row.css"></style>\n`,
      errors: [
        {
          message:
            'Unexpected stylesheet import `./row.css`. Spacing becomes `:gap="…"` or `:p="…"` on `<Stack>`, `<Inline>` or `<Grid>` (rung 1).',
        },
      ],
    },
    {
      filename: FILE,
      code: sfc('<Card />', "import './row.css'"),
      errors: [{ messageId: 'stylesheet' }],
    },
  ],
})

tester.run('no-external-icons in a Vue file', noExternalIcons, {
  valid: [
    {
      filename: FILE,
      code: sfc('<Icon name="delete" />', "import { Icon } from '@polymorph/vue-ui'"),
    },
  ],
  invalid: [
    {
      // Reported and not rewritten: the glyph is used in the template.
      filename: FILE,
      code: sfc('<Trash2 />', "import { Trash2 } from 'lucide-react'"),
      output: null,
      errors: [{ messageId: 'iconImport' }],
    },
    {
      filename: FILE,
      code: sfc('<Trash2 />', "import { Trash2 } from 'lucide-vue-next'"),
      errors: [
        {
          message:
            'Unexpected icon import `lucide-vue-next`. `Trash2` is `<Icon name="delete" />` (rung 1). `Icon` takes `label` and a `size` step, so map the glyph\'s props by hand.',
        },
      ],
    },
    {
      filename: FILE,
      code: sfc('<svg aria-label="Close" />'),
      errors: [{ messageId: 'inlineSvg' }],
    },
  ],
})

tester.run('no-external-motion in a Vue file', noExternalMotion, {
  valid: [
    { filename: FILE, code: sfc('<Dialog />', "import { Dialog } from '@polymorph/vue-ui'") },
  ],
  invalid: [
    {
      filename: FILE,
      code: sfc('<div />', "import { useMotion } from '@vueuse/motion'"),
      errors: [{ messageId: 'motionImport' }],
    },
    {
      filename: FILE,
      code: sfc('<transition-group><p>a</p></transition-group>'),
      errors: [
        {
          message:
            'Unexpected <transition-group>. It is an entrance and exit: `<Dialog>`, `<Drawer>`, `<Popover>` and `<Toast>` animate their own (rung 1). A one-off goes in a `<Bespoke reason="…">` zone.',
        },
      ],
    },
  ],
})

tester.run('one-opener in a Vue template', oneOpener, {
  valid: [{ filename: FILE, code: sfc('<PageHeader title="a" />') }],
  invalid: [
    {
      filename: FILE,
      code: sfc('<ListPage title="a"><page-header title="b" /><Hero title="c" /></ListPage>'),
      errors: [
        {
          message:
            'Unexpected <Hero> beside <PageHeader>: each renders the page\'s <h1>. <ListPage> renders its PageHeader from `<ListPage title="…">`: keep that and drop both here (rung 1).',
        },
      ],
    },
  ],
})

tester.run('one-main-button in a Vue template', oneMainButton, {
  valid: [
    // A `v-if` and its `v-else` are alternatives, and a dialog's trigger slot stays on the page.
    {
      filename: FILE,
      code: sfc(
        '<Card title="a"><Button v-if="saved" label="Publish" /><Button v-else label="Save" /></Card>' +
          '<Dialog title="b"><template #trigger><Button label="Open" /></template><template #footer><Button label="Done" /></template></Dialog>',
      ),
    },
    // A `v-for` writes Buttons the rule cannot count, and a computed variant is not read.
    {
      filename: FILE,
      code: sfc(
        '<Card title="a"><Button label="Save" /><Button v-for="x in xs" :key="x" :label="x" /><Button :variant="kind" label="b" /></Card>',
      ),
    },
  ],
  invalid: [
    {
      filename: FILE,
      code: sfc(
        '<Dialog title="a"><template #footer><Button label="Save" /></template><Button :variant="\'solid\'" label="Reset" /></Dialog>',
      ),
      errors: [
        {
          message:
            'Unexpected second main Button in <Dialog>: a dialog has one solid accent Button, which marks its next step. Make this one `<Button variant="outline" tone="neutral">` (rung 1).',
        },
      ],
    },
  ],
})

tester.run('danger-last in a Vue template', dangerLast, {
  valid: [
    {
      filename: FILE,
      code: sfc('<Inline><Button label="Keep" /><Button tone="danger" label="Delete" /></Inline>'),
    },
  ],
  invalid: [
    {
      filename: FILE,
      code: sfc('<Inline><Button tone="danger" label="Delete" /><Button label="Keep" /></Inline>'),
      errors: [{ messageId: 'dangerFirst' }],
    },
  ],
})

tester.run('trailing-icon in a Vue template', trailingIcon, {
  valid: [{ filename: FILE, code: sfc('<Button trailing-icon="next" label="Continue" />') }],
  invalid: [
    {
      filename: FILE,
      code: sfc('<Button trailing-icon="delete" label="Delete" />'),
      output: sfc('<Button icon="delete" label="Delete" />'),
      errors: [{ messageId: 'notTrailing' }],
    },
    {
      filename: FILE,
      code: sfc('<Button :trailingIcon="\'user\'" label="Invite" />'),
      output: sfc('<Button :icon="\'user\'" label="Invite" />'),
      errors: [{ messageId: 'notTrailing' }],
    },
  ],
})
