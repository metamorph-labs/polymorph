'use client'

import { Tabs, Text } from '@polymorph/react-ui'

/** A compound member in a client component of the application. */
export function Panels() {
  return (
    <Tabs
      tabs={[
        { value: 'open', label: 'Open', count: 3 },
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
  )
}
