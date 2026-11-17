import {
  AppShell,
  Badge,
  BarChart,
  Button,
  Dashboard,
  DonutChart,
  LineChart,
  Tooltip,
  type ChartDatum,
  type StatProps,
} from '@polymorph/react-ui'

import { navigate } from '../harness/router'
import { PAGES_ROOT } from './routes'

/**
 * Exemplar: **Meter**, a product-analytics tool. The Dashboard archetype inside a full product
 * frame.
 *
 * There are seven exemplars, each an invented product, with one rule: vocabulary only, no CSS,
 * and realistic fixture data. Each is also a proof artifact, a page type the system can express
 * with no hand-written style. Together they show the designer how a design looks across an app,
 * under the current pairing (including a draft).
 *
 * Like Relay, an exemplar replaces the workbench shell, because AppShell is 100vh and renders its
 * own `<main>`. The rail's one working item returns to the index. Everything else is the
 * product's own UI, rendered but not wired.
 */

const STATS: StatProps[] = [
  {
    label: 'Monthly active users',
    value: '48,210',
    numeric: true,
    delta: { value: '4.2%', direction: 'up', positive: true },
    spark: [39.1, 40.4, 40.2, 41.8, 43.0, 42.6, 44.1, 45.9, 46.4, 48.2],
  },
  {
    label: 'Signup → activated',
    value: '31%',
    delta: { value: '2pts', direction: 'up', positive: true },
  },
  {
    label: 'Weekly churn',
    value: '0.8%',
    delta: { value: '0.1pts', direction: 'down', positive: true },
  },
  { label: 'Events today', value: '1.2M', numeric: true, icon: 'time' },
]

/** Two weeks of calendar dates, so no timezone shift applies. */
const FUNNEL_DAYS: ChartDatum[] = Array.from({ length: 14 }, (_, index) => ({
  day: `2026-08-${String(index + 1).padStart(2, '0')}`,
  signups: [310, 335, 342, 305, 288, 190, 172][index % 7]! + index * 6,
  activated: [96, 108, 112, 99, 93, 55, 48][index % 7]! + index * 3,
}))

const TOP_EVENTS: ChartDatum[] = [
  { event: 'Viewed dashboard', count: 412_000 },
  { event: 'Ran a query', count: 268_000 },
  { event: 'Shared a report', count: 114_000 },
  { event: 'Invited teammate', count: 61_000 },
  { event: 'Exported CSV', count: 42_000 },
]

export function AnalyticsPage() {
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
            <AppShell.NavItem icon="home" label="Overview" current onSelect={() => {}} />
            <AppShell.NavItem icon="search" label="Events" onSelect={() => {}} />
            <AppShell.NavItem icon="filter" label="Funnels" onSelect={() => {}} />
            <AppShell.NavItem icon="refresh" label="Retention" onSelect={() => {}} />
          </AppShell.NavGroup>
          <AppShell.NavGroup label="Workspace">
            <AppShell.NavItem icon="team" label="Team" onSelect={() => {}} />
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
          <Button variant="outline" tone="neutral" size="sm" icon="share" label="Share report" />
        ),
      }}
    >
      <Dashboard
        title="Product overview"
        description="Last 14 days, all workspaces."
        stats={STATS}
        primary={
          <>
            <Dashboard.Panel title="Sign-ups and activations">
              <LineChart
                data={FUNNEL_DAYS}
                series={[
                  { key: 'signups', label: 'Sign-ups' },
                  { key: 'activated', label: 'Activated' },
                ]}
                x={{ key: 'day', scale: 'time', label: 'Day' }}
                variant="area"
                label="Sign-ups and activations by day, last 14 days"
              />
            </Dashboard.Panel>
            <Dashboard.Panel title="Top events">
              <BarChart
                data={TOP_EVENTS}
                series={[{ key: 'count', label: 'Events' }]}
                x={{ key: 'event', scale: 'band', label: 'Event' }}
                orientation="horizontal"
                label="Top five events by volume"
              />
            </Dashboard.Panel>
          </>
        }
        secondary={
          <Dashboard.Panel title="Traffic sources">
            <DonutChart
              segments={[
                { key: 'organic', label: 'Organic', value: 41 },
                { key: 'referral', label: 'Referral', value: 27 },
                { key: 'paid', label: 'Paid', value: 19 },
                { key: 'direct', label: 'Direct', value: 13 },
              ]}
              center={{ value: '48.2k', label: 'sessions' }}
              label="Traffic share by source"
            />
          </Dashboard.Panel>
        }
      />
    </AppShell>
  )
}
