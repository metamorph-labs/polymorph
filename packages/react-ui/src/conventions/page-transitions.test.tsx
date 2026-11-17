import { render, screen } from '@testing-library/react'
import { page, userEvent } from 'vitest/browser'
import { beforeAll, expect, it, vi } from 'vitest'
import { useState } from 'react'
import { installTestTheme } from '@polymorph/engine/testing'
import { PageTransitions, usePageTransitionPending } from './PageTransitions'
import { AuthPage } from '../archetypes/AuthPage'
import { AppShell } from '../archetypes/AppShell'

beforeAll(installTestTheme)
const indicator = () => document.querySelector<HTMLElement>('[data-page-progress]')!
const visible = () => indicator().dataset.pageProgress === 'visible'

function Load({ pending }: { pending: boolean }) {
  usePageTransitionPending(pending)
  return null
}

it('keeps one ribbon until overlapping foreground loads settle or unmount', async () => {
  const view = render(
    <PageTransitions>
      <Load pending />
      <Load pending />
    </PageTransitions>,
  )
  await vi.waitFor(() => expect(visible()).toBe(true))
  expect(document.querySelectorAll('[data-page-progress]')).toHaveLength(1)
  view.rerender(
    <PageTransitions>
      <Load pending={false} />
      <Load pending />
    </PageTransitions>,
  )
  expect(visible()).toBe(true)
  view.rerender(
    <PageTransitions>
      <Load pending={false} />
    </PageTransitions>,
  )
  await vi.waitFor(() => expect(visible()).toBe(false))
})

it('replays arrivals without replacing the focused field or losing its draft', async () => {
  function Form() {
    const [step, setStep] = useState('first')
    return (
      <PageTransitions>
        <AuthPage title="Account" transitionKey={step}>
          <input aria-label="Draft" defaultValue="kept" />
          <button onClick={() => setStep(step === 'first' ? 'second' : 'first')}>Next</button>
        </AuthPage>
      </PageTransitions>
    )
  }
  render(<Form />)
  const field = screen.getByRole('textbox') as HTMLInputElement
  const frame = document.querySelector<HTMLElement>('[data-page-transition]')!
  const initial = getComputedStyle(frame).animationName
  await userEvent.type(field, ' draft')
  field.focus()
  screen.getByRole('button', { name: 'Next' }).click()
  await vi.waitFor(() => expect(getComputedStyle(frame).animationName).not.toBe(initial))
  expect(screen.getByRole('textbox')).toBe(field)
  expect(field.value).toContain('draft')
  expect(document.activeElement).toBe(field)
  await vi.waitFor(() => expect(visible()).toBe(false))
  screen.getByRole('button', { name: 'Next' }).click()
  await vi.waitFor(() => expect(getComputedStyle(frame).animationName).toBe(initial))
})

it('keeps foreground loading visible, then fades in the ready page', async () => {
  const view = render(
    <PageTransitions>
      <AppShell sidebar="Menu" transitionKey="accounts" pending>
        <p>Loading accounts</p>
      </AppShell>
    </PageTransitions>,
  )
  const frame = screen.getByRole('main')
  await vi.waitFor(() => expect(frame.dataset.pageTransitionState).toBe('pending'))
  expect(getComputedStyle(frame).opacity).toBe('1')
  expect(getComputedStyle(frame).animationName).toBe('none')
  view.rerender(
    <PageTransitions>
      <AppShell sidebar="Menu" transitionKey="accounts">
        <p>Accounts ready</p>
      </AppShell>
    </PageTransitions>,
  )
  await vi.waitFor(() => expect(frame.dataset.pageTransitionState).toBe('entered'))
  expect(getComputedStyle(frame).animationName).not.toBe('none')
  await vi.waitFor(() => expect(visible()).toBe(false))
})

it('keeps the ribbon through staggered fields and preserves their draft on arrival', async () => {
  const view = render(
    <PageTransitions>
      <AuthPage layout="illustrated" title="Account" transitionKey="first">
        <div data-auth-enter="">
          <input aria-label="Account name" defaultValue="Draft" />
        </div>
        <div data-auth-enter="">
          <button>Continue</button>
        </div>
      </AuthPage>
    </PageTransitions>,
  )
  const input = screen.getByRole('textbox') as HTMLInputElement
  input.focus()
  const entrance = screen.getByRole('button').parentElement!
  expect(Number.parseFloat(getComputedStyle(entrance).animationDelay)).toBeGreaterThan(0)
  await new Promise((resolve) => setTimeout(resolve, 300))
  expect(visible()).toBe(true)
  await vi.waitFor(() => expect(visible()).toBe(false), { timeout: 2000 })
  view.rerender(
    <PageTransitions>
      <AuthPage layout="illustrated" title="Account" transitionKey="second">
        <div data-auth-enter="">
          <input aria-label="Account name" defaultValue="Draft" />
        </div>
        <div data-auth-enter="">
          <button>Continue</button>
        </div>
      </AuthPage>
    </PageTransitions>,
  )
  expect(screen.getByRole('textbox')).toBe(input)
  expect(input.value).toBe('Draft')
  expect(document.activeElement).toBe(input)
  await vi.waitFor(() => expect(visible()).toBe(false), { timeout: 2000 })
})

it('ignores cancelled clicks and clears departure state on a restored page', async () => {
  render(
    <PageTransitions>
      <AuthPage title="Account" transitionKey="account">
        <a href="/cancelled" onClick={(event) => event.preventDefault()}>
          Stay here
        </a>
      </AuthPage>
    </PageTransitions>,
  )
  await vi.waitFor(() => expect(visible()).toBe(false))
  await userEvent.click(screen.getByRole('link'))
  expect(visible()).toBe(false)
  window.dispatchEvent(new Event('beforeunload'))
  await vi.waitFor(() => expect(visible()).toBe(true))
  const frame = document.querySelector<HTMLElement>('[data-page-transition]')!
  expect(frame.dataset.pageTransitionState).toBe('exiting')
  window.dispatchEvent(new Event('pageshow'))
  await vi.waitFor(() => expect(visible()).toBe(false))
  expect(frame.dataset.pageTransitionState).toBe('entered')
})

it('anchors the ribbon to the viewport and leaves pending feedback static when motion is off', async () => {
  await page.viewport(320, 740)
  document.documentElement.dataset.motion = 'none'
  try {
    render(
      <PageTransitions>
        <AuthPage title="Account" transitionKey="account" pending>
          {null}
        </AuthPage>
      </PageTransitions>,
    )
    await vi.waitFor(() => expect(visible()).toBe(true))
    const bar = indicator()
    const rect = bar.getBoundingClientRect()
    expect(rect.top).toBe(0)
    expect(rect.left).toBe(0)
    expect(rect.width).toBe(320)
    expect(rect.height).toBeGreaterThan(0)
    expect(getComputedStyle(bar).pointerEvents).toBe('none')
    expect(getComputedStyle(bar, '::before').animationName).toBe('none')
    expect(getComputedStyle(bar, '::before').transform).toBe('none')
  } finally {
    delete document.documentElement.dataset.motion
    await page.viewport(1280, 800)
  }
})
