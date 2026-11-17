import {
  Avatar,
  Badge,
  Button,
  Card,
  DetailPage as DetailArchetype,
  Inline,
  Stack,
  Timeline,
  toast,
  type TimelineEvent,
} from '@polymorph/react-ui'

import { PRIORITY_TONE, relativeTime, STATUS_TONE, type Ticket } from './tickets'

/**
 * One ticket in full. This is the screen Timeline is designed for.
 *
 * A support ticket is mostly its history: who handled it, in what order, and how long ago. The
 * history goes in the aside rather than the body, as the archetype expects. The body is the
 * conversation the user came to read, and the record of how it got there sits beside it.
 *
 * Vocabulary only, like the rest of Relay: no CSS, no `className`, and no raw elements. The
 * strings between the components are text nodes, which is what application code should
 * contribute.
 */

/**
 * A history derived from the ticket rather than stored separately.
 *
 * Relay's data is a fixture (`tickets.ts`), and so is this. But deriving it means every row in
 * the queue has a history that matches the row. A solved ticket ends with being solved, an
 * unassigned one never gets an assignee, and the times count back from the ticket's last update.
 *
 * Oldest first, because a history is read forwards. The inbox shows the newest first, but that is
 * a different screen.
 */
function historyFor(ticket: Ticket): TimelineEvent[] {
  const since = ticket.updatedMinutesAgo

  const latest: TimelineEvent =
    ticket.status === 'solved'
      ? { title: 'Marked solved', time: relativeTime(since), icon: 'confirm', tone: 'success' }
      : ticket.status === 'pending'
        ? {
            title: 'Waiting on the customer',
            time: relativeTime(since),
            detail: 'Asked for the request ID from the failing call.',
            icon: 'time',
            tone: 'warning',
          }
        : { title: 'Replied to the customer', time: relativeTime(since), icon: 'comment' }

  return [
    {
      title: `Opened by ${ticket.requester}`,
      time: relativeTime(since + 2_880),
      icon: 'add',
      tone: 'info',
    },
    ticket.assignee === undefined
      ? { title: 'Left unassigned in the queue', time: relativeTime(since + 1_440), icon: 'inbox' }
      : {
          title: `Assigned to ${ticket.assignee}`,
          time: relativeTime(since + 1_440),
          icon: 'user',
        },
    {
      title: `Priority set to ${ticket.priority}`,
      time: relativeTime(since + 720),
      icon: 'edit',
      // The only use of tone here. Urgent is the only priority a reader should notice without
      // reading, and the line still names the priority.
      tone: ticket.priority === 'urgent' ? 'danger' : 'neutral',
    },
    latest,
  ]
}

/**
 * The thread. It exists so the body and the aside agree.
 *
 * The history says somebody replied. If the history reports a reply and the body shows none, the
 * screen contradicts itself, and a demo product should not.
 */
function threadFor(ticket: Ticket): { author: string; body: string }[] {
  return [
    {
      author: ticket.requester,
      body:
        'Started this morning and it is still happening. Happy to jump on a call if that is ' +
        'faster than going back and forth here.',
    },
    {
      author: ticket.assignee ?? 'Relay support',
      body:
        'Thanks for the detail — I can see the failures on our side too. Digging into the ' +
        'retry schedule now and will come back today.',
    },
  ]
}

export interface DetailPageProps {
  ticket: Ticket
  onBack: () => void
}

export function DetailPage({ ticket, onBack }: DetailPageProps) {
  return (
    <DetailArchetype
      title={ticket.subject}
      backLabel="Back to inbox"
      onBack={onBack}
      meta={
        <>
          <Badge tone={STATUS_TONE[ticket.status]}>{ticket.status}</Badge>
          <Badge variant="outline" tone={PRIORITY_TONE[ticket.priority]}>
            {ticket.priority}
          </Badge>
          <Inline gap={2} align="center">
            <Avatar name={ticket.assignee ?? ''} size="sm" />
            {ticket.assignee ?? 'Unassigned'}
          </Inline>
        </>
      }
      actions={
        <Button
          icon="comment"
          label="Reply"
          onClick={() => toast({ title: `Reply to ${ticket.id}`, description: ticket.subject })}
        />
      }
      aside={
        <Card>
          <Timeline events={historyFor(ticket)} label="Ticket history" />
        </Card>
      }
    >
      <Stack gap={4}>
        {threadFor(ticket).map((message) => (
          <Card key={message.author}>
            <Stack gap={3}>
              <Inline gap={2} align="center">
                <Avatar name={message.author} size="sm" />
                {message.author}
              </Inline>
              {message.body}
            </Stack>
          </Card>
        ))}
      </Stack>
    </DetailArchetype>
  )
}
