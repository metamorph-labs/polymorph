import { cond, describeMember, el, fx, lit, member, portal, slot, text } from '../dsl'

const open = (label: string, extra: Record<string, string> = {}) => [
  fx('Button', { label, ...extra }),
]

/**
 * Dialog (`design/components/dialog.md`): a modal panel over a scrim. The
 * panel carries the identity of a member that composes Dialog for its panel
 * and lends it (ConfirmDialog), and Dialog's own otherwise.
 */
export default describeMember({
  member: 'Dialog',
  dir: 'overlays',
  recipe: 'overlays/dialog',
  defaults: {
    closeLabel: lit('Close'),
    size: lit('md'),
    dismissible: 'true',
    initialFocus: lit('primary'),
    alert: 'false',
    presentation: lit('auto'),
  },
  media: { phone: 'phone' },
  // The control whose press opened the panel, and where focus returns as the panel closes:
  // that control, or what had focus when the panel opened without a press, as Radix returns
  // focus to its trigger. The machine alone returns focus to where it was before the panel
  // opened, and a press leaves a button unfocused in WebKit. When that element has left the
  // page by the time the panel closes, focus goes to the focusable element nearest where it was
  // (`focusReturnTarget`).
  state: {
    pressed: 'null as HTMLElement | null',
    returnTo: 'null as ReturnType<typeof focusPlace>',
  },
  machine: {
    of: 'dialog',
    context: {
      open: 'open',
      defaultOpen: 'defaultOpen',
      role: "alert ? 'alertdialog' : 'dialog'",
      // `false` removes ✕ and ignores Escape and outside presses, forcing a choice.
      closeOnEscape: 'dismissible',
      closeOnInteractOutside: 'dismissible',
      initialFocusEl: '() => modalFocusTarget(panel, initialFocus)',
      finalFocusEl: '() => focusReturnTarget(returnTo, [panel])',
    },
    events: { onOpenChange: { emit: 'openChange', payload: 'details.open' } },
  },
  derived: {
    // The sheet form only with `'sheet'` and below the overlay class's threshold.
    sheet: "presentation === 'sheet' && phone",
    // The trigger's click: it opens the panel and records the control that was pressed.
    openFrom: `(event?: Event) => {
      if (event?.currentTarget instanceof HTMLElement) pressed = event.currentTarget
      api.setOpen(true)
    }`,
  },
  // A member that lends this one its identity (ConfirmDialog) reads the panel through its
  // holder, because its agent handle names and withholds the panel.
  effects: [
    { run: 'lender && (lender.element = () => panel)' },
    // Where focus returns is recorded as the panel opens, before the trap moves focus into it.
    {
      watch: 'api.open',
      run: 'api.open && ((returnTo = focusPlace(pressed ?? document.activeElement)), (pressed = null))',
    },
  ],
  // The spec's `agent` fence. The machine owns the open state, controlled or not, so closing goes
  // through it and it reports `openChange`. A non-dismissible dialog asks for a choice among its
  // own actions, so it refuses. The panel names the dialog, and a closed dialog has none.
  agent: {
    on: 'panel',
    // Inside a member that reads this panel (ConfirmDialog), that member registers in its place.
    unless: 'lender',
    state: { open: 'api.open' },
    actions: {
      close: `(() => {
        if (!dismissible) throw new Error('The dialog asks for a choice among its own actions.')
        api.setOpen(false)
      })()`,
    },
  },
  presence: {
    scrimPresent: { open: 'api.open', ref: 'scrim', binding: 'dialog.scrim' },
    // The sheet form's panel rises from the bottom edge, as the sheet presentation's does.
    panelPresent: {
      open: 'api.open',
      ref: 'panel',
      binding: { expr: "sheet ? 'sheet.panel' : 'dialog.panel'" },
      sheetSide: 'bottom',
    },
  },
  template: [
    // The caller's control opens the panel; it receives the click handler, as React clones it.
    slot('trigger', { pass: { onClick: 'openFrom' } }),
    portal(
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
        el(
          'div',
          {
            class: [
              { name: 'sheetPositioner', when: 'sheet' },
              { name: 'positioner', when: '!sheet' },
            ],
            spread: ['api.getPositionerProps()'],
          },
          [
            el(
              'div',
              {
                part: 'panel',
                class: [
                  { name: 'sheetPanel', when: 'sheet' },
                  { name: 'panel', when: '!sheet' },
                ],
                spread: ['api.getContentProps()'],
                attrs: {
                  hidden: 'undefined',
                  'data-presentation': "sheet ? 'sheet' : undefined",
                  'data-size': 'size',
                  // A member with no panel of its own (ConfirmDialog) lends its identity.
                  'data-member': "lent ?? 'dialog'",
                },
                ref: 'panel',
              },
              [
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
              ],
            ),
          ],
        ),
      ]),
    ),
  ],
  states: [
    {
      name: 'plain',
      props: { title: 'Discard this ticket?' },
      slots: {
        trigger: open('Open'),
        default: [
          {
            element: 'p',
            children: ['This is the body. It holds whatever the screen needs it to hold.'],
          },
        ],
      },
    },
    {
      name: 'described',
      props: { title: 'Discard this ticket?', description: 'Nothing you typed is kept.' },
      slots: {
        trigger: open('Open'),
        default: [
          {
            element: 'p',
            children: ['The description sits under the title, and is what a reader is told first.'],
          },
        ],
      },
    },
    {
      name: 'open md — the panel itself, at the size it defaults to',
      props: {
        defaultOpen: true,
        title: 'Discard this ticket?',
        description: 'Nothing you typed is kept.',
      },
      slots: {
        trigger: open('Open'),
        default: [
          {
            element: 'p',
            children: ['The panel is portalled, so this is the entry that shows it at all.'],
          },
        ],
        footer: [fx('Button', { tone: 'danger', label: 'Discard' })],
      },
    },
    {
      name: 'sizes',
      many: {
        within: { member: 'Stack', props: { gap: 3, align: 'start' } },
        each: (['sm', 'md', 'lg'] as const).map((size) => ({
          props: {
            size,
            title: `A ${size} dialog`,
            description:
              'Widths are space-scale arithmetic, so a roomier theme gets roomier dialogs.',
          },
          slots: {
            trigger: open(`Open ${size}`, { variant: 'outline', tone: 'neutral' }),
            default: [{ element: 'p', children: ['Body.'] }],
          },
        })),
      },
    },
    {
      name: 'with a footer — one primary action, rightmost',
      props: { title: 'Discard this ticket?', description: 'Nothing you typed is kept.' },
      slots: {
        trigger: open('Discard…', { tone: 'danger' }),
        default: [
          {
            element: 'p',
            children: ['The primary action sits rightmost, and it is the only solid one.'],
          },
        ],
        footer: [
          fx('Button', { variant: 'outline', tone: 'neutral', label: 'Keep editing' }),
          fx('Button', { tone: 'danger', label: 'Discard' }),
        ],
      },
    },
    {
      name: 'with a form — focus lands in the body, not on ✕',
      props: { title: 'New ticket', description: 'Focus starts in the first field.' },
      slots: {
        trigger: open('New ticket', { icon: 'add' }),
        default: [
          fx(
            'Stack',
            { gap: 4 },
            {
              default: [
                fx(
                  'FormField',
                  { label: 'Subject', description: 'One line, as the customer would say it.' },
                  { default: [fx('Input', { placeholder: 'What went wrong?' })] },
                ),
              ],
            },
          ),
        ],
        footer: [fx('Button', { label: 'Create' })],
      },
    },
    {
      name: 'non-dismissible — no ✕, no Escape, no outside click',
      props: {
        dismissible: false,
        title: 'Choose one',
        description: 'This one cannot be waved away.',
      },
      slots: {
        trigger: open('Open a forced choice', { variant: 'outline', tone: 'neutral' }),
        default: [{ element: 'p', children: ['A forced choice. Use sparingly.'] }],
        footer: [
          fx('Button', { variant: 'outline', tone: 'neutral', label: 'Cancel' }),
          fx('Button', { label: 'Continue' }),
        ],
      },
    },
    {
      name: 'scrolling body — header and footer stay put',
      props: { title: 'Long body', description: 'The body scrolls; nothing else does.' },
      slots: {
        trigger: open('Open a long dialog', { variant: 'outline', tone: 'neutral' }),
        default: Array.from({ length: 12 }, (_, at) => ({
          element: 'p',
          children: [
            `Paragraph ${at + 1}. A body long enough to scroll keeps its header and its footer in place, so the title and the actions stay in reach.`,
          ],
        })),
        footer: [fx('Button', { label: 'Done' })],
      },
    },
  ],
})
