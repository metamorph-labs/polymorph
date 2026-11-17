import { describe, expect, it } from 'vitest'

import { mountComponent } from '../mount'
import { ToolCall } from './ToolCall'

/**
 * A call with nothing to open is a row, not a button
 * (`design/components/tool-call.md`), as the React member's test holds it. The
 * member reads whether the caller filled the `output` slot, which this
 * foundation answers with a boolean.
 */

const trigger = (host: HTMLElement) =>
  host.querySelector('[data-member="tool-call"] > button') as HTMLButtonElement

describe('ToolCall', () => {
  it('disables the trigger of a call with no input, no output and no message', async () => {
    const { host } = await mountComponent(ToolCall, { name: 'list_tools', status: 'done' })
    expect(trigger(host).disabled).toBe(true)
  })

  it('enables the trigger of a call with an input or a message', async () => {
    const withInput = await mountComponent(ToolCall, {
      name: 'run',
      status: 'done',
      input: 'pnpm test',
    })
    expect(trigger(withInput.host).disabled).toBe(false)
    const withMessage = await mountComponent(ToolCall, {
      name: 'run',
      status: 'error',
      message: 'The command timed out.',
    })
    expect(trigger(withMessage.host).disabled).toBe(false)
  })
})
