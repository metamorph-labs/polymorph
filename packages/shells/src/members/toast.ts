import {
  cond,
  describeMember,
  each,
  el,
  fx,
  identity,
  js,
  lit,
  member,
  render,
  run,
  text,
  type FixtureChild,
  type FixtureValue,
} from '../dsl'

/* -------------------------------------------------------------------------- */
/* The fixture                                                                */
/* -------------------------------------------------------------------------- */

const TONES = ['neutral', 'success', 'danger', 'warning', 'info'] as const

/**
 * Reports a call of a notice's handler on `document`, for the conformance runner's agent law, as
 * the React fixture's notices do: a notice is a record of the store and not a prop of the
 * viewport the entry mounts, so the runner cannot pass the handler a spy.
 */
const reports = (handler: string): FixtureValue =>
  js(
    `() => document.dispatchEvent(new CustomEvent('polymorph:fixturecall', { detail: '${handler}' }))`,
  )

/**
 * The viewport's examples, raised by declared Toasts, pinned so there is something to see. The
 * first has an action, so an agent's answer to the first notice can run it.
 */
const PINNED: Readonly<Record<string, FixtureValue>>[] = [
  {
    title: 'Ticket archived',
    tone: 'success',
    action: { label: 'Undo', onClick: reports('onClick') },
    onDismiss: reports('onDismiss'),
  },
  { title: 'Ticket created', onDismiss: reports('onDismiss') },
  {
    title: 'Ticket assigned',
    description: 'Sent to the triage queue.',
    onDismiss: reports('onDismiss'),
  },
]

/** A launcher: a Button that raises a real toast into whichever viewport is on the page. */
const launcher = (
  label: string,
  raise: string,
  variant = 'outline',
  tone = 'neutral',
): FixtureChild => fx('Button', { variant, tone, size: 'sm', label, onClick: js(raise) })

/** Launchers in a row, as React's fixture lays them out. */
const raise = (...buttons: FixtureChild[]) => ({
  many: {
    within: { member: 'Inline', props: { gap: 2, wrap: true } },
    each: [],
    also: buttons,
  },
})

/* -------------------------------------------------------------------------- */
/* The member                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Toast (`design/components/toast.md`): notifications raised imperatively,
 * reporting the outcome of an action.
 *
 * The API is the foundation's toast store, the engine's `createToastStore`
 * that React's is: `toast(options)` raises a toast from anywhere, and the
 * viewport, `Toast.Viewport`, mounted once, draws it. React has no `<Toast>`
 * to render; its registry props are the options of `toast()`. So `Toast`
 * here takes those options as props and is a toast declared in a template:
 * while it is mounted its toast is in the viewport, raised again when its `id`
 * or `title` changes, updated in place while it is showing when anything else
 * does, and removed when it unmounts. It emits `dismiss` when its toast leaves
 * without it, by dismissal, timeout or eviction, and not when it unmounts. It
 * renders nothing itself. Its lifetime is the store's rule for its tone unless
 * it sets `retained` or `durationMs`, as React's ToastNotice's is. In
 * development it warns when no viewport is in the document once it has
 * mounted, as React's ToastNotice warns with no ToastHost, because nothing
 * draws its toast.
 *
 * The viewport is React's Toaster: a labelled region around the list, which
 * F8 focuses; a card per toast, entering and leaving with `toast.enter`; a
 * timer per card, held while the reader hovers or focuses the notifications
 * or the window is in the background (`holdToastTimers`), and none for a
 * pinned toast or one the reader cannot dismiss; Escape, the close button and
 * a swipe to the right dismiss a dismissible card; and a polite and an
 * assertive live region, which say a toast as it is raised or updated
 * (`announceToasts`): danger interrupts, and the other tones, warning included,
 * wait.
 * Escape reaches a card only while focus is in it, and an Escape a control in
 * the content has handled, or an input method is handling, is not the card's.
 * Focus in a card whose toast leaves, by any route, moves to the next toast,
 * else the previous one, else where it came from as it entered the list
 * (`focusAfterToast`, `followToastFocus`). A card that has played its exit is
 * removed from the store.
 */
export default describeMember({
  member: 'Toast',
  dir: 'overlays',
  recipe: 'overlays/toast',
  recipes: { a11y: 'conventions/a11y' },
  types: { ToasterMessages: '{ dismiss: string; notification: string; viewport: string }' },
  derived: {
    toastId: 'id ?? uid',
    // What it raises: its props, its id, its content as a node the viewport draws, and the
    // store's word that the toast left, as the member's event.
    options:
      "{ id: toastId, title, description, tone, action, durationMs, dismissible, retained, content: slotNode(slots.content), onDismiss: () => emit('dismiss') }",
  },
  effects: [
    // Raised on mount, and again under a new id or title, after the old one is removed.
    { watch: '[toastId, title]', run: 'toast(options)', release: 'removeToast(ran)' },
    // An update in place, while the toast is showing: a dismissal stays a dismissal.
    {
      watch: 'options',
      mount: false,
      run: 'getToasts().some((record) => record.id === toastId && record.closing !== true) && toast(options)',
    },
    // Development warning: a toast nothing draws. It waits a turn after mount, so a viewport
    // mounted after this Toast in the same render counts. It reads the document for the
    // viewport's list (`data-toast-part="list"`, the hook the conformance runner finds the
    // viewport by), so no foundation keeps a count of viewports.
    {
      delay: '0',
      run: 'devWarning(document.querySelector(\'[data-toast-part="list"]\') === null, `Toast "${title}" rendered with no Toast viewport mounted, so nothing draws it. Mount the viewport once at the application root, outside any error boundary whose fallback renders a Toast.`)',
    },
  ],
  template: [],
  parts: [
    {
      name: 'Viewport',
      public: true,
      purpose: 'the one viewport the application mounts, which draws every toast the store holds',
      props: {
        messages: {
          type: 'ToasterMessages',
          optional: true,
          doc: 'The close button’s name, the announcement’s prefix and the region’s name, from the catalog.',
        },
      },
      state: {
        // Moves each time the store changes, so the records are read again.
        version: '0',
        // The reader is on the notifications, or the window is in the background: the timers wait.
        paused: 'false',
        // What the live regions say, and what each showing toast was said for.
        said: 'TOAST_QUIET',
      },
      derived: {
        say: "messages ?? { dismiss: 'Dismiss', notification: 'Notification', viewport: 'Notifications (F8)' }",
        records: 'version < 0 ? [] : getToasts()',
      },
      effects: [
        // The store is followed while the viewport is mounted, and read again as it starts to,
        // for the toasts raised before it was.
        { run: '((version += 1), subscribeToasts(() => { version += 1 }))', release: 'ran()' },
        // F8, from anywhere on the page, moves focus to the list.
        {
          listen: 'keydown',
          run: "$event.key === 'F8' && ($event.preventDefault(), list?.focus())",
        },
        // What holds the timers: focus or the pointer on the notifications, or the window in
        // the background.
        { run: 'holdToastTimers(region, (held) => { paused = held })', release: 'ran()' },
        // Focus in a card that leaves the page by any route moves on, and the list records where
        // focus came from as it enters.
        { run: 'followToastFocus(list)', release: 'ran()' },
        // A toast is said as it is raised, and again when an update changes its words, read
        // once the change is drawn, because a toast's content is read from its card. It follows
        // `version`, which also moves as the viewport mounts and draws the toasts raised before.
        { watch: 'version', run: 'said = announceToasts(said, records, list, say.notification)' },
      ],
      // The spec's `agent` fence, registered as `Toast`, because the member renders nothing and
      // its viewport shows its notices. A notice is a record of the store, so the viewport reads
      // the store, and an agent answers a notice through the store's own functions, as its card's
      // controls do. The labelled region names the viewport, which is in the document with no
      // notice too. The cards' own Buttons, each in a `div` after the card's text, are withheld,
      // and a notice's content is the application's.
      agent: {
        on: 'region',
        state: { notices: 'toastNotices(getToasts())', details: 'toastDetails(getToasts())' },
        actions: {
          dismiss: { argument: 'id', run: 'dismissToastNotice(toast, getToasts(), value)' },
          act: { argument: 'id', run: 'actOnToastNotice(toast, getToasts(), value)' },
        },
        withholds: '[...(list?.querySelectorAll(\'[data-member="toast"] > div ~ div\') ?? [])]',
      },
      template: el(
        'div',
        {
          part: 'region',
          ref: 'region',
          attrs: { role: lit('region'), 'aria-label': 'say.viewport', tabindex: lit('-1') },
        },
        [
          el(
            'ol',
            {
              part: 'list',
              class: ['viewport'],
              ref: 'list',
              attrs: { tabindex: lit('-1'), 'data-toast-part': lit('list') },
            },
            [
              // Keyed by the record's `key` and not its id: a toast raised again under the id
              // of a card that is still leaving is a second card.
              each('records', 'record', 'record.key', [
                member('ToastCard', {
                  record: 'record',
                  dismissLabel: 'say.dismiss',
                  paused: 'paused',
                }),
              ]),
            ],
          ),
          // The announcements: the cards are not live regions, because a region that appears
          // with its content is not reliably read. Each announcement is a new element, keyed by
          // its own key, so the same words said twice are said twice.
          el(
            'div',
            {
              part: 'polite',
              class: ['a11y.visuallyHidden'],
              attrs: {
                role: lit('status'),
                'aria-live': lit('polite'),
                'aria-atomic': lit('true'),
              },
            },
            [
              each('[said.polite]', 'saying', 'saying.key', [
                el('span', { part: 'saying' }, [text('saying.words')]),
              ]),
            ],
          ),
          el(
            'div',
            {
              part: 'assertive',
              class: ['a11y.visuallyHidden'],
              attrs: {
                role: lit('alert'),
                'aria-live': lit('assertive'),
                'aria-atomic': lit('true'),
              },
            },
            [
              each('[said.assertive]', 'saying', 'saying.key', [
                el('span', { part: 'urgent' }, [text('saying.words')]),
              ]),
            ],
          ),
        ],
      ),
    },
    {
      name: 'Card',
      public: false,
      purpose: 'one toast in the viewport, with its timer, its dismissal and its exit',
      props: {
        record: { type: 'ToastRecord' },
        dismissLabel: { type: 'string', doc: 'The close button’s accessible name.' },
        paused: { type: 'boolean', doc: 'The reader is on the list, so the timer waits.' },
      },
      state: {
        // The swipe: '', then `move` while the finger drags, then `cancel` or `end`.
        swipe: "''",
        tracking: 'false',
        startX: '0',
        deltaX: '0',
      },
      derived: {
        icon: "record.tone === 'neutral' ? null : TOAST_TONE_ICON[record.tone]",
        // The card's reading window, kept across the holds.
        clock: 'toastClock()',
        dismissible: 'record.dismissible !== false',
        dismiss: '(): void => { if (dismissible) toast.dismiss(record.id) }',
        act: '(): void => { record.action?.onClick(); toast.dismiss(record.id) }',
        // A press on the card, not on one of its buttons, may start a swipe to the right.
        press:
          "(event: PointerEvent): void => { if (!dismissible || event.button !== 0 || (event.target as Element).closest('button') !== null) return; tracking = true; startX = event.clientX; deltaX = 0 }",
        drag: "(event: PointerEvent): void => { if (!tracking) return; deltaX = Math.max(0, event.clientX - startX); if (deltaX > 0) swipe = 'move' }",
        // Past the threshold the card leaves; short of it, it springs back.
        lift: "(): void => { if (!tracking) return; tracking = false; if (swipe !== 'move') return; if (deltaX > 50) { swipe = 'end'; dismiss() } else { swipe = 'cancel'; deltaX = 0 } }",
      },
      presence: {
        present: { open: 'record.closing !== true', ref: 'card', binding: 'toast.enter' },
      },
      effects: [
        // Focus in a card whose toast starts to leave moves to the next toast, else the previous
        // one, else where it came from (`focusAfterToast`), before the card leaves the page.
        {
          watch: 'record.closing',
          mount: false,
          run: 'record.closing === true && focusAfterToast(card)',
        },
        // Step two of dismissal: once the exit has played, the record leaves the store. Its
        // `raised` keeps a toast raised again under the same id meanwhile.
        {
          watch: 'present',
          mount: false,
          run: 'present || removeToast(record.id, record.raised)',
        },
        // The timer: restarted by an update, held while the viewport holds the timers, when it
        // resumes with the time that was left (`toastTimeLeft`), and none for a pinned toast or
        // one that cannot be dismissed.
        {
          watch: '[record.revision, paused, record.closing]',
          delay:
            'Number.isFinite(record.durationMs) ? toastTimeLeft(clock, record.revision, record.durationMs, !paused && record.closing !== true) : 0',
          run: '!paused && record.closing !== true && dismissible && Number.isFinite(record.durationMs) && toast.dismiss(record.id)',
        },
      ],
      template: el(
        'li',
        {
          part: 'toast',
          class: ['toast'],
          ref: 'card',
          attrs: {
            // A list item the reader can focus; the viewport's live regions announce it.
            tabindex: lit('0'),
            'data-tone': 'record.tone',
            'data-state': "record.closing === true ? 'closed' : 'open'",
            'data-swipe': "swipe === '' ? undefined : swipe",
            'data-swipe-direction': lit('right'),
            // The card, not the viewport, carries the identity: it is the member's surface.
            ...identity('Toast'),
          },
          // The finger's offset, which the recipe's swipe states translate the card by.
          geometry: {
            '--radix-toast-swipe-move-x': '`${deltaX}px`',
            '--radix-toast-swipe-end-x': '`${deltaX}px`',
          },
          on: {
            // An Escape a control in the content has handled, or an input method is handling,
            // is not the card's.
            keydown: run(
              '($event.preventDefault(), dismiss())',
              "$event.key === 'Escape' && !$event.defaultPrevented && !composingKey($event)",
            ),
            pointerdown: run('press($event)'),
            pointermove: run('drag($event)'),
            pointerup: run('lift()'),
            pointercancel: run('lift()'),
          },
        },
        [
          // While a promise is pending, the loading glyph fills the tone's slot.
          cond(
            'record.loading === true',
            [
              el(
                'span',
                { part: 'wait', class: ['tone', 'wait'], attrs: { 'aria-hidden': lit('true') } },
                [member('Icon', { name: lit('loading') })],
              ),
            ],
            'icon !== null',
            [el('span', { part: 'tone', class: ['tone'] }, [member('Icon', { name: 'icon' })])],
          ),
          el('div', { part: 'text', class: ['text'] }, [
            el('div', { part: 'title', class: ['title'], attrs: { 'data-toast-title': lit('') } }, [
              text('record.title'),
            ]),
            cond('record.description !== undefined', [
              el('div', { part: 'description', class: ['description'] }, [
                text('record.description'),
              ]),
            ]),
            cond('record.content !== undefined', [
              el(
                'div',
                { part: 'content', class: ['content'], attrs: { 'data-toast-content': lit('') } },
                [render('record.content')],
              ),
            ]),
          ]),
          cond('record.action !== undefined', [
            el('div', { part: 'action', class: ['action'] }, [
              member(
                'Button',
                {
                  variant: lit('ghost'),
                  tone: "record.tone === 'danger' ? 'danger' : 'accent'",
                  size: lit('sm'),
                  label: "record.action?.label ?? ''",
                },
                { on: { click: run('act()') } },
              ),
            ]),
          ]),
          cond('dismissible', [
            el('div', { part: 'close', class: ['close'] }, [
              member(
                'Button',
                {
                  variant: lit('ghost'),
                  tone: lit('neutral'),
                  size: lit('sm'),
                  iconOnly: 'true',
                  icon: lit('close'),
                  label: 'dismissLabel',
                },
                { on: { click: run('dismiss()') } },
              ),
            ]),
          ]),
        ],
      ),
    },
  ],
  states: [
    {
      name: 'the viewport, with a pinned title, a description and an action',
      part: 'Viewport',
      before: PINNED.map((options) =>
        fx('Toast', { ...options, durationMs: js('Number.POSITIVE_INFINITY') }),
      ),
    },
    {
      name: 'every tone — the card is the same, the glyph is not',
      ...raise(
        ...TONES.map((tone) =>
          launcher(
            tone,
            `() => toast({ title: '${tone.charAt(0).toUpperCase()}${tone.slice(1)}', description: 'The tone speaks through the glyph and nothing else.', tone: '${tone}' })`,
          ),
        ),
      ),
    },
    {
      name: 'with an action',
      ...raise(
        launcher(
          'Archive a ticket',
          "() => toast.success('Ticket archived', { action: { label: 'Undo', onClick: () => undefined } })",
        ),
        launcher(
          'Fail to delete one',
          "() => toast.danger('Could not delete', { description: 'The ticket is referenced by another.', action: { label: 'Retry', onClick: () => undefined } })",
        ),
      ),
    },
    {
      name: 'pinned — it waits to be dismissed',
      ...raise(
        launcher(
          'Raise a pinned toast',
          "() => toast({ title: 'Still working', description: 'This one has no timer.', durationMs: Number.POSITIVE_INFINITY })",
        ),
      ),
    },
    {
      name: 'a promise — the loading face pinned, then the settled face, same card',
      ...raise(
        launcher(
          'Archive, resolving',
          "() => toast.promise(new Promise((resolve) => setTimeout(resolve, 2500)), { loading: 'Archiving ticket…', success: 'Ticket archived', error: 'Could not archive' })",
        ),
        // `toast.promise` receives the rejection and raises the error face, so nothing is unhandled.
        launcher(
          'Archive, failing',
          "() => toast.promise(new Promise((_, reject) => setTimeout(reject, 2500)), { loading: 'Archiving ticket…', success: 'Ticket archived', error: { title: 'Could not archive', description: 'The queue is read-only.' } })",
        ),
      ),
    },
    {
      name: 'updated in place — a second call with the first’s id, one card',
      ...raise(
        launcher(
          'Raise, then update it',
          "() => { toast({ id: 'update-demo', title: 'Exporting 0 of 3…', durationMs: Number.POSITIVE_INFINITY }); setTimeout(() => toast({ id: 'update-demo', title: 'Exporting 2 of 3…', durationMs: Number.POSITIVE_INFINITY }), 1200); setTimeout(() => toast({ id: 'update-demo', title: 'Export ready', tone: 'success' }), 2400) }",
        ),
      ),
    },
    {
      name: 'a stack — the survivors glide into the gap',
      ...raise(
        launcher(
          'Raise 4',
          '() => { for (let index = 1; index <= TOAST_MAX_VISIBLE; index += 1) toast({ title: `Toast ${index}`, durationMs: Number.POSITIVE_INFINITY }) }',
        ),
        launcher(
          'Raise more than it will keep',
          '() => { for (let index = 1; index <= TOAST_MAX_VISIBLE + 3; index += 1) toast({ title: `Overflow ${index}` }) }',
        ),
        launcher('Dismiss all', '() => toast.dismiss()', 'ghost', 'danger'),
      ),
    },
  ],
})
