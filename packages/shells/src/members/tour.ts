import {
  cond,
  describeMember,
  el,
  fx,
  identity,
  lit,
  member,
  portal,
  slot,
  text,
  type FixtureChild,
  type FixtureValue,
  type StateEntry,
} from '../dsl'

/**
 * Three steps over a small page of three targets, the targets named after the
 * entry, as the React fixture names them: a target's name is the page's, and
 * the gallery draws every entry on one page.
 */
const steps = (entry: string, side?: string): FixtureValue[] =>
  [
    { id: 'create', title: 'Create a ticket', body: 'Start here to log a new request.' },
    { id: 'filter', title: 'Narrow the list', body: 'Filter tickets by status, owner or tag.' },
    {
      id: 'export',
      title: 'Take the list with you',
      body: 'Export the tickets you see as a file.',
    },
  ].map((step) => ({ ...step, target: `${entry}-${step.id}`, ...(side ? { side } : {}) }))

/** The page the tour walks through: three controls, each a target. */
const page = (entry: string): FixtureChild[] => [
  fx(
    'Inline',
    { gap: 3 },
    {
      default: [
        fx(
          'TourTarget',
          { name: `${entry}-create` },
          { default: [fx('Button', { label: 'New ticket', icon: 'add' })] },
        ),
        fx(
          'TourTarget',
          { name: `${entry}-filter` },
          {
            default: [
              fx('Button', {
                variant: 'outline',
                tone: 'neutral',
                icon: 'filter',
                label: 'Filter',
              }),
            ],
          },
        ),
        fx(
          'TourTarget',
          { name: `${entry}-export` },
          { default: [fx('Button', { variant: 'ghost', tone: 'neutral', label: 'Export' })] },
        ),
      ],
    },
  ),
]

/** An entry that renders the tour above its page, as the React fixture does. */
const onPage = (
  name: string,
  entry: string,
  props: Readonly<Record<string, FixtureValue>>,
): StateEntry => ({
  name,
  many: { within: { member: 'Stack', props: { gap: 4 } }, each: [{ props }], also: page(entry) },
})

/** The rectangle the engine measured, written as the recipe reads it, or nothing without one. */
const hole = (field: 'x' | 'y' | 'width' | 'height') =>
  `cutOut === null ? undefined : \`\${cutOut.${field}}px\``

/**
 * Tour (`design/components/tour.md`): a short walk through the parts of a
 * page, one step at a time, which the reader can leave at any step.
 *
 * Each step's panel is Zag's dialog machine, modal as Dialog's is: it traps
 * focus, hides the page from assistive software and turns the page's pointer
 * events off. It keeps the page's scroll, as the React member does, so the
 * panel and the cut-out follow the target. The engine finds the target
 * (`tourTarget`), measures it (`tourTargetRect`), scrolls it into view
 * (`revealTourTarget`) and places the panel (`tourPlacement`), as it does for
 * the React member. A press outside ends nothing; Escape and the close control
 * end the tour as dismissed, and the last step's control as finished.
 */
export default describeMember({
  member: 'Tour',
  dir: 'overlays',
  recipe: 'overlays/tour',
  types: {
    // One step: the target it points at, if any, and what it says about it.
    TourStep: `{
      /** The step's key, unique in the tour. */
      id: string
      /** The \`name\` of the \`Tour.Target\` the step points at. Without one, the step is drawn centred. */
      target?: string
      title: string
      /** A sentence or two about the target, as text. */
      body: string
      /** The side of the target the panel opens on, when it fits there. */
      side?: 'top' | 'right' | 'bottom' | 'left'
    }`,
    // The words the member writes itself, localized by passing every key or none, so one
    // Tour never mixes two languages. The position is a function, because word order
    // belongs to the application's catalog.
    TourMessages: `{
      next: string
      previous: string
      /** The last step's forward control, which ends the tour. */
      done: string
      /** The close control's accessible name. */
      close: string
      /** The position line, counting from 1: "Step 2 of 5". */
      position: (position: number, count: number) => string
    }`,
    TourEnd: "'finished' | 'dismissed'",
  },
  defaults: {
    messages:
      "() => ({ next: 'Next', previous: 'Previous', done: 'Done', close: 'Close', position: (position: number, count: number) => `Step ${position} of ${count}` })",
  },
  state: {
    uncontrolledStep: 'defaultStep ?? 0',
    // Why the panel is closing, set by the control that closes it; Escape leaves it unset.
    ending: "null as 'finished' | 'dismissed' | null",
    // The panel's corner, its placement and the target's rectangle, as the engine measured them.
    geometry:
      "null as { x: number; y: number; placement: 'top' | 'right' | 'bottom' | 'left' | 'center'; hole: { x: number; y: number; width: number; height: number } | null } | null",
  },
  derived: {
    count: 'steps.length',
    index: 'Math.min(Math.max(step ?? uncontrolledStep, 0), Math.max(count - 1, 0))',
    current: 'steps[index]',
    first: 'index === 0',
    last: 'index === count - 1',
    drawnAt: "geometry?.placement ?? 'center'",
    cutOut: 'geometry?.hole ?? null',
    go: "(next: number): void => { uncontrolledStep = next; emit('stepChange', next) }",
    end: "(reason: 'finished' | 'dismissed'): void => { ending = reason; api.setOpen(false) }",
    // The machine reports every close, Escape's too; the reason is the control's, else dismissed.
    closed:
      "(open: boolean): void => { if (open) return; const reason = ending ?? 'dismissed'; ending = null; emit('end', reason) }",
    // Measures the target and the panel's box, and places the panel and the cut-out.
    place:
      '(): void => { if (positioner == null || current === undefined) return; const rect = tourTargetRect(tourTarget(current.target)); const next = { ...tourPlacement(rect, { width: positioner.offsetWidth, height: positioner.offsetHeight }, tourViewport(), current.side), hole: rect }; if (JSON.stringify(next) !== JSON.stringify(geometry)) geometry = next }',
    // A step that opens brings its target into view, then places its panel, and again a frame
    // later, by when a portal that mounts on its own schedule has drawn the panel.
    show: '(): void => { if (!api.open || current === undefined) return; revealTourTarget(tourTarget(current.target)); place(); requestAnimationFrame(() => place()) }',
    // Places the panel again whenever the window resizes or anything on the page scrolls, and
    // returns what stops it.
    follow:
      "(): (() => void) => { const again = (): void => place(); window.addEventListener('resize', again); document.addEventListener('scroll', again, { capture: true, passive: true }); return () => { window.removeEventListener('resize', again); document.removeEventListener('scroll', again, { capture: true }) } }",
  },
  machine: {
    of: 'dialog',
    context: {
      open: 'open === undefined ? undefined : open && count > 0',
      defaultOpen: 'defaultOpen === true && count > 0',
      // The page keeps its scroll, so the panel and the cut-out follow the target.
      preventScroll: 'false',
      // A press on the page ends nothing; Escape and the close control do.
      closeOnInteractOutside: 'false',
      // The panel takes focus, so assistive software reads the step's title, body and position.
      initialFocusEl: '() => panel',
    },
    events: { onOpenChange: { run: 'closed(details.open)' } },
  },
  presence: {
    scrimPresent: {
      open: 'api.open && current !== undefined',
      ref: 'scrim',
      binding: 'dialog.scrim',
    },
    // Popover's motion, from the side the panel opens on; centred, from its middle.
    panelPresent: {
      open: 'api.open && current !== undefined',
      ref: 'panel',
      binding: 'popover.panel',
      side: { expr: "drawnAt === 'center' ? undefined : drawnAt" },
      align: 'center',
    },
  },
  effects: [
    { watch: '[api.open, index]', run: 'show()' },
    // The panel follows its target when its own size changes, when the window resizes and when
    // anything on the page scrolls.
    { watch: 'api.open', run: 'place()', resize: ['positioner'] },
    { watch: 'api.open', run: 'follow()', release: 'ran()' },
    // A later step moves focus to the panel too, so its title, body and position are read once.
    { watch: 'index', mount: false, run: 'api.open && panel?.focus()' },
  ],
  // The spec's `agent` fence. A move goes through `go` and an end through `end`, so the member
  // reports `stepChange` and `end` as it does for a person's controls. A move is refused where its
  // control is absent, and on the last step, whose Done is the reader's. The panel names the tour,
  // and it is withheld, because every control in it is the tour's own.
  agent: {
    on: 'panel',
    state: {
      open: 'api.open',
      step: 'index',
      steps: 'steps.map((each) => ({ id: each.id, title: each.title, body: each.body }))',
    },
    actions: {
      next: `(() => {
        if (!api.open) throw new Error('The tour is not open.')
        if (last) throw new Error('On the last step, an agent ends a tour with dismiss.')
        go(index + 1)
      })()`,
      previous: `(() => {
        if (!api.open) throw new Error('The tour is not open.')
        if (first) throw new Error('This is the first step.')
        go(index - 1)
      })()`,
      dismiss: "api.open && end('dismissed')",
    },
    withholds: 'panel',
  },
  parts: [
    {
      name: 'Target',
      public: true,
      purpose: 'the part a step points at, which adds no box',
      props: {
        name: { type: 'string', doc: "The name a step's `target` uses." },
        children: { type: 'ReactNode', doc: 'The part the step points at.' },
      },
      template: el('span', { class: ['target'], attrs: { 'data-tour-target': 'name' } }, [slot()]),
    },
  ],
  template: [
    portal(
      // The scrim, with a cut-out around the target when the step has one. It is decorative:
      // the step's words say what it points at.
      cond('scrimPresent', [
        el('div', {
          part: 'scrim',
          class: [
            { name: 'spotlight', when: 'cutOut !== null' },
            { name: 'scrim', when: 'cutOut === null' },
          ],
          spread: ['api.getBackdropProps()'],
          attrs: {
            hidden: 'undefined',
            'aria-hidden': lit('true'),
            'data-tour-part': lit('scrim'),
          },
          geometry: {
            '--pm-tour-hole-x': hole('x'),
            '--pm-tour-hole-y': hole('y'),
            '--pm-tour-hole-width': hole('width'),
            '--pm-tour-hole-height': hole('height'),
          },
          ref: 'scrim',
        }),
      ]),
      cond('panelPresent', [
        // Placed by the engine; it is the panel's box with its margin.
        el(
          'div',
          {
            class: ['positioner'],
            spread: ['api.getPositionerProps()'],
            attrs: { 'data-placement': 'drawnAt' },
            geometry: {
              '--pm-tour-x': '`${geometry?.x ?? 0}px`',
              '--pm-tour-y': '`${geometry?.y ?? 0}px`',
            },
            ref: 'positioner',
          },
          [
            el(
              'div',
              {
                part: 'panel',
                class: ['panel'],
                spread: ['api.getContentProps()'],
                attrs: {
                  // Present through the exit, which `hidden` would cut short.
                  hidden: 'undefined',
                  'data-step': 'current?.id',
                  ...identity('Tour'),
                },
                ref: 'panel',
              },
              [
                el('h2', { part: 'title', class: ['title'], spread: ['api.getTitleProps()'] }, [
                  text('current?.title'),
                ]),
                // The description is the body and the position, so the position is read once,
                // with the step, and is no live region of its own.
                el(
                  'div',
                  {
                    part: 'description',
                    class: ['description'],
                    spread: ['api.getDescriptionProps()'],
                  },
                  [
                    el('p', { part: 'body', class: ['body'] }, [text('current?.body')]),
                    el(
                      'p',
                      {
                        part: 'position',
                        class: ['position'],
                        attrs: { 'data-tour-part': lit('position') },
                      },
                      [text('messages.position(index + 1, count)')],
                    ),
                  ],
                ),
                el(
                  'div',
                  {
                    part: 'actions',
                    class: ['actions'],
                    attrs: { 'data-tour-part': lit('actions') },
                  },
                  [
                    cond('!first', [
                      member(
                        'Button',
                        {
                          variant: lit('outline'),
                          tone: lit('neutral'),
                          size: lit('sm'),
                          label: 'messages.previous',
                        },
                        { on: { click: { run: 'go(index - 1)' } } },
                      ),
                    ]),
                    member(
                      'Button',
                      { size: lit('sm'), label: 'last ? messages.done : messages.next' },
                      { on: { click: { run: "last ? end('finished') : go(index + 1)" } } },
                    ),
                  ],
                ),
                el(
                  'div',
                  { part: 'close', class: ['close'], attrs: { 'data-tour-part': lit('close') } },
                  [
                    member(
                      'Button',
                      {
                        variant: lit('ghost'),
                        tone: lit('neutral'),
                        size: lit('sm'),
                        iconOnly: 'true',
                        icon: lit('close'),
                        label: 'messages.close',
                      },
                      { on: { click: { run: "end('dismissed')" } } },
                    ),
                  ],
                ),
              ],
            ),
          ],
        ),
      ]),
    ),
  ],
  states: [
    onPage('first step — below its target, with no Previous', 'first', {
      defaultOpen: true,
      steps: steps('first'),
    }),
    onPage('middle step — Previous and Next', 'middle', {
      defaultOpen: true,
      defaultStep: 1,
      steps: steps('middle'),
    }),
    onPage('last step — Done ends the tour', 'last', {
      defaultOpen: true,
      defaultStep: 2,
      steps: steps('last'),
    }),
    onPage('a step with no target, drawn centred', 'none', {
      defaultOpen: true,
      steps: [
        {
          id: 'welcome',
          title: 'Welcome to the queue',
          body: 'Three things to know before you start.',
        },
        ...steps('none'),
      ],
    }),
    onPage('a step whose target is not on the page, drawn centred', 'missing', {
      defaultOpen: true,
      steps: [
        {
          id: 'assign',
          target: 'missing-assign',
          title: 'Assign it',
          body: 'Give the ticket an owner from its own page.',
        },
      ],
    }),
    onPage('above its target', 'top', {
      defaultOpen: true,
      defaultStep: 1,
      steps: steps('top', 'top'),
    }),
    onPage('beside its target', 'right', {
      defaultOpen: true,
      defaultStep: 1,
      steps: steps('right', 'right'),
    }),
  ],
})
