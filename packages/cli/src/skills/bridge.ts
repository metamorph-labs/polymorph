import type { Registry } from '@polymorph/registry'

import { commands, Facts, skill, type SkillFile } from './facts'

/** TODO: say what this skill is for. */
export function bridgeSkill(registry: Registry, run: string): SkillFile[] {
  const f = new Facts(registry)
  const body = `
# Let an agent on the page read and operate the members

${commands(run, 'card --framework <framework>')}

${f.m('Button')}
`
  return [
    {
      path: 'polymorph-agent-bridge/SKILL.md',
      contents: skill(
        'polymorph-agent-bridge',
        'Stub. Use when an agent on the page reads and operates the members.',
        body,
      ),
    },
  ]
}
