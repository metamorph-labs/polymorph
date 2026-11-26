import type { Registry } from '@polymorph/registry'

import { commands, Facts, skill, type SkillFile } from './facts'

/** TODO: say what this skill is for. */
export function nativeSkill(registry: Registry, run: string): SkillFile[] {
  const f = new Facts(registry)
  const body = `
# Build a SwiftUI or Compose screen with polymorph

${commands(run, 'card --framework <framework>')}

${f.m('Button')}
`
  return [
    {
      path: 'polymorph-native/SKILL.md',
      contents: skill(
        'polymorph-native',
        'Stub. Use when building a SwiftUI or Compose screen with polymorph.',
        body,
      ),
    },
  ]
}
