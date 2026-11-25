import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { RuleTester, type Linter } from 'eslint'
import { describe, expect, it } from 'vitest'

import { allRules, fixableSolidControls, solidSettings, SOLID_VOCABULARY_MODULE } from '../index'
import { verifyCode } from '../verify'
import { noAppCss } from './no-app-css'
import { noExternalDataviz } from './no-external-dataviz'
import { noExternalIcons } from './no-external-icons'
import { noExternalMotion } from './no-external-motion'
import { noRawInteractive } from './no-raw-interactive'
import { noRawStyles } from './no-raw-styles'
import { oneMainButton } from './one-main-button'
import { oneOpener } from './one-opener'
import { trailingIcon } from './trailing-icon'
import { APP_FILE, APP_LANGUAGE_OPTIONS, jsxRuleTester, TEST_VALUES } from './rule-tester'
import { scopedTokenOwners } from './scoped-token-owners'

/**
 * The red rules, reading Solid TSX.
 *
 * Solid writes JSX, so the rules read it with the TSX parser, and a file is
 * Solid when the config's settings say so or when it imports `solid-js`: then
 * `class` and `classList` are class props, `onclick` and `on:click` are
 * handlers, the icon fix imports `Icon` from `@polymorph/solid`, and the
 * control fixes import from `@polymorph/solid-ui`. The fixtures in
 * `fixtures/solid/` are linted through `verify` with `framework: 'solid'`; the
 * cases below run each rule alone, with the settings a Solid config sets.
 */

const FIXTURES = resolve(process.cwd(), 'packages/rules/fixtures/solid')
const read = (name: string) => readFileSync(join(FIXTURES, name), 'utf8')

const OWNERS = { '--pm-shell-': ['packages/recipes/src/archetypes/app-shell.module.css'] }

function lintApp(fixture: string, rules: Linter.RulesRecord): string[] {
  const result = verifyCode(read(fixture), {
    filename: `apps/relay/src/${fixture}`,
    rules,
    framework: 'solid',
  })
  expect(result.fatal, `${fixture}: ${result.fatal}`).toBeNull()
  return [...new Set(result.diagnostics.map((diagnostic) => diagnostic.rule))].sort()
}

describe('the Solid fixtures', () => {
  const withOwners: Linter.RulesRecord = {
    ...allRules,
    'polymorph/scoped-token-owners': ['error', { owners: OWNERS }],
  }

  it('fire every application rule', () => {
    expect(lintApp('app-violations.tsx', withOwners)).toEqual(Object.keys(allRules).sort())
  })

  it('pass the lawful screen', () => {
    expect(lintApp('app-clean.tsx', allRules)).toEqual([])
  })

  it('pass a declared <Bespoke> zone, because rung 4 is lawful', () => {
    expect(lintApp('app-bespoke.tsx', allRules)).toEqual([])
  })

  it('pass a declared <ThirdParty> boundary around another library’s component', () => {
    expect(lintApp('app-third-party.tsx', allRules)).toEqual([])
  })
})

RuleTester.describe = describe as unknown as typeof RuleTester.describe
RuleTester.it = it as unknown as typeof RuleTester.it

/** The TSX parser, with the settings a Solid app's config sets. */
const tester = new RuleTester({
  languageOptions: { ...APP_LANGUAGE_OPTIONS },
  settings: solidSettings,
})

const FILE = APP_FILE

/** `screen` as a component in a file that imports the members it names. */
const solid = (screen: string, imports = "import { Button, Card } from '@polymorph/solid-ui'") =>
  `${imports}\nexport const A = () => ${screen}`

const FIXES = [{ vocabulary: SOLID_VOCABULARY_MODULE }]

tester.run('no-raw-styles in Solid TSX', noRawStyles, {
  valid: [
    { filename: FILE, code: solid('<Button label="Go" />') },
    {
      filename: FILE,
      code: solid(
        '<Bespoke reason="a one-off"><div class="promo" classList={{ on }} style="padding: 12px" /></Bespoke>',
        "import { Bespoke } from '@polymorph/solid-ui'",
      ),
    },
    // Another library's component reads its own `class`.
    { filename: FILE, code: solid('<Dropdown class="primary" />') },
  ],
  invalid: [
    {
      filename: FILE,
      code: solid('<Button class="wide" label="Go" />'),
      output: solid('<Button label="Go" />'),
      errors: [{ messageId: 'deadProp', data: { prop: 'class', component: 'Button' } }],
    },
    {
      filename: FILE,
      code: solid('<Card classList={{ wide: true }} />'),
      output: solid('<Card />'),
      errors: [{ messageId: 'deadProp', data: { prop: 'classList', component: 'Card' } }],
    },
    {
      // A parameter called `Card` is whatever was passed in.
      filename: FILE,
      code: 'import { Card } from \'@polymorph/solid-ui\'\nexport function Row({ Card }) { return <Card class="wide" /> }',
      errors: [
        {
          message:
            'Unexpected `class` on <Card>, a name the vocabulary governs. Members take no `class`: set the member\'s own `variant="…"`, `tone="…"` or `size="…"` (rung 1).',
        },
      ],
    },
    {
      filename: FILE,
      code: solid('<p class="text-sm text-gray-500" />'),
      errors: [
        {
          message:
            'Unexpected `class` on <p>. `text-sm text-gray-500` reads as `<Text size="sm" tone="secondary">` (rung 1).',
        },
      ],
    },
    {
      filename: FILE,
      code: solid(`<div classList={{ 'flex gap-2': true, 'p-4': open() }} />`),
      options: [{ values: TEST_VALUES }],
      errors: [
        {
          message:
            'Unexpected `classList` on <div>. `flex gap-2 p-4` reads as `<Inline gap={3} p={5}>` (rung 1). One-off styling goes in a `<Bespoke reason="…">` zone.',
        },
      ],
    },
    {
      // A style string is read declaration by declaration, and its raw values
      // are not reported a second time.
      filename: FILE,
      code: solid('<div style="display: flex; gap: 12px" />'),
      options: [{ values: TEST_VALUES }],
      errors: [
        {
          message:
            'Unexpected `style` on <div>. `display` and `gap` are `<Inline gap={4}>` (rung 1).',
        },
      ],
    },
    {
      // A style object's kebab-case keys are its CSS properties.
      filename: FILE,
      code: solid(`<div style={{ 'padding-top': '12px' }} />`),
      options: [{ values: TEST_VALUES }],
      errors: [
        { message: 'Unexpected `style` on <div>. `padding-top` is `<Stack py={4}>` (rung 1).' },
        {
          message:
            'Unexpected length `12px`. It is space step 4 (`--pm-space-4`): write `py={4}` on `<Stack>`, `<Inline>` or `<Grid>`.',
        },
      ],
    },
  ],
})

tester.run('no-raw-interactive in Solid TSX', noRawInteractive, {
  valid: [
    { filename: FILE, code: solid('<Button label="Save" onClick={save} />') },
    { filename: FILE, code: solid('<a href="/inbox">Inbox</a>') },
  ],
  invalid: [
    {
      filename: FILE,
      code: solid('<div onclick={open}>Open</div>'),
      errors: [
        {
          message:
            'Unexpected `onclick` on <div>. A clickable <div> has no control\'s states or keyboard path: use `<Button variant="ghost" label="…">` (rung 1), or a `<Bespoke reason="…">` zone.',
        },
      ],
    },
    {
      filename: FILE,
      code: solid('<li on:click={open}>One</li>'),
      errors: [{ messageId: 'handledElement' }],
    },
    {
      filename: FILE,
      code: solid('<a href="/x" oncapture:click={track}>x</a>'),
      errors: [
        {
          message:
            'Unexpected `oncapture:click` on <a>. A link that also runs code is still `<Link href="…">` (rung 1); work that changes data is a `<Button>`.',
        },
      ],
    },
    {
      // The fix imports the member from the Solid vocabulary.
      filename: FILE,
      options: FIXES,
      code: 'import { Stack } from \'@polymorph/solid-ui\'\nexport const A = () => <Stack><button type="button" onClick={go}>Go</button></Stack>',
      output:
        'import { Stack, Button } from \'@polymorph/solid-ui\'\nexport const A = () => <Stack><Button label="Go" onClick={go} /></Stack>',
      errors: [{ messageId: 'rawButton' }],
    },
    {
      // A `<label for>` names its checkbox, as `htmlFor` does in React.
      filename: FILE,
      options: FIXES,
      code: solid(
        '<div>\n  <input type="checkbox" id="terms" checked={on()} />\n  <label for="terms">Accept terms</label>\n</div>',
      ),
      output: solid(
        '<div>\n  <Checkbox label="Accept terms" id="terms" checked={on()} />\n</div>',
        "import { Button, Card, Checkbox } from '@polymorph/solid-ui'",
      ),
      errors: [{ messageId: 'rawInput' }],
    },
    {
      // A raw `<textarea>`'s `onChange` is the native change event in Solid,
      // so no rewrite keeps its meaning.
      filename: FILE,
      options: FIXES,
      code: solid('<textarea value={note()} onChange={(e) => setNote(e.target.value)} />'),
      output: null,
      errors: [{ messageId: 'rawTextarea' }],
    },
  ],
})

describe('the Solid file, recognised', () => {
  const textarea = '<textarea value={note} onChange={(e) => setNote(e.target.value)} />'

  it('by an import from solid-js, without the settings', () => {
    const code = `import { createSignal } from 'solid-js'\nexport const A = () => ${textarea}`
    const [report] = verifyCode(code, { filename: FILE }).diagnostics
    expect(report?.fix).toBeNull()
  })

  it('and a React file, which imports nothing Solid, gets the React fix', () => {
    const code = `export const A = () => ${textarea}`
    const [report] = verifyCode(code, { filename: FILE }).diagnostics
    expect(report?.fix).not.toBeNull()
  })
})

tester.run('no-external-icons in Solid TSX', noExternalIcons, {
  valid: [
    {
      filename: FILE,
      code: solid('<Icon name="delete" />', "import { Icon } from '@polymorph/solid'"),
    },
  ],
  invalid: [
    {
      filename: FILE,
      code: 'import { Trash2 } from \'lucide-solid\'\nexport const A = () => <Trash2 aria-label="Delete" />',
      output:
        'import { Icon } from \'@polymorph/solid\'\nexport const A = () => <Icon name="delete" label="Delete" />',
      errors: [
        {
          message:
            'Unexpected icon import `lucide-solid`. `Trash2` is `<Icon name="delete" />` (rung 1). The fix rewrites it.',
        },
      ],
    },
    {
      // `Icon` joins an existing import of the Solid vocabulary.
      filename: FILE,
      code: "import { Trash2 } from 'lucide-solid'\nimport { Card } from '@polymorph/solid-ui'\nexport const A = () => <Card><Trash2 /></Card>",
      output:
        'import { Card, Icon } from \'@polymorph/solid-ui\'\nexport const A = () => <Card><Icon name="delete" /></Card>',
      errors: [{ messageId: 'iconImport' }],
    },
    {
      // The React package in a Solid file is reported and left unchanged.
      filename: FILE,
      code: "import { Trash2 } from 'lucide-react'\nexport const A = () => <Trash2 />",
      output: null,
      errors: [{ messageId: 'iconImport' }],
    },
    {
      filename: FILE,
      code: "import { Icon } from 'solid-heroicons'\nexport const A = () => <Icon />",
      errors: [{ messageId: 'iconImport' }],
    },
  ],
})

tester.run('no-external-motion in Solid TSX', noExternalMotion, {
  valid: [{ filename: FILE, code: solid('<Card />') }],
  invalid: [
    {
      filename: FILE,
      code: "import { Motion } from 'solid-motionone'\nexport const A = () => <Motion.div animate={{ opacity: 1 }} />",
      errors: [
        {
          message:
            'Unexpected motion library `solid-motionone`. `Motion.div` animating opacity is an entrance and exit: `<Dialog>`, `<Drawer>`, `<Popover>` and `<Toast>` animate their own (rung 1).',
        },
      ],
    },
    {
      filename: FILE,
      code: 'import { Transition } from \'solid-transition-group\'\nexport const A = () => <Transition name="fade"><p>a</p></Transition>',
      errors: [{ messageId: 'motionImport' }],
    },
  ],
})

tester.run('no-external-dataviz in Solid TSX', noExternalDataviz, {
  valid: [{ filename: FILE, code: solid('<Card />') }],
  invalid: [
    {
      filename: FILE,
      code: "import { Line } from 'solid-chartjs'\nexport const A = () => <Line data={data} />",
      errors: [
        {
          message:
            'Unexpected charting import `solid-chartjs`. `Line` is `<LineChart data={…} series={…}>` (rung 1). A chart no member draws goes in a `<Bespoke reason="…">` zone (rung 4).',
        },
      ],
    },
  ],
})

tester.run('no-app-css in Solid TSX', noAppCss, {
  valid: [{ filename: FILE, code: "import '@polymorph/solid-ui/styles.css'" }],
  invalid: [{ filename: FILE, code: "import './row.css'", errors: [{ messageId: 'stylesheet' }] }],
})

tester.run('scoped-token-owners in Solid TSX', scopedTokenOwners, {
  valid: [],
  invalid: [
    {
      filename: FILE,
      code: solid(`<div style="height: var(--pm-shell-topbar-height)" />`),
      options: [{ owners: OWNERS }],
      errors: [{ messageId: 'outOfScope' }],
    },
  ],
})

tester.run('one-opener in Solid TSX', oneOpener, {
  valid: [{ filename: FILE, code: solid('<PageHeader title="a" />') }],
  invalid: [
    {
      filename: FILE,
      code: solid('<><Hero title="a" /><PageHeader title="b" /></>'),
      errors: [{ messageId: 'bothOpeners' }],
    },
  ],
})

describe('a Solid config', () => {
  it('switches the control fixes on with the Solid vocabulary', () => {
    expect(fixableSolidControls).toEqual({
      'polymorph/no-raw-interactive': ['error', { vocabulary: '@polymorph/solid-ui' }],
    })
  })

  it('is what verify applies for framework: solid', () => {
    const code = 'export const A = () => <button type="button" onClick={go}>Go</button>'
    const [report] = verifyCode(code, { filename: FILE, framework: 'solid' }).diagnostics
    expect(report?.fix?.text).toContain("import { Button } from '@polymorph/solid-ui'")
  })
})

jsxRuleTester().run('no-raw-styles in React TSX, as before', noRawStyles, {
  // A React file reads `class` as it did, so no React code fails that passed.
  valid: [{ filename: FILE, code: 'export const A = () => <div class="flex" />' }],
  invalid: [
    {
      filename: FILE,
      code: 'export const A = () => <div className="flex" />',
      errors: [{ messageId: 'className' }],
    },
  ],
})

jsxRuleTester().run('no-raw-interactive in React TSX, as before', noRawInteractive, {
  valid: [{ filename: FILE, code: 'export const A = () => <div onclick={go} />' }],
  invalid: [
    {
      filename: FILE,
      code: 'export const A = () => <div onClick={go} />',
      errors: [{ messageId: 'handledElement' }],
    },
  ],
})

tester.run('one-main-button in Solid TSX', oneMainButton, {
  valid: [
    {
      filename: FILE,
      code: solid(
        '<Card title="a"><Show when={saved()} fallback={<Button label="Save" />}><Button variant="outline" tone="neutral" label="Publish" /></Show></Card>',
      ),
    },
  ],
  invalid: [
    {
      filename: FILE,
      code: solid('<Card title="a"><Button label="Save" /><Button label="Publish" /></Card>'),
      errors: [{ messageId: 'secondMain' }],
    },
  ],
})

tester.run('trailing-icon in Solid TSX', trailingIcon, {
  valid: [{ filename: FILE, code: solid('<Button trailingIcon="next" label="Continue" />') }],
  invalid: [
    {
      filename: FILE,
      code: solid('<Button trailingIcon="delete" label="Delete" />'),
      output: solid('<Button icon="delete" label="Delete" />'),
      errors: [{ messageId: 'notTrailing' }],
    },
  ],
})
