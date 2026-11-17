import { describeMember, el, flag, identity, lit, member, run, text, when } from '../dsl'

const VALUE = 'pnpm add @polymorph/react-ui'

/**
 * CopyButton (`design/components/copy-button.md`): a Button preset that writes
 * a value to the clipboard and confirms it. Zag's clipboard machine is not
 * used: it shows its copied state whether or not the write succeeded, and the
 * confirmation must follow a successful write only. A refused write changes
 * nothing and warns in development.
 *
 * The confirmation reverts after the feedback time, the same two seconds as
 * CodeBlock's; a copy during the confirmation restarts the wait, because each
 * successful write counts once and the timer follows the count.
 */
export default describeMember({
  member: 'CopyButton',
  dir: 'controls',
  recipe: 'controls/copy-button',
  defaults: { size: lit('md'), disabled: 'false' },
  state: { copied: 'false', copies: '0' },
  derived: {
    copy: '() => void navigator.clipboard.writeText(value).then(() => { copied = true; copies += 1 }, (refusal: unknown) => devWarning(true, `CopyButton could not write to the clipboard: ${String(refusal)}`))',
  },
  effects: [{ watch: 'copies', mount: false, delay: '2000', run: 'copied = false' }],
  template: [
    el(
      'button',
      {
        class: ['button'],
        attrs: {
          type: lit('button'),
          disabled: 'disabled',
          // The name never changes; the confirmation is announced by the status below.
          'aria-label': 'label',
          'data-variant': lit('ghost'),
          'data-tone': lit('neutral'),
          'data-size': 'size',
          'data-disabled': flag('disabled'),
          'data-icon-only': lit(''),
          'data-state': when('copied', lit('copied')),
          ...identity('CopyButton'),
        },
        on: { click: run('copy()') },
      },
      [
        // Both glyphs stay mounted in one cell, so the confirmation fades out.
        el('span', { class: ['glyphs'], attrs: { 'aria-hidden': lit('true') } }, [
          el('span', { class: ['copyGlyph'] }, [
            member('Icon', { name: lit('copy'), size: 'size' }),
          ]),
          el('span', { class: ['confirmGlyph'] }, [
            member('Icon', { name: lit('confirm'), size: 'size' }),
          ]),
        ]),
      ],
    ),
    // Rendered empty from the start, so the region exists before its first announcement.
    el('span', { class: ['status'], attrs: { role: lit('status') } }, [
      text("copied ? copiedLabel : ''"),
    ]),
  ],
  states: [
    {
      name: 'rest',
      props: { value: VALUE, label: 'Copy install command', copiedLabel: 'Copied' },
      expect: { 'aria-label': 'Copy install command', 'data-state': null },
    },
    {
      name: 'sm',
      props: { value: VALUE, label: 'Copy install command', copiedLabel: 'Copied', size: 'sm' },
      expect: { 'data-size': 'sm' },
    },
    {
      name: 'disabled',
      props: { value: VALUE, label: 'Copy install command', copiedLabel: 'Copied', disabled: true },
      expect: { 'data-disabled': '' },
    },
  ],
})
