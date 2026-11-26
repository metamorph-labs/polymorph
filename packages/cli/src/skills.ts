/**
 * The texts of the agent skills, in the Agent Skills format
 * (agentskills.io): a directory per skill with a `SKILL.md` whose front
 * matter holds `name` and `description`, and a `references/` directory for
 * what a model reads only when a step sends it there.
 *
 * Each text is a function of the registry and of `run`, the command that
 * reaches the tools (`npx -y @metamorph-labs/polymorph@^<version>`, or a
 * checkout's bin), so a skill always names the release that wrote it. The
 * ladder's rungs and the application rules are read from the registry, not
 * copied into the text. What does not change with the vocabulary (the spec
 * format's outline, each rung's procedure) is in `references/`.
 *
 * The texts are written for a model that has never seen polymorph and has a
 * shell. `agents.test.ts` holds every command they name to the verb list, and
 * each skill to the format's limits.
 */

import type { Registry } from '@polymorph/registry'

import type { SkillFile } from './skills/facts'
import { bridgeSkill } from './skills/bridge'
import { nativeSkill } from './skills/native'
import { rulesSkill } from './skills/rules'
import { runtimeSkill } from './skills/runtime'
import { screenSkill } from './skills/screen'
import { setupSkill } from './skills/setup'
import { themeSkill } from './skills/theme'

export {
  SKILL_NAMES,
  SKILL_USES,
  SkillFactError,
  type SkillFile,
  type SkillName,
} from './skills/facts'

/**
 * Every file of every skill, at its path below a skills directory
 * (`polymorph-screen/SKILL.md`), in the order of `SKILL_NAMES`.
 */
export function skillFiles(registry: Registry, run: string): SkillFile[] {
  return [
    ...screenSkill(registry, run),
    ...rulesSkill(registry, run),
    ...setupSkill(registry, run),
    ...themeSkill(registry, run),
    ...runtimeSkill(registry, run),
    ...bridgeSkill(registry, run),
    ...nativeSkill(registry, run),
  ]
}
