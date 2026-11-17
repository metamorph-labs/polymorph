import { Tickets } from './tickets'

const rows = [
  { id: 't1', subject: 'Printer is on fire', status: 'Open' },
  { id: 't2', subject: 'VPN drops at noon', status: 'Closed' },
]

/** A server component that hands data to a client component of the application. */
export default function TicketsPage() {
  return <Tickets rows={rows} />
}
