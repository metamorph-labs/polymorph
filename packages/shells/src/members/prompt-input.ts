import {
  cond,
  describeMember,
  each,
  el,
  emit,
  flag,
  fx,
  identity,
  js,
  lit,
  member,
  run,
  slot,
  text,
  when,
  type Node,
} from '../dsl'

const noop = js('() => {}')

const ATTACHMENTS = [
  { id: 'a', name: 'retry-policy.pdf', size: 184_320 },
  { id: 'b', name: 'screenshot.png', size: 48_210, status: 'uploading' },
]

const MODELS = [
  { value: 'fast', label: 'Fast' },
  { value: 'thorough', label: 'Thorough' },
]

const TRIGGERS = [
  {
    char: '@',
    label: 'People',
    options: [
      { id: 'ada', label: 'Ada Lovelace', description: 'Engineering' },
      { id: 'grace', label: 'Grace Hopper', description: 'Compilers' },
      { id: 'alan', label: 'Alan Turing', description: 'Research' },
    ],
  },
  {
    char: '/',
    label: 'Commands',
    at: 'start',
    options: [
      { id: 'summarize', label: 'summarize', icon: 'document' },
      { id: 'search', label: 'search', icon: 'search' },
    ],
  },
]

/** A toolbar control: every one is a small icon-only Button. */
const control = (variant: string, tone: string) => ({
  variant: lit(variant),
  tone: lit(tone),
  size: lit('sm'),
  iconOnly: 'true',
})

/**
 * One chip, with or without the remove request: the chip draws its ✕ only for a listener. A
 * press is remembered, so focus can move once the app has removed the attachment.
 */
const chip = (removable: boolean): Node =>
  member(
    'AttachmentChip',
    {
      name: 'attachment.name',
      size: 'attachment.size',
      status: 'attachment.status',
      message: 'attachment.message',
      removeLabel: 'messages.remove(attachment.name)',
      uploadingLabel: 'messages.uploading(attachment.name)',
    },
    removable
      ? {
          on: {
            remove: run(
              "((pressed = { id: attachment.id, at: attachments.indexOf(attachment) }), emit('removeAttachment', attachment.id))",
            ),
          },
        }
      : {},
  )

/**
 * PromptInput (`design/components/prompt-input.md`): the chat composer. A
 * textarea that grows with the prompt through the engine's `fitTextarea`,
 * Enter to send and Shift+Enter for a new line, one control that sends or
 * stops, and files from the attach control, a drop or a paste, each through
 * the engine's `gateFiles`, FileUpload's gate. The app owns the attachments:
 * the chips draw them as given and ask for removal by id.
 *
 * The text is held while the caller does not control it, and a sent prompt
 * clears it only then: a controlled value is the app's to keep or clear.
 *
 * A trigger (`@`, `/`) opens a list of the app's suggestions above or below
 * the composer while the caret is in a token, by the engine's `promptToken`.
 * The caret is read after each input, key, press and focus, and not while an
 * input method composes. Focus stays in the field, which names the list and
 * its active option, as Combobox's input does. A pick writes text in place of
 * the token by the engine's `promptPick`, puts the caret after it once the
 * text has rendered, and calls the trigger's `onSelect`.
 */
export default describeMember({
  member: 'PromptInput',
  dir: 'ai',
  recipe: 'ai/prompt-input',
  types: {
    PromptInputMaxRows: "NonNullable<PromptInputProps['maxRows']>",

    PromptAttachment:
      '{ id: string; name: string; size?: number; status?: AttachmentStatus; message?: string }',
    PromptInputMessages:
      '{ send: string; stop: string; attach: string; remove: (name: string) => string; uploading: (name: string) => string; suggestions?: (count: number) => string; loadingSuggestions?: string; noSuggestions?: string }',
    PromptTriggerOption:
      '{ id: string; label: string; description?: string; icon?: IconRole; insert?: string }',
    PromptTrigger:
      "{ char: string; label: string; options: PromptTriggerOption[]; at?: 'word' | 'start'; filter?: 'contains' | 'startsWith' | false; loading?: boolean; onQueryChange?: (query: string) => void; onSelect?: (option: PromptTriggerOption) => void }",
  },
  uses: ['AttachmentStatus'],
  defaults: {
    streaming: 'false',
    disabled: 'false',
    maxRows: '8',
    attachments: '() => []',
    triggers: '() => []',
    multiple: 'true',
    autoFocus: 'false',
    messages:
      "() => ({ send: 'Send', stop: 'Stop', attach: 'Attach', remove: (name) => `Remove ${name}`, uploading: (name) => `${name}: uploading` })",
  },
  state: {
    uncontrolled: "defaultValue ?? ''",
    dragover: 'false',
    // The caret while the field has focus and no range is selected; not read while an input
    // method composes.
    caret: 'null as number | null',
    composing: 'false',
    // The start of the token Escape closed the list on, which stays closed while the caret is in it.
    dismissed: 'null as number | null',
    // The active option, by its index in the list for one query.
    highlight: "{ key: '', index: 0 }",
    // The side the list opens on: toward the larger space in the viewport.
    side: "'top' as 'top' | 'bottom'",
    // The list the app last heard of, by trigger, token and query.
    reported: 'null as string | null',
    // The chip whose remove control was pressed, until the app has removed its attachment.
    pressed: 'null as { id: string; at: number } | null',
  },
  derived: {
    text: 'value ?? uncontrolled',
    // Whitespace is empty; a chip is content.
    empty: "text.trim() === '' && attachments.length === 0",
    attachable: 'listening.attach && !disabled',
    setText: "(next: string) => ((uncontrolled = next), emit('change', next))",
    // Nothing is sent while a reply arrives, and a sent prompt leaves an uncontrolled field empty.
    submit:
      "() => !disabled && !streaming && !empty && (emit('submit', text), value === undefined && (uncontrolled = ''))",
    // FileUpload's gate, for the picker, a drop and a paste alike.
    add: "(list: FileList | File[] | null | undefined) => attachable && list != null && list.length > 0 && ((gate) => (gate.accepted.length > 0 && emit('attach', gate.accepted), gate.rejected.length > 0 && emit('reject', gate.rejected)))(gateFiles(Array.from(list), { accept, multiple, maxSize }))",

    // The suggestion list.
    suggesting: 'triggers.length > 0',
    token: 'disabled ? null : promptToken(text, caret, triggers)',
    trigger: 'token === null ? undefined : triggers[token.trigger]',
    open: 'token !== null && trigger !== undefined && token.start !== dismissed',
    query: "token?.query ?? ''",
    // Combobox's filter: the locale's collation at base sensitivity, as React Aria's `useFilter`.
    collator: "new Intl.Collator(undefined, { usage: 'search', sensitivity: 'base' })",
    needle: "query.normalize('NFC')",
    matches:
      "(label: string) => ((candidate: string) => needle === '' || (trigger?.filter === 'startsWith' ? collator.compare(candidate.slice(0, needle.length), needle) === 0 : Array.from({ length: Math.max(0, candidate.length - needle.length + 1) }, (_, at) => candidate.slice(at, at + needle.length)).some((part) => collator.compare(part, needle) === 0)))(label.normalize('NFC'))",
    // `false` means the app has filtered, so its options are shown as given.
    shown:
      '!open || trigger === undefined ? [] : trigger.filter === false ? trigger.options : trigger.options.filter((option) => matches(option.label))',
    loading: 'open && trigger?.loading === true',
    // One trigger, one token and one query: the active option starts at the first again.
    listKey: "open && token !== null ? `${token.trigger}:${token.start}:${query}` : ''",
    sideKey: 'open && token !== null ? `${token.trigger}:${token.start}` : null',
    active:
      'shown.length === 0 ? -1 : highlight.key === listKey ? Math.min(highlight.index, shown.length - 1) : 0',
    listId: '`${uid}-suggestions`',
    say: "{ suggestions: messages.suggestions ?? ((count: number) => `${count} suggestions`), loadingSuggestions: messages.loadingSuggestions ?? 'Loading suggestions…', noSuggestions: messages.noSuggestions ?? 'No results' }",
    // One live region, as Combobox's: a region that mounts with its words announces nothing.
    announcement:
      "!open ? '' : loading ? say.loadingSuggestions : shown.length === 0 ? say.noSuggestions : say.suggestions(shown.length)",
    // Reads the caret, and tells the app a new query from the event that changed it, as an input's
    // own change is reported: when the list opens and at each change while it is open. A closed
    // token is forgotten once the caret is out of it. A field that does not hold the composer's
    // text yet is read at its next event, because the caret in it belongs to the text before.
    track: `(element: HTMLTextAreaElement, nextText: string) => {
      if (composing || element.value !== nextText) return
      const next =
        element.ownerDocument.activeElement === element && element.selectionStart === element.selectionEnd
          ? element.selectionStart
          : null
      const found = disabled ? null : promptToken(nextText, next, triggers)
      const closed = found !== null && found.start === dismissed ? dismissed : null
      caret = next
      dismissed = closed
      const key = found === null || closed !== null ? null : found.trigger + ':' + found.start + ':' + found.query
      if (key === reported) return
      reported = key
      if (found !== null && key !== null) triggers[found.trigger]?.onQueryChange?.(found.query)
    }`,
    // The token's text replaced, the caret after it once the text has rendered, and the pick told.
    pick: `(index: number) => {
      const option = shown[index]
      const at = token
      const by = trigger
      if (option === undefined || at === null || by === undefined || caret === null) return
      const next = promptPick(text, at, caret, option.insert ?? by.char + option.label)
      setText(next.text)
      caret = next.caret
      dismissed = null
      reported = null
      afterRender(() => (field as HTMLTextAreaElement | null)?.setSelectionRange(next.caret, next.caret))
      by.onSelect?.(option)
    }`,
    // The list's keys while it is open; returns whether the key was the list's. Enter with no
    // active option does nothing while the options load, because they are about to arrive, and
    // sends when nothing matches, as with the list closed: the empty row has said so.
    listKeys: `(event: KeyboardEvent) => {
      const at = token
      if (!open || at === null) return false
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        if (shown.length === 0) return false
        event.preventDefault()
        highlight = {
          key: listKey,
          index: event.key === 'ArrowDown' ? Math.min(active + 1, shown.length - 1) : Math.max(active - 1, 0),
        }
        return true
      }
      if (event.key === 'Enter') {
        if (event.shiftKey || (active === -1 && !loading)) return false
        event.preventDefault()
        if (active !== -1) pick(active)
        return true
      }
      if (event.key === 'Tab') {
        if (event.shiftKey || active === -1) return false
        event.preventDefault()
        pick(active)
        return true
      }
      if (event.key === 'Escape') {
        // Escape closes the list and keeps the text. A dialog around the composer stays open,
        // because holdEscape has prevented the key's default.
        event.preventDefault()
        event.stopPropagation()
        dismissed = at.start
        reported = null
        return true
      }
      return false
    }`,
  },
  effects: [
    // Textarea's autosize, always on: one line until the prompt needs two, up to `maxRows`.
    { watch: 'text', run: 'field && fitTextarea(field as HTMLTextAreaElement)' },
    // On mount only, as the native `autofocus` is read on load, with the caret at the end of
    // the prompt, where the reader goes on writing. The caret is placed after the focus, because
    // WebKit moves it when a field takes focus, and then read.
    {
      run: 'autoFocus && field && (field.focus(), (field as HTMLTextAreaElement).setSelectionRange(text.length, text.length), track(field as HTMLTextAreaElement, text))',
    },
    // The first Escape is the list's while it is open. A dialog's layer hears Escape on the
    // document in the capture phase, before the field does, and closes unless the key's default
    // is prevented, so the composer prevents it on the window, which the key reaches first.
    {
      watch: 'open',
      run: 'open && field ? holdFieldEscape(field) : () => {}',
      release: 'ran()',
    },
    // Once the app has removed the attachment of a pressed chip, focus moves to the remove
    // control of the chip in its place, else of the chip before it, else to the field
    // (`focusAfterListRemoval`).
    {
      watch: 'attachments',
      mount: false,
      run: "pressed = focusAfterListRemoval(pressed, attachments.map((attachment) => attachment.id), (at) => chips?.children[at]?.querySelector<HTMLElement>('button'), field)",
    },
    // The side, measured when the list opens.
    {
      watch: 'sideKey',
      run: "sideKey !== null && root && ((box: DOMRect) => (side = box.top >= window.innerHeight - box.bottom ? 'top' : 'bottom'))((root as HTMLElement).getBoundingClientRect())",
    },
  ],
  // The spec's `agent` fence. An agent writes the prompt through the field as typing does
  // (`agentFill`), so the input handler runs and `change` is emitted, and sends and stops as the
  // one control's two faces do. The composer's own parts are withheld: the chips, the attach
  // control and the send or stop control. The toolbar also holds the app's `leading` and
  // `trailing` controls, which stay an agent's, so the parts are given one by one: the attach
  // control is the toolbar's first element while there is one, and the send or stop control is
  // the end's last, after `trailing`.
  agent: {
    on: 'field',
    state: {
      value: 'text',
      attachments:
        'attachments.map((attachment) => ({ id: attachment.id, label: attachment.name, ...(listening.removeAttachment && !disabled ? {} : { disabled: true }) }))',
      streaming: 'streaming',
      disabled: 'disabled',
    },
    actions: {
      fill: { argument: 'text', run: 'agentFill(field, value)' },
      clear: "agentFill(field, '')",
      submit: `(() => {
        if (streaming) throw new Error('A reply is arriving; stop it before sending a prompt.')
        if (empty) throw new Error('The prompt is empty, and an empty prompt is not sent.')
        submit()
      })()`,
      stop: `(() => {
        if (!streaming) throw new Error('No reply is arriving, so there is nothing to stop.')
        emit('stop')
      })()`,
      remove: { argument: 'id', run: "emit('removeAttachment', value)" },
    },
    withholds:
      '[chips, listening.attach ? toolbar?.firstElementChild : null, end?.lastElementChild]',
  },
  template: el(
    'div',
    {
      part: 'root',
      ref: 'root',
      class: ['root'],
      attrs: {
        'data-state': "streaming ? 'streaming' : dragover ? 'dragover' : undefined",
        'data-disabled': flag('disabled'),
        'data-empty': flag('empty'),
        'data-max-rows': 'String(maxRows)',
        ...identity('PromptInput'),
      },
    },
    [
      el(
        'div',
        {
          part: 'frame',
          class: ['frame'],
          on: {
            dragover: run('($event.preventDefault(), (dragover = true))', 'attachable'),
            // A move onto a child of the frame is not a leave.
            dragleave: run(
              '(dragover = false)',
              '!($event.currentTarget as HTMLElement).contains($event.relatedTarget as Node | null)',
            ),
            drop: run(
              '($event.preventDefault(), (dragover = false), add($event.dataTransfer?.files))',
              'attachable',
            ),
          },
        },
        [
          cond('attachments.length > 0', [
            el('div', { part: 'attachments', ref: 'chips', class: ['attachments'] }, [
              each('attachments', 'attachment', 'attachment.id', [
                cond('listening.removeAttachment && !disabled', [chip(true)], [chip(false)]),
              ]),
            ]),
          ]),
          el('textarea', {
            part: 'field',
            ref: 'field',
            class: ['field'],
            attrs: {
              id: 'id',
              name: 'name',
              rows: '1',
              value: 'text',
              placeholder: 'placeholder',
              disabled: 'disabled',
              'aria-label': 'label',
              // The ARIA combobox pattern, on a textbox: it offers a list, names the open one and
              // its active option. `aria-expanded` is not a textbox's.
              'aria-autocomplete': when('suggesting', lit('list')),
              'aria-haspopup': when('suggesting', lit('listbox')),
              'aria-controls': when('open', 'listId'),
              'aria-activedescendant': when(
                'open && active !== -1',
                '`${uid}-suggestion-${active}`',
              ),
            },
            on: {
              // The caret is not read while a composition runs: `track` waits for its end.
              input: run(
                '(setText(($event.target as HTMLTextAreaElement).value), track($event.target as HTMLTextAreaElement, ($event.target as HTMLTextAreaElement).value))',
              ),
              // Every key an input method is handling is its own (`composingKey`): Enter confirms
              // the candidate, and sending would post half a word. With the list open its keys
              // come first; otherwise Enter sends and Shift+Enter is a new line.
              keydown: run(
                "!listKeys($event) && $event.key === 'Enter' && !$event.shiftKey && ($event.preventDefault(), submit())",
                '!composingKey($event)',
              ),
              keyup: run('track($event.currentTarget as HTMLTextAreaElement, text)'),
              pointerup: run('track($event.currentTarget as HTMLTextAreaElement, text)'),
              focus: run('track($event.currentTarget as HTMLTextAreaElement, text)'),
              blur: run('((caret = null), (reported = null))'),
              compositionstart: run('(composing = true)'),
              compositionend: run(
                '((composing = false), track($event.currentTarget as HTMLTextAreaElement, text))',
              ),
              // Only a paste of files is taken; pasted text keeps its default.
              paste: run(
                '($event.preventDefault(), add($event.clipboardData?.files))',
                'attachable && ($event.clipboardData?.files.length ?? 0) > 0',
              ),
            },
          }),
          el('div', { part: 'toolbar', ref: 'toolbar', class: ['toolbar'] }, [
            cond('listening.attach', [
              member(
                'Button',
                {
                  ...control('ghost', 'neutral'),
                  icon: lit('attach'),
                  label: 'messages.attach',
                  disabled: 'disabled',
                },
                { on: { click: run('picker?.click()') } },
              ),
            ]),
            slot('leading'),
            el('div', { part: 'end', ref: 'end', class: ['end'] }, [
              slot('trailing'),
              // One control with two faces. Stop is the quieter outline: stopping is never dangerous.
              cond(
                'streaming',
                [
                  member(
                    'Button',
                    { ...control('outline', 'neutral'), icon: lit('stop'), label: 'messages.stop' },
                    { on: { click: emit('stop') } },
                  ),
                ],
                [
                  member(
                    'Button',
                    {
                      ...control('solid', 'accent'),
                      icon: lit('send'),
                      label: 'messages.send',
                      disabled: 'disabled || empty',
                    },
                    { on: { click: run('submit()') } },
                  ),
                ],
              ),
            ]),
          ]),
          // FileUpload's hidden picker, opened by the attach control, out of the tab order.
          cond('listening.attach', [
            el('input', {
              part: 'picker',
              ref: 'picker',
              class: ['picker'],
              attrs: {
                type: lit('file'),
                accept: 'accept',
                multiple: 'multiple',
                disabled: 'disabled',
                tabindex: lit('-1'),
              },
              on: {
                change: run(
                  "(add(($event.target as HTMLInputElement).files), (($event.target as HTMLInputElement).value = ''))",
                ),
              },
            }),
          ]),
        ],
      ),
      cond('hint !== undefined', [el('p', { part: 'hint', class: ['hint'] }, [text('hint')])]),
      // The suggestions, on the side of the composer with more room. A press on them keeps focus
      // in the field, where the caret marks the token.
      cond('open && trigger !== undefined', [
        el(
          'div',
          {
            part: 'suggestions',
            class: ['suggestions'],
            attrs: { 'data-side': 'side', 'data-prompt-part': lit('suggestions') },
            on: { mousedown: run('$event.preventDefault()') },
          },
          [
            el(
              'ul',
              {
                part: 'list',
                class: ['listbox'],
                attrs: { id: 'listId', role: lit('listbox'), 'aria-label': 'trigger?.label' },
              },
              [
                each(
                  'shown',
                  'option',
                  'option.id',
                  [
                    el(
                      'li',
                      {
                        part: 'option',
                        class: ['option'],
                        attrs: {
                          id: '`${uid}-suggestion-${index}`',
                          role: lit('option'),
                          'aria-selected': "index === active ? 'true' : 'false'",
                          'data-highlighted': flag('index === active'),
                        },
                        on: {
                          pointermove: run(
                            '(highlight = { key: listKey, index })',
                            'index !== active',
                          ),
                          click: run('pick(index)'),
                        },
                      },
                      [
                        cond('option.icon !== undefined', [
                          el('span', { class: ['glyph'] }, [
                            member('Icon', { name: 'option.icon', size: lit('sm') }),
                          ]),
                        ]),
                        el('span', { class: ['text'] }, [
                          el('span', { class: ['label'] }, [text('option.label')]),
                          cond('option.description !== undefined', [
                            el('span', { class: ['description'] }, [text('option.description')]),
                          ]),
                        ]),
                      ],
                    ),
                  ],
                  'index',
                ),
              ],
            ),
            // Combobox's loading rows, and its empty row, heard once through the status region.
            cond('loading', [
              el('div', { class: ['rows'], attrs: { 'aria-hidden': lit('true') } }, [
                each('[0, 1, 2]', 'row', 'row', [
                  el('div', { class: ['row'] }, [member('Skeleton', { textStep: lit('sm') })]),
                ]),
              ]),
            ]),
            cond('!loading && shown.length === 0', [
              el('div', { class: ['empty'], attrs: { 'aria-hidden': lit('true') } }, [
                text('say.noSuggestions'),
              ]),
            ]),
          ],
        ),
      ]),
      cond('suggesting', [
        el(
          'div',
          { class: ['status'], attrs: { role: lit('status'), 'aria-live': lit('polite') } },
          [text('announcement')],
        ),
      ]),
    ],
  ),
  states: [
    {
      name: 'empty — one line, send waits for words',
      props: { label: 'Message', placeholder: 'Ask anything…', onSubmit: noop },
      expect: { 'data-empty': '', 'data-state': null },
    },
    {
      name: 'with a prompt — send is live',
      props: {
        label: 'Message',
        defaultValue: 'Why did the webhook retry twice with the same promo code?',
        onSubmit: noop,
      },
      expect: { 'data-empty': null },
    },
    {
      name: 'grown — several lines, up to the ceiling',
      props: {
        label: 'Message',
        maxRows: 4,
        // Its newlines are written as escapes.
        defaultValue: js(
          JSON.stringify(
            'Line one of a longer prompt.\nLine two, with more context.\nLine three.\nLine four.\nLine five scrolls inside the field.',
          ),
        ),
        onSubmit: noop,
      },
      expect: { 'data-max-rows': '4' },
    },
    {
      name: 'attachable — the attach control, and two chips in the frame',
      props: {
        label: 'Message',
        placeholder: 'Ask about these files…',
        attachments: ATTACHMENTS,
        onAttach: noop,
        onReject: noop,
        onRemoveAttachment: noop,
        onSubmit: noop,
      },
    },
    {
      name: 'the app’s slots — a model picker leading, a hint beneath',
      props: {
        label: 'Message',
        placeholder: 'Ask anything…',
        hint: 'Enter to send · Shift+Enter for a new line',
        onSubmit: noop,
      },
      slots: {
        leading: [
          fx('Select', {
            size: 'sm',
            options: MODELS,
            defaultValue: 'fast',
            'aria-label': 'Model',
          }),
        ],
      },
    },
    {
      // Focused on mount, because the list opens while the caret is in a token.
      name: 'suggesting — the people an @ lists, above the composer',
      props: {
        label: 'Message',
        defaultValue: 'Ask @',
        autoFocus: true,
        triggers: TRIGGERS,
        onSubmit: noop,
      },
    },
    {
      name: 'streaming — send has become stop',
      props: { label: 'Message', streaming: true, onStop: noop, onSubmit: noop },
      expect: { 'data-state': 'streaming' },
    },
    {
      name: 'disabled',
      props: {
        label: 'Message',
        disabled: true,
        defaultValue: 'A prompt nobody can send',
        onSubmit: noop,
      },
      expect: { 'data-disabled': '' },
    },
    {
      name: 'voice input — a RecordButton in the trailing slot',
      props: { label: 'Message', placeholder: 'Ask anything…', onSubmit: noop },
      slots: {
        trailing: [
          fx('RecordButton', {
            size: 'sm',
            label: 'Record a voice message',
            stopLabel: 'Stop recording',
          }),
        ],
      },
    },
    {
      name: 'recording a voice message — the time and the level beside send',
      props: { label: 'Message', placeholder: 'Ask anything…', onSubmit: noop },
      slots: {
        trailing: [
          fx('RecordButton', {
            size: 'sm',
            label: 'Record a voice message',
            stopLabel: 'Stop recording',
            recording: true,
            elapsed: 9,
            level: 0.4,
          }),
        ],
      },
    },
  ],
})
