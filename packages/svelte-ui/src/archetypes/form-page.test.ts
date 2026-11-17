import { userEvent } from 'vitest/browser'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { installTestTheme } from '@polymorph/engine/testing'

import { render } from '../mount'
import FormPageHarness from '../testing/FormPageHarness.svelte'

/**
 * FormPage's own behaviour (`design/archetypes/form-page.md`) in the Svelte
 * shell, as the React archetype's test holds it: with `submit` handled it is a
 * real form, so Enter submits from a field, and a failed submit focuses the
 * first invalid field instead of submitting.
 */

beforeAll(installTestTheme)

type Field = { label: string; error?: string }

/**
 * The page with a "Create" submit Button and one Card of `fields`
 * (`testing/FormPageHarness.svelte`).
 */
const page = (onSubmit: () => void, fields: Field[]) =>
  render(FormPageHarness, { onSubmit, fields })

/** A FormField around an Input, invalid when it has an `error`. */
const field = (label: string, error?: string): Field => ({
  label,
  ...(error === undefined ? {} : { error }),
})

describe('FormPage', () => {
  it('is a real form when it is given a submit, so Enter works from a field', async () => {
    const onSubmit = vi.fn()
    await page(onSubmit, [field('Subject')])
    await userEvent.click(document.querySelector('input') as HTMLElement)
    await userEvent.keyboard('{Enter}')
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  it('moves focus to the first invalid field', async () => {
    const onSubmit = vi.fn()
    await page(onSubmit, [field('Subject'), field('Requester', 'Who reported this?')])
    await userEvent.click(
      [...document.querySelectorAll('button')].find((button) =>
        button.textContent?.includes('Create'),
      ) as HTMLElement,
    )
    expect(onSubmit).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(document.querySelectorAll('input')[1])
  })

  it('keeps the actions row inside the form', async () => {
    await page(() => {}, [])
    const form = document.querySelector('form') as HTMLElement
    expect(form.querySelector('button[type="submit"]')).not.toBeNull()
  })
})
