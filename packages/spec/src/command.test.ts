import { describe, expect, it } from 'vitest'

import { emitCommand } from './command'

/** The command over `argv`, with a registry that cannot be built: its exit code and what it said. */
async function refusal(argv: string[]): Promise<{ code: number; said: string }> {
  const said: string[] = []
  const code = await emitCommand({
    registry: () => {
      throw new Error('the registry was built')
    },
    source: '/nowhere',
    cwd: '/nowhere',
    argv,
    print: (text) => said.push(text),
    complain: (line) => said.push(line),
  })
  return { code, said: said.join('\n') }
}

describe('emit, as a command', () => {
  // Building the registry from a tree takes seconds, and these answers need none of it.
  it('refuses what the arguments alone decide without building the registry', async () => {
    const usage = await refusal([])
    expect(usage.code).toBe(1)
    expect(usage.said).toContain('usage: pnpm emit')

    const extension = await refusal(['inbox.json', 'Inbox.vue', '--framework', 'solid'])
    expect(extension.code).toBe(1)
    expect(extension.said).toContain('--framework solid writes a .tsx file')

    const elements = await refusal(['inbox.json', 'inbox.html'])
    expect(elements.code).toBe(1)
    expect(elements.said).toContain('usage: pnpm emit')

    const unknown = await refusal(['inbox.json', '--framework', 'ember'])
    expect(unknown.code).toBe(1)
  })
})
