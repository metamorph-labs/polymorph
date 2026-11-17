import { type ComponentStates } from '@polymorph/react'
import { Switch } from '../controls/Switch'
import { Stack } from '../layout/Stack'
import styles from '@polymorph/recipes/structure/scroll-area.module.css'
import { ScrollArea } from './ScrollArea'
import { SettingsRow } from './SettingsRow'
import { Text } from './Text'

/**
 * States fixture, from `design/components/scroll-area.md`'s States table.
 *
 * The harness boxes are the spec's ("a 16rem-tall harness box"), built from
 * tokens in the member's stylesheet. The consumer sets the region's size, and
 * here the fixture is the consumer.
 */

const ROWS = [
  ['Daily digest', 'One summary each morning instead of a notification per reply.'],
  ['Mentions', 'Notify when a teammate mentions you in a ticket.'],
  ['Assignments', 'Notify when a ticket is assigned to you.'],
  ['Escalations', 'Notify when a ticket you follow is escalated.'],
  ['Replies', 'Notify on every customer reply.'],
  ['Snooze returns', 'Notify when a snoozed ticket wakes.'],
  ['Weekly report', 'A summary of the queue every Monday.'],
  ['Quiet hours', 'Silence everything between 20:00 and 07:00.'],
] as const

function SettingsRows() {
  return (
    <Stack gap={4}>
      {ROWS.map(([label, description]) => (
        <SettingsRow
          key={label}
          label={label}
          description={description}
          control={<Switch defaultChecked />}
        />
      ))}
    </Stack>
  )
}

/** A value with no break opportunities, so a narrow box must pan for it. */
const UNBROKEN = <Text size="sm">pm_live_9f2c4e8b7a614d3f8c25b1e07d9a3c6f41e8b2d5</Text>

export const states: ComponentStates = {
  component: 'ScrollArea',

  entries: [
    {
      name: 'vertical — the rail says more is coming',
      render: () => (
        <div className={styles.harness}>
          <ScrollArea label="Notification settings">
            <SettingsRows />
          </ScrollArea>
        </div>
      ),
    },
    {
      name: 'horizontal — wide content in a narrow box',
      render: () => (
        <div className={styles.harnessNarrow}>
          <ScrollArea orientation="horizontal" label="API key">
            {UNBROKEN}
          </ScrollArea>
        </div>
      ),
    },
    {
      name: 'both — two rails and the corner',
      render: () => (
        <div className={styles.harnessSquare}>
          <ScrollArea orientation="both" label="Notification settings">
            <Stack gap={4}>
              {UNBROKEN}
              <SettingsRows />
            </Stack>
          </ScrollArea>
        </div>
      ),
    },
    {
      name: 'fits — no rail on a region with nothing more to give',
      render: () => (
        <div className={styles.harness}>
          <ScrollArea label="Notification settings">
            <SettingsRow
              label="Daily digest"
              description="One summary each morning."
              control={<Switch defaultChecked />}
            />
          </ScrollArea>
        </div>
      ),
    },
    {
      name: 'hover type — the rail overlays, hidden until the pointer arrives',
      render: () => (
        <div className={styles.harness}>
          <ScrollArea type="hover" label="Notification settings">
            <SettingsRows />
          </ScrollArea>
        </div>
      ),
    },
  ],

  requiredSelectors: [
    '[data-orientation="vertical"]',
    '[data-orientation="horizontal"]',
    '[data-state="visible"]',
    '[data-state="hidden"]',
  ],
}
