import { describeMember, el, identity, lit, member, slot, text } from '../dsl'

const PAYLOAD =
  'Retries follow the backoff schedule configured on the workspace. Delivery ' +
  'headers include the signature, the attempt number and the event id.'

/** Collapsible (`design/components/collapsible.md`): one labelled disclosure. */
export default describeMember({
  member: 'Collapsible',
  dir: 'structure',
  recipe: 'structure/collapsible',
  defaults: { defaultOpen: 'false' },
  machine: {
    of: 'collapsible',
    context: { open: 'open', defaultOpen: 'defaultOpen' },
    events: { onOpenChange: { emit: 'openChange', payload: 'details.open' } },
  },
  // The spec's `agent` fence. The machine owns the open state, controlled or not, so an action
  // sets it through the machine and the machine reports `openChange`. The trigger carries the
  // label, which names the member.
  agent: {
    on: 'trigger',
    state: { open: 'api.open' },
    actions: { open: 'api.open || api.setOpen(true)', close: 'api.open && api.setOpen(false)' },
  },
  template: el(
    'div',
    {
      class: ['root'],
      spread: ['api.getRootProps()'],
      attrs: { ...identity('Collapsible') },
    },
    [
      // No heading: a form's "Advanced options" toggle is not an outline entry.
      el(
        'button',
        { part: 'trigger', class: ['trigger'], spread: ['api.getTriggerProps()'], ref: 'trigger' },
        [
          el('span', { class: ['label'] }, [text('label')]),
          // Decorative: `aria-expanded` announces the state.
          el('span', { class: ['chevron'] }, [
            member('Icon', { name: lit('down'), size: lit('sm') }),
          ]),
        ],
      ),
      // The recipe's height keyframes read the measured height under Radix's
      // name. Zag measures it as `--height` in the content's style object, read
      // through `Object()` because the style's type is a union of style forms.
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
      name: 'closed — a disclosure that ships open is hiding nothing',
      props: { label: 'Advanced options' },
      slots: { default: [PAYLOAD] },
      expect: { 'data-state': 'closed' },
    },
    {
      name: 'open',
      props: { label: 'Advanced options', defaultOpen: true },
      slots: { default: [PAYLOAD] },
      expect: { 'data-state': 'open' },
    },
    {
      name: 'controlled — state follows the prop',
      props: { label: 'Raw payload', open: true, onOpenChange: { js: '() => {}' } },
      slots: { default: [PAYLOAD] },
      expect: { 'data-state': 'open' },
    },
    {
      name: 'long content — the label, not the region, sizes the trigger',
      props: { label: 'Details', defaultOpen: true },
      slots: { default: [`${PAYLOAD} ${PAYLOAD} ${PAYLOAD}`] },
    },
  ],
})
