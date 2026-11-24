import { cond, describeMember, el, fx, identity, lit, portal, slot, text } from '../dsl'

const SIDES = ['top', 'right', 'bottom', 'left'] as const

/**
 * Tooltip (`design/components/tooltip.md`): a short hint on hover or focus.
 *
 * The delays are the engine's, which the React Tooltip's provider reads too:
 * the bubble waits `TOOLTIP_DELAY_MS` before it appears. Zag opens a
 * neighbour's bubble at once while another is still showing, so the closing
 * bubble stays for `TOOLTIP_SKIP_DELAY_MS`, the window in which a reader moving
 * along a toolbar does not wait again.
 *
 * A tooltip that keyboard focus opened stays open while its control holds that
 * focus. Zag closes a tooltip when an element around its trigger scrolls, and
 * a Tab to a control below the fold scrolls the page a frame after the focus
 * that opened it. So the machine's own close on scroll is off, and the
 * engine's `closeTooltipOnScroll` closes the bubble on a scroll only while the
 * keyboard does not hold the control.
 */
export default describeMember({
  member: 'Tooltip',
  dir: 'overlays',
  recipe: 'overlays/tooltip',
  types: {
    TooltipAlign: "NonNullable<TooltipProps['align']>",
    TooltipSide: "NonNullable<TooltipProps['side']>",
  },
  defaults: { side: lit('top'), align: lit('center') },
  machine: {
    of: 'tooltip',
    context: {
      defaultOpen: 'defaultOpen',
      openDelay: 'TOOLTIP_DELAY_MS',
      closeDelay: 'TOOLTIP_SKIP_DELAY_MS',
      closeOnScroll: 'false',
      // No gutter: the recipe sets the gap from the trigger as a margin on the bubble, inside
      // the positioner, so it is the token's length in every renderer. Zag's own gutter is a
      // number of pixels, which a density cannot change.
      positioning: "{ placement: align === 'center' ? side : `${side}-${align}`, gutter: 0 }",
    },
  },
  presence: {
    // The bubble grows from the edge it opens on, the side and alignment the React member hands
    // its surface.
    present: {
      open: 'api.open',
      ref: 'bubble',
      binding: 'tooltip.bubble',
      side: { expr: 'side' },
      align: { expr: 'align' },
    },
  },
  // The bubble describes the control the reader focuses, not the anchor around it.
  effects: [
    { watch: 'api.open', run: 'syncTriggerAnchor(anchor, api.getTriggerProps(), api.open, false)' },
    // A scroll closes an open bubble, except while the keyboard holds its control.
    {
      watch: 'api.open',
      run: 'closeTooltipOnScroll(api.open ? anchor : null, () => api.setOpen(false))',
      release: 'ran()',
    },
  ],
  template: [
    el(
      'span',
      {
        part: 'trigger',
        class: ['anchor'],
        spread: ['anchorProps(api.getTriggerProps())'],
        ref: 'anchor',
      },
      [slot()],
    ),
    portal(
      cond('present', [
        el('div', { spread: ['api.getPositionerProps()'] }, [
          el(
            'div',
            {
              part: 'bubble',
              class: ['bubble'],
              spread: ['api.getContentProps()'],
              attrs: {
                hidden: 'undefined',
                // The recipe keys the arrival on Radix's state name; the offset keys on the side.
                'data-state': "api.open ? 'delayed-open' : 'closed'",
                // The member has no single root; the bubble is the surface, so it carries the identity.
                ...identity('Tooltip'),
              },
              // The recipe caps the bubble at the room beside its trigger, which it reads under
              // Radix's name; Zag's positioner sets it as its own variable, which the bubble
              // inherits.
              geometry: { '--radix-tooltip-content-available-width': "'var(--available-width)'" },
              ref: 'bubble',
            },
            [text('content')],
          ),
        ]),
      ]),
    ),
  ],
  states: [
    {
      name: 'closed — hover or focus the trigger',
      props: { content: 'Archive this ticket' },
      slots: {
        default: [
          fx('Button', {
            variant: 'outline',
            tone: 'neutral',
            iconOnly: true,
            icon: 'archive',
            label: 'Archive',
          }),
        ],
      },
    },
    ...SIDES.map((side) => ({
      name: `open, side ${side}`,
      props: { defaultOpen: true, side, content: `Grows out of the ${side} edge` },
      slots: { default: [fx('Button', { variant: 'outline', tone: 'neutral', label: side })] },
    })),
    {
      name: 'long content wraps at the max width',
      props: {
        defaultOpen: true,
        side: 'bottom',
        content:
          'A hint long enough to wrap onto several lines, which is already longer than a tooltip should be.',
      },
      slots: {
        default: [fx('Button', { variant: 'outline', tone: 'neutral', label: 'Long hint' })],
      },
    },
    {
      name: 'a row of them — the second opens without waiting again',
      many: {
        within: { member: 'Inline', props: { gap: 2 } },
        each: [
          {
            props: { content: 'Archive' },
            slots: {
              default: [
                fx('Button', {
                  variant: 'ghost',
                  tone: 'neutral',
                  iconOnly: true,
                  icon: 'archive',
                  label: 'Archive',
                }),
              ],
            },
          },
          {
            props: { content: 'Duplicate' },
            slots: {
              default: [
                fx('Button', {
                  variant: 'ghost',
                  tone: 'neutral',
                  iconOnly: true,
                  icon: 'duplicate',
                  label: 'Duplicate',
                }),
              ],
            },
          },
          {
            props: { content: 'Delete' },
            slots: {
              default: [
                fx('Button', {
                  variant: 'ghost',
                  tone: 'danger',
                  iconOnly: true,
                  icon: 'delete',
                  label: 'Delete',
                }),
              ],
            },
          },
        ],
      },
    },
  ],
})
