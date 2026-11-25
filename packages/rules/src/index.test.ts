import { describe, expect, it } from 'vitest'

import plugin, { allRules, PLUGIN_NAME, rules, stageOneRules, stageTwoRules } from './index'

describe('@polymorph/rules', () => {
  it('exposes a plugin shape ESLint can consume', () => {
    expect(plugin.meta.name).toBe('@polymorph/rules')
    expect(Object.keys(plugin.rules).length).toBeGreaterThan(0)
  })

  it('gives every rule a schema, a description and message ids', () => {
    for (const [name, rule] of Object.entries(rules)) {
      expect(rule.meta?.docs?.description, `${name} description`).toBeTruthy()
      expect(rule.meta?.schema, `${name} schema`).toBeDefined()
      expect(Object.keys(rule.meta?.messages ?? {}).length, `${name} messages`).toBeGreaterThan(0)
      expect(rule.meta?.type, `${name} type`).toBe('problem')
    }
  })

  it('writes actionable messages, because agents act on them', () => {
    // Agents are primary users. A violation message must tell an agent what to
    // do instead, not only that the code is wrong. A message whose answer
    // depends on the code ends in `{{advice}}`, and `rules/messages.test.ts`
    // checks what it renders to.
    for (const [name, rule] of Object.entries(rules)) {
      for (const [id, message] of Object.entries(rule.meta?.messages ?? {})) {
        const computed = message.includes('{{advice}}') || message.includes('{{instead}}')
        expect(computed || message.length > 60, `${name}/${id} too terse`).toBe(true)
      }
    }
  })

  it('splits the rules into two stages that partition the set', () => {
    const stageOne = Object.keys(stageOneRules)
    const stageTwo = Object.keys(stageTwoRules)
    expect(stageOne).toEqual(['polymorph/no-raw-styles', 'polymorph/no-app-css'])
    expect(stageTwo).toEqual([
      'polymorph/no-raw-interactive',
      'polymorph/no-external-motion',
      'polymorph/no-external-icons',
      'polymorph/no-external-dataviz',
      'polymorph/scoped-token-owners',
      'polymorph/one-opener',
      'polymorph/one-main-button',
      'polymorph/danger-last',
      'polymorph/trailing-icon',
    ])
    expect(new Set([...stageOne, ...stageTwo]).size).toBe(stageOne.length + stageTwo.length)
    expect(Object.keys(allRules).sort()).toEqual([...stageOne, ...stageTwo].sort())
  })

  it('names every configured rule after a rule that exists', () => {
    for (const id of Object.keys(allRules)) {
      const [namespace, name] = id.split('/')
      expect(namespace).toBe(PLUGIN_NAME)
      expect(Object.keys(rules)).toContain(name)
    }
  })
})
