import { describe, expect, it } from 'vitest'

import { noAppCss, readStylesheet } from './no-app-css'
import { APP_FILE, jsxRuleTester, TEST_VALUES } from './rule-tester'

jsxRuleTester().run('no-app-css', noAppCss, {
  valid: [
    { filename: APP_FILE, code: `import { Button } from '@polymorph/react-ui'` },
    // The vocabulary's own styles and webfonts are not decisions.
    { filename: APP_FILE, code: `import '@polymorph/react-ui/styles.css'` },
    { filename: APP_FILE, code: `import '@fontsource-variable/inter/index.css'` },
    { filename: APP_FILE, code: `const path = './theme.css'` },
    // The extension is read from the path, not from a query naming a file.
    { filename: APP_FILE, code: `import worker from './worker.js?name=theme.css'` },
  ],

  invalid: [
    {
      filename: APP_FILE,
      code: `import './Inbox.module.css'`,
      errors: [{ messageId: 'stylesheet' }],
    },
    {
      filename: APP_FILE,
      code: `import styles from './Inbox.css'`,
      errors: [{ messageId: 'stylesheet' }],
    },
    {
      filename: APP_FILE,
      code: `await import('./late.css')`,
      errors: [{ messageId: 'stylesheet' }],
    },
    {
      filename: APP_FILE,
      code: `export * from './shared.scss'`,
      errors: [{ messageId: 'stylesheet' }],
    },
    {
      filename: APP_FILE,
      code: `export { a } from './shared.less'`,
      errors: [{ messageId: 'stylesheet' }],
    },
  ],
})

/**
 * What the report says the stylesheet becomes. It reads the file when it is in
 * the project: the seeded stylesheets in `fixtures/stylesheets/` are the three
 * kinds, and a screen beside them imports each.
 */
const SCREEN = 'packages/rules/fixtures/stylesheets/Screen.tsx'

jsxRuleTester().run('no-app-css — what the report names', noAppCss, {
  valid: [],
  invalid: [
    // Spacing, flow and a colour: every rule has a member prop.
    {
      filename: SCREEN,
      options: [{ values: TEST_VALUES }],
      code: `import './spacing.css'`,
      errors: [
        {
          message:
            'Unexpected stylesheet import `./spacing.css`. Its rules are `<Inline gap={4} p={5}>` ' +
            '(rung 1), so the file can go. `color`: a member\'s `tone="…"` or `variant="…"` ' +
            'sets colour (rung 1).',
        },
      ],
    },
    {
      filename: SCREEN,
      code: `import './keyframes.css'`,
      errors: [
        {
          message:
            "Unexpected stylesheet import `./keyframes.css`. Its `@keyframes` are motion, which is the member's own: " +
            '`<Spinner>`, `<Skeleton>` and the overlays animate their states (rung 1).',
        },
      ],
    },
    // Placement no member prop carries: a zone, with the style inline.
    {
      filename: SCREEN,
      code: `import styles from './bespoke.css'`,
      errors: [
        {
          message:
            'Unexpected stylesheet import `./bespoke.css`. `position` and `transform` have no ' +
            'member prop: write them as `style` inside a `<Bespoke reason="…">` zone (rung 4).',
        },
      ],
    },
    // A margin is the parent's gap.
    {
      filename: SCREEN,
      options: [{ values: TEST_VALUES }],
      code: `import './margin.css'`,
      errors: [
        {
          message:
            "Unexpected stylesheet import `./margin.css`. A margin is the parent's spacing: " +
            '`<Stack gap={3}>` around it.',
        },
      ],
    },
    // A rule with no answer of its own gets the general one, never an empty message.
    {
      filename: SCREEN,
      code: `import './wrap.css?inline'`,
      errors: [
        {
          message:
            'Unexpected stylesheet import `./wrap.css?inline`. Spacing becomes `gap={…}` or ' +
            '`p={…}` on `<Stack>`, `<Inline>` or `<Grid>` (rung 1).',
        },
      ],
    },
    // A file it cannot read gets the general answer.
    {
      filename: SCREEN,
      code: `import './missing.css'`,
      errors: [
        {
          message:
            'Unexpected stylesheet import `./missing.css`. Spacing becomes `gap={…}` ' +
            'or `p={…}` on `<Stack>`, `<Inline>` or `<Grid>` (rung 1).',
        },
      ],
    },
    // A package's stylesheet is its component's. Where the file imports the
    // component, the answer is the boundary that hosts it.
    {
      filename: SCREEN,
      code: `import { Grid } from 'some-lib'\nimport 'some-lib/dist/styles.css'\nvoid Grid`,
      errors: [
        {
          message:
            "Unexpected stylesheet import `some-lib/dist/styles.css`. Host the library's " +
            'component in `<ThirdParty library="some-lib" reason="…">` (rung 4). The file that ' +
            'declares it may import this.',
        },
      ],
    },
    // Where it does not, a boundary written alone would host nothing, so none is offered.
    {
      filename: SCREEN,
      code: `import 'some-lib/dist/styles.css'`,
      errors: [
        {
          message:
            'Unexpected stylesheet import `some-lib/dist/styles.css`. It is lifted only in a ' +
            'file that imports a binding from `some-lib` and hosts it in <ThirdParty> (rung 4).',
        },
      ],
    },
    // The package is left out of a report it would take past the limit.
    {
      filename: SCREEN,
      code: `import '@some-publisher/some-long-library-name/dist/styles/theme-default.css'`,
      errors: [
        {
          message:
            'Unexpected stylesheet import ' +
            '`@some-publisher/some-long-library-name/dist/styles/theme-default.css`. It is lifted ' +
            'only in a file that imports a binding from its package and hosts it in <ThirdParty> ' +
            '(rung 4).',
        },
      ],
    },
    // A package that is only a stylesheet has no component to host.
    {
      filename: SCREEN,
      code: `import 'normalize.css'`,
      errors: [
        {
          message:
            'Unexpected stylesheet import `normalize.css`. A stylesheet-only package hosts no ' +
            'component, so no boundary lifts it: the theme styles the page and members carry ' +
            'the rest (rung 1).',
        },
      ],
    },
  ],
})

describe('reading a stylesheet', () => {
  it('reads nested blocks from the inside out, without comments', () => {
    const { declarations, keyframes } = readStylesheet(
      '/* .old { margin: 4px } */\n.a { gap: 8px; .b { padding: 0 12px; } }\n',
    )
    expect(keyframes).toBe(false)
    expect(declarations.map(({ property, value }) => [property, value])).toEqual([
      ['padding', '0 12px'],
      ['gap', '8px'],
    ])
  })

  it('notices keyframes, which are motion', () => {
    expect(readStylesheet('@keyframes x { to { opacity: 1 } }').keyframes).toBe(true)
  })
})
