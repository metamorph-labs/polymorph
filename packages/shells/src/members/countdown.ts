import { cond, describeMember, el, flag, fx, held, hold, identity, js, lit, text } from '../dsl'

/** A moment `ms` from the render, so a gallery cell starts from the same time left. */
const ahead = (ms: string) => js(`new Date(Date.now() + ${ms}).toISOString()`)
const back = (ms: string) => js(`new Date(Date.now() - ${ms}).toISOString()`)

const LABEL = 'Time until the code expires'

/**
 * Countdown (`design/components/countdown.md`): the time left until a moment,
 * `4:59`, then `1:02:05` from an hour, ticking each second until `0:00`, when
 * it emits `end` once. The time is the engine's: `countdownMoment` reads
 * `until`, `countdownLeft` the time left at a render, and `followCountdown`
 * the page's one clock after mount, which every framework's Countdown shares.
 * Before the clock is followed, the time left is the render's own. The timer
 * is named by `label` and says the time in words; the digits are hidden from
 * assistive technology. With `announce`, a polite line says the time left at
 * one minute and at ten seconds. A value that names no moment renders
 * nothing, with a development warning.
 */
export default describeMember({
  member: 'Countdown',
  dir: 'structure',
  recipe: 'structure/countdown',
  types: { CountdownMessages: '{ mark: (label: string, time: string) => string }' },
  defaults: { announce: 'false' },
  state: {
    // The clock's latest reading, the last line said, and the moment `end` was emitted for,
    // each for the moment it belongs to.
    reading: 'null as { at: number; left: number } | null',
    said: 'null as { at: number; text: string } | null',
    ended: 'null as number | null',
  },
  derived: {
    moment: 'countdownMoment(until)',
    say: "messages ?? { mark: (label: string, time: string) => label + ': ' + time }",
    // The time left it draws: the clock's last reading for this moment, or before the first,
    // the render's own (the server's on a server). A new object at each reading, so a framework
    // that keeps a server's text while it hydrates and writes only what changes (Solid) writes
    // the browser's time at the first reading, and the template reads it directly for that.
    time: '{ left: reading !== null && reading.at === moment ? reading.left : moment === null ? 0 : countdownLeft(moment) }',
    heard: "said !== null && said.at === moment ? said.text : ''",
    // The clock's listener for one moment.
    heed: "(at: number) => (left: number, marked: boolean): void => { reading = { at: at, left: left }; if (marked && announce) said = { at: at, text: say.mark(label, countdownSpoken(left, locale)) }; if (left === 0 && ended !== at) { ended = at; emit('end') } }",
  },
  effects: [
    // The page's clock is followed from mount, for the moment `until` names, and left when
    // the moment changes and when the member unmounts.
    {
      watch: 'moment',
      run: 'moment === null ? undefined : followCountdown(moment, heed(moment))',
      release: 'ran?.()',
    },
    {
      watch: 'moment',
      run: 'devWarning(moment === null, `Countdown could not read "${until}" as a moment — rendering nothing.`)',
    },
  ],
  template: cond('moment !== null', [
    el(
      'span',
      {
        class: ['countdown'],
        attrs: {
          'data-ended': flag('time.left === 0'),
          // Vue's own attribute: a server's time left differs from the browser's a moment
          // later, so Vue writes the browser's attributes here, and the browser's text and
          // attributes on the timer, while it hydrates, without reporting a mismatch. Vue reads
          // it on the element whose attribute differs, and on the nearest element that carries
          // it above a text that differs. The other frameworks ignore it.
          'data-allow-mismatch': lit('attribute'),
          ...identity('Countdown'),
        },
      },
      [
        // Named by `label`, and off as a live region by its role, so no second is announced.
        el(
          'time',
          {
            attrs: {
              role: lit('timer'),
              'aria-label': 'label',
              datetime: "'PT' + time.left + 'S'",
              'data-allow-mismatch': lit('text,attribute'),
            },
          },
          [
            el('span', { class: ['digits'], attrs: { 'aria-hidden': lit('true') } }, [
              text('countdownClock(time.left, locale)'),
            ]),
            el('span', { class: ['spoken'] }, [text('countdownSpoken(time.left, locale)')]),
          ],
        ),
        // Present from mount, so its first line is announced.
        cond('announce', [
          el('span', { class: ['spoken'], attrs: { role: lit('status') } }, [text('heard')]),
        ]),
      ],
    ),
  ]),
  states: [
    {
      name: 'minutes — m:ss',
      props: { until: ahead('299_000'), label: LABEL },
      expect: { 'data-ended': null },
    },
    {
      name: 'hours — h:mm:ss from an hour',
      props: { until: ahead('3_725_000'), label: 'Time until the session ends' },
    },
    {
      name: 'ended — 0:00 once the moment is reached',
      props: { until: back('5_000'), label: LABEL },
      expect: { 'data-ended': '' },
    },
    {
      name: 'locale — the locale’s numerals and words',
      props: { until: ahead('299_000'), label: LABEL, locale: 'ar-EG' },
    },
    {
      name: 'announced — a polite line at one minute and at ten seconds',
      props: { until: ahead('65_000'), label: LABEL, announce: true },
    },
    {
      // The Button that waits for the end is the application's. The moment is held, as the
      // application holds it, so a render does not start the count again.
      name: 'beside a Button — the application enables it at the end',
      holds: { locked: true, until: ahead('30_000') },
      many: {
        within: { member: 'Inline', props: { gap: 3, align: 'center' } },
        each: [],
        also: [
          fx(
            'Text',
            {},
            {
              default: [
                'Send a new code in ',
                fx('Countdown', {
                  until: held('until'),
                  label: 'Time until a new code can be sent',
                  onEnd: hold('locked', false),
                }),
              ],
            },
          ),
          fx('Button', {
            variant: 'outline',
            tone: 'neutral',
            size: 'sm',
            label: 'Send a new code',
            disabled: held('locked'),
          }),
        ],
      },
    },
    {
      name: 'invalid — no moment, so nothing renders',
      props: { until: 'not-a-moment', label: LABEL },
      rendersNothing: true,
    },
  ],
})
