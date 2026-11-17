import {
  Button,
  Dialog,
  FormField,
  Heading,
  Input,
  LineChart,
  ModeSwitch,
  Sparkline,
  Stack,
  Text,
} from '@polymorph/react-ui'

import { Nav } from './nav'
import { Panels } from './panels'

const weeks = [
  { week: 'W1', opened: 180, closed: 160 },
  { week: 'W2', opened: 195, closed: 170 },
  { week: 'W3', opened: 190, closed: 188 },
  { week: 'W4', opened: 210, closed: 205 },
]

/** A server component that renders server-safe members and client members. */
export default function Home() {
  return (
    <Stack gap={6}>
      <Heading level={2}>Polymorph on the App Router</Heading>
      <Text>A server component that renders members.</Text>
      <Nav />
      <ModeSwitch label="Appearance" />
      <Button label="Save" icon="add" />
      <Dialog
        title="Delete ticket"
        description="This cannot be undone."
        trigger={<Button label="Delete" tone="danger" />}
        footer={<Button label="Confirm" tone="danger" />}
      >
        <Text>The ticket and its replies are removed.</Text>
      </Dialog>
      <Sparkline data={[42, 40, 41, 38, 35, 36, 33, 31]} label="First response, trending down" />
      <LineChart
        label="Tickets per week"
        data={weeks}
        x={{ key: 'week' }}
        series={[
          { key: 'opened', label: 'Opened' },
          { key: 'closed', label: 'Closed' },
        ]}
      />
      <FormField label="Subject" description="A short summary.">
        <Input name="subject" placeholder="Printer is on fire" />
      </FormField>
      <Panels />
    </Stack>
  )
}
