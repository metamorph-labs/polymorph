import { APP_FILE, jsxRuleTester } from './rule-tester'
import { scopedTokenOwners } from './scoped-token-owners'

const options = [
  {
    owners: {
      '--pm-shell-': ['packages/react-ui/src/components/app-shell/**'],
      '--pm-page-': ['packages/react-ui/src/archetypes/**'],
    },
  },
]

const OWNER_FILE = 'packages/react-ui/src/components/app-shell/AppShell.tsx'
const ARCHETYPE_FILE = 'packages/react-ui/src/archetypes/ListPage.tsx'

jsxRuleTester().run('scoped-token-owners', scopedTokenOwners, {
  valid: [
    // Theme-scoped tokens are defined for every screen and any file may use them.
    { filename: APP_FILE, code: `const bg = 'var(--pm-bg-surface)'`, options },
    { filename: OWNER_FILE, code: `const h = '--pm-shell-topbar-height'`, options },
    { filename: ARCHETYPE_FILE, code: 'const p = `--pm-page-padding-x`', options },
    // With no owner map configured, the rule reports nothing instead of guessing.
    { filename: APP_FILE, code: `const h = '--pm-shell-topbar-height'` },
  ],

  invalid: [
    {
      filename: APP_FILE,
      code: `const h = 'var(--pm-shell-topbar-height)'`,
      options,
      errors: [
        {
          message:
            '`--pm-shell-*` belongs to app-shell/, not this file ' +
            '(packages/rules/scoped-token-owners.json). Read a theme-scoped token here, or list ' +
            'the file if it owns the pattern.',
        },
      ],
    },
    {
      filename: APP_FILE,
      code: 'const p = `var(--pm-page-max-width)`',
      options,
      errors: [
        { messageId: 'outOfScope', data: { namespace: '--pm-page-', owner: 'archetypes/' } },
      ],
    },
    // Rendering inside a shell does not give an archetype the shell's tokens.
    {
      filename: ARCHETYPE_FILE,
      code: `const h = '--pm-shell-sidebar-width'`,
      options,
      errors: [
        { messageId: 'outOfScope', data: { namespace: '--pm-shell-', owner: 'app-shell/' } },
      ],
    },
  ],
})
