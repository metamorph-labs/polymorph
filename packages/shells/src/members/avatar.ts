import { cond, describeMember, el, identity, lit, member, run, slot, text, when } from '../dsl'

/**
 * A portrait as a data URI, so the image entry renders the same without a
 * network request.
 */
const PORTRAIT =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">' +
      '<rect width="64" height="64" fill="#557"/>' +
      '<circle cx="32" cy="24" r="12" fill="#bbd"/>' +
      '<circle cx="32" cy="62" r="22" fill="#bbd"/>' +
      '</svg>',
  )

const NAMES = [
  'Ada Lovelace',
  'Grace Hopper',
  'Alan Turing',
  'Katherine Johnson',
  'Edsger Dijkstra',
  'Barbara Liskov',
] as const

/** How many avatars the caller put in the group. */
const COUNT = 'slotted(slots.default).count'

/**
 * Avatar.Group: a row of overlapping Avatars in the caller's order, with a
 * "+N" chip when `max` cuts the set.
 */
const group = {
  name: 'Group',
  public: true,
  purpose: 'a row of overlapping Avatars with a "+N" chip when `max` cuts the set',
  props: {
    children: {
      type: 'ReactNode',
      doc: 'Avatars, in the order the app ranks them, all with the same `size`.',
    },
    max: {
      type: 'number',
      optional: true,
      doc: 'Maximum number drawn; the rest become "+N", and omitting it draws all.',
    },
    label: {
      type: 'string',
      doc: 'The group’s accessible name, such as "Assignees" rather than "Avatars".',
    },
  },
  template: el('div', { class: ['group'], attrs: { role: lit('group'), 'aria-label': 'label' } }, [
    // A group has no name text beside it, so each member is a standalone mark, named by its name.
    slot('default', { pass: { label: 'child.label ?? child.name' }, take: 'max' }),
    // Real text, never hidden: "+N" is the overflow's text alternative. It carries `.avatar`
    // for the circle and the size, and takes the first member's size, as the set has one.
    cond(`max !== undefined && ${COUNT} > max`, [
      el(
        'span',
        {
          part: 'surplus',
          class: ['avatar', 'surplus'],
          attrs: { 'data-size': "slotted(slots.default).props.size ?? 'md'" },
        },
        [text(`\`+\${${COUNT} - max}\``)],
      ),
    ]),
  ]),
}

/**
 * Avatar (`design/components/avatar.md`): a round mark identifying a person or
 * workspace. It falls back from the image to the initials to the `user`
 * glyph; the glyph means there is no name, a different fact from a missing
 * picture. The initials take one of the five status roles the theme emits,
 * chosen by a hash of the name (`avatarTone`).
 */
export default describeMember({
  member: 'Avatar',
  dir: 'structure',
  recipe: 'structure/avatar',
  types: {
    AvatarSize: "NonNullable<AvatarProps['size']>",
  },
  defaults: { size: lit('md') },
  // The `src` whose image failed to load ('' before any has), so a new `src` gets its own attempt.
  state: { failed: "''" },
  derived: {
    initials: 'initialsOf(name)',
    showImage: 'src !== undefined && failed !== src',
    fallback: "initials === '' ? 'icon' : 'initials'",
    named: 'label !== undefined',
  },
  template: el(
    'span',
    {
      class: ['avatar'],
      attrs: {
        'data-size': 'size',
        'data-fallback': 'showImage ? undefined : fallback',
        // Only while the initials show: an image covers them, and the glyph has no name to hash.
        'data-tone': "fallback === 'initials' && !showImage ? avatarTone(name) : undefined",
        // Beside a visible name the mark would repeat it, so only a standalone mark is named.
        role: when('named', lit('img')),
        'aria-label': 'label',
        'aria-hidden': when('!named', 'true'),
        ...identity('Avatar'),
      },
    },
    [
      // Layered over the fallback, which is already painted, so the image fades in without a jump.
      cond('showImage', [
        el('img', {
          part: 'image',
          class: ['image'],
          attrs: { src: 'src', alt: lit(''), draggable: lit('false') },
          on: { error: run("failed = src ?? ''") },
        }),
      ]),
      cond(
        "fallback === 'icon'",
        [member('Icon', { name: lit('user'), size: 'size' })],
        [el('span', { part: 'initials', class: ['initials'] }, [text('initials')])],
      ),
    ],
  ),
  parts: [group],
  states: [
    {
      name: 'initials — two words become two letters',
      props: { name: 'Ada Lovelace' },
      expect: { 'data-fallback': 'initials', 'data-size': 'md' },
    },
    {
      name: 'a single word takes its first two letters',
      props: { name: 'Rowan' },
      expect: { 'data-fallback': 'initials' },
    },
    {
      name: 'an image, over the initials it replaces',
      props: { name: 'Ada Lovelace', src: PORTRAIT },
      expect: { 'data-fallback': null },
    },
    {
      name: 'no name at all — the unassigned edge',
      props: { name: '' },
      expect: { 'data-fallback': 'icon' },
    },
    {
      name: 'three sizes',
      many: {
        within: { member: 'Inline', props: { gap: 3, align: 'center' } },
        each: (['sm', 'md', 'lg'] as const).map((size) => ({
          props: { name: 'Ada Lovelace', size },
        })),
      },
    },
    {
      name: 'identity tones — the same name is the same colour, always',
      many: {
        within: { member: 'Inline', props: { gap: 3, align: 'center' } },
        each: NAMES.map((name) => ({ props: { name } })),
      },
    },
    {
      name: 'standing alone, so it carries the name itself',
      props: { name: 'Ada Lovelace', label: 'Ada Lovelace' },
    },
    {
      name: 'beside a visible name, so it does not',
      many: {
        within: { member: 'Inline', props: { gap: 2, align: 'center' } },
        each: [{ props: { name: 'Ada Lovelace', size: 'sm' } }],
        also: [{ element: 'span', children: ['Ada Lovelace'] }],
      },
    },
    {
      name: 'a group of five with max 3 — three marks and a "+2" that is real text',
      many: {
        within: { member: 'AvatarGroup', props: { label: 'Assignees', max: 3 } },
        each: [
          'Ada Lovelace',
          'Grace Hopper',
          'Alan Turing',
          'Katherine Johnson',
          'Barbara Liskov',
        ].map((name) => ({ props: { name } })),
      },
    },
    {
      name: 'a group under max — every mark drawn, no chip',
      many: {
        within: { member: 'AvatarGroup', props: { label: 'Reviewers', max: 4 } },
        each: [{ props: { name: 'Ada Lovelace' } }, { props: { name: 'Grace Hopper' } }],
      },
    },
  ],
})
