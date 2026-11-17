import {
  AppShell,
  Avatar,
  Badge,
  Button,
  Card,
  DescriptionList,
  DetailPage,
  Inline,
  Menu,
  RelativeTime,
  Stack,
  Stat,
  Tabs,
  Text,
  Timeline,
  Tooltip,
  type DescriptionListProps,
  type MenuEntry,
  type TabDescriptor,
  type TimelineEvent,
} from '@polymorph/react-ui'

import { navigate } from '../harness/router'
import { PAGES_ROOT } from './routes'

/**
 * Exemplar: **Sprintline**, a project tracker. The DetailPage archetype inside a full product
 * frame.
 *
 * One issue in full. The identity row says what the issue is and who owns it. The tabs hold the
 * body, because an issue has two views: what happened to it, and what is true about it. Stacking
 * both would make the reader scroll past one to reach the other. The aside holds the numbers and
 * metadata that stay in place while the tabs change.
 *
 * The archetype's rule applies: tabbed or plain, never both, so there are no `children` under
 * the Tabs. The aside still renders and the body grid keeps its column. `detail-page.states.tsx`
 * calls this composition "everything".
 *
 * Vocabulary only: no CSS, no `className`, no raw controls.
 */

const ASSIGNEE = 'Rhea Kapoor'

const TABS: TabDescriptor[] = [
  { value: 'activity', label: 'Activity', icon: 'time', count: 5 },
  { value: 'details', label: 'Details', icon: 'document' },
]

/**
 * Oldest first, because a history is read forwards. Times are ISO calendar dates, as Timeline
 * expects: the component draws the time, and the application decides how it reads.
 */
const ACTIVITY: TimelineEvent[] = [
  {
    title: 'Opened by Marguerite Osei',
    time: '2026-08-11',
    detail: 'Escalated from support after a second customer hit it on the annual plan.',
    icon: 'add',
    tone: 'info',
  },
  {
    title: `Assigned to ${ASSIGNEE}`,
    time: '2026-08-11',
    icon: 'user',
  },
  {
    title: 'Priority raised to High',
    time: '2026-08-13',
    detail: 'Four more reports overnight, all on the retry path rather than the first attempt.',
    icon: 'warning',
    tone: 'warning',
  },
  {
    title: 'Linked pull request 2184',
    time: '2026-08-17',
    detail:
      'Retries now carry the original idempotency key, so the promo survives the second call.',
    icon: 'link',
  },
  {
    title: 'Moved to In review',
    time: '2026-08-18',
    detail: 'Waiting on a second approval before it rides the Thursday release.',
    icon: 'refresh',
    tone: 'accent',
  },
]

/**
 * Facts about the issue. These belong in a DescriptionList, not a Timeline.
 *
 * The type is `DescriptionListProps['items']` rather than an item type, because the vocabulary
 * exports the props and not the row type. Indexing the props lets an application name a slot's
 * shape without defining a parallel type.
 */
const FACTS: DescriptionListProps['items'] = [
  { term: 'Reported by', detail: 'Marguerite Osei, customer support' },
  { term: 'Environment', detail: 'Web checkout — reproduced in Chrome and Safari' },
  { term: 'First seen', detail: <RelativeTime value="2026-08-09" /> },
  { term: 'Affected release', detail: '2026.8.1' },
  { term: 'Customers affected', detail: 'Six, five of them on the annual plan' },
]

/** The aside's metadata, which stays the same while the tabs change. */
const META: DescriptionListProps['items'] = [
  { term: 'Sprint', detail: 'Sprint 34 — closes 2026-08-28' },
  { term: 'Epic', detail: 'Checkout reliability' },
  {
    term: 'Labels',
    detail: (
      <Inline gap={2} wrap>
        <Badge tone="danger">regression</Badge>
        <Badge tone="info">checkout</Badge>
        <Badge tone="neutral">billing</Badge>
      </Inline>
    ),
  },
  {
    term: 'Reviewer',
    detail: (
      <Inline gap={2} align="center">
        <Avatar name="Ola Fadipe" size="sm" />
        Ola Fadipe
      </Inline>
    ),
  },
]

/**
 * Every destructive action is in the Menu, and the one solid button is the page's main action.
 * That is PageHeader's law. This archetype does not enforce it, so the page follows it
 * explicitly.
 */
const ACTIONS: MenuEntry[] = [
  { label: 'Copy link', icon: 'link', onSelect: () => {} },
  { label: 'Duplicate issue', icon: 'duplicate', onSelect: () => {} },
  { label: 'Move to backlog', icon: 'archive', onSelect: () => {} },
  { kind: 'separator' },
  { label: 'Delete issue', icon: 'delete', tone: 'danger', onSelect: () => {} },
]

export function ProjectPage() {
  return (
    <AppShell
      brand={
        <Badge variant="solid" tone="accent">
          Sprintline
        </Badge>
      }
      sidebar={
        <>
          <AppShell.NavGroup label="Work">
            <AppShell.NavItem icon="table" label="Board" current onSelect={() => {}} />
            <AppShell.NavItem icon="inbox" label="Backlog" onSelect={() => {}} />
            <AppShell.NavItem icon="time" label="Sprints" onSelect={() => {}} />
            <AppShell.NavItem icon="document" label="Roadmap" onSelect={() => {}} />
          </AppShell.NavGroup>
          <AppShell.NavGroup label="Workspace">
            <AppShell.NavItem icon="team" label="Team" onSelect={() => {}} />
            <AppShell.NavItem icon="settings" label="Settings" onSelect={() => {}} />
          </AppShell.NavGroup>
        </>
      }
      sidebarFooter={<AppShell.UserCard name={ASSIGNEE} detail="rhea@sprintline.example" />}
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
          <Button variant="outline" tone="neutral" size="sm" icon="share" label="Share issue" />
        ),
      }}
    >
      <DetailPage
        backLabel="Board"
        onBack={() => navigate(PAGES_ROOT)}
        title="Checkout drops the promo code on retry"
        meta={
          <>
            <Badge tone="accent">In review</Badge>
            <Badge variant="outline" tone="danger">
              High
            </Badge>
            <Badge tone="neutral">SPL-482</Badge>
            <Inline gap={2} align="center">
              <Avatar name={ASSIGNEE} size="sm" />
              {ASSIGNEE}
            </Inline>
            <Inline gap={1} align="center">
              opened <RelativeTime value="2026-08-11" />
            </Inline>
          </>
        }
        actions={
          <>
            <Menu
              align="end"
              trigger={
                <Button
                  variant="ghost"
                  tone="neutral"
                  iconOnly
                  icon="overflow"
                  label="More actions"
                />
              }
              items={ACTIONS}
            />
            <Button icon="confirm" label="Mark as done" />
          </>
        }
        tabs={
          <Tabs tabs={TABS}>
            <Tabs.Content value="activity">
              <Card>
                <Timeline events={ACTIVITY} label="Issue activity" />
              </Card>
            </Tabs.Content>
            <Tabs.Content value="details">
              <Card>
                <Stack gap={4}>
                  <Text>
                    A customer who applies a promo code and then hits a card decline keeps the order
                    but loses the discount: the retry rebuilds the cart from the server without the
                    code, and the second attempt charges the full amount. Nothing warns them, and
                    the receipt is the first place the difference shows.
                  </Text>
                  <DescriptionList orientation="horizontal" items={FACTS} />
                </Stack>
              </Card>
            </Tabs.Content>
          </Tabs>
        }
        aside={
          <>
            <Card>
              <Stat label="Estimate" value="5 pts" description="Re-pointed after the repro" />
            </Card>
            <Card>
              <Stat
                label="Days open"
                value="8"
                delta={{ value: '3 days', direction: 'up', positive: false }}
              />
            </Card>
            <Card>
              <DescriptionList items={META} />
            </Card>
          </>
        }
      />
    </AppShell>
  )
}
