import { describeMember, el, fx, identity, slot } from '../dsl'

const chip = (value: string) => fx('Code', {}, { default: [value] })

/** A string with no break in it: an authenticator's setup URI. */
const SETUP_KEY =
  'otpauth://totp/Relay:ada@example.com?secret=JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP&issuer=Relay'

/**
 * Code (`design/components/code.md`): inline code in running prose. Every
 * entry sets the chip in a sentence, its only use.
 */
export default describeMember({
  member: 'Code',
  dir: 'structure',
  recipe: 'structure/code',
  template: el('code', { class: ['code'], attrs: { ...identity('Code') } }, [slot()]),
  states: [
    {
      name: 'inline',
      many: {
        within: { member: 'Text' },
        each: [],
        also: ['Set ', chip('pm-system'), ' on the page root.'],
      },
    },
    {
      name: 'one mono size, whatever the prose around it',
      many: {
        within: { member: 'Text', props: { size: 'sm', tone: 'secondary' } },
        each: [],
        also: ['Run ', chip('pnpm registry'), ' — the same chip, a step down in the prose.'],
      },
    },
    {
      name: 'several in a sentence',
      many: {
        within: { member: 'Text' },
        each: [],
        also: [
          chip('data-system'),
          ' and ',
          chip('data-palette'),
          ' are the pairing the DOM wears.',
        ],
      },
    },
    {
      name: 'a long string breaks inside the chip',
      many: {
        within: { member: 'Text' },
        each: [],
        also: ['Or type ', chip(SETUP_KEY), ' into the app.'],
      },
    },
  ],
})
