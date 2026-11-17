import {
  cond,
  describeMember,
  el,
  fx,
  identity,
  lit,
  slot,
  text,
  type FixtureChild,
  type FixtureInstance,
} from '../dsl'

/** The app's controls for a comment. They take no handler here, as nothing is listening. */
const ACTIONS: FixtureChild[] = [
  fx('Button', { variant: 'ghost', tone: 'neutral', size: 'sm', label: 'Reply' }),
  fx('Button', { variant: 'ghost', tone: 'neutral', size: 'sm', label: 'Edit' }),
]

/** An address with no break opportunity, and a service account's name with none. */
const LONG_ADDRESS =
  'https://status.example.com/incidents/2026-11-14-eu-west-1-webhook-delivery-retried-with-a-duplicated-promo-code'
const LONG_AUTHOR = 'svc-webhook-delivery-eu-west-1-production-retry-worker'

const avatar = (name: string): FixtureChild => fx('Avatar', { name })
const words = (value: string): FixtureChild => fx('Text', {}, { default: [value] })

/** One comment, as a fixture writes it: the author, a time as text, and the body's words. */
const comment = (
  author: string,
  time: string,
  body: string,
  props: Readonly<Record<string, string | boolean>> = {},
  slots: Readonly<Record<string, readonly FixtureChild[]>> = {},
): FixtureChild =>
  fx(
    'CommentThreadComment',
    { author, ...props },
    { avatar: [avatar(author)], time: [time], default: [words(body)], ...slots },
  )

/** The one-comment thread of the composer's entry. */
const ASKED: FixtureInstance = {
  props: { label: 'Comments' },
  slots: {
    default: [comment('Ada Okafor', '09:40', 'Can someone check the retry schedule?')],
  },
}

/**
 * CommentThread (`design/components/comment-thread.md`): comments on a
 * record, with their replies, and `CommentThread.Comment` as its part.
 *
 * The thread is an `<ol>` named by its label, and each comment is a list item
 * that holds an `<article>` named by its author and its time through
 * `aria-labelledby`. A comment's replies are a second `<ol>` in its item, named
 * by the thread's `messages.replies`, which the comment reads from its owner
 * at any level. The recipe draws a list nested deeper at the second level.
 *
 * The comment's props are the registry's, listed under CommentThread as
 * `Comment.author` and the rest.
 */
export default describeMember({
  member: 'CommentThread',
  dir: 'structure',
  recipe: 'structure/comment-thread',
  types: {
    // The words the member writes itself, generic English defaults that localized hosts replace.
    CommentThreadMessages: '{ edited: string; replies: string }',
  },
  defaults: { messages: "() => ({ edited: 'Edited', replies: 'Replies' })" },
  provide: { messages: 'messages' },
  template: el(
    'ol',
    {
      class: ['thread'],
      // Written because a browser drops a list's semantics when its markers are removed.
      attrs: { role: lit('list'), 'aria-label': 'label', ...identity('CommentThread') },
    },
    [slot()],
  ),
  parts: [
    {
      name: 'Comment',
      public: true,
      purpose: 'one comment: its author, time, body, labels, actions and replies',
      defaults: { edited: 'false' },
      derived: {
        // A comment outside a thread has no owner, and writes the English defaults.
        words: "owner.messages ?? { edited: 'Edited', replies: 'Replies' }",
        authorId: '`${uid}-author`',
        timeId: '`${uid}-time`',
      },
      template: el('li', { class: ['comment'] }, [
        el(
          'article',
          {
            class: ['entry'],
            // Named by the author and the time, so a reader moving by article
            // hears who wrote it and when.
            attrs: { 'aria-labelledby': 'slots.time ? `${authorId} ${timeId}` : authorId' },
          },
          [
            cond('slots.avatar', [el('span', { class: ['mark'] }, [slot('avatar')])]),
            el('div', { class: ['body'] }, [
              el('div', { class: ['head'] }, [
                el('span', { class: ['author'], attrs: { id: 'authorId' } }, [text('author')]),
                cond('slots.time', [
                  el('span', { class: ['time'], attrs: { id: 'timeId' } }, [slot('time')]),
                ]),
                cond('edited', [el('span', { class: ['edited'] }, [text('words.edited')])]),
                cond('slots.meta', [el('span', { class: ['meta'] }, [slot('meta')])]),
              ]),
              el('div', { class: ['content'] }, [slot()]),
              cond('slots.actions', [el('div', { class: ['actions'] }, [slot('actions')])]),
            ]),
          ],
        ),
        // A second list inside the item, so a reply is reached as a reply.
        cond('slots.replies', [
          el(
            'ol',
            { class: ['replies'], attrs: { role: lit('list'), 'aria-label': 'words.replies' } },
            [slot('replies')],
          ),
        ]),
      ]),
    },
  ],
  states: [
    {
      name: 'a thread with replies',
      props: { label: 'Comments' },
      slots: {
        default: [
          fx(
            'CommentThreadComment',
            { author: 'Ada Okafor' },
            {
              avatar: [avatar('Ada Okafor')],
              time: [fx('RelativeTime', { value: '2026-11-14T09:40:00Z', mode: 'absolute' })],
              actions: ACTIONS,
              replies: [
                comment(
                  'Bao Tran',
                  '09:52',
                  'It retries on any 5xx. The second attempt sent the cached payload.',
                  {},
                  { actions: ACTIONS },
                ),
                comment(
                  'Ada Okafor',
                  '10:05',
                  'So the code was applied twice. I will open a fix.',
                  {},
                  { actions: ACTIONS },
                ),
              ],
              default: [
                words(
                  'The webhook retried twice with the same promo code. Is the retry idempotent?',
                ),
              ],
            },
          ),
          comment(
            'Carmen Ruiz',
            '11:20',
            'The customer confirmed that the second charge was refunded.',
            {},
            { actions: ACTIONS },
          ),
        ],
      },
      expect: { 'aria-label': 'Comments' },
    },
    {
      name: 'an internal note',
      props: { label: 'Ticket messages' },
      slots: {
        default: [
          comment(
            'Bao Tran',
            'Yesterday',
            'The customer is on the legacy plan. Do not offer the annual discount.',
            {},
            { meta: [fx('Badge', { tone: 'warning' }, { default: ['Internal note'] })] },
          ),
        ],
      },
    },
    {
      name: 'an edited comment',
      props: { label: 'Comments' },
      slots: {
        default: [
          comment(
            'Carmen Ruiz',
            '2 Nov',
            'The export finished. The archive is kept for thirty days.',
            { edited: true },
            { actions: ACTIONS },
          ),
        ],
      },
    },
    {
      name: 'a resolved thread',
      props: { label: 'Comments' },
      slots: {
        default: [
          comment(
            'Ada Okafor',
            'Monday',
            'This heading should say “Delivery”, not “Shipping”.',
            {},
            {
              meta: [fx('Badge', { tone: 'success' }, { default: ['Resolved'] })],
              replies: [comment('Bao Tran', 'Monday', 'Renamed in the latest version.')],
            },
          ),
        ],
      },
    },
    {
      name: 'attachments and a mention',
      props: { label: 'Comments' },
      slots: {
        default: [
          fx(
            'CommentThreadComment',
            { author: 'Ada Okafor' },
            {
              avatar: [avatar('Ada Okafor')],
              time: ['09:40'],
              actions: ACTIONS,
              default: [
                fx(
                  'Text',
                  {},
                  {
                    default: [
                      fx('Link', { href: '#people/bao' }, { default: ['@Bao Tran'] }),
                      ' here is the delivery log and the policy we agreed on.',
                    ],
                  },
                ),
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
          ),
        ],
      },
    },
    {
      name: 'a reply to a reply — drawn at the second level',
      props: { label: 'Comments' },
      slots: {
        default: [
          comment(
            'Ada Okafor',
            '09:40',
            'How many times may a delivery be retried?',
            {},
            {
              replies: [
                comment(
                  'Bao Tran',
                  '09:52',
                  'We should cap the retries at five.',
                  {},
                  {
                    replies: [
                      comment('Carmen Ruiz', '10:01', 'Agreed. The policy allows five attempts.'),
                    ],
                  },
                ),
              ],
            },
          ),
        ],
      },
    },
    {
      name: 'long unbroken text at phone width',
      many: {
        within: { element: 'div', class: ['harnessPhone'] },
        each: [
          {
            props: { label: 'Comments' },
            slots: {
              default: [
                comment(
                  LONG_AUTHOR,
                  '09:40',
                  LONG_ADDRESS,
                  {},
                  {
                    meta: [fx('Badge', { tone: 'warning' }, { default: ['Internal note'] })],
                    actions: ACTIONS,
                  },
                ),
              ],
            },
          },
        ],
      },
    },
    {
      name: 'followed by a composer',
      many: {
        within: { member: 'Stack', props: { gap: 4 } },
        each: [ASKED],
        also: [
          fx('FormField', { label: 'Reply' }, { default: [fx('Textarea', { rows: 3 })] }),
          fx(
            'Inline',
            { justify: 'end' },
            { default: [fx('Button', { variant: 'solid', tone: 'accent', label: 'Comment' })] },
          ),
        ],
      },
    },
  ],
})
