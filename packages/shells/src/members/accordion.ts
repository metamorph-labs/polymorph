import { cond, describeMember, each, el, identity, lit, member, render, text } from '../dsl'

const SHIPPING = [
  {
    value: 'delivery',
    label: 'When will my order arrive?',
    content: 'Two to four working days, and you get a tracking link the moment it ships.',
  },
  {
    value: 'returns',
    label: 'How do returns work?',
    content: 'Thirty days, no reason needed. The label is in the box.',
  },
  {
    value: 'sizing',
    label: 'Do these run large or small?',
    content: 'True to size. The one exception is the wide fit, which runs half a size up.',
  },
]

const POLICY = [
  'You have thirty days from delivery. Anything unworn, with its tags, goes back for a full refund — including the shipping you paid to receive it.',
  'Worn items are assessed individually, and the answer is usually yes. Sale items are refunded as credit rather than to the card.',
  'Exchanges are a return and a new order, which is slower but means you are never waiting on stock that has already gone.',
].join(' ')

/** The item's state for Zag: its value, and whether it is disabled. */
const ITEM = '{ value: item.value, disabled: item.disabled }'

/** Accordion (`design/components/accordion.md`): a list of disclosures under headings. */
export default describeMember({
  member: 'Accordion',
  dir: 'structure',
  recipe: 'structure/accordion',
  types: {
    AccordionHeadingLevel: "NonNullable<AccordionProps['headingLevel']>",

    AccordionItem: '{ value: string; label: string; content: VNode | string; disabled?: boolean }',
  },
  defaults: { headingLevel: '3', type: lit('single') },
  machine: {
    of: 'accordion',
    // Zag holds the open items as a list in both modes; a single accordion's value is its one item.
    context: {
      multiple: "type === 'multiple'",
      collapsible: "type === 'multiple' || (collapsible ?? true)",
      value:
        "value === undefined ? undefined : Array.isArray(value) ? value : value === '' ? [] : [value]",
      defaultValue:
        'defaultValue === undefined ? undefined : Array.isArray(defaultValue) ? defaultValue : [defaultValue]',
    },
    events: {
      onValueChange: {
        emit: 'valueChange',
        payload: "type === 'multiple' ? details.value : (details.value[0] ?? '')",
      },
    },
  },
  // The spec's `agent` fence. The machine owns the open items as a list, controlled or not, so
  // an action sets them through the machine and the machine reports `valueChange`. An item's id
  // is its `value`. A single accordion's expand replaces the open item, and one that is not
  // collapsible refuses to close its open item, as the machine refuses a press on it.
  agent: {
    on: 'root',
    state: {
      value: 'api.value',
      items:
        'items.map((item) => ({ id: item.value, label: item.label, ...(item.disabled === true ? { disabled: true } : {}) }))',
    },
    actions: {
      expand: {
        argument: 'id',
        run: "api.value.includes(value) || api.setValue(type === 'multiple' ? [...api.value, value] : [value])",
      },
      collapse: {
        argument: 'id',
        run: `(() => {
          if (!api.value.includes(value)) return
          if (type !== 'multiple' && !(collapsible ?? true)) {
            throw new Error('This accordion keeps one item open; expand another item instead.')
          }
          api.setValue(api.value.filter((shown) => shown !== value))
        })()`,
      },
    },
  },
  unread: {
    keepMounted:
      'A closed region keeps its content in the document, `hidden`, in every case, which is ' +
      'what the React member does only with the prop.',
  },
  state: { heights: 'new Map()' },
  // A region stays unhidden while its recipe plays the close keyframes, as Radix keeps it
  // mounted; Zag would hide it the moment it closes. It is found by the id the machine gives it.
  presence: {
    regionPresent: {
      open: 'api.value',
      ref: 'regions',
      key: 'items.find((item) => api.getItemContentProps({ value: item.value }).id === element.id)?.value',
    },
  },
  // The recipe's height keyframes read the open region's height under Radix's
  // name. It is measured once the region is in the document, before paint.
  effects: [
    {
      watch: 'api.value',
      run: "heights = new Map((regions ?? []).map((region) => [region.id, region.scrollHeight + 'px']))",
    },
  ],
  template: el(
    'div',
    {
      class: ['root'],
      spread: ['api.getRootProps()'],
      attrs: { ...identity('Accordion') },
      ref: 'root',
    },
    [
      each('items', 'item', 'item.value', [
        el('div', { part: 'item', class: ['item'], spread: [`api.getItemProps(${ITEM})`] }, [
          // A real heading element, because heading navigation finds a real `<h3>`.
          el({ expr: "headingLevel === 4 ? 'h4' : 'h3'" }, { class: ['header'] }, [
            el(
              'button',
              {
                part: 'trigger',
                class: ['trigger'],
                spread: [`api.getItemTriggerProps(${ITEM})`],
                attrs: { 'data-accordion-part': lit('trigger') },
              },
              [
                el('span', { class: ['label'] }, [text('item.label')]),
                // Decorative: `aria-expanded` announces the open state.
                el('span', { class: ['chevron'] }, [member('Icon', { name: lit('down') })]),
              ],
            ),
          ]),
          el(
            'div',
            {
              part: 'region',
              class: ['content'],
              spread: [`api.getItemContentProps(${ITEM})`],
              attrs: {
                hidden: '!regionPresent.has(item.value)',
                'data-accordion-part': lit('region'),
              },
              geometry: {
                '--radix-accordion-content-height': `heights.get(api.getItemContentProps(${ITEM}).id)`,
              },
              ref: 'regions',
            },
            [
              el('div', { class: ['inner'] }, [
                cond(
                  "typeof item.content === 'string'",
                  [text('item.content')],
                  [render('item.content')],
                ),
              ]),
            ],
          ),
        ]),
      ]),
    ],
  ),
  states: [
    {
      name: 'single, first open',
      props: { items: SHIPPING, defaultValue: 'delivery' },
      expect: { 'data-orientation': 'vertical' },
    },
    { name: 'single, all closed', props: { items: SHIPPING, collapsible: true } },
    {
      name: 'multiple, two open',
      props: { type: 'multiple', items: SHIPPING, defaultValue: ['delivery', 'sizing'] },
    },
    {
      name: 'one item disabled',
      props: {
        items: SHIPPING.map((item) =>
          item.value === 'returns' ? { ...item, disabled: true } : item,
        ),
        defaultValue: 'delivery',
      },
    },
    {
      name: 'long content',
      props: {
        defaultValue: 'policy',
        items: [
          { value: 'policy', label: 'What is the full returns policy?', content: POLICY },
          ...SHIPPING.slice(1),
        ],
      },
    },
    {
      name: 'kept mounted — every answer in the markup while its row is closed',
      props: { items: SHIPPING, keepMounted: true },
    },
  ],
})
