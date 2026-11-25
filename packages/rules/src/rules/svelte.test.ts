import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { RuleTester, type Linter } from 'eslint'
import svelteParser from 'svelte-eslint-parser'
import tseslint from 'typescript-eslint'
import { describe, expect, it } from 'vitest'

import { allRules } from '../index'
import { verifyCode } from '../verify'
import { noAppCss } from './no-app-css'
import { dangerLast } from './danger-last'
import { noExternalDataviz } from './no-external-dataviz'
import { noExternalIcons } from './no-external-icons'
import { noExternalMotion } from './no-external-motion'
import { noRawInteractive } from './no-raw-interactive'
import { noRawStyles } from './no-raw-styles'
import { oneMainButton } from './one-main-button'
import { oneOpener } from './one-opener'
import { TEST_VALUES } from './rule-tester'
import { scopedTokenOwners } from './scoped-token-owners'
import { trailingIcon } from './trailing-icon'

/**
 * The red rules, reading a Svelte component.
 *
 * A `.svelte` file is the same application code as a `.tsx` one, so the rules
 * say the same things about it: `class` and `style` on a member are removed, a
 * raw control or a clickable `<div>` names its member, a `<style>` block is a
 * stylesheet, a `transition:` directive names the member that animates it, a
 * glyph or chart import names its role or member, and two openers are one too
 * many. The answers are written as JSX writes a prop, which is how Svelte
 * writes one. The fixtures in `fixtures/svelte/` are linted through `verify`,
 * the path the MCP server and the screen emitter take; the cases below run
 * each rule alone under the Svelte parser.
 */

const FIXTURES = resolve(process.cwd(), 'packages/rules/fixtures/svelte')
const read = (name: string) => readFileSync(join(FIXTURES, name), 'utf8')

const OWNERS = { '--pm-shell-': ['packages/recipes/src/archetypes/app-shell.module.css'] }

function lintApp(fixture: string, rules: Linter.RulesRecord): string[] {
  const result = verifyCode(read(fixture), { filename: `apps/relay/src/${fixture}`, rules })
  expect(result.fatal, `${fixture}: ${result.fatal}`).toBeNull()
  return [...new Set(result.diagnostics.map((diagnostic) => diagnostic.rule))].sort()
}

describe('the Svelte fixtures', () => {
  const withOwners: Linter.RulesRecord = {
    ...allRules,
    'polymorph/scoped-token-owners': ['error', { owners: OWNERS }],
  }

  it('fire every application rule', () => {
    expect(lintApp('app-violations.svelte', withOwners)).toEqual(Object.keys(allRules).sort())
  })

  it('pass the lawful screen', () => {
    expect(lintApp('app-clean.svelte', allRules)).toEqual([])
  })

  it('pass a declared <Bespoke> zone, because rung 4 is lawful', () => {
    expect(lintApp('app-bespoke.svelte', allRules)).toEqual([])
  })

  it('pass a declared <ThirdParty> boundary around another library’s component', () => {
    expect(lintApp('app-third-party.svelte', allRules)).toEqual([])
  })
})

RuleTester.describe = describe as unknown as typeof RuleTester.describe
RuleTester.it = it as unknown as typeof RuleTester.it

const tester = new RuleTester({
  languageOptions: {
    parser: svelteParser,
    parserOptions: { parser: tseslint.parser, extraFileExtensions: ['.svelte'] },
    ecmaVersion: 2022,
    sourceType: 'module',
  },
})

const FILE = 'apps/relay/src/Inbox.svelte'

/** A component with `script` in `<script lang="ts">` and `markup` after it. */
const component = (
  markup: string,
  script = "import { Button, Card } from '@polymorph/svelte-ui'",
) => `<script lang="ts">\n  ${script}\n</script>\n\n${markup}\n`

const messagesOf = (code: string, rule: string): string[] =>
  verifyCode(code, { filename: FILE })
    .diagnostics.filter((diagnostic) => diagnostic.rule === `polymorph/${rule}`)
    .map((diagnostic) => diagnostic.message)

tester.run('no-raw-styles in Svelte markup', noRawStyles, {
  valid: [
    { filename: FILE, code: component('<Button label="Go" />') },
    { filename: FILE, code: component('<Card><Button label="Go" onClick={go} /></Card>') },
    {
      filename: FILE,
      code: component(
        '<Bespoke reason="a one-off"><div style="padding: 12px" class="promo" class:on={on} style:color="#fff"></div></Bespoke>',
        "import { Bespoke } from '@polymorph/svelte-ui'",
      ),
    },
    // A compound part is left alone, as `<Table.Row className>` is in TSX.
    { filename: FILE, code: component('<Tabs.Content class="x" value="a" />') },
    // So is a custom element's `class`, which it reads itself.
    { filename: FILE, code: component('<my-widget class="primary"></my-widget>') },
    // The script's `lang` attribute is not a style.
    { filename: FILE, code: component('<p>{label}</p>') },
  ],
  invalid: [
    {
      filename: FILE,
      code: component('<Button class="wide" label="Go" />'),
      output: component('<Button label="Go" />'),
      errors: [{ messageId: 'deadProp', data: { prop: 'class', component: 'Button' } }],
    },
    {
      // In braces or shorthand, each removed with the space before it. Two
      // side by side touch, so one pass removes the first.
      filename: FILE,
      code: component('<Card\n  class={wide}\n  {style}\n/>'),
      output: component('<Card\n  {style}\n/>'),
      errors: [
        { messageId: 'deadProp', data: { prop: 'class', component: 'Card' } },
        { messageId: 'deadProp', data: { prop: 'style', component: 'Card' } },
      ],
    },
    {
      // The script can follow the markup; the member is still the import.
      filename: FILE,
      code: `<Card style="x" />\n\n<script lang="ts">\n  import { Card } from '@polymorph/svelte-ui'\n</script>\n`,
      output: `<Card />\n\n<script lang="ts">\n  import { Card } from '@polymorph/svelte-ui'\n</script>\n`,
      errors: [{ messageId: 'deadProp', data: { prop: 'style', component: 'Card' } }],
    },
    {
      // An `{#each}` variable named `Card` is whatever the list holds.
      filename: FILE,
      code: component('{#each cards as Card}<Card class="x" />{/each}'),
      errors: [{ messageId: 'memberClass', data: { prop: 'class', component: 'Card' } }],
    },
    {
      // A `class` on a member stays red inside a zone, as in TSX.
      filename: FILE,
      code: component(
        '<Bespoke reason="a one-off"><Button class="x" label="Go" /></Bespoke>',
        "import { Bespoke, Button } from '@polymorph/svelte-ui'",
      ),
      output: component(
        '<Bespoke reason="a one-off"><Button label="Go" /></Bespoke>',
        "import { Bespoke, Button } from '@polymorph/svelte-ui'",
      ),
      errors: [{ messageId: 'deadProp' }],
    },
    {
      filename: FILE,
      code: component('<p class="text-sm text-gray-500"></p>'),
      errors: [
        {
          message:
            'Unexpected `class` on <p>. `text-sm text-gray-500` reads as `<Text size="sm" tone="secondary">` (rung 1).',
        },
      ],
    },
    {
      filename: FILE,
      code: component('<div class:hidden={closed}></div>'),
      errors: [{ messageId: 'classDirective' }],
    },
    {
      filename: FILE,
      code: component('<div style="display: flex; gap: 12px"></div>'),
      options: [{ values: TEST_VALUES }],
      errors: [
        {
          message:
            'Unexpected `style` on <div>. `display` and `gap` are `<Inline gap={4}>` (rung 1).',
        },
      ],
    },
    {
      filename: FILE,
      code: component(`<div style={'padding: 16px'}></div>`),
      options: [{ values: TEST_VALUES }],
      errors: [{ message: 'Unexpected `style` on <div>. `padding` is `<Stack p={5}>` (rung 1).' }],
    },
    {
      filename: FILE,
      code: component('<div style:padding|important="12px"></div>'),
      options: [{ values: TEST_VALUES }],
      errors: [
        {
          message: 'Unexpected `style:padding` on <div>. `padding` is `<Stack p={4}>` (rung 1).',
        },
      ],
    },
    {
      // A `style` has an effect on anything that is not a member.
      filename: FILE,
      code: component('<my-widget style="padding: 12px"></my-widget>'),
      errors: [{ messageId: 'styleProp' }],
    },
    {
      filename: FILE,
      code: component('<Stack gap="12px" />'),
      errors: [{ messageId: 'rawLength' }],
    },
    {
      filename: FILE,
      code: component(`<Stack gap={'12px'} />`, "const brand = '#4087de'"),
      errors: [{ messageId: 'rawColor' }, { messageId: 'rawLength' }],
    },
  ],
})

describe('what no-raw-styles says in Svelte markup', () => {
  it('reads utility classes and a static style as it reads them in TSX, in JSX syntax', () => {
    expect(messagesOf(component('<div class="flex gap-2 p-4"></div>'), 'no-raw-styles')).toEqual([
      'Unexpected `class` on <div>. `flex gap-2 p-4` reads as `<Inline gap={3} p={5}>` (rung 1). One-off styling goes in a `<Bespoke reason="…">` zone.',
    ])
  })

  it('names the same alternatives as the TSX report', () => {
    const [svelte] = verifyCode(component('<div class="flex gap-2 p-4"></div>'), {
      filename: FILE,
    }).diagnostics
    const [tsx] = verifyCode('export const A = () => <div className="flex gap-2 p-4" />', {
      filename: 'apps/relay/src/Inbox.tsx',
    }).diagnostics
    expect(svelte?.alternatives).toEqual(tsx?.alternatives)
  })

  it('names the property a raw length in a static attribute is for', () => {
    expect(messagesOf(component('<Stack gap="12px" />'), 'no-raw-styles')).toEqual([
      'Unexpected length `12px`. It is space step 4 (`--pm-space-4`): write `gap={4}` on `<Stack>`, `<Inline>` or `<Grid>`.',
    ])
  })
})

tester.run('no-raw-interactive in Svelte markup', noRawInteractive, {
  valid: [
    { filename: FILE, code: component('<Button label="Save" onClick={save} />') },
    { filename: FILE, code: component('<div><p>text</p></div>') },
    // A window listener is not a control.
    { filename: FILE, code: component('<svelte:window onkeydown={move} />') },
    {
      filename: FILE,
      code: component(
        '<Bespoke reason="a one-off"><button>Go</button><div onclick={go}></div></Bespoke>',
        "import { Bespoke } from '@polymorph/svelte-ui'",
      ),
    },
  ],
  invalid: [
    {
      // Reported and not rewritten, even with a module to import from.
      filename: FILE,
      code: component('<button type="button" onclick={save}>Save</button>'),
      options: [{ vocabulary: '@polymorph/svelte-ui' }],
      output: null,
      errors: [
        {
          message:
            'Unexpected <button>. Use `<Button label="Save" />` (rung 1): it carries every state, its keyboard path and its motion.',
        },
      ],
    },
    {
      filename: FILE,
      code: component('<button onclick={close}><Icon name="close" /></button>'),
      errors: [
        {
          message:
            'Unexpected <button>. Use `<Button iconOnly icon="close" label="…" />` (rung 1): it carries every state, its keyboard path and its motion.',
        },
      ],
    },
    {
      filename: FILE,
      code: component('<input type="search" />'),
      errors: [
        {
          message:
            'Unexpected <input type="search">. Use `<SearchInput>` (rung 1): it carries the field\'s states, its label wiring and its keyboard path.',
        },
      ],
    },
    {
      // An `{#each}` writes one option for many, so the list is not counted.
      filename: FILE,
      code: component('<select>{#each list as o}<option>{o}</option>{/each}</select>'),
      errors: [
        {
          message:
            'Unexpected <select>. Use `<Select options={…}>` (rung 1); options are data, not elements. A long list is `<Combobox options={…}>`, which filters as the reader types.',
        },
        { messageId: 'rawOption' },
      ],
    },
    {
      filename: FILE,
      code: component('<textarea></textarea>'),
      errors: [{ messageId: 'rawTextarea' }],
    },
    {
      filename: FILE,
      code: component('<div onclick={open}>Open</div>'),
      errors: [
        {
          message:
            'Unexpected `onclick` on <div>. A clickable <div> has no control\'s states or keyboard path: use `<Button variant="ghost" label="…">` (rung 1), or a `<Bespoke reason="…">` zone.',
        },
      ],
    },
    {
      filename: FILE,
      code: component('<li on:keydown|preventDefault={move}>One</li>'),
      errors: [{ messageId: 'handledElement' }],
    },
    {
      filename: FILE,
      code: component('<tr {onclick}></tr>'),
      errors: [
        {
          message:
            'Unexpected `onclick` on <tr>. A clickable row is `<Table.Row interactive>` with its `onClick` (rung 1).',
        },
      ],
    },
  ],
})

tester.run('no-app-css in a Svelte file', noAppCss, {
  valid: [{ filename: FILE, code: component('<Card />') }],
  invalid: [
    {
      filename: FILE,
      code: `${component('<Card />')}\n<style>\n  .row {\n    display: flex;\n    gap: 12px;\n  }\n</style>\n`,
      options: [{ values: TEST_VALUES }],
      errors: [
        {
          message:
            'Unexpected <style> block. Its rules are `<Inline gap={4}>` (rung 1), so the block can go.',
        },
      ],
    },
    {
      filename: FILE,
      code: component('<Card />', "import './row.css'"),
      errors: [{ messageId: 'stylesheet' }],
    },
  ],
})

tester.run('no-external-icons in a Svelte file', noExternalIcons, {
  valid: [
    {
      filename: FILE,
      code: component('<Icon name="delete" />', "import { Icon } from '@polymorph/svelte-ui'"),
    },
  ],
  invalid: [
    {
      // Reported and not rewritten: the glyph is used in the markup.
      filename: FILE,
      code: component('<Trash2 />', "import { Trash2 } from 'lucide-react'"),
      output: null,
      errors: [{ messageId: 'iconImport' }],
    },
    {
      filename: FILE,
      code: component('<Trash2 />', "import { Trash2 } from 'lucide-svelte'"),
      errors: [
        {
          message:
            'Unexpected icon import `lucide-svelte`. `Trash2` is `<Icon name="delete" />` (rung 1). `Icon` takes `label` and a `size` step, so map the glyph\'s props by hand.',
        },
      ],
    },
    {
      filename: FILE,
      code: component('<IconHome />', "import IconHome from '~icons/mdi/home'"),
      errors: [{ messageId: 'iconImport' }],
    },
    {
      filename: FILE,
      code: component('<svg><title>Close</title></svg>'),
      errors: [
        {
          message:
            'Unexpected inline <svg>. Its label reads as `<Icon name="close" label="Close" />` (rung 1). One-off art goes in a `<Bespoke reason="…">` zone.',
        },
      ],
    },
  ],
})

tester.run('no-external-motion in a Svelte file', noExternalMotion, {
  valid: [
    {
      filename: FILE,
      code: component('<Dialog />', "import { Dialog } from '@polymorph/svelte-ui'"),
    },
    {
      // A zone lifts the directives, and the file's imports with them.
      filename: FILE,
      code: component(
        '<Bespoke reason="a one-off"><p transition:fade>New</p></Bespoke>',
        "import { fade } from 'svelte/transition'\n  import { Bespoke } from '@polymorph/svelte-ui'",
      ),
    },
  ],
  invalid: [
    {
      filename: FILE,
      code: component('<p transition:fade>New</p>', "import { fade } from 'svelte/transition'"),
      errors: [
        {
          message:
            'Unexpected motion library `svelte/transition`. `fade` is an entrance and exit: `<Dialog>`, `<Drawer>`, `<Popover>` and `<Toast>` animate their own (rung 1).',
        },
        {
          message:
            'Unexpected `transition:fade` on <p>. It is an entrance and exit: `<Dialog>`, `<Drawer>`, `<Popover>` and `<Toast>` animate their own (rung 1). A one-off goes in a `<Bespoke reason="…">` zone.',
        },
      ],
    },
    {
      filename: FILE,
      code: component('<section in:slide out:fade>…</section>'),
      errors: [
        {
          message:
            'Unexpected `in:slide` on <section>. It is a section opening and closing: `<Collapsible>` and `<Accordion>` animate their own (rung 1). A one-off goes in a `<Bespoke reason="…">` zone.',
        },
        { messageId: 'motionDirective' },
      ],
    },
    {
      filename: FILE,
      code: component('{#each items as item (item)}<li animate:flip>{item}</li>{/each}'),
      errors: [
        {
          message:
            'Unexpected `animate:flip` on <li>. No member makes it: motion binds to a member\'s states, so a one-off goes in a `<Bespoke reason="…">` zone (rung 4).',
        },
      ],
    },
    {
      filename: FILE,
      code: component('<p />', "import { tweened } from 'svelte/motion'"),
      errors: [{ messageId: 'motionImport' }],
    },
  ],
})

tester.run('no-external-dataviz in a Svelte file', noExternalDataviz, {
  valid: [
    {
      filename: FILE,
      code: component('<BarChart />', "import { BarChart } from '@polymorph/svelte-ui'"),
    },
  ],
  invalid: [
    {
      filename: FILE,
      code: component('<BarChart />', "import { BarChart } from 'layerchart'"),
      errors: [
        {
          message:
            'Unexpected charting import `layerchart`. `BarChart` is `<BarChart data={…} series={…}>` (rung 1). A chart no member draws goes in a `<Bespoke reason="…">` zone (rung 4).',
        },
      ],
    },
    {
      filename: FILE,
      code: component('<VisXYContainer />', "import { VisXYContainer } from '@unovis/svelte'"),
      errors: [{ messageId: 'datavizImport' }],
    },
  ],
})

tester.run('scoped-token-owners in Svelte markup', scopedTokenOwners, {
  valid: [
    {
      filename: FILE,
      code: component('<div title="--pm-space-4"></div>'),
      options: [{ owners: OWNERS }],
    },
  ],
  invalid: [
    {
      filename: FILE,
      code: component('<div style="height: var(--pm-shell-topbar-height)"></div>'),
      options: [{ owners: OWNERS }],
      errors: [
        {
          message:
            '`--pm-shell-*` belongs to app-shell.module.css, not this file (packages/rules/scoped-token-owners.json). Read a theme-scoped token here, or list the file if it owns the pattern.',
        },
      ],
    },
  ],
})

tester.run('one-opener in Svelte markup', oneOpener, {
  valid: [{ filename: FILE, code: component('<PageHeader title="a" />') }],
  invalid: [
    {
      filename: FILE,
      code: component('<ListPage title="a"><PageHeader title="b" /><Hero title="c" /></ListPage>'),
      errors: [
        {
          message:
            'Unexpected <Hero> beside <PageHeader>: each renders the page\'s <h1>. <ListPage> renders its PageHeader from `<ListPage title="…">`: keep that and drop both here (rung 1).',
        },
      ],
    },
  ],
})

describe('verify on a Svelte file', () => {
  it('reads it with the Svelte parser', () => {
    const result = verifyCode(component('<Button class="x" label="Go" />'), { filename: FILE })
    expect(result.fatal).toBeNull()
    expect(result.diagnostics.map((diagnostic) => diagnostic.rule)).toEqual([
      'polymorph/no-raw-styles',
    ])
  })

  it('reports markup the Svelte parser cannot read as fatal', () => {
    expect(verifyCode('<div>{#if}</div>', { filename: FILE }).fatal).not.toBeNull()
  })
})

tester.run('one-main-button in Svelte markup', oneMainButton, {
  valid: [
    // `{#if}` and `{:else}` are alternatives, a trigger snippet stays on the page, and `{#each}`
    // writes Buttons the rule cannot count.
    {
      filename: FILE,
      code: component(
        '<Card title="a">{#if saved}<Button label="Publish" />{:else if draft}<Button label="Save" />{:else}<Button label="Start" />{/if}{#each xs as x}<Button label={x} />{/each}</Card>' +
          '<Dialog title="b">{#snippet trigger()}<Button label="Open" />{/snippet}{#snippet footer()}<Button label="Done" />{/snippet}</Dialog>',
      ),
    },
  ],
  invalid: [
    {
      filename: FILE,
      code: component(
        '<Dialog title="a">{#snippet footer()}<Button label="Save" />{/snippet}<Button variant={\'solid\'} label="Reset" /></Dialog>',
      ),
      errors: [{ messageId: 'secondMain' }],
    },
  ],
})

tester.run('danger-last in Svelte markup', dangerLast, {
  valid: [
    {
      filename: FILE,
      code: component(
        '<Inline><Button label="Keep" /><Button tone="danger" label="Delete" /></Inline>',
      ),
    },
  ],
  invalid: [
    {
      filename: FILE,
      code: component(
        '<Inline><Button tone="danger" label="Delete" /><Button label="Keep" /></Inline>',
      ),
      errors: [{ messageId: 'dangerFirst' }],
    },
  ],
})

tester.run('trailing-icon in Svelte markup', trailingIcon, {
  valid: [{ filename: FILE, code: component('<Button trailingIcon="next" label="Continue" />') }],
  invalid: [
    {
      filename: FILE,
      code: component('<Button trailingIcon="delete" label="Delete" />'),
      output: component('<Button icon="delete" label="Delete" />'),
      errors: [{ messageId: 'notTrailing' }],
    },
  ],
})
