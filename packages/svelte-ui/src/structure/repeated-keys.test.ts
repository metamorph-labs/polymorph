import { beforeAll, describe, expect, it } from 'vitest'

import { installTestTheme } from '@polymorph/engine/testing'

import Dashboard from '../archetypes/Dashboard.svelte'
import { render } from '../mount'
import { html } from '../testing/snippets'
import ErrorSummary from './ErrorSummary.svelte'
import Stepper from './Stepper.svelte'

/**
 * A list a member renders by a value no spec makes unique: ErrorSummary's
 * field ids, Dashboard's stat labels and Stepper's step labels. Svelte throws
 * on a repeated key in a keyed `{#each}`, so each list is keyed by position as
 * well, and renders every entry, as Vue and React do.
 */

beforeAll(installTestTheme)

describe('a list whose values repeat renders every entry', () => {
  it('lists two errors on one field', async () => {
    const { host } = await render(ErrorSummary, {
      title: 'Fix these fields',
      errors: [
        { fieldId: 'email', label: 'Enter an email address' },
        { fieldId: 'email', label: 'Use your work address' },
      ],
    })
    expect([...host.querySelectorAll('li')].map((item) => item.textContent)).toEqual([
      'Enter an email address',
      'Use your work address',
    ])
  })

  it('draws two stats of one label', async () => {
    const { host } = await render(Dashboard, {
      title: 'Support',
      primary: html('<p>Queue</p>'),
      stats: [
        { label: 'Open', value: '12' },
        { label: 'Open', value: '3' },
      ],
    })
    expect(host.querySelectorAll('[data-member="stat"]')).toHaveLength(2)
  })

  it('draws two steps of one label', async () => {
    const { host } = await render(Stepper, {
      activeIndex: 0,
      steps: [{ label: 'Review' }, { label: 'Review' }],
    })
    expect(host.querySelectorAll('li')).toHaveLength(2)
  })
})
