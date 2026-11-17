import { resolve } from 'node:path'

import { Linter } from 'eslint'
import { describe, expect, it } from 'vitest'

import { jsxRuleTester } from './rule-tester'
import { vendorableImports } from './vendorable-imports'

/**
 * Tests that the packaging-boundary rule reports violations.
 *
 * Every case below is a realistic import: the cross-tier relative imports a
 * monorepo makes easy, the `design/` reads the motion engine makes from
 * `packages/engine` (where they are lawful), and the deep import into workspace
 * source that is the obvious wrong fix for both.
 */

const CWD = resolve(import.meta.dirname, '../../../..')
const COMPONENT = resolve(CWD, 'packages/react-ui/src/controls/Button.tsx')
const FIXTURE = resolve(CWD, 'packages/react-ui/src/controls/button.states.tsx')

jsxRuleTester().run('vendorable-imports', vendorableImports, {
  valid: [
    // The boundary itself, the engine and the React foundation, and their
    // published subpaths.
    { filename: COMPONENT, code: `import { Icon } from '@polymorph/react'` },
    { filename: COMPONENT, code: `import { MotionSurface } from '@polymorph/react/motion'` },
    { filename: COMPONENT, code: `import { lawfulCells } from '@polymorph/engine'` },
    { filename: COMPONENT, code: `import { resolveBinding } from '@polymorph/engine/motion'` },
    { filename: FIXTURE, code: `import { installTestTheme } from '@polymorph/engine/testing'` },
    // Third-party packages are installed as dependencies, which the registry's
    // dependency closure computes.
    { filename: COMPONENT, code: `import * as Dialog from '@radix-ui/react-dialog'` },
    { filename: COMPONENT, code: `import { useState } from 'react'` },
    // Inside the tree: a component that composes another component gets that
    // component copied alongside it.
    { filename: COMPONENT, code: `import { Kbd } from '../structure/Kbd'` },
    { filename: COMPONENT, code: `import styles from './button.module.css'` },
    { filename: FIXTURE, code: `export { states } from './button.states'` },
  ],

  invalid: [
    {
      // The most common case. It works in a monorepo and resolves to nothing
      // in the repository the file is copied into.
      filename: COMPONENT,
      code: `import { dataAttrs } from '../../../engine/src/conventions/attrs'`,
      errors: [
        {
          message:
            'Import `../../../engine/src/conventions/attrs` escapes the vendorable tree, so it ' +
            'resolves to nothing once copied. Import it from `@polymorph/react`, which ' +
            're-exports the engine and the theme.',
        },
      ],
    },
    {
      // The design directory is not published and is not copied.
      filename: COMPONENT,
      code: `import icons from '../../../../design/icons.json'`,
      errors: [{ messageId: 'escapes' }],
    },
    {
      // The obvious wrong fix for the two above: the same file, imported by
      // package name. It resolves in the workspace and nowhere else.
      filename: COMPONENT,
      code: `import { dataAttrs } from '@polymorph/engine/src/conventions/attrs'`,
      errors: [
        {
          message:
            'Import `@polymorph/engine/src/conventions/attrs` reaches into a package’s source. ' +
            'Import `@polymorph/engine` or a published subpath of it.',
        },
      ],
    },
    {
      filename: COMPONENT,
      code: `import { Icon } from '@polymorph/react/src/icon/Icon'`,
      errors: [{ messageId: 'deep' }],
    },
    {
      // Correct inside this monorepo, wrong once vendored. A consumer installs
      // the engine, which bundles the theme package, and a vendored file that
      // imported the theme package directly would make them install it too.
      filename: COMPONENT,
      code: `import { DATA_ATTRS } from '@polymorph/theme'`,
      errors: [
        {
          message:
            'Import `@polymorph/theme` is not in the boundary a consumer installs. Import it from ' +
            '`@polymorph/react`, which re-exports the engine and the theme.',
        },
      ],
    },
    {
      filename: COMPONENT,
      code: `export { cssVar } from '@polymorph/theme'`,
      errors: [{ messageId: 'internal' }],
    },
    {
      // The rules and the registry are dev-time tools. A component that
      // imported either would put a linter or a generator in a consumer's app.
      filename: COMPONENT,
      code: `import { RULE_CLIMB } from '@polymorph/rules/ladder'`,
      errors: [{ messageId: 'internal' }],
    },
    {
      filename: COMPONENT,
      code: `import { plugin } from '@polymorph/rules'`,
      errors: [{ messageId: 'internal' }],
    },
    {
      filename: COMPONENT,
      code: `import { buildRegistry } from '@polymorph/registry'`,
      errors: [{ messageId: 'internal' }],
    },
    {
      filename: COMPONENT,
      code: `export * from '../../../registry/src/index'`,
      errors: [{ messageId: 'escapes' }],
    },
    {
      // The vocabulary the file was copied out of. A vendoring consumer does
      // not install it, and the file's siblings are copied alongside it.
      filename: COMPONENT,
      code: `import { Kbd } from '@polymorph/react-ui'`,
      errors: [
        {
          message:
            'Import `@polymorph/react-ui` is not in the boundary a consumer installs. Import the ' +
            'member by its relative path; it is copied with this file.',
        },
      ],
    },
    {
      filename: COMPONENT,
      code: `import { Button } from '@polymorph/react-ui/identity'`,
      errors: [{ messageId: 'internal' }],
    },
    {
      // The spec package, the CLI and the MCP server are dev-time tools, like
      // the rules and the registry.
      filename: COMPONENT,
      code: `import { SCREEN_SHAPE } from '@polymorph/spec'`,
      errors: [{ messageId: 'internal' }],
    },
    {
      filename: COMPONENT,
      code: `import { readManifest } from '@polymorph/cli'`,
      errors: [{ messageId: 'internal' }],
    },
    {
      filename: COMPONENT,
      code: `import { createServer } from '@polymorph/mcp'`,
      errors: [{ messageId: 'internal' }],
    },
  ],
})

describe('the boundary message', () => {
  it('removes a dev-time tool, which nothing at runtime replaces', () => {
    // A linter, a registry or a CLI has no runtime part a component could
    // import from somewhere else, so the answer is to remove the import.
    const messages = new Linter().verify(
      `import { plugin } from '@polymorph/rules'`,
      [
        {
          files: ['**/*.tsx'],
          plugins: { polymorph: { rules: { 'vendorable-imports': vendorableImports } } },
          rules: { 'polymorph/vendorable-imports': 'error' },
        },
      ],
      COMPONENT,
    )
    expect(messages[0]?.message).toBe(
      'Import `@polymorph/rules` is not in the boundary a consumer installs. It is a dev-time ' +
        'tool, which no component uses at runtime: remove the import.',
    )
  })
})
