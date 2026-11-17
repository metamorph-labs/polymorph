import { cleanup, render, screen } from '@testing-library/react'
import { page, userEvent } from 'vitest/browser'
import { afterEach, beforeAll, expect, it, vi } from 'vitest'
import { installTestTheme } from '@polymorph/engine/testing'
import { FormField } from '../controls/FormField'
import { OTPInput } from '../controls/OTPInput'
import { Stack } from '../layout/Stack'
import { Table } from '../structure/Table'
import { AppShell } from './AppShell'
import { AuthPage } from './AuthPage'

beforeAll(installTestTheme)
afterEach(async () => {
  cleanup()
  await page.viewport(1280, 800)
})

it('keeps every navigation label and the full content width after a collapsed desktop is resized', async () => {
  render(
    <AppShell
      defaultCollapsed
      contentLayout="page"
      sidebar={<AppShell.NavItem label="Personal details" href="/profile" />}
    >
      <p>Current profile</p>
    </AppShell>,
  )
  await page.viewport(320, 740)
  const main = screen.getByRole('main')
  await vi.waitFor(() => expect(main.getBoundingClientRect().width).toBe(320))
  await userEvent.click(screen.getByRole('button', { name: 'Open navigation' }))
  const link = screen.getByRole('link', { name: 'Personal details' })
  await vi.waitFor(() => expect(link.getBoundingClientRect().left).toBeGreaterThanOrEqual(0))
  expect(link.firstElementChild!.getBoundingClientRect().width).toBeGreaterThan(1)
  expect(main.scrollWidth).toBe(main.clientWidth)
})

it('fits the auth card, setup image and all six verification cells at 320px', async () => {
  await page.viewport(320, 740)
  render(
    <AuthPage title="Verify your account" brand="Template account">
      <Stack gap={4}>
        <img
          width={240}
          height={240}
          alt="Authenticator setup"
          src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='240' height='240'/%3E"
        />
        <FormField label="Verification code">
          <OTPInput defaultValue="123456" />
        </FormField>
      </Stack>
    </AuthPage>,
  )
  const main = screen.getByRole('main')
  expect(main.scrollWidth).toBe(main.clientWidth)
  const image = screen.getByRole('img')
  expect(image.getBoundingClientRect().width).toBeLessThan(240)
  const input = screen.getByLabelText('Verification code')
  const group = input.parentElement!
  expect(group.scrollWidth).toBe(group.clientWidth)
  expect(group.lastElementChild!.getBoundingClientRect().right).toBeLessThanOrEqual(320)
  expect((input as HTMLInputElement).value).toBe('123456')
})

it('contains wide records inside the table while long page text wraps', async () => {
  await page.viewport(320, 740)
  render(
    <AppShell sidebar={<span>Navigation</span>} contentLayout="page">
      <Stack gap={4}>
        <p>{'long-subject-identifier'.repeat(20)}</p>
        <Table label="Records">
          <Table.Head>
            <Table.Row>
              <Table.Header>Subject</Table.Header>
              <Table.Header>Details</Table.Header>
              <Table.Header>Actions</Table.Header>
            </Table.Row>
          </Table.Head>
          <Table.Body>
            <Table.Row>
              <Table.Cell>{'subject'.repeat(30)}</Table.Cell>
              <Table.Cell>{'detail'.repeat(100)}</Table.Cell>
              <Table.Cell>Review current record</Table.Cell>
            </Table.Row>
          </Table.Body>
        </Table>
      </Stack>
    </AppShell>,
  )
  const main = screen.getByRole('main')
  await vi.waitFor(() => expect(main.scrollWidth).toBe(main.clientWidth))
  const table = screen.getByRole('table')
  const wrapper = table.parentElement!
  await vi.waitFor(() => expect(wrapper.getAttribute('tabindex')).toBe('0'))
  expect(wrapper.getBoundingClientRect().right).toBeLessThanOrEqual(320)
  wrapper.scrollLeft = wrapper.scrollWidth
  expect(wrapper.scrollLeft).toBeGreaterThan(0)
})
