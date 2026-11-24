import {
  cond,
  describeMember,
  el,
  fx,
  held,
  hold,
  identity,
  lit,
  member,
  portal,
  slot,
  text,
  type FixtureChild,
  type StateEntry,
} from '../dsl'

/**
 * The application's side of a drawer, as React's fixture `Launcher` is: the
 * entry holds `open`, a Button opens the drawer, and the drawer reports every
 * change back. A drawer takes no trigger, because the screen owns the control
 * that opens it and the state behind it.
 */
const launched = (
  label: string,
  props: Record<string, string | boolean>,
  slots: StateEntry['slots'],
  opened = false,
): Omit<StateEntry, 'name'> => ({
  holds: { open: opened },
  before: [
    fx('Button', { variant: 'outline', tone: 'neutral', label, onClick: hold('open', true) }),
  ],
  props: { ...props, open: held('open'), onOpenChange: hold('open') },
  slots,
})

const para = (words: string): FixtureChild => ({ element: 'p', children: [words] })

const TICKET_DETAIL = [
  fx(
    'Stack',
    { gap: 4 },
    {
      default: [
        fx(
          'FormField',
          { label: 'Assignee', description: 'Whoever picks this up owns it until it closes.' },
          { default: [fx('Input', { defaultValue: 'Priya Raman' })] },
        ),
        para(
          'The customer replied twice while this sat unassigned. Both replies are on the ticket, and neither has been read.',
        ),
      ],
    },
  ),
]

const LONG_BODY = [
  fx(
    'Stack',
    { gap: 4 },
    {
      default: Array.from({ length: 14 }, (_, at) =>
        para(
          `Reply ${at + 1}. A thread long enough that it has to scroll inside the sheet while the title and the actions stay exactly where they were put.`,
        ),
      ),
    },
  ),
]

/**
 * Drawer (`design/components/drawer.md`): a modal sheet pinned to an edge. It
 * is a positioned Dialog variant, here as in React: Dialog's machine, so its
 * focus trap, initial focus, focus return, Escape and outside press, and
 * Dialog's scrim, with the drawer's positioner and panel. The panel plays
 * `drawer.panel`, the sheet pattern, from the edge `side` names, read each
 * time it enters or leaves. It closes by its ✕, the scrim and Escape, and by
 * no gesture.
 */
export default describeMember({
  member: 'Drawer',
  dir: 'overlays',
  recipe: 'overlays/drawer',
  types: {
    DrawerSide: "NonNullable<DrawerProps['side']>",
  },
  defaults: {
    side: lit('end'),
    size: lit('md'),
    dismissible: 'true',
    initialFocus: lit('primary'),
    closeLabel: lit('Close'),
  },
  // Where focus was as the drawer opened, which it returns to as it closes.
  state: { returnTo: 'null as ReturnType<typeof focusPlace>' },
  effects: [
    // Recorded as the drawer opens, before the trap moves focus into it.
    { watch: 'api.open', run: 'api.open && (returnTo = focusPlace(document.activeElement))' },
  ],
  machine: {
    of: 'dialog',
    context: {
      open: 'open',
      defaultOpen: 'defaultOpen',
      // `false` removes ✕ and ignores Escape and outside presses, forcing a choice.
      closeOnEscape: 'dismissible',
      closeOnInteractOutside: 'dismissible',
      // Dialog's focus order: the body's first tabbable, else the primary action, else ✕.
      initialFocusEl: '() => modalFocusTarget(panel, initialFocus)',
      // Dialog's return: where focus was as the drawer opened, else the element nearest it.
      finalFocusEl: '() => focusReturnTarget(returnTo, [panel])',
    },
    events: { onOpenChange: { emit: 'openChange', payload: 'details.open' } },
  },
  // The spec's `agent` fence. The machine owns the open state, controlled or not, so closing goes
  // through it and it reports `openChange`. A forced choice refuses. The panel names the drawer,
  // and a closed drawer has none.
  agent: {
    on: 'panel',
    state: { open: 'api.open' },
    actions: {
      close: `(() => {
        if (!dismissible) throw new Error('The drawer asks for a choice among its own actions.')
        if (api.open) api.setOpen(false)
      })()`,
    },
  },
  presence: {
    scrimPresent: { open: 'api.open', ref: 'scrim', binding: 'dialog.scrim' },
    panelPresent: {
      open: 'api.open',
      ref: 'panel',
      binding: 'drawer.panel',
      sheetSide: { expr: 'side' },
    },
  },
  template: portal(
    cond('scrimPresent', [
      el('div', {
        part: 'scrim',
        class: ['scrim'],
        spread: ['api.getBackdropProps()'],
        // Present through the exit, which `hidden` would cut short.
        attrs: { hidden: 'undefined' },
        ref: 'scrim',
      }),
    ]),
    cond('panelPresent', [
      // Pins the panel to an edge and takes no presses itself, so a press that misses the
      // panel lands on the scrim.
      el(
        'div',
        {
          part: 'positioner',
          class: ['positioner'],
          spread: ['api.getPositionerProps()'],
          attrs: { 'data-side': 'side' },
        },
        [
          el(
            'div',
            {
              part: 'panel',
              class: ['panel'],
              spread: ['api.getContentProps()'],
              attrs: {
                hidden: 'undefined',
                'data-side': 'side',
                'data-size': 'size',
                ...identity('Drawer'),
              },
              ref: 'panel',
            },
            [
              el('div', { part: 'header', class: ['header'] }, [
                el('div', { part: 'heading', class: ['heading'] }, [
                  el('h2', { part: 'title', class: ['title'], spread: ['api.getTitleProps()'] }, [
                    text('title'),
                  ]),
                  cond('description !== undefined', [
                    el(
                      'p',
                      {
                        part: 'description',
                        class: ['description'],
                        spread: ['api.getDescriptionProps()'],
                      },
                      [text('description')],
                    ),
                  ]),
                ]),
                cond('dismissible', [
                  el(
                    'div',
                    {
                      part: 'close',
                      class: ['close'],
                      attrs: { 'data-dialog-part': lit('close') },
                    },
                    [
                      member(
                        'Button',
                        {
                          variant: lit('ghost'),
                          tone: lit('neutral'),
                          size: lit('sm'),
                          iconOnly: 'true',
                          icon: lit('close'),
                          label: 'closeLabel',
                        },
                        { on: { click: { run: 'api.setOpen(false)' } } },
                      ),
                    ],
                  ),
                ]),
              ]),
              el(
                'div',
                { part: 'body', class: ['body'], attrs: { 'data-dialog-part': lit('body') } },
                [slot()],
              ),
              cond('slots.footer', [
                el(
                  'div',
                  {
                    part: 'footer',
                    class: ['footer'],
                    attrs: { 'data-dialog-part': lit('footer') },
                  },
                  [slot('footer')],
                ),
              ]),
            ],
          ),
        ],
      ),
    ]),
  ),
  states: [
    {
      name: 'open end — the default edge',
      ...launched(
        'Open the ticket',
        { defaultOpen: true, title: 'Ticket #4182', description: 'Refund not received' },
        { default: TICKET_DETAIL },
        true,
      ),
    },
    {
      name: 'start — the other inline edge',
      ...launched(
        'Open from the start edge',
        { side: 'start', title: 'Filters' },
        { default: [para('A filter stack is the other thing a side sheet is for.')] },
      ),
    },
    {
      name: 'bottom — as tall as its content, up to a share of the viewport',
      ...launched(
        'Open from the bottom',
        { side: 'bottom', title: 'Share this ticket' },
        {
          default: [
            para(
              'A bottom sheet sizes on the block axis, which is why its sizes are viewport shares.',
            ),
          ],
        },
      ),
    },
    {
      // Two launchers in one Stack, each holding its own drawer: the small one is the
      // entry's member, and the large one follows it.
      name: 'sizes — sm and lg',
      holds: { small: false, large: false },
      before: [
        fx('Button', {
          variant: 'outline',
          tone: 'neutral',
          label: 'Open a small sheet',
          onClick: hold('small', true),
        }),
      ],
      many: {
        within: { member: 'Stack', props: { gap: 3, align: 'start' } },
        each: [
          {
            props: {
              size: 'sm',
              title: 'Quick edit',
              open: held('small'),
              onOpenChange: hold('small'),
            },
            slots: { default: [para('Narrow enough to sit beside the page it came from.')] },
          },
        ],
        also: [
          fx('Button', {
            variant: 'outline',
            tone: 'neutral',
            label: 'Open a large sheet',
            onClick: hold('large', true),
          }),
          fx(
            'Drawer',
            {
              size: 'lg',
              title: 'Full ticket history',
              open: held('large'),
              onOpenChange: hold('large'),
            },
            { default: [para('Wide enough for a table, which is the reason the size exists.')] },
          ),
        ],
      },
    },
    {
      name: 'with a footer — one primary action, rightmost',
      ...launched(
        'Open with actions',
        { title: 'Reassign ticket', description: 'The current owner is told either way.' },
        {
          default: TICKET_DETAIL,
          footer: [
            fx('Button', { variant: 'outline', tone: 'neutral', label: 'Cancel' }),
            fx('Button', { label: 'Reassign' }),
          ],
        },
      ),
    },
    {
      name: 'forced choice — no ✕, no Escape, no outside click',
      ...launched(
        'Open a forced choice',
        {
          dismissible: false,
          title: 'Finish the handover',
          description: 'This one cannot be waved away.',
        },
        {
          default: [
            para('Use sparingly. The footer is the only way out, so it had better contain one.'),
          ],
          footer: [fx('Button', { label: 'Hand over' })],
        },
      ),
    },
    {
      name: 'scrolling body — the header and the footer stay put',
      ...launched(
        'Open a long thread',
        { title: 'Ticket #4182', description: 'Fourteen replies' },
        { default: LONG_BODY, footer: [fx('Button', { label: 'Reply' })] },
      ),
    },
  ],
})
