import { pluginFiles } from '@polymorph/cli'
import { buildRegistry } from '@polymorph/registry'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { READ_TOOL_NAMES, TOOL_NAMES } from './server'

/**
 * The repository's plugin and the tools it names (`packages/cli/src/plugin.ts`).
 *
 * The plugin starts the server read-only, because a plugin's server is not
 * started in a known project. So the review cases a directory's reviewers run
 * may name only the tools a read-only server registers, and every tool the
 * skills name must be one the server has. The law is here because this
 * package owns the server's lists and may import the CLI, which may not import
 * it.
 */

const registry = buildRegistry(resolve(import.meta.dirname, '../../..'))
const files = pluginFiles(registry)

describe('the plugin names the server’s tools', () => {
  it('gives reviewers cases that name only the read-only server’s tools', () => {
    const manifest = files.find((file) => file.path.endsWith('/polymorph/plugin.json'))
    const parsed = JSON.parse(manifest?.contents ?? '{}') as {
      extensions: {
        'com.openai': { review: { test_cases: { positive: { tools_triggered: string }[] } } }
      }
    }
    const named = parsed.extensions['com.openai'].review.test_cases.positive.flatMap((entry) =>
      entry.tools_triggered.split(',').map((tool) => tool.trim()),
    )
    expect(named.length).toBeGreaterThan(0)
    expect(named.filter((tool) => !(READ_TOOL_NAMES as readonly string[]).includes(tool))).toEqual(
      [],
    )
  })

  it('names in its skills only tools the server registers', () => {
    const skills = files.filter((file) => file.path.includes('/skills/'))
    expect(skills.length).toBeGreaterThan(0)
    for (const skill of skills) {
      for (const [, tool] of skill.contents.matchAll(/`([a-z]+(?:_[a-z]+)+)`/g)) {
        expect(TOOL_NAMES as readonly string[], `${skill.path}: ${tool}`).toContain(tool)
      }
    }
  })
})
