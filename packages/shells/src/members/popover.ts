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

const TRIGGER = [
  fx('Button', { variant: 'outline', tone: 'neutral', icon: 'filter', label: 'Configure' }),
]

const BODY: FixtureChild[] = [
  fx(
    'Stack',
    { gap: 4 },
    {
      default: [
        fx(
          'FormField',
          { label: 'Older than', description: 'In days.' },
          {
            default: [fx('Input', { type: 'text', defaultValue: '30' })],
          },
        ),
        fx(
          'Inline',
          { gap: 3, justify: 'end' },
          {
            default: [
              fx('Button', { variant: 'ghost', tone: 'neutral', size: 'sm', label: 'Reset' }),
              fx('Button', { size: 'sm', label: 'Apply' }),
            ],
          },
        ),
      ],
    },
  ),
]

/** `open` or `closed`, for the sheet's scrim, whose recipe keys pointer events on it. */
const SHEET_STATE = "api.open ? 'open' : 'closed'"

/**
 * Popover (`design/components/popover.md`): a small, non-modal panel anchored
 * to its trigger.
 *
 * `presentation: 'sheet'` is the application's opt-in for a form-like
 * popover: below the sheet presentation's threshold (`phone`) the panel is a
 * bottom sheet, and modal, as the spec states: the machine's modal mode traps
 * focus in it, hides the page from assistive software and locks the page's
 * scroll, and a press on the scrim or Escape dismisses it. `'auto'` never
 * becomes a sheet, because the member's contract is non-modal.
 */
export default describeMember({
  member: 'Popover',
  dir: 'overlays',
  recipe: 'overlays/popover',
  types: {
    PopoverAlign: "NonNullable<PopoverProps['align']>",
    PopoverSide: "NonNullable<PopoverProps['side']>",
  },
  recipes: { triggerAnchor: 'overlays/trigger-anchor', sheet: 'overlays/sheet' },
  defaults: { side: lit('bottom'), align: lit('start'), presentation: lit('auto') },
  media: { phone: 'phone' },
  derived: { sheeting: "presentation === 'sheet' && phone" },
  machine: {
    of: 'popover',
    context: {
      open: 'open',
      defaultOpen: 'defaultOpen',
      modal: 'sheeting',
      // Four pixels off the trigger, where menus and selects take two: a popover is
      // a surface with its own content, set slightly apart.
      positioning:
        "{ placement: align === 'center' ? side : `${side}-${align}`, offset: { mainAxis: 4 } }",
    },
    events: { onOpenChange: { emit: 'openChange', payload: 'details.open' } },
  },
  // The spec's `agent` fence. The machine owns the open state, controlled or not, so closing goes
  // through it and it reports `openChange`. The named panel names the popover: the anchored panel,
  // or the sheet's panel below the threshold. A closed popover has none.
  agent: {
    on: 'panel',
    element: 'panel ?? sheetPanel',
    // Inside a member that reads this panel (ColorInput), that member registers in its place.
    unless: 'lender',
    state: { open: 'api.open' },
    actions: { close: 'api.open && api.setOpen(false)' },
  },
  presence: {
    // The anchored panel's recipe animates it; the sheet's panel and scrim play their bindings.
    present: { open: 'api.open && !sheeting', ref: 'panel' },
    sheetPresent: {
      open: 'api.open && sheeting',
      ref: 'sheetPanel',
      binding: 'sheet.panel',
      sheetSide: 'bottom',
    },
    scrimPresent: { open: 'api.open && sheeting', ref: 'scrim', binding: 'dialog.scrim' },
  },
  effects: [
    { watch: 'api.open', run: 'syncTriggerAnchor(anchor, api.getTriggerProps(), api.open)' },
    // A member that draws this Popover as one of its own parts (ColorInput) reads the panel
    // through its holder, because its agent handle withholds the panel.
    { run: 'lender && (lender.element = () => panel ?? sheetPanel)' },
  ],
  template: [
    // The machine's trigger is an anchor around the caller's control; the ARIA moves onto the control.
    el(
      'span',
      {
        part: 'trigger',
        class: ['triggerAnchor.anchor'],
        spread: ['anchorProps(api.getTriggerProps())'],
        ref: 'anchor',
      },
      [slot('trigger')],
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
              attrs: {
                // Present through the exit, which `hidden` would cut short; named by `label`.
                hidden: 'undefined',
                'aria-labelledby': 'undefined',
                'aria-describedby': 'undefined',
                'aria-label': 'label',
                ...identity('Popover'),
              },
              // The recipe reads the anchored origin under Radix's name; Zag's positioner
              // sets it as its own variable, which the panel inherits.
              geometry: { '--radix-popover-content-transform-origin': "'var(--transform-origin)'" },
              ref: 'panel',
            },
            [slot()],
          ),
        ]),
      ]),
      // The sheet: a press on the scrim is outside the panel, so the machine closes it.
      cond('scrimPresent', [
        el('div', { class: ['sheet.scrim'], attrs: { 'data-state': SHEET_STATE }, ref: 'scrim' }),
      ]),
      cond('sheetPresent', [
        el('div', { class: ['sheet.positioner'] }, [
          // The sheet's panel is the machine's content: the dialog it names, and the
          // boundary its focus trap holds.
          el(
            'div',
            {
              class: ['sheet.panel'],
              spread: ['api.getContentProps()'],
              attrs: {
                hidden: 'undefined',
                'aria-labelledby': 'undefined',
                'aria-describedby': 'undefined',
                'aria-label': 'label',
                'data-presentation': lit('sheet'),
              },
              ref: 'sheetPanel',
            },
            [
              // The sheet's panel is the shared anatomy, so the member's identity goes on
              // the one element inside it that the member owns.
              el('div', { part: 'panel', class: ['sheetBody'], attrs: identity('Popover') }, [
                slot(),
              ]),
            ],
          ),
        ]),
      ]),
    ),
  ],
  states: [
    {
      name: 'closed',
      props: { label: 'Filter configuration' },
      slots: { trigger: TRIGGER, default: BODY },
    },
    {
      name: 'open — a small form the reader can walk away from',
      props: { defaultOpen: true, label: 'Filter configuration' },
      slots: { trigger: TRIGGER, default: BODY },
    },
    {
      name: 'above its trigger',
      props: { defaultOpen: true, side: 'top', label: 'Filter configuration' },
      slots: { trigger: TRIGGER, default: BODY },
    },
    {
      name: 'aligned to the end',
      props: { defaultOpen: true, align: 'end', label: 'Filter configuration' },
      slots: { trigger: TRIGGER, default: BODY },
    },
    {
      name: 'text content, still a named panel',
      props: { defaultOpen: true, label: 'About retries' },
      slots: {
        trigger: TRIGGER,
        default: [
          {
            element: 'p',
            children: ['Retries back off exponentially and stop after six attempts.'],
          },
        ],
      },
    },
  ],
})
