import { userEvent } from 'vitest/browser'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { h } from 'vue'

import { installTestTheme } from '@polymorph/engine/testing'

import Button from '../controls/Button.vue'
import FormField from '../controls/FormField.vue'
import Input from '../controls/Input.vue'
import { mount } from '../mount'
import Card from '../structure/Card.vue'
import FormPage from './FormPage.vue'

/**
 * FormPage's own behaviour (`design/archetypes/form-page.md`), as the React
 * archetype's test holds it: with `submit` handled it is a real form, so Enter
 * submits from a field, and a failed submit focuses the first invalid field
 * instead of submitting.
 */

beforeAll(installTestTheme)

const page = (onSubmit: () => void, fields: ReturnType<typeof h>[]) =>
  mount(() =>
    h(
      FormPage,
      { title: 'New ticket', onSubmit },
      {
        actions: () => [h(Button, { label: 'Create', type: 'submit' })],
        default: () => [h(Card, null, { default: () => fields })],
      },
    ),
  )

const field = (label: string, error?: string) =>
  h(FormField, { label, ...(error === undefined ? {} : { error }) }, { default: () => [h(Input)] })

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
