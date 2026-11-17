import {
  AppShell,
  Badge,
  Button,
  ConfirmDialog,
  Inline,
  Input,
  NumberInput,
  SettingsPage,
  SettingsRow,
  Switch,
  Table,
  Tooltip,
  type BadgeTone,
} from '@polymorph/react-ui'
import { useState } from 'react'

import { navigate } from '../harness/router'
import { PAGES_ROOT } from './routes'

/**
 * Exemplar: **Meter**'s billing screen. The SettingsPage archetype inside a full product frame.
 * It is the same invented product as the analytics exemplar, one rail item further, because a
 * design system is judged on a whole product rather than on one screen.
 *
 * The archetype has no actions slot and this page needs none. Settings apply immediately, which
 * is `SettingsRow`'s law and what distinguishes a settings screen from a form without a save
 * button. The seat count, the billing address and the receipt switch all save as they change.
 *
 * **The danger row goes through a ConfirmDialog, and confirming has an effect.**
 * `onClick={() => {}}` on a delete button is an anti-pattern this repository names: a control that
 * looks like it works but does nothing. So confirming schedules the deletion, the row then says
 * so, and the same row offers a way to undo it. That is a real state change with a real inverse,
 * the smallest working version of the feature. ConfirmDialog cannot be built with the
 * destructive option styled as the safe one, and it opens with focus on the cancel action.
 *
 * Invoices are a `Table` inside the group's Card rather than a series of rows. Four values per
 * line, one numeric and one a status, make a table, and `SettingsRow` holds exactly one control
 * per row by design.
 */

interface Invoice {
  id: string
  date: string
  amount: string
  status: string
  tone: BadgeTone
}

/** Monthly, most recent first. The fixture treats August 2026 as the current month. */
const INVOICES: Invoice[] = [
  { id: 'MTR-2608', date: '1 August 2026', amount: '$2,480.00', status: 'Open', tone: 'warning' },
  { id: 'MTR-2607', date: '1 July 2026', amount: '$2,480.00', status: 'Paid', tone: 'success' },
  { id: 'MTR-2606', date: '1 June 2026', amount: '$2,145.00', status: 'Paid', tone: 'success' },
  { id: 'MTR-2605', date: '1 May 2026', amount: '$1,920.00', status: 'Paid', tone: 'success' },
]

export function BillingPage() {
  const [seats, setSeats] = useState(24)
  const [billingEmail, setBillingEmail] = useState('accounts@meter.example')
  const [receipts, setReceipts] = useState(true)
  const [confirming, setConfirming] = useState(false)
  const [scheduled, setScheduled] = useState(false)

  return (
    <AppShell
      brand={
        <Badge variant="solid" tone="accent">
          Meter
        </Badge>
      }
      sidebar={
        <>
          <AppShell.NavGroup label="Product">
            <AppShell.NavItem icon="home" label="Overview" onSelect={() => {}} />
            <AppShell.NavItem icon="search" label="Events" onSelect={() => {}} />
            <AppShell.NavItem icon="filter" label="Funnels" onSelect={() => {}} />
            <AppShell.NavItem icon="refresh" label="Retention" onSelect={() => {}} />
          </AppShell.NavGroup>
          <AppShell.NavGroup label="Workspace">
            <AppShell.NavItem icon="team" label="Team" onSelect={() => {}} />
            <AppShell.NavItem icon="document" label="Billing" current onSelect={() => {}} />
            <AppShell.NavItem icon="settings" label="Settings" onSelect={() => {}} />
          </AppShell.NavGroup>
        </>
      }
      sidebarFooter={<AppShell.UserCard name="Ana Duarte" detail="ana@meter.example" />}
      topbar={{
        leading: (
          <Tooltip content="Back to the workbench's page index">
            <Button
              variant="ghost"
              tone="neutral"
              size="sm"
              icon="back"
              label="All pages"
              onClick={() => navigate(PAGES_ROOT)}
            />
          </Tooltip>
        ),
        trailing: (
          <Button
            variant="outline"
            tone="neutral"
            size="sm"
            icon="download"
            label="Annual statement"
          />
        ),
      }}
    >
      <SettingsPage
        title="Billing"
        description="Plan, payment and invoices for the Meter workspace. Everything here applies the moment it changes."
      >
        <SettingsRow.Group title="Plan">
          <SettingsRow
            label="Current plan"
            description="40,000 monthly tracked users included, then $0.04 each. Renews 1 September 2026."
            control={
              <Inline gap={3}>
                <Badge tone="accent">Scale</Badge>
                <Button variant="outline" tone="neutral" size="sm" label="Change plan" />
              </Inline>
            }
          />
          <SettingsRow
            label="Seats"
            description="Everyone who can sign in to this workspace, billed at $12 each per month."
            control={
              <NumberInput
                value={seats}
                onChange={(next) => setSeats(next ?? 1)}
                min={1}
                max={500}
                suffix="seats"
              />
            }
          />
        </SettingsRow.Group>

        <SettingsRow.Group title="Payment">
          {/* Placeholder digits on purpose. Fixture data that looks like a real card could end up
              pasted somewhere real. */}
          <SettingsRow
            label="Card on file"
            description="Visa ending 4242, expires 08/28."
            control={<Button variant="outline" tone="neutral" size="sm" label="Update card" />}
          />
          <SettingsRow
            label="Billing email"
            description="Where invoices, receipts and renewal notices are sent."
            control={
              <Input
                type="email"
                autoComplete="email"
                value={billingEmail}
                onChange={(value) => setBillingEmail(value)}
              />
            }
          />
          <SettingsRow
            label="Email a receipt every month"
            description="On top of the invoice, for whoever files the expenses."
            control={<Switch checked={receipts} onCheckedChange={setReceipts} />}
          />
        </SettingsRow.Group>

        <SettingsRow.Group title="Invoices">
          {/* The caption is for screen readers only. The group's h2 already names the table on
              screen, and showing the caption too would repeat it. */}
          <Table label="Invoices" caption="Meter invoices, most recent first">
            <Table.Head>
              <Table.Row>
                <Table.Header>Issued</Table.Header>
                <Table.Header numeric>Amount</Table.Header>
                <Table.Header>Status</Table.Header>
                <Table.Header>PDF</Table.Header>
              </Table.Row>
            </Table.Head>
            <Table.Body>
              {INVOICES.map((invoice) => (
                <Table.Row key={invoice.id}>
                  <Table.Cell>{invoice.date}</Table.Cell>
                  <Table.Cell numeric>{invoice.amount}</Table.Cell>
                  <Table.Cell>
                    <Badge tone={invoice.tone}>{invoice.status}</Badge>
                  </Table.Cell>
                  <Table.Cell>
                    {/* Icon-only, so the column stays narrow. `label` is still required, so the
                        accessible name can say which invoice, not just "Download". */}
                    <Button
                      variant="ghost"
                      tone="neutral"
                      size="sm"
                      icon="download"
                      iconOnly
                      label={`Download the ${invoice.date} invoice`}
                    />
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        </SettingsRow.Group>

        <SettingsRow.Group title="Danger">
          <SettingsRow
            label="Delete this workspace"
            description={
              scheduled
                ? 'Scheduled for deletion. Dashboards stay readable until the grace period ends.'
                : 'Every dashboard, saved query and invoice goes with it. Nothing else on your account changes.'
            }
            control={
              scheduled ? (
                <Button
                  variant="outline"
                  tone="neutral"
                  size="sm"
                  label="Keep the workspace"
                  onClick={() => setScheduled(false)}
                />
              ) : (
                <Button
                  variant="outline"
                  tone="danger"
                  size="sm"
                  label="Delete workspace…"
                  onClick={() => setConfirming(true)}
                />
              )
            }
          />
        </SettingsRow.Group>
      </SettingsPage>

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Delete the Meter workspace?"
        description="Every dashboard, saved query and invoice is removed after a 30-day grace period. Until then the workspace stays readable and you can call it off."
        confirmLabel="Schedule deletion"
        onConfirm={() => setScheduled(true)}
      />
    </AppShell>
  )
}
