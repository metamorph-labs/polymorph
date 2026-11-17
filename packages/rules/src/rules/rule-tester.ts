import { RuleTester } from 'eslint'
import tseslint from 'typescript-eslint'
import { describe, it } from 'vitest'

import type { TokenValues } from '../stylelint/catalogue.js'

// Vitest globals are off, so RuleTester gets the runner explicitly. Otherwise a
// failing case reports as one opaque throw instead of a named test.
RuleTester.describe = describe as unknown as typeof RuleTester.describe
RuleTester.it = it as unknown as typeof RuleTester.it

/** How the repo parses application code: TypeScript, ESM, JSX. */
export const APP_LANGUAGE_OPTIONS = {
  ecmaVersion: 2022,
  sourceType: 'module',
  parser: tseslint.parser,
  parserOptions: { ecmaFeatures: { jsx: true } },
} as const

export function jsxRuleTester(): RuleTester {
  return new RuleTester({ languageOptions: { ...APP_LANGUAGE_OPTIONS } })
}

/** A path under `apps/`, which is what the rules treat as application code. */
export const APP_FILE = 'apps/relay/src/Inbox.tsx'

/**
 * Token values for the tests of a message that names the nearest token.
 *
 * Synthetic on purpose, in the shape `tokenValues` returns. A test of what a
 * message says should not fail because a palette's accent moved. The real
 * catalogue is checked where it is built (`stylelint/catalogue.test.ts`).
 */
export const TEST_VALUES: TokenValues = {
  color: {
    '--pm-bg-app': '#ffffff',
    '--pm-bg-subtle': '#f3f5f7',
    '--pm-bg-surface': '#ffffff',
    '--pm-bg-scrim': 'rgb(9 10 11 / 0.4)',
    '--pm-accent-bg': '#0089ea',
    '--pm-accent-text': '#1176c7',
    '--pm-accent-contrast': '#ffffff',
    '--pm-text-primary': '#090a0b',
    '--pm-text-secondary': '#727375',
    '--pm-text-inverse': '#ffffff',
    '--pm-border-subtle': '#e9ebee',
    '--pm-border-default': '#e3e5e8',
    '--pm-border-strong': '#d5d8da',
    '--pm-danger-solid': '#ea3c3f',
  },
  space: {
    '--pm-space-0': '0px',
    '--pm-space-1': '2px',
    '--pm-space-2': '4px',
    '--pm-space-3': '8px',
    '--pm-space-4': '12px',
    '--pm-space-5': '16px',
    '--pm-space-6': '24px',
    '--pm-space-7': '32px',
    '--pm-space-8': '48px',
    '--pm-space-9': '64px',
    '--pm-space-10': '96px',
  },
  radius: {
    '--pm-radius-none': '0',
    '--pm-radius-sm': '4px',
    '--pm-radius-md': '8px',
    '--pm-radius-lg': '14px',
    '--pm-radius-pill': '9999px',
  },
  text: {
    '--pm-text-xs-size': '0.78125rem',
    '--pm-text-sm-size': '0.875rem',
    '--pm-text-md-size': '1rem',
    '--pm-text-lg-size': '1.25rem',
  },
  size: {
    '--pm-control-height-sm': '32px',
    '--pm-control-height-md': '36px',
    '--pm-control-height-lg': '40px',
    '--pm-icon-size-sm': '14px',
    '--pm-icon-size-md': '16px',
    '--pm-icon-size-lg': '20px',
  },
  duration: {
    '--pm-motion-duration-control': '140ms',
    '--pm-motion-duration-surface': '220ms',
    '--pm-motion-duration-overlay': '260ms',
  },
}
