import { type ComponentStates } from '@polymorph/react'
import styles from '@polymorph/recipes/overlays/tabs.module.css'
import { Stack } from '../layout/Stack'
import { Tabs } from './Tabs'

/** States fixture, from `design/components/tabs.md`'s States table. */

const TWO = [
  { value: 'open', label: 'Open' },
  { value: 'solved', label: 'Solved' },
]

const THREE = [
  { value: 'inbox', label: 'Inbox', icon: 'inbox' as const, count: 12 },
  { value: 'mine', label: 'Assigned to me', icon: 'user' as const, count: 3 },
  { value: 'archive', label: 'Archive', icon: 'archive' as const },
]

/** More tabs than the fixture's narrow box holds in a row. */
const MANY = [
  { value: 'overview', label: 'Overview' },
  { value: 'activity', label: 'Activity', count: 12 },
  { value: 'members', label: 'Members' },
  { value: 'billing', label: 'Billing' },
  { value: 'integrations', label: 'Integrations' },
  { value: 'audit', label: 'Audit log' },
  { value: 'settings', label: 'Settings' },
]

export const states: ComponentStates = {
  component: 'Tabs',

  entries: [
    {
      name: 'two tabs, the first active by default',
      render: () => (
        <Tabs tabs={TWO}>
          <Tabs.Content value="open">
            <p>Everything still waiting on a reply.</p>
          </Tabs.Content>
          <Tabs.Content value="solved">
            <p>Closed in the last 30 days.</p>
          </Tabs.Content>
        </Tabs>
      ),
    },
    {
      name: 'icons and counts — the active tab’s count takes the accent',
      render: () => (
        <Tabs tabs={THREE}>
          {THREE.map((tab) => (
            <Tabs.Content key={tab.value} value={tab.value}>
              <Stack gap={2}>
                <p>{tab.label}</p>
              </Stack>
            </Tabs.Content>
          ))}
        </Tabs>
      ),
    },
    {
      name: 'second tab active, so the rule starts there',
      render: () => (
        <Tabs tabs={THREE} defaultValue="mine">
          {THREE.map((tab) => (
            <Tabs.Content key={tab.value} value={tab.value}>
              <p>{tab.label}</p>
            </Tabs.Content>
          ))}
        </Tabs>
      ),
    },
    {
      name: 'vertical — the same strip turned on its side',
      render: () => (
        <Tabs tabs={THREE} orientation="vertical">
          {THREE.map((tab) => (
            <Tabs.Content key={tab.value} value={tab.value}>
              <p>{tab.label}</p>
            </Tabs.Content>
          ))}
        </Tabs>
      ),
      expect: { 'data-orientation': 'vertical' },
    },
    {
      name: 'vertical, second tab active — the rule runs down the start edge',
      render: () => (
        <Tabs tabs={THREE} orientation="vertical" defaultValue="mine">
          {THREE.map((tab) => (
            <Tabs.Content key={tab.value} value={tab.value}>
              <p>{tab.label}</p>
            </Tabs.Content>
          ))}
        </Tabs>
      ),
    },
    {
      // The inactive panel is in the DOM and `hidden`: out of the layout and
      // the accessibility tree, but still mounted. The root cannot show that,
      // so the browser test checks it directly.
      name: 'kept mounted — a tab hop must not tear down a form mid-edit',
      render: () => (
        <Tabs keepMounted tabs={TWO}>
          <Tabs.Content value="open">
            <p>The visible panel.</p>
          </Tabs.Content>
          <Tabs.Content value="solved">
            <p>Alive and hidden, keeping its state.</p>
          </Tabs.Content>
        </Tabs>
      ),
    },
    {
      name: 'a tab you cannot open yet',
      render: () => (
        <Tabs
          tabs={[
            { value: 'overview', label: 'Overview' },
            { value: 'usage', label: 'Usage', disabled: true },
          ]}
        >
          <Tabs.Content value="overview">
            <p>Usage arrives once the account has a full billing period.</p>
          </Tabs.Content>
          <Tabs.Content value="usage">
            <p>Unreachable.</p>
          </Tabs.Content>
        </Tabs>
      ),
    },
    {
      // The box is the container, as the fixture is the consumer that sizes it.
      // The current tab is past the box's end edge, so the entry also shows the
      // strip opening on it, with a fade at both edges.
      name: 'wider than its container — the strip scrolls and opens on the current tab',
      render: () => (
        <div className={styles.harness}>
          <Tabs tabs={MANY} defaultValue="integrations">
            {MANY.map((tab) => (
              <Tabs.Content key={tab.value} value={tab.value}>
                <p>{tab.label}</p>
              </Tabs.Content>
            ))}
          </Tabs>
        </div>
      ),
    },
  ],

  requiredSelectors: [
    '[data-state="active"]',
    ':hover',
    ':focus-visible',
    '[data-disabled]',
    '[data-orientation="vertical"]',
  ],
}
