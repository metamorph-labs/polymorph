import { render, screen } from '@testing-library/react'
import { userEvent } from 'vitest/browser'
import { beforeAll, describe, expect, it } from 'vitest'

import { assertGoverned } from '@polymorph/react'
import { createAgentBridge } from '@polymorph/engine/agent'
import { installTestTheme } from '@polymorph/engine/testing'
import { FormField } from '../controls/FormField'
import { Input } from '../controls/Input'
import { ErrorSummary, type ErrorSummaryProps } from './ErrorSummary'

/**
 * ErrorSummary, in a real browser.
 *
 * The member is navigation, so the tests cover the links: real anchors whose
 * activation focuses the control, an arrival announced without moving focus, and
 * `fieldId` matching FormField's own `id`.
 */

beforeAll(installTestTheme)

const ERRORS: ErrorSummaryProps['errors'] = [
  { label: 'Subject is required', fieldId: 'subject' },
  { label: 'Pick a priority', fieldId: 'priority' },
]

describe('the closed surface', () => {
  it('has no style escape hatch', () => {
    assertGoverned<ErrorSummaryProps>(true)
  })
})

describe('the summary', () => {
  it('is one alert holding a real list of real anchors', () => {
    render(<ErrorSummary title="The ticket can't be raised yet" errors={ERRORS} />)
    const alert = screen.getByRole('alert')
    expect(alert.textContent).toContain("The ticket can't be raised yet")

    const list = screen.getByRole('list')
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    expect(list.querySelectorAll('a')).toHaveLength(2)
    expect(screen.getByRole('link', { name: 'Subject is required' }).getAttribute('href')).toBe(
      '#subject',
    )
    expect(screen.getByRole('link', { name: 'Pick a priority' }).getAttribute('href')).toBe(
      '#priority',
    )
  })

  it('renders the title as styled text, not a heading', () => {
    render(<ErrorSummary title="The ticket can't be raised yet" errors={ERRORS} />)
    expect(screen.queryAllByRole('heading')).toHaveLength(0)
  })

  it('renders nothing when there are no errors', () => {
    const { container } = render(<ErrorSummary title="Nothing wrong" errors={[]} />)
    expect(container.firstElementChild).toBeNull()
  })

  it('does not move focus when it appears', () => {
    render(<ErrorSummary title="The ticket can't be raised yet" errors={ERRORS} />)
    expect(document.activeElement).toBe(document.body)
  })
})

describe('each entry links to its field', () => {
  it('moves focus to the control, so the field’s own error is announced', async () => {
    render(
      <>
        <ErrorSummary
          title="The ticket can't be raised yet"
          errors={[{ label: 'Subject is required', fieldId: 'subject' }]}
        />
        <FormField label="Subject" error="Subject is required" id="subject">
          <Input />
        </FormField>
      </>,
    )

    await userEvent.click(screen.getByRole('link', { name: 'Subject is required' }))
    const control = document.getElementById('subject') as HTMLInputElement
    expect(document.activeElement).toBe(control)
    // The link and the field share one message through FormField's wiring.
    expect(control.getAttribute('aria-describedby')).toBe('subject-error')
    expect(document.getElementById('subject-error')?.textContent).toContain('Subject is required')
  })

  it('stays a plain fragment link when the control is not on the page', async () => {
    render(<ErrorSummary title="The ticket can't be raised yet" errors={ERRORS} />)
    const link = screen.getByRole('link', { name: 'Pick a priority' })
    // With nothing to focus, navigation is not prevented, so the anchor keeps its
    // native behaviour and the fragment navigation happens.
    await userEvent.click(link)
    expect(window.location.hash).toBe('#priority')
    window.history.replaceState(null, '', window.location.pathname + window.location.search)
  })
})

describe('a second failed submit', () => {
  it('updates the list in place, in the same alert element', () => {
    const { rerender } = render(
      <ErrorSummary
        title="The ticket can't be raised yet"
        errors={[{ label: 'Subject is required', fieldId: 'subject' }]}
      />,
    )
    const alert = screen.getByRole('alert')
    expect(screen.getAllByRole('listitem')).toHaveLength(1)

    rerender(<ErrorSummary title="The ticket can't be raised yet" errors={ERRORS} />)
    // The same element, still role="alert". Assistive tech announces the changed
    // content. Nothing was remounted and focus did not move.
    expect(screen.getByRole('alert')).toBe(alert)
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    expect(document.activeElement).toBe(document.body)
  })

  it('keeps the given order, which is the form order', () => {
    render(
      <ErrorSummary
        title="The ticket can't be raised yet"
        errors={[
          { label: 'Pick a priority', fieldId: 'priority' },
          { label: 'Subject is required', fieldId: 'subject' },
        ]}
      />,
    )
    expect(screen.getAllByRole('link').map((link) => link.textContent)).toEqual([
      'Pick a priority',
      'Subject is required',
    ])
  })
})

/**
 * An agent follows an error through the bridge, as the spec's `agent` fence
 * declares (`design/components/error-summary.md`, Agent): the errors are read
 * from the summary's list in the document, and a choice is a press on the
 * error's own link, which moves focus to the field as a person's press does.
 */
describe('an agent', () => {
  it('reads every error as a choice, by its link’s href and its message', () => {
    const bridge = createAgentBridge()
    try {
      render(<ErrorSummary title="The ticket can't be raised yet" errors={ERRORS} />)
      expect(bridge.snapshot().members).toEqual([
        expect.objectContaining({
          member: 'ErrorSummary',
          name: "The ticket can't be raised yet Subject is required Pick a priority",
          state: {
            items: [
              { id: '#subject', label: 'Subject is required' },
              { id: '#priority', label: 'Pick a priority' },
            ],
          },
          actions: [{ name: 'choose', argument: 'id' }],
        }),
      ])
    } finally {
      bridge.dispose()
    }
  })

  it('follows an error to its field, which the field’s own member then fills', async () => {
    const bridge = createAgentBridge()
    try {
      render(
        <>
          <ErrorSummary
            title="The ticket can't be raised yet"
            errors={[{ label: 'Subject is required', fieldId: 'subject' }]}
          />
          <FormField label="Subject" error="Subject is required" id="subject">
            <Input />
          </FormField>
        </>,
      )
      const { results } = await bridge.act([
        { target: { member: 'ErrorSummary' }, action: 'choose', value: '#subject' },
        { target: { member: 'Input', name: 'Subject' }, action: 'fill', value: 'Refund' },
      ])
      expect(results).toMatchObject([{ ok: true }, { ok: true }])
      const control = document.getElementById('subject') as HTMLInputElement
      expect(document.activeElement).toBe(control)
      expect(control.value).toBe('Refund')
    } finally {
      bridge.dispose()
    }
  })

  it('is listed once a failed submit gives it errors, and refuses an id no error has', async () => {
    const bridge = createAgentBridge()
    try {
      const { rerender } = render(
        <ErrorSummary title="The ticket can't be raised yet" errors={[]} />,
      )
      expect(bridge.snapshot().members).toEqual([])
      rerender(<ErrorSummary title="The ticket can't be raised yet" errors={ERRORS} />)
      const [summary] = bridge.snapshot().members
      expect(summary?.member).toBe('ErrorSummary')
      const { results } = await bridge.act([
        { id: summary?.id, action: 'choose', value: 'subject' },
      ])
      expect(results[0]).toMatchObject({ ok: false, error: { code: 'invalid-value' } })
    } finally {
      bridge.dispose()
    }
  })
})

describe('link styling', () => {
  it('underlines every link at rest, so colour is not the only signal', () => {
    render(<ErrorSummary title="The ticket can't be raised yet" errors={ERRORS} />)
    for (const link of screen.getAllByRole('link')) {
      expect(getComputedStyle(link).textDecorationLine).toBe('underline')
    }
  })
})
