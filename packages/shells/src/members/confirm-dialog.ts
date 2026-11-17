import { describeMember, fx, js, lit, member, run, slot } from '../dsl'

const noop = js('() => {}')

const TRIGGER = fx('Button', { variant: 'ghost', tone: 'neutral', label: 'Discard' })

const DESTRUCTION = {
  title: 'Delete 3 tickets?',
  description: 'They leave the inbox and the archive. This cannot be undone.',
  confirmLabel: 'Delete 3 tickets',
}

/** A typed confirmation: deleting a project, named by the phrase the person types. */
const PROJECT = {
  title: 'Delete the acme-billing project?',
  description: 'Its tickets, members and settings are deleted with it. This cannot be undone.',
  confirmLabel: 'Delete project',
  confirmWith: 'acme-billing',
}

const PROJECT_TRIGGER = fx('Button', { variant: 'ghost', tone: 'neutral', label: 'Delete project' })

/** The comparison the typed confirmation makes: the spaces around removed, letter case ignored. */
const comparable = (text: string) => `(${text}).trim().toLowerCase()`

const PUBLISH = {
  tone: 'accent',
  title: 'Publish this article?',
  description: 'It becomes visible to everyone with the link, immediately.',
  confirmLabel: 'Publish',
  cancelLabel: 'Not yet',
}

/**
 * ConfirmDialog (`design/components/confirm-dialog.md`): a Dialog that asks
 * whether the reader meant an action, with Cancel and the action's verb. It
 * has no panel of its own, so it lends Dialog its identity, and the panel
 * carries `confirm-dialog`.
 *
 * The open state is mirrored, so an uncontrolled ConfirmDialog closes itself
 * from its own buttons. A confirm whose handler returns a promise holds the
 * dialog open and undismissable until it settles; the handler is called
 * through `invoke`, because `emit` drops what it returns.
 *
 * `confirmWith` adds the typed confirmation: a FormField with one Input in the
 * body, emptied each time the dialog opens. The confirm waits until the field
 * holds the phrase, and the error shows once the text cannot become it. Focus
 * starts in the field in both tones, because it is the body's first stop.
 */
export default describeMember({
  member: 'ConfirmDialog',
  dir: 'overlays',
  recipe: null,
  types: {
    ConfirmTone: "NonNullable<ConfirmDialogProps['tone']>",
  },
  lends: true,
  defaults: {
    closeLabel: lit('Close'),
    tone: lit('danger'),
    cancelLabel: lit('Cancel'),
    presentation: lit('auto'),
    confirmWithError: lit('The text does not match'),
  },
  state: { mirror: 'false', pending: 'false', typed: "''" },
  derived: {
    current: 'open ?? mirror',
    phrase: `confirmWith === undefined ? undefined : ${comparable('confirmWith')}`,
    entered: comparable('typed'),
    holds: 'phrase === undefined || entered === phrase',
    wrong: "phrase !== undefined && entered !== '' && !phrase.startsWith(entered)",
    setOpen: "(next: boolean) => { mirror = next; emit('openChange', next) }",
    confirm:
      "async () => { const result = invoke('confirm'); if (!(result instanceof Promise)) { setOpen(false); return } pending = true; try { await result; setOpen(false) } finally { pending = false } }",
  },
  // The spec's `agent` fence. ConfirmDialog renders no element of its own: the panel is its
  // Dialog's, read through the hand-back holder the Dialog fills in. The panel names the dialog,
  // and what it holds is a person's: the confirm, the phrase field and the Dialog it borrows are
  // withheld. Cancel closes it as the person's cancel does, and is refused while the confirmed
  // action runs. No action confirms.
  agent: {
    element: 'borrowed.element?.()',
    state: { open: 'current', pending: 'pending' },
    actions: {
      cancel: `(() => {
        if (pending) throw new Error('The confirmed action is running; it cannot be cancelled.')
        setOpen(false)
      })()`,
    },
    withholds: 'borrowed.element?.()',
  },
  effects: [
    // The field is emptied each time the dialog opens. The panel enters from transparent, so
    // the frame before this runs shows nothing of the text typed for the last confirm.
    { watch: 'current', mount: false, run: "current && (typed = '')" },
  ],
  template: member(
    'Dialog',
    {
      closeLabel: 'closeLabel',
      size: lit('sm'),
      title: 'title',
      description: 'description',
      open: 'current',
      presentation: 'presentation',
      // While the action is pending, dismissing would leave the reader unsure whether it happened.
      dismissible: '!pending',
      // A danger confirm is an interruption to answer.
      alert: "tone === 'danger'",
      // The rightmost button is destructive, so focus starts on Cancel, unless there is a phrase
      // to type: the body's field is first then, and the disabled confirm guards a stray Enter.
      initialFocus: "tone === 'danger' && confirmWith === undefined ? 'dismiss' : 'primary'",
    },
    {
      on: { openChange: run('setOpen($event)') },
      slots: {
        trigger: [slot('trigger')],
        default: [
          member(
            'FormField',
            {
              label: 'confirmWithLabel ?? `Type ${confirmWith} to confirm`',
              error: 'wrong ? confirmWithError : undefined',
            },
            {
              slots: {
                default: [
                  member(
                    'Input',
                    {
                      value: 'typed',
                      // A browser's suggestion would type the phrase for the person.
                      autoComplete: lit('off'),
                      // A correction can change a phrase such as `acme-billing` while it is typed.
                      exact: 'true',
                      // The phrase cannot change under an action already running.
                      disabled: 'pending',
                    },
                    { on: { change: run('typed = $event') } },
                  ),
                ],
              },
            },
          ),
        ],
        footer: [
          member(
            'Button',
            {
              variant: lit('outline'),
              tone: lit('neutral'),
              label: 'cancelLabel',
              disabled: 'pending',
            },
            { on: { click: run('setOpen(false)') } },
          ),
          member(
            'Button',
            {
              variant: lit('solid'),
              tone: 'tone',
              label: 'confirmLabel',
              loading: 'pending',
              disabled: '!holds',
            },
            { on: { click: run('confirm()') } },
          ),
        ],
      },
      slotWhen: { default: 'confirmWith !== undefined' },
    },
  ),
  states: [
    {
      name: 'closed — just the trigger',
      props: {
        title: 'Discard this ticket?',
        description: 'The subject and requester you have typed will be lost.',
        confirmLabel: 'Discard',
        onConfirm: noop,
      },
      slots: { trigger: [TRIGGER] },
    },
    {
      name: 'closed, accent — opening puts focus on the confirm, which destroys nothing',
      props: { ...PUBLISH, onConfirm: noop },
      slots: { trigger: [fx('Button', { variant: 'ghost', tone: 'neutral', label: 'Publish' })] },
    },
    {
      name: 'open, guarding a destruction',
      props: { open: true, ...DESTRUCTION, onConfirm: noop },
      slots: { trigger: [TRIGGER] },
    },
    {
      name: 'open, guarding something consequential but safe',
      props: { open: true, ...PUBLISH, onConfirm: noop },
      slots: { trigger: [TRIGGER] },
    },
    {
      name: 'pending — the confirm is in flight and there is no way out of it',
      // Never settles, so the dialog stays pending once the confirm is pressed.
      props: { open: true, ...DESTRUCTION, onConfirm: js('() => new Promise<void>(() => {})') },
      slots: { trigger: [TRIGGER] },
    },
    {
      name: 'closed, with a phrase to type — opening puts focus in its field',
      props: { ...PROJECT, onConfirm: noop },
      slots: { trigger: [PROJECT_TRIGGER] },
    },
    {
      name: 'open, awaiting the phrase — the confirm stays disabled until it is typed',
      props: { open: true, ...PROJECT, onConfirm: noop },
      slots: { trigger: [PROJECT_TRIGGER] },
    },
    {
      name: 'open, the phrase mistyped — the field says the text does not match',
      // Held open by the entry, as by an application, which types into the field.
      holds: { open: true },
      props: {
        ...PROJECT,
        open: { held: 'open' },
        onOpenChange: { hold: 'open' },
        onConfirm: noop,
      },
      slots: { trigger: [PROJECT_TRIGGER] },
      // The text is the reader's, not a prop, so the entry types it once the panel is up.
      types: { into: '[data-member="confirm-dialog"] input', text: 'acme-bulling' },
    },
  ],
})
