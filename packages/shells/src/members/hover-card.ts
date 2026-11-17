import {
  cond,
  describeMember,
  el,
  fx,
  identity,
  lit,
  portal,
  slot,
  type FixtureChild,
} from '../dsl'

const TRIGGER: FixtureChild[] = [fx('Link', { href: '#ada' }, { default: ['Ada Lovelace'] })]

const PERSON: FixtureChild[] = [
  fx(
    'Stack',
    { gap: 3 },
    {
      default: [
        fx(
          'Inline',
          { gap: 3, align: 'center' },
          {
            default: [
              fx('Avatar', { name: 'Ada Lovelace' }),
              fx('Text', {}, { default: ['Ada Lovelace'] }),
            ],
          },
        ),
        fx(
          'Inline',
          { gap: 2, align: 'center' },
          {
            default: [
              fx('Text', { size: 'sm', tone: 'secondary' }, { default: ['Support'] }),
              fx('Badge', { tone: 'accent' }, { default: ['12 open tickets'] }),
            ],
          },
        ),
      ],
    },
  ),
]

/** What makes a preview operable, which the card may not hold. */
const FOCUSABLE = '\'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])\''

/**
 * HoverCard (`design/components/hover-card.md`): a preview panel that opens on
 * hover or keyboard focus, styled as Popover's panel. Zag's hover-card machine
 * owns the dwell, the close on leave, blur and Escape, and the positioning.
 *
 * The delays are Tooltip's, from the engine: the card waits
 * `TOOLTIP_DELAY_MS` before it opens and `TOOLTIP_SKIP_DELAY_MS` before it
 * closes, so the pointer can cross into the card. The trigger is an anchor
 * around the caller's link, which keeps its own semantics: the card is not
 * announced and wires no `aria-describedby`. A dwell starts only with a focus
 * or a pointer entry, and the machine's timer belongs to its opening state, so
 * a card dismissed with Escape stays closed until the next dwell.
 */
export default describeMember({
  member: 'HoverCard',
  dir: 'overlays',
  recipe: 'overlays/hover-card',
  types: {
    HoverCardSide: "NonNullable<HoverCardProps['side']>",
    HoverCardAlign: "NonNullable<HoverCardProps['align']>",
  },
  defaults: { side: lit('bottom'), align: lit('start') },
  machine: {
    of: 'hover-card',
    context: {
      defaultOpen: 'defaultOpen',
      openDelay: 'TOOLTIP_DELAY_MS',
      closeDelay: 'TOOLTIP_SKIP_DELAY_MS',
      // Popover's offset: a surface with its own content, set slightly off its trigger.
      positioning:
        "{ placement: align === 'center' ? side : `${side}-${align}`, offset: { mainAxis: 4 } }",
    },
  },
  presence: { present: { open: 'api.open', ref: 'panel' } },
  effects: [
    // The guardrail's last sentence: Tab never enters the card, so a control in it is
    // pointer-only. Checked on every opening, as the panel mounts on each.
    {
      watch: 'api.open',
      run: `devWarning(api.open && panel?.querySelector(${FOCUSABLE}) != null, 'HoverCard: the preview contains interactive content, which keyboard and touch readers can never reach. A card the reader must operate is a Popover.')`,
    },
  ],
  template: [
    el(
      'span',
      {
        part: 'trigger',
        class: ['anchor'],
        spread: ['anchorProps(api.getTriggerProps())'],
      },
      [slot()],
    ),
    portal(
      cond('present', [
        el('div', { spread: ['api.getPositionerProps()'] }, [
          el(
            'div',
            {
              part: 'panel',
              class: ['panel'],
              spread: ['api.getContentProps()'],
              // Present through the exit, which `hidden` would cut short.
              attrs: { hidden: 'undefined', ...identity('HoverCard') },
              ref: 'panel',
            },
            [slot('content')],
          ),
        ]),
      ]),
    ),
  ],
  states: [
    {
      name: 'closed — the trigger is all there is',
      slots: { default: TRIGGER, content: PERSON },
      expect: { 'data-state': 'closed' },
    },
    {
      name: 'open — the person behind the link, seen without going',
      props: { defaultOpen: true },
      slots: { default: TRIGGER, content: PERSON },
      expect: { 'data-state': 'open' },
    },
    {
      name: 'above its trigger, aligned to the end',
      props: { defaultOpen: true, side: 'top', align: 'end' },
      slots: { default: TRIGGER, content: PERSON },
      expect: { 'data-state': 'open' },
    },
    {
      name: 'long content — wraps at the panel’s max width',
      props: { defaultOpen: true },
      slots: {
        default: [fx('Link', { href: '#t-1041' }, { default: ['T-1041'] })],
        content: [
          fx(
            'Stack',
            { gap: 3 },
            {
              default: [
                fx('Text', {}, { default: ['T-1041 · Login loop after password reset'] }),
                fx(
                  'Text',
                  { size: 'sm', tone: 'secondary' },
                  {
                    default: [
                      'Reported by three customers on the annual plan. Reproduces after a password reset followed by an SSO sign-in on a second device; the session cookie is re-issued with the old rotation key.',
                    ],
                  },
                ),
              ],
            },
          ),
        ],
      },
      expect: { 'data-state': 'open' },
    },
  ],
})
