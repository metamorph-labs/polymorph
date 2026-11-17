import { beforeAll, describe, expect, it, vi } from 'vitest'

import { createAgentBridge } from '@polymorph/engine/agent'
import { installTestTheme } from '@polymorph/engine/testing'

import { mount } from '../mount'
import ToolCall from './ToolCall'

/**
 * A call with nothing to open is a row, not a button
 * (`design/components/tool-call.md`), as the React member's test holds it. The
 * member reads whether the caller filled the `output` slot, which this
 * foundation answers with a boolean.
 */

beforeAll(installTestTheme)

const trigger = (host: HTMLElement) =>
  host.querySelector('[data-member="tool-call"] > button') as HTMLButtonElement

describe('a call with no input, no output and no message', () => {
  it('has a disabled trigger, so focus never lands on a button that does nothing', async () => {
    const { host } = await mount(() => <ToolCall name="list_tools" status="done" />)
    expect(trigger(host).disabled).toBe(true)
  })
})

describe('a call with something to open', () => {
  it('has an enabled trigger for an output', async () => {
    const { host } = await mount(() => (
      <ToolCall name="read_file" status="done" output={<p>42 lines</p>} />
    ))
    expect(trigger(host).disabled).toBe(false)
  })

  it('has an enabled trigger for an input or a message', async () => {
    const withInput = await mount(() => <ToolCall name="run" status="done" input="pnpm test" />)
    expect(trigger(withInput.host).disabled).toBe(false)
    const withMessage = await mount(() => (
      <ToolCall name="run" status="error" message="The command timed out." />
    ))
    expect(trigger(withMessage.host).disabled).toBe(false)
  })
})

describe('an agent', () => {
  // The collapsible keeps a closed call's details in the document, marked `hidden`, where the
  // React member removes them. A person sees neither, so an agent is given neither.
  it('lists the input tree of an open call, and not of a closed one', async () => {
    const { host } = await mount(() => (
      <ToolCall name="read_file" status="done" input={{ path: 'src/a.ts' }} />
    ))
    const bridge = createAgentBridge()
    try {
      const listed = () => bridge.snapshot().members.map((member) => member.member)
      expect(listed()).toEqual(['ToolCall'])
      trigger(host).click()
      await vi.waitFor(() => expect(listed()).toEqual(['ToolCall', 'JsonTree']))
      trigger(host).click()
      await vi.waitFor(() => expect(listed()).toEqual(['ToolCall']))
    } finally {
      bridge.dispose()
    }
  })
})
