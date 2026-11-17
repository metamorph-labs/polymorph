import { cond, describeMember, el, identity, js, lit, text } from '../dsl'

/** A moment `ms` from the render, so a gallery cell never drifts. */
const back = (ms: string) => js(`new Date(Date.now() - ${ms}).toISOString()`)
const ahead = (ms: string) => js(`new Date(Date.now() + ${ms}).toISOString()`)

const MINUTE = '60_000'
const HOUR = '3_600_000'
const DAY = '86_400_000'

/**
 * RelativeTime (`design/components/relative-time.md`): "2h ago", the moment
 * itself, or both, in a `<time>` element. The words are the engine's
 * `relativeTimePhrase`, which the React member renders too, so both choose
 * the same unit, round the same way and write the same date and time. It is
 * as current as its render and never refreshes. A value with no phrase
 * renders nothing, with a development warning. `messages.both` joins the
 * moment and the distance in `mode="both"`, so a locale orders and
 * punctuates them; the engine holds the English default.
 */
export default describeMember({
  member: 'RelativeTime',
  dir: 'structure',
  recipe: null,
  types: { RelativeTimeMessages: '{ both: (moment: string, distance: string) => string }' },
  defaults: { numeric: lit('always'), format: lit('narrow'), mode: lit('relative') },
  derived: { phrase: 'relativeTimePhrase(value, { locale, numeric, format, mode, messages })' },
  effects: [
    {
      watch: 'phrase',
      run: 'devWarning(phrase === null, `RelativeTime could not parse "${value}" — rendering nothing.`)',
    },
  ],
  // `datetime` for machines and assistive technology, the phrase for everyone; no `title` tooltip.
  template: cond('phrase !== null', [
    el('time', { attrs: { datetime: 'value', ...identity('RelativeTime') } }, [text('phrase')]),
  ]),
  states: [
    { name: 'minutes — the queue register', props: { value: back(`5 * ${MINUTE}`) } },
    { name: 'hours', props: { value: back(`2 * ${HOUR}`) } },
    { name: 'days, long — for sentences', props: { value: back(`3 * ${DAY}`), format: 'long' } },
    {
      name: 'auto — prose surfaces get "yesterday"',
      props: { value: back(DAY), numeric: 'auto', format: 'long' },
    },
    {
      name: 'calendar date — days and larger, only',
      props: { value: '2026-08-04' },
      expect: { datetime: '2026-08-04' },
    },
    { name: 'due date — the future flows through unharmed', props: { value: ahead(`2 * ${DAY}`) } },
    {
      name: 'just now — the one honest word for under a minute',
      props: { value: back('20_000') },
    },
    {
      // A fixed moment: the absolute form changes at every minute, and a server render and a
      // mount seconds apart must agree.
      name: 'absolute — the moment itself, in the reader’s zone',
      props: { value: '2026-08-04T14:05:00Z', mode: 'absolute' },
    },
    {
      name: 'absolute calendar date — the date alone',
      props: { value: '2026-08-04', mode: 'absolute' },
      expect: { datetime: '2026-08-04' },
    },
    {
      name: 'both — the moment, then how long ago',
      props: { value: '2026-08-04T14:05:00Z', mode: 'both' },
    },
    {
      name: 'invalid — no honest phrase, so nothing renders',
      props: { value: 'not-a-date' },
      rendersNothing: true,
    },
  ],
})
