import { memberAttr, relativeTimePhrase } from '@polymorph/react'

/**
 * A timestamp such as "2h ago", or the moment itself, in a `<time>` element
 * (`design/components/relative-time.md`). It writes the distance from now, the
 * moment, or both. `dateTime` holds the machine-readable moment, and `Intl` makes the words in
 * the given `locale`, through the engine's `relativeTimePhrase`, so every
 * framework's RelativeTime chooses the same units, rounds the same way and
 * writes the same date and time. No substrate, client directive or
 * stylesheet: it is a word, not a widget, and inherits the surrounding text.
 *
 * Not Timeline's `time`, which stays an app-formatted string, and it takes no
 * formatter callback (as with charts' `ValueFormat`). An app writes such a
 * string with `relativeTimePhrase`, so its words match this member's.
 *
 * **No refresh.** Self-updating timestamps are motion nobody asked for. The
 * phrase is as current as its render, and there is no `refresh` prop at all.
 */

declare const process: { env: { NODE_ENV?: string } }

/**
 * The member's words, localized by passing them (WCAG 3.1.2). `both` joins the
 * moment and the distance in `mode="both"`, so a locale orders and punctuates
 * them. Default: the moment, then the distance in parentheses.
 */
export interface RelativeTimeMessages {
  both: (moment: string, distance: string) => string
}

export interface RelativeTimeProps {
  /**
   * ISO-8601 with the chart tier's calendar-date rules (`docs/charts.md`): a
   * date-only string is a **calendar date**, not shifted by timezone
   * ("2026-08-04" is the 4th everywhere), and a full timestamp keeps its offset.
   */
  value: string
  /** The locale `Intl` formats with; defaults to the page's own. */
  locale?: string
  /**
   * Intl's `numeric` option. `always` (the default) suits scanned queue metadata
   * ("1 day ago"); prose surfaces pass `auto` for "yesterday".
   */
  numeric?: 'auto' | 'always'
  /**
   * Intl's `style` without `short`, which looks like `narrow`. Named `format`
   * (NumberInput's word) because the governed-props law and `no-raw-styles` read
   * any JSX `style` as raw CSS. In the absolute form it is the date's length:
   * `narrow` is Intl's `medium` date ("Aug 4, 2026"), `long` its `long` date.
   */
  format?: 'long' | 'narrow'
  /**
   * What it says: the distance from now (`relative`, the default), the moment
   * itself (`absolute`, "Aug 4, 2026, 2:05 PM"), or both, joined by
   * `messages.both` ("Aug 4, 2026, 2:05 PM (2h ago)"), for a place where the
   * exact moment matters. An instant is written in the time zone of whatever
   * renders the member: the reader's in a browser, the server's on a server.
   */
  mode?: 'relative' | 'absolute' | 'both'
  /** Omit for the generic English defaults; localized hosts pass their own. */
  messages?: RelativeTimeMessages
}

export function RelativeTime({
  value,
  locale,
  numeric = 'always',
  format = 'narrow',
  mode = 'relative',
  messages,
}: RelativeTimeProps) {
  const phrase = relativeTimePhrase(value, { locale, numeric, format, mode, messages })

  // An unparseable value has no valid phrase, so nothing renders (as in
  // Timeline) and a warning is issued from render, because this member has no
  // client directive and the problem is data, not state.
  if (phrase === null) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`polymorph: RelativeTime could not parse "${value}" — rendering nothing.`)
    }
    return null
  }

  // `dateTime` is for machines and assistive tech, the phrase for everyone. No
  // `title` tooltip, because touch and keyboard cannot reach one. When the exact
  // time matters, the app chooses `absolute` or `both`, which write it as text.
  return (
    <time dateTime={value} {...memberAttr('RelativeTime')}>
      {phrase}
    </time>
  )
}
