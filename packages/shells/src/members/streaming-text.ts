import { cond, describeMember, el, flag, identity, lit, member, slot, when } from '../dsl'

const REPLY =
  'The retry schedule is exponential with a cap at five attempts. The first retry fires ' +
  'after two seconds and each one after that doubles the wait.'

/** Whether nothing has arrived yet: the stream is open and the slot holds no text. */
const PENDING = "streaming && slotText(slots.default) === ''"

/**
 * StreamingText (`design/components/streaming-text.md`): plain text still
 * arriving, with a steady caret. While the stream is open and nothing has
 * arrived, Skeleton's text bar stands where the first line will.
 *
 * The slot's text is read in the template, where Vue tracks what the slot
 * reads, so the bar gives way to the first word in the same update.
 */
export default describeMember({
  member: 'StreamingText',
  dir: 'ai',
  recipe: 'ai/streaming-text',
  types: {
    StreamingTextSize: "NonNullable<StreamingTextProps['size']>",
  },
  defaults: { streaming: 'false', size: lit('md') },
  template: el(
    'div',
    {
      class: ['root'],
      attrs: {
        'data-size': 'size',
        'data-state': when('streaming', lit('streaming')),
        'data-pending': flag(PENDING),
        'aria-busy': when('streaming', 'true'),
        ...identity('StreamingText'),
      },
    },
    [
      cond(
        PENDING,
        [member('Skeleton', { shape: lit('text'), textStep: 'size', width: '9' })],
        [
          el('p', { class: ['text'] }, [
            slot(),
            cond('streaming', [
              el('span', { class: ['caret'], attrs: { 'aria-hidden': lit('true') } }),
            ]),
          ]),
        ],
      ),
    ],
  ),
  states: [
    {
      name: 'arriving — the caret marks where the next word lands',
      props: { streaming: true },
      slots: { default: [REPLY.slice(0, 70)] },
      expect: { 'data-state': 'streaming', 'aria-busy': 'true', 'data-pending': null },
    },
    {
      name: 'pending — nothing has landed, so the bar stands where the first line will',
      props: { streaming: true },
      slots: { default: [''] },
      expect: { 'data-state': 'streaming', 'data-pending': '' },
    },
    {
      name: 'complete — Text, with no caret and nothing busy',
      slots: { default: [REPLY] },
      expect: { 'data-state': null, 'aria-busy': null },
    },
    {
      name: 'sm — the secondary step, for a status sentence',
      props: { size: 'sm', streaming: true },
      slots: { default: ['Searching the workspace for the retry policy'] },
      expect: { 'data-size': 'sm' },
    },
    {
      name: 'line breaks — whitespace is content',
      slots: { default: ['First line.\nSecond line, after a hard break.'] },
    },
  ],
})
