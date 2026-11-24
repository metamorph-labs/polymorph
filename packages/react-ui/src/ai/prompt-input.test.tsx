import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { page, userEvent } from 'vitest/browser'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { promptTriggersLaw, type PromptLawProps } from '@polymorph/conformance/prompt-triggers'
import { assertGoverned } from '@polymorph/react'
import {
  appendThemeCSS,
  composeTheme,
  emitThemeCSS,
  exampleQuietSystem,
  exampleVioletPalette,
  resolveTheme,
} from '@polymorph/engine'
import { createAgentBridge } from '@polymorph/engine/agent'
import { agentRegistrations, installTestTheme } from '@polymorph/engine/testing'
import { Combobox } from '../controls/Combobox'
import { Select } from '../controls/Select'
import { tokenColor, tokenLength } from '../controls/token-probe'
import { Dialog } from '../overlays/Dialog'
import { PromptInput, type PromptInputProps, type PromptTrigger } from './PromptInput'

/**
 * PromptInput, in a real browser.
 *
 * The composer's behaviour depends on keys and files, which need a real
 * browser. The tests check that Enter sends and Shift+Enter does not, that an
 * empty prompt cannot be sent, and that a reply in flight turns send into
 * stop. They check that a dropped or pasted file goes through FileUpload's
 * gate to the right handler, and that the field grows with its prompt up to
 * the maximum and no further. Mentions and commands are the law's
 * (`@polymorph/conformance/prompt-triggers`), which this file calls for React;
 * the list's look is checked here against the members it restates.
 */

beforeAll(installTestTheme)

const field = () => screen.getByRole('textbox', { name: 'Message' }) as HTMLTextAreaElement

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * A key an input method is handling, dispatched on `target`: marked `isComposing`, or reported
 * with key code 229 after the composition has ended, as Safari sends the Enter that confirms it.
 */
function inputMethodKey(
  target: HTMLElement,
  key: string,
  how: 'composing' | 'processed',
): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
    isComposing: how === 'composing',
  })
  if (how === 'processed') Object.defineProperty(event, 'keyCode', { value: 229 })
  target.dispatchEvent(event)
  return event
}

describe('the closed surface', () => {
  it('has no style escape hatch', () => {
    assertGoverned<PromptInputProps>(true)
  })
})

describe('sending', () => {
  it('sends on Enter and keeps Shift+Enter as a new line', async () => {
    const onSubmit = vi.fn()
    render(<PromptInput label="Message" onSubmit={onSubmit} />)
    field().focus()
    await userEvent.keyboard('Hello')
    await userEvent.keyboard('{Shift>}{Enter}{/Shift}')
    expect(onSubmit).not.toHaveBeenCalled()
    expect(field().value).toBe('Hello\n')
    await userEvent.keyboard('{Enter}')
    expect(onSubmit).toHaveBeenCalledWith('Hello\n')
  })

  it('sends nothing on a key an input method is handling, Safari’s confirming Enter included', async () => {
    const onSubmit = vi.fn()
    render(<PromptInput label="Message" onSubmit={onSubmit} />)
    field().focus()
    await userEvent.keyboard('にほん')
    for (const how of ['composing', 'processed'] as const) {
      expect(inputMethodKey(field(), 'Enter', how).defaultPrevented, how).toBe(false)
    }
    await sleep(30)
    expect(onSubmit).not.toHaveBeenCalled()
    await userEvent.keyboard('{Enter}')
    expect(onSubmit).toHaveBeenCalledWith('にほん')
  })

  it('does not send an empty prompt from the button or from Enter', async () => {
    const onSubmit = vi.fn()
    render(<PromptInput label="Message" onSubmit={onSubmit} />)
    const send = screen.getByRole('button', { name: 'Send' }) as HTMLButtonElement
    expect(send.disabled).toBe(true)
    field().focus()
    await userEvent.keyboard('   {Enter}')
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('sends from the button too, with the controlled value', async () => {
    const onSubmit = vi.fn()
    render(<PromptInput label="Message" value="A prompt" onChange={() => {}} onSubmit={onSubmit} />)
    await userEvent.click(screen.getByRole('button', { name: 'Send' }))
    expect(onSubmit).toHaveBeenCalledWith('A prompt')
  })

  it('turns send into stop while a reply is arriving, and Enter does nothing', async () => {
    const onSubmit = vi.fn()
    const onStop = vi.fn()
    render(
      <PromptInput
        label="Message"
        defaultValue="next"
        streaming
        onStop={onStop}
        onSubmit={onSubmit}
      />,
    )
    expect(screen.queryByRole('button', { name: 'Send' })).toBeNull()
    field().focus()
    await userEvent.keyboard('{Enter}')
    expect(onSubmit).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Stop' }))
    expect(onStop).toHaveBeenCalledTimes(1)
  })
})

describe('files', () => {
  const pdf = () => new File(['%PDF'], 'spec.pdf', { type: 'application/pdf' })
  const png = () => new File(['png'], 'shot.png', { type: 'image/png' })

  /**
   * A drop or a paste carrying real files, dispatched by hand. Chromium
   * rejects a plain object where the event expects a DataTransfer. The testing
   * library's helper rebuilds the transfer from the object's own properties,
   * and a real DataTransfer has none, so the files are lost.
   */
  function carry(target: Element, type: 'drop' | 'paste', files: File[]) {
    const data = new DataTransfer()
    for (const file of files) data.items.add(file)
    const event = new Event(type, { bubbles: true, cancelable: true })
    Object.defineProperty(event, type === 'drop' ? 'dataTransfer' : 'clipboardData', {
      value: data,
    })
    fireEvent(target, event)
  }

  it('shows the attach button only when the app accepts files', () => {
    render(<PromptInput label="Message" onSubmit={() => {}} />)
    expect(screen.queryByRole('button', { name: 'Attach' })).toBeNull()
  })

  it('gates a drop the way FileUpload gates a pick', () => {
    const onAttach = vi.fn()
    const onReject = vi.fn()
    const { container } = render(
      <PromptInput
        label="Message"
        accept=".pdf"
        onAttach={onAttach}
        onReject={onReject}
        onSubmit={() => {}}
      />,
    )
    const frame = (container.firstElementChild as HTMLElement).firstElementChild as HTMLElement
    carry(frame, 'drop', [pdf(), png()])
    expect(onAttach).toHaveBeenCalledTimes(1)
    expect(onAttach.mock.calls[0]?.[0].map((file: File) => file.name)).toEqual(['spec.pdf'])
    expect(onReject).toHaveBeenCalledTimes(1)
    expect(onReject.mock.calls[0]?.[0]).toEqual([{ file: expect.any(File), reason: 'type' }])
  })

  it('accepts a pasted file and leaves pasted text alone', () => {
    const onAttach = vi.fn()
    render(
      <PromptInput label="Message" onAttach={onAttach} onReject={() => {}} onSubmit={() => {}} />,
    )
    carry(field(), 'paste', [png()])
    expect(onAttach).toHaveBeenCalledTimes(1)
    carry(field(), 'paste', [])
    expect(onAttach).toHaveBeenCalledTimes(1)
  })

  it('lets a chip in the frame be removed by name', async () => {
    const onRemove = vi.fn()
    render(
      <PromptInput
        label="Message"
        attachments={[{ id: 'a', name: 'spec.pdf', size: 1024 }]}
        onAttach={() => {}}
        onReject={() => {}}
        onRemoveAttachment={onRemove}
        onSubmit={() => {}}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Remove spec.pdf' }))
    expect(onRemove).toHaveBeenCalledWith('a')
  })

  it('moves focus to the next chip’s remove control once a chip is removed, else the previous one, else the field', async () => {
    function Held() {
      const [attachments, setAttachments] = useState([
        { id: 'a', name: 'spec.pdf' },
        { id: 'b', name: 'notes.txt' },
        { id: 'c', name: 'shot.png' },
      ])
      return (
        <PromptInput
          label="Message"
          attachments={attachments}
          onAttach={() => {}}
          onReject={() => {}}
          onRemoveAttachment={(id) => setAttachments((was) => was.filter((one) => one.id !== id))}
          onSubmit={() => {}}
        />
      )
    }
    render(<Held />)
    const remove = (name: string) => screen.getByRole('button', { name: `Remove ${name}` })
    remove('notes.txt').focus()
    await userEvent.keyboard('{Enter}')
    await vi.waitFor(() => expect(document.activeElement).toBe(remove('shot.png')))
    await userEvent.keyboard('{Enter}')
    await vi.waitFor(() => expect(document.activeElement).toBe(remove('spec.pdf')))
    await userEvent.keyboard('{Enter}')
    await vi.waitFor(() => expect(document.activeElement).toBe(field()))
  })

  it('counts a chip as content, so send is enabled without text', () => {
    render(
      <PromptInput
        label="Message"
        attachments={[{ id: 'a', name: 'spec.pdf' }]}
        onAttach={() => {}}
        onReject={() => {}}
        onSubmit={() => {}}
      />,
    )
    expect((screen.getByRole('button', { name: 'Send' }) as HTMLButtonElement).disabled).toBe(false)
  })
})

describe('the field', () => {
  it('grows with its prompt and stops at the maximum', async () => {
    render(<PromptInput label="Message" maxRows={4} onSubmit={() => {}} />)
    const oneLine = field().getBoundingClientRect().height
    field().focus()
    await userEvent.keyboard('one{Shift>}{Enter}{/Shift}two{Shift>}{Enter}{/Shift}three')
    const threeLines = field().getBoundingClientRect().height
    expect(threeLines).toBeGreaterThan(oneLine * 2)
    await userEvent.keyboard(
      '{Shift>}{Enter}{/Shift}four{Shift>}{Enter}{/Shift}five{Shift>}{Enter}{/Shift}six{Shift>}{Enter}{/Shift}seven',
    )
    const capped = field().getBoundingClientRect().height
    expect(capped).toBeLessThan(oneLine * 5.5)
    expect(field().scrollHeight).toBeGreaterThan(field().clientHeight)
  })

  it('is named, and the frame shows the ring when it is focused', async () => {
    const { container } = render(<PromptInput label="Message" onSubmit={() => {}} />)
    await userEvent.keyboard('{Tab}')
    expect(document.activeElement).toBe(field())
    const frame = (container.firstElementChild as HTMLElement).firstElementChild as HTMLElement
    expect(getComputedStyle(frame).outlineStyle).toBe('solid')
    expect(getComputedStyle(field()).outlineStyle).toBe('none')
  })

  it('draws focus inside the frame’s edge where the system chooses the field border style', () => {
    // A nested pairing whose system sets `overrides.focus.field`, read by the recipe's style
    // query, as Input's frame reads it through the focus convention.
    const theme = resolveTheme(
      composeTheme(
        {
          ...exampleQuietSystem,
          name: 'example-prompt-border',
          overrides: { focus: { field: 'border' } },
        },
        exampleVioletPalette,
      ),
    )
    appendThemeCSS(emitThemeCSS(theme), theme.name)
    const host = document.createElement('div')
    host.setAttribute('data-system', theme.system)
    host.setAttribute('data-palette', theme.palette)
    document.body.append(host)
    const { container } = render(<PromptInput label="Message" onSubmit={() => {}} />, {
      container: host,
    })
    field().focus({ focusVisible: true } as FocusOptions)
    const frame = (container.firstElementChild as HTMLElement).firstElementChild as HTMLElement

    expect(getComputedStyle(frame).outlineStyle).toBe('solid')
    expect(getComputedStyle(frame).outlineWidth).toBe(theme.tokens.focus.width)
    expect(getComputedStyle(frame).outlineOffset).toBe(`-${theme.tokens.focus.width}`)
    host.remove()
  })
})

describe('the phone minimum font size, below 30rem', () => {
  afterEach(async () => {
    await page.viewport(1280, 800)
  })

  it('gives the field the text-entry floor’s size and line height', async () => {
    await page.viewport(420, 800)
    render(<PromptInput label="Message" onSubmit={() => undefined} />)
    await vi.waitFor(() => {
      expect(getComputedStyle(field()).fontSize).toBe(tokenLength('--pm-text-entry-size'))
    })
  })
})

promptTriggersLaw({
  shell: 'React',
  mount({ props, defaultValue, messages, onChange, onSubmit }) {
    let change: (next: Partial<PromptLawProps>) => void = () => {}
    function Held() {
      const [held, setHeld] = useState(props)
      change = (next) => setHeld((was) => ({ ...was, ...next }))
      return (
        <PromptInput
          label="Message"
          defaultValue={defaultValue}
          messages={messages}
          onChange={onChange}
          onSubmit={onSubmit}
          triggers={held.triggers as PromptTrigger[] | undefined}
          value={held.value}
        />
      )
    }
    render(<Held />)
    return Promise.resolve({ set: (next) => change(next) })
  },
  mountInDialog({ triggers, onOpenChange }) {
    function Held() {
      const [open, setOpen] = useState(true)
      return (
        <Dialog
          title="Compose"
          open={open}
          onOpenChange={(next) => {
            onOpenChange(next)
            setOpen(next)
          }}
        >
          <PromptInput label="Message" triggers={triggers as PromptTrigger[]} onSubmit={() => {}} />
        </Dialog>
      )
    }
    render(<Held />)
    return Promise.resolve()
  },
})

describe('the suggestion list draws what Combobox and Command draw', () => {
  const PEOPLE = [
    { value: 'ada', label: 'Ada Lovelace', description: 'Engineering' },
    { value: 'grace', label: 'Grace Hopper' },
  ]
  const TRIGGERS: PromptTrigger[] = [
    {
      char: '@',
      label: 'People',
      options: PEOPLE.map(({ value, ...option }) => ({ id: value, ...option })),
    },
  ]

  const style = (element: Element | null | undefined) => getComputedStyle(element as Element)

  /** The first element the selector finds, once it is in the document. */
  const found = (selector: string) =>
    vi.waitFor(() => {
      const element = document.querySelector<HTMLElement>(selector)
      expect(element).not.toBeNull()
      return element as HTMLElement
    })

  it('draws its panel and its rows as Combobox’s', async () => {
    render(<Combobox options={PEOPLE} defaultOpen aria-label="Assignee" />)
    render(
      <PromptInput
        label="Message"
        defaultValue="@"
        autoFocus
        triggers={TRIGGERS}
        onSubmit={() => {}}
      />,
    )
    const prompt = await found('[data-prompt-part="suggestions"]')
    const combobox = await found('[data-member="combobox"]:not(:has(input))')
    await found('[data-member="combobox"]:not(:has(input)) [role="option"]')

    const panel = ['backgroundColor', 'borderTopColor', 'borderRadius', 'boxShadow', 'paddingTop']
    for (const property of panel) {
      expect(style(prompt)[property as 'color'], property).toBe(
        style(combobox)[property as 'color'],
      )
    }

    const ours = prompt.querySelectorAll('[role="option"]')
    const theirs = combobox.querySelectorAll('[role="option"]')
    const row = [
      'minHeight',
      'paddingLeft',
      'paddingRight',
      'fontSize',
      'lineHeight',
      'borderRadius',
    ]
    for (const property of [...row, 'columnGap']) {
      expect(style(ours[1])[property as 'color'], property).toBe(
        style(theirs[1])[property as 'color'],
      )
    }
    const description = (option: Element | undefined) =>
      option?.querySelector('span span:last-child')
    expect(style(description(ours[0])).fontSize).toBe(style(description(theirs[0])).fontSize)
  })

  it('draws its active row in the selection family, as Command draws its highlighted row', async () => {
    render(
      <PromptInput
        label="Message"
        defaultValue="@"
        autoFocus
        triggers={TRIGGERS}
        onSubmit={() => {}}
      />,
    )
    // The row's colours follow `stateFeedback`, so the reading waits for the transition.
    // The tokens are Command's highlight (`command.module.css`).
    await vi.waitFor(() => {
      const active = document.querySelector('[data-prompt-part="suggestions"] [data-highlighted]')
      expect(style(active).backgroundColor).toBe(tokenColor('--pm-selection-bg'))
      expect(style(active).color).toBe(tokenColor('--pm-selection-text'))
    })
  })
})

/**
 * An agent and the composer (`design/components/prompt-input.md`, Agent): it fills the prompt as
 * typing does, sends and stops as the one control's two faces do, and removes a chip by its id.
 * The composer's own Buttons and chips are withheld, and the app's controls in its slots are not.
 */
describe('an agent', () => {
  const ATTACHED = [
    { id: 'a', name: 'retry-policy.pdf', size: 184_320 },
    { id: 'b', name: 'screenshot.png', size: 48_210 },
  ]

  it('fills and sends an uncontrolled prompt, which the send clears', async () => {
    const onChange = vi.fn()
    const onSubmit = vi.fn()
    render(<PromptInput label="Message" onChange={onChange} onSubmit={onSubmit} />)
    const bridge = createAgentBridge()
    try {
      const [composer] = bridge.snapshot().members
      expect(composer).toMatchObject({
        member: 'PromptInput',
        name: 'Message',
        state: { value: '', attachments: [], streaming: false, disabled: false },
      })
      const filled = await bridge.act([{ id: composer?.id, action: 'fill', value: 'Why twice?' }])
      expect(filled.results[0]).toMatchObject({
        ok: true,
        changed: { value: { from: '', to: 'Why twice?' } },
      })
      expect(onChange).toHaveBeenLastCalledWith('Why twice?')
      expect(field().value).toBe('Why twice?')
      const sent = await bridge.act([{ id: composer?.id, action: 'submit' }])
      expect(sent.results[0]).toMatchObject({
        ok: true,
        changed: { value: { from: 'Why twice?', to: '' } },
      })
      expect(onSubmit).toHaveBeenCalledWith('Why twice?')
    } finally {
      bridge.dispose()
    }
  })

  it('fills a controlled prompt through the app, which keeps it after the send', async () => {
    const onSubmit = vi.fn()
    function Held() {
      const [value, setValue] = useState('first')
      return <PromptInput label="Message" value={value} onChange={setValue} onSubmit={onSubmit} />
    }
    render(<Held />)
    const bridge = createAgentBridge()
    try {
      const [composer] = bridge.snapshot().members
      const filled = await bridge.act([{ id: composer?.id, action: 'fill', value: 'second' }])
      expect(filled.results[0]).toMatchObject({ ok: true, changed: { value: { to: 'second' } } })
      expect(field().value).toBe('second')
      await bridge.act([{ id: composer?.id, action: 'submit' }])
      expect(onSubmit).toHaveBeenCalledWith('second')
      expect(field().value).toBe('second')
      const cleared = await bridge.act([{ id: composer?.id, action: 'clear' }])
      expect(cleared.results[0]).toMatchObject({ ok: true, changed: { value: { to: '' } } })
    } finally {
      bridge.dispose()
    }
  })

  it('refuses a send the control does not offer, and a stop while nothing arrives', async () => {
    const onSubmit = vi.fn()
    const onStop = vi.fn()
    const { rerender } = render(<PromptInput label="Message" onSubmit={onSubmit} onStop={onStop} />)
    const bridge = createAgentBridge()
    try {
      const [composer] = bridge.snapshot().members
      const refused = async (action: string, words: string) => {
        const { results } = await bridge.act([{ id: composer?.id, action }])
        expect(results[0]).toMatchObject({
          ok: false,
          error: { code: 'failed', message: expect.stringContaining(words) },
        })
      }
      await refused('submit', 'empty')
      await refused('stop', 'nothing to stop')
      rerender(
        <PromptInput
          label="Message"
          defaultValue="Why twice?"
          streaming
          onSubmit={onSubmit}
          onStop={onStop}
        />,
      )
      await refused('submit', 'A reply is arriving')
      expect(onSubmit).not.toHaveBeenCalled()
      expect(onStop).not.toHaveBeenCalled()
      const stopped = await bridge.act([{ id: composer?.id, action: 'stop' }])
      expect(stopped.results[0]).toMatchObject({ ok: true })
      expect(onStop).toHaveBeenCalledTimes(1)
    } finally {
      bridge.dispose()
    }
  })

  it('withholds its own Buttons and chips, and lists the app’s control in its slot', async () => {
    const onRemoveAttachment = vi.fn()
    render(
      <PromptInput
        label="Message"
        defaultValue="Why twice?"
        attachments={ATTACHED}
        onAttach={() => {}}
        onReject={() => {}}
        onRemoveAttachment={onRemoveAttachment}
        leading={
          <Select
            size="sm"
            aria-label="Model"
            defaultValue="fast"
            options={[
              { value: 'fast', label: 'Fast' },
              { value: 'thorough', label: 'Thorough' },
            ]}
          />
        }
        onSubmit={() => {}}
      />,
    )
    const bridge = createAgentBridge()
    try {
      const members = bridge.snapshot().members
      expect(members.map((member) => [member.member, member.name])).toEqual([
        ['PromptInput', 'Message'],
        ['Select', 'Model'],
      ])
      expect(members[0]?.state['attachments']).toEqual([
        { id: 'a', label: 'retry-policy.pdf' },
        { id: 'b', label: 'screenshot.png' },
      ])
      // The attach and send Buttons and each chip's remove Button are registered, and none is
      // reachable.
      const buttons = agentRegistrations().filter(({ member }) => member === 'Button')
      expect(buttons).toHaveLength(4)
      for (const { id } of buttons) {
        const { results } = await bridge.act([{ id, action: 'press' }])
        expect(results[0]).toMatchObject({ ok: false, error: { code: 'unknown-member' } })
      }
      expect(bridge.query({ name: 'Send' })).toEqual([])
      const removed = await bridge.act([{ id: members[0]?.id, action: 'remove', value: 'b' }])
      expect(removed.results[0]).toMatchObject({ ok: true })
      expect(onRemoveAttachment).toHaveBeenCalledWith('b')
    } finally {
      bridge.dispose()
    }
  })

  it('reads an attachment the app gives no removal for as a disabled choice', async () => {
    render(<PromptInput label="Message" attachments={ATTACHED} onSubmit={() => {}} />)
    const bridge = createAgentBridge()
    try {
      const [composer] = bridge.snapshot().members
      expect(composer?.state['attachments']).toEqual([
        { id: 'a', label: 'retry-policy.pdf', disabled: true },
        { id: 'b', label: 'screenshot.png', disabled: true },
      ])
      const { results } = await bridge.act([{ id: composer?.id, action: 'remove', value: 'a' }])
      expect(results[0]).toMatchObject({ ok: false, error: { code: 'invalid-value' } })
    } finally {
      bridge.dispose()
    }
  })
})
