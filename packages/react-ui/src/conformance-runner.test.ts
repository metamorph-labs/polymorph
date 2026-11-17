import { describe, expect, it } from 'vitest'

import {
  conform,
  type ConformanceStatement,
  type ConformanceSubject,
  type MountAdapter,
} from '@polymorph/conformance'
import { harness } from '@polymorph/conformance/harness'

/**
 * The conformance runner's own checks, through an adapter that renders plain
 * DOM. Each probe member below behaves in one way a framework's member could,
 * and each statement is one the runner must judge by what a key, a click or a
 * press does, not by what mounting did. The shells' laws run the same runner
 * over real members (`conformance.test.tsx`, `@polymorph/conformance/law`).
 */

/** A member that calls its handler while it mounts, with a hidden live region and a plain label. */
const PROBE: ConformanceSubject = {
  member: 'Probe',
  slug: 'probe',
  states: ['rest'],
  contract: [],
  parts: { label: '[data-probe-part="label"]', box: '[data-probe-part="box"]' },
  handlers: ['onPing'],
}

/**
 * A member that opens while its trigger has focus and closes when focus leaves
 * it or on Escape, with no listener for a press outside: Zag's tooltip.
 */
const TIP: ConformanceSubject = {
  member: 'Tip',
  slug: 'tip',
  states: ['rest'],
  contract: [],
  parts: { trigger: '[data-tip-part="trigger"]', panel: '[data-tip-part="panel"]' },
}

/** A member that opens while the pointer is over its trigger, and closes when it leaves or on Escape. */
const HOVER: ConformanceSubject = {
  member: 'Hover',
  slug: 'hover',
  states: ['rest'],
  contract: [],
  parts: { trigger: '[data-tip-part="trigger"]', panel: '[data-tip-part="panel"]' },
}

const adapter: MountAdapter = {
  mount(member, { overrides }) {
    const root = document.createElement('div')
    document.body.append(root)
    const cleanups: (() => void)[] = []
    if (member === 'Probe') {
      root.innerHTML =
        '<div data-member="probe">' +
        '<span data-probe-part="label">Label</span>' +
        '<div data-probe-part="box" tabindex="0">Box</div>' +
        '<div hidden><div aria-live="polite">Saved</div></div>' +
        '</div>'
      const ping = overrides?.onPing
      if (typeof ping === 'function') (ping as () => void)()
    } else {
      const slug = member.toLowerCase()
      root.innerHTML = `<div data-member="${slug}"><button type="button" data-tip-part="trigger">Tip</button></div>`
      const trigger = root.querySelector('button') as HTMLButtonElement
      const panel = document.createElement('div')
      panel.setAttribute('data-tip-part', 'panel')
      panel.textContent = 'More about this'
      const open = () => document.body.append(panel)
      const close = () => panel.remove()
      if (member === 'Tip') {
        trigger.addEventListener('focus', open)
        trigger.addEventListener('blur', close)
      } else {
        trigger.addEventListener('pointerenter', open)
        trigger.addEventListener('pointerleave', close)
      }
      // On the document, as a real member's dismissal listens. WebKit takes focus off a
      // button the pointer presses, so the key does not always reach the trigger.
      const escape = (event: KeyboardEvent) => {
        if (event.key === 'Escape') close()
      }
      document.addEventListener('keydown', escape)
      cleanups.push(close, () => document.removeEventListener('keydown', escape))
    }
    return Promise.resolve({
      root,
      unmount() {
        for (const cleanup of cleanups) cleanup()
        root.remove()
      },
    })
  },
}

const run = (subject: ConformanceSubject, statement: ConformanceStatement) =>
  conform(subject, statement, adapter, harness).then((outcome) =>
    outcome.pass ? 'holds' : outcome.reason,
  )

describe('the runner judges a key by the part it is pressed on', () => {
  it('fails a key on a part that cannot take focus, which would go to the page', async () => {
    const reason = await run(PROBE, {
      kind: 'key',
      key: 'Enter',
      effect: 'nothing',
      on: 'label',
      text: 'key Enter nothing on label',
    })
    expect(reason).toMatch(/focusing the part "label" left focus on <body>/)
  })
})

describe('the runner counts only the calls a key or a click makes', () => {
  it('does not take a call made while the member mounted for the key’s effect', async () => {
    const reason = await run(PROBE, {
      kind: 'key',
      key: 'Enter',
      effect: 'activates',
      on: 'box',
      text: 'key Enter activates on box',
    })
    expect(reason).toMatch(/took the key and did nothing/)
  })

  it('does not fail a key that does nothing because of a call made while mounting', async () => {
    const reason = await run(PROBE, {
      kind: 'key',
      key: 'Escape',
      effect: 'nothing',
      on: 'box',
      text: 'key Escape nothing on box',
    })
    expect(reason).toBe('holds')
  })

  it('does not take a call made while the member mounted for the click’s effect', async () => {
    const reason = await run(PROBE, {
      kind: 'click',
      effect: 'activates',
      on: 'box',
      text: 'click activates on box',
    })
    expect(reason).toMatch(/took the click and none of onPing ran/)
  })
})

describe('the runner hears only regions that announce', () => {
  it('does not count a live region inside a hidden subtree', async () => {
    const reason = await run(PROBE, {
      kind: 'announces',
      channel: 'live:polite',
      state: 'rest',
      text: 'announces live:polite when rest',
    })
    expect(reason).toMatch(/nothing in the member matches/)
  })
})

describe('the runner presses outside as a reader does', () => {
  it('moves focus with the press, so a member that closes on focus leaving it closes', async () => {
    const reason = await run(TIP, { kind: 'dismiss', by: 'both', text: 'dismiss both' })
    expect(reason).toBe('holds')
  })

  it('moves the pointer to the press, so a member held open by hover closes', async () => {
    const reason = await run(HOVER, { kind: 'dismiss', by: 'both', text: 'dismiss both' })
    expect(reason).toBe('holds')
  })
})
