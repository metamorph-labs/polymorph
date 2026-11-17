import { render, screen } from '@testing-library/react'
import { createElement, createRef } from 'react'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { serverPassed } from '@polymorph/conformance/server-passed'
import { assertGoverned } from '@polymorph/react'
import { createAgentBridge } from '@polymorph/engine/agent'
import { installTestTheme } from '@polymorph/engine/testing'
import { Checkbox } from './Checkbox'
import { FormField, type FormFieldProps } from './FormField'
import { Input } from './Input'
import { Link } from './Link'
import { Select, type SelectOption } from './Select'
import { Switch } from './Switch'
import { Textarea } from './Textarea'
import { tokenColor } from './token-probe'

/**
 * FormField exists for the wiring, so these tests check the wiring. They test through the
 * *accessible* surface (`getByRole(…, { description })`, accessible names) rather than by reading
 * id strings back, because a matching pair of ids that a screen reader does not connect is exactly
 * the bug this component prevents.
 */

const PRIORITIES: SelectOption[] = [
  { value: 'urgent', label: 'Urgent' },
  { value: 'normal', label: 'Normal' },
]

beforeAll(installTestTheme)

/** RTL's own container. It is attached to the body for the cascade, and RTL cleans it up. */
function mount(node: React.ReactElement): HTMLElement {
  return render(node).container.firstElementChild as HTMLElement
}

describe('the closed surface', () => {
  it('has no style escape hatch', () => {
    assertGoverned<FormFieldProps>(true)
  })
})

/**
 * With `align-items: flex-start` on the field, a text input under a full-width label shrinks to
 * about 140px and leaves the rest of the field blank. This only shows in a wide form. In a form,
 * the field sets a control's width, not the control.
 */
describe('a control fills the field it was given', () => {
  const WIDE = 640

  function inWideColumn(node: React.ReactElement): HTMLElement {
    const { container } = render(node)
    const field = container.firstElementChild as HTMLElement
    // The field takes its width from the page. The test simulates the page, so it sizes the
    // *parent* and leaves the field alone.
    ;(container as HTMLElement).style.inlineSize = `${WIDE}px`
    return field
  }

  it('stretches an Input to the width of the field', () => {
    const field = inWideColumn(
      <FormField label="Subject">
        <Input />
      </FormField>,
    )
    expect(field.getBoundingClientRect().width).toBeCloseTo(WIDE, 0)
    const input = screen.getByRole('textbox')
    // The styled container, not the bare `<input>`, because the container has the border.
    const box = input.parentElement as HTMLElement
    expect(box.getBoundingClientRect().width).toBeCloseTo(WIDE, 0)
  })

  it('stretches a Select the same way', () => {
    inWideColumn(
      <FormField label="Priority">
        <Select options={PRIORITIES} />
      </FormField>,
    )
    expect(screen.getByRole('combobox').getBoundingClientRect().width).toBeCloseTo(WIDE, 0)
  })

  it('leaves a row-labelled control at its own width', () => {
    // A Switch *is* a row: label, control and hit target together. Stretching it
    // would put the label at one end of the field and make the gap clickable.
    const field = inWideColumn(
      <FormField label="Notify the requester">
        <Switch />
      </FormField>,
    )
    const row = screen.getByRole('switch').closest('label') ?? screen.getByRole('switch')
    expect(field.getBoundingClientRect().width).toBeCloseTo(WIDE, 0)
    expect(row.getBoundingClientRect().width).toBeLessThan(WIDE / 2)
  })
})

describe('labelling', () => {
  it('joins its label to the control it wraps', () => {
    mount(
      <FormField label="Subject">
        <Input />
      </FormField>,
    )
    expect(screen.getByLabelText('Subject')).toBe(screen.getByRole('textbox'))
  })

  it('binds to a Select trigger too, which is a button rather than an input', () => {
    mount(
      <FormField label="Priority">
        <Select options={PRIORITIES} placeholder="Choose" />
      </FormField>,
    )
    expect(screen.getByRole('combobox', { name: 'Priority' })).toBeTruthy()
  })

  it('gives a Checkbox its own row label instead of a second one', () => {
    mount(
      <FormField label="Email me about replies">
        <Checkbox />
      </FormField>,
    )
    expect(screen.getByRole('checkbox', { name: 'Email me about replies' })).toBeTruthy()
    // One label element, not two. The row has it, so the field must not add one.
    expect(document.querySelectorAll('label')).toHaveLength(1)
  })

  it('does the same for a Switch', () => {
    mount(
      <FormField label="Desktop notifications">
        <Switch />
      </FormField>,
    )
    expect(screen.getByRole('switch', { name: 'Desktop notifications' })).toBeTruthy()
    expect(document.querySelectorAll('label')).toHaveLength(1)
  })

  it('wires a control a server component passed, and reads its kind', () => {
    // A client member receives such an element as a lazy reference, and the
    // type of one that names a client component as another (`useSupplied`).
    mount(
      <FormField label="Subject" description="A short summary.">
        {serverPassed(createElement(serverPassed(Input), {}))}
      </FormField>,
    )
    expect(screen.getByLabelText('Subject')).toBe(
      screen.getByRole('textbox', { description: 'A short summary.' }),
    )

    mount(
      <FormField label="Notify me">
        {serverPassed(createElement(serverPassed(Switch), {}))}
      </FormField>,
    )
    expect(screen.getByRole('switch', { name: 'Notify me' })).toBeTruthy()
    expect(screen.getAllByText('Notify me')).toHaveLength(1)
  })

  it('uses a supplied id as the control’s own, and derives the message ids from it', () => {
    mount(
      <FormField id="priority" label="Priority" error="Pick a priority.">
        <Input />
      </FormField>,
    )
    const input = screen.getByRole('textbox')
    expect(input.id).toBe('priority')
    expect(input.getAttribute('aria-describedby')).toBe('priority-error')
    expect(document.getElementById('priority-error')?.textContent).toContain('Pick a priority.')
  })

  it('generates ids that do not collide between two fields with the same label', () => {
    render(
      <>
        <FormField label="Subject">
          <Input />
        </FormField>
        <FormField label="Subject">
          <Input />
        </FormField>
      </>,
    )
    const [first, second] = screen.getAllByRole('textbox') as HTMLInputElement[]
    expect(first?.id).not.toBe(second?.id)
    expect(first?.id).toBeTruthy()
  })
})

describe('description and error', () => {
  it('describes the control with its help text', () => {
    mount(
      <FormField label="Subject" description="One line, as the customer would say it.">
        <Input />
      </FormField>,
    )
    expect(
      screen.getByRole('textbox', { description: 'One line, as the customer would say it.' }),
    ).toBeTruthy()
  })

  it('turns an error into the description, and marks the field invalid everywhere', () => {
    const field = mount(
      <FormField label="Subject" error="A subject is required.">
        <Input />
      </FormField>,
    )
    expect(field.dataset['invalid']).toBe('')
    const input = screen.getByRole('textbox', { description: 'A subject is required.' })
    expect(input.getAttribute('aria-invalid')).toBe('true')
  })

  it('replaces the description rather than adding to it', () => {
    mount(
      <FormField
        label="Subject"
        description="One line, as the customer would say it."
        error="A subject is required."
      >
        <Input />
      </FormField>,
    )
    expect(screen.queryByText('One line, as the customer would say it.')).toBeNull()
    // The description's id is not left dangling in `aria-describedby`, where screen readers would
    // announce nothing for it.
    expect(screen.getByRole('textbox', { description: 'A subject is required.' })).toBeTruthy()
  })

  it('reaches a Checkbox and a Select with the same wiring', () => {
    render(
      <FormField label="Accept the terms" error="You have to accept the terms.">
        <Checkbox />
      </FormField>,
    )
    const box = screen.getByRole('checkbox', { description: 'You have to accept the terms.' })
    expect(box.getAttribute('aria-invalid')).toBe('true')

    render(
      <FormField label="Priority" error="Pick a priority.">
        <Select options={PRIORITIES} placeholder="Choose" />
      </FormField>,
    )
    const trigger = screen.getByRole('combobox', { description: 'Pick a priority.' })
    expect(trigger.getAttribute('aria-invalid')).toBe('true')
  })

  it('shows the error in the danger role, with its icon', () => {
    const field = mount(
      <FormField label="Subject" error="A subject is required.">
        <Input />
      </FormField>,
    )
    const error = screen.getByText('A subject is required.')
    expect(getComputedStyle(error).color).toBe(tokenColor('--pm-danger-text'))
    expect(error.querySelector('svg')?.dataset['icon']).toBe('error')
    expect(field.dataset['invalid']).toBe('')
  })

  it('treats an empty error string as no error', () => {
    const field = mount(
      <FormField label="Subject" error="" description="Help.">
        <Input />
      </FormField>,
    )
    expect(field.dataset['invalid']).toBeUndefined()
    expect(screen.getByText('Help.')).toBeTruthy()
  })
})

/**
 * Where the messages are placed (form-field.md).
 *
 * A column-labelled field reads label → help → control, so the help text explains the field the
 * label just named. A row-labelled field has no field-level label, so a description above it would
 * have nothing to attach to. A settings row is read control first, with the description below.
 *
 * Asserted through document order rather than a class name, because the order is what is tested
 * and a stylesheet could change the visual order.
 */
describe('message order', () => {
  /** True when `first` comes before `second` in the rendered document. */
  const precedes = (first: Element, second: Element) =>
    (first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0

  it('puts the description above a column-labelled control', () => {
    mount(
      <FormField label="Subject" description="One line, as the customer would say it.">
        <Input />
      </FormField>,
    )
    const description = screen.getByText('One line, as the customer would say it.')
    // The bordered box, not the bare `<input>`, because the box is the control's root.
    const control = screen.getByRole('textbox').parentElement as HTMLElement
    expect(precedes(description, control)).toBe(true)
  })

  it('puts it below the control row for a Switch', () => {
    mount(
      <FormField label="Desktop notifications" description="Takes effect immediately.">
        <Switch />
      </FormField>,
    )
    const description = screen.getByText('Takes effect immediately.')
    const row = screen.getByRole('switch').closest('label') as HTMLElement
    expect(precedes(row, description)).toBe(true)
    // The wiring is unchanged by the move.
    expect(screen.getByRole('switch', { description: 'Takes effect immediately.' })).toBeTruthy()
  })

  it('does the same for a Checkbox', () => {
    mount(
      <FormField label="Email me about replies" description="You can turn this off later.">
        <Checkbox />
      </FormField>,
    )
    const description = screen.getByText('You can turn this off later.')
    const row = screen.getByRole('checkbox').closest('label') as HTMLElement
    expect(precedes(row, description)).toBe(true)
  })

  it('keeps the error below the control, whichever kind it is', () => {
    mount(
      <FormField label="Accept the terms" error="You have to accept the terms.">
        <Checkbox />
      </FormField>,
    )
    const row = screen.getByRole('checkbox').closest('label') as HTMLElement
    expect(precedes(row, screen.getByText('You have to accept the terms.'))).toBe(true)

    mount(
      <FormField label="Subject" error="A subject is required.">
        <Input />
      </FormField>,
    )
    const control = screen.getByRole('textbox').parentElement as HTMLElement
    expect(precedes(control, screen.getByText('A subject is required.'))).toBe(true)
  })

  it('still shows one message at a time on a row-labelled field', () => {
    mount(
      <FormField
        label="Accept the terms"
        description="You can read them first."
        error="You have to accept the terms."
      >
        <Checkbox />
      </FormField>,
    )
    expect(screen.queryByText('You can read them first.')).toBeNull()
    expect(
      screen.getByRole('checkbox', { description: 'You have to accept the terms.' }),
    ).toBeTruthy()
  })

  it('runs the message the full width of the field, with no indent', () => {
    // The row itself must not stretch, because it is label, control and hit target together. But
    // a sentence that wrapped at the row's width would leave a ragged edge with nothing beside it.
    const WIDE = 640
    const { container } = render(
      <FormField label="Desktop notifications" description="Takes effect immediately.">
        <Switch />
      </FormField>,
    )
    ;(container as HTMLElement).style.inlineSize = `${WIDE}px`

    const field = container.firstElementChild as HTMLElement
    const description = screen.getByText('Takes effect immediately.')
    expect(description.getBoundingClientRect().width).toBeCloseTo(WIDE, 0)
    expect(description.getBoundingClientRect().left).toBeCloseTo(
      field.getBoundingClientRect().left,
      0,
    )
  })
})

/**
 * The label's row, as in the login block's password field.
 *
 * The claim is small and easy to break. The slot goes at the *other end of the label's own row*,
 * and filling it must not move the label, change the field's spacing, or add a second `<label>`
 * to the document.
 */
describe('labelEnd', () => {
  const RESET = (
    <Link href="#reset" variant="standalone">
      Forgot your password?
    </Link>
  )

  it('places the slot at the far end of the label’s row', () => {
    const WIDE = 480
    const { container } = render(
      <FormField label="Password" labelEnd={RESET}>
        <Input type="password" />
      </FormField>,
    )
    ;(container as HTMLElement).style.inlineSize = `${WIDE}px`

    const field = container.firstElementChild as HTMLElement
    const label = screen.getByText('Password')
    const link = screen.getByRole('link', { name: 'Forgot your password?' })

    // Same row: they share a vertical centre.
    const centre = (node: Element) => {
      const box = node.getBoundingClientRect()
      return box.top + box.height / 2
    }
    expect(centre(link)).toBeCloseTo(centre(label), 0)

    // Opposite ends of the field, not merely "after".
    expect(label.getBoundingClientRect().left).toBeCloseTo(field.getBoundingClientRect().left, 0)
    expect(link.getBoundingClientRect().right).toBeCloseTo(field.getBoundingClientRect().right, 0)
  })

  it('leaves the label where it was when the slot is empty', () => {
    const WIDE = 480
    const positions = (node: React.ReactElement) => {
      const { container } = render(node)
      ;(container as HTMLElement).style.inlineSize = `${WIDE}px`
      const field = container.firstElementChild as HTMLElement
      const label = field.querySelector('label') as HTMLElement
      const control = field.querySelector('input') as HTMLElement
      return {
        label: label.getBoundingClientRect().left - field.getBoundingClientRect().left,
        // The spacing: how far the control sits below the field's top edge.
        control: control.getBoundingClientRect().top - field.getBoundingClientRect().top,
      }
    }

    const bare = positions(
      <FormField label="Password">
        <Input type="password" />
      </FormField>,
    )
    const slotted = positions(
      <FormField label="Password" labelEnd={RESET}>
        <Input type="password" />
      </FormField>,
    )

    expect(slotted.label).toBeCloseTo(bare.label, 0)
    expect(slotted.control).toBeCloseTo(bare.control, 0)
  })

  it('does not become a second label for the control', () => {
    // A text input rather than a password one: a `type="password"` field has no
    // `textbox` role, and the claim here is about the *name*, not the type.
    mount(
      <FormField label="Workspace" labelEnd={RESET}>
        <Input />
      </FormField>,
    )
    // One `<label>`, and the accessible name is still only the label's text. If the link were
    // included, the name would be "Workspace Forgot your password?".
    expect(document.querySelectorAll('label')).toHaveLength(1)
    expect(screen.getByLabelText('Workspace')).toBe(screen.getByRole('textbox'))
    expect(screen.getByRole('textbox', { name: 'Workspace' })).toBeTruthy()
  })

  it('keeps the row when the field is required and in error', () => {
    const field = mount(
      <FormField required label="Password" error="That password does not match." labelEnd={RESET}>
        <Input type="password" />
      </FormField>,
    )
    expect(field.dataset['invalid']).toBe('')
    expect(screen.getByRole('link', { name: 'Forgot your password?' })).toBeTruthy()
    // The marker is still the label's, and the error is still below the control.
    expect((field.querySelector('label') as HTMLElement).textContent).toContain('*')
    expect(screen.getByText('That password does not match.')).toBeTruthy()
  })

  it('is ignored by a row-labelled field, which has no label row to hold it', () => {
    mount(
      <FormField label="Email me about replies" labelEnd={RESET}>
        <Checkbox />
      </FormField>,
    )
    expect(screen.queryByRole('link', { name: 'Forgot your password?' })).toBeNull()
  })
})

describe('required', () => {
  it('marks the control required, and the marker is decorative', () => {
    mount(
      <FormField required label="Subject">
        <Input />
      </FormField>,
    )
    const input = screen.getByRole('textbox')
    expect(input.getAttribute('aria-required')).toBe('true')
    // The accessible name is the label, not the label plus an asterisk. The marker is
    // `aria-hidden`, so the name computation skips it, although the label's text content still
    // contains it.
    expect(screen.getByRole('textbox', { name: 'Subject' })).toBe(input)
  })

  it('passes the marker to a row-labelled control, which has the only label row', () => {
    mount(
      <FormField required label="Accept the terms">
        <Checkbox />
      </FormField>,
    )
    const box = screen.getByRole('checkbox', { name: 'Accept the terms' })
    expect(box.getAttribute('aria-required')).toBe('true')
    expect(box.dataset['required']).toBe('')
    // The field itself renders no second label for it.
    expect(document.querySelectorAll('label')).toHaveLength(1)
  })

  it('paints the marker in the danger role', () => {
    const field = mount(
      <FormField required label="Subject">
        <Input />
      </FormField>,
    )
    const marker = field.querySelector('[aria-hidden="true"]') as HTMLElement
    expect(marker.textContent?.trim()).toBe('*')
    expect(getComputedStyle(marker).color).toBe(tokenColor('--pm-danger-text'))
  })
})

describe('disabled', () => {
  it('mirrors the control’s disabled state so the label row can dim with it', () => {
    const field = mount(
      <FormField label="Subject" description="Locked while the ticket is closed.">
        <Input disabled />
      </FormField>,
    )
    expect(field.dataset['disabled']).toBe('')
    expect(getComputedStyle(screen.getByText('Subject')).color).toBe(
      tokenColor('--pm-text-disabled'),
    )
    expect(getComputedStyle(screen.getByText('Locked while the ticket is closed.')).color).toBe(
      tokenColor('--pm-text-disabled'),
    )
  })

  it('leaves an enabled field alone', () => {
    const field = mount(
      <FormField label="Subject">
        <Input />
      </FormField>,
    )
    expect(field.dataset['disabled']).toBeUndefined()
    expect(getComputedStyle(screen.getByText('Subject')).color).toBe(
      tokenColor('--pm-text-primary'),
    )
  })
})

describe('what it does not overwrite', () => {
  it('leaves a control invalid when the control said so itself', () => {
    // `cloneElement` lets an `undefined` in the config overwrite the child's own prop. A field with
    // no error must not clear `invalid` on its child.
    mount(
      <FormField label="Subject">
        <Input invalid />
      </FormField>,
    )
    expect(screen.getByRole('textbox').getAttribute('aria-invalid')).toBe('true')
  })
})

/**
 * The control seam survives the clone.
 *
 * FormField wires a control by cloning it. A clone that dropped the child's own props would leave
 * a collaboration binding unable to reach into the field. As elsewhere, the test uses the
 * accessible surface: the node the ref holds is the one the label names, and the events it was
 * given still reach it.
 */
describe('the control seam survives the clone', () => {
  /** A selection change as React sees one: the platform's own state, then a key up. */
  function select(control: HTMLInputElement | HTMLTextAreaElement, start: number, end: number) {
    control.focus()
    control.setSelectionRange(start, end)
    control.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }))
  }

  it('leaves an Input’s controlRef and native handlers on the control it names', () => {
    const ref = createRef<HTMLInputElement>()
    const onSelect = vi.fn()
    const onCompositionStart = vi.fn()
    const onCompositionEnd = vi.fn()
    mount(
      <FormField label="Subject" description="One line.">
        <Input
          defaultValue="hello world"
          controlRef={ref}
          onSelect={onSelect}
          onCompositionStart={onCompositionStart}
          onCompositionEnd={onCompositionEnd}
        />
      </FormField>,
    )
    const input = screen.getByRole('textbox', { name: 'Subject', description: 'One line.' })
    expect(ref.current).toBe(input)

    select(ref.current as HTMLInputElement, 0, 5)
    expect(onSelect).toHaveBeenCalledTimes(1)

    ref.current?.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }))
    ref.current?.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: 'x' }))
    expect(onCompositionStart).toHaveBeenCalledTimes(1)
    expect(onCompositionEnd).toHaveBeenCalledTimes(1)
  })

  it('does the same for a Textarea, wiring included', () => {
    const ref = createRef<HTMLTextAreaElement>()
    const onSelect = vi.fn()
    mount(
      <FormField label="Notes" error="Say more.">
        <Textarea defaultValue="hello world" controlRef={ref} onSelect={onSelect} />
      </FormField>,
    )
    const box = screen.getByRole('textbox', { name: 'Notes', description: 'Say more.' })
    expect(ref.current).toBe(box)
    // The field's injected props are on the same node the caller holds.
    expect(ref.current?.getAttribute('aria-invalid')).toBe('true')

    select(ref.current as HTMLTextAreaElement, 0, 5)
    expect(onSelect).toHaveBeenCalledTimes(1)
  })
})

/**
 * An agent reads a field's hint and error as its control's description
 * (`design/components/form-field.md`, Agent): FormField names both with the
 * control's `aria-describedby`, and the bridge reports what it names.
 */
describe('an agent', () => {
  it('reads an Input’s error as its description, and finds the field by it', () => {
    render(
      <FormField
        label="Email"
        description="The address on the invoice."
        error="Enter an email address."
      >
        <Input value="ada" onChange={() => {}} />
      </FormField>,
    )
    const bridge = createAgentBridge()
    try {
      const [field] = bridge.snapshot().members
      expect(field).toMatchObject({
        member: 'Input',
        name: 'Email',
        description: 'Enter an email address.',
        state: { value: 'ada', invalid: true },
      })
      expect(bridge.query({ text: 'enter an email' }).map((match) => match.id)).toEqual([field?.id])
    } finally {
      bridge.dispose()
    }
  })

  it('reads the hint as the description of a field with no error', () => {
    render(
      <FormField label="Email" description="The address on the invoice.">
        <Input />
      </FormField>,
    )
    const bridge = createAgentBridge()
    try {
      expect(bridge.snapshot().members[0]?.description).toBe('The address on the invoice.')
    } finally {
      bridge.dispose()
    }
  })

  it('reports no description for a field with neither', () => {
    render(
      <FormField label="Subject">
        <Input />
      </FormField>,
    )
    const bridge = createAgentBridge()
    try {
      expect(bridge.snapshot().members[0]).not.toHaveProperty('description')
    } finally {
      bridge.dispose()
    }
  })
})
