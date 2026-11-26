import type { Registry } from '@polymorph/registry'

import { commands, Facts, skill, type SkillFile } from './facts'

/** TODO: say what this skill is for. */
export function runtimeSkill(registry: Registry, run: string): SkillFile[] {
  const f = new Facts(registry)
  const body = `
# Draw a screen a model writes while the product runs

${commands(run, 'card --framework <framework>')}

${f.m('Button')}
`
  return [
    {
      path: 'polymorph-runtime-screen/SKILL.md',
      contents: skill(
        'polymorph-runtime-screen',
        'Stub. Use when a product draws a screen a model writes while it runs.',
        body,
      ),
    },
  ]
}
