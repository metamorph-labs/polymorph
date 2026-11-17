import { describe, expect, it } from 'vitest'

import { alternativesIn } from './alternatives'

/**
 * Reading a message's answers back as data. The shapes are the ones every
 * message writes its answers in (`advice.ts`); what was found is never in one
 * of them.
 */

const APPLICATION = [1, 3, 4]

describe('alternativesIn', () => {
  it('reads a member with the prop written on it, and the rung it is on', () => {
    expect(
      alternativesIn(
        'Unexpected `style` on <div>. `display` and `gap` are `<Inline gap={4}>` (rung 1).',
        APPLICATION,
      ),
    ).toEqual([{ member: 'Inline', prop: 'gap', rung: 1 }])
  })

  it('reads tokens and props named on their own', () => {
    // Application code reads a token only inside a zone, so a bare token is on
    // rung 4; the props it explains are the rung-1 answer.
    expect(
      alternativesIn(
        'Unexpected length `12px`. It is space step 4 (`--pm-space-4`): write `gap={4}` or ' +
          '`p={4}` on `<Stack>`.',
        APPLICATION,
      ),
    ).toEqual([
      { token: '--pm-space-4', rung: 4 },
      { prop: 'gap', rung: 1 },
      { prop: 'p', rung: 1 },
      { member: 'Stack', rung: 1 },
    ])
  })

  it('puts the ladder’s own primitives on their rungs', () => {
    expect(
      alternativesIn(
        "Nearest is `--pm-radius-sm`: `<Card patch={{ radius: 'sm' }}>` re-assigns one (rung 3), " +
          'or a `<Bespoke reason="…">` zone.',
        APPLICATION,
      ),
    ).toEqual([
      { token: '--pm-radius-sm', rung: 4 },
      { member: 'Card', prop: 'patch', rung: 3 },
      { member: 'Bespoke', prop: 'reason', rung: 4 },
    ])
  })

  it('never reads what was found as an answer', () => {
    // The offending element is bare, and the offending value, class or package
    // is in a span no answer has the shape of.
    expect(
      alternativesIn(
        'Unexpected `className` on <Button>. `flex gap-2` is `12px` from `framer-motion` and ' +
          '`--pm-shell-*`.',
        APPLICATION,
      ),
    ).toEqual([])
  })

  it('records a rung the message names without a span, such as a promotion', () => {
    expect(
      alternativesIn(
        'Unexpected icon import `lucide-react`. `Rocket` has no role. A new role is one entry in ' +
          'design/icons.json (rung 5).',
        [1, 5],
      ),
    ).toEqual([{ rung: 5 }])
  })

  it('puts the vocabulary’s own answers on no rung', () => {
    // Those rules have no ladder: the answer is to fix the code.
    expect(
      alternativesIn('Unexpected var(--pm-accnet-bg). Did you mean `--pm-accent-bg`?', []),
    ).toEqual([{ token: '--pm-accent-bg', rung: null }])
    expect(alternativesIn('It is `var(--pm-space-4)` (12px).', [])).toEqual([
      { token: '--pm-space-4', rung: null },
    ])
  })

  it('reads an Angular answer: a member by its selector, a prop as its binding', () => {
    expect(
      alternativesIn(
        'Unexpected `style` on <div>. `display` and `gap` are `<pm-inline [gap]="4">` (rung 1). ' +
          'Write `[p]="4"`, or `(click)="save()"`, or a `<pm-bespoke reason="…">` zone.',
        APPLICATION,
      ),
    ).toEqual([
      { member: 'Inline', prop: 'gap', rung: 1 },
      { prop: 'p', rung: 1 },
      { prop: 'click', rung: 1 },
      { member: 'Bespoke', prop: 'reason', rung: 4 },
    ])
    expect(alternativesIn('Use `<pm-data-table [rows]="…">`.', APPLICATION)).toEqual([
      { member: 'DataTable', prop: 'rows', rung: 1 },
    ])
  })

  it('names each answer once', () => {
    expect(
      alternativesIn(
        'Its nearest role is `--pm-accent-bg`: read `var(--pm-accent-bg)`.',
        [1, 3, 4],
      ),
    ).toEqual([{ token: '--pm-accent-bg', rung: 4 }])
  })
})
