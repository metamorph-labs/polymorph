import { cond, describeMember, el, emit, identity, js, lit, member, text } from '../dsl'

const noop = js('() => {}')

const POLICY = { name: 'retry-policy.pdf', size: 184_320 }

/**
 * AttachmentChip (`design/components/attachment-chip.md`): a file attached to
 * a prompt, in the composer where it can still be removed and in the sent
 * message where it cannot. The app owns the network: the chip draws `status`
 * and `message` as given and asks for removal through `remove`, and its size
 * is the engine's `formatBytes`, so it reads as FileUpload's rows read.
 */
export default describeMember({
  member: 'AttachmentChip',
  dir: 'ai',
  recipe: 'ai/attachment-chip',
  // PromptInput's attachments name it.
  types: { AttachmentStatus: "'uploading' | 'done' | 'error'" },
  defaults: { status: lit('done'), icon: lit('document') },
  // The spec's `agent` fence. An agent reads the file's name and status and removes the chip as
  // its remove control does. The chip withholds its own parts, the remove Button and the Link its
  // name becomes. A chip that nobody handles `remove` for is a sent file's record.
  agent: {
    on: 'file',
    state: { name: 'name', status: 'status' },
    actions: {
      remove: `(() => {
        if (!listening.remove) throw new Error('The chip records a sent file and has no remove control.')
        emit('remove')
      })()`,
    },
    withholds: 'chip',
  },
  template: el(
    'span',
    {
      part: 'chip',
      // The region an agent may not reach into.
      ref: 'chip',
      class: ['chip'],
      attrs: { 'data-status': 'status', ...identity('AttachmentChip') },
    },
    [
      el('span', { part: 'mark', class: ['mark'] }, [
        cond(
          "status === 'uploading'",
          [
            // The spinner's name is the chip's whole status, so the glyph swap is announced in words.
            member('Spinner', { size: lit('sm'), label: 'uploadingLabel ?? `${name}: uploading`' }),
          ],
          "status === 'error'",
          [member('Icon', { name: lit('error'), size: lit('sm') })],
          [member('Icon', { name: 'icon', size: lit('sm') })],
        ),
      ]),
      el('span', { part: 'body', class: ['body'] }, [
        // The file's name, which names the chip for an agent.
        el('span', { part: 'name', ref: 'file', class: ['name'] }, [
          cond(
            'href === undefined',
            [text('name')],
            [
              member(
                'Link',
                { href: 'href', external: 'true' },
                { slots: { default: [text('name')] } },
              ),
            ],
          ),
        ]),
        cond("size !== undefined && status !== 'error'", [
          el('span', { part: 'meta', class: ['meta'] }, [text('formatBytes(size)')]),
        ]),
        // The message takes the size's place, in the app's words.
        cond("status === 'error' && message !== undefined", [
          el('span', { part: 'message', class: ['message'] }, [text('message')]),
        ]),
      ]),
      // The remove control only where someone handles `remove`: a sent message has none.
      cond('listening.remove', [
        member(
          'Button',
          {
            variant: lit('ghost'),
            tone: lit('neutral'),
            size: lit('sm'),
            iconOnly: 'true',
            icon: lit('close'),
            label: 'removeLabel ?? `Remove ${name}`',
          },
          { on: { click: emit('remove') } },
        ),
      ]),
    ],
  ),
  states: [
    {
      name: 'removable — in the composer, with the name and the size',
      props: { ...POLICY, onRemove: noop },
      expect: { 'data-status': 'done' },
    },
    {
      name: 'sent — in a message, nothing to remove',
      props: POLICY,
      expect: { 'data-status': 'done' },
    },
    {
      name: 'openable — the name is a link to the file',
      props: { ...POLICY, href: 'https://files.example.org/retry-policy.pdf' },
    },
    {
      name: 'uploading — the spinner takes the mark',
      props: { name: 'screenshot.png', status: 'uploading', onRemove: noop },
      expect: { 'data-status': 'uploading' },
    },
    {
      name: 'error — the app’s words, in the danger ink',
      props: {
        name: 'archive.zip',
        status: 'error',
        message: 'Too large for this plan',
        onRemove: noop,
      },
      expect: { 'data-status': 'error' },
    },
    {
      name: 'a long name — ellipsed, the control still reachable',
      many: {
        within: { member: 'Inline', props: { gap: 2 } },
        each: [
          {
            props: {
              name: 'quarterly-webhook-delivery-report-with-every-retry-and-its-outcome-2026.csv',
              size: 2_457_600,
              icon: 'table',
              onRemove: noop,
            },
          },
        ],
      },
    },
  ],
})
