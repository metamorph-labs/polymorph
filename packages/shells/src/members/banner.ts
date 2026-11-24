import { cond, describeMember, el, fx, identity, lit, member, slot } from '../dsl'

/**
 * Banner (`design/components/banner.md`): the notice that belongs to the
 * application frame and stays until its cause ends.
 *
 * The application owns the unmount, and nothing plays on the way out, so the ✕
 * emits `dismiss` and does nothing else.
 */
export default describeMember({
  member: 'Banner',
  dir: 'structure',
  recipe: 'structure/banner',
  types: {
    BannerTone: "NonNullable<BannerProps['tone']>",
  },
  defaults: { tone: lit('neutral'), dismissLabel: lit('Dismiss') },
  effects: [
    // Focus in the Banner as the application removes it, the ✕'s after a dismissal, moves to
    // the focusable element nearest where it was (`focusAfterRemoval`), not to the body.
    { watch: 'root', run: 'focusAfterRemoval(root)', release: 'ran()' },
  ],
  // The spec's `agent` fence. The ✕ is the Banner's own part, so it is withheld and `dismiss`
  // stands in its place. The application's action is its own and stays an agent's.
  agent: {
    on: 'root',
    state: { tone: 'tone', dismissible: 'listening.dismiss' },
    actions: {
      dismiss: `(() => {
        if (!listening.dismiss) throw new Error('This banner has no dismiss control.')
        emit('dismiss')
      })()`,
    },
    withholds: 'closeRegion',
  },
  template: el(
    'div',
    {
      ref: 'root',
      class: ['banner'],
      attrs: {
        // Only danger interrupts. A warning Banner is on screen for days.
        role: "tone === 'danger' ? 'alert' : 'status'",
        'data-tone': 'tone',
        ...identity('Banner'),
      },
    },
    [
      cond("tone !== 'neutral'", [
        // Decorative: the role already announces the kind of message. Each tone is named, so
        // the expression is an icon role where a framework does not narrow `tone` in a branch.
        el('span', { part: 'glyph', class: ['glyph'] }, [
          member('Icon', {
            name: "tone === 'danger' ? 'error' : tone === 'warning' ? 'warning' : 'info'",
          }),
        ]),
      ]),
      // The message and the action wrap as a pair, so the glyph and the ✕ stay on the first line.
      el('div', { part: 'content', class: ['content'] }, [
        el('div', { part: 'text', class: ['text'] }, [slot()]),
        // The document order is the focus order: the way out, then the ✕.
        cond('slots.action', [el('div', { part: 'action', class: ['action'] }, [slot('action')])]),
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
            { on: { click: { emit: 'dismiss' } } },
          ),
        ]),
      ]),
    ],
  ),
  states: [
    {
      name: 'neutral — a fact about the session, with the way out',
      slots: {
        default: ['You are viewing Northwind Traders as a member of support.'],
        action: [
          fx('Button', { variant: 'ghost', tone: 'neutral', size: 'sm', label: 'Stop viewing' }),
        ],
      },
      expect: { 'data-tone': 'neutral', role: 'status' },
    },
    {
      name: 'info',
      props: { tone: 'info' },
      slots: {
        default: ['This page shows the snapshot taken at 09:00. Live data is back at 10:00.'],
      },
      expect: { 'data-tone': 'info', role: 'status' },
    },
    {
      name: 'warning — with an action',
      props: { tone: 'warning' },
      slots: {
        default: ['Your trial ends in 3 days.'],
        action: [
          fx('Button', { variant: 'soft', tone: 'accent', size: 'sm', label: 'Upgrade plan' }),
        ],
      },
      expect: { 'data-tone': 'warning', role: 'status' },
    },
    {
      name: 'danger',
      props: { tone: 'danger' },
      slots: {
        default: [
          'Payments are unavailable. Orders are saved and charged when the service returns.',
        ],
      },
      expect: { 'data-tone': 'danger', role: 'alert' },
    },
    {
      name: 'dismissible — a reminder the reader may hide',
      props: { tone: 'info', onDismiss: { js: '() => {}' } },
      slots: { default: ['Scheduled maintenance on Sunday from 02:00 to 04:00 UTC.'] },
      expect: { 'data-tone': 'info' },
    },
    {
      name: 'a long message — it wraps, and the action moves under it',
      props: { tone: 'warning', onDismiss: { js: '() => {}' } },
      slots: {
        default: [
          'Replies sent by email are delayed by about twenty minutes while the mail queue catches up. Replies sent from this page arrive at once. Nothing is lost, and the queue is expected to clear within the hour.',
        ],
        action: [
          fx('Button', { variant: 'ghost', tone: 'neutral', size: 'sm', label: 'Status page' }),
        ],
      },
      expect: { 'data-tone': 'warning' },
    },
  ],
})
