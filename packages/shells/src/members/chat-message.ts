import { cond, describeMember, el, fx, identity, js, lit, member, slot, text, when } from '../dsl'
import { PROSE } from './markdown'

const noop = js('() => {}')

/** The reply, as the model wrote it: Markdown's own prose. */
const prose = (words = PROSE) => [fx('Markdown', {}, { default: [words] })]

const action = (icon: string, label: string) =>
  fx('Button', {
    variant: 'ghost',
    tone: 'neutral',
    size: 'sm',
    iconOnly: true,
    icon,
    label,
    onClick: noop,
  })

/** The hover row every reply in the fixture carries. */
const REPLY_ACTIONS = [
  action('copy', 'Copy'),
  action('refresh', 'Regenerate'),
  action('helpful', 'Helpful'),
  action('unhelpful', 'Not helpful'),
]

/**
 * ChatMessage (`design/components/chat-message.md`): one turn of a
 * conversation. `role` picks the frame: the reader's turn is a bubble at the
 * end edge, the model's is full-width prose with a mark, and a system notice
 * is a centred muted line. The caller composes the body; `actions` is the
 * hover row, always reachable in the tab order.
 */
export default describeMember({
  member: 'ChatMessage',
  dir: 'ai',
  recipe: 'ai/chat-message',
  types: {
    ChatMessageStatus: "NonNullable<ChatMessageProps['status']>",
    ChatRole: "NonNullable<ChatMessageProps['role']>",
  },
  defaults: { status: lit('complete') },
  template: el(
    'article',
    {
      class: ['message'],
      attrs: {
        'data-role': 'role',
        // A complete turn is the rest state and sets no attribute.
        'data-status': "status === 'complete' ? undefined : status",
        'aria-label': 'author',
        'aria-busy': when("status === 'streaming'", 'true'),
        ...identity('ChatMessage'),
      },
    },
    [
      cond("role !== 'system'", [
        el('span', { part: 'mark', class: ['mark'] }, [
          cond(
            "role === 'assistant' && avatar === undefined",
            [
              // The model's mark, decorative: `author` names the article.
              el(
                'span',
                { part: 'model', class: ['model'], attrs: { 'aria-hidden': lit('true') } },
                [member('Icon', { name: lit('model'), size: lit('sm') })],
              ),
            ],
            [member('Avatar', { name: 'author', src: 'avatar', size: lit('md') })],
          ),
        ]),
      ]),
      el('div', { part: 'body', class: ['body'] }, [
        cond("role !== 'system'", [
          el('div', { part: 'meta', class: ['meta'] }, [
            el('span', { part: 'author', class: ['author'] }, [text('author')]),
            cond('time !== undefined', [
              el('span', { part: 'time', class: ['time'] }, [text('time')]),
            ]),
          ]),
        ]),
        el('div', { part: 'content', class: ['content'] }, [slot()]),
        // A settled turn says how it ended in words, with a glyph that matches.
        cond("(status === 'stopped' || status === 'error') && statusMessage !== undefined", [
          el('p', { part: 'notice', class: ['notice'] }, [
            el('span', { part: 'noticeGlyph', class: ['noticeGlyph'] }, [
              member('Icon', { name: "status === 'error' ? 'error' : 'warning'", size: lit('sm') }),
            ]),
            text('statusMessage'),
          ]),
        ]),
        cond('slots.actions', [
          el('div', { part: 'actions', class: ['actions'] }, [slot('actions')]),
        ]),
      ]),
    ],
  ),
  states: [
    {
      name: 'the reader — a bubble at the end edge',
      props: { role: 'user', author: 'You', time: '09:41' },
      slots: { default: ['Why did the webhook retry twice with the same promo code?'] },
      expect: { 'data-role': 'user', 'data-status': null },
    },
    {
      name: 'the reader, with files — chips under the words',
      props: { role: 'user', author: 'You', time: '09:41' },
      slots: {
        default: [
          'Here is the delivery log and the policy we agreed on.',
          fx(
            'Inline',
            { gap: 2, wrap: true },
            {
              default: [
                fx('AttachmentChip', { name: 'delivery.log', size: 48_210 }),
                fx('AttachmentChip', { name: 'retry-policy.pdf', size: 184_320 }),
              ],
            },
          ),
        ],
      },
    },
    {
      name: 'the model — full-width prose with the mark, and the hover row',
      props: { role: 'assistant', author: 'Pilot', time: '09:41' },
      slots: { default: prose(), actions: REPLY_ACTIONS },
      expect: { 'data-role': 'assistant', 'aria-label': 'Pilot' },
    },
    {
      name: 'the model, streaming — busy, no actions yet',
      props: { role: 'assistant', author: 'Pilot', status: 'streaming' },
      slots: {
        default: [fx('StreamingText', { streaming: true }, { default: [PROSE.slice(0, 80)] })],
      },
      expect: { 'data-status': 'streaming', 'aria-busy': 'true' },
    },
    {
      name: 'stopped — the app’s words for a turn the reader ended',
      props: {
        role: 'assistant',
        author: 'Pilot',
        status: 'stopped',
        statusMessage: 'Stopped generating',
      },
      slots: { default: prose(PROSE.slice(0, 140)), actions: REPLY_ACTIONS },
      expect: { 'data-status': 'stopped' },
    },
    {
      name: 'error — a turn that failed',
      props: {
        role: 'assistant',
        author: 'Pilot',
        status: 'error',
        statusMessage: 'The model did not respond. Try again.',
      },
      slots: { default: prose(''), actions: REPLY_ACTIONS },
      expect: { 'data-status': 'error' },
    },
    {
      name: 'a pictured speaker — an Avatar in the mark',
      props: {
        role: 'user',
        author: 'Ada Okonkwo',
        avatar:
          "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32'%3E%3Crect width='32' height='32' fill='%236b7280'/%3E%3C/svg%3E",
        time: '09:40',
      },
      slots: { default: ['Can you check the retry schedule?'] },
    },
    {
      name: 'a system notice — the thread talking about itself',
      props: { role: 'system', author: 'System' },
      slots: { default: ['Context was summarised to make room for the conversation.'] },
      expect: { 'data-role': 'system' },
    },
  ],
})
