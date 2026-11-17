import { createSignal } from 'solid-js'
import { beforeAll, describe, expect, it } from 'vitest'

import { installTestTheme } from '@polymorph/engine/testing'

import Dashboard from '../archetypes/Dashboard'
import { mount } from '../mount'
import ErrorSummary, { type ErrorSummaryError } from './ErrorSummary'
import { type StatProps } from './Stat'
import Stepper, { type Step } from './Stepper'

/**
 * A list a member renders by a value no spec makes unique: ErrorSummary's
 * field ids, Dashboard's stat labels and Stepper's step labels. The keyed list
 * maps a repeated key to one row, so each list is keyed by position as well,
 * and renders every entry through an update, as Vue and React do.
 */

beforeAll(installTestTheme)

describe('a list whose values repeat renders every entry', () => {
  it('lists two errors on one field, and both again once the list is replaced', async () => {
    const errors = (): ErrorSummaryError[] => [
      { fieldId: 'email', label: 'Enter an email address' },
      { fieldId: 'email', label: 'Use your work address' },
    ]
    const [list, setList] = createSignal(errors())
    const { host } = await mount(() => <ErrorSummary title="Fix these fields" errors={list()} />)
    const listed = () => [...host.querySelectorAll('li')].map((item) => item.textContent)
    expect(listed()).toEqual(['Enter an email address', 'Use your work address'])
    setList(errors())
    expect(listed()).toEqual(['Enter an email address', 'Use your work address'])
  })

  it('draws two stats of one label, and both again once the list is replaced', async () => {
    const stats = (): StatProps[] => [
      { label: 'Open', value: '12' },
      { label: 'Open', value: '3' },
    ]
    const [list, setList] = createSignal(stats())
    const { host } = await mount(() => (
      <Dashboard title="Support" primary={<p>Queue</p>} stats={list()} />
    ))
    expect(host.querySelectorAll('[data-member="stat"]')).toHaveLength(2)
    setList(stats())
    expect(host.querySelectorAll('[data-member="stat"]')).toHaveLength(2)
  })

  it('draws two steps of one label, and both again once the list is replaced', async () => {
    const steps = (): Step[] => [{ label: 'Review' }, { label: 'Review' }]
    const [list, setList] = createSignal(steps())
    const { host } = await mount(() => <Stepper activeIndex={0} steps={list()} />)
    expect(host.querySelectorAll('li')).toHaveLength(2)
    setList(steps())
    expect(host.querySelectorAll('li')).toHaveLength(2)
  })
})
