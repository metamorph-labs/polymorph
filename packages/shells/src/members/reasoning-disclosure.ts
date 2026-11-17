import { describeMember, el, flag, fx, identity, lit, member, slot, text, when } from '../dsl'

/** The model's reasoning, as it wrote it: Markdown at the secondary step. */
const REASONING =
  'The question is about *retries*, not first attempts, so the relevant setting is the backoff cap.\n\n- The docs say five attempts with exponential backoff.\n- The incident on the 14th was about duplicate promo codes, which the idempotency key now prevents.\n\nSo the answer should lead with the key, then the schedule.'

const reasoning = () => [fx('Markdown', { size: 'sm' }, { default: [REASONING] })]

/**
 * ReasoningDisclosure (`design/components/reasoning-disclosure.md`): the
 * model's reasoning behind one trigger, a Collapsible with a status. While the
 * model reasons, the mark spins and the root is busy; the app writes the
 * label, so the member never writes a duration or a verb.
 */
export default describeMember({
  member: 'ReasoningDisclosure',
  dir: 'ai',
  recipe: 'ai/reasoning-disclosure',
  defaults: { streaming: 'false', defaultOpen: 'false' },
  machine: {
    of: 'collapsible',
    context: { open: 'open', defaultOpen: 'defaultOpen' },
    events: { onOpenChange: { emit: 'openChange', payload: 'details.open' } },
  },
  // The spec's `agent` fence. The machine owns the open state, controlled or not, so an action
  // sets it through the machine and the machine emits `openChange`.
  agent: {
    on: 'trigger',
    state: { expanded: 'api.open', streaming: 'streaming' },
    actions: { expand: 'api.setOpen(true)', collapse: 'api.setOpen(false)' },
  },
  template: el(
    'div',
    {
      class: ['root'],
      spread: ['api.getRootProps()'],
      attrs: {
        'data-streaming': flag('streaming'),
        'aria-busy': when('streaming', 'true'),
        ...identity('ReasoningDisclosure'),
      },
    },
    [
      // No heading: a disclosure inside a reply is not an outline entry.
      el(
        'button',
        // The control an agent reads the name of.
        { part: 'trigger', ref: 'trigger', class: ['trigger'], spread: ['api.getTriggerProps()'] },
        [
          // The glyph shows "still thinking"; the label says it and the root is busy.
          el('span', { part: 'mark', class: ['mark', { name: 'spinning', when: 'streaming' }] }, [
            member('Icon', { name: "streaming ? 'loading' : 'reasoning'", size: lit('sm') }),
          ]),
          el('span', { part: 'label', class: ['label'] }, [text('label')]),
          el('span', { part: 'chevron', class: ['chevron'] }, [
            member('Icon', { name: lit('down'), size: lit('sm') }),
          ]),
        ],
      ),
      // The recipe's height keyframes read the measured height under Radix's name, as
      // Collapsible's do; Zag measures it as `--height`.
      el(
        'div',
        {
          part: 'content',
          class: ['content'],
          spread: ['api.getContentProps()'],
          geometry: {
            '--radix-collapsible-content-height': "Object(api.getContentProps().style)['--height']",
          },
        },
        [el('div', { class: ['inner'] }, [slot()])],
      ),
    ],
  ),
  states: [
    {
      name: 'closed — the working is there for whoever wants it',
      props: { label: 'Thought for 12 seconds' },
      slots: { default: reasoning() },
      expect: { 'data-state': 'closed', 'data-streaming': null },
    },
    {
      name: 'open',
      props: { label: 'Thought for 12 seconds', defaultOpen: true },
      slots: { default: reasoning() },
      expect: { 'data-state': 'open' },
    },
    {
      name: 'thinking — the mark spins, the root is busy',
      props: { label: 'Thinking…', streaming: true, defaultOpen: true },
      slots: {
        default: [
          fx(
            'StreamingText',
            { size: 'sm', streaming: true },
            { default: [REASONING.slice(0, 110)] },
          ),
        ],
      },
      expect: { 'data-streaming': '', 'aria-busy': 'true' },
    },
    {
      name: 'controlled — state follows the prop',
      props: { label: 'Thought for 4 seconds', open: true, onOpenChange: { js: '() => {}' } },
      slots: { default: reasoning() },
      expect: { 'data-state': 'open' },
    },
  ],
})
