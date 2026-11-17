import {
  cond,
  describeMember,
  el,
  flag,
  fx,
  identity,
  js,
  lit,
  member,
  run,
  slot,
  when,
  type FixtureChild,
} from '../dsl'

import { PROSE } from './markdown'

const noop = js('() => {}')

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

/** The hover row every reply carries, as ChatMessage's fixture draws it. */
const REPLY_ACTIONS = [
  action('copy', 'Copy'),
  action('refresh', 'Regenerate'),
  action('helpful', 'Helpful'),
  action('unhelpful', 'Not helpful'),
]

/** React's fixture replies, in Markdown (`markdown.states`). */
const STRUCTURE =
  '## What changed\n\n1. Retries now carry the original idempotency key.\n2. The backoff cap moved from three attempts to five.\n   - The first retry still fires after two seconds.\n   - Each later one doubles the wait.\n3. A `429` from the receiver is retried; a `410` is not.\n\n### Why it matters\n\nA duplicate delivery is refused rather than applied twice, which is what the ~~old~~ previous behaviour could not promise.'

/** React's fixture streams the first characters of the prose reply, Markdown marks and all. */
const STREAMED = PROSE.slice(0, 120)

const markdown = (source: string): FixtureChild => fx('Markdown', {}, { default: [source] })

const QUESTION = 'Why did the webhook retry twice with the same promo code?'

/** Four turns in both registers, which ConversationPage's fixture shows too, as React's does. */
export const TURNS: FixtureChild[] = [
  fx('ChatMessage', { role: 'user', author: 'You', time: '09:40' }, { default: [QUESTION] }),
  fx(
    'ChatMessage',
    { role: 'assistant', author: 'Pilot', time: '09:41' },
    { default: [markdown(PROSE)], actions: REPLY_ACTIONS },
  ),
  fx(
    'ChatMessage',
    { role: 'user', author: 'You', time: '09:43' },
    { default: ['What changed in the last release?'] },
  ),
  fx(
    'ChatMessage',
    { role: 'assistant', author: 'Pilot', time: '09:43' },
    { default: [markdown(STRUCTURE)], actions: REPLY_ACTIONS },
  ),
]

/**
 * ChatThread (`design/components/chat-thread.md`): the conversation's log,
 * which scrolls inside itself and follows the newest turn while the reader is
 * at the bottom.
 *
 * Following is the engine's `followEnd`, which React's ChatThread and every
 * framework's LogView follow by too. While the reader is at the bottom, a turn
 * that grows or arrives keeps the bottom in view. A reader who scrolls up stops
 * the follow, and nothing moves until they press the jump control, which calls
 * `jumpToEnd`.
 *
 * The follow is attached again when the list appears with the first turn,
 * because a thread that starts empty has no list to observe. It watches the
 * list element rather than the slot's count: the element is what it observes,
 * and Vue tracks what a slot holds only while the member renders.
 */
export default describeMember({
  member: 'ChatThread',
  dir: 'ai',
  recipe: 'ai/chat-thread',
  types: {
    // The thread's only text, a generic English default that localized hosts replace.
    ChatThreadMessages: '{ jumpToLatest: string }',
  },
  defaults: { streaming: 'false', messages: "() => ({ jumpToLatest: 'Jump to latest' })" },
  state: { detached: 'false', overflowing: 'false' },
  effects: [
    {
      watch: 'list',
      run: 'followEnd(viewport, list, (state) => { detached = state.detached; overflowing = state.overflowing })',
      release: 'ran()',
    },
  ],
  // The spec's `agent` fence. An agent reads whether a reply is arriving and finds the turns within
  // the log. The jump control moves the person's reading position, which an agent has no use for,
  // so it is withheld: it stays in the tree while hidden, where an agent would find it.
  agent: {
    on: 'viewport',
    state: { streaming: 'streaming' },
    actions: {},
    withholds: 'jump',
  },
  template: el(
    'div',
    {
      part: 'root',
      class: ['root'],
      attrs: {
        // The reader's own state, which shows the jump control; absent at rest.
        'data-state': when('detached', lit('detached')),
        'data-streaming': flag('streaming'),
        ...identity('ChatThread'),
      },
    },
    [
      // A log, so a turn is announced once when it joins and not on every token; busy while a
      // reply arrives; a tab stop only while it can scroll.
      el(
        'div',
        {
          part: 'viewport',
          class: ['viewport'],
          ref: 'viewport',
          attrs: {
            'data-chat-thread-part': lit('viewport'),
            role: lit('log'),
            'aria-label': 'label',
            'aria-relevant': lit('additions'),
            'aria-busy': when('streaming', 'true'),
            tabindex: when('overflowing', lit('0')),
          },
        },
        [
          // Read in the template, where Vue tracks what the slot holds.
          cond(
            'slotted(slots.default).count === 0',
            [el('div', { part: 'empty', class: ['empty'] }, [slot('empty')])],
            [el('div', { part: 'list', class: ['list'], ref: 'list' }, [slot()])],
          ),
        ],
      ),
      // Always in the tree; the recipe shows it on `data-state="detached"`, and `display: none`
      // keeps it out of the tab order and the accessibility tree otherwise.
      el('div', { part: 'jump', ref: 'jump', class: ['jump'] }, [
        member(
          'Button',
          {
            variant: lit('outline'),
            tone: lit('neutral'),
            size: lit('sm'),
            icon: lit('down'),
            label: 'messages.jumpToLatest',
          },
          { on: { click: run('jumpToEnd(viewport)') } },
        ),
      ]),
    ],
  ),
  states: [
    {
      name: 'a conversation — four turns, both registers',
      props: { label: 'Conversation' },
      slots: { default: TURNS },
      expect: { 'data-state': null, 'data-streaming': null },
    },
    {
      // StreamingText streams the reply, as in React; its words are React's, Markdown marks
      // included, because StreamingText renders plain text.
      name: 'streaming — the newest turn still arriving, the log busy',
      props: { label: 'Conversation', streaming: true },
      slots: {
        default: [
          fx(
            'ChatMessage',
            { role: 'user', author: 'You', time: '09:40' },
            { default: [QUESTION] },
          ),
          fx(
            'ChatMessage',
            { role: 'assistant', author: 'Pilot', status: 'streaming' },
            { default: [fx('StreamingText', { streaming: true }, { default: [STREAMED] })] },
          ),
        ],
      },
      expect: { 'data-streaming': '' },
    },
    {
      // ScrollArea's harness pattern: a fixed-height box for the thread to fill.
      name: 'in a box — the thread scrolls inside itself, reading from the bottom',
      many: {
        within: { element: 'div', class: ['harness'] },
        each: [{ props: { label: 'Conversation' }, slots: { default: [...TURNS, ...TURNS] } }],
      },
    },
    {
      name: 'empty — the app’s first words, not the thread’s',
      props: { label: 'Conversation' },
      slots: {
        empty: [
          fx('EmptyState', {
            icon: 'model',
            title: 'Ask Pilot anything',
            description:
              'It can read the workspace, run the tools you allow, and cite what it finds.',
          }),
        ],
      },
    },
  ],
})
