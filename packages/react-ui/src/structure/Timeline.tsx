import { Icon, type IconRole, memberAttr } from '@polymorph/react'
import styles from '@polymorph/recipes/structure/timeline.module.css'

/**
 * A vertical sequence of dated events (`design/components/timeline.md`).
 *
 * Timeline shows *what already happened*; Stepper shows a flow still under way.
 * Nothing here is active, upcoming or a control, so there is no client
 * directive: no hook, no handler, nothing that needs a browser.
 *
 * The title carries the meaning. A status-coloured dot is unreadable to many
 * readers, so the marker column is hidden from the accessibility tree and the
 * tone only emphasises words already on the page.
 */

export type TimelineTone = 'neutral' | 'accent' | 'info' | 'success' | 'warning' | 'danger'

export interface TimelineEvent {
  /** What happened, in the product's words; this carries the meaning, never the mark. */
  title: string
  /** Already formatted by the application; Timeline shows the time but does not format it. */
  time: string
  /** The body: a reply's first line, the reason for a change. */
  detail?: string
  /** A semantic icon role for the mark; when omitted, a plain dot is drawn. */
  icon?: IconRole
  /** Emphasis only; `neutral` is the default tone and sets no attribute. */
  tone?: TimelineTone
}

export interface TimelineProps {
  /** Events in reading order; Timeline never sorts them. */
  events: TimelineEvent[]
  /** The list's accessible name, such as "Ticket history" rather than "Timeline". */
  label: string
}

export function Timeline({ events, label }: TimelineProps) {
  // The empty case belongs to EmptyState and the page. An empty list that
  // announced itself would be making a decision that belongs to the page.
  if (events.length === 0) return null

  return (
    <ol className={styles.root} aria-label={label} {...memberAttr('Timeline')}>
      {events.map((event, index) => (
        <li
          // Keyed by position, an event's only identity here. Rows hold no state,
          // so the key only saves React rebuilding nodes, and an append-only record
          // never reorders what it drew.
          key={index}
          className={styles.event}
          // Rest state is the absence of the attribute: neutral sets nothing.
          data-tone={event.tone === undefined || event.tone === 'neutral' ? undefined : event.tone}
        >
          {/* The whole column is decorative. CSS draws the rule on this element,
              so it fills the remaining height and reaches the next mark whatever
              the text height beside it. */}
          <span className={styles.marker} aria-hidden="true">
            <span className={styles.mark} data-mark={event.icon === undefined ? 'dot' : 'icon'}>
              {event.icon === undefined ? null : <Icon name={event.icon} size="sm" />}
            </span>
          </span>

          <span className={styles.copy}>
            <span className={styles.title}>{event.title}</span>
            {/* The time qualifies the title, so it comes directly after it. The
                detail comes last, so a reader scanning the column can skip it. */}
            <span className={styles.time}>{event.time}</span>
            {event.detail === undefined ? null : (
              <span className={styles.detail}>{event.detail}</span>
            )}
          </span>
        </li>
      ))}
    </ol>
  )
}
