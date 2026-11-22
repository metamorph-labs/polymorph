import type { ChartDatum, ChartSeries } from '@polymorph/react'
import {
  Avatar,
  Badge,
  Button,
  Card,
  Checkbox,
  FormField,
  Grid,
  Heading,
  Inline,
  Input,
  LineChart,
  List,
  Stack,
  Stat,
  Switch,
  Text,
} from '@polymorph/react-ui'

/**
 * The screen the landing page's stage shows: a small support overview.
 *
 * It is ordinary application code. It composes members and binds content, and
 * it holds no style, so the pairing around it decides everything it looks like.
 * The page shows it under several pairings to make that visible.
 */

/** Four weeks of ISO calendar dates. They are date-only, so no timezone shift applies. */
const DAYS: ChartDatum[] = Array.from({ length: 28 }, (_, index) => {
  const opened = [28, 34, 31, 45, 39, 22, 18][index % 7] ?? 30
  const solved = [25, 30, 33, 41, 37, 20, 16][index % 7] ?? 28
  return {
    day: `2026-03-${String(index + 1).padStart(2, '0')}`,
    opened: opened + (index % 5),
    solved: solved + (index % 4),
  }
})

const SERIES: ChartSeries[] = [
  { key: 'opened', label: 'Opened' },
  { key: 'solved', label: 'Solved' },
]

const WAITING = [
  { title: 'Refund for a duplicate charge', who: 'Ada Okafor', team: 'Billing', tone: 'warning' },
  { title: 'Can’t sign in after the update', who: 'Bao Tran', team: 'Accounts', tone: 'danger' },
  { title: 'Add a teammate to our plan', who: 'Carmen Ruiz', team: 'Sales', tone: 'info' },
] as const

const TONE_LABEL = { warning: 'Waiting', danger: 'Urgent', info: 'New' } as const

export function DemoScreen() {
  return (
    <Stack gap={5}>
      <Inline gap={4} justify="between" align="center" wrap>
        <Stack gap={1}>
          <Heading level={3}>Support this week</Heading>
          <Text size="sm" tone="secondary">
            All teams, updated a minute ago
          </Text>
        </Stack>
        <Inline gap={2}>
          <Button variant="outline" tone="neutral" icon="download" label="Export" />
          <Button variant="solid" tone="accent" icon="add" label="New ticket" />
        </Inline>
      </Inline>

      <Grid columns={3} gap={4}>
        <Card>
          <Stat
            label="Open tickets"
            value="128"
            delta={{ value: '12 fewer', direction: 'down', positive: true }}
            spark={[152, 149, 150, 144, 139, 141, 133, 128]}
          />
        </Card>
        <Card>
          <Stat
            label="First reply"
            value="14 min"
            delta={{ value: '3 min faster', direction: 'down', positive: true }}
            spark={[21, 19, 20, 18, 17, 17, 15, 14]}
          />
        </Card>
        <Card>
          <Stat
            label="Happy customers"
            value="96%"
            delta={{ value: '2 points', direction: 'up' }}
            spark={[91, 92, 92, 93, 94, 94, 95, 96]}
          />
        </Card>
      </Grid>

      <Grid columns={2} gap={4}>
        <Card title="Opened and solved">
          <LineChart
            data={DAYS}
            series={SERIES}
            x={{ key: 'day', scale: 'time', label: 'Day' }}
            label="Tickets opened and solved by day"
            size="sm"
          />
        </Card>
        <Card title="Needs a reply">
          <List label="Tickets that need a reply">
            {WAITING.map((ticket) => (
              <List.Item
                key={ticket.title}
                title={ticket.title}
                description={`${ticket.who} · ${ticket.team}`}
                leading={<Avatar name={ticket.who} />}
                trailing={<Badge tone={ticket.tone}>{TONE_LABEL[ticket.tone]}</Badge>}
              />
            ))}
          </List>
        </Card>
      </Grid>

      <Card title="Quick reply">
        <Stack gap={4}>
          <FormField label="Your reply">
            <Input placeholder="Thanks for getting in touch…" />
          </FormField>
          <Inline gap={5} wrap align="center">
            <Switch defaultChecked label="Email the customer" />
            <Checkbox label="Mark as solved" />
          </Inline>
          <Inline gap={2}>
            <Button variant="solid" tone="accent" icon="send" label="Send reply" />
            <Button variant="ghost" tone="neutral" label="Save draft" />
          </Inline>
        </Stack>
      </Card>
    </Stack>
  )
}
