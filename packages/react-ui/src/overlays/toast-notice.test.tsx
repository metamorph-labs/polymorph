import { StrictMode } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { page, userEvent } from 'vitest/browser'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { installTestTheme } from '@polymorph/engine/testing'
import { ToastHost, ToastNotice } from './ToastNotice'
import { Toaster } from './Toaster'
import { getToasts, removeToast, toast, TOAST_DEFAULT_DURATION_MS } from './toast-store'
import { ToastFormField } from '../controls/FormField'
import { Input } from '../controls/Input'
import { Button } from '../controls/Button'

beforeAll(installTestTheme)
afterEach(() => {
  for (const record of getToasts()) removeToast(record.id)
})
const messages = { dismiss: 'Close notice', notification: 'Update', viewport: 'Updates (F8)' }
const cards = () => document.querySelectorAll('[data-member="toast"]')
const settled = (count: number) => vi.waitFor(() => expect(cards()).toHaveLength(count))

describe('application feedback', () => {
  it('hosts one viewport and keeps errors outside the form in StrictMode', async () => {
    render(
      <StrictMode>
        <ToastHost messages={messages}>
          <ToastHost messages={messages}>
            <form aria-label="Account">
              <ToastFormField label="Email" error="Enter a valid address">
                <Input />
              </ToastFormField>
            </form>
          </ToastHost>
        </ToastHost>
      </StrictMode>,
    )
    await settled(1)
    expect(document.querySelectorAll('ol')).toHaveLength(1)
    expect(screen.getByRole('form').textContent).not.toContain('Enter a valid address')
    expect(screen.getByRole('textbox').getAttribute('aria-invalid')).toBe('true')
    expect(screen.getByRole('textbox').getAttribute('aria-describedby')).toBeNull()
    expect(cards()[0]?.textContent).toContain('Enter a valid address')
    expect(screen.getByRole('button', { name: messages.dismiss })).toBeTruthy()
  })

  it('raises a field’s message as the toast’s description, as every other shell does', async () => {
    render(
      <ToastHost messages={messages}>
        <ToastFormField label="Email" error="Enter a valid address">
          <Input />
        </ToastFormField>
      </ToastHost>,
    )
    await settled(1)
    const record = getToasts()[0]
    expect(record?.description).toBe('Enter a valid address')
    expect(record?.content).toBeUndefined()
  })

  it('keeps exact recovery reachable, updates disabled state, and removes it on resolution', async () => {
    const retry = vi.fn()
    const fixture = (busy: boolean, failed: boolean) => (
      <ToastHost messages={messages}>
        <form aria-label="Account">
          {failed && (
            <ToastNotice title="Try again" dismissible={false}>
              <Button label="Retry saved request" disabled={busy} onClick={retry} />
            </ToastNotice>
          )}
        </form>
      </ToastHost>
    )
    const { rerender } = render(fixture(false, true))
    await settled(1)
    expect(screen.getByRole('form').querySelector('button')).toBeNull()
    expect(screen.queryByRole('button', { name: messages.dismiss })).toBeNull()
    const recovery = screen.getByRole('button', { name: 'Retry saved request' })
    expect(getComputedStyle(recovery).backgroundColor).toBe('rgba(0, 0, 0, 0)')
    expect(getComputedStyle(recovery).borderTopWidth).toBe('0px')
    expect(getComputedStyle(recovery).boxShadow).toBe('none')
    await userEvent.click(screen.getByRole('button', { name: 'Retry saved request' }))
    expect(retry).toHaveBeenCalledTimes(1)
    await userEvent.keyboard('{Escape}')
    await settled(1)
    const card = cards()[0]!
    // The browser does not capture synthetic pointer IDs; the real Radix
    // handlers still generate their swipe events, including the cancelable
    // move/end defaults.
    const capture = vi.spyOn(card, 'setPointerCapture').mockImplementation(() => {})
    fireEvent.pointerDown(card, { pointerId: 1, button: 0, clientX: 0, clientY: 0 })
    fireEvent.pointerMove(card, { pointerId: 1, clientX: 20, clientY: 0 })
    fireEvent.pointerMove(card, { pointerId: 1, clientX: 180, clientY: 0 })
    fireEvent.pointerUp(card, { pointerId: 1, clientX: 180, clientY: 0 })
    expect(capture).toHaveBeenCalled()
    capture.mockRestore()
    expect(card.getAttribute('data-swipe')).toBeNull()
    expect(getToasts().find((record) => record.title === 'Try again')?.closing).not.toBe(true)
    rerender(fixture(true, true))
    await vi.waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Retry saved request' }).hasAttribute('disabled'),
      ).toBe(true),
    )
    expect(getComputedStyle(recovery).backgroundColor).toBe('rgba(0, 0, 0, 0)')
    expect(getComputedStyle(recovery).borderTopWidth).toBe('0px')
    for (let i = 0; i < 6; i++) toast.danger(`Other failure ${i}`)
    expect(getToasts().some((record) => record.title === 'Try again')).toBe(true)
    rerender(fixture(false, false))
    await vi.waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Retry saved request' })).toBeNull(),
    )
  })

  it('respects dismissal across renders and announces a new attempt with the same error', async () => {
    const fixture = (attempt: number) => (
      <ToastHost messages={messages}>
        <ToastNotice title="Check your input" eventKey={attempt} />
      </ToastHost>
    )
    const { rerender, unmount } = render(fixture(1))
    await settled(1)
    await userEvent.click(screen.getByRole('button', { name: messages.dismiss }))
    await settled(0)
    rerender(fixture(1))
    expect(getToasts()).toHaveLength(0)
    rerender(fixture(2))
    await settled(1)
    unmount()
    expect(getToasts()).toHaveLength(0)
  })

  it('keeps a danger or warning notice until it is resolved, and lets any other tone leave', async () => {
    render(
      <ToastHost messages={messages}>
        <ToastNotice title="Could not save" />
        <ToastNotice title="Offline" tone="warning" />
        <ToastNotice title="Signed in" tone="success" />
        <ToastNotice title="New version" tone="info" />
        <ToastNotice title="Draft kept" tone="neutral" />
      </ToastHost>,
    )
    // Five notices and room for four: the oldest transient one gives way.
    await settled(4)
    const lifetime = (title: string) => {
      const record = getToasts().find((each) => each.title === title)
      return [record?.retained, record?.durationMs]
    }
    expect(getToasts().map((record) => record.title)).not.toContain('Signed in')
    expect(lifetime('Could not save')).toEqual([true, Number.POSITIVE_INFINITY])
    expect(lifetime('Offline')).toEqual([true, Number.POSITIVE_INFINITY])
    for (const title of ['New version', 'Draft kept'])
      expect(lifetime(title), title).toEqual([false, TOAST_DEFAULT_DURATION_MS])
  })

  it('lets a success notice time out, and tells the screen it left', async () => {
    const left = vi.fn()
    const fixture = (description: string) => (
      <ToastHost messages={messages}>
        <ToastNotice title="Signed in" description={description} tone="success" onDismiss={left} />
      </ToastHost>
    )
    const { rerender } = render(fixture('As Rowan.'))
    await settled(1)
    // The default duration is the store's; this test does not wait it out.
    expect(getToasts()[0]?.durationMs).toBe(TOAST_DEFAULT_DURATION_MS)
    toast({ ...getToasts()[0]!, durationMs: 100 })
    await settled(0)
    expect(left).toHaveBeenCalledTimes(1)
    // A render after it left does not raise it again.
    rerender(fixture('As Rowan Ellis.'))
    await new Promise((settle) => setTimeout(settle, 50))
    expect(getToasts()).toHaveLength(0)
  })

  it('calls onDismiss when the reader dismisses a notice, and not when the screen removes it', async () => {
    const dismissed = vi.fn()
    const removed = vi.fn()
    const fixture = (shown: boolean) => (
      <ToastHost messages={messages}>
        <ToastNotice title="Saved" tone="success" onDismiss={dismissed} />
        {shown && <ToastNotice title="Could not sync" onDismiss={removed} />}
      </ToastHost>
    )
    const { rerender } = render(fixture(true))
    await settled(2)
    await userEvent.click(cards()[0]!.querySelector('button')!)
    await settled(1)
    expect(dismissed).toHaveBeenCalledTimes(1)
    rerender(fixture(false))
    await settled(0)
    expect(removed).not.toHaveBeenCalled()
  })

  it('warns in development when no viewport is mounted to draw a notice', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const { unmount } = render(<ToastNotice title="Something went wrong" />)
      await vi.waitFor(() => expect(warn).toHaveBeenCalledTimes(1))
      expect(String(warn.mock.calls[0]?.[0])).toContain('"Something went wrong"')
      expect(String(warn.mock.calls[0]?.[0])).toContain('ToastHost')
      unmount()

      // A viewport mounted after the notice in the same commit still counts.
      warn.mockClear()
      const beside = render(
        <>
          <ToastNotice title="Beside a viewport" />
          <Toaster messages={messages} />
        </>,
      )
      await settled(1)
      await new Promise((settle) => setTimeout(settle, 50))
      beside.unmount()
      const hosted = render(
        <ToastHost messages={messages}>
          <ToastNotice title="Hosted" />
        </ToastHost>,
      )
      await settled(1)
      await new Promise((settle) => setTimeout(settle, 50))
      hosted.unmount()
      expect(warn).not.toHaveBeenCalled()
    } finally {
      warn.mockRestore()
    }
  })

  it('retains all field errors and fits long messages and recovery controls on a phone', async () => {
    await page.viewport(320, 640)
    render(
      <ToastHost messages={messages}>
        {Array.from({ length: 6 }, (_, i) => (
          <ToastNotice key={i} title={`Field ${i}: ${'invalid'.repeat(20)}`} dismissible={false}>
            <Button label="Retry the original request" onClick={() => {}} />
          </ToastNotice>
        ))}
      </ToastHost>,
    )
    await settled(6)
    expect(getToasts()).toHaveLength(6)
    await vi.waitFor(() => {
      for (const card of cards()) {
        const bounds = card.getBoundingClientRect()
        expect(bounds.left).toBeGreaterThanOrEqual(0)
        expect(bounds.right).toBeLessThanOrEqual(320)
      }
      const viewport = document.querySelector('ol')!
      expect(viewport.clientHeight).toBeLessThan(640)
      expect(viewport.scrollHeight).toBeGreaterThan(viewport.clientHeight)
    })
    await page.viewport(1280, 800)
  })
})
