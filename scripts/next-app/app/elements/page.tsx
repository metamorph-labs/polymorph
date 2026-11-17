import {
  Avatar,
  Button,
  Dialog,
  FormField,
  HoverCard,
  Input,
  Popover,
  RadioGroup,
  SettingsRow,
  Stack,
  Switch,
  Table,
  Tabs,
  Text,
  Tooltip,
} from '@polymorph/react-ui'

/**
 * A server component that passes elements to the client members that read
 * them, and reads compound members' parts.
 */
export default function Elements() {
  return (
    <Stack gap={6}>
      <FormField label="Subject" description="A short summary.">
        <Input name="subject" />
      </FormField>
      <FormField label="Notify me">
        <Switch name="notify" />
      </FormField>
      <FormField label="Priority">
        <RadioGroup
          name="priority"
          options={[
            { value: 'low', label: 'Low' },
            { value: 'high', label: 'High' },
          ]}
        />
      </FormField>
      <Dialog title="Delete ticket" trigger={<Button label="Delete" tone="danger" />}>
        <Text>The ticket and its replies are removed.</Text>
      </Dialog>
      <SettingsRow.Group title="Notifications">
        <SettingsRow
          label="Daily digest"
          description="One summary each morning."
          control={<Switch />}
        />
      </SettingsRow.Group>
      <Avatar.Group label="Assignees" max={2}>
        <Avatar name="Ada Lovelace" />
        <Avatar name="Grace Hopper" />
        <Avatar name="Alan Turing" />
      </Avatar.Group>
      <Tooltip content="Copies the link">
        <Button label="Copy" variant="outline" />
      </Tooltip>
      <Popover label="Filters" trigger={<Button label="Filter" variant="outline" />}>
        <Text>Filter controls.</Text>
      </Popover>
      <HoverCard content={<Text>Ada Lovelace, support lead.</Text>}>
        <Button label="Ada" variant="ghost" />
      </HoverCard>
      <Table label="Tickets">
        <Table.Head>
          <Table.Row>
            <Table.Header>Subject</Table.Header>
            <Table.Header>Status</Table.Header>
          </Table.Row>
        </Table.Head>
        <Table.Body>
          <Table.Row>
            <Table.Cell>Printer is on fire</Table.Cell>
            <Table.Cell>Open</Table.Cell>
          </Table.Row>
        </Table.Body>
      </Table>
      <Tabs
        tabs={[
          { value: 'open', label: 'Open' },
          { value: 'closed', label: 'Closed' },
        ]}
      >
        <Tabs.Content value="open">
          <Text>Three open tickets.</Text>
        </Tabs.Content>
        <Tabs.Content value="closed">
          <Text>No closed tickets.</Text>
        </Tabs.Content>
      </Tabs>
    </Stack>
  )
}
