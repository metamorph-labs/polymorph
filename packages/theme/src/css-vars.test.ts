import { describe, expect, it } from 'vitest'

import { cssVar, cssVarName, PM_PREFIX } from './css-vars'

describe('cssVarName', () => {
  it('namespaces every token under the --pm- prefix', () => {
    expect(cssVarName('bg.app')).toBe('--pm-bg-app')
    expect(cssVarName('space.4')).toBe(`${PM_PREFIX}space-4`)
  })

  it('kebab-cases camelCase segments so the naming law holds', () => {
    expect(cssVarName('accent.bgHover')).toBe('--pm-accent-bg-hover')
    expect(cssVarName('accent.subtleHover')).toBe('--pm-accent-subtle-hover')
    expect(cssVarName('motion.duration.controlExit')).toBe('--pm-motion-duration-control-exit')
  })

  it('leaves numeric-led step names alone', () => {
    expect(cssVarName('text.3xl')).toBe('--pm-text-3xl')
  })

  it('builds var() references, with an optional fallback', () => {
    expect(cssVar('radius.md')).toBe('var(--pm-radius-md)')
    expect(cssVar('radius.md', '0')).toBe('var(--pm-radius-md, 0)')
  })
})
