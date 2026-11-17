import { cond, describeMember, el, fx, identity, lit, member, run, slot, text, when } from '../dsl'

const STORAGE = 'You are at 92% of your plan. Uploads stop working at 100%.'

/**
 * Alert (`design/components/alert.md`): an inline status callout. The root
 * owns the collapse and the panel owns the wash, because a box animating its
 * own height would animate its padding too.
 *
 * The Alert plays the departure and the application owns the unmount: the ✕
 * collapses the row, and `dismiss` fires once the collapse has run.
 *
 * With no title (absent or `''`) and nothing in the default slot it renders
 * nothing, as an ErrorSummary with no errors does: an action or a dismiss
 * handler is not content.
 */
export default describeMember({
  member: 'Alert',
  dir: 'structure',
  recipe: 'structure/alert',
  types: {
    AlertTone: "NonNullable<AlertProps['tone']>",
  },
  // `icon` is typed `false`, which Vue casts to a boolean: an explicit `undefined` keeps an
  // absent `icon` absent, so the glyph shows.
  defaults: { tone: lit('info'), dismissLabel: lit('Dismiss'), icon: 'undefined' },
  departures: { departure: { binding: 'alert.dismiss', ref: 'root' } },
  // Ends an agent's dismiss: once `dismiss` has fired, or once the Alert has unmounted first.
  state: { settle: 'undefined as (() => void) | undefined' },
  effects: [{ run: 'undefined', release: 'settle?.()' }],
  // The spec's `agent` fence. The ✕ is the Alert's own part, so it is withheld and `dismiss`
  // stands in its place; the step ends once the departure has played and `dismiss` has fired.
  // The application's actions are its own and stay an agent's. An Alert with nothing to say
  // draws no root and is not listed; the block has no `unless`, because `unless` is read only
  // at mount and a title can arrive later.
  agent: {
    on: 'root',
    state: { tone: 'tone', title: "title ?? ''", dismissible: 'listening.dismiss' },
    actions: {
      dismiss: `(() => {
        if (!listening.dismiss) throw new Error('This alert has no dismiss control.')
        return new Promise<void>((resolve) => {
          settle = () => {
            settle = undefined
            resolve()
          }
          departure.start(() => {
            emit('dismiss')
            settle?.()
          })
        })
      })()`,
    },
    withholds: 'closeRegion',
  },
  // No title and no content draws no root at all.
  template: cond("(title !== undefined && title !== '') || slots.default", [
    el(
      'div',
      {
        ref: 'root',
        class: ['alert'],
        attrs: {
          // Warnings and errors interrupt; info and success do not. Present from the first render
          // that draws the root, so an Alert mounted, or given its title, in response to an event
          // is announced.
          role: "tone === 'warning' || tone === 'danger' ? 'alert' : 'status'",
          'data-tone': 'tone',
          // Rest is the absence of the attribute.
          'data-state': when('departure.active', lit('closed')),
          ...identity('Alert'),
        },
      },
      [
        el('div', { part: 'panel', class: ['panel'] }, [
          cond('icon !== false', [
            // Decorative: the politeness role already announces the kind of message.
            el('span', { part: 'glyph', class: ['glyph'] }, [
              member('Icon', { name: "tone === 'danger' ? 'error' : tone" }),
            ]),
          ]),
          el('div', { part: 'body', class: ['body'] }, [
            cond("title !== undefined && title !== ''", [
              el('p', { part: 'title', class: ['title'] }, [text('title')]),
            ]),
            // Left out with no content, so a title alone has no gap under it.
            cond('slots.default', [el('div', { part: 'text', class: ['text'] }, [slot()])]),
            // The document order is the focus order: the answers, then the ✕.
            cond('slots.action || slots.secondaryAction', [
              el('div', { part: 'actions', class: ['action'] }, [
                slot('action'),
                slot('secondaryAction'),
              ]),
            ]),
          ]),
          // The ✕ only where someone handles `dismiss`.
          cond('listening.dismiss', [
            el('div', { part: 'close', class: ['close'], ref: 'closeRegion' }, [
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
                {
                  on: {
                    click: run("departure.start(() => { emit('dismiss'); settle?.() })"),
                  },
                },
              ),
            ]),
          ]),
        ]),
      ],
    ),
  ]),
  states: [
    {
      name: 'info — the default register',
      props: { title: 'Sandbox mode' },
      slots: { default: ['Nothing you do here reaches a real customer.'] },
      expect: { 'data-tone': 'info', 'data-state': null },
    },
    {
      name: 'success',
      props: { tone: 'success', title: 'Import finished' },
      slots: {
        default: ['All 1,284 tickets came across. Twelve needed a requester and now have one.'],
      },
      expect: { 'data-tone': 'success' },
    },
    {
      name: 'warning',
      props: { tone: 'warning', title: 'Storage almost full' },
      slots: { default: [STORAGE] },
      expect: { 'data-tone': 'warning' },
    },
    {
      name: 'danger',
      props: { tone: 'danger', title: 'Two fields need attention' },
      slots: {
        default: ['The requester email is not an address, and the due date is in the past.'],
      },
      expect: { 'data-tone': 'danger' },
    },
    {
      name: 'body only — no title',
      props: { tone: 'warning' },
      slots: { default: ['Replies are delayed while the mail queue catches up.'] },
      expect: { 'data-tone': 'warning' },
    },
    {
      name: 'title only — the message is the whole Alert',
      props: { tone: 'danger', title: 'The changes could not be saved' },
      expect: { 'data-tone': 'danger' },
    },
    {
      name: 'with an action',
      props: { tone: 'warning', title: 'Storage almost full' },
      slots: {
        default: [STORAGE],
        action: [
          fx('Button', { variant: 'soft', tone: 'accent', size: 'sm', label: 'Upgrade plan' }),
        ],
      },
    },
    {
      name: 'with two actions — a review answered in place, apply or discard',
      props: { tone: 'info', title: 'Imported fields need review' },
      slots: {
        default: ['Three ticket fields came across under new names.'],
        action: [fx('Button', { variant: 'soft', tone: 'accent', size: 'sm', label: 'Apply' })],
        secondaryAction: [
          fx('Button', { variant: 'ghost', tone: 'neutral', size: 'sm', label: 'Discard' }),
        ],
      },
    },
    {
      name: 'dismissible — the ✕ plays the departure, the app owns the unmount',
      props: { tone: 'info', title: 'New keyboard shortcuts', onDismiss: { js: '() => {}' } },
      slots: { default: ['Press ⌘K anywhere to jump to a ticket.'] },
    },
    {
      name: 'icon suppressed — for a stack where the wash already says it',
      many: {
        within: { member: 'Stack', props: { gap: 2 } },
        each: [
          {
            props: { tone: 'danger', icon: false },
            slots: { default: ['The requester email is not an address.'] },
          },
          {
            props: { tone: 'danger', icon: false },
            slots: { default: ['The due date is in the past.'] },
          },
        ],
      },
    },
    {
      name: 'nothing to say — no title and no content, so no panel',
      // An empty title and a dismiss handler still give the Alert nothing to show.
      props: { tone: 'danger', title: '', onDismiss: { js: '() => {}' } },
      rendersNothing: true,
    },
  ],
})
